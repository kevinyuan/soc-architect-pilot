// Temporary placeholder - will be removed when terminal functionality is properly integrated
// This is just to prevent compilation errors during the refactoring process

import React from 'react';

interface TerminalContextValue {
  // Placeholder
}

export const TerminalContext = React.createContext<any>(null);

interface UseTerminalReturn {
  createTerminal: () => null;
  destroyTerminal: () => void;
  getOrCreateTerminal: () => null;
  sendTerminalCommand: (command: string) => void;
}

export function useTerminal(): UseTerminalReturn {
  return {
    // Placeholder methods
    createTerminal: () => null,
    destroyTerminal: () => {},
    getOrCreateTerminal: () => null,
    sendTerminalCommand: () => {},
  };
}
