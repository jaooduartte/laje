import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { OnlineVisitorsContext, RealtimePresenceChannel } from "@/lib/enums";
import { useAuth } from "@/hooks/useAuth";
import { resolveRandomUuid } from "@/lib/random";

const VISITOR_SESSION_STORAGE_KEY = "laje_visitor_session_id";
const PRESENCE_CHANNEL_BY_CONTEXT: Record<OnlineVisitorsContext, RealtimePresenceChannel> = {
  [OnlineVisitorsContext.SITE_TOTAL]: RealtimePresenceChannel.SITE_TOTAL,
  [OnlineVisitorsContext.LIVE_PAGE]: RealtimePresenceChannel.LIVE_PAGE,
};

interface OnlineVisitorPresenceState {
  connected_at: string;
  user_id: string | null;
}

function resolveVisitorSessionId(): string {
  const storedValue = window.localStorage.getItem(VISITOR_SESSION_STORAGE_KEY);

  if (storedValue) {
    return storedValue;
  }

  const generatedValue = resolveRandomUuid();
  window.localStorage.setItem(VISITOR_SESSION_STORAGE_KEY, generatedValue);

  return generatedValue;
}

export function useOnlineVisitors(context: OnlineVisitorsContext = OnlineVisitorsContext.SITE_TOTAL) {
  const { user } = useAuth();
  const [onlineVisitorsCount, setOnlineVisitorsCount] = useState(0);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const visitorSessionIdReference = useRef<string | null>(null);

  const resolveOrCreateVisitorSessionId = useCallback(() => {
    if (visitorSessionIdReference.current) {
      return visitorSessionIdReference.current;
    }

    const visitorSessionId = resolveVisitorSessionId();
    visitorSessionIdReference.current = visitorSessionId;
    return visitorSessionId;
  }, []);

  useEffect(() => {
    const visitorSessionId = resolveOrCreateVisitorSessionId();
    const presenceChannel = PRESENCE_CHANNEL_BY_CONTEXT[context];
    let isChannelSubscribed = false;

    const realtimeChannel: RealtimeChannel = supabase.channel(presenceChannel, {
      config: {
        presence: {
          key: visitorSessionId,
        },
      },
    });

    const syncPresenceState = () => {
      const presenceState = realtimeChannel.presenceState<OnlineVisitorPresenceState>();
      const nextOnlineUserIds = new Set<string>();

      Object.values(presenceState).forEach((presenceEntries) => {
        presenceEntries.forEach((presenceEntry) => {
          if (presenceEntry.user_id) {
            nextOnlineUserIds.add(presenceEntry.user_id);
          }
        });
      });

      setOnlineVisitorsCount(Object.keys(presenceState).length);
      setOnlineUserIds(Array.from(nextOnlineUserIds));
    };

    const trackCurrentPresence = async () => {
      if (!isChannelSubscribed) {
        return;
      }

      try {
        await realtimeChannel.track({
          connected_at: new Date().toISOString(),
          user_id: user?.id ?? null,
        });
        syncPresenceState();
      } catch (error) {
        console.error("Erro ao sincronizar presença online:", error);
      }
    };

    const handleReconnectSync = () => {
      if (typeof document != "undefined" && document.visibilityState == "hidden") {
        return;
      }

      void trackCurrentPresence();
    };

    realtimeChannel
      .on("presence", { event: "sync" }, syncPresenceState)
      .on("presence", { event: "join" }, syncPresenceState)
      .on("presence", { event: "leave" }, syncPresenceState)
      .subscribe((status) => {
        if (status == "SUBSCRIBED") {
          isChannelSubscribed = true;
          void trackCurrentPresence();
          return;
        }

        if (status == "CLOSED" || status == "CHANNEL_ERROR" || status == "TIMED_OUT") {
          isChannelSubscribed = false;
        }
      });

    window.addEventListener("focus", handleReconnectSync);
    window.addEventListener("online", handleReconnectSync);
    document.addEventListener("visibilitychange", handleReconnectSync);

    return () => {
      window.removeEventListener("focus", handleReconnectSync);
      window.removeEventListener("online", handleReconnectSync);
      document.removeEventListener("visibilitychange", handleReconnectSync);
      supabase.removeChannel(realtimeChannel);
    };
  }, [context, resolveOrCreateVisitorSessionId, user?.id]);

  return {
    onlineVisitorsCount,
    onlineUserIds,
  };
}
