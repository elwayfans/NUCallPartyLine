import { prisma } from '../config/database.js';
import type { Prisma } from '@prisma/client';
import { parseCsvBuffer, type ParseResult } from './csv-parser.service.js';

export interface ContactFilters {
  search?: string;
  isActive?: boolean;
  tags?: string[];
}

export interface PaginationOptions {
  page: number;
  pageSize: number;
}

export class ContactsService {
  async findAll(
    filters: ContactFilters = {},
    pagination: PaginationOptions = { page: 1, pageSize: 20 }
  ) {
    const where: Prisma.ContactWhereInput = {};

    if (filters.search) {
      where.OR = [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { phoneNumber: { contains: filters.search } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { studentName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.tags && filters.tags.length > 0) {
      where.tags = { hasSome: filters.tags };
    }

    const [contacts, totalItems] = await Promise.all([
      prisma.contact.findMany({
        where,
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      prisma.contact.count({ where }),
    ]);

    return {
      data: contacts,
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pagination.pageSize),
      },
    };
  }

  async findById(id: string) {
    return prisma.contact.findUnique({
      where: { id },
      include: {
        calls: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            campaign: { select: { id: true, name: true } },
          },
        },
        campaignContacts: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            campaign: { select: { id: true, name: true, status: true } },
          },
        },
      },
    });
  }

  async findByPhoneNumber(phoneNumber: string) {
    return prisma.contact.findUnique({
      where: { phoneNumber },
    });
  }

  async create(data: {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    email?: string;
    studentName?: string;
    studentGrade?: string;
    relationship?: string;
    language?: string;
    timezone?: string;
    tags?: string[];
    metadata?: Prisma.JsonValue;
  }) {
    return prisma.contact.create({ data });
  }

  async update(
    id: string,
    data: Partial<{
      firstName: string;
      lastName: string;
      phoneNumber: string;
      email: string | null;
      studentName: string | null;
      studentGrade: string | null;
      relationship: string | null;
      language: string;
      timezone: string;
      tags: string[];
      metadata: Prisma.JsonValue;
      isActive: boolean;
    }>
  ) {
    return prisma.contact.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    // Soft delete by setting isActive to false
    return prisma.contact.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async hardDelete(id: string) {
    return prisma.contact.delete({
      where: { id },
    });
  }

  async importFromCsv(buffer: Buffer): Promise<{
    importId: string;
    result: ParseResult;
    created: number;
    updated: number;
  }> {
    // Create import record
    const importRecord = await prisma.csvImport.create({
      data: {
        filename: 'upload.csv',
        status: 'PROCESSING',
      },
    });

    try {
      // Parse CSV
      const parseResult = await parseCsvBuffer(buffer);

      let created = 0;
      let updated = 0;

      // Process contacts in batches
      for (const contact of parseResult.contacts) {
        const existing = await this.findByPhoneNumber(contact.phoneNumber);

        if (existing) {
          await this.update(existing.id, {
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.email ?? null,
            studentName: contact.studentName ?? null,
            studentGrade: contact.studentGrade ?? null,
            relationship: contact.relationship ?? null,
            language: contact.language,
            timezone: contact.timezone,
            tags: contact.tags,
          });
          updated++;
        } else {
          await this.create(contact);
          created++;
        }
      }

      // Update import record
      await prisma.csvImport.update({
        where: { id: importRecord.id },
        data: {
          status: 'COMPLETED',
          totalRows: parseResult.totalRows,
          successCount: created + updated,
          errorCount: parseResult.errors.length,
          errors: parseResult.errors.length > 0 ? parseResult.errors : undefined,
          completedAt: new Date(),
        },
      });

      return {
        importId: importRecord.id,
        result: parseResult,
        created,
        updated,
      };
    } catch (error) {
      // Update import record with error
      await prisma.csvImport.update({
        where: { id: importRecord.id },
        data: {
          status: 'FAILED',
          errors: [{ row: 0, error: error instanceof Error ? error.message : 'Unknown error' }],
          completedAt: new Date(),
        },
      });

      throw error;
    }
  }

  async getImportStatus(importId: string) {
    return prisma.csvImport.findUnique({
      where: { id: importId },
    });
  }

  async exportToCsv(): Promise<string> {
    const contacts = await prisma.contact.findMany({
      where: { isActive: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const headers = [
      'firstName',
      'lastName',
      'phoneNumber',
      'email',
      'studentName',
      'studentGrade',
      'relationship',
      'language',
      'timezone',
      'tags',
    ];

    const rows = contacts.map((contact) => [
      contact.firstName,
      contact.lastName,
      contact.phoneNumber,
      contact.email ?? '',
      contact.studentName ?? '',
      contact.studentGrade ?? '',
      contact.relationship ?? '',
      contact.language,
      contact.timezone,
      contact.tags.join(','),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => {
          // Escape cells containing commas or quotes
          if (cell.includes(',') || cell.includes('"')) {
            return `"${cell.replace(/"/g, '""')}"`;
          }
          return cell;
        }).join(',')
      ),
    ].join('\n');

    return csvContent;
  }

  async getStats() {
    const [total, active] = await Promise.all([
      prisma.contact.count(),
      prisma.contact.count({ where: { isActive: true } }),
    ]);

    return { total, active };
  }
}

export const contactsService = new ContactsService();
