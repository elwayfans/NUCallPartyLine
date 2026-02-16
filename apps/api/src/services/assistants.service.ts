import { prisma } from '../config/database.js';
import type { Prisma } from '@prisma/client';

export interface AssistantFilters {
  search?: string;
  isActive?: boolean;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

class AssistantsService {
  async findAll(filters: AssistantFilters = {}, pagination?: PaginationParams) {
    const where: Prisma.AssistantWhereInput = {};

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    const [data, total] = await Promise.all([
      prisma.assistant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination ? (pagination.page - 1) * pagination.pageSize : undefined,
        take: pagination?.pageSize,
      }),
      prisma.assistant.count({ where }),
    ]);

    return {
      data,
      pagination: pagination
        ? {
            page: pagination.page,
            pageSize: pagination.pageSize,
            totalItems: total,
            totalPages: Math.ceil(total / pagination.pageSize),
          }
        : undefined,
    };
  }

  async findById(id: string) {
    return prisma.assistant.findUnique({
      where: { id },
      include: {
        _count: {
          select: { campaigns: true },
        },
      },
    });
  }

  async create(data: {
    name: string;
    description?: string;
    systemPrompt: string;
    firstMessage?: string;
    modelProvider?: string;
    modelName?: string;
    voiceProvider?: string;
    voiceModel?: string;
    voiceId?: string;
    firstSpeaker?: 'ASSISTANT' | 'USER';
    voicemailMessage?: string;
  }) {
    return prisma.assistant.create({
      data: {
        name: data.name,
        description: data.description,
        systemPrompt: data.systemPrompt,
        firstMessage: data.firstMessage,
        modelProvider: data.modelProvider ?? 'openai',
        modelName: data.modelName ?? 'gpt-4o-mini',
        voiceProvider: data.voiceProvider ?? '11labs',
        voiceModel: data.voiceModel ?? 'eleven_turbo_v2_5',
        voiceId: data.voiceId ?? '21m00Tcm4TlvDq8ikWAM',
        firstSpeaker: data.firstSpeaker ?? 'ASSISTANT',
        voicemailMessage: data.voicemailMessage,
      },
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      systemPrompt?: string;
      firstMessage?: string;
      modelProvider?: string;
      modelName?: string;
      voiceProvider?: string;
      voiceModel?: string;
      voiceId?: string;
      firstSpeaker?: 'ASSISTANT' | 'USER';
      isActive?: boolean;
      voicemailMessage?: string;
    }
  ) {
    return prisma.assistant.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    // Check if assistant is used by any campaigns
    const campaigns = await prisma.campaign.count({
      where: { assistantId: id },
    });

    if (campaigns > 0) {
      throw new Error(`Cannot delete assistant: it is used by ${campaigns} campaign(s)`);
    }

    return prisma.assistant.delete({
      where: { id },
    });
  }

  /**
   * Substitute variables in the script with contact data
   */
  substituteVariables(
    template: string,
    variables: Record<string, string | undefined>
  ): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
      result = result.replace(regex, value ?? '');
    }
    return result;
  }

  /**
   * Get the VAPI-compatible assistant configuration for a call
   */
  async getCallConfig(assistantId: string, contactData: {
    firstName?: string;
    lastName?: string;
    fullName?: string;
    phoneNumber?: string;
    email?: string;
  }) {
    const assistant = await this.findById(assistantId);
    if (!assistant) {
      throw new Error('Assistant not found');
    }

    const variables = {
      firstName: contactData.firstName,
      lastName: contactData.lastName,
      fullName: contactData.fullName ?? [contactData.firstName, contactData.lastName].filter(Boolean).join(' '),
      phoneNumber: contactData.phoneNumber,
      phone: contactData.phoneNumber,  // alias
      email: contactData.email,
    };

    const voicemailInstruction = `\n\nIMPORTANT — VOICEMAIL HANDLING: If you hear phrases like "forwarded to voice mail", "leave a message", "at the tone", or "record your message", do NOT say goodbye or end the call. Stay silent and wait — the system will automatically detect voicemail and leave a message for you.`;
    const systemPrompt = this.substituteVariables(assistant.systemPrompt, variables) + voicemailInstruction;
    const firstMessage = assistant.firstMessage
      ? this.substituteVariables(assistant.firstMessage, variables)
      : undefined;

    // Voicemail message — use saved message with variable substitution, or a default
    const defaultVoicemailMsg = `Hi ${contactData.firstName ?? 'there'}, this is Chris calling from Neumont University. I'm reaching out because you previously showed interest in computer science and tech careers like AI or software engineering. I'd love to connect with you — please give us a call back at 487-444-5484. Thanks, and I look forward to speaking with you!`;
    const voicemailMessage = assistant.voicemailMessage
      ? this.substituteVariables(assistant.voicemailMessage, variables)
      : defaultVoicemailMsg;

    return {
      model: {
        provider: assistant.modelProvider,
        model: assistant.modelName,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
        ],
      },
      voice: {
        provider: assistant.voiceProvider,
        model: assistant.voiceModel,
        voiceId: assistant.voiceId,
      },
      firstMessage,
      firstMessageMode: assistant.firstSpeaker === 'ASSISTANT' ? 'assistant-speaks-first' : 'assistant-waits-for-user',
      endCallFunctionEnabled: true,
      serverMessages: ['end-of-call-report', 'status-update'],
      analysisPlan: getAnalysisPlan(),
      voicemailDetection: {
        provider: 'vapi',
        backoffPlan: {
          startAtSeconds: 2,
          frequencySeconds: 2.5,
          maxRetries: 6,
        },
        beepMaxAwaitSeconds: 30,
      },
      voicemailMessage,
    };
  }
}

