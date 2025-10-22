import { 
  DesignSession,
  NaturalLanguageSpec,
  ComponentDescription,
  ArchitecturalComponent,
  ArchitectureDefinition,
  ComponentRationale,
  DesignDecision
} from '../../types/index';

export interface SpecificationOptions {
  includeComponentDetails?: boolean;
  includePerformanceMetrics?: boolean;
  includeDesignRationale?: boolean;
  includeAlternatives?: boolean;
  format?: 'markdown' | 'json' | 'html';
}

export class SpecificationGenerator {
  
  /**
   * Generate natural language specification from conversation session
   */
  generateSpecification(
    session: DesignSession,
    options: SpecificationOptions = {}
  ): NaturalLanguageSpec {
    
    const defaultOptions: SpecificationOptions = {
      includeComponentDetails: true,
      includePerformanceMetrics: true,
      includeDesignRationale: true,
      includeAlternatives: false,
      format: 'markdown'
    };
    
    const opts = { ...defaultOptions, ...options };
    
    // Extract information from conversation
    const conversationAnalysis = this.analyzeConversation(session);
    
    // Generate specification sections
    const spec: NaturalLanguageSpec = {
      title: this.generateTitle(session, conversationAnalysis),
      overview: this.generateOverview(session, conversationAnalysis),
      requirements: this.extractRequirements(session, conversationAnalysis),
      architecture: this.generateArchitectureDescription(session, opts),
      components: this.generateComponentDescriptions(session, opts),
      constraints: this.extractConstraints(session, conversationAnalysis),
      designRationale: opts.includeDesignRationale ? 
        this.generateDesignRationale(session) : [],
      generatedAt: new Date(),
      version: '1.0.0',
      projectId: session.sessionId
    };
    
    return spec;
  }

  /**
   * Generate markdown specification document
   */
  generateMarkdownSpecification(
    session: DesignSession,
    options: SpecificationOptions = {}
  ): string {
    const spec = this.generateSpecification(session, options);
    
    let markdown = `# ${spec.title}\n\n`;
    
    // Overview section
    markdown += `## Overview\n\n${spec.overview}\n\n`;
    
    // Requirements section
    if (spec.requirements.length > 0) {
      markdown += `## Requirements\n\n`;
      spec.requirements.forEach((req, index) => {
        markdown += `${index + 1}. ${req}\n`;
      });
      markdown += '\n';
    }
    
    // Architecture section
    markdown += `## Architecture\n\n${spec.architecture}\n\n`;
    
    // Components section
    if (spec.components.length > 0) {
      markdown += `## Components\n\n`;
      spec.components.forEach(component => {
        markdown += `### ${component.name}\n\n`;
        markdown += `**Type:** ${component.type}\n\n`;
        markdown += `**Purpose:** ${component.purpose}\n\n`;
        
        if (component.specifications.length > 0) {
          markdown += `**Specifications:**\n`;
          component.specifications.forEach(spec => {
            markdown += `- ${spec}\n`;
          });
          markdown += '\n';
        }
        
        if (component.connections.length > 0) {
          markdown += `**Connections:**\n`;
          component.connections.forEach(conn => {
            markdown += `- ${conn}\n`;
          });
          markdown += '\n';
        }
        
        markdown += `**Rationale:** ${component.rationale}\n\n`;
      });
    }
    
    // Constraints section
    if (spec.constraints.length > 0) {
      markdown += `## Constraints\n\n`;
      spec.constraints.forEach((constraint, index) => {
        markdown += `${index + 1}. ${constraint}\n`;
      });
      markdown += '\n';
    }
    
    // Design Rationale section
    if (spec.designRationale.length > 0) {
      markdown += `## Design Rationale\n\n`;
      spec.designRationale.forEach((rationale, index) => {
        markdown += `${index + 1}. ${rationale}\n`;
      });
      markdown += '\n';
    }
    
    // Metadata
    markdown += `---\n\n`;
    markdown += `*Generated on ${spec.generatedAt.toISOString()}*\n`;
    markdown += `*Version: ${spec.version}*\n`;
    markdown += `*Project ID: ${spec.projectId}*\n`;
    
    return markdown;
  }

