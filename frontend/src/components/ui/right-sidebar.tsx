
"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { VariantProps, cva } from "class-variance-authority"
import { PanelLeft } from "lucide-react"

import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const RIGHT_SIDEBAR_COOKIE_NAME = "sidebar_state" // Renamed for clarity, though might need adjustment if used for left too
const RIGHT_SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
export const RIGHT_SIDEBAR_WIDTH = "16rem" 
export const RIGHT_SIDEBAR_WIDTH_ICON = "3rem" 
const RIGHT_SIDEBAR_WIDTH_MOBILE = "18rem"
const RIGHT_SIDEBAR_KEYBOARD_SHORTCUT = "b"

type RightSidebarContextValue = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const RightSidebarContext = React.createContext<RightSidebarContextValue | null>(null)

function useRightSidebar() {
  const context = React.useContext(RightSidebarContext)
  if (!context) {
    throw new Error("useRightSidebar must be used within a RightSidebarProvider.")
  }
  return context
}

interface RightSidebarProviderProps {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

const RightSidebarProvider: React.FC<RightSidebarProviderProps> = (
  {
    defaultOpen = true,
    open: openProp,
    onOpenChange: setOpenProp,
    children,
  }
) => {
  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = React.useState(false)
  const [_open, _setOpen] = React.useState(defaultOpen)
  
  const open = openProp !== undefined ? openProp : _open;

  const setOpen = React.useCallback(
    (value: boolean | ((current: boolean) => boolean)) => {
      const newOpenState = typeof value === 'function' ? value(open) : value;
      if (setOpenProp) {
        setOpenProp(newOpenState);
      } else {
        _setOpen(newOpenState);
      }
      if (openProp === undefined && setOpenProp === undefined) {
        document.cookie = `${RIGHT_SIDEBAR_COOKIE_NAME}=${newOpenState}; path=/; max-age=${RIGHT_SIDEBAR_COOKIE_MAX_AGE}`;
      }
    },
    [open, openProp, _setOpen, setOpenProp] 
  );

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((current) => !current);
    } else {
      if (openProp !== undefined && setOpenProp) {
        setOpenProp(!openProp);
      } else {
        setOpen((current) => !current);
      }
    }
  }, [isMobile, setOpen, setOpenMobile, openProp, setOpenProp]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === RIGHT_SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSidebar])

  const state = open ? "expanded" : "collapsed"

  const contextValue = React.useMemo<RightSidebarContextValue>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
  )

  return (
    <RightSidebarContext.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        {children}
      </TooltipProvider>
    </RightSidebarContext.Provider>
  )
}
RightSidebarProvider.displayName = "RightSidebarProvider"


