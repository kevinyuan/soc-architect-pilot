// Contention Analyzer Service
// Analyzes resource contention when multiple data flows compete for shared components

import { DataFlow } from './flow-analyzer';
import { PerformanceMetrics } from './performance-analyzer';

export interface ContentionAnalysis {
  sharedComponent: {
    id: string;
    label: string;
    type: string;
  };
  competingFlows: Array<{
    flowId: number | string; // 8-bit flow ID or auto-generated string
    flowName: string;
    requestedBandwidth: number;
  }>;
  totalDemand: number; // MB/s
  availableBandwidth: number; // MB/s
  contentionRatio: number; // totalDemand / availableBandwidth
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  worstCaseLatency: number; // nanoseconds
  recommendation: string;
  fairShareBandwidth: number; // MB/s per flow
}

export interface ContentionSummary {
  totalContentionPoints: number;
  criticalContentions: number;
  highContentions: number;
  mediumContentions: number;
  affectedFlows: number;
  overallContentionScore: number; // 0-100, higher is worse
}

interface ArchitectureDiagram {
  nodes: Array<{
    id: string;
    data: Record<string, any>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
  }>;
}

export class ContentionAnalyzer {
  /**
   * Analyze contention for all shared components
   */
  analyzeContention(
    flows: DataFlow[],
    performanceMetrics: PerformanceMetrics[],
    diagram: ArchitectureDiagram
  ): ContentionAnalysis[] {
    const contentions: ContentionAnalysis[] = [];

    // Find all shared components
    const sharedComponents = this.findSharedComponents(flows);

    // Analyze each shared component
    for (const [componentId, flowIds] of sharedComponents.entries()) {
      const node = diagram.nodes.find(n => n.id === componentId);
      if (!node) continue;

      const analysis = this.analyzeComponentContention(
        componentId,
        node,
        flowIds,
        flows,
        performanceMetrics
      );

      if (analysis) {
        contentions.push(analysis);
      }
    }

    // Sort by severity and contention ratio
    contentions.sort((a, b) => {
      const severityOrder = { critical: 5, high: 4, medium: 3, low: 2, none: 1 };
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.contentionRatio - a.contentionRatio;
    });

    return contentions;
  }

  /**
   * Find components that are shared by multiple flows
   */
  private findSharedComponents(flows: DataFlow[]): Map<string, string[]> {
    const componentToFlows = new Map<string, Array<number | string>>();

    for (const flow of flows) {
      for (const component of flow.path) {
        if (!componentToFlows.has(component.id)) {
          componentToFlows.set(component.id, []);
        }
        const flowList = componentToFlows.get(component.id)!;
        const flowId = flow.id;
        if (!flowList.includes(flowId)) {
          flowList.push(flowId);
        }
      }
    }

    // Filter to only shared components (used by multiple flows)
    const sharedComponents = new Map<string, Array<number | string>>();
    for (const [componentId, flowIds] of componentToFlows.entries()) {
      if (flowIds.length > 1) {
        sharedComponents.set(componentId, flowIds);
      }
    }

    return sharedComponents;
  }

  /**
   * Analyze contention for a single shared component
   */
  private analyzeComponentContention(
    componentId: string,
    node: any,
    flowIds: string[],
    flows: DataFlow[],
    performanceMetrics: PerformanceMetrics[]
  ): ContentionAnalysis | null {
    const label = node.data.label || 'Unknown';
    const type = node.data.model_type || node.data.category || 'Unknown';

    // Get the flows using this component
    const competingFlows = flowIds.map(flowId => {
      const flow = flows.find(f => f.id == flowId); // Use == for loose comparison
      const metrics = performanceMetrics.find(m => m.flowId == flowId); // Use == for loose comparison
      return {
        flowId,
        flowName: flow?.name || String(flowId),
        requestedBandwidth: metrics?.maxThroughput || 0
      };
    });

    // Calculate total demand
    const totalDemand = competingFlows.reduce((sum, f) => sum + f.requestedBandwidth, 0);

    // Get component's available bandwidth
    const componentMetrics = this.getComponentMetrics(componentId, performanceMetrics);
    const availableBandwidth = componentMetrics?.bandwidth || this.estimateComponentBandwidth(node);

    // Calculate contention ratio
    const contentionRatio = availableBandwidth > 0 ? totalDemand / availableBandwidth : 0;

    // Determine severity
    const severity = this.calculateSeverity(contentionRatio);

    // Calculate worst-case latency
    const worstCaseLatency = this.calculateWorstCaseLatency(
      competingFlows.length,
      componentMetrics?.latency || 10,
      availableBandwidth,
      totalDemand
    );

    // Generate recommendation
    const recommendation = this.generateRecommendation(
      type,
      contentionRatio,
      competingFlows.length,
      availableBandwidth,
      totalDemand
    );

    // Calculate fair share bandwidth
    const fairShareBandwidth = availableBandwidth / competingFlows.length;

    return {
      sharedComponent: {
        id: componentId,
        label,
        type
      },
      competingFlows,
      totalDemand: Math.round(totalDemand * 100) / 100,
      availableBandwidth: Math.round(availableBandwidth * 100) / 100,
      contentionRatio: Math.round(contentionRatio * 100) / 100,
      severity,
      worstCaseLatency: Math.round(worstCaseLatency * 100) / 100,
      recommendation,
      fairShareBandwidth: Math.round(fairShareBandwidth * 100) / 100
    };
  }

