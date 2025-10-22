/**
 * API Response Types
 * 
 * This file defines the structure of API responses from the backend.
 * All API responses follow a consistent format for error handling and data delivery.
 */

/**
 * Generic API Response wrapper
 * All API endpoints return data in this format
 */
export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: APIError;
  metadata?: APIMetadata;
}

/**
 * API Error structure
 */
export interface APIError {
  code: string;
  message: string;
  details?: any;
  statusCode?: number;
  timestamp?: string;
}

/**
 * API Client Error (for throwing in client code)
 */
export class APIClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public type: APIErrorType,
    public statusCode?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'APIClientError';
  }
}

/**
 * API Error Types
 */
export enum APIErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  CLIENT_ERROR = 'CLIENT_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
  CONFLICT_ERROR = 'CONFLICT_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * API Response metadata
 */
export interface APIMetadata {
  timestamp: string;
  requestId?: string;
  version?: string;
  pagination?: PaginationMetadata;
}

/**
 * Pagination metadata
 */
export interface PaginationMetadata {
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/**
 * API Error Types
 * Common error codes returned by the API
 */
export enum APIErrorCode {
  // Client Errors (4xx)
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  CONFLICT = 'CONFLICT',
  
  // Server Errors (5xx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TIMEOUT = 'TIMEOUT',
  
  // Custom Errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * API Request Options
 */
export interface APIRequestOptions {
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
  params?: Record<string, any>;
}

/**
 * Paginated Request Parameters
 */
export interface PaginatedRequest {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated Response
 */
export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMetadata;
}

/**
 * Health Check Response
 */
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string;
  services?: {
    database?: ServiceStatus;
    ai?: ServiceStatus;
    cache?: ServiceStatus;
  };
}

/**
 * Service Status
 */
export interface ServiceStatus {
  status: 'up' | 'down' | 'degraded';
  latency?: number;
  message?: string;
}

/**
 * File Upload Response
 */
export interface FileUploadResponse {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
  uploadedAt: string;
}

/**
 * Batch Operation Response
 */
export interface BatchOperationResponse<T> {
  successful: T[];
  failed: Array<{
    item: T;
    error: APIError;
  }>;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
}

/**
 * Search Response
 */
export interface SearchResponse<T> {
  results: Array<{
    item: T;
    score: number;
    highlights?: Record<string, string[]>;
  }>;
  totalResults: number;
  query: string;
  took: number; // milliseconds
}

/**
 * Export Response
 */
export interface ExportResponse {
  exportId: string;
  format: 'json' | 'csv' | 'pdf' | 'markdown';
  url?: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
  expiresAt?: string;
}

/**
 * Async Job Response
 */
export interface AsyncJobResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number; // 0-100
  result?: any;
  error?: APIError;
  createdAt: string;
  updatedAt: string;
  estimatedCompletion?: string;
}

/**
 * Type guard to check if response is an error
 */
export function isAPIError(response: any): response is { error: APIError } {
  return response && typeof response === 'object' && 'error' in response;
}

/**
 * Type guard to check if response is successful
 */
export function isAPISuccess<T>(response: APIResponse<T>): response is Required<Pick<APIResponse<T>, 'data'>> & APIResponse<T> {
  return response.success === true && response.data !== undefined;
}
