import express, { Request, Response } from 'express';
import { TemplateLibraryManager } from '../services/template-library-manager';
import { ComponentLibraryManager } from '../services/component-library-manager';

const router = express.Router();
const templateLibrary = new TemplateLibraryManager();
const componentLibrary = new ComponentLibraryManager();

// GET /api/templates - List all templates
router.get('/', async (req: Request, res: Response) => {
  try {
    await templateLibrary.ensureInitialized();
    const templates = templateLibrary.getTemplateList();

    console.log(`[Templates] Listed ${templates.length} templates from file system`);

    res.json({ success: true, data: templates });
  } catch (error: any) {
    console.error('Error listing templates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/templates/:id - Get specific template
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await templateLibrary.ensureInitialized();
    const template = templateLibrary.getTemplateById(id);

    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    console.log(`[Templates] Retrieved template: ${id}`);

    res.json({ success: true, data: template });
  } catch (error: any) {
    console.error('Error getting template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/templates/:id/instantiate - Create project from template
router.post('/:id/instantiate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { projectName, projectDescription } = req.body;

    await templateLibrary.ensureInitialized();
    const template = templateLibrary.getTemplateById(id);

    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    // Enrich nodes with component data from component library
    console.log(`[Template Instantiate] Enriching ${template.diagram.nodes.length} nodes`);

    await componentLibrary.ensureInitialized();

    const enrichedNodes = await Promise.all(
      template.diagram.nodes.map(async (node: any, index: number) => {
        console.log(`[Template Instantiate] Processing node ${index}: ${node.id}, componentId: ${node.data?.componentId}`);
        if (node.data?.componentId) {
          try {
            const component = componentLibrary.getComponentById(node.data.componentId);
            console.log(`[Template Instantiate] Component ${node.data.componentId} loaded:`, component ? 'SUCCESS' : 'NULL');
            if (component) {
              console.log(`[Template Instantiate] Component has ${component.interfaces?.length || 0} interfaces`);
              const enrichedNode = {
                ...node,
                data: {
                  ...node.data,
                  interfaces: component.interfaces,
                  properties: component.properties,
                  visualization: component.visualization
                },
                width: component.visualization?.width || node.width,
                height: component.visualization?.height || node.height
              };
              console.log(`[Template Instantiate] Enriched node ${node.id} with ${enrichedNode.data.interfaces?.length || 0} interfaces`);
              return enrichedNode;
            } else {
              console.warn(`[Template Instantiate] Component ${node.data.componentId} not found`);
            }
          } catch (error) {
            console.error(`[Template Instantiate] Failed to load component ${node.data.componentId}:`, error);
            return node;
          }
        }
        return node;
      })
    );

    console.log(`[Template Instantiate] Enrichment complete. Enriched nodes:`, enrichedNodes.map(n => ({id: n.id, hasInterfaces: !!n.data.interfaces})));

    const enrichedDiagram = {
      nodes: enrichedNodes,
      edges: template.diagram.edges
    };

    res.json({
      success: true,
      data: {
        template: {
          id: template.id,
          name: template.name,
          description: template.description,
          category: template.category
        },
        diagram: enrichedDiagram
      }
    });
  } catch (error: any) {
    console.error('Error instantiating template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/templates/create - Create new template (Admin only)
// NOTE: This would require writing to file system and is not recommended
// Design examples should be added via Git commits to data/design_examples/
router.post('/create', async (req: Request, res: Response) => {
  return res.status(501).json({
    success: false,
    error: 'Template creation via API is disabled. Design examples are now file-based and should be added via Git commits to data/design_examples/'
  });
});

export default router;
