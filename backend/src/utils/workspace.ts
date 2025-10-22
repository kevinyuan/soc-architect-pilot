import fs from 'fs/promises';
import path from 'path';
import { WorkspaceConfig, Project, ProjectMetadata, DesignSession, DiagramData } from '../types/index';

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  category: 'soc' | 'iot' | 'embedded' | 'custom';
  components: any[];
  defaultLayout: string;
  tags: string[];
}

export interface ProjectExportOptions {
  format: 'json' | 'zip' | 'pdf';
  includeAssets: boolean;
  includeDiagrams: boolean;
  includeConversations: boolean;
}

export interface ProjectImportResult {
  success: boolean;
  project?: Project;
  warnings: string[];
  errors: string[];
}

export class WorkspaceService {
  private workspaceDir: string;
  private configFile: string;
  private templatesDir: string;
  private backupsDir: string;

  constructor(workspaceDir: string = './workspace') {
    this.workspaceDir = workspaceDir;
    this.configFile = path.join(workspaceDir, 'workspace.json');
    this.templatesDir = path.join(workspaceDir, 'templates');
    this.backupsDir = path.join(workspaceDir, 'backups');
  }

  async initializeWorkspace(): Promise<WorkspaceConfig> {
    try {
      // Create workspace directory structure
      await fs.mkdir(this.workspaceDir, { recursive: true });
      await fs.mkdir(path.join(this.workspaceDir, 'projects'), { recursive: true });
      await fs.mkdir(this.templatesDir, { recursive: true });
      await fs.mkdir(this.backupsDir, { recursive: true });
      
      // Check if config exists
      const config = await this.loadWorkspaceConfig();
      if (config) {
        return config;
      }
      
      // Create default config
      const defaultConfig: WorkspaceConfig = {
        version: '1.0.0',
        createdAt: new Date(),
        lastModified: new Date(),
        projects: [],
        settings: {
          autoSave: true,
          theme: 'light',
          defaultLayout: 'hierarchical',
          backupInterval: 300000, // 5 minutes
          maxBackups: 10
        }
      };
      
      await this.saveWorkspaceConfig(defaultConfig);
      await this.createDefaultTemplates();
      return defaultConfig;
      
    } catch (error) {
      throw new Error(`Failed to initialize workspace: ${error}`);
    }
  }

  async loadWorkspaceConfig(): Promise<WorkspaceConfig | null> {
    try {
      const configData = await fs.readFile(this.configFile, 'utf-8');
      return JSON.parse(configData);
    } catch (error) {
      return null;
    }
  }

  async saveWorkspaceConfig(config: WorkspaceConfig): Promise<void> {
    try {
      config.lastModified = new Date();
      await fs.writeFile(this.configFile, JSON.stringify(config, null, 2));
    } catch (error) {
      throw new Error(`Failed to save workspace config: ${error}`);
    }
  }

  async createProject(projectData: Omit<Project, 'id' | 'createdAt' | 'lastModified'>): Promise<Project> {
    try {
      const config = await this.loadWorkspaceConfig();
      if (!config) {
        throw new Error('Workspace not initialized');
      }

      const project: Project = {
        ...projectData,
        id: this.generateProjectId(),
        createdAt: new Date(),
        lastModified: new Date(),
        sessions: projectData.sessions || [],
        diagrams: projectData.diagrams || [],
        specifications: projectData.specifications || []
      };

      // Create project directory structure
      const projectDir = path.join(this.workspaceDir, 'projects', project.id);
      await fs.mkdir(projectDir, { recursive: true });
      await fs.mkdir(path.join(projectDir, 'sessions'), { recursive: true });
      await fs.mkdir(path.join(projectDir, 'diagrams'), { recursive: true });
      await fs.mkdir(path.join(projectDir, 'specifications'), { recursive: true });
      await fs.mkdir(path.join(projectDir, 'assets'), { recursive: true });

      // Save project file
      await this.saveProject(project);

      // Update workspace config
      config.projects.push({
        id: project.id,
        name: project.name,
        description: project.description,
        createdAt: project.createdAt,
        lastModified: project.lastModified,
        tags: project.tags || []
      });

      await this.saveWorkspaceConfig(config);
      return project;
      
    } catch (error) {
      throw new Error(`Failed to create project: ${error}`);
    }
  }

