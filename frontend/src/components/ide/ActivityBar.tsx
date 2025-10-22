
"use client";

import * as React from 'react';
import { Settings, Blocks, Home, UserCircle, Check, FileJson2, BarChart3, ShieldCheck, Lightbulb, ScrollText, Shield, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from '@/lib/utils';
import type { ViewMode } from '@/types/ide';
import { useToast } from '@/hooks/use-toast';
import { PricingOverlay } from './PricingOverlay';

interface ActivityItem {
  id: string;
  label: string;
  icon: React.ElementType;
  action?: () => void;
  position?: 'top' | 'bottom';
  viewMode?: ViewMode;
  isUserSwitcher?: boolean;
  requiresWorkspace?: boolean;
}

interface ActivityButtonDisplayProps extends React.HTMLAttributes<HTMLButtonElement> {
  item: ActivityItem;
  isActive: boolean;
  isDisabled: boolean;
}

const ActivityButtonDisplay: React.FC<ActivityButtonDisplayProps> = React.memo(({ item, isActive, isDisabled, ...props }) => {
  return (
    <Button
      {...props}
      variant="ghost"
      className={cn(
        "relative h-11 w-14 p-0 group", // Changed w-13 to w-14
        "hover:bg-accent/50",
        isActive && !isDisabled ? "text-primary" : "text-muted-foreground hover:text-foreground",
        isDisabled && "opacity-50 cursor-not-allowed hover:bg-transparent"
      )}
      onClick={isDisabled ? undefined : item.action}
      aria-label={item.label}
      aria-pressed={isActive && !isDisabled}
      disabled={isDisabled}
    >
      {isActive && !isDisabled && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-9 w-0.5 bg-primary pointer-events-none"></span>
      )}
      <item.icon
        className={cn(
          "h-11 w-11 transform scale-150", // Icon fills button, scaled up
          isActive && !isDisabled ? "text-primary" : "text-muted-foreground",
          !isDisabled && "group-hover:text-foreground",
          isDisabled && "text-muted-foreground/50"
        )}
      />
    </Button>
  );
});
ActivityButtonDisplay.displayName = 'ActivityButtonDisplay';


interface ActivityBarProps {
  onActivateCodeView?: () => void;
  onActivateArchitectView?: () => void;
  onActivateConceptView?: () => void;
  onActivateDRCView?: () => void;
  onActivateAnalyticsView?: () => void;
  onActivateBOMView?: () => void;
  onActivateDeliverView?: () => void;
  onActivateHomeView?: () => void;
  onActivateSettingsView?: () => void;
  onActivateAdminView?: () => void;
  activeViewMode?: ViewMode;
  currentUser?: string;
  userEmail?: string;
  userRole?: 'user' | 'admin';
  onLogout?: () => void;
  isWorkspaceClosed?: boolean;
}

