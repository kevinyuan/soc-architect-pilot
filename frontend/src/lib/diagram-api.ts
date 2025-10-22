// Diagram API Client
// Handles diagram generation and layout

import { apiClient } from './api-client';

export interface DiagramGenerateRequest {
  specification: any;
  components: any[];
  layout?: 'hierarchical' | 'grid' | 'force';
}

export interface DiagramData {
  nodes: any[];
  edges: any[];
  layout: {
    algorithm: string;
    direction?: string;
    spacing?: {
      nodeSpacing: number;
      rankSpacing: number;
    };
    viewport: {
      x: number;
      y: number;
      zoom: number;
    };
  };
  metadata: {
    generatedAt: string;
    version: string;
    source: string;
  };
}

export interface LayoutRequest {
  nodes: any[];
  edges: any[];
  algorithm?: 'hierarchical' | 'grid' | 'force';
}

export const diagramAPI = {
  async generate(request: DiagramGenerateRequest): Promise<DiagramData> {
    return await apiClient.post<DiagramData>('/diagram/generate', request);
  },

  async applyLayout(request: LayoutRequest): Promise<DiagramData> {
    return await apiClient.post<DiagramData>('/diagram/layout', request);
  },

  async validate(diagramData: DiagramData): Promise<{ valid: boolean; errors: string[] }> {
    return await apiClient.post<{ valid: boolean; errors: string[] }>(
      '/diagram/validate',
      { diagramData }
    );
  },
};
