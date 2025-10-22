/**
 * Generation Timeline Component
 * Displays complete architecture generation process with all steps in chronological order
 * Shows historical progress instead of rolling updates
 */

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, CheckCircle, AlertCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';

interface ProgressEvent {
  type: 'connected' | 'progress';
  stage?: 'started' | 'extracting' | 'ai_inference' | 'generating_spec' | 'ai_fix' | 'generating_diagram' | 'optimizing_layout' | 'verify_diagram' | 'drc_check' | 's3_upload' | 'completed' | 'error';
  message?: string;
  progress?: number;
  timestamp?: string;
  details?: any;
}

interface GenerationTimelineProps {
  sessionId: string | null;
  isGenerating: boolean;
  onComplete?: (finalProgressData: any) => void;
  savedProgressData?: {
    stage: string;
    progress: number;
    message?: string;
    details?: any;
  } | null;
}

const stageDisplayNames: Record<string, string> = {
  started: 'Starting Generation',
  extracting: 'Extracting Requirements',
  ai_inference: 'AI Analyzing Requirements',
  generating_spec: 'Generating Specification (arch_spec.md)',
  ai_fix: 'AI Validating Spec Alignment',
  refining_spec: 'Refining Spec with Use Cases & Data Flows',
  generating_diagram: 'Generating Diagram (arch_diagram.json)',
  drc_check: 'Design Rule Check (DRC)',
  optimizing_layout: 'Optimizing Layout',
  verify_diagram: 'Verifying Diagram Alignment',
  s3_upload: 'Uploading to S3',
  completed: 'Completed',
  error: 'Error'
};

const stageWeights: Record<string, number> = {
  started: 0,
  extracting: 5,
  ai_inference: 10,
  generating_spec: 20,
  ai_fix: 25,
  refining_spec: 30,
  generating_diagram: 40,
  verify_diagram: 50,
  drc_check: 60,
  optimizing_layout: 80,
  s3_upload: 90,
  completed: 100
};

