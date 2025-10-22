import { 
  ArchitecturalComponent, 
  ArchitecturalProperties,
  InterfaceDefinition,
  ComponentCategory 
} from '../../types/index';
import { ComponentLibraryManager } from './component-library-manager';

export interface CustomizationRequest {
  componentId: string;
  naturalLanguageRequest: string;
  context?: {
    targetApplication?: string;
    performanceRequirements?: string[];
    powerConstraints?: string[];
    budgetConstraints?: string[];
  };
}

export interface CustomizationResult {
  originalComponent: ArchitecturalComponent;
  customizedComponent: ArchitecturalComponent;
  modifications: ComponentModification[];
  rationale: string;
  confidence: number;
  alternatives?: ArchitecturalComponent[];
}

export interface ComponentModification {
  property: string;
  originalValue: any;
  newValue: any;
  reason: string;
  impact: string;
}

export class ComponentCustomizationService {
  private componentLibrary: ComponentLibraryManager;
  
  // Natural language to property mappings
  private propertyMappings = {
    // Performance mappings
    'faster': ['performance.clockFrequency', 'performance.bandwidth', 'performance.throughput'],
    'slower': ['performance.clockFrequency', 'performance.bandwidth', 'performance.throughput'],
    'higher performance': ['performance.clockFrequency', 'performance.bandwidth'],
    'more bandwidth': ['performance.bandwidth'],
    'lower latency': ['performance.latency'],
    'higher throughput': ['performance.throughput'],
    
    // Power mappings
    'lower power': ['power.typical', 'power.peak'],
    'more efficient': ['power.typical', 'power.idle'],
    'battery friendly': ['power.typical', 'power.idle'],
    'high power': ['power.typical', 'power.peak'],
    
    // Memory mappings
    'more memory': ['properties.capacity', 'properties.size'],
    'larger': ['properties.capacity', 'properties.size', 'physical.area'],
    'smaller': ['properties.capacity', 'properties.size', 'physical.area'],
    
    // Interface mappings
    'more interfaces': ['interfaces'],
    'additional ports': ['interfaces'],
    'more connectivity': ['interfaces'],
    
    // Technology mappings
    'newer technology': ['physical.technology'],
    'advanced process': ['physical.technology'],
    'smaller process': ['physical.technology']
  };

  // Value modification rules
  private modificationRules = {
    'faster': { multiplier: 1.5, direction: 'increase' },
    'slower': { multiplier: 0.7, direction: 'decrease' },
    'higher performance': { multiplier: 1.8, direction: 'increase' },
    'more bandwidth': { multiplier: 2.0, direction: 'increase' },
    'lower latency': { multiplier: 0.5, direction: 'decrease' },
    'higher throughput': { multiplier: 1.6, direction: 'increase' },
    'lower power': { multiplier: 0.6, direction: 'decrease' },
    'more efficient': { multiplier: 0.8, direction: 'decrease' },
    'battery friendly': { multiplier: 0.5, direction: 'decrease' },
    'high power': { multiplier: 1.5, direction: 'increase' },
    'more memory': { multiplier: 2.0, direction: 'increase' },
    'larger': { multiplier: 1.5, direction: 'increase' },
    'smaller': { multiplier: 0.7, direction: 'decrease' }
  };

  constructor() {
    this.componentLibrary = new ComponentLibraryManager();
  }

  /**
   * Process natural language customization request
   */
  async customizeComponent(request: CustomizationRequest): Promise<CustomizationResult> {
    const originalComponent = this.componentLibrary.getComponentById(request.componentId);
    
    if (!originalComponent) {
      throw new Error(`Component ${request.componentId} not found`);
    }

    // Parse natural language request
    const parsedRequest = this.parseNaturalLanguageRequest(request.naturalLanguageRequest);
    
    // Apply modifications
    const { customizedComponent, modifications } = this.applyModifications(
      originalComponent, 
      parsedRequest,
      request.context
    );

    // Generate rationale
    const rationale = this.generateRationale(modifications, request.naturalLanguageRequest);
    
    // Calculate confidence based on how well we understood the request
    const confidence = this.calculateConfidence(parsedRequest, modifications);
    
    // Find alternatives
    const alternatives = await this.findAlternatives(customizedComponent, request.context);

    return {
      originalComponent,
      customizedComponent,
      modifications,
      rationale,
      confidence,
      alternatives
    };
  }

