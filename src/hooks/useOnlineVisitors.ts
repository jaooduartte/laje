import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { OnlineVisitorsContext, RealtimePresenceChannel } from "@/lib/enums";

const VISITOR_SESSION_STORAGE_KEY = "laje_visitor_session_id";
const PRESENCE_CHANNEL_BY_CONTEXT: Record<OnlineVisitorsContext, RealtimePresenceChannel> = {
  [OnlineVisitorsContext.SITE_TOTAL]: RealtimePresenceChannel.SITE_TOTAL,
  [OnlineVisitorsContext.LIVE_PAGE]: RealtimePresenceChannel.LIVE_PAGE,
};

function resolveVisitorSessionId(): string {
  const storedValue = window.localStorage.getItem(VISITOR_SESSION_STORAGE_KEY);

  if (storedValue) {
    return storedValue;
  }

  const generatedValue = crypto.randomUUID();
  window.localStorage.setItem(VISITOR_SESSION_STORAGE_KEY, generatedValue);

  return generatedValue;
}

export function useOnlineVisitors(context: OnlineVisitorsContext = OnlineVisitorsContext.SITE_TOTAL) {
  const [onlineVisitorsCount, setOnlineVisitorsCount] = useState(0);

  useEffect(() => {
    const visitorSessionId = resolveVisitorSessionId();
    const presenceChannel = PRESENCE_CHANNEL_BY_CONTEXT[context];

    const realtimeChannel: RealtimeChannel = supabase.channel(presenceChannel, {
      config: {
        presence: {
          key: visitorSessionId,
        },
      },
    });

    const syncPresenceState = () => {
      const presenceState = realtimeChannel.presenceState();
      setOnlineVisitorsCount(Object.keys(presenceState).length);
    };

    realtimeChannel.on("presence", { event: "sync" }, syncPresenceState).subscribe(async (status) => {
      if (status != "SUBSCRIBED") {
        return;
      }

      await realtimeChannel.track({
        connected_at: new Date().toISOString(),
      });
    });

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [context]);

  return {
    onlineVisitorsCount,
  };
}
