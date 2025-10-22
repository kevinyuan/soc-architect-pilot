// BOM (Bill of Materials) API Client
// Handles BOM report generation and vendor suggestions

import { apiClient } from './api-client';

export interface ComponentVendor {
  vendor: string;
  partNumber: string;
  logoUrl: string;
  productUrl: string;
  description?: string;
}

export interface BOMComponent {
  componentId: string;
  componentName: string;
  componentType: string;
  category: string;
  description?: string;
  suggestedVendors: ComponentVendor[];
}

export interface BOMCategory {
  categoryName: string;
  categoryDescription: string;
  components: BOMComponent[];
}

export interface BOMReport {
  projectId: string;
  projectName: string;
  generatedAt: Date;
  categories: BOMCategory[];
  totalComponents: number;
}

/**
 * BOM API Client
 */
export const bomAPI = {
  /**
   * Generate BOM report for a project with timeout
   */
  async generateBOM(projectId: string, timeoutMs: number = 10000): Promise<BOMReport> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await apiClient.get<BOMReport>(
        `/bom/${projectId}`,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);
      return response;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError' || controller.signal.aborted) {
        throw new Error('BOM generation timeout - request took longer than 10 seconds');
      }
      throw error;
    }
  },

  /**
   * Generate BOM from custom component list
   */
  async generateCustomBOM(
    projectId: string,
    projectName: string,
    components: any[]
  ): Promise<BOMReport> {
    const response = await apiClient.post<BOMReport>(
      '/bom/custom',
      { projectId, projectName, components }
    );
    return response;
  },
};
