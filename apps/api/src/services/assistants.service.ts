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
    };
  }
}

export const assistantsService = new AssistantsService();
