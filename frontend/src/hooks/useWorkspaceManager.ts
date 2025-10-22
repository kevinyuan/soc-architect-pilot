
"use client";

import * as React from 'react';
import type { FileSystemNode, Language, ProjectListing, CodeViewWorkspaceState, AppSettings } from '@/types/ide';
import path from 'path-browserify';
import { getDirectoryListing, readFileContent, writeFileContent, getProjectListings } from '@/actions/workspace-actions';
import { throttle } from 'lodash';
import { workspaceAPI } from '@/lib/workspace-api';

// Constants for the CodeView's workspace state file (project root)
const CODE_WORKSPACE_FILENAME = "workspace_state.json";

// Constants for App Settings file (project root)
const APP_SETTINGS_FILENAME = "settings.json";


export const getProjectRootLocalStorageKey = (user: string) => `socPilot_currentProjectRoot_${user}`;

// This function might still be useful if other parts of the application need to find nodes
// but it won't be used by CodeView for its primary file opening mechanism if CodeExplorePanel passes the full node.
export function findNodeByPath(nodes: FileSystemNode[], targetPath: string): FileSystemNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) return node;
    if (node.type === 'folder' && node.children) {
      const found = findNodeByPath(node.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

export const getLanguageForFileClientSide = (fileName: string): Language => {
  const extension = path.extname(fileName).toLowerCase();
  switch (extension) {
    case '.c': case '.h': return 'c';
    case '.md': return 'markdown';
    case '.json': return 'json';
    case '.s': case '.asm': return 'assembly';
    case '.sh': case '.bash': return 'shell';
    case '.html': case '.htm': return 'html';
    case '.css': return 'css';
    case '.js': case '.jsx': case '.ts': case '.tsx': return 'javascript';
    case '.py': return 'python';
    case '.canvas': return 'canvas';
    case '.emulation': return 'emulation';
    case '.txt': default: return 'text';
  }
};

interface WorkspaceManagerProps {
  initialUser: string;
  initialProjectRoot?: string | null;
  useBackendAPI?: boolean; // Enable backend API mode
}

export interface UseWorkspaceManagerReturn {
  currentUser: string;
  currentProjectRoot: string | null;
  currentProjectId: string | null; // Backend project ID
  currentProjectName: string | null; // Project display name
  isInitializing: boolean; 

  initializeWorkspace: () => Promise<void>;
  getFileContent: (relativePath: string, projectCtx: string | null) => Promise<string>;
  updateFileContent: (relativePath: string, newContent: string, projectCtx: string | null) => Promise<void>;
  
  getCodeViewWorkspaceState: () => Promise<CodeViewWorkspaceState | null>;
  saveCodeViewWorkspaceState: (state: CodeViewWorkspaceState) => Promise<void>;

  getAppSettings: () => Promise<AppSettings | null>;
  saveAppSettings: (settings: AppSettings) => Promise<void>;

  handleSwitchUser: (newUsername: string) => void;
  handleProjectSelected: (projectPath: string | null, projectName?: string | null) => void;
  handleCloseWorkspace: () => void;
  getAvailableProjects: () => Promise<ProjectListing[]>;
  
  // Backend API methods
  createProject: (name: string, description?: string) => Promise<any>;
  deleteProject: (projectId: string) => Promise<void>;
  duplicateProject: (projectId: string, newName: string) => Promise<any>;
  updateProjectName: (newName: string) => Promise<void>;
}

export function useWorkspaceManager({
  initialUser,
  initialProjectRoot: serverInitialProjectRoot = null,
  useBackendAPI = false,
}: WorkspaceManagerProps): UseWorkspaceManagerReturn {
  const [currentUser, setCurrentUserInternal] = React.useState<string>(initialUser);
  const [currentProjectRoot, setCurrentProjectRootInternal] = React.useState<string | null>(serverInitialProjectRoot);
  const [currentProjectId, setCurrentProjectId] = React.useState<string | null>(null);
  const [currentProjectName, setCurrentProjectName] = React.useState<string | null>(null);

  const [isInitializing, setIsInitializing] = React.useState(true); 
  
  const initialClientSetupDoneRef = React.useRef(false);

  const setCurrentProjectRootAndPersist = React.useCallback((projectRootToSet: string | null) => {
    setCurrentProjectRootInternal(projectRootToSet);
    if (typeof window !== 'undefined') {
      const key = getProjectRootLocalStorageKey(currentUser);
      if (projectRootToSet) {
        localStorage.setItem(key, projectRootToSet);
      } else {
        localStorage.removeItem(key);
      }
    }
  }, [currentUser]);

  React.useEffect(() => {
    if (typeof window !== 'undefined' && !initialClientSetupDoneRef.current) {
      const storedProjectRoot = localStorage.getItem(getProjectRootLocalStorageKey(currentUser));
      if (storedProjectRoot !== currentProjectRoot) {
         setCurrentProjectRootInternal(storedProjectRoot);

         // If the stored project root is a UUID (project ID), also set currentProjectId and fetch name
         if (storedProjectRoot && storedProjectRoot.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
           setCurrentProjectId(storedProjectRoot);

           // Fetch project name from backend if useBackendAPI is enabled
           if (useBackendAPI) {
             workspaceAPI.getProject(storedProjectRoot)
               .then(project => {
                 setCurrentProjectName(project.name);

                 // Update userId from project for proper S3 path
                 if (project.userId && project.userId !== currentUser) {
                   console.log('[WorkspaceManager] Updating userId from restored project:', project.userId);
                   setCurrentUserInternal(project.userId);
                 }
               })
               .catch(error => {
                 // If project not found (deleted by admin or user), silently clear all project context
                 if (error.code === 'NOT_FOUND_ERROR' || error.message?.includes('not found')) {
                   console.warn('[WorkspaceManager] Project no longer exists (likely deleted), clearing all project context');

                   // Clear all project-related state
                   setCurrentProjectRootAndPersist(null);
                   setCurrentProjectId(null);
                   setCurrentProjectName(null);

                   // Don't show error to user - they'll just see the home screen
                   // This is expected behavior when admin deletes a project
                 } else {
                   // For other errors, log but don't crash
                   console.error('[WorkspaceManager] Failed to fetch project details:', error);
                   setCurrentProjectName(null);
                 }
               });
           }
         }
      }
      initialClientSetupDoneRef.current = true;
      setIsInitializing(false); // Initial local storage check is part of initialization
    } else if (initialClientSetupDoneRef.current) {
      setIsInitializing(false); // If already done, not initializing
    }
  }, [currentUser, currentProjectRoot, useBackendAPI]); 

  const initializeWorkspace = React.useCallback(async () => {
    if (!initialClientSetupDoneRef.current) { 
        await new Promise(resolve => setTimeout(resolve, 0)); 
    }
    setIsInitializing(true); 
    console.log(`[WorkspaceManager] Workspace context initialized for user: ${currentUser}, project: ${currentProjectRoot || 'root'}`);
    setIsInitializing(false);
  }, [currentUser, currentProjectRoot]);


  React.useEffect(() => {
    if (initialClientSetupDoneRef.current && isInitializing) {
      initializeWorkspace();
    }
  }, [initializeWorkspace, isInitializing]);


  const getFileContent = React.useCallback(async (
    relativePath: string,
    projectCtx: string | null
  ): Promise<string> => {
    if (!currentProjectId) throw new Error("Project ID is required for file operations");
    return readFileContent(currentProjectId, relativePath);
  }, [currentProjectId]);

  const updateFileContent = React.useCallback(async (
    relativePath: string,
    newContent: string,
    projectCtx: string | null
  ): Promise<void> => {
    if (!currentProjectId) throw new Error("Project ID is required for file operations");
    await writeFileContent(currentProjectId, relativePath, newContent);
  }, [currentProjectId]);


  const getCodeViewWorkspaceState = React.useCallback(async (): Promise<CodeViewWorkspaceState | null> => {
    if (!currentProjectId) return null;
    try {
      const content = await readFileContent(currentProjectId, CODE_WORKSPACE_FILENAME);
      return JSON.parse(content) as CodeViewWorkspaceState;
    } catch (error) {
      return null;
    }
  }, [currentProjectId]);

  const throttledSaveCodeViewWorkspaceState = React.useMemo(
    () => throttle(async (projectIdToSave: string, state: CodeViewWorkspaceState) => {
      if (!projectIdToSave) return;
      try {
        await writeFileContent(projectIdToSave, CODE_WORKSPACE_FILENAME, JSON.stringify(state, null, 2));
      } catch (error) {
        console.error("Failed to save CodeView workspace state:", error);
      }
    }, 1000),
    []
  );

  const saveCodeViewWorkspaceState = React.useCallback(async (state: CodeViewWorkspaceState) => {
    if (!currentProjectId) return;
    throttledSaveCodeViewWorkspaceState(currentProjectId, state);
  }, [currentProjectId, throttledSaveCodeViewWorkspaceState]);

  const getAppSettings = React.useCallback(async (): Promise<AppSettings | null> => {
    if (!currentProjectId) {
        // console.warn("Cannot get app settings: ProjectId not defined.");
        return null;
    }
    try {
      const content = await readFileContent(currentProjectId, APP_SETTINGS_FILENAME);
      return JSON.parse(content) as AppSettings;
    } catch (error) {
      // console.warn(`App settings file not found or invalid for project ${currentProjectId}:`, error);
      return null;
    }
  }, [currentProjectId]);

  const throttledSaveAppSettings = React.useMemo(
    () => throttle(async (projectIdToSave: string, settings: AppSettings) => {
      if (!projectIdToSave) {
        console.warn("Cannot save app settings: ProjectId not defined.");
        return;
      }
      try {
        await writeFileContent(projectIdToSave, APP_SETTINGS_FILENAME, JSON.stringify(settings, null, 2));
      } catch (error) {
        console.error("Failed to save app settings for project:", projectIdToSave, error);
      }
    }, 1000),
    []
  );

  const saveAppSettings = React.useCallback(async (settings: AppSettings) => {
    if (!currentProjectId) {
      console.warn("Cannot save app settings: ProjectId not defined. Settings will not be persisted.");
      return;
    }
    throttledSaveAppSettings(currentProjectId, settings);
  }, [currentProjectId, throttledSaveAppSettings]);


  const handleSwitchUser = React.useCallback((newUsername: string) => {
    if (currentUser === newUsername) return;
    initialClientSetupDoneRef.current = false; 
    setIsInitializing(true); 
    setCurrentUserInternal(newUsername);
    setCurrentProjectRootInternal(null); 
    if (typeof window !== 'undefined') {
      localStorage.removeItem(getProjectRootLocalStorageKey(currentUser)); 
    }
  }, [currentUser]);

  const handleProjectSelected = React.useCallback(async (projectPath: string | null, projectName?: string | null) => {
    if (currentProjectRoot === projectPath) return;
    setIsInitializing(true);

    console.log('[WorkspaceManager] handleProjectSelected called:', { projectPath, projectName, useBackendAPI });

    // If projectPath looks like a UUID, it's a project ID
    if (projectPath && projectPath.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      setCurrentProjectId(projectPath);

      // Use provided project name if available, otherwise try to fetch from backend
      if (projectName) {
        console.log('[WorkspaceManager] Using provided project name:', projectName);
        setCurrentProjectName(projectName);
        setCurrentProjectRootAndPersist(projectPath);

        // Fetch userId from project for proper S3 path
        if (useBackendAPI) {
          try {
            const project = await workspaceAPI.getProject(projectPath);
            if (project.userId && project.userId !== currentUser) {
              console.log('[WorkspaceManager] Updating userId from project:', project.userId);
              setCurrentUserInternal(project.userId);
            }
          } catch (error: any) {
            // If project not found (deleted), don't set the project
            if (error.code === 'NOT_FOUND_ERROR') {
              console.warn('[WorkspaceManager] Project no longer exists, aborting selection');
              return; // Don't proceed with project selection
            }
            console.warn('[WorkspaceManager] Failed to fetch userId from project:', error);
          }
        }
      } else if (useBackendAPI) {
        console.log('[WorkspaceManager] Fetching project name from backend...');
        try {
          const project = await workspaceAPI.getProject(projectPath);
          console.log('[WorkspaceManager] Fetched project from backend:', project);
          setCurrentProjectName(project.name);
          setCurrentProjectRootAndPersist(projectPath);

          // Update userId from project for proper S3 path
          if (project.userId && project.userId !== currentUser) {
            console.log('[WorkspaceManager] Updating userId from project:', project.userId);
            setCurrentUserInternal(project.userId);
          }
        } catch (error: any) {
          // If project not found (deleted), clear project context
          if (error.code === 'NOT_FOUND_ERROR') {
            console.warn('[WorkspaceManager] Project no longer exists, clearing project context');
            setCurrentProjectRootAndPersist(null);
            setCurrentProjectId(null);
            setCurrentProjectName(null);
            return; // Don't proceed
          }
          console.error('Failed to fetch project details:', error);
          setCurrentProjectName(projectPath); // Fallback to ID
          setCurrentProjectRootAndPersist(projectPath);
        }
      } else {
        console.log('[WorkspaceManager] No project name available (useBackendAPI is false)');
        setCurrentProjectName(null);
        setCurrentProjectRootAndPersist(projectPath);
      }
    } else {
      setCurrentProjectId(null);
      setCurrentProjectName(null);
      setCurrentProjectRootAndPersist(projectPath);
    }

    setIsInitializing(false);
  }, [currentProjectRoot, useBackendAPI, setCurrentProjectRootAndPersist]);

  const handleCloseWorkspace = React.useCallback(() => {
    if (currentProjectRoot === null) return;
    setIsInitializing(true);
    setCurrentProjectId(null);
    setCurrentProjectName(null);
    setCurrentProjectRootAndPersist(null);
    setIsInitializing(false);
  }, [currentProjectRoot, setCurrentProjectRootAndPersist]);

  const getAvailableProjects = React.useCallback(async (): Promise<ProjectListing[]> => {
    if (!currentUser) return [];
    
    if (useBackendAPI) {
      try {
        const projects = await workspaceAPI.listProjects();
        // Convert backend projects to ProjectListing format
        return projects.map(p => ({
          name: p.name,
          path: p.id, // Use ID as path for backend projects
          lastModified: new Date(p.lastModified),
          createdAt: new Date(p.createdAt),
        }));
      } catch (error) {
        console.error("Failed to fetch projects from backend:", error);
        // Fallback to local
        return await getProjectListings(currentUser);
      }
    }
    
    try {
      return await getProjectListings(currentUser);
    } catch (error) {
      console.error("Failed to fetch project listings:", error);
      return [];
    }
  }, [currentUser, useBackendAPI]);

  // Backend API methods
  const createProject = React.useCallback(async (name: string, description?: string) => {
    if (!useBackendAPI) {
      throw new Error("Backend API not enabled");
    }

    const project = await workspaceAPI.createProject({ name, description });
    setCurrentProjectId(project.id);
    setCurrentProjectName(project.name);
    setCurrentProjectRootAndPersist(project.id);

    // Update userId from newly created project for proper S3 path
    if (project.userId && project.userId !== currentUser) {
      console.log('[WorkspaceManager] Updating userId from created project:', project.userId);
      setCurrentUserInternal(project.userId);
    }

    return project;
  }, [useBackendAPI, currentUser, setCurrentProjectRootAndPersist]);

  const deleteProject = React.useCallback(async (projectId: string) => {
    if (!useBackendAPI) {
      throw new Error("Backend API not enabled");
    }

    await workspaceAPI.deleteProject(projectId);

    // If deleting current project, clear it
    if (currentProjectId === projectId) {
      setCurrentProjectId(null);
      setCurrentProjectName(null);
      setCurrentProjectRootAndPersist(null);
    }
  }, [useBackendAPI, currentProjectId, setCurrentProjectRootAndPersist]);

  const duplicateProject = React.useCallback(async (projectId: string, newName: string) => {
    if (!useBackendAPI) {
      throw new Error("Backend API not enabled");
    }
    
    return await workspaceAPI.duplicateProject(projectId, newName);
  }, [useBackendAPI]);

  const updateProjectName = React.useCallback(async (newName: string) => {
    if (!useBackendAPI || !currentProjectId) {
      throw new Error("Backend API not enabled or no project selected");
    }
    
    // Update project name via API
    await workspaceAPI.updateProject(currentProjectId, { name: newName });
    
    // Update local state
    setCurrentProjectName(newName);
  }, [useBackendAPI, currentProjectId]);

  return {
    currentUser,
    currentProjectRoot,
    currentProjectId,
    currentProjectName,
    isInitializing,
    initializeWorkspace,
    getFileContent,
    updateFileContent,
    getCodeViewWorkspaceState,
    saveCodeViewWorkspaceState,
    getAppSettings,
    saveAppSettings,
    handleSwitchUser,
    handleProjectSelected,
    handleCloseWorkspace,
    getAvailableProjects,
    createProject,
    deleteProject,
    duplicateProject,
    updateProjectName,
  };
}
