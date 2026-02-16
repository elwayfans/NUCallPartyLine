import { Router } from 'express';
import { Prisma } from '@prisma/client';
import type { CallOutcome } from '@prisma/client';
import * as chrono from 'chrono-node';
import { prisma } from '../config/database.js';
import { callsService } from '../services/calls.service.js';
import { assistantsService, getAnalysisPlan } from '../services/assistants.service.js';
import { sendAppointmentEmail } from '../services/email.service.js';
import { wsService } from '../index.js';

const router = Router();

interface VapiWebhookMessage {
  type: string;
  call?: {
    id: string;
    type?: string;
    status?: string;
    duration?: number;
    cost?: number;
    endedReason?: string;
  };
  customer?: {
    number?: string;
    name?: string;
  };
  artifact?: {
    // VAPI recording structure: mono.combinedUrl, stereoUrl, or legacy url
    recording?: {
      url?: string;
      duration?: number;
      mono?: { combinedUrl?: string; customerUrl?: string; assistantUrl?: string };
      stereoUrl?: string;
    };
    recordingUrl?: string;
    transcript?: string;
    // VAPI messages use "message" (not "content") and "bot" (not "assistant")
    messages?: Array<{
      role: string;
      message?: string;
      content?: string;
      time?: number;
      endTime?: number;
      secondsFromStart?: number;
      duration?: number;
      [key: string]: unknown;
    }>;
    summary?: string;
    [key: string]: unknown;
  };
  analysis?: {
    summary?: string;
    successEvaluation?: string;
    structuredData?: Record<string, unknown>;
    [key: string]: unknown;
  };
  transcript?: string;
  transcriptType?: string;
  role?: string;
  [key: string]: unknown;
}

interface VapiWebhookPayload {
  message: VapiWebhookMessage;
}

// Map VAPI status to our status
function mapVapiStatus(vapiStatus: string): string {
  const statusMap: Record<string, string> = {
    queued: 'QUEUED',
    ringing: 'RINGING',
    'in-progress': 'IN_PROGRESS',
    ended: 'COMPLETED',
    forwarding: 'IN_PROGRESS',
    'no-answer': 'NO_ANSWER',
    busy: 'BUSY',
    failed: 'FAILED',
  };
  return statusMap[vapiStatus] ?? 'IN_PROGRESS';
}

