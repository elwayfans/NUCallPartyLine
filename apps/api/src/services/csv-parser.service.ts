import { parse } from 'csv-parse';
import { Readable } from 'stream';
import { z } from 'zod';
import { normalizePhoneNumber, isValidPhoneNumber } from '../utils/phone-formatter.js';

const contactRowSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phoneNumber: z.string().min(1, 'Phone number is required'),
  email: z.string().email().optional().or(z.literal('')),
  studentName: z.string().optional(),
  studentGrade: z.string().optional(),
  relationship: z.string().optional(),
  language: z.string().optional(),
  timezone: z.string().optional(),
  tags: z.string().optional(),
});

export interface ParsedContact {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email?: string;
  studentName?: string;
  studentGrade?: string;
  relationship?: string;
  language: string;
  timezone: string;
  tags: string[];
}

export interface ParseResult {
  contacts: ParsedContact[];
  errors: Array<{ row: number; error: string }>;
  totalRows: number;
}

// Column name mappings (handles various CSV formats)
const columnMappings: Record<string, string> = {
  // First name variations
  'first_name': 'firstName',
  'first name': 'firstName',
  'firstname': 'firstName',
  'fname': 'firstName',
  'given_name': 'firstName',
  'given name': 'firstName',

  // Last name variations
  'last_name': 'lastName',
  'last name': 'lastName',
  'lastname': 'lastName',
  'lname': 'lastName',
  'surname': 'lastName',
  'family_name': 'lastName',
  'family name': 'lastName',

  // Phone variations
  'phone_number': 'phoneNumber',
  'phone number': 'phoneNumber',
  'phonenumber': 'phoneNumber',
  'phone': 'phoneNumber',
  'mobile': 'phoneNumber',
  'mobile_phone': 'phoneNumber',
  'cell': 'phoneNumber',
  'cell_phone': 'phoneNumber',
  'telephone': 'phoneNumber',

  // Email variations
  'email_address': 'email',
  'email address': 'email',
  'emailaddress': 'email',
  'e-mail': 'email',

  // Student variations
  'student_name': 'studentName',
  'student name': 'studentName',
  'studentname': 'studentName',
  'child_name': 'studentName',
  'child name': 'studentName',

  // Grade variations
  'student_grade': 'studentGrade',
  'student grade': 'studentGrade',
  'grade': 'studentGrade',
  'grade_level': 'studentGrade',
  'grade level': 'studentGrade',

  // Relationship variations
  'relation': 'relationship',
  'relation_type': 'relationship',
  'parent_type': 'relationship',
};

function normalizeColumnName(header: string): string {
  const normalized = header.toLowerCase().trim();
  return columnMappings[normalized] ?? normalized;
}

export async function parseCsvBuffer(buffer: Buffer): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const contacts: ParsedContact[] = [];
    const errors: Array<{ row: number; error: string }> = [];
    let rowNumber = 0;
    let headers: string[] = [];

    const parser = parse({
      columns: (headerRow: string[]) => {
        headers = headerRow.map(normalizeColumnName);
        return headers;
      },
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });

    parser.on('readable', () => {
      let record: Record<string, string>;
      while ((record = parser.read()) !== null) {
        rowNumber++;

        try {
          // Validate required fields
          const validated = contactRowSchema.parse(record);

          // Normalize phone number
          const phoneNumber = normalizePhoneNumber(validated.phoneNumber);

          if (!isValidPhoneNumber(phoneNumber)) {
            errors.push({
              row: rowNumber,
              error: `Invalid phone number format: ${validated.phoneNumber}`,
            });
            continue;
          }

          // Parse tags (comma-separated)
          const tags = validated.tags
            ? validated.tags.split(',').map((t) => t.trim()).filter(Boolean)
            : [];

          contacts.push({
            firstName: validated.firstName.trim(),
            lastName: validated.lastName.trim(),
            phoneNumber,
            email: validated.email?.trim() || undefined,
            studentName: validated.studentName?.trim() || undefined,
            studentGrade: validated.studentGrade?.trim() || undefined,
            relationship: validated.relationship?.trim() || undefined,
            language: validated.language?.trim() || 'en',
            timezone: validated.timezone?.trim() || 'America/New_York',
            tags,
          });
        } catch (error) {
          if (error instanceof z.ZodError) {
            const messages = error.errors.map((e) => e.message).join('; ');
            errors.push({ row: rowNumber, error: messages });
          } else {
            errors.push({ row: rowNumber, error: 'Unknown parsing error' });
          }
        }
      }
    });

    parser.on('error', (err) => {
      reject(err);
    });

    parser.on('end', () => {
      resolve({
        contacts,
        errors,
        totalRows: rowNumber,
      });
    });

    // Feed the buffer to the parser
    const stream = Readable.from(buffer);
    stream.pipe(parser);
  });
}

export function generateCsvTemplate(): string {
  const headers = [
    'firstName',
    'lastName',
    'phoneNumber',
    'email',
  ];

  const exampleRow = [
    'John',
    'Smith',
    '555-123-4567',
    'john.smith@email.com',
  ];

  return `${headers.join(',')}\n${exampleRow.join(',')}`;
}
