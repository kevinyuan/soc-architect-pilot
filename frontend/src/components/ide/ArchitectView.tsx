
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import ReactFlow, {
  Background,
  useNodesState as useNodesStateReactFlow,
  useEdgesState as useEdgesStateReactFlow,
  addEdge as addEdgeReactFlow,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  Position,
  type FitViewOptions,
  Panel,
} from 'reactflow';
import path from 'path-browserify';
import { isEqual, cloneDeep, throttle } from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import type { CanvasFileFormat, CanvasFileFormatNode, CanvasFileFormatEdge, DynamicCanvasNodeData } from '@/types/ide';
import type { ArchitecturalComponent } from '@/types/backend';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2, MessageSquare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { InvalidEdgesDialog } from './InvalidEdgesDialog';
import { cn } from '@/lib/utils';
import { ArchitectComponentLibrary } from './ArchitectComponentLibrary';
import { ArchitectRightPanel } from './ArchitectRightPanel';
import { UnifiedChatAssistant } from './UnifiedChatAssistant';
import { DynamicCanvasNode } from './custom-nodes/DynamicCanvasNode';
import { readUserComponentsLib, removeComponentFromUserLib, readAppComponentsLib } from '@/actions/workspace-actions';
import { ArchitectCanvasCore } from './ArchitectCanvasCore';
import { workspaceAPI } from '@/lib/workspace-api';
import { componentAPI } from '@/lib/component-api';
import { validationAPI } from '@/lib/validation-api';


const ARCH_DIAGRAM_FILENAME = "arch_diagram.json"; // From concept view AI generation (project root)
const DEFAULT_AUTO_SAVE_INTERVAL_MS = 10000;
const MAX_HISTORY_LENGTH = 30;


const MIN_PANEL_WIDTH = 150;
const MAX_PANEL_WIDTH_PERCENT = 0.5;
const DEFAULT_SIDE_PANEL_WIDTH = 288;

const DEFAULT_INITIAL_NODE_DATA_WIDTH = 160;
const DEFAULT_INITIAL_NODE_DATA_HEIGHT = 80;


const initialNodesData: Node<DynamicCanvasNodeData>[] = [
  {
    id: 'arch-init-1',
    type: 'dynamicNode',
    data: {
      label: 'CPU Core 0',
      model_type: 'Processor',
      iconName: 'Cpu',
      width: DEFAULT_INITIAL_NODE_DATA_WIDTH,
      height: DEFAULT_INITIAL_NODE_DATA_HEIGHT,
      target_addr_base: '0x10000000',
      target_addr_space: '4KB',
    },
    position: { x: 50, y: 50 },
    width: DEFAULT_INITIAL_NODE_DATA_WIDTH,
    height: DEFAULT_INITIAL_NODE_DATA_HEIGHT,
  },
  {
    id: 'arch-init-2',
    type: 'dynamicNode',
    data: {
      label: 'Main Memory',
      model_type: 'RAM',
      iconName: 'MemoryStick',
      width: DEFAULT_INITIAL_NODE_DATA_WIDTH,
      height: DEFAULT_INITIAL_NODE_DATA_HEIGHT,
      target_addr_base: '0x80000000',
      target_addr_space: '1MB',
    },
    position: { x: 50, y: 180 },
    width: DEFAULT_INITIAL_NODE_DATA_WIDTH,
    height: DEFAULT_INITIAL_NODE_DATA_HEIGHT,
  },
];
const initialEdgesData: Edge[] = [];

const nodeTypes = {
  dynamicNode: DynamicCanvasNode,
};

// Helper functions to convert React Flow types to our CanvasFileFormat types
function convertNodeToFileFormat(node: Node<DynamicCanvasNodeData>): CanvasFileFormatNode {
  return {
    id: node.id,
    position: node.position,
    data: cloneDeep(node.data),
    type: node.type,
    width: node.width ?? undefined,
    height: node.height ?? undefined,
  };
}

function convertEdgeToFileFormat(edge: Edge): CanvasFileFormatEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.type,
    animated: edge.animated,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
    label: typeof edge.label === 'string' ? edge.label : undefined,
  };
}

export interface ArchitectViewHandles {
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
}

interface ArchitectViewProps {
  currentUser: string | null;
  currentProjectRoot: string | null;
  projectId?: string; // New: Backend project ID
  getFileContent: (relativePath: string, projectCtx: string | null) => Promise<string | null>;
  updateFileContent: (relativePath: string, newContent: string, projectCtx: string | null) => Promise<void>;
  isActive: boolean;
  isAdmin?: boolean; // Admin status for component library
}

