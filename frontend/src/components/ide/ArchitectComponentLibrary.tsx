
"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { UserCog, Loader2, Trash2, MoreVertical, Search, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArchitecturalComponent } from "@/types/backend";
import IconRenderer from './IconRenderer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { componentAPI } from "@/lib/component-api";
import { useToast } from "@/hooks/use-toast";
import { debounce } from "lodash";
import { ComponentDetailsDialog } from "./ComponentDetailsDialog";

const DRAG_MIME_TYPE = "application/x-socpilot-component";

interface LibraryComponentItemProps {
  component: ArchitecturalComponent;
  isAppLibraryItem?: boolean;
  onRemoveUserComponent?: (componentId: string) => Promise<void>;
  onViewDetails?: (component: ArchitecturalComponent) => void;
}

const LibraryComponentItem: React.FC<LibraryComponentItemProps> = ({ component, isAppLibraryItem = false, onRemoveUserComponent, onViewDetails }) => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData(DRAG_MIME_TYPE, JSON.stringify(component));
    event.dataTransfer.effectAllowed = 'copy';
  };

  const handleClick = (e: React.MouseEvent) => {
    // Only trigger if not clicking on the menu button
    if (onViewDetails && !(e.target as HTMLElement).closest('button')) {
      onViewDetails(component);
    }
  };

  // Support both old format (icon) and new format (visualization.icon)
  const iconName = (component as any).visualization?.icon || (component as any).icon || 'Shapes';

  const commonCardClasses = "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-grab active:cursor-grabbing transition-colors duration-150 p-2 shadow-sm border-sidebar-border h-[50px]";
  const commonCardContent = (
    <div className="flex flex-row items-center h-full w-full">
      <IconRenderer
        iconName={iconName}
        defaultIcon="Shapes"
        className="h-5 w-5 text-sidebar-primary shrink-0 mr-1.5"
        data-ai-hint="custom component"
      />
      {component.type && (
        <p className="text-xs font-medium text-sidebar-foreground leading-tight line-clamp-1 flex-grow min-w-0" title={component.type}>
          {component.type}
        </p>
      )}
    </div>
  );

  if (isAppLibraryItem || !onRemoveUserComponent) {
    // For App library items, or user items that cannot be removed
    return (
      <Card
        draggable={true}
        onDragStart={handleDragStart}
        onClick={handleClick}
        className={cn(commonCardClasses, "cursor-pointer")}
      >
        {commonCardContent}
      </Card>
    );
  }

  // For User library items that can be removed (and thus have a menu)
  return (
    <Card
      draggable={true}
      onDragStart={handleDragStart}
      onClick={handleClick}
      className={cn(commonCardClasses, "relative group cursor-pointer")}
    >
      {commonCardContent}
      <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-0.5 right-0.5 h-5 w-5 p-0.5 text-sidebar-foreground/60 hover:text-sidebar-foreground focus-visible:text-sidebar-foreground hover:bg-sidebar-accent/70 focus-visible:bg-sidebar-accent/70 z-10 opacity-0 group-hover:opacity-100 focus:opacity-100"
            onClick={(e) => e.stopPropagation()} // Prevent card click if any
            onMouseDown={(e) => e.stopPropagation()} // Prevent drag from starting on this button
            aria-label={`Options for ${component.name}`} // Keep component.name for aria-label for accessibility
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-48"
          side="right"
          align="start"
          sideOffset={5}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DropdownMenuItem
            onSelect={async (e) => {
              e.preventDefault(); // Ensure our async logic runs
              if (component.id) {
                await onRemoveUserComponent(component.id);
              }
              setIsMenuOpen(false); // Manually close after action
            }}
            className="text-destructive focus:text-destructive focus:bg-destructive/10"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            <span>Remove</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Card>
  );
};


