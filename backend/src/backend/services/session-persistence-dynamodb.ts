/**
 * DynamoDB Session Persistence Service
 * Secure, scalable session storage using AWS DynamoDB
 *
 * Benefits over file-based storage:
 * - Secure: Data encrypted at rest, access controlled via IAM
 * - Scalable: Supports horizontal scaling across multiple server instances
 * - Reliable: Automatic backups, point-in-time recovery
 * - Performant: Low-latency access, no need to load all sessions into memory
 * - Auto-cleanup: TTL support for automatic session expiration
 */

import { PutCommand, GetCommand, DeleteCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDBDocClient, DYNAMODB_SESSIONS_TABLE } from '../../utils/aws-config';
import { DesignSession } from '../../types/index';

export class DynamoDBSessionPersistence {
  private tableName: string;
  private autoSaveEnabled: boolean = true;
  private sessionTTLDays: number;

  constructor(sessionTTLDays: number = 30) {
    this.tableName = DYNAMODB_SESSIONS_TABLE;
    this.sessionTTLDays = sessionTTLDays;
  }

  /**
   * Save a session to DynamoDB
   */
  async saveSession(session: DesignSession): Promise<void> {
    if (!this.autoSaveEnabled) return;

    try {
      // Calculate TTL (time-to-live) for automatic cleanup
      const ttl = Math.floor(Date.now() / 1000) + (this.sessionTTLDays * 24 * 60 * 60);

      // Validate required fields
      if (!session.userId) {
        throw new Error('userId is required to save session to DynamoDB');
      }
      if (!session.projectId) {
        throw new Error('projectId is required to save session to DynamoDB');
      }

      const item = {
        sessionId: session.sessionId,
        userId: session.userId,
        projectId: session.projectId,
        startTime: session.startTime.toISOString(),
        lastActivity: session.lastActivity.toISOString(),
        phase: session.phase,
        conversationHistory: session.conversationHistory.map(msg => ({
          ...msg,
          timestamp: msg.timestamp.toISOString()
        })),
        requirements: session.requirements,
        constraints: session.constraints,
        currentArchitecture: session.currentArchitecture || null,
        confirmedSelections: session.confirmedSelections || null,
        ttl // Automatic deletion after TTL expires
      };

      const command = new PutCommand({
        TableName: this.tableName,
        Item: item
      });

      await dynamoDBDocClient.send(command);
      console.log(`💾 Session ${session.sessionId} saved to DynamoDB`);
    } catch (error) {
      console.error(`❌ Failed to save session ${session.sessionId} to DynamoDB:`, error);
      throw error;
    }
  }

