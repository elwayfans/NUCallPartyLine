import { Router } from 'express';
import { analyticsService } from '../services/analytics.service.js';
import { successResponse, errorResponse } from '../utils/response.js';

const router = Router();

// GET /api/analytics/dashboard - Get dashboard analytics
router.get('/dashboard', async (_req, res, next) => {
  try {
    const stats = await analyticsService.getDashboardStats();
    successResponse(res, stats);
  } catch (error) {
    next(error);
  }
});

// GET /api/analytics/campaigns/:id - Get campaign analytics
router.get('/campaigns/:id', async (req, res, next) => {
  try {
    const analytics = await analyticsService.getCampaignAnalytics(req.params.id);
    successResponse(res, analytics);
  } catch (error) {
    next(error);
  }
});

// POST /api/analytics/calls/:id/reprocess - Reprocess analytics for a call
router.post('/calls/:id/reprocess', async (req, res, next) => {
  try {
    await analyticsService.reprocessAnalytics(req.params.id);
    successResponse(res, { message: 'Analytics reprocessing started' });
  } catch (error) {
    next(error);
  }
});

export default router;
