// Architecture Analytics API Client

import { apiClient } from './api-client';

export interface DataFlow {
  id: string;
  name: string;
  type: 'memory_access' | 'peripheral_access' | 'dma' | 'accelerator' | 'p2p' | 'unknown';
  source: {
    id: string;
    label: string;
    type: string;
  };
  sink: {
    id: string;
    label: string;
    type: string;
  };
  path: Array<{
    id: string;
    label: string;
    type: string;
  }>;
  edges: string[];
  protocol?: string;
}

export interface PerformanceMetrics {
  flowId: string;
  flowName: string;
  maxThroughput: number;
  bottleneckComponent: {
    id: string;
    label: string;
    type: string;
  };
  bottleneckReason: string;
  estimatedLatency: number;
  dataWidth?: number;
  frequency?: number;
  efficiency: number;
  details: ComponentPerformance[];
}

export interface ComponentPerformance {
  componentId: string;
  componentLabel: string;
  componentType: string;
  dataWidth: number;
  frequency: number;
  bandwidth: number;
  latency: number;
  isBottleneck: boolean;
}

export interface ContentionAnalysis {
  sharedComponent: {
    id: string;
    label: string;
    type: string;
  };
  competingFlows: Array<{
    flowId: string;
    flowName: string;
    requestedBandwidth: number;
  }>;
  totalDemand: number;
  availableBandwidth: number;
  contentionRatio: number;
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  worstCaseLatency: number;
  recommendation: string;
  fairShareBandwidth: number;
}

export interface AnalyticsReport {
  timestamp: string;
  diagram: {
    nodeCount: number;
    edgeCount: number;
  };
  flows: {
    total: number;
    byType: {
      memory_access: number;
      peripheral_access: number;
      dma: number;
      accelerator: number;
      p2p: number;
      unknown: number;
    };
    list: DataFlow[];
  };
  performance: {
    metrics: PerformanceMetrics[];
    summary: {
      avgThroughput: number;
      maxThroughput: number;
      minThroughput: number;
      avgLatency: number;
      bottleneckDistribution: Record<string, number>;
      avgEfficiency: number;
    };
  };
  contention: {
    analyses: ContentionAnalysis[];
    summary: {
      totalContentionPoints: number;
      criticalContentions: number;
      highContentions: number;
      mediumContentions: number;
      affectedFlows: number;
      overallContentionScore: number;
    };
  };
  recommendations: string[];
}

/**
 * Analyze complete architecture diagram
 */
export async function analyzeArchitecture(
  diagram: any,
  componentLibrary?: any[],
  projectId?: string,
  config?: {
    globalClockFrequency?: number; // MHz
    selectedFlows?: Array<{ sourceId: string; targetId: string }>; // User-selected flows
  }
): Promise<AnalyticsReport> {
  const response = await apiClient.post('/architecture-analytics/analyze', {
    diagram,
    componentLibrary,
    projectId,
    config
  });
  // Backend returns { success, data: {...}, timestamp, requestId }
  return response.data || response;
}

/**
 * Load saved analytics for a project
 */
export async function loadProjectAnalytics(projectId: string): Promise<AnalyticsReport | null> {
  try {
    const response = await apiClient.get(`/architecture-analytics/project/${projectId}`);
    return response.data || response;
  } catch (error: any) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Get data flows for a diagram
 */
export async function getDataFlows(
  diagram: any,
  componentLibrary?: any[]
): Promise<{
  total: number;
  flows: DataFlow[];
  byType: Record<string, DataFlow[]>;
  sharedComponents: Array<{
    componentId: string;
    componentLabel: string;
    flowCount: number;
    flowIds: string[];
  }>;
}> {
  const response = await apiClient.post('/architecture-analytics/flows', {
    diagram,
    componentLibrary
  });
  return response.data || response;
}

/**
 * Get performance analysis for flows
 */
export async function getPerformanceAnalysis(
  diagram: any,
  flows?: DataFlow[],
  componentLibrary?: any[]
): Promise<{
  metrics: PerformanceMetrics[];
  summary: any;
}> {
  const response = await apiClient.post('/architecture-analytics/performance', {
    diagram,
    flows,
    componentLibrary
  });
  return response.data || response;
}

/**
 * Get contention analysis
 */
export async function getContentionAnalysis(
  diagram: any,
  flows?: DataFlow[],
  performanceMetrics?: PerformanceMetrics[],
  componentLibrary?: any[]
): Promise<{
  contentions: ContentionAnalysis[];
  summary: any;
}> {
  const response = await apiClient.post('/architecture-analytics/contention', {
    diagram,
    flows,
    performanceMetrics,
    componentLibrary
  });
  return response.data || response;
}
