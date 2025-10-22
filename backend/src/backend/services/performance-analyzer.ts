// Performance Analyzer Service
// Analyzes performance bottlenecks and maximum throughput for data flows

import { DataFlow } from './flow-analyzer';

export interface PerformanceMetrics {
  flowId: number; // 8-bit flow ID (0x00-0xFF)
  flowName: string;
  maxThroughput: number; // Mbit/s
  bottleneckComponent: {
    id: string;
    label: string;
    type: string;
  };
  bottleneckReason: string;
  estimatedLatency: number; // nanoseconds
  dataWidth?: number; // bits
  frequency?: number; // MHz
  efficiency: number; // 0-100%
  details: ComponentPerformance[];
}

export interface ComponentPerformance {
  componentId: string;
  componentLabel: string;
  componentType: string;
  dataWidth: number; // bits
  frequency: number; // MHz
  bandwidth: number; // Mbit/s
  latency: number; // cycles
  isBottleneck: boolean;
}

interface ArchitectureDiagram {
  nodes: Array<{
    id: string;
    data: Record<string, any>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
  }>;
}

export class PerformanceAnalyzer {
  private componentLibrary: Map<string, any> = new Map();
  private globalClockFrequency: number = 1000; // MHz, default 1GHz

  // Default performance parameters for common component types
  private defaultParams = {
    CPU: { dataWidth: 64, frequency: 1500, latency: 1 },
    Memory: { dataWidth: 128, frequency: 2400, latency: 50 },
    DDR: { dataWidth: 64, frequency: 2400, latency: 50 },
    DDR4: { dataWidth: 64, frequency: 2400, latency: 50 },
    RAM: { dataWidth: 128, frequency: 2000, latency: 40 },
    Interconnect: { dataWidth: 128, frequency: 500, latency: 3 },
    Bridge: { dataWidth: 64, frequency: 400, latency: 5 },
    DMA: { dataWidth: 64, frequency: 800, latency: 2 },
    NPU: { dataWidth: 128, frequency: 1000, latency: 10 },
    GPU: { dataWidth: 256, frequency: 1200, latency: 15 },
    Accelerator: { dataWidth: 128, frequency: 1000, latency: 10 },
    Connectivity: { dataWidth: 32, frequency: 200, latency: 20 },
    Peripheral: { dataWidth: 32, frequency: 100, latency: 10 },
    Storage: { dataWidth: 32, frequency: 400, latency: 50 }
  };

  /**
   * Set global clock frequency for components without explicit settings
   */
  setGlobalClockFrequency(frequency: number): void {
    this.globalClockFrequency = frequency;
    console.log(`[PerformanceAnalyzer] Set global clock frequency to ${frequency} MHz`);
  }

