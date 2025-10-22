// Client-side workspace actions
// These functions call backend APIs and need access to localStorage (auth token)

import type { FileSystemNode, Language } from '@/types/ide';
import type { ArchitecturalComponent } from '@/types/backend';
import { workspaceFileAPI } from '@/lib/workspace-file-api';
import { workspaceAPI } from '@/lib/workspace-api';
import path from 'path-browserify';

/**
 * Get language from file extension
 */
function getLanguageForFile(fileName: string): Language {
  const extension = path.extname(fileName).toLowerCase();
  switch (extension) {
    case '.c':
    case '.h':
      return 'c';
    case '.md':
      return 'markdown';
    case '.json':
      return 'json';
    case '.s':
    case '.asm':
      return 'assembly';
    case '.sh':
    case '.bash':
      return 'shell';
    case '.html':
    case '.htm':
      return 'html';
    case '.css':
      return 'css';
    case '.js':
    case '.jsx':
    case '.ts':
    case '.tsx':
      return 'javascript';
    case '.py':
      return 'python';
    case '.canvas':
      return 'canvas';
    case '.emulation':
      return 'emulation';
    case '.txt':
    default:
      return 'text';
  }
}

/**
 * Convert workspace file to FileSystemNode
 */
function convertToFileSystemNode(file: any, basePath: string = ''): FileSystemNode {
  const fullPath = basePath ? `${basePath}/${file.name}` : file.name;

  if (file.isDirectory) {
    return {
      id: fullPath,
      name: file.name,
      type: 'folder',
      path: fullPath,
      children: [],
    };
  } else {
    return {
      id: fullPath,
      name: file.name,
      type: 'file',
      path: fullPath,
      language: getLanguageForFile(file.name),
    };
  }
}

/**
 * Get directory listing from S3
 * @param projectId - Project ID (required)
 * @param clientRelativePath - Path to list
 * @returns Array of FileSystemNode
 */
export async function getDirectoryListing(
  projectId: string,
  clientRelativePath: string = ''
): Promise<FileSystemNode[]> {
  if (!projectId) {
    throw new Error('Project ID is required for directory listing');
  }

  console.log(`[WORKSPACE:LIST_DIR] Project: ${projectId}, Path: ${clientRelativePath}`);

  try {
    const files = await workspaceFileAPI.listFiles(projectId, clientRelativePath);
    const nodes = files.map(file => convertToFileSystemNode(file, clientRelativePath));

    // Recursively load children for folders
    for (const node of nodes) {
      if (node.type === 'folder') {
        node.children = await getDirectoryListing(projectId, node.path);
      }
    }

    return nodes;
  } catch (error) {
    console.error(`[WORKSPACE:LIST_DIR] Error listing directory:`, error);
    return []; // Return empty array on error
  }
}

/**
 * Get list of available projects
 * @param username - User ID
 * @returns Array of projects
 */
export async function getProjectListings(username: string): Promise<any[]> {
  console.log(`[WORKSPACE:LIST_PROJECTS] User: ${username}`);

  try {
    const projects = await workspaceAPI.listProjects();
    return projects;
  } catch (error) {
    console.error(`[WORKSPACE:LIST_PROJECTS] Error listing projects:`, error);
    return [];
  }
}

/**
 * Read app components library
 * @param projectId - Project ID (required)
 * @returns Array of architectural components
 */
export async function readAppComponentsLib(projectId: string): Promise<ArchitecturalComponent[]> {
  if (!projectId) {
    throw new Error('Project ID is required for reading app components');
  }

  console.log(`[WORKSPACE:READ_APP_COMPONENTS] Project: ${projectId}`);

  try {
    const components = await workspaceFileAPI.getAppComponents(projectId);
    return components as ArchitecturalComponent[];
  } catch (error) {
    console.error(`[WORKSPACE:READ_APP_COMPONENTS] Error:`, error);
    return [];
  }
}

/**
 * Read user components library
 * @param projectId - Project ID (required)
 * @returns Array of architectural components
 */
export async function readUserComponentsLib(projectId: string): Promise<ArchitecturalComponent[]> {
  if (!projectId) {
    throw new Error('Project ID is required for reading user components');
  }

  console.log(`[WORKSPACE:READ_USER_COMPONENTS] Project: ${projectId}`);

  try {
    const components = await workspaceFileAPI.getUserComponents(projectId);
    return components as ArchitecturalComponent[];
  } catch (error) {
    console.error(`[WORKSPACE:READ_USER_COMPONENTS] Error:`, error);
    return [];
  }
}

/**
 * Export component to user library
 * @param projectId - Project ID (required)
 * @param componentToExport - Component to export
 */
/**
 * Add new component to library (creates new component ID)
 * @param projectId - Project ID (required)
 * @param componentToExport - Component to add
 * @param targetLibrary - 'user' | 'shared' (admin only)
 * @returns New component ID
 */
