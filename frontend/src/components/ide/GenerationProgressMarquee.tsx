/**
 * Generation Progress Marquee
 * Displays architecture generation progress inline with chat messages
 * Shows current status without continuous scrolling
 */

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface ProgressEvent {
  type: 'connected' | 'progress';
  stage?: 'started' | 'extracting' | 'ai_inference' | 'generating_spec' | 'generating_diagram' | 'drc_check' | 'ai_fix' | 's3_upload' | 'completed' | 'error';
  message?: string;
  progress?: number;
  timestamp?: string;
  details?: any;
}

interface GenerationProgressMarqueeProps {
  sessionId: string | null;
  isGenerating: boolean;
  onComplete?: (finalProgressData: any) => void;
  savedProgressData?: {
    stage: string;
    progress: number;
    message?: string;
    details?: any;
  } | null; // Display saved/completed progress even when not actively generating
}

const stageDisplayNames: Record<string, string> = {
  started: 'Starting',
  extracting: 'Extracting Requirements',
  ai_inference: 'AI Analysis',
  generating_spec: 'Generating Specification',
  generating_diagram: 'Generating Diagram',
  drc_check: 'Design Rule Check',
  ai_fix: 'AI Validation',
  s3_upload: 'Uploading to S3',
  completed: 'Completed',
  error: 'Error'
};

// Stage weights for accurate progress calculation
const stageWeights: Record<string, number> = {
  started: 0,
  extracting: 10,
  ai_inference: 25,
  generating_spec: 40,
  generating_diagram: 60,
  drc_check: 75,
  ai_fix: 85,
  s3_upload: 95,
  completed: 100
};

