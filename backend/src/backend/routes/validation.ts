import { Router } from 'express';
import { designValidationService } from '../services/design-validation-service';
import { ConversationalAgent } from '../services/conversational-agent';
import { APIResponse } from '../../types/index';

const conversationalAgent = new ConversationalAgent();

const router = Router();

// Validate design session
router.post('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get session from conversational agent
    const session = await conversationalAgent.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found'
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      });
    }

    const validationResult = await designValidationService.validateSession(session);
    
    const response: APIResponse = {
      success: true,
      data: validationResult,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('Session validation error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error instanceof Error ? error.message : 'Failed to validate design session'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Validate components directly
router.post('/components', async (req, res) => {
  try {
    const { components } = req.body;
    
    if (!components || !Array.isArray(components)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_COMPONENTS',
          message: 'Components array is required'
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      });
    }

    const validationResult = await designValidationService.validateComponents(components);
    
    const response: APIResponse = {
      success: true,
      data: validationResult,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('Component validation error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error instanceof Error ? error.message : 'Failed to validate components'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Validate SoC specification (legacy endpoint)
router.post('/specification', async (req, res) => {
  try {
    const { specification } = req.body;
    
    if (!specification) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_SPECIFICATION',
          message: 'Specification is required'
        }
      });
    }
    
    // Convert specification to components format and validate
    const components = specification.components || [];
    const validationResult = await designValidationService.validateComponents(components);
    
    res.json({
      success: true,
      data: {
        valid: validationResult.criticalIssues.length === 0,
        results: validationResult.summary.results,
        summary: {
          errors: validationResult.criticalIssues.length,
          warnings: validationResult.warnings.length,
          info: validationResult.summary.results.filter(r => r.severity === 'info').length,
          overallScore: validationResult.summary.overallScore,
          qualityGrade: validationResult.qualityGrade
        },
        suggestions: validationResult.suggestions
      }
    });
    
  } catch (error) {
    console.error('Error validating specification:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Failed to validate specification'
      }
    });
  }
});

// Get available validation rules
router.get('/rules', (req, res) => {
  try {
    const rules = designValidationService.getRulesConfiguration();
    const stats = designValidationService.getValidationStatistics();
    
    const response: APIResponse = {
      success: true,
      data: {
        rules,
        statistics: stats,
        categories: Object.keys(stats.rulesByCategory),
        totalRules: stats.totalRules,
        enabledRules: stats.enabledRules
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('Error getting validation rules:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'RULES_ERROR',
        message: 'Failed to get validation rules'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Update validation rule configuration
router.put('/rules/:ruleId', (req, res) => {
  try {
    const { ruleId } = req.params;
    const { enabled, priority, severity } = req.body;
    
    const success = designValidationService.updateRuleConfiguration(ruleId, {
      enabled,
      priority,
      severity
    });
    
    if (!success) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RULE_NOT_FOUND',
          message: 'Validation rule not found'
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      });
    }
    
    const response: APIResponse = {
      success: true,
      data: {
        ruleId,
        enabled,
        priority,
        severity,
        updatedAt: new Date().toISOString()
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('Error updating validation rule:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'RULE_UPDATE_ERROR',
        message: 'Failed to update validation rule'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Validate RAG output quality
router.post('/rag-output', async (req, res) => {
  try {
    const { suggestedComponents, availableComponents } = req.body;
    
    if (!suggestedComponents || !availableComponents) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'suggestedComponents and availableComponents are required'
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      });
    }

    const validationResult = await designValidationService.validateRAGOutput(
      suggestedComponents,
      availableComponents
    );
    
    const response: APIResponse = {
      success: true,
      data: validationResult,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('RAG validation error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'RAG_VALIDATION_ERROR',
        message: error instanceof Error ? error.message : 'Failed to validate RAG output'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Generate validation report for chat
router.post('/chat-report', async (req, res) => {
  try {
    const { sessionId, components } = req.body;
    
    let validationResult;

    if (sessionId) {
      const session = await conversationalAgent.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'SESSION_NOT_FOUND',
            message: 'Session not found'
          },
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        });
      }
      validationResult = await designValidationService.validateSession(session);
    } else if (components) {
      validationResult = await designValidationService.validateComponents(components);
    } else {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'Either sessionId or components is required'
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      });
    }
    
    const chatReport = designValidationService.generateChatReport(validationResult);
    
    const response: APIResponse = {
      success: true,
      data: {
        report: chatReport,
        validationResult
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('Chat report error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CHAT_REPORT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate chat report'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Get validation statistics
router.get('/statistics', (req, res) => {
  try {
    const stats = designValidationService.getValidationStatistics();
    
    const response: APIResponse = {
      success: true,
      data: stats,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('Get statistics error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_STATISTICS_ERROR',
        message: 'Failed to get validation statistics'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

export default router;