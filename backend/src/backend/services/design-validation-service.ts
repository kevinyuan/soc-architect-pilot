import { 
  ValidationEngine, 
  ValidationSummary, 
  ValidationResult,
  ValidationCategory,
  ValidationSeverity,
  validationEngine 
} from './validation-engine';
import {
  CpuMemoryConnectivityRule,
  PowerDomainRule,
  ClockDomainRule,
  InterfaceCompatibilityRule,
  OrphanedComponentsRule
} from './validation-rules';
import { ArchitecturalComponent, DesignSession } from '../../types/index';

export interface ValidationDisplayResult {
  summary: ValidationSummary;
  criticalIssues: ValidationResult[];
  warnings: ValidationResult[];
  suggestions: string[];
  qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  improvementAreas: string[];
}

export interface RAGValidationResult {
  componentExists: boolean;
  compatibilityValid: boolean;
  jsonStructureValid: boolean;
  confidence: number;
  issues: string[];
}

export class DesignValidationService {
  private engine: ValidationEngine;

  constructor() {
    this.engine = validationEngine;
    this.initializeCoreRules();
  }

  /**
   * Initialize core validation rules
   */
  private initializeCoreRules(): void {
    // Register core validation rules
    this.engine.registerRule(new CpuMemoryConnectivityRule());
    this.engine.registerRule(new PowerDomainRule());
    this.engine.registerRule(new ClockDomainRule());
    this.engine.registerRule(new InterfaceCompatibilityRule());
    this.engine.registerRule(new OrphanedComponentsRule());
  }

  /**
   * Validate design session
   */
  async validateSession(session: DesignSession): Promise<ValidationDisplayResult> {
    if (!session.currentArchitecture?.selectedComponents.length) {
      return this.createEmptyResult('No components selected for validation');
    }

    const context = {
      components: session.currentArchitecture.selectedComponents,
      session
    };

    const summary = await this.engine.validateDesign(context);
    return this.formatDisplayResult(summary);
  }

  /**
   * Validate components directly
   */
  async validateComponents(components: ArchitecturalComponent[]): Promise<ValidationDisplayResult> {
    if (components.length === 0) {
      return this.createEmptyResult('No components provided for validation');
    }

    const summary = await this.engine.validateComponents(components);
    return this.formatDisplayResult(summary);
  }

  /**
   * Validate RAG output quality
   */
  async validateRAGOutput(
    suggestedComponents: ArchitecturalComponent[],
    availableComponents: ArchitecturalComponent[]
  ): Promise<RAGValidationResult> {
    const issues: string[] = [];
    let componentExists = true;
    let compatibilityValid = true;
    let jsonStructureValid = true;

    // Check if suggested components exist in available components
    suggestedComponents.forEach(suggested => {
      const exists = availableComponents.some(available => 
        available.id === suggested.id || available.name === suggested.name
      );
      
      if (!exists) {
        componentExists = false;
        issues.push(`Component "${suggested.name}" not found in library`);
      }

      // Validate JSON structure
      if (!this.validateComponentStructure(suggested)) {
        jsonStructureValid = false;
        issues.push(`Invalid structure for component "${suggested.name}"`);
      }

      // Check compatibility arrays
      if (!Array.isArray(suggested.compatibility) || suggested.compatibility.length === 0) {
        compatibilityValid = false;
        issues.push(`Missing or invalid compatibility for "${suggested.name}"`);
      }
    });

    // Calculate confidence based on validation results
    let confidence = 1.0;
    if (!componentExists) confidence -= 0.4;
    if (!compatibilityValid) confidence -= 0.3;
    if (!jsonStructureValid) confidence -= 0.3;
    
    confidence = Math.max(0, confidence);

    return {
      componentExists,
      compatibilityValid,
      jsonStructureValid,
      confidence,
      issues
    };
  }

