import { Router } from 'express';
import chatRoutes from './chat';
import componentRoutes from './components';
import workspaceRoutes from './workspace';
import diagramRoutes from './diagram';
import validationRoutes from './validation';
import healthRoutes from './health';
import feedbackRoutes from './feedback';
import analyticsRoutes from './analytics';
import authRoutes from './auth';
import bomRoutes from './bom';
import drcRoutes from './drc';
import architectureAnalyticsRoutes from './architecture-analytics';
import backupRoutes from './backup';

import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';

export function setupRoutes(): Router {
  const router = Router();

  // API version prefix
  const v1Router = Router();

  // Public routes (no auth required)
  v1Router.use('/health', healthRoutes);
  v1Router.use('/auth', authRoutes);

  // Protected routes (auth required)
  v1Router.use('/chat', authMiddleware, chatRoutes);
  v1Router.use('/components', authMiddleware, componentRoutes);
  v1Router.use('/workspace', authMiddleware, workspaceRoutes);
  v1Router.use('/diagram', authMiddleware, diagramRoutes);
  v1Router.use('/validation', authMiddleware, validationRoutes);
  v1Router.use('/feedback', authMiddleware, feedbackRoutes);
  v1Router.use('/analytics', authMiddleware, analyticsRoutes);
  v1Router.use('/bom', authMiddleware, bomRoutes);
  v1Router.use('/drc', authMiddleware, drcRoutes);
  v1Router.use('/architecture-analytics', authMiddleware, architectureAnalyticsRoutes);
  v1Router.use('/backup', authMiddleware, backupRoutes);



  // Mount v1 routes
  router.use('/v1', v1Router);

  // Default API info
  router.get('/', (req, res) => {
    res.json({
      success: true,
      data: {
        name: 'SoC Pilot API',
        version: '1.0.0',
        description: 'AI-driven System-on-Chip design API',
        endpoints: {
          auth: '/api/v1/auth',
          chat: '/api/v1/chat',
          components: '/api/v1/components',
          workspace: '/api/v1/workspace',
          diagram: '/api/v1/diagram',
          validation: '/api/v1/validation',
          feedback: '/api/v1/feedback',
          analytics: '/api/v1/analytics',
          bom: '/api/v1/bom',
          drc: '/api/v1/drc',
          'architecture-analytics': '/api/v1/architecture-analytics',
          health: '/api/v1/health'
        }
      }
    });
  });

  return router;
}