// POST /api/webhooks/vapi - Main VAPI webhook endpoint
router.post('/vapi', async (req, res) => {
  const payload: VapiWebhookPayload = req.body;
  const eventType = payload.message?.type;
  const vapiCallId = payload.message?.call?.id;

  // Log webhook for debugging
  await prisma.webhookLog.create({
    data: {
      eventType: eventType ?? 'unknown',
      payload: payload as unknown as Prisma.InputJsonValue,
      vapiCallId,
    },
  });

  // Auto-create call record for inbound calls not yet in our DB
  if (vapiCallId) {
    const callType = payload.message?.call?.type;
    const customerNumber = payload.message?.customer?.number;
    if (callType === 'inboundPhoneCall' && customerNumber) {
      const existing = await callsService.findByVapiCallId(vapiCallId);
      if (!existing) {
        await createInboundCallRecord(vapiCallId, customerNumber);
      }
    }
  }

  try {
    switch (eventType) {
      case 'status-update':
        await handleStatusUpdate(payload.message);
        break;

      case 'transcript':
        await handleTranscript(payload.message);
        break;

      case 'end-of-call-report':
        await handleEndOfCall(payload.message);
        break;

      case 'assistant-request': {
        // Inbound call — VAPI asks us which assistant to use.
        // Return full assistant config with our analysisPlan so structured data is extracted.
        const customerNumber = payload.message?.customer?.number;
        const config = await buildInboundAssistantConfig(customerNumber);
        return res.status(200).json({ assistant: config });
      }

      case 'conversation-update':
        // Live conversation updates - emit via WebSocket
        if (vapiCallId && payload.message.transcript) {
          wsService.emitTranscript(vapiCallId, {
            role: payload.message.role ?? 'unknown',
            content: payload.message.transcript,
            isFinal: payload.message.transcriptType === 'final',
          });
        }
        // For web/browser calls, VAPI keeps status "queued" even during active conversation.
        // Promote to IN_PROGRESS when we see actual conversation happening.
        if (vapiCallId) {
          await promoteQueuedCall(vapiCallId);
        }
        break;

      case 'speech-update':
        // For web/browser calls, promote to IN_PROGRESS on first speech activity
        if (vapiCallId) {
          await promoteQueuedCall(vapiCallId);
        }
        break;

      case 'assistant.started':
        // Web calls emit this when the assistant is ready — treat as in-progress
        if (vapiCallId) {
          await promoteQueuedCall(vapiCallId);
        }
        break;

      case 'hang':
        // Call hangup notification
        if (vapiCallId) {
          const call = await callsService.findByVapiCallId(vapiCallId);
          if (call) {
            await callsService.updateStatus(call.id, {
              status: 'COMPLETED',
              endedAt: new Date(),
            });
            wsService.emitCallStatus(call);
          }
        }
        break;

      default:
        console.log(`Unhandled VAPI webhook type: ${eventType}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);

    // Update webhook log with error
    if (vapiCallId) {
      await prisma.webhookLog.updateMany({
        where: { vapiCallId, processed: false },
        data: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }

    // Still return 200 to prevent VAPI retries
    res.status(200).json({ received: true, error: 'Processing failed' });
  }
});

// Promote a QUEUED or SCHEDULED call to IN_PROGRESS (for web/browser calls
// where VAPI never sends an "in-progress" status-update)
async function promoteQueuedCall(vapiCallId: string) {
  const call = await callsService.findByVapiCallId(vapiCallId);
  if (!call || (call.status !== 'QUEUED' && call.status !== 'SCHEDULED')) return;

  const updatedCall = await callsService.updateStatus(call.id, {
    status: 'IN_PROGRESS',
    startedAt: call.startedAt ?? new Date(),
    answeredAt: call.answeredAt ?? new Date(),
  });

  wsService.emitCallStatus({
    id: updatedCall.id,
    vapiCallId: updatedCall.vapiCallId,
    status: updatedCall.status,
    campaignId: updatedCall.campaignId,
  });
}

/**
 * Create a call record for an inbound callback.
 * Links to the most recent outbound call to the same phone number.
 */
async function createInboundCallRecord(vapiCallId: string, customerNumber: string) {
  // Find the most recent outbound call to this phone number
  const recentCall = await prisma.call.findFirst({
    where: {
      phoneNumber: customerNumber,
      direction: 'OUTBOUND',
    },
    orderBy: { createdAt: 'desc' },
  });

  const callRecord = await prisma.call.create({
    data: {
      vapiCallId,
      phoneNumber: customerNumber,
      vapiAssistantId: 'inbound',
      status: 'IN_PROGRESS',
      direction: 'INBOUND',
      contactId: recentCall?.contactId ?? undefined,
      campaignId: recentCall?.campaignId ?? undefined,
      startedAt: new Date(),
    },
  });

  console.log(
    `Created INBOUND call record ${callRecord.id} for ${customerNumber}` +
    (recentCall
      ? ` (linked to outbound call ${recentCall.id}, contact: ${recentCall.contactId}, campaign: ${recentCall.campaignId})`
      : ' (no matching outbound call found)')
  );
}

/**
 * Build an assistant config for inbound calls.
 * Looks up the most recent outbound call to this phone number, then:
 *   1. If it belongs to a campaign → uses campaign.inboundAssistantId
 *   2. If it's a test call (no campaign) → uses call.inboundAssistantId
 *   3. Falls back to a generic inbound prompt
 * Always appends our analysisPlan for structured data extraction.
 */
async function buildInboundAssistantConfig(customerNumber?: string) {
  const analysisPlan = getAnalysisPlan();

  // Look up the caller's contact info and inbound assistant from the most recent outbound call
  let contactData: { firstName?: string; lastName?: string; phoneNumber?: string; email?: string } = {};
  let inboundAssistantId: string | null = null;

  if (customerNumber) {
    const recentCall = await prisma.call.findFirst({
      where: { phoneNumber: customerNumber, direction: 'OUTBOUND' },
      orderBy: { createdAt: 'desc' },
      include: {
        contact: true,
        campaign: { select: { inboundAssistantId: true } },
      },
    });

    if (recentCall?.contact) {
      contactData = {
        firstName: recentCall.contact.firstName,
        lastName: recentCall.contact.lastName,
        phoneNumber: customerNumber,
        email: recentCall.contact.email ?? undefined,
      };
    }

    // Resolve inbound assistant: campaign setting first, then call-level (test calls)
    inboundAssistantId = recentCall?.campaign?.inboundAssistantId
      ?? recentCall?.inboundAssistantId
      ?? null;
  }

  // If an inbound assistant was found, use its full script
  if (inboundAssistantId) {
    try {
      const config = await assistantsService.getCallConfig(inboundAssistantId, contactData);
      // Override analysisPlan with ours (ensures structured data extraction) and strip voicemail detection
      const { voicemailDetection, voicemailMessage, analysisPlan: _ignored, ...rest } = config as any;
      return {
        ...rest,
        analysisPlan,
      };
    } catch (err) {
      console.error(`Failed to load inbound assistant ${inboundAssistantId}:`, err);
      // Fall through to generic config
    }
  }

  // Fallback: generic inbound prompt
  const fallbackPrompt = [
    'You are Chris, a friendly and enthusiastic AI assistant for Neumont University.',
    'This is an INBOUND call — the contact is calling you back.',
    'Greet them warmly. Answer questions about Neumont University and try to schedule an admissions call.',
    'Be conversational and natural.',
  ].join('\n');

  return {
    model: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: fallbackPrompt }],
    },
    voice: {
      provider: '11labs',
      model: 'eleven_turbo_v2_5',
      voiceId: '21m00Tcm4TlvDq8ikWAM',
    },
    firstMessage: `Hi! Thanks for calling Neumont University. This is Chris. Who am I speaking with?`,
    firstMessageMode: 'assistant-speaks-first',
    endCallFunctionEnabled: true,
    serverMessages: ['end-of-call-report', 'status-update'],
    analysisPlan,
  };
}

async function handleStatusUpdate(message: VapiWebhookMessage) {
  const vapiCallId = message.call?.id;
  const vapiStatus = message.call?.status;

  if (!vapiCallId || !vapiStatus) return;

  const call = await callsService.findByVapiCallId(vapiCallId);
  if (!call) {
    console.log(`Call not found for VAPI ID: ${vapiCallId}`);
    return;
  }

  let status = mapVapiStatus(vapiStatus);
  const endedReason = message.call?.endedReason?.toLowerCase() ?? '';

  // Refine 'ended' status based on endedReason
  if (vapiStatus === 'ended' && endedReason) {
    if (endedReason.includes('did-not-answer') || endedReason.includes('no-answer') || endedReason.includes('busy')) {
      status = 'NO_ANSWER';
    } else if (endedReason.includes('voicemail')) {
      status = 'VOICEMAIL';
    }
  }

  const updateData: Parameters<typeof callsService.updateStatus>[1] = {
    status: status as Parameters<typeof callsService.updateStatus>[1]['status'],
    endedReason: message.call?.endedReason ?? undefined,
  };

  if (vapiStatus === 'in-progress' && !call.startedAt) {
    updateData.startedAt = new Date();
  }

  if (vapiStatus === 'in-progress' && !call.answeredAt) {
    updateData.answeredAt = new Date();
  }

  const updatedCall = await callsService.updateStatus(call.id, updateData);

  // Emit real-time update
  wsService.emitCallStatus({
    id: updatedCall.id,
    vapiCallId: updatedCall.vapiCallId,
    status: updatedCall.status,
    campaignId: updatedCall.campaignId,
  });

  // Update campaign progress if applicable
  if (call.campaignId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: call.campaignId },
    });
    if (campaign) {
      wsService.emitCampaignProgress({
        campaignId: campaign.id,
        completedCalls: campaign.completedCalls,
        failedCalls: campaign.failedCalls,
        totalContacts: campaign.totalContacts,
      });
    }
  }
}

async function handleTranscript(message: VapiWebhookMessage) {
  const vapiCallId = message.call?.id;
  const transcriptText = message.transcript;
  const role = message.role;

  if (!vapiCallId) return;

  // Emit live transcript for real-time display
  wsService.emitTranscript(vapiCallId, {
    role: role ?? 'unknown',
    content: transcriptText ?? '',
    isFinal: message.transcriptType === 'final',
  });
}

async function handleEndOfCall(message: VapiWebhookMessage) {
  const vapiCallId = message.call?.id;
  const artifact = message.artifact;
  const endedReason = message.call?.endedReason;

  if (!vapiCallId) return;

  const call = await callsService.findByVapiCallId(vapiCallId);
  if (!call) {
    console.log(`Call not found for VAPI ID: ${vapiCallId}`);
    return;
  }

  // Extract recording URL from VAPI's nested structure
  const recordingUrl =
    artifact?.recording?.mono?.combinedUrl ??
    artifact?.recording?.stereoUrl ??
    artifact?.recording?.url ??
    (artifact?.recordingUrl as string | undefined);

  // Normalize VAPI messages: map "message" → "content", "bot" → "assistant", filter out system
  const rawMessages = artifact?.messages ?? [];
  const normalizedMessages = rawMessages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'bot' ? 'assistant' : m.role,
      content: m.message ?? m.content ?? '',
      timestamp: m.secondsFromStart,
    }));

  // Calculate duration from message timestamps if VAPI doesn't provide it
  let duration = message.call?.duration;
  if (!duration && rawMessages.length > 0) {
    const lastMsg = rawMessages[rawMessages.length - 1]!;
    const endSec = lastMsg.secondsFromStart ?? 0;
    const msgDur = (lastMsg.duration ?? 0) / 1000; // duration is in ms
    duration = Math.round(endSec + msgDur);
  }

  // Detect voicemail from endedReason or transcript content
  const fullTranscript = artifact?.transcript?.toLowerCase() ?? '';
  const vmPhrases = ['forwarded to voice mail', 'forwarded to voicemail', 'at the tone', 'record your message', 'leave a message after', 'leave your message'];
  const endedReasonLower = endedReason?.toLowerCase() ?? '';
  const isVoicemail = endedReasonLower.includes('voicemail')
    || vmPhrases.some(p => fullTranscript.includes(p));
  const isNoAnswer = endedReasonLower.includes('no-answer')
    || endedReasonLower.includes('customer-did-not-answer')
    || endedReasonLower.includes('customer-busy')
    || endedReasonLower.includes('busy');
  const finalStatus = isVoicemail ? 'VOICEMAIL' : isNoAnswer ? 'NO_ANSWER' : 'COMPLETED';

  // Update call record
  const updatedCall = await callsService.updateStatus(call.id, {
    status: finalStatus as any,
    startedAt: call.startedAt ?? new Date(),
    endedAt: new Date(),
    endedReason: endedReason ?? undefined,
    duration,
    cost: message.call?.cost,
  });

  // Save transcript
  if (artifact?.transcript) {
    await callsService.saveTranscript(call.id, {
      fullText: artifact.transcript,
      messages: normalizedMessages,
      recordingUrl,
      recordingDuration: artifact.recording?.duration,
    });

    // Process VAPI analysis — all analytics come from VAPI's built-in analysis
    const vapiAnalysis = message.analysis;
    const vapiSummary = vapiAnalysis?.summary ?? artifact.summary;
    const vapiSuccessEval = vapiAnalysis?.successEvaluation;
    const sd = vapiAnalysis?.structuredData; // structured data from analysisPlan

    // Use structured data outcome if available, fall back to successEvaluation
    // Note: schema uses "callOutcome" (flat format), also check "outcome" for compatibility
    const isSuccess = vapiSuccessEval === 'true';
    let outcome: CallOutcome = (sd?.callOutcome as CallOutcome) ?? (sd?.outcome as CallOutcome) ??
      (isSuccess ? 'SUCCESS' : 'PARTIAL');
    let callResult: string = (sd?.callResult as string) ??
      (isSuccess ? 'PASS' : 'FAIL');

    // Refine outcome for short/failed calls
    if (!isSuccess && endedReason) {
      const reason = endedReason.toLowerCase();
      if (reason.includes('no-answer') || reason.includes('voicemail') || reason.includes('busy')) {
        outcome = 'NO_RESPONSE';
      } else if (reason.includes('error') || reason.includes('failed')) {
        outcome = 'TECHNICAL_FAILURE';
      }
    }
    if (isVoicemail) {
      outcome = 'NO_RESPONSE';
    }
    if (!isSuccess && duration && duration < 15) {
      outcome = 'NO_RESPONSE';
      callResult = 'INCONCLUSIVE';
    }

    // Extract appointment details
    let appointmentDetails: Record<string, unknown> | null = null;
    if (sd?.appointmentBooked === true || sd?.appointmentBooked === 'true') {
      const rawDate = sd.appointmentDate as string | undefined;
      const rawTime = sd.appointmentTime as string | undefined;

      // Resolve natural language date/time (e.g. "next Thursday at 9 AM") to ISO
      let resolvedDateTime: string | null = null;
      if (rawDate || rawTime) {
        const naturalText = [rawDate, rawTime].filter(Boolean).join(' at ');
        const callDate = call.endedAt ?? call.startedAt ?? new Date();
        const parsed = chrono.parseDate(naturalText, callDate);
        if (parsed) {
          resolvedDateTime = parsed.toISOString();
        }
      }

      appointmentDetails = {
        scheduled: true,
        date: rawDate,
        time: rawTime,
        type: sd.appointmentType,
        resolvedDateTime,
      };
      outcome = 'SUCCESS';
      callResult = 'PASS';

      // Send appointment email notifications
      // Resolve notification emails: campaign → this call → original outbound call (for callbacks)
      const notificationEmails = await (async () => {
        if (call.campaignId) {
          const campaign = await prisma.campaign.findUnique({
            where: { id: call.campaignId },
            select: { notificationEmails: true },
          });
          if (campaign?.notificationEmails) return campaign.notificationEmails;
        }
        // Check this call record (test calls store it directly)
        const callRecord = await prisma.call.findUnique({
          where: { id: call.id },
          select: { notificationEmails: true },
        });
        if (callRecord?.notificationEmails) return callRecord.notificationEmails;
        // For inbound callbacks, trace back to the original outbound call
        if (call.direction === 'INBOUND') {
          const originalCall = await prisma.call.findFirst({
            where: { phoneNumber: call.phoneNumber, direction: 'OUTBOUND' },
            orderBy: { createdAt: 'desc' },
            select: { notificationEmails: true, campaignId: true },
          });
          if (originalCall?.notificationEmails) return originalCall.notificationEmails;
          // Also check the original call's campaign
          if (originalCall?.campaignId) {
            const campaign = await prisma.campaign.findUnique({
              where: { id: originalCall.campaignId },
              select: { notificationEmails: true },
            });
            if (campaign?.notificationEmails) return campaign.notificationEmails;
          }
        }
        return null;
      })();

      if (notificationEmails) {
        // Resolve contact info — fall back to phone number lookup for test calls (no linked contact)
        const contact = call.contact ?? await prisma.contact.findFirst({
          where: { phoneNumber: call.phoneNumber },
          orderBy: { createdAt: 'desc' },
        });

        // Send to both: confirmed email from call AND existing contact email (deduped in email service)
        const confirmedEmail = sd.confirmedEmail as string | undefined;
        const contactEmail = contact?.email || undefined;
        const prospectEmails = [confirmedEmail, contactEmail].filter((e): e is string => !!e && e.includes('@'));
        const confirmedName = sd.confirmedFullName as string | undefined;
        const prospectName = confirmedName
          || (contact ? `${contact.firstName} ${contact.lastName}`.trim() : null)
          || call.phoneNumber;

        console.log(`[Email] Contact resolved: ${contact ? contact.id : 'none'}, confirmedEmail: ${confirmedEmail ?? 'none'}, contactEmail: ${contactEmail ?? 'none'}, prospectEmails: [${prospectEmails.join(', ')}], name: ${prospectName}, notificationEmails: ${notificationEmails}`);

        sendAppointmentEmail({
          prospectEmails,
          prospectName,
          notificationEmails,
          rawDate,
          rawTime,
          appointmentType: sd.appointmentType as string | undefined,
          resolvedDateTime,
          phoneNumber: call.phoneNumber,
          transcriptMessages: normalizedMessages,
          callSummary: vapiSummary ?? undefined,
        }).catch((err) => console.error('Appointment email error:', err));
      }
    }

    // Extract follow-up info
    const followUp = (sd?.followUpNeeded === true || sd?.followUpNeeded === 'true') ? {
      required: true,
      notes: sd.followUpAction as string | undefined,
    } : null;

    // Sentiment from structured data
    const sentiment = sd?.sentiment as string | undefined;

    // Map sentiment string to DB enum
    const validSentiments = ['VERY_POSITIVE', 'POSITIVE', 'NEUTRAL', 'NEGATIVE', 'VERY_NEGATIVE'];
    const overallSentiment = sentiment && validSentiments.includes(sentiment) ? sentiment : null;

    const effectiveSummary = vapiSummary ?? null;

    const customFields = {
      callResult,
      outcomeReason: effectiveSummary ?? '',
      interestLevel: sd?.interestLevel as string | undefined,
      appointmentDetails,
      followUp,
      confirmedEmail: sd?.confirmedEmail as string | undefined,
      confirmedFullName: sd?.confirmedFullName as string | undefined,
      confirmedPhone: sd?.confirmedPhone as string | undefined,
      vapiSummary: effectiveSummary,
      vapiAnalysis: vapiAnalysis as Record<string, unknown>,
      vapiStructuredData: sd ?? null,
    };

    // Confirmed info from the call is stored in customFields above (confirmedEmail, confirmedFullName, confirmedPhone)
    // but we do NOT auto-update the contact record — the AI can mishear, and overwriting
    // real contact data (especially phone numbers) with bad data is worse than not updating.

    const speakerTurns = normalizedMessages.length;
    const keyTopics: string[] = [];

    await prisma.callAnalytics.upsert({
      where: { callId: call.id },
      create: {
        callId: call.id,
        summary: effectiveSummary ?? null,
        overallSentiment: overallSentiment as any,
        keyTopics,
        speakerTurns,
        customFields: customFields as unknown as Prisma.InputJsonValue,
        processedAt: new Date(),
      },
      update: {
        summary: effectiveSummary ?? null,
        overallSentiment: overallSentiment as any,
        keyTopics,
        speakerTurns,
        customFields: customFields as unknown as Prisma.InputJsonValue,
        processedAt: new Date(),
        processingError: null,
      },
    });

    await prisma.call.update({
      where: { id: call.id },
      data: { outcome },
    });

    console.log(`VAPI analytics processed for call ${call.id} - outcome: ${outcome}, sentiment: ${overallSentiment}, interest: ${sd?.interestLevel}`);

    // If this is an inbound callback with a good outcome, update the original outbound call
    if (call.direction === 'INBOUND' && (outcome === 'SUCCESS' || outcome === 'PARTIAL')) {
      const originalCall = await prisma.call.findFirst({
        where: {
          phoneNumber: call.phoneNumber,
          direction: 'OUTBOUND',
          id: { not: call.id },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (originalCall) {
        await prisma.call.update({
          where: { id: originalCall.id },
          data: { outcome },
        });
        console.log(`Callback ${outcome}: updated original outbound call ${originalCall.id} outcome`);
      }
    }

    wsService.emitCallAnalyticsReady(call.id);
  }

  // Update campaign contact status (skip for inbound callbacks to avoid double-counting)
  if (call.direction !== 'INBOUND' && call.campaignId && call.contactId) {
    await prisma.campaignContact.updateMany({
      where: {
        campaignId: call.campaignId,
        contactId: call.contactId,
      },
      data: {
        status: 'COMPLETED',
      },
    });

    // Update campaign stats
    await prisma.campaign.update({
      where: { id: call.campaignId },
      data: {
        completedCalls: { increment: 1 },
      },
    });

    // Check if campaign is complete
    const campaign = await prisma.campaign.findUnique({
      where: { id: call.campaignId },
    });

    if (campaign) {
      const pendingContacts = await prisma.campaignContact.count({
        where: {
          campaignId: call.campaignId,
          status: { in: ['PENDING', 'IN_PROGRESS'] },
        },
      });

      if (pendingContacts === 0 && campaign.status === 'IN_PROGRESS') {
        await prisma.campaign.update({
          where: { id: call.campaignId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        });
      }

      wsService.emitCampaignProgress({
        campaignId: campaign.id,
        completedCalls: campaign.completedCalls + 1,
        failedCalls: campaign.failedCalls,
        totalContacts: campaign.totalContacts,
      });
    }
  }

  // Emit completion event
  wsService.emitCallComplete({
    id: updatedCall.id,
    vapiCallId: updatedCall.vapiCallId,
    status: updatedCall.status,
    campaignId: updatedCall.campaignId,
    duration: updatedCall.duration,
  });

  // Mark webhook as processed
  await prisma.webhookLog.updateMany({
    where: { vapiCallId, processed: false },
    data: { processed: true },
  });
}

export default router;
