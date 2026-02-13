import { Router } from 'express';
import { z } from 'zod';
import { campaignsService } from '../services/campaigns.service.js';
import { successResponse, errorResponse, paginatedResponse, getPaginationParams } from '../utils/response.js';

const router = Router();

// Validation schemas
const createCampaignSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  assistantId: z.string().optional(),
  vapiAssistantId: z.string().optional(),
  vapiPhoneNumberId: z.string().optional(),
  maxConcurrentCalls: z.number().min(1).max(50).optional(),
  retryAttempts: z.number().min(0).max(5).optional(),
  retryDelayMinutes: z.number().min(1).max(1440).optional(),
});

const updateCampaignSchema = createCampaignSchema.partial();

const addContactsSchema = z.object({
  contactIds: z.array(z.string()).min(1, 'At least one contact ID is required'),
});

// GET /api/campaigns - List campaigns
router.get('/', async (req, res, next) => {
  try {
    const pagination = getPaginationParams(req.query as { page?: string; pageSize?: string });
    const filters = {
      status: req.query.status as string | undefined,
      search: req.query.search as string | undefined,
    };

    const result = await campaignsService.findAll(
      filters as Parameters<typeof campaignsService.findAll>[0],
      pagination
    );
    paginatedResponse(res, result.data, result.pagination);
  } catch (error) {
    next(error);
  }
});

// GET /api/campaigns/stats - Get campaign statistics
router.get('/stats', async (_req, res, next) => {
  try {
    const stats = await campaignsService.getStats();
    successResponse(res, stats);
  } catch (error) {
    next(error);
  }
});

// GET /api/campaigns/:id - Get single campaign
router.get('/:id', async (req, res, next) => {
  try {
    const campaign = await campaignsService.findById(req.params.id);
    if (!campaign) {
      return errorResponse(res, 'Campaign not found', 404);
    }
    successResponse(res, campaign);
  } catch (error) {
    next(error);
  }
});

// GET /api/campaigns/:id/progress - Get campaign progress
router.get('/:id/progress', async (req, res, next) => {
  try {
    const progress = await campaignsService.getProgress(req.params.id);
    successResponse(res, progress);
  } catch (error) {
    next(error);
  }
});

// POST /api/campaigns - Create campaign
router.post('/', async (req, res, next) => {
  try {
    const data = createCampaignSchema.parse(req.body);
    const campaign = await campaignsService.create(data);
    successResponse(res, campaign, 201);
  } catch (error) {
    next(error);
  }
});

// PUT /api/campaigns/:id - Update campaign
router.put('/:id', async (req, res, next) => {
  try {
    const data = updateCampaignSchema.parse(req.body);
    const campaign = await campaignsService.update(req.params.id, data);
    successResponse(res, campaign);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/campaigns/:id - Delete campaign
router.delete('/:id', async (req, res, next) => {
  try {
    await campaignsService.delete(req.params.id);
    successResponse(res, { message: 'Campaign deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// POST /api/campaigns/:id/contacts - Add contacts to campaign
router.post('/:id/contacts', async (req, res, next) => {
  try {
    const { contactIds } = addContactsSchema.parse(req.body);
    const result = await campaignsService.addContacts(req.params.id, contactIds);
    successResponse(res, result);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/campaigns/:id/contacts - Remove contacts from campaign
router.delete('/:id/contacts', async (req, res, next) => {
  try {
    const { contactIds } = addContactsSchema.parse(req.body);
    const result = await campaignsService.removeContacts(req.params.id, contactIds);
    successResponse(res, result);
  } catch (error) {
    next(error);
  }
});

// POST /api/campaigns/:id/start - Start campaign
router.post('/:id/start', async (req, res, next) => {
  try {
    const result = await campaignsService.start(req.params.id);
    successResponse(res, result);
  } catch (error) {
    next(error);
  }
});

// POST /api/campaigns/:id/pause - Pause campaign
router.post('/:id/pause', async (req, res, next) => {
  try {
    const campaign = await campaignsService.pause(req.params.id);
    successResponse(res, campaign);
  } catch (error) {
    next(error);
  }
});

// POST /api/campaigns/:id/resume - Resume campaign
router.post('/:id/resume', async (req, res, next) => {
  try {
    const result = await campaignsService.resume(req.params.id);
    successResponse(res, result);
  } catch (error) {
    next(error);
  }
});

// POST /api/campaigns/:id/cancel - Cancel campaign
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const campaign = await campaignsService.cancel(req.params.id);
    successResponse(res, campaign);
  } catch (error) {
    next(error);
  }
});

export default router;