export const assistantsService = new AssistantsService();

/**
 * Build the VAPI analysisPlan so VAPI extracts all structured data from every call.
 * Uses the flat format (structuredDataSchema, summaryPrompt, successEvaluationPrompt)
 * which is the format VAPI's API actually processes — NOT the nested SDK type format.
 */
/**
 * Build the VAPI analysisPlan.
 *
 * IMPORTANT — VAPI gives only 5 seconds for structured data extraction.
 * Keep the schema SMALL and FLAT (no nested objects/arrays of objects).
 * Complex schemas cause timeout → structuredData comes back null.
 */
export function getAnalysisPlan() {
  return {
    structuredDataSchema: {
      type: 'object',
      properties: {
        callOutcome: {
          type: 'string',
          enum: ['SUCCESS', 'PARTIAL', 'NO_RESPONSE', 'CALLBACK_REQUESTED', 'WRONG_NUMBER', 'DECLINED', 'TECHNICAL_FAILURE'],
        },
        callResult: {
          type: 'string',
          enum: ['PASS', 'FAIL', 'INCONCLUSIVE'],
        },
        sentiment: {
          type: 'string',
          enum: ['VERY_POSITIVE', 'POSITIVE', 'NEUTRAL', 'NEGATIVE', 'VERY_NEGATIVE'],
        },
        interestLevel: {
          type: 'string',
          enum: ['high', 'medium', 'low', 'none'],
        },
        appointmentBooked: {
          type: 'boolean',
        },
        appointmentDate: {
          type: 'string',
          description: 'Date if appointment booked (e.g. "next Tuesday")',
        },
        appointmentTime: {
          type: 'string',
          description: 'Time if appointment booked (e.g. "10:00 AM")',
        },
        appointmentType: {
          type: 'string',
          description: 'Type of appointment (e.g. "admissions call", "campus tour")',
        },
        followUpNeeded: {
          type: 'boolean',
        },
        followUpAction: {
          type: 'string',
          description: 'What follow-up is needed (e.g. "Send email with program info", "Call back Friday")',
        },
        confirmedEmail: {
          type: 'string',
          description: 'Email address confirmed or provided by the contact during the call',
        },
        confirmedFullName: {
          type: 'string',
          description: 'Full name confirmed or provided by the contact during the call',
        },
        confirmedPhone: {
          type: 'string',
          description: 'Phone number confirmed or provided by the contact during the call (if different from the call number)',
        },
      },
      required: ['callOutcome', 'callResult', 'sentiment', 'appointmentBooked', 'followUpNeeded'],
    },
    structuredDataPrompt: [
      'Extract data from this call. Be concise.',
      'callOutcome: SUCCESS if appointment/tour/visit booked or concrete next step established. PARTIAL if engaged but no commitment. CALLBACK_REQUESTED if asked to call back. DECLINED if not interested. WRONG_NUMBER if wrong person. NO_RESPONSE if voicemail/no answer. TECHNICAL_FAILURE if call issues.',
      'callResult: PASS if primary goal achieved, FAIL if not, INCONCLUSIVE if unclear.',
      'sentiment: overall contact sentiment.',
      'interestLevel: contact interest level.',
      'appointmentBooked: true only if specific date/time agreed for visit/tour/meeting/call.',
      'If appointmentBooked=true, fill appointmentDate, appointmentTime, appointmentType.',
      'followUpNeeded: true if any follow-up action required.',
      'If followUpNeeded=true, describe in followUpAction.',
      'confirmedEmail: extract if the contact stated, confirmed, or spelled out their email address.',
      'confirmedFullName: extract if the contact stated or confirmed their full name.',
      'confirmedPhone: extract only if the contact provided a different/preferred phone number.',
    ].join('\n'),
    successEvaluationPrompt: [
      'Evaluate whether this call achieved its goal.',
      'A call is successful if the contact engaged meaningfully AND one of:',
      '- An appointment/tour/visit was scheduled',
      '- The contact expressed clear interest in next steps',
      '- Key information was successfully communicated and received positively',
      'A call is NOT successful if: contact was unreachable, hung up quickly, showed no interest, or the call had technical issues.',
    ].join('\n'),
    summaryPrompt: [
      'Write a detailed summary of this phone call (4-6 sentences).',
      'Include: who was called, purpose, how they responded, key info exchanged,',
      'whether an appointment was scheduled, and what happens next.',
      'Be specific — reference actual details from the conversation.',
    ].join('\n'),
  };
}
