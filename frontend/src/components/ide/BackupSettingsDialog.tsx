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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Clock, HardDrive, Info } from 'lucide-react';
import { backupApi, type BackupSettings } from '@/lib/backup-api';

interface BackupSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BackupSettingsDialog({ open, onOpenChange }: BackupSettingsDialogProps) {
  const [settings, setSettings] = useState<BackupSettings>({
    enabled: true,
    periodMinutes: 10,
    maxBackups: 10,
  });

  // Load settings when dialog opens
  useEffect(() => {
    if (open) {
      const loadedSettings = backupApi.getSettings();
      setSettings(loadedSettings);
    }
  }, [open]);

  const handleSave = () => {
    backupApi.saveSettings(settings);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Backup Settings</DialogTitle>
          <DialogDescription>
            Configure automatic backups for your architecture diagrams
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Enable/Disable Backups */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="backup-enabled" className="text-base">
                Enable Auto-Backup
              </Label>
              <p className="text-sm text-muted-foreground">
                Automatically create backups while working
              </p>
            </div>
            <Switch
              id="backup-enabled"
              checked={settings.enabled}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, enabled: checked })
              }
            />
          </div>

          {/* Backup Period */}
          <div className="space-y-2">
            <Label htmlFor="backup-period" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Backup Period (minutes)
            </Label>
            <Input
              id="backup-period"
              type="number"
              min="1"
              max="60"
              value={settings.periodMinutes}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  periodMinutes: Math.max(1, Math.min(60, parseInt(e.target.value) || 10)),
                })
              }
              disabled={!settings.enabled}
            />
            <p className="text-xs text-muted-foreground">
              How often to create automatic backups (1-60 minutes)
            </p>
          </div>

          {/* Max Backups */}
          <div className="space-y-2">
            <Label htmlFor="max-backups" className="flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Maximum Backups
            </Label>
            <Input
              id="max-backups"
              type="number"
              min="1"
              max="50"
              value={settings.maxBackups}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  maxBackups: Math.max(1, Math.min(50, parseInt(e.target.value) || 10)),
                })
              }
              disabled={!settings.enabled}
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of backups to keep (1-50)
            </p>
          </div>

          {/* Info Box */}
          <div className="bg-muted/50 p-3 rounded-md flex gap-2">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p>
                Backups are stored in <code className="bg-muted px-1 py-0.5 rounded">backup/</code> folder
                within your project.
              </p>
              <p>
                Older backups are automatically deleted when the limit is reached.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Settings</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
