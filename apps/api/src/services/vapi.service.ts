import { VapiClient } from '@vapi-ai/server-sdk';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { getAnalysisPlan } from './assistants.service.js';

export class VapiService {
  private client: VapiClient;
  private resolvedPhoneNumberId: string | null = null;

  constructor() {
    this.client = new VapiClient({
      token: env.VAPI_API_KEY,
    });
  }

  /**
   * Resolve VAPI_PHONE_NUMBER_ID to a UUID.
   * If it's already a UUID, return it. Otherwise look it up from VAPI's phone number list.
   * Result is cached for the lifetime of the service instance.
   */
  async resolvePhoneNumberId(rawId?: string): Promise<string> {
    if (this.resolvedPhoneNumberId) return this.resolvedPhoneNumberId;

    const id = rawId ?? env.VAPI_PHONE_NUMBER_ID;
    if (id && /^[0-9a-f-]{36}$/i.test(id)) {
      this.resolvedPhoneNumberId = id;
      return id;
    }

    // Not a UUID — look up from VAPI
    const phoneNumbers = await this.listPhoneNumbers();
    if (id) {
      const normalized = id.startsWith('+') ? id : `+${id.replace(/\D/g, '')}`;
      const match = phoneNumbers.find(pn => pn.number === normalized);
      if (match) {
        this.resolvedPhoneNumberId = match.id;
        return match.id;
      }
    }
    if (phoneNumbers.length > 0) {
      this.resolvedPhoneNumberId = phoneNumbers[0].id;
      return phoneNumbers[0].id;
    }

    throw new Error('No phone numbers found in your VAPI account. Add one at dashboard.vapi.ai.');
  }

  /**
   * Create a single outbound call.
   * Supports either a VAPI assistantId OR an inline assistantConfig (for local assistants).
   */
  async createCall(params: {
    contactId: string;
    campaignId?: string;
    phoneNumber: string;
    assistantId?: string;
    assistantConfig?: Record<string, unknown>;
    phoneNumberId?: string;
    metadata?: Record<string, unknown>;
  }) {
    // Create call record in database first
    const callRecord = await prisma.call.create({
      data: {
        contactId: params.contactId,
        campaignId: params.campaignId,
        phoneNumber: params.phoneNumber,
        vapiAssistantId: params.assistantId ?? 'inline',
        status: 'QUEUED',
        direction: 'OUTBOUND',
      },
    });

    try {
      // Make VAPI API call
      const resolvedPhoneId = await this.resolvePhoneNumberId(params.phoneNumberId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const createParams: Record<string, any> = {
        phoneNumberId: resolvedPhoneId,
        customer: {
          number: params.phoneNumber,
        },
        metadata: {
          internalCallId: callRecord.id,
          campaignId: params.campaignId,
          ...params.metadata,
        },
      };

      if (params.assistantConfig) {
        // Inline assistant config (local assistant with variable substitution)
        const configWithServer = { ...params.assistantConfig };
        if (env.SERVER_URL) {
          configWithServer.serverUrl = `${env.SERVER_URL}/api/webhooks/vapi`;
        }
        createParams.assistant = configWithServer;
      } else {
        // VAPI dashboard assistant ID
        createParams.assistantId = params.assistantId;
        createParams.assistantOverrides = {
          ...(env.SERVER_URL ? { serverUrl: `${env.SERVER_URL}/api/webhooks/vapi` } : {}),
          analysisPlan: getAnalysisPlan(),
        };
      }

      const vapiCall = await this.client.calls.create(createParams as any);

      // Update with VAPI call ID
      await prisma.call.update({
        where: { id: callRecord.id },
        data: {
          vapiCallId: vapiCall.id,
          status: 'SCHEDULED',
        },
      });

      return {
        callId: callRecord.id,
        vapiCallId: vapiCall.id,
      };
    } catch (error) {
      // Mark call as failed
      await prisma.call.update({
        where: { id: callRecord.id },
        data: {
          status: 'FAILED',
          endedReason: error instanceof Error ? error.message : 'Unknown error',
          endedAt: new Date(),
        },
      });
      throw error;
    }
  }

  /**
   * Create batch outbound calls for a campaign.
   * Supports either a VAPI assistantId OR a getAssistantConfig callback for inline configs.
   */
  async createBatchCalls(params: {
    campaignId: string;
    contacts: Array<{ id: string; phoneNumber: string; firstName?: string; lastName?: string; email?: string }>;
    assistantId?: string;
    getAssistantConfig?: (contact: { firstName?: string; lastName?: string; phoneNumber: string; email?: string }) => Promise<Record<string, unknown>>;
    phoneNumberId?: string;
    maxConcurrent: number;
  }) {
    const results: Array<{ contactId: string; callId: string; vapiCallId?: string; error?: string }> = [];

    // Process contacts in chunks based on maxConcurrent
    for (let i = 0; i < params.contacts.length; i += params.maxConcurrent) {
      const chunk = params.contacts.slice(i, i + params.maxConcurrent);

      // Create calls for this chunk in parallel
      const chunkResults = await Promise.allSettled(
        chunk.map(async (contact) => {
          try {
            // Build inline config if a callback was provided
            const assistantConfig = params.getAssistantConfig
              ? await params.getAssistantConfig({
                  firstName: contact.firstName,
                  lastName: contact.lastName,
                  phoneNumber: contact.phoneNumber,
                  email: contact.email,
                })
              : undefined;

            const result = await this.createCall({
              contactId: contact.id,
              campaignId: params.campaignId,
              phoneNumber: contact.phoneNumber,
              assistantId: params.assistantId,
              assistantConfig,
              phoneNumberId: params.phoneNumberId,
            });
            return {
              contactId: contact.id,
              callId: result.callId,
              vapiCallId: result.vapiCallId,
            };
          } catch (error) {
            return {
              contactId: contact.id,
              callId: '',
              error: error instanceof Error ? error.message : 'Unknown error',
            };
          }
        })
      );

      // Collect results
      for (const result of chunkResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            contactId: '',
            callId: '',
            error: result.reason?.message ?? 'Unknown error',
          });
        }
      }

