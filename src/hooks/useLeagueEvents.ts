import { useCallback, useEffect, useMemo, useState } from "react";
import { endOfYear, format, startOfYear } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { LeagueEvent } from "@/lib/types";
import { fetchLeagueEventsByDateRange } from "@/domain/league-events/leagueEvent.repository";

interface UseLeagueEventsOptions {
  monthDate: Date;
}

export function useLeagueEvents({ monthDate }: UseLeagueEventsOptions) {
  const [leagueEvents, setLeagueEvents] = useState<LeagueEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const dateRange = useMemo(() => {
    return {
      startDate: format(startOfYear(monthDate), "yyyy-MM-dd"),
      endDate: format(endOfYear(monthDate), "yyyy-MM-dd"),
      yearKey: format(monthDate, "yyyy"),
    };
  }, [monthDate]);

  const fetchLeagueEvents = useCallback(async () => {
    setLoading(true);

    try {
      const { data, error } = await fetchLeagueEventsByDateRange({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });

      if (error) {
        console.error("Erro ao carregar eventos da liga:", error.message);
        setLeagueEvents([]);
        return;
      }

      setLeagueEvents(data);
    } catch (error) {
      console.error("Erro inesperado ao carregar eventos da liga:", error);
      setLeagueEvents([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange.endDate, dateRange.startDate]);

  const sortLeagueEvents = useCallback((events: LeagueEvent[]) => {
    return [...events].sort((firstLeagueEvent, secondLeagueEvent) => {
      const dateComparison = firstLeagueEvent.event_date.localeCompare(secondLeagueEvent.event_date);

      if (dateComparison != 0) {
        return dateComparison;
      }

      return firstLeagueEvent.name.localeCompare(secondLeagueEvent.name);
    });
  }, []);

  const upsertLeagueEvent = useCallback((leagueEvent: LeagueEvent) => {
    setLeagueEvents((currentLeagueEvents) => {
      const nextLeagueEvents = currentLeagueEvents.filter((currentLeagueEvent) => currentLeagueEvent.id != leagueEvent.id);

      const isInsideCurrentYear =
        leagueEvent.event_date >= dateRange.startDate && leagueEvent.event_date <= dateRange.endDate;

      if (isInsideCurrentYear) {
        nextLeagueEvents.push(leagueEvent);
      }

      return sortLeagueEvents(nextLeagueEvents);
    });
  }, [dateRange.endDate, dateRange.startDate, sortLeagueEvents]);

  const removeLeagueEvent = useCallback((leagueEventId: string) => {
    setLeagueEvents((currentLeagueEvents) => {
      return currentLeagueEvents.filter((leagueEvent) => leagueEvent.id != leagueEventId);
    });
  }, []);

  useEffect(() => {
    fetchLeagueEvents();

    const channel = supabase
      .channel(`league-events-realtime-${dateRange.yearKey}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "league_events" }, () => {
        fetchLeagueEvents();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dateRange.yearKey, fetchLeagueEvents]);

  return {
    leagueEvents,
    loading,
    refetch: fetchLeagueEvents,
    upsertLeagueEvent,
    removeLeagueEvent,
  };
}
