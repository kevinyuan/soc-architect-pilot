// DRC (Design Rule Check) Service
// Implements comprehensive design rule checking for SoC architecture diagrams

export interface DRCViolation {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: 'critical' | 'warning' | 'info';
  category: string;
  location: string;
  description: string;
  suggestion: string;
  affectedComponents?: string[];
  affectedInterfaces?: string[];
  affectedConnections?: string[];
  details?: Record<string, any>;
}

export interface DRCResult {
  timestamp: string;
  totalChecks: number;
  violations: DRCViolation[];
  summary: {
    critical: number;
    warning: number;
    info: number;
  };
  passed: boolean;
}

interface ComponentNode {
  id: string;
  data: {
    label: string;
    model_type?: string;
    category?: string;
    target_addr_base?: string;
    target_addr_space?: string;
    [key: string]: any;
  };
}

interface ComponentInterface {
  id: string;
  name: string;
  type: string;
  direction: 'master' | 'slave' | 'in' | 'out';
  busType?: string;
  dataWidth?: number;
  addrWidth?: number;
  idWidth?: number;
  speed?: string;
  protocol?: string;
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

export class DRCChecker {
  private violations: DRCViolation[] = [];
  private violationCounter = 0;
  private componentLibrary: Map<string, any> = new Map();
  private diagram: ArchitectureDiagram | null = null;

  async checkDiagram(diagram: ArchitectureDiagram, componentLibrary?: any[], options?: { checkOptionalPorts?: boolean }): Promise<DRCResult> {
    this.violations = [];
    this.violationCounter = 0;
    this.diagram = diagram; // Store diagram for helper methods
    const checkOptionalPorts = options?.checkOptionalPorts ?? false;

    // Load component library for interface information
    if (componentLibrary) {
      componentLibrary.forEach(comp => {
        this.componentLibrary.set(comp.id, comp);
      });
    }

    // Run all checks
    await this.checkConnectivityRules(diagram, checkOptionalPorts);
    await this.checkAXI4ParameterRules(diagram);
    await this.checkAddressSpaceRules(diagram);
    await this.checkTopologyRules(diagram);
    await this.checkPerformanceRules(diagram);
    await this.checkParameterValidityRules(diagram);
    await this.checkNamingConventionRules(diagram);

    // Calculate summary
    const summary = {
      critical: this.violations.filter(v => v.severity === 'critical').length,
      warning: this.violations.filter(v => v.severity === 'warning').length,
      info: this.violations.filter(v => v.severity === 'info').length,
    };

    return {
      timestamp: new Date().toISOString(),
      totalChecks: this.violationCounter,
      violations: this.violations,
      summary,
      passed: summary.critical === 0,
    };
  }

  private addViolation(violation: Omit<DRCViolation, 'id'>): void {
    this.violations.push({
      id: `DRC-VIOLATION-${++this.violationCounter}`,
      ...violation,
    });
  }

  // Helper: Get readable node name from ID
  private getNodeName(nodeId: string): string {
    if (!this.diagram) return nodeId;
    const node = this.diagram.nodes.find(n => n.id === nodeId);
    return node?.data.label || nodeId;
  }

  // Helper: Get readable interface name from node ID and interface ID
  private getInterfaceName(nodeId: string, interfaceId: string): string {
    if (!this.diagram) return interfaceId;
    const interfaces = this.getComponentInterfaces(nodeId, this.diagram);
    const iface = interfaces.find(i => i.id === interfaceId);
    return iface?.name || interfaceId;
  }

  // Helper: Get full readable location (NodeName.InterfaceName)
  private getInterfaceLocation(nodeId: string, interfaceId?: string): string {
    const nodeName = this.getNodeName(nodeId);
    if (!interfaceId) return nodeName;
    const interfaceName = this.getInterfaceName(nodeId, interfaceId);
    return `${nodeName}.${interfaceName}`;
  }

  // Helper: Get connection description (Source.Interface → Target.Interface)
  private getConnectionDescription(edge: Connection): string {
    const sourceLoc = this.getInterfaceLocation(edge.source, edge.sourceHandle);
    const targetLoc = this.getInterfaceLocation(edge.target, edge.targetHandle);
    return `${sourceLoc} → ${targetLoc}`;
  }

  private getComponentInterfaces(nodeId: string, diagram: ArchitectureDiagram): ComponentInterface[] {
    const node = diagram.nodes.find(n => n.id === nodeId);
    if (!node) return [];

    // ALWAYS use interfaces from the diagram node data first
    // The diagram already has the complete interface information
    if (node.data.interfaces && Array.isArray(node.data.interfaces) && node.data.interfaces.length > 0) {
      console.log(`[DRC] Using ${node.data.interfaces.length} interfaces from diagram for node ${node.data.label} (${nodeId})`);
      return node.data.interfaces.map((iface: any) => ({
        id: iface.id,
        name: iface.name || iface.id,
        busType: iface.busType || iface.type || 'AXI4', // Use busType as primary, type as fallback
        direction: iface.direction,
        dataWidth: iface.dataWidth, // Use ONLY dataWidth (width is obsolete)
        addrWidth: iface.addrWidth || iface.addressWidth,
        idWidth: iface.idWidth,
        speed: iface.speed || iface.frequency,
        protocol: iface.protocol,
        optional: iface.optional,
        // Backward compatibility for type field
        type: iface.busType || iface.type
      }));
    }

    // If no interfaces in diagram, log a warning
    console.warn(`[DRC] ⚠️ Node ${node.data.label} (${nodeId}) has no interfaces in diagram data`);
    return [];
  }

  // ============================================================================
  // A. Connectivity Rules
  // ============================================================================

