'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface InvalidEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  sourceLabel?: string;
  targetLabel?: string;
  reason: string;
}

interface InvalidEdgesDialogProps {
  open: boolean;
  invalidEdges: InvalidEdge[];
  onFixAutomatically: () => void;
  onKeepAsIs: () => void;
  onCancel: () => void;
}

export function InvalidEdgesDialog({
  open,
  invalidEdges,
  onFixAutomatically,
  onKeepAsIs,
  onCancel,
}: InvalidEdgesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Invalid Connections Detected
          </DialogTitle>
          <DialogDescription>
            Found {invalidEdges.length} invalid connection{invalidEdges.length !== 1 ? 's' : ''} in your diagram.
            These connections have incompatible handle types and cannot be rendered.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 my-4">
          {invalidEdges.map((edge, index) => (
            <div
              key={edge.id}
              className="p-3 border border-yellow-500/30 bg-yellow-500/5 rounded-md"
            >
              <div className="flex items-start gap-2">
                <span className="text-xs font-mono text-muted-foreground mt-0.5">
                  #{index + 1}
                </span>
                <div className="flex-1 space-y-1">
                  <div className="font-mono text-sm">
                    <span className="text-blue-500">{edge.sourceLabel || edge.source}</span>
                    <span className="text-muted-foreground">.{edge.sourceHandle}</span>
                    <span className="mx-2">→</span>
                    <span className="text-green-500">{edge.targetLabel || edge.target}</span>
                    <span className="text-muted-foreground">.{edge.targetHandle}</span>
                  </div>
                  <div className="text-xs text-yellow-600 dark:text-yellow-500">
                    ⚠️ {edge.reason}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-muted/50 p-3 rounded-md text-sm space-y-2">
          <p className="font-medium">What would you like to do?</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li><strong>Fix Automatically:</strong> Swap source/target to make connections valid</li>
            <li><strong>Keep As-Is:</strong> Remove invalid connections (they won't render anyway)</li>
            <li><strong>Cancel:</strong> Don't load the diagram</li>
          </ul>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={onKeepAsIs}>
            Remove Invalid Connections
          </Button>
          <Button onClick={onFixAutomatically}>
            Fix Automatically
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
