// Core SoC Pilot Data Structures
// This file defines all TypeScript interfaces for the SoC Pilot system

// ============================================================================
// CORE ARCHITECTURAL COMPONENT TYPES
// ============================================================================

export type ComponentCategory = 'CPU' | 'Memory' | 'Interconnect' | 'IO' | 'Accelerator' | 'Custom';

export interface PerformanceMetrics {
  clockFrequency?: string;
  bandwidth?: string;
  latency?: string;
  throughput?: string;
  powerConsumption?: string;
  area?: string;
}

export type BusType = 'PCIe' | 'DDR' | 'AXI4' | 'AXI4-Lite' | 'AXI4-Stream' | 'AHB' | 'APB' | 'GPIO' | 'SPI' | 'I2C' | 'UART' | 'Ethernet' | 'WiFi' | 'USB' | 'CXL' | 'Custom';

// Interface direction:
// - Bus interfaces: 'master' (initiates requests), 'slave' (receives requests),
//   'master & slave' (can both initiate and receive requests)
//   NOTE: master/slave refers to REQUEST initiation, NOT data flow direction
//   (e.g., DDR controller is 'slave' but data flows bidirectionally)
// - Simple signals: 'input', 'output', 'inout' (bidirectional signal)
export type InterfaceDirection = 'master' | 'slave' | 'master & slave' | 'input' | 'output' | 'inout';

export type InterfacePlacement = 'north' | 'south' | 'east' | 'west';

export interface InterfaceDefinition {
  id: string;
  name: string;
  // New fields (preferred)
  busType?: BusType;
  dataWidth?: number;
  // Legacy fields (backward compatibility)
  type?: BusType;
  width?: number;
  // Common fields
  direction: InterfaceDirection;
  placement?: InterfacePlacement;
  speed?: string;
  protocol?: string;
  voltage?: string;
  // AXI-specific fields
  addrWidth?: number;
  idWidth?: number;
  // Optional interface flag
  optional?: boolean;
}

export interface ArchitecturalProperties {
  performance?: {
    clockFrequency?: string;
    bandwidth?: string;
    latency?: string;
    throughput?: string;
  };
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
  [key: string]: any;
}

export interface ArchitecturalComponent {
  // ========== Basic Identification ==========
  id: string;
  name: string;
  category: ComponentCategory;
  type: string;
  version?: string;              // Component version

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
  createdAt?: string;            // ISO 8601 timestamp
  updatedAt?: string;            // ISO 8601 timestamp
}

// ============================================================================
// DESIGN PATTERNS AND TEMPLATES
// ============================================================================

export interface PatternConnection {
  sourceComponentId: string;
  targetComponentId: string;
  sourceInterface: string;
  targetInterface: string;
  connectionType: string;
  properties?: Record<string, any>;
}

export interface DiagramTemplate {
  layout: 'hierarchical' | 'force' | 'grid' | 'custom';
  positions?: Record<string, { x: number; y: number }>;
  styling?: Record<string, any>;
}

export interface DesignPattern {
  id: string;
  name: string;
  description: string;
  components: ArchitecturalComponent[];
  connections: PatternConnection[];
  useCase: string;
  benefits: string[];
  template: DiagramTemplate;
  category: 'IoT' | 'AI' | 'Networking' | 'Storage' | 'Custom';
  complexity: 'simple' | 'moderate' | 'complex';
  estimatedCost?: string;
  powerBudget?: string;
}

// ============================================================================
// CONVERSATION AND CHAT INTERFACES
// ============================================================================

export type ConversationPhase = 'requirements' | 'gathering' | 'refining' | 'confirming' | 'generating';

export interface ComponentSuggestion {
  component: ArchitecturalComponent;
  rationale: string;
  confidence: number;
  alternatives?: ArchitecturalComponent[];
  matchScore?: number;
  matchReason?: string;
}

export interface DesignDecision {
  id: string;
  decision: string;
  rationale: string;
  alternatives: string[];
  impact: string;
  timestamp: Date;
}

export interface ComponentRationale {
  componentId: string;
  reason: string;
  benefits: string[];
  tradeoffs: string[];
  alternatives: string[];
}

export interface ArchitectureDefinition {
  naturalLanguageSpec: string;
  selectedComponents: ArchitecturalComponent[];
  customComponents: ArchitecturalComponent[];
  performanceRequirements: string[];
  constraints: string[];
  designDecisions: DesignDecision[];
  componentRationale: ComponentRationale[];
  connections?: PatternConnection[];
  estimatedMetrics?: PerformanceMetrics;
  metadata?: {
    createdAt: string;
    source?: string;
    [key: string]: any;
  };
}

