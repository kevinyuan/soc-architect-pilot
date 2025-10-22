/**
 * Architecture Generation Progress Tracker
 * Manages real-time progress updates during architecture generation
 */

import { EventEmitter } from 'events';

export interface ProgressEvent {
  sessionId: string;
  stage: 'started' | 'extracting' | 'ai_inference' | 'generating_spec' | 'ai_fix' | 'refining_spec' | 'generating_diagram' | 'drc_check' | 'optimizing_layout' | 'verify_diagram' | 's3_upload' | 'completed' | 'error';
  message: string;
  progress: number; // 0-100
  timestamp: Date;
  details?: any;
}

export class GenerationProgressTracker extends EventEmitter {
  private static instance: GenerationProgressTracker;
  private activeGenerations: Map<string, ProgressEvent[]> = new Map();

  private constructor() {
    super();
    this.setMaxListeners(100); // Allow many concurrent sessions
  }

  static getInstance(): GenerationProgressTracker {
    if (!GenerationProgressTracker.instance) {
      GenerationProgressTracker.instance = new GenerationProgressTracker();
    }
    return GenerationProgressTracker.instance;
  }

  /**
   * Emit progress event for a session
   */
  emitProgress(event: ProgressEvent): void {
    // Store event
    if (!this.activeGenerations.has(event.sessionId)) {
      this.activeGenerations.set(event.sessionId, []);
    }
    this.activeGenerations.get(event.sessionId)!.push(event);

    // Emit event
    this.emit(`progress:${event.sessionId}`, event);
    console.log(`📊 [PROGRESS] ${event.sessionId} - ${event.stage}: ${event.message} (${event.progress}%)`);
  }

  /**
   * Get all progress events for a session
   */
  getProgress(sessionId: string): ProgressEvent[] {
    return this.activeGenerations.get(sessionId) || [];
  }

  /**
   * Clear progress for a session
   */
  clearProgress(sessionId: string): void {
    this.activeGenerations.delete(sessionId);
    this.removeAllListeners(`progress:${sessionId}`);
  }

  /**
   * Helper method to emit stage progress
   */
  emitStage(
    sessionId: string,
    stage: ProgressEvent['stage'],
    message: string,
    progress: number,
    details?: any
  ): void {
    this.emitProgress({
      sessionId,
      stage,
      message,
      progress,
      timestamp: new Date(),
      details
    });
  }
}