export const GenerationTimeline: React.FC<GenerationTimelineProps> = ({
  sessionId,
  isGenerating,
  onComplete,
  savedProgressData
}) => {
  const [progressHistory, setProgressHistory] = useState<ProgressEvent[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [maxProgress, setMaxProgress] = useState<number>(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const onCompleteRef = useRef(onComplete);
  const timelineEndRef = useRef<HTMLDivElement>(null);

  // Keep onComplete ref up to date
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Auto-scroll to latest step when new event arrives
  useEffect(() => {
    if (!isCollapsed && timelineEndRef.current) {
      timelineEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [progressHistory, isCollapsed]);

  // If we have savedProgressData and not actively generating, show completed state
  useEffect(() => {
    if (savedProgressData && !isGenerating && progressHistory.length === 0) {
      setProgressHistory([{
        type: 'progress',
        stage: savedProgressData.stage as any,
        progress: savedProgressData.progress,
        message: savedProgressData.message,
        details: savedProgressData.details,
        timestamp: new Date().toISOString()
      }]);
      setMaxProgress(savedProgressData.progress);
    }
  }, [savedProgressData, isGenerating, progressHistory.length]);

  useEffect(() => {
    console.log(`[Timeline] useEffect triggered - sessionId: ${sessionId}, isGenerating: ${isGenerating}`);
    
    if (!sessionId || !isGenerating) {
      console.log(`[Timeline] Cleaning up - sessionId: ${!!sessionId}, isGenerating: ${isGenerating}`);
      // Clean up
      if (eventSourceRef.current) {
        console.log(`[Timeline] Closing SSE connection due to cleanup`);
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (!isGenerating && progressHistory.length === 0) {
        setProgressHistory([]);
        setMaxProgress(0);
      }
      return;
    }

    console.log(`[Timeline] Starting new SSE connection`);
    // Reset progress when new generation starts
    setProgressHistory([]);
    setMaxProgress(0);
    setIsCollapsed(false);

    // Close any existing connection
    if (eventSourceRef.current) {
      console.log('[Timeline] Closing existing SSE connection');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Set timeout to detect stuck generation (no progress for 30s)
    let lastProgressTime = Date.now();
    let lastProgressEvent: any = null;
    const stuckCheckInterval = setInterval(() => {
      const timeSinceLastProgress = Date.now() - lastProgressTime;
      if (timeSinceLastProgress > 30000) {
        console.warn('[Timeline] ⚠️ No progress for 30s - generation may be stuck');
        console.warn('[Timeline] Last progress:', lastProgressEvent);
        console.warn('[Timeline] This is normal for long-running AI operations (spec refinement, DRC, etc.)');
        clearInterval(stuckCheckInterval);
      }
    }, 5000);

    // Get auth token
    const token = typeof window !== 'undefined'
      ? localStorage.getItem('auth_token')
      : null;

    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

    const sseUrl = token
      ? `${backendUrl}/chat/session/${sessionId}/generation-progress?token=${encodeURIComponent(token)}`
      : `${backendUrl}/chat/session/${sessionId}/generation-progress`;

    console.log('[Timeline] Establishing new SSE connection for session:', sessionId);
    console.log('[Timeline] SSE URL:', sseUrl);
    const eventSource = new EventSource(sseUrl);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[Timeline] ✅ SSE connection opened successfully');
    };

    eventSource.onmessage = (event) => {
      try {
        const data: ProgressEvent = JSON.parse(event.data);
        console.log('[Timeline] Received event:', data);

        if (data.type === 'progress') {
          // Calculate progress
          let calculatedProgress = data.progress;
          if (calculatedProgress === undefined && data.stage) {
            calculatedProgress = stageWeights[data.stage] || 0;
          }

          // Update max progress
          if (calculatedProgress !== undefined) {
            setMaxProgress(prev => Math.max(prev, calculatedProgress));
            data.progress = calculatedProgress;
          }

          // Add timestamp if not present
          if (!data.timestamp) {
            data.timestamp = new Date().toISOString();
          }

          // Append to history (not replace!)
          setProgressHistory(prev => [...prev, data]);
          
          // Update last progress time and event
          lastProgressTime = Date.now();
          lastProgressEvent = data;

          // Check if completed
          if (data.stage === 'completed') {
            const finalProgressData = {
              stage: data.stage,
              progress: data.progress || 100,
              message: data.message,
              details: data.details
            };

            // Call immediately - don't delay
            console.log('[Timeline] Generation completed, calling onComplete callback');
            onCompleteRef.current?.(finalProgressData);
          }
        }
      } catch (error) {
        console.error('[Timeline] Error parsing SSE data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[Timeline] ❌ SSE connection error:', error);
      console.error('[Timeline] SSE readyState:', eventSource.readyState);
      console.error('[Timeline] SSE URL:', sseUrl);
      
      // Check if this is a connection failure vs normal close
      if (eventSource.readyState === EventSource.CONNECTING) {
        console.error('[Timeline] SSE is reconnecting...');
      } else if (eventSource.readyState === EventSource.CLOSED) {
        console.warn('[Timeline] SSE connection closed');
      }
      
      // Don't close immediately - let browser retry
      // Only close if we've been stuck for too long
      setTimeout(() => {
        if (eventSource.readyState === EventSource.CLOSED) {
          eventSourceRef.current = null;
        }
      }, 5000);
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (stuckCheckInterval) {
        clearInterval(stuckCheckInterval);
      }
    };
  }, [sessionId, isGenerating]);

  if (progressHistory.length === 0) {
    return null;
  }

  const latestEvent = progressHistory[progressHistory.length - 1];
  const currentProgress = latestEvent.progress || 0;

  const getStatusIcon = (event: ProgressEvent) => {
    if (event.stage === 'completed') {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    if (event.stage === 'error') {
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
    // Check if this is the latest event (still in progress)
    const isLatest = progressHistory[progressHistory.length - 1] === event;
    if (isLatest && isGenerating) {
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    }
    return <CheckCircle className="h-4 w-4 text-green-500" />;
  };

  const getProgressColor = () => {
    if (latestEvent.stage === 'completed') return 'bg-green-500';
    if (latestEvent.stage === 'error') return 'bg-red-500';
    return 'bg-blue-500';
  };

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  const formatStageName = (event: ProgressEvent) => {
    const baseName = event.stage ? stageDisplayNames[event.stage] || event.stage : 'Processing...';

    // Append iteration count if available
    if (event.details?.iteration !== undefined && event.details?.maxIterations !== undefined) {
      return `${baseName} ${event.details.iteration}/${event.details.maxIterations}`;
    }

    return baseName;
  };

  return (
    <div className="bg-card text-card-foreground p-2.5 rounded-lg text-sm self-start max-w-[90%]">
      {/* Header with title and collapse button */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isGenerating && latestEvent.stage !== 'completed' && latestEvent.stage !== 'error' ? (
            <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
          ) : latestEvent.stage === 'completed' ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : latestEvent.stage === 'error' ? (
            <AlertCircle className="h-4 w-4 text-red-500" />
          ) : (
            <Clock className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-semibold text-sm">Architecture Generation Timeline</span>
        </div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
          aria-label={isCollapsed ? "Expand timeline" : "Collapse timeline"}
        >
          {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>

      {/* Overall Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-muted-foreground">Overall Progress</span>
          <span className="font-mono font-medium">{Math.round(currentProgress)}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full ${getProgressColor()} transition-all duration-500 ease-out`}
            style={{ width: `${currentProgress}%` }}
          />
        </div>
      </div>

      {/* Timeline Steps - Collapsible */}
      {!isCollapsed && (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
          {progressHistory.map((event, index) => (
            <div
              key={index}
              className="flex items-start gap-3 p-2 rounded-md bg-background/50 hover:bg-background/80 transition-colors"
            >
              {/* Status Icon */}
              <div className="flex-shrink-0 mt-0.5">
                {getStatusIcon(event)}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Stage Name and Timestamp */}
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-medium text-sm">
                    {formatStageName(event)}
                  </span>
                  {event.timestamp && (
                    <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
                      {formatTimestamp(event.timestamp)}
                    </span>
                  )}
                </div>

                {/* Details (DRC, iteration info, alignment scores, etc.) */}
                {event.details && (event.details.iteration !== undefined || event.details.violations || event.details.score !== undefined) && (
                  <div className="mt-2 p-2 rounded bg-muted/50 border border-border/50">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {/* Iteration info */}
                      {event.details.iteration !== undefined && (
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">Iteration:</span>
                          <span className="font-medium text-primary">
                            {event.details.iteration}/{event.details.maxIterations || 5}
                          </span>
                        </div>
                      )}

                      {/* Alignment score (for both spec_alignment and diagram_alignment) */}
                      {event.details.score !== undefined && (
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">
                            {event.details.stage === 'diagram_alignment' ? 'Diagram Score:' : 'Spec Score:'}
                          </span>
                          <span className={`font-medium ${
                            event.details.stage === 'diagram_alignment'
                              ? (event.details.score >= 80 ? 'text-green-500' : 'text-yellow-500')
                              : (event.details.score >= 70 ? 'text-green-500' : 'text-yellow-500')
                          }`}>
                            {event.details.score}/100
                          </span>
                        </div>
                      )}

                      {/* Issues count for alignment checks */}
                      {event.details.issuesCount !== undefined && event.details.issuesCount > 0 && (
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">Issues:</span>
                          <span className="font-medium text-orange-500">
                            {event.details.issuesCount}
                          </span>
                        </div>
                      )}

                      {/* DRC violations */}
                      {event.details.violations && (
                        <>
                          {event.details.violations.critical !== undefined && (
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">Critical:</span>
                              <span className={`font-medium ${event.details.violations.critical === 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {event.details.violations.critical}
                              </span>
                            </div>
                          )}
                          {event.details.violations.warning !== undefined && (
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">Warnings:</span>
                              <span className="font-medium text-yellow-500">
                                {event.details.violations.warning}
                              </span>
                            </div>
                          )}
                        </>
                      )}

                      {/* Passed status (DRC) */}
                      {event.details.passed && (
                        <div className="col-span-2 flex items-center gap-1 text-green-600">
                          <CheckCircle className="h-3 w-3" />
                          <span className="font-medium">DRC Validation Passed!</span>
                        </div>
                      )}

                      {/* Aligned status (Spec or Diagram alignment) */}
                      {event.details.aligned && (
                        <div className="col-span-2 flex items-center gap-1 text-green-600">
                          <CheckCircle className="h-3 w-3" />
                          <span className="font-medium">
                            {event.details.stage === 'diagram_alignment' ? 'Diagram Aligned!' : 'Specification Aligned!'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          {/* Scroll anchor */}
          <div ref={timelineEndRef} />
        </div>
      )}

      {/* Collapsed summary */}
      {isCollapsed && (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium">{progressHistory.length}</span> steps •
          Latest: <span className="font-medium">{latestEvent.stage ? stageDisplayNames[latestEvent.stage] : 'Processing'}</span>
        </div>
      )}
    </div>
  );
};
