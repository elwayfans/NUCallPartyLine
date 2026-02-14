import { prisma } from '../config/database.js';
import type { CallStatus, Prisma } from '@prisma/client';

export interface CallFilters {
  campaignId?: string;
  contactId?: string;
  status?: CallStatus;
  startDate?: Date;
  endDate?: Date;
}

export interface PaginationOptions {
  page: number;
  pageSize: number;
}

export class CallsService {
  async findAll(
    filters: CallFilters = {},
    pagination: PaginationOptions = { page: 1, pageSize: 20 }
  ) {
    const where: Prisma.CallWhereInput = {};

    if (filters.campaignId) {
      where.campaignId = filters.campaignId;
    }

    if (filters.contactId) {
      where.contactId = filters.contactId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const [calls, totalItems] = await Promise.all([
      prisma.call.findMany({
        where,
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phoneNumber: true,
            },
          },
          campaign: {
            select: {
              id: true,
              name: true,
            },
          },
          analytics: {
            select: {
              summary: true,
              overallSentiment: true,
              customFields: true,
            },
          },
        },
      }),
      prisma.call.count({ where }),
    ]);

    return {
      data: calls,
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pagination.pageSize),
      },
    };
  }

  async findById(id: string) {
    return prisma.call.findUnique({
      where: { id },
      include: {
        contact: true,
        campaign: true,
        transcript: true,
        analytics: true,
      },
    });
  }

  async findByVapiCallId(vapiCallId: string) {
    return prisma.call.findUnique({
      where: { vapiCallId },
      include: {
        contact: true,
        campaign: true,
      },
    });
  }

  async updateStatus(
    id: string,
    data: {
      status: CallStatus;
      startedAt?: Date;
      answeredAt?: Date;
      endedAt?: Date;
      duration?: number;
      endedReason?: string;
      cost?: number;
    }
  ) {
    return prisma.call.update({
      where: { id },
      data,
    });
  }

  async updateByVapiCallId(
    vapiCallId: string,
    data: Partial<{
      status: CallStatus;
      startedAt: Date;
      answeredAt: Date;
      endedAt: Date;
      duration: number;
      endedReason: string;
      cost: number;
    }>
  ) {
    return prisma.call.update({
      where: { vapiCallId },
      data,
    });
  }

  async getTranscript(callId: string) {
    return prisma.transcript.findUnique({
      where: { callId },
    });
  }

  async saveTranscript(
    callId: string,
    data: {
      fullText: string;
      messages: Array<{ role: string; content: string; timestamp?: number }>;
      recordingUrl?: string;
      recordingDuration?: number;
    }
  ) {
    return prisma.transcript.upsert({
      where: { callId },
      create: {
        callId,
        fullText: data.fullText,
        messages: data.messages,
        recordingUrl: data.recordingUrl,
        recordingDuration: data.recordingDuration,
      },
      update: {
        fullText: data.fullText,
        messages: data.messages,
        recordingUrl: data.recordingUrl,
        recordingDuration: data.recordingDuration,
      },
    });
  }

  async getAnalytics(callId: string) {
    return prisma.callAnalytics.findUnique({
      where: { callId },
    });
  }

  async getStats(filters?: { startDate?: Date; endDate?: Date }) {
    const where: Prisma.CallWhereInput = {};

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const [total, completed, failed, avgDuration] = await Promise.all([
      prisma.call.count({ where }),
      prisma.call.count({ where: { ...where, status: 'COMPLETED' } }),
      prisma.call.count({ where: { ...where, status: 'FAILED' } }),
      prisma.call.aggregate({
        where: { ...where, duration: { not: null } },
        _avg: { duration: true },
      }),
    ]);

    // Get calls today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const callsToday = await prisma.call.count({
      where: {
        createdAt: { gte: today },
      },
    });

    return {
      total,
      completed,
      failed,
      avgDuration: avgDuration._avg.duration ?? 0,
      callsToday,
    };
  }

  async getStatusCounts() {
    const counts = await prisma.call.groupBy({
      by: ['status'],
      _count: true,
    });

    return Object.fromEntries(counts.map((c) => [c.status, c._count]));
  }
}

export const callsService = new CallsService();