export interface ChatResponse {
  message: string;
  phase: ConversationPhase;
  architecturePreview?: ArchitectureDefinition;
  suggestedComponents?: ComponentSuggestion[];
  clarificationQuestions?: string[];
  quickReplies?: string[];  // Quick reply options for user to click
  checkboxOptions?: string[];  // Multi-select options for feature selection
  radioOptions?: string[];  // Single-select options for performance/configuration
  inputPrompt?: string | null;  // Prompt for custom text input
  initialRequirements?: string[];  // Requirements extracted from first message
  suggestedRefinements?: string[];
  readyToGenerate: boolean;
  sessionId: string;
  timestamp: Date;
}

// Confirmed selections made by user during conversation
export interface ConfirmedSelections {
  selectedFeatures: string[];                   // Features selected via checkbox (e.g., ["CPU Core", "Memory", "WiFi"])
  performanceChoices: Record<string, string>;   // Performance level per feature (e.g., {"CPU Core": "High Performance"})
  detailedParameters: Record<string, any>;      // Detailed parameters specified by user
}

export interface DesignSession {
  sessionId: string;
  userId?: string;
  projectId?: string;  // Project isolation: each session belongs to a specific project
  startTime: Date;
  lastActivity: Date;
  phase: ConversationPhase;
  currentArchitecture?: ArchitectureDefinition;
  conversationHistory: ChatMessage[];
  requirements: string[];
  constraints: string[];
  isArchitectureGenerated?: boolean;  // Track if architecture has been actually generated (not just suggested in conversation)

  // User's confirmed selections during conversation
  confirmedSelections?: ConfirmedSelections;

  // DRC validation result (stored after architecture generation)
  drcResult?: {
    passed: boolean;  // true if critical violations = 0
    summary?: {
      critical: number;
      warning: number;
      info: number;
    };
    iterations?: number;
    errors?: string[];
  };
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// ============================================================================
// DIAGRAM AND VISUALIZATION TYPES
// ============================================================================

export interface Position {
  x: number;
  y: number;
}

export interface NodeData {
  component: ArchitecturalComponent;
  label: string;
  type: string;
  properties: ArchitecturalProperties;
  validationStatus?: 'valid' | 'warning' | 'error';
  validationMessages?: string[];
}

export interface DiagramData {
  nodes: any[];
  edges: any[];
  layout?: string;
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
  metadata?: {
    createdAt: Date;
    lastModified: Date;
    version: string;
  };
}

// Type aliases for diagram-generator compatibility
export type DiagramNode = ReactFlowNode;
export type DiagramEdge = ReactFlowEdge;
export type ComponentConnection = PatternConnection;
export type LayoutAlgorithm = 'hierarchical' | 'force' | 'grid' | 'manual';
export type DiagramLayout = LayoutConfig;

export interface EdgeData {
  sourceInterface: string;
  targetInterface: string;
  connectionType: string;
  bandwidth?: string;
  protocol?: string;
  validationStatus?: 'valid' | 'warning' | 'error';
}

export interface ReactFlowNode {
  id: string;
  type: string;
  position: Position;
  data: NodeData;
  style?: Record<string, any>;
  className?: string;
}

export interface ReactFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  data: EdgeData;
  style?: Record<string, any>;
  className?: string;
}

export interface LayoutConfig {
  algorithm: 'hierarchical' | 'force' | 'grid' | 'manual';
  direction?: 'TB' | 'BT' | 'LR' | 'RL';
  spacing?: {
    nodeSpacing: number;
    rankSpacing: number;
  };
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
}

export interface ReactFlowData {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
  layout: LayoutConfig;
  metadata?: {
    generatedAt: Date;
    version: string;
    source: 'conversation' | 'drag-drop' | 'pattern' | 'manual';
  };
}

// ============================================================================
// VALIDATION SYSTEM TYPES
// ============================================================================

export type ValidationSeverity = 'error' | 'warning' | 'info';
export type ValidationCategory = 'connectivity' | 'power' | 'clock' | 'performance' | 'compliance' | 'custom';
export type ValidationSource = 'hard-coded' | 'llm-enhanced' | 'user-defined';

export interface ValidationResult {
  ruleId: string;
  severity: ValidationSeverity;
  message: string;
  affectedComponents: string[];
  suggestedFix?: string;
  confidence?: number;
  source?: ValidationSource;
  category: ValidationCategory;
  timestamp: Date;
}

export interface RuleConfig {
  enabled: boolean;
  severity?: ValidationSeverity;
  parameters?: Record<string, any>;
  customMessage?: string;
}

export interface ValidationRule {
  id: string;
  name: string;
  description: string;
  category: ValidationCategory;
  severity: ValidationSeverity;
  enabled: boolean;
  priority: number;
  config?: RuleConfig;
  validate(spec: SoCSpecification): ValidationResult[] | Promise<ValidationResult[]>;
}

