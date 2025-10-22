
"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getProjectListings } from "@/actions/workspace-actions";
import { workspaceAPI } from "@/lib/workspace-api";
import type { ProjectListing } from "@/types/ide";
import { format } from "date-fns";
import { Loader2, FolderOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface OpenProjectDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
  onOpenProject: (projectPath: string) => void;
}

export function OpenProjectDialog({
  isOpen,
  onOpenChange,
  username,
  onOpenProject,
}: OpenProjectDialogProps) {
  const [projects, setProjects] = React.useState<ProjectListing[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [selectedProjectPath, setSelectedProjectPath] = React.useState<string | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    if (isOpen && username) {
      setIsLoading(true);
      setSelectedProjectPath(null); // Reset selection when dialog opens
      
      // Try to load from backend API first
      workspaceAPI.listProjects()
        .then((projects) => {
          // Convert backend projects to ProjectListing format
          const projectListings: ProjectListing[] = projects.map(p => ({
            name: p.name,
            path: p.id, // Use project ID as path for backend projects
            lastModified: new Date(p.lastModified),
            createdAt: new Date(p.createdAt),
          }));
          setProjects(projectListings);
        })
        .catch((error) => {
          console.error("Failed to fetch projects from backend, falling back to local:", error);
          // Fallback to local filesystem
          return getProjectListings(username)
            .then((data) => {
              setProjects(data);
            })
            .catch((localError) => {
              console.error("Failed to fetch local project listings:", localError);
              toast({
                title: "Error",
                description: "Could not load project list.",
                variant: "destructive",
              });
              setProjects([]);
            });
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen, username, toast]);

  const handleOpenProject = React.useCallback(() => {
    if (selectedProjectPath) {
      onOpenProject(selectedProjectPath);
      onOpenChange(false); // Close dialog
    }
  }, [selectedProjectPath, onOpenProject, onOpenChange]);

  const handleRowDoubleClick = (projectPath: string) => {
    setSelectedProjectPath(projectPath);
    // Use a timeout to ensure state update before calling handleOpenProject
    // which relies on selectedProjectPath
    setTimeout(() => {
        onOpenProject(projectPath);
        onOpenChange(false);
    }, 0);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center">
             <FolderOpen className="mr-2 h-5 w-5 text-primary"/>
            Open Existing Project
          </DialogTitle>
          <DialogDescription>
            Select a project to open from your workspace
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Loading projects...</span>
            </div>
          ) : projects.length === 0 ? (
             <p className="text-sm text-muted-foreground text-center py-4">No projects (sub-folders) found in your workspace.</p>
          ) : (
            <ScrollArea className="h-72">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project Name</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Last Modified</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((project) => (
                    <TableRow
                      key={project.path}
                      onClick={() => setSelectedProjectPath(project.path)}
                      onDoubleClick={() => handleRowDoubleClick(project.path)}
                      className={cn(
                        "cursor-pointer hover:bg-muted/50",
                        selectedProjectPath === project.path && "bg-primary/10 hover:bg-primary/20"
                      )}
                      aria-selected={selectedProjectPath === project.path}
                    >
                      <TableCell className="font-medium">{project.name}</TableCell>
                      <TableCell>{format(project.createdAt, "PPp")}</TableCell>
                      <TableCell>{format(project.lastModified, "PPp")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={handleOpenProject}
            disabled={!selectedProjectPath || isLoading}
          >
            Open Workspace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
