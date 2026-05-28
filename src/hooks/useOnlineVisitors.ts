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
  // Refs para evitar que a mudança de user?.id destrua e recrie o canal
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isChannelSubscribedRef = useRef(false);
  const userIdRef = useRef<string | undefined>(user?.id);

  const resolveOrCreateVisitorSessionId = useCallback(() => {
    if (visitorSessionIdReference.current) {
      return visitorSessionIdReference.current;
    }

    const visitorSessionId = resolveVisitorSessionId();
    visitorSessionIdReference.current = visitorSessionId;
    return visitorSessionId;
  }, []);

  // Mantém o ref do userId sempre atualizado sem recriar o canal
  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);

  // Effect principal: cria o canal UMA vez por context.
  // Não depende de user?.id — isso evita que o canal seja destruído e recriado
  // toda vez que a sessão é resolvida (undefined → UUID), o que gerava estado
  // permanentemente 0 por conflito de nomes de canal no Supabase JS.
  useEffect(() => {
    const visitorSessionId = resolveOrCreateVisitorSessionId();
    const presenceChannel = PRESENCE_CHANNEL_BY_CONTEXT[context];

    const realtimeChannel: RealtimeChannel = supabase.channel(presenceChannel, {
      config: {
        presence: {
          key: visitorSessionId,
        },
      },
    });

    channelRef.current = realtimeChannel;
    isChannelSubscribedRef.current = false;

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
      if (!isChannelSubscribedRef.current) {
        return;
      }

      try {
        await realtimeChannel.track({
          connected_at: new Date().toISOString(),
          // Usa o ref para pegar o user_id mais atual sem recriar o canal
          user_id: userIdRef.current ?? null,
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
          isChannelSubscribedRef.current = true;
          void trackCurrentPresence();
          return;
        }

        if (status == "CLOSED" || status == "CHANNEL_ERROR" || status == "TIMED_OUT") {
          isChannelSubscribedRef.current = false;
        }
      });

    window.addEventListener("focus", handleReconnectSync);
    window.addEventListener("online", handleReconnectSync);
    document.addEventListener("visibilitychange", handleReconnectSync);

    return () => {
      window.removeEventListener("focus", handleReconnectSync);
      window.removeEventListener("online", handleReconnectSync);
      document.removeEventListener("visibilitychange", handleReconnectSync);
      isChannelSubscribedRef.current = false;
      channelRef.current = null;
      supabase.removeChannel(realtimeChannel);
    };
  }, [context, resolveOrCreateVisitorSessionId]);
  // ↑ user?.id removido das dependências: o user_id é lido via ref dentro de trackCurrentPresence

  // Effect secundário: quando o user?.id muda (login/logout), refaz o track
  // para atualizar o user_id no payload de presença — sem recriar o canal.
  useEffect(() => {
    if (!isChannelSubscribedRef.current || !channelRef.current) {
      return;
    }

    const channel = channelRef.current;

    const retrackeCurrentUser = async () => {
      try {
        await channel.track({
          connected_at: new Date().toISOString(),
          user_id: user?.id ?? null,
        });
      } catch (error) {
        console.error("Erro ao reatualizar presença do usuário:", error);
      }
    };

    void retrackeCurrentUser();
  }, [user?.id]);

  return {
    onlineVisitorsCount,
    onlineUserIds,
  };
}
