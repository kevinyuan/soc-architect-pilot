import { 
  ValidationRule, 
  ValidationContext, 
  ValidationResult, 
  ValidationCategory, 
  ValidationSeverity 
} from './validation-engine';
import { ArchitecturalComponent } from '../../types/index';

/**
 * Rule 1: CPU-Memory Connectivity Validation
 * Ensures CPUs have proper memory connections
 */
export class CpuMemoryConnectivityRule extends ValidationRule {
  readonly id = 'cpu-memory-connectivity';
  readonly name = 'CPU-Memory Connectivity';
  readonly description = 'Validates that CPU components have proper memory connections';
  readonly category = ValidationCategory.CONNECTIVITY;

  getDefaultSeverity() { return ValidationSeverity.ERROR; }
  getDefaultPriority() { return 9; }

  async validate(context: ValidationContext): Promise<ValidationResult> {
    const { components } = context;
    
    const cpus = components.filter(c => c.category === 'CPU');
    const memories = components.filter(c => c.category === 'Memory');
    
    if (cpus.length === 0) {
      return this.createResult(
        true,
        1.0,
        'No CPU components found - rule not applicable',
        []
      );
    }

    if (memories.length === 0) {
      return this.createResult(
        false,
        0.9,
        'CPU components found but no memory components detected',
        cpus.map(c => c.id),
        'CPUs require memory for proper operation',
        'Add DDR4, DDR5, or SRAM memory components to the design'
      );
    }

    // Check if CPUs can connect to memories via compatible protocols
    const unconnectedCpus: string[] = [];

    cpus.forEach(cpu => {
      // Mark as unconnected if CPU has no compatibility information
      if (!cpu.compatibility || !Array.isArray(cpu.compatibility)) {
        unconnectedCpus.push(cpu.id);
        return;
      }

      const canConnectToMemory = memories.some(memory => {
        // Skip if memory has no compatibility information
        if (!memory.compatibility || !Array.isArray(memory.compatibility)) {
          return false;
        }

        const commonProtocols = cpu.compatibility.filter(protocol =>
          memory.compatibility.includes(protocol)
        );
        return commonProtocols.length > 0;
      });

      if (!canConnectToMemory) {
        unconnectedCpus.push(cpu.id);
      }
    });

    if (unconnectedCpus.length > 0) {
      return this.createResult(
        false,
        0.8,
        `${unconnectedCpus.length} CPU(s) cannot connect to any memory component`,
        unconnectedCpus,
        'CPUs need compatible memory interfaces (AXI, AHB, DDR)',
        'Ensure CPUs and memory components share compatible protocols'
      );
    }

    return this.createResult(
      true,
      0.95,
      'All CPU components have proper memory connectivity',
      []
    );
  }
}

/**
 * Rule 2: Power Domain Validation
 * Ensures components have proper power domain assignments
 */
export class PowerDomainRule extends ValidationRule {
  readonly id = 'power-domain-validation';
  readonly name = 'Power Domain Validation';
  readonly description = 'Validates power domain assignments and power consumption';
  readonly category = ValidationCategory.POWER;

  getDefaultSeverity() { return ValidationSeverity.WARNING; }
  getDefaultPriority() { return 7; }

  async validate(context: ValidationContext): Promise<ValidationResult> {
    const { components } = context;
    
    const componentsWithPower = components.filter(c => 
      c.properties?.power?.typical || c.properties?.power?.peak
    );

    if (componentsWithPower.length === 0) {
      return this.createResult(
        false,
        0.7,
        'No power information found for any components',
        components.map(c => c.id),
        'Power consumption data is important for system design',
        'Add power specifications to component properties'
      );
    }

    // Calculate total power consumption
    let totalPower = 0;
    const highPowerComponents: string[] = [];
    
    componentsWithPower.forEach(component => {
      const powerStr = component.properties?.power?.typical ||
                      component.properties?.power?.peak || '0W';
      const powerValue = this.parsePowerValue(powerStr);
      
      totalPower += powerValue;
      
      // Flag high power components (>10W)
      if (powerValue > 10) {
        highPowerComponents.push(component.id);
      }
    });

    const warnings: string[] = [];
    
    if (totalPower > 50) {
      warnings.push(`High total power consumption: ${totalPower.toFixed(1)}W`);
    }
    
    if (highPowerComponents.length > 0) {
      warnings.push(`${highPowerComponents.length} high-power components detected`);
    }

    const passed = warnings.length === 0;
    const confidence = componentsWithPower.length / components.length;

    return this.createResult(
      passed,
      confidence,
      passed 
        ? `Power domain validation passed (Total: ${totalPower.toFixed(1)}W)`
        : warnings.join('; '),
      highPowerComponents,
      warnings.length > 0 ? 'Consider power management strategies' : undefined,
      warnings.length > 0 ? 'Add power domains, voltage regulators, or low-power modes' : undefined,
      { totalPower, highPowerComponents: highPowerComponents.length }
    );
  }

