
"use client";

import * as React from 'react';
import type { FileSystemNode, ViewMode } from '@/types/ide';
import { ChevronDown, ChevronRight, FileEdit, Folder as FolderIcon, Trash2, FileText as FileNodeIcon, FolderOpen, FileJson2, Rocket, Blocks, Copy, FilePlus2, FolderPlus, Hammer } from 'lucide-react';
import { FileIcon } from './FileIcon';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import path from 'path-browserify'; // For path.join on client
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { workspaceFileAPI } from '@/lib/workspace-file-api';
import { useToast } from '@/hooks/use-toast';
import { getLanguageForFileClientSide } from '@/hooks/useWorkspaceManager';


interface FileExplorerProps {
  fileTree: FileSystemNode[];
  onFileNodeSelect: (node: FileSystemNode, action?: 'default' | 'viewAsJson' | 'editAsJson') => void;
  onBuildRequest: (node: FileSystemNode) => void;
  className?: string;
  currentViewMode: ViewMode;
  currentUser: string;
  currentProjectRoot: string | null;
  currentProjectId?: string | null;
  onRefreshTree: () => Promise<void>;
}

interface FileExplorerItemProps {
  node: FileSystemNode;
  onFileNodeSelect: (node: FileSystemNode, action?: 'default' | 'viewAsJson' | 'editAsJson') => void;
  onBuildRequest: (node: FileSystemNode) => void;
  level: number;
  currentViewMode: ViewMode;
  currentUser: string;
  currentProjectRoot: string | null;
  currentProjectId?: string | null;
  onRefreshTree: () => Promise<void>;
}