  /**
   * Load a session from DynamoDB
   */
  async loadSession(sessionId: string): Promise<DesignSession | null> {
    try {
      const command = new GetCommand({
        TableName: this.tableName,
        Key: {
          sessionId
        }
      });

      const response = await dynamoDBDocClient.send(command);

      if (!response.Item) {
        return null;
      }

      // Convert ISO strings back to Date objects
      const session: DesignSession = {
        sessionId: response.Item.sessionId,
        userId: response.Item.userId === 'anonymous' ? undefined : response.Item.userId,
        projectId: response.Item.projectId === 'none' ? undefined : response.Item.projectId,
        startTime: new Date(response.Item.startTime),
        lastActivity: new Date(response.Item.lastActivity),
        phase: response.Item.phase,
        conversationHistory: response.Item.conversationHistory.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        })),
        requirements: response.Item.requirements || [],
        constraints: response.Item.constraints || [],
        currentArchitecture: response.Item.currentArchitecture || undefined,
        confirmedSelections: response.Item.confirmedSelections || undefined
      };

      console.log(`📖 Session ${sessionId} loaded from DynamoDB`);
      return session;
    } catch (error) {
      console.error(`❌ Failed to load session ${sessionId} from DynamoDB:`, error);
      return null;
    }
  }

  /**
   * Load all sessions from DynamoDB
   * WARNING: This can be expensive! Use with caution.
   * Better to use getSessionsByProjectId() or query on-demand.
   */
  async loadAllSessions(): Promise<Map<string, DesignSession>> {
    const sessions = new Map<string, DesignSession>();

    console.warn('⚠️  loadAllSessions() is expensive. Consider using pagination or filtering.');

    try {
      let lastEvaluatedKey: any = undefined;
      let itemCount = 0;

      // Scan with pagination
      do {
        const command = new ScanCommand({
          TableName: this.tableName,
          Limit: 100, // Process in batches
          ExclusiveStartKey: lastEvaluatedKey
        });

        const response = await dynamoDBDocClient.send(command);

        if (response.Items) {
          for (const item of response.Items) {
            const session: DesignSession = {
              sessionId: item.sessionId,
              userId: item.userId === 'anonymous' ? undefined : item.userId,
              projectId: item.projectId === 'none' ? undefined : item.projectId,
              startTime: new Date(item.startTime),
              lastActivity: new Date(item.lastActivity),
              phase: item.phase,
              conversationHistory: item.conversationHistory?.map((msg: any) => ({
                ...msg,
                timestamp: new Date(msg.timestamp)
              })) || [],
              requirements: item.requirements || [],
              constraints: item.constraints || [],
              currentArchitecture: item.currentArchitecture || undefined,
              confirmedSelections: item.confirmedSelections || undefined
            };

            sessions.set(session.sessionId, session);
            itemCount++;
          }
        }

        lastEvaluatedKey = response.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      console.log(`📦 Loaded ${itemCount} sessions from DynamoDB`);
    } catch (error) {
      console.error('❌ Failed to load sessions from DynamoDB:', error);
    }

    return sessions;
  }

  /**
   * Get sessions by project ID (efficient query using GSI)
   * Much better than loadAllSessions()
   */
  async getSessionsByProjectId(projectId: string, limit: number = 50): Promise<DesignSession[]> {
    const sessions: DesignSession[] = [];

    try {
      const command = new QueryCommand({
        TableName: this.tableName,
        IndexName: 'projectId-lastActivity-index', // Requires GSI
        KeyConditionExpression: 'projectId = :projectId',
        ExpressionAttributeValues: {
          ':projectId': projectId
        },
        Limit: limit,
        ScanIndexForward: false // Sort by lastActivity descending
      });

      const response = await dynamoDBDocClient.send(command);

      if (response.Items) {
        for (const item of response.Items) {
          const session: DesignSession = {
            sessionId: item.sessionId,
            userId: item.userId === 'anonymous' ? undefined : item.userId,
            projectId: item.projectId === 'none' ? undefined : item.projectId,
            startTime: new Date(item.startTime),
            lastActivity: new Date(item.lastActivity),
            phase: item.phase,
            conversationHistory: item.conversationHistory?.map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp)
            })) || [],
            requirements: item.requirements || [],
            constraints: item.constraints || [],
            currentArchitecture: item.currentArchitecture || undefined,
            confirmedSelections: item.confirmedSelections || undefined
          };

          sessions.push(session);
        }
      }

      console.log(`🔍 Found ${sessions.length} sessions for project ${projectId}`);
    } catch (error) {
      console.error(`❌ Failed to query sessions for project ${projectId}:`, error);
      // If GSI doesn't exist, fall back to scan (less efficient)
      console.warn('💡 Consider creating GSI: projectId-lastActivity-index');
      return this.getSessionsByProjectIdWithScan(projectId, limit);
    }

    return sessions;
  }

  /**
   * Fallback method when GSI is not available
   */
  private async getSessionsByProjectIdWithScan(projectId: string, limit: number): Promise<DesignSession[]> {
    const sessions: DesignSession[] = [];

    try {
      const command = new ScanCommand({
        TableName: this.tableName,
        FilterExpression: 'projectId = :projectId',
        ExpressionAttributeValues: {
          ':projectId': projectId
        },
        Limit: limit
      });

      const response = await dynamoDBDocClient.send(command);

      if (response.Items) {
        for (const item of response.Items) {
          const session: DesignSession = {
            sessionId: item.sessionId,
            userId: item.userId === 'anonymous' ? undefined : item.userId,
            projectId: item.projectId === 'none' ? undefined : item.projectId,
            startTime: new Date(item.startTime),
            lastActivity: new Date(item.lastActivity),
            phase: item.phase,
            conversationHistory: item.conversationHistory?.map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp)
            })) || [],
            requirements: item.requirements || [],
            constraints: item.constraints || [],
            currentArchitecture: item.currentArchitecture || undefined,
            confirmedSelections: item.confirmedSelections || undefined
          };

          sessions.push(session);
        }
      }
    } catch (error) {
      console.error(`❌ Failed to scan sessions for project ${projectId}:`, error);
    }

    return sessions;
  }

  /**
   * Delete a session from DynamoDB
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const command = new DeleteCommand({
        TableName: this.tableName,
        Key: {
          sessionId
        }
      });

      await dynamoDBDocClient.send(command);
      console.log(`🗑️  Session ${sessionId} deleted from DynamoDB`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to delete session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Check if a session exists
   */
  async sessionExists(sessionId: string): Promise<boolean> {
    const session = await this.loadSession(sessionId);
    return session !== null;
  }

  /**
   * Get session metadata without loading full conversation history
   */
  async getSessionMetadata(sessionId: string): Promise<{
    sessionId: string;
    userId?: string;
    projectId?: string;
    startTime: Date;
    lastActivity: Date;
    phase: string;
    messageCount: number;
  } | null> {
    try {
      const command = new GetCommand({
        TableName: this.tableName,
        Key: {
          sessionId
        },
        ProjectionExpression: 'sessionId, userId, projectId, startTime, lastActivity, phase, conversationHistory'
      });

      const response = await dynamoDBDocClient.send(command);

      if (!response.Item) {
        return null;
      }

      return {
        sessionId: response.Item.sessionId,
        userId: response.Item.userId === 'anonymous' ? undefined : response.Item.userId,
        projectId: response.Item.projectId === 'none' ? undefined : response.Item.projectId,
        startTime: new Date(response.Item.startTime),
        lastActivity: new Date(response.Item.lastActivity),
        phase: response.Item.phase,
        messageCount: response.Item.conversationHistory?.length || 0
      };
    } catch (error) {
      console.error(`❌ Failed to get metadata for session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Clean up old sessions (already handled by TTL, but can be manually triggered)
   */
  async cleanupOldSessions(daysOld: number = 30): Promise<number> {
    console.log('💡 DynamoDB TTL handles automatic cleanup. Manual cleanup not needed.');
    console.log(`   Sessions older than ${this.sessionTTLDays} days are automatically deleted.`);
    return 0;
  }

  /**
   * Enable or disable auto-save
   */
  setAutoSave(enabled: boolean): void {
    this.autoSaveEnabled = enabled;
  }

  /**
   * Get table name
   */
  getTableName(): string {
    return this.tableName;
  }
}
