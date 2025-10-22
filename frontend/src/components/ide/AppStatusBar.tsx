import { useEffect, useState } from "react";
import type { OpenFile, ViewMode } from "@/types/ide";
import { Eye, Info, AlertTriangle } from "lucide-react";
import { ConnectionStatusBadge } from "@/components/ConnectionStatus";

interface AppStatusBarProps {
  activeFile: OpenFile | null;
  currentUser: string;
  currentProjectRoot: string | null;
  currentProjectName?: string | null;
  currentViewMode: ViewMode;
}

interface StatusMessage {
  message: string;
  type?: 'info' | 'warning' | 'error';
}

export function AppStatusBar({
  activeFile,
  currentUser,
  currentProjectRoot,
  currentProjectName,
  currentViewMode,
}: AppStatusBarProps) {
  const viewName = currentViewMode.charAt(0).toUpperCase() + currentViewMode.slice(1);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);

  useEffect(() => {
    const handleStatusMessage = (event: CustomEvent<StatusMessage | null>) => {
      setStatusMessage(event.detail);
    };

    window.addEventListener('app-status-message' as any, handleStatusMessage);
    return () => {
      window.removeEventListener('app-status-message' as any, handleStatusMessage);
    };
  }, []);

  return (
    <footer className="flex h-8 items-center justify-between border-t bg-card text-xs text-muted-foreground shrink-0 px-3 overflow-x-auto">
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="flex items-center gap-1 whitespace-nowrap flex-shrink-0" title={`Current View: ${viewName}`}>
          <Eye className="h-3.5 w-3.5 flex-shrink-0" />
          {viewName}
        </span>
        {activeFile && (
          <>
            <span className="border-l h-4 mx-1 flex-shrink-0"></span>
            <span className="whitespace-nowrap" title={`Active File: ${activeFile.name} (${activeFile.language})`}>
              {activeFile.name}
            </span>
            <span className="border-l h-4 mx-1 flex-shrink-0"></span>
            <span className="whitespace-nowrap">Ln 1, Col 1</span>
            <span className="whitespace-nowrap">UTF-8</span>
          </>
        )}
        {statusMessage && (
          <>
            <span className="border-l h-4 mx-1 flex-shrink-0"></span>
            <span className={`flex items-center gap-1.5 whitespace-nowrap ${
              statusMessage.type === 'warning' ? 'text-yellow-600 dark:text-yellow-500' :
              statusMessage.type === 'error' ? 'text-red-600 dark:text-red-500' :
              'text-blue-600 dark:text-blue-400'
            }`}>
              {statusMessage.type === 'warning' && <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />}
              {statusMessage.type === 'info' && <Info className="h-3.5 w-3.5 flex-shrink-0" />}
              {statusMessage.message}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-4 flex-shrink-0">
        <ConnectionStatusBadge />
      </div>
    </footer>
  );
}

// Helper function to set status message from anywhere
export function setAppStatusMessage(message: string | null, type: 'info' | 'warning' | 'error' = 'info') {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('app-status-message', { 
      detail: message ? { message, type } : null 
    }));
  }
}
