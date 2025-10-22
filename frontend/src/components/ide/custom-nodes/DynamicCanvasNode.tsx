
'use client';

import * as React from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from 'reactflow';
import { cn } from '@/lib/utils';
import type { DynamicCanvasNodeData } from '@/types/ide';
import IconRenderer from '../IconRenderer'; // Import the new IconRenderer

const DEFAULT_NODE_WIDTH = 150;
const DEFAULT_NODE_HEIGHT = 75; 

interface DynamicCanvasNodeProps extends NodeProps<DynamicCanvasNodeData> {
  showInterfaceLabels?: boolean;
}

export function DynamicCanvasNode(props: DynamicCanvasNodeProps) {
  const { data, selected, id: nodeId, showInterfaceLabels = false } = props;
  const { label, width: dataWidth, height: dataHeight, model_type, iconName, interfaces } = data;

  // Use ReactFlow's hook to update node internals when handles change
  const updateNodeInternals = useUpdateNodeInternals();

  // Update node internals when interfaces change to ensure new handles are properly registered
  React.useEffect(() => {
    if (interfaces && interfaces.length > 0) {
      // Notify ReactFlow to recalculate node internals (handles, connections, etc.)
      updateNodeInternals(nodeId);
    }
  }, [interfaces, nodeId, updateNodeInternals]);

  let effectiveWidth = DEFAULT_NODE_WIDTH;
  if (typeof dataWidth === 'number' && dataWidth > 0) {
    effectiveWidth = dataWidth;
  }

  let effectiveHeight = DEFAULT_NODE_HEIGHT;
  if (typeof dataHeight === 'number' && dataHeight > 0) {
    effectiveHeight = dataHeight;
  }

  const nodeStyle: React.CSSProperties = {
    width: `${effectiveWidth}px`,
    height: `${effectiveHeight}px`,
  };

  return (
    <div
      className={cn(
        'bg-card text-card-foreground rounded-lg shadow-md border',
        'p-2 flex flex-col items-center justify-center', // Main flex container: column, items centered
        selected ? 'border-primary shadow-[0_0_0_2px_hsl(var(--primary))]' : 'border-border',
        'hover:shadow-[0_0_0_1px_hsl(var(--border))] cursor-pointer transition-shadow relative'
      )}
      style={nodeStyle}
    >
      {/* Row 1: Icon */}
      <IconRenderer 
        iconName={iconName} 
        defaultIcon="Box" 
        className="h-6 w-6 text-primary mb-1" // Reverted icon size
        data-ai-hint={model_type || "component"} 
      />

      {/* Row 2: Display Name */}
      <span className="text-sm font-medium truncate block text-center w-full mb-0.5" title={label}>
        {label || "Unnamed Node"}
      </span>

      {/* Row 3: Component Type */}
      {model_type && (
        <span className="text-xs text-muted-foreground truncate block text-center w-full" title={`(${model_type})`}>
          ({model_type})
        </span>
      )}

      {/* Render handles from interfaces data */}
      {data.interfaces && data.interfaces.length > 0 ? (
        <>
          {/* Generate handles from interfaces data */}
          {(() => {
            // Filter interfaces based on showOptionalPorts flag
            const visibleInterfaces = data.interfaces.filter(iface => {
              // Show all non-optional interfaces
              if (!(iface as any).optional) return true;
              // Show optional interfaces only if flag is set
              return data.showOptionalPorts === true;
            });

            // Group interfaces by position for proper distribution
            const topInterfaces: typeof data.interfaces = [];
            const bottomInterfaces: typeof data.interfaces = [];
            const leftInterfaces: typeof data.interfaces = [];
            const rightInterfaces: typeof data.interfaces = [];

            visibleInterfaces.forEach((iface) => {
              // Check if manual placement is specified
              if (iface.placement) {
                // Use explicit placement
                if (iface.placement === 'north') {
                  topInterfaces.push(iface);
                } else if (iface.placement === 'south') {
                  bottomInterfaces.push(iface);
                } else if (iface.placement === 'west') {
                  leftInterfaces.push(iface);
                } else if (iface.placement === 'east') {
                  rightInterfaces.push(iface);
                }
              } else {
                // Auto placement based on direction (backward compatibility)
                const direction = iface.direction;
                
                if (!direction) {
                  // Graceful handling of undefined direction (user design error)
                  // Default to left side
                  console.warn(`[DynamicCanvasNode] Interface "${iface.name}" has undefined direction, placing on left`);
                  leftInterfaces.push(iface);
                } else if (direction === 'slave' || direction === 'input') {
                  topInterfaces.push(iface);
                } else if (direction === 'master' || direction === 'output') {
                  bottomInterfaces.push(iface);
                } else {
                  // Bidirectional: alternate between left and right
                  if (leftInterfaces.length <= rightInterfaces.length) {
                    leftInterfaces.push(iface);
                  } else {
                    rightInterfaces.push(iface);
                  }
                }
              }
            });

            // Helper to calculate distributed offset for handles on same side
            const calculateOffset = (index: number, total: number): string => {
              if (total === 1) return '50%';
              const spacing = 100 / (total + 1);
              return `${spacing * (index + 1)}%`;
            };

            // Helper to determine handle type based on direction
            const getHandleType = (direction: string | undefined): 'source' | 'target' => {
              // input/slave = target (receives connections)
              // output/master = source (initiates connections)
              // bidirectional = source (can both send and receive, but React Flow needs one type)
              // undefined/invalid = default to source (graceful fallback)
              let handleType: 'source' | 'target';
              
              if (!direction) {
                // Graceful handling of undefined direction (user design error)
                console.warn(`[DynamicCanvasNode] Interface has undefined direction, defaulting to 'source'`);
                handleType = 'source';
              } else if (direction === 'input' || direction === 'slave') {
                handleType = 'target';
              } else if (direction === 'output' || direction === 'master') {
                handleType = 'source';
              } else {
                // bidirectional or unknown - default to source
                handleType = 'source';
              }
              
              return handleType;
            };

            const allHandles: JSX.Element[] = [];

            // Render top handles
            topInterfaces.forEach((iface, index) => {
              const offset = calculateOffset(index, topInterfaces.length);
              const isOptional = (iface as any).optional === true;
              const handleType = getHandleType(iface.direction);
              allHandles.push(
                <React.Fragment key={`${nodeId}-${iface.id}`}>
                  <Handle
                    type={handleType}
                    position={Position.Top}
                    id={iface.id}
                    style={{ left: offset, background: 'hsl(var(--primary))' }}
                    className={cn(
                      "!w-3 !h-3",
                      isOptional && "!border-dashed !opacity-70 !border-blue-400 !border-2"
                    )}
                    title={`${iface.name} (${iface.busType}) [${iface.direction}]${isOptional ? ' [Optional]' : ''}`}
                  />
                  {showInterfaceLabels && (
                    <div
                      className="absolute text-[10px] font-mono bg-background/90 px-1 py-0.5 rounded border border-border pointer-events-none whitespace-nowrap"
                      style={{ top: '-32px', left: offset, transform: 'translateX(-50%)' }}
                    >
                      {iface.name}
                    </div>
                  )}
                </React.Fragment>
              );
            });

            // Render bottom handles
            bottomInterfaces.forEach((iface, index) => {
              const offset = calculateOffset(index, bottomInterfaces.length);
              const isOptional = (iface as any).optional === true;
              const handleType = getHandleType(iface.direction);
              allHandles.push(
                <React.Fragment key={`${nodeId}-${iface.id}`}>
                  <Handle
                    type={handleType}
                    position={Position.Bottom}
                    id={iface.id}
                    style={{ left: offset, background: 'hsl(var(--primary))' }}
                    className={cn(
                      "!w-3 !h-3",
                      isOptional && "!border-dashed !opacity-70 !border-blue-400 !border-2"
                    )}
                    title={`${iface.name} (${iface.busType}) [${iface.direction}]${isOptional ? ' [Optional]' : ''}`}
                  />
                  {showInterfaceLabels && (
                    <div
                      className="absolute text-[10px] font-mono bg-background/90 px-1 py-0.5 rounded border border-border pointer-events-none whitespace-nowrap"
                      style={{ bottom: '-32px', left: offset, transform: 'translateX(-50%)' }}
                    >
                      {iface.name}
                    </div>
                  )}
                </React.Fragment>
              );
            });

            // Render left handles
            leftInterfaces.forEach((iface, index) => {
              const offset = calculateOffset(index, leftInterfaces.length);
              const isOptional = (iface as any).optional === true;
              const handleType = getHandleType(iface.direction);
              allHandles.push(
                <React.Fragment key={`${nodeId}-${iface.id}`}>
                  <Handle
                    type={handleType}
                    position={Position.Left}
                    id={iface.id}
                    style={{ top: offset, background: 'hsl(var(--primary))' }}
                    className={cn(
                      "!w-3 !h-3",
                      isOptional && "!border-dashed !opacity-70 !border-blue-400 !border-2"
                    )}
                    title={`${iface.name} (${iface.busType}) [${iface.direction}]${isOptional ? ' [Optional]' : ''}`}
                  />
                  {showInterfaceLabels && (
                    <div
                      className="absolute text-[10px] font-mono bg-background/90 px-1 py-0.5 rounded border border-border pointer-events-none whitespace-nowrap"
                      style={{ left: '-9px', top: offset, transform: 'translate(-100%, -50%)' }}
                    >
                      {iface.name}
                    </div>
                  )}
                </React.Fragment>
              );
            });

            // Render right handles
            rightInterfaces.forEach((iface, index) => {
              const offset = calculateOffset(index, rightInterfaces.length);
              const isOptional = (iface as any).optional === true;
              const handleType = getHandleType(iface.direction);
              allHandles.push(
                <React.Fragment key={`${nodeId}-${iface.id}`}>
                  <Handle
                    type={handleType}
                    position={Position.Right}
                    id={iface.id}
                    style={{ top: offset, background: 'hsl(var(--primary))' }}
                    className={cn(
                      "!w-3 !h-3",
                      isOptional && "!border-dashed !opacity-70 !border-blue-400 !border-2"
                    )}
                    title={`${iface.name} (${iface.busType}) [${iface.direction}]${isOptional ? ' [Optional]' : ''}`}
                  />
                  {showInterfaceLabels && (
                    <div
                      className="absolute text-[10px] font-mono bg-background/90 px-1 py-0.5 rounded border border-border pointer-events-none whitespace-nowrap"
                      style={{ right: '-9px', top: offset, transform: 'translate(100%, -50%)' }}
                    >
                      {iface.name}
                    </div>
                  )}
                </React.Fragment>
              );
            });

            return allHandles;
          })()}
        </>
      ) : (
        <>
          {/* Fallback: Default handles for backward compatibility */}
          <Handle type="target" position={Position.Top} style={{ background: 'hsl(var(--primary))' }} className="!w-3 !h-3" />
          <Handle type="source" position={Position.Bottom} style={{ background: 'hsl(var(--primary))' }} className="!w-3 !h-3" />
          <Handle type="target" position={Position.Left} style={{ background: 'hsl(var(--primary))' }} className="!w-3 !h-3" />
          <Handle type="source" position={Position.Right} style={{ background: 'hsl(var(--primary))' }} className="!w-3 !h-3" />
        </>
      )}
    </div>
  );
}