  async createProjectFromTemplate(templateId: string, projectName: string, projectDescription?: string): Promise<Project> {
    try {
      const template = await this.loadTemplate(templateId);
      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      const projectData = {
        name: projectName,
        description: projectDescription || template.description,
        tags: [...template.tags],
        sessions: [],
        diagrams: [],
        specifications: []
      };

      const project = await this.createProject(projectData);
      
      // If template has components, create an initial session
      if (template.components && template.components.length > 0) {
        const initialSession: DesignSession = {
          sessionId: this.generateSessionId(),
          startTime: new Date(),
          lastActivity: new Date(),
          phase: 'requirements',
          conversationHistory: [{
            id: '1',
            sessionId: this.generateSessionId(),
            role: 'assistant',
            content: `Welcome to your new ${template.name} project! I've set up some initial components based on the template. What would you like to build?`,
            timestamp: new Date()
          }],
          requirements: [],
          constraints: []
        };

        await this.saveSession(project.id, initialSession);
        project.sessions.push(initialSession.sessionId);
        await this.saveProject(project);
      }

      return project;
    } catch (error) {
      throw new Error(`Failed to create project from template: ${error}`);
    }
  }

  async loadProject(projectId: string): Promise<Project | null> {
    try {
      const projectFile = path.join(this.workspaceDir, 'projects', projectId, 'project.json');
      const projectData = await fs.readFile(projectFile, 'utf-8');
      return JSON.parse(projectData);
    } catch (error) {
      return null;
    }
  }

  async saveProject(project: Project): Promise<void> {
    try {
      project.lastModified = new Date();
      const projectDir = path.join(this.workspaceDir, 'projects', project.id);
      const projectFile = path.join(projectDir, 'project.json');
      
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(projectFile, JSON.stringify(project, null, 2));
      
      // Update workspace config
      const config = await this.loadWorkspaceConfig();
      if (config) {
        const projectIndex = config.projects.findIndex(p => p.id === project.id);
        if (projectIndex >= 0) {
          config.projects[projectIndex] = {
            id: project.id,
            name: project.name,
            description: project.description,
            createdAt: project.createdAt,
            lastModified: project.lastModified,
            tags: project.tags || []
          };
          await this.saveWorkspaceConfig(config);
        }
      }
      
    } catch (error) {
      throw new Error(`Failed to save project: ${error}`);
    }
  }

  async updateProject(projectId: string, updates: Partial<Project>): Promise<Project> {
    try {
      const project = await this.loadProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }

      const updatedProject = {
        ...project,
        ...updates,
        id: project.id, // Ensure ID cannot be changed
        createdAt: project.createdAt, // Ensure creation date cannot be changed
        lastModified: new Date()
      };

      await this.saveProject(updatedProject);
      return updatedProject;
    } catch (error) {
      throw new Error(`Failed to update project: ${error}`);
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    try {
      // Create backup before deletion
      await this.backupProject(projectId);
      
      // Remove project directory
      const projectDir = path.join(this.workspaceDir, 'projects', projectId);
      await fs.rm(projectDir, { recursive: true, force: true });
      
      // Update workspace config
      const config = await this.loadWorkspaceConfig();
      if (config) {
        config.projects = config.projects.filter(p => p.id !== projectId);
        await this.saveWorkspaceConfig(config);
      }
      
    } catch (error) {
      throw new Error(`Failed to delete project: ${error}`);
    }
  }

