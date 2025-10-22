import React, { useState, useEffect } from 'react';
import { FileText, X, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ConfirmedSelections } from '@/lib/chat-api';

interface ConfirmedFeaturesWidgetProps {
  confirmedSelections?: ConfirmedSelections;
}

export function ConfirmedFeaturesWidget({ confirmedSelections }: ConfirmedFeaturesWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate total number of confirmed items
  const featureCount = confirmedSelections?.selectedFeatures?.length || 0;
  const performanceCount = Object.keys(confirmedSelections?.performanceChoices || {}).length;
  const parameterCount = Object.keys(confirmedSelections?.detailedParameters || {}).length;
  const totalCount = featureCount + performanceCount + parameterCount;

  // Debug logging
  React.useEffect(() => {
    console.log('[ConfirmedFeaturesWidget] Received confirmedSelections:', confirmedSelections);
    console.log('[ConfirmedFeaturesWidget] Total count:', totalCount);
  }, [confirmedSelections, totalCount]);

  // TEMP: Always show widget for debugging (remove "return null" check)
  // Don't show widget if no confirmed selections
  // if (totalCount === 0) {
  //   return null;
  // }

  return (
    <div className="fixed top-[150px] right-6 z-50">
      {!isExpanded ? (
        // Minimized widget - icon with badge
        <button
          onClick={() => setIsExpanded(true)}
          className="relative bg-primary text-primary-foreground rounded-full p-3 shadow-lg hover:shadow-xl transition-all hover:scale-110"
          title="View confirmed features"
        >
          <FileText className="h-5 w-5" />
          {totalCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {totalCount}
            </Badge>
          )}
        </button>
      ) : (
        // Expanded widget - full card
        <Card className="w-80 shadow-2xl border-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <CardTitle className="text-base">Confirmed Features</CardTitle>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="secondary" className="text-xs">
                  {totalCount} items
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setIsExpanded(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="h-[300px] pr-4">
              {/* Empty state */}
              {totalCount === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <FileText className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No confirmed features yet</p>
                  <p className="text-xs mt-1">Features will appear here as you confirm them</p>
                </div>
              )}

              {/* Selected Features */}
              {featureCount > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-semibold mb-2 text-muted-foreground">
                    Components & Features ({featureCount})
                  </h4>
                  <ul className="space-y-1.5">
                    {confirmedSelections?.selectedFeatures.map((feature, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 text-sm bg-green-50 dark:bg-green-950/20 p-2 rounded border border-green-200 dark:border-green-800"
                      >
                        <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span className="flex-1">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Performance Choices */}
              {performanceCount > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-semibold mb-2 text-muted-foreground">
                    Performance Settings ({performanceCount})
                  </h4>
                  <ul className="space-y-1.5">
                    {Object.entries(confirmedSelections?.performanceChoices || {}).map(([key, value], idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 text-sm bg-blue-50 dark:bg-blue-950/20 p-2 rounded border border-blue-200 dark:border-blue-800"
                      >
                        <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <span className="font-medium">{key}:</span>{' '}
                          <span className="text-muted-foreground">{value}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Detailed Parameters */}
              {parameterCount > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-muted-foreground">
                    Parameters ({parameterCount})
                  </h4>
                  <ul className="space-y-1.5">
                    {Object.entries(confirmedSelections?.detailedParameters || {}).map(([key, value], idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 text-sm bg-purple-50 dark:bg-purple-950/20 p-2 rounded border border-purple-200 dark:border-purple-800"
                      >
                        <CheckCircle2 className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <span className="font-medium">{key}:</span>{' '}
                          <span className="text-muted-foreground">
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
