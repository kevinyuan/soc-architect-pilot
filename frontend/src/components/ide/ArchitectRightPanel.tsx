"use client";

import * as React from 'react';
import { ArchitectInspector } from './ArchitectInspector';
import type { Node } from 'reactflow';
import type { DynamicCanvasNodeData, Language } from '@/types/ide';

interface ArchitectRightPanelProps {
  selectedNode: Node<DynamicCanvasNodeData> | null;
  onNodeUpdate: (originalNodeId: string, newId: string, updatedDataProps: Partial<DynamicCanvasNodeData>) => void;
  currentUser: string | null;
  currentProjectRoot: string | null;
  projectId?: string;
  onComponentExported: () => void;
  onApplyCodeSuggestion: (newCode: string) => void;
  isPanelOpen: boolean;
  onSaveCanvas?: () => Promise<void>;
  isAdmin?: boolean;
}

export function ArchitectRightPanel({
  selectedNode,
  onNodeUpdate,
  currentUser,
  currentProjectRoot,
  projectId,
  onComponentExported,
  onApplyCodeSuggestion,
  isPanelOpen,
  onSaveCanvas,
  isAdmin = false,
}: ArchitectRightPanelProps) {
  return (
    <div className="w-full h-full flex flex-col">
      {/* Inspector - No tabs, direct component */}
      <ArchitectInspector
        selectedNode={selectedNode}
        onNodeUpdate={onNodeUpdate}
        currentUser={currentUser}
        currentProjectRoot={currentProjectRoot}
        projectId={projectId}
        onComponentExported={onComponentExported}
        onSaveCanvas={onSaveCanvas}
        isAdmin={isAdmin}
      />
    </div>
  );
}