  private async checkConnectivityRules(diagram: ArchitectureDiagram, checkOptionalPorts: boolean = false): Promise<void> {
    // DRC-CONN-008: Multiple Connections to Same Port (CRITICAL)
    // Check that no single interface/port has multiple connections
    const portConnectionCount = new Map<string, { count: number; connections: string[] }>();
    
    for (const edge of diagram.edges) {
      // Track source port usage
      if (edge.sourceHandle) {
        const portKey = `${edge.source}:${edge.sourceHandle}`;
        const existing = portConnectionCount.get(portKey) || { count: 0, connections: [] };
        existing.count++;
        existing.connections.push(edge.id);
        portConnectionCount.set(portKey, existing);
      }
      
      // Track target port usage
      if (edge.targetHandle) {
        const portKey = `${edge.target}:${edge.targetHandle}`;
        const existing = portConnectionCount.get(portKey) || { count: 0, connections: [] };
        existing.count++;
        existing.connections.push(edge.id);
        portConnectionCount.set(portKey, existing);
      }
    }
    
    // Report violations for ports with multiple connections
    for (const [portKey, usage] of portConnectionCount.entries()) {
      if (usage.count > 1) {
        const [nodeId, interfaceId] = portKey.split(':');
        const node = diagram.nodes.find(n => n.id === nodeId);
        const nodeName = node?.data?.label || nodeId;
        const interfaces = this.getComponentInterfaces(nodeId, diagram);
        const intf = interfaces.find(i => i.id === interfaceId);
        const intfName = intf?.name || interfaceId;
        
        this.addViolation({
          ruleId: 'DRC-CONN-008',
          ruleName: 'Multiple Connections to Same Port',
          severity: 'critical',
          category: 'Connectivity',
          location: `${nodeName}.${intfName}`,
          description: `Port '${intfName}' on component '${nodeName}' has ${usage.count} connections. Each port can only have one connection.`,
          suggestion: `Add more ports to '${nodeName}' or use a different port for each connection. Interconnects should have sufficient ports for all connected components.`,
          affectedComponents: [nodeId],
          affectedInterfaces: [interfaceId],
          affectedConnections: usage.connections,
          details: {
            nodeId,
            nodeName,
            interfaceId,
            interfaceName: intfName,
            connectionCount: usage.count,
            connections: usage.connections
          }
        });
      }
    }

    // DRC-CONN-003: Interface and Instance Existence
    for (const edge of diagram.edges) {
      const sourceNode = diagram.nodes.find(n => n.id === edge.source);
      const targetNode = diagram.nodes.find(n => n.id === edge.target);

      if (!sourceNode) {
        const location = edge.id ? `Connection ${edge.id}` : `Connection from '${edge.source}' to '${edge.target}'`;
        this.addViolation({
          ruleId: 'DRC-CONN-003',
          ruleName: 'Interface and Instance Existence',
          severity: 'critical',
          category: 'Connectivity',
          location,
          description: `Source node '${edge.source}' does not exist`,
          suggestion: 'Remove the invalid connection or add the missing component',
          affectedConnections: edge.id ? [edge.id] : [],
          details: {
            missingNode: edge.source,
            targetNode: edge.target,
            edgeId: edge.id || 'N/A'
          }
        });
      }

      if (!targetNode) {
        const location = edge.id ? `Connection ${edge.id}` : `Connection from '${edge.source}' to '${edge.target}'`;
        this.addViolation({
          ruleId: 'DRC-CONN-003',
          ruleName: 'Interface and Instance Existence',
          severity: 'critical',
          category: 'Connectivity',
          location,
          description: `Target node '${edge.target}' does not exist`,
          suggestion: 'Remove the invalid connection or add the missing component',
          affectedConnections: edge.id ? [edge.id] : [],
          details: {
            sourceNode: edge.source,
            missingNode: edge.target,
            edgeId: edge.id || 'N/A'
          }
        });
      }
    }

    // DRC-CONN-001: Master-Slave Role Matching
    // DRC-CONN-002: Bus Type Matching
    for (const edge of diagram.edges) {
      const sourceNode = diagram.nodes.find(n => n.id === edge.source);
      const targetNode = diagram.nodes.find(n => n.id === edge.target);

      if (!sourceNode || !targetNode) continue;

      const sourceInterfaces = this.getComponentInterfaces(edge.source, diagram);
      const targetInterfaces = this.getComponentInterfaces(edge.target, diagram);

      // Debug logging
      console.log(`\n=== Checking connection: ${sourceNode.data.label} → ${targetNode.data.label} ===`);
      console.log(`Source interfaces (${sourceInterfaces.length}):`, sourceInterfaces.map(i => `${i.name} (${i.direction})`));
      console.log(`Target interfaces (${targetInterfaces.length}):`, targetInterfaces.map(i => `${i.name} (${i.direction})`));
      console.log(`Edge handles: source=${edge.sourceHandle}, target=${edge.targetHandle}`);

      // Check if we have interface information
      if (sourceInterfaces.length > 0 && targetInterfaces.length > 0) {
        // Smart interface selection when handles aren't specified
        let sourceIntf = edge.sourceHandle
          ? sourceInterfaces.find(i => i.id === edge.sourceHandle)
          : sourceInterfaces.find(i => i.direction === 'master') || sourceInterfaces[0];
        let targetIntf = edge.targetHandle
          ? targetInterfaces.find(i => i.id === edge.targetHandle)
          : targetInterfaces.find(i => i.direction === 'slave') || targetInterfaces[0];

        console.log(`Selected interfaces: ${sourceIntf?.name} (${sourceIntf?.direction}) → ${targetIntf?.name} (${targetIntf?.direction})`);

        if (sourceIntf && targetIntf) {
          // Check master-slave matching
          if (sourceIntf.direction === 'master' && targetIntf.direction !== 'slave') {
            const connectionDesc = this.getConnectionDescription(edge);
            this.addViolation({
              ruleId: 'DRC-CONN-001',
              ruleName: 'Master-Slave Role Matching',
              severity: 'critical',
              category: 'Connectivity',
              location: connectionDesc,
              description: `Master interface connected to non-slave interface (${targetIntf.direction}). Master interfaces must connect to slave interfaces.`,
              suggestion: 'Ensure master interfaces connect only to slave interfaces. If connecting to an interconnect, use its slave port.',
              affectedComponents: [edge.source, edge.target],
              affectedInterfaces: [sourceIntf.id, targetIntf.id],
              affectedConnections: [edge.id],
              details: {
                source: {
                  node: this.getNodeName(edge.source),
                  interface: sourceIntf.name,
                  direction: sourceIntf.direction
                },
                target: {
                  node: this.getNodeName(edge.target),
                  interface: targetIntf.name,
                  direction: targetIntf.direction
                },
                connection: connectionDesc
              }
            });
          }

          // Check slave-to-slave (invalid - two responders can't talk to each other)
          if (sourceIntf.direction === 'slave' && targetIntf.direction === 'slave') {
            const connectionDesc = this.getConnectionDescription(edge);
            this.addViolation({
              ruleId: 'DRC-CONN-001',
              ruleName: 'Master-Slave Role Matching',
              severity: 'critical',
              category: 'Connectivity',
              location: connectionDesc,
              description: `Slave interface connected to slave interface. Two slave interfaces cannot communicate directly.`,
              suggestion: 'Slave interfaces must be connected to master interfaces. You may need an interconnect or bridge component.',
              affectedComponents: [edge.source, edge.target],
              affectedInterfaces: [sourceIntf.id, targetIntf.id],
              affectedConnections: [edge.id],
              details: {
                source: {
                  node: this.getNodeName(edge.source),
                  interface: sourceIntf.name,
                  direction: sourceIntf.direction
                },
                target: {
                  node: this.getNodeName(edge.target),
                  interface: targetIntf.name,
                  direction: targetIntf.direction
                },
                connection: connectionDesc
              }
            });
          }

          // Check out-to-out (invalid - two outputs can't connect)
          if (sourceIntf.direction === 'out' && targetIntf.direction === 'out') {
            const connectionDesc = this.getConnectionDescription(edge);
            this.addViolation({
              ruleId: 'DRC-CONN-007',
              ruleName: 'Signal Direction Matching',
              severity: 'critical',
              category: 'Connectivity',
              location: connectionDesc,
              description: `Output signal connected to output signal. Two outputs cannot be connected together.`,
              suggestion: 'Connect output signals to input signals only. Check the signal direction.',
              affectedComponents: [edge.source, edge.target],
              affectedInterfaces: [sourceIntf.id, targetIntf.id],
              affectedConnections: [edge.id],
              details: {
                source: { node: this.getNodeName(edge.source), interface: sourceIntf.name, direction: 'out' },
                target: { node: this.getNodeName(edge.target), interface: targetIntf.name, direction: 'out' },
                connection: connectionDesc
              }
            });
          }

          // Check in-to-in (invalid - two inputs can't connect)
          if (sourceIntf.direction === 'in' && targetIntf.direction === 'in') {
            const connectionDesc = this.getConnectionDescription(edge);
            this.addViolation({
              ruleId: 'DRC-CONN-007',
              ruleName: 'Signal Direction Matching',
              severity: 'critical',
              category: 'Connectivity',
              location: connectionDesc,
              description: `Input signal connected to input signal. Two inputs cannot be connected together.`,
              suggestion: 'Connect input signals from output signals. Check the signal direction and connection order.',
              affectedComponents: [edge.source, edge.target],
              affectedInterfaces: [sourceIntf.id, targetIntf.id],
              affectedConnections: [edge.id],
              details: {
                source: { node: this.getNodeName(edge.source), interface: sourceIntf.name, direction: 'in' },
                target: { node: this.getNodeName(edge.target), interface: targetIntf.name, direction: 'in' },
                connection: connectionDesc
              }
            });
          }

          // Check in-to-out (reverse direction warning)
          if (sourceIntf.direction === 'in' && targetIntf.direction === 'out') {
            const connectionDesc = this.getConnectionDescription(edge);
            this.addViolation({
              ruleId: 'DRC-CONN-007',
              ruleName: 'Signal Direction Matching',
              severity: 'warning',
              category: 'Connectivity',
              location: connectionDesc,
              description: `Input connected to output. Connection direction may be reversed.`,
              suggestion: 'Typically, connections flow from output to input. Consider reversing this connection.',
              affectedComponents: [edge.source, edge.target],
              affectedInterfaces: [sourceIntf.id, targetIntf.id],
              affectedConnections: [edge.id],
              details: {
                source: { node: this.getNodeName(edge.source), interface: sourceIntf.name, direction: 'in' },
                target: { node: this.getNodeName(edge.target), interface: targetIntf.name, direction: 'out' },
                connection: connectionDesc
              }
            });
          }

          // Check bus type matching (use 'type' field)
          const sourceType = sourceIntf.type || sourceIntf.busType;
          const targetType = targetIntf.type || targetIntf.busType;

          if (sourceType && targetType && sourceType !== targetType) {
            const connectionDesc = this.getConnectionDescription(edge);
            this.addViolation({
              ruleId: 'DRC-CONN-002',
              ruleName: 'Bus Type Matching',
              severity: 'critical',
              category: 'Connectivity',
              location: connectionDesc,
              description: `Bus type mismatch: ${sourceType} → ${targetType}`,
              suggestion: `Change interface types to match or add a protocol converter`,
              affectedComponents: [edge.source, edge.target],
              affectedInterfaces: [sourceIntf.id, targetIntf.id],
              affectedConnections: [edge.id],
              details: {
                source: { node: this.getNodeName(edge.source), interface: sourceIntf.name, busType: sourceType },
                target: { node: this.getNodeName(edge.target), interface: targetIntf.name, busType: targetType },
                connection: connectionDesc
              },
            });
          }
        }
      }
    }

    // DRC-CONN-005: Multiple Masters to One Slave Interface
    // Check per-interface, not per-module (a module can have multiple slave interfaces)
    const slaveInterfaceConnections = new Map<string, { nodeId: string; interfaceId: string; sources: string[] }>();

    for (const edge of diagram.edges) {
      const targetNode = diagram.nodes.find(n => n.id === edge.target);
      if (!targetNode) continue;

      // Create a unique key for each slave interface (node + interface)
      const targetInterfaceKey = `${edge.target}::${edge.targetHandle || 'default'}`;

      if (!slaveInterfaceConnections.has(targetInterfaceKey)) {
        slaveInterfaceConnections.set(targetInterfaceKey, {
          nodeId: edge.target,
          interfaceId: edge.targetHandle || 'default',
          sources: []
        });
      }
      slaveInterfaceConnections.get(targetInterfaceKey)!.sources.push(edge.source);
    }

    for (const [key, connection] of slaveInterfaceConnections.entries()) {
      if (connection.sources.length > 1) {
        const targetNode = diagram.nodes.find(n => n.id === connection.nodeId);
        const targetInterfaces = this.getComponentInterfaces(connection.nodeId, diagram);
        const targetInterface = targetInterfaces.find(i => i.id === connection.interfaceId);

        // Check if the target is an interconnect (interconnects are designed to handle multiple masters)
        const isInterconnect = targetNode?.data.model_type === 'Interconnect' ||
          targetNode?.data.category === 'Interconnect' ||
          targetNode?.data.label?.toLowerCase().includes('crossbar') ||
          targetNode?.data.label?.toLowerCase().includes('arbiter') ||
          targetNode?.data.label?.toLowerCase().includes('interconnect');

        if (!isInterconnect) {
          const slaveLocation = this.getInterfaceLocation(connection.nodeId, connection.interfaceId);
          const interfaceName = targetInterface?.name || connection.interfaceId;
          
          // Get detailed master information
          const masterDetails = connection.sources.map(sourceId => {
            // Find the edge to get the source interface
            const edge = diagram.edges.find(e => e.source === sourceId && e.target === connection.nodeId && e.targetHandle === connection.interfaceId);
            const sourceInterfaceName = edge?.sourceHandle ? this.getInterfaceName(sourceId, edge.sourceHandle) : 'unknown';
            return {
              nodeName: this.getNodeName(sourceId),
              interfaceName: sourceInterfaceName,
              fullPath: this.getInterfaceLocation(sourceId, edge?.sourceHandle)
            };
          });

          this.addViolation({
            ruleId: 'DRC-CONN-005',
            ruleName: 'Multiple Masters to One Slave Interface',
            severity: 'critical',
            category: 'Connectivity',
            location: slaveLocation,
            description: `${connection.sources.length} masters connected to slave interface without arbitration`,
            suggestion: 'Add an AXI Crossbar, Arbiter, or Interconnect between masters and this slave interface',
            affectedComponents: [connection.nodeId, ...connection.sources],
            affectedInterfaces: targetInterface ? [targetInterface.id] : [],
            details: {
              slave: {
                node: this.getNodeName(connection.nodeId),
                interface: interfaceName,
                fullPath: slaveLocation
              },
              masterCount: connection.sources.length,
              masters: masterDetails,
              connections: masterDetails.map(m => `${m.fullPath} → ${slaveLocation}`)
            },
          });
        }
      }
    }

    // DRC-CONN-004 & DRC-CONN-006: Unconnected Interfaces
    for (const node of diagram.nodes) {
      const interfaces = this.getComponentInterfaces(node.id, diagram);
      const connectedInterfaces = new Set<string>();

      for (const edge of diagram.edges) {
        if (edge.source === node.id && edge.sourceHandle) {
          connectedInterfaces.add(edge.sourceHandle);
        }
        if (edge.target === node.id && edge.targetHandle) {
          connectedInterfaces.add(edge.targetHandle);
        }
      }

      for (const intf of interfaces) {
        if (!connectedInterfaces.has(intf.id)) {
          // Check if interface is marked as optional in component definition
          const isOptional = (intf as any).optional === true;

          // Skip optional interfaces if checking is disabled
          if (isOptional && !checkOptionalPorts) {
            continue;
          }

          if (intf.direction === 'master') {
            const location = this.getInterfaceLocation(node.id, intf.id);
            this.addViolation({
              ruleId: 'DRC-CONN-004',
              ruleName: 'Unconnected Master Interface',
              severity: 'warning',
              category: 'Connectivity',
              location,
              description: `Master interface is not connected`,
              suggestion: 'Connect to a slave interface or mark as optional if intentional',
              affectedComponents: [node.id],
              affectedInterfaces: [intf.id],
              details: {
                node: this.getNodeName(node.id),
                interface: intf.name,
                direction: intf.direction,
                busType: intf.busType || intf.type,
                optional: isOptional
              }
            });
          } else if (intf.direction === 'slave') {
            const location = this.getInterfaceLocation(node.id, intf.id);
            this.addViolation({
              ruleId: 'DRC-CONN-006',
              ruleName: 'Unconnected Slave Interface',
              severity: 'info',
              category: 'Connectivity',
              location,
              description: `Slave interface is not connected`,
              suggestion: 'Connect from a master interface or remove if unused',
              affectedComponents: [node.id],
              affectedInterfaces: [intf.id],
              details: {
                node: this.getNodeName(node.id),
                interface: intf.name,
                direction: intf.direction,
                busType: intf.busType || intf.type,
                optional: isOptional
              }
            });
          }
        }
      }
    }
  }

