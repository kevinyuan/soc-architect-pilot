
import * as React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, FolderKanban, PanelLeft, PanelRight, PanelBottom, Container as ContainerIcon, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ViewMode } from '@/types/ide';

interface AppHeaderProps {
  currentUser?: string;
  currentProjectRoot?: string | null;
  currentProjectName?: string | null;
  currentViewMode: ViewMode;
  onToggleArchitectLeftPanel?: () => void;
  onToggleArchitectRightPanel?: () => void;
  onToggleCodeExplorerPanel?: () => void;
  onToggleCodeBottomPanel?: () => void;
  onToggleCodeRightPanel?: () => void;
  onToggleContainerControlPanel?: () => void;
  onProjectNameChange?: (newName: string) => void;
}

export function AppHeader({
  currentUser,
  currentProjectRoot,
  currentProjectName,
  currentViewMode,
  onToggleArchitectLeftPanel,
  onToggleArchitectRightPanel,
  onToggleCodeExplorerPanel,
  onToggleCodeBottomPanel,
  onToggleCodeRightPanel,
  onToggleContainerControlPanel,
  onProjectNameChange,
}: AppHeaderProps) {
  // Only show project name if available, don't fallback to ID
  const workspaceDisplayName = currentProjectRoot && currentProjectName ? currentProjectName : null;
  
  const [isEditing, setIsEditing] = React.useState(false);
  const [editedName, setEditedName] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number } | null>(null);

  const handleStartEdit = () => {
    if (workspaceDisplayName && onProjectNameChange) {
      setEditedName(workspaceDisplayName);
      setIsEditing(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleSave = () => {
    if (editedName.trim() && editedName !== workspaceDisplayName && onProjectNameChange) {
      onProjectNameChange(editedName.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (workspaceDisplayName && onProjectNameChange && !isEditing) {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY });
    }
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const handleRenameFromMenu = () => {
    closeContextMenu();
    handleStartEdit();
  };

  // Close context menu on click outside
  React.useEffect(() => {
    if (contextMenu) {
      const handleClick = () => closeContextMenu();
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  return (
    <TooltipProvider delayDuration={0}>
      <header className={cn(
        "flex h-14 items-center justify-between border-b bg-card shadow-sm shrink-0",
        "relative z-30"
      )}>
        <div className="flex items-center gap-3 pl-4">
          <Sparkles className="h-7 w-7 text-primary" />
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold font-headline text-foreground/75">SoC Pilot</h1>
            {workspaceDisplayName && (
              <div className="flex items-center gap-1.5 text-xl font-semibold font-headline">
                <span className="text-muted-foreground mx-1">{'>'}</span>
                <FolderKanban className="h-5 w-5 text-primary flex-shrink-0" />
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <Input
                      ref={inputRef}
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onBlur={handleSave}
                      className="h-7 px-2 text-base font-semibold w-64"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={handleSave}
                    >
                      <Check className="h-4 w-4 text-green-600" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={handleCancel}
                    >
                      <X className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                ) : (
                  <button 
                    className="whitespace-nowrap cursor-pointer hover:text-primary transition-colors text-xl font-semibold font-headline bg-transparent border-none p-0 m-0"
                    onClick={handleStartEdit}
                    onContextMenu={handleContextMenu}
                    data-allow-context-menu="true"
                    type="button"
                  >
                    {workspaceDisplayName}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-end gap-1 pr-2 pb-0.5 h-full">
          {currentViewMode === 'architect' && (
            <>
              {onToggleArchitectLeftPanel && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={onToggleArchitectLeftPanel} className="h-8 w-8">
                      <PanelLeft className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Toggle Inspector</TooltipContent>
                </Tooltip>
              )}
              {onToggleArchitectRightPanel && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={onToggleArchitectRightPanel} className="h-8 w-8">
                      <PanelRight className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Toggle AI Assistant</TooltipContent>
                </Tooltip>
              )}
            </>
          )}
          {currentViewMode === 'code' && (
            <>
              {onToggleCodeExplorerPanel && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={onToggleCodeExplorerPanel} className="h-8 w-8">
                      <PanelLeft className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Toggle File Explorer</TooltipContent>
                </Tooltip>
              )}
              {onToggleCodeBottomPanel && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={onToggleCodeBottomPanel} className="h-8 w-8">
                      <PanelBottom className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Toggle Bottom Panel</TooltipContent>
                </Tooltip>
              )}
              {onToggleCodeRightPanel && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={onToggleCodeRightPanel} className="h-8 w-8">
                      <PanelRight className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Toggle AI Assistant</TooltipContent>
                </Tooltip>
              )}
            </>
          )}
          {currentViewMode === 'container' && ( // Added section for Container View
            <>
              {onToggleContainerControlPanel && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={onToggleContainerControlPanel} className="h-8 w-8">
                      <PanelLeft className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Toggle Container Controls</TooltipContent>
                </Tooltip>
              )}
              {/* Add other panel toggles for Container View here if needed, e.g., a right panel */}
            </>
          )}
        </div>

        {/* Context Menu for Project Name */}
        {contextMenu && (
          <div
            className="fixed bg-popover border border-border rounded-md shadow-lg py-1 z-50 min-w-[160px]"
            style={{
              left: contextMenu.x,
              top: contextMenu.y
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
              onClick={handleRenameFromMenu}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Rename Project
            </button>
          </div>
        )}
      </header>
    </TooltipProvider>
  );
}
