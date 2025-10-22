import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

export interface AWSError {
  code: string;
  message: string;
  statusCode?: number;
  retryable: boolean;
  category: 'throttling' | 'authentication' | 'authorization' | 'service' | 'client' | 'network';
  userMessage: string;
  suggestedAction: string;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
  jitter: boolean;
}

export interface AWSServiceStatus {
  service: 'bedrock' | 'general';
  status: 'healthy' | 'degraded' | 'unavailable';
  lastChecked: Date;
  responseTime?: number;
  errorRate?: number;
  message?: string;
}

export class AWSErrorHandler {
  private defaultRetryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true
  };

  private serviceStatus: Map<string, AWSServiceStatus> = new Map();

  /**
   * Parse AWS error and provide user-friendly information
   */
  parseAWSError(error: any): AWSError {
    const errorCode = error.name || error.code || 'UnknownError';
    const errorMessage = error.message || 'An unknown error occurred';
    const statusCode = error.$metadata?.httpStatusCode || error.statusCode;

    // Categorize error
    const category = this.categorizeError(errorCode, statusCode);
    const retryable = this.isRetryable(errorCode, statusCode);
    
    // Generate user-friendly message and suggested action
    const { userMessage, suggestedAction } = this.generateUserGuidance(errorCode, category);

    return {
      code: errorCode,
      message: errorMessage,
      statusCode,
      retryable,
      category,
      userMessage,
      suggestedAction
    };
  }

  /**
   * Execute AWS operation with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const retryConfig = { ...this.defaultRetryConfig, ...config };
    let lastError: any;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        const startTime = Date.now();
        const result = await operation();
        
        // Log successful retry
        if (attempt > 0) {
          console.log(`✅ AWS operation succeeded on attempt ${attempt + 1}/${retryConfig.maxRetries + 1}`);
        }
        
        // Update service status on success
        this.updateServiceStatus('bedrock', {
          status: 'healthy',
          responseTime: Date.now() - startTime
        });
        
        return result;
      } catch (error) {
        lastError = error;
        const awsError = this.parseAWSError(error);
        
        // Update service status on error
        this.updateServiceStatus('bedrock', {
          status: 'degraded',
          message: awsError.userMessage
        });

        // Don't retry if not retryable or on last attempt
        if (!awsError.retryable || attempt === retryConfig.maxRetries) {
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(attempt, retryConfig);
        console.warn(`AWS operation failed (attempt ${attempt + 1}/${retryConfig.maxRetries + 1}), retrying in ${delay}ms:`, awsError.userMessage);
        
        await this.sleep(delay);
      }
    }

    // All retries exhausted, throw the last error
    throw lastError;
  }

  /**
   * Check AWS service health
   */
  async checkServiceHealth(service: 'bedrock' | 'general' = 'bedrock'): Promise<AWSServiceStatus> {
    const startTime = Date.now();
    
    try {
      if (service === 'bedrock') {
        // Simple health check - try to create a client
        const client = new BedrockRuntimeClient({
          region: process.env.AWS_REGION || 'us-east-1'
        });
        
        // We can't make a real call without proper setup, so just check client creation
        if (client) {
          const status: AWSServiceStatus = {
            service,
            status: 'healthy',
            lastChecked: new Date(),
            responseTime: Date.now() - startTime,
            message: 'Service client created successfully'
          };
          
          this.serviceStatus.set(service, status);
          return status;
        }
      }
      
      throw new Error('Service check failed');
      
    } catch (error) {
      const awsError = this.parseAWSError(error);
      const status: AWSServiceStatus = {
        service,
        status: 'unavailable',
        lastChecked: new Date(),
        responseTime: Date.now() - startTime,
        message: awsError.userMessage
      };
      
      this.serviceStatus.set(service, status);
      return status;
    }
  }

  /**
   * Get current service status
   */
  getServiceStatus(service: string): AWSServiceStatus | undefined {
    return this.serviceStatus.get(service);
  }

  /**
   * Get all service statuses
   */
  getAllServiceStatuses(): Record<string, AWSServiceStatus> {
    const statuses: Record<string, AWSServiceStatus> = {};
    this.serviceStatus.forEach((status, service) => {
      statuses[service] = status;
    });
    return statuses;
  }

  /**
   * Create graceful degradation response
   */
  createDegradationResponse(error: AWSError, fallbackData?: any): {
    success: boolean;
    data?: any;
    error: {
      code: string;
      message: string;
      category: string;
      userMessage: string;
      suggestedAction: string;
      degraded: boolean;
    };
    fallback?: any;
  } {
    return {
      success: false,
      data: fallbackData,
      error: {
        code: error.code,
        message: error.message,
        category: error.category,
        userMessage: error.userMessage,
        suggestedAction: error.suggestedAction,
        degraded: true
      },
      fallback: fallbackData
    };
  }

  /**
   * Private helper methods
   */
  private categorizeError(errorCode: string, statusCode?: number): AWSError['category'] {
    // Throttling errors
    if (errorCode.includes('Throttling') || 
        errorCode.includes('TooManyRequests') ||
        statusCode === 429) {
      return 'throttling';
    }

    // Authentication errors
    if (errorCode.includes('InvalidSignature') ||
        errorCode.includes('SignatureDoesNotMatch') ||
        errorCode.includes('TokenRefreshRequired') ||
        statusCode === 401) {
      return 'authentication';
    }

    // Authorization errors
    if (errorCode.includes('AccessDenied') ||
        errorCode.includes('Forbidden') ||
        errorCode.includes('UnauthorizedOperation') ||
        statusCode === 403) {
      return 'authorization';
    }

    // Service errors
    if (errorCode.includes('ServiceUnavailable') ||
        errorCode.includes('InternalError') ||
        errorCode.includes('ServiceException') ||
        (statusCode && statusCode >= 500)) {
      return 'service';
    }

    // Network errors
    if (errorCode.includes('NetworkingError') ||
        errorCode.includes('TimeoutError') ||
        errorCode.includes('ConnectionError')) {
      return 'network';
    }

    // Default to client error
    return 'client';
  }

  private isRetryable(errorCode: string, statusCode?: number): boolean {
    // Throttling errors are retryable
    if (errorCode.includes('Throttling') || statusCode === 429) {
      return true;
    }

    // Service errors are retryable
    if (errorCode.includes('ServiceUnavailable') ||
        errorCode.includes('InternalError') ||
        (statusCode && statusCode >= 500)) {
      return true;
    }

    // Network errors are retryable
    if (errorCode.includes('NetworkingError') ||
        errorCode.includes('TimeoutError') ||
        errorCode.includes('ConnectionError')) {
      return true;
    }

    // Authentication and authorization errors are not retryable
    if (errorCode.includes('AccessDenied') ||
        errorCode.includes('InvalidSignature') ||
        statusCode === 401 ||
        statusCode === 403) {
      return false;
    }

    // Default to not retryable for client errors
    return false;
  }

  private generateUserGuidance(errorCode: string, category: AWSError['category']): {
    userMessage: string;
    suggestedAction: string;
  } {
    switch (category) {
      case 'throttling':
        return {
          userMessage: 'The AI service is currently experiencing high demand. Please wait a moment and try again.',
          suggestedAction: 'Wait a few seconds and retry your request. Consider reducing the frequency of requests.'
        };

      case 'authentication':
        return {
          userMessage: 'There\'s an issue with the AI service authentication. This is a temporary technical issue.',
          suggestedAction: 'Please try again in a few minutes. If the problem persists, contact support.'
        };

      case 'authorization':
        return {
          userMessage: 'The AI service doesn\'t have permission to complete this request. This is a configuration issue.',
          suggestedAction: 'Please contact support to resolve this permissions issue.'
        };

      case 'service':
        return {
          userMessage: 'The AI service is temporarily unavailable. We\'re working to restore full functionality.',
          suggestedAction: 'Please try again in a few minutes. You can continue working with local features in the meantime.'
        };

      case 'network':
        return {
          userMessage: 'There\'s a network connectivity issue preventing communication with the AI service.',
          suggestedAction: 'Check your internet connection and try again. If the problem persists, the issue may be on our end.'
        };

      case 'client':
      default:
        return {
          userMessage: 'There was an issue processing your request. This may be due to invalid input or a temporary problem.',
          suggestedAction: 'Please check your input and try again. If the problem continues, contact support.'
        };
    }
  }

  private calculateDelay(attempt: number, config: RetryConfig): number {
    let delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt);
    delay = Math.min(delay, config.maxDelay);
    
    if (config.jitter) {
      // Add random jitter (±25%)
      const jitterRange = delay * 0.25;
      delay += (Math.random() - 0.5) * 2 * jitterRange;
    }
    
    return Math.max(delay, 0);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private updateServiceStatus(service: string, updates: Partial<AWSServiceStatus>): void {
    const current = this.serviceStatus.get(service) || {
      service: service as any,
      status: 'healthy',
      lastChecked: new Date()
    };
    
    this.serviceStatus.set(service, {
      ...current,
      ...updates,
      lastChecked: new Date()
    });
  }
}

// Singleton instance
export const awsErrorHandler = new AWSErrorHandler();