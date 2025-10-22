// Admin API functions
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:3000';

export interface ExportTemplateRequest {
  projectId: string;
  templateName: string;
  templateDescription?: string;
}

export interface ExportTemplateResponse {
  success: boolean;
  data?: {
    templateId: string;
    templateName: string;
    filePath: string;
  };
  error?: string;
}

export interface UpdateTemplateRequest {
  projectId: string;
  templateId: string;
}

export interface UpdateTemplateResponse {
  success: boolean;
  data?: {
    templateId: string;
    templateName: string;
    message: string;
  };
  error?: string;
}

export const adminApi = {
  /**
   * Export current architecture as a template (Admin only)
   */
  async exportAsTemplate(request: ExportTemplateRequest): Promise<ExportTemplateResponse> {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE_URL}/api/admin/export-template`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      try {
        const error = await response.json();
        throw new Error(error.error || error.message || 'Failed to export template');
      } catch (parseError) {
        throw new Error(`Failed to export template with status ${response.status}`);
      }
    }

    return await response.json();
  },

  /**
   * Update an existing template with current architecture (Admin only)
   */
  async updateTemplate(request: UpdateTemplateRequest): Promise<UpdateTemplateResponse> {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE_URL}/api/admin/update-template`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      try {
        const error = await response.json();
        throw new Error(error.error || error.message || 'Failed to update template');
      } catch (parseError) {
        throw new Error(`Failed to update template with status ${response.status}`);
      }
    }

    return await response.json();
  },
};
