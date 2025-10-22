import { Router } from 'express';
import { validateReactFlowData } from '../../utils/validation';

const router = Router();

// Generate diagram from specification
router.post('/generate', (req, res) => {
  try {
    const { specification, components, layout = 'hierarchical' } = req.body;
    
    if (!specification || !components) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'specification and components are required'
        }
      });
    }
    
    // Simple diagram generation (will be enhanced with proper algorithms)
    const nodes = components.map((component: any, index: number) => ({
      id: component.id,
      type: 'default',
      position: {
        x: 100 + (index % 3) * 200,
        y: 100 + Math.floor(index / 3) * 150
      },
      data: {
        component,
        label: component.name,
        type: component.category,
        properties: component.properties,
        validationStatus: 'valid'
      },
      style: {
        background: getComponentColor(component.category),
        border: `2px solid ${getComponentBorderColor(component.category)}`,
        borderRadius: '8px',
        padding: '10px',
        fontSize: '12px',
        fontWeight: 'bold'
      }
    }));
    
    // Generate simple connections (will be enhanced with proper logic)
    const edges = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({
        id: `e${i}-${i + 1}`,
        source: nodes[i].id,
        target: nodes[i + 1].id,
        data: {
          sourceInterface: 'output',
          targetInterface: 'input',
          connectionType: 'AXI4',
          validationStatus: 'valid'
        },
        style: { stroke: '#2196f3', strokeWidth: 2 }
      });
    }
    
    const diagramData = {
      nodes,
      edges,
      layout: {
        algorithm: layout,
        direction: 'TB',
        spacing: {
          nodeSpacing: 100,
          rankSpacing: 150
        },
        viewport: {
          x: 0,
          y: 0,
          zoom: 1.0
        }
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        version: '1.0.0',
        source: 'conversation'
      }
    };
    
    // Validate generated diagram
    const validation = validateReactFlowData(diagramData);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DIAGRAM',
          message: 'Generated diagram is invalid',
          details: validation.errors
        }
      });
    }
    
    res.json({
      success: true,
      data: diagramData
    });
    
  } catch (error) {
    console.error('Error generating diagram:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DIAGRAM_GENERATION_ERROR',
        message: 'Failed to generate diagram'
      }
    });
  }
});

// Auto-layout existing diagram
router.post('/layout', (req, res) => {
  try {
    const { nodes, edges, algorithm = 'hierarchical' } = req.body;
    
    if (!nodes || !Array.isArray(nodes)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_NODES',
          message: 'Valid nodes array is required'
        }
      });
    }
    
    // Apply layout algorithm
    const layoutedNodes = applyLayout(nodes, algorithm);
    
    res.json({
      success: true,
      data: {
        nodes: layoutedNodes,
        edges: edges || [],
        layout: {
          algorithm,
          appliedAt: new Date().toISOString()
        }
      }
    });
    
  } catch (error) {
    console.error('Error applying layout:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'LAYOUT_ERROR',
        message: 'Failed to apply layout'
      }
    });
  }
});

// Validate diagram
router.post('/validate', (req, res) => {
  try {
    const { diagramData } = req.body;
    
    if (!diagramData) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_DIAGRAM',
          message: 'Diagram data is required'
        }
      });
    }
    
    const validation = validateReactFlowData(diagramData);
    
    res.json({
      success: true,
      data: {
        valid: validation.valid,
        errors: validation.errors || []
      }
    });
    
  } catch (error) {
    console.error('Error validating diagram:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DIAGRAM_VALIDATION_ERROR',
        message: 'Failed to validate diagram'
      }
    });
  }
});

// Helper functions
function getComponentColor(category: string): string {
  const colors: Record<string, string> = {
    CPU: '#e3f2fd',
    Memory: '#f3e5f5',
    Interconnect: '#fff3e0',
    IO: '#e8f5e8',
    Accelerator: '#fce4ec',
    Custom: '#f5f5f5'
  };
  return colors[category] || colors.Custom;
}

function getComponentBorderColor(category: string): string {
  const colors: Record<string, string> = {
    CPU: '#2196f3',
    Memory: '#9c27b0',
    Interconnect: '#ff9800',
    IO: '#4caf50',
    Accelerator: '#e91e63',
    Custom: '#757575'
  };
  return colors[category] || colors.Custom;
}

function applyLayout(nodes: any[], algorithm: string): any[] {
  switch (algorithm) {
    case 'hierarchical':
      return nodes.map((node, index) => ({
        ...node,
        position: {
          x: 100 + (index % 3) * 250,
          y: 100 + Math.floor(index / 3) * 200
        }
      }));
    
    case 'grid':
      return nodes.map((node, index) => ({
        ...node,
        position: {
          x: 50 + (index % 4) * 200,
          y: 50 + Math.floor(index / 4) * 150
        }
      }));
    
    case 'force':
      // Simple circular layout for force simulation
      const centerX = 300;
      const centerY = 200;
      const radius = 150;
      return nodes.map((node, index) => {
        const angle = (index / nodes.length) * 2 * Math.PI;
        return {
          ...node,
          position: {
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle)
          }
        };
      });
    
    default:
      return nodes;
  }
}

export default router;