"use client";

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, AlertTriangle, Info, ChevronDown, ChevronUp, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ValidationResult {
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  affectedComponents: string[];
  suggestedFix?: string;
  confidence?: number;
  source?: 'hard-coded' | 'llm-enhanced' | 'user-defined';
}

interface ValidationReport {
  summary: {
    overallScore: number;
    results: ValidationResult[];
    totalIssues: number;
    criticalIssues: number;
    warnings: number;
  };
  criticalIssues: ValidationResult[];
  warnings: ValidationResult[];
  suggestions: string[];
  qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  appliedRules: string[];
  timestamp: Date;
}

interface ValidationResultsPanelProps {
  validationReport: ValidationReport | null;
  isValidating: boolean;
  onComponentClick?: (componentId: string) => void;
  onRevalidate?: () => void;
}

export function ValidationResultsPanel({
  validationReport,
  isValidating,
  onComponentClick,
  onRevalidate,
}: ValidationResultsPanelProps) {
  const [severityFilter, setSeverityFilter] = React.useState<string>('all');
  const [expandedItems, setExpandedItems] = React.useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'info':
        return <Info className="h-4 w-4 text-blue-500" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'B':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'C':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'D':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'F':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const filteredResults = React.useMemo(() => {
    if (!validationReport) return [];
    
    const allResults = validationReport.summary.results;
    
    if (severityFilter === 'all') return allResults;
    return allResults.filter(r => r.severity === severityFilter);
  }, [validationReport, severityFilter]);

  if (!validationReport && !isValidating) {
    return (
      <Card className="w-full h-full flex flex-col">
        <CardHeader>
          <CardTitle className="text-sm">Validation Results</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No validation results yet</p>
            <p className="text-xs mt-1">Make changes to trigger validation</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isValidating) {
    return (
      <Card className="w-full h-full flex flex-col">
        <CardHeader>
          <CardTitle className="text-sm">Validation Results</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Validating...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Validation Results</CardTitle>
          {onRevalidate && (
            <Button variant="ghost" size="sm" onClick={onRevalidate} className="h-7 px-2">
              Revalidate
            </Button>
          )}
        </div>

        {/* Quality Score */}
        {validationReport && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Quality Grade</span>
              <Badge className={cn("text-lg font-bold px-3 py-1", getGradeColor(validationReport.qualityGrade))}>
                {validationReport.qualityGrade}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Score</span>
              <span className="font-semibold">{validationReport.summary.overallScore.toFixed(1)}/100</span>
            </div>
          </div>
        )}

        {/* Summary Stats */}
        {validationReport && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="text-center p-2 bg-destructive/10 rounded">
              <div className="text-lg font-bold text-destructive">{validationReport.summary.criticalIssues}</div>
              <div className="text-xs text-muted-foreground">Errors</div>
            </div>
            <div className="text-center p-2 bg-yellow-500/10 rounded">
              <div className="text-lg font-bold text-yellow-600">{validationReport.summary.warnings}</div>
              <div className="text-xs text-muted-foreground">Warnings</div>
            </div>
            <div className="text-center p-2 bg-blue-500/10 rounded">
              <div className="text-lg font-bold text-blue-600">
                {validationReport.summary.totalIssues - validationReport.summary.criticalIssues - validationReport.summary.warnings}
              </div>
              <div className="text-xs text-muted-foreground">Info</div>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="mt-3">
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Filter by severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Issues ({validationReport?.summary.totalIssues || 0})</SelectItem>
              <SelectItem value="error">Errors ({validationReport?.summary.criticalIssues || 0})</SelectItem>
              <SelectItem value="warning">Warnings ({validationReport?.summary.warnings || 0})</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-2">
            {filteredResults.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <p className="text-sm">No {severityFilter !== 'all' ? severityFilter : ''} issues found</p>
              </div>
            ) : (
              filteredResults.map((result, idx) => (
                <Collapsible
                  key={`${result.ruleId}-${idx}`}
                  open={expandedItems.has(`${result.ruleId}-${idx}`)}
                  onOpenChange={() => toggleExpanded(`${result.ruleId}-${idx}`)}
                >
                  <Card className="border-l-4" style={{
                    borderLeftColor: result.severity === 'error' ? 'rgb(239 68 68)' : 
                                    result.severity === 'warning' ? 'rgb(234 179 8)' : 
                                    'rgb(59 130 246)'
                  }}>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="p-3 cursor-pointer hover:bg-accent/50 transition-colors">
                        <div className="flex items-start gap-2">
                          {getSeverityIcon(result.severity)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium line-clamp-1">{result.message}</p>
                              {expandedItems.has(`${result.ruleId}-${idx}`) ? (
                                <ChevronUp className="h-4 w-4 flex-shrink-0" />
                              ) : (
                                <ChevronDown className="h-4 w-4 flex-shrink-0" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">Rule: {result.ruleId}</p>
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="p-3 pt-0 space-y-2">
                        {result.suggestedFix && (
                          <div className="text-xs">
                            <span className="font-medium text-muted-foreground">Suggested Fix:</span>
                            <p className="mt-1 text-foreground">{result.suggestedFix}</p>
                          </div>
                        )}
                        
                        {result.affectedComponents && result.affectedComponents.length > 0 && (
                          <div className="text-xs">
                            <span className="font-medium text-muted-foreground">Affected Components:</span>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {result.affectedComponents.map((compId, i) => (
                                <Badge
                                  key={i}
                                  variant="secondary"
                                  className="text-xs cursor-pointer hover:bg-secondary/80"
                                  onClick={() => onComponentClick?.(compId)}
                                >
                                  {compId}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {result.confidence !== undefined && (
                          <div className="text-xs">
                            <span className="font-medium text-muted-foreground">Confidence:</span>
                            <span className="ml-2">{Math.round(result.confidence * 100)}%</span>
                          </div>
                        )}

                        {result.source && (
                          <div className="text-xs">
                            <Badge variant="outline" className="text-xs">
                              {result.source}
                            </Badge>
                          </div>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
