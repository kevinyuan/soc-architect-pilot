// JSON Schemas for SoC Pilot Data Validation
// These schemas are used for runtime validation of data structures

export const ComponentCategorySchema = {
  type: "string",
  enum: ["CPU", "Memory", "Interconnect", "IO", "Accelerator", "Custom"]
} as const;

export const InterfaceDefinitionSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    type: {
      type: "string",
      enum: ["PCIe", "DDR", "AXI4", "AXI4-Lite", "AXI4-Stream", "AHB", "APB", "GPIO", "SPI", "I2C", "UART", "Ethernet", "WiFi", "USB", "CXL", "Custom"]
    },
    direction: {
      type: "string",
      enum: ["input", "output", "bidirectional"]
    },
    width: { type: "number", minimum: 1 },
    speed: { type: "string" },
    protocol: { type: "string" },
    voltage: { type: "string" }
  },
  required: ["id", "name", "type", "direction"],
  additionalProperties: false
} as const;

export const PerformanceMetricsSchema = {
  type: "object",
  properties: {
    clockFrequency: { type: "string" },
    bandwidth: { type: "string" },
    latency: { type: "string" },
    throughput: { type: "string" },
    powerConsumption: { type: "string" },
    area: { type: "string" }
  },
  additionalProperties: false
} as const;

export const ArchitecturalPropertiesSchema = {
  type: "object",
  properties: {
    performance: {
      type: "object",
      properties: {
        clockFrequency: { type: "string" },
        bandwidth: { type: "string" },
        latency: { type: "string" },
        throughput: { type: "string" }
      },
      additionalProperties: false
    },
    power: {
      type: "object",
      properties: {
        typical: { type: "string" },
        peak: { type: "string" },
        idle: { type: "string" },
        voltage: { type: "string" }
      },
      additionalProperties: false
    },
    physical: {
      type: "object",
      properties: {
        area: { type: "string" },
        technology: { type: "string" },
        packageType: { type: "string" }
      },
      additionalProperties: false
    },
    interfaces: {
      type: "array",
      items: { type: "string" }
    },
    protocols: {
      type: "array",
      items: { type: "string" }
    }
  },
  additionalProperties: true
} as const;

export const ArchitecturalComponentSchema = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    category: ComponentCategorySchema,
    type: { type: "string", minLength: 1 },
    properties: ArchitecturalPropertiesSchema,
    interfaces: {
      type: "array",
      items: InterfaceDefinitionSchema
    },
    icon: { type: "string" },
    description: { type: "string" },
    estimatedMetrics: PerformanceMetricsSchema,
    tags: {
      type: "array",
      items: { type: "string" }
    },
    vendor: { type: "string" },
    partNumber: { type: "string" },
    datasheet: { type: "string", format: "uri" },
    compatibility: {
      type: "array",
      items: { type: "string" }
    },
    customizable: { type: "boolean" },
    baseTemplate: { type: "string" }
  },
  required: ["id", "name", "category", "type", "properties", "interfaces", "icon", "description", "estimatedMetrics", "tags", "compatibility", "customizable"],
  additionalProperties: false
} as const;

export const PatternConnectionSchema = {
  type: "object",
  properties: {
    sourceComponentId: { type: "string", minLength: 1 },
    targetComponentId: { type: "string", minLength: 1 },
    sourceInterface: { type: "string", minLength: 1 },
    targetInterface: { type: "string", minLength: 1 },
    connectionType: { type: "string", minLength: 1 },
    properties: { type: "object" }
  },
  required: ["sourceComponentId", "targetComponentId", "sourceInterface", "targetInterface", "connectionType"],
  additionalProperties: false
} as const;

export const DiagramTemplateSchema = {
  type: "object",
  properties: {
    layout: {
      type: "string",
      enum: ["hierarchical", "force", "grid", "custom"]
    },
    positions: {
      type: "object",
      patternProperties: {
        ".*": {
          type: "object",
          properties: {
            x: { type: "number" },
            y: { type: "number" }
          },
          required: ["x", "y"],
          additionalProperties: false
        }
      }
    },
    styling: { type: "object" }
  },
  required: ["layout"],
  additionalProperties: false
} as const;

export const DesignPatternSchema = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    components: {
      type: "array",
      items: ArchitecturalComponentSchema
    },
    connections: {
      type: "array",
      items: PatternConnectionSchema
    },
    useCase: { type: "string" },
    benefits: {
      type: "array",
      items: { type: "string" }
    },
    template: DiagramTemplateSchema,
    category: {
      type: "string",
      enum: ["IoT", "AI", "Networking", "Storage", "Custom"]
    },
    complexity: {
      type: "string",
      enum: ["simple", "moderate", "complex"]
    },
    estimatedCost: { type: "string" },
    powerBudget: { type: "string" }
  },
  required: ["id", "name", "description", "components", "connections", "useCase", "benefits", "template", "category", "complexity"],
  additionalProperties: false
} as const;

