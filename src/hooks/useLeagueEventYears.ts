import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LeagueEventReservationRequestStatus } from "@/lib/enums";

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

function resolvePendingReservationRequestYears(
  rows:
    | Array<{
        event_date: string | null;
        status: LeagueEventReservationRequestStatus;
      }>
    | null
    | undefined,
): number[] {
  return resolveEventYears(
    (rows ?? []).filter(
      (reservationRequest) =>
        reservationRequest.status == LeagueEventReservationRequestStatus.PENDING,
    ),
  );
}

export function useLeagueEventYears() {
  const [years, setYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchYears = useCallback(async () => {
    setLoading(true);

    try {
      const [eventsResponse, reservationRequestsResponse] = await Promise.all([
        supabase.from("league_events").select("event_date"),
        supabase
          .from("league_event_reservation_requests")
          .select("event_date, status"),
      ]);

      const nextYears = new Set<number>();
      resolveEventYears(eventsResponse.data as Array<{ event_date: string | null }> | null | undefined).forEach(
        (year) => nextYears.add(year),
      );
      resolvePendingReservationRequestYears(
        reservationRequestsResponse.data as
          | Array<{
              event_date: string | null;
              status: LeagueEventReservationRequestStatus;
            }>
          | null
          | undefined,
      ).forEach((year) => nextYears.add(year));

      setYears([...nextYears].sort((firstYear, secondYear) => secondYear - firstYear));
    } catch (error) {
      console.error("Erro ao carregar anos disponíveis dos eventos:", error);
      setYears([]);
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
