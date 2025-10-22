// Workspace File API Client
// Handles all workspace file operations via backend API

import { apiClient } from './api-client';

export interface WorkspaceFile {
  path: string;
  name: string;
  size: number;
  lastModified: string;
  isDirectory: boolean;
}

export interface FileReadResponse {
  content: string;
  path: string;
  lastModified: string;
  size: number;
  contentType: string;
}

export interface FileWriteResponse {
  path: string;
  lastModified: string;
  size: number;
}

export interface FileListResponse {
  files: WorkspaceFile[];
}

/**
 * Workspace File API Client
 */
export const workspaceFileAPI = {
  /**
   * Read a workspace file
   * @param projectId - Project ID
   * @param relativePath - Relative path within project (e.g., "2-lib/app_components.lib")
   * @returns File content or null if not found
   */
  async readFile(projectId: string | null, relativePath: string): Promise<string | null> {
    if (!projectId) {
      throw new Error('Project ID is required');
    }
    try {
      const result = await apiClient.get<FileReadResponse>(
        `/workspace/projects/${projectId}/files`,
        { path: relativePath }
      );
      return result.content;
    } catch (error: any) {
      if (error.code === 'NOT_FOUND_ERROR') {
        return null; // File not found
      }
      throw error;
    }
  },

  /**
   * Write a workspace file
   * @param projectId - Project ID
   * @param relativePath - Relative path within project
   * @param content - File content
   */
  async writeFile(
    projectId: string,
    relativePath: string,
    content: string
  ): Promise<FileWriteResponse> {
    return apiClient.put<FileWriteResponse>(
      `/workspace/projects/${projectId}/files`,
      {
        path: relativePath,
        content,
      }
    );
  },

  /**
   * Delete a workspace file
   * @param projectId - Project ID
   * @param relativePath - Relative path within project
   */
  async deleteFile(projectId: string, relativePath: string): Promise<void> {
    await apiClient.delete<void>(
      `/workspace/projects/${projectId}/files`,
      {
        params: { path: relativePath }
      }
    );
  },

  /**
   * List files in a directory
   * @param projectId - Project ID
   * @param directoryPath - Optional directory path (empty string for root)
   * @returns Array of files
   */
  async listFiles(
    projectId: string,
    directoryPath: string = ''
  ): Promise<WorkspaceFile[]> {
    const params = directoryPath ? { path: directoryPath } : undefined;
    const result = await apiClient.get<FileListResponse>(
      `/workspace/projects/${projectId}/files/list`,
      params
    );
    return result.files;
  },

  /**
   * Check if a file exists
   * @param projectId - Project ID
   * @param relativePath - Relative path within project
   * @returns True if file exists, false otherwise
   */
  async fileExists(projectId: string, relativePath: string): Promise<boolean> {
    try {
      const content = await this.readFile(projectId, relativePath);
      return content !== null;
    } catch (error) {
      // If error is not a 404, rethrow
      if (error instanceof Error && !error.message.includes('not found')) {
        throw error;
      }
      return false;
    }
  },

  /**
   * Rename a file or folder
   * @param projectId - Project ID
   * @param oldPath - Current path
   * @param newName - New name (not full path, just the name)
   */
  async renameFile(projectId: string, oldPath: string, newName: string): Promise<void> {
    await apiClient.post<void>(
      `/workspace/projects/${projectId}/files/rename`,
      {
        oldPath,
        newName,
      }
    );
  },

  /**
   * Duplicate a file or folder
   * @param projectId - Project ID
   * @param path - Path to duplicate
   * @param type - 'file' or 'folder'
   * @returns Path of the duplicated item
   */
  async duplicateFile(projectId: string, path: string, type: 'file' | 'folder'): Promise<string> {
    const result = await apiClient.post<{ newPath: string }>(
      `/workspace/projects/${projectId}/files/duplicate`,
      {
        path,
        type,
      }
    );
    return result.newPath;
  },

  /**
   * Create a new file or directory
   * @param projectId - Project ID
   * @param parentPath - Parent directory path
   * @param name - Name of new file/directory
   * @param type - 'file' or 'directory'
   * @returns Path of created item
   */
  async createFileOrDirectory(
    projectId: string,
    parentPath: string,
    name: string,
    type: 'file' | 'directory'
  ): Promise<string> {
    const result = await apiClient.post<{ path: string }>(
      `/workspace/projects/${projectId}/files/create`,
      {
        parentPath,
        name,
        type,
      }
    );
    return result.path;
  },

  /**
   * Get app components library
   * @param projectId - Project ID
   * @returns Array of architectural components
   */
  async getAppComponents(projectId: string): Promise<any[]> {
    const result = await apiClient.get<{ components: any[] }>(
      `/workspace/projects/${projectId}/components/app`
    );
    return result.components;
  },

  /**
   * Get user components library
   * @param projectId - Project ID
   * @returns Array of architectural components
   */
  async getUserComponents(projectId: string): Promise<any[]> {
    const result = await apiClient.get<{ components: any[] }>(
      `/workspace/projects/${projectId}/components/user`
    );
    return result.components;
  },

  /**
   * Add component to user library
   * @param projectId - Project ID
   * @param component - Component to add
   */
  async addUserComponent(projectId: string, component: any): Promise<void> {
    await apiClient.post<void>(
      `/workspace/projects/${projectId}/components/user`,
      { component }
    );
  },

  /**
   * Remove component from user library
   * @param projectId - Project ID
   * @param componentId - ID of component to remove
   */
  async removeUserComponent(projectId: string, componentId: string): Promise<void> {
    await apiClient.delete<void>(
      `/workspace/projects/${projectId}/components/user/${componentId}`
    );
  },
};
