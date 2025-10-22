import { 
  DesignSession,
  ArchitecturalComponent,
  DiagramData,
  DiagramNode,
  DiagramEdge,
  ComponentConnection,
  LayoutAlgorithm,
  DiagramLayout
} from '../../types/index';

export interface DiagramGenerationOptions {
  layoutAlgorithm?: LayoutAlgorithm;
  includeLabels?: boolean;
  showInterfaces?: boolean;
  groupByCategory?: boolean;
  autoRoute?: boolean;
  spacing?: {
    nodeSpacing: number;
    categorySpacing: number;
    edgeSpacing: number;
  };
}

export interface GeneratedDiagram {
  diagramData: DiagramData;
  layout: DiagramLayout;
  metadata: {
    nodeCount: number;
    edgeCount: number;
    categories: string[];
    generatedAt: Date;
    algorithm: LayoutAlgorithm;
  };
  suggestions: DiagramSuggestion[];
}

export interface DiagramSuggestion {
  type: 'layout' | 'connection' | 'grouping' | 'optimization';
  title: string;
  description: string;
  action: string;
  priority: 'low' | 'medium' | 'high';
}

export class DiagramGenerator {
  private defaultOptions: DiagramGenerationOptions = {
    layoutAlgorithm: 'hierarchical',
    includeLabels: true,
    showInterfaces: true,
    groupByCategory: false,
    autoRoute: true,
    spacing: {
      nodeSpacing: 150,
      categorySpacing: 200,
      edgeSpacing: 50
    }
  };

