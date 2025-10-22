// AWS-Enabled Workspace Service
// Uses S3 for file storage and DynamoDB for metadata

import { s3Storage } from './s3-storage';
import { dynamoDBService, ProjectMetadata } from './dynamodb-service';
import { v4 as uuidv4 } from 'uuid';

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  lastModified: Date;
  tags?: string[];
  metadata?: any;
}

export interface ProjectCreateRequest {
  name: string;
  description?: string;
  tags?: string[];
  userId: string;
}

export interface ProjectFilters {
  tags?: string[];
  search?: string;
}

export class WorkspaceAWSService {
  /**
   * Create a new project
   */
  async createProject(request: ProjectCreateRequest): Promise<Project> {
    const { userId, name, description, tags } = request;

    // Create project metadata in DynamoDB
    const projectMeta = await dynamoDBService.createProject(userId, name, description, tags);

    // Create initial project structure in S3
    const initialMetadata = {
      id: projectMeta.id,
      name: projectMeta.name,
      description: projectMeta.description,
      createdAt: projectMeta.createdAt,
      lastModified: projectMeta.lastModified,
      version: '1.0.0',
    };

    await s3Storage.uploadFile(
      userId,
      projectMeta.id,
      'metadata.json',
      JSON.stringify(initialMetadata, null, 2),
      'application/json'
    );

    return this.convertToProject(projectMeta);
  }

  /**
   * Get project by ID
   */
  async getProject(projectId: string): Promise<Project | null> {
    const projectMeta = await dynamoDBService.getProject(projectId);
    
    if (!projectMeta) {
      return null;
    }

    return this.convertToProject(projectMeta);
  }

  /**
   * List projects for a user
   */
  async listProjects(userId: string, filters?: ProjectFilters): Promise<Project[]> {
    const projectsMeta = await dynamoDBService.listUserProjects(userId, filters);
    return projectsMeta.map((meta) => this.convertToProject(meta));
  }

  /**
   * Update project
   */
  async updateProject(projectId: string, updates: Partial<Project>): Promise<Project> {
    // Convert Date fields to ISO strings for DynamoDB
    const metaUpdates: Partial<ProjectMetadata> = {
      ...updates,
      createdAt: updates.createdAt?.toISOString(),
      lastModified: updates.lastModified?.toISOString(),
    };
    
    const projectMeta = await dynamoDBService.updateProject(projectId, metaUpdates);
    return this.convertToProject(projectMeta);
  }

  /**
   * Delete project
   */
  async deleteProject(projectId: string): Promise<void> {
    // Get project to find userId
    const project = await dynamoDBService.getProject(projectId);
    
    if (!project) {
      throw new Error('Project not found');
    }

    // Delete all files from S3
    await s3Storage.deleteProject(project.userId, projectId);

    // Delete metadata from DynamoDB
    await dynamoDBService.deleteProject(projectId);
  }

  /**
   * Duplicate project
   */
  async duplicateProject(projectId: string, newName: string): Promise<Project> {
    const sourceProject = await dynamoDBService.getProject(projectId);
    
    if (!sourceProject) {
      throw new Error('Source project not found');
    }

    // Create new project metadata
    const newProject = await dynamoDBService.createProject(
      sourceProject.userId,
      newName,
      sourceProject.description,
      sourceProject.tags
    );

    // Copy all files in S3
    await s3Storage.copyProject(sourceProject.userId, projectId, newProject.id);

    return this.convertToProject(newProject);
  }

  /**
   * Save diagram to S3
   * Uses relative path: arch_diagram.json (project root)
   */
  async saveDiagram(projectId: string, diagramId: string, diagramData: any): Promise<void> {
    const project = await dynamoDBService.getProject(projectId);
    
    if (!project) {
      throw new Error('Project not found');
    }

    // Ensure diagram has unified metadata format
    const { DiagramMetadataService } = await import('../backend/services/diagram-metadata');
    const diagramWithMetadata = DiagramMetadataService.updateForManualEdit(diagramData);

    // Save to project root as arch_diagram.json (consistent with load)
    const relativePath = 'arch_diagram.json';
    await s3Storage.uploadFile(
      project.userId,
      projectId,
      relativePath,
      JSON.stringify(diagramWithMetadata, null, 2),
      'application/json'
    );

    // Update project lastModified
    await dynamoDBService.updateProject(projectId, {});
  }

  /**
   * Load diagram from S3
   * Uses relative path: arch_diagram.json (project root)
   */
  async loadDiagram(projectId: string, diagramId: string): Promise<any | null> {
    const project = await dynamoDBService.getProject(projectId);
    
    if (!project) {
      throw new Error('Project not found');
    }

    // Load from project root as arch_diagram.json (consistent with save)
    const relativePath = 'arch_diagram.json';
    const content = await s3Storage.downloadFile(project.userId, projectId, relativePath);

    if (!content) {
      return null;
    }

    return JSON.parse(content);
  }

  /**
   * Delete diagram from S3
   * Uses relative path: arch_diagram.json (project root)
   */
  async deleteDiagram(projectId: string, diagramId: string): Promise<void> {
    const project = await dynamoDBService.getProject(projectId);
    
    if (!project) {
      throw new Error('Project not found');
    }

    // Delete from project root as arch_diagram.json (consistent with save/load)
    const relativePath = 'arch_diagram.json';
    await s3Storage.deleteFile(project.userId, projectId, relativePath);
  }