  async duplicateProject(projectId: string, newName: string): Promise<Project> {
    try {
      const originalProject = await this.loadProject(projectId);
      if (!originalProject) {
        throw new Error(`Project not found: ${projectId}`);
      }

      const duplicatedProject = {
        ...originalProject,
        name: newName,
        description: `Copy of ${originalProject.description}`,
        tags: [...(originalProject.tags || []), 'copy']
      };

      // Remove ID and timestamps to create new project
      delete (duplicatedProject as any).id;
      delete (duplicatedProject as any).createdAt;
      delete (duplicatedProject as any).lastModified;

      const newProject = await this.createProject(duplicatedProject);

      // Copy sessions and diagrams
      for (const sessionId of originalProject.sessions || []) {
        const session = await this.loadSession(projectId, sessionId);
        if (session) {
          const newSessionId = this.generateSessionId();
          const newSession = {
            ...session,
            sessionId: newSessionId
          };
          await this.saveSession(newProject.id, newSession);
          newProject.sessions.push(newSessionId);
        }
      }

      // Copy diagrams
      for (const diagramId of originalProject.diagrams || []) {
        const diagram = await this.loadDiagram(projectId, diagramId);
        if (diagram) {
          const newDiagramId = this.generateDiagramId();
          await this.saveDiagram(newProject.id, newDiagramId, diagram);
          newProject.diagrams.push(newDiagramId);
        }
      }

      await this.saveProject(newProject);
      return newProject;
    } catch (error) {
      throw new Error(`Failed to duplicate project: ${error}`);
    }
  }

  async listProjects(filters?: { tags?: string[]; search?: string }): Promise<ProjectMetadata[]> {
    try {
      const config = await this.loadWorkspaceConfig();
      let projects = config?.projects || [];

      if (filters) {
        if (filters.tags && filters.tags.length > 0) {
          projects = projects.filter(p => 
            filters.tags!.some(tag => p.tags.includes(tag))
          );
        }

        if (filters.search) {
          const searchLower = filters.search.toLowerCase();
          projects = projects.filter(p => 
            p.name.toLowerCase().includes(searchLower) ||
            p.description.toLowerCase().includes(searchLower)
          );
        }
      }

      return projects.sort((a, b) => 
        new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
      );
    } catch (error) {
      throw new Error(`Failed to list projects: ${error}`);
    }
  }

  // Session Management
  async saveSession(projectId: string, session: DesignSession): Promise<void> {
    try {
      const sessionFile = path.join(
        this.workspaceDir, 
        'projects', 
        projectId, 
        'sessions', 
        `${session.sessionId}.json`
      );
      await fs.writeFile(sessionFile, JSON.stringify(session, null, 2));
    } catch (error) {
      throw new Error(`Failed to save session: ${error}`);
    }
  }

  async loadSession(projectId: string, sessionId: string): Promise<DesignSession | null> {
    try {
      const sessionFile = path.join(
        this.workspaceDir, 
        'projects', 
        projectId, 
        'sessions', 
        `${sessionId}.json`
      );
      const sessionData = await fs.readFile(sessionFile, 'utf-8');
      return JSON.parse(sessionData);
    } catch (error) {
      return null;
    }
  }

  async deleteSession(projectId: string, sessionId: string): Promise<void> {
    try {
      const sessionFile = path.join(
        this.workspaceDir, 
        'projects', 
        projectId, 
        'sessions', 
        `${sessionId}.json`
      );
      await fs.unlink(sessionFile);

      // Update project
      const project = await this.loadProject(projectId);
      if (project) {
        project.sessions = project.sessions.filter(id => id !== sessionId);
        await this.saveProject(project);
      }
    } catch (error) {
      throw new Error(`Failed to delete session: ${error}`);
    }
  }

  // Diagram Management
  async saveDiagram(projectId: string, diagramId: string, diagramData: DiagramData): Promise<void> {
    try {
      const diagramFile = path.join(
        this.workspaceDir, 
        'projects', 
        projectId, 
        'diagrams', 
        `${diagramId}.json`
      );
      await fs.writeFile(diagramFile, JSON.stringify(diagramData, null, 2));
    } catch (error) {
      throw new Error(`Failed to save diagram: ${error}`);
    }
  }

  async loadDiagram(projectId: string, diagramId: string): Promise<DiagramData | null> {
    try {
      const diagramFile = path.join(
        this.workspaceDir, 
        'projects', 
        projectId, 
        'diagrams', 
        `${diagramId}.json`
      );
      const diagramData = await fs.readFile(diagramFile, 'utf-8');
      return JSON.parse(diagramData);
    } catch (error) {
      return null;
    }
  }

