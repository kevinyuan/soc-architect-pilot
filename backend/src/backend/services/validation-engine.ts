import { ArchitecturalComponent, DesignSession } from '../../types/index';

export interface ValidationContext {
  components: ArchitecturalComponent[];
  session: DesignSession;
  metadata?: Record<string, any>;
}

export interface ValidationResult {
  ruleId: string;
  ruleName: string;
  category: ValidationCategory;
  severity: ValidationSeverity;
  passed: boolean;
  confidence: number; // 0-1 score
  message: string;
  details?: string;
  suggestedFix?: string;
  affectedComponents: string[]; // component IDs
  metadata?: Record<string, any>;
}

export interface ValidationSummary {
  overallScore: number; // 0-100 quality score
  totalRules: number;
  passedRules: number;
  failedRules: number;
  results: ValidationResult[];
  categories: Record<ValidationCategory, {
    passed: number;
    failed: number;
    score: number;
  }>;
  timestamp: Date;
}

export enum ValidationCategory {
  CONNECTIVITY = 'connectivity',
  POWER = 'power',
  TIMING = 'timing',
  COMPATIBILITY = 'compatibility',
  ARCHITECTURE = 'architecture',
  PERFORMANCE = 'performance'
}

export enum ValidationSeverity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info'
}

export interface ValidationRuleConfig {
  enabled: boolean;
  priority: number; // 1-10, higher = more important
  severity: ValidationSeverity;
  parameters?: Record<string, any>;
}

export abstract class ValidationRule {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly category: ValidationCategory;
  abstract getDefaultSeverity(): ValidationSeverity;
  abstract getDefaultPriority(): number;

  protected config: ValidationRuleConfig;

  constructor(config?: Partial<ValidationRuleConfig>) {
    this.config = {
      enabled: true,
      priority: config?.priority ?? this.getDefaultPriority(),
      severity: config?.severity ?? this.getDefaultSeverity(),
      ...config
    };
  }

  abstract validate(context: ValidationContext): Promise<ValidationResult>;

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getPriority(): number {
    return this.config.priority;
  }

  getSeverity(): ValidationSeverity {
    return this.config.severity;
  }

  updateConfig(config: Partial<ValidationRuleConfig>): void {
    this.config = { ...this.config, ...config };
  }

  protected createResult(
    passed: boolean,
    confidence: number,
    message: string,
    affectedComponents: string[] = [],
    details?: string,
    suggestedFix?: string,
    metadata?: Record<string, any>
  ): ValidationResult {
    return {
      ruleId: this.id,
      ruleName: this.name,
      category: this.category,
      severity: this.getSeverity(),
      passed,
      confidence,
      message,
      details,
      suggestedFix,
      affectedComponents,
      metadata
    };
  }
}

export class ValidationEngine {
  private rules: Map<string, ValidationRule> = new Map();
  private ruleConfigs: Map<string, ValidationRuleConfig> = new Map();

  /**
   * Register a validation rule
   */
  registerRule(rule: ValidationRule): void {
    this.rules.set(rule.id, rule);
    
    // Apply stored config if exists
    const storedConfig = this.ruleConfigs.get(rule.id);
    if (storedConfig) {
      rule.updateConfig(storedConfig);
    }
  }

