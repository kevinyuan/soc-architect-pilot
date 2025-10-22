/**
 * Custom hook for smooth view transitions
 * Handles fade in/out animations and state management
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ViewMode } from '@/types/ide';

interface TransitionConfig {
  duration: number;  // milliseconds
  type: 'fade' | 'slide' | 'none';
  easing?: string;
}

const DEFAULT_TRANSITION: TransitionConfig = {
  duration: 350,  // Increased from 200ms to make transitions more noticeable
  type: 'fade',
  easing: 'cubic-bezier(0.4, 0, 0.2, 1)',  // Material Design easing
};

// Different transition configs for different view switches
// Increased durations to make transitions more noticeable
const TRANSITION_MAP: Record<string, TransitionConfig> = {
  // Major context switches - slower, more noticeable (400-500ms)
  'home-concept': { duration: 400, type: 'fade', easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  'home-architect': { duration: 400, type: 'fade', easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  'home-code': { duration: 400, type: 'fade', easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  'home-drc': { duration: 400, type: 'fade', easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  
  // Related views - medium transitions (300ms)
  'concept-architect': { duration: 300, type: 'fade', easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  'architect-drc': { duration: 300, type: 'fade', easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  'architect-code': { duration: 300, type: 'fade', easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  'concept-code': { duration: 300, type: 'fade', easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  'drc-code': { duration: 300, type: 'fade', easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  
  // Tool switches - still noticeable (250ms)
  'code-container': { duration: 250, type: 'fade', easing: 'ease-in-out' },
  'drc-architect': { duration: 300, type: 'fade', easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  
  // Settings - modal-like transition (350ms)
  'settings-*': { duration: 350, type: 'fade', easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  '*-settings': { duration: 350, type: 'fade', easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
};

function getTransitionConfig(from: ViewMode, to: ViewMode): TransitionConfig {
  const key = `${from}-${to}`;
  
  // Check exact match
  if (TRANSITION_MAP[key]) {
    return TRANSITION_MAP[key];
  }
  
  // Check wildcard patterns
  const fromPattern = `${from}-*`;
  const toPattern = `*-${to}`;
  
  if (TRANSITION_MAP[fromPattern]) {
    return TRANSITION_MAP[fromPattern];
  }
  
  if (TRANSITION_MAP[toPattern]) {
    return TRANSITION_MAP[toPattern];
  }
  
  return DEFAULT_TRANSITION;
}

export function useViewTransition(initialView: ViewMode) {
  const [currentView, setCurrentView] = useState<ViewMode>(initialView);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [opacity, setOpacity] = useState(1);
  const [transitionProgress, setTransitionProgress] = useState(0);
  const [targetView, setTargetView] = useState<ViewMode | null>(null);
  const transitionTimeoutRef = useRef<NodeJS.Timeout>();
  const previousViewRef = useRef<ViewMode>(initialView);
  const progressIntervalRef = useRef<NodeJS.Timeout>();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  const switchView = useCallback(async (newView: ViewMode) => {
    // Don't transition if already on this view
    if (newView === currentView) {
      return;
    }

    // Don't allow multiple transitions at once
    if (isTransitioning) {
      console.warn('Transition already in progress');
      return;
    }

    const config = getTransitionConfig(currentView, newView);
    
    // If no transition, just switch immediately
    if (config.type === 'none' || config.duration === 0) {
      previousViewRef.current = currentView;
      setCurrentView(newView);
      return;
    }

    setIsTransitioning(true);
    setTargetView(newView);
    setTransitionProgress(0);

    // Animate progress bar
    const progressSteps = 20;
    const progressInterval = config.duration / progressSteps;
    let currentProgress = 0;
    
    progressIntervalRef.current = setInterval(() => {
      currentProgress += 1 / progressSteps;
      setTransitionProgress(Math.min(currentProgress, 1));
    }, progressInterval);

    // Fade out
    setOpacity(0);

    // Wait for fade out to complete
    await new Promise(resolve => {
      transitionTimeoutRef.current = setTimeout(resolve, config.duration / 2);
    });

    // Switch view
    previousViewRef.current = currentView;
    setCurrentView(newView);

    // Small delay to ensure DOM update
    await new Promise(resolve => setTimeout(resolve, 10));

    // Fade in
    setOpacity(1);

    // Wait for fade in to complete
    await new Promise(resolve => {
      transitionTimeoutRef.current = setTimeout(resolve, config.duration / 2);
    });

    // Cleanup
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    setTransitionProgress(1);
    setIsTransitioning(false);
    setTargetView(null);
  }, [currentView, isTransitioning]);

  const getTransitionStyle = useCallback((view: ViewMode) => {
    const config = getTransitionConfig(previousViewRef.current, currentView);
    
    return {
      opacity: view === currentView ? opacity : 0,
      transition: `opacity ${config.duration}ms ${config.easing || 'ease-in-out'}`,
      pointerEvents: (isTransitioning || view !== currentView) ? 'none' as const : 'auto' as const,
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      willChange: isTransitioning ? 'opacity' : 'auto',
    };
  }, [currentView, opacity, isTransitioning]);

  return {
    currentView,
    switchView,
    isTransitioning,
    getTransitionStyle,
    transitionProgress,
    targetView,
    previousView: previousViewRef.current,
    // For debugging
    transitionConfig: getTransitionConfig(previousViewRef.current, currentView),
  };
}