interface RightSidebarSpecificProps {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type RightSidebarProps = RightSidebarSpecificProps & Omit<React.ComponentProps<"div">, keyof RightSidebarSpecificProps>;

const RightSidebar = React.forwardRef<HTMLDivElement, RightSidebarProps>(
  (
    {
      side = "left",
      variant = "sidebar",
      collapsible = "offcanvas",
      className,
      children,
      open: propsOpen,
      onOpenChange: propsOnOpenChange,
      ...otherHtmlProps 
    },
    ref
  ) => {
    const {
      open: contextOpen,
      // setOpen: contextSetOpen, // Not used if propsOpen is defined for instance control
      isMobile,
      openMobile: contextOpenMobile,
      setOpenMobile: contextSetOpenMobile,
    } = useRightSidebar()

    const isPropsOpenDefined = propsOpen !== undefined;

    let currentOpen: boolean;
    if (isPropsOpenDefined) {
      currentOpen = propsOpen; 
    } else {
      currentOpen = isMobile ? contextOpenMobile : contextOpen; // Fallback to context
    }
    
    let effectiveOnOpenChange = propsOnOpenChange;
     if (!isPropsOpenDefined && !propsOnOpenChange && isMobile) {
        effectiveOnOpenChange = contextSetOpenMobile;
    }


    if (collapsible === "offcanvas" && !isMobile && !currentOpen) {
      return (
        <div
          ref={ref}
          className={cn(className, "hidden")}
          data-state="collapsed"
          data-collapsible="offcanvas"
          data-variant={variant}
          data-side={side}
          {...otherHtmlProps}
        />
      );
    }


    if (collapsible === "none") {
      return (
        <div
          className={cn(
            "flex h-full w-[var(--this-sidebar-width,var(--sidebar-width))] flex-col bg-sidebar text-sidebar-foreground", 
            className
          )}
          ref={ref}
          {...otherHtmlProps}
        >
          {children}
        </div>
      )
    }

    if (isMobile) {
      return (
        <Sheet
          open={currentOpen} // Use the resolved currentOpen for Sheet
          onOpenChange={effectiveOnOpenChange} // Use resolved onOpenChange
        >
          <SheetContent
            data-sidebar="sidebar" // Keep data-attributes for potential CSS or testing
            data-mobile="true"
            className="w-[var(--sidebar-width-mobile)] bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
            style={
              {
                "--sidebar-width-mobile": RIGHT_SIDEBAR_WIDTH_MOBILE,
              } as React.CSSProperties
            }
            side={side}
          >
            <div className="flex h-full w-full flex-col">{children}</div>
          </SheetContent>
        </Sheet>
      )
    }
    
    // Desktop logic
    let finalWidthClass = "";
    let finalContainerClasses = "group peer hidden md:flex flex-col text-sidebar-foreground relative transition-all duration-200 ease-linear h-full";
    let finalInnerDivClasses = "flex h-full w-full flex-col bg-sidebar text-sidebar-foreground overflow-hidden";

    const isIconModeActive = collapsible === "icon" && !currentOpen;

    if (variant === "floating" || variant === "inset") {
      finalContainerClasses = cn(finalContainerClasses, "p-2");
      finalInnerDivClasses = cn(finalInnerDivClasses, "rounded-lg");
      if (variant === "floating") {
        finalInnerDivClasses = cn(finalInnerDivClasses, "border border-sidebar-border shadow");
      } else { 
        finalInnerDivClasses = cn(finalInnerDivClasses, "shadow");
      }
      finalWidthClass = isIconModeActive
        ? "w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4))]"
        : "w-full"; // Changed for floating/inset to take full width of its p-2 container
    } else { 
      finalContainerClasses = cn(finalContainerClasses, (side === 'left' ? 'border-r border-sidebar-border' : 'border-l border-sidebar-border'));
      finalWidthClass = isIconModeActive
        ? "w-[var(--sidebar-width-icon)]" // Icon mode still uses its specific var
        : "w-full"; // Expanded sidebar variant now takes full width of parent
    }

    return (
      <div
        ref={ref}
        className={cn(finalContainerClasses, finalWidthClass, className)}
        data-state={currentOpen ? "expanded" : "collapsed"}
        data-collapsible={(collapsible as string) !== "none" && !currentOpen ? collapsible : ""}
        data-variant={variant}
        data-side={side}
        style={{
          ...otherHtmlProps.style,
          // These are defaults if --this-sidebar-width is not set via style prop on instance
          '--sidebar-width': RIGHT_SIDEBAR_WIDTH, 
          '--sidebar-width-icon': RIGHT_SIDEBAR_WIDTH_ICON,
        } as React.CSSProperties}
        {...otherHtmlProps}
      >
        <div
          data-sidebar="sidebar"
          className={finalInnerDivClasses}
        >
          {children}
        </div>
        {collapsible === "icon" && <RightSidebarRail />}
      </div>
    );
  }
)
RightSidebar.displayName = "RightSidebar"

const RightSidebarTrigger = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.ComponentProps<typeof Button>
>(({ className, onClick, ...props }, ref) => {
  const { toggleSidebar } = useRightSidebar()

  return (
    <Button
      ref={ref}
      data-sidebar="trigger"
      variant="ghost"
      size="icon"
      className={cn("h-7 w-7", className)}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <PanelLeft />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  )
})
RightSidebarTrigger.displayName = "RightSidebarTrigger"

const RightSidebarRail = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button">
>(({ className, ...props }, ref) => {
  const { toggleSidebar } = useRightSidebar()

  return (
    <button
      ref={ref}
      data-sidebar="rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-sidebar-border group-data-[side=left]:-right-4 group-data-[side=right]:left-0 sm:flex",
        "[[data-side=left]_&]:cursor-w-resize [[data-side=right]_&]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        className
      )}
      {...props}
    />
  )
})
RightSidebarRail.displayName = "RightSidebarRail"

