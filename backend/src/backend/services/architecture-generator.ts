/**
 * Architecture Generator Service
 * Generates arch_spec.md and arch_diagram.json from conversation session
 *
 * Features:
 * 1. Natural language specification (arch_spec.md)
 * 2. Diagram with components, connections, and layout (arch_diagram.json)
 * 3. AI-generated custom components (stored in component library)
 * 4. Intelligent layout optimization
 */

import {
  DesignSession,
  ArchitecturalComponent,
  PatternConnection,
  ReactFlowNode,
  ReactFlowEdge,
  ReactFlowData,
  Position,
  NaturalLanguageSpec,
  ComponentDescription,
  ComponentCategory,
  InterfaceDefinition
} from '../../types/index';
import { ComponentLibraryManager } from './component-library-manager';
import { v4 as uuidv4 } from 'uuid';

export interface ArchitectureGeneration {
  archSpec: NaturalLanguageSpec;
  archDiagram: ReactFlowData;
  newComponents: ArchitecturalComponent[];
}

export class ArchitectureGenerator {
  private componentLibrary: ComponentLibraryManager;

  constructor() {
    this.componentLibrary = new ComponentLibraryManager();
  }

  /**
   * Generate complete architecture from session
   * Makes reasonable assumptions for unconfirmed parameters
   */
  async generateArchitecture(session: DesignSession): Promise<ArchitectureGeneration> {
    // Step 1: Extract requirements and make assumptions
    const requirements = this.extractRequirements(session);
    const assumptions = this.makeReasonableAssumptions(session, requirements);

    // Step 2: Select or generate components
    const components = await this.selectAndGenerateComponents(requirements, assumptions);

    // Step 3: Generate connections between components
    const connections = this.generateConnections(components);

    // Step 4: Generate optimized layout
    const layout = this.generateOptimizedLayout(components, connections);

    // Step 5: Create arch_spec.md
    const archSpec = this.generateNaturalLanguageSpec(
      session,
      requirements,
      assumptions,
      components,
      connections
    );

    // Step 6: Create arch_diagram.json
    const archDiagram = this.generateDiagramJSON(components, connections, layout);

    // Step 7: Identify new components to be stored
    const newComponents = components.filter(c => c.customizable);

    return {
      archSpec,
      archDiagram,
      newComponents
    };
  }

  /**
   * Extract requirements from conversation history
   */
  private extractRequirements(session: DesignSession): {
    features: string[];
    performance: Map<string, string>;
    constraints: string[];
    applicationDomain: string;
  } {
    const features: string[] = [];
    const performance = new Map<string, string>();
    const constraints: string[] = [];
    let applicationDomain = 'General Purpose';

    // Analyze conversation history
    session.conversationHistory.forEach(msg => {
      const content = msg.content.toLowerCase();

      // Extract features from checkbox selections
      if (msg.role === 'user') {
        const featureKeywords = [
          'cpu', '处理器', '核心',
          'memory', '内存', 'ram', 'ddr',
          'wifi', 'bluetooth', '蓝牙',
          'usb', 'pcie', 'ethernet',
          'ai', '加速器', 'npu', 'gpu',
          'controller', '控制器'
        ];

        featureKeywords.forEach(keyword => {
          if (content.includes(keyword)) {
            features.push(keyword);
          }
        });

        // Extract performance levels
        if (content.includes('低功耗') || content.includes('低性能')) {
          const lastFeature = features[features.length - 1];
          if (lastFeature) performance.set(lastFeature, 'low-power');
        }
        if (content.includes('中等性能')) {
          const lastFeature = features[features.length - 1];
          if (lastFeature) performance.set(lastFeature, 'medium-performance');
        }
        if (content.includes('高性能')) {
          const lastFeature = features[features.length - 1];
          if (lastFeature) performance.set(lastFeature, 'high-performance');
        }
      }

      // Extract application domain
      if (content.includes('iot')) applicationDomain = 'IoT';
      if (content.includes('ai') || content.includes('machine learning')) applicationDomain = 'AI/ML';
      if (content.includes('mobile')) applicationDomain = 'Mobile';
      if (content.includes('automotive')) applicationDomain = 'Automotive';

      // Extract constraints
      if (content.includes('低功耗') || content.includes('low power')) {
        constraints.push('Low power consumption required');
      }
      if (content.includes('小面积') || content.includes('small area')) {
        constraints.push('Small silicon area');
      }
      if (content.includes('高性能') || content.includes('high performance')) {
        constraints.push('High performance required');
      }
    });

    // Add session requirements and constraints
    features.push(...session.requirements);
    constraints.push(...session.constraints);

    return {
      features: [...new Set(features)],
      performance,
      constraints: [...new Set(constraints)],
      applicationDomain
    };
  }