  /**
   * Parse natural language request into actionable modifications
   */
  private parseNaturalLanguageRequest(request: string): ParsedRequest {
    const lowerRequest = request.toLowerCase();
    const parsedRequest: ParsedRequest = {
      intents: [],
      properties: [],
      values: [],
      modifiers: []
    };

    // Extract intents and properties
    Object.entries(this.propertyMappings).forEach(([intent, properties]) => {
      if (lowerRequest.includes(intent)) {
        parsedRequest.intents.push(intent);
        parsedRequest.properties.push(...properties);
      }
    });

    // Extract numeric values
    const numberMatches = lowerRequest.match(/\d+(\.\d+)?/g);
    if (numberMatches) {
      parsedRequest.values = numberMatches.map(match => parseFloat(match));
    }

    // Extract units
    const unitMatches = lowerRequest.match(/\b(mhz|ghz|mb|gb|tb|mw|w|kw|nm|mm|v)\b/gi);
    if (unitMatches) {
      parsedRequest.modifiers.push(...unitMatches);
    }

    // Extract percentage changes
    const percentMatches = lowerRequest.match(/(\d+)%/g);
    if (percentMatches) {
      parsedRequest.percentages = percentMatches.map(match => 
        parseInt(match.replace('%', '')) / 100
      );
    }

    return parsedRequest;
  }

  /**
   * Apply modifications to component based on parsed request
   */
  private applyModifications(
    component: ArchitecturalComponent,
    parsedRequest: ParsedRequest,
    context?: CustomizationRequest['context']
  ): { customizedComponent: ArchitecturalComponent; modifications: ComponentModification[] } {
    
    const customizedComponent = JSON.parse(JSON.stringify(component)); // Deep clone
    const modifications: ComponentModification[] = [];

    // Apply each intent
    parsedRequest.intents.forEach(intent => {
      const rule = this.modificationRules[intent as keyof typeof this.modificationRules];
      if (!rule) return;

      const properties = this.propertyMappings[intent as keyof typeof this.propertyMappings];
      
      properties.forEach(propertyPath => {
        const modification = this.modifyProperty(
          customizedComponent,
          propertyPath,
          rule,
          parsedRequest,
          intent
        );
        
        if (modification) {
          modifications.push(modification);
        }
      });
    });

    // Apply context-based modifications
    if (context) {
      const contextModifications = this.applyContextualModifications(
        customizedComponent,
        context
      );
      modifications.push(...contextModifications);
    }

    // Update component metadata
    customizedComponent.id = `${component.id}-custom-${Date.now()}`;
    customizedComponent.name = `${component.name} (Customized)`;
    customizedComponent.customizable = true;
    customizedComponent.baseTemplate = component.id;

    return { customizedComponent, modifications };
  }

  /**
   * Modify a specific property of the component
   */
  private modifyProperty(
    component: ArchitecturalComponent,
    propertyPath: string,
    rule: any,
    parsedRequest: ParsedRequest,
    intent: string
  ): ComponentModification | null {
    
    const pathParts = propertyPath.split('.');
    let current: any = component;
    
    // Navigate to the property
    for (let i = 0; i < pathParts.length - 1; i++) {
      if (!current[pathParts[i]]) {
        current[pathParts[i]] = {};
      }
      current = current[pathParts[i]];
    }
    
    const finalProperty = pathParts[pathParts.length - 1];
    const originalValue = current[finalProperty];
    
    if (!originalValue) return null;

    let newValue: any;
    
    // Handle different value types
    if (typeof originalValue === 'string') {
      newValue = this.modifyStringValue(originalValue, rule, parsedRequest);
    } else if (typeof originalValue === 'number') {
      newValue = this.modifyNumericValue(originalValue, rule, parsedRequest);
    } else if (Array.isArray(originalValue)) {
      newValue = this.modifyArrayValue(originalValue, rule, parsedRequest, intent);
    } else {
      return null; // Can't modify this type
    }

    if (newValue !== null && newValue !== originalValue) {
      current[finalProperty] = newValue;
      
      return {
        property: propertyPath,
        originalValue,
        newValue,
        reason: `Applied "${intent}" modification`,
        impact: this.calculateImpact(propertyPath, originalValue, newValue)
      };
    }

    return null;
  }

