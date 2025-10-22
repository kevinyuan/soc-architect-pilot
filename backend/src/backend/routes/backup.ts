// Backup API Routes
import express, { Request, Response } from 'express';
import { s3Storage } from '../../utils/s3-storage';
import { dynamoDBService } from '../../utils/dynamodb-service';

const router = express.Router();

// Create a backup of arch_diagram.json
router.post('/create', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.body;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: 'Project ID is required',
      });
    }

    // Get project to retrieve userId
    const project = await dynamoDBService.getProject(projectId);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    // Download current arch_diagram.json
    const diagramContent = await s3Storage.downloadFile(
      project.userId,
      projectId,
      'arch_diagram.json'
    );

    if (!diagramContent) {
      return res.status(404).json({
        success: false,
        error: 'No diagram found to backup',
      });
    }

    // Create backup with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `backup/arch_diagram_${timestamp}.json`;

    await s3Storage.uploadFile(
      project.userId,
      projectId,
      backupFileName,
      diagramContent,
      'application/json'
    );

    console.log(`[Backup] Created backup: ${backupFileName}`);

    return res.json({
      success: true,
      data: {
        backupFileName,
        timestamp,
      },
    });
  } catch (error: any) {
    console.error('Backup creation error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create backup',
    });
  }
});

// List all backups for a project
router.get('/list/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    // Get project to retrieve userId
    const project = await dynamoDBService.getProject(projectId);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    // List all files in backup folder
    const files = await s3Storage.listFiles(project.userId, projectId, 'backup/');
    
    // Filter and parse backup files
    const backups = files
      .filter(file => file.startsWith('backup/arch_diagram_') && file.endsWith('.json'))
      .map(file => {
        // Extract timestamp from filename
        const match = file.match(/arch_diagram_(.+)\.json$/);
        const timestamp = match ? match[1].replace(/-/g, ':').replace(/T/g, 'T') : '';
        return {
          fileName: file,
          timestamp,
          displayName: file.replace('backup/', ''),
        };
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // Newest first

    return res.json({
      success: true,
      data: backups,
    });
  } catch (error: any) {
    console.error('List backups error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to list backups',
    });
  }
});

// Restore a backup
router.post('/restore', async (req: Request, res: Response) => {
  try {
    const { projectId, backupFileName } = req.body;

    if (!projectId || !backupFileName) {
      return res.status(400).json({
        success: false,
        error: 'Project ID and backup file name are required',
      });
    }

    // Get project to retrieve userId
    const project = await dynamoDBService.getProject(projectId);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    // Download backup file
    const backupContent = await s3Storage.downloadFile(
      project.userId,
      projectId,
      backupFileName
    );

    if (!backupContent) {
      return res.status(404).json({
        success: false,
        error: 'Backup file not found',
      });
    }

    // Create a backup of current file before restoring
    const currentContent = await s3Storage.downloadFile(
      project.userId,
      projectId,
      'arch_diagram.json'
    );

    if (currentContent) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      await s3Storage.uploadFile(
        project.userId,
        projectId,
        `backup/arch_diagram_before_restore_${timestamp}.json`,
        currentContent,
        'application/json'
      );
    }

    // Restore backup to arch_diagram.json
    await s3Storage.uploadFile(
      project.userId,
      projectId,
      'arch_diagram.json',
      backupContent,
      'application/json'
    );

    console.log(`[Backup] Restored backup: ${backupFileName}`);

    return res.json({
      success: true,
      data: {
        restoredFrom: backupFileName,
      },
    });
  } catch (error: any) {
    console.error('Restore backup error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to restore backup',
    });
  }
});

// Delete old backups (keep only max_backups)
router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    const { projectId, maxBackups = 10 } = req.body;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: 'Project ID is required',
      });
    }

    // Get project to retrieve userId
    const project = await dynamoDBService.getProject(projectId);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    // List all backup files
    const files = await s3Storage.listFiles(project.userId, projectId, 'backup/');
    
    const backups = files
      .filter(file => file.startsWith('backup/arch_diagram_') && file.endsWith('.json'))
      .map(file => {
        const match = file.match(/arch_diagram_(.+)\.json$/);
        const timestamp = match ? match[1] : '';
        return { fileName: file, timestamp };
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // Newest first

    // Delete old backups if exceeding maxBackups
    const toDelete = backups.slice(maxBackups);
    
    for (const backup of toDelete) {
      await s3Storage.deleteFile(project.userId, projectId, backup.fileName);
      console.log(`[Backup] Deleted old backup: ${backup.fileName}`);
    }

    return res.json({
      success: true,
      data: {
        totalBackups: backups.length,
        deletedCount: toDelete.length,
        remainingCount: Math.min(backups.length, maxBackups),
      },
    });
  } catch (error: any) {
    console.error('Cleanup backups error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to cleanup backups',
    });
  }
});

export default router;
