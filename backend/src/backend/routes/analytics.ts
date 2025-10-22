import { Router } from 'express';
import { performanceMonitor } from '../services/performance-monitor';
import { APIResponse } from '../../types/index';

const router = Router();

// Get performance dashboard
router.get('/dashboard', (req, res) => {
  try {
    const { timeRange = 'hour' } = req.query;
    
    const dashboard = performanceMonitor.getDashboard(
      timeRange as 'hour' | 'day' | 'week'
    );

    const response: APIResponse = {
      success: true,
      data: dashboard,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    res.json(response);

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DASHBOARD_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get dashboard data'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Record performance metric
router.post('/metrics', (req, res) => {
  try {
    const { name, category, value, unit, sessionId, metadata } = req.body;

    if (!name || !category || value === undefined || !unit) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'name, category, value, and unit are required'
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      });
    }

    const metricId = performanceMonitor.recordMetric(
      name,
      category,
      value,
      unit,
      sessionId,
      metadata
    );

    const response: APIResponse = {
      success: true,
      data: { metricId },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    res.json(response);

  } catch (error) {
    console.error('Record metric error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'METRIC_ERROR',
        message: error instanceof Error ? error.message : 'Failed to record metric'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Start user session
router.post('/session/start', (req, res) => {
  try {
    const { sessionId, userId, userAgent } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_SESSION_ID',
          message: 'sessionId is required'
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      });
    }

    performanceMonitor.startUserSession(sessionId, userId, userAgent);

    const response: APIResponse = {
      success: true,
      data: { sessionId, started: true },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    res.json(response);

  } catch (error) {
    console.error('Start session error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SESSION_START_ERROR',
        message: error instanceof Error ? error.message : 'Failed to start session'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Update user session
router.post('/session/:sessionId/update', (req, res) => {
  try {
    const { sessionId } = req.params;
    const updates = req.body;

    performanceMonitor.updateUserSession(sessionId, updates);

    const response: APIResponse = {
      success: true,
      data: { sessionId, updated: true },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    res.json(response);

  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SESSION_UPDATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to update session'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// End user session
router.post('/session/:sessionId/end', (req, res) => {
  try {
    const { sessionId } = req.params;

    const sessionData = performanceMonitor.endUserSession(sessionId);

    const response: APIResponse = {
      success: true,
      data: { sessionId, sessionData },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    res.json(response);

  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SESSION_END_ERROR',
        message: error instanceof Error ? error.message : 'Failed to end session'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Get user analytics
router.get('/session/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    const analytics = performanceMonitor.getUserAnalytics(sessionId);

    if (!analytics) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session analytics not found'
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      });
    }

    const response: APIResponse = {
      success: true,
      data: analytics,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    res.json(response);

  } catch (error) {
    console.error('Get session analytics error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SESSION_ANALYTICS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get session analytics'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Get all user analytics
router.get('/sessions', (req, res) => {
  try {
    const analytics = performanceMonitor.getAllUserAnalytics();

    const response: APIResponse = {
      success: true,
      data: { sessions: analytics, total: analytics.length },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    res.json(response);

  } catch (error) {
    console.error('Get all analytics error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ALL_ANALYTICS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get all analytics'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Get performance alerts
router.get('/alerts', (req, res) => {
  try {
    const alerts = performanceMonitor.getActiveAlerts();

    const response: APIResponse = {
      success: true,
      data: { alerts, count: alerts.length },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    res.json(response);

  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ALERTS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get alerts'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Resolve performance alert
router.post('/alerts/:alertId/resolve', (req, res) => {
  try {
    const { alertId } = req.params;

    const resolved = performanceMonitor.resolveAlert(alertId);

    if (!resolved) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ALERT_NOT_FOUND',
          message: 'Alert not found'
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      });
    }

    const response: APIResponse = {
      success: true,
      data: { alertId, resolved: true },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    res.json(response);

  } catch (error) {
    console.error('Resolve alert error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'RESOLVE_ALERT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to resolve alert'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Cleanup old data
router.post('/cleanup', (req, res) => {
  try {
    const { olderThanDays = 7 } = req.body;

    performanceMonitor.cleanup(olderThanDays);

    const response: APIResponse = {
      success: true,
      data: { cleaned: true, olderThanDays },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    res.json(response);

  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CLEANUP_ERROR',
        message: error instanceof Error ? error.message : 'Failed to cleanup data'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

export default router;