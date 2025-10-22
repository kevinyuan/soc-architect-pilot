/**
 * Architecture Examples Library
 * Loads reference architecture templates from file system for RAG-based matching
 * Templates are loaded once at startup and cached in memory via TemplateLibraryManager
 */

import { TemplateLibraryManager, DesignTemplate } from './template-library-manager';

export interface ArchitectureTemplate {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category?: string;
  diagram: {
    nodes: any[];
    edges: any[];
  };
  createdAt?: string;
  // Derived fields for RAG matching
  useCases?: string[];
  tags?: string[];
}

/**
 * Architecture Examples Service
 * Provides RAG-based template matching using file system templates
 * Templates are loaded from data/design_examples/ and cached in memory for fast access
 */
export class ArchitectureExamplesService {
  private static instance: ArchitectureExamplesService | null = null;

  private templateManager: TemplateLibraryManager;

  private constructor() {
    this.templateManager = new TemplateLibraryManager();
  }

  /**
   * Get singleton instance (reuses template manager)
   */
  public static getInstance(): ArchitectureExamplesService {
    if (!ArchitectureExamplesService.instance) {
      ArchitectureExamplesService.instance = new ArchitectureExamplesService();
    }
    return ArchitectureExamplesService.instance;
  }

  /**
   * Load all templates from file system (via TemplateLibraryManager)
   * Templates are already cached in memory for instant access
   */
  private async loadTemplates(): Promise<ArchitectureTemplate[]> {
    console.log(`📚 [RAG] Loading architecture templates from memory...`);

    try {
      // Ensure template library is initialized
      await this.templateManager.ensureInitialized();

      // Get all templates from memory
      const designTemplates: DesignTemplate[] = this.templateManager.getAllTemplates();

      // Convert DesignTemplate to ArchitectureTemplate and enrich for RAG
      const templates: ArchitectureTemplate[] = designTemplates.map(dt => {
        const archTemplate: ArchitectureTemplate = {
          id: dt.id,
          name: dt.name,
          description: dt.description,
          icon: dt.icon,
          category: dt.category,
          diagram: dt.diagram,
          createdAt: dt.createdAt,
          // Enrich with RAG fields
          useCases: this.extractUseCases(dt),
          tags: this.extractTags(dt)
        };
        return archTemplate;
      });

      console.log(`📚 [RAG] Loaded ${templates.length} templates from memory`);

      return templates;
    } catch (error) {
      console.error(`❌ [RAG] Failed to load templates:`, error);
      return [];
    }
  }

  /**
   * Extract use cases from template metadata
   * Derives use cases from name, description, and category
   */
  private extractUseCases(template: ArchitectureTemplate): string[] {
    const useCases: string[] = [];
    const text = `${template.name} ${template.description} ${template.category || ''}`.toLowerCase();

    // Memory/Storage use cases
    if (text.match(/\b(cxl|memory|expander|ddr|hbm|cache)\b/)) {
      useCases.push('Memory Expansion');
    }
    if (text.match(/\bcxl\b/)) {
      useCases.push('CXL');
    }
    if (text.match(/\b(server|data center|datacenter)\b/)) {
      useCases.push('Data Center');
    }

    // Networking use cases
    if (text.match(/\b(ethernet|network|nic|switch|smartnic)\b/)) {
      useCases.push('Networking');
    }
    if (text.match(/\b(smartnic|smart nic)\b/)) {
      useCases.push('SmartNIC');
    }

    // AI/ML use cases
    if (text.match(/\b(ai|ml|machine learning|neural|npu|inference|accelerator)\b/)) {
      useCases.push('AI/ML');
    }
    if (text.match(/\b(inference|neural)\b/)) {
      useCases.push('AI Inference');
    }

    // Computing use cases
    if (text.match(/\b(near.?memory|compute|processing)\b/)) {
      useCases.push('Computing');
    }
    if (text.match(/\b(iot|sensor|embedded|edge)\b/)) {
      useCases.push('IoT');
    }

    // Minimal/Basic
    if (text.match(/\b(minimal|basic|simple)\b/)) {
      useCases.push('Basic SoC');
    }

    return useCases;
  }