  // ============================================================================
  // B. AXI4 Parameter Compatibility Rules
  // ============================================================================

  private async checkAXI4ParameterRules(diagram: ArchitectureDiagram): Promise<void> {
    for (const edge of diagram.edges) {
      const sourceNode = diagram.nodes.find(n => n.id === edge.source);
      const targetNode = diagram.nodes.find(n => n.id === edge.target);

      if (!sourceNode || !targetNode) continue;

      const sourceInterfaces = this.getComponentInterfaces(edge.source, diagram);
      const targetInterfaces = this.getComponentInterfaces(edge.target, diagram);

      const sourceIntf = edge.sourceHandle
        ? sourceInterfaces.find(i => i.id === edge.sourceHandle)
        : sourceInterfaces.find(i => i.busType === 'AXI4' || i.busType === 'axi-4');
      const targetIntf = edge.targetHandle
        ? targetInterfaces.find(i => i.id === edge.targetHandle)
        : targetInterfaces.find(i => i.busType === 'AXI4' || i.busType === 'axi-4');

      // Only check AXI4 interfaces
      if (!sourceIntf || !targetIntf) continue;
      const sourceType = sourceIntf.busType;
      const targetType = targetIntf.busType;
      if (!sourceType?.includes('AXI') && !sourceType?.includes('axi')) continue;
      if (!targetType?.includes('AXI') && !targetType?.includes('axi')) continue;

      // DRC-AXI-PARAM-001: Data Width Matching
      if (sourceIntf.dataWidth && targetIntf.dataWidth && sourceIntf.dataWidth !== targetIntf.dataWidth) {
        const connectionDesc = this.getConnectionDescription(edge);
        this.addViolation({
          ruleId: 'DRC-AXI-PARAM-001',
          ruleName: 'Data Width Matching',
          severity: 'critical',
          category: 'AXI4 Parameters',
          location: connectionDesc,
          description: `AXI4 data width mismatch: ${sourceIntf.dataWidth}-bit → ${targetIntf.dataWidth}-bit`,
          suggestion: 'Use matching data widths or add a width converter',
          affectedComponents: [edge.source, edge.target],
          affectedInterfaces: [sourceIntf.id, targetIntf.id],
          affectedConnections: [edge.id],
          details: {
            source: {
              node: this.getNodeName(edge.source),
              interface: sourceIntf.name,
              dataWidth: sourceIntf.dataWidth
            },
            target: {
              node: this.getNodeName(edge.target),
              interface: targetIntf.name,
              dataWidth: targetIntf.dataWidth
            },
            connection: connectionDesc
          },
        });
      }

      // DRC-AXI-PARAM-002: ID Width Compatibility
      if (sourceIntf.idWidth && targetIntf.idWidth && sourceIntf.idWidth > targetIntf.idWidth) {
        const connectionDesc = this.getConnectionDescription(edge);
        console.log(`[DRC] ID Width Violation: ${connectionDesc}`);
        console.log(`[DRC] Source: ${sourceIntf.name} (${sourceIntf.idWidth} bits), Target: ${targetIntf.name} (${targetIntf.idWidth} bits)`);

        this.addViolation({
          ruleId: 'DRC-AXI-PARAM-002',
          ruleName: 'ID Width Compatibility',
          severity: 'critical',
          category: 'AXI4 Parameters',
          location: connectionDesc,
          description: `Master ID width (${sourceIntf.idWidth} bits) exceeds slave ID width (${targetIntf.idWidth} bits)`,
          suggestion: `Increase slave ID width to at least ${sourceIntf.idWidth} bits or reduce master ID width to ${targetIntf.idWidth} bits`,
          affectedComponents: [edge.source, edge.target],
          affectedInterfaces: [sourceIntf.id, targetIntf.id],
          affectedConnections: [edge.id],
          details: {
            source: {
              node: this.getNodeName(edge.source),
              interface: sourceIntf.name,
              idWidth: sourceIntf.idWidth
            },
            target: {
              node: this.getNodeName(edge.target),
              interface: targetIntf.name,
              idWidth: targetIntf.idWidth
            },
            connection: connectionDesc
          },
        });
      }

      // DRC-AXI-PARAM-003: Address Width Consistency
      if (sourceIntf.addrWidth && targetIntf.addrWidth && sourceIntf.addrWidth !== targetIntf.addrWidth) {
        const connectionDesc = this.getConnectionDescription(edge);
        this.addViolation({
          ruleId: 'DRC-AXI-PARAM-003',
          ruleName: 'Address Width Consistency',
          severity: 'warning',
          category: 'AXI4 Parameters',
          location: connectionDesc,
          description: `AXI4 address width mismatch: ${sourceIntf.addrWidth}-bit → ${targetIntf.addrWidth}-bit`,
          suggestion: 'Consider using consistent address widths or verify address mapping',
          affectedComponents: [edge.source, edge.target],
          affectedInterfaces: [sourceIntf.id, targetIntf.id],
          affectedConnections: [edge.id],
          details: {
            source: {
              node: this.getNodeName(edge.source),
              interface: sourceIntf.name,
              addrWidth: sourceIntf.addrWidth
            },
            target: {
              node: this.getNodeName(edge.target),
              interface: targetIntf.name,
              addrWidth: targetIntf.addrWidth
            },
            connection: connectionDesc
          },
        });
      }

      // DRC-AXI-PARAM-004: Clock Frequency Compatibility
      if (sourceIntf.speed && targetIntf.speed && sourceIntf.speed !== targetIntf.speed) {
        const connectionDesc = this.getConnectionDescription(edge);
        this.addViolation({
          ruleId: 'DRC-AXI-PARAM-004',
          ruleName: 'Clock Frequency Compatibility',
          severity: 'warning',
          category: 'AXI4 Parameters',
          location: connectionDesc,
          description: `Clock frequency mismatch: ${sourceIntf.speed} → ${targetIntf.speed}`,
          suggestion: 'Add clock domain crossing logic or synchronize to same clock',
          affectedComponents: [edge.source, edge.target],
          affectedInterfaces: [sourceIntf.id, targetIntf.id],
          affectedConnections: [edge.id],
          details: {
            source: {
              node: this.getNodeName(edge.source),
              interface: sourceIntf.name,
              speed: sourceIntf.speed
            },
            target: {
              node: this.getNodeName(edge.target),
              interface: targetIntf.name,
              speed: targetIntf.speed
            },
            connection: connectionDesc
          },
        });
      }
    }
  }

