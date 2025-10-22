// Validation API Client
// Executes design validation and retrieves results

import { apiClient } from './api-client';

export interface ValidationReport {
  summary: {
    overallScore: number;
    results: ValidationResult[];
    totalIssues: number;
    criticalIssues: number;
    warnings: number;
  };
  criticalIssues: ValidationResult[];
  warnings: ValidationResult[];
  suggestions: string[];
  qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  appliedRules: string[];
  timestamp: Date;
}

export interface ValidationResult {
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  affectedComponents: string[];
  suggestedFix?: string;
  confidence?: number;
  source?: 'hard-coded' | 'llm-enhanced' | 'user-defined';
}

export interface ValidationRule {
  id: string;
  name: string;
  description: string;
  category: 'connectivity' | 'power' | 'clock' | 'performance' | 'compliance' | 'custom';
  severity: 'error' | 'warning' | 'info';
  enabled: boolean;
  priority: number;
}

export interface RuleConfiguration {
  enabled?: boolean;
  priority?: number;
  severity?: 'error' | 'warning' | 'info';
}

export interface ValidationStatistics {
  totalRules: number;
  enabledRules: number;
  rulesByCategory: Record<string, number>;
  totalValidations: number;
  averageScore: number;
}

export interface RAGValidationRequest {
  suggestedComponents: any[];
  availableComponents: any[];
}

export const validationAPI = {
  async validateSession(sessionId: string): Promise<ValidationReport> {
    return await apiClient.post<ValidationReport>(`/validation/session/${sessionId}`);
  },

  async validateComponents(components: any[]): Promise<ValidationReport> {
    return await apiClient.post<ValidationReport>('/validation/components', { components });
  },

  async validateSpecification(specification: any): Promise<ValidationReport> {
    return await apiClient.post<ValidationReport>('/validation/specification', {
      specification,
    });
  },

  async getRules(): Promise<{
    rules: ValidationRule[];
    statistics: ValidationStatistics;
    categories: string[];
    totalRules: number;
    enabledRules: number;
  }> {
    return await apiClient.get('/validation/rules');
  },

  async updateRule(ruleId: string, config: RuleConfiguration): Promise<void> {
    await apiClient.put(`/validation/rules/${ruleId}`, config);
  },

  async validateRAGOutput(request: RAGValidationRequest): Promise<any> {
    return await apiClient.post('/validation/rag-output', request);
  },

  async generateChatReport(
    sessionId?: string,
    components?: any[]
  ): Promise<{ report: string; validationResult: ValidationReport }> {
    return await apiClient.post('/validation/chat-report', { sessionId, components });
  },

  async getStatistics(): Promise<ValidationStatistics> {
    return await apiClient.get('/validation/statistics');
  },
};
