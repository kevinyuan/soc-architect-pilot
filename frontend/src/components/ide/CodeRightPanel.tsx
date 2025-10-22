
"use client";

import * as React from 'react';
import { RightSidebar, RightSidebarContent, RightSidebarHeader } from '@/components/ui/right-sidebar';
import { UnifiedChatAssistant } from './UnifiedChatAssistant';
import type { OpenFile } from '@/types/ide';
import { Bot } from 'lucide-react';

interface CodeRightPanelProps {
  activeFile: OpenFile | undefined;
  isRightPanelOpen: boolean;
  onToggle: () => void;
  onApplyCodeSuggestion: (newCode: string) => void;
  projectId?: string;
}

export function CodeRightPanel({
  activeFile,
  isRightPanelOpen,
  onToggle,
  onApplyCodeSuggestion,
  projectId,
}: CodeRightPanelProps) {

  const handleInternalOpenChange = (newOpenState: boolean) => {
    if (isRightPanelOpen !== newOpenState) {
      onToggle();
    }
  };

  return (
    <RightSidebar
      side="right"
      collapsible="offcanvas"
      variant="sidebar"
      // className="shadow-md" // Removed shadow-md
      open={isRightPanelOpen}
      onOpenChange={handleInternalOpenChange}
    >
      <RightSidebarHeader className="p-2 border-b border-sidebar-border">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Bot className="h-5 w-5 text-primary" />
          <span>AI Assistant</span>
        </div>
      </RightSidebarHeader>
      <RightSidebarContent className="p-0">
        <UnifiedChatAssistant
          layout="sidebar"
          mode="code"
          isVisible={!!activeFile && isRightPanelOpen}
          projectId={projectId}
          showHeader={true}
          showExamples={false}
          enableHistory={true}
          enableNewChat={true}
        />
      </RightSidebarContent>
    </RightSidebar>
  );
}