  private parsePowerValue(powerStr: string): number {
    const match = powerStr.match(/(\d+\.?\d*)\s*(m?W)/i);
    if (!match) return 0;
    
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    
    return unit === 'mw' ? value / 1000 : value;
  }
}

/**
 * Rule 3: Clock Domain Validation
 * Ensures proper clock domain management
 */
export class ClockDomainRule extends ValidationRule {
  readonly id = 'clock-domain-validation';
  readonly name = 'Clock Domain Validation';
  readonly description = 'Validates clock frequencies and domain crossings';
  readonly category = ValidationCategory.TIMING;

  getDefaultSeverity() { return ValidationSeverity.WARNING; }
  getDefaultPriority() { return 6; }

  async validate(context: ValidationContext): Promise<ValidationResult> {
    const { components } = context;

    const componentsWithClock = components.filter(c =>
      c.properties?.performance?.clockFrequency
    );

    if (componentsWithClock.length === 0) {
      return this.createResult(
        false,
        0.6,
        'No clock frequency information found',
        components.map(c => c.id),
        'Clock domain information is important for timing analysis',
        'Add clock frequency specifications to component properties'
      );
    }

    const clockFrequencies = new Map<string, number>();
    const issues: string[] = [];
    
    componentsWithClock.forEach(component => {
      const freqStr = component.properties?.performance?.clockFrequency || '';
      const frequency = this.parseFrequency(freqStr);
      
      if (frequency > 0) {
        clockFrequencies.set(component.id, frequency);
        
        // Check for very high frequencies (>5GHz)
        if (frequency > 5000) {
          issues.push(`${component.name}: Very high frequency (${freqStr})`);
        }
      }
    });

    // Check for clock domain crossings
    const uniqueFrequencies = new Set(clockFrequencies.values());
    const hasMultipleDomains = uniqueFrequencies.size > 1;
    
    if (hasMultipleDomains && uniqueFrequencies.size > 3) {
      issues.push(`Multiple clock domains detected (${uniqueFrequencies.size})`);
    }

    const passed = issues.length === 0;
    const confidence = componentsWithClock.length / components.length;

    return this.createResult(
      passed,
      confidence,
      passed 
        ? `Clock domain validation passed (${uniqueFrequencies.size} domains)`
        : issues.join('; '),
      issues.length > 0 ? Array.from(clockFrequencies.keys()) : [],
      hasMultipleDomains ? 'Consider clock domain crossing synchronization' : undefined,
      hasMultipleDomains ? 'Add clock domain crossing circuits or synchronizers' : undefined,
      { 
        totalDomains: uniqueFrequencies.size,
        frequencies: Array.from(uniqueFrequencies).sort((a, b) => b - a)
      }
    );
  }

  private parseFrequency(freqStr: string): number {
    const match = freqStr.match(/(\d+\.?\d*)\s*(MHz|GHz|Hz)/i);
    if (!match) return 0;
    
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    
    switch (unit) {
      case 'ghz': return value * 1000;
      case 'mhz': return value;
      case 'hz': return value / 1000000;
      default: return value;
    }
  }
}

/**
 * Rule 4: Interface Compatibility Validation
 * Ensures component interfaces are compatible
 */
export class InterfaceCompatibilityRule extends ValidationRule {
  readonly id = 'interface-compatibility';
  readonly name = 'Interface Compatibility';
  readonly description = 'Validates interface compatibility between components';
  readonly category = ValidationCategory.COMPATIBILITY;

  getDefaultSeverity() { return ValidationSeverity.ERROR; }
  getDefaultPriority() { return 8; }

