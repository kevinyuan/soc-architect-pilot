
"use client";

import * as React from 'react';
import { EditorTabs } from './EditorTabs';
import type { OpenFile, FileSystemNode, Language, ViewMode, CodeViewWorkspaceState, AppSettings } from '@/types/ide';
import { getLanguageForFileClientSide } from '@/hooks/useWorkspaceManager';
import { CodeBottomPanel } from './CodeBottomPanel';
import { CodeRightPanel } from './CodeRightPanel';
import { CodeExplorePanel } from './CodeExplorePanel';
import { cn } from '@/lib/utils';
import path from 'path-browserify';
import { useToast } from '@/hooks/use-toast';
import { getDirectoryListing } from '@/actions/workspace-actions';
import { useTerminal } from '@/hooks/useTerminalContext';

export interface CodeViewHandles {
  toggleExplorerPanel: () => void;
  toggleBottomPanel: () => void;
  toggleRightPanel: () => void;
}

const MIN_EDITOR_WIDTH = 200;
const MIN_PANEL_WIDTH = 150;
const MAX_PANEL_WIDTH_PERCENT = 0.5; // Max 50% of total width for side panels
const DEFAULT_SIDE_PANEL_WIDTH = 288; // Corresponds to w-72 in Tailwind

const MIN_EDITOR_HEIGHT = 100;
const MIN_BOTTOM_PANEL_HEIGHT = 80; // e.g., 5rem if 1rem = 16px
const MAX_BOTTOM_PANEL_HEIGHT_PERCENT = 0.7; // Max 70% of code view height
const DEFAULT_BOTTOM_PANEL_HEIGHT = 256; // Corresponds to h-64

interface CodeViewProps {
  currentUser: string;
  currentProjectRoot: string | null;
  projectId?: string;
  getCodeViewWorkspaceState: () => Promise<CodeViewWorkspaceState | null>;
  saveCodeViewWorkspaceState: (state: CodeViewWorkspaceState) => Promise<void>;
  getFileContent: (relativePath: string, projectCtx: string | null) => Promise<string>;
  updateFileContent: (relativePath: string, newContent: string, projectCtx: string | null) => Promise<void>;
  activeBottomTab: string;
  setActiveBottomTab: (tab: string) => void;
  currentViewMode: ViewMode;
  appSettings: AppSettings | null;
}

