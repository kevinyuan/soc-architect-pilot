import { Router, Request, Response } from 'express';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3_BUCKET_NAME, AWS_REGION, getProjectS3Prefix, getS3Key } from '../../utils/aws-config';

const router = Router();

// DynamoDB setup
const client = new DynamoDBClient({ region: AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

// Admin middleware - check if user is admin
function requireAdmin(req: Request, res: Response, next: Function) {
  console.log(`[Admin] Checking admin access for ${req.method} ${req.path}`);
  console.log(`[Admin] userId:`, req.userId);
  console.log(`[Admin] user:`, req.user);

  // userId is set by auth middleware
  if (!req.userId) {
    console.log(`[Admin] 401 UNAUTHORIZED - No userId`);
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
    });
  }

  // For now, we'll check the role from the request
  // In production, you'd fetch the user from DB to verify role
  // TODO: Add proper role verification
  console.log(`[Admin] Access granted for user ${req.userId}`);
  next();
}

// Apply admin middleware to all routes
router.use(requireAdmin);

/**
 * GET /api/admin/tables
 * List all available tables with record counts
 */
router.get('/tables', async (req: Request, res: Response) => {
  console.log(`[Admin] GET /tables - userId: ${req.userId}`);
  try {
    const tableDefinitions = [
      {
        name: 'soc-pilot-users',
        displayName: 'Users',
        primaryKey: 'userId',
        sortKey: null,
        description: 'User account information (email, role, etc.)',
        icon: 'Users'
      },
      {
        name: 'soc-pilot-invitations',
        displayName: 'Invitations',
        primaryKey: 'invitationCode',
        sortKey: null,
        description: 'Invitation codes for user signup',
        icon: 'Mail'
      },
      {
        name: 'soc-pilot-waitlist',
        displayName: 'Waitlist',
        primaryKey: 'waitlistId',
        sortKey: null,
        description: 'Users waiting for invitation codes',
        icon: 'Clock'
      },
      {
        name: 'soc-pilot-projects',
        displayName: 'Projects',
        primaryKey: 'id',
        sortKey: null,
        description: 'User projects and workspaces',
        icon: 'FolderOpen'
      },
      {
        name: 'soc-pilot-project-shares',
        displayName: 'Project Shares',
        primaryKey: 'id',
        sortKey: null,
        description: 'Project sharing and collaboration',
        icon: 'Share2'
      },
      {
        name: 'soc-pilot-sessions',
        displayName: 'Sessions',
        primaryKey: 'sessionId',
        sortKey: null,
        description: 'Chat and design sessions',
        icon: 'MessageSquare'
      },
      {
        name: 'soc-pilot-component-library',
        displayName: 'User Component Library',
        primaryKey: 'componentId',
        sortKey: null,
        description: 'User-generated components pending approval (metadata in DynamoDB, files in S3 user folders)',
        icon: 'Package'
      },
      {
        name: 'file-system:components',
        displayName: 'System Component Library',
        primaryKey: 'id',
        sortKey: null,
        description: 'System component library (file-based: data/components/, in-memory, 26 components, 35KB)',
        icon: 'HardDrive',
        isFileSystem: true
      },
      {
        name: 'file-system:templates',
        displayName: 'Design Templates',
        primaryKey: 'id',
        sortKey: null,
        description: 'Architecture design examples (file-based: data/design_examples/, in-memory)',
        icon: 'FileText',
        isFileSystem: true
      }
    ];

    // Get record counts for each table
    const tablesWithCounts = await Promise.all(
      tableDefinitions.map(async (table: any) => {
        try {
          // Handle File System "tables"
          if (table.isFileSystem) {
            if (table.name === 'file-system:components') {
              const { ComponentLibraryManager } = await import('../services/component-library-manager');
              const manager = new ComponentLibraryManager();
              await manager.ensureInitialized();
              const components = manager.getAllComponents();
              return {
                ...table,
                recordCount: components.length
              };
            } else if (table.name === 'file-system:templates') {
              const { TemplateLibraryManager } = await import('../services/template-library-manager');
              const manager = new TemplateLibraryManager();
              await manager.ensureInitialized();
              const templates = manager.getAllTemplates();
              return {
                ...table,
                recordCount: templates.length
              };
            }
          }

          // Regular DynamoDB table
          const result = await docClient.send(new ScanCommand({
            TableName: table.name,
            Select: 'COUNT'
          }));
          return {
            ...table,
            recordCount: result.Count || 0
          };
        } catch (error) {
          console.error(`Error counting records in ${table.name}:`, error);
          return {
            ...table,
            recordCount: 0
          };
        }
      })
    );

    res.json({
      success: true,
      tables: tablesWithCounts
    });
  } catch (error: any) {
    console.error('Error listing tables:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to list tables' }
    });
  }
});

