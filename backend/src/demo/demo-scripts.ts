import { demoScenarios, demoValidationRules, customValidationRuleExample } from './soc-examples';

// ============================================================================
// HACKATHON DEMO SCRIPTS
// ============================================================================

export interface DemoScript {
  id: string;
  title: string;
  duration: string;
  description: string;
  steps: DemoStep[];
  keyMessages: string[];
  fallbackPlan: string[];
}

export interface DemoStep {
  id: string;
  title: string;
  duration: string;
  action: string;
  expectedResult: string;
  keyPoints: string[];
  troubleshooting?: string;
}

export const hackathonDemoScripts: DemoScript[] = [
  {
    id: 'main-demo',
    title: 'SoC Pilot: AI-Powered System Design',
    duration: '8 minutes',
    description: 'Complete demonstration of conversational SoC design workflow with validation',
    steps: [
      {
        id: 'intro',
        title: 'Introduction & Problem Statement',
        duration: '30 seconds',
        action: 'Show current SoC design challenges slide',
        expectedResult: 'Audience understands the complexity of modern SoC design',
        keyPoints: [
          'SoC design requires deep expertise across multiple domains',
          'Traditional tools have steep learning curves',
          'Design validation is complex and error-prone',
          'SoC Pilot makes this accessible through conversation'
        ]
      },
      {
        id: 'workspace-setup',
        title: 'Workspace Creation',
        duration: '30 seconds',
        action: 'Create new IoT project from template',
        expectedResult: 'New project created with template components',
        keyPoints: [
          'Template-based project creation',
          'Pre-configured component libraries',
          'Organized workspace structure'
        ],
        troubleshooting: 'If template loading fails, create blank project and manually add components'
      },
      {
        id: 'conversation-demo',
        title: 'Conversational Design Process',
        duration: '3 minutes',
        action: 'Execute IoT microcontroller conversation flow',
        expectedResult: 'Complete architecture specification generated',
        keyPoints: [
          'Natural language requirements gathering',
          'AI-powered component suggestions',
          'Real-time architecture preview',
          'Intelligent follow-up questions'
        ],
        troubleshooting: 'Use pre-scripted responses if AI service is unavailable'
      },
      {
        id: 'diagram-generation',
        title: 'Automatic Diagram Generation',
        duration: '45 seconds',
        action: 'Generate and display system diagram',
        expectedResult: 'Professional SoC block diagram with proper connections',
        keyPoints: [
          'Automatic layout generation',
          'Component relationship visualization',
          'Interactive diagram editing',
          'Export capabilities'
        ]
      },
      {
        id: 'validation-showcase',
        title: 'Intelligent Design Validation',
        duration: '2 minutes',
        action: 'Run validation suite and show results',
        expectedResult: 'Validation results with warnings and suggestions',
        keyPoints: [
          'Multi-domain validation (power, thermal, connectivity)',
          'Extensible rule system',
          'Actionable feedback and suggestions',
          'Quality scoring and metrics'
        ]
      },
      {
        id: 'extensibility-demo',
        title: 'Custom Validation Rule',
        duration: '1.5 minutes',
        action: 'Add custom security validation rule',
        expectedResult: 'New rule integrated and executed successfully',
        keyPoints: [
          'Easy rule development and integration',
          'Custom validation logic',
          'Rule management interface',
          'Immediate feedback on design'
        ]
      },
      {
        id: 'conclusion',
        title: 'Summary & Impact',
        duration: '30 seconds',
        action: 'Show before/after comparison and benefits',
        expectedResult: 'Clear value proposition demonstrated',
        keyPoints: [
          'Democratizes SoC design expertise',
          'Reduces design time from weeks to hours',
          'Improves design quality through validation',
          'Extensible for custom requirements'
        ]
      }
    ],
    keyMessages: [
      'SoC Pilot transforms complex hardware design into natural conversation',
      'AI-powered suggestions accelerate the design process',
      'Extensible validation ensures design quality and compliance',
      'Makes advanced SoC design accessible to broader engineering teams'
    ],
    fallbackPlan: [
      'Pre-recorded demo video as backup',
      'Static screenshots for each major step',
      'Prepared conversation transcripts',
      'Manual diagram examples'
    ]
  },

  {
    id: 'technical-deep-dive',
    title: 'Technical Architecture Deep Dive',
    duration: '5 minutes',
    description: 'Detailed technical demonstration for engineering audience',
    steps: [
      {
        id: 'architecture-overview',
        title: 'System Architecture',
        duration: '1 minute',
        action: 'Show system architecture diagram',
        expectedResult: 'Clear understanding of technical components',
        keyPoints: [
          'RAG-enhanced conversational AI',
          'Component library management',
          'Validation engine architecture',
          'React Flow diagram generation'
        ]
      },
      {
        id: 'rag-demo',
        title: 'RAG Component Matching',
        duration: '1.5 minutes',
        action: 'Show component search and matching process',
        expectedResult: 'Demonstration of intelligent component selection',
        keyPoints: [
          'Semantic component search',
          'Compatibility checking',
          'Performance-based recommendations',
          'Real-time component library updates'
        ]
      },
      {
        id: 'validation-engine',
        title: 'Validation Engine Details',
        duration: '1.5 minutes',
        action: 'Show validation rule execution and results',
        expectedResult: 'Understanding of validation capabilities',
        keyPoints: [
          'Plugin-based validation architecture',
          'Multi-domain rule execution',
          'Confidence scoring algorithms',
          'Performance optimization'
        ]
      },
      {
        id: 'extensibility',
        title: 'Extensibility Framework',
        duration: '1 minute',
        action: 'Demonstrate adding custom components and rules',
        expectedResult: 'Clear path for customization and extension',
        keyPoints: [
          'Component library extensibility',
          'Custom validation rule development',
          'API integration capabilities',
          'Third-party tool integration'
        ]
      }
    ],
    keyMessages: [
      'Built on modern, scalable architecture',
      'Designed for extensibility and customization',
      'Production-ready with proper error handling',
      'Integrates with existing design workflows'
    ],
    fallbackPlan: [
      'Code walkthrough on screen',
      'Architecture diagrams and flowcharts',
      'API documentation examples'
    ]
  },

  {
    id: 'validation-showcase',
    title: 'Extensible Validation System Showcase',
    duration: '4 minutes',
    description: 'Focused demonstration of the validation system capabilities',
    steps: [
      {
        id: 'existing-rules',
        title: 'Built-in Validation Rules',
        duration: '1 minute',
        action: 'Show existing validation rules and categories',
        expectedResult: 'Overview of comprehensive validation coverage',
        keyPoints: [
          'Power budget validation',
          'Interface compatibility checking',
          'Thermal analysis',
          'Area constraint validation',
          'Clock domain analysis'
        ]
      },
      {
        id: 'rule-management',
        title: 'Rule Management Interface',
        duration: '45 seconds',
        action: 'Demonstrate enable/disable rules, priority adjustment',
        expectedResult: 'Flexible rule configuration demonstrated',
        keyPoints: [
          'Easy rule enable/disable',
          'Priority and severity adjustment',
          'Rule categorization',
          'Configuration persistence'
        ]
      },
      {
        id: 'custom-rule-creation',
        title: 'Custom Rule Development',
        duration: '1.5 minutes',
        action: 'Live code and integrate security validation rule',
        expectedResult: 'New rule successfully added and executed',
        keyPoints: [
          'Simple ValidationRule interface',
          'TypeScript development support',
          'Hot-reload capability',
          'Immediate integration'
        ]
      },
      {
        id: 'validation-execution',
        title: 'Validation Results Analysis',
        duration: '45 seconds',
        action: 'Run validation suite and analyze results',
        expectedResult: 'Comprehensive validation report with actionable insights',
        keyPoints: [
          'Multi-rule execution',
          'Confidence scoring',
          'Suggested fixes',
          'Visual result presentation'
        ]
      }
    ],
    keyMessages: [
      'Validation system is fully extensible',
      'Easy to add domain-specific rules',
      'Provides actionable feedback',
      'Scales to complex validation requirements'
    ],
    fallbackPlan: [
      'Pre-written validation rules to demonstrate',
      'Screenshots of validation results',
      'Code examples for rule development'
    ]
  }
];