  /**
   * Analyze conversation to extract key information
   */
  private analyzeConversation(session: DesignSession): ConversationAnalysis {
    const analysis: ConversationAnalysis = {
      userIntents: [],
      mentionedComponents: [],
      performanceRequirements: [],
      powerRequirements: [],
      applicationDomain: '',
      technicalConstraints: [],
      designGoals: []
    };
    
    const conversationText = session.conversationHistory
      .map(msg => msg.content)
      .join(' ')
      .toLowerCase();
    
    // Extract application domain
    if (conversationText.includes('iot') || conversationText.includes('internet of things')) {
      analysis.applicationDomain = 'IoT';
    } else if (conversationText.includes('ai') || conversationText.includes('machine learning')) {
      analysis.applicationDomain = 'AI/ML';
    } else if (conversationText.includes('mobile') || conversationText.includes('smartphone')) {
      analysis.applicationDomain = 'Mobile';
    } else if (conversationText.includes('automotive')) {
      analysis.applicationDomain = 'Automotive';
    } else if (conversationText.includes('server') || conversationText.includes('datacenter')) {
      analysis.applicationDomain = 'Server/Datacenter';
    } else {
      analysis.applicationDomain = 'General Purpose';
    }
    
    // Extract performance requirements
    const performanceKeywords = [
      'high performance', 'fast', 'speed', 'throughput', 'bandwidth',
      'low latency', 'real-time', 'processing power'
    ];
    
    performanceKeywords.forEach(keyword => {
      if (conversationText.includes(keyword)) {
        analysis.performanceRequirements.push(keyword);
      }
    });
    
    // Extract power requirements
    const powerKeywords = [
      'low power', 'battery', 'efficient', 'power consumption',
      'energy efficient', 'green', 'sustainable'
    ];
    
    powerKeywords.forEach(keyword => {
      if (conversationText.includes(keyword)) {
        analysis.powerRequirements.push(keyword);
      }
    });
    
    // Extract mentioned components
    const componentKeywords = [
      'cpu', 'processor', 'memory', 'ram', 'storage', 'gpu',
      'accelerator', 'wifi', 'bluetooth', 'ethernet', 'usb'
    ];
    
    componentKeywords.forEach(keyword => {
      if (conversationText.includes(keyword)) {
        analysis.mentionedComponents.push(keyword);
      }
    });
    
    return analysis;
  }

  /**
   * Generate specification title
   */
  private generateTitle(session: DesignSession, analysis: ConversationAnalysis): string {
    const domain = analysis.applicationDomain;
    const baseTitle = `${domain} System-on-Chip Specification`;
    
    // Add specific characteristics if mentioned
    if (analysis.performanceRequirements.includes('high performance')) {
      return `High-Performance ${baseTitle}`;
    } else if (analysis.powerRequirements.includes('low power')) {
      return `Low-Power ${baseTitle}`;
    }
    
    return baseTitle;
  }

  /**
   * Generate overview section
   */
  private generateOverview(session: DesignSession, analysis: ConversationAnalysis): string {
    const domain = analysis.applicationDomain;
    let overview = `This specification defines a custom System-on-Chip (SoC) design optimized for ${domain} applications. `;
    
    if (analysis.performanceRequirements.length > 0) {
      overview += `The design prioritizes ${analysis.performanceRequirements.join(', ')} to meet demanding performance requirements. `;
    }
    
    if (analysis.powerRequirements.length > 0) {
      overview += `Power efficiency is a key consideration, with emphasis on ${analysis.powerRequirements.join(', ')}. `;
    }
    
    if (session.currentArchitecture?.selectedComponents.length) {
      overview += `The architecture incorporates ${session.currentArchitecture.selectedComponents.length} carefully selected components to achieve the desired functionality and performance characteristics.`;
    }
    
    return overview;
  }

