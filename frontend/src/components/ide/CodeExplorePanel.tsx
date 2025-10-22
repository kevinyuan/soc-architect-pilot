
"use client";

import * as React from 'react';
import { FileExplorer } from './FileExplorer';
import type { FileSystemNode, ViewMode } from '@/types/ide';
import { Loader2, FolderSearch, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface CodeExplorePanelProps {
  fileTree: FileSystemNode[];
  isFileTreeLoading: boolean;
  onRefreshTree: () => Promise<void>;
  onFileNodeSelect: (node: FileSystemNode, action?: 'default' | 'viewAsJson' | 'editAsJson') => void;
  onBuildRequest: (node: FileSystemNode) => void;
  currentProjectRoot: string | null;
  currentProjectId?: string | null;
  currentUser: string;
  currentViewMode: ViewMode;
}

export function CodeExplorePanel({
  fileTree,
  isFileTreeLoading,
  onRefreshTree,
  onFileNodeSelect,
  onBuildRequest,
  currentProjectRoot,
  currentProjectId,
  currentUser,
  currentViewMode,
}: CodeExplorePanelProps) {
  const explorerLoadingMessage = currentProjectRoot
    ? `Loading Explorer for ${currentProjectRoot}...`
    : `Loading Explorer for ${currentUser}'s root...`;

  const handleRefreshClick = async () => {
    if (isFileTreeLoading) return;
    await onRefreshTree();
  };

  if (currentViewMode !== 'code' && !isFileTreeLoading && fileTree.length === 0) {
    return null;
  }
  
  return (
    <TooltipProvider delayDuration={300}>
      <div className="p-2 border-b border-sidebar-border h-10 flex items-center justify-between">
        <span className="text-xs font-semibold text-sidebar-foreground truncate" title="File Explorer">
          FILE EXPLORER
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefreshClick}
              disabled={isFileTreeLoading}
              className="h-7 w-7 p-1 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              aria-label="Refresh file tree"
            >
              <RefreshCw className={cn("h-4 w-4", isFileTreeLoading && "animate-spin")} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Refresh File Tree</p>
          </TooltipContent>
        </Tooltip>
      </div>
      {isFileTreeLoading && fileTree.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
          <Loader2 className="h-6 w-6 animate-spin mb-2" />
          <p className="text-sm">{explorerLoadingMessage}</p>
        </div>
      ) : !isFileTreeLoading && fileTree.length === 0 && currentViewMode === 'code' ? (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4 text-center">
          <FolderSearch className="h-8 w-8 mb-2 text-primary/70" />
          <p className="text-sm font-medium">
            {currentProjectRoot ? `Workspace ${currentProjectRoot} is empty` : `Root for ${currentUser} is empty`}
          </p>
          <p className="text-xs mt-1">
            Create files or folders in this location on the server.
          </p>
        </div>
      ) : (
        <FileExplorer
          fileTree={fileTree}
          onFileNodeSelect={onFileNodeSelect}
          className="h-full"
          currentViewMode={currentViewMode}
          currentUser={currentUser}
          currentProjectRoot={currentProjectRoot}
          currentProjectId={currentProjectId}
          onRefreshTree={onRefreshTree} // Pass down the refresh function
          onBuildRequest={onBuildRequest}
        />
      )}
    </TooltipProvider>
  );
}
