import { Router } from 'express';
import { workspaceAWSService } from '../../utils/workspace-aws';
import { s3Storage } from '../../utils/s3-storage';
import { dynamoDBService } from '../../utils/dynamodb-service';
import { ProjectNameGenerator } from '../services/project-name-generator';

const router = Router();
const projectNameGenerator = new ProjectNameGenerator();

// Initialize workspace (AWS - no initialization needed)
router.post('/init', async (req, res) => {
  try {
    // With AWS, no initialization is needed
    // S3 and DynamoDB are always ready
    res.json({
      success: true,
      data: {
        initialized: true,
        storage: 'AWS S3',
        database: 'DynamoDB',
        timestamp: new Date().toISOString(),
      }
    });
  } catch (error) {
    console.error('Error initializing workspace:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'WORKSPACE_INIT_ERROR',
        message: 'Failed to initialize workspace'
      }
    });
  }
});

// Generate project name using AI (fast, cost-effective)
router.post('/projects/generate-name', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Message is required to generate project name'
        }
      });
    }

    console.log(`🤖 [PROJECT_NAME_GEN] Generating project name for: "${message.substring(0, 100)}..."`);

    const startTime = Date.now();
    const projectName = await projectNameGenerator.generateProjectName(message);
    const generationTime = Date.now() - startTime;

    console.log(`✅ [PROJECT_NAME_GEN] Generated name: "${projectName}" in ${generationTime}ms`);

    res.json({
      success: true,
      data: {
        projectName,
        generationTime
      }
    });
  } catch (error) {
    console.error('❌ [PROJECT_NAME_GEN] Error generating project name:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'NAME_GENERATION_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate project name'
      }
    });
  }
});

// Project management routes
router.post('/projects', async (req, res) => {
  try {
    // Get userId from request (can be from auth middleware or body)
    const userId = req.body.userId || req.headers['x-user-id'] || 'default-user';
    
    const project = await workspaceAWSService.createProject({
      ...req.body,
      userId,
    });
    
    res.json({
      success: true,
      data: project
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PROJECT_CREATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create project'
      }
    });
  }
});

router.post('/projects/from-template', async (req, res) => {
  try {
    const { templateId, name, description } = req.body;
    const project = await workspaceAWSService.createProjectFromTemplate(templateId, name, description);
    res.json(project);
  } catch (error) {
    console.error('Error creating project from template:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PROJECT_TEMPLATE_ERROR',
        message: 'Failed to create project from template'
      }
    });
  }
});

router.get('/projects', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string || 'default-user';
    const { tags, search } = req.query;
    const filters: any = {};

    if (tags) {
      filters.tags = (tags as string).split(',');
    }
    if (search) {
      filters.search = search as string;
    }

    const projects = await workspaceAWSService.listProjects(userId, filters);
    res.json({
      success: true,
      data: projects
    });
  } catch (error) {
    console.error('Error listing projects:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PROJECT_LIST_ERROR',
        message: 'Failed to list projects'
      }
    });
  }
});

// Get projects shared with current user (must be before /projects/:projectId)
router.get('/projects/shared', async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'] as string || 'default@example.com';

    const projects = await dynamoDBService.getSharedProjects(userEmail);

    res.json({
      success: true,
      data: projects
    });
  } catch (error) {
    console.error('Error getting shared projects:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SHARED_PROJECTS_ERROR',
        message: 'Failed to get shared projects'
      }
    });
  }
});

router.get('/projects/:projectId', async (req, res) => {
  try {
    const project = await workspaceAWSService.getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found'
        }
      });
    }
    res.json({
      success: true,
      data: project
    });
  } catch (error) {
    console.error('Error loading project:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PROJECT_LOAD_ERROR',
        message: 'Failed to load project'
      }
    });
  }
});

router.put('/projects/:projectId', async (req, res) => {
  try {
    const project = await workspaceAWSService.updateProject(req.params.projectId, req.body);
    res.json({
      success: true,
      data: project
    });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PROJECT_UPDATE_ERROR',
        message: 'Failed to update project'
      }
    });
  }
});

