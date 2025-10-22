"use client";

import * as React from 'react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useApiConnection } from "@/hooks/useApiConnection";
import { cn } from "@/lib/utils";

interface ConnectionStatusProps {
  className?: string;
  showWhenConnected?: boolean;
}

export function ConnectionStatus({ 
  className, 
  showWhenConnected = false 
}: ConnectionStatusProps) {
  const { isConnected, isChecking, error, checkConnection } = useApiConnection();

  // Don't show anything if connected and showWhenConnected is false
  if (isConnected && !showWhenConnected) {
    return null;
  }

  if (isChecking) {
    return (
      <Alert className={cn("border-blue-200 bg-blue-50", className)}>
        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
        <AlertTitle className="text-blue-900">Connecting...</AlertTitle>
        <AlertDescription className="text-blue-700">
          Checking connection to backend server...
        </AlertDescription>
      </Alert>
    );
  }

  if (!isConnected) {
    return (
      <Alert variant="destructive" className={className}>
        <XCircle className="h-4 w-4" />
        <AlertTitle>Connection Error</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>{error || 'Unable to connect to the backend server.'}</p>
          <p className="text-sm">
            Please check that the backend is running and the API URL is configured correctly.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={checkConnection}
            className="mt-2"
          >
            <RefreshCw className="h-3 w-3 mr-2" />
            Retry Connection
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Connected state (only shown if showWhenConnected is true)
  return (
    <Alert className={cn("border-green-200 bg-green-50", className)}>
      <CheckCircle2 className="h-4 w-4 text-green-600" />
      <AlertTitle className="text-green-900">Connected</AlertTitle>
      <AlertDescription className="text-green-700">
        Successfully connected to backend server.
      </AlertDescription>
    </Alert>
  );
}

// Compact version for status bar
export function ConnectionStatusBadge() {
  const { isConnected, isChecking } = useApiConnection();

  if (isChecking) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Connecting...</span>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex items-center gap-1 text-xs",
      isConnected ? "text-green-600" : "text-destructive"
    )}>
      {isConnected ? (
        <>
          <CheckCircle2 className="h-3 w-3" />
          <span>Connected</span>
        </>
      ) : (
        <>
          <XCircle className="h-3 w-3" />
          <span>Disconnected</span>
        </>
      )}
    </div>
  );
}
