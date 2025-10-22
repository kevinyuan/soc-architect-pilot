// Templates are at /api/templates (not under /api/v1)
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:3000';

export interface ArchitectureTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  nodeCount: number;
  createdAt: string;
}

export interface ArchitectureTemplateDetail extends ArchitectureTemplate {
  diagram: {
    nodes: any[];
    edges: any[];
  };
}

// Helper to get auth headers
function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

export const templateAPI = {
  async listTemplates(): Promise<ArchitectureTemplate[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/templates`, {
        headers: getAuthHeaders()
      });
      
      if (!response.ok) {
        console.error(`Template API error: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to fetch templates: ${response.status}`);
      }
      
      const text = await response.text();
      if (!text) {
        console.warn('Template API returned empty response, returning empty array');
        return [];
      }
      
      const result = JSON.parse(text);
      return result.data || [];
    } catch (error) {
      console.error('Error fetching templates:', error);
      // Return empty array instead of throwing to prevent UI breakage
      return [];
    }
  },

  async getTemplate(id: string): Promise<ArchitectureTemplateDetail> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/templates/${id}`, {
        headers: getAuthHeaders()
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch template: ${response.status}`);
      }
      
      const text = await response.text();
      if (!text) {
        throw new Error('Template API returned empty response');
      }
      
      const result = JSON.parse(text);
      return result.data;
    } catch (error) {
      console.error(`Error fetching template ${id}:`, error);
      throw error;
    }
  },

  async instantiateTemplate(id: string): Promise<{
    template: {
      id: string;
      name: string;
      description: string;
      category: string;
    };
    diagram: {
      nodes: any[];
      edges: any[];
    };
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/templates/${id}/instantiate`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to instantiate template: ${response.status}`);
      }
      
      const text = await response.text();
      if (!text) {
        throw new Error('Template API returned empty response');
      }
      
      const result = JSON.parse(text);
      return result.data;
    } catch (error) {
      console.error(`Error instantiating template ${id}:`, error);
      throw error;
    }
  }
};