  // ============================================================================
  // C. Address Space Rules
  // ============================================================================

  private async checkAddressSpaceRules(diagram: ArchitectureDiagram): Promise<void> {
    const addressRanges: Array<{
      nodeId: string;
      label: string;
      baseAddr: bigint;
      endAddr: bigint;
      space: string;
    }> = [];

    // Parse address spaces
    for (const node of diagram.nodes) {
      const baseAddrStr = node.data.target_addr_base || node.data.addressMapping?.baseAddress;
      const spaceStr = node.data.target_addr_space || node.data.addressMapping?.addressSpace;

      if (baseAddrStr && spaceStr && baseAddrStr !== '' && spaceStr !== '') {
        try {
          const baseAddr = this.parseAddress(baseAddrStr);
          const size = this.parseSize(spaceStr);
          const endAddr = baseAddr + size - BigInt(1);

          addressRanges.push({
            nodeId: node.id,
            label: node.data.label,
            baseAddr,
            endAddr,
            space: spaceStr,
          });
        } catch (e) {
          // Invalid address format
        }
      }
    }

    // DRC-ADDR-001: Address Space Overlap
    for (let i = 0; i < addressRanges.length; i++) {
      for (let j = i + 1; j < addressRanges.length; j++) {
        const range1 = addressRanges[i];
        const range2 = addressRanges[j];

        const overlaps = !(range1.endAddr < range2.baseAddr || range2.endAddr < range1.baseAddr);

        if (overlaps) {
          this.addViolation({
            ruleId: 'DRC-ADDR-001',
            ruleName: 'Address Space Overlap',
            severity: 'critical',
            category: 'Address Space',
            location: `${range1.label} ↔ ${range2.label}`,
            description: `Address space overlap detected: [0x${range1.baseAddr.toString(16)}-0x${range1.endAddr.toString(16)}] overlaps with [0x${range2.baseAddr.toString(16)}-0x${range2.endAddr.toString(16)}]`,
            suggestion: 'Reassign address ranges to eliminate overlap',
            affectedComponents: [range1.nodeId, range2.nodeId],
            details: {
              component1: { label: range1.label, base: `0x${range1.baseAddr.toString(16)}`, end: `0x${range1.endAddr.toString(16)}` },
              component2: { label: range2.label, base: `0x${range2.baseAddr.toString(16)}`, end: `0x${range2.endAddr.toString(16)}` },
            },
          });
        }
      }
    }

    // DRC-ADDR-002: Address Alignment
    for (const range of addressRanges) {
      const size = this.parseSize(range.space);
      if (size > BigInt(0) && range.baseAddr % size !== BigInt(0)) {
        this.addViolation({
          ruleId: 'DRC-ADDR-002',
          ruleName: 'Address Alignment',
          severity: 'warning',
          category: 'Address Space',
          location: range.label,
          description: `Address 0x${range.baseAddr.toString(16)} is not aligned to size ${range.space}`,
          suggestion: `Align base address to ${range.space} boundary (e.g., 0x${(range.baseAddr - (range.baseAddr % size)).toString(16)})`,
          affectedComponents: [range.nodeId],
          details: {
            baseAddress: `0x${range.baseAddr.toString(16)}`,
            size: range.space,
            suggestedAddress: `0x${(range.baseAddr - (range.baseAddr % size) + size).toString(16)}`,
          },
        });
      }
    }

    // DRC-ADDR-004: Reserved Address Space
    const reservedRanges = [
      { start: BigInt(0x00000000), end: BigInt(0x000FFFFF), name: 'Boot ROM' },
      { start: BigInt(0xFFFF0000), end: BigInt(0xFFFFFFFF), name: 'High vectors' },
    ];

    for (const range of addressRanges) {
      for (const reserved of reservedRanges) {
        const overlaps = !(range.endAddr < reserved.start || range.baseAddr > reserved.end);
        if (overlaps) {
          this.addViolation({
            ruleId: 'DRC-ADDR-004',
            ruleName: 'Reserved Address Space',
            severity: 'info',
            category: 'Address Space',
            location: range.label,
            description: `Component uses reserved address space (${reserved.name})`,
            suggestion: 'Consider moving to non-reserved address range if not intentional',
            affectedComponents: [range.nodeId],
            details: {
              reservedRange: reserved.name,
              componentRange: `0x${range.baseAddr.toString(16)}-0x${range.endAddr.toString(16)}`,
            },
          });
        }
      }
    }
  }

