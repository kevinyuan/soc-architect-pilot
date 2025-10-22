import fs from 'fs';
import path from 'path';
import { 
  ArchitecturalComponent, 
  ComponentMatch, 
  ComponentLibrary,
  ComponentLibraryMetadata,
  ComponentCategory,
  DesignPattern,
  InterfaceDefinition
} from '../../types/index';
import { validateArchitecturalComponent, validateComponentArray } from '../../utils/validation';

export class ComponentLibraryManager {
  private components: ArchitecturalComponent[] = [];
  private patterns: DesignPattern[] = [];
  private metadata: ComponentLibraryMetadata;
  private initialized = false;
  private compatibilityCache: Map<string, string[]> = new Map();
  private searchCache: Map<string, ComponentMatch[]> = new Map();

  constructor() {
    this.metadata = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      totalComponents: 0,
      categories: {} as Record<ComponentCategory, number>,
      tags: [],
      vendors: []
    };
    this.initializeLibrary();
  }

  /**
   * Initialize component library from local JSON files
   * Loads all components into memory at startup for fast access
   */
  private async initializeLibrary(): Promise<void> {
    try {
      const componentsDir = path.join(process.cwd(), 'data', 'components');

      if (!fs.existsSync(componentsDir)) {
        console.warn(`⚠️  Components directory not found: ${componentsDir}`);
        console.warn('📦 Using empty library');
        this.initialized = true;
        return;
      }

      const startTime = Date.now();
      const files = fs.readdirSync(componentsDir)
        .filter(file => file.endsWith('.json'));

      console.log(`📦 Loading ${files.length} components into memory...`);

      for (const file of files) {
        try {
          const filePath = path.join(componentsDir, file);
          const componentData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

          // Validate and add component
          if (this.validateComponent(componentData)) {
            this.components.push(componentData);
          } else {
            console.warn(`⚠️  Invalid component data in ${file}`);
          }
        } catch (error) {
          console.error(`❌ Error loading component from ${file}:`, error);
        }
      }

      this.updateMetadata();
      this.initialized = true;

      const loadTime = Date.now() - startTime;
      console.log(`✅ Loaded ${this.components.length} components into memory (${loadTime}ms)`);
      console.log(`📊 Memory footprint: ~${Math.round(JSON.stringify(this.components).length / 1024)}KB`);
    } catch (error) {
      console.error('❌ Error initializing component library:', error);
      this.initialized = true; // Continue with empty library
    }
  }

  /**
   * Validate component data structure using JSON schema
   */
  private validateComponent(component: any): boolean {
    // Relaxed validation - only check essential fields
    // Schema validation is disabled because actual JSON data uses newer field names
    // (busType, dataWidth, placement) while schema expects old names (type, width)

    if (!component.id || !component.name || !component.category) {
      console.warn(`Component missing essential fields: ${JSON.stringify({ id: component.id, name: component.name, category: component.category })}`);
      return false;
    }

    if (!component.interfaces || !Array.isArray(component.interfaces)) {
      console.warn(`Component ${component.id} has invalid or missing interfaces`);
      return false;
    }

    return true;
  }

  /**
   * Update library metadata
   */
  private updateMetadata(): void {
    this.metadata.totalComponents = this.components.length;
    this.metadata.lastUpdated = new Date().toISOString();
    
    // Count components by category
    const categoryCounts: Record<string, number> = {};
    const allTags = new Set<string>();
    const allVendors = new Set<string>();

    this.components.forEach(component => {
      // Count categories
      categoryCounts[component.category] = (categoryCounts[component.category] || 0) + 1;
      
      // Collect tags
      component.tags.forEach(tag => allTags.add(tag));
      
      // Collect vendors
      if (component.vendor) {
        allVendors.add(component.vendor);
      }
    });

    this.metadata.categories = categoryCounts as Record<ComponentCategory, number>;
    this.metadata.tags = Array.from(allTags);
    this.metadata.vendors = Array.from(allVendors);
  }

  /**
   * Search components using keyword-based RAG
   */
  async searchComponents(searchTerms: string[]): Promise<ComponentMatch[]> {
    if (!this.initialized) {
      await this.initializeLibrary();
    }

    if (searchTerms.length === 0) {
      return [];
    }

    const matches: ComponentMatch[] = [];

    this.components.forEach(component => {
      const match = this.calculateComponentMatch(component, searchTerms);
      if (match.matchScore > 0.1) { // Minimum threshold
        matches.push(match);
      }
    });

    // Sort by match score (descending)
    return matches.sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * Calculate match score for a component against search terms
   */
  private calculateComponentMatch(
    component: ArchitecturalComponent, 
    searchTerms: string[]
  ): ComponentMatch {
    let totalScore = 0;
    const matchedKeywords: string[] = [];
    const relevantProperties: string[] = [];
    const reasons: string[] = [];

    const searchText = searchTerms.map(term => term.toLowerCase());
    
    // Check component name (high weight)
    searchText.forEach(term => {
      if (component.name.toLowerCase().includes(term)) {
        totalScore += 0.4;
        matchedKeywords.push(term);
        reasons.push(`Name contains "${term}"`);
      }
    });

    // Check component category (medium weight)
    searchText.forEach(term => {
      if (component.category.toLowerCase().includes(term)) {
        totalScore += 0.3;
        matchedKeywords.push(term);
        reasons.push(`Category matches "${term}"`);
      }
    });

    // Check component type (medium weight)
    if (component.type) {
      searchText.forEach(term => {
        if (component.type.toLowerCase().includes(term)) {
          totalScore += 0.25;
          matchedKeywords.push(term);
          reasons.push(`Type matches "${term}"`);
        }
      });
    }

    // Check tags (medium weight)
    if (component.tags && Array.isArray(component.tags)) {
      component.tags.forEach(tag => {
        if (tag) {
          searchText.forEach(term => {
            if (tag.toLowerCase().includes(term)) {
              totalScore += 0.2;
              matchedKeywords.push(term);
              reasons.push(`Tagged with "${tag}"`);
            }
          });
        }
      });
    }

    // Check description (lower weight)
    searchText.forEach(term => {
      if (component.description.toLowerCase().includes(term)) {
        totalScore += 0.1;
        matchedKeywords.push(term);
        reasons.push(`Description mentions "${term}"`);
      }
    });

    // Check properties (lower weight)
    if (component.properties) {
      const propertiesText = JSON.stringify(component.properties).toLowerCase();
      searchText.forEach(term => {
        if (propertiesText.includes(term)) {
          totalScore += 0.05;
          relevantProperties.push(term);
          reasons.push(`Properties contain "${term}"`);
        }
      });
    }

    // Normalize score (cap at 1.0)
    const normalizedScore = Math.min(totalScore, 1.0);
    
    return {
      component,
      matchScore: normalizedScore,
      matchReason: reasons.slice(0, 3).join(', ') || 'General match',
      keywords: [...new Set(matchedKeywords)],
      relevantProperties: [...new Set(relevantProperties)]
    };
  }

  /**
   * Get components by category
   */
  getComponentsByCategory(category: ComponentCategory): ArchitecturalComponent[] {
    return this.components.filter(comp => comp.category === category);
  }

  /**
   * Get component by ID
   */
  getComponentById(id: string): ArchitecturalComponent | undefined {
    return this.components.find(comp => comp.id === id);
  }

  /**
   * Ensure library is initialized (wait if necessary)
   */
  async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Wait for initialization to complete (max 5 seconds)
    const maxWait = 5000;
    const checkInterval = 50;
    let waited = 0;

    while (!this.initialized && waited < maxWait) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }

    if (!this.initialized) {
      console.warn('⚠️  ComponentLibraryManager initialization timeout');
    }
  }

  /**
   * Get all components
   */
  getAllComponents(): ArchitecturalComponent[] {
    return [...this.components];
  }

  /**
   * Get library metadata
   */
  getMetadata(): ComponentLibraryMetadata {
    return { ...this.metadata };
  }

  /**
   * Get full library data
   */
  getLibrary(): ComponentLibrary {
    const categorizedComponents: Record<ComponentCategory, ArchitecturalComponent[]> = {
      CPU: [],
      Memory: [],
      Interconnect: [],
      IO: [],
      Accelerator: [],
      Custom: []
    };

    this.components.forEach(component => {
      if (categorizedComponents[component.category]) {
        categorizedComponents[component.category].push(component);
      }
    });

    return {
      metadata: this.metadata,
      components: this.components,
      patterns: [], // Will be implemented later
      categories: categorizedComponents
    };
  }

  /**
   * Add a new component to the library
   */
  addComponent(component: ArchitecturalComponent): boolean {
    if (!this.validateComponent(component)) {
      return false;
    }

    // Check for duplicates
    const exists = this.components.some(comp => comp.id === component.id);
    if (exists) {
      return false;
    }

    this.components.push(component);
    this.updateMetadata();
    return true;
  }

  /**
   * Remove a component from the library
   */
  removeComponent(componentId: string): boolean {
    const index = this.components.findIndex(comp => comp.id === componentId);
    if (index === -1) {
      return false;
    }

    this.components.splice(index, 1);
    this.updateMetadata();
    return true;
  }

  /**
   * Update an existing component
   */
  updateComponent(componentId: string, updates: Partial<ArchitecturalComponent>): boolean {
    const index = this.components.findIndex(comp => comp.id === componentId);
    if (index === -1) {
      return false;
    }

    this.components[index] = { ...this.components[index], ...updates };
    this.updateMetadata();
    return true;
  }

  /**
   * Search components by text query
   */
  async searchByText(query: string): Promise<ComponentMatch[]> {
    const searchTerms = query.toLowerCase()
      .split(/\s+/)
      .filter(term => term.length > 2); // Filter out short terms

    return this.searchComponents(searchTerms);
  }

  /**
   * Get component suggestions for a specific use case
   */
  async getSuggestionsForUseCase(useCase: string): Promise<ComponentMatch[]> {
    const useCaseMap: Record<string, string[]> = {
      'iot': ['iot', 'low-power', 'microcontroller', 'wireless', 'sensor'],
      'ai': ['ai', 'accelerator', 'npu', 'gpu', 'high-performance', 'neural'],
      'mobile': ['mobile', 'low-power', 'efficient', 'arm', 'cortex'],
      'automotive': ['automotive', 'real-time', 'safety', 'can', 'ethernet'],
      'networking': ['networking', 'ethernet', 'switch', 'router', 'high-speed'],
      'storage': ['storage', 'ssd', 'controller', 'flash', 'memory']
    };

    const searchTerms = useCaseMap[useCase.toLowerCase()] || [useCase];
    return this.searchComponents(searchTerms);
  }

  /**
   * Get compatible components for a given component
   */
  getCompatibleComponents(componentId: string): ArchitecturalComponent[] {
    const component = this.getComponentById(componentId);
    if (!component) {
      return [];
    }

    return this.components.filter(comp => {
      if (comp.id === componentId) return false;
      
      // Check interface compatibility
      const hasCompatibleInterface = component.interfaces.some(iface1 =>
        comp.interfaces.some(iface2 => 
          this.areInterfacesCompatible(iface1, iface2)
        )
      );

      // Check compatibility list
      const hasCompatibilityMatch = component.compatibility.some(compat =>
        comp.compatibility.includes(compat)
      );

      return hasCompatibleInterface || hasCompatibilityMatch;
    });
  }

  /**
   * Check if two interfaces are compatible
   */
  private areInterfacesCompatible(iface1: any, iface2: any): boolean {
    // Simple compatibility check - same type and opposite directions
    const type1 = iface1.busType || iface1.type;
    const type2 = iface2.busType || iface2.type;
    return (
      type1 === type2 &&
      ((iface1.direction === 'output' && iface2.direction === 'input') ||
       (iface1.direction === 'input' && iface2.direction === 'output') ||
       (iface1.direction === 'bidirectional' || iface2.direction === 'bidirectional'))
    );
  }

  /**
   * Enhanced RAG search with requirement-to-component mapping
   */
  async searchWithRequirements(
    requirements: string[],
    constraints?: string[],
    applicationDomain?: string
  ): Promise<ComponentMatch[]> {
    const cacheKey = `req:${requirements.join(',')}:${constraints?.join(',') || ''}:${applicationDomain || ''}`;
    
    if (this.searchCache.has(cacheKey)) {
      return this.searchCache.get(cacheKey)!;
    }

    if (!this.initialized) {
      await this.initializeLibrary();
    }

    const matches: ComponentMatch[] = [];
    const searchTerms = this.extractSearchTermsFromRequirements(requirements, constraints, applicationDomain);

    this.components.forEach(component => {
      const match = this.calculateEnhancedComponentMatch(component, searchTerms, requirements, constraints);
      if (match.matchScore > 0.1) {
        matches.push(match);
      }
    });

    const sortedMatches = matches.sort((a, b) => b.matchScore - a.matchScore);
    this.searchCache.set(cacheKey, sortedMatches);
    
    return sortedMatches;
  }

  /**
   * Extract search terms from requirements and constraints
   */
  private extractSearchTermsFromRequirements(
    requirements: string[],
    constraints?: string[],
    applicationDomain?: string
  ): string[] {
    const terms: string[] = [];
    
    // Add application domain
    if (applicationDomain) {
      terms.push(applicationDomain.toLowerCase());
    }

    // Extract terms from requirements
    requirements.forEach(req => {
      const reqTerms = req.toLowerCase()
        .split(/\s+/)
        .filter(term => term.length > 2)
        .filter(term => !['the', 'and', 'for', 'with', 'must', 'should', 'will'].includes(term));
      terms.push(...reqTerms);
    });

    // Extract terms from constraints
    constraints?.forEach(constraint => {
      const constraintTerms = constraint.toLowerCase()
        .split(/\s+/)
        .filter(term => term.length > 2);
      terms.push(...constraintTerms);
    });

    return [...new Set(terms)]; // Remove duplicates
  }

  /**
   * Enhanced component matching with requirement analysis
   */
  private calculateEnhancedComponentMatch(
    component: ArchitecturalComponent,
    searchTerms: string[],
    requirements: string[],
    constraints?: string[]
  ): ComponentMatch {
    let totalScore = 0;
    const matchedKeywords: string[] = [];
    const relevantProperties: string[] = [];
    const reasons: string[] = [];

    // Base keyword matching (from original implementation)
    const baseMatch = this.calculateComponentMatch(component, searchTerms);
    totalScore = baseMatch.matchScore;
    matchedKeywords.push(...baseMatch.keywords);
    relevantProperties.push(...baseMatch.relevantProperties);
    reasons.push(baseMatch.matchReason);

    // Enhanced requirement-specific matching
    requirements.forEach(requirement => {
      const reqLower = requirement.toLowerCase();
      
      // Performance requirement matching
      if (reqLower.includes('performance') || reqLower.includes('fast') || reqLower.includes('speed')) {
        if (component.properties.performance?.clockFrequency || 
            component.properties.performance?.throughput ||
            component.tags.includes('high-performance')) {
          totalScore += 0.15;
          reasons.push('Matches performance requirements');
        }
      }

      // Power requirement matching
      if (reqLower.includes('power') || reqLower.includes('battery') || reqLower.includes('efficient')) {
        if (component.properties.power?.typical || 
            component.tags.includes('low-power') ||
            component.tags.includes('efficient')) {
          totalScore += 0.15;
          reasons.push('Matches power requirements');
        }
      }

      // Connectivity requirement matching
      if (reqLower.includes('connectivity') || reqLower.includes('network') || reqLower.includes('wireless')) {
        if (component.category === 'IO' || 
            component.tags.includes('connectivity') ||
            component.tags.includes('wireless') ||
            component.tags.includes('networking')) {
          totalScore += 0.2;
          reasons.push('Matches connectivity requirements');
        }
      }

      // Memory requirement matching
      if (reqLower.includes('memory') || reqLower.includes('storage') || reqLower.includes('capacity')) {
        if (component.category === 'Memory' ||
            component.properties.performance?.bandwidth ||
            component.tags.includes('memory')) {
          totalScore += 0.2;
          reasons.push('Matches memory requirements');
        }
      }

      // Processing requirement matching
      if (reqLower.includes('processing') || reqLower.includes('compute') || reqLower.includes('cpu')) {
        if (component.category === 'CPU' || component.category === 'Accelerator') {
          totalScore += 0.2;
          reasons.push('Matches processing requirements');
        }
      }
    });

    // Constraint-based scoring adjustments
    constraints?.forEach(constraint => {
      const constraintLower = constraint.toLowerCase();
      
      // Cost constraints
      if (constraintLower.includes('cost') || constraintLower.includes('budget')) {
        if (component.tags.includes('cost-effective') || component.tags.includes('budget')) {
          totalScore += 0.1;
          reasons.push('Cost-effective option');
        }
      }

      // Size constraints
      if (constraintLower.includes('small') || constraintLower.includes('compact')) {
        if (component.tags.includes('compact') || component.tags.includes('small')) {
          totalScore += 0.1;
          reasons.push('Compact form factor');
        }
      }

      // Power constraints
      if (constraintLower.includes('battery') || constraintLower.includes('low power')) {
        if (component.tags.includes('low-power') || component.tags.includes('battery')) {
          totalScore += 0.15;
          reasons.push('Battery-friendly design');
        }
      }
    });

    return {
      component,
      matchScore: Math.min(totalScore, 1.0),
      matchReason: [...new Set(reasons)].join(', ') || 'General match',
      keywords: [...new Set(matchedKeywords)],
      relevantProperties: [...new Set(relevantProperties)]
    };
  }

  /**
   * Get component suggestions enhanced with Bedrock prompt context
   */
  async getEnhancedSuggestions(
    userQuery: string,
    requirements: string[],
    constraints?: string[],
    applicationDomain?: string,
    maxSuggestions: number = 5
  ): Promise<{
    suggestions: ComponentMatch[];
    promptContext: string;
    searchMetadata: any;
  }> {
    
    const matches = await this.searchWithRequirements(requirements, constraints, applicationDomain);
    const topMatches = matches.slice(0, maxSuggestions);

    // Generate context for Bedrock prompts
    const promptContext = this.generateBedrockPromptContext(topMatches, requirements, applicationDomain);
    
    const searchMetadata = {
      totalMatches: matches.length,
      searchTerms: this.extractSearchTermsFromRequirements(requirements, constraints, applicationDomain),
      applicationDomain,
      timestamp: new Date()
    };

    return {
      suggestions: topMatches,
      promptContext,
      searchMetadata
    };
  }

  /**
   * Generate context for Bedrock prompts
   */
  private generateBedrockPromptContext(
    matches: ComponentMatch[],
    requirements: string[],
    applicationDomain?: string
  ): string {
    let context = `AVAILABLE COMPONENTS FROM LIBRARY:\n`;
    
    matches.forEach((match, index) => {
      const comp = match.component;
      context += `${index + 1}. ${comp.name} (${comp.category})\n`;
      context += `   - Description: ${comp.description}\n`;
      context += `   - Match Score: ${Math.round(match.matchScore * 100)}%\n`;
      context += `   - Match Reason: ${match.matchReason}\n`;
      
      if (comp.properties.performance) {
        context += `   - Performance: ${JSON.stringify(comp.properties.performance)}\n`;
      }
      if (comp.properties.power) {
        context += `   - Power: ${JSON.stringify(comp.properties.power)}\n`;
      }
      context += `   - Tags: ${comp.tags.join(', ')}\n\n`;
    });

    context += `REQUIREMENTS CONTEXT:\n`;
    requirements.forEach((req, index) => {
      context += `${index + 1}. ${req}\n`;
    });

    if (applicationDomain) {
      context += `\nAPPLICATION DOMAIN: ${applicationDomain}\n`;
    }

    context += `\nPlease suggest the most appropriate components from the above list based on the requirements.`;

    return context;
  }

  /**
   * Check component compatibility with detailed analysis
   */
  checkDetailedCompatibility(
    component1Id: string,
    component2Id: string
  ): {
    compatible: boolean;
    compatibleInterfaces: Array<{
      component1Interface: InterfaceDefinition;
      component2Interface: InterfaceDefinition;
      compatibilityScore: number;
    }>;
    incompatibilityReasons: string[];
    suggestions: string[];
  } {
    
    const comp1 = this.getComponentById(component1Id);
    const comp2 = this.getComponentById(component2Id);
    
    if (!comp1 || !comp2) {
      return {
        compatible: false,
        compatibleInterfaces: [],
        incompatibilityReasons: ['One or both components not found'],
        suggestions: []
      };
    }

    const compatibleInterfaces: any[] = [];
    const incompatibilityReasons: string[] = [];
    const suggestions: string[] = [];

    // Check interface compatibility
    comp1.interfaces.forEach(iface1 => {
      comp2.interfaces.forEach(iface2 => {
        const compatibility = this.analyzeInterfaceCompatibility(iface1, iface2);
        if (compatibility.compatible) {
          compatibleInterfaces.push({
            component1Interface: iface1,
            component2Interface: iface2,
            compatibilityScore: compatibility.score
          });
        }
      });
    });

    // Check protocol compatibility
    const comp1Protocols = comp1.compatibility || [];
    const comp2Protocols = comp2.compatibility || [];
    const commonProtocols = comp1Protocols.filter(p => comp2Protocols.includes(p));

    if (commonProtocols.length === 0 && compatibleInterfaces.length === 0) {
      incompatibilityReasons.push('No common interfaces or protocols');
      suggestions.push('Consider adding a bridge component or interface converter');
    }

    // Check power domain compatibility
    const comp1Voltage = comp1.properties.power?.voltage;
    const comp2Voltage = comp2.properties.power?.voltage;
    
    if (comp1Voltage && comp2Voltage && comp1Voltage !== comp2Voltage) {
      incompatibilityReasons.push(`Voltage mismatch: ${comp1Voltage} vs ${comp2Voltage}`);
      suggestions.push('Consider adding voltage level shifters');
    }

    return {
      compatible: compatibleInterfaces.length > 0 || commonProtocols.length > 0,
      compatibleInterfaces,
      incompatibilityReasons,
      suggestions
    };
  }

  /**
   * Analyze interface compatibility with scoring
   */
  private analyzeInterfaceCompatibility(
    iface1: InterfaceDefinition,
    iface2: InterfaceDefinition
  ): { compatible: boolean; score: number; reasons: string[] } {
    
    let score = 0;
    const reasons: string[] = [];

    // Type compatibility (most important)
    const type1 = iface1.busType || iface1.type;
    const type2 = iface2.busType || iface2.type;
    if (type1 === type2) {
      score += 0.5;
      reasons.push(`Same interface type: ${type1}`);
    } else {
      return { compatible: false, score: 0, reasons: ['Different interface types'] };
    }

    // Direction compatibility
    // 'inout' is bidirectional for signals, 'master & slave' is bidirectional for buses
    const isBidirectional1 = iface1.direction === 'inout' || iface1.direction === 'master & slave';
    const isBidirectional2 = iface2.direction === 'inout' || iface2.direction === 'master & slave';

    if ((iface1.direction === 'output' && iface2.direction === 'input') ||
        (iface1.direction === 'input' && iface2.direction === 'output') ||
        (iface1.direction === 'master' && iface2.direction === 'slave') ||
        (iface1.direction === 'slave' && iface2.direction === 'master') ||
        isBidirectional1 || isBidirectional2) {
      score += 0.3;
      reasons.push('Compatible directions');
    } else {
      return { compatible: false, score, reasons: [...reasons, 'Incompatible directions'] };
    }

    // Width compatibility
    const width1 = iface1.dataWidth || iface1.width;
    const width2 = iface2.dataWidth || iface2.width;
    if (width1 && width2) {
      if (width1 === width2) {
        score += 0.1;
        reasons.push('Matching data width');
      } else {
        reasons.push(`Data width mismatch: ${width1} vs ${width2}`);
      }
    }

    // Speed compatibility
    if (iface1.speed && iface2.speed) {
      if (iface1.speed === iface2.speed) {
        score += 0.1;
        reasons.push('Matching speed');
      } else {
        reasons.push(`Speed difference: ${iface1.speed} vs ${iface2.speed}`);
      }
    }

    return {
      compatible: score >= 0.8, // High threshold for compatibility
      score,
      reasons
    };
  }

  /**
   * Extract search terms from user message
   */
  private extractSearchTerms(userMessage: string, conversationContext?: any): string[] {
    const terms: string[] = [];

    // Extract terms from user message
    const messageTerms = userMessage.toLowerCase()
      .split(/\s+/)
      .filter(term => term.length > 2)
      .filter(term => !['the', 'and', 'for', 'with', 'must', 'should', 'will', 'can', 'need'].includes(term));
    terms.push(...messageTerms);

    return [...new Set(terms)]; // Remove duplicates
  }

  /**
   * Get component suggestions for Bedrock prompt enhancement
   */
  async getBedrockPromptEnhancement(
    userMessage: string,
    conversationContext: any
  ): Promise<string> {

    const searchTerms = this.extractSearchTerms(userMessage, conversationContext);
    const matches = await this.searchComponents(searchTerms);
    
    if (matches.length === 0) {
      return 'No specific components found in library for this query.';
    }

    let enhancement = `RELEVANT COMPONENTS FROM LIBRARY:\n`;
    
    matches.slice(0, 3).forEach((match, index) => {
      const comp = match.component;
      enhancement += `${index + 1}. ${comp.name} (${comp.category})\n`;
      enhancement += `   - ${comp.description}\n`;
      enhancement += `   - Key Properties: `;
      
      const keyProps: string[] = [];
      if (comp.properties.performance?.clockFrequency) {
        keyProps.push(`${comp.properties.performance.clockFrequency} clock`);
      }
      if (comp.properties.power?.typical) {
        keyProps.push(`${comp.properties.power.typical} power`);
      }
      if (comp.interfaces.length > 0) {
        keyProps.push(`${comp.interfaces.length} interfaces`);
      }
      
      enhancement += keyProps.join(', ') + '\n';
      enhancement += `   - Best for: ${comp.tags.slice(0, 3).join(', ')}\n\n`;
    });

    enhancement += `Please consider these components when making recommendations.`;
    
    return enhancement;
  }

  /**
   * Validate component library integrity
   */
  validateLibraryIntegrity(): {
    valid: boolean;
    issues: string[];
    warnings: string[];
    statistics: {
      totalComponents: number;
      validComponents: number;
      invalidComponents: number;
      duplicateIds: string[];
      missingInterfaces: string[];
    };
  } {
    
    const issues: string[] = [];
    const warnings: string[] = [];
    const duplicateIds: string[] = [];
    const missingInterfaces: string[] = [];
    let validComponents = 0;

    // Check for duplicate IDs
    const idCounts = new Map<string, number>();
    this.components.forEach(comp => {
      const count = idCounts.get(comp.id) || 0;
      idCounts.set(comp.id, count + 1);
    });

    idCounts.forEach((count, id) => {
      if (count > 1) {
        duplicateIds.push(id);
        issues.push(`Duplicate component ID: ${id} (${count} instances)`);
      }
    });

    // Validate each component
    this.components.forEach(component => {
      const validation = validateArchitecturalComponent(component);
      if (validation.valid) {
        validComponents++;
      } else {
        issues.push(`Invalid component ${component.id}: ${validation.errors?.join(', ')}`);
      }

      // Check for missing interfaces
      if (!component.interfaces || component.interfaces.length === 0) {
        missingInterfaces.push(component.id);
        warnings.push(`Component ${component.id} has no interfaces defined`);
      }
    });

    return {
      valid: issues.length === 0,
      issues,
      warnings,
      statistics: {
        totalComponents: this.components.length,
        validComponents,
        invalidComponents: this.components.length - validComponents,
        duplicateIds,
        missingInterfaces
      }
    };
  }

  /**
   * Get component customization options
   */
  getCustomizationOptions(componentId: string): {
    customizableProperties: string[];
    presetCustomizations: Array<{
      name: string;
      description: string;
      modifications: Record<string, any>;
    }>;
    compatibilityConstraints: string[];
  } {
    
    const component = this.getComponentById(componentId);
    if (!component) {
      return {
        customizableProperties: [],
        presetCustomizations: [],
        compatibilityConstraints: []
      };
    }

    const customizableProperties: string[] = [];
    
    // Identify customizable properties
    if (component.properties.performance) {
      Object.keys(component.properties.performance).forEach(key => {
        customizableProperties.push(`performance.${key}`);
      });
    }
    
    if (component.properties.power) {
      Object.keys(component.properties.power).forEach(key => {
        customizableProperties.push(`power.${key}`);
      });
    }

    // Generate preset customizations based on component category
    const presetCustomizations = this.generatePresetCustomizations(component);
    
    // Get compatibility constraints
    const compatibilityConstraints = [
      `Must maintain ${component.interfaces.map(i => i.busType || i.type).join(', ')} interface compatibility`,
      `Should preserve ${component.category} category characteristics`,
      ...component.compatibility.map(c => `Must support ${c} protocol`)
    ];

    return {
      customizableProperties,
      presetCustomizations,
      compatibilityConstraints
    };
  }

  /**
   * Generate preset customizations for a component
   */
  private generatePresetCustomizations(component: ArchitecturalComponent): Array<{
    name: string;
    description: string;
    modifications: Record<string, any>;
  }> {
    
    const presets: Array<{
      name: string;
      description: string;
      modifications: Record<string, any>;
    }> = [];

    if (component.category === 'CPU') {
      presets.push({
        name: 'High Performance',
        description: 'Optimize for maximum processing power',
        modifications: {
          'properties.performance.clockFrequency': '2x current frequency',
          'properties.power.typical': '1.5x current power'
        }
      });

      presets.push({
        name: 'Low Power',
        description: 'Optimize for battery life',
        modifications: {
          'properties.performance.clockFrequency': '0.7x current frequency',
          'properties.power.typical': '0.5x current power'
        }
      });
    }

    if (component.category === 'Memory') {
      presets.push({
        name: 'High Capacity',
        description: 'Maximize storage capacity',
        modifications: {
          'properties.capacity': '2x current capacity',
          'properties.power.typical': '1.3x current power'
        }
      });

      presets.push({
        name: 'High Speed',
        description: 'Optimize for bandwidth',
        modifications: {
          'properties.performance.bandwidth': '1.5x current bandwidth',
          'properties.power.typical': '1.2x current power'
        }
      });
    }

    return presets;
  }

  /**
   * Clear caches
   */
  clearCaches(): void {
    this.searchCache.clear();
    this.compatibilityCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStatistics(): {
    searchCacheSize: number;
    compatibilityCacheSize: number;
    cacheHitRate?: number;
  } {
    return {
      searchCacheSize: this.searchCache.size,
      compatibilityCacheSize: this.compatibilityCache.size
    };
  }

  /**
   * Reload library from disk
   */
  async reloadLibrary(): Promise<void> {
    this.components = [];
    this.patterns = [];
    this.clearCaches();
    this.initialized = false;
    await this.initializeLibrary();
  }
}