export function ArchitectComponentLibrary({
  appLibraryComponents,
  isLoadingAppLibraryComponents,
  userComponents,
  isLoadingUserComponents,
  onRemoveUserComponent,
  projectId,
  enableBackendAPI = false,
  isAdmin = false,
}: ArchitectComponentLibraryProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isSearching, setIsSearching] = React.useState(false);
  const [backendComponents, setBackendComponents] = React.useState<any[]>([]);
  const [pendingComponents, setPendingComponents] = React.useState<any[]>([]);
  const [isLoadingBackend, setIsLoadingBackend] = React.useState(false);
  const [isLoadingPending, setIsLoadingPending] = React.useState(false);
  const [selectedComponent, setSelectedComponent] = React.useState<any>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = React.useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = React.useState(false);
  const [componentToReject, setComponentToReject] = React.useState<any>(null);
  const [rejectionReason, setRejectionReason] = React.useState("");

  // Load components from backend API
  const loadBackendComponents = React.useCallback(async () => {
    if (!enableBackendAPI || !projectId) return;

    setIsLoadingBackend(true);
    try {
      const response = await componentAPI.getAll();
      // Filter out pending components (they'll be shown in audit queue)
      const approvedComponents = response.components.filter((c: any) => 
        c.status !== 'needs_review' && c.tier !== 'pending'
      );
      setBackendComponents(approvedComponents);
    } catch (error) {
      console.error('Failed to load components from backend:', error);
      toast({
        title: "Error",
        description: "Failed to load components from backend API",
        variant: "destructive"
      });
    } finally {
      setIsLoadingBackend(false);
    }
  }, [enableBackendAPI, projectId, toast]);

  // Load pending components for admin review
  const loadPendingComponents = React.useCallback(async () => {
    if (!enableBackendAPI || !isAdmin) return;

    setIsLoadingPending(true);
    try {
      const response = await componentAPI.getPendingAudit();
      setPendingComponents(response.components);
    } catch (error) {
      console.error('Failed to load pending components:', error);
      toast({
        title: "Error",
        description: "Failed to load pending components",
        variant: "destructive"
      });
    } finally {
      setIsLoadingPending(false);
    }
  }, [enableBackendAPI, isAdmin, toast]);

  // Search components using backend API
  const searchBackendComponents = React.useCallback(
    debounce(async (query: string) => {
      if (!enableBackendAPI || !query.trim()) {
        loadBackendComponents();
        return;
      }

      setIsSearching(true);
      try {
        const results = await componentAPI.search({ query });
        setBackendComponents(results.map(r => r.component));
      } catch (error) {
        console.error('Failed to search components:', error);
        toast({
          title: "Search Error",
          description: "Failed to search components",
          variant: "destructive"
        });
      } finally {
        setIsSearching(false);
      }
    }, 300),
    [enableBackendAPI, loadBackendComponents, toast]
  );

  // Load components on mount
  React.useEffect(() => {
    if (enableBackendAPI) {
      loadBackendComponents();
      if (isAdmin) {
        loadPendingComponents();
      }
    }
  }, [enableBackendAPI, isAdmin, loadBackendComponents, loadPendingComponents]);

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (enableBackendAPI) {
      searchBackendComponents(query);
    }
  };

  // Handle refresh
  const handleRefresh = () => {
    setSearchQuery("");
    loadBackendComponents();
    if (isAdmin) {
      loadPendingComponents();
    }
  };

  // Handle approve component
  const handleApproveComponent = async (componentId: string) => {
    try {
      await componentAPI.approveComponent(componentId);
      toast({
        title: "Component Approved",
        description: "Component has been added to the shared library",
      });
      // Refresh both lists
      loadBackendComponents();
      loadPendingComponents();
    } catch (error) {
      console.error('Failed to approve component:', error);
      toast({
        title: "Error",
        description: "Failed to approve component",
        variant: "destructive"
      });
    }
  };

  // Handle reject component - open dialog
  const handleRejectClick = (component: any) => {
    setComponentToReject(component);
    setRejectionReason("");
    setRejectDialogOpen(true);
  };

  // Confirm rejection
  const confirmReject = async () => {
    if (!componentToReject || !rejectionReason.trim()) {
      toast({
        title: "Error",
        description: "Please provide a reason for rejection",
        variant: "destructive"
      });
      return;
    }

    try {
      await componentAPI.rejectComponent(componentToReject.id, rejectionReason);
      toast({
        title: "Component Rejected",
        description: "Component has been removed from the system",
      });
      // Refresh pending list
      loadPendingComponents();
      setRejectDialogOpen(false);
      setComponentToReject(null);
      setRejectionReason("");
    } catch (error) {
      console.error('Failed to reject component:', error);
      toast({
        title: "Error",
        description: "Failed to reject component",
        variant: "destructive"
      });
    }
  };

  // Handle view details
  const handleViewDetails = (component: any) => {
    setSelectedComponent(component);
    setIsDetailsDialogOpen(true);
  };

  // Filter local components by search query
  const filteredAppComponents = React.useMemo(() => {
    if (!searchQuery.trim()) return appLibraryComponents;
    const query = searchQuery.toLowerCase();
    return appLibraryComponents.filter(c =>
      c.type?.toLowerCase().includes(query) ||
      c.name?.toLowerCase().includes(query) ||
      c.category?.toLowerCase().includes(query)
    );
  }, [appLibraryComponents, searchQuery]);

  const filteredUserComponents = React.useMemo(() => {
    if (!searchQuery.trim()) return userComponents;
    const query = searchQuery.toLowerCase();
    return userComponents.filter(c =>
      c.type?.toLowerCase().includes(query) ||
      c.name?.toLowerCase().includes(query) ||
      c.category?.toLowerCase().includes(query)
    );
  }, [userComponents, searchQuery]);

  return (
    <ScrollArea className={cn("h-full w-full bg-sidebar text-sidebar-foreground")}>
      <div className="p-2 space-y-2">
        {/* Search Bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-sidebar-foreground/50" />
            <Input
              type="text"
              placeholder="Search components..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="pl-8 h-8 text-xs bg-sidebar-accent border-sidebar-border"
            />
          </div>
          {enableBackendAPI && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isLoadingBackend || isSearching}
              className="h-8 w-8"
            >
              <RefreshCw className={cn("h-4 w-4", (isLoadingBackend || isSearching) && "animate-spin")} />
            </Button>
          )}
        </div>
        <Accordion
          type="multiple"
          defaultValue={enableBackendAPI ? ["backend-component-lib"] : ["app-component-lib", "user-component-lib"]}
          className="w-full space-y-2"
        >
          {/* Backend Component Library (when enabled) */}
          {enableBackendAPI && (
            <AccordionItem value="backend-component-lib" className="rounded-md border-0">
              <AccordionTrigger className="text-sm font-semibold hover:no-underline px-3 py-2.5 data-[state=open]:text-sidebar-primary rounded-t-md data-[state=closed]:rounded-md hover:text-sidebar-primary">
                <div className="flex items-center text-sidebar-foreground">
                  <IconRenderer iconName="Database" className="h-4 w-4 mr-2 text-sidebar-primary" data-ai-hint="backend library" />
                  Component Library
                  {backendComponents.length > 0 && (
                    <span className="ml-2 text-xs text-sidebar-foreground/60">({backendComponents.length})</span>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="bg-sidebar rounded-b-md">
                {isLoadingBackend || isSearching ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-5 w-5 animate-spin text-sidebar-primary mr-2" />
                    <span className="text-xs text-sidebar-foreground/70">
                      {isSearching ? 'Searching...' : 'Loading components...'}
                    </span>
                  </div>
                ) : backendComponents.length === 0 ? (
                  <CardContent className="text-center">
                    <p className="text-xs text-sidebar-foreground/70">
                      {searchQuery ? 'No components found matching your search.' : 'No components available.'}
                    </p>
                  </CardContent>
                ) : (
                  <div className="grid grid-cols-2 gap-1">
                    {backendComponents.map((component, idx) => (
                      <LibraryComponentItem
                        key={component.id || idx}
                        component={component}
                        isAppLibraryItem={true}
                        onViewDetails={() => handleViewDetails(component)}
                      />
                    ))}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Wait for Audit (Admin Only) */}
          {enableBackendAPI && isAdmin && (
            <AccordionItem value="pending-audit" className="rounded-md border-0 border-l-4 border-l-yellow-500">
              <AccordionTrigger className="text-sm font-semibold hover:no-underline px-3 py-2.5 data-[state=open]:text-sidebar-primary rounded-t-md data-[state=closed]:rounded-md hover:text-sidebar-primary">
                <div className="flex items-center text-sidebar-foreground">
                  <IconRenderer iconName="AlertTriangle" className="h-4 w-4 mr-2 text-yellow-500" data-ai-hint="pending audit" />
                  Wait for Audit
                  {pendingComponents.length > 0 && (
                    <span className="ml-2 text-xs bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 px-2 py-0.5 rounded-full font-semibold">
                      {pendingComponents.length}
                    </span>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="bg-sidebar rounded-b-md p-2 space-y-2">
                {isLoadingPending ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-5 w-5 animate-spin text-sidebar-primary mr-2" />
                    <span className="text-xs text-sidebar-foreground/70">Loading pending components...</span>
                  </div>
                ) : pendingComponents.length === 0 ? (
                  <CardContent className="text-center">
                    <p className="text-xs text-sidebar-foreground/70">
                      No components pending review
                    </p>
                  </CardContent>
                ) : (
                  <div className="space-y-2">
                    {pendingComponents.map((component) => (
                      <Card key={component.id} className="p-3 border-yellow-500/30 bg-yellow-500/5">
                        <div className="space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <IconRenderer
                                  iconName={component.iconName || 'Box'}
                                  className="h-4 w-4 text-sidebar-primary shrink-0"
                                />
                                <p className="text-sm font-medium truncate">{component.name}</p>
                              </div>
                              <p className="text-xs text-sidebar-foreground/60 mt-1">{component.category} • {component.type}</p>
                            </div>
                            <div className="flex items-center gap-1 ml-2">
                              <span className={cn(
                                "text-xs font-semibold px-2 py-0.5 rounded",
                                component.qualityScore >= 80 ? "bg-green-500/20 text-green-600 dark:text-green-400" :
                                component.qualityScore >= 60 ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400" :
                                "bg-red-500/20 text-red-600 dark:text-red-400"
                              )}>
                                {component.qualityScore || 0}/100
                              </span>
                            </div>
                          </div>
                          
                          {component.qualityIssues && component.qualityIssues.length > 0 && (
                            <div className="text-xs text-sidebar-foreground/70 space-y-1">
                              <p className="font-medium">Issues:</p>
                              <ul className="list-disc list-inside space-y-0.5">
                                {component.qualityIssues.slice(0, 3).map((issue: string, idx: number) => (
                                  <li key={idx} className="truncate">{issue}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div className="flex gap-2 pt-2">
                            <Button
                              size="sm"
                              variant="default"
                              className="flex-1 h-7 text-xs"
                              onClick={() => handleApproveComponent(component.id)}
                            >
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 h-7 text-xs"
                              onClick={() => handleViewDetails(component)}
                            >
                              Details
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="flex-1 h-7 text-xs"
                              onClick={() => handleRejectClick(component)}
                            >
                              Reject
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Local App Component Library */}
          {!enableBackendAPI && (
            <AccordionItem value="app-component-lib" className="rounded-md border-0">
              <AccordionTrigger className="text-sm font-semibold hover:no-underline px-3 py-2.5 data-[state=open]:text-sidebar-primary rounded-t-md data-[state=closed]:rounded-md hover:text-sidebar-primary">
                <div className="flex items-center text-sidebar-foreground">
                  <IconRenderer iconName="Library" className="h-4 w-4 mr-2 text-sidebar-primary" data-ai-hint="application library" />
                  App Component Lib
                  {filteredAppComponents.length > 0 && (
                    <span className="ml-2 text-xs text-sidebar-foreground/60">({filteredAppComponents.length})</span>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="bg-sidebar rounded-b-md">
                {isLoadingAppLibraryComponents ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-5 w-5 animate-spin text-sidebar-primary mr-2" />
                    <span className="text-xs text-sidebar-foreground/70">Loading app components...</span>
                  </div>
                ) : filteredAppComponents.length === 0 ? (
                  <CardContent className="text-center">
                    <p className="text-xs text-sidebar-foreground/70">
                      {searchQuery ? 'No components found matching your search.' : 'No app-defined components found.'}
                    </p>
                  </CardContent>
                ) : (
                  <div className="grid grid-cols-2 gap-1">
                    {filteredAppComponents.map((component) => (
                      <LibraryComponentItem
                        key={component.id || component.name}
                        component={component}
                        isAppLibraryItem={true}
                        onViewDetails={handleViewDetails}
                      />
                    ))}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          )}

          {/* User Component Library */}
          {!enableBackendAPI && (
            <AccordionItem value="user-component-lib" className="rounded-md border-0">
              <AccordionTrigger className="text-sm font-semibold hover:no-underline px-3 py-2.5 data-[state=open]:text-sidebar-primary rounded-t-md data-[state=closed]:rounded-md hover:text-sidebar-primary">
                <div className="flex items-center text-sidebar-foreground">
                  <IconRenderer iconName="UserCog" className="h-4 w-4 mr-2 text-sidebar-primary" data-ai-hint="user library" />
                  User Component Lib
                  {filteredUserComponents.length > 0 && (
                    <span className="ml-2 text-xs text-sidebar-foreground/60">({filteredUserComponents.length})</span>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="bg-sidebar rounded-b-md">
                {isLoadingUserComponents ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-5 w-5 animate-spin text-sidebar-primary mr-2" />
                    <span className="text-xs text-sidebar-foreground/70">Loading user components...</span>
                  </div>
                ) : filteredUserComponents.length === 0 ? (
                  <CardContent className="text-center">
                    <p className="text-xs text-sidebar-foreground/70">
                      {searchQuery ? 'No components found matching your search.' : 'No user-defined components yet. Export components from the canvas inspector.'}
                    </p>
                  </CardContent>
                ) : (
                  <div className="grid grid-cols-2 gap-1">
                    {filteredUserComponents.map((component) => (
                      <LibraryComponentItem
                        key={component.id || component.name}
                        component={component}
                        onRemoveUserComponent={onRemoveUserComponent}
                        isAppLibraryItem={false}
                        onViewDetails={handleViewDetails}
                      />
                    ))}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </div>

      {/* Component Details Dialog */}
      <ComponentDetailsDialog
        component={selectedComponent}
        isOpen={isDetailsDialogOpen}
        onOpenChange={setIsDetailsDialogOpen}
      />

      {/* Reject Component Dialog */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Component</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reject "{componentToReject?.name}"? This will remove it from the system library.
              The user's copy will remain unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium mb-2 block">
              Reason for rejection (required):
            </label>
            <Textarea
              placeholder="e.g., Duplicate component, incomplete interfaces, quality issues..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!rejectionReason.trim()}
            >
              Reject Component
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScrollArea>
  );
}

interface ArchitectComponentLibraryProps {
  appLibraryComponents: ArchitecturalComponent[];
  isLoadingAppLibraryComponents: boolean;
  userComponents: ArchitecturalComponent[];
  isLoadingUserComponents: boolean;
  onRemoveUserComponent: (componentId: string) => Promise<void>;
  projectId?: string;
  enableBackendAPI?: boolean;
  isAdmin?: boolean;
}

