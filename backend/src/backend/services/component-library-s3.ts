/**
 * Component Library Manager - S3 + DynamoDB Implementation
 * 
 * Replaces file system based component library with cloud storage
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  ArchitecturalComponent,
  ComponentMatch,
  ComponentCategory
} from '../../types/index';
import {
  s3Client,
  DYNAMODB_COMPONENT_LIBRARY_TABLE,
  S3_BUCKET_NAME,
  AWS_REGION
} from '../../utils/aws-config';
import { cacheManager, CACHE_NAMESPACES } from './s3-cache.service';

export class ComponentLibraryS3Manager {
  private dynamoClient: DynamoDBDocumentClient;
  private componentCache = cacheManager.getCache<ArchitecturalComponent>(
    CACHE_NAMESPACES.COMPONENT_DATA,
    10 * 60 * 1000, // 10 minutes TTL for component data
    500 // Max 500 components in cache
  );
  private indexCache = cacheManager.getCache<any[]>(
    CACHE_NAMESPACES.COMPONENT_INDEX,
    5 * 60 * 1000, // 5 minutes TTL for index
    1 // Only one index entry
  );

  constructor() {
    this.dynamoClient = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: AWS_REGION })
    );
    console.log('[ComponentLibrary] Initialized with enhanced S3 caching');
  }

  /**
   * Invalidate all caches - force fresh fetch from S3
   */
  invalidateCache(): void {
    console.log('[ComponentLibrary] Invalidating all caches');
    this.componentCache.clear();
    this.indexCache.clear();
    cacheManager.clearCache(CACHE_NAMESPACES.COMPONENT_DATA);
    cacheManager.clearCache(CACHE_NAMESPACES.COMPONENT_INDEX);
  }

  /**
   * Search components by keywords
   */
  async searchComponents(searchTerms: string[]): Promise<ComponentMatch[]> {
    const index = await this.getIndexCache();

    const matches: ComponentMatch[] = [];
    const searchLower = searchTerms.map(t => t.toLowerCase());

    for (const indexEntry of index) {
      let matchScore = 0;
      const matchReasons: string[] = [];

      // Search in name
      if (searchLower.some(term => indexEntry.name.toLowerCase().includes(term))) {
        matchScore += 0.5;
        matchReasons.push('name match');
      }

      // Search in category
      if (searchLower.some(term => indexEntry.category.toLowerCase().includes(term))) {
        matchScore += 0.3;
        matchReasons.push('category match');
      }

      // Search in tags
      const tags = indexEntry.tags || [];
      if (searchLower.some(term => tags.some((tag: string) => tag.toLowerCase().includes(term)))) {
        matchScore += 0.2;
        matchReasons.push('tag match');
      }

      if (matchScore > 0) {
        // Load full component from S3
        const component = await this.getComponentById(indexEntry.componentId);
        if (component) {
          matches.push({
            component,
            matchScore,
            matchReason: matchReasons.join(', '),
            keywords: searchLower,
            relevantProperties: matchReasons
          });
        }
      }
    }

    return matches.sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * Get component by ID
   */
  async getComponentById(componentId: string): Promise<ArchitecturalComponent | null> {
    // Check cache first
    const cached = this.componentCache.get(componentId);
    if (cached) {
      console.log(`[ComponentLibrary] Cache HIT for component: ${componentId}`);
      return cached;
    }

    console.log(`[ComponentLibrary] Cache MISS for component: ${componentId}`);

    try {
      // Get S3 key from DynamoDB
      const result = await this.dynamoClient.send(new GetCommand({
        TableName: DYNAMODB_COMPONENT_LIBRARY_TABLE,
        Key: { componentId }
      }));

      if (!result.Item) {
        return null;
      }

      // Load full component from S3
      const s3Key = result.Item.s3Key;
      const s3Response = await s3Client.send(new GetObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: s3Key
      }));

      const componentJson = await s3Response.Body?.transformToString();
      if (!componentJson) {
        return null;
      }

      const component = JSON.parse(componentJson) as ArchitecturalComponent;

      // Cache it
      this.componentCache.set(componentId, component);

      return component;
    } catch (error) {
      console.error(`Error loading component ${componentId}:`, error);
      return null;
    }
  }

  /**
   * Get components by category
   */
  async getComponentsByCategory(category: ComponentCategory): Promise<ArchitecturalComponent[]> {
    const index = await this.getIndexCache();

    const categoryComponents = index.filter(
      entry => entry.category === category
    );

    const components: ArchitecturalComponent[] = [];
    for (const entry of categoryComponents) {
      const component = await this.getComponentById(entry.componentId);
      if (component) {
        components.push(component);
      }
    }

    return components;
  }

  /**
   * Get all components (index only, not full data)
   */
  async getAllComponentsIndex(): Promise<any[]> {
    const index = await this.getIndexCache();
    return [...index];
  }

  /**
   * Get index cache (load from DynamoDB if not cached)
   */
  private async getIndexCache(): Promise<any[]> {
    const cacheKey = 'all';

    // Check cache first
    const cached = this.indexCache.get(cacheKey);
    if (cached) {
      console.log(`[ComponentLibrary] Index cache HIT (${cached.length} components)`);
      return cached;
    }

    console.log(`[ComponentLibrary] Index cache MISS, loading from DynamoDB...`);

    try {
      const result = await this.dynamoClient.send(new ScanCommand({
        TableName: DYNAMODB_COMPONENT_LIBRARY_TABLE,
        // Filter for shared-library components (all items in this table are shared)
        FilterExpression: 'begins_with(s3Key, :prefix)',
        ExpressionAttributeValues: {
          ':prefix': 'shared-library/'
        }
      }));

      // Map componentId to id for frontend compatibility
      const index = (result.Items || []).map(item => ({
        ...item,
        id: item.componentId || item.id
      }));

      // Cache it
      this.indexCache.set(cacheKey, index);

      console.log(`[ComponentLibrary] Loaded ${index.length} components from library index`);
      return index;
    } catch (error) {
      console.error('Error loading component index:', error);
      return [];
    }
  }

  /**
   * Update component status in DynamoDB (for admin curation)
   */
  async updateComponentStatus(
    componentId: string,
    updates: {
      status?: 'approved' | 'rejected' | 'needs_review' | 'auto_approved';
      tier?: 'official' | 'community' | 'pending';
      visibility?: 'public' | 'admin_only' | 'hidden';
      reviewedBy?: string;
      reviewedAt?: string;
      rejectionReason?: string;
    }
  ): Promise<void> {
    try {
      const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
      
      // Build update expression
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};

      if (updates.status) {
        updateExpressions.push('#status = :status');
        expressionAttributeNames['#status'] = 'status';
        expressionAttributeValues[':status'] = updates.status;
      }

      if (updates.tier) {
        updateExpressions.push('#tier = :tier');
        expressionAttributeNames['#tier'] = 'tier';
        expressionAttributeValues[':tier'] = updates.tier;
      }

      if (updates.visibility) {
        updateExpressions.push('#visibility = :visibility');
        expressionAttributeNames['#visibility'] = 'visibility';
        expressionAttributeValues[':visibility'] = updates.visibility;
      }

      if (updates.reviewedBy) {
        updateExpressions.push('#reviewedBy = :reviewedBy');
        expressionAttributeNames['#reviewedBy'] = 'reviewedBy';
        expressionAttributeValues[':reviewedBy'] = updates.reviewedBy;
      }

      if (updates.reviewedAt) {
        updateExpressions.push('#reviewedAt = :reviewedAt');
        expressionAttributeNames['#reviewedAt'] = 'reviewedAt';
        expressionAttributeValues[':reviewedAt'] = updates.reviewedAt;
      }

      if (updates.rejectionReason) {
        updateExpressions.push('#rejectionReason = :rejectionReason');
        expressionAttributeNames['#rejectionReason'] = 'rejectionReason';
        expressionAttributeValues[':rejectionReason'] = updates.rejectionReason;
      }

      if (updateExpressions.length === 0) {
        console.warn('No updates provided for component status update');
        return;
      }

      await this.dynamoClient.send(new UpdateCommand({
        TableName: DYNAMODB_COMPONENT_LIBRARY_TABLE,
        Key: { componentId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      }));

      // Clear caches - invalidate both component data and index
      this.componentCache.delete(componentId);
      this.indexCache.clear(); // Force index refresh on next read

      console.log(`✅ Updated component ${componentId} status:`, updates);
    } catch (error) {
      console.error(`Error updating component ${componentId} status:`, error);
      throw error;
    }
  }

  /**
   * Clear caches (for testing or manual refresh)
   */
  clearCache(): void {
    this.componentCache.clear();
    this.indexCache.clear();
    console.log('[ComponentLibrary] All caches cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      componentCache: this.componentCache.getStats(),
      indexCache: this.indexCache.getStats()
    };
  }
}
