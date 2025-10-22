"use client";

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { Info, ExternalLink, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import IconRenderer from './IconRenderer';
import { useToast } from "@/hooks/use-toast";
import { componentAPI } from "@/lib/component-api";

interface ComponentDetailsDialogProps {
  component: any;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAddToCanvas?: (component: any) => void;
}

export function ComponentDetailsDialog({
  component,
  isOpen,
  onOpenChange,
  onAddToCanvas,
}: ComponentDetailsDialogProps) {
  const { toast } = useToast();
  const [compatibleComponents, setCompatibleComponents] = React.useState<any[]>([]);
  const [isLoadingCompatible, setIsLoadingCompatible] = React.useState(false);

  // Load compatible components when dialog opens
  React.useEffect(() => {
    if (isOpen && component?.id) {
      setIsLoadingCompatible(true);
      componentAPI.getCompatibleComponents(component.id)
        .then(setCompatibleComponents)
        .catch(err => {
          console.error('Failed to load compatible components:', err);
          setCompatibleComponents([]);
        })
        .finally(() => setIsLoadingCompatible(false));
    }
  }, [isOpen, component?.id]);

  const handleCopyId = () => {
    if (component?.id) {
      navigator.clipboard.writeText(component.id);
      toast({
        title: "Copied",
        description: "Component ID copied to clipboard",
      });
    }
  };

  const handleAddToCanvas = () => {
    if (onAddToCanvas && component) {
      onAddToCanvas(component);
      onOpenChange(false);
      toast({
        title: "Component Added",
        description: `${component.name} has been added to the canvas`,
      });
    }
  };

  if (!component) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <IconRenderer
              iconName={component.icon || component.nodeData?.iconName || 'Box'}
              className="h-8 w-8 text-primary"
            />
            <div className="flex-1">
              <DialogTitle className="text-xl">{component.name}</DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                {component.category && (
                  <Badge variant="outline">{component.category}</Badge>
                )}
                {component.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-2 text-xs"
                    onClick={handleCopyId}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    {component.id.substring(0, 8)}...
                  </Button>
                )}
              </div>
              {/* Hidden DialogDescription for accessibility */}
              <DialogDescription className="sr-only">
                Component details for {component.name}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-4">
            {/* Description */}
            {component.description && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Description</h4>
                <p className="text-sm text-muted-foreground">{component.description}</p>
              </div>
            )}

            <Separator />

            {/* Specifications */}
            {component.specifications && Object.keys(component.specifications).length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Specifications</h4>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(component.specifications).map(([key, value]) => (
                    <div key={key} className="text-sm">
                      <span className="font-medium text-muted-foreground">{key}:</span>{' '}
                      <span>{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Properties */}
            {component.properties && Object.keys(component.properties).length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold mb-2">Properties</h4>
                  <div className="space-y-1">
                    {Object.entries(component.properties).map(([key, value]) => (
                      <div key={key} className="text-sm flex justify-between">
                        <span className="font-medium text-muted-foreground">{key}:</span>
                        <span className="text-right">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Compatible Components */}
            {compatibleComponents.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    Compatible Components ({compatibleComponents.length})
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {compatibleComponents.map((comp, idx) => (
                      <Card key={idx} className="hover:bg-accent transition-colors">
                        <CardContent className="p-3">
                          <div className="flex items-center gap-2">
                            <IconRenderer
                              iconName={comp.icon || 'Box'}
                              className="h-4 w-4 text-primary"
                            />
                            <span className="text-xs font-medium truncate">
                              {comp.name}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </>
            )}

            {isLoadingCompatible && (
              <div className="text-sm text-muted-foreground text-center py-4">
                Loading compatible components...
              </div>
            )}

            {/* Tags */}
            {component.tags && component.tags.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold mb-2">Tags</h4>
                  <div className="flex flex-wrap gap-1">
                    {component.tags.map((tag: string, idx: number) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Documentation Link */}
            {component.documentationUrl && (
              <>
                <Separator />
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => window.open(component.documentationUrl, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Documentation
                  </Button>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        {/* Footer Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {onAddToCanvas && (
            <Button onClick={handleAddToCanvas}>
              Add to Canvas
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