export interface ValidationOptions {
  severityFilter?: ValidationSeverity;
  categoryFilter?: ValidationCategory[];
  enabledOnly?: boolean;
  ruleIds?: string[];
}

// ============================================================================
// WORKSPACE AND PROJECT TYPES
// ============================================================================

export interface ProjectWorkspace {
  projectId: string;
  name: string;
  rootPath: string;
  specificationPath: string;
  diagramDataPath: string;
  diagramConfigPath: string;
  configPath: string;
  componentLibraryPath: string;
  createdAt: Date;
  lastModified: Date;
  version: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  tags: string[];
  createdAt: Date;
  lastModified: Date;
  sessions: string[];
  diagrams: string[];
  specifications: string[];
}

export interface ProjectMetadata {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  lastModified: Date;
  tags: string[];
}

export interface WorkspaceConfig {
  version: string;
  createdAt: Date;
  lastModified: Date;
  projects: ProjectMetadata[];
  settings: {
    autoSave: boolean;
    theme: string;
    defaultLayout: string;
    backupInterval?: number;
    maxBackups?: number;
  };
}

export interface FileInfo {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size?: number;
  lastModified: Date;
  extension?: string;
  mimeType?: string;
}

export interface NaturalLanguageSpec {
  title: string;
  overview: string;
  requirements: string[];
  architecture: string;
  components: ComponentDescription[];
  constraints: string[];
  designRationale: string[];
  generatedAt: Date;
  version: string;
  projectId: string;
}

export interface ComponentDescription {
  name: string;
  type: string;
  purpose: string;
  specifications: string[];
  connections: string[];
  rationale: string;
}

// ============================================================================
// SOC SPECIFICATION AND SYSTEM TYPES
// ============================================================================

export interface SoCSpecification {
  id: string;
  name: string;
  description: string;
  components: ArchitecturalComponent[];
  connections: PatternConnection[];
  requirements: string[];
  constraints: string[];
  performanceTargets: PerformanceMetrics;
  powerBudget?: string;
  areaBudget?: string;
  technology?: string;
  targetMarket?: string;
  createdAt: Date;
  lastModified: Date;
  version: string;
}

export interface ArchitectureChange {
  type: 'add' | 'remove' | 'modify' | 'connect' | 'disconnect';
  componentId?: string;
  component?: ArchitecturalComponent;
  connection?: PatternConnection;
  property?: string;
  oldValue?: any;
  newValue?: any;
  reason: string;
  timestamp: Date;
}

export interface DesignChange {
  id: string;
  type: 'component' | 'connection' | 'property';
  action: 'add' | 'remove' | 'modify';
  target: string;
  details: Record<string, any>;
  reason?: string;
  timestamp: Date;
}

// ============================================================================
// RAG AND COMPONENT LIBRARY TYPES
// ============================================================================

export interface ComponentMatch {
  component: ArchitecturalComponent;
  matchScore: number;
  matchReason: string;
  keywords: string[];
  relevantProperties: string[];
}

export interface ComponentLibraryMetadata {
  version: string;
  lastUpdated: string; // ISO date string
  totalComponents: number;
  categories: Record<ComponentCategory, number>;
  tags: string[];
  vendors: string[];
}

export interface ComponentLibrary {
  metadata: ComponentLibraryMetadata;
  components: ArchitecturalComponent[];
  patterns: DesignPattern[];
  categories: Record<ComponentCategory, ArchitecturalComponent[]>;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: Date;
  requestId: string;
}

export interface PaginatedResponse<T> extends APIResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================================================
// AWS SERVICE INTEGRATION TYPES
// ============================================================================

export interface BedrockConfig {
  region: string;
  modelId: string;
  maxTokens: number;
  temperature: number;
  topP: number;
}

export interface NovaActConfig {
  agentId: string;
  region: string;
  sessionTimeout: number;
}

export interface AWSServiceHealth {
  service: 'bedrock' | 'nova-act' | 's3';
  status: 'healthy' | 'degraded' | 'unavailable';
  lastCheck: Date;
  responseTime?: number;
  errorMessage?: string;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface AppConfig {
  version: string;
  environment: 'development' | 'staging' | 'production';
  aws: {
    region: string;
    bedrock: BedrockConfig;
    novaAct: NovaActConfig;
  };
  ui: {
    theme: 'light' | 'dark' | 'auto';
    defaultLayout: LayoutConfig;
    enableAnimations: boolean;
  };
  validation: {
    enabledRules: string[];
    defaultSeverity: ValidationSeverity;
    autoValidate: boolean;
  };
  workspace: {
    defaultPath: string;
    autoSave: boolean;
    backupEnabled: boolean;
  };
}

// ============================================================================
// EXPORT ALL TYPES
// ============================================================================

export * from './schemas';