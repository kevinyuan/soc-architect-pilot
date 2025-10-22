import { useEffect, useRef } from 'react';
import { backupApi } from '@/lib/backup-api';
import { useToast } from './use-toast';

interface UseAutoBackupOptions {
  projectId: string | null;
  enabled?: boolean;
}

export function useAutoBackup({ projectId, enabled = true }: UseAutoBackupOptions) {
  const { toast } = useToast();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastBackupRef = useRef<number>(0);

  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Don't start if disabled or no project
    if (!enabled || !projectId) {
      return;
    }

    // Get backup settings
    const settings = backupApi.getSettings();

    if (!settings.enabled) {
      console.log('[AutoBackup] Disabled in settings');
      return;
    }

    console.log(`[AutoBackup] Starting auto-backup every ${settings.periodMinutes} minutes`);

    // Create backup function
    const createBackup = async () => {
      const now = Date.now();
      const timeSinceLastBackup = now - lastBackupRef.current;
      const minInterval = settings.periodMinutes * 60 * 1000; // Convert to milliseconds

      // Don't backup too frequently
      if (timeSinceLastBackup < minInterval) {
        return;
      }

      try {
        console.log('[AutoBackup] Creating backup...');
        const result = await backupApi.createBackup(projectId);
        lastBackupRef.current = now;

        console.log('[AutoBackup] Backup created:', result.backupFileName);

        // Cleanup old backups
        await backupApi.cleanupBackups(projectId, settings.maxBackups);

        // Optional: Show subtle notification
        // toast({
        //   title: "Backup Created",
        //   description: "Your work has been backed up automatically.",
        //   duration: 2000,
        // });
      } catch (error) {
        console.error('[AutoBackup] Failed to create backup:', error);
        // Don't show error toast to avoid annoying the user
      }
    };

    // Create initial backup after a short delay
    const initialTimeout = setTimeout(() => {
      createBackup();
    }, 30000); // 30 seconds after opening

    // Set up periodic backups
    intervalRef.current = setInterval(() => {
      createBackup();
    }, settings.periodMinutes * 60 * 1000);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      clearTimeout(initialTimeout);
    };
  }, [projectId, enabled, toast]);

  // Manual backup function
  const createManualBackup = async () => {
    if (!projectId) {
      toast({
        title: "No Project",
        description: "Please open a project first.",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await backupApi.createBackup(projectId);
      lastBackupRef.current = Date.now();

      toast({
        title: "Backup Created",
        description: `Backup saved: ${result.backupFileName}`,
      });

      // Cleanup old backups
      const settings = backupApi.getSettings();
      await backupApi.cleanupBackups(projectId, settings.maxBackups);
    } catch (error) {
      console.error('[AutoBackup] Manual backup failed:', error);
      toast({
        title: "Backup Failed",
        description: error instanceof Error ? error.message : "Failed to create backup",
        variant: "destructive",
      });
    }
  };

  return { createManualBackup };
}