router.delete('/projects/:projectId', async (req, res) => {
  try {
    await workspaceAWSService.deleteProject(req.params.projectId);
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PROJECT_DELETE_ERROR',
        message: 'Failed to delete project'
      }
    });
  }
});

router.post('/projects/:projectId/duplicate', async (req, res) => {
  try {
    const { newName } = req.body;
    const project = await workspaceAWSService.duplicateProject(req.params.projectId, newName);
    res.json({
      success: true,
      data: project
    });
  } catch (error) {
    console.error('Error duplicating project:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PROJECT_DUPLICATE_ERROR',
        message: 'Failed to duplicate project'
      }
    });
  }
});

// Session management routes
router.put('/projects/:projectId/sessions/:sessionId', async (req, res) => {
  try {
    await workspaceAWSService.saveSession(req.params.projectId, req.body);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving session:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SESSION_SAVE_ERROR',
        message: 'Failed to save session'
      }
    });
  }
});

router.get('/projects/:projectId/sessions/:sessionId', async (req, res) => {
  try {
    const session = await workspaceAWSService.loadSession(req.params.projectId, req.params.sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found'
        }
      });
    }
    res.json(session);
  } catch (error) {
    console.error('Error loading session:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SESSION_LOAD_ERROR',
        message: 'Failed to load session'
      }
    });
  }
});

router.delete('/projects/:projectId/sessions/:sessionId', async (req, res) => {
  try {
    await workspaceAWSService.deleteSession(req.params.projectId, req.params.sessionId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SESSION_DELETE_ERROR',
        message: 'Failed to delete session'
      }
    });
  }
});

// Diagram management routes
router.put('/projects/:projectId/diagrams/:diagramId', async (req, res) => {
  try {
    console.log(`📝 Saving diagram: projectId=${req.params.projectId}, diagramId=${req.params.diagramId}`);
    await workspaceAWSService.saveDiagram(req.params.projectId, req.params.diagramId, req.body);
    console.log(`✅ Successfully saved diagram to S3`);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error saving diagram:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DIAGRAM_SAVE_ERROR',
        message: 'Failed to save diagram',
        details: error instanceof Error ? error.message : String(error)
      }
    });
  }
});

router.get('/projects/:projectId/diagrams/:diagramId', async (req, res) => {
  try {
    const diagram = await workspaceAWSService.loadDiagram(req.params.projectId, req.params.diagramId);
    if (!diagram) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'DIAGRAM_NOT_FOUND',
          message: 'Diagram not found'
        }
      });
    }
    res.json(diagram);
  } catch (error) {
    console.error('Error loading diagram:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DIAGRAM_LOAD_ERROR',
        message: 'Failed to load diagram'
      }
    });
  }
});

router.delete('/projects/:projectId/diagrams/:diagramId', async (req, res) => {
  try {
    await workspaceAWSService.deleteDiagram(req.params.projectId, req.params.diagramId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting diagram:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DIAGRAM_DELETE_ERROR',
        message: 'Failed to delete diagram'
      }
    });
  }
});

// File management routes
// GET /api/v1/workspace/projects/:projectId/files?path=relative/path
router.get('/projects/:projectId/files', async (req, res) => {
  try {
    const { projectId } = req.params;
    const relativePath = req.query.path as string;

    if (!relativePath) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PATH',
          message: 'File path is required'
        }
      });
    }

    // Get project to find userId
    const project = await dynamoDBService.getProject(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found'
        }
      });
    }

    // Read file from S3
    const content = await s3Storage.downloadFile(project.userId, projectId, relativePath);
    
    if (content === null) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: `File not found: ${relativePath}`
        }
      });
    }

    // Get file metadata
    const metadata = await s3Storage.getFileMetadata(project.userId, projectId, relativePath);

    res.json({
      success: true,
      data: {
        content,
        path: relativePath,
        lastModified: metadata?.lastModified.toISOString(),
        size: metadata?.size,
        contentType: metadata?.contentType
      }
    });
  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FILE_READ_ERROR',
        message: error instanceof Error ? error.message : 'Failed to read file'
      }
    });
  }
});

