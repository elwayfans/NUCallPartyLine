import { Router } from 'express';
import { callsService } from '../services/calls.service.js';
import { callSyncService } from '../services/call-sync.service.js';
import { successResponse, errorResponse, paginatedResponse, getPaginationParams } from '../utils/response.js';

const router = Router();

// GET /api/calls - List calls
router.get('/', async (req, res, next) => {
  try {
    const pagination = getPaginationParams(req.query as { page?: string; pageSize?: string });
    const filters = {
      campaignId: req.query.campaignId as string | undefined,
      contactId: req.query.contactId as string | undefined,
      status: req.query.status as string | undefined,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
    };

    const result = await callsService.findAll(
      filters as Parameters<typeof callsService.findAll>[0],
      pagination
    );
    paginatedResponse(res, result.data, result.pagination);
  } catch (error) {
    next(error);
  }
});

// GET /api/calls/stats - Get call statistics
router.get('/stats', async (req, res, next) => {
  try {
    const filters = {
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
    };
    const stats = await callsService.getStats(filters);
    successResponse(res, stats);
  } catch (error) {
    next(error);
  }
});

// GET /api/calls/status-counts - Get counts by status
router.get('/status-counts', async (_req, res, next) => {
  try {
    const counts = await callsService.getStatusCounts();
    successResponse(res, counts);
  } catch (error) {
    next(error);
  }
});

// GET /api/calls/:id - Get single call
router.get('/:id', async (req, res, next) => {
  try {
    const call = await callsService.findById(req.params.id);
    if (!call) {
      return errorResponse(res, 'Call not found', 404);
    }
    successResponse(res, call);
  } catch (error) {
    next(error);
  }
});

// GET /api/calls/:id/transcript - Get call transcript
router.get('/:id/transcript', async (req, res, next) => {
  try {
    const transcript = await callsService.getTranscript(req.params.id);
    if (!transcript) {
      return errorResponse(res, 'Transcript not found', 404);
    }
    successResponse(res, transcript);
  } catch (error) {
    next(error);
  }
});

// GET /api/calls/:id/analytics - Get call analytics
router.get('/:id/analytics', async (req, res, next) => {
  try {
    const analytics = await callsService.getAnalytics(req.params.id);
    if (!analytics) {
      return errorResponse(res, 'Analytics not found', 404);
    }
    successResponse(res, analytics);
  } catch (error) {
    next(error);
  }
});

// POST /api/calls/sync - Manually trigger sync for stuck calls
router.post('/sync', async (_req, res, next) => {
  try {
    const result = await callSyncService.syncStuckCalls();
    successResponse(res, result);
  } catch (error) {
    next(error);
  }
});

// POST /api/calls/:id/sync - Sync a single call from VAPI
router.post('/:id/sync', async (req, res, next) => {
  try {
    const call = await callsService.findById(req.params.id);
    if (!call) {
      return errorResponse(res, 'Call not found', 404);
    }
    if (!call.vapiCallId) {
      return errorResponse(res, 'Call has no VAPI ID', 400);
    }
    const updated = await callSyncService.syncCall(call.id, call.vapiCallId);
    successResponse(res, { synced: updated });
  } catch (error) {
    next(error);
  }
});

export default router;