  /**
   * Make reasonable assumptions for unconfirmed parameters
   */
  private makeReasonableAssumptions(
    session: DesignSession,
    requirements: any
  ): Map<string, any> {
    const assumptions = new Map<string, any>();

    // CPU assumptions
    if (requirements.features.some((f: string) => f.includes('cpu') || f.includes('处理器'))) {
      if (!requirements.performance.has('cpu')) {
        // Default to medium performance if not specified
        assumptions.set('cpu_performance', 'medium-performance');
        assumptions.set('cpu_cores', 2);
        assumptions.set('cpu_frequency', '1.5GHz');
        assumptions.set('cpu_architecture', 'ARM Cortex-A53');
      }
    }

    // Memory assumptions
    if (requirements.features.some((f: string) => f.includes('memory') || f.includes('内存'))) {
      assumptions.set('memory_type', 'DDR4');
      assumptions.set('memory_size', '4GB');
      assumptions.set('memory_bandwidth', '25.6GB/s');
    }

    // Connectivity assumptions based on application domain
    if (requirements.applicationDomain === 'IoT') {
      if (!requirements.features.some((f: string) => f.includes('wifi') || f.includes('bluetooth'))) {
        assumptions.set('connectivity', 'WiFi + Bluetooth LE');
      }
      assumptions.set('power_mode', 'ultra-low-power');
    }

    // AI/ML assumptions
    if (requirements.applicationDomain === 'AI/ML' ||
        requirements.features.some((f: string) => f.includes('ai') || f.includes('加速器'))) {
      assumptions.set('ai_accelerator', 'NPU');
      assumptions.set('ai_performance', '2 TOPS');
    }

    // General assumptions
    assumptions.set('interconnect', 'AXI4');
    assumptions.set('clock_domain', 'single');
    assumptions.set('power_management', 'DVFS');

    return assumptions;
  }

  /**
   * Select existing components from library or generate new ones
   */
  private async selectAndGenerateComponents(
    requirements: any,
    assumptions: Map<string, any>
  ): Promise<ArchitecturalComponent[]> {
    const components: ArchitecturalComponent[] = [];
    const processedFeatures = new Set<string>();

    // Process each feature requirement
    for (const feature of requirements.features) {
      if (processedFeatures.has(feature)) continue;

      // Try to find matching component in library
      const matches = await this.componentLibrary.searchComponents([feature]);

      if (matches.length > 0) {
        // Use existing component from library
        components.push(matches[0].component);
      } else {
        // Generate new custom component
        const customComponent = this.generateCustomComponent(feature, requirements, assumptions);
        if (customComponent) {
          components.push(customComponent);
        }
      }

      processedFeatures.add(feature);
    }

    // Add essential components if missing
    const hasInterconnect = components.some(c => c.category === 'Interconnect');
    if (!hasInterconnect) {
      const interconnect = await this.getOrCreateInterconnect(assumptions);
      components.push(interconnect);
    }

    return components;
  }

