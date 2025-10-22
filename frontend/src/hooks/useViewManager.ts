
"use client";

import * as React from 'react';
import type { ViewMode } from '@/types/ide';
// Removed: import { useLeftSidebar } from '@/components/ui/left-sidebar';

export interface UseViewManagerArgs {
  currentProjectRoot: string | null;
}

export interface UseViewManagerReturn {
  currentViewMode: ViewMode;
  setCurrentViewMode: React.Dispatch<React.SetStateAction<ViewMode>>;
  // Removed: isLeftPanelOpen: boolean; 
  activeBottomTab: string;
  setActiveBottomTab: React.Dispatch<React.SetStateAction<string>>;
  handleViewChange: (viewMode: ViewMode) => void;
  handleNavigateToHomeView: () => void;
}

export function useViewManager({ currentProjectRoot }: UseViewManagerArgs): UseViewManagerReturn {
  const [currentViewMode, setCurrentViewMode] = React.useState<ViewMode>('home');
  // Removed: const { open: isLeftSidebarOpenFromContext, setOpen: setLeftSidebarOpenInContext } = useLeftSidebar();
  const [activeBottomTab, setActiveBottomTab] = React.useState<string>("terminal");

  // Removed useEffect that controlled setLeftSidebarOpenInContext

  const handleViewChange = React.useCallback((viewMode: ViewMode) => {
    setCurrentViewMode(prevMode => prevMode === viewMode ? prevMode : viewMode);
  }, [setCurrentViewMode]);
  
  const handleNavigateToHomeView = React.useCallback(() => {
    setCurrentViewMode(prevMode => prevMode === 'home' ? prevMode : 'home');
  }, [setCurrentViewMode]);

  return {
    currentViewMode,
    setCurrentViewMode,
    // Removed: isLeftPanelOpen: isLeftSidebarOpenFromContext,
    activeBottomTab,
    setActiveBottomTab,
    handleViewChange,
    handleNavigateToHomeView,
  };
}