  /**
   * Save analytics results to S3
   * Uses relative path: analytics.json (project root)
   */
  async saveAnalytics(projectId: string, analyticsData: any): Promise<void> {
    const project = await dynamoDBService.getProject(projectId);
    
    if (!project) {
      throw new Error('Project not found');
    }

    const relativePath = 'analytics.json';
    
    // Upload analytics results (will overwrite if exists)
    await s3Storage.uploadFile(
      project.userId,
      projectId,
      relativePath,
      JSON.stringify(analyticsData, null, 2),
      'application/json'
    );

    // Update project lastModified
    await dynamoDBService.updateProject(projectId, {});
  }

  /**
   * Load analytics results from S3
   * Uses relative path: analytics.json (project root)
   */
  async loadAnalytics(projectId: string): Promise<any | null> {
    const project = await dynamoDBService.getProject(projectId);
    
    if (!project) {
      throw new Error('Project not found');
    }

    const relativePath = 'analytics.json';
    const content = await s3Storage.downloadFile(project.userId, projectId, relativePath);

    if (!content) {
      return null;
    }

    return JSON.parse(content);
  }

  /**
   * Check if analytics file exists
   */
  async hasAnalytics(projectId: string): Promise<boolean> {
    const project = await dynamoDBService.getProject(projectId);
    
    if (!project) {
      return false;
    }

    const relativePath = 'analytics.json';
    return await s3Storage.fileExists(project.userId, projectId, relativePath);
  }

  /**
   * Save session to S3
   * Uses relative path: sessions/{sessionId}.json
   */
  async saveSession(projectId: string, sessionData: any): Promise<void> {
    const project = await dynamoDBService.getProject(projectId);
    
    if (!project) {
      throw new Error('Project not found');
    }

    const sessionId = sessionData.id || uuidv4();
    const relativePath = `sessions/${sessionId}.json`;
    
    await s3Storage.uploadFile(
      project.userId,
      projectId,
      relativePath,
      JSON.stringify(sessionData, null, 2),
      'application/json'
    );
  }

  /**
   * Load session from S3
   * Uses relative path: sessions/{sessionId}.json
   */
  async loadSession(projectId: string, sessionId: string): Promise<any | null> {
    const project = await dynamoDBService.getProject(projectId);
    
    if (!project) {
      throw new Error('Project not found');
    }

    const relativePath = `sessions/${sessionId}.json`;
    const content = await s3Storage.downloadFile(project.userId, projectId, relativePath);

    if (!content) {
      return null;
    }

    return JSON.parse(content);
  }

  /**
   * Delete session from S3
   * Uses relative path: sessions/{sessionId}.json
   */
  async deleteSession(projectId: string, sessionId: string): Promise<void> {
    const project = await dynamoDBService.getProject(projectId);
    
    if (!project) {
      throw new Error('Project not found');
    }

    const relativePath = `sessions/${sessionId}.json`;
    await s3Storage.deleteFile(project.userId, projectId, relativePath);
  }

  /**
   * List templates (placeholder - can be implemented later)
   */
  async listTemplates(): Promise<any[]> {
    // TODO: Implement template storage in S3
    return [];
  }

  /**
   * Export project
   */
  async exportProject(projectId: string, options?: any): Promise<string> {
    const project = await dynamoDBService.getProject(projectId);
    
    if (!project) {
      throw new Error('Project not found');
    }

    // List all files in the project
    const files = await s3Storage.listProjectFiles(project.userId, projectId);

    // Download all files using relative paths
    const fileContents: Record<string, string> = {};
    
    for (const file of files) {
      const content = await s3Storage.downloadFile(project.userId, projectId, file.path);
      if (content) {
        fileContents[file.path] = content;
      }
    }

    // Create export package
    const exportData = {
      project: this.convertToProject(project),
      files: fileContents,
      exportedAt: new Date().toISOString(),
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import project
   */
  async importProject(importData: string): Promise<Project> {
    const data = JSON.parse(importData);
    
    // Create new project
    const newProject = await this.createProject({
      userId: data.project.userId || 'default',
      name: data.project.name + ' (Imported)',
      description: data.project.description,
      tags: data.project.tags,
    });

    // Upload all files using relative paths
    const project = await dynamoDBService.getProject(newProject.id);
    if (!project) {
      throw new Error('Failed to create project');
    }

    for (const [relativePath, content] of Object.entries(data.files)) {
      // Determine content type based on file extension
      let contentType = 'application/json';
      if (relativePath.endsWith('.c') || relativePath.endsWith('.h')) {
        contentType = 'text/plain';
      }
      
      // If this is arch_diagram.json, ensure it has unified metadata
      let fileContent = content as string;
      if (relativePath === 'arch_diagram.json') {
        const { DiagramMetadataService } = await import('../backend/services/diagram-metadata');
        const diagram = JSON.parse(fileContent);
        const diagramWithMetadata = DiagramMetadataService.setForImport(diagram);
        fileContent = JSON.stringify(diagramWithMetadata, null, 2);
      }
      
      await s3Storage.uploadFile(
        project.userId,
        newProject.id,
        relativePath,
        fileContent,
        contentType
      );
    }

    return newProject;
  }

  /**
   * Create project from template
   */
  async createProjectFromTemplate(
    templateId: string,
    name: string,
    description?: string
  ): Promise<Project> {
    // TODO: Implement template-based project creation
    throw new Error('Template-based project creation not yet implemented');
  }

  /**
   * Helper: Convert DynamoDB metadata to Project
   */
  private convertToProject(meta: ProjectMetadata): Project {
    return {
      id: meta.id,
      name: meta.name,
      description: meta.description,
      createdAt: new Date(meta.createdAt),
      lastModified: new Date(meta.lastModified),
      tags: meta.tags,
      metadata: meta.metadata,
    };
  }
}

// Export singleton instance
export const workspaceAWSService = new WorkspaceAWSService();