  /**
   * Generate a custom component when not found in library
   */
  private generateCustomComponent(
    feature: string,
    requirements: any,
    assumptions: Map<string, any>
  ): ArchitecturalComponent | null {
    const componentId = uuidv4();

    // Determine component category and properties based on feature
    let category: ComponentCategory = 'Custom';
    let name = feature;
    let description = `Custom ${feature} component`;
    const interfaces: InterfaceDefinition[] = [];

    if (feature.includes('cpu') || feature.includes('处理器')) {
      category = 'CPU';
      name = `${assumptions.get('cpu_architecture') || 'ARM Cortex-A53'} CPU`;
      description = `Multi-core ${assumptions.get('cpu_architecture') || 'ARM'} processor`;

      interfaces.push({
        id: uuidv4(),
        name: 'AXI_Master',
        busType: 'AXI4',
        direction: 'output',
        dataWidth: 64,
        speed: '1.5GHz'
      });
    } else if (feature.includes('memory') || feature.includes('内存')) {
      category = 'Memory';
      name = `${assumptions.get('memory_type') || 'DDR4'} Memory Controller`;
      description = `${assumptions.get('memory_size') || '4GB'} memory controller`;

      interfaces.push({
        id: uuidv4(),
        name: 'AXI_Slave',
        busType: 'AXI4',
        direction: 'input',
        dataWidth: 64
      });
      interfaces.push({
        id: uuidv4(),
        name: 'DDR_Interface',
        busType: 'DDR',
        direction: 'bidirectional',
        speed: assumptions.get('memory_bandwidth') || '25.6GB/s'
      });
    } else if (feature.includes('wifi') || feature.includes('bluetooth')) {
      category = 'IO';
      name = 'Wireless Connectivity Module';
      description = 'WiFi 6 + Bluetooth 5.2 combo';

      interfaces.push({
        id: uuidv4(),
        name: 'AXI_Slave',
        busType: 'AXI4',
        direction: 'input',
        dataWidth: 32
      });
      interfaces.push({
        id: uuidv4(),
        name: 'RF_Interface',
        busType: 'Custom',
        direction: 'bidirectional'
      });
    } else if (feature.includes('ai') || feature.includes('加速器') || feature.includes('npu')) {
      category = 'Accelerator';
      name = 'AI/ML Accelerator (NPU)';
      description = `Neural Processing Unit - ${assumptions.get('ai_performance') || '2 TOPS'}`;

      interfaces.push({
        id: uuidv4(),
        name: 'AXI_Slave',
        busType: 'AXI4',
        direction: 'input',
        dataWidth: 128
      });
    } else {
      // Generic custom component
      interfaces.push({
        id: uuidv4(),
        name: 'AXI_Interface',
        busType: 'AXI4',
        direction: 'bidirectional',
        dataWidth: 32
      });
    }

    return {
      id: componentId,
      name,
      category,
      type: category,
      description,
      tags: [feature, 'ai-generated', 'custom'],
      properties: {
        performance: {
          clockFrequency: assumptions.get('cpu_frequency') || '1GHz'
        },
        power: {
          typical: '1W'
        }
      },
      interfaces,
      estimatedMetrics: {
        clockFrequency: assumptions.get('cpu_frequency') || '1GHz',
        powerConsumption: '1W'
      },
      compatibility: ['AXI4', 'AMBA'],
      visualization: {
        icon: this.getCategoryIcon(category),
        width: 180,
        height: 100
      },
      customizable: true,
      baseTemplate: category
    };
  }

  /**
   * Get or create interconnect component
   */
  private async getOrCreateInterconnect(assumptions: Map<string, any>): Promise<ArchitecturalComponent> {
    const matches = await this.componentLibrary.searchComponents(['interconnect', 'axi']);

    if (matches.length > 0) {
      return matches[0].component;
    }

    // Create custom interconnect
    return {
      id: uuidv4(),
      name: 'AXI4 Interconnect',
      category: 'Interconnect',
      type: 'Bus',
      description: 'High-performance AXI4 interconnect fabric',
      tags: ['interconnect', 'axi4', 'bus'],
      properties: {
        performance: {
          bandwidth: '10GB/s',
          latency: '2ns'
        }
      },
      interfaces: [
        {
          id: uuidv4(),
          name: 'Master_Ports',
          busType: 'AXI4',
          direction: 'input',
          dataWidth: 128
        },
        {
          id: uuidv4(),
          name: 'Slave_Ports',
          busType: 'AXI4',
          direction: 'output',
          dataWidth: 128
        }
      ],
      estimatedMetrics: {
        bandwidth: '10GB/s',
        latency: '2ns'
      },
      compatibility: ['AXI4', 'AMBA'],
      visualization: {
        icon: 'Network',
        width: 200,
        height: 60
      },
      customizable: false
    };
  }

