import { ArchitecturalComponent, DesignPattern, SoCSpecification, ArchitectureDefinition } from '../types/index';

// ============================================================================
// PREDEFINED SOC EXAMPLES FOR DEMO
// ============================================================================

export const demoComponents: ArchitecturalComponent[] = [
  // Microcontroller Components
  {
    id: 'arm-cortex-m4-demo',
    name: 'ARM Cortex-M4',
    category: 'CPU',
    type: 'Microcontroller',
    properties: {
      performance: {
        clockFrequency: '168 MHz',
        throughput: '210 DMIPS'
      },
      power: {
        typical: '50 mW',
        idle: '2 mW',
        voltage: '1.8V - 3.6V'
      },
      physical: {
        area: '2.5 mm²',
        technology: '40nm',
        packageType: 'LQFP64'
      }
    },
    interfaces: [
      {
        id: 'cortex-m4-ahb',
        name: 'AHB Bus',
        type: 'AHB',
        direction: 'bidirectional',
        width: 32,
        speed: '168 MHz'
      },
      {
        id: 'cortex-m4-apb',
        name: 'APB Bus',
        type: 'APB',
        direction: 'bidirectional',
        width: 32,
        speed: '84 MHz'
      }
    ],
    icon: '🔧',
    description: 'High-performance ARM Cortex-M4 microcontroller with FPU',
    estimatedMetrics: {
      clockFrequency: '168 MHz',
      powerConsumption: '50 mW',
      area: '2.5 mm²'
    },
    tags: ['arm', 'cortex-m4', 'microcontroller', 'fpu', 'demo'],
    vendor: 'ARM',
    partNumber: 'STM32F407',
    compatibility: ['ahb-bus', 'apb-bus', 'sram', 'flash'],
    customizable: true
  },

  {
    id: 'sram-128kb-demo',
    name: '128KB SRAM',
    category: 'Memory',
    type: 'SRAM',
    properties: {
      performance: {
        bandwidth: '2.7 GB/s',
        latency: '1 cycle'
      },
      physical: {
        area: '1.2 mm²',
        technology: '40nm'
      }
    },
    interfaces: [
      {
        id: 'sram-ahb',
        name: 'AHB Interface',
        type: 'AHB',
        direction: 'bidirectional',
        width: 32,
        speed: '168 MHz'
      }
    ],
    icon: '💾',
    description: 'High-speed 128KB SRAM for microcontroller applications',
    estimatedMetrics: {
      bandwidth: '2.7 GB/s',
      area: '1.2 mm²'
    },
    tags: ['sram', 'memory', '128kb', 'high-speed', 'demo'],
    compatibility: ['ahb-bus', 'cortex-m4'],
    customizable: false
  },

  {
    id: 'wifi-controller-demo',
    name: 'WiFi 6 Controller',
    category: 'IO',
    type: 'Wireless',
    properties: {
      performance: {
        throughput: '600 Mbps',
        bandwidth: '80 MHz'
      },
      power: {
        typical: '200 mW',
        peak: '500 mW',
        idle: '10 mW'
      }
    },
    interfaces: [
      {
        id: 'wifi-spi',
        name: 'SPI Interface',
        type: 'SPI',
        direction: 'bidirectional',
        width: 4,
        speed: '50 MHz'
      },
      {
        id: 'wifi-antenna',
        name: 'RF Antenna',
        type: 'Custom',
        direction: 'bidirectional',
        protocol: '802.11ax'
      }
    ],
    icon: '📡',
    description: 'High-performance WiFi 6 controller with advanced features',
    estimatedMetrics: {
      throughput: '600 Mbps',
      powerConsumption: '200 mW'
    },
    tags: ['wifi', 'wireless', '802.11ax', 'iot', 'demo'],
    compatibility: ['spi-bus', 'microcontroller'],
    customizable: true
  },

  // Application Processor Components
  {
    id: 'arm-cortex-a78-demo',
    name: 'ARM Cortex-A78',
    category: 'CPU',
    type: 'Application Processor',
    properties: {
      performance: {
        clockFrequency: '3.0 GHz',
        throughput: '4000 DMIPS'
      },
      power: {
        typical: '2.5 W',
        peak: '5 W',
        idle: '50 mW',
        voltage: '0.8V - 1.2V'
      },
      physical: {
        area: '15 mm²',
        technology: '5nm',
        packageType: 'BGA'
      }
    },
    interfaces: [
      {
        id: 'cortex-a78-axi',
        name: 'AXI4 Bus',
        busType: 'AXI4',
        direction: 'bidirectional',
        dataWidth: 128,
        speed: '3.0 GHz'
      },
      {
        id: 'cortex-a78-pcie',
        name: 'PCIe 4.0',
        busType: 'PCIe',
        direction: 'bidirectional',
        speed: '16 GT/s'
      }
    ],
    icon: '🚀',
    description: 'High-performance ARM Cortex-A78 application processor',
    estimatedMetrics: {
      clockFrequency: '3.0 GHz',
      powerConsumption: '2.5 W',
      area: '15 mm²'
    },
    tags: ['arm', 'cortex-a78', 'application-processor', 'high-performance', 'demo'],
    vendor: 'ARM',
    compatibility: ['axi-bus', 'pcie', 'ddr5', 'cache'],
    customizable: true
  },

  {
    id: 'ddr5-8gb-demo',
    name: '8GB DDR5 Memory',
    category: 'Memory',
    type: 'DDR5',
    properties: {
      performance: {
        bandwidth: '51.2 GB/s',
        clockFrequency: '3200 MHz',
        latency: '15 ns'
      },
      power: {
        typical: '1.1 V',
        peak: '3 W'
      },
      physical: {
        area: '50 mm²',
        technology: '10nm'
      }
    },
    interfaces: [
      {
        id: 'ddr5-interface',
        name: 'DDR5 Interface',
        busType: 'DDR',
        direction: 'bidirectional',
        dataWidth: 64,
        speed: '3200 MHz'
      }
    ],
    icon: '🧠',
    description: 'High-capacity 8GB DDR5 memory for application processors',
    estimatedMetrics: {
      bandwidth: '51.2 GB/s',
      powerConsumption: '3 W',
      area: '50 mm²'
    },
    tags: ['ddr5', 'memory', '8gb', 'high-bandwidth', 'demo'],
    compatibility: ['ddr5-controller', 'application-processor'],
    customizable: false
  },

  {
    id: 'pcie-controller-demo',
    name: 'PCIe 4.0 Controller',
    category: 'Interconnect',
    type: 'PCIe Controller',
    properties: {
      performance: {
        throughput: '64 GB/s',
        bandwidth: '16 GT/s per lane'
      },
      power: {
        typical: '500 mW'
      }
    },
    interfaces: [
      {
        id: 'pcie-lanes',
        name: 'PCIe 4.0 x16',
        busType: 'PCIe',
        direction: 'bidirectional',
        dataWidth: 16,
        speed: '16 GT/s'
      },
      {
        id: 'pcie-axi',
        name: 'AXI Interface',
        busType: 'AXI4',
        direction: 'bidirectional',
        dataWidth: 128
      }
    ],
    icon: '🔗',
    description: 'High-speed PCIe 4.0 controller for expansion cards',
    estimatedMetrics: {
      throughput: '64 GB/s',
      powerConsumption: '500 mW'
    },
    tags: ['pcie', 'controller', 'high-speed', 'expansion', 'demo'],
    compatibility: ['axi-bus', 'application-processor'],
    customizable: true
  }
];