// PUT /api/v1/workspace/projects/:projectId/files
router.put('/projects/:projectId/files', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { path: relativePath, content } = req.body;

    if (!relativePath || content === undefined) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'Both path and content are required'
        }
      });
    }

    // Get project to find userId
    const project = await dynamoDBService.getProject(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found'
        }
      });
    }

    // Determine content type based on file extension
    let contentType = 'application/octet-stream';
    if (relativePath.endsWith('.json') || relativePath.endsWith('.lib') || relativePath.endsWith('.canvas')) {
      contentType = 'application/json';
    } else if (relativePath.endsWith('.c') || relativePath.endsWith('.h') || relativePath.endsWith('.cpp')) {
      contentType = 'text/plain';
    } else if (relativePath.endsWith('.md')) {
      contentType = 'text/markdown';
    }

    // Write file to S3
    await s3Storage.uploadFile(project.userId, projectId, relativePath, content, contentType);

    // Update project lastModified
    await dynamoDBService.updateProject(projectId, {});

    // Get updated metadata
    const metadata = await s3Storage.getFileMetadata(project.userId, projectId, relativePath);

    res.json({
      success: true,
      data: {
        path: relativePath,
        lastModified: metadata?.lastModified.toISOString(),
        size: metadata?.size
      }
    });
  } catch (error) {
    console.error('Error writing file:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FILE_WRITE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to write file'
      }
    });
  }
});

// DELETE /api/v1/workspace/projects/:projectId/files?path=relative/path
router.delete('/projects/:projectId/files', async (req, res) => {
  try {
    const { projectId } = req.params;
    const relativePath = req.query.path as string;

    if (!relativePath) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PATH',
          message: 'File path is required'
        }
      });
    }

    // Get project to find userId
    const project = await dynamoDBService.getProject(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found'
        }
      });
    }

    // Delete file from S3
    await s3Storage.deleteFile(project.userId, projectId, relativePath);

    res.json({
      success: true,
      data: {
        deleted: true,
        path: relativePath
      }
    });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FILE_DELETE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to delete file'
      }
    });
  }
});

// GET /api/v1/workspace/projects/:projectId/files/list?path=directory/path
router.get('/projects/:projectId/files/list', async (req, res) => {
  try {
    const { projectId } = req.params;
    const directoryPath = (req.query.path as string) || '';

    // Get project to find userId
    const project = await dynamoDBService.getProject(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found'
        }
      });
    }

    // List files from S3
    const files = await s3Storage.listProjectFiles(project.userId, projectId, directoryPath);

    res.json({
      success: true,
      data: {
        files: files.map(f => ({
          path: f.path,
          name: f.name,
          size: f.size,
          lastModified: f.lastModified.toISOString(),
          isDirectory: f.isDirectory
        }))
      }
    });
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FILE_LIST_ERROR',
        message: error instanceof Error ? error.message : 'Failed to list files'
      }
    });
  }
});

// POST /api/v1/workspace/projects/:projectId/files/rename
router.post('/projects/:projectId/files/rename', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { oldPath, newName } = req.body;

    if (!oldPath || !newName) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'Both oldPath and newName are required'
        }
      });
    }

    // Get project to find userId
    const project = await dynamoDBService.getProject(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found'
        }
      });
    }

    await s3Storage.renameFile(project.userId, projectId, oldPath, newName);

    res.json({
      success: true,
      data: {
        renamed: true,
        oldPath,
        newName
      }
    });
  } catch (error) {
    console.error('Error renaming file:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FILE_RENAME_ERROR',
        message: error instanceof Error ? error.message : 'Failed to rename file'
      }
    });
  }
});

