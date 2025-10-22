"use client";

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

export interface ConnectionStatus {
  isConnected: boolean;
  isChecking: boolean;
  error: string | null;
  lastChecked: Date | null;
}

export function useApiConnection() {
  const [status, setStatus] = useState<ConnectionStatus>({
    isConnected: false,
    isChecking: true,
    error: null,
    lastChecked: null,
  });

  const checkConnection = useCallback(async () => {
    setStatus(prev => ({ ...prev, isChecking: true, error: null }));

    try {
      // Try to ping the backend API with a short timeout
      // Using a simple GET request to a health check endpoint
      console.log('[Connection Check] Attempting to connect to:', process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000');
      
      // Create a promise that rejects after 3 seconds
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout after 3 seconds')), 3000);
      });
      
      // Race between the API call and the timeout
      const response = await Promise.race([
        apiClient.get('/health'),
        timeoutPromise
      ]);
      
      console.log('[Connection Check] Success:', response);
      
      setStatus({
        isConnected: true,
        isChecking: false,
        error: null,
        lastChecked: new Date(),
      });
    } catch (error) {
      console.error('[Connection Check] Failed:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Unable to connect to the backend server';

      setStatus({
        isConnected: false,
        isChecking: false,
        error: errorMessage,
        lastChecked: new Date(),
      });
    }
  }, []);

  // Check connection on mount
  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  return {
    ...status,
    checkConnection,
  };
}
