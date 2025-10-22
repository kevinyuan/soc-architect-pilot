
"use client";

import * as React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from "@/hooks/use-toast";
import type { AppSettings } from '@/types/ide';
import { Palette, Terminal, Cpu, Settings2 as SettingsIconMain, AlertTriangle, Zap, Save, HardDrive, Clock, History, User, Lock, CheckCircle2 } from 'lucide-react';
import { authAPI } from '@/lib/auth-api';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { backupApi, type BackupSettings } from '@/lib/backup-api';
import { BackupManagerDialog } from './BackupManagerDialog';
import { useCopyContextMenu } from '@/hooks/useCopyContextMenu'; 

interface SettingsViewProps {
  currentSettings: AppSettings | null; // Can be null if no project is open
  onSettingsChange: (newSettings: AppSettings) => void;
  isProjectOpen: boolean; // Explicit prop to know if a project is active
  projectId?: string | null; // Project ID for backup operations
}

// Account Settings Accordion Component
function AccountSettingsAccordion() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState(false);

  const handleChangePassword = async () => {
    setError('');
    setSuccess(false);

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All fields are required');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (!user?.email) {
      setError('User email not found');
      return;
    }

    setLoading(true);

    try {
      await authAPI.changePassword({
        email: user.email,
        currentPassword,
        newPassword
      });

      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      toast({
        title: "Password Changed",
        description: "Your password has been updated successfully."
      });
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AccordionItem value="account">
      <AccordionTrigger className="text-lg font-semibold hover:no-underline px-4 py-3 bg-card rounded-t-lg border data-[state=open]:rounded-b-none data-[state=open]:border-b-0">
        <div className="flex items-center"><User className="mr-2 h-5 w-5 text-primary" /> Account Settings</div>
      </AccordionTrigger>
      <AccordionContent className="p-4 border border-t-0 rounded-b-lg bg-card">
        <div className="space-y-6">
          {/* User Info */}
          <div className="rounded-lg border p-4 bg-muted/50">
            <h3 className="text-sm font-semibold mb-3 flex items-center">
              <User className="mr-2 h-4 w-4" />
              User Information
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email:</span>
                <span className="font-medium">{user?.email || 'Not available'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name:</span>
                <span className="font-medium">{user?.name || 'Not available'}</span>
              </div>
            </div>
          </div>

          {/* Change Password */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold flex items-center">
              <Lock className="mr-2 h-4 w-4" />
              Change Password
            </h3>

            {success && (
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Password changed successfully!
                </AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="current-password" className="text-sm">Current Password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  disabled={loading}
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-password" className="text-sm">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 8 characters)"
                  disabled={loading}
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="text-sm">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  disabled={loading}
                  className="h-10"
                />
              </div>

              <Button
                onClick={handleChangePassword}
                disabled={loading || !currentPassword || !newPassword || !confirmPassword}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Clock className="mr-2 h-4 w-4 animate-spin" />
                    Changing Password...
                  </>
                ) : (
                  <>
                    <Lock className="mr-2 h-4 w-4" />
                    Change Password
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

// Backup Settings Accordion Component
function BackupSettingsAccordion({ projectId }: { projectId?: string | null }) {
  const [backupSettings, setBackupSettings] = React.useState<BackupSettings>(backupApi.getSettings());
  const [hasChanges, setHasChanges] = React.useState(false);
  const [showBackupManager, setShowBackupManager] = React.useState(false);

  const handleChange = (key: keyof BackupSettings, value: any) => {
    setBackupSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    backupApi.saveSettings(backupSettings);
    setHasChanges(false);
    toast({ 
      title: "Backup Settings Saved", 
      description: "Your backup preferences have been updated." 
    });
  };

  const handleRestore = () => {
    setBackupSettings(backupApi.getSettings());
    setHasChanges(false);
  };

  return (
    <>
      <AccordionItem value="backup">
        <AccordionTrigger className="text-lg font-semibold hover:no-underline px-4 py-3 bg-card rounded-t-lg border data-[state=open]:rounded-b-none data-[state=open]:border-b-0">
          <div className="flex items-center"><HardDrive className="mr-2 h-5 w-5 text-primary" /> Backup Settings</div>
        </AccordionTrigger>
        <AccordionContent className="p-4 border border-t-0 rounded-b-lg bg-card">
          <div className="space-y-4">
            {/* Enable Auto-Backup */}
            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <Label htmlFor="backup-enabled" className="text-sm font-medium">Enable Auto-Backup</Label>
                <p className="text-xs text-muted-foreground">Automatically create backups while working</p>
              </div>
              <Switch 
                id="backup-enabled" 
                checked={backupSettings.enabled} 
                onCheckedChange={(value) => handleChange('enabled', value)} 
              />
            </div>

            {/* Backup Period */}
            <div className="space-y-3 rounded-lg border p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 flex-1">
                  <Label htmlFor="backup-period" className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Backup Period (minutes)
                  </Label>
                  <p className="text-xs text-muted-foreground">How often to create automatic backups</p>
                </div>
                <div className="text-sm font-medium text-primary ml-4">
                  {backupSettings.periodMinutes} min
                </div>
              </div>
              <Slider
                id="backup-period"
                min={1}
                max={60}
                step={1}
                value={[backupSettings.periodMinutes]}
                onValueChange={([val]) => handleChange('periodMinutes', val)}
                disabled={!backupSettings.enabled}
                className="w-full"
              />
            </div>

            {/* Max Backups */}
            <div className="space-y-3 rounded-lg border p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 flex-1">
                  <Label htmlFor="max-backups" className="text-sm font-medium flex items-center gap-2">
                    <HardDrive className="h-4 w-4" />
                    Maximum Backups
                  </Label>
                  <p className="text-xs text-muted-foreground">Maximum number of backups to keep</p>
                </div>
                <div className="text-sm font-medium text-primary ml-4">
                  {backupSettings.maxBackups}
                </div>
              </div>
              <Slider
                id="max-backups"
                min={1}
                max={50}
                step={1}
                value={[backupSettings.maxBackups]}
                onValueChange={([val]) => handleChange('maxBackups', val)}
                disabled={!backupSettings.enabled}
                className="w-full"
              />
            </div>

            {/* Backup Manager Button */}
            <div className="pt-2">
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => setShowBackupManager(true)}
                disabled={!projectId}
              >
                <History className="mr-2 h-4 w-4" />
                View & Restore Backups
              </Button>
            </div>

            {/* Save/Reset Buttons */}
            {hasChanges && (
              <div className="flex gap-2 pt-2">
                <Button onClick={handleSave} className="flex-1">
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </Button>
                <Button onClick={handleRestore} variant="outline">
                  Reset
                </Button>
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Backup Manager Dialog */}
      <BackupManagerDialog
        open={showBackupManager}
        onOpenChange={setShowBackupManager}
        projectId={projectId || null}
        onBackupRestored={() => {
          setShowBackupManager(false);
          window.location.reload();
        }}
      />
    </>
  );
}

export function SettingsView({ currentSettings, onSettingsChange, isProjectOpen, projectId }: SettingsViewProps) {
  const [settings, setSettings] = React.useState<AppSettings>(currentSettings || {});
  const [hasChanges, setHasChanges] = React.useState(false);
  const { handleContextMenu, ContextMenu } = useCopyContextMenu();

  React.useEffect(() => {
    setSettings(currentSettings || {}); 
    setHasChanges(false); 
  }, [currentSettings]);


  const handleDirectChange = (key: keyof AppSettings, value: any) => {
    if (!isProjectOpen) return;
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };
  


  const handleSaveChanges = () => {
    if (!isProjectOpen) return;
    onSettingsChange(settings);
    setHasChanges(false);
    toast({ title: "Settings Saved", description: "Your settings have been updated for the current project." });
  };

  const renderSettingInput = (
    label: string,
    id: string,
    value: string | undefined,
    onChange: (val: string) => void,
    placeholder?: string,
    description?: string
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
      <Input
        id={id}
        type="text"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9"
        disabled={!isProjectOpen} // Disable if no project
      />
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );

  const renderMockSwitchSetting = (
    label: string,
    id: string,
    checked: boolean | undefined,
    onCheckedChange: (val: boolean) => void,
    description?: string
  ) => (
     <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch id={id} checked={checked || false} onCheckedChange={onCheckedChange} disabled={!isProjectOpen} />
    </div>
  );

  const renderSliderSetting = (
    label: string,
    id: string,
    value: number | undefined,
    onChange: (val: number) => void,
    min: number,
    max: number,
    step: number,
    defaultValue: number,
    description?: string
  ) => (
    <div className="space-y-3 rounded-lg border p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5 flex-1">
          <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="text-sm font-medium text-primary ml-4">
          {value ?? defaultValue}
        </div>
      </div>
      <Slider
        id={id}
        min={min}
        max={max}
        step={step}
        value={[value ?? defaultValue]}
        onValueChange={([val]) => onChange(val)}
        disabled={!isProjectOpen}
        className="w-full"
      />
    </div>
  );

  if (!isProjectOpen) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center">
        <AlertTriangle className="h-12 w-12 mb-4 text-primary/70" />
        <h2 className="text-xl font-semibold mb-2">No Project Open</h2>
        <p className="text-sm">
          Settings are project-specific. Please open or create a project to view and manage its settings.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full flex-1" onContextMenu={handleContextMenu}>
      <div className="container mx-auto py-6 px-4 md:px-6 max-w-3xl">
        <header className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight flex items-center">
            <SettingsIconMain className="mr-3 h-7 w-7 text-primary"/>
            Application Settings
          </h1>
          <p className="text-muted-foreground">
            Configure various aspects of the SoC Pilot IDE for the current project.
          </p>
        </header>

        <Accordion type="multiple" defaultValue={['global', 'code']} className="w-full space-y-4">
          {/* Global Settings */}
          <AccordionItem value="global">
            <AccordionTrigger className="text-lg font-semibold hover:no-underline px-4 py-3 bg-card rounded-t-lg border data-[state=open]:rounded-b-none data-[state=open]:border-b-0">
              <div className="flex items-center"><Palette className="mr-2 h-5 w-5 text-primary" /> App Global Settings</div>
            </AccordionTrigger>
            <AccordionContent className="p-4 border border-t-0 rounded-b-lg bg-card">
              <div className="space-y-4">
                {renderMockSwitchSetting(
                  "Enable Fancy Animations",
                  "global-fancy-animations",
                  settings.globalEnableFancyAnimations,
                  (value) => handleDirectChange('globalEnableFancyAnimations', value),
                  "Enable GPU-intensive UI animations throughout the app."
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Architect View Settings */}
          <AccordionItem value="architect">
            <AccordionTrigger className="text-lg font-semibold hover:no-underline px-4 py-3 bg-card rounded-t-lg border data-[state=open]:rounded-b-none data-[state=open]:border-b-0">
              <div className="flex items-center"><Cpu className="mr-2 h-5 w-5 text-primary" /> Architect View Settings</div>
            </AccordionTrigger>
            <AccordionContent className="p-4 border border-t-0 rounded-b-lg bg-card">
               <div className="space-y-4">
                {renderMockSwitchSetting(
                  "Show Grid Lines",
                  "architect-show-grid",
                  settings.architectShowGrid,
                  (value) => handleDirectChange('architectShowGrid', value),
                  "Display grid lines on the architecture canvas."
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Code View Settings */}
          <AccordionItem value="code">
            <AccordionTrigger className="text-lg font-semibold hover:no-underline px-4 py-3 bg-card rounded-t-lg border data-[state=open]:rounded-b-none data-[state=open]:border-b-0">
               <div className="flex items-center"><Terminal className="mr-2 h-5 w-5 text-primary" /> Code View Settings</div>
            </AccordionTrigger>
            <AccordionContent className="p-4 border border-t-0 rounded-b-lg bg-card">
              <div className="space-y-4">
                {renderSettingInput(
                  "Terminal WebSocket URL",
                  "code-terminal-wss-url",
                  settings.codeViewTerminalWssUrl,
                  (value) => handleDirectChange('codeViewTerminalWssUrl', value),
                  "WS/WSS URL for the integrated terminal server (e.g., ws://localhost:3001)."
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* EDA Engine Settings */}
          <AccordionItem value="eda-engine">
            <AccordionTrigger className="text-lg font-semibold hover:no-underline px-4 py-3 bg-card rounded-t-lg border data-[state=open]:rounded-b-none data-[state=open]:border-b-0">
               <div className="flex items-center"><Zap className="mr-2 h-5 w-5 text-primary" /> EDA Engine Settings</div>
            </AccordionTrigger>
            <AccordionContent className="p-4 border border-t-0 rounded-b-lg bg-card">
              <div className="space-y-4">
                {renderSliderSetting(
                  "Max DRC Iterations",
                  "max-drc-iterations",
                  settings.maxDrcIterations,
                  (value) => handleDirectChange('maxDrcIterations', value),
                  3,
                  10,
                  1,
                  5,
                  "Maximum number of Design Rule Check (DRC) iterations during architecture generation. More iterations allow the AI to fix more violations but take longer."
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Account Settings */}
          <AccountSettingsAccordion />

          {/* Backup Settings */}
          <BackupSettingsAccordion projectId={projectId} />
        </Accordion>

        {hasChanges && isProjectOpen && (
          <div className="mt-8 flex justify-end sticky bottom-6 pr-2">
            <Button onClick={handleSaveChanges} size="lg" className="shadow-lg">
              <Save className="mr-2 h-4 w-4" /> Save Settings
            </Button>
          </div>
        )}
      </div>
      {ContextMenu}
    </ScrollArea>
  );
}

export default SettingsView;
