import { prisma } from '../config/database.js';
import type { CampaignStatus, Prisma } from '@prisma/client';
import { vapiService } from './vapi.service.js';
import { env } from '../config/env.js';

export interface CampaignFilters {
  status?: CampaignStatus;
  search?: string;
}

export interface PaginationOptions {
  page: number;
  pageSize: number;
}

export class CampaignsService {
  async findAll(
    filters: CampaignFilters = {},
    pagination: PaginationOptions = { page: 1, pageSize: 20 }
  ) {
    const where: Prisma.CampaignWhereInput = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [campaigns, totalItems] = await Promise.all([
      prisma.campaign.findMany({
        where,
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { campaignContacts: true, calls: true },
          },
        },
      }),
      prisma.campaign.count({ where }),
    ]);

    return {
      data: campaigns,
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pagination.pageSize),
      },
    };
  }

  async findById(id: string) {
    return prisma.campaign.findUnique({
      where: { id },
      include: {
        assistant: { select: { id: true, name: true } },
        campaignContacts: {
          include: {
            contact: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        calls: {
          include: {
            contact: true,
            transcript: true,
            analytics: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
        _count: {
          select: { campaignContacts: true, calls: true },
        },
      },
    });
  }

  async create(data: {
    name: string;
    description?: string;
    assistantId?: string;
    vapiAssistantId?: string;
    vapiPhoneNumberId?: string;
    maxConcurrentCalls?: number;
    retryAttempts?: number;
    retryDelayMinutes?: number;
  }) {
    return prisma.campaign.create({
      data: {
        name: data.name,
        description: data.description,
        assistantId: data.assistantId,
        vapiAssistantId: data.vapiAssistantId ?? env.VAPI_ASSISTANT_ID,
        vapiPhoneNumberId: data.vapiPhoneNumberId ?? env.VAPI_PHONE_NUMBER_ID,
        maxConcurrentCalls: data.maxConcurrentCalls ?? env.MAX_CONCURRENT_CALLS,
        retryAttempts: data.retryAttempts ?? 1,
        retryDelayMinutes: data.retryDelayMinutes ?? 60,
        status: 'DRAFT',
      },
    });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      assistantId: string;
      vapiAssistantId: string;
      vapiPhoneNumberId: string | null;
      maxConcurrentCalls: number;
      retryAttempts: number;
      retryDelayMinutes: number;
    }>
  ) {
    // Only allow updates to DRAFT campaigns
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      throw new Error('Campaign not found');
    }
    if (campaign.status !== 'DRAFT') {
      throw new Error('Cannot update a campaign that is not in DRAFT status');
    }

    return prisma.campaign.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    // Only allow deletion of DRAFT or CANCELLED campaigns
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      throw new Error('Campaign not found');
    }
    if (!['DRAFT', 'CANCELLED', 'COMPLETED'].includes(campaign.status)) {
      throw new Error('Cannot delete an active campaign');
    }

    return prisma.campaign.delete({ where: { id } });
  }

  async addContacts(campaignId: string, contactIds: string[]) {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) {
      throw new Error('Campaign not found');
    }
    if (campaign.status !== 'DRAFT') {
      throw new Error('Cannot add contacts to a campaign that is not in DRAFT status');
    }

    // Create campaign contacts, skipping duplicates
    const results = await Promise.allSettled(
      contactIds.map((contactId) =>
        prisma.campaignContact.create({
          data: {
            campaignId,
            contactId,
            status: 'PENDING',
          },
        })
      )
    );

    const added = results.filter((r) => r.status === 'fulfilled').length;

    // Update total contacts count
    const totalContacts = await prisma.campaignContact.count({
      where: { campaignId },
    });

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { totalContacts },
    });

    return { added, total: totalContacts };
  }

  async removeContacts(campaignId: string, contactIds: string[]) {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) {
      throw new Error('Campaign not found');
    }
    if (campaign.status !== 'DRAFT') {
      throw new Error('Cannot remove contacts from a campaign that is not in DRAFT status');
    }

    await prisma.campaignContact.deleteMany({
      where: {
        campaignId,
        contactId: { in: contactIds },
      },
    });

    // Update total contacts count
    const totalContacts = await prisma.campaignContact.count({
      where: { campaignId },
    });

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { totalContacts },
    });

    return { total: totalContacts };
  }

  async start(id: string) {
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        campaignContacts: {
          where: { status: 'PENDING' },
          include: { contact: true },
        },
      },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (!['DRAFT', 'PAUSED'].includes(campaign.status)) {
      throw new Error('Campaign must be in DRAFT or PAUSED status to start');
    }

    if (campaign.campaignContacts.length === 0) {
      throw new Error('Campaign has no pending contacts to call');
    }

    // Update campaign status
    await prisma.campaign.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS',
        startedAt: campaign.startedAt ?? new Date(),
      },
    });

    // Get contacts to call
    const contactsToCall = campaign.campaignContacts
      .filter((cc) => cc.contact.isActive)
      .map((cc) => ({
        id: cc.contact.id,
        phoneNumber: cc.contact.phoneNumber,
        campaignContactId: cc.id,
      }));

    // Start batch calls
    const results = await vapiService.createBatchCalls({
      campaignId: id,
      contacts: contactsToCall,
      assistantId: campaign.vapiAssistantId,
      phoneNumberId: campaign.vapiPhoneNumberId ?? undefined,
      maxConcurrent: campaign.maxConcurrentCalls,
    });

    // Update campaign contact statuses
    for (const result of results) {
      if (result.error) {
        const cc = contactsToCall.find((c) => c.id === result.contactId);
        if (cc) {
          await prisma.campaignContact.update({
            where: { id: cc.campaignContactId },
            data: { status: 'FAILED', attempts: { increment: 1 } },
          });
        }
      } else {
        const cc = contactsToCall.find((c) => c.id === result.contactId);
        if (cc) {
          await prisma.campaignContact.update({
            where: { id: cc.campaignContactId },
            data: { status: 'IN_PROGRESS', attempts: { increment: 1 }, lastAttemptAt: new Date() },
          });
        }
      }
    }

    return {
      started: results.filter((r) => !r.error).length,
      failed: results.filter((r) => r.error).length,
      results,
    };
  }

  async pause(id: string) {
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      throw new Error('Campaign not found');
    }
    if (campaign.status !== 'IN_PROGRESS') {
      throw new Error('Can only pause an in-progress campaign');
    }

    return prisma.campaign.update({
      where: { id },
      data: { status: 'PAUSED' },
    });
  }

  async resume(id: string) {
    return this.start(id);
  }

  async cancel(id: string) {
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      throw new Error('Campaign not found');
    }
    if (!['DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'PAUSED'].includes(campaign.status)) {
      throw new Error('Cannot cancel a completed or already cancelled campaign');
    }

    return prisma.campaign.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      },
    });
  }

  async getProgress(id: string) {
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        _count: {
          select: { campaignContacts: true },
        },
      },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const statusCounts = await prisma.campaignContact.groupBy({
      by: ['status'],
      where: { campaignId: id },
      _count: true,
    });

    const callStatusCounts = await prisma.call.groupBy({
      by: ['status'],
      where: { campaignId: id },
      _count: true,
    });

    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        totalContacts: campaign.totalContacts,
        completedCalls: campaign.completedCalls,
        failedCalls: campaign.failedCalls,
      },
      contactStatuses: Object.fromEntries(
        statusCounts.map((s) => [s.status, s._count])
      ),
      callStatuses: Object.fromEntries(
        callStatusCounts.map((s) => [s.status, s._count])
      ),
    };
  }

  async reset(id: string) {
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      throw new Error('Campaign not found');
    }
    if (campaign.status === 'DRAFT') {
      throw new Error('Campaign is already in DRAFT status');
    }

    // Delete call analytics and transcripts for this campaign's calls
    const callIds = await prisma.call.findMany({
      where: { campaignId: id },
      select: { id: true },
    });
    const ids = callIds.map((c) => c.id);

    if (ids.length > 0) {
      await prisma.callAnalytics.deleteMany({ where: { callId: { in: ids } } });
      await prisma.transcript.deleteMany({ where: { callId: { in: ids } } });
      await prisma.call.deleteMany({ where: { campaignId: id } });
    }

    // Reset all campaign contacts to PENDING
    await prisma.campaignContact.updateMany({
      where: { campaignId: id },
      data: { status: 'PENDING', attempts: 0, lastAttemptAt: null },
    });

    // Reset campaign counters and status
    return prisma.campaign.update({
      where: { id },
      data: {
        status: 'DRAFT',
        completedCalls: 0,
        failedCalls: 0,
        startedAt: null,
        completedAt: null,
      },
    });
  }

  async getStats() {
    const [total, active, completed] = await Promise.all([
      prisma.campaign.count(),
      prisma.campaign.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.campaign.count({ where: { status: 'COMPLETED' } }),
    ]);

    return { total, active, completed };
  }
}

export const campaignsService = new CampaignsService();