// POST /api/v1/workspace/projects/:projectId/files/duplicate
router.post('/projects/:projectId/files/duplicate', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { path: filePath, type } = req.body;

    if (!filePath || !type) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'Both path and type are required'
        }
      });
    }

    // Get project to find userId
    const project = await dynamoDBService.getProject(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found'
        }
      });
    }

    const newPath = await s3Storage.duplicateFile(project.userId, projectId, filePath, type);

    res.json({
      success: true,
      data: {
        duplicated: true,
        originalPath: filePath,
        newPath
      }
    });
  } catch (error) {
    console.error('Error duplicating file:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FILE_DUPLICATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to duplicate file'
      }
    });
  }
});

// POST /api/v1/workspace/projects/:projectId/files/create
router.post('/projects/:projectId/files/create', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { parentPath, name, type } = req.body;

    if (!name || !type) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'Both name and type are required'
        }
      });
    }

    // Get project to find userId
    const project = await dynamoDBService.getProject(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found'
        }
      });
    }

    const newPath = await s3Storage.createFileOrDirectory(
      project.userId,
      projectId,
      parentPath || '',
      name,
      type
    );

    res.json({
      success: true,
      data: {
        created: true,
        path: newPath,
        type
      }
    });
  } catch (error) {
    console.error('Error creating file/directory:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FILE_CREATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create file/directory'
      }
    });
  }
});

// Template management routes
router.get('/templates', async (req, res) => {
  try {
    const templates = await workspaceAWSService.listTemplates();
    res.json(templates);
  } catch (error) {
    console.error('Error listing templates:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'TEMPLATE_LIST_ERROR',
        message: 'Failed to list templates'
      }
    });
  }
});

// Export/Import routes
router.post('/projects/:projectId/export', async (req, res) => {
  try {
    const exportData = await workspaceAWSService.exportProject(req.params.projectId, req.body);
    res.setHeader('Content-Type', 'application/json');
    res.send(exportData);
  } catch (error) {
    console.error('Error exporting project:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PROJECT_EXPORT_ERROR',
        message: 'Failed to export project'
      }
    });
  }
});

router.post('/projects/import', async (req, res) => {
  try {
    const { importData } = req.body;
    const result = await workspaceAWSService.importProject(importData);
    res.json(result);
  } catch (error) {
    console.error('Error importing project:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PROJECT_IMPORT_ERROR',
        message: 'Failed to import project'
      }
    });
  }
});

// Component Library routes
// GET /api/v1/workspace/projects/:projectId/components/app
router.get('/projects/:projectId/components/app', async (req, res) => {
  try {
    const { projectId } = req.params;

    // Get project to find userId
    const project = await dynamoDBService.getProject(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found'
        }
      });
    }

    // Read app_components.lib from S3
    const filePath = '2-lib/app_components.lib';
    const content = await s3Storage.downloadFile(project.userId, projectId, filePath);

    if (content === null) {
      // Return empty array if file doesn't exist
      return res.json({
        success: true,
        data: { components: [] }
      });
    }

    const components = JSON.parse(content);
    res.json({
      success: true,
      data: { components }
    });
  } catch (error) {
    console.error('Error reading app components:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'COMPONENTS_READ_ERROR',
        message: error instanceof Error ? error.message : 'Failed to read app components'
      }
    });
  }
});

// GET /api/v1/workspace/projects/:projectId/components/user
router.get('/projects/:projectId/components/user', async (req, res) => {
  try {
    const { projectId } = req.params;

    // Get project to find userId
    const project = await dynamoDBService.getProject(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found'
        }
      });
    }

    // Read user_components.lib from S3
    const filePath = '2-lib/user_components.lib';
    const content = await s3Storage.downloadFile(project.userId, projectId, filePath);

    if (content === null) {
      // Return empty array if file doesn't exist
      return res.json({
        success: true,
        data: { components: [] }
      });
    }

    const components = JSON.parse(content);
    res.json({
      success: true,
      data: { components }
    });
  } catch (error) {
    console.error('Error reading user components:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'COMPONENTS_READ_ERROR',
        message: error instanceof Error ? error.message : 'Failed to read user components'
      }
    });
  }
});

