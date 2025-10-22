
"use client";

import { AlertTriangle } from 'lucide-react';

export function ProblemsView() {
  return (
    <div className="h-full w-full p-4 bg-background flex flex-col items-center justify-center text-muted-foreground">
      <AlertTriangle className="h-8 w-8 mb-2 text-yellow-500" />
      <p className="text-sm">No problems detected.</p>
      <p className="text-xs mt-1">This panel will show code issues, errors, and warnings.</p>
    </div>
  );
}
