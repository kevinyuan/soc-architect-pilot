import { Router } from 'express';
import { flowAnalyzer } from '../services/flow-analyzer';
import { performanceAnalyzer } from '../services/performance-analyzer';
import { contentionAnalyzer } from '../services/contention-analyzer';
import { APIResponse } from '../../types/index';

const router = Router();

/**
 * Analyze complete architecture diagram
 * POST /api/architecture-analytics/analyze
 */
router.post('/analyze', async (req, res) => {
  try {
    const { diagram, componentLibrary, config, projectId } = req.body;

    if (!diagram || !diagram.nodes || !diagram.edges) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DIAGRAM',
          message: 'diagram with nodes and edges is required'
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      });
    }

    // STEP 0: Delete old analytics.json FIRST (before running analysis)
    if (projectId) {
      try {
        const { dynamoDBService } = await import('../../utils/dynamodb-service');
        const { s3Storage } = await import('../../utils/s3-storage');
        const project = await dynamoDBService.getProject(projectId);
        if (project) {
          try {
            await s3Storage.deleteFile(project.userId, projectId, 'analytics.json');
            console.log('[Analytics] ✅ Deleted old analytics.json');
          } catch (deleteError) {
            console.log('[Analytics] No old analytics.json to delete (this is fine)');
          }
        }
      } catch (projectError) {
        console.error('[Analytics] Failed to get project for deletion:', projectError);
      }
    }

    // Load component library if provided
    if (componentLibrary) {
      flowAnalyzer.loadComponentLibrary(componentLibrary);
      performanceAnalyzer.loadComponentLibrary(componentLibrary);
    }

    // Set global clock frequency if provided
    if (config?.globalClockFrequency) {
      performanceAnalyzer.setGlobalClockFrequency(config.globalClockFrequency);
    }

    // Step 1: Discover data flows
    console.log('[Analytics] 🔄 Starting analytics...');
    const allFlows = flowAnalyzer.discoverDataFlows(diagram);
    console.log(`[Analytics] Discovered ${allFlows.length} total flows`);

    // Filter flows based on selectedFlows if provided and assign flow IDs
    let flows = allFlows;
    if (config?.selectedFlows && Array.isArray(config.selectedFlows)) {
      console.log(`[Analytics] Selected flows from frontend:`, config.selectedFlows);
      
      // Map selected flows by source->target for matching
      const selectedFlowMap = new Map<string, any>(
        config.selectedFlows.map((f: any) => [`${f.sourceId}->${f.targetId}`, f])
      );
      console.log(`[Analytics] Selected flow map:`, Array.from(selectedFlowMap.entries()).map(([k, v]: [string, any]) => `${k} -> flowId ${v.flowId}`));
      
      // Log all discovered flows for debugging
      console.log(`[Analytics] All discovered flows:`, allFlows.map(f => `${f.source.id}->${f.sink.id}`));
      
      // Match discovered flows with selected flows, or discover specific paths
      const matchedFlows: any[] = [];
      const unmatchedSelections: any[] = [];
      
      for (const [key, selectedFlow] of selectedFlowMap.entries() as IterableIterator<[string, any]>) {
        const discoveredFlow = allFlows.find(f => `${f.source.id}->${f.sink.id}` === key);
        
        if (discoveredFlow) {
          console.log(`[Analytics] ✅ Matched discovered flow: ${key} -> flowId ${selectedFlow.flowId}`);
          matchedFlows.push({ ...discoveredFlow, id: selectedFlow.flowId });
        } else {
          console.log(`[Analytics] ⚠️  No auto-discovered flow for: ${key} - discovering specific path...`);
          
          // Try to discover a specific path between the selected nodes
          const specificFlow = flowAnalyzer.discoverSpecificFlow(
            selectedFlow.sourceId,
            selectedFlow.targetId,
            selectedFlow.flowId,
            diagram,
            selectedFlow.sourcePort,
            selectedFlow.targetPort
          );
          
          if (specificFlow) {
            console.log(`[Analytics] ✅ Discovered specific flow: ${key} -> flowId ${selectedFlow.flowId} (${specificFlow.path.length} hops)`);
            matchedFlows.push(specificFlow);
          } else {
            console.log(`[Analytics] ❌ No path found for: ${key} - nodes may not be connected`);
            unmatchedSelections.push(selectedFlow);
          }
        }
      }
      
      flows = matchedFlows;
      
      console.log(`[Analytics] Processed ${config.selectedFlows.length} selections: ${matchedFlows.length} flows (${matchedFlows.length - unmatchedSelections.length} discovered + ${unmatchedSelections.length} synthetic)`);
      console.log(`[Analytics] Final flows with IDs:`, flows.map(f => `${f.source.id}->${f.sink.id} (flowId: ${f.id})`));
    }

    // Step 2: Analyze performance for each flow
    const performanceMetrics = performanceAnalyzer.analyzeAllFlows(flows, diagram);
    console.log(`[Analytics] Generated ${performanceMetrics.length} performance metrics:`, 
      performanceMetrics.map(m => ({ flowId: m.flowId, flowIdType: typeof m.flowId, flowName: m.flowName })));

    // Step 3: Analyze contention
    const contentions = contentionAnalyzer.analyzeContention(flows, performanceMetrics, diagram);

    // Step 4: Generate summary
    const performanceSummary = performanceAnalyzer.getPerformanceSummary(performanceMetrics);
    const contentionSummary = contentionAnalyzer.getContentionSummary(contentions, flows);

    // Group flows by type
    const flowsByType = flowAnalyzer.groupFlowsByType(flows);

    const response: APIResponse = {
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        diagram: {
          nodeCount: diagram.nodes.length,
          edgeCount: diagram.edges.length
        },
        flows: {
          total: flows.length,
          byType: {
            memory_access: flowsByType.memory_access.length,
            peripheral_access: flowsByType.peripheral_access.length,
            dma: flowsByType.dma.length,
            accelerator: flowsByType.accelerator.length,
            p2p: flowsByType.p2p.length,
            unknown: flowsByType.unknown.length
          },
          list: flows
        },
        performance: {
          metrics: performanceMetrics,
          summary: performanceSummary
        },
        contention: {
          analyses: contentions,
          summary: contentionSummary
        },
        recommendations: generateRecommendations(
          flows,
          performanceMetrics,
          contentions,
          contentionSummary
        )
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    // Save NEW analytics to S3 if projectId is provided
    if (projectId) {
      try {
        const { dynamoDBService } = await import('../../utils/dynamodb-service');
        const { s3Storage } = await import('../../utils/s3-storage');
        const project = await dynamoDBService.getProject(projectId);
        if (project) {
          await s3Storage.uploadFile(
            project.userId,
            projectId,
            'analytics.json',
            JSON.stringify(response.data, null, 2),
            'application/json'
          );
          console.log('[Analytics] ✅ Saved new analytics.json to S3');
        }
      } catch (saveError) {
        console.error('[Analytics] Failed to save analytics to S3:', saveError);
        // Don't fail the request if save fails - we still return the result
      }
    }

    res.json(response);
  } catch (error) {
    console.error('Architecture analysis error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ANALYSIS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to analyze architecture'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

/**
 * Get all data flows
 * POST /api/architecture-analytics/flows
 */
router.post('/flows', async (req, res) => {
  try {
    const { diagram, componentLibrary } = req.body;

    if (!diagram || !diagram.nodes || !diagram.edges) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DIAGRAM',
          message: 'diagram with nodes and edges is required'
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      });
    }

    if (componentLibrary) {
      flowAnalyzer.loadComponentLibrary(componentLibrary);
    }

    const flows = flowAnalyzer.discoverDataFlows(diagram);
    const flowsByType = flowAnalyzer.groupFlowsByType(flows);
    const sharedComponents = flowAnalyzer.findSharedComponents(flows);

    const response: APIResponse = {
      success: true,
      data: {
        total: flows.length,
        flows,
        byType: flowsByType,
        sharedComponents: Array.from(sharedComponents.entries()).map(([componentId, flowIds]) => ({
          componentId,
          componentLabel: diagram.nodes.find((n: any) => n.id === componentId)?.data?.label || componentId,
          flowCount: flowIds.length,
          flowIds
        }))
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    res.json(response);
  } catch (error) {
    console.error('Flow discovery error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FLOW_DISCOVERY_ERROR',
        message: error instanceof Error ? error.message : 'Failed to discover flows'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

/**
 * Get performance analysis
 * POST /api/architecture-analytics/performance
 */
router.post('/performance', async (req, res) => {
  try {
    const { diagram, flows, componentLibrary } = req.body;

    if (!diagram || !diagram.nodes || !diagram.edges) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DIAGRAM',
          message: 'diagram with nodes and edges is required'
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      });
    }

    if (componentLibrary) {
      performanceAnalyzer.loadComponentLibrary(componentLibrary);
    }

    // If flows not provided, discover them first
    let dataFlows = flows;
    if (!dataFlows) {
      if (componentLibrary) {
        flowAnalyzer.loadComponentLibrary(componentLibrary);
      }
      dataFlows = flowAnalyzer.discoverDataFlows(diagram);
    }

    const performanceMetrics = performanceAnalyzer.analyzeAllFlows(dataFlows, diagram);
    const summary = performanceAnalyzer.getPerformanceSummary(performanceMetrics);

    const response: APIResponse = {
      success: true,
      data: {
        metrics: performanceMetrics,
        summary
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    res.json(response);
  } catch (error) {
    console.error('Performance analysis error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PERFORMANCE_ANALYSIS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to analyze performance'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

/**
 * Get contention analysis
 * POST /api/architecture-analytics/contention
 */
router.post('/contention', async (req, res) => {
  try {
    const { diagram, flows, performanceMetrics: providedMetrics, componentLibrary } = req.body;

    if (!diagram || !diagram.nodes || !diagram.edges) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DIAGRAM',
          message: 'diagram with nodes and edges is required'
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      });
    }

    if (componentLibrary) {
      flowAnalyzer.loadComponentLibrary(componentLibrary);
      performanceAnalyzer.loadComponentLibrary(componentLibrary);
    }

    // If flows not provided, discover them first
    let dataFlows = flows;
    if (!dataFlows) {
      dataFlows = flowAnalyzer.discoverDataFlows(diagram);
    }

    // If performance metrics not provided, analyze them first
    let performanceMetrics = providedMetrics;
    if (!performanceMetrics) {
      performanceMetrics = performanceAnalyzer.analyzeAllFlows(dataFlows, diagram);
    }

    const contentions = contentionAnalyzer.analyzeContention(dataFlows, performanceMetrics, diagram);
    const summary = contentionAnalyzer.getContentionSummary(contentions, dataFlows);

    const response: APIResponse = {
      success: true,
      data: {
        contentions,
        summary
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    res.json(response);
  } catch (error) {
    console.error('Contention analysis error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CONTENTION_ANALYSIS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to analyze contention'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

/**
 * Get saved analytics for a project
 * GET /api/architecture-analytics/project/:projectId
 */
router.get('/project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { workspaceAWSService } = await import('../../utils/workspace-aws');
    
    const analytics = await workspaceAWSService.loadAnalytics(projectId);
    
    if (!analytics) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ANALYTICS_NOT_FOUND',
          message: 'No analytics found for this project'
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
    console.error('Load analytics error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'LOAD_ANALYTICS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to load analytics'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

/**
 * Generate high-level recommendations
 */
function generateRecommendations(
  flows: any[],
  performanceMetrics: any[],
  contentions: any[],
  contentionSummary: any
): string[] {
  const recommendations: string[] = [];

  // Flow-based recommendations
  if (flows.length === 0) {
    recommendations.push('No data flows detected. Ensure components are properly connected.');
  } else if (flows.length > 20) {
    recommendations.push(
      `High number of data flows (${flows.length}). Consider hierarchical design or flow aggregation.`
    );
  }

  // Performance-based recommendations
  const lowEfficiencyFlows = performanceMetrics.filter(m => m.efficiency < 50);
  if (lowEfficiencyFlows.length > 0) {
    recommendations.push(
      `${lowEfficiencyFlows.length} flow(s) have low efficiency (<50%). Review bottlenecks and optimize.`
    );
  }

  const slowFlows = performanceMetrics.filter(m => m.maxThroughput < 100);
  if (slowFlows.length > 0) {
    recommendations.push(
      `${slowFlows.length} flow(s) have very low throughput (<100 MB/s). Consider upgrading components.`
    );
  }

  // Contention-based recommendations
  if (contentionSummary.criticalContentions > 0) {
    recommendations.push(
      `CRITICAL: ${contentionSummary.criticalContentions} severe bandwidth contention(s) detected. Immediate action required.`
    );
  }

  if (contentionSummary.highContentions > 0) {
    recommendations.push(
      `WARNING: ${contentionSummary.highContentions} high contention(s) detected. Consider load balancing or capacity upgrades.`
    );
  }

  if (contentionSummary.overallContentionScore > 50) {
    recommendations.push(
      'Overall contention score is high. Review shared resources and consider adding redundant paths.'
    );
  }

  // General recommendations
  if (recommendations.length === 0) {
    recommendations.push('Architecture analysis looks good. No major issues detected.');
  }

  return recommendations;
}

export default router;
