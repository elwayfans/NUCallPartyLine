import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { contactsService } from '../services/contacts.service.js';
import { successResponse, errorResponse, paginatedResponse, getPaginationParams } from '../utils/response.js';
import { normalizePhoneNumber, isValidPhoneNumber } from '../utils/phone-formatter.js';
import { generateCsvTemplate } from '../services/csv-parser.service.js';

const router = Router();

// Configure multer for CSV uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

// Validation schemas
const createContactSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phoneNumber: z.string().min(1, 'Phone number is required'),
  email: z.string().email().optional().or(z.literal('')),
  studentName: z.string().optional(),
  studentGrade: z.string().optional(),
  relationship: z.string().optional(),
  language: z.string().optional(),
  timezone: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateContactSchema = createContactSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// GET /api/contacts - List contacts
router.get('/', async (req, res, next) => {
  try {
    const pagination = getPaginationParams(req.query as { page?: string; pageSize?: string });
    const filters = {
      search: req.query.search as string | undefined,
      isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
    };

    const result = await contactsService.findAll(filters, pagination);
    paginatedResponse(res, result.data, result.pagination);
  } catch (error) {
    next(error);
  }
});

// GET /api/contacts/stats - Get contact statistics
router.get('/stats', async (_req, res, next) => {
  try {
    const stats = await contactsService.getStats();
    successResponse(res, stats);
  } catch (error) {
    next(error);
  }
});

// GET /api/contacts/export - Export contacts to CSV
router.get('/export', async (_req, res, next) => {
  try {
    const csv = await contactsService.exportToCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv');
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

// GET /api/contacts/template - Download CSV template
router.get('/template', (_req, res) => {
  const template = generateCsvTemplate();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=contacts_template.csv');
  res.send(template);
});

// GET /api/contacts/import/:id/status - Check import status
router.get('/import/:id/status', async (req, res, next) => {
  try {
    const status = await contactsService.getImportStatus(req.params.id);
    if (!status) {
      return errorResponse(res, 'Import not found', 404);
    }
    successResponse(res, status);
  } catch (error) {
    next(error);
  }
});

// POST /api/contacts/import - Import contacts from CSV
router.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return errorResponse(res, 'No file uploaded', 400);
    }

    const result = await contactsService.importFromCsv(req.file.buffer);

    successResponse(res, {
      importId: result.importId,
      totalRows: result.result.totalRows,
      created: result.created,
      updated: result.updated,
      errors: result.result.errors,
    }, 201);
  } catch (error) {
    next(error);
  }
});

// GET /api/contacts/:id - Get single contact
router.get('/:id', async (req, res, next) => {
  try {
    const contact = await contactsService.findById(req.params.id);
    if (!contact) {
      return errorResponse(res, 'Contact not found', 404);
    }
    successResponse(res, contact);
  } catch (error) {
    next(error);
  }
});

// POST /api/contacts - Create contact
router.post('/', async (req, res, next) => {
  try {
    const data = createContactSchema.parse(req.body);

    // Normalize and validate phone number
    const phoneNumber = normalizePhoneNumber(data.phoneNumber);
    if (!isValidPhoneNumber(phoneNumber)) {
      return errorResponse(res, 'Invalid phone number format', 400);
    }

    // Check for existing contact with same phone
    const existing = await contactsService.findByPhoneNumber(phoneNumber);
    if (existing) {
      return errorResponse(res, 'A contact with this phone number already exists', 409);
    }

    const contact = await contactsService.create({
      ...data,
      phoneNumber,
      email: data.email || undefined,
    });

    successResponse(res, contact, 201);
  } catch (error) {
    next(error);
  }
});

// PUT /api/contacts/:id - Update contact
router.put('/:id', async (req, res, next) => {
  try {
    const data = updateContactSchema.parse(req.body);

    // If phone number is being updated, normalize and validate
    if (data.phoneNumber) {
      data.phoneNumber = normalizePhoneNumber(data.phoneNumber);
      if (!isValidPhoneNumber(data.phoneNumber)) {
        return errorResponse(res, 'Invalid phone number format', 400);
      }

      // Check for existing contact with same phone (excluding current)
      const existing = await contactsService.findByPhoneNumber(data.phoneNumber);
      if (existing && existing.id !== req.params.id) {
        return errorResponse(res, 'A contact with this phone number already exists', 409);
      }
    }

    const contact = await contactsService.update(req.params.id, data);
    successResponse(res, contact);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/contacts/:id - Delete contact (soft delete)
router.delete('/:id', async (req, res, next) => {
  try {
    await contactsService.delete(req.params.id);
    successResponse(res, { message: 'Contact deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
