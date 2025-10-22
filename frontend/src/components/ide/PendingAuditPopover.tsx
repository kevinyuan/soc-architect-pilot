"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import IconRenderer from './IconRenderer';
import { componentAPI } from '@/lib/component-api';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';

interface PendingAuditPopoverProps {
  projectId?: string;
  disabled?: boolean;
  onAuditComplete?: () => void; // Callback to refresh component library
}

export function PendingAuditPopover({
  projectId,
  disabled = false,
  onAuditComplete,
}: PendingAuditPopoverProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pendingComponents, setPendingComponents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [componentToReject, setComponentToReject] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Load pending components
  const loadPendingComponents = useCallback(async () => {
    if (!projectId || !open) return;

    setIsLoading(true);
    try {
      const response = await componentAPI.getPendingAudit();
      setPendingComponents(response.components);
    } catch (error) {
      console.error('Failed to load pending components:', error);
      toast({
        title: "Error",
        description: "Failed to load pending components",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [projectId, open, toast]);

  // Load when popover opens
  useEffect(() => {
    if (open) {
      loadPendingComponents();
    }
  }, [open, loadPendingComponents]);

  // Handle approve
  const handleApprove = async (componentId: string) => {
    try {
      await componentAPI.approveComponent(componentId);
      toast({
        title: "Component Approved",
        description: "Component has been added to the shared library",
      });
      loadPendingComponents();
      onAuditComplete?.();
    } catch (error) {
      console.error('Failed to approve component:', error);
      toast({
        title: "Error",
        description: "Failed to approve component",
        variant: "destructive"
      });
    }
  };

  // Handle reject click
  const handleRejectClick = (component: any) => {
    setComponentToReject(component);
    setRejectionReason('');
    setRejectDialogOpen(true);
  };

  // Confirm rejection
  const confirmReject = async () => {
    if (!componentToReject || !rejectionReason.trim()) {
      toast({
        title: "Error",
        description: "Please provide a reason for rejection",
        variant: "destructive"
      });
      return;
    }

    try {
      await componentAPI.rejectComponent(componentToReject.id, rejectionReason);
      toast({
        title: "Component Rejected",
        description: "Component has been removed from the system",
      });
      loadPendingComponents();
      onAuditComplete?.();
      setRejectDialogOpen(false);
      setComponentToReject(null);
      setRejectionReason('');
    } catch (error) {
      console.error('Failed to reject component:', error);
      toast({
        title: "Error",
        description: "Failed to reject component",
        variant: "destructive"
      });
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="default"
            size="icon"
            disabled={disabled}
            className="h-10 w-10 rounded-full shadow-lg bg-yellow-500 hover:bg-yellow-600 relative"
            title="Pending Audit (Admin Only)"
          >
            <AlertTriangle className="h-5 w-5" />
            {pendingComponents.length > 0 && open === false && (
              <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-semibold">
                {pendingComponents.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[500px] p-0"
          align="start"
          side="bottom"
          sideOffset={10}
        >
          <div className="flex flex-col max-h-[calc(100vh-120px)]">
            {/* Header */}
            <div className="p-3 border-b bg-yellow-500/10">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <h3 className="text-sm font-semibold">Pending Component Audit</h3>
              </div>
            </div>

            {/* Component List - Scrollable */}
            <ScrollArea className="flex-1 overflow-y-auto">
              <div className="p-3">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
                    <span className="text-sm text-muted-foreground">Loading pending components...</span>
                  </div>
                ) : pendingComponents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No components pending review
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingComponents.map((component) => (
                      <div
                        key={component.id}
                        className="p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 space-y-2"
                      >
                        {/* Component Info */}
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <IconRenderer
                                iconName={component.iconName || 'Box'}
                                className="h-4 w-4 text-primary shrink-0"
                              />
                              <p className="text-sm font-medium truncate">{component.name}</p>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {component.category} • {component.type}
                            </p>
                          </div>
                          <Badge
                            className={cn(
                              "text-xs font-semibold ml-2",
                              component.qualityScore >= 80
                                ? "bg-green-500/20 text-green-600 dark:text-green-400"
                                : component.qualityScore >= 60
                                ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"
                                : "bg-red-500/20 text-red-600 dark:text-red-400"
                            )}
                          >
                            {component.qualityScore || 0}/100
                          </Badge>
                        </div>

                        {/* Quality Issues */}
                        {component.qualityIssues && component.qualityIssues.length > 0 && (
                          <div className="text-xs text-muted-foreground space-y-1">
                            <p className="font-medium">Issues:</p>
                            <ul className="list-disc list-inside space-y-0.5">
                              {component.qualityIssues.slice(0, 3).map((issue: string, idx: number) => (
                                <li key={idx} className="truncate">{issue}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-2">
                          <Button
                            size="sm"
                            variant="default"
                            className="flex-1 h-7 text-xs bg-green-600 hover:bg-green-700"
                            onClick={() => handleApprove(component.id)}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="flex-1 h-7 text-xs"
                            onClick={() => handleRejectClick(component)}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="px-3 py-2 border-t bg-muted/30 flex-shrink-0">
              <p className="text-xs text-muted-foreground text-center">
                {pendingComponents.length} component{pendingComponents.length !== 1 ? 's' : ''} pending review
              </p>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Reject Dialog */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Component</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reject "{componentToReject?.name}"? This will remove it from the system library.
              The user's copy will remain unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium mb-2 block">
              Reason for rejection (required):
            </label>
            <Textarea
              placeholder="e.g., Duplicate component, incomplete interfaces, quality issues..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!rejectionReason.trim()}
            >
              Reject Component
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
