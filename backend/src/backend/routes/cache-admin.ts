/**
 * Cache Administration API
 *
 * Provides endpoints for monitoring and managing S3 caches
 */

import express, { Request, Response } from 'express';
import { cacheManager } from '../services/s3-cache.service';

const router = express.Router();

/**
 * GET /api/cache/stats - Get cache statistics
 */
router.get('/stats', (req: Request, res: Response) => {
  try {
    const stats = cacheManager.getAllStats();

    res.json({
      success: true,
      data: {
        caches: stats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('Error getting cache stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/cache/clear - Clear all caches
 */
router.post('/clear', (req: Request, res: Response) => {
  try {
    cacheManager.clearAll();

    res.json({
      success: true,
      message: 'All caches cleared successfully'
    });
  } catch (error: any) {
    console.error('Error clearing caches:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/cache/clear/:namespace - Clear specific cache
 */
router.post('/clear/:namespace', (req: Request, res: Response) => {
  try {
    const { namespace } = req.params;
    cacheManager.clearCache(namespace);

    res.json({
      success: true,
      message: `Cache '${namespace}' cleared successfully`
    });
  } catch (error: any) {
    console.error(`Error clearing cache ${req.params.namespace}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/cache/cleanup - Trigger cleanup of expired entries
 */
router.post('/cleanup', (req: Request, res: Response) => {
  try {
    cacheManager.cleanupAll();

    res.json({
      success: true,
      message: 'Cache cleanup completed'
    });
  } catch (error: any) {
    console.error('Error during cache cleanup:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