  /**
   * Load component library for performance parameters
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
   * Analyze performance for a single data flow
   */
  analyzeFlow(flow: DataFlow, diagram: ArchitectureDiagram): PerformanceMetrics {
    const componentPerformances: ComponentPerformance[] = [];

    // Extract data width from edges in the flow
    const flowDataWidth = this.extractFlowDataWidth(flow, diagram);

    // Analyze each component in the flow path
    for (let i = 0; i < flow.path.length; i++) {
      const pathComponent = flow.path[i];
      const node = diagram.nodes.find(n => n.id === pathComponent.id);
      if (!node) continue;

      // Determine source and target interfaces for this component
      let sourceInterfaceId: string | undefined;
      let targetInterfaceId: string | undefined;
      
      // Find edges connected to this node in the flow
      const incomingEdge = flow.edges.map(edgeId => diagram.edges.find(e => e.id === edgeId))
        .find(edge => edge && edge.target === pathComponent.id);
      const outgoingEdge = flow.edges.map(edgeId => diagram.edges.find(e => e.id === edgeId))
        .find(edge => edge && edge.source === pathComponent.id);
      
      if (incomingEdge) sourceInterfaceId = incomingEdge.targetHandle;
      if (outgoingEdge) targetInterfaceId = outgoingEdge.sourceHandle;

      const perf = this.analyzeComponent(node, flowDataWidth, sourceInterfaceId, targetInterfaceId);
      componentPerformances.push(perf);
    }

    // Find bottleneck (minimum bandwidth component)
    const bottleneck = this.findBottleneck(componentPerformances);

    // Check if all components have the same bandwidth
    const allBandwidths = componentPerformances.map(c => c.bandwidth);
    const minBandwidth = Math.min(...allBandwidths);
    const maxBandwidth = Math.max(...allBandwidths);
    const allSameBandwidth = minBandwidth === maxBandwidth;

    // Mark bottleneck only if there's actually a bottleneck (not all same bandwidth)
    componentPerformances.forEach(comp => {
      comp.isBottleneck = !allSameBandwidth && comp.componentId === bottleneck.componentId;
    });

    // Calculate total latency
    const totalLatency = this.calculateTotalLatency(componentPerformances);

    // Calculate efficiency
    const maxPossibleBandwidth = Math.max(...componentPerformances.map(c => c.bandwidth));
    const efficiency = maxPossibleBandwidth > 0
      ? (bottleneck.bandwidth / maxPossibleBandwidth) * 100
      : 0;

    return {
      flowId: typeof flow.id === 'number' ? flow.id : parseInt(flow.id) || 0,
      flowName: flow.name,
      maxThroughput: bottleneck.bandwidth,
      bottleneckComponent: {
        id: bottleneck.componentId,
        label: bottleneck.componentLabel,
        type: bottleneck.componentType
      },
      bottleneckReason: this.generateBottleneckReason(bottleneck),
      estimatedLatency: totalLatency,
      dataWidth: flowDataWidth || bottleneck.dataWidth,
      frequency: bottleneck.frequency,
      efficiency: Math.round(efficiency * 10) / 10,
      details: componentPerformances
    };
  }