export async function addNewComponentToLib(
  projectId: string,
  componentToExport: ArchitecturalComponent,
  targetLibrary: 'user' | 'shared' = 'user'
): Promise<string> {
  if (!projectId) {
    throw new Error('Project ID is required for adding component');
  }

  // Generate new component ID
  const newComponentId = crypto.randomUUID();
  const componentWithNewId = {
    ...componentToExport,
    id: newComponentId,
    componentId: newComponentId,
  };

  console.log(`[WORKSPACE:ADD_NEW_COMPONENT] Project: ${projectId}, Target: ${targetLibrary}, New ID: ${newComponentId}`);

  try {
    if (targetLibrary === 'shared') {
      // TODO: Add API endpoint for shared library
      // For now, use user library
      await workspaceFileAPI.addUserComponent(projectId, componentWithNewId);
    } else {
      await workspaceFileAPI.addUserComponent(projectId, componentWithNewId);
    }
    return newComponentId;
  } catch (error) {
    console.error(`[WORKSPACE:ADD_NEW_COMPONENT] Error:`, error);
    throw new Error('Failed to add new component to library');
  }
}

/**
 * Update existing library component (keeps existing component ID)
 * @param projectId - Project ID (required)
 * @param componentToUpdate - Component to update
 * @param targetLibrary - 'user' | 'shared' (admin only)
 */
export async function updateLibComponent(
  projectId: string,
  componentToUpdate: ArchitecturalComponent,
  targetLibrary: 'user' | 'shared' = 'user'
): Promise<void> {
  if (!projectId) {
    throw new Error('Project ID is required for updating component');
  }

  console.log(`[WORKSPACE:UPDATE_COMPONENT] Project: ${projectId}, Target: ${targetLibrary}, ID: ${componentToUpdate.id}`);

  try {
    if (targetLibrary === 'shared') {
      // TODO: Add API endpoint for shared library update
      // For now, use user library
      await workspaceFileAPI.addUserComponent(projectId, componentToUpdate);
    } else {
      await workspaceFileAPI.addUserComponent(projectId, componentToUpdate);
    }
  } catch (error) {
    console.error(`[WORKSPACE:UPDATE_COMPONENT] Error:`, error);
    throw new Error('Failed to update library component');
  }
}

/**
 * @deprecated Use addNewComponentToLib or updateLibComponent instead
 */
export async function exportComponentToUserLib(
  projectId: string,
  componentToExport: ArchitecturalComponent
): Promise<void> {
  if (!projectId) {
    throw new Error('Project ID is required for exporting component');
  }

  console.log(`[WORKSPACE:EXPORT_COMPONENT] Project: ${projectId}, Component: ${componentToExport.id}`);

  try {
    await workspaceFileAPI.addUserComponent(projectId, componentToExport);
  } catch (error) {
    console.error(`[WORKSPACE:EXPORT_COMPONENT] Error:`, error);
    throw new Error('Failed to export component to user library');
  }
}

/**
 * Remove component from user library
 * @param projectId - Project ID (required)
 * @param componentId - ID of component to remove
 */
export async function removeComponentFromUserLib(
  projectId: string,
  componentId: string
): Promise<void> {
  if (!projectId) {
    throw new Error('Project ID is required for removing component');
  }

  console.log(`[WORKSPACE:REMOVE_COMPONENT] Project: ${projectId}, Component: ${componentId}`);

  try {
    await workspaceFileAPI.removeUserComponent(projectId, componentId);
  } catch (error) {
    console.error(`[WORKSPACE:REMOVE_COMPONENT] Error:`, error);
    throw new Error('Failed to remove component from user library');
  }
}

/**
 * Read file content
 * @param projectId - Project ID (required)
 * @param clientRelativePath - Relative path within project
 * @returns File content
 */
export async function readFileContent(
  projectId: string,
  clientRelativePath: string
): Promise<string> {
  if (!projectId) {
    throw new Error('Project ID is required for file operations');
  }

  console.log(`[WORKSPACE:READ_FILE] Project: ${projectId}, Path: ${clientRelativePath}`);

  try {
    const content = await workspaceFileAPI.readFile(projectId, clientRelativePath);
    return content || '';
  } catch (error) {
    console.error(`[WORKSPACE:READ_FILE] Error:`, error);
    throw new Error(`Could not read file: ${path.basename(clientRelativePath)}`);
  }
}

/**
 * Write file content
 * @param projectId - Project ID (required)
 * @param clientRelativePath - Relative path within project
 * @param content - File content
 */
export async function writeFileContent(
  projectId: string,
  clientRelativePath: string,
  content: string
): Promise<void> {
  if (!projectId) {
    throw new Error('Project ID is required for file operations');
  }

  console.log(`[WORKSPACE:WRITE_FILE] Project: ${projectId}, Path: ${clientRelativePath}`);

  try {
    await workspaceFileAPI.writeFile(projectId, clientRelativePath, content);
  } catch (error) {
    console.error(`[WORKSPACE:WRITE_FILE] Error:`, error);
    throw new Error(`Could not write file: ${path.basename(clientRelativePath)}`);
  }
}