/**
 * GET /api/admin/tables/:tableName/records
 * Get records from a table
 */
router.get('/tables/:tableName/records', async (req: Request, res: Response) => {
  try {
    const { tableName } = req.params;
    const { limit = '10', direction = 'forward', lastKey } = req.query;

    // Handle File System "tables"
    if (tableName.startsWith('file-system:')) {
      if (tableName === 'file-system:components') {
        const { ComponentLibraryManager } = await import('../services/component-library-manager');
        const manager = new ComponentLibraryManager();
        await manager.ensureInitialized();
        const allComponents = manager.getAllComponents();

        // Apply pagination
        const limitNum = parseInt(limit as string);
        const startIndex = lastKey ? parseInt(lastKey as string) : 0;
        const endIndex = Math.min(startIndex + limitNum, allComponents.length);
        const paginatedComponents = allComponents.slice(startIndex, endIndex);

        console.log(`[Admin] Listed ${paginatedComponents.length} of ${allComponents.length} components from file system`);

        // Convert to table-like records
        const items = paginatedComponents.map(comp => ({
          id: comp.id,
          name: comp.name,
          category: comp.category,
          interfaceCount: comp.interfaces?.length || 0,
          icon: comp.visualization?.icon || 'Box',
          vendor: comp.vendor || 'N/A',
          version: comp.version || '1.0.0',
          tags: comp.tags?.join(', ') || '',
          description: comp.description
        }));

        return res.json({
          success: true,
          items,
          count: items.length,
          hasMore: endIndex < allComponents.length,
          totalCount: allComponents.length,
          lastEvaluatedKey: endIndex < allComponents.length ? endIndex.toString() : undefined
        });
      } else if (tableName === 'file-system:templates') {
        const { TemplateLibraryManager } = await import('../services/template-library-manager');
        const manager = new TemplateLibraryManager();
        await manager.ensureInitialized();
        const allTemplates = manager.getAllTemplates();

        // Apply pagination
        const limitNum = parseInt(limit as string);
        const startIndex = lastKey ? parseInt(lastKey as string) : 0;
        const endIndex = Math.min(startIndex + limitNum, allTemplates.length);
        const paginatedTemplates = allTemplates.slice(startIndex, endIndex);

        console.log(`[Admin] Listed ${paginatedTemplates.length} of ${allTemplates.length} templates from file system`);

        // Convert to table-like records
        const items = paginatedTemplates.map(t => ({
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category || 'general',
          icon: t.icon || 'FileText',
          nodeCount: t.metadata?.nodeCount || t.diagram.nodes.length,
          edgeCount: t.metadata?.edgeCount || t.diagram.edges.length,
          createdAt: t.createdAt || 'N/A',
          createdBy: t.createdBy || 'system'
        }));

        return res.json({
          success: true,
          items,
          count: items.length,
          hasMore: endIndex < allTemplates.length,
          totalCount: allTemplates.length,
          lastEvaluatedKey: endIndex < allTemplates.length ? endIndex.toString() : undefined
        });
      }

      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_FS_TABLE', message: 'Unknown file system table' }
      });
    }

    const scanParams: any = {
      TableName: tableName,
      Limit: parseInt(limit as string)
    };

    if (lastKey) {
      try {
        scanParams.ExclusiveStartKey = JSON.parse(lastKey as string);
      } catch (parseError) {
        console.error('Invalid lastKey format:', lastKey);
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_KEY', message: 'Invalid pagination key format' }
        });
      }
    }

    const result = await docClient.send(new ScanCommand(scanParams));

    // Remove sensitive data
    const sanitizedItems = result.Items?.map(item => {
      const sanitized = { ...item };
      if (sanitized.passwordHash) {
        sanitized.passwordHash = '[REDACTED]';
      }
      return sanitized;
    });

    res.json({
      success: true,
      items: sanitizedItems || [],
      count: result.Count || 0,
      lastEvaluatedKey: result.LastEvaluatedKey,
      hasMore: !!result.LastEvaluatedKey
    });
  } catch (error: any) {
    console.error('Error fetching records:', error);
    
    // Provide more specific error messages
    if (error.name === 'ValidationException') {
      return res.status(400).json({
        success: false,
        error: { 
          code: 'VALIDATION_ERROR', 
          message: 'Invalid request parameters. The pagination key may not match the table schema.',
          details: error.message
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch records', details: error.message }
    });
  }
});

