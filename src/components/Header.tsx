import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePublicAccessSettings } from "@/hooks/usePublicAccessSettings";
import { AppRoutePath } from "@/lib/enums";
import { HEADER_APP_NAVIGATION_ITEMS } from "@/lib/navigation";
import { resolveIsPublicRouteBlocked } from "@/lib/publicAccess";

interface HeaderIndicatorState {
  left: number;
  width: number;
}

let previousHeaderIndicatorState: HeaderIndicatorState | null = null;

export function Header() {
  const { publicAccessSettings } = usePublicAccessSettings();
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const navRef = useRef<HTMLElement | null>(null);
  const linkByPathRef = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [activeIndicatorLeft, setActiveIndicatorLeft] = useState(previousHeaderIndicatorState?.left ?? 0);
  const [activeIndicatorWidth, setActiveIndicatorWidth] = useState(previousHeaderIndicatorState?.width ?? 0);
  const [showActiveIndicator, setShowActiveIndicator] = useState(previousHeaderIndicatorState != null);

  const activeRoutePath = useMemo(() => {
    return HEADER_APP_NAVIGATION_ITEMS.find((headerLinkItem) => headerLinkItem.routePath == location.pathname)?.routePath ?? null;
  }, [location.pathname]);

  const updateActiveIndicator = useCallback(() => {
    if (!activeRoutePath || !navRef.current) {
      setShowActiveIndicator(false);
      return;
    }

    const activeLinkElement = linkByPathRef.current[activeRoutePath];

    if (!activeLinkElement) {
      setShowActiveIndicator(false);
      return;
    }

    const nextIndicatorState = {
      left: activeLinkElement.offsetLeft,
      width: activeLinkElement.offsetWidth,
    };

    previousHeaderIndicatorState = nextIndicatorState;
    setActiveIndicatorLeft(nextIndicatorState.left);
    setActiveIndicatorWidth(nextIndicatorState.width);
    setShowActiveIndicator(true);
  }, [activeRoutePath]);

  useLayoutEffect(() => {
    const animationFrameId = requestAnimationFrame(updateActiveIndicator);
    return () => cancelAnimationFrame(animationFrameId);
  }, [updateActiveIndicator]);

  useEffect(() => {
    window.addEventListener("resize", updateActiveIndicator);
    return () => window.removeEventListener("resize", updateActiveIndicator);
  }, [updateActiveIndicator]);

  return (
    <header className="sticky top-0 z-50">
      <div className="container py-2">
        <div className="app-header-surface flex h-14 items-center gap-2 px-2 sm:h-16 sm:px-3">
          <Link to={AppRoutePath.HOME} className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg sm:h-14 sm:w-14">
            <img src="/logo.png" alt="Logo LAJE" className="h-10 w-10 object-contain shadow-none sm:h-12 sm:w-12" />
          </Link>

          <nav
            ref={navRef}
            className="app-pill-container app-header-nav-container relative ml-auto flex max-w-[calc(100%-3.5rem)] min-w-0 items-center gap-0 overflow-x-auto rounded-xl"
          >
            <span
              className="app-pill-active-indicator pointer-events-none absolute inset-y-0 left-0 rounded-xl transition-[transform,width,opacity] duration-500"
              style={{
                width: `${activeIndicatorWidth}px`,
                transform: `translateX(${activeIndicatorLeft}px)`,
                opacity: showActiveIndicator ? 1 : 0,
                transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            />

            {HEADER_APP_NAVIGATION_ITEMS.map(({ routePath, label, icon: Icon }) => (
              (() => {
                const isDisabledByMaintenance = resolveIsPublicRouteBlocked(publicAccessSettings, routePath);
                const shouldBlockLinkByMaintenance = !authLoading && !user && isDisabledByMaintenance;

                if (shouldBlockLinkByMaintenance) {
                  linkByPathRef.current[routePath] = null;

                  return (
                    <button
                      key={routePath}
                      type="button"
                      disabled
                      title="Tela temporariamente indisponível por manutenção"
                      className="app-pill-option relative z-10 flex min-h-11 shrink-0 cursor-not-allowed items-center gap-1.5 rounded-none px-3 py-2.5 text-sm font-medium text-muted-foreground/70 dark:text-muted-foreground/30 first:rounded-l-xl last:rounded-r-xl sm:min-h-10 sm:py-2"
                    >
                      <Icon className="h-5 w-5 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  );
                }

                return (
                    <Link
                    key={routePath}
                    to={routePath}
                    aria-current={location.pathname == routePath ? "page" : undefined}
                    ref={(linkElement) => {
                      linkByPathRef.current[routePath] = linkElement;
                    }}
                    className={`app-pill-option relative z-10 flex min-h-11 shrink-0 items-center gap-1.5 rounded-none px-3 py-2.5 text-sm font-medium first:rounded-l-xl last:rounded-r-xl sm:min-h-10 sm:py-2 ${
                      location.pathname == routePath
                        ? "text-primary font-bold dark:text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-5 w-5 sm:h-4 sm:w-4" />
                    <span className="hidden sm:inline">{label}</span>
                  </Link>
                );
              })()
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