  /**
   * Get component metrics from performance analysis
   */
  private getComponentMetrics(
    componentId: string,
    performanceMetrics: PerformanceMetrics[]
  ): { bandwidth: number; latency: number } | null {
    // Find the component in any flow's details
    for (const metrics of performanceMetrics) {
      const componentDetail = metrics.details.find(d => d.componentId === componentId);
      if (componentDetail) {
        return {
          bandwidth: componentDetail.bandwidth,
          latency: componentDetail.latency
        };
      }
    }
    return null;
  }

  /**
   * Estimate component bandwidth from node data
   */
  private estimateComponentBandwidth(node: any): number {
    const type = node.data.model_type || node.data.category || 'Unknown';

    // Default bandwidths for common types (MB/s)
    const defaultBandwidths: Record<string, number> = {
      Interconnect: 8000, // 64GB/s (128-bit @ 500MHz)
      CPU: 12000,
      Memory: 25600, // DDR4
      DDR: 25600,
      DDR4: 25600,
      RAM: 16000,
      Bridge: 3200,
      DMA: 6400,
      NPU: 12800,
      GPU: 30720,
      Accelerator: 12800,
      Connectivity: 400,
      Peripheral: 200,
      Storage: 3200
    };

    // Try to parse from node data
    if (node.data.bandwidth) {
      const parsed = this.parseBandwidth(node.data.bandwidth);
      if (parsed > 0) return parsed;
    }

    return defaultBandwidths[type] || 1000;
  }

  /**
   * Parse bandwidth from string format
   */
  private parseBandwidth(value: string): number {
    const gbpsMatch = value.match(/([\d.]+)\s*GB\/s/i);
    if (gbpsMatch) return parseFloat(gbpsMatch[1]) * 1000;

    const mbpsMatch = value.match(/([\d.]+)\s*MB\/s/i);
    if (mbpsMatch) return parseFloat(mbpsMatch[1]);

    return 0;
  }

  /**
   * Calculate contention severity
   */
  private calculateSeverity(contentionRatio: number): ContentionAnalysis['severity'] {
    if (contentionRatio <= 0.5) return 'none';
    if (contentionRatio <= 0.8) return 'low';
    if (contentionRatio <= 1.0) return 'medium';
    if (contentionRatio <= 1.5) return 'high';
    return 'critical';
  }

  /**
   * Calculate worst-case latency with contention
   */
  private calculateWorstCaseLatency(
    flowCount: number,
    baseLatency: number,
    availableBandwidth: number,
    totalDemand: number
  ): number {
    // Base latency in cycles, convert to nanoseconds (assuming 500MHz)
    const cycleTimeNs = 2; // 500MHz = 2ns per cycle
    let latencyNs = baseLatency * cycleTimeNs;

    // Add arbitration overhead
    const arbitrationOverheadNs = (flowCount - 1) * 10; // ~10ns per additional flow
    latencyNs += arbitrationOverheadNs;

    // If oversubscribed, add queueing delay
    if (totalDemand > availableBandwidth) {
      const oversubscriptionFactor = totalDemand / availableBandwidth;
      latencyNs *= oversubscriptionFactor;
    }

    return latencyNs;
  }

