// Flow Analyzer Service
// Discovers and analyzes data flows in SoC architecture diagrams

export interface DataFlow {
  id: number | string; // 8-bit flow ID (0x00-0xFF) or auto-generated string
  name: string;
  type: 'memory_access' | 'peripheral_access' | 'dma' | 'accelerator' | 'p2p' | 'unknown';
  source: {
    id: string;
    label: string;
    type: string;
  };
  sink: {
    id: string;
    label: string;
    type: string;
  };
  path: Array<{
    id: string;
    label: string;
    type: string;
  }>;
  edges: string[];
  protocol?: string;
  dataWidth?: number;
  frequency?: number;
}

interface ComponentNode {
  id: string;
  data: {
    label: string;
    model_type?: string;
    category?: string;
    [key: string]: any;
  };
}

interface Connection {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
}

interface ArchitectureDiagram {
  nodes: ComponentNode[];
  edges: Connection[];
}

interface ComponentInterface {
  id: string;
  name: string;
  type: string;
  direction: 'master' | 'slave' | 'in' | 'out';
  busType?: string;
  dataWidth?: number;
  addrWidth?: number;
  speed?: string;
}

export class FlowAnalyzer {
  private componentLibrary: Map<string, any> = new Map();

  /**
   * Load component library for interface information
   */
  loadComponentLibrary(componentLibrary: any[]): void {
    this.componentLibrary.clear();
    if (componentLibrary) {
      componentLibrary.forEach(comp => {
        this.componentLibrary.set(comp.id, comp);
        if (comp.name) {
          this.componentLibrary.set(comp.name, comp);
        }
        if (comp.category) {
          this.componentLibrary.set(comp.category, comp);
        }
      });
    }
  }

  /**
   * Discover all data flows in the diagram
   */
  discoverDataFlows(diagram: ArchitectureDiagram): DataFlow[] {
    const flows: DataFlow[] = [];
    let flowCounter = 0;

    // Find all master nodes
    const masterNodes = this.findMasterNodes(diagram);

    for (const masterNode of masterNodes) {
      // Find all paths from this master to slaves
      const paths = this.findAllPathsFromMaster(masterNode.id, diagram);

      for (const path of paths) {
        if (path.nodes.length < 2) continue; // Need at least source and sink

        const sourceNode = diagram.nodes.find(n => n.id === path.nodes[0]);
        const sinkNode = diagram.nodes.find(n => n.id === path.nodes[path.nodes.length - 1]);

        if (!sourceNode || !sinkNode) continue;

        const flow: DataFlow = {
          id: `flow-${++flowCounter}`,
          name: `${sourceNode.data.label} → ${sinkNode.data.label}`,
          type: this.classifyFlowType(sourceNode, sinkNode),
          source: {
            id: sourceNode.id,
            label: sourceNode.data.label,
            type: sourceNode.data.model_type || sourceNode.data.category || 'Unknown'
          },
          sink: {
            id: sinkNode.id,
            label: sinkNode.data.label,
            type: sinkNode.data.model_type || sinkNode.data.category || 'Unknown'
          },
          path: path.nodes.map(nodeId => {
            const node = diagram.nodes.find(n => n.id === nodeId)!;
            return {
              id: node.id,
              label: node.data.label,
              type: node.data.model_type || node.data.category || 'Unknown'
            };
          }),
          edges: path.edges,
          protocol: this.detectProtocol(path.edges, diagram)
        };

        flows.push(flow);
      }
    }

    return flows;
  }

