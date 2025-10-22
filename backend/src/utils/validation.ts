// Schema Validation Utilities
// This module provides runtime validation using the defined JSON schemas

import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import {
  ArchitecturalComponentSchema,
  DesignPatternSchema,
  ReactFlowDataSchema,
  ProjectWorkspaceSchema,
  SoCSpecificationSchema,
  ComponentLibrarySchema,
  ValidationResultSchema,
  APIResponseSchema,
  AppConfigSchema
} from '../types/schemas';

// Initialize AJV with format support
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Compile schemas for better performance
export const validators = {
  architecturalComponent: ajv.compile(ArchitecturalComponentSchema),
  designPattern: ajv.compile(DesignPatternSchema),
  reactFlowData: ajv.compile(ReactFlowDataSchema),
  projectWorkspace: ajv.compile(ProjectWorkspaceSchema),
  socSpecification: ajv.compile(SoCSpecificationSchema),
  componentLibrary: ajv.compile(ComponentLibrarySchema),
  validationResult: ajv.compile(ValidationResultSchema),
  apiResponse: ajv.compile(APIResponseSchema),
  appConfig: ajv.compile(AppConfigSchema)
};

// Validation result interface
export interface SchemaValidationResult {
  valid: boolean;
  errors?: string[];
  data?: any;
}

// Generic validation function
export function validateSchema<T>(
  data: unknown,
  validator: ValidateFunction,
  schemaName: string
): SchemaValidationResult {
  const valid = validator(data);
  
  if (valid) {
    return { valid: true, data: data as T };
  }
  
  const errors = validator.errors?.map((error: any) => {
    const path = error.instancePath || 'root';
    return `${path}: ${error.message}`;
  }) || ['Unknown validation error'];
  
  return {
    valid: false,
    errors: [`Schema validation failed for ${schemaName}:`, ...errors]
  };
}

// Specific validation functions
export function validateArchitecturalComponent(data: unknown): SchemaValidationResult {
  return validateSchema(data, validators.architecturalComponent, 'ArchitecturalComponent');
}

export function validateDesignPattern(data: unknown): SchemaValidationResult {
  return validateSchema(data, validators.designPattern, 'DesignPattern');
}

export function validateReactFlowData(data: unknown): SchemaValidationResult {
  return validateSchema(data, validators.reactFlowData, 'ReactFlowData');
}

export function validateProjectWorkspace(data: unknown): SchemaValidationResult {
  return validateSchema(data, validators.projectWorkspace, 'ProjectWorkspace');
}

export function validateSoCSpecification(data: unknown): SchemaValidationResult {
  return validateSchema(data, validators.socSpecification, 'SoCSpecification');
}

export function validateComponentLibrary(data: unknown): SchemaValidationResult {
  return validateSchema(data, validators.componentLibrary, 'ComponentLibrary');
}

export function validateValidationResult(data: unknown): SchemaValidationResult {
  return validateSchema(data, validators.validationResult, 'ValidationResult');
}

export function validateAPIResponse(data: unknown): SchemaValidationResult {
  return validateSchema(data, validators.apiResponse, 'APIResponse');
}

export function validateAppConfig(data: unknown): SchemaValidationResult {
  return validateSchema(data, validators.appConfig, 'AppConfig');
}

// Batch validation for arrays
export function validateComponentArray(components: unknown[]): SchemaValidationResult {
  const results = components.map((component, index) => {
    const result = validateArchitecturalComponent(component);
    if (!result.valid) {
      return {
        index,
        errors: result.errors
      };
    }
    return null;
  }).filter(Boolean);

  if (results.length > 0) {
    const allErrors = results.flatMap(result => 
      result ? [`Component ${result.index}:`, ...(result.errors || [])] : []
    );
    return {
      valid: false,
      errors: ['Component array validation failed:', ...allErrors]
    };
  }

  return { valid: true, data: components };
}

// Utility to get human-readable error messages
export function formatValidationErrors(errors: string[]): string {
  return errors.join('\n  - ');
}

// Type guards using schema validation
export function isArchitecturalComponent(data: unknown): data is import('../types').ArchitecturalComponent {
  return validateArchitecturalComponent(data).valid;
}

export function isDesignPattern(data: unknown): data is import('../types').DesignPattern {
  return validateDesignPattern(data).valid;
}

export function isReactFlowData(data: unknown): data is import('../types').ReactFlowData {
  return validateReactFlowData(data).valid;
}

export function isProjectWorkspace(data: unknown): data is import('../types').ProjectWorkspace {
  return validateProjectWorkspace(data).valid;
}

export function isSoCSpecification(data: unknown): data is import('../types').SoCSpecification {
  return validateSoCSpecification(data).valid;
}

export function isComponentLibrary(data: unknown): data is import('../types').ComponentLibrary {
  return validateComponentLibrary(data).valid;
}