  /**
   * Extract requirements from conversation
   */
  private extractRequirements(session: DesignSession, analysis: ConversationAnalysis): string[] {
    const requirements: string[] = [];
    
    // Add application-specific requirements
    if (analysis.applicationDomain === 'IoT') {
      requirements.push('Low power consumption for battery operation');
      requirements.push('Wireless connectivity (WiFi, Bluetooth)');
      requirements.push('Small form factor');
    } else if (analysis.applicationDomain === 'AI/ML') {
      requirements.push('High computational performance for neural networks');
      requirements.push('Dedicated AI acceleration capabilities');
      requirements.push('High memory bandwidth');
    } else if (analysis.applicationDomain === 'Mobile') {
      requirements.push('Power efficiency for mobile battery life');
      requirements.push('Integrated graphics capabilities');
      requirements.push('Multiple connectivity options');
    }
    
    // Add performance requirements
    analysis.performanceRequirements.forEach(req => {
      requirements.push(`System must support ${req}`);
    });
    
    // Add power requirements
    analysis.powerRequirements.forEach(req => {
      requirements.push(`Design must achieve ${req}`);
    });
    
    // Add requirements from session
    if (session.requirements) {
      requirements.push(...session.requirements);
    }
    
    return [...new Set(requirements)]; // Remove duplicates
  }

  /**
   * Generate architecture description
   */
  private generateArchitectureDescription(
    session: DesignSession,
    options: SpecificationOptions
  ): string {
    if (!session.currentArchitecture?.selectedComponents.length) {
      return 'Architecture details will be defined based on the selected components and their interconnections.';
    }
    
    const components = session.currentArchitecture.selectedComponents;
    const categories = this.categorizeComponents(components);
    
    let description = 'The SoC architecture follows a modern hierarchical design with the following key subsystems:\n\n';
    
    // Describe each category
    Object.entries(categories).forEach(([category, comps]) => {
      if (comps.length > 0) {
        description += `**${category} Subsystem:** `;
        description += `Features ${comps.map(c => c.name).join(', ')}. `;
        
        // Add category-specific details
        if (category === 'CPU') {
          description += 'Provides the main processing capabilities with optimized instruction sets and cache hierarchies. ';
        } else if (category === 'Memory') {
          description += 'Delivers high-bandwidth memory access with optimized latency characteristics. ';
        } else if (category === 'IO') {
          description += 'Enables comprehensive connectivity and peripheral interfaces. ';
        } else if (category === 'Accelerator') {
          description += 'Provides specialized processing acceleration for targeted workloads. ';
        }
        
        description += '\n\n';
      }
    });
    
    description += 'All subsystems are interconnected through a high-performance on-chip network that ensures efficient data flow and minimal latency between components.';
    
    return description;
  }

  /**
   * Generate component descriptions
   */
  private generateComponentDescriptions(
    session: DesignSession,
    options: SpecificationOptions
  ): ComponentDescription[] {
    
    if (!session.currentArchitecture?.selectedComponents.length) {
      return [];
    }
    
    const components = session.currentArchitecture.selectedComponents;
    const rationales = session.currentArchitecture.componentRationale || [];
    
    return components.map(component => {
      const rationale = rationales.find(r => r.componentId === component.id);
      
      return {
        name: component.name,
        type: component.type,
        purpose: this.generateComponentPurpose(component),
        specifications: this.extractComponentSpecifications(component, options),
        connections: this.generateComponentConnections(component),
        rationale: rationale?.reason || this.generateDefaultRationale(component)
      };
    });
  }

  /**
   * Generate component purpose description
   */
  private generateComponentPurpose(component: ArchitecturalComponent): string {
    const categoryPurposes = {
      'CPU': 'Provides main processing capabilities and system control',
      'Memory': 'Stores data and instructions with high-speed access',
      'IO': 'Enables external connectivity and peripheral interfaces',
      'Interconnect': 'Facilitates high-speed communication between components',
      'Accelerator': 'Delivers specialized processing for specific workloads',
      'Custom': 'Provides custom functionality tailored to specific requirements'
    };
    
    return categoryPurposes[component.category] || 'Provides specialized functionality';
  }

