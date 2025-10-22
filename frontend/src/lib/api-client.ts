// API Client Base Class
// Provides unified HTTP client with error handling and retry logic

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { APIResponse, APIClientError, APIErrorType } from '@/types/api';

export interface APIClientConfig {
  baseURL: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export class APIClient {
  private axiosInstance: AxiosInstance;
  private config: APIClientConfig;

  constructor(config: APIClientConfig) {
    this.config = {
      timeout: 5000,      // 5 seconds timeout
      retryAttempts: 10,  // Max 10 retries
      retryDelay: 10000,  // 10 seconds between retries
      ...config,
    };

    this.axiosInstance = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
      // IMPORTANT: Don't use withCredentials with wildcard CORS origin
      withCredentials: false,
    });

    // Request interceptor
    this.axiosInstance.interceptors.request.use(
      (config) => {
        // Add request ID for tracking
        config.headers['x-request-id'] = this.generateRequestId();
        
        // Add JWT token from localStorage
        const token = typeof window !== 'undefined' 
          ? localStorage.getItem('auth_token')
          : null;
        
        if (token) {
          config.headers['Authorization'] = `Bearer ${token}`;
        }
        
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => this.handleError(error)
    );
  }

  /**
   * Generic GET request
   */
  async get<T>(url: string, params?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.retry(async () => {
      const response = await this.axiosInstance.get<APIResponse<T>>(url, {
        params,
        ...config,
      });
      return this.extractData(response.data);
    });
  }

  /**
   * Generic POST request
   */
  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.retry(async () => {
      const response = await this.axiosInstance.post<APIResponse<T>>(url, data, config);
      return this.extractData(response.data);
    });
  }

  /**
   * Generic PUT request
   */
  async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.retry(async () => {
      const response = await this.axiosInstance.put<APIResponse<T>>(url, data, config);
      return this.extractData(response.data);
    });
  }

  /**
   * Generic DELETE request
   */
  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.retry(async () => {
      const response = await this.axiosInstance.delete<APIResponse<T>>(url, config);
      return this.extractData(response.data);
    });
  }

  /**
   * Extract data from API response
   */
  private extractData<T>(response: APIResponse<T>): T {
    if (!response.success) {
      throw new APIClientError(
        response.error?.message || 'Request failed',
        response.error?.code || 'SERVER_ERROR',
        APIErrorType.SERVER_ERROR,
        undefined,
        response.error?.details
      );
    }

    // If response has data field, return it (standard format)
    if (response.data !== undefined) {
      return response.data as T;
    }

    // Otherwise, return the response itself without success field (legacy format)
    // This handles backend responses like { success: true, components: [...] }
    const { success, error, metadata, ...data } = response as any;
    return data as T;
  }

  /**
   * Handle axios errors
   */
  private handleError(error: any): never {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      // Network error (no response)
      if (!axiosError.response) {
        throw new APIClientError(
          '无法连接到服务器，请检查网络连接',
          'NETWORK_ERROR',
          APIErrorType.NETWORK_ERROR
        );
      }

      const { status, data } = axiosError.response;
      const errorData = data as any;

      // Extract error message - support both string and object format
      const getErrorMessage = (fallback: string): string => {
        if (!errorData?.error) return fallback;
        // If error is a string, return it directly
        if (typeof errorData.error === 'string') return errorData.error;
        // If error is an object, return the message field
        return errorData.error.message || fallback;
      };

      // Extract error details (only for object format)
      const getErrorDetails = () => {
        if (typeof errorData?.error === 'object') {
          return errorData.error.details;
        }
        return undefined;
      };

      // Map HTTP status codes to error types
      switch (status) {
        case 400:
          throw new APIClientError(
            getErrorMessage('Invalid request parameters'),
            'VALIDATION_ERROR',
            APIErrorType.VALIDATION_ERROR,
            status,
            getErrorDetails()
          );
        case 401:
          throw new APIClientError(
            getErrorMessage('Authentication failed, please login again'),
            'AUTH_ERROR',
            APIErrorType.AUTH_ERROR,
            status
          );
        case 403:
          throw new APIClientError(
            getErrorMessage('Insufficient permissions to access this resource'),
            'AUTHORIZATION_ERROR',
            APIErrorType.AUTHORIZATION_ERROR,
            status
          );
        case 404:
          // For production, use a more user-friendly message
          const notFoundMessage = process.env.NODE_ENV === 'production'
            ? 'Resource not available'
            : getErrorMessage('Requested resource not found');
          throw new APIClientError(
            notFoundMessage,
            'NOT_FOUND_ERROR',
            APIErrorType.NOT_FOUND_ERROR,
            status
          );
        case 408:
          throw new APIClientError(
            getErrorMessage('Request timeout, please try again later'),
            'TIMEOUT_ERROR',
            APIErrorType.TIMEOUT_ERROR,
            status
          );
        case 409:
          throw new APIClientError(
            getErrorMessage('Resource conflict - operation already in progress'),
            errorData?.error?.code || 'CONFLICT_ERROR',
            APIErrorType.CONFLICT_ERROR,
            status,
            getErrorDetails()
          );
        case 500:
        case 502:
        case 503:
        case 504:
          throw new APIClientError(
            getErrorMessage('服务器内部错误，请稍后重试'),
            'SERVER_ERROR',
            APIErrorType.SERVER_ERROR,
            status
          );
        default:
          throw new APIClientError(
            getErrorMessage('未知错误'),
            'SERVER_ERROR',
            APIErrorType.SERVER_ERROR,
            status
          );
      }
    }

    // Non-axios error
    throw new APIClientError(
      error.message || '未知错误',
      'SERVER_ERROR',
      APIErrorType.SERVER_ERROR
    );
  }

  /**
   * Check if error should be retried
   */
  private shouldRetry(error: any): boolean {
    if (error instanceof APIClientError) {
      // Retry on network errors and server errors (5xx)
      return (
        error.type === APIErrorType.NETWORK_ERROR ||
        error.type === APIErrorType.TIMEOUT_ERROR ||
        (error.type === APIErrorType.SERVER_ERROR && 
         error.statusCode !== undefined && 
         error.statusCode >= 500)
      );
    }
    return false;
  }

  /**
   * Retry logic with exponential backoff
   */
  private async retry<T>(
    fn: () => Promise<T>,
    attempts: number = this.config.retryAttempts || 3
  ): Promise<T> {
    let lastError: any;

    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // Don't retry if it's not a retryable error
        if (!this.shouldRetry(error)) {
          throw error;
        }

        // Don't retry on last attempt
        if (i === attempts - 1) {
          throw error;
        }

        // Wait before retrying (fixed delay)
        const delay = this.config.retryDelay!;
        await this.sleep(delay);

        console.log(`Retrying request (attempt ${i + 2}/${attempts}) after ${delay}ms...`);
      }
    }

    throw lastError;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get axios instance for advanced usage
   */
  getAxiosInstance(): AxiosInstance {
    return this.axiosInstance;
  }
}

// Export singleton instance
export const apiClient = new APIClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1',
  timeout: 5000,      // 5 seconds timeout
  retryAttempts: 10,  // Max 10 retries
  retryDelay: 10000,  // 10 seconds between retries (fixed, not exponential)
});
