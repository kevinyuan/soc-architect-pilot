import { Router } from 'express';
import { feedbackAnalyticsService, FeedbackType, FeedbackRating, ActionType } from '../services/feedback-analytics-service';
import { APIResponse } from '../../types/index';

const router = Router();

// Record user feedback
router.post('/', async (req, res) => {
  try {
    const {
      sessionId,
      componentId,
      suggestionId,
      feedbackType,
      rating,
      comment,
      context,
      userId
    } = req.body;

    if (!sessionId || !feedbackType || !rating) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'sessionId, feedbackType, and rating are required'
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      });
    }

    const feedbackId = await feedbackAnalyticsService.recordFeedback({
      sessionId,
      componentId,
      suggestionId,
      feedbackType,
      rating,
      comment,
      context: context || {},
      userId
    });

    const response: APIResponse = {
      success: true,
      data: { feedbackId },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    res.json(response);

  } catch (error) {
    console.error('Record feedback error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FEEDBACK_ERROR',
        message: error instanceof Error ? error.message : 'Failed to record feedback'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Record user action
router.post('/action', async (req, res) => {
  try {
    const {
      sessionId,
      actionType,
      componentId,
      suggestionId,
      actionData,
      userId
    } = req.body;

    if (!sessionId || !actionType) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'sessionId and actionType are required'
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      });
    }

    const actionId = await feedbackAnalyticsService.recordAction({
      sessionId,
      actionType,
      componentId,
      suggestionId,
      actionData: actionData || {},
      userId
    });

    const response: APIResponse = {
      success: true,
      data: { actionId },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    res.json(response);

  } catch (error) {
    console.error('Record action error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ACTION_ERROR',
        message: error instanceof Error ? error.message : 'Failed to record action'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Get suggestion rationale and alternatives
router.get('/suggestion/:suggestionId/rationale', (req, res) => {
  try {
    const { suggestionId } = req.params;
    
    const rationale = feedbackAnalyticsService.getSuggestionRationale(suggestionId);
    
    if (!rationale) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RATIONALE_NOT_FOUND',
          message: 'Suggestion rationale not found'
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      });
    }

    const response: APIResponse = {
      success: true,
      data: rationale,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    res.json(response);

  } catch (error) {
    console.error('Get rationale error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'RATIONALE_ERROR',
        message: 'Failed to get suggestion rationale'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Generate component alternatives
router.post('/alternatives', async (req, res) => {
  try {
    const { primaryComponent, availableComponents, userRequirements } = req.body;

    if (!primaryComponent || !availableComponents) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'primaryComponent and availableComponents are required'
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      });
    }

    const alternatives = feedbackAnalyticsService.generateAlternatives(
      primaryComponent,
      availableComponents,
      userRequirements || []
    );

    const response: APIResponse = {
      success: true,
      data: { alternatives },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    res.json(response);

  } catch (error) {
    console.error('Generate alternatives error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ALTERNATIVES_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate alternatives'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Get quality metrics
router.get('/metrics', async (req, res) => {
  try {
    const { period = 'week', startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    const metrics = await feedbackAnalyticsService.getQualityMetrics(
      period as 'day' | 'week' | 'month',
      start,
      end
    );

    const response: APIResponse = {
      success: true,
      data: metrics,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    res.json(response);

  } catch (error) {
    console.error('Get metrics error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'METRICS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get quality metrics'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Get quality alerts
router.get('/alerts', async (req, res) => {
  try {
    const alerts = await feedbackAnalyticsService.getQualityAlerts();

    const response: APIResponse = {
      success: true,
      data: { alerts },
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
        message: error instanceof Error ? error.message : 'Failed to get quality alerts'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Get session feedback summary
router.get('/session/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const sessionFeedback = feedbackAnalyticsService.getSessionFeedback(sessionId);

    const response: APIResponse = {
      success: true,
      data: sessionFeedback,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    res.json(response);

  } catch (error) {
    console.error('Get session feedback error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SESSION_FEEDBACK_ERROR',
        message: 'Failed to get session feedback'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Get feedback types and ratings (for UI)
router.get('/types', (req, res) => {
  try {
    const response: APIResponse = {
      success: true,
      data: {
        feedbackTypes: Object.values(FeedbackType),
        feedbackRatings: Object.values(FeedbackRating),
        actionTypes: Object.values(ActionType)
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    res.json(response);

  } catch (error) {
    console.error('Get types error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'TYPES_ERROR',
        message: 'Failed to get feedback types'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

export default router;