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

    const systemPrompt = this.substituteVariables(assistant.systemPrompt, variables);
    const firstMessage = assistant.firstMessage
      ? this.substituteVariables(assistant.firstMessage, variables)
      : undefined;

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
      serverMessages: ['end-of-call-report', 'status-update'],
      analysisPlan: getAnalysisPlan(),
    };
  }
}

export const assistantsService = new AssistantsService();

/**
 * Build the VAPI analysisPlan so VAPI extracts all structured data from every call.
 * Uses the flat format (structuredDataSchema, summaryPrompt, successEvaluationPrompt)
 * which is the format VAPI's API actually processes — NOT the nested SDK type format.
 */
export function getAnalysisPlan() {
  return {
    structuredDataSchema: {
      type: 'object',
      properties: {
        callSummary: {
          type: 'string',
          description: 'A brief summary of the call conversation',
        },
        callOutcome: {
          type: 'string',
          enum: ['SUCCESS', 'PARTIAL', 'NO_RESPONSE', 'CALLBACK_REQUESTED', 'WRONG_NUMBER', 'DECLINED', 'TECHNICAL_FAILURE'],
          description: 'Overall call outcome category',
        },
        outcomeReason: {
          type: 'string',
          description: 'Brief explanation of why this outcome was determined (1-2 sentences)',
        },
        callResult: {
          type: 'string',
          enum: ['PASS', 'FAIL', 'INCONCLUSIVE'],
          description: 'Whether the call achieved its primary objective',
        },
        callResultReason: {
          type: 'string',
          description: 'Brief explanation of the pass/fail determination',
        },
        sentiment: {
          type: 'string',
          enum: ['VERY_POSITIVE', 'POSITIVE', 'NEUTRAL', 'NEGATIVE', 'VERY_NEGATIVE'],
          description: 'Overall sentiment of the contact during the call',
        },
        sentimentConfidence: {
          type: 'number',
          description: 'Confidence in sentiment assessment from 0.0 to 1.0',
        },
        sentimentBreakdown: {
          type: 'object',
          description: 'Percentage breakdown of sentiment (must sum to 100)',
          properties: {
            positive: { type: 'number' },
            negative: { type: 'number' },
            neutral: { type: 'number' },
          },
        },
        interestLevel: {
          type: 'string',
          enum: ['high', 'medium', 'low', 'none'],
          description: 'The contact\'s overall level of interest based on their responses and engagement',
        },
        appointmentBooked: {
          type: 'boolean',
          description: 'Whether an appointment, visit, tour, or meeting was explicitly scheduled',
        },
        appointmentDate: {
          type: 'string',
          description: 'Date of the scheduled appointment if booked (e.g. "2025-03-15" or "next Tuesday")',
        },
        appointmentTime: {
          type: 'string',
          description: 'Time of the scheduled appointment if booked (e.g. "2:00 PM")',
        },
        appointmentType: {
          type: 'string',
          description: 'Type of appointment (campus tour, interview, information session, orientation, etc.)',
        },
        keyTopics: {
          type: 'array',
          items: { type: 'string' },
          description: 'Main topics discussed during the call (3-8 items)',
        },
        extractedResponses: {
          type: 'object',
          description: 'Key question/answer pairs from the conversation',
        },
        objections: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific objections or concerns raised by the contact',
        },
        actionItems: {
          type: 'array',
          items: { type: 'string' },
          description: 'Action items that need follow-up after the call',
        },
        nextSteps: {
          type: 'array',
          items: { type: 'string' },
          description: 'Next steps agreed upon during the call',
        },
      },
    },
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
      'Include:',
      '- Who was called and the purpose of the call',
      '- How the contact responded and their level of engagement',
      '- Key information exchanged or questions answered',
      '- The outcome: was an appointment scheduled? Did they express interest? Any concerns raised?',
      '- What happens next (follow-up, visit, callback, etc.)',
      'Be specific — reference actual details from the conversation rather than being generic.',
    ].join('\n'),
  };
}
