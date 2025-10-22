/**
 * BOM (Bill of Materials) API Routes
 */

import { Router, Request, Response } from 'express';
import { BOMGenerator } from '../services/bom-generator';
import { workspaceAWSService } from '../../utils/workspace-aws';
import { s3Storage } from '../../utils/s3-storage';
import { dynamoDBService } from '../../utils/dynamodb-service';
import { APIResponse } from '../../types';

const router = Router();
const bomGenerator = new BOMGenerator();

/**
 * GET /bom/:projectId
 * Generate BOM report for a project
 */
router.get('/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    console.log(`📋 Generating BOM for project: ${projectId}`);

    // Get project details
    const project = await dynamoDBService.getProject(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found',
        },
      } as APIResponse);
    }

    // Get architecture diagram to extract components
    let components: any[] = [];

    try {
      const diagramContent = await s3Storage.downloadFile(
        project.userId,
        projectId,
        'arch_diagram.json'
      );

      if (diagramContent) {
        const diagram = typeof diagramContent === 'string' ? JSON.parse(diagramContent) : diagramContent;

        // Extract components from ReactFlow nodes
        if (diagram.nodes && Array.isArray(diagram.nodes)) {
          components = diagram.nodes.map((node: any) => ({
            id: node.id,
            name: node.data?.label || node.data?.name || node.id,
            type: node.type || node.data?.type || 'Unknown',
            description: node.data?.description,
            ...node.data,
          }));
        }
      }
    } catch (error) {
      console.warn('Could not load architecture diagram, using empty component list:', error);
    }

    if (components.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_COMPONENTS',
          message: 'No components found in project architecture',
        },
      } as APIResponse);
    }

    // Generate BOM report
    const bomReport = await bomGenerator.generateBOM(
      projectId,
      project.name,
      components
    );

    // Save BOM report to S3
    try {
      await s3Storage.uploadFile(
        project.userId,
        projectId,
        'bom.json',
        JSON.stringify(bomReport, null, 2)
      );
      console.log(`✅ BOM report saved to S3: ${projectId}/bom.json`);
    } catch (error) {
      console.error('Failed to save BOM to S3:', error);
      // Continue even if S3 save fails - user still gets the BOM report
    }

    const response: APIResponse = {
      success: true,
      data: bomReport,
      timestamp: new Date(),
      requestId: `bom-${Date.now()}`,
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error generating BOM:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'BOM_GENERATION_ERROR',
        message: error.message || 'Failed to generate BOM report',
      },
    } as APIResponse);
  }
});

/**
 * POST /bom/custom
 * Generate BOM from custom component list
 */
router.post('/custom', async (req: Request, res: Response) => {
  try {
    const { projectId, projectName, components } = req.body;

    if (!components || !Array.isArray(components) || components.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Components array is required',
        },
      } as APIResponse);
    }

    // Generate BOM report
    const bomReport = await bomGenerator.generateBOM(
      projectId || 'custom',
      projectName || 'Custom Project',
      components
    );

    const response: APIResponse = {
      success: true,
      data: bomReport,
      timestamp: new Date(),
      requestId: `bom-custom-${Date.now()}`,
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error generating custom BOM:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'BOM_GENERATION_ERROR',
        message: error.message || 'Failed to generate BOM report',
      },
    } as APIResponse);
  }
});

export default router;
