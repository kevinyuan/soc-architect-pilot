// File System Operations
// Client-side functions that call backend APIs for file operations

import fs from 'fs/promises';
import path from 'path';
import type { FileSystemNode, Language, ProjectListing, UserComponentDefinition } from '@/types/ide';
import type { ArchitecturalComponent } from '@/types/backend';
import crypto from 'crypto'; // For generating UUIDs

const USER_COMPONENTS_SUBFOLDER = "2-lib";
const USER_COMPONENTS_FILENAME = "user_components.lib";
const PROJECT_APP_COMPONENTS_SUBFOLDER = "2-lib"; // Renamed and purpose clarified
const PROJECT_APP_COMPONENTS_FILENAME = "app_components.lib"; // Corrected name


function getWorkspaceRoot(username: string): string {
  if (!username) {
    console.error(`Invalid username format: ${username}`);
    throw new Error('Invalid username.');
  }

  // Convert email addresses and other special characters to filesystem-safe names
  // Replace @ and . with underscores, keep only alphanumeric, underscore, and hyphen
  const sanitizedUsername = username.replace(/[@.]/g, '_').replace(/[^a-zA-Z0-9_-]/g, '_');

  if (!sanitizedUsername) {
    console.error(`Username sanitization resulted in empty string: ${username}`);
    throw new Error('Invalid username.');
  }

  return path.resolve(process.cwd(), 'app-data', 'workspaces', sanitizedUsername);
}

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
    case '.lib': // Added for user_components.lib, treat as JSON
      return 'json';
    case '.txt':
    default:
      return 'text';
  }
}

async function getFileSystemNodeData(itemOsPath: string, clientRelativePath: string): Promise<FileSystemNode> {
  const stats = await fs.stat(itemOsPath);
  const name = path.basename(itemOsPath);
  const normalizedClientPath = clientRelativePath.replace(/\\/g, '/');

  if (stats.isDirectory()) {
    return {
      id: normalizedClientPath,
      name,
      type: 'folder',
      path: normalizedClientPath,
      children: [],
    };
  } else {
    return {
      id: normalizedClientPath,
      name,
      type: 'file',
      language: getLanguageForFile(name),
      path: normalizedClientPath,
    };
  }
}

export async function getDirectoryListing(username: string, clientRelativePath: string, projectRootPath: string | null = null): Promise<FileSystemNode[]> {
  const userWorkspaceRoot = getWorkspaceRoot(username);
  const effectiveClientRoot = projectRootPath || '';
  const currentOsPath = path.join(userWorkspaceRoot, effectiveClientRoot, clientRelativePath);

  console.log(`[FS_ACCESS:LIST_DIR] User: ${username}, Project: ${projectRootPath || '(root)'}, Path: ${clientRelativePath}, Resolved OS Path: ${currentOsPath}`);

  if (!currentOsPath.startsWith(userWorkspaceRoot)) {
    console.error(`Access denied: Attempted to list path ${clientRelativePath} (project: ${projectRootPath}) for user ${username} which resolves outside user workspace.`);
    throw new Error('Access denied to list directory.');
  }

  try {
    await fs.access(currentOsPath);
  } catch (error) {
    const isRootLevelListing = (clientRelativePath === '/' || clientRelativePath === '');
    if (isRootLevelListing && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      if (!projectRootPath) {
        try {
          await fs.mkdir(userWorkspaceRoot, { recursive: true });
          console.log(`[FS_ACCESS:CREATE_DIR] Created workspace directory for ${username} at ${userWorkspaceRoot}`);
          return [];
        } catch (mkdirError) {
          console.error(`Failed to create workspace directory ${userWorkspaceRoot} for user ${username}:`, mkdirError);
          throw new Error('Workspace initialization failed.');
        }
      } else {
        // If it's a project path that doesn't exist, try creating it
        try {
          await fs.mkdir(currentOsPath, { recursive: true });
          console.log(`[FS_ACCESS:CREATE_DIR] Created project directory ${currentOsPath} for user ${username}, project ${projectRootPath}`);
          return []; // Return empty as it's newly created
        } catch (mkdirError) {
          console.error(`Failed to create project directory ${currentOsPath} for user ${username}, project ${projectRootPath}:`, mkdirError);
          throw new Error('Project directory creation failed.');
        }
      }
    }
    console.warn(`[FS_ACCESS:WARN] Directory not found for listing: ${currentOsPath} for user ${username}, project ${projectRootPath}`);
    return [];
  }

  const items = (await fs.readdir(currentOsPath)).filter(item => !item.startsWith('.'));
  const nodes: FileSystemNode[] = [];

  for (const itemName of items) {
    const itemOsPath = path.join(currentOsPath, itemName);
    const itemClientRelativePathForNode = path.join(clientRelativePath, itemName).replace(/\\/g, '/');
    try {
      const node = await getFileSystemNodeData(itemOsPath, itemClientRelativePathForNode);
      if (node.type === 'folder') {
        node.children = await getDirectoryListing(username, itemClientRelativePathForNode, projectRootPath);
      }
      nodes.push(node);
    } catch (err) {
      console.error(`Error processing item ${itemOsPath} for user ${username}, project ${projectRootPath}:`, err);
    }
  }
  return nodes;
}