  /**
   * Get validation rules configuration
   */
  getRulesConfiguration(): Array<{
    id: string;
    name: string;
    description: string;
    category: ValidationCategory;
    severity: ValidationSeverity;
    enabled: boolean;
    priority: number;
  }> {
    return this.engine.getRules().map(rule => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      category: rule.category,
      severity: rule.getSeverity(),
      enabled: rule.isEnabled(),
      priority: rule.getPriority()
    }));
  }

  /**
   * Update rule configuration
   */
  updateRuleConfiguration(ruleId: string, config: {
    enabled?: boolean;
    priority?: number;
    severity?: ValidationSeverity;
  }): boolean {
    const rule = this.engine.getRule(ruleId);
    if (!rule) return false;

    this.engine.updateRuleConfig(ruleId, config);
    return true;
  }

  /**
   * Get validation statistics
   */
  getValidationStatistics() {
    return this.engine.getStatistics();
  }

  /**
   * Format validation results for display
   */
  private formatDisplayResult(summary: ValidationSummary): ValidationDisplayResult {
    const criticalIssues = summary.results.filter(r => 
      !r.passed && r.severity === ValidationSeverity.ERROR
    );
    
    const warnings = summary.results.filter(r => 
      !r.passed && r.severity === ValidationSeverity.WARNING
    );

    const suggestions = this.generateSuggestions(summary);
    const qualityGrade = this.calculateQualityGrade(summary.overallScore);
    const improvementAreas = this.identifyImprovementAreas(summary);

    return {
      summary,
      criticalIssues,
      warnings,
      suggestions,
      qualityGrade,
      improvementAreas
    };
  }

  /**
   * Generate improvement suggestions
   */
  private generateSuggestions(summary: ValidationSummary): string[] {
    const suggestions: string[] = [];

    // Connectivity suggestions
    const connectivityIssues = summary.results.filter(r => 
      r.category === ValidationCategory.CONNECTIVITY && !r.passed
    );
    if (connectivityIssues.length > 0) {
      suggestions.push('Review component connectivity and add missing connections');
    }

    // Power suggestions
    const powerIssues = summary.results.filter(r => 
      r.category === ValidationCategory.POWER && !r.passed
    );
    if (powerIssues.length > 0) {
      suggestions.push('Consider power management and optimization strategies');
    }

    // Timing suggestions
    const timingIssues = summary.results.filter(r => 
      r.category === ValidationCategory.TIMING && !r.passed
    );
    if (timingIssues.length > 0) {
      suggestions.push('Review clock domains and timing constraints');
    }

    // General suggestions based on score
    if (summary.overallScore < 70) {
      suggestions.push('Consider redesigning architecture for better component integration');
    } else if (summary.overallScore < 85) {
      suggestions.push('Address remaining warnings to improve design quality');
    }

    return suggestions;
  }

  /**
   * Calculate quality grade
   */
  private calculateQualityGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  /**
   * Identify improvement areas
   */
  private identifyImprovementAreas(summary: ValidationSummary): string[] {
    const areas: string[] = [];

    Object.entries(summary.categories).forEach(([category, stats]) => {
      if (stats.score < 80) {
        areas.push(category.toLowerCase().replace('_', ' '));
      }
    });

    return areas;
  }

  /**
   * Validate component JSON structure
   */
  private validateComponentStructure(component: any): boolean {
    const requiredFields = ['id', 'name', 'category', 'properties', 'compatibility'];
    
    return requiredFields.every(field => 
      component.hasOwnProperty(field) && component[field] !== undefined
    );
  }

  /**
   * Create empty validation result
   */
  private createEmptyResult(message: string): ValidationDisplayResult {
    return {
      summary: {
        overallScore: 0,
        totalRules: 0,
        passedRules: 0,
        failedRules: 0,
        results: [],
        categories: {
          [ValidationCategory.CONNECTIVITY]: { passed: 0, failed: 0, score: 0 },
          [ValidationCategory.POWER]: { passed: 0, failed: 0, score: 0 },
          [ValidationCategory.TIMING]: { passed: 0, failed: 0, score: 0 },
          [ValidationCategory.COMPATIBILITY]: { passed: 0, failed: 0, score: 0 },
          [ValidationCategory.ARCHITECTURE]: { passed: 0, failed: 0, score: 0 },
          [ValidationCategory.PERFORMANCE]: { passed: 0, failed: 0, score: 0 }
        },
        timestamp: new Date()
      },
      criticalIssues: [],
      warnings: [],
      suggestions: [message],
      qualityGrade: 'F',
      improvementAreas: []
    };
  }

  /**
   * Generate validation report for chat display
   */
  generateChatReport(result: ValidationDisplayResult): string {
    const { summary, criticalIssues, warnings, qualityGrade } = result;
    
    let report = `🔍 **Design Validation Report**\n\n`;
    report += `**Overall Quality: ${qualityGrade} (${summary.overallScore}/100)**\n`;
    report += `✅ Passed: ${summary.passedRules}/${summary.totalRules} rules\n\n`;

    if (criticalIssues.length > 0) {
      report += `🚨 **Critical Issues (${criticalIssues.length}):**\n`;
      criticalIssues.forEach(issue => {
        report += `• ${issue.message}\n`;
        if (issue.suggestedFix) {
          report += `  💡 *${issue.suggestedFix}*\n`;
        }
      });
      report += '\n';
    }

    if (warnings.length > 0) {
      report += `⚠️ **Warnings (${warnings.length}):**\n`;
      warnings.slice(0, 3).forEach(warning => { // Limit to 3 warnings for chat
        report += `• ${warning.message}\n`;
      });
      if (warnings.length > 3) {
        report += `• ... and ${warnings.length - 3} more warnings\n`;
      }
      report += '\n';
    }

    if (result.suggestions.length > 0) {
      report += `💡 **Suggestions:**\n`;
      result.suggestions.slice(0, 2).forEach(suggestion => {
        report += `• ${suggestion}\n`;
      });
    }

    return report;
  }
}

// Singleton instance
export const designValidationService = new DesignValidationService();