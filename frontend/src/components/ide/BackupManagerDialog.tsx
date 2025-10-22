'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Clock, Download, Trash2, AlertTriangle } from 'lucide-react';
import { backupApi, type Backup } from '@/lib/backup-api';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface BackupManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  onBackupRestored?: () => void;
}

export function BackupManagerDialog({
  open,
  onOpenChange,
  projectId,
  onBackupRestored,
}: BackupManagerDialogProps) {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const { toast } = useToast();

  // Load backups when dialog opens
  useEffect(() => {
    if (open && projectId) {
      loadBackups();
    }
  }, [open, projectId]);

  const loadBackups = async () => {
    if (!projectId) return;

    setLoading(true);
    try {
      const data = await backupApi.listBackups(projectId);
      setBackups(data);
    } catch (error) {
      console.error('Failed to load backups:', error);
      toast({
        title: "Failed to Load Backups",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (backup: Backup) => {
    if (!projectId) return;

    const confirmed = window.confirm(
      `Are you sure you want to restore this backup?\n\n${backup.displayName}\n\nYour current diagram will be backed up before restoring.`
    );

    if (!confirmed) return;

    setRestoring(backup.fileName);
    try {
      await backupApi.restoreBackup(projectId, backup.fileName);
      
      toast({
        title: "Backup Restored",
        description: "Your diagram has been restored. Reload the canvas to see changes.",
      });

      onOpenChange(false);
      
      // Notify parent to reload
      if (onBackupRestored) {
        onBackupRestored();
      }
    } catch (error) {
      console.error('Failed to restore backup:', error);
      toast({
        title: "Restore Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRestoring(null);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      // Convert timestamp back to Date
      const dateStr = timestamp.replace(/-/g, ':').replace(/T(\d{2}):(\d{2}):(\d{2})/, 'T$1:$2:$3');
      const date = new Date(dateStr);
      return {
        relative: formatDistanceToNow(date, { addSuffix: true }),
        absolute: date.toLocaleString(),
      };
    } catch (e) {
      return {
        relative: 'Unknown',
        absolute: timestamp,
      };
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Backup Manager</DialogTitle>
          <DialogDescription>
            View and restore previous versions of your architecture diagram
          </DialogDescription>
        </DialogHeader>

        {!projectId ? (
          <div className="py-8 text-center text-muted-foreground">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No project is currently open</p>
          </div>
        ) : loading ? (
          <div className="py-8 text-center text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
            <p>Loading backups...</p>
          </div>
        ) : backups.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <Download className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No backups found</p>
            <p className="text-sm mt-2">Backups will be created automatically as you work</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2">
              {backups.map((backup) => {
                const time = formatTimestamp(backup.timestamp);
                return (
                  <div
                    key={backup.fileName}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="font-mono text-sm truncate">
                          {backup.displayName}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 ml-6">
                        {time.relative}
                        <span className="mx-2">•</span>
                        {time.absolute}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRestore(backup)}
                      disabled={restoring !== null}
                      className="ml-4"
                    >
                      {restoring === backup.fileName ? (
                        <>
                          <Clock className="h-4 w-4 mr-2 animate-spin" />
                          Restoring...
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4 mr-2" />
                          Restore
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