export async function readFileContent(username: string, clientRelativePath: string, projectRootPath: string | null = null, projectId?: string): Promise<string> {
  if (!projectId) {
    throw new Error('Project ID is required for file operations');
  }

  console.log(`[FS_ACCESS:READ_FILE] Using S3 API - Project: ${projectId}, Path: ${clientRelativePath}`);
  try {
    const { workspaceFileAPI } = await import('@/lib/workspace-file-api');
    const content = await workspaceFileAPI.readFile(projectId, clientRelativePath);
    return content || ''; // Return empty string if file not found
  } catch (error) {
    console.error(`[FS_ACCESS:READ_FILE] Error reading from S3:`, error);
    throw new Error(`Could not read file: ${path.basename(clientRelativePath)}`);
  }
}

export async function writeFileContent(username: string, clientRelativePath: string, content: string, projectRootPath: string | null = null, projectId?: string): Promise<void> {
  if (!projectId) {
    throw new Error('Project ID is required for file operations');
  }

  console.log(`[FS_ACCESS:WRITE_FILE] Using S3 API - Project: ${projectId}, Path: ${clientRelativePath}`);
  try {
    const { workspaceFileAPI } = await import('@/lib/workspace-file-api');
    await workspaceFileAPI.writeFile(projectId, clientRelativePath, content);
    return;
  } catch (error) {
    console.error(`[FS_ACCESS:WRITE_FILE] Error writing to S3:`, error);
    throw new Error(`Could not write file: ${path.basename(clientRelativePath)}`);
  }
}


export async function createFile(
  username: string,
  projectRootPath: string | null,
  parentFolderPath: string,
  fileName: string,
  projectId?: string
): Promise<void> {
  if (!projectId) {
    throw new Error('Project ID is required for file operations');
  }

  console.log(`[FS_ACCESS:CREATE_FILE] Using S3 API - Project: ${projectId}, Parent: ${parentFolderPath}, File: ${fileName}`);

  if (fileName.includes('/') || fileName.includes('\\') || !fileName.trim() || fileName === "." || fileName === "..") {
    throw new Error("Invalid file name. It cannot be empty, '.', '..', or contain path separators.");
  }

  try {
    const { workspaceFileAPI } = await import('@/lib/workspace-file-api');
    await workspaceFileAPI.createFileOrDirectory(projectId, parentFolderPath, fileName, 'file');
    return;
  } catch (error) {
    console.error(`[FS_ACCESS:CREATE_FILE] Error creating file in S3:`, error);
    throw new Error(`Could not create file: ${fileName}`);
  }
}

export async function createDirectory(
  username: string,
  projectRootPath: string | null,
  parentFolderPath: string,
  directoryName: string,
  projectId?: string
): Promise<void> {
  if (!projectId) {
    throw new Error('Project ID is required for file operations');
  }

  console.log(`[FS_ACCESS:CREATE_DIR] Using S3 API - Project: ${projectId}, Parent: ${parentFolderPath}, Dir: ${directoryName}`);

  if (directoryName.includes('/') || directoryName.includes('\\') || !directoryName.trim() || directoryName === "." || directoryName === "..") {
    throw new Error("Invalid directory name. It cannot be empty, '.', '..', or contain path separators.");
  }

  try {
    const { workspaceFileAPI } = await import('@/lib/workspace-file-api');
    await workspaceFileAPI.createFileOrDirectory(projectId, parentFolderPath, directoryName, 'directory');
    return;
  } catch (error) {
    console.error(`[FS_ACCESS:CREATE_DIR] Error creating directory in S3:`, error);
    throw new Error(`Could not create directory: ${directoryName}`);
  }
}


