// Backup API Client
import { apiClient } from './api-client';

export interface Backup {
  fileName: string;
  timestamp: string;
  displayName: string;
}

export interface BackupSettings {
  enabled: boolean;
  periodMinutes: number;
  maxBackups: number;
}

export const backupApi = {
  // Create a backup
  async createBackup(projectId: string): Promise<{ backupFileName: string; timestamp: string }> {
    const response = await apiClient.post<{ backupFileName: string; timestamp: string }>('/backup/create', { projectId });
    return response;
  },

  // List all backups
  async listBackups(projectId: string): Promise<Backup[]> {
    const response = await apiClient.get<Backup[]>(`/backup/list/${projectId}`);
    return response;
  },

  // Restore a backup
  async restoreBackup(projectId: string, backupFileName: string): Promise<{ restoredFrom: string }> {
    const response = await apiClient.post<{ restoredFrom: string }>('/backup/restore', { projectId, backupFileName });
    return response;
  },

  // Cleanup old backups
  async cleanupBackups(projectId: string, maxBackups: number): Promise<{ deletedCount: number; remainingCount: number }> {
    const response = await apiClient.post<{ deletedCount: number; remainingCount: number }>('/backup/cleanup', { projectId, maxBackups });
    return response;
  },

  // Get backup settings from localStorage
  getSettings(): BackupSettings {
    const stored = localStorage.getItem('backupSettings');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error('Failed to parse backup settings:', e);
      }
    }
    // Default settings
    return {
      enabled: true,
      periodMinutes: 10,
      maxBackups: 10,
    };
  },

  // Save backup settings to localStorage
  saveSettings(settings: BackupSettings): void {
    localStorage.setItem('backupSettings', JSON.stringify(settings));
  },
};