  /**
   * Modify string values (e.g., "168 MHz" -> "252 MHz")
   */
  private modifyStringValue(value: string, rule: any, parsedRequest: ParsedRequest): string {
    // Extract numeric part and unit
    const match = value.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
    if (!match) return value;
    
    const [, numStr, unit] = match;
    const originalNum = parseFloat(numStr);
    
    // Use explicit value if provided
    if (parsedRequest.values && parsedRequest.values.length > 0) {
      return `${parsedRequest.values[0]} ${unit}`;
    }
    
    // Use percentage if provided
    if (parsedRequest.percentages && parsedRequest.percentages.length > 0) {
      const multiplier = rule.direction === 'increase' ? 
        (1 + parsedRequest.percentages[0]) : 
        (1 - parsedRequest.percentages[0]);
      return `${Math.round(originalNum * multiplier * 100) / 100} ${unit}`;
    }
    
    // Use rule multiplier
    const newNum = rule.direction === 'increase' ? 
      originalNum * rule.multiplier : 
      originalNum / rule.multiplier;
    
    return `${Math.round(newNum * 100) / 100} ${unit}`;
  }

  /**
   * Modify numeric values
   */
  private modifyNumericValue(value: number, rule: any, parsedRequest: ParsedRequest): number {
    // Use explicit value if provided
    if (parsedRequest.values && parsedRequest.values.length > 0) {
      return parsedRequest.values[0];
    }
    
    // Use percentage if provided
    if (parsedRequest.percentages && parsedRequest.percentages.length > 0) {
      const multiplier = rule.direction === 'increase' ? 
        (1 + parsedRequest.percentages[0]) : 
        (1 - parsedRequest.percentages[0]);
      return Math.round(value * multiplier * 100) / 100;
    }
    
    // Use rule multiplier
    return rule.direction === 'increase' ? 
      Math.round(value * rule.multiplier * 100) / 100 : 
      Math.round(value / rule.multiplier * 100) / 100;
  }

  /**
   * Modify array values (e.g., adding interfaces)
   */
  private modifyArrayValue(value: any[], rule: any, parsedRequest: ParsedRequest, intent: string): any[] {
    if (intent.includes('more interfaces') || intent.includes('additional ports')) {
      // Add common interfaces based on component category
      const newInterfaces = [...value];

      // Add USB interface if not present
      if (!newInterfaces.some(iface => iface.busType === 'USB')) {
        newInterfaces.push({
          id: `usb-${Date.now()}`,
          name: 'USB 3.2',
          busType: 'USB',
          direction: 'bidirectional',
          dataWidth: 32,
          speed: '10 Gbps',
          protocol: 'USB 3.2'
        });
      }
      
      return newInterfaces;
    }
    
    return value;
  }

  /**
   * Apply contextual modifications based on use case
   */
  private applyContextualModifications(
    component: ArchitecturalComponent,
    context: CustomizationRequest['context']
  ): ComponentModification[] {
    const modifications: ComponentModification[] = [];
    
    if (context?.targetApplication === 'IoT' && component.category === 'CPU') {
      // Optimize for IoT - reduce power consumption
      if (component.properties.power?.typical) {
        const originalPower = component.properties.power.typical;
        const newPower = this.modifyStringValue(originalPower, 
          { multiplier: 0.7, direction: 'decrease' }, 
          { intents: [], properties: [], values: [], modifiers: [] }
        );
        
        component.properties.power.typical = newPower;
        modifications.push({
          property: 'power.typical',
          originalValue: originalPower,
          newValue: newPower,
          reason: 'Optimized for IoT application',
          impact: 'Reduced power consumption for battery operation'
        });
      }
    }
    
    if (context?.targetApplication === 'AI/ML' && component.category === 'CPU') {
      // Optimize for AI - increase performance
      if (component.properties.performance?.clockFrequency) {
        const originalFreq = component.properties.performance.clockFrequency;
        const newFreq = this.modifyStringValue(originalFreq,
          { multiplier: 1.5, direction: 'increase' },
          { intents: [], properties: [], values: [], modifiers: [] }
        );
        
        component.properties.performance.clockFrequency = newFreq;
        modifications.push({
          property: 'performance.clockFrequency',
          originalValue: originalFreq,
          newValue: newFreq,
          reason: 'Optimized for AI/ML workloads',
          impact: 'Increased processing power for neural networks'
        });
      }
    }
    
    return modifications;
  }

