/**
 * Session Persistence Service
 * Handles saving and loading chat sessions to/from disk
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { DesignSession } from '../../types/index';

export class SessionPersistence {
  private storageDir: string;
  private autoSaveEnabled: boolean = true;

  constructor(storageDir: string = './data/sessions') {
    this.storageDir = storageDir;
    this.ensureStorageDir();
  }

  /**
   * Ensure storage directory exists
   */
  private async ensureStorageDir(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create storage directory:', error);
    }
  }

  /**
   * Get file path for a session
   */
  private getSessionFilePath(sessionId: string): string {
    return path.join(this.storageDir, `${sessionId}.json`);
  }

  /**
   * Save a session to disk
   */
  async saveSession(session: DesignSession): Promise<void> {
    if (!this.autoSaveEnabled) return;

    try {
      const filePath = this.getSessionFilePath(session.sessionId);
      const data = JSON.stringify(session, null, 2);
      await fs.writeFile(filePath, data, 'utf-8');
      console.log(`Session ${session.sessionId} saved to disk`);
    } catch (error) {
      console.error(`Failed to save session ${session.sessionId}:`, error);
    }
  }

  /**
   * Load a session from disk
   */
  async loadSession(sessionId: string): Promise<DesignSession | null> {
    try {
      const filePath = this.getSessionFilePath(sessionId);
      const data = await fs.readFile(filePath, 'utf-8');
      const session = JSON.parse(data);

      // Convert date strings back to Date objects
      session.startTime = new Date(session.startTime);
      session.lastActivity = new Date(session.lastActivity);
      session.conversationHistory = session.conversationHistory.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      }));

      console.log(`Session ${sessionId} loaded from disk`);
      return session as DesignSession;
    } catch (error) {
      // Session file doesn't exist or is corrupted
      return null;
    }
  }

  /**
   * Load all sessions from disk
   */
  async loadAllSessions(): Promise<Map<string, DesignSession>> {
    const sessions = new Map<string, DesignSession>();

    try {
      await this.ensureStorageDir();
      const files = await fs.readdir(this.storageDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const sessionId = file.replace('.json', '');
          const session = await this.loadSession(sessionId);
          if (session) {
            sessions.set(sessionId, session);
          }
        }
      }

      console.log(`Loaded ${sessions.size} sessions from disk`);
    } catch (error) {
      console.error('Failed to load sessions from disk:', error);
    }

    return sessions;
  }

  /**
   * Delete a session from disk
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const filePath = this.getSessionFilePath(sessionId);
      await fs.unlink(filePath);
      console.log(`Session ${sessionId} deleted from disk`);
      return true;
    } catch (error) {
      console.error(`Failed to delete session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Check if a session exists on disk
   */
  async sessionExists(sessionId: string): Promise<boolean> {
    try {
      const filePath = this.getSessionFilePath(sessionId);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get session metadata without loading full conversation history
   */
  async getSessionMetadata(sessionId: string): Promise<{
    sessionId: string;
    userId?: string;
    startTime: Date;
    lastActivity: Date;
    phase: string;
    messageCount: number;
  } | null> {
    try {
      const session = await this.loadSession(sessionId);
      if (!session) return null;

      return {
        sessionId: session.sessionId,
        userId: session.userId,
        startTime: session.startTime,
        lastActivity: session.lastActivity,
        phase: session.phase,
        messageCount: session.conversationHistory.length
      };
    } catch {
      return null;
    }
  }

  /**
   * Clean up old sessions (older than specified days)
   */
  async cleanupOldSessions(daysOld: number = 30): Promise<number> {
    let deletedCount = 0;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    try {
      const files = await fs.readdir(this.storageDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const sessionId = file.replace('.json', '');
          const metadata = await this.getSessionMetadata(sessionId);

          if (metadata && metadata.lastActivity < cutoffDate) {
            await this.deleteSession(sessionId);
            deletedCount++;
          }
        }
      }

      console.log(`Cleaned up ${deletedCount} old sessions`);
    } catch (error) {
      console.error('Failed to cleanup old sessions:', error);
    }

    return deletedCount;
  }

  /**
   * Enable or disable auto-save
   */
  setAutoSave(enabled: boolean): void {
    this.autoSaveEnabled = enabled;
  }

  /**
   * Get storage directory
   */
  getStorageDir(): string {
    return this.storageDir;
  }
}
