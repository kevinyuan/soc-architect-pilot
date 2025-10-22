/**
 * Backend Type Definitions
 * 
 * This file contains type definitions that match the backend API.
 * These types should be kept in sync with /backend/src/types/index.ts
 * 
 * Last synced: 2025-01-17
 */

export type ComponentCategory = 'CPU' | 'Memory' | 'Interconnect' | 'IO' | 'Accelerator' | 'Custom';

export interface PerformanceMetrics {
  clockFrequency?: string;
  bandwidth?: string;
  latency?: string;
  throughput?: string;
  powerConsumption?: string;
  area?: string;
}

/**
 * Internal Path Definition
 * Defines a data path between two interfaces within a component
 */
export interface InternalPath {
  from: string; // Interface ID (source)
  to: string;   // Interface ID (destination)
  bandwidth?: number; // Bandwidth in bits/s (optional, calculated if missing)
  latency?: number;   // Latency in clock cycles (optional, defaults to module default or 10)
  bidirectional?: boolean; // Whether the path works in both directions
}

export interface InterfaceDefinition {
  id: string;
  name: string;
  busType: 'PCIe' | 'DDR' | 'AXI4' | 'AXI4-Lite' | 'AXI4-Stream' | 'AHB' | 'APB' | 'GPIO' | 'SPI' | 'I2C' | 'UART' | 'Ethernet' | 'WiFi' | 'USB' | 'CXL' | 'Custom';
  // Bus interfaces: 'master' (initiates requests), 'slave' (receives requests),
  // 'master & slave' (can both initiate and receive)
  // NOTE: Refers to REQUEST direction, NOT data flow (DDR controller is 'slave')
  // Simple signals: 'input', 'output', 'inout'
  direction: 'master' | 'slave' | 'master & slave' | 'input' | 'output' | 'inout';
  placement?: 'north' | 'south' | 'west' | 'east'; // Handle placement on node (top/bottom/left/right)
  dataWidth?: number; // Data width in bits
  addrWidth?: number; // Address width in bits (for AXI/AHB/APB interfaces)
  idWidth?: number; // ID width in bits (for AXI4 transaction IDs)
  speed?: string; // Clock frequency (e.g., "2400 MHz", "1.5 GHz")
  protocol?: string;
  voltage?: string;
  optional?: boolean; // Whether this interface is optional (e.g., debug ports)
  dataFlowRole?: 'initiator' | 'target' | 'both' | 'none'; // Role in data flow matrix

  // Performance characteristics (per-interface basis)
  performance?: {
    bandwidth?: string; // e.g., "64 GB/s" - data transfer capacity
    throughput?: string; // e.g., "32 GT/s" - transaction rate
    latency?: string; // e.g., "50 ns" - interface latency
    maxFrequency?: string; // e.g., "3200 MHz" - maximum operating frequency
  };
}

export interface ArchitecturalProperties {
  clockFrequency?: string; // Component clock frequency (e.g., "1.5 GHz")
  power?: {
    typical?: string;
    peak?: string;
    idle?: string;
    voltage?: string;
  };
  physical?: {
    area?: string;
    technology?: string;
    packageType?: string;
  };
  interfaces?: string[];
  protocols?: string[];
  
  // Path configuration
  defaultPathLatency?: number; // Default latency for all paths in clock cycles (default: 10)
  paths?: InternalPath[]; // Internal paths between interfaces
  
  [key: string]: any;
}

/**
 * Architectural Component
 * Represents a hardware component in the SoC architecture
 */
export interface ArchitecturalComponent {
  // ========== Basic Identification ==========
  id: string;
  name: string;
  category: ComponentCategory;
  type: string;
  
  // ========== Backend Analysis Requirements ==========
  properties: ArchitecturalProperties;
  interfaces: InterfaceDefinition[];
  estimatedMetrics: PerformanceMetrics;
  compatibility: string[];
  