export async function getProjectListings(username: string): Promise<ProjectListing[]> {
  const userWorkspaceRoot = getWorkspaceRoot(username);
  const projects: ProjectListing[] = [];

  console.log(`[FS_ACCESS:LIST_PROJECTS] User: ${username}, Workspace Root: ${userWorkspaceRoot}`);

  try {
    await fs.access(userWorkspaceRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      try {
        await fs.mkdir(userWorkspaceRoot, { recursive: true });
        console.log(`[FS_ACCESS:CREATE_DIR] Created workspace directory for ${username} at ${userWorkspaceRoot} during getProjectListings.`);
        return [];
      } catch (mkdirError) {
        console.error(`Failed to create workspace directory ${userWorkspaceRoot} for user ${username}:`, mkdirError);
        throw new Error('Workspace initialization failed during project listing.');
      }
    }
    throw error;
  }

  const items = (await fs.readdir(userWorkspaceRoot, { withFileTypes: true })).filter(item => !item.name.startsWith('.'));

  for (const item of items) {
    if (item.isDirectory()) {
      const projectPath = item.name;
      const projectOsPath = path.join(userWorkspaceRoot, item.name);
      try {
        const stats = await fs.stat(projectOsPath);
        projects.push({
          name: item.name,
          path: projectPath,
          createdAt: stats.birthtime,
          lastModified: stats.mtime,
        });
      } catch (err) {
        console.error(`Error getting stats for project ${item.name} for user ${username}:`, err);
      }
    }
  }
  projects.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  return projects;
}

export async function renameFileSystemNode(
  username: string,
  projectRootPath: string | null,
  oldClientRelativePath: string,
  newName: string,
  projectId?: string
): Promise<void> {
  if (!projectId) {
    throw new Error('Project ID is required for file operations');
  }

  console.log(`[FS_ACCESS:RENAME_NODE] Using S3 API - Project: ${projectId}, Old Path: ${oldClientRelativePath}, New Name: ${newName}`);

  if (!newName || newName.includes('/') || newName.includes('\\') || newName === "." || newName === "..") {
    throw new Error("Invalid new name.");
  }

  try {
    const { workspaceFileAPI } = await import('@/lib/workspace-file-api');
    await workspaceFileAPI.renameFile(projectId, oldClientRelativePath, newName);
    return;
  } catch (error) {
    console.error(`[FS_ACCESS:RENAME_NODE] Error renaming in S3:`, error);
    throw new Error(`Could not rename "${path.basename(oldClientRelativePath)}" to "${newName}".`);
  }
}

export async function deleteFileSystemNode(
  username: string,
  projectRootPath: string | null,
  clientRelativePath: string,
  nodeType: 'file' | 'folder',
  projectId?: string
): Promise<void> {
  if (!projectId) {
    throw new Error('Project ID is required for file operations');
  }

  console.log(`[FS_ACCESS:DELETE_NODE] Using S3 API - Project: ${projectId}, Path: ${clientRelativePath}, Type: ${nodeType}`);

  try {
    const { workspaceFileAPI } = await import('@/lib/workspace-file-api');
    await workspaceFileAPI.deleteFile(projectId, clientRelativePath);
    return;
  } catch (error) {
    console.error(`[FS_ACCESS:DELETE_NODE] Error deleting from S3:`, error);
    throw new Error(`Could not delete "${path.basename(clientRelativePath)}".`);
  }
}