// POST /api/v1/workspace/projects/:projectId/components/user
router.post('/projects/:projectId/components/user', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { component } = req.body;

    if (!component) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_COMPONENT',
          message: 'Component data is required'
        }
      });
    }

    // Get project to find userId
    const project = await dynamoDBService.getProject(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found'
        }
      });
    }

    // Read existing components
    const filePath = '2-lib/user_components.lib';
    let components: any[] = [];
    const content = await s3Storage.downloadFile(project.userId, projectId, filePath);

    if (content !== null) {
      components = JSON.parse(content);
    }

    // Check if component already exists (by id)
    const existingIndex = components.findIndex(c => c.id === component.id);
    
    if (existingIndex >= 0) {
      // Update existing component
      components[existingIndex] = component;
    } else {
      // Add new component
      components.push(component);
    }

    // Write back to S3
    await s3Storage.uploadFile(
      project.userId,
      projectId,
      filePath,
      JSON.stringify(components, null, 2),
      'application/json'
    );

    res.json({
      success: true,
      data: { component }
    });
  } catch (error) {
    console.error('Error adding user component:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'COMPONENT_ADD_ERROR',
        message: error instanceof Error ? error.message : 'Failed to add component'
      }
    });
  }
});

// DELETE /api/v1/workspace/projects/:projectId/components/user/:componentId
router.delete('/projects/:projectId/components/user/:componentId', async (req, res) => {
  try {
    const { projectId, componentId } = req.params;

    // Get project to find userId
    const project = await dynamoDBService.getProject(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found'
        }
      });
    }

    // Read existing components
    const filePath = '2-lib/user_components.lib';
    const content = await s3Storage.downloadFile(project.userId, projectId, filePath);

    if (content === null) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'COMPONENTS_NOT_FOUND',
          message: 'User components file not found'
        }
      });
    }

    const components = JSON.parse(content);
    const filteredComponents = components.filter((c: any) => c.id !== componentId);

    // Write back to S3
    await s3Storage.uploadFile(
      project.userId,
      projectId,
      filePath,
      JSON.stringify(filteredComponents, null, 2),
      'application/json'
    );

    res.json({
      success: true,
      data: { deleted: true, componentId }
    });
  } catch (error) {
    console.error('Error removing user component:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'COMPONENT_DELETE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to remove component'
      }
    });
  }
});

// Share a project with another user
router.post('/projects/:projectId/share', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { sharedWithEmail } = req.body;
    const userId = req.headers['x-user-id'] as string || 'default-user';
    const userEmail = req.headers['x-user-email'] as string || 'default@example.com';

    if (!sharedWithEmail) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_EMAIL',
          message: 'Shared with email is required'
        }
      });
    }

    // Check if project exists and belongs to the user
    const project = await dynamoDBService.getProject(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found'
        }
      });
    }

    if (project.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to share this project'
        }
      });
    }

    // Check if already shared with this email
    const isAlreadyShared = await dynamoDBService.isProjectSharedWith(projectId, sharedWithEmail);
    if (isAlreadyShared) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ALREADY_SHARED',
          message: 'Project is already shared with this user'
        }
      });
    }

    // Share the project
    const share = await dynamoDBService.shareProject(
      projectId,
      userId,
      userEmail,
      sharedWithEmail
    );

    res.json({
      success: true,
      data: share
    });
  } catch (error) {
    console.error('Error sharing project:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      projectId: req.params.projectId,
      sharedWithEmail: req.body.sharedWithEmail,
      userId: req.headers['x-user-id'],
      userEmail: req.headers['x-user-email']
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'SHARE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to share project'
      }
    });
  }
});

// Get all shares for a project
router.get('/projects/:projectId/shares', async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.headers['x-user-id'] as string || 'default-user';

    // Check if project exists and belongs to the user
    const project = await dynamoDBService.getProject(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found'
        }
      });
    }

    if (project.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to view shares for this project'
        }
      });
    }

    const shares = await dynamoDBService.getProjectShares(projectId);

    res.json({
      success: true,
      data: shares
    });
  } catch (error) {
    console.error('Error getting project shares:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SHARES_ERROR',
        message: 'Failed to get project shares'
      }
    });
  }
});

export default router;