/**
 * POST /api/admin/tables/:tableName/query
 * Query records by column
 */
router.post('/tables/:tableName/query', async (req: Request, res: Response) => {
  try {
    const { tableName } = req.params;
    const { column, value, limit = 10 } = req.body;

    if (!column || value === undefined) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Column and value are required' }
      });
    }

    // Handle S3 "tables" - just return empty for now as querying S3 is different
    if (tableName.startsWith('s3:')) {
      return res.json({
        success: true,
        items: [],
        count: 0
      });
    }

    // For primary key queries, use Query
    // For other attributes, use Scan with filter
    const scanParams: any = {
      TableName: tableName,
      FilterExpression: `#col = :val`,
      ExpressionAttributeNames: {
        '#col': column
      },
      ExpressionAttributeValues: {
        ':val': value
      },
      Limit: limit
    };

    const result = await docClient.send(new ScanCommand(scanParams));

    // Remove sensitive data
    const sanitizedItems = result.Items?.map(item => {
      const sanitized = { ...item };
      if (sanitized.passwordHash) {
        sanitized.passwordHash = '[REDACTED]';
      }
      return sanitized;
    });

    res.json({
      success: true,
      items: sanitizedItems || [],
      count: result.Count || 0
    });
  } catch (error: any) {
    console.error('Error querying records:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to query records' }
    });
  }
});

/**
 * DELETE /api/admin/tables/:tableName/records
 * Delete a record by primary key
 */
router.delete('/tables/:tableName/records', async (req: Request, res: Response) => {
  try {
    const { tableName } = req.params;
    const { key } = req.body;

    if (!key || typeof key !== 'object') {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Key object is required' }
      });
    }

    // Handle S3 "tables" - delete S3 objects
    if (tableName.startsWith('s3:')) {
      const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      const s3Client = new S3Client({ region: AWS_REGION });
      
      // key.key should contain the S3 object key
      if (!key.key) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'S3 key is required' }
        });
      }
      
      await s3Client.send(new DeleteObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: key.key
      }));
      
      return res.json({
        success: true,
        message: 'S3 object deleted successfully'
      });
    }

    // Delete the record
    const { DeleteCommand } = await import('@aws-sdk/lib-dynamodb');
    
    console.log(`Deleting record from ${tableName} with key:`, JSON.stringify(key));
    
    await docClient.send(new DeleteCommand({
      TableName: tableName,
      Key: key
    }));

    res.json({
      success: true,
      message: 'Record deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting record:', error);
    
    // Provide more detailed error message
    const errorMessage = error.message || 'Failed to delete record';
    const errorDetails = error.name === 'ValidationException' 
      ? 'The provided key does not match the table schema. Make sure to include all key attributes.'
      : errorMessage;
    
    res.status(500).json({
      success: false,
      error: { 
        code: error.name || 'SERVER_ERROR', 
        message: errorDetails,
        details: error.message
      }
    });
  }
});

/**
 * GET /api/admin/projects/:projectId/files
 * List files in a project workspace
 */
