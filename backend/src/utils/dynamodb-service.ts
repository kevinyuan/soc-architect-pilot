// DynamoDB Service
// Handles project metadata storage and queries

import { PutCommand, GetCommand, UpdateCommand, DeleteCommand, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDBDocClient, DYNAMODB_PROJECTS_TABLE } from './aws-config';
import { v4 as uuidv4 } from 'uuid';

// Project shares table name
const DYNAMODB_PROJECT_SHARES_TABLE = process.env.DYNAMODB_PROJECT_SHARES_TABLE || 'soc-pilot-project-shares';

export interface ProjectMetadata {
  id: string;
  userId: string;
  name: string;
  description?: string;
  createdAt: string;
  lastModified: string;
  tags?: string[];
  metadata?: any;
}

export interface ProjectShare {
  id: string;
  projectId: string;
  ownerId: string;
  ownerEmail: string;
  sharedWithEmail: string;
  sharedWithUserId?: string;
  permission: 'read';
  createdAt: string;
}

export class DynamoDBService {
  /**
   * Create a new project metadata entry
   */
  async createProject(userId: string, name: string, description?: string, tags?: string[]): Promise<ProjectMetadata> {
    const project: ProjectMetadata = {
      id: uuidv4(),
      userId,
      name,
      description,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      tags: tags || [],
      metadata: {},
    };

    const command = new PutCommand({
      TableName: DYNAMODB_PROJECTS_TABLE,
      Item: project,
    });

    await dynamoDBDocClient.send(command);
    console.log(`✅ Created project metadata in DynamoDB: ${project.id}`);

    return project;
  }

  /**
   * Get project metadata by ID
   */
  async getProject(projectId: string): Promise<ProjectMetadata | null> {
    const command = new GetCommand({
      TableName: DYNAMODB_PROJECTS_TABLE,
      Key: {
        id: projectId,
      },
    });

    const response = await dynamoDBDocClient.send(command);
    return (response.Item as ProjectMetadata) || null;
  }

