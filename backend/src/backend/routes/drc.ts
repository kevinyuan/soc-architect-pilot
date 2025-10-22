// DRC API Routes
import express, { Request, Response } from 'express';
import { drcChecker, DRCResult } from '../services/drc-checker';
import { ComponentLibraryManager } from '../services/component-library-manager';
import { s3Storage } from '../../utils/s3-storage';
import { dynamoDBService } from '../../utils/dynamodb-service';

const router = express.Router();
const componentLibrary = new ComponentLibraryManager();

// Run DRC check on architecture diagram
router.post('/check', async (req: Request, res: Response) => {
  try {
    const { diagram, projectId, options } = req.body;

    if (!diagram || !diagram.nodes || !diagram.edges) {
      return res.status(400).json({
        success: false,
        error: 'Invalid diagram format. Must include nodes and edges arrays.',
      });
    }

    // STEP 1: Delete old DRC results FIRST (before running check)
    if (projectId) {
      try {
        const project = await dynamoDBService.getProject(projectId);
        if (project) {
          try {
            await s3Storage.deleteFile(project.userId, projectId, 'drc_results.json');
            console.log('[DRC] ✅ Deleted old drc_results.json');
          } catch (deleteError) {
            console.log('[DRC] No old drc_results.json to delete (this is fine)');
          }
        }
      } catch (projectError) {
        console.error('[DRC] Failed to get project for deletion:', projectError);
      }
    }

    // STEP 2: Load component library for interface information (already in memory, fast access)
    await componentLibrary.ensureInitialized();
    const fullComponents = componentLibrary.getAllComponents();

    // STEP 3: Run DRC checks with options (this generates fresh results)
    console.log('[DRC] 🔄 Running DRC checks...');
    const result: DRCResult = await drcChecker.checkDiagram(diagram, fullComponents, options);
    console.log('[DRC] ✅ DRC checks complete');

    // STEP 4: Save NEW results to workspace
    if (projectId) {
      try {
        const project = await dynamoDBService.getProject(projectId);
        if (project) {
          await s3Storage.uploadFile(
            project.userId,
            projectId,
            'drc_results.json',
            JSON.stringify(result, null, 2),
            'application/json'
          );
          console.log('[DRC] ✅ Saved new drc_results.json to S3');
        }
      } catch (saveError) {
        console.error('[DRC] Failed to save DRC results:', saveError);
        // Continue even if save fails - we still return the result
      }
    }

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('DRC check error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to run DRC check',
    });
  }
});

// Get saved DRC results
router.get('/results/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    // Get project to retrieve userId
    const project = await dynamoDBService.getProject(projectId);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    // Download DRC results from S3
    const resultsContent = await s3Storage.downloadFile(
      project.userId,
      projectId,
      'drc_results.json'
    );

    if (resultsContent === null) {
      return res.status(404).json({
        success: false,
        error: 'No DRC results found for this project',
      });
    }

    const results = JSON.parse(resultsContent);

    return res.json({
      success: true,
      data: results,
    });
  } catch (error: any) {
    if (error.message?.includes('not found') || error.message?.includes('Project not found')) {
      return res.status(404).json({
        success: false,
        error: 'No DRC results found for this project',
      });
    }

    console.error('Failed to get DRC results:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve DRC results',
    });
  }
});

// Get DRC rules documentation
router.get('/rules', async (req: Request, res: Response) => {
  try {
    const rules = [
      {
        category: 'Connectivity',
        rules: [
          { id: 'DRC-CONN-001', name: 'Master-Slave Role Matching', severity: 'critical' },
          { id: 'DRC-CONN-002', name: 'Bus Type Matching', severity: 'critical' },
          { id: 'DRC-CONN-003', name: 'Interface and Instance Existence', severity: 'critical' },
          { id: 'DRC-CONN-004', name: 'Unconnected Master Interface', severity: 'warning' },
          { id: 'DRC-CONN-005', name: 'Multiple Masters to One Slave', severity: 'critical' },
          { id: 'DRC-CONN-006', name: 'Unconnected Slave Interface', severity: 'info' },
          { id: 'DRC-CONN-007', name: 'Signal Direction Compatibility', severity: 'critical' },
        ],
      },
      {
        category: 'AXI4 Parameters',
        rules: [
          { id: 'DRC-AXI-PARAM-001', name: 'Data Width Matching', severity: 'critical' },
          { id: 'DRC-AXI-PARAM-002', name: 'ID Width Compatibility', severity: 'critical' },
          { id: 'DRC-AXI-PARAM-003', name: 'Address Width Consistency', severity: 'warning' },
          { id: 'DRC-AXI-PARAM-004', name: 'Clock Frequency Compatibility', severity: 'warning' },
        ],
      },
      {
        category: 'Address Space',
        rules: [
          { id: 'DRC-ADDR-001', name: 'Address Space Overlap', severity: 'critical' },
          { id: 'DRC-ADDR-002', name: 'Address Alignment', severity: 'warning' },
          { id: 'DRC-ADDR-003', name: 'Address Space Coverage', severity: 'warning' },
          { id: 'DRC-ADDR-004', name: 'Reserved Address Space', severity: 'info' },
        ],
      },
      {
        category: 'Topology',
        rules: [
          { id: 'DRC-TOPO-001', name: 'Circular Dependency', severity: 'critical' },
          { id: 'DRC-TOPO-002', name: 'Isolated Components', severity: 'warning' },
          { id: 'DRC-TOPO-003', name: 'Interconnect Fanout', severity: 'warning' },
        ],
      },
      {
        category: 'Performance',
        rules: [
          { id: 'DRC-PERF-001', name: 'Bandwidth Bottleneck', severity: 'warning' },
          { id: 'DRC-PERF-002', name: 'Clock Domain Crossing', severity: 'warning' },
          { id: 'DRC-PERF-003', name: 'Long Connection Path', severity: 'info' },
        ],
      },
      {
        category: 'Parameter Validity',
        rules: [
          { id: 'DRC-PARAM-VALID-001', name: 'Required Parameters', severity: 'critical' },
          { id: 'DRC-PARAM-VALID-002', name: 'Parameter Type Check', severity: 'warning' },
          { id: 'DRC-PARAM-VALID-003', name: 'Parameter Range Check', severity: 'warning' },
        ],
      },
      {
        category: 'Naming Convention',
        rules: [
          { id: 'DRC-NAME-001', name: 'Unique Component Names', severity: 'warning' },
          { id: 'DRC-NAME-002', name: 'Interface Naming Convention', severity: 'info' },
        ],
      },
    ];

    return res.json({
      success: true,
      data: rules,
    });
  } catch (error: any) {
    console.error('Failed to get DRC rules:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve DRC rules',
    });
  }
});

export default router;
