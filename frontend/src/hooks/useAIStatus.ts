import * as React from 'react';

interface AIStatusContextType {
  isAiLoading: boolean;
  setIsAiLoading: (isLoading: boolean) => void;
}

export const AIStatusContext = React.createContext<AIStatusContextType | undefined>(undefined);

export const useAIStatus = () => {
  const context = React.useContext(AIStatusContext);
  if (!context) {
    throw new Error('useAIStatus must be used within an AIStatusProvider');
  }
  return context;
};