export function ActivityBar({
  onActivateCodeView,
  onActivateArchitectView,
  onActivateConceptView,
  onActivateDRCView,
  onActivateAnalyticsView,
  onActivateBOMView,
  onActivateDeliverView,
  onActivateHomeView,
  onActivateSettingsView,
  onActivateAdminView,
  activeViewMode,
  currentUser,
  userEmail,
  userRole,
  onLogout,
  isWorkspaceClosed,
}: ActivityBarProps) {
  const { toast } = useToast();
  const [showSettingsMenu, setShowSettingsMenu] = React.useState(false);
  const [showPricingOverlay, setShowPricingOverlay] = React.useState(false);

  const activityItems: ActivityItem[] = React.useMemo(() => {
    const items = [
      { id: 'home', label: 'Home View', icon: Home, action: onActivateHomeView, position: 'top', viewMode: 'home' },
      { id: 'concept', label: 'Concept View', icon: Lightbulb, action: onActivateConceptView, position: 'top', viewMode: 'concept', requiresWorkspace: true },
      { id: 'architect', label: 'Architect View', icon: Blocks, action: onActivateArchitectView, position: 'top', viewMode: 'architect', requiresWorkspace: true },
      { id: 'drc', label: 'Validation View', icon: ShieldCheck, action: onActivateDRCView, position: 'top', viewMode: 'drc', requiresWorkspace: true },
      { id: 'analytics', label: 'Analytics View', icon: BarChart3, action: onActivateAnalyticsView, position: 'top', viewMode: 'analytics', requiresWorkspace: true },
      { id: 'bom', label: 'BOM Report', icon: ScrollText, action: onActivateBOMView, position: 'top', viewMode: 'bom', requiresWorkspace: true },
      { id: 'account', label: 'Account', icon: UserCircle, position: 'bottom', isUserSwitcher: true },
      { id: 'settings', label: 'Settings', icon: Settings, position: 'bottom' },
    ] as ActivityItem[];
    
    // Add code view and admin button only for admin users
    if (userRole === 'admin') {
      // Insert Code view between BOM (index 5) and bottom items
      items.splice(6, 0, 
        { 
          id: 'code', 
          label: 'Code View', 
          icon: FileJson2, 
          action: onActivateCodeView, 
          position: 'top', 
          viewMode: 'code',
          requiresWorkspace: true
        }
      );
      // Add Deliver after Code
      items.splice(7, 0,
        { 
          id: 'deliver', 
          label: 'Deliver', 
          icon: Rocket, 
          action: onActivateDeliverView, 
          position: 'top', 
          viewMode: 'deliver', 
          requiresWorkspace: true 
        }
      );
      // Add Admin button to bottom
      items.splice(items.length - 2, 0, 
        { 
          id: 'admin', 
          label: 'Admin Panel', 
          icon: Shield, 
          action: onActivateAdminView, 
          position: 'bottom', 
          viewMode: 'admin' 
        }
      );
    } else {
      // For non-admin users, just add Deliver after BOM
      items.splice(6, 0,
        { 
          id: 'deliver', 
          label: 'Deliver', 
          icon: Rocket, 
          action: onActivateDeliverView, 
          position: 'top', 
          viewMode: 'deliver', 
          requiresWorkspace: true 
        }
      );
    }
    
    return items;
  }, [onActivateHomeView, onActivateConceptView, onActivateArchitectView, onActivateDRCView, onActivateCodeView, onActivateAnalyticsView, onActivateBOMView, onActivateDeliverView, onActivateAdminView, userRole]);

  const topItems = React.useMemo(() => activityItems.filter(item => item.position === 'top' || item.position === undefined), [activityItems]);
  const bottomItems = React.useMemo(() => activityItems.filter(item => item.position === 'bottom'), [activityItems]);

  const getItemIsActive = React.useCallback((item: ActivityItem): boolean => {
    if (item.isUserSwitcher) return false;
    return !!(item.viewMode && item.viewMode === activeViewMode);
  }, [activeViewMode]);

  const getItemIsDisabled = React.useCallback((item: ActivityItem): boolean => {
    return !!(item.requiresWorkspace && isWorkspaceClosed);
  }, [isWorkspaceClosed]);

  return (
    <div className={cn(
      "flex h-full w-14 flex-col items-start justify-between bg-card text-card-foreground py-1.5 shadow-sm border-r border-border" // Changed w-13 to w-14
    )}>
      <div className="flex flex-col items-start space-y-1 w-full">
        {topItems.map((item) => {
          const isActive = getItemIsActive(item);
          const isDisabled = getItemIsDisabled(item);
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <ActivityButtonDisplay item={item} isActive={isActive} isDisabled={isDisabled} />
              </TooltipTrigger>
              <TooltipContent side="right" className="ml-2">
                <p>{item.label}{isDisabled ? " (Workspace required)" : ""}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      <div className="flex flex-col items-start space-y-1 w-full">
        {bottomItems.map((item) => {
          const isActive = getItemIsActive(item);
          const isDisabled = getItemIsDisabled(item);

          return item.isUserSwitcher ? (
            <DropdownMenu key={item.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <ActivityButtonDisplay item={item} isActive={isActive} isDisabled={isDisabled} />
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="right" className="ml-2">
                   <p>Account Menu</p>
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent side="right" align="end" className="ml-2 w-64">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{currentUser || 'User'}</p>
                    <p className="text-xs leading-none text-muted-foreground">{userEmail || 'user@example.com'}</p>
                    <p className="text-xs leading-none text-muted-foreground mt-1">
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Free Trial
                      </span>
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  className="text-xs cursor-pointer"
                  onClick={() => setShowPricingOverlay(true)}
                >
                  Upgrade Plan
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                  Account Settings
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="pl-6 text-xs">
                  Change Password
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="pl-6 text-xs">
                  Remove Account
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="text-xs">
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : item.id === 'settings' ? (
            <DropdownMenu key={item.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <ActivityButtonDisplay item={item} isActive={isActive} isDisabled={isDisabled} />
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="right" className="ml-2">
                   <p>Settings</p>
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent side="right" align="end" className="ml-2 w-56">
                <DropdownMenuLabel>Settings</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer">
                  <span className="text-sm">Language Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer">
                  <span className="text-sm">API Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled className="text-muted-foreground">
                  <span className="text-sm">Theme Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="text-muted-foreground">
                  <span className="text-sm">Editor Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="text-muted-foreground">
                  <span className="text-sm">Keyboard Shortcuts</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="text-muted-foreground">
                  <span className="text-sm">Notifications</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <ActivityButtonDisplay item={item} isActive={isActive} isDisabled={isDisabled} />
              </TooltipTrigger>
              <TooltipContent side="right" className="ml-2">
                 <p>{item.label}{isDisabled ? " (Workspace required)" : ""}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* Pricing Overlay */}
      <PricingOverlay
        isOpen={showPricingOverlay}
        onClose={() => setShowPricingOverlay(false)}
        currentPlan="free"
      />
    </div>
  );
}
