/**
 * Component Library API Routes
 *
 * Endpoints for managing shared component library
 * Now using local file-based storage with in-memory caching
 */

import express from 'express';
import { ComponentGenerator, ComponentGenerationRequest } from '../services/component-generator';
import { ComponentLibraryManager } from '../services/component-library-manager';
import { ComponentLibraryS3Manager } from '../services/component-library-s3';

const router = express.Router();
const componentGenerator = new ComponentGenerator();
const componentLibrary = new ComponentLibraryManager(); // For shared library (file-based)
const componentLibraryS3 = new ComponentLibraryS3Manager(); // For user components (S3-based)

/**
 * GET /api/v1/components
 * List all components in the library (from memory)
 */
router.get('/', async (req, res) => {
  try {
    const { category, search } = req.query;

    let components = componentLibrary.getAllComponents();

    // Filter by category if provided
    if (category) {
      components = components.filter(c => c.category === category);
    }

    // Search by name/tags if provided
    if (search && typeof search === 'string') {
      const searchLower = search.toLowerCase();
      components = components.filter(c =>
        c.name.toLowerCase().includes(searchLower) ||
        c.tags?.some((tag: string) => tag.toLowerCase().includes(searchLower))
      );
    }

    res.json({
      success: true,
      count: components.length,
      components,
    });
  } catch (error) {
    console.error('Error listing components:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list components',
    });
  }
});

/**
 * GET /api/v1/components/:id
 * Get full component details by ID (from memory)
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const component = componentLibrary.getComponentById(id);

    if (!component) {
      return res.status(404).json({
        success: false,
        error: 'Component not found',
      });
    }

    res.json({
      success: true,
      component,
    });
  } catch (error) {
    console.error('Error getting component:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get component',
    });
  }
});

/**
 * POST /api/v1/components/generate
 * Generate a new component from AI specification
 */
router.post('/generate', async (req, res) => {
  try {
    const request: ComponentGenerationRequest = req.body;

    // Add user ID if authenticated
    if (req.user) {
      request.createdBy = (req.user as any).id;
    }

    const result = await componentGenerator.generateAndPersist(request);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      component: result.component,
      componentId: result.componentId,
      message: 'Component generated and added to library',
    });
  } catch (error) {
    console.error('Error generating component:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate component',
    });
  }
});

/**
 * POST /api/v1/components/generate-batch
 * Generate multiple components in batch
 */
router.post('/generate-batch', async (req, res) => {
  try {
    const requests: ComponentGenerationRequest[] = req.body.components;

    if (!Array.isArray(requests) || requests.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: components array required',
      });
    }

    // Add user ID if authenticated
    if (req.user) {
      requests.forEach(r => r.createdBy = (req.user as any).id);
    }

    const results = await componentGenerator.generateBatch(requests);

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    res.json({
      success: true,
      total: results.length,
      successCount,
      failureCount,
      results,
    });
  } catch (error) {
    console.error('Error generating components batch:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate components',
    });
  }
});

/**
 * GET /api/v1/components/search
 * Search components by keywords
 */
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Search query required',
      });
    }

    const searchTerms = q.split(' ').filter(t => t.length > 0);
    const matches = await componentLibrary.searchComponents(searchTerms);

    res.json({
      success: true,
      count: matches.length,
      matches,
    });
  } catch (error) {
    console.error('Error searching components:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search components',
    });
  }
});

/**
 * GET /api/v1/components/category/:category
 * Get components by category
 */
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;

    const components = await componentLibrary.getComponentsByCategory(category as any);

    res.json({
      success: true,
      category,
      count: components.length,
      components,
    });
  } catch (error) {
    console.error('Error getting components by category:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get components',
    });
  }
});

/**
 * GET /api/v1/components/pending/audit
 * Get components pending admin review (admin only)
 */
router.get('/pending/audit', async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user?.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const allComponents = await componentLibraryS3.getAllComponentsIndex();
    
    // Filter for pending components
    const pendingComponents = allComponents.filter((c: any) => 
      c.status === 'needs_review' || c.tier === 'pending'
    );

    // Sort by quality score (lowest first - needs most attention)
    pendingComponents.sort((a: any, b: any) => (a.qualityScore || 0) - (b.qualityScore || 0));

    res.json({
      success: true,
      count: pendingComponents.length,
      components: pendingComponents,
    });
  } catch (error) {
    console.error('Error getting pending components:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get pending components',
    });
  }
});

/**
 * POST /api/v1/components/:id/approve
 * Approve a component (admin only)
 */
router.post('/:id/approve', async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user?.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const { id } = req.params;
    const { notes } = req.body;
    const adminId = req.user.userId || req.user.email;

    console.log(`[ADMIN] Approving component ${id} by ${adminId}`);

    // Update component status to approved (user component in S3)
    await componentLibraryS3.updateComponentStatus(id, {
      status: 'approved',
      tier: 'community',
      visibility: 'public',
      reviewedBy: adminId,
      reviewedAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'Component approved and added to shared library',
      componentId: id,
    });
  } catch (error) {
    console.error('Error approving component:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve component',
    });
  }
});

/**
 * POST /api/v1/components/:id/reject
 * Reject a component (admin only)
 */
router.post('/:id/reject', async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user?.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user.userId || req.user.email;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Rejection reason is required',
      });
    }

    console.log(`[ADMIN] Rejecting component ${id} by ${adminId}: ${reason}`);

    // Update component status to rejected and hide it (user component in S3)
    await componentLibraryS3.updateComponentStatus(id, {
      status: 'rejected',
      visibility: 'hidden',
      reviewedBy: adminId,
      reviewedAt: new Date().toISOString(),
      rejectionReason: reason,
    });

    res.json({
      success: true,
      message: 'Component rejected',
      componentId: id,
    });
  } catch (error) {
    console.error('Error rejecting component:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reject component',
    });
  }
});

export default router;
