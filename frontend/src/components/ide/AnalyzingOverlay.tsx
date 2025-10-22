/**
 * Analyzing Overlay
 * Beautiful overlay shown during analytics analysis
 */

import * as React from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { BarChart3, Network, Activity, Clock } from 'lucide-react';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

interface AnalyzingOverlayProps {
  isAnalyzing: boolean;
  flowCount: number;
  onComplete?: () => void;
}

export function AnalyzingOverlay({ isAnalyzing, flowCount, onComplete }: AnalyzingOverlayProps) {
  const [shouldShow, setShouldShow] = React.useState(false);
  const startTimeRef = React.useRef<number>(0);

  React.useEffect(() => {
    if (isAnalyzing) {
      // Start analyzing - show overlay immediately
      setShouldShow(true);
      startTimeRef.current = Date.now();
    } else if (shouldShow) {
      // Analysis complete - ensure minimum display time before closing
      const elapsed = Date.now() - startTimeRef.current;
      const remainingTime = Math.max(0, 1000 - elapsed);
      
      const timer = setTimeout(() => {
        setShouldShow(false);
        onComplete?.();
      }, remainingTime);
      
      return () => clearTimeout(timer);
    }
  }, [isAnalyzing, shouldShow, onComplete]);

  return (
    <Dialog open={shouldShow} onOpenChange={(open) => {
      // Allow manual close only if analysis is complete
      if (!open && !isAnalyzing) {
        setShouldShow(false);
      }
    }}>
      <DialogContent 
        className="max-w-lg border-2 border-primary/20"
        onPointerDownOutside={(e) => {
          // Prevent closing by clicking outside only during analysis
          if (isAnalyzing) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          // Prevent closing with Escape only during analysis
          if (isAnalyzing) {
            e.preventDefault();
          }
        }}
      >
        <VisuallyHidden>
          <DialogTitle>Analyzing Architecture</DialogTitle>
        </VisuallyHidden>
        <div className="pt-8 pb-8 text-center">
          {/* Animated Icon */}
          <div className="relative inline-block mb-6">
            <div className="absolute inset-0 animate-ping">
              <BarChart3 className="h-20 w-20 text-primary/30 mx-auto" />
            </div>
            <BarChart3 className="h-20 w-20 text-primary mx-auto relative" />
          </div>

          {/* Title */}
          <h3 className="text-2xl font-semibold mb-2">Analyzing Architecture</h3>
          <p className="text-muted-foreground mb-8">
            Running performance analysis on {flowCount} data flow{flowCount !== 1 ? 's' : ''}...
          </p>
          
          {/* Progress bar */}
          <div className="max-w-md mx-auto mb-6">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-primary to-primary/60 animate-pulse" 
                style={{ width: '100%' }} 
              />
            </div>
          </div>
          
          {/* Status indicators */}
          <div className="flex items-center justify-center gap-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 animate-pulse text-primary" />
              <span>Tracing flows</span>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 animate-pulse text-primary" />
              <span>Computing bandwidth</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 animate-pulse text-primary" />
              <span>Analyzing latency</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
