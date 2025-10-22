
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  useNodesState as useNodesStateReactFlow, 
  useEdgesState as useEdgesStateReactFlow, 
  addEdge as addEdgeReactFlow, 
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  Position, 
  type FitViewOptions,
  Panel,
  ConnectionMode,
} from 'reactflow';
import { v4 as uuidv4 } from 'uuid';
import type { DynamicCanvasNodeData, UserComponentDefinition } from '@/types/ide'; 
import { DynamicCanvasNode } from './custom-nodes/DynamicCanvasNode';
import { TextBoxNode } from './custom-nodes/TextBoxNode'; 
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Undo2, Redo2, ZoomIn, ZoomOut, Maximize, Lock, Unlock, Save, RefreshCw, Tag, Upload, Hand, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ComponentPickerPopover } from './ComponentPickerPopover';
import { PendingAuditPopover } from './PendingAuditPopover';
import { ExportTemplateDialog } from './ExportTemplateDialog';
import type { ArchitecturalComponent } from '@/types/backend';
import { useToast } from '@/hooks/use-toast';


const fitViewOptions: FitViewOptions = {
  padding: 0.2,
  includeHiddenNodes: true,
};

const DRAG_MIME_TYPE = "application/x-socpilot-component";


interface ArchitectCanvasCoreProps {
  nodes: Node<DynamicCanvasNodeData>[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (params: Connection) => void;
  onNodeSingleClickCore: (event: React.MouseEvent, node: Node<DynamicCanvasNodeData>) => void;
  onNodeDoubleClickCore: (event: React.MouseEvent, node: Node<DynamicCanvasNodeData>) => void;
  onPaneClick?: () => void; // Callback when canvas background is clicked
  currentUser: string | null;
  currentProjectRoot: string | null;
  isLeftPanelOpen: boolean;
  isRightPanelOpen: boolean;
  manualSaveTrigger: () => Promise<void>;
  handleReloadCanvas: () => void;
  isActive: boolean;
  handleUndo: () => void;
  handleRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onAddComponent: (componentDefinition: UserComponentDefinition, position: { x: number; y: number }) => void;
  isValidating?: boolean;
  validationResults?: any;
  nodesWithErrors?: Set<string>;
  availableComponents?: ArchitecturalComponent[]; // Component library for picker
  projectId?: string; // For pending audit
  isAdmin?: boolean; // Admin status
  onAuditComplete?: () => void; // Callback when audit action completes
  showInterfaceLabels?: boolean; // Show interface labels on handles
  onToggleInterfaceLabels?: () => void; // Toggle interface labels
}

export function ArchitectCanvasCore({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeSingleClickCore,
  onNodeDoubleClickCore,
  onPaneClick,
  currentUser,
  currentProjectRoot,
  isLeftPanelOpen,
  isRightPanelOpen,
  isActive,
  manualSaveTrigger,
  handleReloadCanvas,
  handleUndo,
  handleRedo,
  canUndo,
  canRedo,
  onAddComponent,
  availableComponents = [],
  projectId,
  isAdmin = false,
  onAuditComplete,
  showInterfaceLabels = false,
  onToggleInterfaceLabels,
}: ArchitectCanvasCoreProps) {
  const reactFlowInstance = useReactFlow<Node<DynamicCanvasNodeData>, Edge>();
  const justDraggedRef = useRef(false);
  const [isInteractive, setIsInteractive] = useState(true);
  const [animateEdges, setAnimateEdges] = useState(false);
  const [isPanMode, setIsPanMode] = useState(true); // Pan mode: true = move canvas, false = selection mode (default: enabled)
  const [isPanning, setIsPanning] = useState(false); // Track if currently panning
  const { toast } = useToast();
  
  // Copy/paste state
  const [copiedNodes, setCopiedNodes] = useState<Node<DynamicCanvasNodeData>[]>([]);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: 'pane' | 'node' | 'edge';
    nodeId?: string;
    edgeId?: string;
  } | null>(null);

  const toggleInteractivity = () => {
    setIsInteractive(prev => !prev);
  };

  const toggleEdgeAnimation = () => {
    setAnimateEdges(prev => !prev);
  };