// ============================================================================
// DEMO SCENARIOS
// ============================================================================

export const demoScenarios = {
  microcontroller: {
    name: 'IoT Microcontroller System',
    description: 'Low-power IoT device with wireless connectivity',
    targetMarket: 'IoT sensors and smart home devices',
    powerBudget: '100 mW average',
    areaBudget: '10 mm²',
    architecture: {
      naturalLanguageSpec: `
        This is a low-power IoT microcontroller system designed for smart home applications.
        The system features an ARM Cortex-M4 processor with integrated WiFi connectivity.
        It includes 128KB of SRAM for program execution and data storage.
        The design prioritizes low power consumption and small form factor.
      `,
      selectedComponents: [
        demoComponents.find(c => c.id === 'arm-cortex-m4-demo')!,
        demoComponents.find(c => c.id === 'sram-128kb-demo')!,
        demoComponents.find(c => c.id === 'wifi-controller-demo')!
      ],
      customComponents: [],
      performanceRequirements: [
        'Operating frequency: 168 MHz',
        'Memory bandwidth: > 2 GB/s',
        'WiFi throughput: > 100 Mbps',
        'Power consumption: < 100 mW average'
      ],
      constraints: [
        'Total area < 10 mm²',
        'Operating voltage: 3.3V',
        'Temperature range: -40°C to +85°C',
        'WiFi compliance: 802.11ax'
      ],
      designDecisions: [
        {
          id: 'cpu-selection',
          decision: 'ARM Cortex-M4 with FPU',
          rationale: 'Provides sufficient performance for IoT applications with low power consumption',
          alternatives: ['Cortex-M0+', 'Cortex-M7'],
          impact: 'Enables floating-point operations for sensor data processing',
          timestamp: new Date()
        },
        {
          id: 'memory-selection',
          decision: '128KB SRAM',
          rationale: 'Adequate memory for typical IoT firmware and data buffering',
          alternatives: ['64KB SRAM', '256KB SRAM'],
          impact: 'Balances cost and functionality for target applications',
          timestamp: new Date()
        }
      ],
      componentRationale: [
        {
          componentId: 'arm-cortex-m4-demo',
          reason: 'Optimal balance of performance and power efficiency',
          benefits: ['Low power consumption', 'Integrated FPU', 'Rich peripheral set'],
          tradeoffs: ['Higher cost than M0+', 'More complex than needed for simple tasks'],
          alternatives: ['ARM Cortex-M0+', 'ARM Cortex-M7', 'RISC-V alternatives']
        },
        {
          componentId: 'wifi-controller-demo',
          reason: 'Modern WiFi 6 support for future-proofing',
          benefits: ['High throughput', 'Low latency', 'Advanced security'],
          tradeoffs: ['Higher power consumption', 'Increased complexity'],
          alternatives: ['WiFi 5 controller', 'Bluetooth-only', 'Zigbee']
        }
      ]
    },
    expectedValidationIssues: [
      'Power budget validation - WiFi controller may exceed budget during transmission',
      'Interface compatibility - Ensure SPI timing meets WiFi controller requirements',
      'Thermal considerations - Verify heat dissipation in compact form factor'
    ],
    conversationFlow: [
      {
        user: "I need to design a low-power IoT device for smart home applications",
        assistant: "I'd be happy to help you design an IoT device! To get started, could you tell me more about the specific requirements? For example:\n- What type of sensors or functionality will it have?\n- What connectivity do you need (WiFi, Bluetooth, etc.)?\n- Are there any power or size constraints?\n- What's your target cost range?"
      },
      {
        user: "It needs WiFi connectivity, should run on battery for at least a year, and needs to be very small",
        assistant: "Great! For a battery-powered WiFi IoT device, I recommend starting with an ARM Cortex-M4 microcontroller. This provides good performance while maintaining low power consumption. For WiFi, we'll need a dedicated controller that supports power-saving modes.\n\nLet me suggest some components:\n1. **ARM Cortex-M4** - Excellent power efficiency with FPU for sensor processing\n2. **WiFi 6 Controller** - Modern standard with good power management\n3. **128KB SRAM** - Sufficient for IoT applications\n\nWould you like me to elaborate on any of these components or discuss power optimization strategies?"
      },
      {
        user: "That sounds good. What about power consumption estimates?",
        assistant: "Let me break down the power consumption:\n\n**Active Mode (during WiFi transmission):**\n- ARM Cortex-M4: ~50 mW\n- WiFi Controller: ~200 mW\n- SRAM: ~5 mW\n- **Total: ~255 mW**\n\n**Sleep Mode (most of the time):**\n- ARM Cortex-M4: ~2 mW\n- WiFi Controller: ~10 mW\n- SRAM: ~1 mW\n- **Total: ~13 mW**\n\nFor battery life, assuming 95% sleep time and 5% active time:\n- Average power: (0.95 × 13mW) + (0.05 × 255mW) ≈ 25 mW\n- With a 3000 mAh battery at 3.3V: ~13 months of operation\n\nWould you like me to explore power optimization techniques or adjust the component selection?"
      }
    ]
  },

  applicationProcessor: {
    name: 'High-Performance Application Processor',
    description: 'Multi-core application processor for edge AI and multimedia',
    targetMarket: 'Edge computing, automotive, and multimedia applications',
    powerBudget: '15 W TDP',
    areaBudget: '100 mm²',
    architecture: {
      naturalLanguageSpec: `
        This is a high-performance application processor system designed for edge AI and multimedia applications.
        The system features an ARM Cortex-A78 processor with high-speed DDR5 memory and PCIe expansion.
        It includes advanced interconnects for high-bandwidth data processing.
        The design targets edge computing workloads requiring significant computational power.
      `,
      selectedComponents: [
        demoComponents.find(c => c.id === 'arm-cortex-a78-demo')!,
        demoComponents.find(c => c.id === 'ddr5-8gb-demo')!,
        demoComponents.find(c => c.id === 'pcie-controller-demo')!
      ],
      customComponents: [],
      performanceRequirements: [
        'CPU frequency: 3.0 GHz',
        'Memory bandwidth: > 50 GB/s',
        'PCIe throughput: > 60 GB/s',
        'AI inference: > 10 TOPS'
      ],
      constraints: [
        'Total power < 15 W TDP',
        'Operating voltage: 0.8V - 1.2V',
        'Temperature range: 0°C to +85°C',
        'PCIe compliance: 4.0 specification'
      ],
      designDecisions: [
        {
          id: 'cpu-architecture',
          decision: 'ARM Cortex-A78 single core',
          rationale: 'High single-thread performance for edge AI workloads',
          alternatives: ['Multi-core A55', 'Custom RISC-V', 'x86 alternative'],
          impact: 'Optimizes for single-threaded AI inference performance',
          timestamp: new Date()
        },
        {
          id: 'memory-system',
          decision: 'DDR5-3200 8GB',
          rationale: 'High bandwidth required for AI model loading and multimedia processing',
          alternatives: ['DDR4-3200', 'HBM2', 'LPDDR5'],
          impact: 'Enables large model support and high-throughput data processing',
          timestamp: new Date()
        }
      ],
      componentRationale: [
        {
          componentId: 'arm-cortex-a78-demo',
          reason: 'Leading performance per watt for edge AI applications',
          benefits: ['High IPC', 'Advanced branch prediction', 'Efficient cache hierarchy'],
          tradeoffs: ['Higher power than A55', 'More complex design'],
          alternatives: ['ARM Cortex-A55', 'Custom AI accelerator', 'RISC-V core']
        },
        {
          componentId: 'ddr5-8gb-demo',
          reason: 'High bandwidth essential for AI model inference',
          benefits: ['51.2 GB/s bandwidth', 'Large capacity', 'Future-proof'],
          tradeoffs: ['Higher power than DDR4', 'Increased cost'],
          alternatives: ['DDR4-3200', 'LPDDR5', 'HBM2e']
        }
      ]
    },
    expectedValidationIssues: [
      'Thermal management - High-performance components generate significant heat',
      'Power delivery - Ensure adequate power supply for peak performance',
      'Signal integrity - High-speed interfaces require careful PCB design'
    ],
    conversationFlow: [
      {
        user: "I need a high-performance processor for edge AI applications",
        assistant: "Excellent! Edge AI applications have unique requirements for both computational power and efficiency. Let me understand your needs better:\n\n- What type of AI models will you be running (computer vision, NLP, etc.)?\n- Do you need real-time inference or can you batch process?\n- What's your power budget and thermal constraints?\n- Will you need additional accelerators or is CPU sufficient?\n\nFor edge AI, I typically recommend starting with a high-performance ARM Cortex-A78 or similar architecture."
      },
      {
        user: "Computer vision models, real-time inference, power budget around 15W",
        assistant: "Perfect! For real-time computer vision with a 15W budget, here's what I recommend:\n\n**Core Architecture:**\n1. **ARM Cortex-A78** @ 3.0 GHz - Excellent single-thread performance for CV inference\n2. **8GB DDR5-3200** - High bandwidth (51.2 GB/s) for model loading and image processing\n3. **PCIe 4.0 Controller** - For optional GPU/NPU acceleration cards\n\n**Key Benefits:**\n- 4000 DMIPS processing power\n- Large memory for complex models (ResNet, YOLO, etc.)\n- Expansion capability for dedicated AI accelerators\n\nThis configuration should handle real-time inference for most CV models. Would you like me to dive deeper into any component or discuss optimization strategies?"
      },
      {
        user: "What about power consumption and thermal management?",
        assistant: "Great question! Thermal management is critical for sustained performance:\n\n**Power Breakdown:**\n- ARM Cortex-A78: 2.5W typical, 5W peak\n- DDR5 Memory: 3W continuous\n- PCIe Controller: 0.5W\n- **Total: ~6W typical, 8.5W peak**\n\n**Thermal Considerations:**\n- CPU junction temp: 105°C max\n- Recommended heatsink: 2-3°C/W thermal resistance\n- Consider dynamic frequency scaling for thermal throttling\n- Package: BGA with thermal vias for heat spreading\n\n**Power Management:**\n- DVFS (Dynamic Voltage/Frequency Scaling)\n- Clock gating for unused blocks\n- Memory power-down modes during idle\n\nThis leaves ~6.5W headroom for additional accelerators. Would you like me to explore cooling solutions or power optimization techniques?"
      }
    ]
  }
};

