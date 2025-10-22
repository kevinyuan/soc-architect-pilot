
"use client";

import * as React from 'react';
import dynamic from 'next/dynamic';
import path from 'path-browserify';
import { AppHeader } from './AppHeader';
import { AppStatusBar } from './AppStatusBar';
import { ActivityBar } from './ActivityBar';
import { HomeViewV2 } from './HomeViewV2';
import type { Language, ViewMode, CanvasFileFormat, CanvasFileFormatNode, AppSettings } from '@/types/ide';
import type { ArchitectViewHandles } from './ArchitectView';
import type { CodeViewHandles } from './CodeView';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

import { useWorkspaceManager } from '@/hooks/useWorkspaceManager';
import { useViewManager } from '@/hooks/useViewManager';
import { ContainerProvider, ContainerActions } from '@/hooks/useContainerContext';
import { useTerminalManager } from '@/hooks/useTerminalManager';
import { TerminalContext } from '@/hooks/useTerminalContext';
import { AIStatusContext } from '@/hooks/useAIStatus';
import { ConceptChatProvider, ArchitectChatProvider, CodeChatProvider } from '@/hooks/useChatContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useAutoBackup } from '@/hooks/useAutoBackup';


const SHARED_SUBFOLDER = "";  // No subfolder - files are in project root
const CANVAS_FILE_NAME = "arch_diagram.json";

const DynamicCodeView = dynamic(() => import('./CodeView').then(mod => mod.CodeView), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
      <Skeleton className="h-12 w-12 mb-4 rounded-lg" />
      <Skeleton className="h-4 w-48 mb-2" />
      <p className="mt-2 text-sm">Loading Code Editor...</p>
    </div>
  ),
});

const DynamicArchitectView = dynamic(() => import('./ArchitectView').then(mod => mod.ArchitectView), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
      <Skeleton className="h-12 w-12 mb-4 rounded-lg" />
      <Skeleton className="h-4 w-48 mb-2" />
      <p className="mt-2 text-sm">Loading Architect View...</p>
    </div>
  ),
});

const DynamicSettingsView = dynamic(() => import('./SettingsView').then(mod => mod.SettingsView), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-muted-foreground p-4">
      <Loader2 className="h-8 w-8 animate-spin mr-2" /> Loading Settings...
    </div>
  ),
});

const DynamicAnalyticsView = dynamic(() => import('./AnalyticsView'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
      <Skeleton className="h-12 w-12 mb-4 rounded-lg" />
      <Skeleton className="h-4 w-48 mb-2" />
      <p className="mt-2 text-sm">Loading Analytics View...</p>
    </div>
  ),
});

const DynamicDRCView = dynamic(() => import('./DRCView'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
      <Skeleton className="h-12 w-12 mb-4 rounded-lg" />
      <Skeleton className="h-4 w-48 mb-2" />
      <p className="mt-2 text-sm">Loading Validation View...</p>
    </div>
  ),
});

const DynamicConceptView = dynamic(() => import('./ConceptView'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
      <Skeleton className="h-12 w-12 mb-4 rounded-lg" />
      <Skeleton className="h-4 w-48 mb-2" />
      <p className="mt-2 text-sm">Loading Concept View...</p>
    </div>
  ),
});

const DynamicBOMView = dynamic(() => import('./BOMReportView').then(mod => ({ default: mod.BOMReportView })), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
      <Skeleton className="h-12 w-12 mb-4 rounded-lg" />
      <Skeleton className="h-4 w-48 mb-2" />
      <p className="mt-2 text-sm">Loading BOM Report...</p>
    </div>
  ),
});

const DynamicDeliverView = dynamic(() => import('./DeliverView').then(mod => ({ default: mod.DeliverView })), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
      <Skeleton className="h-12 w-12 mb-4 rounded-lg" />
      <Skeleton className="h-4 w-48 mb-2" />
      <p className="mt-2 text-sm">Loading Deliver View...</p>
    </div>
  ),
});

