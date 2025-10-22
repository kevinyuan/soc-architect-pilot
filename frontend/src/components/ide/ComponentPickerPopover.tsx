"use client";

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Search, Sparkles, Plus, ChevronDown, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ArchitecturalComponent } from '@/types/backend';
import IconRenderer from './IconRenderer';
import Fuse from 'fuse.js';

// Same MIME type used in sidebar for drag and drop
const DRAG_MIME_TYPE = "application/x-socpilot-component";

interface ComponentPickerPopoverProps {
  components: ArchitecturalComponent[];
  onSelectComponent: (component: ArchitecturalComponent) => void;
  canvasNodes?: any[]; // For AI recommendations context
  disabled?: boolean;
}

interface TagInfo {
  name: string;
  count: number;
  type: 'category' | 'tag';
}

// Maximum number of tags to show initially (to prevent explosion)
const MAX_VISIBLE_TAGS = 8;
const MAX_EXPANDED_TAGS = 20;

// Special tag ID for AI recommendations
const AI_RECOMMENDATION_TAG = '__ai_recommended__';

export function ComponentPickerPopover({
  components,
  onSelectComponent,
  canvasNodes = [],
  disabled = false,
}: ComponentPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null); // Single selection
  const [aiRecommendations, setAiRecommendations] = useState<string[]>([]);
  const [showAllTags, setShowAllTags] = useState(false);

  // Extract and analyze tags from component library
  const availableTags = useMemo(() => {
    const tagMap = new Map<string, TagInfo>();

    components.forEach(component => {
      // Add category (primary classification)
      if (component.category) {
        const existing = tagMap.get(component.category);
        if (existing) {
          existing.count++;
        } else {
          tagMap.set(component.category, {
            name: component.category,
            count: 1,
            type: 'category',
          });
        }
      }

      // Add tags (secondary classification)
      if (component.tags && Array.isArray(component.tags)) {
        component.tags.forEach(tag => {
          const normalized = tag.trim();
          if (!normalized) return;

          const existing = tagMap.get(normalized);
          if (existing) {
            existing.count++;
          } else {
            tagMap.set(normalized, {
              name: normalized,
              count: 1,
              type: 'tag',
            });
          }
        });
      }
    });

    // Sort by: 1) type (categories first), 2) count (most common first)
    const sortedTags = Array.from(tagMap.values()).sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'category' ? -1 : 1;
      }
      return b.count - a.count;
    });

    // Prepend AI Recommendation tag as the first option
    return [
      {
        name: AI_RECOMMENDATION_TAG,
        count: 0, // Dynamic based on recommendations
        type: 'category' as const,
      },
      ...sortedTags,
    ];
  }, [components]);

  // Visible tags (limited to prevent explosion)
  const visibleTags = useMemo(() => {
    const limit = showAllTags ? MAX_EXPANDED_TAGS : MAX_VISIBLE_TAGS;
    return availableTags.slice(0, limit);
  }, [availableTags, showAllTags]);

  const hasMoreTags = availableTags.length > MAX_VISIBLE_TAGS;

  // Initialize Fuse.js for fuzzy search
  const fuse = useMemo(() => {
    return new Fuse(components, {
      keys: [
        { name: 'name', weight: 2 },
        { name: 'type', weight: 1.5 },
        { name: 'category', weight: 1 },
        { name: 'tags', weight: 0.8 },
        { name: 'description', weight: 0.5 },
      ],
      threshold: 0.4,
      includeScore: true,
    });
  }, [components]);

  // Get AI recommendations based on canvas context
  useEffect(() => {
    if (open && canvasNodes.length > 0) {
      // Simple rule-based recommendations for now
      const nodeTypes = new Set(canvasNodes.map((n: any) => n.data?.model_type || n.data?.category));
      const recommendations: string[] = [];

      // Recommendation logic
      if (nodeTypes.has('CPU') || nodeTypes.has('Processor')) {
        if (!Array.from(nodeTypes).some(t => t?.toLowerCase().includes('memory'))) {
          recommendations.push('memory'); // Recommend memory if CPU exists but no memory
        }
        if (!Array.from(nodeTypes).some(t => t?.toLowerCase().includes('cache'))) {
          recommendations.push('cache');
        }
      }

      if (nodeTypes.has('Memory') || nodeTypes.has('RAM')) {
        if (!Array.from(nodeTypes).some(t => t?.toLowerCase().includes('cpu') && t?.toLowerCase().includes('processor'))) {
          recommendations.push('cpu'); // Recommend CPU if memory exists but no CPU
        }
      }

      // If no nodes, recommend starting components
      if (canvasNodes.length === 0) {
        recommendations.push('cpu', 'memory', 'interconnect');
      }

      setAiRecommendations(recommendations);
    } else {
      setAiRecommendations([]);
    }
  }, [open, canvasNodes]);

  // Get AI recommended components
  const recommendedComponents = useMemo(() => {
    if (aiRecommendations.length === 0) return [];

    return components
      .filter(c => {
        const lowerName = c.name?.toLowerCase() || '';
        const lowerType = c.type?.toLowerCase() || '';
        const lowerCategory = c.category?.toLowerCase() || '';

        return aiRecommendations.some(rec =>
          lowerName.includes(rec) ||
          lowerType.includes(rec) ||
          lowerCategory.includes(rec)
        );
      })
      .slice(0, 6); // Max 6 recommendations
  }, [aiRecommendations, components]);

  // Filter and search components
  const filteredComponents = useMemo(() => {
    // Special case: AI Recommendations
    if (selectedTag === AI_RECOMMENDATION_TAG && !searchQuery) {
      return recommendedComponents; // Show all AI recommendations
    }

    let results = components;

    // Apply single tag filter
    if (selectedTag && selectedTag !== AI_RECOMMENDATION_TAG) {
      results = results.filter(c => {
        // Match category
        if (selectedTag === c.category) return true;

        // Match tags
        if (c.tags && Array.isArray(c.tags)) {
          return c.tags.includes(selectedTag);
        }

        return false;
      });
    }

    // Apply fuzzy search
    if (searchQuery.trim()) {
      const fuseResults = fuse.search(searchQuery);
      results = fuseResults.map(r => r.item);
    }

    // No hard limit - let it be adaptive with scrolling
    return results;
  }, [components, selectedTag, searchQuery, fuse, recommendedComponents]);

  // Toggle tag filter (single selection)
  const toggleTag = useCallback((tag: string) => {
    setSelectedTag(prev => prev === tag ? null : tag);
  }, []);

  // Handle component selection (click to add to center, or drag to specific position)
  const handleSelectComponent = useCallback((component: ArchitecturalComponent) => {
    // This will be called on click, adds component to canvas center
    onSelectComponent(component);
    setOpen(false);
    setSearchQuery(''); // Reset search
    setSelectedTag(null); // Reset filter
  }, [onSelectComponent]);

  // Handle drag start - close popover to allow drop
  const handleComponentDragStart = useCallback(() => {
    // Close popover when dragging starts so user can drop on canvas
    setOpen(false);
  }, []);

  // Reset state when popover opens
  const handleOpenChange = useCallback((newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen) {
      setSearchQuery('');
      setSelectedTag(null);
      setShowAllTags(false);
    }
  }, []);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="default"
          size="icon"
          disabled={disabled}
          className="h-10 w-10 rounded-full shadow-lg"
          title="Add Component (⌘K)"
        >
          <Plus className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[500px] p-0"
        align="start"
        side="bottom"
        sideOffset={10}
      >
        <div className="flex flex-col max-h-[calc(100vh-120px)]">
          {/* Search Bar */}
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search components..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4"
                autoFocus
              />
            </div>
          </div>

          {/* Tag Filters */}
          {visibleTags.length > 0 && (
            <div className="px-3 py-2 border-b bg-muted/30">
              <div className="flex flex-wrap gap-1.5">
                {visibleTags.map(tagInfo => {
                  const isAiTag = tagInfo.name === AI_RECOMMENDATION_TAG;
                  const isSelected = selectedTag === tagInfo.name;

                  return (
                    <Badge
                      key={tagInfo.name}
                      variant={isSelected ? "default" : "outline"}
                      className={cn(
                        "cursor-pointer text-xs px-2 py-0.5 hover:bg-accent transition-colors",
                        isAiTag && "border-primary/50"
                      )}
                      onClick={() => toggleTag(tagInfo.name)}
                      title={
                        isAiTag
                          ? 'AI Recommended Components'
                          : `${tagInfo.name} (${tagInfo.count} component${tagInfo.count > 1 ? 's' : ''})`
                      }
                    >
                      {isAiTag ? (
                        <span className="flex items-center">
                          <Wand2 className="h-3 w-3 mr-1" />
                          AI Picks
                        </span>
                      ) : (
                        <span>
                          {tagInfo.name}
                          {tagInfo.type === 'category' && tagInfo.count > 0 && (
                            <span className="ml-1 text-[10px] opacity-60">{tagInfo.count}</span>
                          )}
                        </span>
                      )}
                    </Badge>
                  );
                })}
                {hasMoreTags && !showAllTags && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setShowAllTags(true)}
                  >
                    <ChevronDown className="h-3 w-3 mr-1" />
                    +{availableTags.length - MAX_VISIBLE_TAGS} more
                  </Button>
                )}
                {showAllTags && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setShowAllTags(false)}
                  >
                    Show less
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Component List - Scrollable */}
          <ScrollArea className="flex-1 overflow-y-auto">
            <div className="p-3">
              {filteredComponents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {searchQuery || selectedTag
                    ? 'No components found matching your filters'
                    : 'No components available'}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {filteredComponents.map((component) => (
                    <div
                      key={component.id}
                      onDragStart={handleComponentDragStart}
                    >
                      <ComponentCard
                        component={component}
                        onClick={() => handleSelectComponent(component)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="px-3 py-2 border-t bg-muted/30 flex-shrink-0">
            <p className="text-xs text-muted-foreground text-center">
              {filteredComponents.length} of {components.length} components
              {selectedTag && selectedTag !== AI_RECOMMENDATION_TAG && ` • Filter: ${selectedTag}`}
              {selectedTag === AI_RECOMMENDATION_TAG && ` • AI Recommendations`}
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Component Card for grid display
interface ComponentCardProps {
  component: ArchitecturalComponent;
  onClick?: () => void;
  compact?: boolean;
}

function ComponentCard({ component, onClick, compact = false }: ComponentCardProps) {
  const iconName = (component as any).visualization?.icon || (component as any).icon || 'Box';

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData(DRAG_MIME_TYPE, JSON.stringify(component));
    event.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div
      draggable={true}
      onDragStart={handleDragStart}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 p-2 rounded-md border bg-card hover:bg-accent hover:border-primary transition-colors cursor-grab active:cursor-grabbing",
        compact && "p-1.5"
      )}
    >
      <IconRenderer
        iconName={iconName}
        defaultIcon="Box"
        className={cn("text-primary shrink-0", compact ? "h-4 w-4" : "h-5 w-5")}
      />
      <div className="flex-1 min-w-0">
        <p className={cn("font-medium truncate", compact ? "text-xs" : "text-sm")}>
          {component.type || component.name}
        </p>
        {!compact && (
          <p className="text-xs text-muted-foreground truncate">
            {component.category}
          </p>
        )}
      </div>
    </div>
  );
}