router.get('/projects/:projectId/files', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { path: filePath = '' } = req.query;

    // Get project to find userId
    const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
    const projectResult = await docClient.send(new GetCommand({
      TableName: 'soc-pilot-projects',
      Key: { id: projectId }
    }));

    if (!projectResult.Item) {
      return res.status(404).json({
        success: false,
        error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' }
      });
    }

    const userId = projectResult.Item.userId;

    // List files from S3
    const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    const s3Client = new S3Client({ region: AWS_REGION });
    
    // Use the correct S3 prefix structure
    const basePrefix = getProjectS3Prefix(userId, projectId);
    const prefix = `${basePrefix}${filePath}`;
    
    console.log(`\n=== Listing S3 Files ===`);
    console.log(`Project ID: ${projectId}`);
    console.log(`User ID: ${userId}`);
    console.log(`File Path: "${filePath}"`);
    console.log(`S3 Bucket: ${S3_BUCKET_NAME}`);
    console.log(`Base Prefix: "${basePrefix}"`);
    console.log(`Full Prefix: "${prefix}"`);
    
    const listParams = {
      Bucket: S3_BUCKET_NAME,
      Prefix: prefix,
      Delimiter: '/'
    };
    
    console.log(`List Params:`, JSON.stringify(listParams, null, 2));
    
    const result = await s3Client.send(new ListObjectsV2Command(listParams));

    console.log(`S3 Response:`);
    console.log(`  - CommonPrefixes: ${result.CommonPrefixes?.length || 0}`);
    console.log(`  - Contents: ${result.Contents?.length || 0}`);
    if (result.Contents && result.Contents.length > 0) {
      console.log(`  - First few keys:`, result.Contents.slice(0, 5).map(c => c.Key));
    }

    // Process folders (CommonPrefixes)
    const folders = (result.CommonPrefixes || []).map(p => {
      const folderName = p.Prefix!.replace(prefix, '').replace(/\//g, '');
      return {
        name: folderName,
        type: 'folder' as const,
        path: p.Prefix!.replace(basePrefix, '')
      };
    });

    // Process files (Contents)
    const files = (result.Contents || [])
      .filter(obj => {
        // Exclude the prefix itself (folder marker) and only show files in current directory
        const key = obj.Key!;
        const isFolder = key.endsWith('/');
        const isSameAsPrefix = key === prefix || key === prefix + '/';
        return !isFolder && !isSameAsPrefix;
      })
      .map(obj => {
        const fullPath = obj.Key!.replace(basePrefix, '');
        return {
          name: obj.Key!.split('/').pop() || '',
          type: 'file' as const,
          path: fullPath,
          size: obj.Size || 0,
          lastModified: obj.LastModified?.toISOString()
        };
      });

    console.log(`Processed - Folders: ${folders.length}, Files: ${files.length}`);

    res.json({
      success: true,
      items: [...folders, ...files],
      currentPath: filePath as string
    });
  } catch (error: any) {
    console.error('Error listing project files:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to list files', details: error.message }
    });
  }
});

/**
 * GET /api/admin/projects/:projectId/files/content
 * Get file content
 */
router.get('/projects/:projectId/files/content', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { path: filePath } = req.query;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PATH', message: 'File path is required' }
      });
    }

    // Get project to find userId
    const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
    const projectResult = await docClient.send(new GetCommand({
      TableName: 'soc-pilot-projects',
      Key: { id: projectId }
    }));

    if (!projectResult.Item) {
      return res.status(404).json({
        success: false,
        error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' }
      });
    }

    const userId = projectResult.Item.userId;

    // Get file from S3
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const s3Client = new S3Client({ region: AWS_REGION });
    
    const key = getS3Key(userId, projectId, filePath as string);
    
    console.log(`Reading file: ${key} from bucket: ${S3_BUCKET_NAME}`);
    
    const result = await s3Client.send(new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key
    }));

    const content = await result.Body?.transformToString();

    res.json({
      success: true,
      content,
      contentType: result.ContentType,
      size: result.ContentLength
    });
  } catch (error: any) {
    console.error('Error reading file:', error);
    
    if (error.name === 'NoSuchKey') {
      return res.status(404).json({
        success: false,
        error: { code: 'FILE_NOT_FOUND', message: 'File not found' }
      });
    }
    
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to read file', details: error.message }
    });
  }
});

/**
 * DELETE /api/admin/projects/:projectId/files
 * Delete a file or folder
 */
