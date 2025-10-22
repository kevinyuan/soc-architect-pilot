/**
 * Diagram Metadata Service
 * Ensures unified metadata format across all arch_diagram.json generation and save flows
 */

export interface DiagramMetadata {
  generatedAt: string;
  lastModified: string;
  version: string;
  source: 'ai-generation' | 'manual-edit' | 'template' | 'import';
  layoutAlgorithm?: string;
  layoutConfig?: any;
  optimizedAt?: string;
}

export class DiagramMetadataService {
  /**
   * Add standard metadata to a diagram
   * Preserves existing metadata fields and updates lastModified
   */
  static addStandardMetadata(
    diagram: any,
    source: DiagramMetadata['source'] = 'manual-edit',
    preserveExisting: boolean = true
  ): any {
    const now = new Date().toISOString();
    
    const baseMetadata: DiagramMetadata = {
      generatedAt: now,
      lastModified: now,
      version: '1.0.0',
      source
    };

    // If preserving existing metadata, merge with new values
    if (preserveExisting && diagram.metadata) {
      return {
        ...diagram,
        metadata: {
          ...diagram.metadata,
          lastModified: now,
          // Only update source if not already set
          source: diagram.metadata.source || source
        }
      };
    }

    // Otherwise, create fresh metadata
    return {
      ...diagram,
      metadata: baseMetadata
    };
  }

  /**
   * Update metadata for manual edits
   * Preserves generatedAt and source, updates lastModified
   */
  static updateForManualEdit(diagram: any): any {
    return this.addStandardMetadata(diagram, 'manual-edit', true);
  }

  /**
   * Set metadata for AI generation
   * Creates fresh metadata with ai-generation source
   */
  static setForAIGeneration(diagram: any): any {
    return this.addStandardMetadata(diagram, 'ai-generation', false);
  }

  /**
   * Set metadata for template-based creation
   * Creates fresh metadata with template source
   */
  static setForTemplate(diagram: any): any {
    return this.addStandardMetadata(diagram, 'template', false);
  }

  /**
   * Set metadata for imported diagrams
   * Creates fresh metadata with import source
   */
  static setForImport(diagram: any): any {
    return this.addStandardMetadata(diagram, 'import', false);
  }

  /**
   * Validate metadata structure
   * Returns true if metadata has required fields
   */
  static validateMetadata(diagram: any): boolean {
    if (!diagram.metadata) {
      return false;
    }

    const required = ['generatedAt', 'lastModified', 'version', 'source'];
    return required.every(field => diagram.metadata[field]);
  }

  /**
   * Ensure diagram has valid metadata
   * Adds metadata if missing or invalid
   */
  static ensureMetadata(diagram: any, source: DiagramMetadata['source'] = 'manual-edit'): any {
    if (this.validateMetadata(diagram)) {
      // Update lastModified if metadata exists
      return {
        ...diagram,
        metadata: {
          ...diagram.metadata,
          lastModified: new Date().toISOString()
        }
      };
    }

    // Add fresh metadata if missing or invalid
    return this.addStandardMetadata(diagram, source, false);
  }
}
