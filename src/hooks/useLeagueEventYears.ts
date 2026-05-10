import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

function resolveEventYears(rows: Array<{ event_date: string | null }> | null | undefined): number[] {
  return (rows ?? [])
    .map((row) => {
      if (!row.event_date) {
        return null;
      }

      const parsedYear = Number(row.event_date.slice(0, 4));
      return Number.isFinite(parsedYear) ? parsedYear : null;
    })
    .filter((year): year is number => year != null);
}

export function useLeagueEventYears() {
  const [years, setYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchYears = useCallback(async () => {
    setLoading(true);

    try {
      const [eventsResponse, reservationRequestsResponse] = await Promise.all([
        supabase.from("league_events").select("event_date"),
        supabase.from("league_event_reservation_requests").select("event_date"),
      ]);

      const nextYears = new Set<number>();
      resolveEventYears(eventsResponse.data as Array<{ event_date: string | null }> | null | undefined).forEach(
        (year) => nextYears.add(year),
      );
      resolveEventYears(
        reservationRequestsResponse.data as Array<{ event_date: string | null }> | null | undefined,
      ).forEach((year) => nextYears.add(year));

      const currentYear = new Date().getFullYear();
      if (Number.isFinite(currentYear)) {
        nextYears.add(currentYear);
      }

      setYears([...nextYears].sort((firstYear, secondYear) => secondYear - firstYear));
    } catch (error) {
      console.error("Erro ao carregar anos disponíveis dos eventos:", error);
      setYears([new Date().getFullYear()]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchYears();
  }, [fetchYears]);

  return {
    years,
    loading,
    refetch: fetchYears,
  };
}