      // Small delay between chunks to avoid rate limiting
      if (i + params.maxConcurrent < params.contacts.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Create a single outbound test call using an inline assistant config.
   * No contactId or campaignId required — the call record is still created
   * so webhooks (transcripts, analytics) work normally.
   */
  async createTestCall(params: {
    assistantId: string;
    phoneNumber: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assistantConfig: Record<string, any>;
    phoneNumberId?: string;
    inboundAssistantId?: string;
    notificationEmails?: string;
  }) {
    const callRecord = await prisma.call.create({
      data: {
        phoneNumber: params.phoneNumber,
        vapiAssistantId: params.assistantId,
        status: 'QUEUED',
        direction: 'OUTBOUND',
        inboundAssistantId: params.inboundAssistantId ?? undefined,
        notificationEmails: params.notificationEmails ?? undefined,
      },
    });

    try {
      // Inject serverUrl into the inline assistant config so VAPI sends webhooks here
      const assistantWithServer = { ...params.assistantConfig };
      if (env.SERVER_URL) {
        assistantWithServer.serverUrl = `${env.SERVER_URL}/api/webhooks/vapi`;
      }
      const resolvedPhoneId = await this.resolvePhoneNumberId(params.phoneNumberId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const createParams: Record<string, any> = {
        assistant: assistantWithServer,
        phoneNumberId: resolvedPhoneId,
        customer: {
          number: params.phoneNumber,
        },
        metadata: {
          internalCallId: callRecord.id,
          isTestCall: true,
        },
      };
      const vapiCall = await this.client.calls.create(createParams as any);

      await prisma.call.update({
        where: { id: callRecord.id },
        data: {
          vapiCallId: vapiCall.id,
          status: 'SCHEDULED',
        },
      });

      return {
        callId: callRecord.id,
        vapiCallId: vapiCall.id,
      };
    } catch (error) {
      await prisma.call.update({
        where: { id: callRecord.id },
        data: {
          status: 'FAILED',
          endedReason: error instanceof Error ? error.message : 'Unknown error',
          endedAt: new Date(),
        },
      });
      throw error;
    }
  }

  /**
   * Get call details from VAPI
   */
  async getCall(vapiCallId: string) {
    return this.client.calls.get(vapiCallId);
  }

  /**
   * List available phone numbers
   */
  async listPhoneNumbers() {
    return this.client.phoneNumbers.list();
  }

  /**
   * Get assistant details
   */
  async getAssistant(assistantId: string) {
    return this.client.assistants.get(assistantId);
  }

  /**
   * List available assistants
   */
  async listAssistants() {
    return this.client.assistants.list();
  }

  /**
   * Validate VAPI configuration
   */
  async validateConfig() {
    try {
      // Try to fetch the configured assistant
      const assistant = await this.getAssistant(env.VAPI_ASSISTANT_ID);

      // Try to list phone numbers
      const phoneNumbers = await this.listPhoneNumbers();

      return {
        valid: true,
        assistant: {
          id: assistant.id,
          name: assistant.name,
        },
        phoneNumbers: phoneNumbers.map((pn) => ({
          id: pn.id,
          number: pn.number,
        })),
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Failed to validate VAPI configuration',
      };
    }
  }
}

export const vapiService = new VapiService();