  // ========== Frontend Rendering Requirements ==========
  visualization: {
    icon: string;                // Icon name (e.g., "Cpu", "Memory", "Network")
    width?: number;              // Node width (default: 160)
    height?: number;             // Node height (default: 80)
  };
  
  // ========== Hardware Address Mapping ==========
  addressMapping?: {
    baseAddress?: string;        // Base address (e.g., "1MB")
    addressSpace?: string;       // Address space (e.g., "0x80000000")
    addressMask?: string;        // Address mask
    isReadOnly?: boolean;        // Read-only flag
  };
  
  // ========== Metadata ==========
  description: string;
  tags: string[];
  vendor?: string;
  partNumber?: string;
  datasheet?: string;
  customizable: boolean;
  baseTemplate?: string;
}

/**
 * Design Pattern
 * Represents a proven architectural pattern
 */
export interface DesignPattern {
  id: string;
  name: string;
  description: string;
  category: string;
  components: ArchitecturalComponent[];
  benefits: string[];
  tradeoffs: string[];
  useCases: string[];
}

/**
 * SoC Specification
 * Natural language specification for the SoC design
 */
export interface SoCSpecification {
  title: string;
  overview: string;
  requirements: string[];
  architecture: string;
  components: ArchitecturalComponent[];
  constraints: string[];
  designRationale: string[];
  generatedAt: Date;
}

/**
 * Validation Result
 * Result from design validation
 */
export interface ValidationResult {
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  affectedComponents: string[];
  suggestedFix?: string;
  confidence?: number;
  source?: 'hard-coded' | 'llm-enhanced' | 'user-defined';
}

/**
 * Validation Report
 * Complete validation report for a design
 */
export interface ValidationReport {
  summary: {
    overallScore: number;
    results: ValidationResult[];
    totalIssues: number;
    criticalIssues: number;
    warnings: number;
  };
  criticalIssues: ValidationResult[];
  warnings: ValidationResult[];
  suggestions: string[];
  qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  appliedRules: string[];
  timestamp: Date;
}

/**
 * Chat Message
 * Message in a chat session
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: {
    suggestedComponents?: ComponentSuggestion[];
    architecturePreview?: ArchitectureDefinition;
    clarificationQuestions?: string[];
    suggestedRefinements?: string[];
  };
}

/**
 * Component Suggestion
 * AI-suggested component for the architecture
 */
export interface ComponentSuggestion {
  component: ArchitecturalComponent;
  rationale: string;
  confidence: number;
  alternatives?: ArchitecturalComponent[];
}

/**
 * Architecture Definition
 * Complete architecture definition from chat
 */
export interface ArchitectureDefinition {
  naturalLanguageSpec: string;
  selectedComponents: ArchitecturalComponent[];
  customComponents: ArchitecturalComponent[];
  performanceRequirements: string[];
  constraints: string[];
  designDecisions?: any[];
  componentRationale?: any[];
}

/**
 * Chat Session
 * A design conversation session
 */
export interface ChatSession {
  sessionId: string;
  userId?: string;
  phase: 'gathering' | 'refining' | 'confirming' | 'generating';
  startTime: Date;
  lastActivity: Date;
  conversationHistory: ChatMessage[];
  currentArchitecture?: ArchitectureDefinition;
}

/**
 * Project
 * A workspace project
 */
export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  lastModified: Date;
  tags?: string[];
  metadata?: any;
}

/**
 * Diagram Data
 * React Flow diagram data
 */
export interface DiagramData {
  nodes: any[]; // ReactFlowNode[]
  edges: any[]; // ReactFlowEdge[]
  layout: {
    algorithm: string;
    direction?: string;
    spacing?: {
      nodeSpacing: number;
      rankSpacing: number;
    };
    viewport: {
      x: number;
      y: number;
      zoom: number;
    };
  };
  metadata: {
    generatedAt: string;
    version: string;
    source: string;
  };
}