// ============================================================================
// VALIDATION RULE EXAMPLES FOR DEMO
// ============================================================================

export const demoValidationRules = [
  {
    id: 'power-budget-check',
    name: 'Power Budget Validation',
    description: 'Ensures total system power consumption stays within specified budget',
    category: 'power' as const,
    severity: 'error' as const,
    enabled: true,
    priority: 1,
    demoScenario: 'microcontroller',
    expectedResult: 'warning',
    explanation: 'WiFi controller power consumption during transmission may exceed the 100mW budget'
  },
  {
    id: 'interface-compatibility',
    name: 'Interface Compatibility Check',
    description: 'Validates that connected components have compatible interfaces',
    category: 'connectivity' as const,
    severity: 'error' as const,
    enabled: true,
    priority: 2,
    demoScenario: 'both',
    expectedResult: 'pass',
    explanation: 'All component interfaces are properly matched (AHB, SPI, AXI, PCIe)'
  },
  {
    id: 'thermal-analysis',
    name: 'Thermal Design Check',
    description: 'Analyzes thermal characteristics and cooling requirements',
    category: 'performance' as const,
    severity: 'warning' as const,
    enabled: true,
    priority: 3,
    demoScenario: 'applicationProcessor',
    expectedResult: 'warning',
    explanation: 'High-performance components require active cooling solution'
  },
  {
    id: 'area-constraint',
    name: 'Area Budget Validation',
    description: 'Ensures total component area fits within specified constraints',
    category: 'compliance' as const,
    severity: 'error' as const,
    enabled: true,
    priority: 1,
    demoScenario: 'microcontroller',
    expectedResult: 'pass',
    explanation: 'Total area (5.9 mm²) is within the 10 mm² budget'
  },
  {
    id: 'clock-domain-analysis',
    name: 'Clock Domain Validation',
    description: 'Validates clock domain crossings and timing requirements',
    category: 'performance' as const,
    severity: 'warning' as const,
    enabled: true,
    priority: 4,
    demoScenario: 'both',
    expectedResult: 'pass',
    explanation: 'Clock domains are properly synchronized with appropriate crossing circuits'
  }
];

