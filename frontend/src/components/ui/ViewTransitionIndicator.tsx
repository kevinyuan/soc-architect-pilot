/**
 * Visual indicator shown during view transitions
 * Provides clear feedback to users about what's happening
 */

import React from 'react';
import { cn } from '@/lib/utils';
import type { ViewMode } from '@/types/ide';

interface ViewTransitionIndicatorProps {
  isTransitioning: boolean;
  fromView?: ViewMode;
  toView?: ViewMode;
  progress?: number; // 0-1
}

const VIEW_LABELS: Record<ViewMode, string> = {
  home: 'Home',
  concept: 'Concept Design',
  architect: 'Architecture',
  drc: 'Design Validation',
  code: 'Code Editor',
  analytics: 'Analytics',
  bom: 'BOM Report',
  settings: 'Settings',
  container: 'Container',
  admin: 'Admin Panel',
};

const VIEW_ICONS: Record<ViewMode, string> = {
  home: '🏠',
  concept: '💡',
  architect: '🏗️',
  drc: '✓',
  code: '💻',
  analytics: '📊',
  bom: '📄',
  settings: '⚙️',
  container: '📦',
  admin: '🛡️',
};

export function ViewTransitionIndicator({
  isTransitioning,
  fromView,
  toView,
  progress = 0,
}: ViewTransitionIndicatorProps) {
  if (!isTransitioning || !toView) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        "bg-background/80 backdrop-blur-sm",
        "transition-opacity duration-200",
        isTransitioning ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
    >
      <div className="flex flex-col items-center gap-4 p-8 rounded-lg bg-card shadow-lg border">
        {/* Icon transition */}
        <div className="flex items-center gap-4 text-4xl">
          {fromView && (
            <div className={cn(
              "transition-all duration-300",
              progress > 0.3 && "opacity-0 scale-75"
            )}>
              {VIEW_ICONS[fromView]}
            </div>
          )}
          
          <div className="text-2xl text-muted-foreground animate-pulse">
            →
          </div>
          
          <div className={cn(
            "transition-all duration-300",
            progress < 0.5 ? "opacity-0 scale-75" : "opacity-100 scale-100"
          )}>
            {VIEW_ICONS[toView]}
          </div>
        </div>

        {/* Text label */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Switching to</p>
          <p className="text-lg font-semibold">{VIEW_LABELS[toView]}</p>
        </div>

        {/* Progress bar */}
        <div className="w-48 h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-100 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Simpler version - just a loading spinner with view name
 */
export function SimpleViewTransitionIndicator({
  isTransitioning,
  toView,
}: Pick<ViewTransitionIndicatorProps, 'isTransitioning' | 'toView'>) {
  if (!isTransitioning || !toView) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed top-4 right-4 z-50",
        "flex items-center gap-3 px-4 py-2 rounded-lg",
        "bg-card shadow-lg border",
        "transition-all duration-200",
        isTransitioning ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
      )}
    >
      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <span className="text-sm font-medium">
        Loading {VIEW_LABELS[toView]}...
      </span>
    </div>
  );
}

/**
 * Minimal version - just a top progress bar
 */
export function MinimalViewTransitionIndicator({
  isTransitioning,
  progress = 0,
}: Pick<ViewTransitionIndicatorProps, 'isTransitioning' | 'progress'>) {
  if (!isTransitioning) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-muted">
      <div
        className="h-full bg-primary transition-all duration-100 ease-linear"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
}