  async deleteDiagram(projectId: string, diagramId: string): Promise<void> {
    try {
      const diagramFile = path.join(
        this.workspaceDir, 
        'projects', 
        projectId, 
        'diagrams', 
        `${diagramId}.json`
      );
      await fs.unlink(diagramFile);

      // Update project
      const project = await this.loadProject(projectId);
      if (project) {
        project.diagrams = project.diagrams.filter(id => id !== diagramId);
        await this.saveProject(project);
      }
    } catch (error) {
      throw new Error(`Failed to delete diagram: ${error}`);
    }
  }

  // Template Management
  async createTemplate(template: ProjectTemplate): Promise<void> {
    try {
      const templateFile = path.join(this.templatesDir, `${template.id}.json`);
      await fs.writeFile(templateFile, JSON.stringify(template, null, 2));
    } catch (error) {
      throw new Error(`Failed to create template: ${error}`);
    }
  }

  async loadTemplate(templateId: string): Promise<ProjectTemplate | null> {
    try {
      const templateFile = path.join(this.templatesDir, `${templateId}.json`);
      const templateData = await fs.readFile(templateFile, 'utf-8');
      return JSON.parse(templateData);
    } catch (error) {
      return null;
    }
  }

  async listTemplates(): Promise<ProjectTemplate[]> {
    try {
      const files = await fs.readdir(this.templatesDir);
      const templates: ProjectTemplate[] = [];
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const templateId = file.replace('.json', '');
          const template = await this.loadTemplate(templateId);
          if (template) {
            templates.push(template);
          }
        }
      }
      
