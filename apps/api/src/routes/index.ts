import { Router } from 'express';
import healthRoutes from './health.routes.js';
import contactsRoutes from './contacts.routes.js';
import campaignsRoutes from './campaigns.routes.js';
import callsRoutes from './calls.routes.js';
import analyticsRoutes from './analytics.routes.js';
import webhooksRoutes from './webhooks.routes.js';
import assistantsRoutes from './assistants.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/contacts', contactsRoutes);
router.use('/campaigns', campaignsRoutes);
router.use('/calls', callsRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/webhooks', webhooksRoutes);
router.use('/assistants', assistantsRoutes);

export default router;
