'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AnalyzingOverlay } from './AnalyzingOverlay';
import {
  Activity,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Zap,
  Clock,
  BarChart3,
  Network,
  Info,
  CheckCircle2,
  XCircle,
  Loader2,
  Settings2,
  ArrowRightToLine,
  ArrowRightFromLine,
  ArrowRightLeft,
  RefreshCw
} from 'lucide-react';
import {
  analyzeArchitecture,
  type AnalyticsReport,
  type DataFlow,
  type PerformanceMetrics,
  type ContentionAnalysis
} from '@/lib/architecture-analytics-api';
import { cn } from '@/lib/utils';
import { setAppStatusMessage } from './AppStatusBar';

// Flow definition with unique 8-bit ID
interface FlowDefinition {
  flowId: number; // 0x00 - 0xFF (8-bit)
  initiatorNodeId: string;
  initiatorPort?: string;
  targetNodeId: string;
  targetPort?: string;
  label?: string; // Human-readable label
}

interface AnalyticsPanelProps {
  diagram: any;
  componentLibrary?: any[];
  projectId?: string;
  onFlowSelect?: (flowId: string) => void;
}

export function AnalyticsPanel({ diagram: initialDiagram, componentLibrary, projectId, onFlowSelect }: AnalyticsPanelProps) {
  const [diagram, setDiagram] = useState(initialDiagram);
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [flowDefinitions, setFlowDefinitions] = useState<Map<number, FlowDefinition>>(new Map());
  const [nextFlowId, setNextFlowId] = useState(0x01); // Start from 0x01
  const [error, setError] = useState<string | null>(null);
  const [loadedFromCache, setLoadedFromCache] = useState(false);
  const [isOutOfSync, setIsOutOfSync] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [globalClockFrequency, setGlobalClockFrequency] = useState(1000); // MHz, default 1GHz
  const [deviceOrder, setDeviceOrder] = useState<string[]>([]);
  const [draggedDevice, setDraggedDevice] = useState<string | null>(null);
  
  // Threshold settings
  const [efficiencyWarningThreshold, setEfficiencyWarningThreshold] = useState(70); // %
  const [efficiencyErrorThreshold, setEfficiencyErrorThreshold] = useState(50); // %
  const [latencyWarningThreshold, setLatencyWarningThreshold] = useState(100); // ns
  const [latencyErrorThreshold, setLatencyErrorThreshold] = useState(200); // ns

  // Update diagram when prop changes
  useEffect(() => {
    setDiagram(initialDiagram);
  }, [initialDiagram]);

  // Debug logging for state changes
  useEffect(() => {
    console.log('[AnalyticsPanel] State:', {
      flowDefinitionsCount: flowDefinitions.size,
      flowDefinitionIds: Array.from(flowDefinitions.keys()),
      hasReport: !!report,
      reportFlowsCount: report?.flows?.list?.length || 0,
      reportMetricsCount: report?.performance?.metrics?.length || 0
    });
  }, [flowDefinitions, report]);

  // Update status bar based on state
  useEffect(() => {
    if (isOutOfSync && !report) {
      setAppStatusMessage('Diagram updated - re-analyze required', 'warning');
    } else if (!report && flowDefinitions.size > 0) {
      setAppStatusMessage(`${flowDefinitions.size} flow${flowDefinitions.size !== 1 ? 's' : ''} selected - click Analyze`, 'info');
    } else if (!report && flowDefinitions.size === 0) {
      setAppStatusMessage(null);
    } else if (report) {
      setAppStatusMessage(null);
    }

    // Cleanup on unmount
    return () => {
      setAppStatusMessage(null);
    };
  }, [flowDefinitions.size, report, isOutOfSync]);

  // Load saved analytics configuration and flow definitions from S3
  useEffect(() => {
    const loadSavedConfig = async () => {
      if (!projectId || !diagram) return;
      
      try {
        const { workspaceFileAPI } = await import('@/lib/workspace-file-api');
        const s3Data = await workspaceFileAPI.readFile(projectId, 'analytics.json');
        if (s3Data) {
          const data = JSON.parse(s3Data);
          
          // Load flow definitions
          if (data.flowDefinitions && Array.isArray(data.flowDefinitions)) {
            const flowMap = new Map<number, FlowDefinition>();
            let maxId = 0;
            data.flowDefinitions.forEach((flow: FlowDefinition) => {
              flowMap.set(flow.flowId, flow);
              if (flow.flowId > maxId) maxId = flow.flowId;
            });
            setFlowDefinitions(flowMap);
            setNextFlowId(Math.min(maxId + 1, 0xFF)); // Ensure we don't exceed 8-bit
            console.log(`[AnalyticsPanel] Loaded ${flowMap.size} flow definitions from S3`);
          }
          
          // Load other config
          if (data.deviceOrder) setDeviceOrder(data.deviceOrder);
          if (data.globalClockFrequency) {
            setGlobalClockFrequency(data.globalClockFrequency);
          }
          
          // Load performance results if available AND they match current diagram
          if (data.performanceResults) {
            const isValid = validateAnalyticsSync(data.performanceResults, diagram);
            if (isValid) {
              setReport(data.performanceResults);
              setLoadedFromCache(true);
              console.log('[AnalyticsPanel] ✅ Loaded valid cached performance results from S3');
            } else {
              console.log('[AnalyticsPanel] ⚠️ Cached performance results are out of sync with current diagram - ignoring cache');
              setIsOutOfSync(true);
            }
          }
        }
      } catch (error) {
        console.error('[AnalyticsPanel] Failed to load saved config:', error);
      }
    };
    
    loadSavedConfig();
  }, [projectId, diagram]);

  // Toggle flow: add or remove flow definition
  const toggleFlow = async (initiatorNodeId: string, targetNodeId: string, initiatorPort?: string, targetPort?: string) => {
    const newFlowDefs = new Map(flowDefinitions);
    
    // Check if this flow already exists
    const existingFlow = Array.from(newFlowDefs.values()).find(
      f => f.initiatorNodeId === initiatorNodeId && f.targetNodeId === targetNodeId
    );
    
    if (existingFlow) {
      // Remove the flow
      newFlowDefs.delete(existingFlow.flowId);
      console.log(`[AnalyticsPanel] Removed flow #${existingFlow.flowId.toString().padStart(2, '0')}`);
    } else {
      // Add new flow with unique ID
      if (nextFlowId > 0xFF) {
        setError('Maximum number of flows (255) reached');
        return;
      }
      
      const initiatorNode = diagram?.nodes?.find((n: any) => n.id === initiatorNodeId);
      const targetNode = diagram?.nodes?.find((n: any) => n.id === targetNodeId);
      const label = `${initiatorNode?.data?.label || initiatorNodeId} → ${targetNode?.data?.label || targetNodeId}`;
      
      const newFlow: FlowDefinition = {
        flowId: nextFlowId,
        initiatorNodeId,
        initiatorPort,
        targetNodeId,
        targetPort,
        label
      };
      
      newFlowDefs.set(nextFlowId, newFlow);
      console.log(`[AnalyticsPanel] Added flow #${nextFlowId.toString().padStart(2, '0')}: ${label}`);
      setNextFlowId(nextFlowId + 1);
    }
    
    setFlowDefinitions(newFlowDefs);
    
    // Save to S3
    await saveFlowDefinitions(newFlowDefs);
  };

  // Save flow definitions to S3
  const saveFlowDefinitions = async (flows: Map<number, FlowDefinition>) => {
    if (!projectId) return;
    
    try {
      const analyticsData = {
        flowDefinitions: Array.from(flows.values()),
        deviceOrder,
        globalClockFrequency,
        timestamp: new Date().toISOString(),
        performanceResults: report // Keep existing results
      };
      
      const { workspaceFileAPI } = await import('@/lib/workspace-file-api');
      await workspaceFileAPI.writeFile(
        projectId,
        'analytics.json',
        JSON.stringify(analyticsData, null, 2)
      );
      
      console.log(`[AnalyticsPanel] Saved ${flows.size} flow definitions to S3`);
    } catch (error) {
      console.error('[AnalyticsPanel] Failed to save flow definitions:', error);
    }
  };

  // Drag and drop handlers for reordering
  const handleDragStart = (deviceId: string) => {
    setDraggedDevice(deviceId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetDeviceId: string, devices: string[]) => {
    if (!draggedDevice || draggedDevice === targetDeviceId) {
      setDraggedDevice(null);
      return;
    }

    const newOrder = [...devices];
    const draggedIndex = newOrder.indexOf(draggedDevice);
    const targetIndex = newOrder.indexOf(targetDeviceId);

    // Remove dragged item and insert at target position
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedDevice);

    setDeviceOrder(newOrder);
    setDraggedDevice(null);
  };

  // Helper to validate if cached analytics match current diagram
  const validateAnalyticsSync = (analytics: AnalyticsReport, currentDiagram: any): boolean => {
    if (!analytics || !currentDiagram) return false;
    
    // Check if all node IDs in the analytics exist in the current diagram
    const currentNodeIds = new Set(currentDiagram.nodes?.map((n: any) => n.id) || []);
    const analyticsNodeIds = new Set<string>();
    
    // Collect all node IDs referenced in analytics flows
    analytics.flows.list.forEach(flow => {
      analyticsNodeIds.add(flow.source.id);
      analyticsNodeIds.add(flow.sink.id);
      flow.path.forEach(node => {
        const nodeId = typeof node === 'string' ? node : node.id;
        analyticsNodeIds.add(nodeId);
      });
    });
    
    // Check if any analytics node ID is missing from current diagram
    for (const nodeId of analyticsNodeIds) {
      if (!currentNodeIds.has(nodeId)) {
        console.log(`[AnalyticsPanel] Node ID mismatch: ${nodeId} in analytics but not in diagram`);
        return false;
      }
    }
    
    return true;
  };

  // Auto-run analytics if we have flow definitions but no results
  useEffect(() => {
    const autoRunAnalytics = async () => {
      if (!diagram || !projectId || loading || report) {
        return;
      }

      // Auto-run removed - user must manually click Analyze button
    };

    // Small delay to ensure everything is loaded
    const timer = setTimeout(autoRunAnalytics, 500);
    return () => clearTimeout(timer);
  }, [diagram, projectId, flowDefinitions.size, report, loadedFromCache]);

  const handleReloadDesign = async () => {
    if (!projectId) {
      setError('No project loaded');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('[AnalyticsPanel] 🔄 Reloading design...');
      
      // Step 1: Clear analysis results from UI
      setReport(null);
      setLoadedFromCache(false);
      setIsOutOfSync(false);
      
      // Step 2: Clear cached performance results from analytics.json
      const { workspaceFileAPI } = await import('@/lib/workspace-file-api');
      try {
        const analyticsData = {
          flowDefinitions: Array.from(flowDefinitions.values()),
          deviceOrder,
          globalClockFrequency,
          performanceResults: null, // Clear cached results
          timestamp: new Date().toISOString()
        };
        await workspaceFileAPI.writeFile(
          projectId,
          'analytics.json',
          JSON.stringify(analyticsData, null, 2)
        );
        console.log('[AnalyticsPanel] ✅ Cleared cached performance results from analytics.json');
      } catch (clearError) {
        console.warn('[AnalyticsPanel] Failed to clear cached results:', clearError);
      }
      
      // Step 3: Reload fresh diagram from arch_diagram.json
      const diagramContent = await workspaceFileAPI.readFile(projectId, 'arch_diagram.json');
      
      if (!diagramContent) {
        throw new Error('Architecture diagram not found. Please create a design first.');
      }
      
      const freshDiagram = JSON.parse(diagramContent);
      setDiagram(freshDiagram);
      console.log('[AnalyticsPanel] ✅ Reloaded fresh diagram from arch_diagram.json');
      
      // Step 4: Matrix will automatically recalculate based on new diagram
      // Flow definitions are preserved, but user can reselect if needed
      
      console.log('[AnalyticsPanel] ✅ Design reloaded - matrix updated, cache cleared');
    } catch (err) {
      console.error('[AnalyticsPanel] Failed to reload design:', err);
      setError(err instanceof Error ? err.message : 'Failed to reload design');
    } finally {
      setLoading(false);
    }
  };

  const runAnalysis = async () => {
    if (flowDefinitions.size === 0) {
      setError('No flows selected. Please select flows in the Data Flows matrix first.');
      return;
    }

    // Clear status message when starting analysis
    setAppStatusMessage(null);
    
    setLoading(true);
    setError(null);
    setLoadedFromCache(false);
    setIsOutOfSync(false);

    try {
      // Step 1: Clear previous results from UI immediately
      setReport(null);
      console.log('[AnalyticsPanel] 🔄 Starting fresh analytics...');
      
      // Step 2: Always reload fresh diagram from arch_diagram.json
      let freshDiagram = diagram;
      if (projectId) {
        try {
          const { workspaceFileAPI } = await import('@/lib/workspace-file-api');
          const diagramContent = await workspaceFileAPI.readFile(projectId, 'arch_diagram.json');
          if (diagramContent) {
            freshDiagram = JSON.parse(diagramContent);
            setDiagram(freshDiagram);
            console.log('[AnalyticsPanel] ✅ Loaded fresh diagram from arch_diagram.json');
          }
        } catch (err) {
          console.error('[AnalyticsPanel] Failed to reload diagram:', err);
          throw new Error('Failed to load architecture diagram. Please ensure arch_diagram.json exists.');
        }
      }
      
      if (!freshDiagram || !freshDiagram.nodes || freshDiagram.nodes.length === 0) {
        setError('No architecture to analyze. Please create a design first.');
        setLoading(false);
        return;
      }
      
      // Step 3: Convert flow definitions to format expected by backend
      const selectedFlows = Array.from(flowDefinitions.values()).map(flow => ({
        flowId: flow.flowId,
        sourceId: flow.initiatorNodeId,
        targetId: flow.targetNodeId,
        sourcePort: flow.initiatorPort,
        targetPort: flow.targetPort
      }));

      console.log(`[AnalyticsPanel] Analyzing ${selectedFlows.length} flows:`, selectedFlows);
      console.log(`[AnalyticsPanel] Flow keys being sent:`, selectedFlows.map(f => `${f.sourceId}->${f.targetId}`));

      // Step 4: Call backend API to analyze the selected flows using fresh diagram
      // The backend will overwrite analytics.json with new results
      const result = await analyzeArchitecture(
        freshDiagram,
        componentLibrary,
        projectId,
        {
          globalClockFrequency,
          selectedFlows // Pass flow definitions with IDs to backend
        }
      );
      
      // Step 5: Set the result directly from the API response (not from cached file)
      setReport(result);
      console.log('[AnalyticsPanel] ✅ Analytics complete - using fresh results from API');
      
      // Step 6: Save flow definitions and config to analytics.json (backend already saved performance results)
      if (projectId) {
        try {
          const analyticsData = {
            flowDefinitions: Array.from(flowDefinitions.values()),
            deviceOrder,
            globalClockFrequency,
            performanceResults: result,
            timestamp: new Date().toISOString()
          };
          
          const { workspaceFileAPI } = await import('@/lib/workspace-file-api');
          await workspaceFileAPI.writeFile(
            projectId,
            'analytics.json',
            JSON.stringify(analyticsData, null, 2)
          );
          
          console.log('[AnalyticsPanel] ✅ Saved analytics config to S3');
        } catch (saveError) {
          console.error('[AnalyticsPanel] Failed to save analytics config:', saveError);
        }
      }
    } catch (err) {
      console.error('Analytics error:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyze architecture');
    } finally {
      setLoading(false);
    }
  };

  // Save configuration when it changes (now handled by saveFlowDefinitions)
  const saveConfiguration = useCallback(async () => {
    if (!projectId) return;
    await saveFlowDefinitions(flowDefinitions);
  }, [projectId, flowDefinitions]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'destructive';
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      case 'low':
        return 'secondary';
      case 'none':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  const getFlowTypeIcon = (type: string) => {
    switch (type) {
      case 'memory_access':
        return <Activity className="h-4 w-4" />;
      case 'peripheral_access':
        return <Zap className="h-4 w-4" />;
      case 'dma':
        return <TrendingUp className="h-4 w-4" />;
      case 'accelerator':
        return <BarChart3 className="h-4 w-4" />;
      default:
        return <Network className="h-4 w-4" />;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b p-4 flex justify-between items-center bg-background">
        <div>
          <h2 className="text-lg font-semibold">Architecture Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Performance and data flow analysis
            {!report && flowDefinitions.size === 0 && (
              <span className="ml-2 text-xs text-muted-foreground">
                • No flows selected
              </span>
            )}
            {!report && flowDefinitions.size > 0 && (
              <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">
                • {flowDefinitions.size} flow{flowDefinitions.size !== 1 ? 's' : ''} ready for analysis
              </span>
            )}
            {loadedFromCache && report && !isOutOfSync && (
              <span className="ml-2 text-xs text-green-600 dark:text-green-500">
                • Analysis cached ({flowDefinitions.size} flow{flowDefinitions.size !== 1 ? 's' : ''})
              </span>
            )}
            {!loadedFromCache && report && !isOutOfSync && (
              <span className="ml-2 text-xs text-green-600 dark:text-green-500">
                • Analysis complete ({flowDefinitions.size} flow{flowDefinitions.size !== 1 ? 's' : ''})
              </span>
            )}
            {isOutOfSync && (
              <span className="ml-2 text-xs text-orange-600 dark:text-orange-500">
                • Diagram updated - re-analyze required
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowConfig(true)}>
            <Settings2 className="h-4 w-4 mr-2" />
            Configure
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleReloadDesign} 
            disabled={loading}
            title="Reload architecture diagram from arch_diagram.json and clear cached analytics"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Reload Design
          </Button>
          <Button onClick={runAnalysis} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Activity className="mr-2 h-4 w-4" />
                Analyze
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Configuration Dialog */}
      <Dialog open={showConfig} onOpenChange={setShowConfig}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Analytics Configuration</DialogTitle>
            <DialogDescription>
              Configure global parameters for architecture analysis
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label htmlFor="clock-freq">Global Clock Frequency (MHz)</Label>
              <Input
                id="clock-freq"
                type="number"
                value={globalClockFrequency}
                onChange={(e) => setGlobalClockFrequency(Number(e.target.value))}
                min="1"
                max="10000"
              />
              <p className="text-xs text-muted-foreground">
                Default: 1000 MHz (1 GHz). This is used for components without explicit frequency settings.
              </p>
            </div>
            
            <div className="border-t pt-4">
              <h4 className="text-sm font-semibold mb-3">Performance Thresholds</h4>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="eff-warn">Efficiency Warning Threshold (%)</Label>
                  <Input
                    id="eff-warn"
                    type="number"
                    value={efficiencyWarningThreshold}
                    onChange={(e) => setEfficiencyWarningThreshold(Number(e.target.value))}
                    min="0"
                    max="100"
                  />
                  <p className="text-xs text-muted-foreground">
                    Show warning (yellow) when efficiency is below this value.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="eff-err">Efficiency Error Threshold (%)</Label>
                  <Input
                    id="eff-err"
                    type="number"
                    value={efficiencyErrorThreshold}
                    onChange={(e) => setEfficiencyErrorThreshold(Number(e.target.value))}
                    min="0"
                    max="100"
                  />
                  <p className="text-xs text-muted-foreground">
                    Show error (red) when efficiency is below this value.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="lat-warn">Latency Warning Threshold (ns)</Label>
                  <Input
                    id="lat-warn"
                    type="number"
                    value={latencyWarningThreshold}
                    onChange={(e) => setLatencyWarningThreshold(Number(e.target.value))}
                    min="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Show warning (yellow) when latency exceeds this value.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="lat-err">Latency Error Threshold (ns)</Label>
                  <Input
                    id="lat-err"
                    type="number"
                    value={latencyErrorThreshold}
                    onChange={(e) => setLatencyErrorThreshold(Number(e.target.value))}
                    min="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Show error (red) when latency exceeds this value.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfig(false)}>
              Cancel
            </Button>
            <Button onClick={() => setShowConfig(false)}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Content */}
      <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Beautiful Loading State */}
        {/* Analyzing Overlay */}
        <AnalyzingOverlay
          isAnalyzing={loading}
          flowCount={flowDefinitions.size}
        />



        {/* Always show Data Flows tab for flow selection */}
        {diagram && diagram.nodes && diagram.nodes.length > 0 && (
          <Tabs defaultValue="flows" className="w-full flex-1 flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="flows">
                Data Flows {flowDefinitions.size > 0 && `(${flowDefinitions.size})`}
              </TabsTrigger>
              <TabsTrigger value="performance" className="flex items-center gap-2" disabled={!report}>
                Performance
                {report && (() => {
                  let critical = 0, warning = 0, good = 0;
                  report.performance.metrics.forEach(m => {
                    if (m.efficiency < efficiencyErrorThreshold || m.estimatedLatency > latencyErrorThreshold) critical++;
                    else if (m.efficiency < efficiencyWarningThreshold || m.estimatedLatency > latencyWarningThreshold) warning++;
                    else good++;
                  });
                  return (
                    <div className="flex gap-1 ml-1">
                      {critical > 0 && <Badge className="text-[10px] px-1.5 py-0 h-4 min-w-[20px] justify-center bg-red-500 hover:bg-red-600 text-white">{critical}</Badge>}
                      {warning > 0 && <Badge className="text-[10px] px-1.5 py-0 h-4 min-w-[20px] justify-center bg-yellow-500 hover:bg-yellow-600 text-white">{warning}</Badge>}
                      {good > 0 && critical === 0 && warning === 0 && <Badge className="text-[10px] px-1.5 py-0 h-4 min-w-[20px] justify-center bg-green-500 hover:bg-green-600 text-white">{good}</Badge>}
                    </div>
                  );
                })()}
              </TabsTrigger>
              <TabsTrigger value="contention" className="flex items-center gap-2" disabled={!report}>
                Contention
                {report && (() => {
                  const critical = report.contention.summary.criticalContentions || 0;
                  const high = report.contention.summary.highContentions || 0;
                  const medium = report.contention.summary.mediumContentions || 0;
                  const total = critical + high + medium;
                  return (
                    <div className="flex gap-1 ml-1">
                      {critical > 0 && <Badge className="text-[10px] px-1.5 py-0 h-4 min-w-[20px] justify-center bg-red-500 hover:bg-red-600 text-white">{critical}</Badge>}
                      {high > 0 && <Badge className="text-[10px] px-1.5 py-0 h-4 min-w-[20px] justify-center bg-yellow-500 hover:bg-yellow-600 text-white">{high}</Badge>}
                      {total > 0 && critical === 0 && high === 0 && <Badge className="text-[10px] px-1.5 py-0 h-4 min-w-[20px] justify-center bg-green-500 hover:bg-green-600 text-white">{total}</Badge>}
                    </div>
                  );
                })()}
              </TabsTrigger>
              <TabsTrigger value="summary" disabled={!report}>Summary</TabsTrigger>
            </TabsList>

            {/* Data Flows Tab */}
            <TabsContent value="flows" className="flex-1 overflow-hidden">
              <ScrollArea className="h-full w-full [&>[data-radix-scroll-area-viewport]]:!scrollbar-none">
                <div className="space-y-4 pr-4 pb-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Data Flow Matrix</CardTitle>
                      <CardDescription>Select flows: Initiators (rows) → Targets (columns)</CardDescription>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => {
                        setFlowDefinitions(new Map());
                        setNextFlowId(0x01);
                        saveFlowDefinitions(new Map());
                      }}
                      disabled={flowDefinitions.size === 0}
                    >
                      Clear Selection
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {(() => {
                    // Extract interfaces based on their dataFlowRole from diagram
                    interface InterfaceInfo {
                      nodeId: string;
                      nodeLabel: string;
                      interfaceId: string;
                      interfaceName: string;
                      dataWidth?: number;
                      role: 'initiator' | 'target' | 'both';
                    }
                    
                    const initiatorInterfaces: InterfaceInfo[] = [];
                    const targetInterfaces: InterfaceInfo[] = [];
                    
                    // Collect interfaces from diagram nodes with explicit dataFlowRole
                    if (diagram && diagram.nodes) {
                      diagram.nodes.forEach((node: any) => {
                        const interfaces = node.data?.interfaces || [];
                        const nodeLabel = node.data?.label || node.id;
                        
                        interfaces.forEach((iface: any) => {
                          // Extract width - use ONLY dataWidth (width is obsolete)
                          let width = iface.dataWidth;
                          
                          // Parse if string
                          if (typeof width === 'string') {
                            width = parseInt(width.replace(/[^\d]/g, '')) || undefined;
                          }
                          
                          // Validate width exists
                          if (!width || isNaN(width)) {
                            console.error(`[AnalyticsPanel] Interface ${iface.name} (${iface.id}) on node ${nodeLabel} is missing 'dataWidth' property. Using default width.`);
                            width = 32; // Default width for missing values
                          }
                          
                          const interfaceInfo: InterfaceInfo = {
                            nodeId: node.id,
                            nodeLabel,
                            interfaceId: iface.id,
                            interfaceName: iface.name || iface.id,
                            dataWidth: width,
                            role: iface.dataFlowRole
                          };
                          
                          if (iface.dataFlowRole === 'initiator' || iface.dataFlowRole === 'both') {
                            initiatorInterfaces.push(interfaceInfo);
                          }
                          if (iface.dataFlowRole === 'target' || iface.dataFlowRole === 'both') {
                            targetInterfaces.push(interfaceInfo);
                          }
                        });
                      });
                    }
                    
                    // Sort interfaces alphabetically by node name, then node ID, then interface name (natural sort for numbers)
                    const sortInterfaces = (interfaces: InterfaceInfo[]) => {
                      const sorted = [...interfaces].sort((a, b) => {
                        // Trim whitespace from labels for comparison
                        const labelA = a.nodeLabel.trim();
                        const labelB = b.nodeLabel.trim();
                        
                        // First compare node labels (alphabetically with natural number sorting)
                        const nodeCompare = labelA.localeCompare(labelB, undefined, { 
                          sensitivity: 'base',
                          numeric: true
                        });
                        if (nodeCompare !== 0) return nodeCompare;
                        
                        // If same node label, compare node IDs (for cases like e0, e1, e2, e3)
                        const nodeIdCompare = a.nodeId.localeCompare(b.nodeId, undefined, { 
                          sensitivity: 'base',
                          numeric: true
                        });
                        if (nodeIdCompare !== 0) return nodeIdCompare;
                        
                        // If same node ID, compare interface names (alphabetically with natural number sorting)
                        return a.interfaceName.localeCompare(b.interfaceName, undefined, { 
                          sensitivity: 'base',
                          numeric: true
                        });
                      });
                      
                      // Debug: log the sorted order
                      console.log('[AnalyticsPanel] Sorted interfaces:', sorted.map(i => `${i.nodeLabel.trim()} (${i.nodeId}) ${i.interfaceName}`));
                      
                      return sorted;
                    };
                    
                    const sortedInitiators = sortInterfaces(initiatorInterfaces);
                    const sortedTargets = sortInterfaces(targetInterfaces);

                    // Build flow matrix
                    const flowMatrix = new Map<string, DataFlow>();
                    if (report?.flows?.list) {
                      report.flows.list.forEach(flow => {
                        const key = `${flow.source.id}->${flow.sink.id}`;
                        flowMatrix.set(key, flow);
                      });
                    }

                    return (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-sm">
                          <thead>
                            <tr>
                              <th className="border p-2 bg-muted font-medium text-left sticky left-0 z-10 w-auto whitespace-nowrap">
                                Initiator \ Target
                              </th>
                              {sortedTargets.map((target, targetIndex) => {
                                const widthDisplay = target.dataWidth ? `${target.dataWidth}b` : 'N/A';
                                
                                return (
                                  <th 
                                    key={`target-${target.nodeId}-${target.interfaceId}-${targetIndex}`}
                                    className="border p-2 bg-muted font-medium text-center w-auto whitespace-nowrap"
                                  >
                                    <div className="flex flex-col items-center gap-0.5">
                                      <ArrowRightFromLine className="h-3 w-3 text-blue-500 flex-shrink-0 mb-0.5" />
                                      <span className="text-xs font-semibold leading-tight">{target.nodeLabel} ({target.nodeId})</span>
                                      <span className="text-xs text-muted-foreground leading-tight">{target.interfaceName} ({widthDisplay})</span>
                                    </div>
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {sortedInitiators.map((source, sourceIndex) => {
                              const widthDisplay = source.dataWidth ? `${source.dataWidth}b` : 'N/A';
                              
                              return (
                                <tr key={`source-${source.nodeId}-${source.interfaceId}-${sourceIndex}`}>
                                  <td 
                                    className="border p-2 bg-muted font-medium sticky left-0 z-10 w-auto"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <ArrowRightToLine className="h-3 w-3 text-green-500 flex-shrink-0" />
                                      <div className="flex flex-col">
                                        <span className="text-xs font-semibold leading-tight">{source.nodeLabel} ({source.nodeId})</span>
                                        <span className="text-xs text-muted-foreground leading-tight">{source.interfaceName} ({widthDisplay})</span>
                                      </div>
                                    </div>
                                  </td>
                                  {sortedTargets.map((target, targetIndex) => {
                                    // Check if same node and interface
                                    if (source.nodeId === target.nodeId && source.interfaceId === target.interfaceId) {
                                      return (
                                        <td key={`cell-${sourceIndex}-${targetIndex}`} className="border p-2 bg-muted/30 text-center">
                                          <span className="text-muted-foreground">—</span>
                                        </td>
                                      );
                                    }
                                    
                                    // Check if this flow is enabled by looking in flowDefinitions
                                    const isEnabled = Array.from(flowDefinitions.values()).some(
                                      f => f.initiatorNodeId === source.nodeId && f.targetNodeId === target.nodeId &&
                                           f.initiatorPort === source.interfaceId && f.targetPort === target.interfaceId
                                    );
                                    
                                    // Get the flow ID if it exists
                                    const existingFlow = Array.from(flowDefinitions.values()).find(
                                      f => f.initiatorNodeId === source.nodeId && f.targetNodeId === target.nodeId &&
                                           f.initiatorPort === source.interfaceId && f.targetPort === target.interfaceId
                                    );
                                    
                                    return (
                                      <td
                                        key={`cell-${sourceIndex}-${targetIndex}`}
                                        className={cn(
                                          "border p-2 hover:bg-accent transition-colors text-center",
                                          isEnabled ? "bg-blue-50 dark:bg-blue-950" : "bg-background"
                                        )}
                                        title={existingFlow ? `Flow ID: #${existingFlow.flowId.toString().padStart(2, '0')}` : 'Click to add flow'}
                                      >
                                        <div className="flex flex-col items-center gap-1">
                                          <label className="flex items-center cursor-pointer" onClick={(e) => e.stopPropagation()}>
                                            <input
                                              type="checkbox"
                                              checked={isEnabled}
                                              onChange={() => toggleFlow(source.nodeId, target.nodeId, source.interfaceId, target.interfaceId)}
                                              className="rounded cursor-pointer"
                                              title={isEnabled ? 'Remove flow' : 'Add flow'}
                                            />
                                          </label>
                                          {existingFlow && (
                                            <div className="text-xs font-mono text-blue-600 dark:text-blue-400">
                                              #{existingFlow.flowId.toString().padStart(2, '0')}
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* Dynamic Flow List */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Selected Flows for Analysis</CardTitle>
                  <CardDescription>
                    {flowDefinitions.size} flow{flowDefinitions.size !== 1 ? 's' : ''} defined
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {flowDefinitions.size === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-4">
                      No flows selected. Check boxes in the matrix above to add flows.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {Array.from(flowDefinitions.values())
                        .sort((a, b) => a.flowId - b.flowId)
                        .map((flowDef) => {
                          const initiatorNode = diagram?.nodes?.find((n: any) => n.id === flowDef.initiatorNodeId);
                          const targetNode = diagram?.nodes?.find((n: any) => n.id === flowDef.targetNodeId);
                          const initiatorLabel = initiatorNode?.data?.label || flowDef.initiatorNodeId;
                          const targetLabel = targetNode?.data?.label || flowDef.targetNodeId;
                          
                          // Find the edge(s) connecting these nodes to get interface information
                          const connectingEdges = diagram?.edges?.filter((e: any) => 
                            e.source === flowDef.initiatorNodeId && e.target === flowDef.targetNodeId
                          ) || [];
                          
                          // Get interface names from the edge or from stored port IDs
                          let initiatorInterfaceName = 'unknown';
                          let targetInterfaceName = 'unknown';
                          
                          if (connectingEdges.length > 0) {
                            const edge = connectingEdges[0]; // Use first edge if multiple
                            const initiatorInterface = initiatorNode?.data?.interfaces?.find((i: any) => i.id === edge.sourceHandle);
                            const targetInterface = targetNode?.data?.interfaces?.find((i: any) => i.id === edge.targetHandle);
                            initiatorInterfaceName = initiatorInterface?.name || edge.sourceHandle || 'unknown';
                            targetInterfaceName = targetInterface?.name || edge.targetHandle || 'unknown';
                          } else if (flowDef.initiatorPort || flowDef.targetPort) {
                            // Fallback to stored port IDs
                            const initiatorInterface = initiatorNode?.data?.interfaces?.find((i: any) => i.id === flowDef.initiatorPort);
                            const targetInterface = targetNode?.data?.interfaces?.find((i: any) => i.id === flowDef.targetPort);
                            initiatorInterfaceName = initiatorInterface?.name || flowDef.initiatorPort || 'unknown';
                            targetInterfaceName = targetInterface?.name || flowDef.targetPort || 'unknown';
                          }
                          
                          // Format: DisplayName(nodeId):interfaceName → DisplayName(nodeId):interfaceName
                          const flowName = `${initiatorLabel}(${flowDef.initiatorNodeId}):${initiatorInterfaceName} → ${targetLabel}(${flowDef.targetNodeId}):${targetInterfaceName}`;
                          
                          return (
                            <div
                              key={flowDef.flowId}
                              className="flex items-center justify-between p-2 rounded border border-border bg-background hover:bg-accent/50 transition-colors"
                            >
                              <div className="flex items-center gap-3 flex-1">
                                <div className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400 min-w-[3rem]">
                                  #{flowDef.flowId.toString().padStart(2, '0')}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate" title={flowName}>
                                    {flowName}
                                  </div>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleFlow(flowDef.initiatorNodeId, flowDef.targetNodeId)}
                                className="h-7 px-2"
                              >
                                <XCircle className="h-3 w-3" />
                              </Button>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </CardContent>
              </Card>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Performance Tab */}
            <TabsContent value="performance" className="flex-1 overflow-hidden">
              <ScrollArea className="h-full w-full [&>[data-radix-scroll-area-viewport]]:!scrollbar-none">
                <div className="space-y-4 pr-4 pb-4">
              {!report ? (
                <Card>
                  <CardContent className="pt-12 pb-12 text-center">
                    <BarChart3 className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                    <p className="text-muted-foreground">No performance data available. Run analysis first.</p>
                  </CardContent>
                </Card>
              ) : (() => {
                // Show all metrics from the report (they were already filtered during analysis)
                const enabledMetrics = report?.performance.metrics || [];
                
                if (enabledMetrics.length === 0) {
                  return (
                    <Card>
                      <CardContent className="pt-6 text-center text-muted-foreground">
                        <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No performance metrics available</p>
                        <p className="text-xs mt-2">Run analysis to generate performance metrics</p>
                      </CardContent>
                    </Card>
                  );
                }

                // Helper function to format bandwidth
                const formatBandwidth = (mbitPerSec: number): string => {
                  if (mbitPerSec >= 1000) {
                    return `${(mbitPerSec / 1000).toFixed(2)} Gbit/s`;
                  }
                  return `${mbitPerSec.toFixed(0)} Mbit/s`;
                };

                // Helper function to format frequency
                const formatFrequency = (mhz: number): string => {
                  if (mhz >= 1000) {
                    return `${(mhz / 1000).toFixed(2)} GHz`;
                  }
                  return `${mhz} MHz`;
                };

                // Helper function to get badge color based on efficiency thresholds
                const getEfficiencyColor = (efficiency: number): string => {
                  if (efficiency < efficiencyErrorThreshold) return 'bg-red-500 hover:bg-red-600 text-white';
                  if (efficiency < efficiencyWarningThreshold) return 'bg-yellow-500 hover:bg-yellow-600 text-white';
                  return 'bg-green-500 hover:bg-green-600 text-white';
                };

                // Helper function to get badge color based on latency thresholds
                const getLatencyColor = (latency: number): string => {
                  if (latency > latencyErrorThreshold) return 'bg-red-500 hover:bg-red-600 text-white';
                  if (latency > latencyWarningThreshold) return 'bg-yellow-500 hover:bg-yellow-600 text-white';
                  return 'bg-green-500 hover:bg-green-600 text-white';
                };

                return enabledMetrics.map((metric) => (
                <Card key={metric.flowId}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <span className="font-mono text-blue-600 dark:text-blue-400">
                            #{(typeof metric.flowId === 'number' ? metric.flowId : parseInt(metric.flowId)).toString().padStart(2, '0')}
                          </span>
                          <span>{metric.flowName}</span>
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`text-xs ${getEfficiencyColor(metric.efficiency)}`}>
                          Max: {formatBandwidth(metric.maxThroughput)}
                        </Badge>
                        <Badge className={`text-xs ${getEfficiencyColor(metric.efficiency)}`}>
                          Efficiency: {metric.efficiency.toFixed(0)}%
                        </Badge>
                        <Badge className={`text-xs ${getLatencyColor(metric.estimatedLatency)}`}>
                          Hops: {metric.details.length}
                        </Badge>
                        <Badge className={`text-xs ${getLatencyColor(metric.estimatedLatency)}`}>
                          Latency: {metric.estimatedLatency.toFixed(1)} ns
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Horizontal flow visualization */}
                    <div className="flex items-stretch gap-2 overflow-x-auto pb-2">
                      {metric.details.flatMap((comp, idx) => {
                        // Check if this is an intermediate node (not source or sink)
                        const isIntermediate = idx > 0 && idx < metric.details.length - 1;
                        const showArrow = idx < metric.details.length - 1;
                        
                        if (isIntermediate) {
                          // Intermediate node: split into two cards (input and output)
                          return [
                            // Input card
                            <div
                              key={`${comp.componentId}-in`}
                              className={`flex flex-col justify-between p-3 rounded border min-w-[140px] cursor-help text-center ${
                                comp.isBottleneck 
                                  ? 'bg-destructive/10 border-destructive shadow-sm' 
                                  : 'bg-muted/30 border-border'
                              }`}
                              title={`Input Port\n${comp.isBottleneck ? '🔴 BOTTLENECK\n' : ''}Bandwidth: ${comp.dataWidth} bits × ${comp.frequency} MHz = ${formatBandwidth(comp.bandwidth)}\nLatency: ${comp.latency} cycles`}
                            >
                              <div className="space-y-1">
                                <div className="flex items-center justify-center gap-1">
                                  {comp.isBottleneck && (
                                    <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0" />
                                  )}
                                  <div className="text-sm font-medium leading-tight">{comp.componentLabel}</div>
                                </div>
                              </div>
                              <div className="mt-2 pt-2 border-t border-border/50">
                                <div className="text-xs text-muted-foreground mb-1">
                                  {comp.dataWidth}b @ {formatFrequency(comp.frequency)}
                                </div>
                                <div className="text-xs font-mono font-semibold">
                                  {formatBandwidth(comp.bandwidth)}
                                </div>
                              </div>
                            </div>,
                            // Output card (no arrow between input and output)
                            <div
                              key={`${comp.componentId}-out`}
                              className={`flex flex-col justify-between p-3 rounded border min-w-[140px] cursor-help text-center ${
                                comp.isBottleneck 
                                  ? 'bg-destructive/10 border-destructive shadow-sm' 
                                  : 'bg-muted/30 border-border'
                              }`}
                              title={`Output Port\n${comp.isBottleneck ? '🔴 BOTTLENECK\n' : ''}Bandwidth: ${comp.dataWidth} bits × ${comp.frequency} MHz = ${formatBandwidth(comp.bandwidth)}\nLatency: ${comp.latency} cycles`}
                            >
                              <div className="space-y-1">
                                <div className="flex items-center justify-center gap-1">
                                  {comp.isBottleneck && (
                                    <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0" />
                                  )}
                                  <div className="text-sm font-medium leading-tight">{comp.componentLabel}</div>
                                </div>
                              </div>
                              <div className="mt-2 pt-2 border-t border-border/50">
                                <div className="text-xs text-muted-foreground mb-1">
                                  {comp.dataWidth}b @ {formatFrequency(comp.frequency)}
                                </div>
                                <div className="text-xs font-mono font-semibold">
                                  {formatBandwidth(comp.bandwidth)}
                                </div>
                              </div>
                            </div>,
                            // Arrow after output card (if not last component)
                            showArrow ? (
                              <div key={`${comp.componentId}-arrow`} className="flex items-center justify-center px-1">
                                <div className="text-muted-foreground">→</div>
                              </div>
                            ) : null
                          ].filter(Boolean);
                        } else {
                          // Source or sink: single card
                          return [
                            <div
                              key={comp.componentId}
                              className={`flex flex-col justify-between p-3 rounded border min-w-[140px] cursor-help text-center ${
                                comp.isBottleneck 
                                  ? 'bg-destructive/10 border-destructive shadow-sm' 
                                  : 'bg-muted/30 border-border'
                              }`}
                              title={`${comp.isBottleneck ? '🔴 BOTTLENECK\n' : ''}Bandwidth: ${comp.dataWidth} bits × ${comp.frequency} MHz = ${formatBandwidth(comp.bandwidth)}\nLatency: ${comp.latency} cycles`}
                            >
                              <div className="space-y-1">
                                <div className="flex items-center justify-center gap-1">
                                  {comp.isBottleneck && (
                                    <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0" />
                                  )}
                                  <div className="text-sm font-medium leading-tight">{comp.componentLabel}</div>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {comp.dataWidth}b @ {formatFrequency(comp.frequency)}
                                </div>
                              </div>
                              <div className="mt-2 pt-2 border-t border-border/50">
                                <div className="text-xs font-mono font-semibold">
                                  {formatBandwidth(comp.bandwidth)}
                                </div>
                              </div>
                            </div>,
                            // Arrow after component (if not last)
                            showArrow ? (
                              <div key={`${comp.componentId}-arrow`} className="flex items-center justify-center px-1">
                                <div className="text-muted-foreground">→</div>
                              </div>
                            ) : null
                          ].filter(Boolean);
                        }
                      })}
                    </div>
                  </CardContent>
                </Card>
              ));
              })()}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Contention Tab */}
            <TabsContent value="contention" className="flex-1 overflow-hidden">
              <ScrollArea className="h-full w-full [&>[data-radix-scroll-area-viewport]]:!scrollbar-none">
                <div className="space-y-4 pr-4 pb-4">
              {!report ? (
                <Card>
                  <CardContent className="pt-12 pb-12 text-center">
                    <Activity className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                    <p className="text-muted-foreground">No contention data available. Run analysis first.</p>
                  </CardContent>
                </Card>
              ) : (() => {
                // Show all contention analyses from the report (they were already filtered during analysis)
                const contentionAnalyses = report?.contention.analyses || [];

                if (contentionAnalyses.length === 0) {
                  return (
                    <Card>
                      <CardContent className="pt-6 text-center text-muted-foreground">
                        <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No resource contention detected</p>
                        <p className="text-xs mt-2">All flows have sufficient bandwidth</p>
                      </CardContent>
                    </Card>
                  );
                }

                return contentionAnalyses.map((contention, idx) => (
                  <Card key={idx}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{contention.sharedComponent.label}</CardTitle>
                          <CardDescription className="mt-1">
                            {contention.competingFlows.length} flows competing for this resource
                          </CardDescription>
                        </div>
                        <Badge variant={getSeverityColor(contention.severity)}>
                          {contention.severity}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground text-xs">Total Demand</div>
                          <div className="font-semibold">{contention.totalDemand.toFixed(0)} MB/s</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs">Available</div>
                          <div className="font-semibold">{contention.availableBandwidth.toFixed(0)} MB/s</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs">Contention Ratio</div>
                          <div className={`font-semibold ${contention.contentionRatio > 1 ? 'text-destructive' : ''}`}>
                            {contention.contentionRatio.toFixed(2)}x
                          </div>
                        </div>
                      </div>

                      <div className="border-t pt-3">
                        <div className="text-sm font-medium mb-2">Competing Flows</div>
                        <div className="space-y-1">
                          {contention.competingFlows.map((flow, i) => (
                            <div key={i} className="flex justify-between text-sm p-2 bg-muted/50 rounded">
                              <span>{flow.flowName}</span>
                              <span className="font-mono text-xs">{flow.requestedBandwidth.toFixed(0)} MB/s</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          {contention.recommendation}
                        </AlertDescription>
                      </Alert>
                    </CardContent>
                  </Card>
                ));
              })()}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Summary Tab */}
            <TabsContent value="summary" className="flex-1 overflow-hidden">
              <ScrollArea className="h-full w-full [&>[data-radix-scroll-area-viewport]]:!scrollbar-none">
                <div className="space-y-4 pr-4 pb-4">
              {!report ? (
                <Card>
                  <CardContent className="pt-12 pb-12 text-center">
                    <BarChart3 className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                    <p className="text-muted-foreground">No summary data available. Run analysis first.</p>
                  </CardContent>
                </Card>
              ) : (
                <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Total Data Flows</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{report?.flows.total || 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {report?.flows.byType.memory_access || 0} memory, {report?.flows.byType.peripheral_access || 0} peripheral
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Avg Throughput</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {report?.performance.summary.avgThroughput.toFixed(0) || 0} MB/s
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Efficiency: {report?.performance.summary.avgEfficiency.toFixed(0) || 0}%
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Contention Points</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{report?.contention.summary.totalContentionPoints || 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {report?.contention.summary.criticalContentions || 0} critical
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {report?.performance.summary.avgLatency.toFixed(1) || 0} ns
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Estimated</p>
                  </CardContent>
                </Card>
              </div>

              {/* Recommendations */}
              {report?.recommendations && report.recommendations.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Recommendations</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {report.recommendations.map((rec, idx) => (
                      <Alert key={idx} variant={rec.includes('CRITICAL') ? 'destructive' : 'default'}>
                        <Info className="h-4 w-4" />
                        <AlertDescription>{rec}</AlertDescription>
                      </Alert>
                    ))}
                  </CardContent>
                </Card>
              )}
              </>
              )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
