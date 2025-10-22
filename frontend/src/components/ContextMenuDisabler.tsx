'use client';

import { useEffect } from 'react';

export function ContextMenuDisabler() {
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Allow context menu on elements with data-allow-context-menu attribute
      // Check if the element or any parent has the attribute
      const allowedElement = target.closest('[data-allow-context-menu="true"]');
      
      if (allowedElement) {
        // Don't prevent - let the custom handler work
        return;
      }
      
      // Prevent default browser context menu for all other elements
      e.preventDefault();
    };

    // Use bubble phase (default) so element handlers run first
    document.addEventListener('contextmenu', handleContextMenu, false);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, false);
    };
  }, []);

  return null;
}
