"use client";

import * as React from "react";
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sparkles,
  PlusCircle,
  Building,
  ArrowRight,
  Lightbulb as ConceptIcon,
  Blocks as ArchitectIcon,
  ShieldCheck as DRCIcon,
  FileJson2 as CodeIcon,
  BarChart3 as AnalyticsIcon,
  ScrollText as BOMIcon,
  Send,
  MoreVertical,
  Edit2,
  Box,
  MoreHorizontal,
  Copy,
  Trash2,
  Share2,
  Clock,
  FolderOpen,
  HelpCircle,
  Wand2,
  Loader2,
} from "lucide-react";
import { CreateWorkspaceDialog } from "./CreateWorkspaceDialog";
import { OpenProjectDialog } from "./OpenProjectDialog";
import { WorkflowGuideOverlay } from "./WorkflowGuideOverlay";
import { ShareProjectDialog } from "./ShareProjectDialog";
import type { ViewMode } from '@/types/ide';
import { cn } from "@/lib/utils";
import { useConceptChat, clearProjectChatContext } from '@/hooks/useChatContext';
import { workspaceAPI, type Project } from '@/lib/workspace-api';
import { workspaceFileAPI } from '@/lib/workspace-file-api';
import { useToast } from '@/hooks/use-toast';
import { templateAPI, type ArchitectureTemplate } from '@/lib/template-api';
import IconRenderer from './IconRenderer';
import { useAuth } from '@/contexts/AuthContext';

interface HomeViewV2Props {
  currentUser: string;
  currentProjectRoot: string | null;
  currentProjectName?: string | null;
  projectId?: string;
  onViewChange: (viewMode: ViewMode) => void;
  onProjectSelected: (projectPath: string | null, projectName?: string | null) => Promise<void>;
  onActivateHomeView: () => void;
  onActivateConceptView?: () => void;
  onActivateArchitectView: () => void;
  onSaveCurrentProjectContext?: () => Promise<void>;
}

