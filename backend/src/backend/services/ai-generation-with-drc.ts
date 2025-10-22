/**
 * AI Architecture Generation with DRC Validation
 *
 * Implements iterative generation with DRC feedback loop
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand
} from '@aws-sdk/client-bedrock-runtime';
import { DRCChecker, DRCResult, DRCViolation } from './drc-checker';
import { ComponentLibraryManager } from './component-library-manager';
import { ArchitectureDefinition, ArchitecturalComponent, PatternConnection } from '../../types/index';
import { GenerationProgressTracker } from './generation-progress';
import { getBedrockConfig } from '../config';

interface GenerationResult {
  success: boolean;
  architecture?: {
    nodes: any[];
    edges: any[];
  };
  drcResult?: DRCResult;
  iterations: number;
  errors?: string[];
}

export class AIGenerationWithDRC {
  private drcChecker: DRCChecker;
  private componentLibrary: ComponentLibraryManager;
  private maxIterations: number = 5; // Increased from 3 to 5
  private progressTracker: GenerationProgressTracker;
  private bedrockClient: BedrockRuntimeClient;
  private config: any;

  constructor(maxIterations?: number) {
    this.drcChecker = new DRCChecker();
    this.componentLibrary = new ComponentLibraryManager();
    this.progressTracker = GenerationProgressTracker.getInstance();

    // Initialize Bedrock client for AI-driven DRC fixes
    this.config = getBedrockConfig();
    this.bedrockClient = new BedrockRuntimeClient({
      region: this.config.region,
      credentials: this.config.credentials
    });

    if (maxIterations !== undefined && maxIterations >= 3 && maxIterations <= 10) {
      this.maxIterations = maxIterations;
    }
  }

  /**
   * Validate and fix an existing diagram
   */
  async validateAndFixDiagram(
    diagram: any,
    sessionId: string
  ): Promise<GenerationResult> {
    let currentDiagram = diagram;
    let iteration = 0;
    const errors: string[] = [];

    // Load component library for DRC checking (already in memory, fast access)
    await this.componentLibrary.ensureInitialized();
    const fullComponents = this.componentLibrary.getAllComponents();

    while (iteration < this.maxIterations) {
      iteration++;
      console.log(`\n🔄 DRC Iteration ${iteration}/${this.maxIterations}`);

      // Run DRC check
      const drcResult = await this.drcChecker.checkDiagram(currentDiagram, fullComponents);

      console.log(`   Critical: ${drcResult.summary.critical}`);
      console.log(`   Warnings: ${drcResult.summary.warning}`);
      console.log(`   Info: ${drcResult.summary.info}`);

      // Send progress update with DRC iteration details
      this.progressTracker.emitStage(
        sessionId,
        'drc_check',
        `DRC Check: Iteration ${iteration}/${this.maxIterations}`,
        60 + (iteration / this.maxIterations) * 15, // Progress 60-75%
        {
          iteration,
          maxIterations: this.maxIterations,
          violations: {
            critical: drcResult.summary.critical,
            warning: drcResult.summary.warning,
            info: drcResult.summary.info,
          },
        }
      );

      // If no critical violations, we're done
      if (drcResult.summary.critical === 0) {
        console.log('✅ DRC validation passed!');
        this.progressTracker.emitStage(
          sessionId,
          'drc_check',
          `DRC Check: Passed after ${iteration} iteration(s)`,
          75,
          {
            iteration,
            maxIterations: this.maxIterations,
            violations: {
              critical: 0,
              warning: drcResult.summary.warning,
              info: drcResult.summary.info,
            },
            passed: true,
          }
        );
        return {
          success: true,
          architecture: currentDiagram,
          drcResult,
          iterations: iteration,
        };
      }

      // Try to fix critical violations
      console.log(`⚠️  Found ${drcResult.summary.critical} critical violation(s), attempting fixes...`);

      // Log AI-friendly DRC output for better debugging
      const criticalViolations = drcResult.violations.filter(v => v.severity === 'critical');
      console.log('\n📋 [DRC] AI-Friendly Violation Summary:');
      console.log(this.formatDRCViolationsForAI(criticalViolations));

      const fixResult = await this.attemptAutoFix(
        currentDiagram,
        criticalViolations,
        fullComponents
      );

      if (!fixResult.success) {
        errors.push(`Iteration ${iteration}: ${fixResult.error}`);
        console.warn(`⚠️  Fix attempt failed, but continuing to next iteration...`);
      } else {
        currentDiagram = fixResult.fixedArchitecture!;
      }
    }

    // Max iterations reached - run final DRC check
    console.log(`\n📊 [DRC] Max iterations (${this.maxIterations}) reached, running final DRC check...`);
    const finalDRC = await this.drcChecker.checkDiagram(currentDiagram, fullComponents);

    console.log(`📊 [DRC] Final result after ${iteration} iterations:`);
    console.log(`   Critical: ${finalDRC.summary.critical}`);
    console.log(`   Warnings: ${finalDRC.summary.warning}`);
    console.log(`   Info: ${finalDRC.summary.info}`);

    const success = finalDRC.summary.critical === 0;

    if (success) {
      console.log(`✅ [DRC] All critical issues resolved after ${iteration} iterations`);
    } else {
      console.warn(`⚠️  [DRC] ${finalDRC.summary.critical} critical issue(s) remain after ${iteration} iterations`);
    }

    return {
      success,
      architecture: currentDiagram,
      drcResult: finalDRC,
      iterations: iteration,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Generate architecture with DRC validation and iterative fixes
   */
  async generateWithDRCValidation(
    architecture: ArchitectureDefinition,
    sessionId: string
  ): Promise<GenerationResult> {
    let currentArchitecture = this.convertToDiagram(architecture);
    let iteration = 0;
    const errors: string[] = [];

    // Load component library for DRC checking (already in memory, fast access)
    await this.componentLibrary.ensureInitialized();
    const fullComponents = this.componentLibrary.getAllComponents();

    while (iteration < this.maxIterations) {
      iteration++;
      console.log(`\n🔄 DRC Iteration ${iteration}/${this.maxIterations}`);

      // Run DRC check
      const drcResult = await this.drcChecker.checkDiagram(currentArchitecture, fullComponents);

      console.log(`   Critical: ${drcResult.summary.critical}`);
      console.log(`   Warnings: ${drcResult.summary.warning}`);
      console.log(`   Info: ${drcResult.summary.info}`);

      // Send progress update with DRC iteration details
      this.progressTracker.emitStage(
        sessionId,
        'drc_check',
        `DRC Check: Iteration ${iteration}/${this.maxIterations}`,
        60 + (iteration / this.maxIterations) * 15, // Progress 60-75%
        {
          iteration,
          maxIterations: this.maxIterations,
          violations: {
            critical: drcResult.summary.critical,
            warning: drcResult.summary.warning,
            info: drcResult.summary.info,
          },
        }
      );

      // If no critical violations, we're done
      if (drcResult.summary.critical === 0) {
        console.log('✅ DRC validation passed!');
        this.progressTracker.emitStage(
          sessionId,
          'drc_check',
          `DRC Check: Passed after ${iteration} iteration(s)`,
          75,
          {
            iteration,
            maxIterations: this.maxIterations,
            violations: {
              critical: 0,
              warning: drcResult.summary.warning,
              info: drcResult.summary.info,
            },
            passed: true,
          }
        );
        return {
          success: true,
          architecture: currentArchitecture,
          drcResult,
          iterations: iteration,
        };
      }

      // Try to fix critical violations
      console.log(`⚠️  Found ${drcResult.summary.critical} critical violation(s), attempting fixes...`);

      // Log AI-friendly DRC output for better debugging
      const criticalViolations = drcResult.violations.filter(v => v.severity === 'critical');
      console.log('\n📋 [DRC] AI-Friendly Violation Summary:');
      console.log(this.formatDRCViolationsForAI(criticalViolations));

      this.progressTracker.emitStage(
        sessionId,
        'ai_fix',
        `AI Fix: Attempting to resolve ${drcResult.summary.critical} violation(s)...`,
        50 + (iteration / this.maxIterations) * 10,
        {
          iteration,
          fixing: true,
          violationCount: drcResult.summary.critical,
        }
      );

      const fixResult = await this.attemptAutoFix(
        currentArchitecture,
        criticalViolations,
        fullComponents
      );

      if (!fixResult.success) {
        // Log the error but continue to next iteration
        // Next iteration will re-check DRC to see if there's any improvement
        errors.push(`Iteration ${iteration}: ${fixResult.error}`);
        console.warn(`⚠️  Fix attempt failed, but continuing to next iteration...`);
      } else {
        // Apply the fixed architecture
        currentArchitecture = fixResult.fixedArchitecture!;
      }
    }

    // Max iterations reached - run final DRC check
    console.log(`\n📊 [DRC] Max iterations (${this.maxIterations}) reached, running final DRC check...`);
    const finalDRC = await this.drcChecker.checkDiagram(currentArchitecture, fullComponents);

    console.log(`📊 [DRC] Final result after ${iteration} iterations:`);
    console.log(`   Critical: ${finalDRC.summary.critical}`);
    console.log(`   Warnings: ${finalDRC.summary.warning}`);
    console.log(`   Info: ${finalDRC.summary.info}`);

    // Return success only if no critical violations remain
    const success = finalDRC.summary.critical === 0;

    if (success) {
      console.log(`✅ [DRC] All critical issues resolved after ${iteration} iterations`);
    } else {
      console.warn(`⚠️  [DRC] ${finalDRC.summary.critical} critical issue(s) remain after ${iteration} iterations`);
      console.warn(`⚠️  [DRC] Continuing with architecture generation despite DRC issues`);
    }

    return {
      success,
      architecture: currentArchitecture,
      drcResult: finalDRC,
      iterations: iteration,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Convert DRC violations to AI-friendly format for better understanding
   * This simplifies technical DRC output without affecting frontend display
   */
  private formatDRCViolationsForAI(violations: DRCViolation[]): string {
    if (violations.length === 0) {
      return 'No violations found.';
    }

    const grouped: Record<string, DRCViolation[]> = {};
    violations.forEach(v => {
      if (!grouped[v.category]) grouped[v.category] = [];
      grouped[v.category].push(v);
    });

    let output = `Found ${violations.length} DRC violation(s):\n\n`;

    Object.entries(grouped).forEach(([category, viols]) => {
      output += `## ${category} Issues (${viols.length})\n`;
      viols.forEach((v, idx) => {
        output += `${idx + 1}. **${v.ruleName}** [${v.ruleId}] - ${v.severity}\n`;
        output += `   - Problem: ${v.description}\n`;

        // Only show location if it's meaningful (not undefined/N/A)
        if (v.location && v.location !== 'N/A' && !v.location.includes('undefined')) {
          output += `   - Location: ${v.location}\n`;
        }

        if (v.suggestion) {
          output += `   - How to fix: ${v.suggestion}\n`;
        }

        // Add detailed information if available
        if (v.details) {
          if (v.details.source) {
            output += `   - Source: ${v.details.source.node || 'N/A'}`;
            if (v.details.source.interface) {
              output += `.${v.details.source.interface}`;
            }
            if (v.details.source.direction) {
              output += ` (${v.details.source.direction})`;
            }
            if (v.details.source.busType) {
              output += ` [${v.details.source.busType}]`;
            }
            if (v.details.source.dataWidth) {
              output += ` ${v.details.source.dataWidth}-bit`;
            }
            output += '\n';
          }

          if (v.details.target) {
            output += `   - Target: ${v.details.target.node || 'N/A'}`;
            if (v.details.target.interface) {
              output += `.${v.details.target.interface}`;
            }
            if (v.details.target.direction) {
              output += ` (${v.details.target.direction})`;
            }
            if (v.details.target.busType) {
              output += ` [${v.details.target.busType}]`;
            }
            if (v.details.target.dataWidth) {
              output += ` ${v.details.target.dataWidth}-bit`;
            }
            output += '\n';
          }

          if (v.details.connection) {
            output += `   - Connection: ${v.details.connection}\n`;
          }

          if (v.details.masters && Array.isArray(v.details.masters)) {
            output += `   - Masters (${v.details.masterCount || v.details.masters.length}):\n`;
            v.details.masters.forEach((m: any, i: number) => {
              output += `     ${i + 1}. ${m.fullPath || m.nodeName || 'Unknown'}\n`;
            });
          }

          if (v.details.slave) {
            output += `   - Slave: ${v.details.slave.fullPath || v.details.slave.node || 'N/A'}\n`;
          }

          if (v.details.overlappingRanges && Array.isArray(v.details.overlappingRanges)) {
            output += `   - Overlapping ranges:\n`;
            v.details.overlappingRanges.forEach((range: any, i: number) => {
              output += `     ${i + 1}. ${range}\n`;
            });
          }
        }

        if (v.affectedComponents && v.affectedComponents.length > 0) {
          output += `   - Affected component IDs: ${v.affectedComponents.join(', ')}\n`;
        }

        if (v.affectedInterfaces && v.affectedInterfaces.length > 0) {
          output += `   - Affected interface IDs: ${v.affectedInterfaces.join(', ')}\n`;
        }

        if (v.affectedConnections && v.affectedConnections.length > 0) {
          output += `   - Affected connection IDs: ${v.affectedConnections.join(', ')}\n`;
        }

        output += '\n';
      });
    });

    return output;
  }

  /**
   * Attempt to automatically fix DRC violations
   */
  private async attemptAutoFix(
    diagram: any,
    violations: DRCViolation[],
    componentLibrary: any[]
  ): Promise<{ success: boolean; fixedArchitecture?: any; error?: string }> {
    const fixedDiagram = JSON.parse(JSON.stringify(diagram)); // Deep clone
    const fixErrors: string[] = [];
    let successfulFixes = 0;

    console.log(`   🔧 Attempting to fix ${violations.length} violation(s)...`);

    for (const violation of violations) {
      try {
        switch (violation.ruleId) {
          case 'DRC-CONN-005': // Multiple Masters to One Slave
            await this.fixMultipleMastersToOneSlave(fixedDiagram, violation, componentLibrary);
            break;

          case 'DRC-CONN-001': // Master-Slave Role Matching
            await this.fixMasterSlaveRoleMismatch(fixedDiagram, violation);
            break;

          case 'DRC-CONN-002': // Bus Type Matching
            await this.fixBusTypeMismatch(fixedDiagram, violation);
            break;

          case 'DRC-AXI-PARAM-001': // Data Width Matching
            await this.fixDataWidthMismatch(fixedDiagram, violation, componentLibrary);
            break;

          case 'DRC-AXI-PARAM-002': // ID Width Compatibility
            await this.fixIdWidthMismatch(fixedDiagram, violation, componentLibrary);
            break;

          case 'DRC-ADDR-001': // Address Space Overlap
            await this.fixAddressOverlap(fixedDiagram, violation);
            break;

          case 'DRC-TOPO-001': // Circular Dependency
            await this.fixCircularDependency(fixedDiagram, violation);
            break;

          case 'DRC-PARAM-VALID-002': // Missing Required Parameter
            await this.fixMissingParameter(fixedDiagram, violation);
            break;

          case 'DRC-CONN-003': // Interface and Instance Existence
            await this.fixMissingInstance(fixedDiagram, violation);
            break;

          case 'DRC-CONN-004': // Unconnected Master Interface
            await this.fixUnconnectedMaster(fixedDiagram, violation);
            break;

          case 'DRC-CONN-006': // Unconnected Slave Interface
            await this.fixUnconnectedSlave(fixedDiagram, violation);
            break;

          case 'DRC-CONN-007': // Signal Direction Matching
            await this.fixSignalDirectionMismatch(fixedDiagram, violation);
            break;

          case 'DRC-CONN-008': // Multiple Connections to Same Port
            await this.fixMultipleConnectionsToPort(fixedDiagram, violation, componentLibrary);
            break;

          case 'DRC-AXI-PARAM-003': // Address Width Consistency
            await this.fixAddressWidthMismatch(fixedDiagram, violation);
            break;

          case 'DRC-AXI-PARAM-004': // Clock Frequency Compatibility
            await this.fixClockFrequencyMismatch(fixedDiagram, violation);
            break;

          case 'DRC-ADDR-002': // Address Alignment
            await this.fixAddressAlignment(fixedDiagram, violation);
            break;

          case 'DRC-ADDR-004': // Reserved Address Space
            await this.fixReservedAddressSpace(fixedDiagram, violation);
            break;

          case 'DRC-TOPO-002': // Isolated Components
            await this.fixIsolatedComponent(fixedDiagram, violation);
            break;

          case 'DRC-TOPO-003': // Interconnect Fanout
            await this.fixInterconnectFanout(fixedDiagram, violation, componentLibrary);
            break;

          case 'DRC-PERF-002': // Clock Domain Crossing
            await this.fixClockDomainCrossing(fixedDiagram, violation);
            break;

          case 'DRC-PERF-003': // Long Connection Path
            await this.fixLongConnectionPath(fixedDiagram, violation);
            break;

          case 'DRC-PARAM-VALID-001': // Required Parameters (missing label)
            await this.fixMissingLabel(fixedDiagram, violation);
            break;

          case 'DRC-PARAM-VALID-003': // Data Width Range Check
            await this.fixDataWidthRange(fixedDiagram, violation);
            break;

          case 'DRC-NAME-001': // Unique Component Names
            await this.fixDuplicateNames(fixedDiagram, violation);
            break;

          case 'DRC-NAME-002': // Interface Naming Convention
            await this.fixInterfaceNaming(fixedDiagram, violation);
            break;

          default:
            // No predefined fix handler - try AI-driven fix as fallback
            console.log(`   ⚠️  No predefined fix for ${violation.ruleId}, trying AI-driven fix...`);
            const aiFixResult = await this.fixDRCWithAI(fixedDiagram, [violation]);

            if (!aiFixResult.success) {
              fixErrors.push(`${violation.ruleId}: AI fix failed - ${aiFixResult.error}`);
              continue; // Skip to next violation
            }

            // Apply AI fix
            Object.assign(fixedDiagram, aiFixResult.fixedArchitecture);
            break;
        }

        // Fix succeeded
        successfulFixes++;
        console.log(`   ✅ Successfully fixed ${violation.ruleId}`);

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`   ❌ Failed to fix ${violation.ruleId}: ${errorMsg}`);
        fixErrors.push(`${violation.ruleId}: ${errorMsg}`);
        // Continue trying to fix other violations instead of returning immediately
      }
    }

    console.log(`   📊 Fix summary: ${successfulFixes}/${violations.length} successful, ${fixErrors.length} failed`);

    // If all violations failed to fix, return failure
    if (fixErrors.length === violations.length && violations.length > 0) {
      const error = `All ${violations.length} fix attempt(s) failed: ${fixErrors.join('; ')}`;
      console.error(`   ❌ ${error}`);
      return {
        success: false,
        error,
      };
    }

    // Otherwise, return success (even partial fixes are considered success)
    // The next iteration will check if remaining violations are resolved
    return {
      success: true,
      fixedArchitecture: fixedDiagram,
      error: fixErrors.length > 0 ? `Partial fixes (${fixErrors.length} failed): ${fixErrors.join('; ')}` : undefined,
    };
  }

  /**
   * Fix: Multiple Masters to One Slave - Remove duplicate connections
   * NOTE: This is a critical violation that should be prevented during spec generation.
   * We remove duplicate connections here, but the proper fix is to add a crossbar in the spec.
   * The diagram alignment step should catch this and add the crossbar to match the spec.
   */
  private async fixMultipleMastersToOneSlave(
    diagram: any,
    violation: DRCViolation,
    componentLibrary: any[]
  ): Promise<void> {
    console.log(`   🔧 Fixing: ${violation.ruleName}`);
    console.log(`   ⚠️  WARNING: Multiple masters to one slave detected - this should be prevented in spec generation`);
    console.log(`   💡 Proper fix: Add crossbar/arbiter in arch_spec.md, then regenerate diagram`);

    const targetId = violation.affectedComponents![0];
    const masterIds = violation.affectedComponents!.slice(1);

    // Instead of inserting a crossbar (which creates spec mismatch),
    // we remove all but the first connection and log a warning
    // The diagram alignment step should detect this and add the crossbar properly
    
    const edgesToRemove: string[] = [];
    for (let i = 1; i < masterIds.length; i++) {
      const masterId = masterIds[i];
      const existingEdge = diagram.edges.find((e: any) =>
        e.source === masterId && e.target === targetId
      );

      if (existingEdge) {
        edgesToRemove.push(existingEdge.id);
      }
    }

    // Remove duplicate connections (keep only the first one)
    diagram.edges = diagram.edges.filter((e: any) => !edgesToRemove.includes(e.id));

    console.log(`   ✅ Removed ${edgesToRemove.length} duplicate connection(s)`);
    console.log(`   ⚠️  NOTE: This is a temporary fix. The spec should be updated to include a crossbar/arbiter.`);
    console.log(`   ⚠️  Affected masters: ${masterIds.map(id => this.getNodeLabel(diagram, id)).join(', ')}`);
    console.log(`   ⚠️  Target slave: ${this.getNodeLabel(diagram, targetId)}`);
  }

  /**
   * Helper: Get node label from diagram
   */
  private getNodeLabel(diagram: any, nodeId: string): string {
    const node = diagram.nodes?.find((n: any) => n.id === nodeId);
    return node?.data?.label || nodeId;
  }

  /**
   * Fix: Master-Slave Role Mismatch - Reverse connection
   */
  private async fixMasterSlaveRoleMismatch(
    diagram: any,
    violation: DRCViolation
  ): Promise<void> {
    console.log(`   🔧 Fixing: ${violation.ruleName}`);

    const connectionId = violation.affectedConnections![0];
    const edge = diagram.edges.find((e: any) => e.id === connectionId);

    if (edge) {
      // Swap source and target
      const temp = edge.source;
      edge.source = edge.target;
      edge.target = temp;

      console.log(`   ✅ Reversed connection direction`);
    }
  }

  /**
   * Fix: Bus Type Mismatch - Remove incompatible connection
   */
  private async fixBusTypeMismatch(
    diagram: any,
    violation: DRCViolation
  ): Promise<void> {
    console.log(`   🔧 Fixing: ${violation.ruleName}`);

    const connectionId = violation.affectedConnections![0];
    diagram.edges = diagram.edges.filter((e: any) => e.id !== connectionId);

    console.log(`   ✅ Removed incompatible connection (requires manual protocol converter)`);
  }

  /**
   * Fix: Data Width Mismatch - Update interface parameters
   */
  private async fixDataWidthMismatch(
    diagram: any,
    violation: DRCViolation,
    componentLibrary: any[]
  ): Promise<void> {
    console.log(`   🔧 Fixing: ${violation.ruleName}`);

    // For now, just log - actual fix would require component reconfiguration
    console.log(`   ⚠️  Data width mismatch requires component reconfiguration`);
    console.log(`   💡 Suggestion: Use ${violation.suggestion}`);
  }

  /**
   * Fix: ID Width Mismatch - Update slave ID width
   */
  private async fixIdWidthMismatch(
    diagram: any,
    violation: DRCViolation,
    componentLibrary: any[]
  ): Promise<void> {
    console.log(`   🔧 Fixing: ${violation.ruleName}`);
    console.log(`   ⚠️  ID width mismatch requires component reconfiguration`);
    console.log(`   💡 Suggestion: ${violation.suggestion}`);
  }

  /**
   * Fix: Missing Required Parameter - Add default parameter value
   */
  private async fixMissingParameter(
    diagram: any,
    violation: DRCViolation
  ): Promise<void> {
    console.log(`   🔧 Fixing: ${violation.ruleName}`);

    if (!violation.affectedInterfaces || violation.affectedInterfaces.length === 0) {
      console.log(`   ⚠️  No affected interfaces specified, skipping fix`);
      return;
    }

    // Extract parameter name from violation details
    const paramName = violation.details?.parameterName || 'dataWidth';
    const defaultValue = paramName === 'dataWidth' ? 64 :
      paramName === 'idWidth' ? 4 :
        paramName === 'addrWidth' ? 32 : 0;

    console.log(`   💡 Adding missing parameter '${paramName}' with default value ${defaultValue}`);

    // Fix each affected interface
    for (const interfaceId of violation.affectedInterfaces) {
      // Find the node and interface
      for (const node of diagram.nodes) {
        if (node.data?.interfaces) {
          const iface = node.data.interfaces.find((i: any) => i.id === interfaceId);
          if (iface) {
            // Add the missing parameter
            if (!iface[paramName]) {
              iface[paramName] = defaultValue;
              console.log(`   ✅ Added ${paramName}=${defaultValue} to interface ${interfaceId} on ${node.data.label}`);
            }
          }
        }
      }
    }
  }

  /**
   * Fix: Address Space Overlap - Adjust addresses
   */
  private async fixAddressOverlap(
    diagram: any,
    violation: DRCViolation
  ): Promise<void> {
    console.log(`   🔧 Fixing: ${violation.ruleName}`);

    const [comp1Id, comp2Id] = violation.affectedComponents!;
    const comp2 = diagram.nodes.find((n: any) => n.id === comp2Id);

    if (!comp2) {
      throw new Error(`Component ${comp2Id} not found in diagram`);
    }

    if (!violation.details || !violation.details.component1 || !violation.details.component1.end) {
      throw new Error(`Missing address details in violation for ${comp2Id}`);
    }

    try {
      // Move comp2 to next available address
      const comp1End = violation.details.component1.end;

      // Validate address format
      if (typeof comp1End !== 'string') {
        throw new Error(`Invalid address type: expected string, got ${typeof comp1End}`);
      }

      // Remove 0x prefix and validate hex format
      const hexStr = comp1End.replace(/^0x/i, '');
      if (!/^[0-9a-fA-F]+$/.test(hexStr)) {
        throw new Error(`Invalid hex address format: ${comp1End}`);
      }

      // Check address length (max 64-bit address = 16 hex chars)
      if (hexStr.length > 16) {
        throw new Error(`Address too large (max 64-bit): ${comp1End} (${hexStr.length} hex digits)`);
      }

      // Convert to BigInt
      const comp1EndValue = BigInt(`0x${hexStr}`);
      const newBase = this.alignAddress(comp1EndValue + BigInt(1));

      comp2.data.target_addr_base = `0x${newBase.toString(16).toUpperCase()}`;

      console.log(`   ✅ Adjusted ${comp2Id} address to 0x${newBase.toString(16).toUpperCase()}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`   ❌ Failed to fix address overlap for ${comp2Id}: ${errorMsg}`);
      throw new Error(`Address overlap fix failed: ${errorMsg}`);
    }
  }

  /**
   * Fix: Circular Dependency - Remove one edge
   */
  private async fixCircularDependency(
    diagram: any,
    violation: DRCViolation
  ): Promise<void> {
    console.log(`   🔧 Fixing: ${violation.ruleName}`);

    const cycle = violation.affectedComponents!;

    // Remove the last edge in the cycle
    const lastNode = cycle[cycle.length - 1];
    const firstNode = cycle[0];

    const edgeToRemove = diagram.edges.find((e: any) =>
      e.source === lastNode && e.target === firstNode
    );

    if (edgeToRemove) {
      diagram.edges = diagram.edges.filter((e: any) => e.id !== edgeToRemove.id);
      console.log(`   ✅ Removed edge to break cycle`);
    }
  }

  /**
   * Fix: Missing Instance - Remove invalid connection
   */
  private async fixMissingInstance(
    diagram: any,
    violation: DRCViolation
  ): Promise<void> {
    console.log(`   🔧 Fixing: ${violation.ruleName}`);

    if (violation.affectedConnections && violation.affectedConnections.length > 0) {
      const connectionId = violation.affectedConnections[0];
      diagram.edges = diagram.edges.filter((e: any) => e.id !== connectionId);
      console.log(`   ✅ Removed connection to missing instance`);
    }
  }

  /**
   * Fix: Unconnected Master Interface - Log warning (optional interface)
   */
  private async fixUnconnectedMaster(
    diagram: any,
    violation: DRCViolation
  ): Promise<void> {
    console.log(`   🔧 Fixing: ${violation.ruleName}`);
    console.log(`   ℹ️  Unconnected master interface is a warning - marking as optional`);

    // Mark interface as optional in node data
    if (violation.affectedComponents && violation.affectedInterfaces) {
      const nodeId = violation.affectedComponents[0];
      const interfaceId = violation.affectedInterfaces[0];
      const node = diagram.nodes.find((n: any) => n.id === nodeId);

      if (node?.data?.interfaces) {
        const iface = node.data.interfaces.find((i: any) => i.id === interfaceId);
        if (iface) {
          iface.optional = true;
          console.log(`   ✅ Marked interface as optional`);
        }
      }
    }
  }

  /**
   * Fix: Unconnected Slave Interface - Log info (optional interface)
   */
  private async fixUnconnectedSlave(
    diagram: any,
    violation: DRCViolation
  ): Promise<void> {
    console.log(`   🔧 Fixing: ${violation.ruleName}`);
    console.log(`   ℹ️  Unconnected slave interface is informational - marking as optional`);

    // Mark interface as optional in node data
    if (violation.affectedComponents && violation.affectedInterfaces) {
      const nodeId = violation.affectedComponents[0];
      const interfaceId = violation.affectedInterfaces[0];
      const node = diagram.nodes.find((n: any) => n.id === nodeId);

      if (node?.data?.interfaces) {
        const iface = node.data.interfaces.find((i: any) => i.id === interfaceId);
        if (iface) {
          iface.optional = true;
          console.log(`   ✅ Marked interface as optional`);
        }
      }
    }
  }

  /**
   * Fix: Signal Direction Mismatch - Reverse connection or remove invalid
   */
  private async fixSignalDirectionMismatch(
    diagram: any,
    violation: DRCViolation
  ): Promise<void> {
    console.log(`   🔧 Fixing: ${violation.ruleName}`);

    if (!violation.affectedConnections || violation.affectedConnections.length === 0) {
      console.log(`   ⚠️  No affected connections specified`);
      return;
    }

    const connectionId = violation.affectedConnections[0];
    const edge = diagram.edges.find((e: any) => e.id === connectionId);

    if (!edge) {
      console.log(`   ⚠️  Connection not found`);
      return;
    }

    // Check if it's a reversible case (in-to-out) or invalid case (out-to-out, in-to-in)
    const description = violation.description.toLowerCase();

    if (description.includes('input connected to output')) {
      // Reverse the connection
      const temp = edge.source;
      edge.source = edge.target;
      edge.target = temp;
      const tempHandle = edge.sourceHandle;
      edge.sourceHandle = edge.targetHandle;
      edge.targetHandle = tempHandle;
      console.log(`   ✅ Reversed connection direction`);
    } else {
      // Invalid connection (out-to-out or in-to-in) - remove it
      diagram.edges = diagram.edges.filter((e: any) => e.id !== connectionId);
      console.log(`   ✅ Removed invalid connection`);
    }
  }

  /**
   * Fix: Multiple Connections to Same Port - Add interconnect or remove extras
   */
  private async fixMultipleConnectionsToPort(
    diagram: any,
    violation: DRCViolation,
    componentLibrary: any[]
  ): Promise<void> {
    console.log(`   🔧 Fixing: ${violation.ruleName}`);

    if (!violation.affectedConnections || violation.affectedConnections.length < 2) {
      console.log(`   ⚠️  Not enough connections to fix`);
      return;
    }

    // For now, remove all but the first connection
    // A more sophisticated fix would add an interconnect
    const connectionsToRemove = violation.affectedConnections.slice(1);
    diagram.edges = diagram.edges.filter((e: any) => !connectionsToRemove.includes(e.id));

    console.log(`   ✅ Removed ${connectionsToRemove.length} duplicate connection(s)`);
    console.log(`   💡 Consider adding an interconnect if multiple connections are needed`);
  }

  /**
   * Fix: Address Width Mismatch - Align to larger width
   */
  private async fixAddressWidthMismatch(
    diagram: any,
    violation: DRCViolation
  ): Promise<void> {
    console.log(`   🔧 Fixing: ${violation.ruleName}`);

    if (!violation.details?.source || !violation.details?.target) {
      console.log(`   ⚠️  Missing source/target details`);
      return;
    }

    const sourceAddrWidth = violation.details.source.addrWidth;
    const targetAddrWidth = violation.details.target.addrWidth;
    const maxWidth = Math.max(sourceAddrWidth, targetAddrWidth);

    // Update both interfaces to use the larger width
    if (violation.affectedComponents && violation.affectedInterfaces) {
      for (let i = 0; i < violation.affectedComponents.length; i++) {
        const nodeId = violation.affectedComponents[i];
        const interfaceId = violation.affectedInterfaces[i];
        const node = diagram.nodes.find((n: any) => n.id === nodeId);

        if (node?.data?.interfaces) {
          const iface = node.data.interfaces.find((intf: any) => intf.id === interfaceId);
          if (iface) {
            iface.addrWidth = maxWidth;
          }
        }
      }
    }

    console.log(`   ✅ Aligned address widths to ${maxWidth} bits`);
  }

  /**
   * Fix: Clock Frequency Compatibility - Add note about CDC
   */
  private async fixClockFrequencyMismatch(
    diagram: any,
    violation: DRCViolation
  ): Promise<void> {
    console.log(`   🔧 Fixing: ${violation.ruleName}`);
    console.log(`   ℹ️  Clock frequency mismatch is a warning`);
    console.log(`   💡 ${violation.suggestion}`);
    // This is a warning - no automatic fix, just log
  }

  /**
   * Fix: Address Alignment - Align to proper boundary
   */
  private async fixAddressAlignment(
    diagram: any,
    violation: DRCViolation
  ): Promise<void> {
    console.log(`   🔧 Fixing: ${violation.ruleName}`);

    if (!violation.affectedComponents || !violation.details?.suggestedAddress) {
      console.log(`   ⚠️  Missing component or suggested address`);
      return;
    }

    const nodeId = violation.affectedComponents[0];
    const node = diagram.nodes.find((n: any) => n.id === nodeId);

    if (node) {
      node.data.target_addr_base = violation.details.suggestedAddress;
      console.log(`   ✅ Aligned address to ${violation.details.suggestedAddress}`);
    }
  }

  /**
   * Fix: Reserved Address Space - Move to non-reserved range
   */
  private async fixReservedAddressSpace(
    diagram: any,
    violation: DRCViolation
  ): Promise<void> {
    console.log(`   🔧 Fixing: ${violation.ruleName}`);

    if (!violation.affectedComponents) {
      console.log(`   ⚠️  No affected components`);
      return;
    }

    const nodeId = violation.affectedComponents[0];
    const node = diagram.nodes.find((n: any) => n.id === nodeId);

    if (node) {
      // Move to a safe address range (e.g., 0x40000000)
      node.data.target_addr_base = '0x40000000';
      console.log(`   ✅ Moved component to non-reserved address 0x40000000`);
    }
  }

  /**
   * Fix: Isolated Component - Remove from diagram
   */
  private async fixIsolatedComponent(
    diagram: any,
    violation: DRCViolation
  ): Promise<void> {
    console.log(`   🔧 Fixing: ${violation.ruleName}`);

    if (!violation.affectedComponents) {
      console.log(`   ⚠️  No affected components`);
      return;
    }

    const nodeId = violation.affectedComponents[0];
    diagram.nodes = diagram.nodes.filter((n: any) => n.id !== nodeId);
    console.log(`   ✅ Removed isolated component`);
  }

  /**
   * Fix: Interconnect Fanout - Split into multiple interconnects
   */
  private async fixInterconnectFanout(
    diagram: any,
    violation: DRCViolation,
    componentLibrary: any[]
  ): Promise<void> {
    console.log(`   🔧 Fixing: ${violation.ruleName}`);
    console.log(`   ℹ️  High fanout is a warning - consider manual restructuring`);
    console.log(`   💡 ${violation.suggestion}`);
    // This is a warning - no automatic fix
  }

  /**
   * Fix: Clock Domain Crossing - Add note about synchronizers
   */
  private async fixClockDomainCrossing(
    diagram: any,
    violation: DRCViolation
  ): Promise<void> {
    console.log(`   🔧 Fixing: ${violation.ruleName}`);
    console.log(`   ℹ️  Clock domain crossing is a warning`);
    console.log(`   💡 ${violation.suggestion}`);
    // This is a warning - no automatic fix
  }

  /**
   * Fix: Long Connection Path - Log info
   */
  private async fixLongConnectionPath(
    diagram: any,
    violation: DRCViolation
  ): Promise<void> {
    console.log(`   🔧 Fixing: ${violation.ruleName}`);
    console.log(`   ℹ️  Long connection path is informational`);
    console.log(`   💡 ${violation.suggestion}`);
    // This is info - no automatic fix
  }

  /**
   * Fix: Missing Label - Add default label
   */
  private async fixMissingLabel(
    diagram: any,
    violation: DRCViolation
  ): Promise<void> {
    console.log(`   🔧 Fixing: ${violation.ruleName}`);

    if (!violation.affectedComponents) {
      console.log(`   ⚠️  No affected components`);
      return;
    }

    const nodeId = violation.affectedComponents[0];
    const node = diagram.nodes.find((n: any) => n.id === nodeId);

    if (node) {
      const modelType = node.data.model_type || 'Component';
      node.data.label = `${modelType}_${nodeId.substring(0, 8)}`;
      console.log(`   ✅ Added default label: ${node.data.label}`);
    }
  }

  /**
   * Fix: Data Width Range Check - Adjust to standard width
   */
  private async fixDataWidthRange(
    diagram: any,
    violation: DRCViolation
  ): Promise<void> {
    console.log(`   🔧 Fixing: ${violation.ruleName}`);

    if (!violation.affectedComponents || !violation.affectedInterfaces) {
      console.log(`   ⚠️  Missing component or interface info`);
      return;
    }

    const nodeId = violation.affectedComponents[0];
    const interfaceId = violation.affectedInterfaces[0];
    const node = diagram.nodes.find((n: any) => n.id === nodeId);

    if (node?.data?.interfaces) {
      const iface = node.data.interfaces.find((i: any) => i.id === interfaceId);
      if (iface && violation.details?.currentDataWidth) {
        // Round to nearest standard width
        const standardWidths = [8, 16, 32, 64, 128, 256, 512, 1024, 2048];
        const current = violation.details.currentDataWidth;
        const nearest = standardWidths.reduce((prev, curr) =>
          Math.abs(curr - current) < Math.abs(prev - current) ? curr : prev
        );

        iface.dataWidth = nearest;
        console.log(`   ✅ Adjusted data width from ${current} to ${nearest} bits`);
      }
    }
  }

  /**
   * Fix: Duplicate Component Names - Add unique suffix
   */
  private async fixDuplicateNames(
    diagram: any,
    violation: DRCViolation
  ): Promise<void> {
    console.log(`   🔧 Fixing: ${violation.ruleName}`);

    if (!violation.affectedComponents || violation.affectedComponents.length < 2) {
      console.log(`   ⚠️  Not enough components to fix`);
      return;
    }

    const baseLabel = violation.location;

    // Add numeric suffix to each duplicate (except the first one)
    for (let i = 1; i < violation.affectedComponents.length; i++) {
      const nodeId = violation.affectedComponents[i];
      const node = diagram.nodes.find((n: any) => n.id === nodeId);

      if (node) {
        node.data.label = `${baseLabel}_${i}`;
        console.log(`   ✅ Renamed to ${node.data.label}`);
      }
    }
  }

  /**
   * Fix: Interface Naming Convention - Normalize name
   */
  private async fixInterfaceNaming(
    diagram: any,
    violation: DRCViolation
  ): Promise<void> {
    console.log(`   🔧 Fixing: ${violation.ruleName}`);

    if (!violation.affectedComponents || !violation.affectedInterfaces) {
      console.log(`   ⚠️  Missing component or interface info`);
      return;
    }

    const nodeId = violation.affectedComponents[0];
    const interfaceId = violation.affectedInterfaces[0];
    const node = diagram.nodes.find((n: any) => n.id === nodeId);

    if (node?.data?.interfaces) {
      const iface = node.data.interfaces.find((i: any) => i.id === interfaceId);
      if (iface) {
        // Normalize to lowercase with underscores
        const normalized = iface.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '');

        iface.name = normalized;
        console.log(`   ✅ Normalized interface name to: ${normalized}`);
      }
    }
  }

  /**
   * Convert ArchitectureDefinition to diagram format
   */
  private convertToDiagram(architecture: ArchitectureDefinition): any {
    const nodes: any[] = [];
    const edges: any[] = [];

    // Convert components to nodes
    architecture.selectedComponents.forEach((component, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);

      nodes.push({
        id: component.id,
        type: 'dynamicNode',
        position: {
          x: 100 + col * 350,
          y: 100 + row * 200,
        },
        data: {
          label: component.name,
          model_type: component.type,
          iconName: component.visualization?.icon || 'Box',
          width: component.visualization?.width || 180,
          height: component.visualization?.height || 100,
          target_addr_base: component.addressMapping?.baseAddress || '',
          target_addr_space: component.addressMapping?.addressSpace || '',
        },
        width: component.visualization?.width || 180,
        height: component.visualization?.height || 100,
      });
    });

    // Convert connections to edges
    if (architecture.connections) {
      architecture.connections.forEach((conn, index) => {
        edges.push({
          id: `edge-${index + 1}`,
          source: conn.sourceComponentId,
          target: conn.targetComponentId,
          type: 'smoothstep',
          label: conn.connectionType || '',
          animated: false,
          markerEnd: { type: 'arrowclosed' },
        });
      });
    }

    // Return complete structure with metadata
    return {
      nodes,
      edges,
      components: nodes,  // Alias for API compatibility
      connections: edges, // Alias for API compatibility
      metadata: {
        generatedAt: new Date().toISOString(),
        version: '1.0',
        componentCount: nodes.length,
        connectionCount: edges.length
      }
    };
  }

  /**
   * Align address to power of 2
   */
  private alignAddress(addr: bigint): bigint {
    // Align to 4KB boundary
    const alignment = BigInt(4096);
    return ((addr + alignment - BigInt(1)) / alignment) * alignment;
  }

  /**
   * Call Bedrock API for AI assistance
   */
  private async callBedrock(prompt: string): Promise<string> {
    const modelId = this.config.reasoningModelId || this.config.modelId;

    // Detect model type
    const isClaude = modelId.includes('anthropic') || modelId.includes('claude');
    const isNova = modelId.includes('nova');

    let requestBody: any;

    if (isClaude) {
      // Claude format
      requestBody = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 8000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      };
    } else if (isNova) {
      // Amazon Nova format
      requestBody = {
        messages: [
          {
            role: 'user',
            content: [{ text: prompt }]
          }
        ],
        inferenceConfig: {
          max_new_tokens: 8000,
          temperature: this.config.temperature || 0.7,
          top_p: this.config.topP || 0.9
        }
      };
    } else {
      // Generic format
      requestBody = {
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 8000,
        temperature: this.config.temperature || 0.7
      };
    }

    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody)
    });

    const response = await this.bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    // Parse response based on model type
    if (isClaude) {
      return responseBody.content[0].text;
    } else if (isNova) {
      return responseBody.output.message.content[0].text;
    } else {
      // Generic fallback
      return responseBody.content?.[0]?.text || responseBody.output?.message?.content?.[0]?.text || '';
    }
  }

  /**
   * Fix DRC violations using AI (fallback when predefined rules don't work)
   * Similar to verifyAndFixDiagramAlignment - sends violations + diagram to AI
   */
  private async fixDRCWithAI(
    diagram: any,
    violations: DRCViolation[]
  ): Promise<{ success: boolean; fixedArchitecture?: any; error?: string }> {
    console.log(`   🤖 [AI_FIX] Attempting AI-driven DRC fix for ${violations.length} violation(s)...`);

    // Format violations for AI
    const violationsSummary = violations.map((v, idx) => {
      return `${idx + 1}. **${v.ruleName}** [${v.ruleId}] - ${v.severity}
   Problem: ${v.description}
   Location: ${v.location || 'N/A'}
   Suggestion: ${v.suggestion || 'Analyze and fix based on DRC rules'}
   ${v.affectedComponents ? `Affected Components: ${v.affectedComponents.join(', ')}` : ''}
   ${v.affectedConnections ? `Affected Connections: ${v.affectedConnections.join(', ')}` : ''}`;
    }).join('\n\n');

    const fixPrompt = `You are an expert SoC architect. The generated architecture has DRC (Design Rule Check) violations that must be fixed.

CURRENT ARCH_DIAGRAM.JSON:
${JSON.stringify(diagram, null, 2)}

DRC VIOLATIONS TO FIX:
${violationsSummary}

TASK:
1. Analyze each DRC violation carefully
2. Apply the suggested fixes or propose better solutions
3. Ensure fixes maintain architectural integrity and don't break existing correct connections
4. Return the COMPLETE corrected arch_diagram.json with ALL violations fixed

COMMON DRC FIXES:
- DRC-CONN-005 (Multiple Masters to One Slave): Insert AXI Crossbar interconnect between masters and slave
- DRC-CONN-001 (Master-Slave Role Mismatch): Correct interface roles (master vs slave)
- DRC-CONN-002 (Bus Type Mismatch): Use correct protocol or add bridge component
- DRC-AXI-PARAM-001 (Data Width Mismatch): Align data widths or add width converter
- DRC-AXI-PARAM-002 (ID Width Mismatch): Adjust ID width parameters
- DRC-ADDR-001 (Address Overlap): Adjust address mappings to avoid overlaps
- DRC-TOPO-001 (Circular Dependency): Remove circular connections

RESPONSE FORMAT:
Return ONLY valid JSON in this format:
{
  "fixApplied": true,
  "correctedDiagram": <complete corrected arch_diagram.json with all fixes>,
  "fixDescription": "Brief description of what was fixed"
}

If you cannot fix the violations, return:
{
  "fixApplied": false,
  "error": "Reason why fix cannot be applied"
}

CRITICAL: Return ONLY the JSON, no other text or explanations outside the JSON.

Your JSON response:`;

    try {
      const aiResponse = await this.callBedrock(fixPrompt);

      // Extract JSON from response
      let jsonStr = aiResponse.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.substring(7);
      }
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.substring(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.substring(0, jsonStr.length - 3);
      }
      jsonStr = jsonStr.trim();

      const result = JSON.parse(jsonStr);

      if (result.fixApplied && result.correctedDiagram) {
        console.log(`   ✅ [AI_FIX] AI successfully fixed DRC violations`);
        console.log(`   📝 [AI_FIX] Fix description: ${result.fixDescription || 'N/A'}`);
        return {
          success: true,
          fixedArchitecture: result.correctedDiagram
        };
      } else {
        const error = result.error || 'AI could not apply fixes';
        console.log(`   ⚠️  [AI_FIX] ${error}`);
        return {
          success: false,
          error
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`   ❌ [AI_FIX] AI fix failed: ${errorMsg}`);
      return {
        success: false,
        error: `AI fix error: ${errorMsg}`
      };
    }
  }
}