  /**
   * Extract data width from flow edges
   */
  private extractFlowDataWidth(flow: DataFlow, diagram: ArchitectureDiagram): number | null {
    console.log(`[PerformanceAnalyzer] Extracting data width for flow: ${flow.name}`);
    console.log(`[PerformanceAnalyzer] Flow has ${flow.edges.length} edges:`, flow.edges);
    
    // Check edges in the flow for interface data width
    for (const edgeId of flow.edges) {
      const edge = diagram.edges.find(e => e.id === edgeId);
      if (!edge) {
        console.log(`[PerformanceAnalyzer] Edge ${edgeId} not found in diagram`);
        continue;
      }

      console.log(`[PerformanceAnalyzer] Checking edge ${edgeId}: ${edge.source} (${edge.sourceHandle}) -> ${edge.target} (${edge.targetHandle})`);

      // Try to find the source node and its interface
      const sourceNode = diagram.nodes.find(n => n.id === edge.source);
      if (sourceNode?.data?.interfaces) {
        console.log(`[PerformanceAnalyzer] Source node ${sourceNode.data.label} has ${sourceNode.data.interfaces.length} interfaces:`, 
          JSON.stringify(sourceNode.data.interfaces.map((i: any) => ({ 
            name: i.name, 
            id: i.id, 
            dataWidth: i.dataWidth,
            dataWidthType: typeof i.dataWidth,
            allProps: Object.keys(i)
          })), null, 2));
        
        const sourceInterface = sourceNode.data.interfaces.find(
          (iface: any) => iface.id === edge.sourceHandle
        );
        
        if (sourceInterface) {
          console.log(`[PerformanceAnalyzer] Found source interface:`, JSON.stringify(sourceInterface, null, 2));
          
          // Use ONLY dataWidth (width is obsolete)
          let dataWidth = sourceInterface.dataWidth;

          console.log(`[PerformanceAnalyzer] Interface ${sourceInterface.name} dataWidth: ${dataWidth} (type: ${typeof dataWidth})`);

          if (!dataWidth) {
            console.error(`[PerformanceAnalyzer] ❌ ERROR: Interface ${sourceInterface.name} (${sourceInterface.id}) is missing 'dataWidth' property!`);
            console.error(`[PerformanceAnalyzer] Available properties:`, Object.keys(sourceInterface));
            return null;
          }
          
          // If it's a string, try to parse it
          if (typeof dataWidth === 'string') {
            const parsed = parseInt(dataWidth.replace(/[^\d]/g, ''));
            console.log(`[PerformanceAnalyzer] Parsed string "${dataWidth}" to ${parsed}`);
            if (!isNaN(parsed)) {
              dataWidth = parsed;
            }
          }
          
          if (dataWidth && !isNaN(Number(dataWidth)) && Number(dataWidth) > 0) {
            console.log(`[PerformanceAnalyzer] ✅ Using dataWidth ${dataWidth} bits from interface ${sourceInterface.name}`);
            return Number(dataWidth);
          } else {
            console.error(`[PerformanceAnalyzer] ❌ ERROR: Invalid dataWidth value: ${dataWidth} for interface ${sourceInterface.name}`);
            return null;
          }
        } else {
          console.log(`[PerformanceAnalyzer] Source interface with handle ${edge.sourceHandle} not found. Available:`, 
            sourceNode.data.interfaces.map((i: any) => `${i.name}(${i.id})`));
        }
      }

      // Try target node interface as fallback
      const targetNode = diagram.nodes.find(n => n.id === edge.target);
      if (targetNode?.data?.interfaces) {
        console.log(`[PerformanceAnalyzer] Target node ${targetNode.data.label} has ${targetNode.data.interfaces.length} interfaces`);
        const targetInterface = targetNode.data.interfaces.find(
          (iface: any) => iface.id === edge.targetHandle
        );
        if (targetInterface) {
          // Use ONLY dataWidth (width is obsolete)
          let width = targetInterface.dataWidth;
          console.log(`[PerformanceAnalyzer] Found target interface: ${targetInterface.name}, dataWidth: ${width}`);
          
          if (!width) {
            console.error(`[PerformanceAnalyzer] ❌ ERROR: Target interface ${targetInterface.name} (${targetInterface.id}) is missing 'dataWidth' property!`);
            return null;
          }
          
          // Parse if string
          if (typeof width === 'string') {
            width = parseInt(width.replace(/[^\d]/g, ''));
          }
          
          if (width && !isNaN(Number(width)) && Number(width) > 0) {
            console.log(`[PerformanceAnalyzer] ✅ Using width ${width} bits from target interface ${targetInterface.name}`);
            return Number(width);
          } else {
            console.error(`[PerformanceAnalyzer] ❌ ERROR: Invalid width value: ${width} for target interface ${targetInterface.name}`);
            return null;
          }
        } else {
          console.log(`[PerformanceAnalyzer] Target interface with handle ${edge.targetHandle} not found`);
        }
      }
    }

    console.log(`[PerformanceAnalyzer] ⚠️ No data width found in any interface for flow ${flow.name}`);
    return null;
  }

