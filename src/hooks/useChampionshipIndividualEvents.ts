import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchChampionshipAthletes,
  fetchChampionshipIndividualEventEntries,
  fetchChampionshipIndividualEvents,
  fetchChampionshipIndividualSessionParticipants,
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
  participantTeamId?: string | null;
  sessionIds?: string[];
  includeEntries?: boolean;
  includeAthletes?: boolean;
  includeEvents?: boolean;
  includeStandings?: boolean;
  enabled?: boolean;
}

export function useChampionshipIndividualEvents({
  championshipId,
  seasonYear,
  sportIds = [],
  sportId,
  naipe,
  division,
  participantTeamId,
  sessionIds,
  includeEntries = true,
  includeAthletes = false,
  includeEvents = true,
  includeStandings = true,
  enabled = true,
}: UseChampionshipIndividualEventsOptions = {}) {
  const normalizedSessionIdsKey =
    sessionIds == null ? null : [...new Set(sessionIds)].sort().join(",");
  const hasExplicitSessionIds = sessionIds != null;
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
    const normalizedSessionIds = hasExplicitSessionIds
      ? normalizedSessionIdsKey
        ? normalizedSessionIdsKey.split(",")
        : []
      : undefined;

    const [eventsResponse, sessionsResponse, athletesResponse, standingsResponse] =
      await Promise.all([
      includeEvents
        ? fetchChampionshipIndividualEvents({
            championshipId,
            seasonYear,
            sportId: sportId ?? null,
          })
        : Promise.resolve({ data: [], error: null }),
      fetchChampionshipIndividualSessions({
        championshipId,
        seasonYear,
        sportId: sportId ?? null,
        sessionIds: normalizedSessionIds,
      }),
      includeAthletes
        ? fetchChampionshipAthletes({
            championshipId,
            seasonYear,
            sportIds,
          })
        : Promise.resolve({ data: [], error: null }),
      includeStandings
        ? fetchChampionshipIndividualTeamStandings({
            championshipId,
            seasonYear,
            sportId: sportId ?? null,
            naipe,
            division,
          })
        : Promise.resolve({ data: [], error: null }),
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

    const sessionParticipantResponses = participantTeamId
      ? await Promise.all(
          sessionsResponse.data.map(async (session) => ({
            sessionId: session.id,
            response: await fetchChampionshipIndividualSessionParticipants(
              session.id,
            ),
          })),
        )
      : [];
    const sessionParticipantError = sessionParticipantResponses.find(
      ({ response }) => response.error,
    )?.response.error;

    if (sessionParticipantError) {
      console.error(
        "Erro ao carregar participantes das sessões individuais:",
        sessionParticipantError.message,
      );
      setEvents([]);
      setSessions([]);
      setAthletes([]);
      setEntries([]);
      setStandings([]);
      setLoading(false);
      return;
    }

    const visibleSessionIds = participantTeamId
      ? new Set(
          sessionParticipantResponses
            .filter(({ response }) =>
              response.data.some((team) => team.id == participantTeamId),
            )
            .map(({ sessionId }) => sessionId),
        )
      : null;
    const visibleSessions = visibleSessionIds
      ? sessionsResponse.data.filter((session) => visibleSessionIds.has(session.id))
      : sessionsResponse.data;
    const visibleEvents = visibleSessionIds
      ? eventsResponse.data.filter(
          (event) => !event.session_id || visibleSessionIds.has(event.session_id),
        )
      : eventsResponse.data;

    const eventIds = visibleEvents.map((event) => event.id);
    const entriesResponse = includeEntries
      ? await fetchChampionshipIndividualEventEntries({ eventIds })
      : { data: [], error: null };

    if (entriesResponse.error) {
      console.error(
        "Erro ao carregar inscrições das provas individuais:",
        entriesResponse.error.message,
      );
      setEvents(visibleEvents);
      setSessions(visibleSessions);
      setAthletes(athletesResponse.data);
      setEntries([]);
      setStandings(standingsResponse.data);
      setLoading(false);
      return;
    }

    setEvents(visibleEvents);
    setSessions(visibleSessions);
    setAthletes(athletesResponse.data);
    setEntries(entriesResponse.data);
    setStandings(standingsResponse.data);
    setLoading(false);
  }, [
    championshipId,
    division,
    enabled,
    includeAthletes,
    includeEntries,
    includeEvents,
    includeStandings,
    naipe,
    participantTeamId,
    seasonYear,
    hasExplicitSessionIds,
    normalizedSessionIdsKey,
    sportId,
    sportIds,
  ]);

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
