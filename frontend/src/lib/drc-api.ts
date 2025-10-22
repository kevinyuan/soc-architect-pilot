// DRC API Client
// DRC routes are mounted at /api/drc (not under /api/v1)
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:3000';

export interface DRCViolation {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: 'critical' | 'warning' | 'info';
  category: string;
  location: string;
  description: string;
  suggestion: string;
  affectedComponents?: string[];
  affectedInterfaces?: string[];
  affectedConnections?: string[];
  details?: Record<string, any>;
}

export interface DRCResult {
  timestamp: string;
  totalChecks: number;
  violations: DRCViolation[];
  summary: {
    critical: number;
    warning: number;
    info: number;
  };
  passed: boolean;
}

export interface DRCRule {
  id: string;
  name: string;
  severity: 'critical' | 'warning' | 'info';
}

export interface DRCRuleCategory {
  category: string;
  rules: DRCRule[];
}

export interface DRCOptions {
  checkOptionalPorts?: boolean;
}

export const drcAPI = {
  async runCheck(diagram: any, projectId?: string | null, options?: DRCOptions): Promise<DRCResult> {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE_URL}/api/drc/check`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ diagram, projectId, options }),
    });

    if (!response.ok) {
      try {
        const error = await response.json();
        throw new Error(error.error || error.message || 'Failed to run DRC check');
      } catch (parseError) {
        // If JSON parsing fails, throw a generic error
        throw new Error(`DRC check failed with status ${response.status}`);
      }
    }

    const result = await response.json();
    return result.data;
  },

  async getResults(projectId: string | null): Promise<DRCResult> {
    if (!projectId) {
      throw new Error('Project ID is required');
    }
    
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const headers: HeadersInit = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE_URL}/api/drc/results/${projectId}`, {
      headers,
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('No DRC results found');
      }
      try {
        const error = await response.json();
        throw new Error(error.error || error.message || 'Failed to get DRC results');
      } catch (parseError) {
        throw new Error(`Failed to get DRC results with status ${response.status}`);
      }
    }

    const result = await response.json();
    return result.data;
  },

  async getRules(): Promise<DRCRuleCategory[]> {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const headers: HeadersInit = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE_URL}/api/drc/rules`, {
      headers,
    });

    if (!response.ok) {
      try {
        const error = await response.json();
        throw new Error(error.error || error.message || 'Failed to get DRC rules');
      } catch (parseError) {
        throw new Error(`Failed to get DRC rules with status ${response.status}`);
      }
    }

    const result = await response.json();
    return result.data;
  },
};