  /**
   * Discover a specific flow between two nodes (for user-selected flows)
   */
  discoverSpecificFlow(
    sourceId: string, 
    targetId: string, 
    flowId: number | string, 
    diagram: ArchitectureDiagram,
    sourcePort?: string,
    targetPort?: string
  ): DataFlow | null {
    const sourceNode = diagram.nodes.find(n => n.id === sourceId);
    const targetNode = diagram.nodes.find(n => n.id === targetId);

    if (!sourceNode || !targetNode) {
      console.log(`[FlowAnalyzer] Cannot find nodes: ${sourceId} or ${targetId}`);
      return null;
    }

    // Find path from source to target
    const path = this.findPathBetweenNodes(sourceId, targetId, diagram);
    
    if (!path || path.nodes.length < 2) {
      console.log(`[FlowAnalyzer] No path found from ${sourceId} to ${targetId}`);
      return null;
    }

    console.log(`[FlowAnalyzer] Found path from ${sourceId} to ${targetId}:`, path.nodes.join(' -> '));

    // Find interface names
    const sourceInterface = sourceNode.data.interfaces?.find((i: any) => i.id === sourcePort);
    const targetInterface = targetNode.data.interfaces?.find((i: any) => i.id === targetPort);
    const sourceInterfaceName = sourceInterface?.name || sourcePort || 'default';
    const targetInterfaceName = targetInterface?.name || targetPort || 'default';

    // Format: DisplayName(nodeId):interfaceName → DisplayName(nodeId):interfaceName
    const flowName = `${sourceNode.data.label}(${sourceId}):${sourceInterfaceName} → ${targetNode.data.label}(${targetId}):${targetInterfaceName}`;

    const flow: DataFlow = {
      id: flowId,
      name: flowName,
      type: this.classifyFlowType(sourceNode, targetNode),
      source: {
        id: sourceNode.id,
        label: sourceNode.data.label,
        type: sourceNode.data.model_type || sourceNode.data.category || 'Unknown'
      },
      sink: {
        id: targetNode.id,
        label: targetNode.data.label,
        type: targetNode.data.model_type || targetNode.data.category || 'Unknown'
      },
      path: path.nodes.map(nodeId => {
        const node = diagram.nodes.find(n => n.id === nodeId);
        return {
          id: nodeId,
          label: node?.data.label || nodeId,
          type: node?.data.model_type || node?.data.category || 'Unknown'
        };
      }),
      edges: path.edges,
      protocol: this.detectProtocol(path.edges, diagram)
    };

    return flow;
  }

  /**
   * Find a path between two specific nodes using BFS
   */
  private findPathBetweenNodes(sourceId: string, targetId: string, diagram: ArchitectureDiagram): { nodes: string[]; edges: string[] } | null {
    // Build adjacency list
    const adjacency = new Map<string, Array<{ nodeId: string; edgeId: string }>>();
    
    for (const edge of diagram.edges) {
      if (!adjacency.has(edge.source)) {
        adjacency.set(edge.source, []);
      }
      adjacency.get(edge.source)!.push({ nodeId: edge.target, edgeId: edge.id });
    }

    // BFS to find shortest path
    const queue: Array<{ nodeId: string; path: string[]; edges: string[] }> = [
      { nodeId: sourceId, path: [sourceId], edges: [] }
    ];
    const visited = new Set<string>([sourceId]);

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.nodeId === targetId) {
        return { nodes: current.path, edges: current.edges };
      }