  async validate(context: ValidationContext): Promise<ValidationResult> {
    const { components } = context;
    
    if (components.length < 2) {
      return this.createResult(
        true,
        1.0,
        'Insufficient components for interface validation',
        []
      );
    }

    const incompatiblePairs: Array<{source: string, target: string, reason: string}> = [];
    const isolatedComponents: string[] = [];

    // Check each component for compatibility with others
    components.forEach(component => {
      // Skip components without compatibility information
      if (!component.compatibility || !Array.isArray(component.compatibility)) {
        isolatedComponents.push(component.id);
        return;
      }

      let hasCompatibleConnection = false;

      components.forEach(otherComponent => {
        if (component.id === otherComponent.id) return;

        // Skip if other component has no compatibility information
        if (!otherComponent.compatibility || !Array.isArray(otherComponent.compatibility)) {
          return;
        }

        const commonProtocols = component.compatibility.filter(protocol =>
          otherComponent.compatibility.includes(protocol)
        );

        if (commonProtocols.length > 0) {
          hasCompatibleConnection = true;
        } else {
          // Check if these components should be connected
          if (this.shouldBeConnected(component, otherComponent)) {
            incompatiblePairs.push({
              source: component.id,
              target: otherComponent.id,
              reason: `No common protocols between ${component.category} and ${otherComponent.category}`
            });
          }
        }
      });

      if (!hasCompatibleConnection) {
        isolatedComponents.push(component.id);
      }
    });

    const totalIssues = incompatiblePairs.length + isolatedComponents.length;
    const passed = totalIssues === 0;
    
    let message = '';
    const affectedComponents: string[] = [];
    
    if (isolatedComponents.length > 0) {
      message += `${isolatedComponents.length} isolated component(s)`;
      affectedComponents.push(...isolatedComponents);
    }
    
    if (incompatiblePairs.length > 0) {
      if (message) message += '; ';
      message += `${incompatiblePairs.length} incompatible connection(s)`;
      affectedComponents.push(...incompatiblePairs.map(p => p.source));
    }

    if (passed) {
      message = 'All components have compatible interfaces';
    }

    return this.createResult(
      passed,
      passed ? 0.95 : Math.max(0.3, 1 - (totalIssues / components.length)),
      message,
      affectedComponents,
      totalIssues > 0 ? 'Components need compatible communication protocols' : undefined,
      totalIssues > 0 ? 'Add bridge components or use compatible interface standards' : undefined,
      {
        isolatedComponents: isolatedComponents.length,
        incompatiblePairs: incompatiblePairs.length,
        details: incompatiblePairs
      }
    );
  }

  private shouldBeConnected(comp1: ArchitecturalComponent, comp2: ArchitecturalComponent): boolean {
    // CPU should connect to Memory
    if ((comp1.category === 'CPU' && comp2.category === 'Memory') ||
        (comp1.category === 'Memory' && comp2.category === 'CPU')) {
      return true;
    }
    
    // CPU should connect to Accelerators
    if ((comp1.category === 'CPU' && comp2.category === 'Accelerator') ||
        (comp1.category === 'Accelerator' && comp2.category === 'CPU')) {
      return true;
    }
    
    return false;
  }
}

/**
 * Rule 5: Orphaned Components Validation
 * Detects components with no connections
 */
export class OrphanedComponentsRule extends ValidationRule {
  readonly id = 'orphaned-components';
  readonly name = 'Orphaned Components';
  readonly description = 'Detects components that have no connections to other components';
  readonly category = ValidationCategory.ARCHITECTURE;

  getDefaultSeverity() { return ValidationSeverity.WARNING; }
  getDefaultPriority() { return 5; }

  async validate(context: ValidationContext): Promise<ValidationResult> {
    const { components } = context;
    
    if (components.length <= 1) {
      return this.createResult(
        true,
        1.0,
        'Single or no components - orphan check not applicable',
        []
      );
    }

    const orphanedComponents: string[] = [];

    components.forEach(component => {
      // Mark as orphaned if component has no compatibility information
      if (!component.compatibility || !Array.isArray(component.compatibility)) {
        orphanedComponents.push(component.id);
        return;
      }

      let hasConnection = false;

      // Check if component can connect to any other component
      components.forEach(otherComponent => {
        if (component.id === otherComponent.id) return;

        // Skip if other component has no compatibility information
        if (!otherComponent.compatibility || !Array.isArray(otherComponent.compatibility)) {
          return;
        }

        const commonProtocols = component.compatibility.filter(protocol =>
          otherComponent.compatibility.includes(protocol)
        );

        if (commonProtocols.length > 0) {
          hasConnection = true;
        }
      });

      if (!hasConnection) {
        orphanedComponents.push(component.id);
      }
    });

    const passed = orphanedComponents.length === 0;
    const confidence = 0.9; // High confidence in orphan detection

    return this.createResult(
      passed,
      confidence,
      passed 
        ? 'No orphaned components detected'
        : `${orphanedComponents.length} orphaned component(s) found`,
      orphanedComponents,
      orphanedComponents.length > 0 ? 'Orphaned components may indicate design issues' : undefined,
      orphanedComponents.length > 0 ? 'Review component selection or add bridge/adapter components' : undefined,
      { orphanedCount: orphanedComponents.length }
    );
  }
}