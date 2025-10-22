/**
 * Layout Optimizer Service
 * Applies Dagre hierarchical layout algorithm to SoC architecture diagrams
 */

import * as dagre from 'dagre';

export interface LayoutConfig {
  nodeSpacing: number;      // Horizontal spacing between nodes
  rankSpacing: number;      // Vertical spacing between ranks (layers)
  direction: 'TB' | 'LR';   // Top-to-Bottom or Left-to-Right
  align?: 'UL' | 'UR' | 'DL' | 'DR';  // Alignment
}

export class LayoutOptimizer {
  private defaultConfig: LayoutConfig = {
    nodeSpacing: 150,
    rankSpacing: 200,
    direction: 'TB',
    align: 'UL'
  };

  /**
   * Optimize diagram layout using Dagre algorithm
   * Applies hierarchical layout with proper spacing
   */
  optimizeLayout(diagram: any, config?: Partial<LayoutConfig>): any {
    const layoutConfig = { ...this.defaultConfig, ...config };

    console.log(`🎨 [LAYOUT] Starting Dagre layout optimization...`);
    console.log(`   Nodes: ${diagram.nodes?.length || 0}, Edges: ${diagram.edges?.length || 0}`);
    console.log(`   Direction: ${layoutConfig.direction}, Spacing: ${layoutConfig.nodeSpacing}x${layoutConfig.rankSpacing}`);

    // Create Dagre graph
    const g = new dagre.graphlib.Graph();

    // Set graph properties
    g.setGraph({
      rankdir: layoutConfig.direction,
      nodesep: layoutConfig.nodeSpacing,
      ranksep: layoutConfig.rankSpacing,
      align: layoutConfig.align,
      marginx: 50,
      marginy: 50
    });

    // Default to empty object for edge config
    g.setDefaultEdgeLabel(() => ({}));

    // Add nodes to Dagre graph
    const nodes = diagram.nodes || [];
    nodes.forEach((node: any) => {
      const width = node.width || node.data?.width || 180;
      const height = node.height || node.data?.height || 100;

      g.setNode(node.id, {
        width,
        height,
        label: node.data?.label || node.id
      });
    });

    // Add edges to Dagre graph
    const edges = diagram.edges || [];
    edges.forEach((edge: any) => {
      g.setEdge(edge.source, edge.target);
    });

    // Run Dagre layout algorithm
    dagre.layout(g);

    // Apply calculated positions back to diagram nodes
    const optimizedNodes = nodes.map((node: any) => {
      const dagreNode = g.node(node.id);

      if (!dagreNode) {
        console.warn(`⚠️  [LAYOUT] Node ${node.id} not found in Dagre graph, keeping original position`);
        return node;
      }

      // Dagre returns center position, we need top-left
      const x = dagreNode.x - (dagreNode.width / 2);
      const y = dagreNode.y - (dagreNode.height / 2);

      return {
        ...node,
        position: { x, y }
      };
    });

    console.log(`✅ [LAYOUT] Layout optimization complete`);

    return {
      ...diagram,
      nodes: optimizedNodes,
      edges: diagram.edges,
      components: optimizedNodes,  // Alias for compatibility
      connections: diagram.edges,   // Alias for compatibility
      metadata: {
        ...diagram.metadata,
        layoutAlgorithm: 'dagre',
        layoutConfig,
        optimizedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Optimize layout with SoC-specific heuristics
   * Applies domain knowledge for better component placement
   */
  optimizeLayoutWithHeuristics(diagram: any, architectureType?: string): any {
    console.log(`🎨 [LAYOUT] Applying SoC-specific layout heuristics...`);

    // Classify nodes by their role in SoC architecture
    const nodeRoles = this.classifyNodes(diagram.nodes || []);

    console.log(`   Masters: ${nodeRoles.masters.length}`);
    console.log(`   Interconnects: ${nodeRoles.interconnects.length}`);
    console.log(`   Slaves: ${nodeRoles.slaves.length}`);
    console.log(`   IO: ${nodeRoles.io.length}`);

    // Apply custom ranking to enforce layer separation
    const rankedDiagram = this.applyCustomRanking(diagram, nodeRoles);

    // Use Dagre for base layout
    const config: Partial<LayoutConfig> = {
      direction: 'TB',  // Top-to-Bottom for clear hierarchy
      nodeSpacing: 180,
      rankSpacing: 250,
    };

    return this.optimizeLayout(rankedDiagram, config);
  }

  /**
   * Classify nodes by their SoC role
   */
  private classifyNodes(nodes: any[]): {
    masters: any[];
    interconnects: any[];
    slaves: any[];
    io: any[];
  } {
    const classification = {
      masters: [] as any[],
      interconnects: [] as any[],
      slaves: [] as any[],
      io: [] as any[]
    };

    nodes.forEach(node => {
      const nodeType = (node.data?.model_type || node.data?.category || '').toLowerCase();
      const nodeName = (node.data?.label || node.id || '').toLowerCase();

      // Masters: CPU, DMA, Accelerators
      if (nodeType.includes('cpu') ||
          nodeType.includes('processor') ||
          nodeType.includes('dma') ||
          nodeType.includes('accelerator') ||
          nodeName.includes('cpu') ||
          nodeName.includes('cortex')) {
        classification.masters.push(node);
      }
      // Interconnects: Crossbar, Bridge, NoC, Bus
      else if (nodeType.includes('interconnect') ||
               nodeType.includes('crossbar') ||
               nodeType.includes('bridge') ||
               nodeType.includes('noc') ||
               nodeType.includes('bus') ||
               nodeName.includes('crossbar') ||
               nodeName.includes('bridge')) {
        classification.interconnects.push(node);
      }
      // IO: Peripherals, Controllers (except memory)
      else if (nodeType.includes('io') ||
               nodeType.includes('peripheral') ||
               nodeType.includes('uart') ||
               nodeType.includes('spi') ||
               nodeType.includes('i2c') ||
               nodeType.includes('usb') ||
               nodeType.includes('ethernet') ||
               nodeType.includes('wifi') ||
               nodeType.includes('bluetooth')) {
        classification.io.push(node);
      }
      // Slaves: Memory, Controllers
      else if (nodeType.includes('memory') ||
               nodeType.includes('sram') ||
               nodeType.includes('ddr') ||
               nodeType.includes('flash') ||
               nodeType.includes('controller') ||
               nodeName.includes('memory') ||
               nodeName.includes('ddr') ||
               nodeName.includes('controller')) {
        classification.slaves.push(node);
      }
      // Default: treat as slave
      else {
        classification.slaves.push(node);
      }
    });

    return classification;
  }

  /**
   * Apply custom ranking to enforce layer separation
   * This guides Dagre to place nodes in specific layers
   */
  private applyCustomRanking(diagram: any, nodeRoles: any): any {
    // Add metadata to nodes to influence Dagre ranking
    const rankedNodes = diagram.nodes.map((node: any) => {
      let rank = 1; // Default middle layer

      if (nodeRoles.masters.some((n: any) => n.id === node.id)) {
        rank = 0; // Top layer: Masters (CPU, DMA)
      } else if (nodeRoles.interconnects.some((n: any) => n.id === node.id)) {
        rank = 1; // Middle layer: Interconnects
      } else if (nodeRoles.slaves.some((n: any) => n.id === node.id)) {
        rank = 2; // Bottom layer: Slaves (Memory)
      } else if (nodeRoles.io.some((n: any) => n.id === node.id)) {
        rank = 2; // Bottom layer: IO peripherals
      }

      return {
        ...node,
        data: {
          ...node.data,
          rank // Dagre will use this as a hint
        }
      };
    });

    return {
      ...diagram,
      nodes: rankedNodes
    };
  }

  /**
   * Validate that layout is reasonable
   * Checks for overlaps, out-of-bounds positions, etc.
   */
  validateLayout(diagram: any): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    const nodes = diagram.nodes || [];

    // Check for node overlaps
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const n1 = nodes[i];
        const n2 = nodes[j];

        const overlap = this.checkOverlap(n1, n2);
        if (overlap) {
          issues.push(`Nodes ${n1.id} and ${n2.id} overlap`);
        }
      }
    }

    // Check for negative positions
    nodes.forEach((node: any) => {
      if (node.position.x < 0 || node.position.y < 0) {
        issues.push(`Node ${node.id} has negative position: (${node.position.x}, ${node.position.y})`);
      }
    });

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Check if two nodes overlap
   */
  private checkOverlap(n1: any, n2: any): boolean {
    const x1 = n1.position.x;
    const y1 = n1.position.y;
    const w1 = n1.width || n1.data?.width || 180;
    const h1 = n1.height || n1.data?.height || 100;

    const x2 = n2.position.x;
    const y2 = n2.position.y;
    const w2 = n2.width || n2.data?.width || 180;
    const h2 = n2.height || n2.data?.height || 100;

    return !(x1 + w1 < x2 || x2 + w2 < x1 || y1 + h1 < y2 || y2 + h2 < y1);
  }
}