  /**
   * Analyze performance of a single component
   * Now considers internal paths between interfaces
   */
  private analyzeComponent(node: any, overrideDataWidth?: number | null, sourceInterfaceId?: string, targetInterfaceId?: string): ComponentPerformance {
    const label = node.data.label || 'Unknown';
    const type = node.data.model_type || node.data.category || 'Unknown';

    // Try to find internal path definition
    const pathConfig = this.findInternalPath(node, sourceInterfaceId, targetInterfaceId);
    
    if (pathConfig) {
      console.log(`[PerformanceAnalyzer] Using internal path config for ${label}: ${sourceInterfaceId} -> ${targetInterfaceId}`);
      
      // Use path-specific bandwidth if defined
      const bandwidth = pathConfig.bandwidth || this.calculateDefaultPathBandwidth(node, sourceInterfaceId, targetInterfaceId);
      
      // Use path-specific latency if defined, otherwise use module default or 10
      const latency = pathConfig.latency || node.data.properties?.defaultPathLatency || 10;
      
      // Calculate frequency from bandwidth and data width
      const dataWidth = overrideDataWidth || this.extractDataWidthFromInterface(node, sourceInterfaceId) || 32;
      const frequency = bandwidth / dataWidth; // MHz
      
      return {
        componentId: node.id,
        componentLabel: label,
        componentType: type,
        dataWidth: dataWidth,
        frequency: Math.round(frequency * 100) / 100,
        bandwidth: Math.round(bandwidth * 100) / 100,
        latency: latency,
        isBottleneck: false
      };
    }

    // Fallback: Use old method if no path config
    const params = this.extractPerformanceParams(node, sourceInterfaceId);
    const dataWidth = overrideDataWidth || params.dataWidth;
    const bandwidth = dataWidth * params.frequency;

    return {
      componentId: node.id,
      componentLabel: label,
      componentType: type,
      dataWidth: dataWidth,
      frequency: params.frequency,
      bandwidth: Math.round(bandwidth * 100) / 100,
      latency: params.latency,
      isBottleneck: false
    };
  }

  /**
   * Find internal path configuration between two interfaces
   * Looks for pathLatencies first, then falls back to old paths structure
   */
  private findInternalPath(node: any, sourceInterfaceId?: string, targetInterfaceId?: string): any | null {
    if (!sourceInterfaceId || !targetInterfaceId) return null;
    
    // First, check for new pathLatencies structure
    if (node.data.properties?.pathLatencies && Array.isArray(node.data.properties.pathLatencies)) {
      // Look for exact match
      let pathLatency = node.data.properties.pathLatencies.find((p: any) => 
        p.from === sourceInterfaceId && p.to === targetInterfaceId
      );
      
      if (pathLatency) {
        // Convert pathLatency format to internal path format
        return {
          from: pathLatency.from,
          to: pathLatency.to,
          latency: pathLatency.latencyTypical, // Use latencyTypical for calculations
          bandwidth: pathLatency.bandwidth // May be undefined
        };
      }
    }
    
    // Fallback to old paths structure for backward compatibility
    if (node.data.properties?.paths && Array.isArray(node.data.properties.paths)) {
      // Look for exact match
      let path = node.data.properties.paths.find((p: any) => 
        p.from === sourceInterfaceId && p.to === targetInterfaceId
      );
      
      // Check bidirectional paths
      if (!path) {
        path = node.data.properties.paths.find((p: any) => 
          p.bidirectional && p.from === targetInterfaceId && p.to === sourceInterfaceId
        );
      }
      
      return path || null;
    }
    
    return null;
  }

  /**
   * Calculate default path bandwidth as min(from_interface_bw, to_interface_bw)
   */
  private calculateDefaultPathBandwidth(node: any, sourceInterfaceId?: string, targetInterfaceId?: string): number {
    if (!sourceInterfaceId || !targetInterfaceId) return 1000; // Default 1 Gbit/s
    
    const sourceInterface = node.data.interfaces?.find((i: any) => i.id === sourceInterfaceId);
    const targetInterface = node.data.interfaces?.find((i: any) => i.id === targetInterfaceId);
    
    if (!sourceInterface || !targetInterface) return 1000;
    
    // Calculate bandwidth for source interface (dataWidth * frequency)
    const sourceWidth = sourceInterface.dataWidth || 32;
    const sourceFreq = this.parseFrequency(sourceInterface.speed || sourceInterface.performance?.maxFrequency || '1000 MHz');
    const sourceBandwidth = sourceWidth * sourceFreq; // Mbit/s

    // Calculate bandwidth for target interface
    const targetWidth = targetInterface.dataWidth || 32;
    const targetFreq = this.parseFrequency(targetInterface.speed || targetInterface.performance?.maxFrequency || '1000 MHz');
    const targetBandwidth = targetWidth * targetFreq; // Mbit/s
    
    const minBandwidth = Math.min(sourceBandwidth, targetBandwidth);
    console.log(`[PerformanceAnalyzer] Calculated default path bandwidth: min(${sourceBandwidth}, ${targetBandwidth}) = ${minBandwidth} Mbit/s`);
    
    return minBandwidth;
  }

