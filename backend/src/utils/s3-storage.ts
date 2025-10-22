// S3 Storage Service
// Handles all S3 operations for workspace file storage

import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { s3Client, S3_BUCKET_NAME, getS3Key, getProjectS3Prefix, getUserS3Prefix } from './aws-config';

export interface S3File {
  key: string;
  path: string;  // Relative path within project
  name: string;  // File name only
  size: number;
  lastModified: Date;
  isDirectory: boolean;
}

export class S3StorageService {
  /**
   * Upload a file to S3
   * @param relativePath - Relative path within project (e.g., "2-lib/app_components.lib" or just "metadata.json")
   */
  async uploadFile(
    userId: string,
    projectId: string,
    relativePath: string,
    content: string | Buffer,
    contentType: string = 'application/json'
  ): Promise<void> {
    const key = getS3Key(userId, projectId, relativePath);

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
      Body: typeof content === 'string' ? Buffer.from(content, 'utf-8') : content,
      ContentType: contentType,
      Metadata: {
        userId,
        projectId,
        uploadedAt: new Date().toISOString(),
      },
    });

    await s3Client.send(command);
    console.log(`✅ Uploaded file to S3: ${key}`);
  }

  /**
   * Download a file from S3
   * @param relativePath - Relative path within project (e.g., "2-lib/app_components.lib")
   */
  async downloadFile(userId: string, projectId: string, relativePath: string): Promise<string | null> {
    const key = getS3Key(userId, projectId, relativePath);

    try {
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: key,
      });

      const response = await s3Client.send(command);
      
      if (!response.Body) {
        return null;
      }

      // Convert stream to string
      const bodyContents = await response.Body.transformToString('utf-8');
      return bodyContents;
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete a file from S3
   * @param relativePath - Relative path within project
   */
  async deleteFile(userId: string, projectId: string, relativePath: string): Promise<void> {
    const key = getS3Key(userId, projectId, relativePath);

    const command = new DeleteObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
    console.log(`🗑️  Deleted file from S3: ${key}`);
  }

  /**
   * Check if a file exists in S3
   * @param relativePath - Relative path within project
   */
  async fileExists(userId: string, projectId: string, relativePath: string): Promise<boolean> {
    const key = getS3Key(userId, projectId, relativePath);

    try {
      const command = new HeadObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: key,
      });

      await s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * List all files in a project or directory
   * @param directoryPath - Optional directory path within project (e.g., "2-lib" or "" for root)
   */
  async listProjectFiles(userId: string, projectId: string, directoryPath: string = ''): Promise<S3File[]> {
    const projectPrefix = getProjectS3Prefix(userId, projectId);
    const prefix = directoryPath ? `${projectPrefix}${directoryPath}/` : projectPrefix;

    const command = new ListObjectsV2Command({
      Bucket: S3_BUCKET_NAME,
      Prefix: prefix,
      Delimiter: '/', // Use delimiter to get immediate children only
    });

    const response = await s3Client.send(command);
    const results: S3File[] = [];

    // Add directories (CommonPrefixes)
    if (response.CommonPrefixes) {
      for (const commonPrefix of response.CommonPrefixes) {
        const fullPrefix = commonPrefix.Prefix!;
        // Extract relative path from project root
        const relativePath = fullPrefix.substring(projectPrefix.length);
        // Remove trailing slash for directory name
        const pathWithoutTrailingSlash = relativePath.endsWith('/') ? relativePath.slice(0, -1) : relativePath;
        const name = pathWithoutTrailingSlash.split('/').pop() || '';
        
        results.push({
          key: fullPrefix,
          path: pathWithoutTrailingSlash,
          name: name,
          size: 0,
          lastModified: new Date(),
          isDirectory: true,
        });
      }
    }

    // Add files (Contents)
    if (response.Contents) {
      for (const obj of response.Contents) {
        const fullKey = obj.Key!;
        // Extract relative path from project root
        const relativePath = fullKey.substring(projectPrefix.length);
        
        // Skip if this is the directory itself (ends with /)
        if (relativePath.endsWith('/')) {
          continue;
        }
        
        const name = relativePath.split('/').pop() || '';
        
        results.push({
          key: fullKey,
          path: relativePath,
          name: name,
          size: obj.Size || 0,
          lastModified: obj.LastModified || new Date(),
          isDirectory: false,
        });
      }
    }

    return results;
  }

  /**
   * List files in a directory (returns relative paths only)
   * @param directoryPath - Directory path within project (e.g., "backup/" or "2-lib/")
   */
  async listFiles(userId: string, projectId: string, directoryPath: string = ''): Promise<string[]> {
    const files = await this.listProjectFiles(userId, projectId, directoryPath);
    return files.map(file => file.path);
  }

  /**
   * List all projects for a user
   */
  async listUserProjects(userId: string): Promise<string[]> {
    const prefix = getUserS3Prefix(userId) + 'projects/';

    const command = new ListObjectsV2Command({
      Bucket: S3_BUCKET_NAME,
      Prefix: prefix,
      Delimiter: '/',
    });

    const response = await s3Client.send(command);

    if (!response.CommonPrefixes) {
      return [];
    }

    // Extract project IDs from prefixes
    return response.CommonPrefixes.map((cp) => {
      const parts = cp.Prefix!.split('/');
      return parts[parts.length - 2]; // Get project ID
    }).filter(Boolean);
  }

  /**
   * Delete all files in a project
   */
  async deleteProject(userId: string, projectId: string): Promise<void> {
    const files = await this.listProjectFiles(userId, projectId);

    // Delete all files using relative paths
    const deletePromises = files.map((file) =>
      this.deleteFile(userId, projectId, file.path)
    );

    await Promise.all(deletePromises);
    console.log(`🗑️  Deleted project from S3: ${projectId}`);
  }

  /**
   * Copy a project (for duplication)
   */
  async copyProject(
    userId: string,
    sourceProjectId: string,
    targetProjectId: string
  ): Promise<void> {
    const files = await this.listProjectFiles(userId, sourceProjectId);

    // Copy all files using relative paths
    const copyPromises = files.map(async (file) => {
      const sourceKey = getS3Key(userId, sourceProjectId, file.path);
      const targetKey = getS3Key(userId, targetProjectId, file.path);

      const command = new CopyObjectCommand({
        Bucket: S3_BUCKET_NAME,
        CopySource: `${S3_BUCKET_NAME}/${sourceKey}`,
        Key: targetKey,
      });

      await s3Client.send(command);
    });

    await Promise.all(copyPromises);
    console.log(`📋 Copied project in S3: ${sourceProjectId} -> ${targetProjectId}`);
  }

  /**
   * Get file metadata
   * @param relativePath - Relative path within project
   */
  async getFileMetadata(
    userId: string,
    projectId: string,
    relativePath: string
  ): Promise<{ size: number; lastModified: Date; contentType: string } | null> {
    const key = getS3Key(userId, projectId, relativePath);

    try {
      const command = new HeadObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: key,
      });

      const response = await s3Client.send(command);

      return {
        size: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
        contentType: response.ContentType || 'application/octet-stream',
      };
    } catch (error: any) {
      if (error.name === 'NotFound') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Rename a file in S3 (copy to new name and delete old)
   * @param oldPath - Current relative path
   * @param newName - New file/folder name (not full path, just the name)
   */
  async renameFile(
    userId: string,
    projectId: string,
    oldPath: string,
    newName: string
  ): Promise<void> {
    const path = await import('path');
    const dirPath = path.dirname(oldPath);
    const newPath = dirPath === '.' || dirPath === '' ? newName : `${dirPath}/${newName}`;

    const oldKey = getS3Key(userId, projectId, oldPath);
    const newKey = getS3Key(userId, projectId, newPath);

    // Copy to new location
    const copyCommand = new CopyObjectCommand({
      Bucket: S3_BUCKET_NAME,
      CopySource: `${S3_BUCKET_NAME}/${oldKey}`,
      Key: newKey,
    });

    await s3Client.send(copyCommand);

    // Delete old file
    const deleteCommand = new DeleteObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: oldKey,
    });

    await s3Client.send(deleteCommand);
    console.log(`✏️  Renamed file in S3: ${oldKey} -> ${newKey}`);
  }

  /**
   * Duplicate a file or folder
   * @param filePath - Relative path to duplicate
   * @param type - 'file' or 'folder'
   * @returns New path of duplicated item
   */
  async duplicateFile(
    userId: string,
    projectId: string,
    filePath: string,
    type: 'file' | 'folder'
  ): Promise<string> {
    const path = await import('path');
    const dirPath = path.dirname(filePath);
    const baseName = path.basename(filePath);
    const ext = path.extname(baseName);
    const nameWithoutExt = type === 'file' ? path.basename(baseName, ext) : baseName;

    // Find unique name
    let counter = 0;
    let newName = '';
    let newPath = '';

    while (true) {
      if (counter === 0) {
        newName = type === 'file' ? `${nameWithoutExt} (copy)${ext}` : `${nameWithoutExt} (copy)`;
      } else {
        newName = type === 'file' ? `${nameWithoutExt} (copy ${counter})${ext}` : `${nameWithoutExt} (copy ${counter})`;
      }
      newPath = dirPath === '.' || dirPath === '' ? newName : `${dirPath}/${newName}`;

      const exists = await this.fileExists(userId, projectId, newPath);
      if (!exists) break;
      counter++;
    }

    // Copy the file
    const oldKey = getS3Key(userId, projectId, filePath);
    const newKey = getS3Key(userId, projectId, newPath);

    const copyCommand = new CopyObjectCommand({
      Bucket: S3_BUCKET_NAME,
      CopySource: `${S3_BUCKET_NAME}/${oldKey}`,
      Key: newKey,
    });

    await s3Client.send(copyCommand);
    console.log(`📋 Duplicated file in S3: ${oldKey} -> ${newKey}`);

    return newPath;
  }

  /**
   * Create a new file or directory
   * @param parentPath - Parent directory path
   * @param name - Name of new file/directory
   * @param type - 'file' or 'directory'
   * @returns Path of created item
   */
  async createFileOrDirectory(
    userId: string,
    projectId: string,
    parentPath: string,
    name: string,
    type: 'file' | 'directory'
  ): Promise<string> {
    const path = await import('path');
    const newPath = parentPath ? `${parentPath}/${name}` : name;

    if (type === 'file') {
      // Create empty file
      await this.uploadFile(userId, projectId, newPath, '', 'text/plain');
      console.log(`📝 Created file in S3: ${newPath}`);
    } else {
      // For directories, create a marker file
      // S3 doesn't have true directories, but we can create a .directory marker
      const markerPath = `${newPath}/.directory`;
      await this.uploadFile(userId, projectId, markerPath, '', 'application/octet-stream');
      console.log(`📁 Created directory marker in S3: ${markerPath}`);
    }

    return newPath;
  }
}

// Export singleton instance
export const s3Storage = new S3StorageService();
