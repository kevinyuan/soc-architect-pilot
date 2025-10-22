"use client";

import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  Folder, 
  File, 
  ChevronRight, 
  ChevronLeft, 
  Trash2, 
  Eye, 
  Download,
  RefreshCw,
  Home
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface FileItem {
  name: string;
  type: 'file' | 'folder';
  path: string;
  size?: number;
  lastModified?: string;
}

interface ProjectFileExplorerProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
}

export function ProjectFileExplorer({ open, onClose, projectId, projectName }: ProjectFileExplorerProps) {
  const [items, setItems] = React.useState<FileItem[]>([]);
  const [currentPath, setCurrentPath] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<FileItem | null>(null);
  const [fileContent, setFileContent] = React.useState<string>('');
  const [viewingFile, setViewingFile] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    if (open) {
      loadFiles('');
    }
  }, [open, projectId]);

  const loadFiles = async (path: string) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const params = new URLSearchParams();
      if (path) {
        params.append('path', path);
      }

      const response = await fetch(
        `http://localhost:3000/api/admin/projects/${projectId}/files?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const data = await response.json();
      if (data.success) {
        setItems(data.items);
        setCurrentPath(data.currentPath);
      } else {
        toast({
          title: 'Error',
          description: data.error?.message || 'Failed to load files',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error loading files:', error);
      toast({
        title: 'Error',
        description: 'Failed to load files',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFolderClick = (folder: FileItem) => {
    loadFiles(folder.path);
  };

  const handleBack = () => {
    const pathParts = currentPath.split('/').filter(Boolean);
    pathParts.pop();
    const newPath = pathParts.join('/');
    loadFiles(newPath ? newPath + '/' : '');
  };

  const handleHome = () => {
    loadFiles('');
  };

  const handleViewFile = async (file: FileItem) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(
        `http://localhost:3000/api/admin/projects/${projectId}/files/content?path=${encodeURIComponent(file.path)}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const data = await response.json();
      if (data.success) {
        setFileContent(data.content || '');
        setSelectedFile(file);
        setViewingFile(true);
      } else {
        toast({
          title: 'Error',
          description: data.error?.message || 'Failed to load file',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error loading file:', error);
      toast({
        title: 'Error',
        description: 'Failed to load file',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFile = async (item: FileItem) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${item.type === 'folder' ? 'folder' : 'file'} "${item.name}"?${
        item.type === 'folder' ? ' This will delete all files inside.' : ''
      }`
    );

    if (!confirmed) return;

    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(
        `http://localhost:3000/api/admin/projects/${projectId}/files`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ path: item.path })
        }
      );

      const data = await response.json();
      if (data.success) {
        toast({
          title: 'Success',
          description: `${item.type === 'folder' ? 'Folder' : 'File'} deleted successfully`
        });
        loadFiles(currentPath);
      } else {
        toast({
          title: 'Error',
          description: data.error?.message || 'Failed to delete',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error deleting:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  if (viewingFile && selectedFile) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>View File: {selectedFile.name}</DialogTitle>
            <DialogDescription>
              {selectedFile.path}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setViewingFile(false)}>
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back to Files
              </Button>
            </div>
            <ScrollArea className="h-[500px] w-full border rounded-md">
              <pre className="p-4 text-xs font-mono whitespace-pre-wrap">
                {fileContent}
              </pre>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Project Files: {projectName}</DialogTitle>
          <DialogDescription>
            Browse and manage project workspace files
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Navigation */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleHome}
              disabled={loading || !currentPath}
            >
              <Home className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBack}
              disabled={loading || !currentPath}
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadFiles(currentPath)}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <div className="flex-1 text-sm text-muted-foreground font-mono">
              /{currentPath}
            </div>
          </div>

          {/* File List */}
          <ScrollArea className="h-[400px] border rounded-md">
            <div className="p-4 space-y-2">
              {loading ? (
                <div className="text-center text-muted-foreground py-8">
                  Loading...
                </div>
              ) : items.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No files found
                </div>
              ) : (
                items.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    {item.type === 'folder' ? (
                      <Folder className="h-5 w-5 text-blue-500 flex-shrink-0" />
                    ) : (
                      <File className="h-5 w-5 text-gray-500 flex-shrink-0" />
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.type === 'file' && (
                          <>
                            {formatSize(item.size)} • {formatDate(item.lastModified)}
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {item.type === 'folder' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleFolderClick(item)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewFile(item)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteFile(item)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