export async function duplicateFileSystemNode(
  username: string,
  projectRootPath: string | null,
  clientRelativePath: string,
  nodeType: 'file' | 'folder',
  projectId?: string
): Promise<void> {
  if (!projectId) {
    throw new Error('Project ID is required for file operations');
  }

  console.log(`[FS_ACCESS:DUPLICATE_NODE] Using S3 API - Project: ${projectId}, Path: ${clientRelativePath}, Type: ${nodeType}`);

  try {
    const { workspaceFileAPI } = await import('@/lib/workspace-file-api');
    await workspaceFileAPI.duplicateFile(projectId, clientRelativePath, nodeType);
    return;
  } catch (error) {
    console.error(`[FS_ACCESS:DUPLICATE_NODE] Error duplicating in S3:`, error);
    throw new Error(`Could not duplicate "${path.basename(clientRelativePath)}".`);
  }
}


// --- Project-specific App Component Library Functions ---

function getProjectAppComponentsLibFilePath(username: string, projectRootPath: string): string {
  const userWorkspaceRoot = getWorkspaceRoot(username);
  return path.join(userWorkspaceRoot, projectRootPath, PROJECT_APP_COMPONENTS_SUBFOLDER, PROJECT_APP_COMPONENTS_FILENAME);
}

export async function readAppComponentsLib(username: string, projectRootPath: string, projectId?: string): Promise<ArchitecturalComponent[]> {
  if (!username || !projectRootPath) {
    console.warn("[FS_ACCESS:READ_PROJECT_APP_LIB] Attempted to read project app components without user or project context.");
    return [];
  }

  // If projectId is provided, use the new S3-based API
  if (projectId) {
    console.log(`[FS_ACCESS:READ_PROJECT_APP_LIB] Using S3 API - Project: ${projectId}`);
    try {
      const { workspaceFileAPI } = await import('@/lib/workspace-file-api');
      const relativePath = `${PROJECT_APP_COMPONENTS_SUBFOLDER}/${PROJECT_APP_COMPONENTS_FILENAME}`;
      const content = await workspaceFileAPI.readFile(projectId, relativePath);

      if (!content) {
        console.log(`[FS_ACCESS:READ_PROJECT_APP_LIB] App components file not found in S3. Returning empty list.`);
        return [];
      }

      return JSON.parse(content) as ArchitecturalComponent[];
    } catch (error) {
      console.error(`[FS_ACCESS:READ_PROJECT_APP_LIB] Error reading app components from S3:`, error);
      return [];
    }
  }

  // Fallback to local filesystem (deprecated)
  const filePath = getProjectAppComponentsLibFilePath(username, projectRootPath);
  console.log(`[FS_ACCESS:READ_PROJECT_APP_LIB] Using local filesystem - Path: ${filePath}`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as ArchitecturalComponent[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn(`[FS_ACCESS:READ_PROJECT_APP_LIB] Project app components file not found (${filePath}). Returning empty list.`);
      return [];
    }
    console.error(`[FS_ACCESS:READ_PROJECT_APP_LIB] Error reading or parsing project app components file ${filePath}:`, error);
    return [];
  }
}


// --- User Component Library Functions ---

function getUserComponentsLibFilePath(username: string, projectRootPath: string): string {
  const userWorkspaceRoot = getWorkspaceRoot(username);
  return path.join(userWorkspaceRoot, projectRootPath, USER_COMPONENTS_SUBFOLDER, USER_COMPONENTS_FILENAME);
}

export async function readUserComponentsLib(username: string, projectRootPath: string, projectId?: string): Promise<ArchitecturalComponent[]> {
  if (!projectRootPath) {
    console.warn("[FS_ACCESS:READ_USER_LIB] Attempted to read user components without a project context.");
    return [];
  }

  // If projectId is provided, use the new S3-based API
  if (projectId) {
    console.log(`[FS_ACCESS:READ_USER_LIB] Using S3 API - Project: ${projectId}`);
    try {
      const { workspaceFileAPI } = await import('@/lib/workspace-file-api');
      const relativePath = `${USER_COMPONENTS_SUBFOLDER}/${USER_COMPONENTS_FILENAME}`;
      const content = await workspaceFileAPI.readFile(projectId, relativePath);

      if (!content) {
        console.log(`[FS_ACCESS:READ_USER_LIB] User components file not found in S3. Returning empty list.`);
        return [];
      }

      return JSON.parse(content) as ArchitecturalComponent[];
    } catch (error) {
      console.error(`[FS_ACCESS:READ_USER_LIB] Error reading user components from S3:`, error);
      return [];
    }
  }

  // Fallback to local filesystem (deprecated)
  const filePath = getUserComponentsLibFilePath(username, projectRootPath);
  console.log(`[FS_ACCESS:READ_USER_LIB] Using local filesystem - Path: ${filePath}`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as ArchitecturalComponent[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log(`[FS_ACCESS:READ_USER_LIB] User components file not found (${filePath}). Returning empty list.`);
      return [];
    }
    console.error(`[FS_ACCESS:READ_USER_LIB] Error reading or parsing user components file ${filePath}:`, error);
    return [];
  }
}

