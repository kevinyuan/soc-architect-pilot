// AWS Configuration
// Centralized AWS SDK configuration

import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// AWS Region configuration
export const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// S3 Configuration
export const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'soc-pilot-workspaces';
export const S3_BUCKET_PREFIX = process.env.S3_BUCKET_PREFIX || 'workspaces';

// DynamoDB Configuration
export const DYNAMODB_PROJECTS_TABLE = process.env.DYNAMODB_PROJECTS_TABLE || 'soc-pilot-projects';
export const DYNAMODB_SESSIONS_TABLE = process.env.DYNAMODB_SESSIONS_TABLE || 'soc-pilot-sessions';
export const DYNAMODB_COMPONENT_LIBRARY_TABLE = process.env.DYNAMODB_COMPONENT_LIBRARY_TABLE || 'soc-pilot-component-library';

// S3 Component Library Configuration
export const S3_COMPONENT_LIBRARY_PREFIX = 'shared-library/components/';

// AWS Credentials
const awsCredentials = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
  ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
  : undefined;

// Initialize S3 Client
export const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: awsCredentials,
  // If credentials are not provided, SDK will use default credential provider chain:
  // 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
  // 2. AWS credentials file (~/.aws/credentials)
  // 3. IAM role (when running on EC2/Lambda)
});

// Initialize DynamoDB Client
const dynamoDBClient = new DynamoDBClient({
  region: AWS_REGION,
  credentials: awsCredentials,
});

// Create DynamoDB Document Client for easier operations
export const dynamoDBDocClient = DynamoDBDocumentClient.from(dynamoDBClient, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  },
});

/**
 * Validate and sanitize file path to prevent directory traversal attacks
 * @param relativePath - The relative path to validate
 * @returns Sanitized path
 * @throws Error if path is invalid
 */
export function validateFilePath(relativePath: string): string {
  // Remove leading/trailing slashes
  let sanitized = relativePath.trim().replace(/^\/+|\/+$/g, '');
  
  // Check for directory traversal attempts
  if (sanitized.includes('..') || sanitized.startsWith('/') || sanitized.includes('\\')) {
    throw new Error(`Invalid file path: ${relativePath}`);
  }
  
  // Check for absolute paths
  if (sanitized.match(/^[a-zA-Z]:/)) {
    throw new Error(`Absolute paths are not allowed: ${relativePath}`);
  }
  
  // Normalize multiple slashes
  sanitized = sanitized.replace(/\/+/g, '/');
  
  return sanitized;
}

/**
 * Helper function to generate S3 key for user workspace files
 * Supports both simple filenames and relative paths (e.g., "2-lib/app_components.lib")
 */
export function getS3Key(userId: string, projectId: string, filePathOrName: string): string {
  const sanitizedPath = validateFilePath(filePathOrName);
  return `${S3_BUCKET_PREFIX}/users/${userId}/projects/${projectId}/${sanitizedPath}`;
}

// Helper function to generate S3 key for project directory
export function getProjectS3Prefix(userId: string, projectId: string): string {
  return `${S3_BUCKET_PREFIX}/users/${userId}/projects/${projectId}/`;
}

// Helper function to generate S3 key for user directory
export function getUserS3Prefix(userId: string): string {
  return `${S3_BUCKET_PREFIX}/users/${userId}/`;
}

// Validate AWS configuration
export function validateAWSConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!AWS_REGION) {
    errors.push('AWS_REGION is not configured');
  }

  if (!S3_BUCKET_NAME) {
    errors.push('S3_BUCKET_NAME is not configured');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Log AWS configuration (without sensitive data)
export function logAWSConfig(): void {
  console.log('📦 AWS Configuration:');
  console.log(`   Region: ${AWS_REGION}`);
  console.log(`   S3 Bucket: ${S3_BUCKET_NAME}`);
  console.log(`   S3 Prefix: ${S3_BUCKET_PREFIX}`);
  console.log(`   DynamoDB Projects Table: ${DYNAMODB_PROJECTS_TABLE}`);
  console.log(`   DynamoDB Sessions Table: ${DYNAMODB_SESSIONS_TABLE}`);
}
