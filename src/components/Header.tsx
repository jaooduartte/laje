import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Calendar, CalendarDays, Radio, Shield, Trophy } from "lucide-react";
import { AppRoutePath } from "@/lib/enums";

interface HeaderLinkItem {
  to: AppRoutePath;
  label: string;
  icon: typeof Radio;
}

const HEADER_LINKS: HeaderLinkItem[] = [
  { to: AppRoutePath.LIVE, label: "Ao Vivo", icon: Radio },
  { to: AppRoutePath.CHAMPIONSHIPS, label: "Campeonatos", icon: Trophy },
  { to: AppRoutePath.SCHEDULE, label: "Agenda", icon: Calendar },
  { to: AppRoutePath.LEAGUE_CALENDAR, label: "Calendário da Liga", icon: CalendarDays },
  { to: AppRoutePath.ADMIN, label: "Admin", icon: Shield },
];

export function Header() {
  const location = useLocation();
  const navRef = useRef<HTMLElement | null>(null);
  const linkByPathRef = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [activeIndicatorLeft, setActiveIndicatorLeft] = useState(0);
  const [activeIndicatorWidth, setActiveIndicatorWidth] = useState(0);
  const [showActiveIndicator, setShowActiveIndicator] = useState(false);

  const activeRoutePath = useMemo(() => {
    return HEADER_LINKS.find((headerLinkItem) => headerLinkItem.to == location.pathname)?.to ?? null;
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

    const navRect = navRef.current.getBoundingClientRect();
    const linkRect = activeLinkElement.getBoundingClientRect();

    setActiveIndicatorLeft(linkRect.left - navRect.left);
    setActiveIndicatorWidth(linkRect.width);
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
    <header className="sticky top-0 z-50 bg-transparent">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md">
          <img src="/logo.png" alt="Logo LAJE" className="h-14 w-14 object-contain shadow-none" />
        </Link>
        <nav
          ref={navRef}
          className="relative flex items-center gap-0 overflow-hidden rounded-xl bg-white/72 p-0 shadow-[0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl"
        >
          <span
            className="pointer-events-none absolute inset-y-0 left-0 rounded-xl bg-primary/22 backdrop-blur-2xl transition-[transform,width,opacity] duration-500"
            style={{
              width: `${activeIndicatorWidth}px`,
              transform: `translateX(${activeIndicatorLeft}px)`,
              opacity: showActiveIndicator ? 1 : 0,
              transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />

          {HEADER_LINKS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              ref={(linkElement) => {
                linkByPathRef.current[to] = linkElement;
              }}
              className={`relative z-10 flex items-center gap-1.5 rounded-none px-3 py-2 text-sm font-medium transition-colors first:rounded-l-xl last:rounded-r-xl ${
                location.pathname == to
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
