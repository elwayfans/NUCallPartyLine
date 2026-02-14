import { Router } from 'express';
import type { Prisma, CallOutcome } from '@prisma/client';
import { prisma } from '../config/database.js';
import { callsService } from '../services/calls.service.js';
import { analyticsService } from '../services/analytics.service.js';
import { wsService } from '../index.js';

const router = Router();

interface VapiWebhookMessage {
  type: string;
  call?: {
    id: string;
    status?: string;
    duration?: number;
    cost?: number;
    endedReason?: string;
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

async function handleStatusUpdate(message: VapiWebhookMessage) {
  const vapiCallId = message.call?.id;
  const vapiStatus = message.call?.status;

  if (!vapiCallId || !vapiStatus) return;

  const call = await callsService.findByVapiCallId(vapiCallId);
  if (!call) {
    console.log(`Call not found for VAPI ID: ${vapiCallId}`);
    return;
  }

  const status = mapVapiStatus(vapiStatus);
  const updateData: Parameters<typeof callsService.updateStatus>[1] = {
    status: status as Parameters<typeof callsService.updateStatus>[1]['status'],
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

  // Update call record
  const updatedCall = await callsService.updateStatus(call.id, {
    status: 'COMPLETED',
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

    // Use VAPI analysis as primary source (instant), fall back to OpenAI if missing
    const vapiAnalysis = message.analysis;
    const vapiSummary = artifact.summary ?? vapiAnalysis?.summary;
    const vapiSuccessEval = vapiAnalysis?.successEvaluation;
    const vapiStructuredData = vapiAnalysis?.structuredData;

    if (vapiSummary || vapiSuccessEval !== undefined) {
      // --- VAPI-first path: process analysis directly from VAPI (no OpenAI needed) ---

      // Map successEvaluation to outcome
      const isSuccess = vapiSuccessEval === 'true';
      let outcome: CallOutcome = isSuccess ? 'SUCCESS' : 'PARTIAL';
      let callResult: 'PASS' | 'FAIL' | 'INCONCLUSIVE' = isSuccess ? 'PASS' : 'FAIL';

      // Refine outcome for short/failed calls
      if (!isSuccess && endedReason) {
        const reason = endedReason.toLowerCase();
        if (reason.includes('no-answer') || reason.includes('voicemail')) {
          outcome = 'NO_RESPONSE';
        } else if (reason.includes('busy')) {
          outcome = 'NO_RESPONSE';
        } else if (reason.includes('error') || reason.includes('failed')) {
          outcome = 'TECHNICAL_FAILURE';
        }
      }
      // If call was very short (< 15s) and not success, likely no real conversation
      if (!isSuccess && duration && duration < 15) {
        outcome = 'NO_RESPONSE';
        callResult = 'INCONCLUSIVE';
      }

      // Extract appointment details from VAPI structuredData
      let appointmentDetails: Record<string, unknown> | null = null;
      if (vapiStructuredData) {
        // VAPI structured data shape depends on assistant config
        // Look for common appointment-related fields
        const apptBooked = vapiStructuredData.appointmentBooked
          ?? vapiStructuredData.appointment_booked
          ?? vapiStructuredData.booked;
        if (apptBooked === true || apptBooked === 'true' || apptBooked === 'yes') {
          appointmentDetails = {
            scheduled: true,
            date: vapiStructuredData.appointmentDate ?? vapiStructuredData.date,
            time: vapiStructuredData.appointmentTime ?? vapiStructuredData.time,
            location: vapiStructuredData.location,
            type: vapiStructuredData.appointmentType ?? vapiStructuredData.type,
            notes: vapiStructuredData.notes,
          };
          outcome = 'SUCCESS';
          callResult = 'PASS';
        }
      }

      const customFields = {
        callResult,
        callResultReason: vapiSummary ?? '',
        outcomeReason: vapiSummary ?? '',
        appointmentDetails,
        actionItems: [] as string[],
        nextSteps: [] as string[],
        vapiSummary,
        vapiAnalysis: vapiAnalysis as Record<string, unknown>,
        vapiStructuredData: vapiStructuredData ?? null,
      };

      // Calculate speaker turns
      const speakerTurns = normalizedMessages.length;

      await prisma.callAnalytics.upsert({
        where: { callId: call.id },
        create: {
          callId: call.id,
          summary: vapiSummary ?? null,
          speakerTurns,
          customFields: customFields as unknown as Prisma.InputJsonValue,
          processedAt: new Date(),
        },
        update: {
          summary: vapiSummary ?? null,
          speakerTurns,
          customFields: customFields as unknown as Prisma.InputJsonValue,
          processedAt: new Date(),
          processingError: null,
        },
      });

      // Set Call.outcome
      await prisma.call.update({
        where: { id: call.id },
        data: { outcome },
      });

      console.log(`VAPI analytics processed for call ${call.id} - outcome: ${outcome}, success: ${vapiSuccessEval}`);

      // Notify frontend immediately
      wsService.emitCallAnalyticsReady(call.id);
    } else {
      // --- Fallback: no VAPI analysis available, use OpenAI ---
      console.log(`No VAPI analysis for call ${call.id}, falling back to OpenAI`);
      await analyticsService.queueAnalysis(call.id);
    }
  }

  // Update campaign contact status
  if (call.campaignId && call.contactId) {
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
