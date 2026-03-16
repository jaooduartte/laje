import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "glass-chip inline-flex h-10 items-center justify-center rounded-xl p-1 text-muted-foreground",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsNavigationList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => {
  const listRef = React.useRef<React.ElementRef<typeof TabsPrimitive.List> | null>(null);
  const [activeIndicatorLeft, setActiveIndicatorLeft] = React.useState(0);
  const [activeIndicatorWidth, setActiveIndicatorWidth] = React.useState(0);
  const [showActiveIndicator, setShowActiveIndicator] = React.useState(false);

  const setRefs = React.useCallback(
    (node: React.ElementRef<typeof TabsPrimitive.List> | null) => {
      listRef.current = node;

      if (typeof ref == "function") {
        ref(node);
        return;
      }

      if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  const updateActiveIndicator = React.useCallback(() => {
    if (!listRef.current) {
      setShowActiveIndicator(false);
      return;
    }

    const activeTriggerElement = listRef.current.querySelector<HTMLElement>('[role="tab"][data-state="active"]');

    if (!activeTriggerElement) {
      setShowActiveIndicator(false);
      return;
    }

    const listRect = listRef.current.getBoundingClientRect();
    const triggerRect = activeTriggerElement.getBoundingClientRect();

    setActiveIndicatorLeft(triggerRect.left - listRect.left);
    setActiveIndicatorWidth(triggerRect.width);
    setShowActiveIndicator(true);
  }, []);

  React.useLayoutEffect(() => {
    const animationFrameId = requestAnimationFrame(updateActiveIndicator);
    return () => cancelAnimationFrame(animationFrameId);
  });

  React.useEffect(() => {
    if (!listRef.current) {
      return;
    }

    const listElement = listRef.current;
    const mutationObserver = new MutationObserver(() => {
      requestAnimationFrame(updateActiveIndicator);
    });

    mutationObserver.observe(listElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });

    listElement.addEventListener("click", updateActiveIndicator);
    listElement.addEventListener("keydown", updateActiveIndicator);

    return () => {
      mutationObserver.disconnect();
      listElement.removeEventListener("click", updateActiveIndicator);
      listElement.removeEventListener("keydown", updateActiveIndicator);
    };
  }, [updateActiveIndicator]);

  React.useEffect(() => {
    window.addEventListener("resize", updateActiveIndicator);
    return () => window.removeEventListener("resize", updateActiveIndicator);
  }, [updateActiveIndicator]);

  return (
    <TabsPrimitive.List
      ref={setRefs}
      className={cn(
        "glass-chip relative inline-flex h-10 items-center justify-center overflow-x-auto rounded-xl p-0 text-muted-foreground",
        className,
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute inset-y-0 left-0 rounded-xl bg-primary/20 backdrop-blur-2xl transition-[transform,width,opacity] duration-500"
        style={{
          width: `${activeIndicatorWidth}px`,
          transform: `translateX(${activeIndicatorLeft}px)`,
          opacity: showActiveIndicator ? 1 : 0,
          transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
      {props.children}
    </TabsPrimitive.List>
  );
});
TabsNavigationList.displayName = "TabsNavigationList";

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all data-[state=active]:bg-secondary/70 data-[state=active]:text-foreground data-[state=active]:shadow-sm dark:data-[state=active]:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsNavigationTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative z-10 inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-none px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors first:rounded-l-xl last:rounded-r-xl data-[state=active]:text-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
TabsNavigationTrigger.displayName = "TabsNavigationTrigger";

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsNavigationList, TabsTrigger, TabsNavigationTrigger, TabsContent };
