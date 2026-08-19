import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchChampionshipAthletes,
  fetchChampionshipIndividualEventEntries,
  fetchChampionshipIndividualEvents,
  fetchChampionshipIndividualSessions,
  fetchChampionshipIndividualTeamStandings,
} from "@/domain/individual-events/championshipIndividualEvents.repository";
import type {
  ChampionshipAthlete,
  ChampionshipIndividualEvent,
  ChampionshipIndividualEventEntry,
  ChampionshipIndividualSession,
  ChampionshipIndividualTeamStanding,
} from "@/lib/types";
import type { MatchNaipe, TeamDivision } from "@/lib/enums";

interface UseChampionshipIndividualEventsOptions {
  championshipId?: string | null;
  seasonYear?: number | null;
  sportIds?: string[];
  sportId?: string | null;
  naipe?: MatchNaipe | null;
  division?: TeamDivision | null | undefined;
  enabled?: boolean;
}

export function useChampionshipIndividualEvents({
  championshipId,
  seasonYear,
  sportIds = [],
  sportId,
  naipe,
  division,
  enabled = true,
}: UseChampionshipIndividualEventsOptions = {}) {
  const [events, setEvents] = useState<ChampionshipIndividualEvent[]>([]);
  const [sessions, setSessions] = useState<ChampionshipIndividualSession[]>([]);
  const [athletes, setAthletes] = useState<ChampionshipAthlete[]>([]);
  const [entries, setEntries] = useState<ChampionshipIndividualEventEntry[]>(
    [],
  );
  const [standings, setStandings] = useState<
    ChampionshipIndividualTeamStanding[]
  >([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!enabled) {
      setLoading(true);
      return;
    }

    if (!championshipId || !seasonYear) {
      setEvents([]);
      setSessions([]);
      setAthletes([]);
      setEntries([]);
      setStandings([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const [
      eventsResponse,
      sessionsResponse,
      athletesResponse,
      standingsResponse,
    ] = await Promise.all([
      fetchChampionshipIndividualEvents({
        championshipId,
        seasonYear,
        sportId: sportId ?? null,
      }),
      fetchChampionshipIndividualSessions({
        championshipId,
        seasonYear,
        sportId: sportId ?? null,
      }),
      fetchChampionshipAthletes({
        championshipId,
        seasonYear,
        sportIds,
      }),
      fetchChampionshipIndividualTeamStandings({
        championshipId,
        seasonYear,
        sportId: sportId ?? null,
        naipe,
        division,
      }),
    ]);

    if (
      eventsResponse.error ||
      sessionsResponse.error ||
      athletesResponse.error ||
      standingsResponse.error
    ) {
      console.error(
        "Erro ao carregar provas individuais:",
        eventsResponse.error?.message ??
          sessionsResponse.error?.message ??
          athletesResponse.error?.message ??
          standingsResponse.error?.message,
      );
      setEvents([]);
      setSessions([]);
      setAthletes([]);
      setEntries([]);
      setStandings([]);
      setLoading(false);
      return;
    }

    const eventIds = eventsResponse.data.map((event) => event.id);
    const entriesResponse = await fetchChampionshipIndividualEventEntries({
      eventIds,
    });

    if (entriesResponse.error) {
      console.error(
        "Erro ao carregar inscrições das provas individuais:",
        entriesResponse.error.message,
      );
      setEvents(eventsResponse.data);
      setSessions(sessionsResponse.data);
      setAthletes(athletesResponse.data);
      setEntries([]);
      setStandings(standingsResponse.data);
      setLoading(false);
      return;
    }

    setEvents(eventsResponse.data);
    setSessions(sessionsResponse.data);
    setAthletes(athletesResponse.data);
    setEntries(entriesResponse.data);
    setStandings(standingsResponse.data);
    setLoading(false);
  }, [championshipId, division, naipe, enabled, seasonYear, sportId, sportIds]);

  useEffect(() => {
    if (!enabled) {
      setLoading(true);
      return;
    }

    void fetchAll();
  }, [enabled, fetchAll]);

  const entriesByEventId = useMemo(() => {
    return entries.reduce<Record<string, ChampionshipIndividualEventEntry[]>>(
      (carry, entry) => {
        carry[entry.event_id] = [...(carry[entry.event_id] ?? []), entry];
        return carry;
      },
      {},
    );
  }, [entries]);

  return {
    events,
    sessions,
    athletes,
    entries,
    standings,
    entriesByEventId,
    loading,
    refetch: fetchAll,
  };
}