  /**
   * Extract data width from a specific interface
   */
  private extractDataWidthFromInterface(node: any, interfaceId?: string): number | null {
    if (!interfaceId || !node.data.interfaces) return null;

    const iface = node.data.interfaces.find((i: any) => i.id === interfaceId);
    if (!iface || !iface.dataWidth) return null;

    return this.parseDataWidth(iface.dataWidth);
  }

  /**
   * Extract performance parameters from node data
   * Now supports interface-specific performance characteristics
   */
  private extractPerformanceParams(node: any, interfaceId?: string): {
    dataWidth: number;
    frequency: number;
    latency: number;
  } {
    const type = node.data.model_type || node.data.category || 'Unknown';
    const defaults = this.defaultParams[type as keyof typeof this.defaultParams] || {
      dataWidth: 32,
      frequency: this.globalClockFrequency, // Use global clock frequency as default
      latency: 10
    };

    // Try to extract from node data
    let dataWidth = defaults.dataWidth;
    let frequency = this.globalClockFrequency; // Default to global clock frequency
    let latency = defaults.latency;

    // If interfaceId is provided, try to get interface-specific performance
    let targetInterface = null;
    if (interfaceId && node.data.interfaces && Array.isArray(node.data.interfaces)) {
      targetInterface = node.data.interfaces.find((iface: any) => iface.id === interfaceId);
      
      if (targetInterface) {
        console.log(`[PerformanceAnalyzer] Using interface-specific performance for ${targetInterface.name}`);
        
        // Extract from interface.performance object (preferred)
        if (targetInterface.performance) {
          if (targetInterface.performance.bandwidth) {
            const bandwidthMBps = this.parseBandwidth(targetInterface.performance.bandwidth);
            if (bandwidthMBps > 0 && frequency > 0) {
              dataWidth = (bandwidthMBps * 8) / frequency;
              console.log(`[PerformanceAnalyzer] Calculated dataWidth ${dataWidth} from interface bandwidth ${targetInterface.performance.bandwidth}`);
            }
          }
          if (targetInterface.performance.latency) {
            latency = this.parseLatency(targetInterface.performance.latency);
            console.log(`[PerformanceAnalyzer] Using interface latency ${latency} cycles`);
          }
          if (targetInterface.performance.maxFrequency) {
            frequency = this.parseFrequency(targetInterface.performance.maxFrequency);
            console.log(`[PerformanceAnalyzer] Using interface maxFrequency ${frequency} MHz`);
          }
        }
        
        // Extract from interface.speed (fallback)
        if (targetInterface.speed && frequency === this.globalClockFrequency) {
          frequency = this.parseFrequency(targetInterface.speed);
          console.log(`[PerformanceAnalyzer] Using interface speed ${frequency} MHz`);
        }

        // Extract from interface.dataWidth (fallback)
        if (targetInterface.dataWidth) {
          dataWidth = this.parseDataWidth(targetInterface.dataWidth);
          console.log(`[PerformanceAnalyzer] Using interface dataWidth ${dataWidth} bits`);
        }
      }
    }

    // Fallback: Extract data width from node-level 'width' property
    if (!targetInterface && node.data.width) {
      dataWidth = this.parseDataWidth(node.data.width);
    }

    // Fallback: Extract frequency from any interface if not found yet
    if (frequency === this.globalClockFrequency && node.data.interfaces && Array.isArray(node.data.interfaces)) {
      for (const iface of node.data.interfaces) {
        if (iface.performance?.maxFrequency) {
          frequency = this.parseFrequency(iface.performance.maxFrequency);
          console.log(`[PerformanceAnalyzer] Using frequency ${frequency} MHz from interface ${iface.name} performance`);
          break;
        } else if (iface.speed) {
          frequency = this.parseFrequency(iface.speed);
          console.log(`[PerformanceAnalyzer] Using frequency ${frequency} MHz from interface ${iface.name} speed`);
          break;
        }
      }
    }
    
    // Fallback: Node-level frequency properties
    if (frequency === this.globalClockFrequency) {
      if (node.data.frequency) {
        frequency = this.parseFrequency(node.data.frequency);
      } else if (node.data.speed) {
        frequency = this.parseFrequency(node.data.speed);
      } else if (node.data.clockFrequency) {
        frequency = this.parseFrequency(node.data.clockFrequency);
      } else {
        console.log(`[PerformanceAnalyzer] No frequency found for node ${node.data.label}, using global clock frequency: ${this.globalClockFrequency} MHz`);
      }
    }

    // Fallback: Node-level latency
    if (!targetInterface && node.data.latency) {
      latency = parseInt(node.data.latency, 10);
    }

    // Fallback: Try to get from component library (node-level)
    if (!targetInterface) {
      const libComponent = this.getComponentFromLibrary(node);
      if (libComponent) {
        if (libComponent.performance?.bandwidth) {
          const bandwidthMBps = this.parseBandwidth(libComponent.performance.bandwidth);
          if (bandwidthMBps > 0 && frequency > 0) {
            dataWidth = (bandwidthMBps * 8) / frequency;
          }
        }
        if (libComponent.performance?.latency) {
          latency = this.parseLatency(libComponent.performance.latency);
        }
      }
    }

    return { dataWidth, frequency, latency };
  }