// ============================================================================
// CONVERSATION FLOWS FOR DEMO
// ============================================================================

export const demoConversationFlows = {
  iotMicrocontroller: {
    title: 'IoT Microcontroller Design',
    scenario: demoScenarios.microcontroller,
    estimatedDuration: '3 minutes',
    flow: [
      {
        speaker: 'presenter',
        text: "Let me show you how easy it is to design an IoT device. I'll start a conversation with SoC Pilot.",
        action: 'Click on new conversation'
      },
      {
        speaker: 'presenter',
        text: "I need to design a low-power IoT device for smart home applications",
        action: 'Type message and send'
      },
      {
        speaker: 'ai',
        text: "I'd be happy to help you design an IoT device! To get started, could you tell me more about the specific requirements? For example:\n- What type of sensors or functionality will it have?\n- What connectivity do you need (WiFi, Bluetooth, etc.)?\n- Are there any power or size constraints?\n- What's your target cost range?",
        action: 'AI responds with clarifying questions'
      },
      {
        speaker: 'presenter',
        text: "It needs WiFi connectivity, should run on battery for at least a year, and needs to be very small",
        action: 'Provide more specific requirements'
      },
      {
        speaker: 'ai',
        text: "Great! For a battery-powered WiFi IoT device, I recommend starting with an ARM Cortex-M4 microcontroller. This provides good performance while maintaining low power consumption.\n\nLet me suggest some components:\n1. **ARM Cortex-M4** - Excellent power efficiency with FPU\n2. **WiFi 6 Controller** - Modern standard with good power management\n3. **128KB SRAM** - Sufficient for IoT applications\n\nWould you like me to elaborate on any of these components?",
        action: 'AI suggests specific components with rationale'
      },
      {
        speaker: 'presenter',
        text: "That sounds good. What about power consumption estimates?",
        action: 'Ask for power analysis'
      },
      {
        speaker: 'ai',
        text: "Let me break down the power consumption:\n\n**Active Mode:** ~255 mW\n**Sleep Mode:** ~13 mW\n**Average Power:** ~25 mW (assuming 95% sleep time)\n**Battery Life:** ~13 months with 3000 mAh battery\n\nThis meets your one-year requirement! Should I generate the system diagram?",
        action: 'AI provides detailed power analysis'
      },
      {
        speaker: 'presenter',
        text: "Yes, please generate the diagram and run validation",
        action: 'Request diagram generation and validation'
      }
    ]
  },

  applicationProcessor: {
    title: 'High-Performance Application Processor',
    scenario: demoScenarios.applicationProcessor,
    estimatedDuration: '2.5 minutes',
    flow: [
      {
        speaker: 'presenter',
        text: "Now let me show a more complex example - a high-performance application processor for edge AI.",
        action: 'Start new conversation'
      },
      {
        speaker: 'presenter',
        text: "I need a high-performance processor for edge AI applications",
        action: 'State high-level requirement'
      },
      {
        speaker: 'ai',
        text: "Excellent! Edge AI applications have unique requirements. Let me understand your needs:\n- What type of AI models (computer vision, NLP, etc.)?\n- Real-time inference or batch processing?\n- Power budget and thermal constraints?\n- Need for additional accelerators?\n\nFor edge AI, I typically recommend ARM Cortex-A78 or similar high-performance architectures.",
        action: 'AI asks targeted questions for complex requirements'
      },
      {
        speaker: 'presenter',
        text: "Computer vision models, real-time inference, power budget around 15W",
        action: 'Provide specific AI requirements'
      },
      {
        speaker: 'ai',
        text: "Perfect! For real-time computer vision with 15W budget:\n\n1. **ARM Cortex-A78** @ 3.0 GHz - 4000 DMIPS performance\n2. **8GB DDR5-3200** - 51.2 GB/s bandwidth for model loading\n3. **PCIe 4.0 Controller** - For optional GPU/NPU cards\n\nThis handles real-time inference for ResNet, YOLO, and similar models. Total power: ~8.5W peak, leaving headroom for accelerators.",
        action: 'AI suggests high-performance components with technical details'
      },
      {
        speaker: 'presenter',
        text: "Generate the system and run thermal analysis",
        action: 'Request diagram and thermal validation'
      }
    ]
  }
};

