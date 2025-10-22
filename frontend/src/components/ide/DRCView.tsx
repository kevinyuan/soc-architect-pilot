"use client";

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ShieldCheck,
  XCircle,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Play,
  RefreshCw,
  FileCheck,
  Zap,
  Settings2,
  Gauge,
  Clock,
  Filter,
  Download
} from 'lucide-react';
import { drcAPI, DRCResult, DRCViolation } from '@/lib/drc-api';
import { workspaceFileAPI } from '@/lib/workspace-file-api';
import { useToast } from '@/hooks/use-toast';
import { validateDiagram, applyAutoFixes, ValidationIssue } from '@/lib/diagram-validator';
import { DiagramValidationDialog } from './DiagramValidationDialog';

export interface DRCViewHandles {
  toggleLeftPanel: () => void;
}

interface DRCViewProps {
  currentUser: string | null;
  currentProjectRoot: string | null;
}

import { useCopyContextMenu } from '@/hooks/useCopyContextMenu';

const DRCView = React.forwardRef<DRCViewHandles, DRCViewProps>(
  (props, ref) => {
    const [isLeftPanelOpen, setIsLeftPanelOpen] = React.useState(true);
    const [isRunning, setIsRunning] = React.useState(false);
    const [isLoadingCache, setIsLoadingCache] = React.useState(false);
    const [drcResult, setDrcResult] = React.useState<DRCResult | null>(null);
    const [filterSeverity, setFilterSeverity] = React.useState<string>('all');
    const [filterCategory, setFilterCategory] = React.useState<string>('all');
    const [showRulesDialog, setShowRulesDialog] = React.useState(false);
    const [showValidationDialog, setShowValidationDialog] = React.useState(false);
    const [validationIssues, setValidationIssues] = React.useState<ValidationIssue[]>([]);
    const [pendingDiagram, setPendingDiagram] = React.useState<any>(null);
    const [checkOptionalPorts, setCheckOptionalPorts] = React.useState(() => {
      return localStorage.getItem('drc-check-optional-ports') === 'true';
    });
    const { toast} = useToast();
    const { handleContextMenu, ContextMenu } = useCopyContextMenu();

    React.useImperativeHandle(ref, () => ({
      toggleLeftPanel: () => setIsLeftPanelOpen(prev => !prev),
    }));

    const handleRunDRC = async () => {
      if (!props.currentProjectRoot) {
        toast({
          title: 'Error',
          description: 'No project loaded',
          variant: 'destructive',
        });
        return;
      }

      setIsRunning(true);
      try {
        // Step 1: Clear previous results from UI immediately
        setDrcResult(null);
        console.log('[DRCView] 🔄 Starting fresh DRC check...');
        
        // Step 2: Always reload fresh diagram from arch_diagram.json
        const diagramContent = await workspaceFileAPI.readFile(
          props.currentProjectRoot,
          'arch_diagram.json'
        );
        
        if (!diagramContent) {
          throw new Error('Architecture diagram not found. Please create a design first.');
        }
        
        const diagram = JSON.parse(diagramContent);
        console.log('[DRCView] ✅ Loaded fresh diagram from arch_diagram.json');
        console.log('[DRCView] Diagram has', diagram.nodes?.length, 'nodes and', diagram.edges?.length, 'edges');
        
        // Log all interface idWidths for debugging
        diagram.nodes?.forEach((node: any) => {
          if (node.data?.interfaces) {
            node.data.interfaces.forEach((iface: any) => {
              if (iface.idWidth) {
                console.log(`[DRCView] ${node.data.label}.${iface.name}: idWidth=${iface.idWidth}`);
              }
            });
          }
        });

        // Step 2.5: Validate diagram for structural issues
        const validation = validateDiagram(diagram);
        if (!validation.isValid) {
          console.log('[DRCView] ⚠️ Found', validation.issues.length, 'validation issues');
          setValidationIssues(validation.issues);
          setPendingDiagram(diagram);
          setShowValidationDialog(true);
          setIsRunning(false);
          return;
        }

        // Step 3: Run DRC check with validated diagram
        await runDRCCheck(diagram);
      } catch (error: any) {
        console.error('DRC check failed:', error);
        toast({
          title: 'DRC Check Failed',
          description: error.message || 'Failed to run DRC check',
          variant: 'destructive',
        });
        setIsRunning(false);
      }
    };

    const runDRCCheck = async (diagram: any) => {
      try {
        // The backend will overwrite drc_results.json with new results
        const result = await drcAPI.runCheck(diagram, props.currentProjectRoot, {
          checkOptionalPorts
        });
        
        // Step 4: Set the result directly from the API response (not from cached file)
        setDrcResult(result);
        
        // Step 5: Reset filters to default "all" when new results are loaded
        setFilterSeverity('all');
        setFilterCategory('all');
        
        console.log('[DRCView] ✅ DRC check complete - using fresh results from API');

        toast({
          title: 'DRC Check Complete',
          description: `Found ${result.summary.critical} critical, ${result.summary.warning} warnings, ${result.summary.info} info`,
          variant: result.passed ? 'default' : 'destructive',
        });
      } catch (error: any) {
        console.error('DRC check failed:', error);
        toast({
          title: 'DRC Check Failed',
          description: error.message || 'Failed to run DRC check',
          variant: 'destructive',
        });
        throw error;
      } finally {
        setIsRunning(false);
      }
    };

    const handleApplyAutoFix = async () => {
      if (!pendingDiagram || !props.currentProjectRoot) return;

      try {
        setShowValidationDialog(false);
        setIsRunning(true);

        // Apply auto-fixes
        const fixedDiagram = applyAutoFixes(pendingDiagram, validationIssues);
        console.log('[DRCView] ✅ Applied auto-fixes, removed/fixed', validationIssues.length, 'issues');

        // Save fixed diagram back to file
        await workspaceFileAPI.writeFile(
          props.currentProjectRoot,
          'arch_diagram.json',
          JSON.stringify(fixedDiagram, null, 2)
        );
        console.log('[DRCView] ✅ Saved fixed diagram to arch_diagram.json');

        toast({
          title: 'Diagram Fixed',
          description: `Applied ${validationIssues.length} auto-fix${validationIssues.length !== 1 ? 'es' : ''}`,
        });

        // Now run DRC with fixed diagram
        await runDRCCheck(fixedDiagram);
      } catch (error: any) {
        console.error('Auto-fix failed:', error);
        toast({
          title: 'Auto-Fix Failed',
          description: error.message || 'Failed to apply fixes',
          variant: 'destructive',
        });
        setIsRunning(false);
      } finally {
        setPendingDiagram(null);
        setValidationIssues([]);
      }
    };

    const handleCancelAutoFix = () => {
      setShowValidationDialog(false);
      setPendingDiagram(null);
      setValidationIssues([]);
      setIsRunning(false);
    };

    // Load cached DRC results on mount, or auto-run if none exist
    // Track if we've already attempted auto-run to prevent infinite loops
    const [autoRunAttempted, setAutoRunAttempted] = React.useState(false);

    React.useEffect(() => {
      const loadOrRunDRC = async () => {
        if (!props.currentProjectRoot || drcResult || isRunning || isLoadingCache || autoRunAttempted) {
          console.log('[DRCView] Skipping load/auto-run:', { 
            hasProject: !!props.currentProjectRoot, 
            hasResult: !!drcResult, 
            isRunning,
            isLoadingCache,
            autoRunAttempted
          });
          return;
        }

        // Try to load cached results first
        setIsLoadingCache(true);
        try {
          const cachedResults = await workspaceFileAPI.readFile(
            props.currentProjectRoot,
            'drc_results.json'
          );
          
          if (cachedResults) {
            const results = JSON.parse(cachedResults);
            setDrcResult(results);
            console.log('[DRCView] ✅ Loaded cached DRC results');
            setIsLoadingCache(false);
            return;
          }
        } catch (error) {
          // No cached results, proceed with auto-run
          console.log('[DRCView] No cached results found');
        }
        setIsLoadingCache(false);

        // Check if arch_diagram.json exists before auto-running
        try {
          const diagramExists = await workspaceFileAPI.readFile(
            props.currentProjectRoot,
            'arch_diagram.json'
          );
          
          if (diagramExists) {
            // Auto-run validation if diagram exists but no cached results
            console.log('[DRCView] Diagram exists, auto-running validation...');
            setAutoRunAttempted(true); // Mark that we've attempted auto-run
            await handleRunDRC();
          } else {
            console.log('[DRCView] No diagram file found, skipping auto-run');
            setAutoRunAttempted(true); // Don't retry
          }
        } catch (error) {
          // No diagram file exists - this is normal for new projects
          console.log('[DRCView] No diagram file found, skipping auto-run');
          setAutoRunAttempted(true); // Don't retry
        }
      };

      // Small delay to ensure component is fully mounted
      const timer = setTimeout(() => {
        loadOrRunDRC();
      }, 500);

      return () => clearTimeout(timer);
    }, [props.currentProjectRoot, drcResult, isRunning, isLoadingCache, autoRunAttempted]);

    const handleExportReport = () => {
      if (!drcResult) return;

      const report = JSON.stringify(drcResult, null, 2);
      const blob = new Blob([report], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `drc-report-${new Date().toISOString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    };

    const getFilteredViolations = (): DRCViolation[] => {
      if (!drcResult) return [];

      let filtered = drcResult.violations;

      if (filterSeverity !== 'all') {
        filtered = filtered.filter(v => v.severity === filterSeverity);
      }

      if (filterCategory !== 'all') {
        filtered = filtered.filter(v => v.category === filterCategory);
      }

      return filtered;
    };

    const categories = React.useMemo(() => {
      if (!drcResult) return [];
      const cats = new Set(drcResult.violations.map(v => v.category));
      return Array.from(cats);
    }, [drcResult]);

    const getLastRunTime = () => {
      if (!drcResult) return 'Never';
      const date = new Date(drcResult.timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    };

    const getSeverityColor = (severity: string) => {
      switch (severity) {
        case 'critical': return 'text-red-500';
        case 'warning': return 'text-yellow-500';
        case 'info': return 'text-blue-500';
        default: return 'text-gray-500';
      }
    };

    const getSeverityBadge = (severity: string) => {
      switch (severity) {
        case 'critical': return 'destructive';
        case 'warning': return 'secondary';
        case 'info': return 'outline';
        default: return 'outline';
      }
    };

    return (
      <div className="flex flex-col h-full w-full bg-background" onContextMenu={handleContextMenu}>
        <ScrollArea className="flex-1">
          <div className="container mx-auto py-6 px-4 md:px-6 max-w-7xl">
            <header className="mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight flex items-center select-text">
                    <ShieldCheck className="mr-3 h-7 w-7 text-primary" />
                    Design Validation
                  </h1>
                </div>
                <div className="flex gap-2 select-none">
                  <Button variant="outline" size="sm" onClick={() => setShowRulesDialog(true)}>
                    <Settings2 className="h-4 w-4 mr-2" />
                    Configure Rules
                  </Button>
                  <Button onClick={handleRunDRC} disabled={isRunning}>
                    {isRunning ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Run Validation
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </header>

            <div className="space-y-6">
              {/* DRC Summary */}
              <section>
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <FileCheck className="mr-2 h-5 w-5 text-primary" />
                  Summary
                </h2>
                {drcResult ? (
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <Card className="shadow-md hover:shadow-lg transition-shadow">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Checks</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{drcResult.totalChecks}</div>
                        <p className="text-xs text-muted-foreground mt-1">Rules evaluated</p>
                      </CardContent>
                    </Card>

                    <Card className="shadow-md hover:shadow-lg transition-shadow">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Critical</CardTitle>
                        <XCircle className="h-4 w-4 text-red-500" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{drcResult.summary.critical}</div>
                        <p className="text-xs text-muted-foreground mt-1">Must be fixed</p>
                      </CardContent>
                    </Card>

                    <Card className="shadow-md hover:shadow-lg transition-shadow">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Warnings</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{drcResult.summary.warning}</div>
                        <p className="text-xs text-muted-foreground mt-1">Recommended</p>
                      </CardContent>
                    </Card>

                    <Card className="shadow-md hover:shadow-lg transition-shadow">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Info</CardTitle>
                        <Activity className="h-4 w-4 text-blue-500" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{drcResult.summary.info}</div>
                        <p className="text-xs text-muted-foreground mt-1">Optional</p>
                      </CardContent>
                    </Card>

                    <Card className={`shadow-md hover:shadow-lg transition-shadow ${
                      drcResult.passed ? 'border-green-500' : 'border-red-500'
                    } border-2`}>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Status</CardTitle>
                        {drcResult.passed ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                      </CardHeader>
                      <CardContent>
                        <div className={`text-2xl font-bold ${
                          drcResult.passed ? 'text-green-500' : 'text-red-500'
                        }`}>
                          {drcResult.passed ? "PASS" : "FAIL"}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{getLastRunTime()}</p>
                      </CardContent>
                    </Card>
                  </div>
                ) : isRunning || isLoadingCache ? (
                  <Card className="shadow-md border-2 border-primary/20">
                    <CardContent className="pt-12 pb-12 text-center">
                      <div className="relative inline-block mb-6">
                        <div className="absolute inset-0 animate-ping">
                          <ShieldCheck className="h-16 w-16 text-primary/30 mx-auto" />
                        </div>
                        <ShieldCheck className="h-16 w-16 text-primary mx-auto relative" />
                      </div>
                      <h3 className="text-xl font-semibold mb-2">
                        {isLoadingCache ? 'Loading Validation Results' : 'Running Design Validation'}
                      </h3>
                      <p className="text-muted-foreground mb-6">
                        {isLoadingCache 
                          ? 'Retrieving cached validation results...'
                          : 'Analyzing your architecture for design rule violations...'}
                      </p>
                      
                      {/* Progress bar */}
                      <div className="max-w-md mx-auto mb-4">
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-primary to-primary/60 animate-pulse" 
                               style={{ width: '100%' }} />
                        </div>
                      </div>
                      
                      {/* Status indicators - only show when running, not loading cache */}
                      {!isLoadingCache && (
                        <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground mt-6">
                          <div className="flex items-center gap-2">
                            <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                            <span>Checking connectivity</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Activity className="h-4 w-4 animate-pulse text-primary" />
                            <span>Validating parameters</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Gauge className="h-4 w-4 animate-pulse text-primary" />
                            <span>Analyzing topology</span>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="shadow-md">
                    <CardContent className="pt-6 text-center">
                      <ShieldCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No DRC results available</p>
                      <p className="text-sm text-muted-foreground mt-2">Run validation to check your design</p>
                    </CardContent>
                  </Card>
                )}
              </section>

              {/* Filters */}
              {drcResult && drcResult.violations.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold flex items-center">
                      <Filter className="mr-2 h-5 w-5 text-primary" />
                      Filters
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Severity Filter Group */}
                    <Card className="shadow-sm">
                      <CardContent className="pt-4">
                        <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Severity</h3>
                        <div className="flex flex-wrap gap-2">
                          <Badge
                            variant={filterSeverity === 'all' ? 'default' : 'outline'}
                            className="cursor-pointer select-none"
                            onClick={() => setFilterSeverity('all')}
                          >
                            All ({drcResult.violations.length})
                          </Badge>
                          <Badge
                            variant={filterSeverity === 'critical' ? 'destructive' : 'outline'}
                            className="cursor-pointer select-none"
                            onClick={() => setFilterSeverity('critical')}
                          >
                            Critical ({drcResult.summary.critical})
                          </Badge>
                          <Badge
                            variant={filterSeverity === 'warning' ? 'secondary' : 'outline'}
                            className="cursor-pointer select-none"
                            onClick={() => setFilterSeverity('warning')}
                          >
                            Warning ({drcResult.summary.warning})
                          </Badge>
                          <Badge
                            variant={filterSeverity === 'info' ? 'outline' : 'outline'}
                            className="cursor-pointer select-none"
                            onClick={() => setFilterSeverity('info')}
                          >
                            Info ({drcResult.summary.info})
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Category Filter Group */}
                    {categories.length > 0 && (
                      <Card className="shadow-sm">
                        <CardContent className="pt-4">
                          <h3 className="text-sm font-semibold mb-3 text-muted-foreground">DRC Type</h3>
                          <div className="flex flex-wrap gap-2">
                            <Badge
                              variant={filterCategory === 'all' ? 'default' : 'outline'}
                              className="cursor-pointer select-none"
                              onClick={() => setFilterCategory('all')}
                            >
                              All Types
                            </Badge>
                            {categories.map(cat => (
                              <Badge
                                key={cat}
                                variant={filterCategory === cat ? 'default' : 'outline'}
                                className="cursor-pointer select-none"
                                onClick={() => setFilterCategory(cat)}
                              >
                                {cat}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </section>
              )}

              {/* Violation Details */}
              {drcResult && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold">
                      Violation Details ({getFilteredViolations().length})
                    </h2>
                  </div>
                  {getFilteredViolations().length === 0 ? (
                    <Card className="shadow-md">
                      <CardContent className="pt-6 text-center">
                        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                        <p className="text-lg font-semibold">No violations found!</p>
                        <p className="text-sm text-muted-foreground mt-2">Your design passes all DRC checks</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      {getFilteredViolations().map((violation) => (
                        <Card key={violation.id} className="shadow-md">
                          <CardContent className="pt-6 select-text">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-start space-x-3 flex-1">
                                <Badge
                                  variant={getSeverityBadge(violation.severity) as any}
                                  className="mt-1 select-none"
                                >
                                  {violation.severity.toUpperCase()}
                                </Badge>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h3 className="text-base font-semibold select-text">{violation.ruleName}</h3>
                                    <Badge variant="outline" className="text-xs select-text cursor-text">{violation.ruleId}</Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground mb-1 select-text">
                                    <span className="font-medium">Category:</span> {violation.category}
                                  </p>
                                  <p className="text-sm text-muted-foreground mb-2 select-text">
                                    <span className="font-medium">Location:</span> {violation.location}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="ml-0 space-y-3">
                              <div className="bg-muted/50 p-3 rounded-md select-text">
                                <p className="text-sm font-medium mb-1">Issue:</p>
                                <p className="text-sm text-muted-foreground">{violation.description}</p>
                              </div>

                              <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-md select-text">
                                <div className="flex items-start gap-2">
                                  <Zap className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                                  <div>
                                    <p className="text-sm font-medium mb-1">Suggestion:</p>
                                    <p className="text-sm text-muted-foreground">{violation.suggestion}</p>
                                  </div>
                                </div>
                              </div>

                              {(violation.affectedComponents || violation.affectedInterfaces || violation.affectedConnections) && (
                                <div className="flex flex-wrap gap-4 text-xs select-text">
                                  {violation.affectedComponents && violation.affectedComponents.length > 0 && (
                                    <div>
                                      <span className="font-medium">Components:</span>{' '}
                                      <span className="text-muted-foreground">
                                        {violation.affectedComponents.join(', ')}
                                      </span>
                                    </div>
                                  )}
                                  {violation.affectedInterfaces && violation.affectedInterfaces.length > 0 && (
                                    <div>
                                      <span className="font-medium">Interfaces:</span>{' '}
                                      <span className="text-muted-foreground">
                                        {violation.affectedInterfaces.join(', ')}
                                      </span>
                                    </div>
                                  )}
                                  {violation.affectedConnections && violation.affectedConnections.length > 0 && (
                                    <div>
                                      <span className="font-medium">Connections:</span>{' '}
                                      <span className="text-muted-foreground">
                                        {violation.affectedConnections.join(', ')}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}

                              {violation.details && Object.keys(violation.details).length > 0 && (
                                <div className="pt-2 border-t select-text">
                                  <p className="text-xs font-medium mb-1">Details:</p>
                                  <pre className="text-xs text-muted-foreground bg-muted/30 p-2 rounded overflow-x-auto select-text">
                                    {JSON.stringify(violation.details, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Quick Actions */}
              {drcResult && (
                <section>
                  <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card 
                      className="shadow-md hover:shadow-lg transition-shadow cursor-pointer"
                      onClick={() => setFilterSeverity('critical')}
                    >
                      <CardContent className="pt-6">
                        <div className="text-center">
                          <XCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                          <h3 className="font-semibold mb-1">View Critical Issues</h3>
                          <p className="text-sm text-muted-foreground">
                            Focus on {drcResult.summary.critical} critical violations
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card 
                      className="shadow-md hover:shadow-lg transition-shadow cursor-pointer"
                      onClick={handleExportReport}
                    >
                      <CardContent className="pt-6">
                        <div className="text-center">
                          <Download className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                          <h3 className="font-semibold mb-1">Export Report</h3>
                          <p className="text-sm text-muted-foreground">
                            Download detailed validation report
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="shadow-md hover:shadow-lg transition-shadow cursor-pointer">
                      <CardContent className="pt-6">
                        <div className="text-center">
                          <RefreshCw className="h-8 w-8 text-primary mx-auto mb-2" />
                          <h3 className="font-semibold mb-1">Re-run Check</h3>
                          <p className="text-sm text-muted-foreground">
                            Run validation again after fixes
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </section>
              )}
            </div>
          </div>
        </ScrollArea>

        {/* Configure Rules Dialog */}
        <Dialog open={showRulesDialog} onOpenChange={setShowRulesDialog}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>DRC Rules Configuration</DialogTitle>
              <DialogDescription>
                View all available design rule checks. Rule customization coming soon.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 mt-4">
              {/* Connectivity Rules */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center">
                  <Badge variant="outline" className="mr-2">Connectivity</Badge>
                </h3>
                <div className="space-y-2">
                  <RuleItem
                    id="CONN-001"
                    name="Unconnected Components"
                    severity="warning"
                    description="Detects components with no connections"
                  />
                  <RuleItem
                    id="CONN-002"
                    name="Dangling Connections"
                    severity="warning"
                    description="Identifies connections with missing source or target"
                  />
                </div>
              </div>

              {/* AXI4 Parameter Rules */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center">
                  <Badge variant="outline" className="mr-2">AXI4 Parameters</Badge>
                </h3>
                <div className="space-y-2">
                  <RuleItem
                    id="AXI-001"
                    name="Data Width Mismatch"
                    severity="critical"
                    description="Ensures connected AXI4 interfaces have matching data widths"
                  />
                  <RuleItem
                    id="AXI-002"
                    name="Address Width Mismatch"
                    severity="critical"
                    description="Validates address width compatibility"
                  />
                  <RuleItem
                    id="AXI-003"
                    name="ID Width Mismatch"
                    severity="warning"
                    description="Checks ID width compatibility for transaction ordering"
                  />
                </div>
              </div>

              {/* Address Space Rules */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center">
                  <Badge variant="outline" className="mr-2">Address Space</Badge>
                </h3>
                <div className="space-y-2">
                  <RuleItem
                    id="ADDR-001"
                    name="Overlapping Address Ranges"
                    severity="critical"
                    description="Detects memory-mapped components with overlapping addresses"
                  />
                  <RuleItem
                    id="ADDR-002"
                    name="Invalid Address Format"
                    severity="warning"
                    description="Validates address format (hex with 0x prefix)"
                  />
                  <RuleItem
                    id="ADDR-003"
                    name="Address Alignment"
                    severity="info"
                    description="Checks if addresses are properly aligned"
                  />
                </div>
              </div>

              {/* Topology Rules */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center">
                  <Badge variant="outline" className="mr-2">Topology</Badge>
                </h3>
                <div className="space-y-2">
                  <RuleItem
                    id="TOPO-001"
                    name="Multiple Masters to Single Slave"
                    severity="warning"
                    description="Warns when multiple masters connect to a slave without interconnect"
                  />
                  <RuleItem
                    id="TOPO-002"
                    name="Circular Dependencies"
                    severity="critical"
                    description="Detects circular connection patterns"
                  />
                </div>
              </div>

              {/* Performance Rules */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center">
                  <Badge variant="outline" className="mr-2">Performance</Badge>
                </h3>
                <div className="space-y-2">
                  <RuleItem
                    id="PERF-001"
                    name="Clock Domain Crossing"
                    severity="warning"
                    description="Identifies potential clock domain crossing issues"
                  />
                  <RuleItem
                    id="PERF-002"
                    name="Bandwidth Bottleneck"
                    severity="info"
                    description="Warns about potential bandwidth limitations"
                  />
                </div>
              </div>

              {/* Naming Convention Rules */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center">
                  <Badge variant="outline" className="mr-2">Naming</Badge>
                </h3>
                <div className="space-y-2">
                  <RuleItem
                    id="NAME-001"
                    name="Component Naming"
                    severity="info"
                    description="Validates component names follow conventions"
                  />
                  <RuleItem
                    id="NAME-002"
                    name="Duplicate Names"
                    severity="warning"
                    description="Detects components with identical names"
                  />
                </div>
              </div>

              {/* Options */}
              <div className="border-t pt-4 mt-4">
                <h3 className="text-lg font-semibold mb-3">Options</h3>
                <div className="flex items-start space-x-3">
                  <Checkbox 
                    id="check-optional"
                    checked={checkOptionalPorts}
                    onCheckedChange={(checked) => {
                      setCheckOptionalPorts(!!checked);
                      localStorage.setItem('drc-check-optional-ports', String(!!checked));
                    }}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <label 
                      htmlFor="check-optional"
                      className="text-sm font-medium cursor-pointer"
                    >
                      Check optional ports for violations
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">
                      When disabled, optional interfaces like debug ports, config slaves, and interrupts won't be flagged as unconnected violations
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Diagram Validation Dialog */}
        <DiagramValidationDialog
          open={showValidationDialog}
          issues={validationIssues}
          onConfirm={handleApplyAutoFix}
          onCancel={handleCancelAutoFix}
        />

        {/* Context Menu for Copy */}
        {ContextMenu}
      </div>
    );
  }
);

// Helper component for rule items
const RuleItem: React.FC<{
  id: string;
  name: string;
  severity: 'critical' | 'warning' | 'info';
  description: string;
}> = ({ id, name, severity, description }) => {
  const getSeverityColor = () => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'warning': return 'secondary';
      case 'info': return 'outline';
    }
  };

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
      <Badge variant={getSeverityColor() as any} className="mt-0.5">
        {severity.toUpperCase()}
      </Badge>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm">{name}</span>
          <Badge variant="outline" className="text-xs">{id}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
};

DRCView.displayName = 'DRCView';

export default DRCView;
