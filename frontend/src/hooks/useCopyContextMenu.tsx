import { useState, useCallback, useEffect } from 'react';
import { useToast } from './use-toast';

interface ContextMenuPosition {
  x: number;
  y: number;
}

export function useCopyContextMenu() {
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null);
  const { toast } = useToast();

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY });
    }
  }, []);

  const handleCopy = useCallback(() => {
    const selection = window.getSelection();
    if (selection) {
      const text = selection.toString();
      navigator.clipboard.writeText(text).then(() => {
        toast({
          title: "Copied to clipboard",
          description: `${text.length} characters copied`,
        });
      }).catch(() => {
        toast({
          title: "Copy failed",
          description: "Failed to copy to clipboard",
          variant: "destructive",
        });
      });
    }
    setContextMenu(null);
  }, [toast]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Close context menu on click outside
  useEffect(() => {
    if (contextMenu) {
      const handleClick = () => closeContextMenu();
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu, closeContextMenu]);

  // Context menu component
  const ContextMenu = contextMenu ? (
    <div
      className="fixed bg-popover border border-border rounded-md shadow-lg py-1 z-50 min-w-[120px]"
      style={{
        left: contextMenu.x,
        top: contextMenu.y
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
        onClick={handleCopy}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        Copy
      </button>
    </div>
  ) : null;

  return {
    handleContextMenu,
    ContextMenu,
  };
}
