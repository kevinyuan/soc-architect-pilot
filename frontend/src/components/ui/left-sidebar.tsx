
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

const LEFT_SIDEBAR_COOKIE_NAME = "left_sidebar_state"
const LEFT_SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
export const LEFT_SIDEBAR_WIDTH = "16rem"
export const LEFT_SIDEBAR_WIDTH_ICON = "3rem"
const LEFT_SIDEBAR_WIDTH_MOBILE = "18rem"
const LEFT_SIDEBAR_KEYBOARD_SHORTCUT = "b" // Usually for the primary sidebar

type LeftSidebarContextValue = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (value: boolean | ((current: boolean) => boolean)) => void
  openMobile: boolean
  setOpenMobile: (open: boolean | ((current: boolean) => boolean)) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const LeftSidebarContext = React.createContext<LeftSidebarContextValue | null>(null)

function useLeftSidebar() {
  const context = React.useContext(LeftSidebarContext)
  if (!context) {
    throw new Error("useLeftSidebar must be used within a LeftSidebarProvider.")
  }
  return context
}

interface LeftSidebarProviderProps {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean | ((current: boolean) => boolean)) => void;
  children: React.ReactNode;
}

const LeftSidebarProvider: React.FC<LeftSidebarProviderProps> = (
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

  const setOpenInContext = React.useCallback(
    (value: boolean | ((current: boolean) => boolean)) => {
        if (setOpenProp) {
            setOpenProp(value);
        } else {
            _setOpen(value);
        }
    },
    [setOpenProp, _setOpen]
  );

  React.useEffect(() => {
    if (openProp === undefined && setOpenProp === undefined) {
      document.cookie = `${LEFT_SIDEBAR_COOKIE_NAME}=${_open}; path=/; max-age=${LEFT_SIDEBAR_COOKIE_MAX_AGE}`;
    }
  }, [_open, openProp, setOpenProp]);

  const isMobileRef = React.useRef(isMobile);
  React.useEffect(() => {
    isMobileRef.current = isMobile;
  }, [isMobile]);

  const toggleSidebar = React.useCallback(() => {
    if (isMobileRef.current) {
      setOpenMobile((current) => !current);
    } else {
      setOpenInContext((current) => !current);
    }
  }, [setOpenMobile, setOpenInContext]); // setOpenInContext is stable

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === LEFT_SIDEBAR_KEYBOARD_SHORTCUT &&
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

  const contextValue = React.useMemo<LeftSidebarContextValue>(
    () => ({
      state,
      open,
      setOpen: setOpenInContext,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpenInContext, isMobile, openMobile, setOpenMobile, toggleSidebar]
  )

  return (
    <LeftSidebarContext.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        {children}
      </TooltipProvider>
    </LeftSidebarContext.Provider>
  )
}
LeftSidebarProvider.displayName = "LeftSidebarProvider"


interface LeftSidebarSpecificProps {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type LeftSidebarProps = LeftSidebarSpecificProps & Omit<React.ComponentProps<"div">, keyof LeftSidebarSpecificProps>;

const LeftSidebar = React.forwardRef<HTMLDivElement, LeftSidebarProps>(
  (
    {
      side = "left", // Default to left for LeftSidebar
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
      isMobile,
      openMobile: contextOpenMobile,
      setOpenMobile: contextSetOpenMobile,
    } = useLeftSidebar()

    const isPropsOpenDefined = propsOpen !== undefined;

    let currentOpen: boolean;
    if (isPropsOpenDefined) {
      currentOpen = propsOpen;
    } else {
      currentOpen = isMobile ? contextOpenMobile : contextOpen;
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
            "flex h-full w-[var(--this-sidebar-width,var(--left-sidebar-width))] flex-col bg-sidebar text-sidebar-foreground",
            className
          )}
          ref={ref}
          style={{
            ...otherHtmlProps.style,
            '--left-sidebar-width': LEFT_SIDEBAR_WIDTH, // Use specific var name
          } as React.CSSProperties}
          {...otherHtmlProps}
        >
          {children}
        </div>
      )
    }

    if (isMobile) {
      return (
        <Sheet
          open={currentOpen}
          onOpenChange={effectiveOnOpenChange || contextSetOpenMobile}
        >
          <SheetContent
            data-sidebar="sidebar"
            data-mobile="true"
            className="w-[var(--left-sidebar-width-mobile)] bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
            style={
              {
                "--left-sidebar-width-mobile": LEFT_SIDEBAR_WIDTH_MOBILE,
              } as React.CSSProperties
            }
            side={side}
          >
            <div className="flex h-full w-full flex-col">{children}</div>
          </SheetContent>
        </Sheet>
      )
    }

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
        ? "w-[calc(var(--left-sidebar-width-icon)_+_theme(spacing.4))]"
        : "w-[calc(var(--this-sidebar-width,var(--left-sidebar-width))_+_theme(spacing.4))]";
    } else {
      finalContainerClasses = cn(finalContainerClasses, (side === 'left' ? 'border-r border-sidebar-border' : 'border-l border-sidebar-border'));
      finalWidthClass = isIconModeActive
        ? "w-[--left-sidebar-width-icon]"
        : "w-[var(--this-sidebar-width,var(--left-sidebar-width))]";
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
          '--left-sidebar-width': LEFT_SIDEBAR_WIDTH,
          '--left-sidebar-width-icon': LEFT_SIDEBAR_WIDTH_ICON,
        } as React.CSSProperties}
        {...otherHtmlProps}
      >
        <div
          data-sidebar="sidebar"
          className={finalInnerDivClasses}
        >
          {children}
        </div>
        {collapsible === "icon" && <LeftSidebarRail />}
      </div>
    );
  }
)
LeftSidebar.displayName = "LeftSidebar"

