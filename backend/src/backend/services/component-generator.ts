/**
 * Component Generator Service
 * 
 * Generates new components from AI specifications and persists to S3+DynamoDB
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import {
  ArchitecturalComponent,
  ComponentCategory,
  InterfaceDefinition
} from '../../types/index';
import {
  s3Client,
  DYNAMODB_COMPONENT_LIBRARY_TABLE,
  S3_BUCKET_NAME,
  S3_COMPONENT_LIBRARY_PREFIX,
  AWS_REGION
} from '../../utils/aws-config';
import { ComponentQualityScorer, QualityScore } from './component-quality-scorer';
import { cacheManager, CACHE_NAMESPACES } from './s3-cache.service';

export interface ComponentGenerationRequest {
  name: string;
  category: ComponentCategory;
  type: string;
  description: string;
  interfaces: InterfaceDefinition[];
  properties?: any;
  addressMapping?: {
    baseAddress?: string;
    addressSpace?: string;
  };
  vendor?: string;
  tags?: string[];
  createdBy?: string; // User ID who requested generation
}

export interface ComponentGenerationResult {
  success: boolean;
  component?: ArchitecturalComponent;
  componentId?: string;
  s3Key?: string;
  error?: string;
  autoApproved?: boolean;
  qualityScore?: number;
  qualityDetails?: QualityScore;
}

export class ComponentGenerator {
  private dynamoClient: DynamoDBDocumentClient;
  private qualityScorer: ComponentQualityScorer;

  constructor() {
    this.dynamoClient = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: AWS_REGION })
    );
    this.qualityScorer = new ComponentQualityScorer();
  }

  /**
   * Generate and persist a new component to S3+DynamoDB
   */
  async generateAndPersist(request: ComponentGenerationRequest): Promise<ComponentGenerationResult> {
    try {
      // Validate request
      const validation = this.validateRequest(request);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
        };
      }

      // Generate component ID
      const componentId = this.generateComponentId(request.name, request.category);

      // Build full component object
      const component = this.buildComponent(componentId, request);

      // Validate component structure
      if (!this.validateComponent(component)) {
        return {
          success: false,
          error: 'Generated component failed validation',
        };
      }

      // Run autonomous quality check
      console.log(`🔍 Running quality check for: ${component.name}`);
      const qualityScore = await this.qualityScorer.calculateQualityScore(component);

      // Determine status based on score
      let tier: string;
      let status: string;
      let visibility: string;

      if (qualityScore.autoApprove) {
        // Auto-approve: Add directly to shared library
        tier = 'community';
        status = 'auto_approved';
        visibility = 'public';
        console.log(`✅ Auto-approved: ${component.name} (score: ${qualityScore.total}/100)`);
      } else {
        // Needs review: Add to audit queue
        tier = 'pending';
        status = 'needs_review';
        visibility = 'admin_only';
        console.log(`⚠️  Needs review: ${component.name} (score: ${qualityScore.total}/100)`);
        console.log(`   Issues: ${qualityScore.issues.join(', ')}`);
      }

      // Add quality metadata to component
      (component as any).tier = tier;
      (component as any).status = status;
      (component as any).visibility = visibility;
      (component as any).qualityScore = qualityScore.total;
      (component as any).qualityIssues = qualityScore.issues;
      (component as any).qualityBreakdown = qualityScore.breakdown;

      // Persist to S3
      const s3Key = await this.persistToS3(component);

      // Persist to DynamoDB
      await this.persistToDynamoDB(component, s3Key);

      // Invalidate caches - force reload on next read
      this.invalidateCaches(componentId);

      return {
        success: true,
        component,
        componentId,
        s3Key,
        autoApproved: qualityScore.autoApprove,
        qualityScore: qualityScore.total,
        qualityDetails: qualityScore,
      };
    } catch (error) {
      console.error('Failed to generate component:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate multiple components in batch
   */
  async generateBatch(requests: ComponentGenerationRequest[]): Promise<ComponentGenerationResult[]> {
    const results: ComponentGenerationResult[] = [];

    for (const request of requests) {
      const result = await this.generateAndPersist(request);
      results.push(result);
    }

    return results;
  }

  /**
   * Validate generation request
   */
  private validateRequest(request: ComponentGenerationRequest): { valid: boolean; error?: string } {
    if (!request.name || request.name.trim() === '') {
      return { valid: false, error: 'Component name is required' };
    }

    if (!request.category) {
      return { valid: false, error: 'Component category is required' };
    }

    if (!request.type || request.type.trim() === '') {
      return { valid: false, error: 'Component type is required' };
    }

    if (!request.interfaces || request.interfaces.length === 0) {
      return { valid: false, error: 'At least one interface is required' };
    }

    // Validate interfaces
    for (const intf of request.interfaces) {
      if (!intf.id || !intf.name || !intf.type || !intf.direction) {
        return { valid: false, error: 'Interface missing required fields (id, name, type, direction)' };
      }

      if (!['master', 'slave', 'in', 'out'].includes(intf.direction)) {
        return { valid: false, error: `Invalid interface direction: ${intf.direction}` };
      }
    }

    return { valid: true };
  }

  /**
   * Generate unique component ID
   */
  private generateComponentId(name: string, category: string): string {
    const sanitizedName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const sanitizedCategory = category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const uniqueId = uuidv4().split('-')[0]; // First 8 chars of UUID
    return `${sanitizedCategory}-${sanitizedName}-${uniqueId}`;
  }

  /**
   * Build complete component object
   */
  private buildComponent(
    componentId: string,
    request: ComponentGenerationRequest
  ): ArchitecturalComponent {
    const now = new Date().toISOString();

    // Determine icon based on category
    const iconMap: Record<ComponentCategory, string> = {
      'CPU': 'Cpu',
      'Memory': 'MemoryStick',
      'Interconnect': 'Network',
      'Accelerator': 'Zap',
      'IO': 'Cable',
      'Custom': 'Box',
    };

    const component: ArchitecturalComponent = {
      id: componentId,
      name: request.name,
      category: request.category,
      type: request.type,
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
      properties: request.properties || {
        performance: {},
        power: {},
        physical: {},
      },
      interfaces: request.interfaces,
      visualization: {
        icon: iconMap[request.category] || 'Box',
        width: 180,
        height: 100,
      },
      addressMapping: request.addressMapping,
      description: request.description,
      estimatedMetrics: {
        clockFrequency: '',
        bandwidth: '',
        powerConsumption: '',
        area: '',
      },
      tags: request.tags || [request.category.toLowerCase(), request.type.toLowerCase(), 'ai-generated'],
      vendor: request.vendor || 'AI Generated',
      partNumber: componentId,
      datasheet: '',
      compatibility: request.interfaces.map(i => i.busType || i.type).filter(Boolean) as string[],
      customizable: true,
      baseTemplate: `${request.category.toLowerCase()}-base`,
    };

    return component;
  }

  /**
   * Validate component structure
   */
  private validateComponent(component: ArchitecturalComponent): boolean {
    // Basic validation
    if (!component.id || !component.name || !component.category) {
      return false;
    }

    if (!component.interfaces || component.interfaces.length === 0) {
      return false;
    }

    // Validate interface counts based on category
    const masterInterfaces = component.interfaces.filter(i => i.direction === 'master').length;
    const slaveInterfaces = component.interfaces.filter(i => i.direction === 'slave').length;

    switch (component.category) {
      case 'CPU':
        // CPUs should have at least 1 master interface
        if (masterInterfaces < 1) {
          console.warn(`CPU component should have at least 1 master interface`);
          return false;
        }
        break;

      case 'Memory':
        // Memory should have at least 1 slave interface
        if (slaveInterfaces < 1) {
          console.warn(`Memory component should have at least 1 slave interface`);
          return false;
        }
        break;

      case 'Interconnect':
        // Interconnects should have both master and slave interfaces
        if (masterInterfaces < 1 || slaveInterfaces < 1) {
          console.warn(`Interconnect should have both master and slave interfaces`);
          return false;
        }
        break;
    }

    return true;
  }

  /**
   * Persist component to S3
   */
  private async persistToS3(component: ArchitecturalComponent): Promise<string> {
    const category = component.category.toLowerCase();
    const fileName = `${component.id}.json`;
    const s3Key = `${S3_COMPONENT_LIBRARY_PREFIX}${category}/${fileName}`;

    const componentJson = JSON.stringify(component, null, 2);

    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: s3Key,
      Body: componentJson,
      ContentType: 'application/json',
      Metadata: {
        componentId: component.id,
        componentName: component.name,
        category: component.category,
        version: component.version || '1.0.0',
        generatedAt: new Date().toISOString(),
        generatedBy: 'AI',
      },
    }));

    console.log(`   → S3: ${s3Key}`);
    return s3Key;
  }

  /**
   * Persist component index to DynamoDB
   */
  private async persistToDynamoDB(component: ArchitecturalComponent, s3Key: string): Promise<void> {
    const comp = component as any;
    
    const indexEntry = {
      componentId: component.id,
      name: component.name,
      category: component.category,
      type: component.type,
      vendor: component.vendor || 'AI Generated',
      version: component.version,
      s3Key: s3Key,
      interfaces: component.interfaces,
      tags: component.tags || [],
      iconName: component.visualization?.icon || 'Box',
      createdAt: component.createdAt,
      updatedAt: component.updatedAt,
      description: component.description,
      
      // Quality & governance fields
      tier: comp.tier || 'pending',
      status: comp.status || 'needs_review',
      visibility: comp.visibility || 'admin_only',
      qualityScore: comp.qualityScore || 0,
      qualityIssues: comp.qualityIssues || [],
      qualityBreakdown: comp.qualityBreakdown || {},
      
      // Usage metrics
      usageCount: 0,
      rating: 0,
      ratingCount: 0,
      
      // Legacy field
      isShared: comp.visibility === 'public',
    };

    await this.dynamoClient.send(new PutCommand({
      TableName: DYNAMODB_COMPONENT_LIBRARY_TABLE,
      Item: indexEntry,
    }));

    console.log(`   → DynamoDB: ${component.id} (${comp.tier}/${comp.status})`);
  }

  /**
   * Check if a similar component already exists
   */
  async findSimilarComponent(request: ComponentGenerationRequest): Promise<ArchitecturalComponent | null> {
    // This would query DynamoDB for similar components
    // For now, return null (always generate new)
    return null;
  }

  /**
   * Invalidate caches after component write
   */
  private invalidateCaches(componentId: string): void {
    // Clear component data cache for this specific component
    const componentCache = cacheManager.getCache(CACHE_NAMESPACES.COMPONENT_DATA);
    componentCache.delete(componentId);

    // Clear entire index cache to reflect the new component
    const indexCache = cacheManager.getCache(CACHE_NAMESPACES.COMPONENT_INDEX);
    indexCache.clear();

    console.log(`[ComponentGenerator] Invalidated caches for new component: ${componentId}`);
  }
}