  /**
   * Extract component specifications
   */
  private extractComponentSpecifications(
    component: ArchitecturalComponent,
    options: SpecificationOptions
  ): string[] {
    const specs: string[] = [];
    
    if (options.includePerformanceMetrics && component.properties.performance) {
      const perf = component.properties.performance;
      if (perf.clockFrequency) specs.push(`Clock Frequency: ${perf.clockFrequency}`);
      if (perf.bandwidth) specs.push(`Bandwidth: ${perf.bandwidth}`);
      if (perf.throughput) specs.push(`Throughput: ${perf.throughput}`);
      if (perf.latency) specs.push(`Latency: ${perf.latency}`);
    }
    
    if (component.properties.power) {
      const power = component.properties.power;
      if (power.typical) specs.push(`Power Consumption: ${power.typical}`);
      if (power.voltage) specs.push(`Operating Voltage: ${power.voltage}`);
    }
    
    if (component.properties.physical) {
      const physical = component.properties.physical;
      if (physical.technology) specs.push(`Process Technology: ${physical.technology}`);
      if (physical.area) specs.push(`Die Area: ${physical.area}`);
    }
    
    if (component.interfaces.length > 0) {
      specs.push(`Interfaces: ${component.interfaces.map(i => i.name).join(', ')}`);
    }
    
    return specs;
  }

  /**
   * Generate component connections
   */
  private generateComponentConnections(component: ArchitecturalComponent): string[] {
    const connections: string[] = [];
    
    component.interfaces.forEach(iface => {
      if (iface.direction === 'output') {
        connections.push(`Outputs via ${iface.name} (${iface.type})`);
      } else if (iface.direction === 'input') {
        connections.push(`Receives input via ${iface.name} (${iface.type})`);
      } else {
        connections.push(`Bidirectional connection via ${iface.name} (${iface.type})`);
      }
    });
    
    return connections;
  }

  /**
   * Generate default rationale for component selection
   */
  private generateDefaultRationale(component: ArchitecturalComponent): string {
    const categoryRationales = {
      'CPU': 'Selected for its processing capabilities and instruction set compatibility',
      'Memory': 'Chosen for optimal capacity, bandwidth, and latency characteristics',
      'IO': 'Provides necessary connectivity and interface requirements',
      'Interconnect': 'Ensures efficient data flow between system components',
      'Accelerator': 'Delivers specialized performance for targeted workloads',
      'Custom': 'Addresses specific functional requirements not met by standard components'
    };
    
    return categoryRationales[component.category] || 'Selected based on system requirements';
  }

  /**
   * Extract constraints from conversation
   */
  private extractConstraints(session: DesignSession, analysis: ConversationAnalysis): string[] {
    const constraints: string[] = [];
    
    // Add constraints from session
    if (session.constraints) {
      constraints.push(...session.constraints);
    }
    
    // Add inferred constraints
    if (analysis.powerRequirements.includes('low power')) {
      constraints.push('Total system power consumption must not exceed battery capacity requirements');
    }
    
    if (analysis.applicationDomain === 'Mobile') {
      constraints.push('Form factor must be suitable for mobile device integration');
    }
    
    if (analysis.applicationDomain === 'Automotive') {
      constraints.push('Components must meet automotive temperature and reliability standards');
    }
    
    return constraints;
  }