  /**
   * Generate connections between components based on interface compatibility
   */
  private generateConnections(components: ArchitecturalComponent[]): PatternConnection[] {
    const connections: PatternConnection[] = [];

    // Find interconnect (hub)
    const interconnect = components.find(c => c.category === 'Interconnect');

    if (interconnect) {
      // Connect all components to interconnect
      components.forEach(component => {
        if (component.id === interconnect.id) return;

        // Find compatible interfaces
        const componentInterface = component.interfaces.find(i =>
          i.busType === 'AXI4' || i.busType === 'AHB' || i.busType === 'APB'
        );

        if (componentInterface) {
          connections.push({
            sourceComponentId: component.id,
            targetComponentId: interconnect.id,
            sourceInterface: componentInterface.name,
            targetInterface: 'Master_Ports',
            connectionType: componentInterface.type,
            properties: {
              bandwidth: componentInterface.speed || 'auto',
              protocol: componentInterface.type
            }
          });
        }
      });
    } else {
      // Star topology: connect CPU to all other components
      const cpu = components.find(c => c.category === 'CPU');
      if (cpu) {
        components.forEach(component => {
          if (component.id === cpu.id) return;

          const cpuInterface = cpu.interfaces.find(i => i.direction === 'output');
          const compInterface = component.interfaces.find(i => i.direction === 'input');

          if (cpuInterface && compInterface) {
            connections.push({
              sourceComponentId: cpu.id,
              targetComponentId: component.id,
              sourceInterface: cpuInterface.name,
              targetInterface: compInterface.name,
              connectionType: cpuInterface.type,
              properties: {}
            });
          }
        });
      }
    }

    return connections;
  }

  /**
   * Generate optimized layout considering overall design
   */
  private generateOptimizedLayout(
    components: ArchitecturalComponent[],
    connections: PatternConnection[]
  ): Map<string, Position> {
    const layout = new Map<string, Position>();

    // Find central component (interconnect or CPU)
    const centralComponent = components.find(c =>
      c.category === 'Interconnect' || c.category === 'CPU'
    );

    if (!centralComponent) {
      // Fallback: simple grid layout
      components.forEach((comp, index) => {
        layout.set(comp.id, {
          x: 100 + (index % 3) * 250,
          y: 100 + Math.floor(index / 3) * 150
        });
      });
      return layout;
    }

    // Place central component in center
    layout.set(centralComponent.id, { x: 400, y: 300 });

    // Place other components in a circle around center
    const otherComponents = components.filter(c => c.id !== centralComponent.id);
    const angleStep = (2 * Math.PI) / otherComponents.length;
    const radius = 200;

    otherComponents.forEach((comp, index) => {
      const angle = index * angleStep;
      const x = 400 + radius * Math.cos(angle);
      const y = 300 + radius * Math.sin(angle);
      layout.set(comp.id, { x, y });
    });

    return layout;
  }

  /**
   * Generate natural language specification (arch_spec.md)
   */
  private generateNaturalLanguageSpec(
    session: DesignSession,
    requirements: any,
    assumptions: Map<string, any>,
    components: ArchitecturalComponent[],
    connections: PatternConnection[]
  ): NaturalLanguageSpec {
    const componentDescriptions: ComponentDescription[] = components.map(comp => ({
      name: comp.name,
      type: comp.category,
      purpose: comp.description,
      specifications: [
        `Clock: ${comp.estimatedMetrics.clockFrequency || 'N/A'}`,
        `Power: ${comp.estimatedMetrics.powerConsumption || 'N/A'}`,
        `Interfaces: ${comp.interfaces.map(i => i.name).join(', ')}`
      ],
      connections: connections
        .filter(c => c.sourceComponentId === comp.id || c.targetComponentId === comp.id)
        .map(c => {
          const isSource = c.sourceComponentId === comp.id;
          const otherComp = components.find(co =>
            co.id === (isSource ? c.targetComponentId : c.sourceComponentId)
          );
          return `Connected to ${otherComp?.name || 'Unknown'} via ${c.connectionType}`;
        }),
      rationale: `Selected for ${requirements.applicationDomain} application`
    }));

    const designRationale: string[] = [];

    // Add assumptions as rationale
    assumptions.forEach((value, key) => {
      designRationale.push(`${key}: ${value} (AI inferred based on application requirements)`);
    });

    return {
      title: `SoC Architecture - ${requirements.applicationDomain}`,
      overview: this.generateOverview(requirements, assumptions),
      requirements: requirements.features,
      architecture: this.generateArchitectureDescription(components, connections),
      components: componentDescriptions,
      constraints: requirements.constraints,
      designRationale,
      generatedAt: new Date(),
      version: '1.0',
      projectId: session.projectId || session.sessionId
    };
  }

