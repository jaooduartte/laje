import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useOnlineVisitors } from "@/hooks/useOnlineVisitors";
import { OnlineVisitorsContext } from "@/lib/enums";

interface OnlineVisitorsProviderContextValue {
  siteTotalOnlineVisitorsCount: number;
}

const OnlineVisitorsProviderContext = createContext<OnlineVisitorsProviderContextValue | null>(null);

interface OnlineVisitorsProviderProps {
  children: ReactNode;
}

export function OnlineVisitorsProvider({ children }: OnlineVisitorsProviderProps) {
  const { onlineVisitorsCount } = useOnlineVisitors(OnlineVisitorsContext.SITE_TOTAL);

  const onlineVisitorsProviderContextValue = useMemo(
    () => ({
      siteTotalOnlineVisitorsCount: onlineVisitorsCount,
    }),
    [onlineVisitorsCount],
  );

  return (
    <OnlineVisitorsProviderContext.Provider value={onlineVisitorsProviderContextValue}>
      {children}
    </OnlineVisitorsProviderContext.Provider>
  );
}

export function useOnlineVisitorsProviderContext() {
  const onlineVisitorsProviderContext = useContext(OnlineVisitorsProviderContext);

  if (!onlineVisitorsProviderContext) {
    throw new Error("useOnlineVisitorsProviderContext must be used within OnlineVisitorsProvider");
  }

  return onlineVisitorsProviderContext;
}