export const CodeView = React.forwardRef<CodeViewHandles, CodeViewProps>(
  ({
    currentUser,
    currentProjectRoot,
    projectId,
    getCodeViewWorkspaceState,
    saveCodeViewWorkspaceState,
    getFileContent,
    updateFileContent,
    activeBottomTab,
    setActiveBottomTab,
    currentViewMode,
    appSettings,
  }, ref) => {
    const [openFiles, setOpenFiles] = React.useState<OpenFile[]>([]);
    const [activeFileId, setActiveFileId] = React.useState<string | null>(null);
    const { toast } = useToast();
    const codeViewRef = React.useRef<HTMLDivElement>(null);
    const { sendTerminalCommand, destroyTerminal } = useTerminal();

    // Panel visibility states
    const [explorerPanelOpen, setExplorerPanelOpen] = React.useState(true);
    const [bottomPanelOpen, setBottomPanelOpen] = React.useState(false); 
    const [rightPanelOpen, setRightPanelOpen] = React.useState(true); 

    // Panel dimension states
    const [leftPanelWidth, setLeftPanelWidth] = React.useState(DEFAULT_SIDE_PANEL_WIDTH);
    const [rightPanelWidth, setRightPanelWidth] = React.useState(DEFAULT_SIDE_PANEL_WIDTH);
    const [bottomPanelHeight, setBottomPanelHeight] = React.useState(DEFAULT_BOTTOM_PANEL_HEIGHT);

    // Resizing states
    const [isResizingLeftPanel, setIsResizingLeftPanel] = React.useState(false);
    const [isResizingRightPanel, setIsResizingRightPanel] = React.useState(false);
    const [isResizingBottomPanel, setIsResizingBottomPanel] = React.useState(false);
    
    const [fileTree, setFileTree] = React.useState<FileSystemNode[]>([]);
    const [isFileTreeLoading, setIsFileTreeLoading] = React.useState(true); 
    const lastProcessedFileTreeContextRef = React.useRef<string | null>(null);

    React.useImperativeHandle(ref, () => ({
      toggleExplorerPanel: () => setExplorerPanelOpen(prev => !prev),
      toggleBottomPanel: () => setBottomPanelOpen(prev => !prev),
      toggleRightPanel: () => setRightPanelOpen(prev => !prev),
    }));

    // Keyboard shortcut handler for Ctrl/Cmd+S
    React.useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        // Check for Ctrl+S (Windows/Linux) or Cmd+S (Mac)
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault(); // Prevent browser's default save dialog
          
          // Save the currently active file
          if (activeFileId) {
            const activeFile = openFiles.find(f => f.id === activeFileId);
            if (activeFile && !activeFile.isReadOnly && activeFile.projectContext === currentProjectRoot) {
              // File is already auto-saved on content change, so just show a toast
              toast({
                title: "File Saved",
                description: `${activeFile.name} saved successfully`,
                duration: 2000,
              });
            }
          }
        }
      };

      // Add event listener
      window.addEventListener('keydown', handleKeyDown);

      // Cleanup
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }, [activeFileId, openFiles, currentProjectRoot, toast]);

    // Mouse move handler for resizing (now handles all panels)
    React.useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
        if (!codeViewRef.current) return;
        const codeViewRect = codeViewRef.current.getBoundingClientRect();

        if (isResizingLeftPanel) {
          const newWidth = e.clientX - codeViewRect.left;
          const maxPanelWidth = codeViewRect.width * MAX_PANEL_WIDTH_PERCENT;
          const editorAreaMinWidth = MIN_EDITOR_WIDTH;
          const availableWidthForEditor = codeViewRect.width - (rightPanelOpen ? rightPanelWidth : 0);
          
          let constrainedWidth = Math.max(MIN_PANEL_WIDTH, newWidth);
          constrainedWidth = Math.min(constrainedWidth, maxPanelWidth);
          constrainedWidth = Math.min(constrainedWidth, availableWidthForEditor - editorAreaMinWidth);
          
          setLeftPanelWidth(constrainedWidth);
        } else if (isResizingRightPanel) {
          const newWidth = codeViewRect.right - e.clientX;
          const maxPanelWidth = codeViewRect.width * MAX_PANEL_WIDTH_PERCENT;
          const editorAreaMinWidth = MIN_EDITOR_WIDTH;
          const availableWidthForEditor = codeViewRect.width - (explorerPanelOpen ? leftPanelWidth : 0);

          let constrainedWidth = Math.max(MIN_PANEL_WIDTH, newWidth);
          constrainedWidth = Math.min(constrainedWidth, maxPanelWidth);
          constrainedWidth = Math.min(constrainedWidth, availableWidthForEditor - editorAreaMinWidth);

          setRightPanelWidth(constrainedWidth);
        } else if (isResizingBottomPanel) {
          const newHeight = codeViewRect.bottom - e.clientY;
          const maxPanelHeight = codeViewRect.height * MAX_BOTTOM_PANEL_HEIGHT_PERCENT;
          
          let constrainedHeight = Math.max(MIN_BOTTOM_PANEL_HEIGHT, newHeight);
          constrainedHeight = Math.min(constrainedHeight, maxPanelHeight);
          constrainedHeight = Math.min(constrainedHeight, codeViewRect.height - MIN_EDITOR_HEIGHT);
          
          setBottomPanelHeight(constrainedHeight);
        }
      };

      const handleMouseUp = () => {
        setIsResizingLeftPanel(false);
        setIsResizingRightPanel(false);
        setIsResizingBottomPanel(false);
        document.body.style.cursor = ''; 
        document.body.style.userSelect = '';
      };

      if (isResizingLeftPanel || isResizingRightPanel || isResizingBottomPanel) {
        document.body.style.cursor = isResizingBottomPanel ? 'ns-resize' : 'ew-resize';
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
    }, [isResizingLeftPanel, isResizingRightPanel, isResizingBottomPanel, leftPanelWidth, rightPanelWidth, explorerPanelOpen, rightPanelOpen]);


    const handleMouseDownOnLeftResizer = (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizingLeftPanel(true);
    };
    const handleMouseDownOnRightResizer = (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizingRightPanel(true);
    };
    const handleMouseDownOnBottomResizer = (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizingBottomPanel(true);
    };
    
    const generateFileId = (filePath: string, projectCtx: string | null): string => {
      return projectCtx ? `project:${projectCtx}:${filePath}` : `userRoot:${currentUser}:${filePath}`;
    };

    const fetchFileTreeForCodeView = React.useCallback(async () => {
      const currentContext = currentProjectRoot ? `${currentUser}:${currentProjectRoot}` : (currentUser || null);

      if (currentViewMode !== 'code') {
        if (lastProcessedFileTreeContextRef.current !== currentContext) {
            setFileTree([]);
            lastProcessedFileTreeContextRef.current = null; 
        }
        setIsFileTreeLoading(false);
        return;
      }

      if (currentContext === null) { 
        setFileTree([]);
        lastProcessedFileTreeContextRef.current = null;
        setIsFileTreeLoading(false);
        return;
      }

      if (isFileTreeLoading && lastProcessedFileTreeContextRef.current === currentContext) {
        return; 
      }
      if (!isFileTreeLoading && lastProcessedFileTreeContextRef.current === currentContext && fileTree.length > 0) {
        return;
      }
      if (!isFileTreeLoading && lastProcessedFileTreeContextRef.current === currentContext && fileTree.length === 0) {
          if (currentProjectRoot !== null || (currentProjectRoot === null && currentUser !== null)) { 
            return; 
          }
      }
      
      if (lastProcessedFileTreeContextRef.current !== null && lastProcessedFileTreeContextRef.current !== currentContext) {
          setFileTree([]);
      }

      setIsFileTreeLoading(true);
      try {
        if (!projectId) {
          console.warn('[CodeView] No projectId available for loading file tree');
          setFileTree([]);
          return;
        }
        const tree = await getDirectoryListing(projectId, '');
        setFileTree(tree);
      } catch (error) {
        console.error(`Failed to load file tree for user ${currentUser} (project: ${currentProjectRoot}):`, error);
        toast({
          title: "Error Loading Files",
          description: (error instanceof Error ? error.message : "Could not fetch file listing."),
          variant: "destructive",
        });
        setFileTree([]);
      } finally {
        lastProcessedFileTreeContextRef.current = currentContext;
        setIsFileTreeLoading(false);
      }
    }, [currentUser, currentProjectRoot, currentViewMode, toast, isFileTreeLoading, fileTree.length]); 

    React.useEffect(() => {
      fetchFileTreeForCodeView();
    }, [fetchFileTreeForCodeView]); 

    React.useEffect(() => {
      if (!currentProjectRoot && openFiles.length > 0) {
        setOpenFiles([]);
        setActiveFileId(null);
      }
    }, [currentProjectRoot, openFiles.length]);


    React.useEffect(() => {
      if (!currentProjectRoot || !currentUser) { 
        setOpenFiles([]);
        setActiveFileId(null);
        return;
      }

      const loadState = async () => {
        try {
          const state = await getCodeViewWorkspaceState();
          if (state) {
            const newOpenFiles: OpenFile[] = [];
            if (state.openCodeEditorPaths && state.openCodeEditorPaths.length > 0) {
              for (const relPath of state.openCodeEditorPaths) {
                const fileName = path.basename(relPath);
                const lang = getLanguageForFileClientSide(fileName);
                const fileId = generateFileId(relPath, currentProjectRoot);

                const existingFile = openFiles.find(f => f.id === fileId);
                if (existingFile && existingFile.content !== undefined && existingFile.projectContext === currentProjectRoot) {
                   newOpenFiles.push(existingFile);
                   continue;
                }

                newOpenFiles.push({
                  id: fileId,
                  name: fileName,
                  path: relPath,
                  language: lang,
                  projectContext: currentProjectRoot, 
                  type: 'file',
                  isLoading: true,
                });
              }
              setOpenFiles(newOpenFiles); 

              newOpenFiles.forEach(async (fileToLoad) => {
                if (fileToLoad.isLoading) { 
                  try {
                    const content = await getFileContent(fileToLoad.path, fileToLoad.projectContext);
                    setOpenFiles(prev => prev.map(f => f.id === fileToLoad.id ? { ...f, content, isLoading: false } : f));
                  } catch (e) {
                    console.error(`Failed to load content for ${fileToLoad.name}:`, e);
                    toast({ title: `Error loading ${fileToLoad.name}`, description: (e as Error).message, variant: 'destructive' });
                    setOpenFiles(prev => prev.map(f => f.id === fileToLoad.id ? { ...f, content: `// Error loading file: ${(e as Error).message}`, isLoading: false, isReadOnly: true } : f));
                  }
                }
              });
            } else {
               setOpenFiles([]); 
            }

            if (state.activeCodeEditorPath) {
              setActiveFileId(generateFileId(state.activeCodeEditorPath, currentProjectRoot));
            } else if (newOpenFiles.length > 0) {
              setActiveFileId(newOpenFiles[0].id);
            } else {
              setActiveFileId(null);
            }
          } else { 
            setOpenFiles([]);
            setActiveFileId(null);
          }
        } catch (error) {
          console.error("Failed to load CodeView workspace state:", error);
          toast({ title: "Error", description: "Could not load editor workspace state.", variant: "destructive" });
          setOpenFiles([]);
          setActiveFileId(null);
        }
      };
      loadState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentProjectRoot, currentUser]); 

    React.useEffect(() => {
      if (!currentProjectRoot || !currentUser) return; 
      const stateToSave: CodeViewWorkspaceState = {
        openCodeEditorPaths: openFiles
          .filter(f => f.projectContext === currentProjectRoot) 
          .map(f => f.path),
        activeCodeEditorPath: activeFileId ? openFiles.find(f => f.id === activeFileId && f.projectContext === currentProjectRoot)?.path : null,
      };
      saveCodeViewWorkspaceState(stateToSave);
    }, [openFiles, activeFileId, currentProjectRoot, currentUser, saveCodeViewWorkspaceState]);

    const handleOpenFileFromExplorer = React.useCallback(
      (node: FileSystemNode, action: 'default' | 'viewAsJson' | 'editAsJson' = 'default') => {
        if (node.type === 'folder' || !node.language || !currentProjectRoot) { 
            if (!currentProjectRoot && node.type === 'file') {
                toast({ title: "Action Required", description: "Please open a project to edit files.", variant: "default" });
            }
            return;
        }

        const filePath = node.path;
        const fileId = generateFileId(filePath, currentProjectRoot);

        let effectiveLanguage = node.language;
        let isReadOnly = false;
        let contentPrefix = "";

        const isSpecialJsonView = (node.language === 'canvas' || node.language === 'emulation') && (action === 'viewAsJson' || action === 'editAsJson');

        if (isSpecialJsonView) {
          effectiveLanguage = 'json';
          if (action === 'viewAsJson') {
              isReadOnly = true;
              contentPrefix = `// Read-only JSON view of ${node.name}\n`;
          } else {
              contentPrefix = `// Editable JSON view of ${node.name}\n`;
          }
        }


        const existingFile = openFiles.find(f => f.id === fileId);
        if (existingFile) {
          setActiveFileId(fileId);
        } else {
          const newFileEntry: OpenFile = {
            id: fileId,
            name: node.name,
            path: filePath,
            projectContext: currentProjectRoot, 
            language: effectiveLanguage,
            type: 'file',
            isLoading: true,
            isReadOnly: isReadOnly,
          };
          setOpenFiles(prev => [...prev, newFileEntry]);
          setActiveFileId(fileId);

          getFileContent(filePath, currentProjectRoot)
            .then(content => {
              setOpenFiles(prev => prev.map(f => f.id === fileId ? { ...f, content: contentPrefix + content, isLoading: false } : f));
            })
            .catch(e => {
              console.error(`Failed to load content for ${node.name}:`, e);
              toast({ title: `Error loading ${node.name}`, description: (e as Error).message, variant: 'destructive' });
              setOpenFiles(prev => prev.map(f => f.id === fileId ? { ...f, content: `// Error loading file: ${(e as Error).message}`, isLoading: false, isReadOnly: true } : f));
            });
        }
      },
      [currentProjectRoot, openFiles, getFileContent, toast, currentUser] 
    );

    const handleFileSelectInTabs = React.useCallback((fileId: string) => {
      setActiveFileId(fileId);
    }, []);

    const handleFileClose = React.useCallback((fileId: string) => {
      setOpenFiles(prev => {
        const newFiles = prev.filter(f => f.id !== fileId);
        if (activeFileId === fileId) {
          setActiveFileId(newFiles.length > 0 ? newFiles[0].id : null);
        }
        return newFiles;
      });
    }, [activeFileId]);

    const handleFileContentChange = React.useCallback((fileId: string, newContent: string) => {
      const fileToUpdate = openFiles.find(f => f.id === fileId);
      if (fileToUpdate && fileToUpdate.projectContext === currentProjectRoot && !fileToUpdate.isReadOnly) {
        setOpenFiles(prev => prev.map(f => f.id === fileId ? { ...f, content: newContent } : f));
        updateFileContent(fileToUpdate.path, newContent, fileToUpdate.projectContext)
          .catch(e => {
            console.error(`Failed to save content for ${fileToUpdate.name}:`, e);
            toast({ title: `Error saving ${fileToUpdate.name}`, description: (e as Error).message, variant: 'destructive' });
          });
      }
    }, [openFiles, updateFileContent, toast, currentProjectRoot]);

    const activeFileForAI = React.useMemo(() => {
      return openFiles.find(f => f.id === activeFileId && f.projectContext === currentProjectRoot);
    }, [openFiles, activeFileId, currentProjectRoot]);

    const handleApplyAiSuggestionToEditor = React.useCallback((newCode: string) => {
      if (activeFileForAI && !activeFileForAI.isReadOnly) {
        handleFileContentChange(activeFileForAI.id, newCode);
      } else {
        toast({
          title: "Cannot Apply Suggestion",
          description: "No active writable file or suggestion is not applicable.",
          variant: "destructive",
        });
      }
    }, [activeFileForAI, handleFileContentChange, toast]);

    const handleRefreshFileTree = React.useCallback(async () => {
      if (isFileTreeLoading) return;
      lastProcessedFileTreeContextRef.current = null; 
      await fetchFileTreeForCodeView();
    }, [isFileTreeLoading, fetchFileTreeForCodeView]);

    const handleBuildRequest = React.useCallback((node: FileSystemNode) => {
      if (!currentProjectRoot) {
        toast({
          title: "Build Error",
          description: "Cannot start build. No project is currently open.",
          variant: "destructive",
        });
        return;
      }
      
      const makefileDir = path.dirname(node.path);
      const command = `cd /workspace/${currentProjectRoot}/${makefileDir} && make\n`;

      // Ensure terminal is visible and send command
      setBottomPanelOpen(true);
      setActiveBottomTab('terminal');
      
      // Use a short delay to allow the terminal view to potentially render/mount
      setTimeout(() => {
        sendTerminalCommand('code_view', command);
      }, 200);

    }, [currentProjectRoot, toast, sendTerminalCommand, setActiveBottomTab]);


    if (!currentProjectRoot && currentViewMode === 'code') {
        return (
            <div className="flex flex-1 overflow-hidden h-full relative items-center justify-center text-muted-foreground">
                <p>Please open a project to view and edit files.</p>
            </div>
        );
    }

    return (
        <div ref={codeViewRef} className="flex flex-1 overflow-hidden h-full relative">
          {explorerPanelOpen && (
            <div
              style={{ width: `${leftPanelWidth}px` }}
              className={cn(
                "flex-shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col min-h-0"
              )}
            >
              <CodeExplorePanel
                fileTree={fileTree}
                isFileTreeLoading={isFileTreeLoading}
                onRefreshTree={handleRefreshFileTree}
                onFileNodeSelect={handleOpenFileFromExplorer}
                currentProjectRoot={currentProjectRoot}
                currentProjectId={projectId}
                currentUser={currentUser}
                currentViewMode={currentViewMode}
                onBuildRequest={handleBuildRequest}
              />
            </div>
          )}

          {/* Left Panel Resizer */}
          {explorerPanelOpen && (
            <div
              className="w-1.5 cursor-ew-resize bg-transparent transition-colors duration-150 flex-shrink-0"
              onMouseDown={handleMouseDownOnLeftResizer}
              title="Resize Explorer Panel"
            />
          )}

          <div className="flex-1 flex flex-col overflow-hidden min-h-0 relative min-w-0"> {/* Editor and Bottom Panel */}
            <div className="flex-grow overflow-auto"> {/* Editor Tabs Area */}
              <EditorTabs
                openFiles={openFiles.filter(f => f.projectContext === currentProjectRoot)} 
                activeFileId={activeFileId}
                onFileSelect={handleFileSelectInTabs}
                onFileClose={handleFileClose}
                onFileContentChange={handleFileContentChange}
              />
            </div>
            {/* Bottom Panel Resizer */}
            {bottomPanelOpen && (
              <div
                className="h-1.5 cursor-ns-resize bg-transparent transition-colors duration-150 w-full flex-shrink-0"
                onMouseDown={handleMouseDownOnBottomResizer}
                title="Resize Bottom Panel"
              />
            )}
            {bottomPanelOpen && (
              <div style={{ height: `${bottomPanelHeight}px` }} className="flex-shrink-0">
                <CodeBottomPanel
                  activeBottomTab={activeBottomTab}
                  setActiveBottomTab={setActiveBottomTab}
                  appSettings={appSettings}
                  currentProjectRoot={currentProjectRoot}
                />
              </div>
            )}
          </div>

          {/* Right Panel Resizer */}
          {rightPanelOpen && (
            <div
              className="w-1.5 cursor-ew-resize bg-transparent transition-colors duration-150 flex-shrink-0"
              onMouseDown={handleMouseDownOnRightResizer}
              title="Resize AI Assistant Panel"
            />
          )}

          {rightPanelOpen && ( 
            <div 
              style={{ width: `${rightPanelWidth}px` }}
              className="flex-shrink-0 bg-sidebar text-sidebar-foreground h-full flex flex-col"
            >
              <CodeRightPanel
                activeFile={activeFileForAI}
                isRightPanelOpen={rightPanelOpen}
                onToggle={() => setRightPanelOpen(prev => !prev)}
                onApplyCodeSuggestion={handleApplyAiSuggestionToEditor}
                projectId={projectId}
              />
            </div>
          )}
        </div>
    );
  }
);
CodeView.displayName = "CodeView";