      const neighbors = adjacency.get(current.nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor.nodeId)) {
          visited.add(neighbor.nodeId);
          queue.push({
            nodeId: neighbor.nodeId,
            path: [...current.path, neighbor.nodeId],
            edges: [...current.edges, neighbor.edgeId]
          });
        }
      }
    }

    return null; // No path found
  }

  /**
   * Determine if a component is an intermediate/pass-through component
   */
  private isIntermediateComponent(node: ComponentNode): boolean {
    const nodeType = node.data.model_type || node.data.category || '';
    const label = (node.data.label || '').toLowerCase();
    
    // Known intermediate types (including DMA which is typically a data mover)
    const intermediateTypes = ['Interconnect', 'Bridge', 'Router', 'Switch', 'Crossbar', 'Bus', 'Fabric', 'DMA'];
    if (intermediateTypes.includes(nodeType)) {
      return true;
    }

    // Check label for intermediate keywords
    const intermediateKeywords = ['interconnect', 'bridge', 'router', 'switch', 'crossbar', 'bus', 'fabric', 'transport', 'network', 'dma'];
    if (intermediateKeywords.some(keyword => label.includes(keyword))) {
      return true;
    }

    // Check interface pattern: if component has equal master and slave interfaces, likely intermediate
    const interfaces = this.getComponentInterfaces(node);
    const masterCount = interfaces.filter(i => i.direction === 'master' || i.direction === 'output').length;
    const slaveCount = interfaces.filter(i => i.direction === 'slave' || i.direction === 'input').length;
    
    // If has both master and slave interfaces in roughly equal numbers, likely intermediate
    if (masterCount > 0 && slaveCount > 0 && Math.abs(masterCount - slaveCount) <= 1) {
      return true;
    }

    return false;
  }

  /**
   * Find all nodes that act as masters (have master interfaces or are master types)
   * Only edge components (not intermediate/pass-through components) should be flow sources
   */
  private findMasterNodes(diagram: ArchitectureDiagram): ComponentNode[] {
    const masterTypes = ['CPU', 'Accelerator', 'NPU', 'GPU', 'DSP', 'Processor', 'Memory', 'DDR', 'RAM', 'Peripheral'];
    const masterNodes: ComponentNode[] = [];

    for (const node of diagram.nodes) {
      const nodeType = node.data.model_type || node.data.category || '';

      // Skip intermediate/pass-through components - they don't initiate flows
      if (this.isIntermediateComponent(node)) {
        console.log(`[FlowAnalyzer] Skipping intermediate component: ${node.data.label}`);
        continue;
      }

      // Check if it's a known master type (edge component that initiates transactions)
      if (masterTypes.includes(nodeType)) {
        masterNodes.push(node);
        continue;
      }

      // Check if it has master interfaces (indicates it can initiate transactions)
      const interfaces = this.getComponentInterfaces(node);
      const hasMasterInterface = interfaces.some(intf => 
        intf.direction === 'master' || intf.direction === 'output'
      );
      
      if (hasMasterInterface) {
        masterNodes.push(node);
        continue;
      }
    }

    console.log(`[FlowAnalyzer] Found ${masterNodes.length} master/source nodes (edge components):`, 
      masterNodes.map(n => n.data.label));
    return masterNodes;
  }

  /**
   * Find all paths from a master node to slave nodes using DFS
   */
  private findAllPathsFromMaster(
    startNodeId: string,
    diagram: ArchitectureDiagram,
    maxDepth: number = 10
  ): Array<{ nodes: string[]; edges: string[] }> {
    const paths: Array<{ nodes: string[]; edges: string[] }> = [];
    const visited = new Set<string>();

    const dfs = (
      currentNodeId: string,
      currentPath: string[],
      currentEdges: string[],
      depth: number
    ) => {
      if (depth > maxDepth) return;

      visited.add(currentNodeId);
      currentPath.push(currentNodeId);

      const outgoingEdges = diagram.edges.filter(e => e.source === currentNodeId);
      const currentNode = diagram.nodes.find(n => n.id === currentNodeId);
      const currentNodeType = currentNode?.data?.model_type || currentNode?.data?.category || '';
      
      // Intermediate types that should not be flow endpoints
      const intermediateTypes = ['Interconnect', 'Bridge', 'Router', 'Switch', 'Crossbar', 'Bus'];
      const isIntermediate = intermediateTypes.includes(currentNodeType);

      // If no outgoing edges and not an intermediate component, this is a valid sink (edge component)
      if (outgoingEdges.length === 0 && currentPath.length > 1 && !isIntermediate) {
        paths.push({
          nodes: [...currentPath],
          edges: [...currentEdges]
        });
      } else if (outgoingEdges.length > 0) {
        // Continue traversing
        for (const edge of outgoingEdges) {
          if (!visited.has(edge.target)) {
            dfs(edge.target, currentPath, [...currentEdges, edge.id], depth + 1);
          }
        }
      }
      // If it's an intermediate component with no outgoing edges, don't create a flow
      // (this would be an incomplete path)

      currentPath.pop();
      visited.delete(currentNodeId);
    };

    dfs(startNodeId, [], [], 0);
    return paths;
  }

  /**
   * Classify the type of data flow based on source and sink components
   */
  private classifyFlowType(
    source: ComponentNode,
    sink: ComponentNode
  ): DataFlow['type'] {
    const sourceType = source.data.model_type || source.data.category || '';
    const sinkType = sink.data.model_type || sink.data.category || '';

    // Memory access flows
    if (sinkType === 'Memory' || sinkType === 'RAM' || sinkType === 'DDR') {
      if (sourceType === 'CPU') return 'memory_access';
      if (sourceType === 'DMA') return 'dma';
      if (sourceType === 'NPU' || sourceType === 'GPU' || sourceType === 'Accelerator') {
        return 'accelerator';
      }
      return 'memory_access';
    }

    // Peripheral access flows
    if (
      sinkType === 'Connectivity' ||
      sinkType === 'Peripheral' ||
      sinkType === 'Storage' ||
      sinkType === 'Interface'
    ) {
      if (sourceType === 'CPU') return 'peripheral_access';
      if (sourceType === 'DMA') return 'dma';
      return 'peripheral_access';
    }

    // DMA flows
    if (sourceType === 'DMA') {
      return 'dma';
    }

    // Accelerator flows
    if (sourceType === 'NPU' || sourceType === 'GPU' || sourceType === 'Accelerator') {
      return 'accelerator';
    }

    // Peer-to-peer flows
    if (
      sourceType !== 'CPU' &&
      sourceType !== 'Interconnect' &&
      sinkType !== 'Memory' &&
      sinkType !== 'Interconnect'
    ) {
      return 'p2p';
    }

    return 'unknown';
  }

  /**
   * Detect the protocol used in the flow based on edge labels
   */
  private detectProtocol(edgeIds: string[], diagram: ArchitectureDiagram): string {
    for (const edgeId of edgeIds) {
      const edge = diagram.edges.find(e => e.id === edgeId);
      if (edge?.label) {
        return edge.label;
      }
    }
    return 'Unknown';
  }

  /**
   * Get component interfaces from library
   */
  private getComponentInterfaces(node: ComponentNode): ComponentInterface[] {
    // Try to find in library by various keys
    let libComponent = this.componentLibrary.get(node.data.label);
    if (!libComponent) {
      libComponent = this.componentLibrary.get(node.data.category || '');
    }
    if (!libComponent) {
      libComponent = this.componentLibrary.get(node.data.model_type || '');
    }

    if (libComponent?.interfaces) {
      return libComponent.interfaces;
    }

    return [];
  }

  /**
   * Get detailed flow information including interface details
   */
  getFlowDetails(flow: DataFlow, diagram: ArchitectureDiagram): any {
    const details: any = {
      ...flow,
      components: [],
      totalHops: flow.path.length - 1,
      intermediateNodes: flow.path.slice(1, -1)
    };

    // Get detailed component information
    for (const pathNode of flow.path) {
      const node = diagram.nodes.find(n => n.id === pathNode.id);
      if (node) {
        const interfaces = this.getComponentInterfaces(node);
        details.components.push({
          id: node.id,
          label: node.data.label,
          type: node.data.model_type || node.data.category,
          interfaces: interfaces.length,
          data: node.data
        });
      }
    }

    return details;
  }

  /**
   * Group flows by type
   */
  groupFlowsByType(flows: DataFlow[]): Record<string, DataFlow[]> {
    const grouped: Record<string, DataFlow[]> = {
      memory_access: [],
      peripheral_access: [],
      dma: [],
      accelerator: [],
      p2p: [],
      unknown: []
    };

    for (const flow of flows) {
      grouped[flow.type].push(flow);
    }

    return grouped;
  }

  /**
   * Find flows that share components
   */
  findSharedComponents(flows: DataFlow[]): Map<string, string[]> {
    const componentToFlows = new Map<string, string[]>();

    for (const flow of flows) {
      for (const component of flow.path) {
        if (!componentToFlows.has(component.id)) {
          componentToFlows.set(component.id, []);
        }
        componentToFlows.get(component.id)!.push(String(flow.id));
      }
    }

    // Filter to only shared components (used by multiple flows)
    const sharedComponents = new Map<string, string[]>();
    for (const [componentId, flowIds] of componentToFlows.entries()) {
      if (flowIds.length > 1) {
        sharedComponents.set(componentId, flowIds);
      }
    }

    return sharedComponents;
  }
}

// Singleton instance
export const flowAnalyzer = new FlowAnalyzer();
