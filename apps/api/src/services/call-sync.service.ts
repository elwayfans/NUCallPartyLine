import type { Prisma, CallOutcome } from '@prisma/client';
import { prisma } from '../config/database.js';
import { vapiService } from './vapi.service.js';
import { callsService } from './calls.service.js';

/**
 * Call Sync Service - Polls VAPI API to recover data for calls
 * whose webhooks may have been missed (ngrok restart, network issues, etc.)
 */
export class CallSyncService {
  private syncIntervalId: ReturnType<typeof setInterval> | null = null;

  /**
   * Find calls stuck in non-terminal states and sync them from VAPI
   */
  async syncStuckCalls(): Promise<{ synced: number; errors: number }> {
    // Find calls with a VAPI ID that are stuck in non-terminal states
    // and were created more than 2 minutes ago (give webhooks time to arrive)
    const cutoff = new Date(Date.now() - 2 * 60 * 1000);
    const stuckCalls = await prisma.call.findMany({
      where: {
        vapiCallId: { not: null },
        status: { in: ['QUEUED', 'SCHEDULED', 'RINGING', 'IN_PROGRESS'] },
        createdAt: { lt: cutoff },
      },
      select: { id: true, vapiCallId: true, status: true, createdAt: true },
    });

    if (stuckCalls.length === 0) return { synced: 0, errors: 0 };

    console.log(`[CallSync] Found ${stuckCalls.length} stuck call(s) to sync`);

    let synced = 0;
    let errors = 0;

    for (const call of stuckCalls) {
      try {
        const result = await this.syncCall(call.id, call.vapiCallId!);
        if (result) synced++;
      } catch (error) {
        errors++;
        console.error(`[CallSync] Error syncing call ${call.id}:`, error instanceof Error ? error.message : error);
      }
    }

    if (synced > 0 || errors > 0) {
      console.log(`[CallSync] Sync complete: ${synced} synced, ${errors} errors`);
    }

    return { synced, errors };
  }

  /**
   * Sync a single call from VAPI API
   * Returns true if the call was updated, false if no update needed
   */
  async syncCall(callId: string, vapiCallId: string): Promise<boolean> {
    const vapiCall = await vapiService.getCall(vapiCallId);

    // If VAPI still shows non-terminal status, nothing to sync yet
    if (vapiCall.status !== 'ended') {
      return false;
    }

    console.log(`[CallSync] Syncing call ${callId} from VAPI (ended: ${vapiCall.endedReason})`);

    const artifact = vapiCall.artifact;
    const analysis = vapiCall.analysis;

    // Extract recording URL from VAPI's nested structure
    const recordingUrl =
      (artifact as Record<string, unknown>)?.recording
        ? ((artifact as Record<string, unknown>).recording as Record<string, unknown>)?.mono
          ? (((artifact as Record<string, unknown>).recording as Record<string, unknown>).mono as Record<string, unknown>)?.combinedUrl as string | undefined
          : undefined
        : undefined
      ?? artifact?.stereoRecordingUrl
      ?? artifact?.recordingUrl;

    // Calculate duration
    let duration: number | undefined;
    if (vapiCall.startedAt && vapiCall.endedAt) {
      duration = Math.round((new Date(vapiCall.endedAt).getTime() - new Date(vapiCall.startedAt).getTime()) / 1000);
    }
    // Fallback: estimate from messages
    if (!duration && artifact?.messages && artifact.messages.length > 0) {
      const lastMsg = artifact.messages[artifact.messages.length - 1] as Record<string, unknown>;
      const endSec = (lastMsg?.secondsFromStart as number) ?? 0;
      const msgDur = ((lastMsg?.duration as number) ?? 0) / 1000;
      duration = Math.round(endSec + msgDur);
    }

    // Update call record
    await callsService.updateStatus(callId, {
      status: 'COMPLETED',
      startedAt: vapiCall.startedAt ? new Date(vapiCall.startedAt) : new Date(),
      endedAt: vapiCall.endedAt ? new Date(vapiCall.endedAt) : new Date(),
      endedReason: vapiCall.endedReason ?? undefined,
      duration,
      cost: vapiCall.cost ?? undefined,
    });

    // Save transcript if available
    if (artifact?.transcript) {
      const rawMessages = (artifact.messages ?? []) as Array<Record<string, unknown>>;
      const normalizedMessages = rawMessages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role === 'bot' ? 'assistant' : m.role as string,
          content: (m.message ?? m.content ?? '') as string,
          timestamp: m.secondsFromStart as number | undefined,
        }));

      await callsService.saveTranscript(callId, {
        fullText: artifact.transcript,
        messages: normalizedMessages,
        recordingUrl: recordingUrl ?? undefined,
      });
    }

    // Process analytics from VAPI analysis
    const vapiSummary = (artifact as Record<string, unknown>)?.summary as string | undefined
      ?? analysis?.summary;
    const vapiSuccessEval = analysis?.successEvaluation;
    const vapiStructuredData = analysis?.structuredData;

    if (vapiSummary || vapiSuccessEval !== undefined) {
      const isSuccess = vapiSuccessEval === 'true';
      let outcome: CallOutcome = isSuccess ? 'SUCCESS' : 'PARTIAL';
      let callResult: 'PASS' | 'FAIL' | 'INCONCLUSIVE' = isSuccess ? 'PASS' : 'FAIL';

      const endedReason = vapiCall.endedReason;
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
      if (!isSuccess && duration && duration < 15) {
        outcome = 'NO_RESPONSE';
        callResult = 'INCONCLUSIVE';
      }

      // Extract appointment details
      let appointmentDetails: Record<string, unknown> | null = null;
      if (vapiStructuredData) {
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

      const rawMessages = (artifact?.messages ?? []) as Array<Record<string, unknown>>;
      const speakerTurns = rawMessages.filter((m) => m.role !== 'system').length;

      const customFields = {
        callResult,
        callResultReason: vapiSummary ?? '',
        outcomeReason: vapiSummary ?? '',
        appointmentDetails,
        actionItems: [] as string[],
        nextSteps: [] as string[],
        vapiSummary,
        vapiAnalysis: analysis as Record<string, unknown>,
        vapiStructuredData: vapiStructuredData ?? null,
        syncedFromVapi: true,
      };

      await prisma.callAnalytics.upsert({
        where: { callId },
        create: {
          callId,
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

      await prisma.call.update({
        where: { id: callId },
        data: { outcome },
      });

      console.log(`[CallSync] Analytics synced for call ${callId} - outcome: ${outcome}`);
    }

    // Notify frontend
    try {
      const { wsService } = await import('../index.js');
      wsService.emitCallComplete({
        id: callId,
        vapiCallId,
        status: 'COMPLETED',
        campaignId: null,
        duration,
      });
      wsService.emitCallAnalyticsReady(callId);
    } catch {
      // wsService may not be available
    }

    return true;
  }

  /**
   * Start automatic sync interval
   */
  startAutoSync(intervalMs = 2 * 60 * 1000) {
    if (this.syncIntervalId) return;

    console.log(`[CallSync] Starting auto-sync every ${intervalMs / 1000}s`);
    this.syncIntervalId = setInterval(() => {
      this.syncStuckCalls().catch((err) =>
        console.error('[CallSync] Auto-sync error:', err)
      );
    }, intervalMs);
  }

  /**
   * Stop automatic sync interval
   */
  stopAutoSync() {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }
}

export const callSyncService = new CallSyncService();