const DynamicAdminView = dynamic(() => import('./AdminView').then(mod => ({ default: mod.AdminView })), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
      <Skeleton className="h-12 w-12 mb-4 rounded-lg" />
      <Skeleton className="h-4 w-48 mb-2" />
      <p className="mt-2 text-sm">Loading Admin Panel...</p>
    </div>
  ),
});



export function WebCoderLayout() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  // Ensure user is authenticated before initializing workspace
  if (!user || !user.email) {
    throw new Error('User must be authenticated to use the IDE. Please log in.');
  }

  const workspaceManager = useWorkspaceManager({
    initialUser: user.id, // Use UUID user ID for S3 paths, not email
    initialProjectRoot: null,
    useBackendAPI: true // Enable backend API for project management
  });
  const viewManager = useViewManager({
    currentProjectRoot: workspaceManager.currentProjectRoot,
  });
  const terminalManager = useTerminalManager();

  const architectViewRef = React.useRef<ArchitectViewHandles>(null);
  const codeViewRef = React.useRef<CodeViewHandles>(null);
  const containerActionsRef = React.useRef<ContainerActions>(null);
  const [isAiLoading, setIsAiLoading] = React.useState(false);

  const canvasFilePath = path.join(SHARED_SUBFOLDER, CANVAS_FILE_NAME);

  const [mountedViews, setMountedViews] = React.useState<Partial<Record<ViewMode, boolean>>>({ home: true });

  const [appSettings, setAppSettings] = React.useState<AppSettings | null>(null);
  const [isLoadingAppSettings, setIsLoadingAppSettings] = React.useState(true);
  
  // Auto-backup hook
  useAutoBackup({
    projectId: workspaceManager.currentProjectRoot,
    enabled: viewManager.currentViewMode === 'architect',
  });

  React.useEffect(() => {
    const bootstrap = async () => {
      await workspaceManager.initializeWorkspace();
    };
    bootstrap();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceManager.initializeWorkspace]);

  // Load app settings
  React.useEffect(() => {
    if (!workspaceManager.isInitializing && workspaceManager.currentUser && workspaceManager.currentProjectRoot) {
      setIsLoadingAppSettings(true);
      workspaceManager.getAppSettings()
        .then(settings => {
          setAppSettings(settings ?? {}); 
        })
        .catch(err => {
          console.error("Failed to load app settings for project:", workspaceManager.currentProjectRoot, err);
          setAppSettings({}); 
        })
        .finally(() => setIsLoadingAppSettings(false));
    } else if (!workspaceManager.currentProjectRoot) {
      setAppSettings(null); 
      setIsLoadingAppSettings(false);
    } else if (!workspaceManager.currentUser) {
      setAppSettings(null);
      setIsLoadingAppSettings(false);
    }
  }, [workspaceManager.isInitializing, workspaceManager.currentUser, workspaceManager.currentProjectRoot, workspaceManager.getAppSettings]);

  const handleSaveAppSettings = React.useCallback((newSettings: AppSettings) => {
    if (workspaceManager.currentProjectRoot) { 
      setAppSettings(newSettings); 
      workspaceManager.saveAppSettings(newSettings);
    }
  }, [workspaceManager]);

  React.useEffect(() => {
    if (viewManager.currentViewMode && !mountedViews[viewManager.currentViewMode]) {
      setMountedViews(prev => ({ ...prev, [viewManager.currentViewMode]: true }));
    }
  }, [viewManager.currentViewMode, mountedViews]);



  React.useEffect(() => {
    if (!workspaceManager.isInitializing && !workspaceManager.currentProjectRoot &&
        (viewManager.currentViewMode === 'analytics' ||
         viewManager.currentViewMode === 'drc' ||
         viewManager.currentViewMode === 'code' ||
         viewManager.currentViewMode === 'architect' ||
         viewManager.currentViewMode === 'concept' ||
         viewManager.currentViewMode === 'bom' ||
         viewManager.currentViewMode === 'container' ||
         viewManager.currentViewMode === 'settings' )) {
      viewManager.setCurrentViewMode('home');
    }
    // Admin view doesn't require a project, so it's excluded from this check
  }, [workspaceManager.currentProjectRoot, viewManager.currentViewMode, viewManager.setCurrentViewMode, workspaceManager.isInitializing]);


  const handleActivateCodeViewHandler = React.useCallback(() => {
    if (!workspaceManager.currentProjectRoot) {
      viewManager.setCurrentViewMode('home');
      return;
    }
    viewManager.setCurrentViewMode('code');
  }, [workspaceManager.currentProjectRoot, viewManager]);

  const handleActivateArchitectViewHandler = React.useCallback(() => {
     if (!workspaceManager.currentProjectRoot) { 
      viewManager.setCurrentViewMode('home');
      return;
    }
    viewManager.setCurrentViewMode('architect');
  }, [workspaceManager.currentProjectRoot, viewManager]);

  const handleActivateSettingsViewHandler = React.useCallback(() => {
    if (!workspaceManager.currentProjectRoot) {
        viewManager.setCurrentViewMode('home');
        return;
    }
    viewManager.setCurrentViewMode('settings');
  }, [workspaceManager.currentProjectRoot, viewManager]);

  const handleActivateAnalyticsViewHandler = React.useCallback(() => {
    if (!workspaceManager.currentProjectRoot) {
      viewManager.setCurrentViewMode('home');
      return;
    }
    viewManager.setCurrentViewMode('analytics');
  }, [workspaceManager.currentProjectRoot, viewManager]);

  const handleActivateDRCViewHandler = React.useCallback(() => {
    if (!workspaceManager.currentProjectRoot) {
      viewManager.setCurrentViewMode('home');
      return;
    }
    viewManager.setCurrentViewMode('drc');
  }, [workspaceManager.currentProjectRoot, viewManager]);

  const handleActivateConceptViewHandler = React.useCallback(() => {
    // Check if there's a pending project from HomeView
    const pendingProject = localStorage.getItem('soc-pilot:pendingProject');

    if (!workspaceManager.currentProjectRoot && !pendingProject) {
      console.log('[WebCoderLayout] No project open and no pending project, staying on home view');
      viewManager.setCurrentViewMode('home');
      return;
    }

    console.log('[WebCoderLayout] Switching to concept view, currentProjectRoot:', workspaceManager.currentProjectRoot, 'pendingProject:', pendingProject);
    viewManager.setCurrentViewMode('concept');
  }, [workspaceManager.currentProjectRoot, viewManager]);

  const handleActivateBOMViewHandler = React.useCallback(() => {
    if (!workspaceManager.currentProjectRoot) {
      viewManager.setCurrentViewMode('home');
      return;
    }
    viewManager.setCurrentViewMode('bom');
  }, [workspaceManager.currentProjectRoot, viewManager]);

  const handleActivateDeliverViewHandler = React.useCallback(() => {
    if (!workspaceManager.currentProjectRoot) {
      viewManager.setCurrentViewMode('home');
      return;
    }
    viewManager.setCurrentViewMode('deliver');
  }, [workspaceManager.currentProjectRoot, viewManager]);

  const handleActivateAdminViewHandler = React.useCallback(() => {
    viewManager.setCurrentViewMode('admin');
  }, [viewManager]);



  const handleEffectiveSwitchUser = React.useCallback(async (newUsername: string) => {
    if (containerActionsRef.current) {
      await containerActionsRef.current.stopContainer();
    }
    terminalManager.destroyAllTerminals();
    workspaceManager.handleSwitchUser(newUsername);
    viewManager.setCurrentViewMode('home');
    setAppSettings(null);
  }, [workspaceManager, viewManager, terminalManager]);

  const handleEffectiveProjectSelected = React.useCallback(async (projectPath: string | null, projectName?: string | null) => {
    if (workspaceManager.currentProjectRoot !== projectPath) {
      setAppSettings(null);
    }
    await workspaceManager.handleProjectSelected(projectPath, projectName);
    // Note: Don't force view change here - let caller decide which view to activate
    // The HomeViewV2 component will call the appropriate onActivate* handler after this
  }, [workspaceManager]);

  const handleSaveCurrentProjectContext = React.useCallback(async () => {
    if (!workspaceManager.currentProjectRoot || !workspaceManager.currentProjectId) {
      return;
    }

    try {
      // Save architect view diagram if it exists
      if (architectViewRef.current && viewManager.currentViewMode === 'architect') {
        // Architect view auto-saves, but we can trigger a manual save here
        // Note: The actual save is handled internally by ArchitectView
        console.log('Triggering architect view save...');
      }

      // Save code view workspace state if it exists
      if (codeViewRef.current && viewManager.currentViewMode === 'code') {
        // Code view auto-saves workspace state
        console.log('Code view workspace state auto-saved');
      }

      // Save app settings
      if (appSettings) {
        await workspaceManager.saveAppSettings(appSettings);
      }

      console.log('Project context saved successfully');
    } catch (error) {
      console.error('Error saving project context:', error);
      throw error;
    }
  }, [workspaceManager, viewManager.currentViewMode, appSettings]);

  const handleEffectiveCloseWorkspace = React.useCallback(async () => {
    try {
      // Save any pending data before closing
      await handleSaveCurrentProjectContext();

      // Stop container and clean up terminals
      if (containerActionsRef.current) {
        await containerActionsRef.current.stopContainer();
      }
      terminalManager.destroyAllTerminals();

      // Clear workspace state (this resets projectId/name/root)
      workspaceManager.handleCloseWorkspace();

      // Reset view to home
      viewManager.setCurrentViewMode('home');

      // Clear app settings
      setAppSettings(null);

      // Force unmount of all views to clear their state
      setMountedViews({ home: true });
    } catch (error) {
      console.error('Error closing workspace:', error);
      // Still try to close workspace even if there's an error
      workspaceManager.handleCloseWorkspace();
      viewManager.setCurrentViewMode('home');
      setAppSettings(null);
      setMountedViews({ home: true });
    }
  }, [workspaceManager, viewManager, terminalManager, handleSaveCurrentProjectContext, appSettings]);

  const aiStatus = React.useMemo(() => {
    if (isAiLoading) return 'loading';
    if (viewManager.currentViewMode === 'code' || viewManager.currentViewMode === 'architect') {
      return 'ready';
    }
    return 'idle';
  }, [viewManager.currentViewMode, isAiLoading]);



  const onToggleArchitectLeftPanel = () => {
    if (viewManager.currentViewMode === 'architect' && architectViewRef.current) {
      architectViewRef.current.toggleLeftPanel();
    }
  };
  const onToggleArchitectRightPanel = () => {
    if (viewManager.currentViewMode === 'architect' && architectViewRef.current) {
      architectViewRef.current.toggleRightPanel();
    }
  };
  const onToggleCodeExplorerPanel = () => {
    if (viewManager.currentViewMode === 'code' && codeViewRef.current) {
      codeViewRef.current.toggleExplorerPanel();
    }
  };
  const onToggleCodeBottomPanel = () => {
    if (viewManager.currentViewMode === 'code' && codeViewRef.current) {
      codeViewRef.current.toggleBottomPanel();
    }
  };
  const onToggleCodeRightPanel = () => {
    if (viewManager.currentViewMode === 'code' && codeViewRef.current) {
      codeViewRef.current.toggleRightPanel();
    }
  };


  const renderMainContent = () => {
    if (workspaceManager.isInitializing) {
        return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin" /> Initializing Workspace...</div>;
    }
    if (viewManager.currentViewMode === 'settings' && isLoadingAppSettings && workspaceManager.currentProjectRoot) {
         return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin" /> Loading Project Settings...</div>;
    }


    const views: Partial<Record<ViewMode, React.ReactNode>> = {
      home: mountedViews.home ? (
        <ConceptChatProvider>
          <HomeViewV2
            currentUser={user?.name || 'User'}
            currentProjectRoot={workspaceManager.currentProjectRoot}
            currentProjectName={workspaceManager.currentProjectName}
            projectId={workspaceManager.currentProjectId || undefined}
            onViewChange={viewManager.handleViewChange}
            onProjectSelected={handleEffectiveProjectSelected}
            onActivateHomeView={handleEffectiveCloseWorkspace}
            onActivateConceptView={handleActivateConceptViewHandler}
            onActivateArchitectView={handleActivateArchitectViewHandler}
            onSaveCurrentProjectContext={handleSaveCurrentProjectContext}
          />
        </ConceptChatProvider>
      ) : null,
      code: mountedViews.code ? (
        <CodeChatProvider>
          <DynamicCodeView
            ref={codeViewRef}
            currentUser={workspaceManager.currentUser}
            currentProjectRoot={workspaceManager.currentProjectRoot}
            projectId={workspaceManager.currentProjectId || undefined}
            getCodeViewWorkspaceState={workspaceManager.getCodeViewWorkspaceState}
            saveCodeViewWorkspaceState={workspaceManager.saveCodeViewWorkspaceState}
            getFileContent={workspaceManager.getFileContent}
            updateFileContent={workspaceManager.updateFileContent}
            activeBottomTab={viewManager.activeBottomTab}
            setActiveBottomTab={viewManager.setActiveBottomTab}
            currentViewMode={viewManager.currentViewMode}
            appSettings={appSettings}
          />
        </CodeChatProvider>
      ) : null,
      architect: mountedViews.architect ? (
        <ArchitectChatProvider>
          <DynamicArchitectView
            ref={architectViewRef}
            currentUser={workspaceManager.currentUser}
            currentProjectRoot={workspaceManager.currentProjectRoot}
            projectId={workspaceManager.currentProjectId || undefined}
            getFileContent={workspaceManager.getFileContent}
            updateFileContent={workspaceManager.updateFileContent}
            isActive={viewManager.currentViewMode === 'architect'}
            isAdmin={user?.role === 'admin'}
          />
        </ArchitectChatProvider>
      ) : null,
      settings: mountedViews.settings ? (
        <DynamicSettingsView
          currentSettings={appSettings}
          onSettingsChange={handleSaveAppSettings}
          isProjectOpen={!!workspaceManager.currentProjectRoot}
          projectId={workspaceManager.currentProjectRoot}
        />
      ) : null,
      analytics: mountedViews.analytics ? (
        <DynamicAnalyticsView
          currentUser={workspaceManager.currentUser}
          currentProjectRoot={workspaceManager.currentProjectRoot}
          projectId={workspaceManager.currentProjectId || undefined}
          getFileContent={workspaceManager.getFileContent}
        />
      ) : null,
      drc: mountedViews.drc ? (
        <DynamicDRCView
          currentUser={workspaceManager.currentUser}
          currentProjectRoot={workspaceManager.currentProjectRoot}
        />
      ) : null,
      concept: mountedViews.concept ? (
        <ConceptChatProvider>
          <DynamicConceptView
            currentUser={workspaceManager.currentUser}
            currentProjectRoot={workspaceManager.currentProjectRoot}
            projectId={workspaceManager.currentProjectId || undefined}
            onProceedToArchitecture={handleActivateArchitectViewHandler}
          />
        </ConceptChatProvider>
      ) : null,
      bom: mountedViews.bom ? (
        <DynamicBOMView
          projectId={workspaceManager.currentProjectId || ''}
          projectName={workspaceManager.currentProjectName || 'Unknown Project'}
        />
      ) : null,
      deliver: mountedViews.deliver ? (
        <DynamicDeliverView
          currentUser={workspaceManager.currentUser}
          currentProjectRoot={workspaceManager.currentProjectRoot}
          projectId={workspaceManager.currentProjectId || undefined}
        />
      ) : null,
      admin: mountedViews.admin ? (
        <DynamicAdminView
          userRole={user?.role}
        />
      ) : null,
    };

    if (!workspaceManager.currentProjectRoot &&
        (viewManager.currentViewMode === 'code' ||
         viewManager.currentViewMode === 'analytics' ||
         viewManager.currentViewMode === 'drc' ||
         viewManager.currentViewMode === 'architect' ||
         viewManager.currentViewMode === 'concept' ||
         viewManager.currentViewMode === 'bom' ||
         viewManager.currentViewMode === 'settings')) {
        return views.home;
    }


    return (
      <>
        {Object.entries(views).map(([view, node]) => (
          <div
            key={view}
            className={cn("w-full h-full", {
              'hidden': viewManager.currentViewMode !== view,
              'flex flex-col': viewManager.currentViewMode === view,
            })}
          >
            {node}
          </div>
        ))}
      </>
    );
  };

  const isWorkspaceEffectivelyClosed = workspaceManager.currentProjectRoot === null;

  return (
    <ContainerProvider
      currentUser={workspaceManager.currentUser}
      terminalManager={terminalManager}
      actionsRef={containerActionsRef}
    >
      <AIStatusContext.Provider value={{ isAiLoading, setIsAiLoading }}>
          <div
            className={cn(
              "flex flex-col h-screen w-full bg-background text-foreground overflow-hidden"
            )}
          >
        <AppHeader
          currentUser={workspaceManager.currentUser}
          currentProjectRoot={workspaceManager.currentProjectRoot}
          currentProjectName={workspaceManager.currentProjectName}
          currentViewMode={viewManager.currentViewMode}
          onToggleArchitectLeftPanel={onToggleArchitectLeftPanel}
          onToggleArchitectRightPanel={onToggleArchitectRightPanel}
          onToggleCodeExplorerPanel={onToggleCodeExplorerPanel}
          onToggleCodeBottomPanel={onToggleCodeBottomPanel}
          onToggleCodeRightPanel={onToggleCodeRightPanel}
          onProjectNameChange={workspaceManager.updateProjectName}
        />
        <div className="flex flex-1 min-h-0">
          <ActivityBar
            activeViewMode={viewManager.currentViewMode}
            onActivateCodeView={handleActivateCodeViewHandler}
            onActivateArchitectView={handleActivateArchitectViewHandler}
            onActivateConceptView={handleActivateConceptViewHandler}
            onActivateDRCView={handleActivateDRCViewHandler}
            onActivateAnalyticsView={handleActivateAnalyticsViewHandler}
            onActivateBOMView={handleActivateBOMViewHandler}
            onActivateDeliverView={handleActivateDeliverViewHandler}
            onActivateHomeView={() => viewManager.setCurrentViewMode('home')}
            onActivateSettingsView={handleActivateSettingsViewHandler}
            onActivateAdminView={handleActivateAdminViewHandler}
            currentUser={user?.name || 'User'}
            userEmail={user?.email || 'user@example.com'}
            userRole={user?.role}
            onLogout={async () => {
              await signOut();
              router.push('/login');
            }}
            isWorkspaceClosed={isWorkspaceEffectivelyClosed}
          />

          <main className={cn(
            "relative flex min-h-0 flex-1 flex-col min-w-0",
            "z-10"
          )}>
            <TerminalContext.Provider value={terminalManager}>
              {renderMainContent()}
            </TerminalContext.Provider>
          </main>
        </div>
        <AppStatusBar
          activeFile={null}
          currentUser={workspaceManager.currentUser}
          currentProjectRoot={workspaceManager.currentProjectRoot}
          currentProjectName={workspaceManager.currentProjectName}
          currentViewMode={viewManager.currentViewMode}
        />
        </div>
        </AIStatusContext.Provider>
    </ContainerProvider>
  );
}