  /**
   * Update project metadata
   */
  async updateProject(projectId: string, updates: Partial<ProjectMetadata>): Promise<ProjectMetadata> {
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    // Build update expression dynamically
    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'userId' && key !== 'createdAt' && value !== undefined) {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
      }
    });

    // Always update lastModified
    updateExpressions.push('#lastModified = :lastModified');
    expressionAttributeNames['#lastModified'] = 'lastModified';
    expressionAttributeValues[':lastModified'] = new Date().toISOString();

    const command = new UpdateCommand({
      TableName: DYNAMODB_PROJECTS_TABLE,
      Key: {
        id: projectId,
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    const response = await dynamoDBDocClient.send(command);
    console.log(`✅ Updated project metadata in DynamoDB: ${projectId}`);

    return response.Attributes as ProjectMetadata;
  }

  /**
   * Delete project metadata
   */
  async deleteProject(projectId: string): Promise<void> {
    const command = new DeleteCommand({
      TableName: DYNAMODB_PROJECTS_TABLE,
      Key: {
        id: projectId,
      },
    });

    await dynamoDBDocClient.send(command);
    console.log(`🗑️  Deleted project metadata from DynamoDB: ${projectId}`);
  }

  /**
   * List all projects for a user
   */
  async listUserProjects(userId: string, filters?: { tags?: string[]; search?: string }): Promise<ProjectMetadata[]> {
    const command = new ScanCommand({
      TableName: DYNAMODB_PROJECTS_TABLE,
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
    });

    const response = await dynamoDBDocClient.send(command);
    let projects = (response.Items as ProjectMetadata[]) || [];

    // Apply filters
    if (filters?.tags && filters.tags.length > 0) {
      projects = projects.filter((p) =>
        filters.tags!.some((tag) => p.tags?.includes(tag))
      );
    }

    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      projects = projects.filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          p.description?.toLowerCase().includes(searchLower)
      );
    }

    // Sort by lastModified descending
    projects.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

    return projects;
  }

  /**
   * List all projects (admin function)
   */
  async listAllProjects(): Promise<ProjectMetadata[]> {
    const command = new ScanCommand({
      TableName: DYNAMODB_PROJECTS_TABLE,
    });

    const response = await dynamoDBDocClient.send(command);
    return (response.Items as ProjectMetadata[]) || [];
  }

  /**
   * Check if project exists
   */
  async projectExists(projectId: string): Promise<boolean> {
    const project = await this.getProject(projectId);
    return project !== null;
  }

  /**
   * Get projects by tag
   */
  async getProjectsByTag(userId: string, tag: string): Promise<ProjectMetadata[]> {
    const command = new ScanCommand({
      TableName: DYNAMODB_PROJECTS_TABLE,
      FilterExpression: 'userId = :userId AND contains(tags, :tag)',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':tag': tag,
      },
    });

    const response = await dynamoDBDocClient.send(command);
    return (response.Items as ProjectMetadata[]) || [];
  }

  /**
   * Share a project with another user
   */
  async shareProject(
    projectId: string,
    ownerId: string,
    ownerEmail: string,
    sharedWithEmail: string,
    sharedWithUserId?: string
  ): Promise<ProjectShare> {
    const share: ProjectShare = {
      id: uuidv4(),
      projectId,
      ownerId,
      ownerEmail,
      sharedWithEmail: sharedWithEmail.toLowerCase(),
      sharedWithUserId,
      permission: 'read',
      createdAt: new Date().toISOString(),
    };

    const command = new PutCommand({
      TableName: DYNAMODB_PROJECT_SHARES_TABLE,
      Item: share,
    });

    await dynamoDBDocClient.send(command);
    console.log(`✅ Shared project ${projectId} with ${sharedWithEmail}`);

    return share;
  }

  /**
   * Get all shares for a project
   */
  async getProjectShares(projectId: string): Promise<ProjectShare[]> {
    const command = new QueryCommand({
      TableName: DYNAMODB_PROJECT_SHARES_TABLE,
      IndexName: 'projectId-index',
      KeyConditionExpression: 'projectId = :projectId',
      ExpressionAttributeValues: {
        ':projectId': projectId,
      },
    });

    const response = await dynamoDBDocClient.send(command);
    return (response.Items as ProjectShare[]) || [];
  }

  /**
   * Get projects shared with a user by email
   */
  async getSharedProjects(userEmail: string): Promise<ProjectMetadata[]> {
    // Get all shares for this email
    const command = new QueryCommand({
      TableName: DYNAMODB_PROJECT_SHARES_TABLE,
      IndexName: 'sharedWithEmail-index',
      KeyConditionExpression: 'sharedWithEmail = :email',
      ExpressionAttributeValues: {
        ':email': userEmail.toLowerCase(),
      },
    });

    const response = await dynamoDBDocClient.send(command);
    const shares = (response.Items as ProjectShare[]) || [];

    // Get project metadata for each shared project
    const projects: ProjectMetadata[] = [];
    for (const share of shares) {
      const project = await this.getProject(share.projectId);
      if (project) {
        projects.push(project);
      }
    }

    // Sort by lastModified descending
    projects.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

    return projects;
  }

  /**
   * Remove a project share
   */
  async removeProjectShare(shareId: string): Promise<void> {
    const command = new DeleteCommand({
      TableName: DYNAMODB_PROJECT_SHARES_TABLE,
      Key: {
        id: shareId,
      },
    });

    await dynamoDBDocClient.send(command);
    console.log(`🗑️  Removed project share: ${shareId}`);
  }

  /**
   * Check if a project is shared with a user
   */
  async isProjectSharedWith(projectId: string, userEmail: string): Promise<boolean> {
    const shares = await this.getProjectShares(projectId);
    return shares.some((share) => share.sharedWithEmail === userEmail.toLowerCase());
  }
}

// Export singleton instance
export const dynamoDBService = new DynamoDBService();