export const ComponentSuggestionSchema = {
  type: "object",
  properties: {
    component: ArchitecturalComponentSchema,
    rationale: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    alternatives: {
      type: "array",
      items: ArchitecturalComponentSchema
    },
    matchScore: { type: "number", minimum: 0, maximum: 1 },
    matchReason: { type: "string" }
  },
  required: ["component", "rationale", "confidence"],
  additionalProperties: false
} as const;

export const ValidationResultSchema = {
  type: "object",
  properties: {
    ruleId: { type: "string", minLength: 1 },
    severity: {
      type: "string",
      enum: ["error", "warning", "info"]
    },
    message: { type: "string", minLength: 1 },
    affectedComponents: {
      type: "array",
      items: { type: "string" }
    },
    suggestedFix: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    source: {
      type: "string",
      enum: ["hard-coded", "llm-enhanced", "user-defined"]
    },
    category: {
      type: "string",
      enum: ["connectivity", "power", "clock", "performance", "compliance", "custom"]
    },
    timestamp: { type: "string", format: "date-time" }
  },
  required: ["ruleId", "severity", "message", "affectedComponents", "category", "timestamp"],
  additionalProperties: false
} as const;

export const ReactFlowDataSchema = {
  type: "object",
  properties: {
    nodes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", minLength: 1 },
          type: { type: "string" },
          position: {
            type: "object",
            properties: {
              x: { type: "number" },
              y: { type: "number" }
            },
            required: ["x", "y"],
            additionalProperties: false
          },
          data: {
            type: "object",
            properties: {
              component: ArchitecturalComponentSchema,
              label: { type: "string" },
              type: { type: "string" },
              properties: ArchitecturalPropertiesSchema,
              validationStatus: {
                type: "string",
                enum: ["valid", "warning", "error"]
              },
              validationMessages: {
                type: "array",
                items: { type: "string" }
              }
            },
            required: ["component", "label", "type", "properties"],
            additionalProperties: false
          },
          style: { type: "object" },
          className: { type: "string" }
        },
        required: ["id", "type", "position", "data"],
        additionalProperties: false
      }
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", minLength: 1 },
          source: { type: "string", minLength: 1 },
          target: { type: "string", minLength: 1 },
          sourceHandle: { type: "string" },
          targetHandle: { type: "string" },
          data: {
            type: "object",
            properties: {
              sourceInterface: { type: "string" },
              targetInterface: { type: "string" },
              connectionType: { type: "string" },
              bandwidth: { type: "string" },
              protocol: { type: "string" },
              validationStatus: {
                type: "string",
                enum: ["valid", "warning", "error"]
              }
            },
            required: ["sourceInterface", "targetInterface", "connectionType"],
            additionalProperties: false
          },
          style: { type: "object" },
          className: { type: "string" }
        },
        required: ["id", "source", "target", "data"],
        additionalProperties: false
      }
    },
    layout: {
      type: "object",
      properties: {
        algorithm: {
          type: "string",
          enum: ["hierarchical", "force", "grid", "manual"]
        },
        direction: {
          type: "string",
          enum: ["TB", "BT", "LR", "RL"]
        },
        spacing: {
          type: "object",
          properties: {
            nodeSpacing: { type: "number", minimum: 0 },
            rankSpacing: { type: "number", minimum: 0 }
          },
          required: ["nodeSpacing", "rankSpacing"],
          additionalProperties: false
        },
        viewport: {
          type: "object",
          properties: {
            x: { type: "number" },
            y: { type: "number" },
            zoom: { type: "number", minimum: 0.1, maximum: 10 }
          },
          required: ["x", "y", "zoom"],
          additionalProperties: false
        }
      },
      required: ["algorithm"],
      additionalProperties: false
    },
    metadata: {
      type: "object",
      properties: {
        generatedAt: { type: "string", format: "date-time" },
        version: { type: "string" },
        source: {
          type: "string",
          enum: ["conversation", "drag-drop", "pattern", "manual"]
        }
      },
      required: ["generatedAt", "version", "source"],
      additionalProperties: false
    }
  },
  required: ["nodes", "edges", "layout"],
  additionalProperties: false
} as const;

export const ProjectWorkspaceSchema = {
  type: "object",
  properties: {
    projectId: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    rootPath: { type: "string", minLength: 1 },
    specificationPath: { type: "string", minLength: 1 },
    diagramDataPath: { type: "string", minLength: 1 },
    diagramConfigPath: { type: "string", minLength: 1 },
    configPath: { type: "string", minLength: 1 },
    componentLibraryPath: { type: "string", minLength: 1 },
    createdAt: { type: "string", format: "date-time" },
    lastModified: { type: "string", format: "date-time" },
    version: { type: "string" }
  },
  required: ["projectId", "name", "rootPath", "specificationPath", "diagramDataPath", "diagramConfigPath", "configPath", "componentLibraryPath", "createdAt", "lastModified", "version"],
  additionalProperties: false
} as const;