  /**
   * Generate design rationale
   */
  private generateDesignRationale(session: DesignSession): string[] {
    const rationale: string[] = [];
    
    if (session.currentArchitecture?.designDecisions) {
      session.currentArchitecture.designDecisions.forEach(decision => {
        rationale.push(`${decision.decision}: ${decision.rationale}`);
      });
    }
    
    // Add general rationale based on conversation
    const conversationText = session.conversationHistory
      .map(msg => msg.content)
      .join(' ')
      .toLowerCase();
    
    if (conversationText.includes('performance')) {
      rationale.push('Performance optimization was prioritized based on application requirements');
    }
    
    if (conversationText.includes('power') || conversationText.includes('battery')) {
      rationale.push('Power efficiency considerations influenced component selection and architecture decisions');
    }
    
    if (conversationText.includes('cost') || conversationText.includes('budget')) {
      rationale.push('Cost optimization was balanced with performance and functionality requirements');
    }
    
    return rationale;
  }

  /**
   * Categorize components by type
   */
  private categorizeComponents(components: ArchitecturalComponent[]): Record<string, ArchitecturalComponent[]> {
    const categories: Record<string, ArchitecturalComponent[]> = {
      CPU: [],
      Memory: [],
      IO: [],
      Interconnect: [],
      Accelerator: [],
      Custom: []
    };
    
    components.forEach(component => {
      if (categories[component.category]) {
        categories[component.category].push(component);
      }
    });
    
    return categories;
  }

  /**
   * Validate specification completeness
   */
  validateSpecification(spec: NaturalLanguageSpec): ValidationResult {
    const issues: string[] = [];
    const warnings: string[] = [];
    
    // Check required sections
    if (!spec.title || spec.title.trim().length === 0) {
      issues.push('Specification title is missing');
    }
    
    if (!spec.overview || spec.overview.trim().length === 0) {
      issues.push('Overview section is missing');
    }
    
    if (spec.requirements.length === 0) {
      warnings.push('No requirements specified');
    }
    
    if (spec.components.length === 0) {
      warnings.push('No components defined');
    }
    
    // Check component completeness
    spec.components.forEach((component, index) => {
      if (!component.name) {
        issues.push(`Component ${index + 1} is missing a name`);
      }
      
      if (!component.purpose) {
        warnings.push(`Component ${component.name || index + 1} is missing purpose description`);
      }
      
      if (component.specifications.length === 0) {
        warnings.push(`Component ${component.name || index + 1} has no specifications`);
      }
    });
    
    return {
      valid: issues.length === 0,
      issues,
      warnings,
      completeness: this.calculateCompleteness(spec)
    };
  }

  /**
   * Calculate specification completeness score
   */
  private calculateCompleteness(spec: NaturalLanguageSpec): number {
    let score = 0;
    let maxScore = 0;
    
    // Title (10 points)
    maxScore += 10;
    if (spec.title && spec.title.trim().length > 0) score += 10;
    
    // Overview (15 points)
    maxScore += 15;
    if (spec.overview && spec.overview.trim().length > 50) score += 15;
    else if (spec.overview && spec.overview.trim().length > 0) score += 8;
    
    // Requirements (20 points)
    maxScore += 20;
    if (spec.requirements.length >= 5) score += 20;
    else if (spec.requirements.length >= 3) score += 15;
    else if (spec.requirements.length > 0) score += 10;
    
    // Architecture (20 points)
    maxScore += 20;
    if (spec.architecture && spec.architecture.trim().length > 100) score += 20;
    else if (spec.architecture && spec.architecture.trim().length > 0) score += 10;
    
    // Components (25 points)
    maxScore += 25;
    if (spec.components.length >= 3) score += 25;
    else if (spec.components.length >= 2) score += 18;
    else if (spec.components.length > 0) score += 10;
    
    // Design Rationale (10 points)
    maxScore += 10;
    if (spec.designRationale.length >= 3) score += 10;
    else if (spec.designRationale.length > 0) score += 5;
    
    return Math.round((score / maxScore) * 100);
  }
}

interface ConversationAnalysis {
  userIntents: string[];
  mentionedComponents: string[];
  performanceRequirements: string[];
  powerRequirements: string[];
  applicationDomain: string;
  technicalConstraints: string[];
  designGoals: string[];
}

interface ValidationResult {
  valid: boolean;
  issues: string[];
  warnings: string[];
  completeness: number;
}