  /**
   * Extract tags from template for fine-grained matching
   */
  private extractTags(template: ArchitectureTemplate): string[] {
    const tags: string[] = [];
    const text = `${template.name} ${template.description}`.toLowerCase();

    // Component tags
    const componentPatterns = {
      'cxl': /\bcxl\b/,
      'cxl3': /\bcxl\s*3/,
      'pcie': /\bpcie\b/,
      'ddr': /\bddr\b/,
      'ddr5': /\bddr5\b/,
      'ddr4': /\bddr4\b/,
      'hbm': /\bhbm\b/,
      'ethernet': /\bethernet\b/,
      'arm': /\barm\b/,
      'cortex': /\bcortex\b/,
      'risc-v': /\brisc.?v\b/,
      'cpu': /\bcpu\b/,
      'npu': /\bnpu\b/,
      'gpu': /\bgpu\b/,
      'axi': /\baxi\b/,
      'ahb': /\bahb\b/,
      'apb': /\bapb\b/,
    };

    for (const [tag, pattern] of Object.entries(componentPatterns)) {
      if (pattern.test(text)) {
        tags.push(tag);
      }
    }

    // Category as tag
    if (template.category) {
      tags.push(template.category);
    }

    return tags;
  }

  /**
   * Search for similar architecture templates using RAG
   * @param userRequirement User's original requirement text
   * @param conversationHistory Full conversation history
   * @returns Top matching architecture templates
   */
  async searchSimilarArchitectures(
    userRequirement: string,
    conversationHistory: string
  ): Promise<ArchitectureTemplate[]> {
    // Load templates from S3
    const templates = await this.loadTemplates();

    if (templates.length === 0) {
      console.warn(`⚠️  [RAG] No templates available for matching`);
      return [];
    }

    // Combine user requirement and conversation for comprehensive matching
    const searchText = (userRequirement + ' ' + conversationHistory).toLowerCase();

    console.log(`🔍 [RAG] Searching ${templates.length} templates for match with: "${userRequirement.substring(0, 100)}..."`);

    // Score each template based on tag and use case matching
    const scoredTemplates = templates.map(template => {
      let score = 0;

      // Check use cases (higher weight)
      template.useCases?.forEach(useCase => {
        if (searchText.includes(useCase.toLowerCase())) {
          score += 10;
        }
      });

      // Check tags (medium weight)
      template.tags?.forEach(tag => {
        // Use word boundaries to avoid false matches
        const regex = new RegExp(`\\b${tag.toLowerCase()}\\b`);
        if (regex.test(searchText)) {
          score += 5;
        }
      });

      // Check description (lower weight)
      const descWords = template.description.toLowerCase().split(' ');
      descWords.forEach(word => {
        if (word.length > 3 && searchText.includes(word)) {
          score += 1;
        }
      });

      // Check name (high weight for exact component mentions)
      const nameWords = template.name.toLowerCase().split(' ');
      nameWords.forEach(word => {
        if (word.length > 3 && searchText.includes(word)) {
          score += 3;
        }
      });

      return { template, score };
    });

    // Sort by score and return top matches
    const topMatches = scoredTemplates
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3); // Top 3 matches

    console.log(`🎯 [RAG] Found ${topMatches.length} matching templates:`);
    topMatches.forEach((match, idx) => {
      console.log(`   ${idx + 1}. ${match.template.name} (score: ${match.score}, uses: ${match.template.useCases?.join(', ')})`);
    });

    return topMatches.map(item => item.template);
  }

  /**
   * Get template by ID
   */
  async getTemplateById(id: string): Promise<ArchitectureTemplate | undefined> {
    const templates = await this.loadTemplates();
    return templates.find(t => t.id === id);
  }

  /**
   * Get all templates
   */
  async getAllTemplates(): Promise<ArchitectureTemplate[]> {
    return await this.loadTemplates();
  }

}
