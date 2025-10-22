import { Router } from 'express';
import { healthMonitor } from '../services/health-monitor';

const router = Router();

// Get overall system health
router.get('/', async (req, res) => {
  try {
    const health = await healthMonitor.getSystemHealth();
    
    // Always return 200 if the server is responding
    // This allows the frontend to show "connected" even if some services are degraded
    // The actual health status is in the response data
    res.status(200).json({
      success: true,
      data: health
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'HEALTH_CHECK_ERROR',
        message: 'Failed to perform health check'
      }
    });
  }
});

// Get specific service health
router.get('/service/:serviceName', async (req, res) => {
  try {
    const { serviceName } = req.params;
    const { nocache } = req.query;
    
    const health = await healthMonitor.getServiceHealth(serviceName, !nocache);
    
    const statusCode = health.status === 'healthy' ? 200 :
                      health.status === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json({
      success: health.status !== 'unavailable',
      data: health
    });
  } catch (error) {
    console.error('Service health check error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVICE_HEALTH_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
});

// Run comprehensive health check
router.post('/check', async (req, res) => {
  try {
    const health = await healthMonitor.runHealthCheck();
    
    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    console.error('Comprehensive health check error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'COMPREHENSIVE_CHECK_ERROR',
        message: 'Failed to run comprehensive health check'
      }
    });
  }
});

// AWS-specific health checks
router.get('/aws/credentials', async (req, res) => {
  try {
    const health = await healthMonitor.getServiceHealth('aws-credentials', false);
    
    res.json({
      success: health.status === 'healthy',
      data: health
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'AWS_CREDENTIALS_CHECK_ERROR',
        message: 'Failed to check AWS credentials'
      }
    });
  }
});

router.get('/aws/bedrock', async (req, res) => {
  try {
    const health = await healthMonitor.getServiceHealth('bedrock', false);
    
    res.json({
      success: health.status === 'healthy',
      data: health
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'BEDROCK_CHECK_ERROR',
        message: 'Failed to check Bedrock access'
      }
    });
  }
});

export default router;