const RightSidebarInset = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"main">
>(({ className, ...props }, ref) => {
  return (
    <main
      ref={ref}
      className={cn(
        "relative flex min-h-0 flex-1 flex-col bg-background overflow-hidden", 
        "peer-data-[variant=inset]:min-h-[calc(100%-theme(spacing.4))] md:peer-data-[variant=inset]:m-2 md:peer-data-[state=collapsed]:peer-data-[variant=inset]:ml-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow",
        className
      )}
      {...props}
    />
  )
})
RightSidebarInset.displayName = "RightSidebarInset"

const RightSidebarInput = React.forwardRef<
  React.ElementRef<typeof Input>,
  React.ComponentProps<typeof Input>
>(({ className, ...props }, ref) => {
  return (
    <Input
      ref={ref}
      data-sidebar="input"
      className={cn(
        "h-8 w-full bg-background shadow-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        className
      )}
      {...props}
    />
  )
})
RightSidebarInput.displayName = "RightSidebarInput"

const RightSidebarHeader = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
})
RightSidebarHeader.displayName = "RightSidebarHeader"

const RightSidebarFooter = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
})
RightSidebarFooter.displayName = "RightSidebarFooter"

const RightSidebarSeparator = React.forwardRef<
  React.ElementRef<typeof Separator>,
  React.ComponentProps<typeof Separator>
>(({ className, ...props }, ref) => {
  return (
    <Separator
      ref={ref}
      data-sidebar="separator"
      className={cn("mx-2 w-auto bg-sidebar-border", className)}
      {...props}
    />
  )
})
RightSidebarSeparator.displayName = "RightSidebarSeparator"

const RightSidebarContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className
      )}
      {...props}
    />
  )
})
RightSidebarContent.displayName = "RightSidebarContent"

const RightSidebarGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  )
})
RightSidebarGroup.displayName = "RightSidebarGroup"

const RightSidebarGroupLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & { asChild?: boolean }
>(({ className, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "div"

  return (
    <Comp
      ref={ref}
      data-sidebar="group-label"
      className={cn(
        "duration-200 flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-none ring-sidebar-ring transition-[margin,opa] ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
        className
      )}
      {...props}
    />
  )
})
RightSidebarGroupLabel.displayName = "RightSidebarGroupLabel"

const RightSidebarGroupAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & { asChild?: boolean }
>(({ className, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      ref={ref}
      data-sidebar="group-action"
      className={cn(
        "absolute right-3 top-3.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-none ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "after:absolute after:-inset-2 after:md:hidden",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
})
RightSidebarGroupAction.displayName = "RightSidebarGroupAction"

const RightSidebarGroupContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="group-content"
    className={cn("w-full text-sm", className)}
    {...props}
  />
))
RightSidebarGroupContent.displayName = "RightSidebarGroupContent"

const RightSidebarMenu = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    data-sidebar="menu"
    className={cn("flex w-full min-w-0 flex-col gap-1", className)}
    {...props}
  />
))
RightSidebarMenu.displayName = "RightSidebarMenu"

const RightSidebarMenuItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<"li">
>(({ className, ...props }, ref) => (
  <li
    ref={ref}
    data-sidebar="menu-item"
    className={cn("group/menu-item relative", className)}
    {...props}
  />
))
RightSidebarMenuItem.displayName = "RightSidebarMenuItem"

const rightSidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-[[data-sidebar=menu-action]]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:!p-2 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        outline:
          "bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]",
      },
      size: {
        default: "h-8 text-sm",
        sm: "h-7 text-xs",
        lg: "h-12 text-sm group-data-[collapsible=icon]:!p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const RightSidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & {
    asChild?: boolean
    isActive?: boolean
    tooltip?: string | React.ComponentProps<typeof TooltipContent>
  } & VariantProps<typeof rightSidebarMenuButtonVariants>