export const ArchitectView = forwardRef<ArchitectViewHandles, ArchitectViewProps>(
  (
    {
      currentUser,
      currentProjectRoot,
      projectId,
      getFileContent,
      updateFileContent,
      isActive,
      isAdmin = false,
    },
    ref
  ) => {
    const architectViewRef = React.useRef<HTMLDivElement>(null);
    const archDiagramPath = ARCH_DIAGRAM_FILENAME; // Project root
    const DEFAULT_PARSED_NODE_DATA_WIDTH = 160;
    const DEFAULT_PARSED_NODE_DATA_HEIGHT = 80;
    const DEFAULT_ICON_NAME = 'Box';

    const [nodes, setNodes, onNodesChange] = useNodesStateReactFlow(initialNodesData);
    const [edges, setEdges, onEdgesChange] = useEdgesStateReactFlow(initialEdgesData);
    const { toast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    
    // State for invalid edges dialog
    const [showInvalidEdgesDialog, setShowInvalidEdgesDialog] = useState(false);
    const [invalidEdgesData, setInvalidEdgesData] = useState<{
      invalidEdges: any[];
      validEdges: any[];
      allNodes: any[];
    } | null>(null);
    const isContentLoadedAndStableRef = useRef(false);
    const lastSavedJsonRef = useRef<string | null>(null);
    const hasUnsavedChangesRef = React.useRef(false);
    const lastProcessedCanvasContextRef = useRef<string | null>(null);


    const [selectedNodeForInspector, setSelectedNodeForInspector] = React.useState<Node<DynamicCanvasNodeData> | null>(null);
    const [isLeftPanelOpen, setIsLeftPanelOpen] = React.useState(false); // Inspector closed by default (opens when node selected)
    const [isRightPanelOpen, setIsRightPanelOpen] = React.useState(true); // AI chat open by default for new workspaces
    const [showInterfaceLabels, setShowInterfaceLabels] = React.useState(false); // Interface labels hidden by default

    const [leftPanelWidth, setLeftPanelWidth] = React.useState(DEFAULT_SIDE_PANEL_WIDTH);

    // Auto-collapse Inspector when no node is selected
    React.useEffect(() => {
      if (!selectedNodeForInspector) {
        setIsLeftPanelOpen(false);
      } else {
        setIsLeftPanelOpen(true);
      }
    }, [selectedNodeForInspector]);
    const [rightPanelWidth, setRightPanelWidth] = React.useState(DEFAULT_SIDE_PANEL_WIDTH);
    const [isResizingLeftPanel, setIsResizingLeftPanel] = React.useState(false);
    const [isResizingRightPanel, setIsResizingRightPanel] = React.useState(false);

    const [appLibComponents, setAppLibComponents] = React.useState<ArchitecturalComponent[]>([]);
    const [isLoadingAppLibComponents, setIsLoadingAppLibComponents] = React.useState(false);
    const lastProcessedAppLibContextRef = React.useRef<string | null>(null);

    const [userLibComponents, setUserLibComponents] = React.useState<ArchitecturalComponent[]>([]);
    const [isLoadingUserLibComponents, setIsLoadingUserLibComponents] = React.useState(false);
    const lastProcessedUserLibContextRef = useRef<string | null>(null);

    // Backend API components (for component picker when using backend)
    const [backendComponents, setBackendComponents] = React.useState<ArchitecturalComponent[]>([]);
    const [isLoadingBackendComponents, setIsLoadingBackendComponents] = React.useState(false);

    // Undo/Redo History State
    type HistoryEntry = { nodes: Node<DynamicCanvasNodeData>[]; edges: Edge[] };
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [currentHistoryIndex, setCurrentHistoryIndex] = useState<number>(-1);
    const isApplyingUndoRedoRef = useRef(false);

    // Save status state
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const saveStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const [forceReloadTrigger, setForceReloadTrigger] = useState(0);

    // Validation state
    const [validationResults, setValidationResults] = React.useState<any>(null);
    const [isValidating, setIsValidating] = React.useState(false);
    const [nodesWithErrors, setNodesWithErrors] = React.useState<Set<string>>(new Set());

    // Performance optimization: memoize node count for conditional rendering
    const nodeCount = React.useMemo(() => nodes.length, [nodes.length]);
    const shouldUseVirtualization = nodeCount > 50; // Use virtualization for large diagrams


    const fetchAppComponents = useCallback(async () => {
      const appLibContext = currentProjectRoot ? `${currentUser}:${currentProjectRoot}` : (currentUser ? currentUser : null);
      if (isLoadingAppLibComponents && lastProcessedAppLibContextRef.current === appLibContext) return;
      if (!isLoadingAppLibComponents && lastProcessedAppLibContextRef.current === appLibContext && appLibContext !== null) return;
      
      if (!currentUser || !currentProjectRoot) { // App components are project-specific
        setAppLibComponents([]);
        lastProcessedAppLibContextRef.current = appLibContext;
        setIsLoadingAppLibComponents(false);
        return;
      }

      setIsLoadingAppLibComponents(true);
      try {
        if (!projectId) {
          console.warn('[ArchitectView] No projectId available for loading app components');
          return;
        }
        const components = await readAppComponentsLib(projectId);
        setAppLibComponents(components);
      } catch (error) {
        console.error("Failed to fetch project app components for ArchitectView:", error);
        toast({ title: "Error", description: `Could not load app component library from project ${currentProjectRoot}.`, variant: "destructive" });
        setAppLibComponents([]);
      } finally {
        lastProcessedAppLibContextRef.current = appLibContext;
        setIsLoadingAppLibComponents(false);
      }
    }, [currentUser, currentProjectRoot, projectId, toast, isLoadingAppLibComponents]);


    const fetchUserComponents = useCallback(async () => {
      const userLibContext = currentProjectRoot ? `${currentUser}:${currentProjectRoot}` : (currentUser ? currentUser : null);
      if (isLoadingUserLibComponents && lastProcessedUserLibContextRef.current === userLibContext) return;
      if (!isLoadingUserLibComponents && lastProcessedUserLibContextRef.current === userLibContext && userLibContext !== null) return;
      if (!currentUser || !currentProjectRoot) {
        setUserLibComponents([]);
        lastProcessedUserLibContextRef.current = userLibContext;
        setIsLoadingUserLibComponents(false);
        return;
      }
      setIsLoadingUserLibComponents(true);
      try {
        if (!projectId) {
          console.warn('[ArchitectView] No projectId available for loading user components');
          return;
        }
        const components = await readUserComponentsLib(projectId);
        setUserLibComponents(components);
      } catch (error) {
        console.error("Failed to fetch user components for ArchitectView:", error);
        toast({ title: "Error", description: "Could not load user component library.", variant: "destructive" });
        setUserLibComponents([]);
      } finally {
        lastProcessedUserLibContextRef.current = userLibContext;
        setIsLoadingUserLibComponents(false);
      }
    }, [currentUser, currentProjectRoot, projectId, toast, isLoadingUserLibComponents]);

    // Fetch backend components (for component picker)
    const fetchBackendComponents = useCallback(async () => {
      if (!projectId || !isActive) {
        setBackendComponents([]);
        return;
      }

      setIsLoadingBackendComponents(true);
      try {
        const response = await componentAPI.getAll();

        // Filter out pending components
        const approvedComponents = response.components.filter((c: any) =>
          c.status !== 'needs_review' && c.tier !== 'pending'
        );

        console.log(`📚 Loaded ${approvedComponents.length} components from library`);
        setBackendComponents(approvedComponents as any);
      } catch (error) {
        console.error('Failed to load backend components for picker:', error);
        setBackendComponents([]);
      } finally {
        setIsLoadingBackendComponents(false);
      }
    }, [projectId, isActive]);

    useEffect(() => {
      if (isActive) {
        fetchAppComponents();
        fetchUserComponents();
        fetchBackendComponents();
      }
    }, [isActive, currentUser, currentProjectRoot, fetchAppComponents, fetchUserComponents, fetchBackendComponents]);

    const handleComponentExportedToLib = useCallback(() => {
      lastProcessedUserLibContextRef.current = null;
      fetchUserComponents();
      fetchBackendComponents(); // Also refresh backend components
    }, [fetchUserComponents, fetchBackendComponents]);

    const handleRemoveUserComponentFromLib = useCallback(async (libId: string) => {
      if (!currentUser || !currentProjectRoot) {
        toast({ title: "Error", description: "User or project not defined.", variant: "destructive" });
        return;
      }
      try {
        if (!projectId) {
          toast({ title: "Error", description: "No project selected", variant: "destructive" });
          return;
        }
        await removeComponentFromUserLib(projectId, libId);
        toast({ title: "Component Removed", description: "Successfully removed from library." });
        lastProcessedUserLibContextRef.current = null;
        fetchUserComponents();
      } catch (error) {
        console.error("Failed to remove user component from lib:", error);
        toast({ title: "Error Removing Component", description: (error instanceof Error ? error.message : "An unknown error occurred."), variant: "destructive" });
      }
    }, [currentUser, currentProjectRoot, projectId, fetchUserComponents, toast]);

    useImperativeHandle(ref, () => ({
      toggleLeftPanel: () => setIsLeftPanelOpen(prev => !prev),
      toggleRightPanel: () => setIsRightPanelOpen(prev => !prev),
    }));

    React.useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
        if (!architectViewRef.current) return;
        const architectViewRect = architectViewRef.current.getBoundingClientRect();
        const maxPanelWidth = architectViewRect.width * MAX_PANEL_WIDTH_PERCENT;
        const canvasMinWidth = 200;

        if (isResizingLeftPanel) {
          const newWidth = e.clientX - architectViewRect.left;
          const availableWidth = architectViewRect.width - (isRightPanelOpen ? rightPanelWidth : 0);

          let constrainedWidth = Math.max(MIN_PANEL_WIDTH, newWidth);
          constrainedWidth = Math.min(constrainedWidth, maxPanelWidth);
          constrainedWidth = Math.min(constrainedWidth, availableWidth - canvasMinWidth);

          setLeftPanelWidth(constrainedWidth);
        }

        if (isResizingRightPanel) {
          const newWidth = architectViewRect.right - e.clientX;
          const availableWidth = architectViewRect.width - (isLeftPanelOpen ? leftPanelWidth : 0);

          let constrainedWidth = Math.max(MIN_PANEL_WIDTH, newWidth);
          constrainedWidth = Math.min(constrainedWidth, maxPanelWidth);
          constrainedWidth = Math.min(constrainedWidth, availableWidth - canvasMinWidth);

          setRightPanelWidth(constrainedWidth);
        }
      };

      const handleMouseUp = () => {
        setIsResizingLeftPanel(false);
        setIsResizingRightPanel(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      if (isResizingLeftPanel || isResizingRightPanel) {
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
      }

      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }, [isResizingLeftPanel, isResizingRightPanel, isLeftPanelOpen, isRightPanelOpen, leftPanelWidth, rightPanelWidth]);

    const handleMouseDownOnLeftResizer = (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizingLeftPanel(true);
    };

    const handleMouseDownOnRightResizer = (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizingRightPanel(true);
    };
    
    // Effect to reset history when context (user/project) changes
    useEffect(() => {
        setHistory([]);
        setCurrentHistoryIndex(-1);
        // The main history useEffect will pick up the new initial state after loading.
    }, [currentUser, currentProjectRoot]);


    // Effect to manage history snapshots
    useEffect(() => {
        if (isApplyingUndoRedoRef.current || isLoading || !isContentLoadedAndStableRef.current) {
            return;
        }

        const updateHistory = () => {
            const newSnapshot = { nodes: cloneDeep(nodes), edges: cloneDeep(edges) };

            const lastSnapshot = history[currentHistoryIndex];
            if (lastSnapshot && isEqual(lastSnapshot.nodes, newSnapshot.nodes) && isEqual(lastSnapshot.edges, newSnapshot.edges)) {
                return; // No change, don't add to history
            }

            const newHistoryStack = history.slice(0, currentHistoryIndex + 1);
            newHistoryStack.push(newSnapshot);

            if (newHistoryStack.length > MAX_HISTORY_LENGTH) {
                newHistoryStack.shift(); // Remove the oldest entry
            }
            
            setHistory(newHistoryStack);
            setCurrentHistoryIndex(newHistoryStack.length - 1);
            if (currentUser && currentProjectRoot) hasUnsavedChangesRef.current = true;
        };
        
        // Throttle updates to history to avoid too many entries during rapid changes (e.g., dragging)
        const throttledUpdateHistory = throttle(updateHistory, 750, { leading: false, trailing: true });
        throttledUpdateHistory();

        return () => {
            throttledUpdateHistory.cancel(); // Cleanup throttle on unmount or re-run
        };

    }, [nodes, edges, isLoading, isContentLoadedAndStableRef.current, history, currentHistoryIndex, currentUser, currentProjectRoot]);


    const handleUndo = useCallback(() => {
        if (currentHistoryIndex > 0) {
            isApplyingUndoRedoRef.current = true;
            const prevIndex = currentHistoryIndex - 1;
            const prevState = history[prevIndex];
            setNodes(cloneDeep(prevState.nodes));
            setEdges(cloneDeep(prevState.edges));
            setCurrentHistoryIndex(prevIndex);
            if (selectedNodeForInspector && !prevState.nodes.find(n => n.id === selectedNodeForInspector.id)) {
                setSelectedNodeForInspector(null);
            }
            requestAnimationFrame(() => { isApplyingUndoRedoRef.current = false; });
            if (currentUser && currentProjectRoot) hasUnsavedChangesRef.current = true;
        }
    }, [currentHistoryIndex, history, setNodes, setEdges, selectedNodeForInspector, currentUser, currentProjectRoot]);

    const handleRedo = useCallback(() => {
        if (currentHistoryIndex < history.length - 1) {
            isApplyingUndoRedoRef.current = true;
            const nextIndex = currentHistoryIndex + 1;
            const nextState = history[nextIndex];
            setNodes(cloneDeep(nextState.nodes));
            setEdges(cloneDeep(nextState.edges));
            setCurrentHistoryIndex(nextIndex);
            if (selectedNodeForInspector && !nextState.nodes.find(n => n.id === selectedNodeForInspector.id)) {
                setSelectedNodeForInspector(null);
            }
            requestAnimationFrame(() => { isApplyingUndoRedoRef.current = false; });
            if (currentUser && currentProjectRoot) hasUnsavedChangesRef.current = true;
        }
    }, [currentHistoryIndex, history, setNodes, setEdges, selectedNodeForInspector, currentUser, currentProjectRoot]);
    
    const canUndo = currentHistoryIndex > 0;
    const canRedo = currentHistoryIndex < history.length - 1;

    const handleReloadCanvas = useCallback(() => {
      if (!currentUser || !currentProjectRoot) {
        toast({ title: "Action Denied", description: "Please open a project to reload its canvas.", variant: "destructive"});
        return;
      }
      toast({ title: "Reloading Canvas", description: `Reloading ${archDiagramPath}...`});
      setForceReloadTrigger(prev => prev + 1);
    }, [currentUser, currentProjectRoot, archDiagramPath, toast]);

    // Validation function
    const validateDiagram = useCallback(async () => {
      if (!projectId || nodes.length === 0) return;

      setIsValidating(true);
      try {
        // Convert nodes to components format for validation
        const components = nodes.map((node: any) => ({
          id: node.id,
          name: node.data?.label || 'Unnamed',
          type: node.data?.model_type || 'Unknown',
          ...node.data
        }));

        const result = await validationAPI.validateComponents(components);
        setValidationResults(result);

        // Extract nodes with errors
        const errorNodeIds = new Set<string>();
        result.summary.results.forEach((validationResult: any) => {
          if (validationResult.severity === 'error') {
            validationResult.affectedComponents?.forEach((componentId: string) => {
              errorNodeIds.add(componentId);
            });
          }
        });
        setNodesWithErrors(errorNodeIds);

        // Show toast if there are critical issues
        if (result.summary.criticalIssues > 0) {
          toast({
            title: "Validation Issues Found",
            description: `Found ${result.summary.criticalIssues} critical issue(s) and ${result.summary.warnings} warning(s).`,
            variant: "destructive"
          });
        }
      } catch (error) {
        console.error('Validation error:', error);
        // Don't show error toast for validation failures - it's not critical
      } finally {
        setIsValidating(false);
      }
    }, [projectId, nodes, toast]);

    // Auto-validate when nodes change (debounced)
    React.useEffect(() => {
      if (!projectId) return;

      const timeoutId = setTimeout(() => {
        validateDiagram();
      }, 2000); // Debounce 2 seconds

      return () => clearTimeout(timeoutId);
    }, [nodes, projectId, validateDiagram]);


    useEffect(() => {
      if (!isActive) {
        return;
      }
      
      const currentContext = currentProjectRoot ? `${currentUser}:${currentProjectRoot}` : (currentUser || null);

      if (currentContext === null) {
        setIsLoading(true); // Set loading true initially for this path
        setNodes(initialNodesData.map(n => ({...n, data: {...cloneDeep(n.data)}})));
        setEdges(cloneDeep(initialEdgesData));
        lastProcessedCanvasContextRef.current = null;
        isContentLoadedAndStableRef.current = true;
        hasUnsavedChangesRef.current = false;
        setHistory([]); setCurrentHistoryIndex(-1);
        setIsLoading(false); // Set loading false after setup
        return;
      }
      
      // Check if content is stable for the current context
      if (isLoading && lastProcessedCanvasContextRef.current === currentContext && forceReloadTrigger === 0) { // Modified condition
        return; // Load already in progress for current context, and not a forced reload
      }
      if (!isLoading && lastProcessedCanvasContextRef.current === currentContext && isContentLoadedAndStableRef.current && forceReloadTrigger === 0) { // Modified condition
         // Data already loaded and stable for this context, skip reload unless forced
        return;
      }
      
      setIsLoading(true); // Set loading true before any async operation or major state change

      if (lastProcessedCanvasContextRef.current !== null && lastProcessedCanvasContextRef.current !== currentContext) {
        setNodes([]);
        setEdges([]);
        setSelectedNodeForInspector(null);
        hasUnsavedChangesRef.current = false;
        isContentLoadedAndStableRef.current = false;
        // History is reset by the dedicated useEffect for context change
      }

      setLoadError(null);

      if (!currentProjectRoot) { 
        const defaultNodes = initialNodesData.map(n => ({
          ...n,
          data: {
            ...cloneDeep(n.data),
            iconName: n.data.iconName || DEFAULT_ICON_NAME,
            width: n.data.width || DEFAULT_PARSED_NODE_DATA_WIDTH,
            height: n.data.height || DEFAULT_PARSED_NODE_DATA_HEIGHT,
            model_type: n.data.model_type || 'Default Type',
            target_addr_base: n.data.target_addr_base || '',
            target_addr_space: n.data.target_addr_space || '',
          },
          width: n.data.width || DEFAULT_PARSED_NODE_DATA_WIDTH,
          height: n.data.height || DEFAULT_PARSED_NODE_DATA_HEIGHT,
        }));
        setNodes(defaultNodes);
        setEdges(cloneDeep(initialEdgesData));
        const initialCanvasFormat: CanvasFileFormat = { nodes: defaultNodes.map(convertNodeToFileFormat), edges: initialEdgesData.map(convertEdgeToFileFormat) };
        lastSavedJsonRef.current = JSON.stringify(initialCanvasFormat, null, 2);
        lastProcessedCanvasContextRef.current = currentContext;
        isContentLoadedAndStableRef.current = true;
        hasUnsavedChangesRef.current = false;
        setHistory([{ nodes: cloneDeep(defaultNodes), edges: cloneDeep(initialEdgesData) }]);
        setCurrentHistoryIndex(0);
        setIsLoading(false);
      } else { 
        // Try to load diagram with priority: arch_diagram.json (AI generated) > backend API
        const loadDiagramData = async () => {
          if (projectId) {
            // First try: Load AI-generated arch_diagram.json from concept view
            try {
              console.log('[ArchitectView] Trying to load arch_diagram.json from project root...');
              const archDiagramContent = await getFileContent(archDiagramPath, currentProjectRoot);
              if (archDiagramContent && archDiagramContent.trim()) {
                console.log('[ArchitectView] ✅ Loaded arch_diagram.json from concept view');
                return archDiagramContent;
              }
            } catch (err) {
              console.log('[ArchitectView] arch_diagram.json not found, trying backend API...');
            }

            // Second try: Load from backend diagram API
            try {
              const diagramData = await workspaceAPI.loadDiagram(projectId, 'main');
              console.log('[ArchitectView] ✅ Loaded from backend API');
              return JSON.stringify(diagramData, null, 2);
            } catch (err) {
              console.log('[ArchitectView] No existing diagram found, starting with empty canvas');
              return null;
            }
          } else {
            console.log('[ArchitectView] No projectId, starting with empty canvas');
            return null;
          }
        };

        loadDiagramData()
          .then(async (loadedJsonFromFile) => {
            let loadedNodes: Node<DynamicCanvasNodeData>[] = [];
            let loadedEdges: Edge[] = [];
            
            // For new workspaces, start with empty canvas instead of initial nodes
            if (loadedJsonFromFile === null || loadedJsonFromFile.trim() === '') { 
              // Empty canvas for new workspace
              loadedNodes = [];
              loadedEdges = [];
              const emptyCanvasFormat: CanvasFileFormat = { nodes: [], edges: [] };
              lastSavedJsonRef.current = JSON.stringify(emptyCanvasFormat, null, 2);
              console.log('Starting with empty canvas for new workspace');
            } else {
              try {
                const parsedData = JSON.parse(loadedJsonFromFile) as CanvasFileFormat;
                
                // Enrich nodes with component data from library
                const enrichedNodesPromises = parsedData.nodes.map(async (nodeFromFile, index) => {
                  const baseNode = {
                    id: nodeFromFile.id || `node-${archDiagramPath}-${index}-${Date.now()}`,
                    position: nodeFromFile.position || { x: Math.random() * 400, y: Math.random() * 400 },
                    data: {
                      ...(nodeFromFile.data || { label: `Node ${index}`, model_type: 'Default Type', iconName: DEFAULT_ICON_NAME }),
                      label: nodeFromFile.data?.label || `Node ${index}`,
                      model_type: nodeFromFile.data?.model_type || 'Default Type',
                      iconName: nodeFromFile.data?.iconName || DEFAULT_ICON_NAME,
                      width: nodeFromFile.data?.width || DEFAULT_PARSED_NODE_DATA_WIDTH,
                      height: nodeFromFile.data?.height || DEFAULT_PARSED_NODE_DATA_HEIGHT,
                      target_addr_base: nodeFromFile.data?.target_addr_base || '',
                      target_addr_space: nodeFromFile.data?.target_addr_space || '',
                    },
                    type: nodeFromFile.type || 'dynamicNode',
                    width: nodeFromFile.width || nodeFromFile.data?.width || DEFAULT_PARSED_NODE_DATA_WIDTH,
                    height: nodeFromFile.height || nodeFromFile.data?.height || DEFAULT_PARSED_NODE_DATA_HEIGHT,
                    selected: false, dragging: false,
                  };

                  // Preserve componentId for component library reference
                  if (nodeFromFile.data?.componentId) {
                    baseNode.data.componentId = nodeFromFile.data.componentId;
                    // Handles are now auto-generated from interfaces in DynamicCanvasNode
                  }

                  return baseNode;
                });

                loadedNodes = await Promise.all(enrichedNodesPromises);
                
                // Map edges and deduplicate
                const mappedEdges = parsedData.edges.map((edge, index) => {
                  const edgeData: any = {
                    id: edge.id || `edge-${archDiagramPath}-${index}-${Date.now()}`, 
                    source: edge.source, 
                    target: edge.target, 
                    type: edge.type || 'smoothstep', 
                    animated: edge.animated === true,
                    markerEnd: { type: 'arrowclosed' }
                  };
                  // Only add handles if they're defined
                  if (edge.sourceHandle) edgeData.sourceHandle = edge.sourceHandle;
                  if (edge.targetHandle) edgeData.targetHandle = edge.targetHandle;
                  if (edge.label) edgeData.label = edge.label;
                  return edgeData;
                });

                // Validate edges and detect invalid connections
                const validEdges: any[] = [];
                const invalidEdges: any[] = [];
                const seenConnections = new Set<string>();

                for (const edge of mappedEdges) {
                  // Check for duplicates
                  const key1 = `${edge.source}:${edge.sourceHandle || 'none'}→${edge.target}:${edge.targetHandle || 'none'}`;
                  const key2 = `${edge.target}:${edge.targetHandle || 'none'}→${edge.source}:${edge.sourceHandle || 'none'}`;
                  
                  if (seenConnections.has(key1) || seenConnections.has(key2)) {
                    console.warn('[ArchitectView] Removing duplicate edge on load:', edge.id, key1);
                    continue; // Skip duplicate
                  }
                  
                  // Check if edge has valid handle types
                  const sourceNode = loadedNodes.find(n => n.id === edge.source);
                  const targetNode = loadedNodes.find(n => n.id === edge.target);
                  
                  if (sourceNode && targetNode && edge.sourceHandle && edge.targetHandle) {
                    const sourceInterface = sourceNode.data?.interfaces?.find((i: any) => i.id === edge.sourceHandle);
                    const targetInterface = targetNode.data?.interfaces?.find((i: any) => i.id === edge.targetHandle);
                    
                    if (sourceInterface && targetInterface) {
                      // Determine handle types based on direction
                      const getHandleType = (direction: string) => {
                        if (direction === 'input' || direction === 'slave') return 'target';
                        if (direction === 'output' || direction === 'master') return 'source';
                        return 'source'; // default
                      };
                      
                      const sourceHandleType = getHandleType(sourceInterface.direction);
                      const targetHandleType = getHandleType(targetInterface.direction);
                      
                      // Valid connection: source → target
                      // Invalid connection: target → source, target → target, source → source
                      if (sourceHandleType === 'target' && targetHandleType === 'source') {
                        // Invalid: reversed connection (target → source)
                        invalidEdges.push({
                          ...edge,
                          sourceLabel: sourceNode.data.label,
                          targetLabel: targetNode.data.label,
                          sourceDirection: sourceInterface.direction,
                          targetDirection: targetInterface.direction,
                          reason: `Reversed connection: ${sourceInterface.direction} → ${targetInterface.direction} (should be swapped)`
                        });
                        continue;
                      } else if (sourceHandleType === targetHandleType) {
                        // Invalid: same handle types
                        invalidEdges.push({
                          ...edge,
                          sourceLabel: sourceNode.data.label,
                          targetLabel: targetNode.data.label,
                          sourceDirection: sourceInterface.direction,
                          targetDirection: targetInterface.direction,
                          reason: `Incompatible: ${sourceInterface.direction} → ${targetInterface.direction} (same handle type)`
                        });
                        continue;
                      }
                    }
                  }
                  
                  seenConnections.add(key1);
                  validEdges.push(edge);
                }

                // If there are invalid edges, show dialog
                if (invalidEdges.length > 0) {
                  console.warn('[ArchitectView] Found invalid edges:', invalidEdges);
                  setInvalidEdgesData({
                    invalidEdges,
                    validEdges,
                    allNodes: loadedNodes
                  });
                  setShowInvalidEdgesDialog(true);
                  // Don't set edges yet - wait for user decision
                  return;
                }

                loadedEdges = validEdges;

                if (mappedEdges.length !== loadedEdges.length) {
                  const removedCount = mappedEdges.length - loadedEdges.length;
                  console.log(`[ArchitectView] Removed ${removedCount} duplicate/invalid edge(s) during load`);
                  
                  // Mark as having unsaved changes so the cleaned version gets saved
                  hasUnsavedChangesRef.current = true;
                  
                  toast({
                    title: "Edges Cleaned",
                    description: `Removed ${removedCount} duplicate/invalid edge(s). Save to persist the cleanup.`,
                  });
                }

                lastSavedJsonRef.current = loadedJsonFromFile;
              } catch (e) {
                // For parse errors in new workspaces, start with empty canvas
                console.log('Parse error, starting with empty canvas:', e);
                loadedNodes = [];
                loadedEdges = [];
                const emptyCanvasFormat: CanvasFileFormat = { nodes: [], edges: [] };
                lastSavedJsonRef.current = JSON.stringify(emptyCanvasFormat, null, 2);
                // Don't set error for new workspaces
                setLoadError(null);
              }
            }
            setNodes(loadedNodes);
            setEdges(loadedEdges);
            setHistory([{ nodes: cloneDeep(loadedNodes), edges: cloneDeep(loadedEdges) }]);
            setCurrentHistoryIndex(0);
          })
          .catch(err => {
            // For new workspaces, don't show error - just start with empty canvas
            console.log('Could not load canvas file, starting with empty canvas:', err);
            const emptyNodes: Node<DynamicCanvasNodeData>[] = [];
            const emptyEdges: Edge[] = [];
            setNodes(emptyNodes);
            setEdges(emptyEdges);
            setHistory([{ nodes: [], edges: [] }]);
            setCurrentHistoryIndex(0);
            setLoadError(null); // Don't show error for new workspaces
          })
          .finally(() => {
            lastProcessedCanvasContextRef.current = currentContext;
            isContentLoadedAndStableRef.current = true;
            hasUnsavedChangesRef.current = false;
            setIsLoading(false);
            if (forceReloadTrigger > 0) setForceReloadTrigger(0); // Reset trigger after reload
          });
      }
    }, [
        isActive, currentUser, currentProjectRoot, archDiagramPath, getFileContent, toast,
        setNodes, setEdges, forceReloadTrigger // Added forceReloadTrigger
    ]);


    useEffect(() => {
      if (isLoading || !currentProjectRoot || !currentUser || !isActive || !isContentLoadedAndStableRef.current) return;

      const intervalId = setInterval(async () => {
        if (hasUnsavedChangesRef.current && currentProjectRoot && currentUser && !isLoading && isActive) {
          const nodesToSave: CanvasFileFormatNode[] = nodes.map(convertNodeToFileFormat);
          const edgesToSave: CanvasFileFormatEdge[] = edges.map(convertEdgeToFileFormat);
          const canvasDataToSave: CanvasFileFormat = { nodes: nodesToSave, edges: edgesToSave };
          const jsonToSave = JSON.stringify(canvasDataToSave, null, 2);

          if (lastSavedJsonRef.current === jsonToSave) { hasUnsavedChangesRef.current = false; return; }

          try {
            // Try to save to backend API first if projectId is available
            if (projectId) {
              try {
                await workspaceAPI.saveDiagram(projectId, 'main', canvasDataToSave);
              } catch (apiErr) {
                console.log('Failed to save to backend API, falling back to file system:', apiErr);
                // Fall back to file system
                await updateFileContent(archDiagramPath, jsonToSave, currentProjectRoot);
              }
            } else {
              await updateFileContent(archDiagramPath, jsonToSave, currentProjectRoot);
            }
            lastSavedJsonRef.current = jsonToSave; hasUnsavedChangesRef.current = false;
          } catch (e) { toast({ title: "Auto-Save Error", description: `Could not save ${archDiagramPath}.`, variant: "destructive" }); }
        }
      }, DEFAULT_AUTO_SAVE_INTERVAL_MS);
      return () => clearInterval(intervalId);
    }, [currentUser, currentProjectRoot, archDiagramPath, updateFileContent, toast, isLoading, nodes, edges, isActive]);

    const manualSave = async () => {
      if (!currentProjectRoot || !currentUser || isLoading) { 
        toast({ title: "Save Error", description: "Cannot save without an open workspace or while loading.", variant: "destructive" }); 
        return; 
      }
      
      const nodesToSave: CanvasFileFormatNode[] = nodes.map(convertNodeToFileFormat);
      const edgesToSave: CanvasFileFormatEdge[] = edges.map(convertEdgeToFileFormat);
      const canvasDataToSave: CanvasFileFormat = { nodes: nodesToSave, edges: edgesToSave };
      const jsonToSave = JSON.stringify(canvasDataToSave, null, 2);
      
      if (lastSavedJsonRef.current === jsonToSave && !hasUnsavedChangesRef.current) { 
        toast({ title: "Architect Canvas", description: "No changes to save." }); 
        return; 
      }
      
      // Clear any existing timeout
      if (saveStatusTimeoutRef.current) {
        clearTimeout(saveStatusTimeoutRef.current);
      }
      
      setSaveStatus('saving');
      
      try {
        // Try to save to backend API first if projectId is available
        if (projectId) {
          try {
            console.log('Saving diagram to S3 via API...', { projectId, diagramId: 'main' });
            await workspaceAPI.saveDiagram(projectId, 'main', canvasDataToSave);
            console.log('✅ Successfully saved diagram to S3');
          } catch (apiErr) {
            console.error('❌ Failed to save to backend API, falling back to file system:', apiErr);
            // Fall back to file system
            await updateFileContent(archDiagramPath, jsonToSave, currentProjectRoot);
            console.log('✅ Saved to file system as fallback');
          }
        } else {
          console.log('No projectId, saving to file system only');
          await updateFileContent(archDiagramPath, jsonToSave, currentProjectRoot);
        }
        
        lastSavedJsonRef.current = jsonToSave; 
        hasUnsavedChangesRef.current = false;
        setSaveStatus('saved');
        toast({ title: "Architect Canvas", description: "Saved successfully." });
        
        // Reset to idle after 2 seconds
        saveStatusTimeoutRef.current = setTimeout(() => {
          setSaveStatus('idle');
        }, 2000);
      } catch (e) { 
        console.error('❌ Save error:', e);
        setSaveStatus('error');
        toast({ title: "Save Error", description: `Could not save ${archDiagramPath}.`, variant: "destructive" }); 
        
        // Reset to idle after 3 seconds
        saveStatusTimeoutRef.current = setTimeout(() => {
          setSaveStatus('idle');
        }, 3000);
      }
    };

    const handleInternalNodeChanges = useCallback((changes: NodeChange[]) => {
      onNodesChange(changes);
      // History update is now handled by the useEffect watching nodes/edges
      setNodes((nds) => nds.map((node) => {
        const change = changes.find(c => 'id' in c && c.id === node.id);
        if (change) {
          let updatedNode = { ...node };
          if (change.type === 'dimensions' && 'dimensions' in change && change.dimensions) {
            updatedNode = { ...updatedNode, data: { ...updatedNode.data, width: change.dimensions.width, height: change.dimensions.height }, width: change.dimensions.width, height: change.dimensions.height };
          }
          if (change.type === 'position' && 'dragging' in change && typeof change.dragging === 'boolean' && !change.dragging) {
            if ('position' in change && change.position) updatedNode.position = change.position;
            if ('positionAbsolute' in change && change.positionAbsolute) updatedNode.positionAbsolute = change.positionAbsolute;
          }
          return updatedNode;
        }
        return node;
      }));
    }, [onNodesChange, setNodes]);

    const handleInternalEdgeChanges = useCallback((changes: EdgeChange[]) => {
      onEdgesChange(changes);
      // History update is now handled by the useEffect watching nodes/edges
    }, [onEdgesChange]);

    // Handle invalid edges dialog actions
    const handleFixInvalidEdgesAutomatically = useCallback(() => {
      if (!invalidEdgesData) return;
      
      const { invalidEdges, validEdges, allNodes } = invalidEdgesData;
      
      console.log('[ArchitectView] Fixing invalid edges:', invalidEdges);
      
      const fixedEdges = invalidEdges.map(edge => {
        const newEdge = {
          ...edge,
          // Swap source and target
          source: edge.target,
          target: edge.source,
          sourceHandle: edge.targetHandle,
          targetHandle: edge.sourceHandle,
        };
        // Generate new ID
        newEdge.id = `reactflow__edge-${newEdge.source}${newEdge.sourceHandle}-${newEdge.target}${newEdge.targetHandle}`;
        return newEdge;
      });
      
      const allEdges = [...validEdges, ...fixedEdges];
      
      console.log('[ArchitectView] Setting nodes:', allNodes.length, 'edges:', allEdges.length);
      
      setNodes(allNodes);
      setEdges(allEdges);
      setHistory([{ nodes: cloneDeep(allNodes), edges: cloneDeep(allEdges) }]);
      setCurrentHistoryIndex(0);
      hasUnsavedChangesRef.current = true;
      
      toast({
        title: "Connections Fixed",
        description: `Fixed ${invalidEdges.length} invalid connection(s). Please review and save.`,
      });
      
      setShowInvalidEdgesDialog(false);
      setInvalidEdgesData(null);
    }, [invalidEdgesData, setEdges, setNodes, toast]);
    
    const handleKeepValidEdgesOnly = useCallback(() => {
      if (!invalidEdgesData) return;
      
      const { validEdges, allNodes, invalidEdges } = invalidEdgesData;
      
      console.log('[ArchitectView] Keeping valid edges only. Nodes:', allNodes.length, 'Valid edges:', validEdges.length);
      
      setNodes(allNodes);
      setEdges(validEdges);
      setHistory([{ nodes: cloneDeep(allNodes), edges: cloneDeep(validEdges) }]);
      setCurrentHistoryIndex(0);
      hasUnsavedChangesRef.current = true;
      
      toast({
        title: "Invalid Connections Removed",
        description: `Removed ${invalidEdges.length} invalid connection(s). Please review and save.`,
      });
      
      setShowInvalidEdgesDialog(false);
      setInvalidEdgesData(null);
    }, [invalidEdgesData, setEdges, setNodes, toast]);
    
    const handleCancelInvalidEdgesDialog = useCallback(() => {
      console.log('[ArchitectView] User cancelled invalid edges dialog');
      setShowInvalidEdgesDialog(false);
      setInvalidEdgesData(null);
      // Keep current canvas state - don't change anything
    }, []);

    const handleInternalConnect = useCallback((params: Connection) => {
      // Ensure arrow always points to slave/input by checking handle directions
      let finalParams = { ...params };

      if (params.source && params.target && params.sourceHandle && params.targetHandle) {
        // Find source and target nodes
        const sourceNode = nodes.find(n => n.id === params.source);
        const targetNode = nodes.find(n => n.id === params.target);

        // Find the interfaces for source and target handles
        const sourceInterface = sourceNode?.data?.interfaces?.find(
          (i: any) => i.id === params.sourceHandle
        );
        const targetInterface = targetNode?.data?.interfaces?.find(
          (i: any) => i.id === params.targetHandle
        );

        // If source handle is slave/input, swap source and target
        // This ensures arrow always points from master/output to slave/input
        const sourceIsSlave = sourceInterface?.direction === 'slave' ||
                             sourceInterface?.direction === 'input';
        const targetIsMaster = targetInterface?.direction === 'master' ||
                              targetInterface?.direction === 'output';

        if (sourceIsSlave || targetIsMaster) {
          // Swap source and target to ensure correct arrow direction
          finalParams = {
            source: params.target,
            target: params.source,
            sourceHandle: params.targetHandle,
            targetHandle: params.sourceHandle,
          };
          console.log('[ArchitectView] Swapped connection direction: arrow now points to slave/input');
        }
      }

      setEdges((eds) => {
        // Check if this connection already exists (prevent duplicates)
        const isDuplicate = eds.some(edge => 
          (edge.source === finalParams.source && 
           edge.target === finalParams.target &&
           edge.sourceHandle === finalParams.sourceHandle &&
           edge.targetHandle === finalParams.targetHandle) ||
          // Also check for reverse connection (bidirectional duplicate)
          (edge.source === finalParams.target && 
           edge.target === finalParams.source &&
           edge.sourceHandle === finalParams.targetHandle &&
           edge.targetHandle === finalParams.sourceHandle)
        );

        if (isDuplicate) {
          console.warn('[ArchitectView] Duplicate edge detected, skipping:', finalParams);
          return eds; // Don't add duplicate
        }

        const newEdge = {
          ...finalParams,
          type: 'smoothstep' as const,
        };
        return addEdgeReactFlow(newEdge, eds);
      });
      // History update is now handled by the useEffect watching nodes/edges
    }, [setEdges, nodes]);

    const handleNodeSingleClickCore = useCallback((event: React.MouseEvent, node: Node<DynamicCanvasNodeData>) => {
      setSelectedNodeForInspector(node);
    }, []);

    const handleNodeDoubleClickCore = useCallback((event: React.MouseEvent, node: Node<DynamicCanvasNodeData>) => {
      setSelectedNodeForInspector(node); setIsRightPanelOpen(true);
    }, []);

    const handlePaneClick = useCallback(() => {
      setSelectedNodeForInspector(null);
    }, []);

    const handleApplyAiSuggestion = useCallback((newCode: string) => {
      toast({
        title: "Action Not Available",
        description: "Applying code suggestions is only available in the Code View.",
        variant: "default",
      });
    }, [toast]);

    const handleNodeUpdateFromInspector = useCallback((originalNodeId: string, newIdFromInspector: string, updatedDataProps: Partial<DynamicCanvasNodeData>) => {
      let nodeAfterUpdate: Node<DynamicCanvasNodeData> | undefined;
      const idChanged = originalNodeId !== newIdFromInspector && newIdFromInspector.trim() !== "";
      setNodes((prevNodes) => prevNodes.map((node) => {
        if (node.id === originalNodeId) {
          const newData = { ...node.data, ...updatedDataProps };
          nodeAfterUpdate = { ...node, id: idChanged ? newIdFromInspector : originalNodeId, data: newData, width: newData.width !== undefined ? newData.width : node.width, height: newData.height !== undefined ? newData.height : node.height };
          return nodeAfterUpdate;
        }
        return node;
      }));
      if (idChanged) setEdges((prevEdges) => prevEdges.map((edge) => ({ ...edge, ...(edge.source === originalNodeId && { source: newIdFromInspector }), ...(edge.target === originalNodeId && { target: newIdFromInspector }) })));
      if (nodeAfterUpdate) setSelectedNodeForInspector(nodeAfterUpdate);
      // History update is now handled by the useEffect watching nodes/edges
    }, [setNodes, setEdges]);

    const handleAddComponentToCanvas = useCallback((component: ArchitecturalComponent, position: { x: number; y: number }) => {
        if (!isContentLoadedAndStableRef.current) {
            console.warn("Attempted to add component while canvas is not stable.");
            return;
        }
        const newNodeId = uuidv4();

        // Use helper function to extract node data
        const { getNodeDataFromComponent } = require('@/lib/component-helpers');
        const nodeData = getNodeDataFromComponent(component);

        // Get dimensions from nodeData (already handles both old and new format)
        const nodeWidth = nodeData.width || DEFAULT_INITIAL_NODE_DATA_WIDTH;
        const nodeHeight = nodeData.height || DEFAULT_INITIAL_NODE_DATA_HEIGHT;

        const centeredPosition = {
            x: position.x - nodeWidth / 2,
            y: position.y - nodeHeight / 2,
        };

        const newNode: Node<DynamicCanvasNodeData> = {
            id: newNodeId,
            type: 'dynamicNode',
            position: centeredPosition,
            data: nodeData,
            width: nodeWidth,
            height: nodeHeight,
        };
        setNodes((nds) => nds.concat(newNode));
    }, [setNodes]);


    if (isLoading && isActive) {
       return <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin mr-2" /> Loading Architect Canvas...</div>;
    }
    if (loadError && currentProjectRoot && currentUser && isActive) {
      return <div className="w-full h-full flex flex-col items-center justify-center text-destructive p-4"><AlertTriangle className="h-12 w-12 mb-3" /><p className="font-semibold">Error loading Architect Canvas</p><p className="text-sm">{loadError}</p>{currentProjectRoot && <p className="text-xs mt-1">File: {currentProjectRoot}/{archDiagramPath}</p>}</div>;
    }
     if (!currentUser && isActive) {
      return <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin mr-2" /> Initializing user context...</div>;
    }


    return (
      <div ref={architectViewRef} className="flex-1 h-full relative">
        <div className="flex flex-1 overflow-hidden h-full bg-background text-foreground">
          {/* Left Panel - Inspector */}
          {isLeftPanelOpen && (
            <>
              <div
                style={{ width: `${leftPanelWidth}px` }}
                className={cn(
                  "flex-shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col min-h-0",
                  "transition-all duration-300 ease-in-out"
                )}
                data-testid="architect-left-panel"
              >
                <ArchitectRightPanel
                  selectedNode={selectedNodeForInspector}
                  onNodeUpdate={handleNodeUpdateFromInspector}
                  currentUser={currentUser}
                  currentProjectRoot={currentProjectRoot}
                  projectId={projectId}
                  onComponentExported={handleComponentExportedToLib}
                  onApplyCodeSuggestion={handleApplyAiSuggestion}
                  isPanelOpen={isLeftPanelOpen}
                  onSaveCanvas={manualSave}
                  isAdmin={isAdmin}
                />
              </div>
              <div
                className="w-1.5 cursor-ew-resize bg-transparent hover:bg-primary/20 transition-colors duration-150 flex-shrink-0"
                onMouseDown={handleMouseDownOnLeftResizer}
                title="Resize Inspector Panel"
              />
            </>
          )}

          {/* Center - Canvas */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0 relative min-w-0">
            <ReactFlowProvider>
              <ArchitectCanvasCore
                nodes={nodes}
                edges={edges}
                onNodesChange={handleInternalNodeChanges}
                onEdgesChange={handleInternalEdgeChanges}
                onConnect={handleInternalConnect}
                onNodeSingleClickCore={handleNodeSingleClickCore}
                onNodeDoubleClickCore={handleNodeDoubleClickCore}
                onPaneClick={handlePaneClick}
                onAddComponent={handleAddComponentToCanvas}
                currentUser={currentUser}
                currentProjectRoot={currentProjectRoot}
                isLeftPanelOpen={isLeftPanelOpen}
                isRightPanelOpen={isRightPanelOpen}
                manualSaveTrigger={manualSave}
                handleReloadCanvas={handleReloadCanvas}
                isActive={isActive}
                handleUndo={handleUndo}
                handleRedo={handleRedo}
                canUndo={canUndo}
                canRedo={canRedo}
                isValidating={isValidating}
                validationResults={validationResults}
                nodesWithErrors={nodesWithErrors}
                availableComponents={projectId ? backendComponents : [...appLibComponents, ...userLibComponents]}
                projectId={projectId}
                isAdmin={isAdmin}
                onAuditComplete={fetchBackendComponents}
                showInterfaceLabels={showInterfaceLabels}
                onToggleInterfaceLabels={() => setShowInterfaceLabels(!showInterfaceLabels)}
              />
            </ReactFlowProvider>
          </div>
          {/* Right Panel - AI Assistant */}
          {isRightPanelOpen && (
            <>
              <div
                className="w-1.5 cursor-ew-resize bg-transparent hover:bg-primary/20 transition-colors duration-150 flex-shrink-0"
                onMouseDown={handleMouseDownOnRightResizer}
                title="Resize AI Assistant Panel"
              />
              <div
                style={{ width: `${rightPanelWidth}px` }}
                className={cn("flex-shrink-0 bg-sidebar text-sidebar-foreground border-l border-sidebar-border flex flex-col min-h-0")}
                data-testid="architect-right-panel"
              >
                <UnifiedChatAssistant
                  layout="sidebar"
                  mode="architect"
                  userId={currentUser || undefined}
                  isVisible={isRightPanelOpen}
                  projectId={projectId}
                  selectedNode={selectedNodeForInspector}
                  showHeader={true}
                  showExamples={false}
                  enableHistory={true}
                  enableNewChat={true}
                />
              </div>
            </>
          )}
        </div>

        {/* Status Bar */}
        {saveStatus !== 'idle' && (
          <div className="absolute bottom-0 left-0 right-0 h-6 bg-muted/80 backdrop-blur-sm border-t border-border flex items-center px-3 text-xs z-50">
            {saveStatus === 'saving' && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Saving canvas...</span>
              </div>
            )}
            {saveStatus === 'saved' && (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-500">
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Canvas saved successfully</span>
              </div>
            )}
            {saveStatus === 'error' && (
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-3 w-3" />
                <span>Failed to save canvas</span>
              </div>
            )}
          </div>
        )}

        {/* Invalid Edges Dialog */}
        <InvalidEdgesDialog
          open={showInvalidEdgesDialog}
          invalidEdges={invalidEdgesData?.invalidEdges.map(edge => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
            sourceLabel: edge.sourceLabel,
            targetLabel: edge.targetLabel,
            reason: edge.reason
          })) || []}
          onFixAutomatically={handleFixInvalidEdgesAutomatically}
          onKeepAsIs={handleKeepValidEdgesOnly}
          onCancel={handleCancelInvalidEdgesDialog}
        />
      </div>
    );
  }
);
ArchitectView.displayName = "ArchitectView";

