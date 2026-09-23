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

type BaseLoadResult = {
  eventsResponse: Awaited<ReturnType<typeof fetchChampionshipIndividualEvents>>;
  sessionsResponse: Awaited<ReturnType<typeof fetchChampionshipIndividualSessions>>;
  athletesResponse: Awaited<ReturnType<typeof fetchChampionshipAthletes>>;
  standingsResponse: Awaited<ReturnType<typeof fetchChampionshipIndividualTeamStandings>>;
};

type EntriesLoadResult = Awaited<ReturnType<typeof fetchChampionshipIndividualEventEntries>>;

const SHARED_READ_CACHE_TTL_MS = 2_000;
const baseRequestByKey = new Map<string, Promise<BaseLoadResult>>();
const baseResultByKey = new Map<string, { expiresAt: number; result: BaseLoadResult }>();
const entriesRequestByKey = new Map<string, Promise<EntriesLoadResult>>();
const entriesResultByKey = new Map<string, { expiresAt: number; result: EntriesLoadResult }>();

function fetchSharedBaseData(
  input: {
    championshipId: string;
    seasonYear: number;
    sportIds: string[];
    sportId: string | null;
    naipe: MatchNaipe | null | undefined;
    division: TeamDivision | null | undefined;
    sessionIds: string[] | undefined;
    includeAthletes: boolean;
    includeEvents: boolean;
    includeStandings: boolean;
  },
  forceFresh: boolean,
) {
  const requestKey = JSON.stringify({
    championshipId: input.championshipId,
    seasonYear: input.seasonYear,
    sportIds: [...input.sportIds].sort(),
    sportId: input.sportId,
    naipe: input.naipe,
    division: input.division,
    sessionIds: input.sessionIds ? [...input.sessionIds].sort() : null,
    includeAthletes: input.includeAthletes,
    includeEvents: input.includeEvents,
    includeStandings: input.includeStandings,
  });

  const currentRequest = baseRequestByKey.get(requestKey);
  if (currentRequest) {
    return currentRequest;
  }

  const cachedResult = baseResultByKey.get(requestKey);
  if (!forceFresh && cachedResult && cachedResult.expiresAt > Date.now()) {
    return Promise.resolve(cachedResult.result);
  }

  const request = Promise.all([
    input.includeEvents
      ? fetchChampionshipIndividualEvents({
          championshipId: input.championshipId,
          seasonYear: input.seasonYear,
          sportId: input.sportId,
        })
      : Promise.resolve({ data: [], error: null }),
    fetchChampionshipIndividualSessions({
      championshipId: input.championshipId,
      seasonYear: input.seasonYear,
      sportId: input.sportId,
      sessionIds: input.sessionIds,
    }),
    input.includeAthletes
      ? fetchChampionshipAthletes({
          championshipId: input.championshipId,
          seasonYear: input.seasonYear,
          sportIds: input.sportIds,
        })
      : Promise.resolve({ data: [], error: null }),
    input.includeStandings
      ? fetchChampionshipIndividualTeamStandings({
          championshipId: input.championshipId,
          seasonYear: input.seasonYear,
          sportId: input.sportId,
          naipe: input.naipe,
          division: input.division,
        })
      : Promise.resolve({ data: [], error: null }),
  ])
    .then(([eventsResponse, sessionsResponse, athletesResponse, standingsResponse]) => {
      const result: BaseLoadResult = {
        eventsResponse,
        sessionsResponse,
        athletesResponse,
        standingsResponse,
      };

      if (
        !eventsResponse.error &&
        !sessionsResponse.error &&
        !athletesResponse.error &&
        !standingsResponse.error
      ) {
        baseResultByKey.set(requestKey, {
          expiresAt: Date.now() + SHARED_READ_CACHE_TTL_MS,
          result,
        });
      }

      return result;
    })
    .finally(() => {
      if (baseRequestByKey.get(requestKey) === request) {
        baseRequestByKey.delete(requestKey);
      }
    });

  baseRequestByKey.set(requestKey, request);
  return request;
}

function fetchSharedEntries(eventIds: string[], forceFresh: boolean) {
  const normalizedEventIds = [...new Set(eventIds)].sort();
  const requestKey = normalizedEventIds.join(",");

  const currentRequest = entriesRequestByKey.get(requestKey);
  if (currentRequest) {
    return currentRequest;
  }

  const cachedResult = entriesResultByKey.get(requestKey);
  if (!forceFresh && cachedResult && cachedResult.expiresAt > Date.now()) {
    return Promise.resolve(cachedResult.result);
  }

  const request = fetchChampionshipIndividualEventEntries({
    eventIds: normalizedEventIds,
  })
    .then((result) => {
      if (!result.error) {
        entriesResultByKey.set(requestKey, {
          expiresAt: Date.now() + SHARED_READ_CACHE_TTL_MS,
          result,
        });
      }
      return result;
    })
    .finally(() => {
      if (entriesRequestByKey.get(requestKey) === request) {
        entriesRequestByKey.delete(requestKey);
      }
    });

  entriesRequestByKey.set(requestKey, request);
  return request;
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
  const normalizedSportIdsKey = [...new Set(sportIds)].sort().join(",");
  const hasExplicitSessionIds = sessionIds != null;
  const [events, setEvents] = useState<ChampionshipIndividualEvent[]>([]);
  const [sessions, setSessions] = useState<ChampionshipIndividualSession[]>([]);
  const [athletes, setAthletes] = useState<ChampionshipAthlete[]>([]);
  const [entries, setEntries] = useState<ChampionshipIndividualEventEntry[]>([]);
  const [standings, setStandings] = useState<ChampionshipIndividualTeamStanding[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async (forceFresh = false) => {
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
    const normalizedSportIds = normalizedSportIdsKey
      ? normalizedSportIdsKey.split(",")
      : [];

    const {
      eventsResponse,
      sessionsResponse,
      athletesResponse,
      standingsResponse,
    } = await fetchSharedBaseData(
      {
        championshipId,
        seasonYear,
        sportIds: normalizedSportIds,
        sportId: sportId ?? null,
        naipe,
        division,
        sessionIds: normalizedSessionIds,
        includeAthletes,
        includeEvents,
        includeStandings,
      },
      forceFresh,
    );

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
            response: await fetchChampionshipIndividualSessionParticipants(session.id),
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
      ? await fetchSharedEntries(eventIds, forceFresh)
      : { data: [], membersByEntryId: {}, error: null };

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
    normalizedSportIdsKey,
    sportId,
  ]);

  useEffect(() => {
    if (!enabled) {
      setLoading(true);
      return;
    }

    void fetchAll(false);
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
    refetch: () => fetchAll(true),
  };
}