  /**
   * Unregister a validation rule
   */
  unregisterRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  /**
   * Get all registered rules
   */
  getRules(): ValidationRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get rule by ID
   */
  getRule(ruleId: string): ValidationRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Update rule configuration
   */
  updateRuleConfig(ruleId: string, config: Partial<ValidationRuleConfig>): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.updateConfig(config);
      this.ruleConfigs.set(ruleId, { ...rule['config'], ...config });
    }
  }

  /**
   * Enable/disable a rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): void {
    this.updateRuleConfig(ruleId, { enabled });
  }

  /**
   * Validate design using all enabled rules
   */
  async validateDesign(context: ValidationContext): Promise<ValidationSummary> {
    const enabledRules = Array.from(this.rules.values())
      .filter(rule => rule.isEnabled())
      .sort((a, b) => b.getPriority() - a.getPriority()); // Higher priority first

    const results: ValidationResult[] = [];

    // Run all validation rules
    for (const rule of enabledRules) {
      try {
        const result = await rule.validate(context);
        results.push(result);
      } catch (error) {
        console.error(`Validation rule ${rule.id} failed:`, error);
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category,
          severity: ValidationSeverity.ERROR,
          passed: false,
          confidence: 0,
          message: `Rule execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          affectedComponents: []
        });
      }
    }

    return this.calculateSummary(results);
  }

  /**
   * Validate specific components
   */
  async validateComponents(
    components: ArchitecturalComponent[],
    session?: DesignSession
  ): Promise<ValidationSummary> {
    const context: ValidationContext = {
      components,
      session: session || this.createDummySession(components)
    };

    return this.validateDesign(context);
  }

  /**
   * Calculate validation summary and scores
   */
  private calculateSummary(results: ValidationResult[]): ValidationSummary {
    const categories: Record<ValidationCategory, { passed: number; failed: number; score: number }> = {
      [ValidationCategory.CONNECTIVITY]: { passed: 0, failed: 0, score: 0 },
      [ValidationCategory.POWER]: { passed: 0, failed: 0, score: 0 },
      [ValidationCategory.TIMING]: { passed: 0, failed: 0, score: 0 },
      [ValidationCategory.COMPATIBILITY]: { passed: 0, failed: 0, score: 0 },
      [ValidationCategory.ARCHITECTURE]: { passed: 0, failed: 0, score: 0 },
      [ValidationCategory.PERFORMANCE]: { passed: 0, failed: 0, score: 0 }
    };

    let totalScore = 0;
    let totalWeight = 0;
    let passedRules = 0;

    results.forEach(result => {
      const category = categories[result.category];
      
      if (result.passed) {
        category.passed++;
        passedRules++;
      } else {
        category.failed++;
      }

      // Weight score by confidence and rule priority
      const rule = this.rules.get(result.ruleId);
      const weight = rule ? rule.getPriority() : 1;
      const score = result.passed ? result.confidence * 100 : 0;
      
      totalScore += score * weight;
      totalWeight += weight;
    });

    // Calculate category scores
    Object.keys(categories).forEach(categoryKey => {
      const category = categories[categoryKey as ValidationCategory];
      const total = category.passed + category.failed;
      category.score = total > 0 ? (category.passed / total) * 100 : 100;
    });

    const overallScore = totalWeight > 0 ? totalScore / totalWeight : 100;

    return {
      overallScore: Math.round(overallScore),
      totalRules: results.length,
      passedRules,
      failedRules: results.length - passedRules,
      results,
      categories,
      timestamp: new Date()
    };
  }

  /**
   * Create dummy session for component-only validation
   */
  private createDummySession(components: ArchitecturalComponent[]): DesignSession {
    return {
      sessionId: 'validation-session',
      startTime: new Date(),
      lastActivity: new Date(),
      phase: 'generating',
      conversationHistory: [],
      requirements: [],
      constraints: [],
      currentArchitecture: {
        naturalLanguageSpec: 'Validation context',
        selectedComponents: components,
        customComponents: [],
        performanceRequirements: [],
        constraints: [],
        designDecisions: [],
        componentRationale: []
      }
    };
  }

  /**
   * Get validation statistics
   */
  getStatistics(): {
    totalRules: number;
    enabledRules: number;
    disabledRules: number;
    rulesByCategory: Record<ValidationCategory, number>;
    rulesBySeverity: Record<ValidationSeverity, number>;
  } {
    const rules = Array.from(this.rules.values());
    const enabledRules = rules.filter(rule => rule.isEnabled());
    
    const rulesByCategory: Record<ValidationCategory, number> = {
      [ValidationCategory.CONNECTIVITY]: 0,
      [ValidationCategory.POWER]: 0,
      [ValidationCategory.TIMING]: 0,
      [ValidationCategory.COMPATIBILITY]: 0,
      [ValidationCategory.ARCHITECTURE]: 0,
      [ValidationCategory.PERFORMANCE]: 0
    };

    const rulesBySeverity: Record<ValidationSeverity, number> = {
      [ValidationSeverity.ERROR]: 0,
      [ValidationSeverity.WARNING]: 0,
      [ValidationSeverity.INFO]: 0
    };

    rules.forEach(rule => {
      rulesByCategory[rule.category]++;
      rulesBySeverity[rule.getSeverity()]++;
    });

    return {
      totalRules: rules.length,
      enabledRules: enabledRules.length,
      disabledRules: rules.length - enabledRules.length,
      rulesByCategory,
      rulesBySeverity
    };
  }
}

// Singleton instance
export const validationEngine = new ValidationEngine();