export const GenerationProgressMarquee: React.FC<GenerationProgressMarqueeProps> = ({
  sessionId,
  isGenerating,
  onComplete,
  savedProgressData
}) => {
  const [currentEvent, setCurrentEvent] = useState<ProgressEvent | null>(null);
  const [maxProgress, setMaxProgress] = useState<number>(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const onCompleteRef = useRef(onComplete);

  // Keep onComplete ref up to date
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // If we have savedProgressData and not actively generating, use saved data
  useEffect(() => {
    if (savedProgressData && !isGenerating) {
      setCurrentEvent({
        type: 'progress',
        stage: savedProgressData.stage as any,
        progress: savedProgressData.progress,
        message: savedProgressData.message,
        details: savedProgressData.details
      });
      setMaxProgress(savedProgressData.progress);
    }
  }, [savedProgressData, isGenerating]);

  useEffect(() => {
    if (!sessionId || !isGenerating) {
      // Clean up and reset
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (!isGenerating) {
        setCurrentEvent(null);
        setMaxProgress(0);
      }
      return;
    }

    // Reset progress when new generation starts
    setCurrentEvent(null);
    setMaxProgress(0);

    // Close any existing connection before creating new one
    if (eventSourceRef.current) {
      console.log('[Progress Marquee] Closing existing SSE connection');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Get auth token from localStorage for SSE connection
    const token = typeof window !== 'undefined'
      ? localStorage.getItem('auth_token')
      : null;

    // Get backend URL from environment (same as apiClient)
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

    // Connect to SSE endpoint with token in query parameter
    // EventSource doesn't support custom headers, so we pass token as query param
    // Use absolute URL (like other API requests) instead of relative path
    const sseUrl = token
      ? `${backendUrl}/chat/session/${sessionId}/generation-progress?token=${encodeURIComponent(token)}`
      : `${backendUrl}/chat/session/${sessionId}/generation-progress`;

    console.log('[Progress Marquee] Establishing new SSE connection for session:', sessionId);
    const eventSource = new EventSource(sseUrl);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data: ProgressEvent = JSON.parse(event.data);
        console.log('[Progress Marquee] Received event:', data);

        if (data.type === 'progress') {
          // Calculate progress based on stage if not provided
          let calculatedProgress = data.progress;
          if (calculatedProgress === undefined && data.stage) {
            calculatedProgress = stageWeights[data.stage] || 0;
          }
          
          // Ensure progress never goes backward
          if (calculatedProgress !== undefined) {
            setMaxProgress(prev => Math.max(prev, calculatedProgress));
            data.progress = Math.max(maxProgress, calculatedProgress);
          }
          
          setCurrentEvent(data);

          // Check if completed
          if (data.stage === 'completed') {
            // Save final progress data before calling onComplete
            const finalProgressData = {
              stage: data.stage,
              progress: data.progress || 100,
              message: data.message,
              details: data.details
            };

            setTimeout(() => {
              onCompleteRef.current?.(finalProgressData);
            }, 2000); // Show completion message for 2s
          }
        }
      } catch (error) {
        console.error('[Progress Marquee] Error parsing SSE data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[Progress Marquee] SSE error:', error);
      eventSource.close();
      eventSourceRef.current = null;
    };

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, isGenerating]); // Removed onComplete and maxProgress to prevent re-triggering

  // Show if actively generating OR if we have saved progress data to display
  if (!currentEvent) {
    return null;
  }

  const getStatusIcon = () => {
    if (currentEvent.stage === 'completed') {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    if (currentEvent.stage === 'error') {
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
    return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
  };

  const getProgressColor = () => {
    if (currentEvent.stage === 'completed') return 'bg-green-500';
    if (currentEvent.stage === 'error') return 'bg-red-500';
    return 'bg-blue-500';
  };

  return (
    <div className="border rounded-lg bg-muted/30 p-4">
      {/* Current Progress Bar */}
      <div className="flex items-center gap-3">
        {getStatusIcon()}
        <div className="flex-1">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium">
              {currentEvent.stage ? stageDisplayNames[currentEvent.stage] || currentEvent.stage : 'Processing...'}
            </span>
            <span className="text-muted-foreground text-xs font-mono">
              {currentEvent.progress !== undefined ? `${Math.round(currentEvent.progress)}%` : ''}
            </span>
          </div>
          {/* Progress bar */}
          {currentEvent.progress !== undefined && (
            <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
              <div
                className={`h-full ${getProgressColor()} transition-all duration-500 ease-out`}
                style={{ width: `${currentEvent.progress}%` }}
              />
            </div>
          )}
          {/* Current message */}
          {currentEvent.message && (
            <div className="text-xs text-muted-foreground">
              {currentEvent.message}
            </div>
          )}

          {/* DRC Iteration Details */}
          {currentEvent.details && (currentEvent.details.iteration !== undefined || currentEvent.details.violations) && (
            <div className="mt-2 pt-2 border-t border-border/50">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {currentEvent.details.iteration !== undefined && (
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Iteration:</span>
                    <span className="font-medium text-primary">
                      {currentEvent.details.iteration}/{currentEvent.details.maxIterations || 5}
                    </span>
                  </div>
                )}
                {currentEvent.details.violations && (
                  <>
                    {currentEvent.details.violations.critical !== undefined && (
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">Critical:</span>
                        <span className={`font-medium ${currentEvent.details.violations.critical === 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {currentEvent.details.violations.critical}
                        </span>
                      </div>
                    )}
                    {currentEvent.details.violations.warning !== undefined && (
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">Warnings:</span>
                        <span className="font-medium text-yellow-500">
                          {currentEvent.details.violations.warning}
                        </span>
                      </div>
                    )}
                    {currentEvent.details.violations.info !== undefined && (
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">Info:</span>
                        <span className="font-medium text-blue-500">
                          {currentEvent.details.violations.info}
                        </span>
                      </div>
                    )}
                  </>
                )}
                {currentEvent.details.passed && (
                  <div className="col-span-2 flex items-center gap-1 text-green-600">
                    <CheckCircle className="h-3 w-3" />
                    <span className="font-medium">DRC Passed!</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