  private parseAddress(addr: string): bigint {
    const cleaned = addr.trim().toLowerCase().replace(/_/g, '');
    if (cleaned.startsWith('0x')) {
      return BigInt(cleaned);
    }
    return BigInt(parseInt(cleaned, 10));
  }

  private parseSize(size: string): bigint {
    const cleaned = size.trim().toUpperCase();
    const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB|B)?$/);

    if (!match) return BigInt(0);

    const value = parseFloat(match[1]);
    const unit = match[2] || 'B';

    const multipliers: Record<string, number> = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024,
      'TB': 1024 * 1024 * 1024 * 1024,
    };

    return BigInt(Math.floor(value * multipliers[unit]));
  }

  // ============================================================================
  // D. Topology Rules
  // ============================================================================

  private async checkTopologyRules(diagram: ArchitectureDiagram): Promise<void> {
    // DRC-TOPO-001: Circular Dependency
    const cycles = this.detectCycles(diagram);
    for (const cycle of cycles) {
      const cycleLabels = cycle.map(id => diagram.nodes.find(n => n.id === id)?.data.label || id);
      this.addViolation({
        ruleId: 'DRC-TOPO-001',
        ruleName: 'Circular Dependency',
        severity: 'critical',
        category: 'Topology',
        location: cycleLabels.join(' → '),
        description: `Circular dependency detected in connection path`,
        suggestion: 'Remove one connection to break the cycle or restructure the design',
        affectedComponents: cycle,
        details: {
          cyclePath: cycleLabels,
        },
      });
    }

    // DRC-TOPO-002: Isolated Components
    const connectedNodes = new Set<string>();
    for (const edge of diagram.edges) {
      connectedNodes.add(edge.source);
      connectedNodes.add(edge.target);
    }

    for (const node of diagram.nodes) {
      if (!connectedNodes.has(node.id)) {
        this.addViolation({
          ruleId: 'DRC-TOPO-002',
          ruleName: 'Isolated Components',
          severity: 'warning',
          category: 'Topology',
          location: node.data.label,
          description: `Component '${node.data.label}' has no connections`,
          suggestion: 'Connect to other components or remove if unused',
          affectedComponents: [node.id],
        });
      }
    }

    // DRC-TOPO-003: Interconnect Fanout
    for (const node of diagram.nodes) {
      const isInterconnect = node.data.model_type === 'Interconnect' ||
        node.data.category === 'Interconnect';

      if (isInterconnect) {
        const fanout = diagram.edges.filter(e => e.source === node.id).length;
        const fanin = diagram.edges.filter(e => e.target === node.id).length;

        if (fanout > 16 || fanin > 16) {
          this.addViolation({
            ruleId: 'DRC-TOPO-003',
            ruleName: 'Interconnect Fanout',
            severity: 'warning',
            category: 'Topology',
            location: node.data.label,
            description: `High fanout/fanin count: ${fanin} inputs, ${fanout} outputs`,
            suggestion: 'Consider splitting into multiple interconnects or using hierarchical design',
            affectedComponents: [node.id],
            details: {
              fanin,
              fanout,
            },
          });
        }
      }
    }
  }

  private detectCycles(diagram: ArchitectureDiagram): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recStack.add(nodeId);
      path.push(nodeId);

      const outgoingEdges = diagram.edges.filter(e => e.source === nodeId);
      for (const edge of outgoingEdges) {
        if (!visited.has(edge.target)) {
          if (dfs(edge.target)) {
            return true;
          }
        } else if (recStack.has(edge.target)) {
          // Found a cycle
          const cycleStart = path.indexOf(edge.target);
          const cycle = [...path.slice(cycleStart), edge.target];

          // DEBUG: Log the cycle with edge details
          console.log('[DRC-CYCLE-DEBUG] Cycle detected:');
          for (let i = 0; i < cycle.length - 1; i++) {
            const sourceId = cycle[i];
            const targetId = cycle[i + 1];
            const sourceNode = diagram.nodes.find(n => n.id === sourceId);
            const targetNode = diagram.nodes.find(n => n.id === targetId);
            const edgeInfo = diagram.edges.find(e => e.source === sourceId && e.target === targetId);
            console.log(`  ${sourceNode?.data.label || sourceId} (${edgeInfo?.sourceHandle || 'no handle'}) → ${targetNode?.data.label || targetId} (${edgeInfo?.targetHandle || 'no handle'})`);
            console.log(`    Edge ID: ${edgeInfo?.id}`);
          }

          cycles.push(cycle);
        }
      }

      path.pop();
      recStack.delete(nodeId);
      return false;
    };

    for (const node of diagram.nodes) {
      if (!visited.has(node.id)) {
        dfs(node.id);
      }
    }

    return cycles;
  }

  // ============================================================================
  // E. Performance Rules
  // ============================================================================

  private async checkPerformanceRules(diagram: ArchitectureDiagram): Promise<void> {
    // DRC-PERF-002: Clock Domain Crossing
    for (const edge of diagram.edges) {
      const sourceNode = diagram.nodes.find(n => n.id === edge.source);
      const targetNode = diagram.nodes.find(n => n.id === edge.target);

      if (!sourceNode || !targetNode) continue;

      const sourceInterfaces = this.getComponentInterfaces(edge.source, diagram);
      const targetInterfaces = this.getComponentInterfaces(edge.target, diagram);

      const sourceIntf = edge.sourceHandle
        ? sourceInterfaces.find(i => i.id === edge.sourceHandle)
        : sourceInterfaces[0];
      const targetIntf = edge.targetHandle
        ? targetInterfaces.find(i => i.id === edge.targetHandle)
        : targetInterfaces[0];

      if (sourceIntf?.speed && targetIntf?.speed && sourceIntf.speed !== targetIntf.speed) {
        this.addViolation({
          ruleId: 'DRC-PERF-002',
          ruleName: 'Clock Domain Crossing',
          severity: 'warning',
          category: 'Performance',
          location: `${sourceNode.data.label} → ${targetNode.data.label}`,
          description: `Clock domain crossing detected: ${sourceIntf.speed} → ${targetIntf.speed}`,
          suggestion: 'Add clock domain crossing synchronizers (async FIFO or dual-clock FIFO)',
          affectedComponents: [edge.source, edge.target],
          affectedConnections: edge.id ? [edge.id] : [],
          details: {
            sourceClockFreq: sourceIntf.speed,
            targetClockFreq: targetIntf.speed,
            sourceInterface: sourceIntf.name,
            targetInterface: targetIntf.name
          },
        });
      }
    }

    // DRC-PERF-003: Long Connection Path
    for (const node of diagram.nodes) {
      const isMaster = this.getComponentInterfaces(node.id, diagram).some(i => i.direction === 'master');
      if (isMaster) {
        const paths = this.findAllPaths(node.id, diagram, 5);
        for (const path of paths) {
          if (path.length > 4) {
            const pathLabels = path.map(id => diagram.nodes.find(n => n.id === id)?.data.label || id);
            this.addViolation({
              ruleId: 'DRC-PERF-003',
              ruleName: 'Long Connection Path',
              severity: 'info',
              category: 'Performance',
              location: pathLabels.join(' → '),
              description: `Long connection path detected (${path.length} hops)`,
              suggestion: 'Consider direct connection or reducing intermediate components for better latency',
              affectedComponents: path,
              details: {
                pathLength: path.length,
                path: pathLabels,
              },
            });
          }
        }
      }
    }
  }

  private findAllPaths(startNode: string, diagram: ArchitectureDiagram, maxDepth: number): string[][] {
    const paths: string[][] = [];
    const visited = new Set<string>();

    const dfs = (nodeId: string, currentPath: string[], depth: number) => {
      if (depth > maxDepth) return;

      visited.add(nodeId);
      currentPath.push(nodeId);

      const outgoingEdges = diagram.edges.filter(e => e.source === nodeId);

      if (outgoingEdges.length === 0 && currentPath.length > 1) {
        paths.push([...currentPath]);
      } else {
        for (const edge of outgoingEdges) {
          if (!visited.has(edge.target)) {
            dfs(edge.target, currentPath, depth + 1);
          }
        }
      }

      currentPath.pop();
      visited.delete(nodeId);
    };

    dfs(startNode, [], 0);
    return paths;
  }

  // ============================================================================
  // F. Component Parameter Validity Rules
  // ============================================================================

  private async checkParameterValidityRules(diagram: ArchitectureDiagram): Promise<void> {
    for (const node of diagram.nodes) {
      // DRC-PARAM-VALID-001: Required Parameters
      if (!node.data.label || node.data.label.trim() === '') {
        this.addViolation({
          ruleId: 'DRC-PARAM-VALID-001',
          ruleName: 'Required Parameters',
          severity: 'critical',
          category: 'Parameter Validity',
          location: `Component ${node.id}`,
          description: 'Component missing required label/name',
          suggestion: 'Add a descriptive label to the component',
          affectedComponents: [node.id],
          details: {
            nodeId: node.id,
            modelType: node.data.model_type || 'Unknown'
          }
        });
      }

      // DRC-PARAM-VALID-002: Interface Data Width Required
      const interfaces = this.getComponentInterfaces(node.id, diagram);
      for (const intf of interfaces) {
        // Check if 'dataWidth' property exists and is valid
        const dataWidth = (intf as any).dataWidth || (intf as any).width;
        if (dataWidth === undefined || dataWidth === null) {
          this.addViolation({
            ruleId: 'DRC-PARAM-VALID-002',
            ruleName: 'Interface Data Width Required',
            severity: 'critical',
            category: 'Parameter Validity',
            location: `${node.data.label}.${intf.name}`,
            description: `Interface '${intf.name}' is missing required 'dataWidth' property`,
            suggestion: 'Add a "dataWidth" property to the interface with a numeric value (e.g., 64, 128, 256, 512, 1024)',
            affectedComponents: [node.id],
            affectedInterfaces: [intf.id],
            details: {
              interfaceName: intf.name,
              interfaceId: intf.id,
              availableProperties: Object.keys(intf),
            },
          });
        } else if (typeof dataWidth !== 'number' || isNaN(dataWidth) || dataWidth <= 0) {
          this.addViolation({
            ruleId: 'DRC-PARAM-VALID-002',
            ruleName: 'Interface Data Width Required',
            severity: 'critical',
            category: 'Parameter Validity',
            location: `${node.data.label}.${intf.name}`,
            description: `Interface '${intf.name}' has invalid 'dataWidth' value: ${dataWidth}`,
            suggestion: 'Set "dataWidth" to a positive numeric value (e.g., 64, 128, 256, 512, 1024)',
            affectedComponents: [node.id],
            affectedInterfaces: [intf.id],
            details: {
              currentDataWidth: dataWidth,
              dataWidthType: typeof dataWidth,
            },
          });
        }

        // DRC-PARAM-VALID-003: Data Width Range Check
        if (typeof dataWidth === 'number' && dataWidth > 0) {
          const validWidths = [8, 16, 32, 64, 128, 256, 512, 1024, 2048];
          if (!validWidths.includes(dataWidth)) {
            this.addViolation({
              ruleId: 'DRC-PARAM-VALID-003',
              ruleName: 'Data Width Range Check',
              severity: 'warning',
              category: 'Parameter Validity',
              location: `${node.data.label}.${intf.name}`,
              description: `Unusual interface data width: ${dataWidth} bits`,
              suggestion: `Consider using standard widths: ${validWidths.join(', ')}`,
              affectedComponents: [node.id],
              affectedInterfaces: [intf.id],
              details: {
                currentDataWidth: dataWidth,
                recommendedWidths: validWidths,
              },
            });
          }
        }
      }
    }
  }

  // ============================================================================
  // G. Naming Convention Rules
  // ============================================================================

  private async checkNamingConventionRules(diagram: ArchitectureDiagram): Promise<void> {
    // DRC-NAME-001: Unique Component Names
    const nameCount = new Map<string, string[]>();
    for (const node of diagram.nodes) {
      const label = node.data.label;
      if (!nameCount.has(label)) {
        nameCount.set(label, []);
      }
      nameCount.get(label)!.push(node.id);
    }

    for (const [label, nodeIds] of nameCount.entries()) {
      if (nodeIds.length > 1) {
        this.addViolation({
          ruleId: 'DRC-NAME-001',
          ruleName: 'Unique Component Names',
          severity: 'warning',
          category: 'Naming Convention',
          location: label,
          description: `Duplicate component name '${label}' used ${nodeIds.length} times`,
          suggestion: 'Use unique names for each component instance (e.g., CPU_0, CPU_1)',
          affectedComponents: nodeIds,
          details: {
            duplicateCount: nodeIds.length,
          },
        });
      }
    }

    // DRC-NAME-002: Interface Naming Convention
    for (const node of diagram.nodes) {
      const interfaces = this.getComponentInterfaces(node.id, diagram);
      for (const intf of interfaces) {
        const validPattern = /^[a-z][a-z0-9_-]*$/i;
        if (!validPattern.test(intf.name)) {
          this.addViolation({
            ruleId: 'DRC-NAME-002',
            ruleName: 'Interface Naming Convention',
            severity: 'info',
            category: 'Naming Convention',
            location: `${node.data.label}.${intf.name}`,
            description: `Interface name '${intf.name}' doesn't follow naming convention`,
            suggestion: 'Use lowercase with underscores or hyphens (e.g., axi_master_0)',
            affectedComponents: [node.id],
            affectedInterfaces: [intf.id],
          });
        }
      }
    }
  }
}

// Export singleton instance
export const drcChecker = new DRCChecker();