  /**
   * Calculate impact description for a modification
   */
  private calculateImpact(propertyPath: string, originalValue: any, newValue: any): string {
    if (propertyPath.includes('power')) {
      const isIncrease = this.isValueIncrease(originalValue, newValue);
      return isIncrease ? 
        'Higher power consumption, may require better cooling' :
        'Lower power consumption, better for battery life';
    }
    
    if (propertyPath.includes('performance') || propertyPath.includes('frequency')) {
      const isIncrease = this.isValueIncrease(originalValue, newValue);
      return isIncrease ?
        'Better performance, may increase power consumption' :
        'Lower performance, reduced power consumption';
    }
    
    if (propertyPath.includes('memory') || propertyPath.includes('capacity')) {
      const isIncrease = this.isValueIncrease(originalValue, newValue);
      return isIncrease ?
        'More storage/memory capacity, higher cost' :
        'Less storage/memory capacity, lower cost';
    }
    
    return 'Property modified according to request';
  }

  /**
   * Check if a value represents an increase
   */
  private isValueIncrease(originalValue: any, newValue: any): boolean {
    if (typeof originalValue === 'number' && typeof newValue === 'number') {
      return newValue > originalValue;
    }
    
    if (typeof originalValue === 'string' && typeof newValue === 'string') {
      const origNum = parseFloat(originalValue);
      const newNum = parseFloat(newValue);
      return !isNaN(origNum) && !isNaN(newNum) && newNum > origNum;
    }
    
    return false;
  }

  /**
   * Generate rationale for the customization
   */
  private generateRationale(modifications: ComponentModification[], originalRequest: string): string {
    if (modifications.length === 0) {
      return `Unable to apply the requested modification: "${originalRequest}". The component may not support this type of customization.`;
    }
    
    const modificationSummary = modifications.map(mod => 
      `${mod.property}: ${mod.originalValue} → ${mod.newValue} (${mod.reason})`
    ).join('; ');
    
    return `Applied customizations based on "${originalRequest}": ${modificationSummary}. These changes should better meet your requirements while maintaining component compatibility.`;
  }

  /**
   * Calculate confidence in the customization
   */
  private calculateConfidence(parsedRequest: ParsedRequest, modifications: ComponentModification[]): number {
    let confidence = 0.5; // Base confidence
    
    // Increase confidence based on successful parsing
    if (parsedRequest.intents.length > 0) confidence += 0.2;
    if (parsedRequest.values.length > 0) confidence += 0.1;
    if (parsedRequest.percentages && parsedRequest.percentages.length > 0) confidence += 0.1;
    
    // Increase confidence based on successful modifications
    confidence += (modifications.length * 0.1);
    
    return Math.min(confidence, 1.0);
  }

  /**
   * Find alternative components that might better meet the requirements
   */
  private async findAlternatives(
    customizedComponent: ArchitecturalComponent,
    context?: CustomizationRequest['context']
  ): Promise<ArchitecturalComponent[]> {
    
    const searchTerms: string[] = [
      customizedComponent.category.toLowerCase(),
      customizedComponent.type.toLowerCase()
    ];
    
    if (context?.targetApplication) {
      searchTerms.push(context.targetApplication.toLowerCase());
    }
    
    const matches = await this.componentLibrary.searchComponents(searchTerms);
    
    return matches
      .filter(match => match.component.id !== customizedComponent.baseTemplate)
      .slice(0, 3)
      .map(match => match.component);
  }

  /**
   * Create a custom component from template
   */
  async createCustomComponent(
    templateId: string,
    customizations: Record<string, any>,
    metadata: {
      name: string;
      description?: string;
      rationale?: string;
    }
  ): Promise<ArchitecturalComponent> {
    
    const template = this.componentLibrary.getComponentById(templateId);
    if (!template) {
      throw new Error(`Template component ${templateId} not found`);
    }
    
    const customComponent = JSON.parse(JSON.stringify(template)); // Deep clone
    
    // Apply customizations
    Object.entries(customizations).forEach(([path, value]) => {
      this.setNestedProperty(customComponent, path, value);
    });
    
    // Update metadata
    customComponent.id = `custom-${Date.now()}`;
    customComponent.name = metadata.name;
    customComponent.description = metadata.description || `Custom ${template.name}`;
    customComponent.customizable = true;
    customComponent.baseTemplate = templateId;
    
    // Add custom tag
    if (!customComponent.tags.includes('custom')) {
      customComponent.tags.push('custom');
    }
    
    return customComponent;
  }

  /**
   * Set nested property using dot notation
   */
  private setNestedProperty(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
  }
}

interface ParsedRequest {
  intents: string[];
  properties: string[];
  values: number[];
  modifiers: string[];
  percentages?: number[];
}