  /**
   * Parse latency from various formats (ns, cycles -> cycles)
   */
  private parseLatency(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      // If it's in nanoseconds, we'll need to convert based on frequency
      // For now, just extract the number and assume it's in cycles
      const nsMatch = value.match(/([\d.]+)\s*ns/i);
      if (nsMatch) {
        // Convert ns to cycles (approximate, needs frequency context)
        return Math.ceil(parseFloat(nsMatch[1]) / 10); // Rough estimate: 10ns per cycle
      }

      const cyclesMatch = value.match(/([\d.]+)\s*cycles?/i);
      if (cyclesMatch) return parseFloat(cyclesMatch[1]);

      const num = parseFloat(value);
      if (!isNaN(num)) return num;
    }
    return 10; // default
  }

  /**
   * Parse data width from various formats
   */
  private parseDataWidth(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      // Try to match "64-bit", "64 bit", "64bit" patterns
      const bitMatch = value.match(/(\d+)[-\s]?bit/i);
      if (bitMatch) return parseInt(bitMatch[1], 10);
      
      // Try to extract just the number
      const numMatch = value.match(/(\d+)/);
      if (numMatch) return parseInt(numMatch[1], 10);
      const num = parseInt(value, 10);
      if (!isNaN(num)) return num;
    }
    return 32; // default
  }

  /**
   * Parse frequency from various formats (GHz, MHz -> MHz)
   */
  private parseFrequency(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const ghzMatch = value.match(/([\d.]+)\s*GHz/i);
      if (ghzMatch) return parseFloat(ghzMatch[1]) * 1000;

      const mhzMatch = value.match(/([\d.]+)\s*MHz/i);
      if (mhzMatch) return parseFloat(mhzMatch[1]);

      const num = parseFloat(value);
      if (!isNaN(num)) return num;
    }
    return 100; // default
  }

  /**
   * Parse bandwidth from string format
   */
  private parseBandwidth(value: string): number {
    const gbpsMatch = value.match(/([\d.]+)\s*GB\/s/i);
    if (gbpsMatch) return parseFloat(gbpsMatch[1]) * 1000;

    const mbpsMatch = value.match(/([\d.]+)\s*MB\/s/i);
    if (mbpsMatch) return parseFloat(mbpsMatch[1]);

    return 0;
  }

  /**
   * Get component from library
   */
  private getComponentFromLibrary(node: any): any {
    let libComponent = this.componentLibrary.get(node.data.label);
    if (!libComponent) {
      libComponent = this.componentLibrary.get(node.data.category || '');
    }
    if (!libComponent) {
      libComponent = this.componentLibrary.get(node.data.model_type || '');
    }
    return libComponent;
  }

  /**
   * Find the bottleneck component (minimum bandwidth)
   */
  private findBottleneck(components: ComponentPerformance[]): ComponentPerformance {
    if (components.length === 0) {
      throw new Error('No components to analyze');
    }

    return components.reduce((min, comp) =>
      comp.bandwidth < min.bandwidth ? comp : min
    );
  }

  /**
   * Calculate total latency for the flow
   */
  private calculateTotalLatency(components: ComponentPerformance[]): number {
    // Total latency = sum of all component latencies + interconnect arbitration
    const totalCycles = components.reduce((sum, comp) => sum + comp.latency, 0);

    // Convert to nanoseconds
    // Assuming average frequency for time calculation
    const avgFrequency = components.reduce((sum, comp) => sum + comp.frequency, 0) / components.length;
    const cycleTimeNs = avgFrequency > 0 ? 1000 / avgFrequency : 10; // ns per cycle

    return Math.round(totalCycles * cycleTimeNs * 100) / 100;
  }

  /**
   * Generate human-readable bottleneck reason
   */
  private generateBottleneckReason(bottleneck: ComponentPerformance): string {
    const reasons: string[] = [];

    if (bottleneck.dataWidth < 64) {
      reasons.push(`narrow data width (${bottleneck.dataWidth}-bit)`);
    }

    if (bottleneck.frequency < 200) {
      reasons.push(`low frequency (${bottleneck.frequency} MHz)`);
    }

    if (bottleneck.bandwidth < 100) {
      reasons.push(`limited bandwidth (${bottleneck.bandwidth.toFixed(2)} MB/s)`);
    }

    if (reasons.length === 0) {
      return `Lowest bandwidth in path: ${bottleneck.bandwidth.toFixed(2)} MB/s`;
    }

    return `Limited by ${reasons.join(', ')}`;
  }

  /**
   * Analyze all flows and return performance metrics
   */
  analyzeAllFlows(flows: DataFlow[], diagram: ArchitectureDiagram): PerformanceMetrics[] {
    return flows.map(flow => this.analyzeFlow(flow, diagram));
  }

  /**
   * Get performance summary statistics
   */
  getPerformanceSummary(metrics: PerformanceMetrics[]): {
    avgThroughput: number;
    maxThroughput: number;
    minThroughput: number;
    avgLatency: number;
    bottleneckDistribution: Record<string, number>;
    avgEfficiency: number;
  } {
    if (metrics.length === 0) {
      return {
        avgThroughput: 0,
        maxThroughput: 0,
        minThroughput: 0,
        avgLatency: 0,
        bottleneckDistribution: {},
        avgEfficiency: 0
      };
    }

    const throughputs = metrics.map(m => m.maxThroughput);
    const latencies = metrics.map(m => m.estimatedLatency);
    const efficiencies = metrics.map(m => m.efficiency);

    const bottleneckDistribution: Record<string, number> = {};
    metrics.forEach(m => {
      const type = m.bottleneckComponent.type;
      bottleneckDistribution[type] = (bottleneckDistribution[type] || 0) + 1;
    });

    return {
      avgThroughput: Math.round((throughputs.reduce((a, b) => a + b, 0) / metrics.length) * 100) / 100,
      maxThroughput: Math.max(...throughputs),
      minThroughput: Math.min(...throughputs),
      avgLatency: Math.round((latencies.reduce((a, b) => a + b, 0) / metrics.length) * 100) / 100,
      bottleneckDistribution,
      avgEfficiency: Math.round((efficiencies.reduce((a, b) => a + b, 0) / metrics.length) * 10) / 10
    };
  }
}

// Singleton instance
export const performanceAnalyzer = new PerformanceAnalyzer();