const LeftSidebarTrigger = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.ComponentProps<typeof Button>
>(({ className, onClick, ...props }, ref) => {
  const { toggleSidebar } = useLeftSidebar()

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
LeftSidebarTrigger.displayName = "LeftSidebarTrigger"

const LeftSidebarRail = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button">
>(({ className, ...props }, ref) => {
  const { toggleSidebar } = useLeftSidebar()

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
LeftSidebarRail.displayName = "LeftSidebarRail"

const LeftSidebarInset = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"main">
>(({ className, ...props }, ref) => {
  return (
    <main
      ref={ref}
      className={cn(
        "relative flex min-h-0 flex-1 flex-col bg-background overflow-hidden",
        "peer-data-[variant=inset]:min-h-[calc(100%-theme(spacing.4))] md:peer-data-[variant=inset]:m-2 md:peer-data-[state=collapsed]:peer-data-[variant=inset]:ml-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow",
        // Adjust margin for left sidebar if it's on the right (though unlikely for LeftSidebar)
        "md:peer-data-[state=collapsed]:peer-data-[side=right]:peer-data-[variant=inset]:mr-2 md:peer-data-[side=right]:peer-data-[variant=inset]:mr-0",
        className
      )}
      {...props}
    />
  )
})
LeftSidebarInset.displayName = "LeftSidebarInset"

const LeftSidebarInput = React.forwardRef<
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
LeftSidebarInput.displayName = "LeftSidebarInput"

const LeftSidebarHeader = React.forwardRef<
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
LeftSidebarHeader.displayName = "LeftSidebarHeader"

const LeftSidebarFooter = React.forwardRef<
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
LeftSidebarFooter.displayName = "LeftSidebarFooter"

const LeftSidebarSeparator = React.forwardRef<
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
LeftSidebarSeparator.displayName = "LeftSidebarSeparator"

const LeftSidebarContent = React.forwardRef<
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
LeftSidebarContent.displayName = "LeftSidebarContent"

const LeftSidebarGroup = React.forwardRef<
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
LeftSidebarGroup.displayName = "LeftSidebarGroup"

const LeftSidebarGroupLabel = React.forwardRef<
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
LeftSidebarGroupLabel.displayName = "LeftSidebarGroupLabel"

const LeftSidebarGroupAction = React.forwardRef<
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
LeftSidebarGroupAction.displayName = "LeftSidebarGroupAction"

const LeftSidebarGroupContent = React.forwardRef<
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
LeftSidebarGroupContent.displayName = "LeftSidebarGroupContent"

const LeftSidebarMenu = React.forwardRef<
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
LeftSidebarMenu.displayName = "LeftSidebarMenu"

const LeftSidebarMenuItem = React.forwardRef<
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
LeftSidebarMenuItem.displayName = "LeftSidebarMenuItem"

const leftSidebarMenuButtonVariants = cva(
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

const LeftSidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & {
    asChild?: boolean
    isActive?: boolean
    tooltip?: string | React.ComponentProps<typeof TooltipContent>
  } & VariantProps<typeof leftSidebarMenuButtonVariants>
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
    const { isMobile, state } = useLeftSidebar()

    const button = (
      <Comp
        ref={ref}
        data-sidebar="menu-button"
        data-size={size}
        data-active={isActive}
        className={cn(leftSidebarMenuButtonVariants({ variant, size }), className)}
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
LeftSidebarMenuButton.displayName = "LeftSidebarMenuButton"

const LeftSidebarMenuAction = React.forwardRef<
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
LeftSidebarMenuAction.displayName = "LeftSidebarMenuAction"

const LeftSidebarMenuBadge = React.forwardRef<
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
LeftSidebarMenuBadge.displayName = "LeftSidebarMenuBadge"

const LeftSidebarMenuSkeleton = React.forwardRef<
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
LeftSidebarMenuSkeleton.displayName = "LeftSidebarMenuSkeleton"

const LeftSidebarMenuSub = React.forwardRef<
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
LeftSidebarMenuSub.displayName = "LeftSidebarMenuSub"

const LeftSidebarMenuSubItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<"li">
>(({ ...props }, ref) => <li ref={ref} {...props} />)
LeftSidebarMenuSubItem.displayName = "LeftSidebarMenuSubItem"

const LeftSidebarMenuSubButton = React.forwardRef<
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
LeftSidebarMenuSubButton.displayName = "LeftSidebarMenuSubButton"

export {
  LeftSidebar,
  LeftSidebarContent,
  LeftSidebarFooter,
  LeftSidebarGroup,
  LeftSidebarGroupAction,
  LeftSidebarGroupContent,
  LeftSidebarGroupLabel,
  LeftSidebarHeader,
  LeftSidebarInput,
  LeftSidebarInset,
  LeftSidebarMenu,
  LeftSidebarMenuAction,
  LeftSidebarMenuBadge,
  LeftSidebarMenuButton,
  LeftSidebarMenuItem,
  LeftSidebarMenuSkeleton,
  LeftSidebarMenuSub,
  LeftSidebarMenuSubButton,
  LeftSidebarMenuSubItem,
  LeftSidebarProvider,
  LeftSidebarRail,
  LeftSidebarSeparator,
  LeftSidebarTrigger,
  useLeftSidebar,
}

    