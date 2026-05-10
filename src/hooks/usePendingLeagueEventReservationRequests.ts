import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchPendingLeagueEventReservationRequestCount } from "@/domain/league-events/leagueEventReservation.repository";

export function usePendingLeagueEventReservationRequests() {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchCount = useCallback(async () => {
    setLoading(true);

    const { count: nextCount, error } = await fetchPendingLeagueEventReservationRequestCount();

    if (error) {
      console.error("Erro ao carregar pendências de reservas do calendário:", error.message);
      setCount(0);
      setLoading(false);
      return;
    }

    setCount(nextCount ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCount();

    const channel = supabase
      .channel("league-event-reservation-requests-pending-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "league_event_reservation_requests" }, () => {
        fetchCount();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCount]);

  return {
    count,
    loading,
    refetch: fetchCount,
  };
}
