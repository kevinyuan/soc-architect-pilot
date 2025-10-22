/**
 * Template Library Manager
 *
 * Manages design templates loaded from local file system.
 * Similar to ComponentLibraryManager but for architecture templates.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface DesignTemplate {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category?: string;
  createdAt?: string;
  createdBy?: string;
  diagram: {
    nodes: any[];
    edges: any[];
    viewport?: {
      x: number;
      y: number;
      zoom: number;
    };
  };
  metadata?: {
    nodeCount?: number;
    edgeCount?: number;
    tags?: string[];
  };
}

export interface TemplateMetadata {
  totalTemplates: number;
  categories: string[];
  lastUpdated: string;
}

export class TemplateLibraryManager {
  private templates: DesignTemplate[] = [];
  private initialized: boolean = false;
  private metadata: TemplateMetadata = {
    totalTemplates: 0,
    categories: [],
    lastUpdated: new Date().toISOString()
  };

  constructor() {
    this.initializeLibrary();
  }

  /**
   * Initialize template library from local JSON files
   * Loads all templates into memory at startup for fast access
   */
  private async initializeLibrary(): Promise<void> {
    try {
      const designExamplesDir = path.join(process.cwd(), 'data', 'design_examples');

      if (!fs.existsSync(designExamplesDir)) {
        console.warn(`⚠️  Design examples directory not found: ${designExamplesDir}`);
        console.warn('📋 Using empty template library');
        this.initialized = true;
        return;
      }

      const startTime = Date.now();
      const files = fs.readdirSync(designExamplesDir)
        .filter(file => file.endsWith('.json'));

      console.log(`📋 Loading ${files.length} design examples into memory...`);

      for (const file of files) {
        try {
          const filePath = path.join(designExamplesDir, file);
          const templateData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

          // Validate and add template
          if (this.validateTemplate(templateData)) {
            // Enrich metadata
            if (!templateData.metadata) {
              templateData.metadata = {};
            }
            templateData.metadata.nodeCount = templateData.diagram?.nodes?.length || 0;
            templateData.metadata.edgeCount = templateData.diagram?.edges?.length || 0;

            this.templates.push(templateData);
          } else {
            console.warn(`⚠️  Invalid template data in ${file}`);
          }
        } catch (error) {
          console.error(`❌ Error loading template from ${file}:`, error);
        }
      }

      this.updateMetadata();
      this.initialized = true;

      const loadTime = Date.now() - startTime;
      console.log(`✅ Loaded ${this.templates.length} templates into memory (${loadTime}ms)`);
      console.log(`📊 Memory footprint: ~${Math.round(JSON.stringify(this.templates).length / 1024)}KB`);
    } catch (error) {
      console.error('❌ Error initializing template library:', error);
      this.initialized = true; // Continue with empty library
    }
  }

  /**
   * Validate template data structure
   */
  private validateTemplate(template: any): boolean {
    if (!template.id || !template.name || !template.diagram) {
      console.warn(`Template missing essential fields: ${JSON.stringify({ id: template.id, name: template.name, hasDiagram: !!template.diagram })}`);
      return false;
    }

    if (!template.diagram.nodes || !Array.isArray(template.diagram.nodes)) {
      console.warn(`Template ${template.id} has invalid or missing diagram nodes`);
      return false;
    }

    return true;
  }

  /**
   * Update library metadata
   */
  private updateMetadata(): void {
    this.metadata.totalTemplates = this.templates.length;
    this.metadata.lastUpdated = new Date().toISOString();

    // Collect unique categories
    const categories = new Set<string>();
    this.templates.forEach(template => {
      if (template.category) {
        categories.add(template.category);
      }
    });
    this.metadata.categories = Array.from(categories);
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
      console.warn('⚠️  TemplateLibraryManager initialization timeout');
    }
  }

  /**
   * Get all templates
   */
  getAllTemplates(): DesignTemplate[] {
    return [...this.templates];
  }

  /**
   * Get template by ID
   */
  getTemplateById(id: string): DesignTemplate | undefined {
    return this.templates.find(t => t.id === id);
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(category: string): DesignTemplate[] {
    return this.templates.filter(t => t.category === category);
  }

  /**
   * Get library metadata
   */
  getMetadata(): TemplateMetadata {
    return { ...this.metadata };
  }

  /**
   * Search templates by name or description
   */
  searchTemplates(query: string): DesignTemplate[] {
    const queryLower = query.toLowerCase();
    return this.templates.filter(t =>
      t.name.toLowerCase().includes(queryLower) ||
      t.description?.toLowerCase().includes(queryLower) ||
      t.category?.toLowerCase().includes(queryLower)
    );
  }

  /**
   * Get template list (summary info only)
   */
  getTemplateList(): Array<{
    id: string;
    name: string;
    description: string;
    icon?: string;
    category?: string;
    nodeCount: number;
    createdAt?: string;
  }> {
    return this.templates.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      icon: t.icon,
      category: t.category,
      nodeCount: t.metadata?.nodeCount || t.diagram.nodes.length,
      createdAt: t.createdAt
    }));
  }

  /**
   * Clear caches (for future use)
   */
  clearCaches(): void {
    // Placeholder for cache clearing if we add caching later
  }

  /**
   * Reload library from disk
   */
  async reloadLibrary(): Promise<void> {
    this.templates = [];
    this.initialized = false;
    await this.initializeLibrary();
  }
}
