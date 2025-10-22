'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText,
  Download,
  ExternalLink,
  Package,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { bomAPI, BOMReport, BOMCategory, BOMComponent } from '@/lib/bom-api';
import { workspaceFileAPI } from '@/lib/workspace-file-api';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface BOMReportViewProps {
  projectId: string;
  projectName: string;
}

export function BOMReportView({ projectId, projectName }: BOMReportViewProps) {
  const [bomReport, setBomReport] = useState<BOMReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [loadedFromCache, setLoadedFromCache] = useState(false);

  useEffect(() => {
    loadBOMReport(false);
  }, [projectId]);

  const loadBOMReport = async (forceRegenerate: boolean = false) => {
    try {
      setLoading(true);
      setError(null);
      setLoadedFromCache(false);

      let report: BOMReport | null = null;

      // Try to load from S3 cache first (unless force regenerate)
      if (!forceRegenerate) {
        try {
          const bomContent = await workspaceFileAPI.readFile(projectId, 'bom.json');
          if (bomContent) {
            report = typeof bomContent === 'string'
              ? JSON.parse(bomContent)
              : bomContent;
            setLoadedFromCache(true);
            console.log('✅ Loaded BOM from cache');
          }
        } catch (err) {
          console.log('No cached BOM found, generating new one...');
        }
      }

      // If no cached BOM or force regenerate, generate new one
      if (!report || forceRegenerate) {
        report = await bomAPI.generateBOM(projectId, 10000); // 10 second timeout
        setLoadedFromCache(false);
        console.log('✅ Generated new BOM');
      }

      setBomReport(report);

      // Expand all categories by default
      setExpandedCategories(new Set(report.categories.map(c => c.categoryName)));
    } catch (err: any) {
      console.error('Failed to load BOM report:', err);
      
      // Provide user-friendly error messages based on error type
      let errorMessage = 'Failed to load BOM report';
      let isUserError = false; // Track if this is a user design issue vs app error
      const errorStr = err.message?.toLowerCase() || '';
      
      // Timeout error (user design issue - too complex)
      if (errorStr.includes('timeout')) {
        errorMessage = 'BOM generation timeout (>10s). Your design may be too complex or the AI service is slow. Please try again or simplify your design.';
        isUserError = true;
      }
      // AWS Bedrock specific errors
      else if (errorStr.includes('throttlingexception') || errorStr.includes('too many requests')) {
        errorMessage = 'AWS Bedrock service is rate-limited. Please wait a moment and try again.';
      } else if (errorStr.includes('bedrock') && errorStr.includes('unavailable')) {
        errorMessage = 'AWS Bedrock service is temporarily unavailable. Please try again later.';
      } else if (errorStr.includes('bedrock') && (errorStr.includes('quota') || errorStr.includes('limit'))) {
        errorMessage = 'AWS Bedrock service quota exceeded. Please contact your administrator.';
      } else if (errorStr.includes('bedrock')) {
        errorMessage = `AWS Bedrock service error: ${err.message}`;
      }
      // General AWS errors
      else if (errorStr.includes('accessdenied') || errorStr.includes('access denied')) {
        errorMessage = 'AWS access denied. Please check your credentials and permissions.';
      } else if (errorStr.includes('serviceunavailable') || errorStr.includes('service unavailable')) {
        errorMessage = 'AWS service temporarily unavailable. Please try again in a few moments.';
      }
      // Application-specific errors (user design issues)
      else if (err.message?.includes('No components found')) {
        errorMessage = 'No components found in project architecture. Please add components to your design.';
        isUserError = true;
      } else if (err.message?.includes('Invalid component') || err.message?.includes('invalid node')) {
        errorMessage = `Design validation error: ${err.message}`;
        isUserError = true;
      }
      // HTTP errors
      else if (err.statusCode === 404) {
        errorMessage = 'Project not found';
      } else if (err.statusCode === 401 || err.statusCode === 403) {
        errorMessage = 'You do not have permission to view this BOM';
      } else if (err.statusCode === 429) {
        errorMessage = 'Too many requests. Please wait a moment and try again.';
      } else if (err.statusCode === 503) {
        errorMessage = 'Service temporarily unavailable. Please try again later.';
      } else if (err.type === 'NETWORK_ERROR') {
        errorMessage = 'Network error. Please check your connection';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      // Only log as error if it's not a user design issue
      if (!isUserError) {
        console.error('❌ BOM generation error:', errorMessage);
      } else {
        console.warn('⚠️ User design issue:', errorMessage);
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (categoryName: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryName)) {
        next.delete(categoryName);
      } else {
        next.add(categoryName);
      }
      return next;
    });
  };

  const exportBOM = () => {
    if (!bomReport) return;

    // Generate CSV content
    let csv = 'Category,Component,Type,Vendor,Part Number,Description\n';

    bomReport.categories.forEach(category => {
      category.components.forEach(component => {
        component.suggestedVendors.forEach(vendor => {
          csv += `"${category.categoryName}","${component.componentName}","${component.componentType}","${vendor.vendor}","${vendor.partNumber}","${vendor.description || ''}"\n`;
        });
      });
    });

    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}_BOM_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>

        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-64" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    const isEmptyProject = error.includes('No components found');
    const isPermissionError = error.includes('permission');
    const isNetworkError = error.includes('Network error');
    const isBedrockError = error.includes('Bedrock') || error.includes('AWS');
    const isThrottling = error.includes('rate-limited') || error.includes('Too many requests');
    const isTimeout = error.includes('timeout');
    const isDesignError = isEmptyProject || error.includes('Design validation') || error.includes('Invalid component');
    
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        {isEmptyProject ? (
          <Package className="h-16 w-16 text-muted-foreground mb-4" />
        ) : isTimeout ? (
          <Clock className="h-16 w-16 text-orange-500 mb-4 animate-pulse" />
        ) : isThrottling ? (
          <Clock className="h-16 w-16 text-orange-500 mb-4" />
        ) : (
          <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
        )}
        
        <h3 className="text-lg font-semibold mb-2">
          {isEmptyProject 
            ? 'No Components Yet' 
            : isTimeout
            ? 'BOM Generation Timeout'
            : isThrottling 
            ? 'Service Rate Limited'
            : isDesignError
            ? 'Design Issue'
            : 'BOM Report Unavailable'}
        </h3>
        
        <p className="text-sm text-muted-foreground mb-4 max-w-md">
          {isEmptyProject ? (
            <>
              Your project doesn't have any components yet. Add components in the{' '}
              <span className="font-medium">Architect View</span> to generate a Bill of Materials.
            </>
          ) : (
            error
          )}
        </p>

        {isTimeout && (
          <div className="mb-4 p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg max-w-md">
            <p className="text-xs text-orange-700 dark:text-orange-300">
              <strong>What happened:</strong> BOM generation was terminated after 10 seconds.
              <br />
              <strong>Possible causes:</strong> Complex design, slow AI service, or network issues.
              <br />
              <strong>Try:</strong> Simplify your design, wait a moment, or check your connection.
            </p>
          </div>
        )}

        {isBedrockError && !isTimeout && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg max-w-md">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              <strong>Note:</strong> BOM generation uses AWS Bedrock AI to suggest vendor parts. 
              {isThrottling && ' Please wait 30-60 seconds before retrying.'}
            </p>
          </div>
        )}
        
        {!isPermissionError && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadBOMReport(false)}
            >
              {isNetworkError ? 'Retry Connection' : 'Retry'}
            </Button>
            {isEmptyProject && (
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  // This would trigger navigation to Architect view
                  // You can implement this based on your routing setup
                  const event = new CustomEvent('navigate-to-view', { detail: { view: 'architect' } });
                  window.dispatchEvent(event);
                }}
              >
                Go to Architect
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (!bomReport) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <Package className="h-16 w-16 mx-auto text-muted-foreground" />
          <div>
            <h3 className="text-lg font-semibold">No BOM Available</h3>
            <p className="text-sm text-muted-foreground">
              Create an architecture first to generate BOM
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      await loadBOMReport(true);
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6" />
              Bill of Materials
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {bomReport.projectName} • {bomReport.totalComponents} Components • {bomReport.categories.length} Categories
              {loadedFromCache && (
                <span className="ml-2 text-xs opacity-75">(Loaded from cache)</span>
              )}
            </p>
            {bomReport.generatedAt && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Generated: {new Date(bomReport.generatedAt).toLocaleString()}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleRegenerate}
              variant="outline"
              size="sm"
              disabled={isRegenerating}
              title="Regenerate BOM from current architecture"
            >
              {isRegenerating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Regenerate
            </Button>
            <Button onClick={exportBOM} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-4">
          {bomReport.categories.map((category) => (
            <CategoryCard
              key={category.categoryName}
              category={category}
              isExpanded={expandedCategories.has(category.categoryName)}
              onToggle={() => toggleCategory(category.categoryName)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

interface CategoryCardProps {
  category: BOMCategory;
  isExpanded: boolean;
  onToggle: () => void;
}

function CategoryCard({ category, isExpanded, onToggle }: CategoryCardProps) {
  return (
    <Card>
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <div>
                  <CardTitle className="text-lg">{category.categoryName}</CardTitle>
                  <CardDescription className="mt-1">
                    {category.categoryDescription} • {category.components.length} component{category.components.length !== 1 ? 's' : ''}
                  </CardDescription>
                </div>
              </div>
              <Badge variant="secondary">{category.components.length}</Badge>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent>
            <div className="space-y-4">
              {category.components.map((component, index) => (
                <ComponentCard key={`${component.componentId}-${index}`} component={component} />
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

interface ComponentCardProps {
  component: BOMComponent;
}

function ComponentCard({ component }: ComponentCardProps) {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div>
        <div className="flex items-center justify-between">
          <h4 className="font-semibold">{component.componentName}</h4>
          <Badge variant="outline">{component.componentType}</Badge>
        </div>
        {component.description && (
          <p className="text-sm text-muted-foreground mt-1">{component.description}</p>
        )}
      </div>

      {/* Vendor Suggestions */}
      <div>
        <h5 className="text-sm font-medium mb-2">Suggested Vendors:</h5>
        <div className="grid gap-2">
          {component.suggestedVendors.map((vendor, idx) => (
            <VendorCard key={idx} vendor={vendor} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface VendorCardProps {
  vendor: any;
}

function VendorCard({ vendor }: VendorCardProps) {
  const handleClick = () => {
    if (vendor.productUrl && vendor.productUrl !== '#') {
      window.open(vendor.productUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      className="flex items-center gap-3 p-3 border rounded-md hover:bg-accent/50 transition-colors cursor-pointer"
      onClick={handleClick}
    >
      {/* Vendor Logo */}
      <div className="flex-shrink-0 w-12 h-12 bg-white rounded border flex items-center justify-center overflow-hidden">
        <img
          src={vendor.logoUrl}
          alt={vendor.vendor}
          className="max-w-full max-h-full object-contain"
          onError={(e) => {
            // Fallback to text if image fails to load
            e.currentTarget.style.display = 'none';
            e.currentTarget.parentElement!.innerHTML = `<span class="text-xs font-semibold text-gray-600">${vendor.vendor.substring(0, 3)}</span>`;
          }}
        />
      </div>

      {/* Vendor Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm">{vendor.vendor}</p>
          {vendor.productUrl && vendor.productUrl !== '#' && (
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
        <p className="text-xs text-muted-foreground">{vendor.partNumber}</p>
        {vendor.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {vendor.description}
          </p>
        )}
      </div>
    </div>
  );
}