  /**
   * Generate recommendation based on contention analysis
   */
  private generateRecommendation(
    componentType: string,
    contentionRatio: number,
    flowCount: number,
    availableBandwidth: number,
    totalDemand: number
  ): string {
    if (contentionRatio <= 0.5) {
      return 'No action needed. Component has sufficient bandwidth for all flows.';
    }

    const recommendations: string[] = [];

    if (contentionRatio > 1.5) {
      recommendations.push('CRITICAL: Severe bandwidth contention detected.');
    } else if (contentionRatio > 1.0) {
      recommendations.push('WARNING: Bandwidth demand exceeds capacity.');
    }

    if (componentType === 'Interconnect') {
      if (flowCount > 4) {
        recommendations.push('Consider adding additional interconnects or using hierarchical topology.');
      }
      if (contentionRatio > 1.0) {
        recommendations.push('Upgrade interconnect to wider bus width or higher frequency.');
      }
      recommendations.push('Implement QoS policies to prioritize critical flows.');
    } else if (componentType === 'Memory' || componentType === 'DDR') {
      if (contentionRatio > 1.0) {
        recommendations.push('Consider dual-channel or quad-channel memory configuration.');
        recommendations.push('Add memory controller optimization or caching.');
      }
    } else if (componentType === 'Bridge') {
      recommendations.push('Bridge may be a bottleneck. Consider direct connection or faster bridge.');
    } else {
      if (contentionRatio > 1.0) {
        recommendations.push(`Upgrade ${componentType} to higher bandwidth or add additional instances.`);
      }
    }

    // Add time-division recommendation
    if (flowCount > 2 && contentionRatio > 0.8) {
      recommendations.push('Consider time-division scheduling to avoid simultaneous access.');
    }

    // Add bandwidth reduction recommendation
    const excessBandwidth = totalDemand - availableBandwidth;
    if (excessBandwidth > 0) {
      const reductionPercentage = Math.round((excessBandwidth / totalDemand) * 100);
      recommendations.push(
        `Reduce total bandwidth demand by ${reductionPercentage}% through optimization or flow reduction.`
      );
    }

    return recommendations.join(' ');
  }

  /**
   * Get contention summary
   */
  getContentionSummary(contentions: ContentionAnalysis[], flows: DataFlow[]): ContentionSummary {
    const criticalContentions = contentions.filter(c => c.severity === 'critical').length;
    const highContentions = contentions.filter(c => c.severity === 'high').length;
    const mediumContentions = contentions.filter(c => c.severity === 'medium').length;

    // Count unique flows affected by contention
    const affectedFlowsSet = new Set<number | string>();
    contentions.forEach(c => {
      c.competingFlows.forEach(f => affectedFlowsSet.add(f.flowId));
    });

    // Calculate overall contention score (0-100)
    let score = 0;
    if (contentions.length > 0) {
      score += criticalContentions * 20;
      score += highContentions * 10;
      score += mediumContentions * 5;
      score = Math.min(score, 100);
    }

    return {
      totalContentionPoints: contentions.length,
      criticalContentions,
      highContentions,
      mediumContentions,
      affectedFlows: affectedFlowsSet.size,
      overallContentionScore: score
    };
  }

  /**
   * Calculate bandwidth distribution among competing flows
   */
  calculateBandwidthDistribution(
    contention: ContentionAnalysis,
    schedulingPolicy: 'fair-share' | 'weighted' | 'priority' = 'fair-share'
  ): Array<{ flowId: number | string; allocatedBandwidth: number; percentage: number }> {
    const distribution: Array<{ flowId: number | string; allocatedBandwidth: number; percentage: number }> = [];

    if (schedulingPolicy === 'fair-share') {
      // Equal distribution
      const fairShare = contention.availableBandwidth / contention.competingFlows.length;
      contention.competingFlows.forEach(flow => {
        distribution.push({
          flowId: flow.flowId,
          allocatedBandwidth: Math.round(fairShare * 100) / 100,
          percentage: 100 / contention.competingFlows.length
        });
      });
    } else if (schedulingPolicy === 'weighted') {
      // Weighted by requested bandwidth
      contention.competingFlows.forEach(flow => {
        const weight = flow.requestedBandwidth / contention.totalDemand;
        const allocated = contention.availableBandwidth * weight;
        distribution.push({
          flowId: flow.flowId,
          allocatedBandwidth: Math.round(allocated * 100) / 100,
          percentage: Math.round(weight * 100 * 100) / 100
        });
      });
    }

    return distribution;
  }
}

// Singleton instance
export const contentionAnalyzer = new ContentionAnalyzer();