export async function exportComponentToUserLib(username: string, projectRootPath: string, componentToExport: ArchitecturalComponent, projectId?: string): Promise<void> {
  if (!projectRootPath) {
    console.error("[FS_ACCESS:EXPORT_USER_LIB] Attempted to export component without a project context.");
    throw new Error("A project must be open to export components to its library.");
  }

  // If projectId is provided, use the new S3-based API
  if (projectId) {
    console.log(`[FS_ACCESS:EXPORT_USER_LIB] Using S3 API - Project: ${projectId}, Component: ${componentToExport.name}`);
    try {
      const { workspaceFileAPI } = await import('@/lib/workspace-file-api');
      const relativePath = `${USER_COMPONENTS_SUBFOLDER}/${USER_COMPONENTS_FILENAME}`;

      // Read current components
      let components: ArchitecturalComponent[] = [];
      const content = await workspaceFileAPI.readFile(projectId, relativePath);

      if (content) {
        components = JSON.parse(content) as ArchitecturalComponent[];
        if (!Array.isArray(components)) {
          console.warn(`[FS_ACCESS:EXPORT_USER_LIB] Invalid data in S3. Overwriting with new list.`);
          components = [];
        }
      } else {
        console.log(`[FS_ACCESS:EXPORT_USER_LIB] User components file not found in S3. Creating new one.`);
      }

      // Update or add component (use id instead of libId)
      const existingIndex = components.findIndex(c => c.id === componentToExport.id);
      if (existingIndex > -1) {
        console.log(`[FS_ACCESS:EXPORT_USER_LIB] Updating existing component with id ${componentToExport.id}`);
        components[existingIndex] = componentToExport;
      } else {
        components.push(componentToExport);
      }

      // Write back to S3
      await workspaceFileAPI.writeFile(projectId, relativePath, JSON.stringify(components, null, 2));
      console.log(`[FS_ACCESS:EXPORT_USER_LIB] Component "${componentToExport.name}" successfully exported to S3`);
      return;
    } catch (error) {
      console.error(`[FS_ACCESS:EXPORT_USER_LIB] Error exporting component to S3:`, error);
      throw new Error(`Could not export component: ${componentToExport.name}`);
    }
  }

  // Fallback to local filesystem (deprecated)
  const filePath = getUserComponentsLibFilePath(username, projectRootPath);
  const dirPath = path.dirname(filePath);

  console.log(`[FS_ACCESS:EXPORT_USER_LIB] Using local filesystem - User: ${username}, Project: ${projectRootPath}, Path: ${filePath}, Component: ${componentToExport.name}`);

  try {
    await fs.mkdir(dirPath, { recursive: true });
    let components: ArchitecturalComponent[] = [];
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      components = JSON.parse(content) as ArchitecturalComponent[];
      if (!Array.isArray(components)) {
        console.warn(`[FS_ACCESS:EXPORT_USER_LIB] User components file ${filePath} contained invalid data. Overwriting with new list.`);
        components = [];
      }
    } catch (readError) {
      if ((readError as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log(`[FS_ACCESS:EXPORT_USER_LIB] User components file ${filePath} not found. Creating new one.`);
      } else {
        throw readError;
      }
    }

    const existingIndex = components.findIndex(c => c.id === componentToExport.id);
    if (existingIndex > -1) {
      console.log(`[FS_ACCESS:EXPORT_USER_LIB] Updating existing component with id ${componentToExport.id} in ${filePath}`);
      components[existingIndex] = componentToExport;
    } else {
      components.push(componentToExport);
    }

    await fs.writeFile(filePath, JSON.stringify(components, null, 2), 'utf-8');
    console.log(`[FS_ACCESS:EXPORT_USER_LIB] Component "${componentToExport.name}" successfully exported to ${filePath}`);
  } catch (error) {
    console.error(`[FS_ACCESS:EXPORT_USER_LIB] Error exporting component to ${filePath}:`, error);
    throw new Error(`Could not export component: ${componentToExport.name}`);
  }
}