router.delete('/projects/:projectId/files', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { path: filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PATH', message: 'File path is required' }
      });
    }

    // Get project to find userId
    const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
    const projectResult = await docClient.send(new GetCommand({
      TableName: 'soc-pilot-projects',
      Key: { id: projectId }
    }));

    if (!projectResult.Item) {
      return res.status(404).json({
        success: false,
        error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' }
      });
    }

    const userId = projectResult.Item.userId;

    // Delete from S3
    const { S3Client, DeleteObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
    const s3Client = new S3Client({ region: AWS_REGION });
    
    const key = getS3Key(userId, projectId, filePath);
    
    console.log(`Deleting: ${key} from bucket: ${S3_BUCKET_NAME}`);
    
    // Check if it's a folder (ends with /) or file
    if (filePath.endsWith('/')) {
      // Delete all objects with this prefix
      const listResult = await s3Client.send(new ListObjectsV2Command({
        Bucket: S3_BUCKET_NAME,
        Prefix: key
      }));

      if (listResult.Contents && listResult.Contents.length > 0) {
        console.log(`Deleting ${listResult.Contents.length} objects in folder`);
        await s3Client.send(new DeleteObjectsCommand({
          Bucket: S3_BUCKET_NAME,
          Delete: {
            Objects: listResult.Contents.map(obj => ({ Key: obj.Key! }))
          }
        }));
      }
    } else {
      // Delete single file
      await s3Client.send(new DeleteObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: key
      }));
    }

    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting file:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to delete file', details: error.message }
    });
  }
});

/**
 * GET /api/admin/s3/browse
 * Browse S3 bucket contents (for shared-templates, etc.)
 */
router.get('/s3/browse', async (req: Request, res: Response) => {
  try {
    const { prefix } = req.query;
    const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    
    const s3Client = new S3Client({ region: AWS_REGION });
    const listPrefix = prefix ? String(prefix) : '';
    
    const command = new ListObjectsV2Command({
      Bucket: S3_BUCKET_NAME,
      Prefix: listPrefix,
      Delimiter: '/'
    });
    
    const response = await s3Client.send(command);
    
    // Get folders (common prefixes)
    const folders = (response.CommonPrefixes || []).map(cp => ({
      type: 'folder',
      name: cp.Prefix!.replace(listPrefix, '').replace('/', ''),
      fullPath: cp.Prefix,
      size: 0,
      lastModified: null
    }));
    
    // Get files
    const files = (response.Contents || [])
      .filter(obj => obj.Key !== listPrefix) // Exclude the prefix itself
      .map(obj => ({
        type: 'file',
        name: obj.Key!.replace(listPrefix, ''),
        fullPath: obj.Key,
        size: obj.Size || 0,
        lastModified: obj.LastModified?.toISOString() || null
      }));
    
    res.json({
      success: true,
      items: [...folders, ...files],
      prefix: listPrefix
    });
  } catch (error: any) {
    console.error('Error browsing S3:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to browse S3', details: error.message }
    });
  }
});

/**
 * GET /api/admin/s3/file
 * Get file content from S3
 */
router.get('/s3/file', async (req: Request, res: Response) => {
  try {
    const { key } = req.query;
    
    if (!key) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_KEY', message: 'File key is required' }
      });
    }
    
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const s3Client = new S3Client({ region: AWS_REGION });
    
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: String(key)
    });
    
    const response = await s3Client.send(command);
    const content = await response.Body?.transformToString('utf-8');
    
    res.json({
      success: true,
      content,
      contentType: response.ContentType,
      size: response.ContentLength,
      lastModified: response.LastModified?.toISOString()
    });
  } catch (error: any) {
    console.error('Error reading S3 file:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to read file', details: error.message }
    });
  }
});

/**
 * POST /api/admin/cache/invalidate
 * Invalidate component library cache - force fresh fetch from S3
 */
router.post('/cache/invalidate', async (req: Request, res: Response) => {
  try {
    const { ComponentLibraryS3Manager } = await import('../services/component-library-s3');
    const componentLibrary = new ComponentLibraryS3Manager();
    
    componentLibrary.invalidateCache();
    
    console.log('[Admin] Component library cache invalidated');
    
    res.json({
      success: true,
      message: 'Component library cache invalidated successfully'
    });
  } catch (error: any) {
    console.error('Error invalidating cache:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to invalidate cache', details: error.message }
    });
  }
});

/**
 * GET /api/admin/files/:type/:id
 * Get file content for editing (components or templates)
 */
