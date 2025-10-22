"use client";

import * as React from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, XCircle, AlertCircle, Trash2, ArrowLeftRight, Copy, Move, MapPin, FileText } from 'lucide-react';
import type { ValidationIssue } from '@/lib/diagram-validator';

interface DiagramValidationDialogProps {
  open: boolean;
  issues: ValidationIssue[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function DiagramValidationDialog({
  open,
  issues,
  onConfirm,
  onCancel
}: DiagramValidationDialogProps) {
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  const getIssueIcon = (issue: ValidationIssue) => {
    if (issue.severity === 'error') {
      return <XCircle className="h-4 w-4 text-red-500" />;
    }
    return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  };

  const getAutoFixIcon = (autoFix?: string) => {
    if (autoFix === 'remove' || autoFix === 'remove_duplicate') {
      return <Trash2 className="h-3 w-3" />;
    }
    if (autoFix === 'reverse') {
      return <ArrowLeftRight className="h-3 w-3" />;
    }
    if (autoFix === 'rename') {
      return <Copy className="h-3 w-3" />;
    }
    if (autoFix === 'offset_position') {
      return <Move className="h-3 w-3" />;
    }
    return null;
  };

  const getAutoFixLabel = (autoFix?: string) => {
    if (autoFix === 'remove') {
      return 'Remove';
    }
    if (autoFix === 'remove_duplicate') {
      return 'Remove Duplicates';
    }
    if (autoFix === 'reverse') {
      return 'Reverse';
    }
    if (autoFix === 'rename') {
      return 'Rename';
    }
    if (autoFix === 'offset_position') {
      return 'Offset & Rename';
    }
    return 'None';
  };

  const renderDuplicateNodeDetails = (issue: ValidationIssue) => {
    if (issue.type !== 'duplicate_node_id' || !issue.details.positions || !issue.details.properties) {
      return null;
    }

    const { positions, properties, duplicateStrategy, nodeIndices } = issue.details;
    const count = positions.length;

    return (
      <div className="mt-3 space-y-3 border-t pt-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <FileText className="h-3 w-3" />
          Duplicate Analysis ({count} instances found)
        </div>

        {/* Strategy Explanation */}
        <div className="bg-muted/50 rounded-md p-3 space-y-2">
          <div className="text-xs font-medium">
            {duplicateStrategy === 'different_position' && (
              <>
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1">
                  <MapPin className="h-3 w-3" />
                  Case 1: Different Positions Detected
                </div>
                <p className="text-muted-foreground">
                  These nodes are at different locations and appear to be separate components that were accidentally given the same ID.
                  Each duplicate will be renamed with a unique suffix (e.g., -1, -2).
                </p>
              </>
            )}
            {duplicateStrategy === 'exact_duplicate' && (
              <>
                <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 mb-1">
                  <Copy className="h-3 w-3" />
                  Case 2: Exact Duplicates Detected
                </div>
                <p className="text-muted-foreground">
                  These nodes are at the same position with identical properties. This is likely a save/generation error.
                  All duplicate instances will be removed, keeping only the first one.
                </p>
              </>
            )}
            {duplicateStrategy === 'same_position_different_props' && (
              <>
                <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 mb-1">
                  <Move className="h-3 w-3" />
                  Case 3: Overlapping Components Detected
                </div>
                <p className="text-muted-foreground">
                  These nodes are at the same position but have different properties. This suggests the placement tool overlapped them.
                  Each duplicate will be offset by 50px and renamed with a unique suffix.
                </p>
              </>
            )}
          </div>
        </div>

        {/* Instance Details */}
        <div className="space-y-2">
          {positions.map((pos: any, idx: number) => (
            <div 
              key={idx}
              className={`text-xs p-2 rounded border ${
                idx === 0 
                  ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900' 
                  : 'bg-muted/30 border-border'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">
                  Instance {idx + 1} {idx === 0 && '(Original)'}
                </span>
                {idx > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {duplicateStrategy === 'exact_duplicate' ? 'Will Remove' : 'Will Rename'}
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                <div>
                  <span className="font-medium">Position:</span> ({Math.round(pos.x)}, {Math.round(pos.y)})
                </div>
                <div>
                  <span className="font-medium">Label:</span> {properties[idx]?.label || 'N/A'}
                </div>
                <div>
                  <span className="font-medium">Type:</span> {properties[idx]?.type || 'N/A'}
                </div>
                <div>
                  <span className="font-medium">Interfaces:</span> {properties[idx]?.interfaces || 0}
                </div>
              </div>
              {idx > 0 && duplicateStrategy === 'same_position_different_props' && (
                <div className="mt-1 text-purple-600 dark:text-purple-400">
                  → New position: ({Math.round(pos.x + 50 * idx)}, {Math.round(pos.y + 50 * idx)})
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            Diagram Validation Issues Found
          </DialogTitle>
          <DialogDescription>
            Found {errorCount} error{errorCount !== 1 ? 's' : ''} and {warningCount} warning{warningCount !== 1 ? 's' : ''} in the diagram.
            Auto-fix will clean up invalid connections before running DRC validation.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[500px] pr-4">
          <div className="space-y-3">
            {issues.map((issue, index) => (
              <Card key={index} className={`${
                issue.severity === 'error' ? 'border-red-200 dark:border-red-900' : 'border-yellow-200 dark:border-yellow-900'
              }`}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {getIssueIcon(issue)}
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">{issue.description}</p>
                        {issue.autoFix && (
                          <Badge variant="outline" className="flex items-center gap-1 select-none shrink-0">
                            {getAutoFixIcon(issue.autoFix)}
                            {getAutoFixLabel(issue.autoFix)}
                          </Badge>
                        )}
                      </div>
                      
                      {/* Standard edge issue details */}
                      {issue.type !== 'duplicate_node_id' && (
                        <div className="text-xs text-muted-foreground space-y-1">
                          {issue.details.sourceNodeName && issue.details.targetNodeName && (
                            <div>
                              <span className="font-medium">Connection:</span>{' '}
                              {issue.details.sourceNodeName} → {issue.details.targetNodeName}
                            </div>
                          )}
                          {issue.details.sourceHandle && (
                            <div>
                              <span className="font-medium">Source Interface:</span> {issue.details.sourceHandle}
                            </div>
                          )}
                          {issue.details.targetHandle && (
                            <div>
                              <span className="font-medium">Target Interface:</span> {issue.details.targetHandle}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Duplicate node detailed analysis */}
                      {renderDuplicateNodeDetails(issue)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onCancel} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button onClick={onConfirm} className="w-full sm:w-auto">
            Apply Auto-Fix & Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
