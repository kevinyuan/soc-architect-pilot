/**
 * Component Quality Scorer
 * 
 * Autonomous quality assessment for AI-generated components
 */

import { ArchitecturalComponent, InterfaceDefinition } from '../../types/index';
import { DRCChecker } from './drc-checker';
import { ComponentLibraryManager } from './component-library-manager';

export interface QualityScore {
  total: number;           // 0-100
  breakdown: {
    drcCompliance: number;      // 0-30 points
    interfaceQuality: number;   // 0-25 points
    completeness: number;       // 0-20 points
    naming: number;             // 0-15 points
    uniqueness: number;         // 0-10 points
  };
  autoApprove: boolean;   // true if total >= 80
  issues: string[];       // List of problems found
  similarComponents?: ArchitecturalComponent[];
}

export class ComponentQualityScorer {
  private drcChecker: DRCChecker;
  private componentLibrary: ComponentLibraryManager;

  constructor() {
    this.drcChecker = new DRCChecker();
    this.componentLibrary = new ComponentLibraryManager();
  }

  /**
   * Calculate comprehensive quality score for a component
   */
  async calculateQualityScore(component: ArchitecturalComponent): Promise<QualityScore> {
    const score: QualityScore = {
      total: 0,
      breakdown: {
        drcCompliance: 0,
        interfaceQuality: 0,
        completeness: 0,
        naming: 0,
        uniqueness: 0
      },
      autoApprove: false,
      issues: []
    };

    // 1. DRC Compliance (30 points)
    const drcScore = await this.checkDRCCompliance(component);
    score.breakdown.drcCompliance = drcScore.points;
    score.issues.push(...drcScore.issues);

    // 2. Interface Quality (25 points)
    const interfaceScore = this.checkInterfaceQuality(component);
    score.breakdown.interfaceQuality = interfaceScore.points;
    score.issues.push(...interfaceScore.issues);

    // 3. Completeness (20 points)
    const completenessScore = this.checkCompleteness(component);
    score.breakdown.completeness = completenessScore.points;
    score.issues.push(...completenessScore.issues);

    // 4. Naming Convention (15 points)
    const namingScore = this.checkNaming(component);
    score.breakdown.naming = namingScore.points;
    score.issues.push(...namingScore.issues);

    // 5. Uniqueness (10 points)
    const uniquenessScore = await this.checkUniqueness(component);
    score.breakdown.uniqueness = uniquenessScore.points;
    score.issues.push(...uniquenessScore.issues);
    score.similarComponents = uniquenessScore.similarComponents;

    // Calculate total
    score.total = Object.values(score.breakdown).reduce((sum, val) => sum + val, 0);
    
    // Auto-approve if score >= 80
    score.autoApprove = score.total >= 80;

    return score;
  }

  /**
   * Check DRC compliance (30 points)
   */
  private async checkDRCCompliance(component: ArchitecturalComponent): Promise<{ points: number; issues: string[] }> {
    const issues: string[] = [];
    
    try {
      // Create minimal test diagram
      const testDiagram = {
        nodes: [{
          id: component.id,
          data: {
            label: component.name,
            model_type: component.type,
            category: component.category,
            target_addr_base: component.addressMapping?.baseAddress || '',
            target_addr_space: component.addressMapping?.addressSpace || '',
          }
        }],
        edges: []
      };

      const result = await this.drcChecker.checkDiagram(testDiagram, [component]);

      if (result.summary.critical === 0) {
        return { points: 30, issues: [] };
      } else {
        const points = Math.max(0, 30 - result.summary.critical * 10);
        result.violations
          .filter(v => v.severity === 'critical')
          .forEach(v => issues.push(`DRC: ${v.description}`));
        return { points, issues };
      }
    } catch (error) {
      issues.push('DRC check failed');
      return { points: 15, issues }; // Partial credit
    }
  }

  /**
   * Check interface quality (25 points)
   */
  private checkInterfaceQuality(component: ArchitecturalComponent): { points: number; issues: string[] } {
    let points = 0;
    const issues: string[] = [];

    // Check interface count (10 points)
    if (component.interfaces.length === 0) {
      issues.push('No interfaces defined');
    } else {
      points += 10;
    }

    // Check interface completeness (10 points)
    let completeInterfaces = 0;
    for (const intf of component.interfaces) {
      const hasRequired = intf.id && intf.name && intf.type && intf.direction;
      const hasDetails = intf.busType && intf.dataWidth && intf.protocol;
      
      if (hasRequired && hasDetails) {
        completeInterfaces++;
      }
    }
    
    if (component.interfaces.length > 0) {
      points += Math.round((completeInterfaces / component.interfaces.length) * 10);
      
      if (completeInterfaces < component.interfaces.length) {
        issues.push(`${component.interfaces.length - completeInterfaces} interface(s) missing details`);
      }
    }

    // Check interface validity (5 points)
    const validDirections = ['master', 'slave', 'in', 'out'];
    const invalidInterfaces = component.interfaces.filter(i => !validDirections.includes(i.direction));
    
    if (invalidInterfaces.length === 0) {
      points += 5;
    } else {
      issues.push(`${invalidInterfaces.length} interface(s) have invalid direction`);
    }

    // Check category-specific interface requirements
    const categoryCheck = this.checkCategoryInterfaceRequirements(component);
    if (!categoryCheck.valid) {
      issues.push(categoryCheck.issue!);
      points = Math.max(0, points - 5);
    }

    return { points, issues };
  }