router.get('/files/:type/:id', async (req: Request, res: Response) => {
  try {
    const { type, id } = req.params;

    if (type !== 'components' && type !== 'design_examples') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_TYPE', message: 'Type must be "components" or "design_examples"' }
      });
    }

    const fs = await import('fs/promises');
    const path = await import('path');

    const filePath = path.join(process.cwd(), 'data', type, `${id}.json`);

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        success: false,
        error: { code: 'FILE_NOT_FOUND', message: `File not found: ${id}.json` }
      });
    }

    // Read file content
    const content = await fs.readFile(filePath, 'utf-8');

    res.json({
      success: true,
      data: {
        id,
        type,
        content,
        path: filePath
      }
    });
  } catch (error: any) {
    console.error('Error reading file:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to read file', details: error.message }
    });
  }
});

/**
 * PUT /api/admin/files/:type/:id
 * Save file content (components or templates)
 */
router.put('/files/:type/:id', async (req: Request, res: Response) => {
  try {
    const { type, id } = req.params;
    const { content } = req.body;

    if (type !== 'components' && type !== 'design_examples') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_TYPE', message: 'Type must be "components" or "design_examples"' }
      });
    }

    if (!content) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Content is required' }
      });
    }

    // Validate JSON
    try {
      JSON.parse(content);
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Content must be valid JSON',
          details: (parseError as Error).message
        }
      });
    }

    const fs = await import('fs/promises');
    const path = await import('path');

    const filePath = path.join(process.cwd(), 'data', type, `${id}.json`);

    // Create backup before saving
    const backupDir = path.join(process.cwd(), 'data', 'backups');
    await fs.mkdir(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const backupPath = path.join(backupDir, `${id}-${timestamp}.json`);

    try {
      const existingContent = await fs.readFile(filePath, 'utf-8');
      await fs.writeFile(backupPath, existingContent, 'utf-8');
      console.log(`[Admin] Created backup: ${backupPath}`);
    } catch (error) {
      // File might not exist yet, that's okay
      console.log(`[Admin] No existing file to backup for ${id}`);
    }

    // Write new content
    await fs.writeFile(filePath, content, 'utf-8');

    // If this is a component, reload the component library
    if (type === 'components') {
      const { ComponentLibraryManager } = await import('../services/component-library-manager');
      const libraryManager = new ComponentLibraryManager();
      await libraryManager.reloadLibrary();
      console.log('[Admin] Component library reloaded after file save');
    }

    // If this is a design example, reload the template library
    if (type === 'design_examples') {
      const { TemplateLibraryManager } = await import('../services/template-library-manager');
      const templateManager = new TemplateLibraryManager();
      await templateManager.reloadLibrary();
      console.log('[Admin] Template library reloaded after file save');
    }

    res.json({
      success: true,
      message: 'File saved successfully',
      data: {
        id,
        type,
        backupPath
      }
    });
  } catch (error: any) {
    console.error('Error saving file:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to save file', details: error.message }
    });
  }
});

/**
 * POST /api/admin/export-template
 * Export current architecture diagram as a template
 * Admin only - saves to backend/data/design_examples/
 */
router.post('/export-template', async (req: Request, res: Response) => {
  console.log(`[Admin] POST /export-template - userId: ${req.userId}`);
  
  try {
    const { projectId, templateName, templateDescription } = req.body;

    if (!projectId || !templateName) {
      return res.status(400).json({
        success: false,
        error: 'projectId and templateName are required'
      });
    }

    // Import required modules
    const { s3Storage } = require('../../utils/s3-storage');
    const { dynamoDBService } = require('../../utils/dynamodb-service');
    const fs = require('fs').promises;
    const path = require('path');

    // Get project to get userId
    const project = await dynamoDBService.getProject(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Get arch_diagram.json from S3
    const diagramContent = await s3Storage.downloadFile(project.userId, projectId, 'arch_diagram.json');
    if (!diagramContent) {
      return res.status(404).json({
        success: false,
        error: 'Architecture diagram not found'
      });
    }

    const diagram = JSON.parse(diagramContent);

    // Ensure diagram has unified metadata format
    const { DiagramMetadataService } = await import('../services/diagram-metadata');
    const diagramWithMetadata = DiagramMetadataService.setForTemplate(diagram);

    // Create template object
    const templateId = templateName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const template = {
      id: `${templateId}-template`,
      name: templateName,
      description: templateDescription || `Template created from ${project.name || 'project'}`,
      createdAt: new Date().toISOString(),
      createdBy: req.userId,
      diagram: diagramWithMetadata
    };

    // Save to filesystem
    const templatesDir = path.join(__dirname, '../../../data/design_examples');
    const templatePath = path.join(templatesDir, `${templateId}-template.json`);

    // Ensure directory exists
    await fs.mkdir(templatesDir, { recursive: true });

    // Write template file
    await fs.writeFile(templatePath, JSON.stringify(template, null, 2), 'utf8');

    console.log(`[Admin] ✅ Template saved to ${templatePath}`);

    // Reload template library
    const { TemplateLibraryManager } = await import('../services/template-library-manager');
    const templateManager = new TemplateLibraryManager();
    await templateManager.reloadLibrary();
    console.log('[Admin] Template library reloaded after export');

    res.json({
      success: true,
      data: {
        templateId: template.id,
        templateName: template.name,
        filePath: `data/design_examples/${templateId}-template.json`
      },
      timestamp: new Date(),
      requestId: `export-template-${Date.now()}`
    });

  } catch (error: any) {
    console.error('[Admin] Failed to export template:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export template'
    });
  }
});

