import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Match } from "@/lib/types";
import { MatchNaipe, MatchStatus, TeamDivision } from "@/lib/enums";
import {
  type MatchEstimatedStartTimeBracketEdition,
  type MatchEstimatedStartTimeChampionshipSport,
  type MatchEstimatedStartTimeScheduleDay,
  type MatchRepresentationSource,
  resolveEstimatedStartTimeByMatchId,
  resolveInterleavedScheduledMatchesByCompetition,
  resolveOrderedScheduledMatches,
  resolveMatchRepresentationByMatchId,
} from "@/lib/championship";
import type { MatchSetInput } from "@/domain/championship-brackets/championshipBracket.types";

interface UseMatchesOptions {
  championshipId?: string | null;
  seasonYear?: number | null;
  statuses?: MatchStatus[];
  sportId?: string | null;
  teamId?: string | null;
  naipe?: MatchNaipe | null;
  division?: TeamDivision | null;
  groupFilterValue?: string | null;
  page?: number;
  itemsPerPage?: number;
  includeRealtime?: boolean;
  sortMode?: "SCHEDULED" | "LIVE" | "FINISHED";
}

type SupabaseLooseQueryError = {
  message: string;
};

type SupabaseLooseQueryResult<TData> = {
  data: TData | null;
  error: SupabaseLooseQueryError | null;
};

type SupabaseLooseSelectBuilder<TData> = {
  in: (column: string, values: string[]) => Promise<SupabaseLooseQueryResult<TData>>;
};

type SupabaseLooseTableClient = {
  select: (columns: string) => SupabaseLooseSelectBuilder<unknown[]>;
};

type SupabaseLooseClient = {
  from: (table: string) => SupabaseLooseTableClient;
};

type MatchEstimatedStartTimeBracketEditionCandidate = MatchEstimatedStartTimeBracketEdition & {
  id: string;
  has_schedule_days_in_payload: boolean;
};

type MatchEstimatedStartTimeBracketDayRow = {
  bracket_edition_id: string;
  event_date: string;
  start_time: string;
  end_time: string;
  break_start_time: string | null;
  break_end_time: string | null;
};

const supabaseLoose = supabase as unknown as SupabaseLooseClient;

function resolveGroupNumberByGroupFilterValue(groupFilterValue: string | null | undefined): number | null {
  if (!groupFilterValue) {
    return null;
  }

  const trimmedGroupFilterValue = groupFilterValue.trim();
  const groupFilterMatch = /^grupo\s+([a-z]+)$/i.exec(trimmedGroupFilterValue);

  if (!groupFilterMatch) {
    return null;
  }

  const alphabeticalSuffix = groupFilterMatch[1].toUpperCase();
  let parsedGroupNumber = 0;

  for (let suffixCharacterIndex = 0; suffixCharacterIndex < alphabeticalSuffix.length; suffixCharacterIndex += 1) {
    const suffixCharacter = alphabeticalSuffix.charCodeAt(suffixCharacterIndex);
    const currentCharacterValue = suffixCharacter - 64;

    if (currentCharacterValue < 1 || currentCharacterValue > 26) {
      return null;
    }

    parsedGroupNumber = parsedGroupNumber * 26 + currentCharacterValue;
  }

  return parsedGroupNumber > 0 ? parsedGroupNumber : null;
}

function resolvePayloadSnapshotValue(payloadSnapshot: unknown): Record<string, unknown> | null {
  if (
    payloadSnapshot &&
    typeof payloadSnapshot == "object" &&
    !Array.isArray(payloadSnapshot)
  ) {
    return payloadSnapshot as Record<string, unknown>;
  }

  return null;
}

function hasEstimatedStartTimeScheduleDays(
  payloadSnapshot: Record<string, unknown> | null,
): boolean {
  if (!payloadSnapshot) {
    return false;
  }

  const scheduleDays = (payloadSnapshot as { schedule_days?: unknown })
    .schedule_days;

  return Array.isArray(scheduleDays) && scheduleDays.length > 0;
}