  /**
   * Generate overview section
   */
  private generateOverview(requirements: any, assumptions: Map<string, any>): string {
    return `This SoC architecture is designed for ${requirements.applicationDomain} applications.

Key Features:
${requirements.features.map((f: string) => `- ${f}`).join('\n')}

Design Philosophy:
This architecture balances performance, power efficiency, and silicon area to meet the target application requirements.
AI-based reasoning was used to infer optimal component selection and configuration for unspecified parameters.

Target Market: ${requirements.applicationDomain}
Power Budget: ${assumptions.get('power_mode') || 'Standard'}
Performance Tier: ${assumptions.get('cpu_performance') || 'Medium'}`;
  }

  /**
   * Generate architecture description
   */
  private generateArchitectureDescription(
    components: ArchitecturalComponent[],
    connections: PatternConnection[]
  ): string {
    const hasInterconnect = components.some(c => c.category === 'Interconnect');

    if (hasInterconnect) {
      return `The architecture follows a bus-based topology with a central interconnect fabric.
All processing elements and peripherals are connected to the interconnect, enabling efficient data transfer
and system coherency. The interconnect supports multiple outstanding transactions and provides quality-of-service
guarantees for critical data paths.`;
    }

    return `The architecture uses a star topology with the CPU as the central hub.
All peripherals and subsystems are directly connected to the CPU through high-speed interfaces.
This topology minimizes latency for CPU-to-peripheral communication and simplifies system integration.`;
  }

  /**
   * Generate diagram JSON (arch_diagram.json)
   */
  private generateDiagramJSON(
    components: ArchitecturalComponent[],
    connections: PatternConnection[],
    layout: Map<string, Position>
  ): ReactFlowData {
    // Create nodes
    const nodes: ReactFlowNode[] = components.map(comp => ({
      id: comp.id,
      type: 'architectural',
      position: layout.get(comp.id) || { x: 0, y: 0 },
      data: {
        component: comp,
        label: comp.name,
        type: comp.category,
        properties: comp.properties,
        validationStatus: 'valid'
      }
    }));

    // Create edges
    const edges: ReactFlowEdge[] = connections.map(conn => ({
      id: `${conn.sourceComponentId}-${conn.targetComponentId}`,
      source: conn.sourceComponentId,
      target: conn.targetComponentId,
      sourceHandle: conn.sourceInterface,
      targetHandle: conn.targetInterface,
      data: {
        sourceInterface: conn.sourceInterface,
        targetInterface: conn.targetInterface,
        connectionType: conn.connectionType,
        bandwidth: conn.properties?.bandwidth,
        protocol: conn.connectionType,
        validationStatus: 'valid'
      },
      style: {
        stroke: '#6366f1',
        strokeWidth: 2
      }
    }));

    return {
      nodes,
      edges,
      layout: {
        algorithm: 'force',
        direction: 'TB',
        spacing: {
          nodeSpacing: 150,
          rankSpacing: 200
        },
        viewport: {
          x: 0,
          y: 0,
          zoom: 1
        }
      },
      metadata: {
        generatedAt: new Date(),
        version: '1.0',
        source: 'conversation'
      }
    };
  }

  /**
   * Get icon name for category
   */
  private getCategoryIcon(category: ComponentCategory): string {
    const iconMap: Record<ComponentCategory, string> = {
      'CPU': 'Cpu',
      'Memory': 'Database',
      'Interconnect': 'Network',
      'IO': 'Plug',
      'Accelerator': 'Zap',
      'Custom': 'Box'
    };

    return iconMap[category] || 'Box';
  }

  /**
   * Store new components to component library
   */
  async storeNewComponents(components: ArchitecturalComponent[]): Promise<void> {
    for (const component of components) {
      await this.componentLibrary.addComponent(component);
    }
  }
}