// ============================================================================
// EXTENSIBILITY DEMO RULE
// ============================================================================

export const customValidationRuleExample = {
  id: 'custom-security-check',
  name: 'Security Feature Validation',
  description: 'Custom rule to validate security features in IoT devices',
  category: 'custom' as const,
  severity: 'warning' as const,
  enabled: true,
  priority: 5,
  implementation: `
// Example of adding a custom validation rule during demo
class SecurityValidationRule implements ValidationRule {
  id = 'custom-security-check';
  name = 'Security Feature Validation';
  description = 'Validates that IoT devices include necessary security features';
  category = 'custom' as ValidationCategory;
  severity = 'warning' as ValidationSeverity;
  enabled = true;
  priority = 5;

  async validate(spec: SoCSpecification): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    
    // Check for encryption capabilities
    const hasEncryption = spec.components.some(component => 
      component.tags.includes('encryption') || 
      component.tags.includes('crypto') ||
      component.description.toLowerCase().includes('security')
    );
    
    if (!hasEncryption) {
      results.push({
        ruleId: this.id,
        severity: 'warning',
        message: 'IoT device should include encryption/security features',
        affectedComponents: [],
        suggestedFix: 'Consider adding a crypto accelerator or secure element',
        confidence: 0.8,
        category: 'custom',
        timestamp: new Date()
      });
    }
    
    // Check for secure boot capabilities
    const hasSecureBoot = spec.components.some(component =>
      component.tags.includes('secure-boot') ||
      component.description.toLowerCase().includes('secure boot')
    );
    
    if (!hasSecureBoot && spec.targetMarket?.includes('IoT')) {
      results.push({
        ruleId: this.id,
        severity: 'warning', 
        message: 'IoT devices should implement secure boot mechanisms',
        affectedComponents: spec.components.filter(c => c.category === 'CPU').map(c => c.id),
        suggestedFix: 'Enable secure boot features in the processor or add dedicated security chip',
        confidence: 0.9,
        category: 'custom',
        timestamp: new Date()
      });
    }
    
    return results;
  }
}
  `,
  demoSteps: [
    '1. Show existing validation rules in the system',
    '2. Demonstrate rule management interface (enable/disable)',
    '3. Add the custom security validation rule',
    '4. Run validation on IoT microcontroller example',
    '5. Show how the new rule identifies security gaps',
    '6. Demonstrate rule configuration and priority adjustment'
  ]
};

export default {
  demoComponents,
  demoScenarios,
  demoValidationRules,
  customValidationRuleExample
};