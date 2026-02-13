import { Router } from 'express';
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
    recording?: { url: string };
    transcript?: string;
    messages?: Array<{ role: string; content: string; timestamp?: number }>;
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
      payload: payload as unknown as Record<string, unknown>,
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
        // Live conversation updates - just emit via WebSocket
        if (vapiCallId && payload.message.transcript) {
          wsService.emitTranscript(vapiCallId, {
            role: payload.message.role ?? 'unknown',
            content: payload.message.transcript,
            isFinal: payload.message.transcriptType === 'final',
          });
        }
        break;

      case 'speech-update':
        // Speech status updates - can be used for UI feedback
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

  // Update call record
  const updatedCall = await callsService.updateStatus(call.id, {
    status: 'COMPLETED',
    endedAt: new Date(),
    endedReason: endedReason ?? undefined,
    duration: message.call?.duration,
    cost: message.call?.cost,
  });

  // Save transcript
  if (artifact?.transcript) {
    await callsService.saveTranscript(call.id, {
      fullText: artifact.transcript,
      messages: artifact.messages ?? [],
      recordingUrl: artifact.recording?.url,
    });

    // Queue analytics processing
    await analyticsService.queueAnalysis(call.id);
  }

  // Update campaign contact status
  if (call.campaignId) {
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
