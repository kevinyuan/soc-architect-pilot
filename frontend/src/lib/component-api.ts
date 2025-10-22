// Component API Client
// Manages component library access and search

import { apiClient } from './api-client';

// Types matching backend API
export interface ComponentLibraryResponse {
  components: ArchitecturalComponent[];
  total: number;
  metadata: LibraryMetadata;
}

export interface ArchitecturalComponent {
  id: string;
  name: string;
  category: ComponentCategory;
  type: string;
  properties: any;
  interfaces: any[];
  icon: string;
  description: string;
  tags?: string[];
  estimatedMetrics?: any;
}

export interface LibraryMetadata {
  version: string;
  totalComponents: number;
  categories: ComponentCategory[];
  lastUpdated: Date;
}

export interface ComponentMatch {
  component: ArchitecturalComponent;
  matchScore: number;
  matchReason: string;
  keywords: string[];
  relevantProperties: string[];
}

export interface ComponentSearchRequest {
  query?: string;
  useCase?: string;
  requirements?: string[];
}

export interface ComponentCustomizationRequest {
  componentId: string;
  request: string;
  context?: any;
}

export interface CustomComponentRequest {
  templateId: string;
  customizations: any;
  metadata: {
    name: string;
    description?: string;
    tags?: string[];
  };
}

export type ComponentCategory = 'CPU' | 'Memory' | 'Interconnect' | 'IO' | 'Accelerator' | 'Custom';

// Simple in-memory cache
class ComponentCache {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private ttl = 5 * 60 * 1000; // 5 minutes

  get(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  set(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

const componentCache = new ComponentCache();

/**
 * Component API Client
 */
export const componentAPI = {
  /**
   * Get all components with optional filters
   */
  async getAll(params?: {
    category?: ComponentCategory | 'All';
    search?: string;
    limit?: number;
  }): Promise<ComponentLibraryResponse> {
    const cacheKey = `all-${JSON.stringify(params || {})}`;
    const cached = componentCache.get(cacheKey);
    if (cached) return cached;

    const response = await apiClient.get<ComponentLibraryResponse>(
      '/components',
      params
    );

    componentCache.set(cacheKey, response);
    return response;
  },

  /**
   * Get component by ID
   */
  async getById(componentId: string): Promise<ArchitecturalComponent> {
    const cacheKey = `component-${componentId}`;
    const cached = componentCache.get(cacheKey);
    if (cached) return cached;

    const response = await apiClient.get<ArchitecturalComponent>(
      `/components/${componentId}`
    );

    componentCache.set(cacheKey, response);
    return response;
  },

  /**
   * Search components using RAG
   */
  async search(request: ComponentSearchRequest): Promise<ComponentMatch[]> {
    const response = await apiClient.post<{ matches: ComponentMatch[] }>(
      '/components/search',
      request
    );

    return response.matches;
  },

  /**
   * Get component categories
   */
  async getCategories(): Promise<{
    categories: ComponentCategory[];
    totalComponents: number;
  }> {
    const cached = componentCache.get('categories');
    if (cached) return cached;

    const response = await apiClient.get<{
      categories: ComponentCategory[];
      totalComponents: number;
    }>('/components/meta/categories');

    componentCache.set('categories', response);
    return response;
  },

  /**
   * Validate component
   */
  async validate(component: ArchitecturalComponent): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const response = await apiClient.post<{
      valid: boolean;
      errors: string[];
    }>('/components/validate', { component });

    return response;
  },

  /**
   * Get compatible components
   */
  async getCompatibleComponents(componentId: string): Promise<ArchitecturalComponent[]> {
    const response = await apiClient.get<{
      componentId: string;
      compatibleComponents: ArchitecturalComponent[];
    }>(`/components/${componentId}/compatible`);

    return response.compatibleComponents;
  },

  /**
   * Get suggestions for use case
   */
  async getSuggestionsForUseCase(useCase: string): Promise<ComponentMatch[]> {
    const response = await apiClient.get<{
      useCase: string;
      suggestions: ComponentMatch[];
    }>(`/components/suggestions/${useCase}`);

    return response.suggestions;
  },

  /**
   * Customize component using natural language
   */
  async customizeComponent(request: ComponentCustomizationRequest): Promise<ArchitecturalComponent> {
    const response = await apiClient.post<ArchitecturalComponent>(
      `/components/${request.componentId}/customize`,
      { request: request.request, context: request.context }
    );

    return response;
  },

  /**
   * Create custom component from template
   */
  async createCustomComponent(request: CustomComponentRequest): Promise<ArchitecturalComponent> {
    const response = await apiClient.post<ArchitecturalComponent>(
      '/components/custom/create',
      request
    );

    return response;
  },

  /**
   * Reload component library
   */
  async reloadLibrary(): Promise<LibraryMetadata> {
    componentCache.clear();
    
    const response = await apiClient.post<{
      message: string;
      metadata: LibraryMetadata;
    }>('/components/reload');

    return response.metadata;
  },

  /**
   * Clear cache manually
   */
  clearCache(): void {
    componentCache.clear();
  },

  /**
   * Get components pending admin review
   */
  async getPendingAudit(): Promise<{ components: any[]; count: number }> {
    const response = await apiClient.get<{ success: boolean; components: any[]; count: number }>(
      '/components/pending/audit'
    );
    return response;
  },

  /**
   * Approve a component (admin only)
   */
  async approveComponent(componentId: string, notes?: string): Promise<void> {
    await apiClient.post(`/components/${componentId}/approve`, { notes });
    componentCache.clear(); // Clear cache after approval
  },

  /**
   * Reject a component (admin only)
   */
  async rejectComponent(componentId: string, reason: string): Promise<void> {
    await apiClient.post(`/components/${componentId}/reject`, { reason });
    componentCache.clear(); // Clear cache after rejection
  },
};