>(
  (
    {
      asChild = false,
      isActive = false,
      variant = "default",
      size = "default",
      tooltip,
      className,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button"
    const { isMobile, state } = useRightSidebar()

    const button = (
      <Comp
        ref={ref}
        data-sidebar="menu-button"
        data-size={size}
        data-active={isActive}
        className={cn(rightSidebarMenuButtonVariants({ variant, size }), className)}
        {...props}
      />
    )

    if (!tooltip) {
      return button
    }

    if (typeof tooltip === "string") {
      tooltip = {
        children: tooltip,
      }
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent
          side="right"
          align="center"
          hidden={state !== "collapsed" || isMobile}
          {...tooltip}
        />
      </Tooltip>
    )
  }
)
RightSidebarMenuButton.displayName = "RightSidebarMenuButton"

const RightSidebarMenuAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & {
    asChild?: boolean
    showOnHover?: boolean
  }
>(({ className, asChild = false, showOnHover = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      ref={ref}
      data-sidebar="menu-action"
      className={cn(
        "absolute right-1 top-1.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-none ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 peer-hover/menu-button:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0",
        "after:absolute after:-inset-2 after:md:hidden",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        showOnHover &&
          "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground md:opacity-0",
        className
      )}
      {...props}
    />
  )
})
RightSidebarMenuAction.displayName = "RightSidebarMenuAction"

const RightSidebarMenuBadge = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="menu-badge"
    className={cn(
      "absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums text-sidebar-foreground select-none pointer-events-none",
      "peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground",
      "peer-data-[size=sm]/menu-button:top-1",
      "peer-data-[size=default]/menu-button:top-1.5",
      "peer-data-[size=lg]/menu-button:top-2.5",
      "group-data-[collapsible=icon]:hidden",
      className
    )}
    {...props}
  />
))
RightSidebarMenuBadge.displayName = "RightSidebarMenuBadge"

const RightSidebarMenuSkeleton = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    showIcon?: boolean
  }
>(({ className, showIcon = false, ...props }, ref) => {
  const width = React.useMemo(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`
  }, [])

  return (
    <div
      ref={ref}
      data-sidebar="menu-skeleton"
      className={cn("rounded-md h-8 flex gap-2 px-2 items-center", className)}
      {...props}
    >
      {showIcon && (
        <Skeleton
          className="size-4 rounded-md"
          data-sidebar="menu-skeleton-icon"
        />
      )}
      <Skeleton
        className="h-4 flex-1 max-w-[--skeleton-width]"
        data-sidebar="menu-skeleton-text"
        style={
          {
            "--skeleton-width": width,
          } as React.CSSProperties
        }
      />
    </div>
  )
})
RightSidebarMenuSkeleton.displayName = "RightSidebarMenuSkeleton"

const RightSidebarMenuSub = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    data-sidebar="menu-sub"
    className={cn(
      "mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5",
      "group-data-[collapsible=icon]:hidden",
      className
    )}
    {...props}
  />
))
RightSidebarMenuSub.displayName = "RightSidebarMenuSub"

const RightSidebarMenuSubItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<"li">
>(({ ...props }, ref) => <li ref={ref} {...props} />)
RightSidebarMenuSubItem.displayName = "RightSidebarMenuSubItem"

const RightSidebarMenuSubButton = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentProps<"a"> & {
    asChild?: boolean
    size?: "sm" | "md"
    isActive?: boolean
  }
>(({ asChild = false, size = "md", isActive, className, ...props }, ref) => {
  const Comp = asChild ? Slot : "a"

  return (
    <Comp
      ref={ref}
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        "flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground",
        "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
        size === "sm" && "text-xs",
        size === "md" && "text-sm",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
})
RightSidebarMenuSubButton.displayName = "RightSidebarMenuSubButton"

export {
  RightSidebar,
  RightSidebarContent,
  RightSidebarFooter,
  RightSidebarGroup,
  RightSidebarGroupAction,
  RightSidebarGroupContent,
  RightSidebarGroupLabel,
  RightSidebarHeader,
  RightSidebarInput,
  RightSidebarInset,
  RightSidebarMenu,
  RightSidebarMenuAction,
  RightSidebarMenuBadge,
  RightSidebarMenuButton,
  RightSidebarMenuItem,
  RightSidebarMenuSkeleton,
  RightSidebarMenuSub,
  RightSidebarMenuSubButton,
  RightSidebarMenuSubItem,
  RightSidebarProvider,
  RightSidebarRail,
  RightSidebarSeparator,
  RightSidebarTrigger,
  useRightSidebar,
}