export function useMatches({
  championshipId,
  seasonYear,
  statuses,
  sportId,
  teamId,
  naipe,
  division,
  groupFilterValue,
  page,
  itemsPerPage,
  includeRealtime = true,
  sortMode = "SCHEDULED",
}: UseMatchesOptions = {}) {
  const statusesDependencyKey = statuses?.join(",") ?? "";

  const normalizedStatuses = useMemo(() => {
    if (!statuses || statuses.length == 0) {
      return [] as MatchStatus[];
    }

    return [...new Set(statuses)].sort();
  }, [statusesDependencyKey]);

  const [matches, setMatches] = useState<Match[]>([]);
  const [championshipSportsForEstimatedStartTime, setChampionshipSportsForEstimatedStartTime] = useState<
    MatchEstimatedStartTimeChampionshipSport[]
  >([]);
  const [championshipBracketEditionsForEstimatedStartTime, setChampionshipBracketEditionsForEstimatedStartTime] = useState<
    MatchEstimatedStartTimeBracketEdition[]
  >([]);
  const [representationContextMatches, setRepresentationContextMatches] = useState<MatchRepresentationSource[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const hasLoadedMatchesRef = useRef(false);
  const scheduledRefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchMatches = useCallback(async ({
    showLoading = false,
    showFetching = false,
  }: {
    showLoading?: boolean;
    showFetching?: boolean;
  } = {}) => {
    if (championshipId === null) {
      setMatches([]);
      setChampionshipSportsForEstimatedStartTime([]);
      setChampionshipBracketEditionsForEstimatedStartTime([]);
      setRepresentationContextMatches([]);
      setTotalCount(0);
      setLoading(false);
      setIsFetching(false);
      hasLoadedMatchesRef.current = false;
      return;
    }

    if (showFetching) {
      setIsFetching(true);
    }

    if (showLoading || !hasLoadedMatchesRef.current) {
      setLoading(true);
    }

    try {
      const groupNumber = resolveGroupNumberByGroupFilterValue(groupFilterValue);

      if (groupFilterValue && typeof groupNumber != "number") {
        setMatches([]);
        setChampionshipSportsForEstimatedStartTime([]);
        setChampionshipBracketEditionsForEstimatedStartTime([]);
        setRepresentationContextMatches([]);
        setTotalCount(0);
        return;
      }

      const applyMatchFilters = (currentQuery: any) => {
        let filteredQuery = currentQuery;

        if (championshipId) {
          filteredQuery = filteredQuery.eq("championship_id", championshipId);
        }

        if (typeof seasonYear == "number") {
          filteredQuery = filteredQuery.eq("season_year", seasonYear);
        }

        if (normalizedStatuses.length > 0) {
          if (normalizedStatuses.length == 1) {
            filteredQuery = filteredQuery.eq("status", normalizedStatuses[0]);
          } else {
            filteredQuery = filteredQuery.in("status", normalizedStatuses);
          }
        }

        if (sportId) {
          filteredQuery = filteredQuery.eq("sport_id", sportId);
        }

        if (teamId) {
          filteredQuery = filteredQuery.or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`);
        }

        if (naipe) {
          filteredQuery = filteredQuery.eq("naipe", naipe);
        }

        if (division !== undefined) {
          if (division === null) {
            filteredQuery = filteredQuery.is("division", null);
          } else {
            filteredQuery = filteredQuery.eq("division", division);
          }
        }

        if (typeof groupNumber == "number") {
          filteredQuery = filteredQuery.eq("group_number", groupNumber);
        }

        return filteredQuery;
      };

      const applyMatchSort = (currentQuery: any) => {
        if (sortMode == "LIVE") {
          return currentQuery
            .order("start_time", { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: false });
        }

        if (sortMode == "FINISHED") {
          return currentQuery
            .order("end_time", { ascending: false, nullsFirst: false })
            .order("start_time", { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: false });
        }

        return currentQuery
          .order("scheduled_date", { ascending: true, nullsFirst: false })
          .order("queue_position", { ascending: true, nullsFirst: false })
          .order("scheduled_slot", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true });
      };

      const isPaginated =
        typeof page == "number" &&
        typeof itemsPerPage == "number" &&
        page > 0 &&
        itemsPerPage > 0;
      const rangeStart = isPaginated ? (page - 1) * itemsPerPage : null;
      const rangeEnd = isPaginated && rangeStart != null ? rangeStart + itemsPerPage - 1 : null;
      let matchRows: Match[] = [];
      let representationContextRows: MatchRepresentationSource[] = [];
      let resolvedTotalCount = 0;

      if (sortMode == "SCHEDULED" && isPaginated && rangeStart != null && rangeEnd != null) {
        let scheduledOrderQuery: any = supabase
          .from("matches")
          .select(
            "id, championship_id, season_year, scheduled_date, start_time, sport_id, naipe, division, queue_position, created_at, scheduled_slot, sports(name), home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name)",
          )
          .order("scheduled_date", { ascending: true, nullsFirst: false })
          .order("queue_position", { ascending: true, nullsFirst: false })
          .order("scheduled_slot", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true })
          .order("id", { ascending: true });

        scheduledOrderQuery = applyMatchFilters(scheduledOrderQuery);

        const { data: scheduledOrderRowsData, error: scheduledOrderRowsError } = await scheduledOrderQuery;

        if (scheduledOrderRowsError) {
          console.error("Erro ao carregar ordenação paginada dos jogos:", scheduledOrderRowsError.message);
          setMatches([]);
          setChampionshipSportsForEstimatedStartTime([]);
          setChampionshipBracketEditionsForEstimatedStartTime([]);
          setRepresentationContextMatches([]);
          setTotalCount(0);
          return;
        }

        const normalizedOrderedScheduledRows = resolveInterleavedScheduledMatchesByCompetition(
          resolveOrderedScheduledMatches((scheduledOrderRowsData ?? []) as MatchRepresentationSource[]),
        );
        const paginatedOrderedScheduledRows = normalizedOrderedScheduledRows.slice(rangeStart, rangeEnd + 1);
        const paginatedMatchIds = paginatedOrderedScheduledRows.map((scheduledMatch) => scheduledMatch.id);

        resolvedTotalCount = normalizedOrderedScheduledRows.length;
        representationContextRows = normalizedOrderedScheduledRows.slice(0, rangeStart);

        if (paginatedMatchIds.length > 0) {
          const { data: paginatedMatchesData, error: paginatedMatchesError } = await supabase
            .from("matches")
            .select(
              "*, championships(*), sports(*), home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*)",
            )
            .in("id", paginatedMatchIds);

          if (paginatedMatchesError) {
            console.error("Erro ao carregar jogos paginados:", paginatedMatchesError.message);
            setMatches([]);
            setChampionshipSportsForEstimatedStartTime([]);
            setChampionshipBracketEditionsForEstimatedStartTime([]);
            setRepresentationContextMatches([]);
            setTotalCount(0);
            return;
          }

          const matchById = new Map((paginatedMatchesData ?? []).map((match) => [match.id, match as Match]));
          matchRows = paginatedMatchIds.reduce<Match[]>((carry, matchId) => {
            const match = matchById.get(matchId);

            if (!match) {
              return carry;
            }

            return [...carry, match];
          }, []);
        }
      } else {
        let query: any = supabase
          .from("matches")
          .select(
            "*, championships(*), sports(*), home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*)",
            { count: "exact" },
          )
          .order("created_at", { ascending: true });

        query = applyMatchFilters(query);
        query = applyMatchSort(query);

        if (isPaginated && rangeStart != null && rangeEnd != null) {
          query = query.range(rangeStart, rangeEnd);
        }

        const { data, error, count } = await query;

        if (error) {
          console.error("Erro ao carregar jogos:", error.message);
          setMatches([]);
          setChampionshipSportsForEstimatedStartTime([]);
          setChampionshipBracketEditionsForEstimatedStartTime([]);
          setRepresentationContextMatches([]);
          setTotalCount(0);
          return;
        }

        matchRows = (data ?? []) as Match[];
        resolvedTotalCount = count ?? matchRows.length;

        if (isPaginated && rangeStart != null && rangeStart > 0) {
          let contextQuery: any = supabase
            .from("matches")
            .select(
              "id, championship_id, season_year, scheduled_date, start_time, sport_id, naipe, division, queue_position, created_at, scheduled_slot, sports(name), home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name)",
            )
            .order("created_at", { ascending: true });

          contextQuery = applyMatchFilters(contextQuery);
          contextQuery = applyMatchSort(contextQuery);
          contextQuery = contextQuery.range(0, rangeStart - 1);

          const { data: representationContextRowsData, error: representationContextRowsError } = await contextQuery;

          if (representationContextRowsError) {
            console.error(
              "Erro ao carregar contexto de representação na paginação:",
              representationContextRowsError.message,
            );
          } else {
            representationContextRows = (representationContextRowsData ?? []) as MatchRepresentationSource[];
          }
        }
      }

      setTotalCount(resolvedTotalCount);

      {
        const matchIds = matchRows.map((match) => match.id);
        const championshipAndSportKeys = [...new Set(matchRows.map((match) => `${match.championship_id}:${match.sport_id}`))];
        const championshipIds = [...new Set(matchRows.map((match) => match.championship_id))];
        const sportIds = [...new Set(matchRows.map((match) => match.sport_id))];
        const seasonYears = [...new Set(matchRows.map((match) => match.season_year))];

        const [championshipSportsResponse, matchSetsResponse, championshipBracketEditionsResponse] = await Promise.all([
          championshipAndSportKeys.length == 0
            ? Promise.resolve({ data: [], error: null })
            : supabase
                .from("championship_sports")
                .select("championship_id, sport_id, result_rule, default_match_duration_minutes, show_estimated_start_time_on_cards")
                .in("championship_id", championshipIds)
                .in("sport_id", sportIds),
          matchIds.length == 0
            ? Promise.resolve({ data: [], error: null })
            : supabase
                .from("match_sets")
                .select("match_id, set_number, home_points, away_points")
                .in("match_id", matchIds)
                .order("set_number", { ascending: true }),
          championshipIds.length == 0 || seasonYears.length == 0
            ? Promise.resolve({ data: [], error: null })
            : supabase
                .from("championship_bracket_editions")
                .select("id, championship_id, season_year, payload_snapshot, updated_at, created_at")
                .in("championship_id", championshipIds)
                .in("season_year", seasonYears)
                .order("updated_at", { ascending: false })
                .order("created_at", { ascending: false }),
        ]);

        if (championshipSportsResponse.error) {
          console.error("Erro ao carregar regras das modalidades:", championshipSportsResponse.error.message);
        }

        if (matchSetsResponse.error) {
          console.error("Erro ao carregar sets das partidas:", matchSetsResponse.error.message);
        }

        if (championshipBracketEditionsResponse.error) {
          console.error("Erro ao carregar snapshots do chaveamento:", championshipBracketEditionsResponse.error.message);
        }

        const resultRuleByChampionshipAndSportKey = (championshipSportsResponse.data ?? []).reduce<Record<string, Match["result_rule"]>>(
          (carry, championshipSport) => {
            carry[`${championshipSport.championship_id}:${championshipSport.sport_id}`] = championshipSport.result_rule;
            return carry;
          },
          {},
        );

        const matchSetsByMatchId = (matchSetsResponse.data ?? []).reduce<Record<string, MatchSetInput[]>>((carry, matchSet) => {
          carry[matchSet.match_id] = [
            ...(carry[matchSet.match_id] ?? []),
            {
              set_number: matchSet.set_number,
              home_points: matchSet.home_points,
              away_points: matchSet.away_points,
            },
          ];

          return carry;
        }, {});

        const championshipSportsForEstimatedStartTimeRows = (
          championshipSportsResponse.data ?? []
        ).map((championshipSport) => ({
          championship_id: championshipSport.championship_id,
          sport_id: championshipSport.sport_id,
          default_match_duration_minutes: championshipSport.default_match_duration_minutes,
          show_estimated_start_time_on_cards: championshipSport.show_estimated_start_time_on_cards,
        }));

        const latestChampionshipBracketEditionByChampionshipAndSeasonKey = (
          championshipBracketEditionsResponse.data ?? []
        ).reduce<Record<string, MatchEstimatedStartTimeBracketEditionCandidate>>((carry, championshipBracketEdition) => {
          const championshipAndSeasonKey = `${championshipBracketEdition.championship_id}:${championshipBracketEdition.season_year}`;
          const payloadSnapshot = resolvePayloadSnapshotValue(
            championshipBracketEdition.payload_snapshot,
          );
          const hasScheduleDaysInPayload =
            hasEstimatedStartTimeScheduleDays(payloadSnapshot);
          const currentChampionshipBracketEdition =
            carry[championshipAndSeasonKey];

          if (
            currentChampionshipBracketEdition &&
            (currentChampionshipBracketEdition.has_schedule_days_in_payload ||
              !hasScheduleDaysInPayload)
          ) {
            return carry;
          }

          carry[championshipAndSeasonKey] = {
            id: championshipBracketEdition.id,
            championship_id: championshipBracketEdition.championship_id,
            season_year: championshipBracketEdition.season_year,
            payload_snapshot: payloadSnapshot,
            has_schedule_days_in_payload: hasScheduleDaysInPayload,
          };

          return carry;
        }, {});
        const latestChampionshipBracketEditions = Object.values(
          latestChampionshipBracketEditionByChampionshipAndSeasonKey,
        );
        const latestChampionshipBracketEditionIds =
          latestChampionshipBracketEditions.map(
            (championshipBracketEdition) => championshipBracketEdition.id,
          );
        const championshipBracketDaysResponse =
          latestChampionshipBracketEditionIds.length == 0
            ? { data: [], error: null }
            : await supabaseLoose
                .from("championship_bracket_days")
                .select(
                  "bracket_edition_id, event_date, start_time, end_time, break_start_time, break_end_time",
                )
                .in(
                  "bracket_edition_id",
                  latestChampionshipBracketEditionIds,
                );

        if (championshipBracketDaysResponse.error) {
          console.error(
            "Erro ao carregar dias de agenda do chaveamento:",
            championshipBracketDaysResponse.error.message,
          );
        }

        const scheduleDaysByBracketEditionId = (
          (championshipBracketDaysResponse.data ?? []) as MatchEstimatedStartTimeBracketDayRow[]
        ).reduce<Record<string, MatchEstimatedStartTimeScheduleDay[]>>(
          (carry, championshipBracketDay) => {
            if (
              !championshipBracketDay.event_date ||
              !championshipBracketDay.start_time ||
              !championshipBracketDay.end_time
            ) {
              return carry;
            }

            carry[championshipBracketDay.bracket_edition_id] = [
              ...(carry[championshipBracketDay.bracket_edition_id] ?? []),
              {
                date: championshipBracketDay.event_date,
                start_time: championshipBracketDay.start_time,
                end_time: championshipBracketDay.end_time,
                break_start_time: championshipBracketDay.break_start_time,
                break_end_time: championshipBracketDay.break_end_time,
              },
            ];
            return carry;
          },
          {},
        );

        const orderedMatchRows =
          sortMode == "SCHEDULED"
            ? resolveInterleavedScheduledMatchesByCompetition(resolveOrderedScheduledMatches(matchRows))
            : matchRows;

        setMatches(
          orderedMatchRows.map((match) => ({
            ...match,
            result_rule: resultRuleByChampionshipAndSportKey[`${match.championship_id}:${match.sport_id}`] ?? null,
            match_sets: matchSetsByMatchId[match.id] ?? [],
          })),
        );
        setRepresentationContextMatches(representationContextRows);
        setChampionshipSportsForEstimatedStartTime(championshipSportsForEstimatedStartTimeRows);
        setChampionshipBracketEditionsForEstimatedStartTime(
          latestChampionshipBracketEditions.map((championshipBracketEdition) => ({
            championship_id: championshipBracketEdition.championship_id,
            season_year: championshipBracketEdition.season_year,
            payload_snapshot: championshipBracketEdition.payload_snapshot,
            schedule_days:
              scheduleDaysByBracketEditionId[
                championshipBracketEdition.id
              ] ?? [],
          })),
        );
      }
    } catch (error) {
      console.error("Erro inesperado ao carregar jogos:", error);
      setMatches([]);
      setChampionshipSportsForEstimatedStartTime([]);
      setChampionshipBracketEditionsForEstimatedStartTime([]);
      setRepresentationContextMatches([]);
      setTotalCount(0);
    } finally {
      hasLoadedMatchesRef.current = true;
      setLoading(false);
      if (showFetching) {
        setIsFetching(false);
      }
    }
  }, [
    championshipId,
    division,
    groupFilterValue,
    itemsPerPage,
    naipe,
    page,
    seasonYear,
    sortMode,
    sportId,
    normalizedStatuses,
    teamId,
  ]);

  useEffect(() => {
    if (championshipId === null) {
      setMatches([]);
      setChampionshipSportsForEstimatedStartTime([]);
      setChampionshipBracketEditionsForEstimatedStartTime([]);
      setRepresentationContextMatches([]);
      setTotalCount(0);
      setLoading(false);
      setIsFetching(false);
      hasLoadedMatchesRef.current = false;
      return;
    }

    fetchMatches({
      showLoading: !hasLoadedMatchesRef.current,
      showFetching: hasLoadedMatchesRef.current,
    });

    if (!includeRealtime) {
      return;
    }

    const channel = supabase
      .channel(`matches-realtime-${championshipId ?? "all"}-${seasonYear ?? "all"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
          filter: championshipId ? `championship_id=eq.${championshipId}` : undefined,
        },
        () => {
          if (scheduledRefetchTimeoutRef.current) {
            clearTimeout(scheduledRefetchTimeoutRef.current);
          }

          scheduledRefetchTimeoutRef.current = setTimeout(() => {
            fetchMatches();
          }, 120);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "championship_sports",
          filter: championshipId ? `championship_id=eq.${championshipId}` : undefined,
        },
        () => {
          if (scheduledRefetchTimeoutRef.current) {
            clearTimeout(scheduledRefetchTimeoutRef.current);
          }

          scheduledRefetchTimeoutRef.current = setTimeout(() => {
            fetchMatches();
          }, 120);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "championship_bracket_editions",
          filter: championshipId ? `championship_id=eq.${championshipId}` : undefined,
        },
        () => {
          if (scheduledRefetchTimeoutRef.current) {
            clearTimeout(scheduledRefetchTimeoutRef.current);
          }

          scheduledRefetchTimeoutRef.current = setTimeout(() => {
            fetchMatches();
          }, 120);
        },
      )
      .subscribe();

    return () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
        scheduledRefetchTimeoutRef.current = null;
      }

      supabase.removeChannel(channel);
    };
  }, [championshipId, fetchMatches, includeRealtime, seasonYear]);

  useEffect(() => {
    return () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
        scheduledRefetchTimeoutRef.current = null;
      }
    };
  }, []);

  const matchRepresentationByMatchId = useMemo(() => {
    const matchRepresentationSourcesById = [
      ...representationContextMatches,
      ...matches,
    ].reduce<Record<string, MatchRepresentationSource>>((carry, matchRepresentationSource) => {
      carry[matchRepresentationSource.id] = matchRepresentationSource;
      return carry;
    }, {});

    return resolveMatchRepresentationByMatchId(Object.values(matchRepresentationSourcesById));
  }, [matches, representationContextMatches]);

  const estimatedStartTimeByMatchId = useMemo(() => {
    return resolveEstimatedStartTimeByMatchId({
      matches,
      championshipSports: championshipSportsForEstimatedStartTime,
      championshipBracketEditions: championshipBracketEditionsForEstimatedStartTime,
    });
  }, [championshipBracketEditionsForEstimatedStartTime, championshipSportsForEstimatedStartTime, matches]);

  const liveMatches = useMemo(() => {
    return [...matches]
      .filter((match) => match.status === MatchStatus.LIVE)
      .sort((firstMatch, secondMatch) => {
        const firstTimestamp = new Date(firstMatch.start_time ?? firstMatch.created_at).getTime();
        const secondTimestamp = new Date(secondMatch.start_time ?? secondMatch.created_at).getTime();

        return secondTimestamp - firstTimestamp;
      });
  }, [matches]);

  const upcomingMatches = useMemo(() => {
    return resolveOrderedScheduledMatches(
      matches.filter((match) => match.status === MatchStatus.SCHEDULED),
    );
  }, [matches]);

  const finishedMatches = useMemo(() => {
    return [...matches]
      .filter((match) => match.status === MatchStatus.FINISHED)
      .sort((firstMatch, secondMatch) => {
        const firstTimestamp = new Date(firstMatch.end_time ?? firstMatch.start_time ?? firstMatch.created_at).getTime();
        const secondTimestamp = new Date(secondMatch.end_time ?? secondMatch.start_time ?? secondMatch.created_at).getTime();

        return secondTimestamp - firstTimestamp;
      });
  }, [matches]);

  return {
    matches,
    totalCount,
    matchRepresentationByMatchId,
    estimatedStartTimeByMatchId,
    liveMatches,
    upcomingMatches,
    finishedMatches,
    loading,
    isFetching,
    refetch: fetchMatches,
  };
}