// ============================================================================
// EXPECTED VALIDATION OUTPUTS FOR DEMO
// ============================================================================

export const expectedValidationOutputs = {
  iotMicrocontroller: {
    overallScore: 85,
    results: [
      {
        rule: 'Power Budget Validation',
        status: 'warning',
        message: 'WiFi controller may exceed 100mW budget during transmission peaks',
        suggestion: 'Consider power management modes or duty cycling',
        confidence: 0.8
      },
      {
        rule: 'Interface Compatibility',
        status: 'pass',
        message: 'All component interfaces are properly matched',
        confidence: 0.95
      },
      {
        rule: 'Area Constraint',
        status: 'pass',
        message: 'Total area (5.9 mm²) within 10 mm² budget',
        confidence: 0.9
      },
      {
        rule: 'Clock Domain Analysis',
        status: 'pass',
        message: 'Clock domains properly synchronized',
        confidence: 0.85
      }
    ]
  },

  applicationProcessor: {
    overallScore: 78,
    results: [
      {
        rule: 'Power Budget Validation',
        status: 'pass',
        message: 'Peak power (8.5W) within 15W TDP budget',
        confidence: 0.9
      },
      {
        rule: 'Thermal Analysis',
        status: 'warning',
        message: 'High-performance components require active cooling',
        suggestion: 'Add heatsink with <3°C/W thermal resistance',
        confidence: 0.85
      },
      {
        rule: 'Interface Compatibility',
        status: 'pass',
        message: 'AXI and PCIe interfaces properly configured',
        confidence: 0.92
      },
      {
        rule: 'Performance Analysis',
        status: 'pass',
        message: 'System meets >10 TOPS AI inference requirement',
        confidence: 0.88
      }
    ]
  },

  customSecurityRule: {
    rule: 'Security Feature Validation',
    status: 'warning',
    message: 'IoT device should include encryption/security features',
    suggestion: 'Consider adding crypto accelerator or secure element',
    confidence: 0.8,
    affectedComponents: ['arm-cortex-m4-demo'],
    details: 'No encryption or secure boot capabilities detected in current design'
  }
};

// ============================================================================
// DEMO PREPARATION CHECKLIST
// ============================================================================

export const demoPrepChecklist = {
  technical: [
    '✓ All services running and responsive',
    '✓ Component library loaded with demo components',
    '✓ Validation rules configured and tested',
    '✓ Demo projects pre-created as backup',
    '✓ Network connectivity verified',
    '✓ AWS services accessible and configured',
    '✓ Browser performance optimized',
    '✓ Screen recording software ready'
  ],
  
  presentation: [
    '✓ Demo scripts reviewed and practiced',
    '✓ Timing verified for each section',
    '✓ Key messages memorized',
    '✓ Fallback materials prepared',
    '✓ Questions and answers prepared',
    '✓ Technical backup slides ready',
    '✓ Demo environment tested on presentation hardware'
  ],

  contingency: [
    '✓ Pre-recorded demo video available',
    '✓ Static screenshots for each step',
    '✓ Offline demo mode prepared',
    '✓ Alternative demo scenarios ready',
    '✓ Technical support contact available',
    '✓ Backup laptop configured',
    '✓ Mobile hotspot for network backup'
  ]
};

export default {
  hackathonDemoScripts,
  demoConversationFlows,
  expectedValidationOutputs,
  demoPrepChecklist
};