      return templates;
    } catch (error) {
      return [];
    }
  }

  // Backup and Recovery
  async backupProject(projectId: string): Promise<string> {
    try {
      const project = await this.loadProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupId = `${projectId}_${timestamp}`;
      const backupDir = path.join(this.backupsDir, backupId);
      const projectDir = path.join(this.workspaceDir, 'projects', projectId);

      // Copy entire project directory
      await this.copyDirectory(projectDir, backupDir);

      // Clean up old backups
      await this.cleanupOldBackups();

      return backupId;
    } catch (error) {
      throw new Error(`Failed to backup project: ${error}`);
    }
  }

  async restoreProject(backupId: string): Promise<Project> {
    try {
      const backupDir = path.join(this.backupsDir, backupId);
      const projectFile = path.join(backupDir, 'project.json');
      
      // Load project from backup
      const projectData = await fs.readFile(projectFile, 'utf-8');
      const project: Project = JSON.parse(projectData);
      
      // Generate new ID to avoid conflicts
      const newProjectId = this.generateProjectId();
      const newProjectDir = path.join(this.workspaceDir, 'projects', newProjectId);
      
      // Copy backup to new project location
      await this.copyDirectory(backupDir, newProjectDir);
      
      // Update project with new ID
      project.id = newProjectId;
      project.name = `${project.name} (Restored)`;
      project.lastModified = new Date();
      
      await this.saveProject(project);
      return project;
    } catch (error) {
      throw new Error(`Failed to restore project: ${error}`);
    }
  }

  // Export and Import
  async exportProject(projectId: string, options: ProjectExportOptions): Promise<string> {
    try {
      const project = await this.loadProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }

      const exportData: any = {
        project,
        exportedAt: new Date(),
        version: '1.0.0'
      };

      if (options.includeConversations) {
        exportData.sessions = [];
        for (const sessionId of project.sessions || []) {
          const session = await this.loadSession(projectId, sessionId);
          if (session) {
            exportData.sessions.push(session);
          }
        }
      }

      if (options.includeDiagrams) {
        exportData.diagrams = [];
        for (const diagramId of project.diagrams || []) {
          const diagram = await this.loadDiagram(projectId, diagramId);
          if (diagram) {
            exportData.diagrams.push({ id: diagramId, data: diagram });
          }
        }
      }

      const exportJson = JSON.stringify(exportData, null, 2);
      
      if (options.format === 'json') {
        return exportJson;
      }
      
      // For other formats, we'd implement ZIP or PDF generation
      throw new Error(`Export format ${options.format} not yet implemented`);
    } catch (error) {
      throw new Error(`Failed to export project: ${error}`);
    }
  }

  async importProject(importData: string): Promise<ProjectImportResult> {
    try {
      const data = JSON.parse(importData);
      const warnings: string[] = [];
      const errors: string[] = [];

      if (!data.project) {
        errors.push('Invalid import data: missing project');
        return { success: false, warnings, errors };
      }

      // Create new project
      const projectData = {
        ...data.project,
        name: `${data.project.name} (Imported)`,
        sessions: [],
        diagrams: [],
        specifications: []
      };

      delete projectData.id;
      delete projectData.createdAt;
      delete projectData.lastModified;

      const project = await this.createProject(projectData);

      // Import sessions
      if (data.sessions) {
        for (const session of data.sessions) {
          try {
            const newSessionId = this.generateSessionId();
            const newSession = {
              ...session,
              sessionId: newSessionId
            };
            await this.saveSession(project.id, newSession);
            project.sessions.push(newSessionId);
          } catch (error) {
            warnings.push(`Failed to import session: ${error}`);
          }
        }
      }

      // Import diagrams
      if (data.diagrams) {
        for (const diagramEntry of data.diagrams) {
          try {
            const newDiagramId = this.generateDiagramId();
            await this.saveDiagram(project.id, newDiagramId, diagramEntry.data);
            project.diagrams.push(newDiagramId);
          } catch (error) {
            warnings.push(`Failed to import diagram: ${error}`);
          }
        }
      }

      await this.saveProject(project);

      return {
        success: true,
        project,
        warnings,
        errors
      };
    } catch (error) {
      return {
        success: false,
        warnings: [],
        errors: [`Failed to import project: ${error}`]
      };
    }
  }

  // Utility Methods
  private async createDefaultTemplates(): Promise<void> {
    const templates: ProjectTemplate[] = [
      {
        id: 'basic-soc',
        name: 'Basic SoC',
        description: 'A simple System-on-Chip with CPU, memory, and basic I/O',
        category: 'soc',
        components: [],
        defaultLayout: 'hierarchical',
        tags: ['soc', 'basic', 'template']
      },
      {
        id: 'iot-gateway',
        name: 'IoT Gateway',
        description: 'IoT gateway with wireless connectivity and sensor interfaces',
        category: 'iot',
        components: [],
        defaultLayout: 'hierarchical',
        tags: ['iot', 'gateway', 'wireless']
      },
      {
        id: 'embedded-controller',
        name: 'Embedded Controller',
        description: 'Microcontroller-based embedded system',
        category: 'embedded',
        components: [],
        defaultLayout: 'grid',
        tags: ['embedded', 'microcontroller', 'control']
      }
    ];

    for (const template of templates) {
      try {
        await this.createTemplate(template);
      } catch (error) {
        // Template might already exist, ignore error
      }
    }
  }

  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  private async cleanupOldBackups(): Promise<void> {
    try {
      const config = await this.loadWorkspaceConfig();
      const maxBackups = config?.settings?.maxBackups || 10;

      const backups = await fs.readdir(this.backupsDir);
      if (backups.length > maxBackups) {
        // Sort by creation time and remove oldest
        const backupStats = await Promise.all(
          backups.map(async (backup) => {
            const backupPath = path.join(this.backupsDir, backup);
            const stats = await fs.stat(backupPath);
            return { name: backup, path: backupPath, created: stats.birthtime };
          })
        );

        backupStats.sort((a, b) => a.created.getTime() - b.created.getTime());
        
        const toDelete = backupStats.slice(0, backupStats.length - maxBackups);
        for (const backup of toDelete) {
          await fs.rm(backup.path, { recursive: true, force: true });
        }
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  private generateProjectId(): string {
    return `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateDiagramId(): string {
    return `diag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Legacy export for backward compatibility
export class WorkspaceFileManager extends WorkspaceService {
  constructor(workspaceDir?: string) {
    super(workspaceDir);
  }
}