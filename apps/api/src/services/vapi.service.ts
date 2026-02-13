import { VapiClient } from '@vapi-ai/server-sdk';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';

export class VapiService {
  private client: VapiClient;

  constructor() {
    this.client = new VapiClient({
      token: env.VAPI_API_KEY,
    });
  }

  /**
   * Create a single outbound call
   */
  async createCall(params: {
    contactId: string;
    campaignId?: string;
    phoneNumber: string;
    assistantId: string;
    phoneNumberId?: string;
    metadata?: Record<string, unknown>;
  }) {
    // Create call record in database first
    const callRecord = await prisma.call.create({
      data: {
        contactId: params.contactId,
        campaignId: params.campaignId,
        phoneNumber: params.phoneNumber,
        vapiAssistantId: params.assistantId,
        status: 'QUEUED',
        direction: 'OUTBOUND',
      },
    });

    try {
      // Make VAPI API call
      const vapiCall = await this.client.calls.create({
        assistantId: params.assistantId,
        phoneNumberId: params.phoneNumberId ?? env.VAPI_PHONE_NUMBER_ID,
        customer: {
          number: params.phoneNumber,
        },
        // Pass internal call ID for webhook correlation
        metadata: {
          internalCallId: callRecord.id,
          campaignId: params.campaignId,
          ...params.metadata,
        },
      });

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
   * Create batch outbound calls for a campaign
   */
  async createBatchCalls(params: {
    campaignId: string;
    contacts: Array<{ id: string; phoneNumber: string }>;
    assistantId: string;
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
            const result = await this.createCall({
              contactId: contact.id,
              campaignId: params.campaignId,
              phoneNumber: contact.phoneNumber,
              assistantId: params.assistantId,
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