const FileExplorerItem: React.FC<FileExplorerItemProps> = ({ node, onFileNodeSelect, onBuildRequest, level, currentViewMode, currentUser, currentProjectRoot, currentProjectId, onRefreshTree }) => {
  const [isOpen, setIsOpen] = React.useState(true);
  const [isContextMenuOpen, setIsContextMenuOpen] = React.useState(false);
  const [isRenaming, setIsRenaming] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState(node.name);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false); // For hover state
  const [isCreatingNewItem, setIsCreatingNewItem] = React.useState<'file' | 'folder' | null>(null);
  const [newItemName, setNewItemName] = React.useState('');
  const clickTypeRef = React.useRef<'left' | 'right' | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleToggleExpansion = () => {
    if (node.type === 'folder') {
      setIsOpen(!isOpen);
    }
  };

  const handlePrimaryAction = (event: React.MouseEvent) => {
    clickTypeRef.current = 'left';
    if (isRenaming) return;

    if (node.type === 'file') {
      if ((node.language === 'canvas' || node.language === 'emulation') && currentViewMode === 'code') {
         onFileNodeSelect(node, 'viewAsJson');
      } else {
        onFileNodeSelect(node, 'default');
      }
    } else if (node.type === 'folder') {
      handleToggleExpansion();
    }
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    clickTypeRef.current = 'right';
    setIsContextMenuOpen(true);
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      if (clickTypeRef.current === 'right') {
        setIsContextMenuOpen(true);
      }
    } else {
      setIsContextMenuOpen(false);
    }
    clickTypeRef.current = null;
  };

  const createMenuItemHandler = (action: () => void) => (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    action();
    setIsContextMenuOpen(false);
  };

  const handleRenameInitiate = createMenuItemHandler(() => {
    setRenameValue(node.name);
    setIsRenaming(true);
  });

  const handleRenameCancel = () => {
    setIsRenaming(false);
    setRenameValue(node.name);
  };

  const handleRenameSubmit = async () => {
    if (!isRenaming) return;
    const trimmedRenameValue = renameValue.trim();
    if (trimmedRenameValue === "") {
      toast({ title: "Rename Error", description: "Name cannot be empty.", variant: "default" });
      handleRenameCancel();
      return;
    }
    if (trimmedRenameValue === node.name) {
      handleRenameCancel();
      return;
    }
    try {
      if (!currentProjectId) {
        toast({ title: "Error", description: "No project selected", variant: "destructive" });
        return;
      }
      await workspaceFileAPI.renameFile(currentProjectId, node.path, trimmedRenameValue);
      toast({ title: "Renamed", description: `"${node.name}" renamed to "${trimmedRenameValue}".` });
      await onRefreshTree();
    } catch (error) {
      console.error("Rename failed:", error);
      toast({ title: "Rename Failed", description: (error instanceof Error ? error.message : "Could not rename item."), variant: "destructive" });
    } finally {
      setIsRenaming(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); handleRenameSubmit(); }
    else if (e.key === 'Escape') { e.preventDefault(); handleRenameCancel(); }
  };
  
  const handleInputBlur = () => { setTimeout(() => { if (isRenaming) { handleRenameCancel(); } }, 0); };

  const handleDeleteInitiate = createMenuItemHandler(() => setIsDeleteDialogOpen(true));

  const handleDeleteConfirm = async () => {
    try {
      if (!currentProjectId) {
        toast({ title: "Error", description: "No project selected", variant: "destructive" });
        return;
      }
      await workspaceFileAPI.deleteFile(currentProjectId, node.path);
      toast({ title: "Deleted", description: `"${node.name}" has been deleted.` });
      await onRefreshTree();
    } catch (error) {
      console.error("Delete failed:", error);
      toast({ title: "Delete Failed", description: (error instanceof Error ? error.message : "Could not delete item."), variant: "destructive" });
    } finally {
      setIsDeleteDialogOpen(false);
    }
  };
  
  const handleDuplicateInitiate = createMenuItemHandler(async () => {
    try {
      if (!currentProjectId) {
        toast({ title: "Error", description: "No project selected", variant: "destructive" });
        return;
      }
      await workspaceFileAPI.duplicateFile(currentProjectId, node.path, node.type);
      toast({ title: "Duplicated", description: `"${node.name}" was successfully duplicated.` });
      await onRefreshTree();
    } catch (error) {
      console.error("Duplicate failed:", error);
      toast({ title: "Duplicate Failed", description: (error instanceof Error ? error.message : "Could not duplicate item."), variant: "destructive" });
    }
  });

  const handleExpansionFromMenu = createMenuItemHandler(() => handleToggleExpansion());

  const handleCreateNewFileClick = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!currentProjectRoot) {
      toast({ title: "Action Denied", description: "Please open a project to create files.", variant: "destructive"});
      return;
    }
    setNewItemName('untitled.txt');
    setIsCreatingNewItem('file');
  };

  const handleCreateNewFolderClick = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!currentProjectRoot) {
        toast({ title: "Action Denied", description: "Please open a project to create folders.", variant: "destructive" });
        return;
    }
    setNewItemName('NewFolder');
    setIsCreatingNewItem('folder');
  };

  const handleCreateItemConfirm = async () => {
    if (!isCreatingNewItem || !currentProjectRoot) return;

    const trimmedName = newItemName.trim();
    if (trimmedName === "") {
      toast({ title: `Create ${isCreatingNewItem} Error`, description: "Name cannot be empty.", variant: "default" });
      return;
    }

    const cleanName = path.basename(trimmedName);
    if (!cleanName || cleanName === '.' || cleanName === '..') {
        toast({ title: `Invalid ${isCreatingNewItem} Name`, description: "Name is not valid.", variant: "destructive"});
        return;
    }

    try {
      if (!currentProjectId) {
        toast({ title: "Error", description: "No project selected", variant: "destructive" });
        return;
      }

      if (isCreatingNewItem === 'file') {
        await workspaceFileAPI.createFileOrDirectory(currentProjectId, node.path, cleanName, 'file');
        toast({ title: "File Created", description: `File "${cleanName}" created in "${node.name}".` });
        await onRefreshTree();

        const newFileNodePath = path.join(node.path, cleanName);
        const newFileNode: FileSystemNode = {
            id: newFileNodePath,
            name: cleanName,
            type: 'file',
            path: newFileNodePath,
            language: getLanguageForFileClientSide(cleanName),
        };
        onFileNodeSelect(newFileNode, 'default');
      } else if (isCreatingNewItem === 'folder') {
        await workspaceFileAPI.createFileOrDirectory(currentProjectId, node.path, cleanName, 'directory');
        toast({ title: "Folder Created", description: `Folder "${cleanName}" created in "${node.name}".` });
        await onRefreshTree();
      }
    } catch (error) {
      console.error(`Create ${isCreatingNewItem} failed:`, error);
      toast({ title: `Create ${isCreatingNewItem} Failed`, description: (error instanceof Error ? error.message : `Could not create ${isCreatingNewItem}.`), variant: "destructive" });
    } finally {
      setIsCreatingNewItem(null);
      setNewItemName('');
    }
  };


  return (
    <div>
      <DropdownMenu open={isContextMenuOpen} onOpenChange={handleOpenChange}>
        <div
          className={cn(
            "flex items-center justify-between h-8 px-2 py-1 text-sm hover:bg-sidebar-accent hover:text-white w-full rounded-md group",
          )}
          style={{ paddingLeft: `${level * 1 + 0.5}rem` }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onContextMenu={handleContextMenu}
        >
          <DropdownMenuTrigger asChild>
            <div
              className="flex items-center gap-1.5 overflow-hidden flex-grow cursor-default"
              onClick={handlePrimaryAction}
              role="button" 
              tabIndex={0} 
              onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') handlePrimaryAction(e as any); }}
              aria-expanded={node.type === 'folder' ? isOpen : undefined}
              aria-label={node.name}
            >
              {node.type === 'folder' ? (
                isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />
              ) : (
                <span className="w-4 shrink-0" />
              )}
              <FileIcon node={node} className="shrink-0" />
              {isRenaming ? (
                <Input
                  ref={inputRef} type="text" value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={handleInputKeyDown} onBlur={handleInputBlur}
                  onClick={(e) => e.stopPropagation()}
                  className="h-6 px-1 py-0 text-xs flex-grow min-w-0 bg-card border-sidebar-primary ring-1 ring-sidebar-primary"
                />
              ) : ( <span className="truncate">{node.name}</span> )}
            </div>
          </DropdownMenuTrigger>

          {node.type === 'folder' && isHovered && !isRenaming && (
            <div className="flex items-center shrink-0">
              <Button
                variant="ghost" size="icon"
                className="h-6 w-6 p-0.5 text-muted-foreground group-hover:text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                onClick={handleCreateNewFileClick}
                onMouseDown={(e) => e.stopPropagation()} 
                aria-label={`New file in ${node.name}`}
                title={`New file in ${node.name}`}
              >
                <FilePlus2 className="h-4 w-4" />
              </Button>
              <Button
                  variant="ghost" size="icon"
                  className="h-6 w-6 p-0.5 text-muted-foreground group-hover:text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={handleCreateNewFolderClick}
                  onMouseDown={(e) => e.stopPropagation()}
                  aria-label={`New folder in ${node.name}`}
                  title={`New folder in ${node.name}`}
              >
                  <FolderPlus className="h-4 w-4" />
              </Button>
            </div>
          )}
          {node.name === 'Makefile' && isHovered && !isRenaming && (
            <div className="flex items-center shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 p-0.5 text-muted-foreground group-hover:text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onBuildRequest(node);
                }}
                aria-label={`Build ${node.name}`}
                title={`Build ${node.name}`}
              >
                <Hammer className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        <DropdownMenuContent className="w-56" onCloseAutoFocus={(e) => e.preventDefault()}>
          {node.type === 'folder' && (
            <>
              <DropdownMenuItem onClick={createMenuItemHandler(() => handleCreateNewFileClick())} onSelect={(e) => e.preventDefault()}>
                <FilePlus2 className="mr-2 h-4 w-4" /><span>New File</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={createMenuItemHandler(() => handleCreateNewFolderClick())} onSelect={(e) => e.preventDefault()}>
                  <FolderPlus className="mr-2 h-4 w-4" /><span>New Folder</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {(node.language === 'canvas') && node.type === 'file' ? (
            <>
              <DropdownMenuItem onClick={createMenuItemHandler(() => onFileNodeSelect(node, 'viewAsJson'))} onSelect={(e) => e.preventDefault()}>
                <FileJson2 className="mr-2 h-4 w-4" /><span>View in JSON Editor</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={createMenuItemHandler(() => onFileNodeSelect(node, 'editAsJson'))} onSelect={(e) => e.preventDefault()}>
                <FileEdit className="mr-2 h-4 w-4" /><span>Edit in JSON Editor</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={createMenuItemHandler(() => alert("Open this .canvas file in the Architecture view via the Activity Bar."))} onSelect={(e) => e.preventDefault()}>
                <Blocks className="mr-2 h-4 w-4" /><span>Open in Architect View</span>
              </DropdownMenuItem>
            </>
          ) : (node.language === 'emulation') && node.type === 'file' ? (
             <>
              <DropdownMenuItem onClick={createMenuItemHandler(() => onFileNodeSelect(node, 'viewAsJson'))} onSelect={(e) => e.preventDefault()}>
                <FileJson2 className="mr-2 h-4 w-4" /><span>View in JSON Editor</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={createMenuItemHandler(() => onFileNodeSelect(node, 'editAsJson'))} onSelect={(e) => e.preventDefault()}>
                <FileEdit className="mr-2 h-4 w-4" /><span>Edit in JSON Editor</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={createMenuItemHandler(() => alert("Open this .emulation file in the Emulation view via the Activity Bar."))} onSelect={(e) => e.preventDefault()}>
                <Rocket className="mr-2 h-4 w-4" /><span>Open in Emulation View</span>
              </DropdownMenuItem>
            </>
          ) : node.type === 'file' ? (
             <DropdownMenuItem onClick={createMenuItemHandler(() => onFileNodeSelect(node, 'default'))} onSelect={(e) => e.preventDefault()}>
              <FileNodeIcon className="mr-2 h-4 w-4" /><span>Open with default editor</span>
            </DropdownMenuItem>
          ) : null}

          {node.type === 'folder' && (
            <DropdownMenuItem onClick={handleExpansionFromMenu} onSelect={(e) => e.preventDefault()}>
              {isOpen ? <FolderOpen className="mr-2 h-4 w-4" /> : <FolderIcon className="mr-2 h-4 w-4" />}
              <span>{isOpen ? 'Collapse' : 'Expand'}</span>
            </DropdownMenuItem>
          )}
           <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleDuplicateInitiate} onSelect={(e) => e.preventDefault()}>
            <Copy className="mr-2 h-4 w-4" /><span>Duplicate</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleRenameInitiate} onSelect={(e) => e.preventDefault()}>
            <FileEdit className="mr-2 h-4 w-4" /><span>Rename</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDeleteInitiate} className="text-destructive focus:text-destructive focus:bg-destructive/10" onSelect={(e) => e.preventDefault()}>
            <Trash2 className="mr-2 h-4 w-4" /><span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {node.type === 'folder' && isOpen && node.children && (
        <div className="pl-0">
          {node.children.map((child) => (
            <FileExplorerItem key={child.id} node={child} onFileNodeSelect={onFileNodeSelect} onBuildRequest={onBuildRequest} level={level + 1} currentViewMode={currentViewMode} currentUser={currentUser} currentProjectRoot={currentProjectRoot} currentProjectId={currentProjectId} onRefreshTree={onRefreshTree}/>
          ))}
        </div>
      )}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete "{node.name}".
              {node.type === 'folder' && " and all its contents."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className={buttonVariants({ variant: "destructive" })}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!isCreatingNewItem} onOpenChange={(open) => !open && setIsCreatingNewItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create new {isCreatingNewItem}</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a name for the new {isCreatingNewItem} in "{node.name}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateItemConfirm(); } }}
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsCreatingNewItem(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreateItemConfirm}>Create</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export function FileExplorer({ fileTree, onFileNodeSelect, onBuildRequest, className, currentViewMode, currentUser, currentProjectRoot, currentProjectId, onRefreshTree }: FileExplorerProps) {
  return (
    <ScrollArea className={cn("h-full w-full bg-sidebar text-sidebar-foreground", className)}>
      <div className="p-2" style={{ minWidth: 'max-content' }}>
        {fileTree.map((node) => (
          <FileExplorerItem key={node.id} node={node} onFileNodeSelect={onFileNodeSelect} onBuildRequest={onBuildRequest} level={0} currentViewMode={currentViewMode} currentUser={currentUser} currentProjectRoot={currentProjectRoot} currentProjectId={currentProjectId} onRefreshTree={onRefreshTree}/>
        ))}
      </div>
    </ScrollArea>
  );
}

    

    