export const SoCSpecificationSchema = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    components: {
      type: "array",
      items: ArchitecturalComponentSchema
    },
    connections: {
      type: "array",
      items: PatternConnectionSchema
    },
    requirements: {
      type: "array",
      items: { type: "string" }
    },
    constraints: {
      type: "array",
      items: { type: "string" }
    },
    performanceTargets: PerformanceMetricsSchema,
    powerBudget: { type: "string" },
    areaBudget: { type: "string" },
    technology: { type: "string" },
    targetMarket: { type: "string" },
    createdAt: { type: "string", format: "date-time" },
    lastModified: { type: "string", format: "date-time" },
    version: { type: "string" }
  },
  required: ["id", "name", "description", "components", "connections", "requirements", "constraints", "performanceTargets", "createdAt", "lastModified", "version"],
  additionalProperties: false
} as const;

export const ComponentLibrarySchema = {
  type: "object",
  properties: {
    metadata: {
      type: "object",
      properties: {
        version: { type: "string" },
        lastUpdated: { type: "string", format: "date-time" },
        totalComponents: { type: "number", minimum: 0 },
        categories: {
          type: "object",
          patternProperties: {
            "^(CPU|Memory|Interconnect|IO|Accelerator|Custom)$": { type: "number", minimum: 0 }
          },
          additionalProperties: false
        },
        tags: {
          type: "array",
          items: { type: "string" }
        },
        vendors: {
          type: "array",
          items: { type: "string" }
        }
      },
      required: ["version", "lastUpdated", "totalComponents", "categories", "tags", "vendors"],
      additionalProperties: false
    },
    components: {
      type: "array",
      items: ArchitecturalComponentSchema
    },
    patterns: {
      type: "array",
      items: DesignPatternSchema
    },
    categories: {
      type: "object",
      patternProperties: {
        "^(CPU|Memory|Interconnect|IO|Accelerator|Custom)$": {
          type: "array",
          items: ArchitecturalComponentSchema
        }
      },
      additionalProperties: false
    }
  },
  required: ["metadata", "components", "patterns", "categories"],
  additionalProperties: false
} as const;

// API Response Schemas
export const APIResponseSchema = {
  type: "object",
  properties: {
    success: { type: "boolean" },
    data: {},
    error: {
      type: "object",
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        details: {}
      },
      required: ["code", "message"],
      additionalProperties: false
    },
    timestamp: { type: "string", format: "date-time" },
    requestId: { type: "string" }
  },
  required: ["success", "timestamp", "requestId"],
  additionalProperties: false
} as const;

// Configuration Schemas
export const AppConfigSchema = {
  type: "object",
  properties: {
    version: { type: "string" },
    environment: {
      type: "string",
      enum: ["development", "staging", "production"]
    },
    aws: {
      type: "object",
      properties: {
        region: { type: "string" },
        bedrock: {
          type: "object",
          properties: {
            region: { type: "string" },
            modelId: { type: "string" },
            maxTokens: { type: "number", minimum: 1 },
            temperature: { type: "number", minimum: 0, maximum: 2 },
            topP: { type: "number", minimum: 0, maximum: 1 }
          },
          required: ["region", "modelId", "maxTokens", "temperature", "topP"],
          additionalProperties: false
        },
        novaAct: {
          type: "object",
          properties: {
            agentId: { type: "string" },
            region: { type: "string" },
            sessionTimeout: { type: "number", minimum: 1 }
          },
          required: ["agentId", "region", "sessionTimeout"],
          additionalProperties: false
        }
      },
      required: ["region", "bedrock", "novaAct"],
      additionalProperties: false
    },
    ui: {
      type: "object",
      properties: {
        theme: {
          type: "string",
          enum: ["light", "dark", "auto"]
        },
        defaultLayout: {
          type: "object",
          properties: {
            algorithm: {
              type: "string",
              enum: ["hierarchical", "force", "grid", "manual"]
            }
          },
          required: ["algorithm"],
          additionalProperties: true
        },
        enableAnimations: { type: "boolean" }
      },
      required: ["theme", "defaultLayout", "enableAnimations"],
      additionalProperties: false
    },
    validation: {
      type: "object",
      properties: {
        enabledRules: {
          type: "array",
          items: { type: "string" }
        },
        defaultSeverity: {
          type: "string",
          enum: ["error", "warning", "info"]
        },
        autoValidate: { type: "boolean" }
      },
      required: ["enabledRules", "defaultSeverity", "autoValidate"],
      additionalProperties: false
    },
    workspace: {
      type: "object",
      properties: {
        defaultPath: { type: "string" },
        autoSave: { type: "boolean" },
        backupEnabled: { type: "boolean" }
      },
      required: ["defaultPath", "autoSave", "backupEnabled"],
      additionalProperties: false
    }
  },
  required: ["version", "environment", "aws", "ui", "validation", "workspace"],
  additionalProperties: false
} as const;