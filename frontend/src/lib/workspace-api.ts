// Workspace API Client
// Manages workspace and project files

import { apiClient } from './api-client';

export interface WorkspaceConfig {
  workspaceRoot: string;
  projectsDir: string;
  templatesDir: string;
  initialized: boolean;
}

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
  metadata?: any;
}

export interface ProjectFilters {
  tags?: string[];
  search?: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  components: any[];
}

export const workspaceAPI = {
  async init(): Promise<WorkspaceConfig> {
    return await apiClient.post<WorkspaceConfig>('/workspace/init');
  },

  /**
   * Generate a meaningful project name using AI (fast, cost-effective)
   * @param message - User's project requirements/description
   * @returns AI-generated project name
   */
  async generateProjectName(message: string): Promise<string> {
    const response = await apiClient.post<{ projectName: string; generationTime: number }>(
      '/workspace/projects/generate-name',
      { message },
      { timeout: 10000 } // 10 seconds timeout for AI generation
    );
    return response.projectName;
  },

  async createProject(request: ProjectCreateRequest): Promise<Project> {
    return await apiClient.post<Project>('/workspace/projects', request);
  },

  async createProjectFromTemplate(
    templateId: string,
    name: string,
    description?: string
  ): Promise<Project> {
    return await apiClient.post<Project>('/workspace/projects/from-template', {
      templateId,
      name,
      description,
    });
  },

  async listProjects(filters?: ProjectFilters): Promise<Project[]> {
    return await apiClient.get<Project[]>('/workspace/projects', filters);
  },

  async getProject(projectId: string): Promise<Project> {
    return await apiClient.get<Project>(`/workspace/projects/${projectId}`);
  },

  async updateProject(projectId: string, updates: Partial<Project>): Promise<Project> {
    return await apiClient.put<Project>(`/workspace/projects/${projectId}`, updates);
  },

  async deleteProject(projectId: string): Promise<void> {
    await apiClient.delete(`/workspace/projects/${projectId}`);
  },

  async duplicateProject(projectId: string, newName: string): Promise<Project> {
    return await apiClient.post<Project>(`/workspace/projects/${projectId}/duplicate`, {
      newName,
    });
  },

  async saveSession(projectId: string, sessionId: string, sessionData: any): Promise<void> {
    await apiClient.put(`/workspace/projects/${projectId}/sessions/${sessionId}`, sessionData);
  },

  async loadSession(projectId: string, sessionId: string): Promise<any> {
    return await apiClient.get(`/workspace/projects/${projectId}/sessions/${sessionId}`);
  },

  async deleteSession(projectId: string, sessionId: string): Promise<void> {
    await apiClient.delete(`/workspace/projects/${projectId}/sessions/${sessionId}`);
  },

  async saveDiagram(projectId: string, diagramId: string, diagramData: any): Promise<void> {
    await apiClient.put(`/workspace/projects/${projectId}/diagrams/${diagramId}`, diagramData);
  },

  async loadDiagram(projectId: string, diagramId: string): Promise<any> {
    return await apiClient.get(`/workspace/projects/${projectId}/diagrams/${diagramId}`);
  },

  async deleteDiagram(projectId: string, diagramId: string): Promise<void> {
    await apiClient.delete(`/workspace/projects/${projectId}/diagrams/${diagramId}`);
  },

  async listTemplates(): Promise<Template[]> {
    return await apiClient.get<Template[]>('/workspace/templates');
  },

  async exportProject(projectId: string, options?: any): Promise<string> {
    return await apiClient.post<string>(`/workspace/projects/${projectId}/export`, options);
  },

  async importProject(importData: string): Promise<Project> {
    return await apiClient.post<Project>('/workspace/projects/import', { importData });
  },

  async shareProject(projectId: string, sharedWithEmail: string): Promise<any> {
    return await apiClient.post(`/workspace/projects/${projectId}/share`, { sharedWithEmail });
  },

  async getSharedProjects(): Promise<Project[]> {
    return await apiClient.get<Project[]>('/workspace/projects/shared');
  },

  async getProjectShares(projectId: string): Promise<any[]> {
    return await apiClient.get<any[]>(`/workspace/projects/${projectId}/shares`);
  },

  async validateEmail(email: string): Promise<{ exists: boolean; user: any }> {
    return await apiClient.post('/auth/validate-email', { email });
  },

  async hasAnalytics(projectId: string): Promise<boolean> {
    try {
      const response = await apiClient.get(`/architecture-analytics/project/${projectId}`);
      return !!response;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return false;
      }
      throw error;
    }
  },
};