export async function removeComponentFromUserLib(username: string, projectRootPath: string, componentId: string, projectId?: string): Promise<void> {
  if (!projectRootPath) {
    console.error("[FS_ACCESS:REMOVE_USER_LIB] Attempted to remove component without a project context.");
    throw new Error("A project must be open to remove components from its library.");
  }

  // If projectId is provided, use the new S3-based API
  if (projectId) {
    console.log(`[FS_ACCESS:REMOVE_USER_LIB] Using S3 API - Project: ${projectId}, Component ID: ${componentId}`);
    try {
      const { workspaceFileAPI } = await import('@/lib/workspace-file-api');
      const relativePath = `${USER_COMPONENTS_SUBFOLDER}/${USER_COMPONENTS_FILENAME}`;

      // Read current components
      const content = await workspaceFileAPI.readFile(projectId, relativePath);
      if (!content) {
        console.log(`[FS_ACCESS:REMOVE_USER_LIB] User components file not found in S3. Nothing to remove.`);
        return;
      }

      const components = JSON.parse(content) as ArchitecturalComponent[];
      if (!Array.isArray(components)) {
        throw new Error("Invalid user component library file format.");
      }

      const initialLength = components.length;
      const updatedComponents = components.filter(c => c.id !== componentId);

      if (updatedComponents.length === initialLength) {
        console.log(`[FS_ACCESS:REMOVE_USER_LIB] Component with id ${componentId} not found. No changes made.`);
        return;
      }

      // Write updated components back to S3
      await workspaceFileAPI.writeFile(projectId, relativePath, JSON.stringify(updatedComponents, null, 2));
      console.log(`[FS_ACCESS:REMOVE_USER_LIB] Component with id ${componentId} successfully removed from S3`);
      return;
    } catch (error) {
      console.error(`[FS_ACCESS:REMOVE_USER_LIB] Error removing component from S3:`, error);
      throw new Error(`Could not remove component: ${componentId}`);
    }
  }

  // Fallback to local filesystem (deprecated)
  const filePath = getUserComponentsLibFilePath(username, projectRootPath);
  console.log(`[FS_ACCESS:REMOVE_USER_LIB] Using local filesystem - User: ${username}, Project: ${projectRootPath}, Path: ${filePath}, Component ID: ${componentId}`);

  try {
    let components: ArchitecturalComponent[] = [];
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      components = JSON.parse(content) as ArchitecturalComponent[];
      if (!Array.isArray(components)) {
        console.warn(`[FS_ACCESS:REMOVE_USER_LIB] User components file ${filePath} contained invalid data. Cannot remove component.`);
        throw new Error("Invalid user component library file format.");
      }
    } catch (readError) {
      if ((readError as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log(`[FS_ACCESS:REMOVE_USER_LIB] User components file ${filePath} not found. Nothing to remove.`);
        return;
      }
      throw readError;
    }

    const initialLength = components.length;
    const updatedComponents = components.filter(c => c.id !== componentId);

    if (updatedComponents.length === initialLength) {
      console.log(`[FS_ACCESS:REMOVE_USER_LIB] Component with id ${componentId} not found in ${filePath}. No changes made.`);
      return;
    }

    await fs.writeFile(filePath, JSON.stringify(updatedComponents, null, 2), 'utf-8');
    console.log(`[FS_ACCESS:REMOVE_USER_LIB] Component with id ${componentId} successfully removed from ${filePath}`);
  } catch (error) {
    console.error(`[FS_ACCESS:REMOVE_USER_LIB] Error removing component with id ${componentId} from ${filePath}:`, error);
    throw new Error(`Could not remove component: ${componentId}`);
  }
}