  /**
   * Generate diagram from conversation session
   */
  async generateFromSession(
    session: DesignSession,
    options: Partial<DiagramGenerationOptions> = {}
  ): Promise<GeneratedDiagram> {
    const opts = { ...this.defaultOptions, ...options };
    
    if (!session.currentArchitecture?.selectedComponents.length) {
      throw new Error('No components selected in session architecture');
    }

    const components = session.currentArchitecture.selectedComponents;
    
    // Generate nodes from components
    const nodes = this.generateNodes(components, opts);
    
    // Generate edges from component relationships
    const edges = this.generateEdges(components, nodes, opts);
    
    // Apply layout algorithm
    const layout = this.applyLayout(nodes, edges, opts);
    
    // Generate suggestions
    const suggestions = this.generateSuggestions(nodes, edges, session);
    
    const diagramData: DiagramData = {
      nodes: layout.nodes,
      edges: layout.edges,
      viewport: layout.viewport
    };

    return {
      diagramData,
      layout,
      metadata: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        categories: [...new Set(components.map(c => c.category))],
        generatedAt: new Date(),
        algorithm: opts.layoutAlgorithm!
      },
      suggestions
    };
  }

  /**
   * Generate nodes from architectural components
   */
  private generateNodes(
    components: ArchitecturalComponent[],
    options: DiagramGenerationOptions
  ): DiagramNode[] {
    return components.map((component, index) => {
      const nodeId = `node-${component.id}`;
      
      return {
        id: nodeId,
        type: 'soc-component',
        position: { x: 0, y: 0 }, // Will be set by layout algorithm
        data: {
          component,
          label: component.name,
          category: component.category,
          icon: component.visualization?.icon || 'Box',
          properties: this.extractDisplayProperties(component),
          interfaces: options.showInterfaces ? component.interfaces : [],
          customizable: component.customizable
        },
        style: this.getNodeStyle(component),
        className: `soc-node soc-node-${component.category.toLowerCase()}`,
        draggable: true,
        selectable: true
      };
    });
  }

  /**
   * Generate edges from component relationships
   */
  private generateEdges(
    components: ArchitecturalComponent[],
    nodes: DiagramNode[],
    options: DiagramGenerationOptions
  ): DiagramEdge[] {
    const edges: DiagramEdge[] = [];
    const nodeMap = new Map(nodes.map(node => [node.data.component.id, node.id]));

    // Generate edges based on interface compatibility
    components.forEach(sourceComponent => {
      const sourceNodeId = nodeMap.get(sourceComponent.id);
      if (!sourceNodeId) return;

      components.forEach(targetComponent => {
        if (sourceComponent.id === targetComponent.id) return;
        
        const targetNodeId = nodeMap.get(targetComponent.id);
        if (!targetNodeId) return;

        const connections = this.findCompatibleConnections(sourceComponent, targetComponent);
        
        connections.forEach((connection, index) => {
          const edgeId = `edge-${sourceComponent.id}-${targetComponent.id}-${index}`;
          
          edges.push({
            id: edgeId,
            source: sourceNodeId,
            target: targetNodeId,
            type: 'soc-connection',
            data: {
              connection,
              protocol: connection.protocol,
              bandwidth: connection.bandwidth,
              bidirectional: connection.bidirectional
            },
            label: connection.label,
            style: this.getEdgeStyle(connection),
            animated: connection.protocol === 'high-speed',
            markerEnd: {
              type: 'arrowclosed',
              color: this.getConnectionColor(connection.protocol)
            }
          });
        });
      });
    });

    return edges;
  }

  /**
   * Find compatible connections between two components
   */
  private findCompatibleConnections(
    source: ArchitecturalComponent,
    target: ArchitecturalComponent
  ): ComponentConnection[] {
    const connections: ComponentConnection[] = [];

    // Check compatibility list
    const commonProtocols = source.compatibility.filter(protocol => 
      target.compatibility.includes(protocol)
    );
    
    commonProtocols.forEach(protocol => {
      connections.push({
        id: `conn-${source.id}-${target.id}-${protocol}`,
        sourceInterface: 'generic',
        targetInterface: 'generic',
        protocol,
        bandwidth: 'Variable',
        latency: '10ns',
        bidirectional: true,
        label: `${protocol} Bus`,
        connectionType: this.getConnectionType(protocol)
      });
    });

    return connections;
  }

  /**
   * Apply layout algorithm to position nodes and route edges
   */
  private applyLayout(
    nodes: DiagramNode[],
    edges: DiagramEdge[],
    options: DiagramGenerationOptions
  ): DiagramLayout {
    let layoutedNodes: DiagramNode[];
    
    switch (options.layoutAlgorithm) {
      case 'hierarchical':
        layoutedNodes = this.applyHierarchicalLayout(nodes, edges, options);
        break;
      case 'force-directed':
        layoutedNodes = this.applyForceDirectedLayout(nodes, edges, options);
        break;
      case 'grid':
        layoutedNodes = this.applyGridLayout(nodes, options);
        break;
      case 'circular':
        layoutedNodes = this.applyCircularLayout(nodes, options);
        break;
      default:
        layoutedNodes = this.applyHierarchicalLayout(nodes, edges, options);
    }

    // Calculate viewport to fit all nodes
    const viewport = this.calculateViewport(layoutedNodes);

    return {
      nodes: layoutedNodes,
      edges,
      viewport,
      algorithm: options.layoutAlgorithm!,
      bounds: this.calculateBounds(layoutedNodes)
    };
  }

  /**
   * Apply hierarchical layout (CPU at top, memory/IO below, interconnects between)
   */
  private applyHierarchicalLayout(
    nodes: DiagramNode[],
    edges: DiagramEdge[],
    options: DiagramGenerationOptions
  ): DiagramNode[] {
    const spacing = options.spacing!;
    const categories = this.categorizeNodes(nodes);
    
    let currentY = 0;
    const layoutedNodes: DiagramNode[] = [];

    // Layer 1: CPUs at the top
    if (categories.CPU.length > 0) {
      const cpuNodes = this.layoutNodesInRow(categories.CPU, currentY, spacing.nodeSpacing);
      layoutedNodes.push(...cpuNodes);
      currentY += spacing.categorySpacing;
    }

    // Layer 2: Accelerators
    if (categories.Accelerator.length > 0) {
      const acceleratorNodes = this.layoutNodesInRow(categories.Accelerator, currentY, spacing.nodeSpacing);
      layoutedNodes.push(...acceleratorNodes);
      currentY += spacing.categorySpacing;
    }

    // Layer 3: Interconnects (centered)
    if (categories.Interconnect.length > 0) {
      const interconnectNodes = this.layoutNodesInRow(categories.Interconnect, currentY, spacing.nodeSpacing);
      layoutedNodes.push(...interconnectNodes);
      currentY += spacing.categorySpacing;
    }

    // Layer 4: Memory and IO side by side
    if (categories.Memory.length > 0 || categories.IO.length > 0) {
      const memoryNodes = this.layoutNodesInRow(categories.Memory, currentY, spacing.nodeSpacing, -200);
      const ioNodes = this.layoutNodesInRow(categories.IO, currentY, spacing.nodeSpacing, 200);
      layoutedNodes.push(...memoryNodes, ...ioNodes);
      currentY += spacing.categorySpacing;
    }

    // Layer 5: Custom components at bottom
    if (categories.Custom.length > 0) {
      const customNodes = this.layoutNodesInRow(categories.Custom, currentY, spacing.nodeSpacing);
      layoutedNodes.push(...customNodes);
    }

    return layoutedNodes;
  }

  /**
   * Apply force-directed layout for organic positioning
   */
  private applyForceDirectedLayout(
    nodes: DiagramNode[],
    edges: DiagramEdge[],
    options: DiagramGenerationOptions
  ): DiagramNode[] {
    // Simple force-directed algorithm
    const spacing = options.spacing!.nodeSpacing;
    const iterations = 100;
    const repulsionForce = 1000;
    const attractionForce = 0.1;
    
    // Initialize random positions
    nodes.forEach((node, index) => {
      node.position = {
        x: Math.random() * 800,
        y: Math.random() * 600
      };
    });

    // Run force simulation
    for (let i = 0; i < iterations; i++) {
      const forces = new Map<string, { x: number; y: number }>();
      
      // Initialize forces
      nodes.forEach(node => {
        forces.set(node.id, { x: 0, y: 0 });
      });

      // Repulsion forces between all nodes
      for (let j = 0; j < nodes.length; j++) {
        for (let k = j + 1; k < nodes.length; k++) {
          const node1 = nodes[j];
          const node2 = nodes[k];
          const dx = node2.position.x - node1.position.x;
          const dy = node2.position.y - node1.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          
          const force = repulsionForce / (distance * distance);
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;
          
          const force1 = forces.get(node1.id)!;
          const force2 = forces.get(node2.id)!;
          
          force1.x -= fx;
          force1.y -= fy;
          force2.x += fx;
          force2.y += fy;
        }
      }

      // Attraction forces for connected nodes
      edges.forEach(edge => {
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);
        
        if (sourceNode && targetNode) {
          const dx = targetNode.position.x - sourceNode.position.x;
          const dy = targetNode.position.y - sourceNode.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          
          const force = distance * attractionForce;
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;
          
          const sourceForce = forces.get(sourceNode.id)!;
          const targetForce = forces.get(targetNode.id)!;
          
          sourceForce.x += fx;
          sourceForce.y += fy;
          targetForce.x -= fx;
          targetForce.y -= fy;
        }
      });

      // Apply forces
      nodes.forEach(node => {
        const force = forces.get(node.id)!;
        node.position.x += force.x * 0.1;
        node.position.y += force.y * 0.1;
      });
    }

    return nodes;
  }

  /**
   * Apply grid layout
   */
  private applyGridLayout(nodes: DiagramNode[], options: DiagramGenerationOptions): DiagramNode[] {
    const spacing = options.spacing!.nodeSpacing;
    const cols = Math.ceil(Math.sqrt(nodes.length));
    
    return nodes.map((node, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      
      return {
        ...node,
        position: {
          x: col * spacing,
          y: row * spacing
        }
      };
    });
  }

  /**
   * Apply circular layout
   */
  private applyCircularLayout(nodes: DiagramNode[], options: DiagramGenerationOptions): DiagramNode[] {
    const radius = Math.max(200, nodes.length * 30);
    const centerX = 400;
    const centerY = 300;
    
    return nodes.map((node, index) => {
      const angle = (2 * Math.PI * index) / nodes.length;
      
      return {
        ...node,
        position: {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle)
        }
      };
    });
  }

  /**
   * Categorize nodes by component type
   */
  private categorizeNodes(nodes: DiagramNode[]): Record<string, DiagramNode[]> {
    const categories: Record<string, DiagramNode[]> = {
      CPU: [],
      Memory: [],
      IO: [],
      Interconnect: [],
      Accelerator: [],
      Custom: []
    };

    nodes.forEach(node => {
      const category = node.data.category;
      if (categories[category]) {
        categories[category].push(node);
      } else {
        categories.Custom.push(node);
      }
    });

    return categories;
  }

  /**
   * Layout nodes in a horizontal row
   */
  private layoutNodesInRow(
    nodes: DiagramNode[],
    y: number,
    spacing: number,
    offsetX: number = 0
  ): DiagramNode[] {
    const totalWidth = (nodes.length - 1) * spacing;
    const startX = -totalWidth / 2 + offsetX;

    return nodes.map((node, index) => ({
      ...node,
      position: {
        x: startX + index * spacing,
        y
      }
    }));
  }

  /**
   * Extract display properties from component
   */
  private extractDisplayProperties(component: ArchitecturalComponent): Record<string, string> {
    const props: Record<string, string> = {};
    
    if (component.properties.performance?.clockFrequency) {
      props['Frequency'] = component.properties.performance.clockFrequency;
    }
    
    if (component.properties.power?.typical) {
      props['Power'] = component.properties.power.typical;
    }
    
    if (component.properties.performance?.bandwidth) {
      props['Bandwidth'] = component.properties.performance.bandwidth;
    }
    
    return props;
  }

  /**
   * Get node style based on component category
   */
  private getNodeStyle(component: ArchitecturalComponent): Record<string, any> {
    const baseStyle = {
      padding: '12px',
      borderRadius: '12px',
      border: '2px solid',
      fontSize: '12px',
      fontWeight: '600',
      minWidth: '120px',
      textAlign: 'center',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      transition: 'all 0.2s ease'
    };

    const categoryStyles = {
      CPU: { background: '#dbeafe', borderColor: '#3b82f6', color: '#1e40af' },
      Memory: { background: '#fce7f3', borderColor: '#ec4899', color: '#be185d' },
      IO: { background: '#dcfce7', borderColor: '#22c55e', color: '#15803d' },
      Interconnect: { background: '#fef3c7', borderColor: '#f59e0b', color: '#d97706' },
      Accelerator: { background: '#e0e7ff', borderColor: '#8b5cf6', color: '#7c3aed' },
      Custom: { background: '#f1f5f9', borderColor: '#64748b', color: '#475569' }
    };

    return {
      ...baseStyle,
      ...categoryStyles[component.category as keyof typeof categoryStyles]
    };
  }

  /**
   * Get edge style based on connection type
   */
  private getEdgeStyle(connection: ComponentConnection): Record<string, any> {
    const baseStyle = {
      strokeWidth: 2,
      stroke: this.getConnectionColor(connection.protocol)
    };

    if (connection.connectionType === 'high-speed') {
      return {
        ...baseStyle,
        strokeWidth: 3,
        strokeDasharray: '0'
      };
    }

    return baseStyle;
  }

  /**
   * Get connection color based on protocol
   */
  private getConnectionColor(protocol: string): string {
    const colorMap: Record<string, string> = {
      'AXI4': '#3b82f6',
      'AHB': '#06b6d4',
      'APB': '#8b5cf6',
      'PCIe': '#22c55e',
      'DDR': '#ec4899',
      'USB': '#f59e0b',
      'Ethernet': '#10b981',
      'CXL': '#6366f1'
    };

    return colorMap[protocol] || '#64748b';
  }

  /**
   * Get connection type for styling
   */
  private getConnectionType(protocol: string): 'high-speed' | 'medium-speed' | 'low-speed' {
    const highSpeed = ['PCIe', 'DDR', 'CXL', 'AXI4'];
    const mediumSpeed = ['AHB', 'Ethernet', 'USB'];
    
    if (highSpeed.includes(protocol)) return 'high-speed';
    if (mediumSpeed.includes(protocol)) return 'medium-speed';
    return 'low-speed';
  }

  /**
   * Calculate viewport to fit all nodes
   */
  private calculateViewport(nodes: DiagramNode[]): { x: number; y: number; zoom: number } {
    if (nodes.length === 0) {
      return { x: 0, y: 0, zoom: 1 };
    }

    const bounds = this.calculateBounds(nodes);
    const padding = 100;
    
    const viewportWidth = 1200; // Assume viewport width
    const viewportHeight = 800; // Assume viewport height
    
    const contentWidth = bounds.maxX - bounds.minX + padding * 2;
    const contentHeight = bounds.maxY - bounds.minY + padding * 2;
    
    const scaleX = viewportWidth / contentWidth;
    const scaleY = viewportHeight / contentHeight;
    const zoom = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 100%
    
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    
    return {
      x: -centerX * zoom + viewportWidth / 2,
      y: -centerY * zoom + viewportHeight / 2,
      zoom
    };
  }

  /**
   * Calculate bounding box of all nodes
   */
  private calculateBounds(nodes: DiagramNode[]): { minX: number; maxX: number; minY: number; maxY: number } {
    if (nodes.length === 0) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }

    let minX = nodes[0].position.x;
    let maxX = nodes[0].position.x;
    let minY = nodes[0].position.y;
    let maxY = nodes[0].position.y;

    nodes.forEach(node => {
      minX = Math.min(minX, node.position.x - 60); // Account for node width
      maxX = Math.max(maxX, node.position.x + 60);
      minY = Math.min(minY, node.position.y - 40); // Account for node height
      maxY = Math.max(maxY, node.position.y + 40);
    });

    return { minX, maxX, minY, maxY };
  }

  /**
   * Generate suggestions for diagram improvement
   */
  private generateSuggestions(
    nodes: DiagramNode[],
    edges: DiagramEdge[],
    session: DesignSession
  ): DiagramSuggestion[] {
    const suggestions: DiagramSuggestion[] = [];

    // Layout suggestions
    if (nodes.length > 6) {
      suggestions.push({
        type: 'layout',
        title: 'Consider Hierarchical Layout',
        description: 'With many components, a hierarchical layout may improve readability',
        action: 'Switch to hierarchical layout',
        priority: 'medium'
      });
    }

    // Connection suggestions
    if (edges.length === 0) {
      suggestions.push({
        type: 'connection',
        title: 'No Connections Detected',
        description: 'Components appear isolated. Consider adding interface definitions.',
        action: 'Review component interfaces',
        priority: 'high'
      });
    }

    return suggestions;
  }

  /**
   * Update diagram with new component positions
   */
  updateDiagramLayout(
    diagramData: DiagramData,
    layoutAlgorithm: LayoutAlgorithm
  ): DiagramData {
    const options: DiagramGenerationOptions = {
      ...this.defaultOptions,
      layoutAlgorithm
    };

    const layout = this.applyLayout(diagramData.nodes, diagramData.edges, options);
    
    return {
      nodes: layout.nodes,
      edges: layout.edges,
      viewport: layout.viewport
    };
  }

  /**
   * Validate diagram data
   */
  validateDiagram(diagramData: DiagramData): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check for nodes
    if (!diagramData.nodes || diagramData.nodes.length === 0) {
      issues.push('Diagram has no nodes');
    }

    // Check for duplicate node IDs
    const nodeIds = diagramData.nodes.map(n => n.id);
    const duplicateIds = nodeIds.filter((id, index) => nodeIds.indexOf(id) !== index);
    if (duplicateIds.length > 0) {
      issues.push(`Duplicate node IDs: ${duplicateIds.join(', ')}`);
    }

    // Check edge references
    diagramData.edges.forEach(edge => {
      if (!nodeIds.includes(edge.source)) {
        issues.push(`Edge ${edge.id} references non-existent source node: ${edge.source}`);
      }
      if (!nodeIds.includes(edge.target)) {
        issues.push(`Edge ${edge.id} references non-existent target node: ${edge.target}`);
      }
    });

    return {
      valid: issues.length === 0,
      issues
    };
  }
}