  const togglePanMode = () => {
    setIsPanMode(prev => !prev);
  };

  // Handle panning state for cursor change
  const handleMoveStart = useCallback(() => {
    if (isPanMode) {
      setIsPanning(true);
    }
  }, [isPanMode]);

  const handleMoveEnd = useCallback(() => {
    setIsPanning(false);
  }, []);

  const isProjectOpen = !!(currentUser && currentProjectRoot);

  // Context menu handlers
  const handlePaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    if (!isProjectOpen || !isInteractive) return;
    
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      type: 'pane'
    });
  }, [isProjectOpen, isInteractive]);

  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    if (!isProjectOpen || !isInteractive) return;
    
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      type: 'node',
      nodeId: node.id
    });
  }, [isProjectOpen, isInteractive]);

  const handleEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    if (!isProjectOpen || !isInteractive) return;
    
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      type: 'edge',
      edgeId: edge.id
    });
  }, [isProjectOpen, isInteractive]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Context menu actions
  const handleAddTextBox = useCallback(() => {
    if (!reactFlowInstance || !contextMenu) return;
    
    // Convert screen coordinates to flow coordinates
    const position = reactFlowInstance.screenToFlowPosition({
      x: contextMenu.x,
      y: contextMenu.y
    });

    // Create a text box node (sticky note style)
    const textBoxNode: Node<any> = {
      id: `textbox-${Date.now()}`,
      type: 'textBox',
      position,
      data: {
        text: 'Double-click to edit'
      },
      style: {
        width: 200,
        height: 150
      },
      // Enable resizing for text box nodes
      resizing: true,
      // Prevent selection from triggering inspector
      selectable: true,
      draggable: true
    };

    onNodesChange([{ type: 'add', item: textBoxNode }]);
    closeContextMenu();
  }, [reactFlowInstance, contextMenu, onNodesChange, closeContextMenu]);

  const handleRemoveNode = useCallback(() => {
    if (!contextMenu?.nodeId) return;
    
    onNodesChange([{ type: 'remove', id: contextMenu.nodeId }]);
    closeContextMenu();
  }, [contextMenu, onNodesChange, closeContextMenu]);

  const handleRemoveEdge = useCallback(() => {
    if (!contextMenu?.edgeId) return;
    
    onEdgesChange([{ type: 'remove', id: contextMenu.edgeId }]);
    closeContextMenu();
  }, [contextMenu, onEdgesChange, closeContextMenu]);

  // Copy/paste and save keyboard handlers
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if we're in an input/textarea
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? event.metaKey : event.ctrlKey;

      // Save: Ctrl/Cmd + S
      if (modifier && event.key === 's') {
        if (isProjectOpen) {
          event.preventDefault();
          manualSaveTrigger();
        }
      }

      // Copy: Ctrl/Cmd + C
      if (modifier && event.key === 'c') {
        const selectedNodes = nodes.filter(node => node.selected);
        if (selectedNodes.length > 0) {
          setCopiedNodes(selectedNodes);
          event.preventDefault();
        }
      }

      // Paste: Ctrl/Cmd + V
      if (modifier && event.key === 'v') {
        if (copiedNodes.length > 0 && reactFlowInstance) {
          event.preventDefault();
          
          // Calculate offset for pasted nodes
          const offset = 50;
          const newNodes = copiedNodes.map(node => {
            // Generate a completely new unique ID
            const newId = node.type === 'textBox' 
              ? `textbox-${Date.now()}-${uuidv4().substring(0, 8)}`
              : `node-${uuidv4()}`;
            
            return {
              ...node,
              id: newId,
              position: {
                x: node.position.x + offset,
                y: node.position.y + offset
              },
              selected: false,
              data: { ...node.data }
            };
          });

          // Add new nodes
          onNodesChange(newNodes.map(node => ({ type: 'add', item: node })));
          
          // Update copied nodes for next paste
          setCopiedNodes(newNodes);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [nodes, copiedNodes, reactFlowInstance, onNodesChange, isProjectOpen, manualSaveTrigger]);

  // Close context menu on click outside
  useEffect(() => {
    if (contextMenu) {
      const handleClick = () => closeContextMenu();
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu, closeContextMenu]);

  // Wrap click handlers to prevent inspector for text boxes
  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node<any>) => {
    // Don't open inspector for text box nodes
    if (node.type === 'textBox') {
      event.stopPropagation();
      return;
    }
    onNodeSingleClickCore(event, node);
  }, [onNodeSingleClickCore]);

  const handleNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node<DynamicCanvasNodeData>) => {
    // Don't open inspector for text box nodes
    if (node.type === 'textBox') {
      return;
    }
    onNodeDoubleClickCore(event, node);
  }, [onNodeDoubleClickCore]);

  // Create nodeTypes with showInterfaceLabels
  const nodeTypes = useMemo(() => ({
    dynamicNode: (props: any) => <DynamicCanvasNode {...props} showInterfaceLabels={showInterfaceLabels} />,
    textBox: TextBoxNode
  }), [showInterfaceLabels]);

  // Apply animation to edges based on toggle and interface direction
  const animatedEdges = useMemo(() => {
    if (!animateEdges) {
      return edges.map(edge => ({ ...edge, animated: false }));
    }

    return edges.map(edge => {
      // Find source node and check if source handle is master/output
      const sourceNode = nodes.find(n => n.id === edge.source);
      const sourceInterface = sourceNode?.data?.interfaces?.find(
        (i: any) => i.id === edge.sourceHandle
      );
      
      // Animate if source is master or output (data flows from master to slave)
      const shouldAnimate = sourceInterface?.direction === 'master' || 
                           sourceInterface?.direction === 'output';
      
      return { ...edge, animated: shouldAnimate };
    });
  }, [edges, nodes, animateEdges]);

  useEffect(() => {
    if (isActive && reactFlowInstance) {
      const shouldFit = () => {
        if (justDraggedRef.current) {
          // If a drag or drop just happened, don't fit, but reset flag for next non-drag related change.
          justDraggedRef.current = false;
          return false;
        }
        return true; // Fit for other changes (panel toggle, initial load, node deletion)
      };

      if (shouldFit()) {
        // Only fit if there's content or it's an explicit resize triggered by panels/content change
        // This avoids fitting an empty canvas unnecessarily on every panel toggle if it was already empty.
        if (nodes.length > 0 || edges.length > 0 || isLeftPanelOpen !== undefined || isRightPanelOpen !== undefined) {
          const timer = setTimeout(() => {
            reactFlowInstance.fitView(fitViewOptions);
          }, 75); // Delay for layout settlement
          return () => clearTimeout(timer);
        }
      }
    }
  }, [isActive, nodes, edges, isLeftPanelOpen, isRightPanelOpen, reactFlowInstance, currentProjectRoot]);


  const handleInternalNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);
    const positionChange = changes.find(c => c.type === 'position');
    if (positionChange && 'dragging' in positionChange && typeof positionChange.dragging === 'boolean' && !positionChange.dragging) {
      justDraggedRef.current = true;
    }
  }, [onNodesChange]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      justDraggedRef.current = true; // Signal that a drop just occurred

      const componentString = event.dataTransfer.getData(DRAG_MIME_TYPE);
      if (!componentString || !reactFlowInstance) {
        return;
      }

      try {
        const droppedComponent = JSON.parse(componentString) as UserComponentDefinition;

        const position = reactFlowInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        onAddComponent(droppedComponent, position);
      } catch (error) {
        console.error("Failed to parse dropped component data:", error);
      }
    },
    [reactFlowInstance, onAddComponent]
  );

  // Handle component selection from picker
  const handleComponentFromPicker = useCallback((component: ArchitecturalComponent) => {
    if (!reactFlowInstance) return;

    // Get center of viewport
    const { x, y, zoom } = reactFlowInstance.getViewport();
    const canvasRect = document.querySelector('[data-testid="architect-canvas-editor-internal"]')?.getBoundingClientRect();

    if (canvasRect) {
      // Calculate center position in flow coordinates
      const centerX = (canvasRect.width / 2 - x) / zoom;
      const centerY = (canvasRect.height / 2 - y) / zoom;

      onAddComponent(component as any, { x: centerX, y: centerY });
    }
  }, [reactFlowInstance, onAddComponent]);

  // Custom connection validation - allow all connections, let DRC handle validation
  const isValidConnection = useCallback((connection: Connection) => {
    console.log('[isValidConnection] Checking connection:', {
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle
    });
    console.log('[isValidConnection] Current edges:', edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle
    })));

    // Prevent self-connections
    if (connection.source === connection.target) {
      console.log('[isValidConnection] ❌ Rejected: self-connection');
      return false;
    }

    // Check for duplicate connections
    const isDuplicate = edges.some(edge => 
      (edge.source === connection.source && 
       edge.target === connection.target &&
       edge.sourceHandle === connection.sourceHandle &&
       edge.targetHandle === connection.targetHandle) ||
      // Also check for reverse connection
      (edge.source === connection.target && 
       edge.target === connection.source &&
       edge.sourceHandle === connection.targetHandle &&
       edge.targetHandle === connection.sourceHandle)
    );

    if (isDuplicate) {
      console.log('[isValidConnection] ❌ Rejected: duplicate connection');
      return false;
    }

    // Allow all other connections - DRC will validate them
    console.log('[isValidConnection] ✅ Allowed');
    return true;
  }, [edges]);

  // Export template dialog state
  const [exportTemplateDialogOpen, setExportTemplateDialogOpen] = React.useState(false);
  const [isExportingTemplate, setIsExportingTemplate] = React.useState(false);

  // Open export template dialog
  const handleExportAsTemplateClick = useCallback(() => {
    if (!isAdmin || !projectId) {
      toast({
        title: "Access Denied",
        description: "Only admins can export templates",
        variant: "destructive"
      });
      return;
    }

    if (nodes.length === 0) {
      toast({
        title: "Cannot Export",
        description: "Canvas is empty. Add components before exporting.",
        variant: "destructive"
      });
      return;
    }

    setExportTemplateDialogOpen(true);
  }, [isAdmin, projectId, nodes, toast]);

  // Handle export template submission
  const handleExportTemplate = useCallback(async (templateName: string, description: string, existingTemplateId?: string) => {
    setIsExportingTemplate(true);

    try {
      const isUpdate = !!existingTemplateId;
      
      // Show loading toast
      toast({
        title: isUpdate ? "Updating Template" : "Exporting Template",
        description: isUpdate 
          ? `Updating template "${templateName}"...`
          : `Creating template "${templateName}"...`
      });

      // Call admin API to save or update template
      const { adminApi } = await import('@/lib/admin-api');
      const result = isUpdate
        ? await adminApi.updateTemplate({
            projectId: projectId!,
            templateId: existingTemplateId
          })
        : await adminApi.exportAsTemplate({
            projectId: projectId!,
            templateName,
            templateDescription: description
          });

      const successMessage = isUpdate
        ? `Template "${templateName}" has been updated with the current diagram`
        : result.data && 'filePath' in result.data
          ? `Template "${result.data.templateName}" saved to ${result.data.filePath}`
          : `Template "${result.data?.templateName}" saved successfully`;

      toast({
        title: isUpdate ? "Template Updated" : "Template Exported",
        description: successMessage
      });

      console.log('[ArchitectCanvasCore] Template ' + (isUpdate ? 'updated' : 'exported') + ':', result.data);
      
      // Close dialog
      setExportTemplateDialogOpen(false);
    } catch (error) {
      console.error('Error exporting template:', error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : 'Failed to export template. Please try again.',
        variant: "destructive"
      });
    } finally {
      setIsExportingTemplate(false);
    }
  }, [projectId, toast]);



  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex-grow relative" data-testid="architect-canvas-area">
        <div
          className="w-full h-full"
          data-testid="architect-canvas-editor-internal"
          style={{
            ...(isPanMode && {
              cursor: isPanning ? 'grabbing' : 'grab'
            })
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={animatedEdges}
            onNodesChange={handleInternalNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            onPaneClick={onPaneClick}
            onPaneContextMenu={handlePaneContextMenu}
            onNodeContextMenu={handleNodeContextMenu}
            onEdgeContextMenu={handleEdgeContextMenu}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onMoveStart={handleMoveStart}
            onMoveEnd={handleMoveEnd}
            nodeTypes={nodeTypes}
            fitView={false} // We manually call fitView
            fitViewOptions={fitViewOptions}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ type: 'smoothstep' }}
            nodesDraggable={isInteractive && isProjectOpen}
            nodesConnectable={isInteractive && isProjectOpen}
            elementsSelectable={isInteractive && isProjectOpen}
            deleteKeyCode={(isInteractive && isProjectOpen) ? ['Backspace', 'Delete'] : null}
            connectionMode={ConnectionMode.Loose}
            isValidConnection={isValidConnection}
            panOnDrag={isPanMode}
            selectionOnDrag={!isPanMode && isInteractive && isProjectOpen}
          >
            <Background />

            {/* Floating Add Component Button - Top Left */}
            <Panel position="top-left" className="m-4 flex gap-2">
              <ComponentPickerPopover
                components={availableComponents}
                onSelectComponent={handleComponentFromPicker}
                canvasNodes={nodes}
                disabled={!isProjectOpen}
              />

              {/* Pending Audit Button - Admin Only */}
              {isAdmin && projectId && (
                <PendingAuditPopover
                  projectId={projectId}
                  disabled={!isProjectOpen}
                  onAuditComplete={onAuditComplete}
                />
              )}

              {/* Export as Template Button - Admin Only */}
              {isAdmin && projectId && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="default"
                      size="icon"
                      onClick={handleExportAsTemplateClick}
                      disabled={!isProjectOpen || nodes.length === 0}
                      className="h-10 w-10 rounded-full shadow-lg bg-blue-500 hover:bg-blue-600"
                      title="Export as Template (Admin Only)"
                    >
                      <Upload className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Export as Template</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </Panel>

            <Panel position="top-right" className="flex items-center gap-1 p-1 bg-card border border-border rounded-md shadow-sm">
              {/* Group 1: Undo/Redo */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleUndo}
                    disabled={!canUndo || !isProjectOpen}
                    className="h-8 w-8 p-1.5"
                  >
                    <Undo2 className={cn("h-5 w-5", (!canUndo || !isProjectOpen) && "text-muted-foreground/50")} />
                    <span className="sr-only">Undo</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Undo (Ctrl+Z)</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                   <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRedo}
                    disabled={!canRedo || !isProjectOpen}
                    className="h-8 w-8 p-1.5"
                  >
                    <Redo2 className={cn("h-5 w-5", (!canRedo || !isProjectOpen) && "text-muted-foreground/50")} />
                    <span className="sr-only">Redo</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Redo (Ctrl+Y)</p>
                </TooltipContent>
              </Tooltip>

              <div className="h-6 w-px bg-border mx-1 self-center"></div>

              {/* Group 2: Zoom/Fit/Lock */}
              <Tooltip>
                <TooltipTrigger asChild>
                   <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => reactFlowInstance.zoomIn()}
                    className="h-8 w-8 p-1.5"
                  >
                    <ZoomIn className="h-5 w-5" />
                    <span className="sr-only">Zoom In</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Zoom In</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                   <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => reactFlowInstance.zoomOut()}
                    className="h-8 w-8 p-1.5"
                  >
                    <ZoomOut className="h-5 w-5" />
                    <span className="sr-only">Zoom Out</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Zoom Out</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                   <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => reactFlowInstance.fitView(fitViewOptions)}
                    className="h-8 w-8 p-1.5"
                  >
                    <Maximize className="h-5 w-5" />
                    <span className="sr-only">Fit View</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Fit View</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={isPanMode ? "default" : "ghost"}
                    size="icon"
                    onClick={togglePanMode}
                    disabled={!isProjectOpen}
                    className="h-8 w-8 p-1.5"
                  >
                    <Hand className={cn("h-5 w-5", isPanMode && "text-primary-foreground")} />
                    <span className="sr-only">
                      {isPanMode ? 'Disable Pan Mode (Enable Selection)' : 'Enable Pan Mode (Move Canvas)'}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>
                    {isPanMode ? 'Disable Pan Mode (Enable Selection)' : 'Enable Pan Mode (Move Canvas)'}
                  </p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={isProjectOpen && !isInteractive ? "default" : "ghost"}
                    size="icon"
                    onClick={toggleInteractivity}
                    disabled={!isProjectOpen}
                    className="h-8 w-8 p-1.5"
                  >
                    {isProjectOpen
                        ? (isInteractive ? <Unlock className="h-5 w-5" /> : <Lock className="h-5 w-5 text-primary-foreground" />)
                        : <Lock className="h-5 w-5 text-muted-foreground/50" />
                    }
                    <span className="sr-only">
                      {isProjectOpen
                        ? (isInteractive ? 'Lock Canvas (Disable Interactivity)' : 'Unlock Canvas (Enable Interactivity)')
                        : 'Canvas Locked (Open a project to interact)'}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>
                    {isProjectOpen
                      ? (isInteractive ? 'Lock Canvas (Disable Interactivity)' : 'Unlock Canvas (Enable Interactivity)')
                      : 'Canvas Locked (Open a project to interact)'}
                  </p>
                </TooltipContent>
              </Tooltip>

              <div className="h-6 w-px bg-border mx-1 self-center"></div>

              {/* Group 3: Reload/Save */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleReloadCanvas}
                    disabled={!isProjectOpen}
                    className="h-8 w-8 p-1.5"
                  >
                    <RefreshCw className={cn("h-5 w-5", !isProjectOpen && "text-muted-foreground/50")} />
                    <span className="sr-only">Reload Canvas</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Reload Canvas</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={manualSaveTrigger}
                    disabled={!isProjectOpen}
                    className="h-8 w-8 p-1.5"
                  >
                    <Save className={cn("h-5 w-5", !isProjectOpen && "text-muted-foreground/50")} />
                    <span className="sr-only">Save Canvas</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Save Canvas (Ctrl+S)</p>
                </TooltipContent>
              </Tooltip>

              {/* Interface Labels Toggle */}
              {onToggleInterfaceLabels && (
                <>
                  <div className="h-6 w-px bg-border mx-1 self-center"></div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={showInterfaceLabels ? "default" : "ghost"}
                        size="icon"
                        onClick={onToggleInterfaceLabels}
                        className="h-8 w-8 p-1.5"
                      >
                        <Tag className="h-5 w-5" />
                        <span className="sr-only">Toggle Interface Labels</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p>{showInterfaceLabels ? 'Hide' : 'Show'} Interface Labels</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={animateEdges ? "default" : "ghost"}
                        size="icon"
                        onClick={toggleEdgeAnimation}
                        className="h-8 w-8 p-1.5"
                      >
                        <Zap className="h-5 w-5" />
                        <span className="sr-only">Toggle Data Flow Animation</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p>{animateEdges ? 'Disable' : 'Enable'} Data Flow Animation</p>
                    </TooltipContent>
                  </Tooltip>
                </>
              )}
            </Panel>
          </ReactFlow>

          {/* Context Menu */}
          {contextMenu && (
            <div
              className="fixed bg-popover border border-border rounded-md shadow-lg py-1 z-50 min-w-[160px]"
              style={{
                left: contextMenu.x,
                top: contextMenu.y
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {contextMenu.type === 'pane' && (
                <button
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                  onClick={handleAddTextBox}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                  Add Text Box
                </button>
              )}
              {contextMenu.type === 'node' && (
                <button
                  className="w-full px-3 py-2 text-left text-sm hover:bg-destructive hover:text-destructive-foreground flex items-center gap-2"
                  onClick={handleRemoveNode}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Remove Node
                </button>
              )}
              {contextMenu.type === 'edge' && (
                <button
                  className="w-full px-3 py-2 text-left text-sm hover:bg-destructive hover:text-destructive-foreground flex items-center gap-2"
                  onClick={handleRemoveEdge}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Remove Edge
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Export Template Dialog */}
      <ExportTemplateDialog
        open={exportTemplateDialogOpen}
        onOpenChange={setExportTemplateDialogOpen}
        onExport={handleExportTemplate}
        isExporting={isExportingTemplate}
      />
    </TooltipProvider>
  );
}

