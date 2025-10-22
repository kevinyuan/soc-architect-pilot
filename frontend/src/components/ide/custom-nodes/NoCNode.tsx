
// This file is no longer needed as DynamicCanvasNode.tsx provides a general solution.
// It can be safely deleted.
// If you want to keep it for reference, ensure it's not imported or used in ArchitectView.tsx.

/*
'use client';

import { Handle, Position, type NodeProps } from 'reactflow';
import { cn } from '@/lib/utils';

interface NoCNodeData {
  label: string;
}

// Consistent handle IDs with the canvas file
const handleIds = {
  top: {
    arm: 'noc-in-from-arm-proc',
    x86: 'noc-in-from-x86-proc',
  },
  bottom: {
    ram: 'noc-out-to-ram-1',
    ethernet: 'noc-out-to-ethernet-1',
    cxl: 'noc-out-to-cxl-1',
  },
};

export function NoCNode({ data, selected }: NodeProps<NoCNodeData>) {
  return (
    <div
      className={cn(
        'bg-card text-card-foreground rounded-lg shadow-md border',
        'w-48 h-24 flex items-center justify-center text-center p-2', // Adjusted size and padding
        selected ? 'border-primary shadow-[0_0_0_2px_hsl(var(--primary))]' : 'border-border',
        'hover:shadow-[0_0_0_1px_hsl(210,30%,90%)] cursor-pointer'
      )}
    >
      <span className="truncate">{data.label}</span>

      <Handle
        type="target"
        position={Position.Top}
        id={handleIds.top.arm}
        style={{ left: '33.33%', transform: 'translateX(-50%)', background: 'hsl(var(--primary))' }}
        className="!w-3 !h-3" 
      />
      <Handle
        type="target"
        position={Position.Top}
        id={handleIds.top.x86}
        style={{ left: '66.67%', transform: 'translateX(-50%)', background: 'hsl(var(--primary))' }}
        className="!w-3 !h-3"
      />

      <Handle
        type="source"
        position={Position.Bottom}
        id={handleIds.bottom.ram}
        style={{ left: '25%', transform: 'translateX(-50%)', background: 'hsl(var(--primary))' }}
        className="!w-3 !h-3"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id={handleIds.bottom.ethernet}
        style={{ left: '50%', transform: 'translateX(-50%)', background: 'hsl(var(--primary))' }}
        className="!w-3 !h-3"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id={handleIds.bottom.cxl}
        style={{ left: '75%', transform: 'translateX(-50%)', background: 'hsl(var(--primary))' }}
        className="!w-3 !h-3"
      />
    </div>
  );
}
*/