export function HomeViewV2({
  currentUser,
  currentProjectRoot,
  currentProjectName,
  projectId,
  onViewChange,
  onProjectSelected,
  onActivateHomeView,
  onActivateConceptView,
  onActivateArchitectView,
  onSaveCurrentProjectContext,
}: HomeViewV2Props) {
  // Get authenticated user from context for userId (UUID) and display name
  const { user } = useAuth();

  const [isOpenDialogOpen, setIsOpenDialogOpen] = React.useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false);
  const [quickMessage, setQuickMessage] = React.useState("");
  const [isCreatingProject, setIsCreatingProject] = React.useState(false);
  const [creationProgress, setCreationProgress] = React.useState<string | null>(null);
  const { initializeSession, sendMessage, isLoading } = useConceptChat();
  const { toast } = useToast();
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [hasMoreProjects, setHasMoreProjects] = React.useState(false);

  // Rename dialog state
  const [isRenameDialogOpen, setIsRenameDialogOpen] = React.useState(false);
  const [projectToRename, setProjectToRename] = React.useState<Project | null>(null);
  const [newProjectName, setNewProjectName] = React.useState("");

  // Delete confirmation state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [projectToDelete, setProjectToDelete] = React.useState<Project | null>(null);

  // Share dialog state
  const [isShareDialogOpen, setIsShareDialogOpen] = React.useState(false);
  const [projectToShare, setProjectToShare] = React.useState<Project | null>(null);

  // Open With menu state
  const [openWithProjectId, setOpenWithProjectId] = React.useState<string | null>(null);
  const [projectDataAvailability, setProjectDataAvailability] = React.useState<Record<string, {
    hasConcept: boolean;
    hasArchitecture: boolean;
    hasDRC: boolean;
    hasAnalytics: boolean;
    hasBOM: boolean;
  }>>({});

  // Project list tab state
  const [activeProjectTab, setActiveProjectTab] = React.useState<'my' | 'shared'>('my');
  const [sharedProjects, setSharedProjects] = React.useState<Project[]>([]);

  // Workflow guide overlay state
  const [isWorkflowGuideOpen, setIsWorkflowGuideOpen] = React.useState(false);

  // Templates state
  const [templates, setTemplates] = React.useState<ArchitectureTemplate[]>([]);
  const [randomTemplates, setRandomTemplates] = React.useState<ArchitectureTemplate[]>([]);

  // Load templates
  React.useEffect(() => {
    const loadTemplates = async () => {
      try {
        const data = await templateAPI.listTemplates();
        setTemplates(data);
        const shuffled = [...data].sort(() => Math.random() - 0.5);
        setRandomTemplates(shuffled.slice(0, 3));
      } catch (error) {
        console.error('Failed to load templates:', error);
      }
    };
    loadTemplates();
  }, []);

  // Don't auto-show workflow guide anymore
  // Users can click the help button to view it

  // Generate project name from message content
  // Generate project name using AI (fast, cost-effective with Claude Haiku)
  const generateProjectName = async (message: string): Promise<string> => {
    try {
      console.log('[HomeViewV2] Generating project name with AI...');
      const projectName = await workspaceAPI.generateProjectName(message);
      console.log(`[HomeViewV2] AI generated project name: ${projectName}`);
      return projectName;
    } catch (error) {
      console.error('[HomeViewV2] Failed to generate AI project name, using fallback:', error);
      // Fallback to simple generation if AI fails
      const words = message
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(word =>
          word.length > 2 &&
          !['the', 'and', 'for', 'with', 'need', 'want', 'create', 'build', 'make', 'design'].includes(word)
        );
      const keywords = words.slice(0, 3).join('-');
      return keywords || 'soc-project';
    }
  };

  // Format access time
  const formatAccessTime = (date: Date): string => {
    const now = new Date();
    const accessDate = new Date(date);
    const diff = now.getTime() - accessDate.getTime();
    const totalMinutes = Math.floor(diff / (1000 * 60));

    // < 10 min: "Accessed just now"
    if (totalMinutes < 10) {
      return 'Accessed just now';
    }

    // >= 10 min and < 1 day: "Accessed X hours Y min ago"
    if (totalMinutes < 24 * 60) {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;

      if (hours === 0) {
        return `Accessed ${minutes} min ago`;
      } else if (minutes === 0) {
        return `Accessed ${hours} hour${hours > 1 ? 's' : ''} ago`;
      } else {
        return `Accessed ${hours} hour${hours > 1 ? 's' : ''} ${minutes} min ago`;
      }
    }

    // >= 1 day: "Accessed on YYYY-MM-DD"
    const year = accessDate.getFullYear();
    const month = String(accessDate.getMonth() + 1).padStart(2, '0');
    const day = String(accessDate.getDate()).padStart(2, '0');
    return `Accessed on ${year}-${month}-${day}`;
  };

  // Format short project ID
  const formatShortProjectId = (projectId: string): string => {
    if (projectId.length <= 10) return projectId;
    const last10 = projectId.slice(-10);
    return `soc-pilot-${last10}`;
  };

  // Check data availability for a project
  const checkProjectDataAvailability = React.useCallback(async (projectId: string) => {
    try {
      const availability = {
        hasConcept: false,
        hasArchitecture: false,
        hasDRC: false,
        hasAnalytics: false,
        hasBOM: false,
      };

      // Check for chat session (Concept view)
      try {
        const chatFiles = await workspaceFileAPI.listFiles(projectId, '0-chat');
        availability.hasConcept = chatFiles.length > 0;
      } catch (e) {
        // File not found or error, data not available
      }

      // Check for architecture diagram
      try {
        const archContent = await workspaceFileAPI.readFile(projectId, 'arch_diagram.json');
        availability.hasArchitecture = !!archContent;
      } catch (e) {
        // File not found or error, data not available
      }

      // Check for DRC results
      try {
        const drcContent = await workspaceFileAPI.readFile(projectId, 'drc_results.json');
        availability.hasDRC = !!drcContent;
      } catch (e) {
        // File not found or error, data not available
      }

      // Check for analytics data
      try {
        const analyticsContent = await workspaceFileAPI.readFile(projectId, 'analytics.json');
        availability.hasAnalytics = !!analyticsContent;
      } catch (e) {
        // File not found or error, data not available
      }

      // Check for BOM report
      try {
        const bomContent = await workspaceFileAPI.readFile(projectId, 'bom.json');
        availability.hasBOM = !!bomContent;
      } catch (e) {
        // File not found or error, data not available
      }

      return availability;
    } catch (error) {
      console.error('Failed to check project data availability:', error);
      return {
        hasConcept: false,
        hasArchitecture: false,
        hasDRC: false,
        hasAnalytics: false,
        hasBOM: false,
      };
    }
  }, []);

  // Fetch real project data
  const fetchProjects = React.useCallback(async () => {
    try {
      const allProjects = await workspaceAPI.listProjects();

      // Sort by lastModified (newest first)
      const sortedProjects = allProjects.sort((a, b) =>
        new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
      );

      // Get first 4 projects
      const displayProjects = sortedProjects.slice(0, 4);
      setProjects(displayProjects);

      // Check if there are more than 4 projects
      setHasMoreProjects(sortedProjects.length > 4);

      // Check data availability for each project (in parallel)
      const availabilityChecks = displayProjects.map(async (project) => {
        const availability = await checkProjectDataAvailability(project.id);
        return { projectId: project.id, availability };
      });

      const availabilityResults = await Promise.all(availabilityChecks);
      const availabilityMap: Record<string, any> = {};
      availabilityResults.forEach(({ projectId, availability }) => {
        availabilityMap[projectId] = availability;
      });
      setProjectDataAvailability(availabilityMap);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      toast({
        title: "Error",
        description: "Failed to load project list",
        variant: "destructive",
      });
    }
  }, [toast, checkProjectDataAvailability]);

  // Fetch shared projects
  const fetchSharedProjects = React.useCallback(async () => {
    try {
      const shared = await workspaceAPI.getSharedProjects();
      setSharedProjects(shared);
    } catch (error) {
      console.error('Failed to fetch shared projects:', error);
      // Don't show error toast for shared projects as they might not have any
    }
  }, []);

  React.useEffect(() => {
    fetchProjects();
    fetchSharedProjects();
  }, [fetchProjects, fetchSharedProjects]);

  const handleOpenProjectFromDialog = (projectPath: string) => {
    // Open with architect view by default from dialog
    handleOpenProjectWithView(projectPath, 'architect');
  };

  const handleProjectClick = (projectId: string) => {
    // Show "Open With" menu
    setOpenWithProjectId(projectId);
  };

  const handleOpenProjectWithView = async (projectId: string, viewMode: ViewMode) => {
    // Find project name
    const project = projects.find(p => p.id === projectId);
    const projectName = project?.name || null;

    // Close the menu first
    setOpenWithProjectId(null);

    // Load project with name and wait for it to complete
    await onProjectSelected(projectId, projectName);

    // Switch to the selected view after project is fully loaded
    switch (viewMode) {
      case 'concept':
        onActivateConceptView?.();
        break;
      case 'architect':
        onActivateArchitectView();
        break;
      case 'drc':
      case 'analytics':
      case 'bom':
        onViewChange(viewMode);
        break;
      default:
        onActivateArchitectView();
    }
  };

  const handleQuickMessageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickMessage.trim() || isLoading || isCreatingProject) return;

    try {
      setIsCreatingProject(true);

      // Step 1: Save current project context to S3 if there's an open project
      if (currentProjectRoot && projectId && onSaveCurrentProjectContext) {
        setCreationProgress("Saving current project...");
        toast({
          title: "Saving current project...",
          description: "Persisting project context to storage",
        });

        try {
          await onSaveCurrentProjectContext();
        } catch (error) {
          console.error('Failed to save current project context:', error);
          toast({
            title: "Warning",
            description: "Failed to save current project, but continuing with new project creation",
            variant: "destructive",
          });
        }
      }

      // Step 2: Generate project name from message using AI
      setCreationProgress("Thinking and naming the project...");
      toast({
        title: "Generating project name...",
        description: "AI is creating a professional project name",
      });

      const projectName = await generateProjectName(quickMessage);

      // Step 3: Create new project
      setCreationProgress(`Creating workspace "${projectName}"...`);
      toast({
        title: "Creating project...",
        description: `Creating project: ${projectName}`,
      });

      const newProject = await workspaceAPI.createProject({
        name: projectName,
        description: quickMessage.slice(0, 200), // First 200 chars as description
        tags: ['ai-generated'],
      });

      // Select the newly created project with its name
      setCreationProgress("Setting up project workspace...");
      console.log('[HomeViewV2] Selecting project:', newProject.id);
      await onProjectSelected(newProject.id, newProject.name);
      console.log('[HomeViewV2] Project selected, currentProjectRoot:', currentProjectRoot);

      // Initialize chat session for the new project
      // Use user.id (UUID) for S3 storage paths, not display name
      setCreationProgress("Initializing AI assistant...");
      await initializeSession(newProject.id, undefined, user?.id);
      console.log('[HomeViewV2] Session initialized with userId:', user?.id);

      // Save the pending message for Concept view to send
      setCreationProgress("Preparing to switch...");
      localStorage.setItem('soc-pilot:pendingMessage', quickMessage);
      localStorage.setItem('soc-pilot:pendingProject', newProject.id);
      console.log('[HomeViewV2] Saved pending message and project, switching to Concept view');

      // Small delay to ensure state updates are processed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Switch to Concept view
      setCreationProgress("Switching to Concept view...");
      if (onActivateConceptView) {
        console.log('[HomeViewV2] Calling onActivateConceptView, currentProjectRoot:', currentProjectRoot);
        onActivateConceptView();
      } else {
        console.error('[HomeViewV2] onActivateConceptView is not defined!');
      }

      // Clear the input
      setQuickMessage("");

      toast({
        title: "Project created!",
        description: `Successfully created project: ${projectName}`,
      });

      // Refresh project list (fire-and-forget)
      fetchProjects();
    } catch (error) {
      console.error('Failed to create project:', error);
      toast({
        title: "Error",
        description: "Failed to create project, please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingProject(false);
      setCreationProgress(null);
    }
  };

  const handleProjectAction = (projectId: string, action: 'rename' | 'duplicate' | 'delete' | 'share') => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    switch (action) {
      case 'rename':
        setProjectToRename(project);
        setNewProjectName(project.name);
        setIsRenameDialogOpen(true);
        break;
      case 'duplicate':
        handleDuplicateProject(project);
        break;
      case 'delete':
        setProjectToDelete(project);
        setIsDeleteDialogOpen(true);
        break;
      case 'share':
        setProjectToShare(project);
        setIsShareDialogOpen(true);
        break;
    }
  };

  const handleRenameProject = async () => {
    if (!projectToRename || !newProjectName.trim()) return;

    try {
      await workspaceAPI.updateProject(projectToRename.id, {
        name: newProjectName.trim(),
      });

      toast({
        title: "Success",
        description: `Project renamed to "${newProjectName.trim()}"`,
      });

      // Refresh project list
      await fetchProjects();
      setIsRenameDialogOpen(false);
      setProjectToRename(null);
      setNewProjectName("");
    } catch (error) {
      console.error('Failed to rename project:', error);
      toast({
        title: "Error",
        description: "Failed to rename project",
        variant: "destructive",
      });
    }
  };

  const handleDuplicateProject = async (project: Project) => {
    try {
      const newName = `${project.name} (Copy)`;
      await workspaceAPI.duplicateProject(project.id, newName);

      toast({
        title: "Success",
        description: `Project duplicated as "${newName}"`,
      });

      // Refresh project list
      await fetchProjects();
    } catch (error) {
      console.error('Failed to duplicate project:', error);
      toast({
        title: "Error",
        description: "Failed to duplicate project",
        variant: "destructive",
      });
    }
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;

    try {
      const isCurrentProject = projectToDelete.id === projectId;

      // IMPORTANT: If deleting the currently open project, close workspace FIRST
      // This prevents "Project not found" errors when useWorkspaceManager tries to fetch the deleted project
      if (isCurrentProject) {
        console.log('Deleting current project, closing workspace first...');
        onActivateHomeView(); // This will clear currentProjectRoot and trigger cleanup

        // Wait a bit for the workspace to close and state to update
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Delete the project from backend
      await workspaceAPI.deleteProject(projectToDelete.id);

      // Clear all chat contexts (concept, architect, code) for this project
      clearProjectChatContext(projectToDelete.id);

      toast({
        title: "Success",
        description: `Project "${projectToDelete.name}" deleted`,
      });

      // Refresh project list
      await fetchProjects();
      setIsDeleteDialogOpen(false);
      setProjectToDelete(null);
    } catch (error) {
      console.error('Failed to delete project:', error);
      toast({
        title: "Error",
        description: "Failed to delete project",
        variant: "destructive",
      });
    }
  };

  const handleTemplateClick = async (templateId: string, templateName: string) => {
    try {
      // Step 1: Save current project context if there's an open project
      if (currentProjectRoot && projectId && onSaveCurrentProjectContext) {
        toast({
          title: "Saving current project...",
          description: "Persisting project context to storage",
        });

        try {
          await onSaveCurrentProjectContext();
        } catch (error) {
          console.error('Failed to save current project context:', error);
          toast({
            title: "Warning",
            description: "Failed to save current project, but continuing with template creation",
            variant: "destructive",
          });
        }
      }

      // Step 2: Fetch template (already has full interface data)
      toast({
        title: "Loading template...",
        description: `Fetching ${templateName} template`,
      });

      const template = await templateAPI.getTemplate(templateId);

      // Step 3: Create new project
      const projectName = `${templateName}-${Date.now().toString().slice(-6)}`;

      toast({
        title: "Creating project...",
        description: `Creating project: ${projectName}`,
      });

      const newProject = await workspaceAPI.createProject({
        name: projectName,
        description: template.description,
        tags: ['template', template.category],
      });

      // Step 4: Write architecture diagram to project (no enrichment needed!)
      toast({
        title: "Setting up architecture...",
        description: "Saving architecture diagram",
      });

      await workspaceFileAPI.writeFile(
        newProject.id,
        'arch_diagram.json',
        JSON.stringify(template.diagram, null, 2)
      );

      // Step 5: Select the newly created project
      await onProjectSelected(newProject.id, newProject.name);

      // Step 6: Navigate to Architect view
      onActivateArchitectView();

      toast({
        title: "Success!",
        description: `Project "${projectName}" created from template`,
      });

      // Refresh project list
      await fetchProjects();
    } catch (error) {
      console.error('Failed to create project from template:', error);
      toast({
        title: "Error",
        description: "Failed to create project from template",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <div className="relative flex h-full bg-background text-foreground overflow-hidden">
        <Sparkles className="absolute inset-0 m-auto h-2/5 w-2/5 text-primary/5 opacity-30 pointer-events-none z-0" />

        {/* Help Icon - Positioned absolutely in top right corner with balloon animation */}
        <style dangerouslySetInnerHTML={{
          __html: `
          @keyframes balloon-bounce {
            0%, 100% {
              transform: scale(1.5);
              animation-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            15% {
              transform: scale(1.75);
              animation-timing-function: ease-out;
            }
            30% {
              transform: scale(1.5);
            }
          }
          .help-button-balloon {
            animation: balloon-bounce 5s infinite;
            transform: scale(1.5);
          }
        `}} />
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 h-10 w-10 z-20 rounded-full hover:bg-primary/10 hover:shadow-lg help-button-balloon transition-all"
          onClick={() => setIsWorkflowGuideOpen(true)}
          title="View development workflow"
        >
          <HelpCircle className="h-6 w-6 text-muted-foreground hover:text-primary transition-colors" />
        </Button>

        {/* 2 Column Layout, each column has 3 rows */}
        <div className="relative z-10 flex flex-row justify-center w-full h-full p-6 gap-6 min-h-0">

          {/* Left Column - 2 Rows */}
          <div className="flex-1 flex flex-col gap-6 min-h-0 min-w-0 max-w-[768px] w-full overflow-hidden">

            {/* Row 1 - Welcome Section */}
            <div className="h-32 flex items-end px-6">
              <div>
                <h1 className="text-5xl font-bold font-headline mb-2 bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent">
                  Hello {user?.name?.split(' ')[0] || 'there'}
                </h1>
                <p className="text-2xl text-muted-foreground">
                  Welcome back
                </p>
              </div>
            </div>

            {/* Row 2 - AI Chat */}
            <div className="flex-1 flex flex-col gap-6 min-h-0 min-w-0 px-6 relative">
              {/* Quick AI Chat Input */}
              <Card className="shadow-md flex-shrink-0">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center">
                    <Sparkles className="h-5 w-5 mr-2 text-primary" />
                    Create New Project with AI
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Describe your concept or requirements to get started
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleQuickMessageSubmit} className="relative">
                    <Textarea
                      placeholder="e.g., I need a motor controller with PID feedback..."
                      value={quickMessage}
                      onChange={(e) => setQuickMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                          e.preventDefault();
                          if (quickMessage.trim() && !isLoading && !isCreatingProject) {
                            handleQuickMessageSubmit(e as any);
                          }
                        }
                      }}
                      disabled={isLoading}
                      className="min-h-[168px] resize-none pr-14"
                      rows={7}
                    />
                    {/* Progress indicator - bottom left */}
                    <div className="absolute bottom-2 left-0 right-0 flex items-center justify-between px-2 pointer-events-none">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {creationProgress && (
                          <div className="flex items-center gap-2 px-2 py-1 bg-background/80 backdrop-blur-sm rounded border border-muted">
                            <Loader2 className="h-3 w-3 animate-spin text-primary flex-shrink-0" />
                            <span className="text-xs text-muted-foreground italic truncate">
                              {creationProgress}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 pointer-events-auto">
                        <span className="text-xs text-muted-foreground mr-1">
                          {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter
                        </span>
                        <Button
                          type="submit"
                          size="icon"
                          disabled={isLoading || isCreatingProject || !quickMessage.trim()}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </form>
                </CardContent>
              </Card>

              {/* Sample Templates Section */}
              {templates.length > 0 && (
                <Card className="shadow-md flex-shrink-0 w-full min-w-0">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center">
                      <Wand2 className="h-5 w-5 mr-2 text-primary" />
                      Start from a Template
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-hidden">
                    <div className="relative overflow-hidden w-full">

                      <div
                        ref={(el) => {
                          if (!el) return;

                          let isScrolling = false;
                          let animationId: number;

                          const autoScroll = () => {
                            if (!isScrolling) {
                              el.scrollLeft += 0.5;
                              if (el.scrollLeft >= el.scrollWidth / 2) {
                                el.scrollLeft = 0;
                              }
                            }
                            animationId = requestAnimationFrame(autoScroll);
                          };

                          animationId = requestAnimationFrame(autoScroll);

                          const handleMouseEnter = () => {
                            isScrolling = true;
                          };

                          const handleMouseLeave = () => {
                            isScrolling = false;
                          };

                          el.addEventListener('mouseenter', handleMouseEnter);
                          el.addEventListener('mouseleave', handleMouseLeave);

                          return () => {
                            cancelAnimationFrame(animationId);
                            el.removeEventListener('mouseenter', handleMouseEnter);
                            el.removeEventListener('mouseleave', handleMouseLeave);
                          };
                        }}
                        className="flex gap-3 overflow-x-auto scrollbar-hide cursor-grab active:cursor-grabbing"
                        style={{
                          scrollbarWidth: 'none',
                          msOverflowStyle: 'none',
                          maskImage: 'linear-gradient(to right, transparent, black 32px, black calc(100% - 32px), transparent)',
                          WebkitMaskImage: 'linear-gradient(to right, transparent, black 32px, black calc(100% - 32px), transparent)'
                        }}
                        onMouseDown={(e) => {
                          const ele = e.currentTarget;
                          const startX = e.pageX - ele.offsetLeft;
                          const scrollLeft = ele.scrollLeft;

                          const handleMouseMove = (e: MouseEvent) => {
                            const x = e.pageX - ele.offsetLeft;
                            const walk = (x - startX) * 2;
                            ele.scrollLeft = scrollLeft - walk;
                          };

                          const handleMouseUp = () => {
                            document.removeEventListener('mousemove', handleMouseMove);
                            document.removeEventListener('mouseup', handleMouseUp);
                          };

                          document.addEventListener('mousemove', handleMouseMove);
                          document.addEventListener('mouseup', handleMouseUp);
                        }}
                      >
                        {/* Duplicate templates for seamless loop */}
                        {[...templates, ...templates].map((template, index) => (
                          <Card
                            key={`${template.id}-${index}`}
                            className="flex-shrink-0 w-[200px] cursor-pointer hover:shadow-lg transition-shadow border select-none"
                            onClick={() => handleTemplateClick(template.id, template.name)}
                          >
                            <CardContent className="pt-4 pb-3">
                              <div className="flex items-start gap-2 mb-2">
                                <IconRenderer
                                  iconName={template.icon}
                                  defaultIcon="Box"
                                  className="h-6 w-6 text-primary flex-shrink-0"
                                />
                                <h4 className="font-semibold text-sm leading-tight">{template.name}</h4>
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {template.description}
                              </p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Right Column - 2 Rows */}
          <div className="flex-1 flex flex-col gap-6 min-h-0 min-w-0 max-w-[768px] w-full px-6 overflow-hidden">

            {/* Row 1 - Empty (aligns with Welcome Section) */}
            <div className="h-32">
              {/* Reserved for future use */}
            </div>

            {/* Row 2 - Recent Projects (aligns with Chat + Workflow) */}
            <Card className="shadow-md flex-shrink-0 overflow-hidden">
              <CardHeader>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setActiveProjectTab('my')}
                    className={cn(
                      "text-lg transition-all",
                      activeProjectTab === 'my'
                        ? "text-foreground font-semibold underline underline-offset-4"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    My Projects
                  </button>
                  <button
                    onClick={() => setActiveProjectTab('shared')}
                    className={cn(
                      "text-lg transition-all",
                      activeProjectTab === 'shared'
                        ? "text-foreground font-semibold underline underline-offset-4"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Shared with Me
                  </button>
                </div>
              </CardHeader>
              <CardContent className="p-0 overflow-hidden">
                <ScrollArea className="max-h-[600px] px-6 pb-6">
                  <div className="space-y-2 min-w-0">
                    {(() => {
                      const displayProjects = activeProjectTab === 'my' ? projects : sharedProjects;

                      if (displayProjects.length === 0) {
                        return (
                          <div className="flex flex-col items-center justify-center py-12 text-center">
                            <Building className="h-16 w-16 text-muted-foreground/30 mb-4" />
                            {activeProjectTab === 'my' ? (
                              <>
                                <p className="text-sm text-muted-foreground mb-1">
                                  You don't have any project in your workspace.
                                </p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  Create one through the AI chat on the left
                                  <span className="text-primary">←</span>
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="text-sm text-muted-foreground mb-1">
                                  No projects shared with you yet.
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  When others share projects with you, they'll appear here.
                                </p>
                              </>
                            )}
                          </div>
                        );
                      }

                      return (
                        <>
                          {displayProjects.map((project) => {
                            const availability = projectDataAvailability[project.id] || {
                              hasConcept: false,
                              hasArchitecture: false,
                              hasDRC: false,
                              hasAnalytics: false,
                              hasBOM: false,
                            };

                            return (
                              <Card
                                key={project.id}
                                className="hover:bg-accent/50 transition-colors group w-full"
                              >
                                <CardContent className="p-3 min-w-0">
                                  <div className="flex items-start gap-2 min-w-0 w-full">
                                    {/* Project Icon */}
                                    <div className="mt-0.5 flex-shrink-0">
                                      <FolderOpen className="h-5 w-5 text-primary" />
                                    </div>

                                    {/* Project Info - can shrink */}
                                    <DropdownMenu
                                      open={openWithProjectId === project.id}
                                      onOpenChange={(open) => setOpenWithProjectId(open ? project.id : null)}
                                    >
                                      <DropdownMenuTrigger asChild>
                                        <div
                                          className="flex-1 min-w-0 overflow-hidden cursor-pointer"
                                          onClick={() => handleProjectClick(project.id)}
                                        >
                                          <h4 className="font-medium text-sm truncate group-hover:text-primary transition-colors w-full">
                                            {project.name}
                                          </h4>
                                          <div className="text-xs text-muted-foreground mt-0.5">
                                            <span className="whitespace-nowrap">
                                              {formatAccessTime(project.lastModified)}
                                            </span>
                                          </div>
                                        </div>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="start" className="w-[270px]">
                                        <DropdownMenuLabel>Open with...</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          onClick={() => handleOpenProjectWithView(project.id, 'concept')}
                                        >
                                          <ConceptIcon className="h-4 w-4 mr-2" />
                                          <span>Concept View</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => handleOpenProjectWithView(project.id, 'architect')}
                                        >
                                          <ArchitectIcon className="h-4 w-4 mr-2" />
                                          <span>Architecture View</span>
                                          {!availability.hasArchitecture && (
                                            <span className="ml-auto text-xs text-muted-foreground">(No data)</span>
                                          )}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => handleOpenProjectWithView(project.id, 'drc')}
                                        >
                                          <DRCIcon className="h-4 w-4 mr-2" />
                                          <span>Validation View</span>
                                          {!availability.hasDRC && (
                                            <span className="ml-auto text-xs text-muted-foreground">(No data)</span>
                                          )}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => handleOpenProjectWithView(project.id, 'analytics')}
                                        >
                                          <AnalyticsIcon className="h-4 w-4 mr-2" />
                                          <span>Analytics View</span>
                                          {!availability.hasAnalytics && (
                                            <span className="ml-auto text-xs text-muted-foreground">(No data)</span>
                                          )}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => handleOpenProjectWithView(project.id, 'bom')}
                                        >
                                          <BOMIcon className="h-4 w-4 mr-2" />
                                          <span>BOM Report</span>
                                          {!availability.hasBOM && (
                                            <span className="ml-auto text-xs text-muted-foreground">(No data)</span>
                                          )}
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>

                                    {/* Project Actions Menu - always visible */}
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 flex-shrink-0"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <MoreVertical className="h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-48">
                                        <DropdownMenuItem onClick={() => handleProjectAction(project.id, 'rename')}>
                                          <Edit2 className="h-4 w-4 mr-2" />
                                          Rename
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleProjectAction(project.id, 'duplicate')}>
                                          <Copy className="h-4 w-4 mr-2" />
                                          Duplicate
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleProjectAction(project.id, 'share')}>
                                          <Share2 className="h-4 w-4 mr-2" />
                                          Share
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          onClick={() => handleProjectAction(project.id, 'delete')}
                                          className="text-destructive focus:text-destructive"
                                        >
                                          <Trash2 className="h-4 w-4 mr-2" />
                                          Delete
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}

                          {/* Show "..." item if there are more than 4 projects (only for "My Projects" tab) */}
                          {activeProjectTab === 'my' && hasMoreProjects && (
                            <Card
                              className="hover:bg-accent/50 transition-colors cursor-pointer"
                              onClick={() => setIsOpenDialogOpen(true)}
                            >
                              <CardContent className="p-3">
                                <div className="flex items-center justify-center">
                                  <p className="text-sm text-muted-foreground">...</p>
                                </div>
                                <p className="text-xs text-center text-muted-foreground mt-1">
                                  View all projects
                                </p>
                              </CardContent>
                            </Card>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <CreateWorkspaceDialog
        isOpen={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onWorkspaceCreated={handleOpenProjectFromDialog}
      />
      <OpenProjectDialog
        isOpen={isOpenDialogOpen}
        onOpenChange={setIsOpenDialogOpen}
        username={currentUser}
        onOpenProject={handleOpenProjectFromDialog}
      />

      {/* Workflow Guide Overlay */}
      <WorkflowGuideOverlay
        isOpen={isWorkflowGuideOpen}
        onOpenChange={setIsWorkflowGuideOpen}
      />

      {/* Rename Project Dialog */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Project</DialogTitle>
            <DialogDescription>
              Enter a new name for "{projectToRename?.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRenameProject();
                  }
                }}
                placeholder="Enter project name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRenameProject} disabled={!newProjectName.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Project Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the project "{projectToDelete?.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProject} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Share Project Dialog */}
      {projectToShare && (
        <ShareProjectDialog
          isOpen={isShareDialogOpen}
          onOpenChange={setIsShareDialogOpen}
          projectId={projectToShare.id}
          projectName={projectToShare.name}
        />
      )}
    </>
  );
}
