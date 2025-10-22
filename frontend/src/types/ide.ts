
export type Language = 'html' | 'css' | 'javascript' | 'python' | 'json' | 'text' | 'c' | 'assembly' | 'shell' | 'markdown' | 'canvas' | 'emulation';

export type ViewMode = 'home' | 'concept' | 'architect' | 'drc' | 'code' | 'analytics' | 'bom' | 'deliver' | 'settings' | 'container' | 'admin';

export type ContainerStatus = 'unknown' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
export interface FileSystemNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  language?: Language;
  children?: FileSystemNode[];
  content?: string;
  path: string;
}

export interface OpenFile {
  id: string;
  name: string;
  type: 'file';
  path: string;
  projectContext: string | null;
  language: Language;
  content?: string;
  isReadOnly?: boolean;
  isLoading?: boolean;
}



export interface ProjectListing {
  name: string;
  path: string;
  createdAt: Date;
  lastModified: Date;
}

export interface DynamicCanvasNodeData {
  label: string;
  model_type?: string;
  iconName?: string;
  componentId?: string; // ID from component library (for tracking library components)
  width?: number;
  height?: number;
  base_address?: string;
  address_mask?: string;
  target_addr_base?: string;
  target_addr_space?: string;
  is_read_only?: boolean;
  showOptionalPorts?: boolean; // Whether to show optional interfaces
  interfaces?: Array<{
    id: string;
    name: string;
    type: string;
    direction: 'master' | 'slave' | 'master & slave' | 'input' | 'output' | 'inout';
    placement?: 'north' | 'south' | 'west' | 'east'; // Handle placement on node (top/bottom/left/right)
    busType?: string;
    dataWidth?: number;
    addrWidth?: number;
    idWidth?: number;
    speed?: string;
    protocol?: string;
    optional?: boolean; // Whether this interface is optional
    dataFlowRole?: 'initiator' | 'target' | 'both' | 'none'; // Role in data flow matrix
  }>;
}


export interface CanvasFileFormatNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: DynamicCanvasNodeData;
  width?: number;
  height?: number;
}

export interface CanvasFileFormatEdge {
  id: string;
  type?: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface CanvasFileFormat {
  nodes: CanvasFileFormatNode[];
  edges: CanvasFileFormatEdge[];
  viewport?: any;
}

export interface CodeViewWorkspaceState {
  openCodeEditorPaths?: string[];
  activeCodeEditorPath?: string | null;
}

// Deprecated: Use ArchitecturalComponent from backend.ts instead
// Kept as type alias for backward compatibility during migration
import type { ArchitecturalComponent } from './backend';
export type UserComponentDefinition = ArchitecturalComponent;

// Application-wide settings
export interface AppSettings {
  globalEnableFancyAnimations?: boolean; // Mock global setting
  codeViewTerminalWssUrl?: string; // Will become ws:// if server is http
  architectShowGrid?: boolean; // Mock architect setting
  maxDrcIterations?: number; // EDA Engine: Max DRC iterations (3-10, default 5)
}