/**
 * PUT /api/admin/update-template
 * Update an existing template with current architecture diagram
 * Admin only - preserves template name and description
 */
router.put('/update-template', async (req: Request, res: Response) => {
  console.log(`[Admin] PUT /update-template - userId: ${req.userId}`);
  
  try {
    const { projectId, templateId } = req.body;

    if (!projectId || !templateId) {
      return res.status(400).json({
        success: false,
        error: 'projectId and templateId are required'
      });
    }

    // Import required modules
    const { s3Storage } = require('../../utils/s3-storage');
    const { dynamoDBService } = require('../../utils/dynamodb-service');
    const fs = require('fs').promises;
    const path = require('path');

    // Get project to get userId
    const project = await dynamoDBService.getProject(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Get arch_diagram.json from S3
    const diagramContent = await s3Storage.downloadFile(project.userId, projectId, 'arch_diagram.json');
    if (!diagramContent) {
      return res.status(404).json({
        success: false,
        error: 'Architecture diagram not found'
      });
    }

    const diagram = JSON.parse(diagramContent);

    // Ensure diagram has unified metadata format
    const { DiagramMetadataService } = await import('../services/diagram-metadata');
    const diagramWithMetadata = DiagramMetadataService.setForTemplate(diagram);

    // Find existing template file
    const templatesDir = path.join(__dirname, '../../../data/design_examples');
    const templatePath = path.join(templatesDir, `${templateId}.json`);

    // Check if template exists
    try {
      await fs.access(templatePath);
    } catch {
      return res.status(404).json({
        success: false,
        error: `Template not found: ${templateId}.json`
      });
    }

    // Read existing template to preserve metadata
    const existingContent = await fs.readFile(templatePath, 'utf8');
    const existingTemplate = JSON.parse(existingContent);

    // Create backup before updating
    const backupDir = path.join(__dirname, '../../../data/backups');
    await fs.mkdir(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const backupPath = path.join(backupDir, `${templateId}-${timestamp}.json`);
    await fs.writeFile(backupPath, existingContent, 'utf8');
    console.log(`[Admin] Created backup: ${backupPath}`);

    // Update template with new diagram, preserving name and description
    const updatedTemplate = {
      ...existingTemplate,
      diagram: diagramWithMetadata,
      updatedAt: new Date().toISOString(),
      updatedBy: req.userId
    };

    // Write updated template file
    await fs.writeFile(templatePath, JSON.stringify(updatedTemplate, null, 2), 'utf8');

    console.log(`[Admin] ✅ Template updated: ${templatePath}`);

    // Reload template library
    const { TemplateLibraryManager } = await import('../services/template-library-manager');
    const templateManager = new TemplateLibraryManager();
    await templateManager.reloadLibrary();
    console.log('[Admin] Template library reloaded after update');

    res.json({
      success: true,
      data: {
        templateId: updatedTemplate.id,
        templateName: updatedTemplate.name,
        message: `Template "${updatedTemplate.name}" updated successfully`
      },
      timestamp: new Date(),
      requestId: `update-template-${Date.now()}`
    });

  } catch (error: any) {
    console.error('[Admin] Failed to update template:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update template'
    });
  }
});

export default router;