  /**
   * Check category-specific interface requirements
   */
  private checkCategoryInterfaceRequirements(component: ArchitecturalComponent): { valid: boolean; issue?: string } {
    const masterCount = component.interfaces.filter(i => i.direction === 'master').length;
    const slaveCount = component.interfaces.filter(i => i.direction === 'slave').length;

    switch (component.category) {
      case 'CPU':
        if (masterCount < 1) {
          return { valid: false, issue: 'CPU must have at least 1 master interface' };
        }
        break;

      case 'Memory':
        if (slaveCount < 1) {
          return { valid: false, issue: 'Memory must have at least 1 slave interface' };
        }
        break;

      case 'Interconnect':
        if (masterCount < 1 || slaveCount < 1) {
          return { valid: false, issue: 'Interconnect must have both master and slave interfaces' };
        }
        break;
    }

    return { valid: true };
  }

  /**
   * Check completeness (20 points)
   */
  private checkCompleteness(component: ArchitecturalComponent): { points: number; issues: string[] } {
    let points = 0;
    const issues: string[] = [];

    // Required fields (10 points)
    const requiredFields: (keyof ArchitecturalComponent)[] = ['name', 'category', 'type', 'description', 'version'];
    const missingFields = requiredFields.filter(field => !component[field] || component[field] === '');
    
    if (missingFields.length === 0) {
      points += 10;
    } else {
      points += Math.max(0, 10 - missingFields.length * 2);
      issues.push(`Missing fields: ${missingFields.join(', ')}`);
    }

    // Visualization (5 points)
    if (component.visualization?.icon) {
      points += 5;
    } else {
      issues.push('Missing icon');
    }

    // Properties (5 points)
    if (component.properties && Object.keys(component.properties).length > 0) {
      points += 5;
    } else {
      issues.push('Missing properties');
    }

    return { points, issues };
  }

  /**
   * Check naming convention (15 points)
   */
  private checkNaming(component: ArchitecturalComponent): { points: number; issues: string[] } {
    let points = 0;
    const issues: string[] = [];

    // Name length (5 points)
    if (component.name.length >= 5 && component.name.length <= 50) {
      points += 5;
    } else {
      issues.push(`Name length should be 5-50 characters (current: ${component.name.length})`);
    }

    // No generic names (5 points)
    const genericNames = ['component', 'module', 'block', 'unit', 'test', 'custom', 'new'];
    const lowerName = component.name.toLowerCase();
    const isGeneric = genericNames.some(g => lowerName === g || lowerName.startsWith(g + ' '));
    
    if (!isGeneric) {
      points += 5;
    } else {
      issues.push('Name is too generic');
    }

    // Descriptive (5 points)
    if (component.description && component.description.length >= 20) {
      points += 5;
    } else {
      issues.push(`Description too short (minimum 20 characters)`);
    }

    return { points, issues };
  }

  /**
   * Check uniqueness / deduplication (10 points)
   */
  private async checkUniqueness(component: ArchitecturalComponent): Promise<{ 
    points: number; 
    issues: string[];
    similarComponents: ArchitecturalComponent[];
  }> {
    let points = 10;
    const issues: string[] = [];

    try {
      // Search for similar components
      const similar = await this.findSimilarComponents(component);

      if (similar.length === 0) {
        // Completely unique
        points = 10;
      } else if (similar.length <= 2) {
        // Few similar components
        points = 7;
        issues.push(`${similar.length} similar component(s) found`);
      } else {
        // Many similar components - likely duplicate
        points = 3;
        issues.push(`Possible duplicate: ${similar.length} similar components exist`);
      }

      return { points, issues, similarComponents: similar };
    } catch (error) {
      // If search fails, give benefit of doubt
      return { points: 8, issues: ['Could not check for duplicates'], similarComponents: [] };
    }
  }

  /**
   * Find similar components in library
   */
  private async findSimilarComponents(component: ArchitecturalComponent): Promise<ArchitecturalComponent[]> {
    // Search by name tokens
    const nameTokens = component.name.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    
    if (nameTokens.length === 0) {
      return [];
    }

    const matches = await this.componentLibrary.searchComponents(nameTokens);

    // Filter by category and calculate similarity
    const similar = matches
      .filter(match => {
        // Same category
        if (match.component.category !== component.category) return false;

        // Don't compare with self
        if (match.component.id === component.id) return false;

        // Calculate similarity
        const similarity = this.calculateSimilarity(component, match.component);
        return similarity > 0.7; // 70% similar
      })
      .map(m => m.component);

    return similar;
  }

  /**
   * Calculate similarity between two components
   */
  private calculateSimilarity(comp1: ArchitecturalComponent, comp2: ArchitecturalComponent): number {
    let score = 0;
    let checks = 0;

    // Name similarity
    const nameSim = this.stringSimilarity(comp1.name.toLowerCase(), comp2.name.toLowerCase());
    score += nameSim;
    checks++;

    // Category match
    if (comp1.category === comp2.category) {
      score += 1;
    }
    checks++;

    // Interface count similarity
    const maxInterfaces = Math.max(comp1.interfaces.length, comp2.interfaces.length);
    const minInterfaces = Math.min(comp1.interfaces.length, comp2.interfaces.length);
    if (maxInterfaces > 0) {
      score += minInterfaces / maxInterfaces;
      checks++;
    }

    return score / checks;
  }

  /**
   * Calculate string similarity (simple Jaccard similarity)
   */
  private stringSimilarity(str1: string, str2: string): number {
    const tokens1 = new Set(str1.split(/\s+/));
    const tokens2 = new Set(str2.split(/\s+/));

    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }
}
