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
  resolveMatchDisplaySlotValue,
  resolveMatchScheduledDateValue,
  resolveOrderedScheduledMatches,
  resolveMatchRepresentationByMatchId,
  resolveVisualQueuePositionByMatchId,
} from "@/lib/championship";
import type {
  ChampionshipBracketMatchNumberingMode,
  MatchSetInput,
} from "@/domain/championship-brackets/championshipBracket.types";

interface UseMatchesOptions {
  championshipId?: string | null;
  seasonYear?: number | null;
  statuses?: MatchStatus[];
  sportId?: string | null;
  teamId?: string | null;
  naipe?: MatchNaipe | null;
  division?: TeamDivision | null;
  groupFilterValue?: string | null;
  location?: string | null;
  courtName?: string | null;
  page?: number;
  itemsPerPage?: number;
  includeRealtime?: boolean;
  sortMode?: "SCHEDULED" | "LIVE" | "FINISHED";
  scheduledMatchOrdering?: "INTERLEAVED_BY_COMPETITION" | "OPERATIONAL";
}

type SupabaseLooseQueryError = {
  message: string;
};

type SupabaseLooseQueryResult<TData> = {
  data: TData | null;
  error: SupabaseLooseQueryError | null;
  count?: number | null;
};

type SupabaseLooseQueryBuilder<TData> = PromiseLike<
  SupabaseLooseQueryResult<TData>
> & {
  eq: (column: string, value: unknown) => SupabaseLooseQueryBuilder<TData>;

  in: (
    column: string,
    values: readonly unknown[],
  ) => SupabaseLooseQueryBuilder<TData>;

  is: (column: string, value: null) => SupabaseLooseQueryBuilder<TData>;

  or: (filters: string) => SupabaseLooseQueryBuilder<TData>;

  order: (
    column: string,
    options?: {
      ascending?: boolean;
      nullsFirst?: boolean;
    },
  ) => SupabaseLooseQueryBuilder<TData>;

  range: (from: number, to: number) => SupabaseLooseQueryBuilder<TData>;
};

type SupabaseLooseTableClient = {
  select: (
    columns: string,
    options?: {
      count?: "exact" | "planned" | "estimated";
      head?: boolean;
    },
  ) => SupabaseLooseQueryBuilder<unknown[]>;
};

type SupabaseLooseClient = {
  from: (table: string) => SupabaseLooseTableClient;
};

type SupabaseMatchQueryChain<TQuery> = {
  eq: (column: string, value: unknown) => TQuery;
  in: (column: string, values: readonly unknown[]) => TQuery;
  is: (column: string, value: null) => TQuery;
  or: (filters: string) => TQuery;
  order: (
    column: string,
    options?: {
      ascending?: boolean;
      nullsFirst?: boolean;
    },
  ) => TQuery;
  range: (from: number, to: number) => TQuery;
};

type MatchEstimatedStartTimeBracketEditionCandidate =
  MatchEstimatedStartTimeBracketEdition & {
    id: string;
    has_schedule_days_in_payload: boolean;
  };

type MatchEstimatedStartTimeBracketDayRow = {
  id: string;
  bracket_edition_id: string;
  event_date: string;
  start_time: string;
  end_time: string;
  championship_bracket_day_breaks?: Array<{
    break_start_time: string;
    break_end_time: string;
    position: number;
  }> | null;
};

const supabaseLoose = supabase as unknown as SupabaseLooseClient;

function resolveGroupNumberByGroupFilterValue(
  groupFilterValue: string | null | undefined,
): number | null {
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

  for (
    let suffixCharacterIndex = 0;
    suffixCharacterIndex < alphabeticalSuffix.length;
    suffixCharacterIndex += 1
  ) {
    const suffixCharacter = alphabeticalSuffix.charCodeAt(suffixCharacterIndex);
    const currentCharacterValue = suffixCharacter - 64;

    if (currentCharacterValue < 1 || currentCharacterValue > 26) {
      return null;
    }

    parsedGroupNumber = parsedGroupNumber * 26 + currentCharacterValue;
  }

  return parsedGroupNumber > 0 ? parsedGroupNumber : null;
}

function resolvePayloadSnapshotValue(
  payloadSnapshot: unknown,
): Record<string, unknown> | null {
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

function resolveMatchNumberingModeFromPayloadSnapshot(
  payloadSnapshot: Record<string, unknown> | null,
): ChampionshipBracketMatchNumberingMode {
  if (payloadSnapshot?.match_numbering_mode == "SPORT_NAIPE") {
    return "SPORT_NAIPE";
  }

  return payloadSnapshot?.match_numbering_mode == "SPORT" ? "SPORT" : "COURT";
}

type RealtimeScopedRow = {
  championship_id?: unknown;
  season_year?: unknown;
};

function isRealtimeScopedRow(value: unknown): value is RealtimeScopedRow {
  return value != null && typeof value == "object";
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
  location,
  courtName,
  page,
  itemsPerPage,
  includeRealtime = true,
  sortMode = "SCHEDULED",
  scheduledMatchOrdering = "INTERLEAVED_BY_COMPETITION",
}: UseMatchesOptions = {}) {
  const normalizedStatusesKey =
    statuses && statuses.length > 0
      ? [...new Set(statuses)].sort().join(",")
      : "";

  const [matches, setMatches] = useState<Match[]>([]);
  const [
    championshipSportsForEstimatedStartTime,
    setChampionshipSportsForEstimatedStartTime,
  ] = useState<MatchEstimatedStartTimeChampionshipSport[]>([]);
  const [
    championshipBracketEditionsForEstimatedStartTime,
    setChampionshipBracketEditionsForEstimatedStartTime,
  ] = useState<MatchEstimatedStartTimeBracketEdition[]>([]);
  const [operationalContextMatches, setOperationalContextMatches] = useState<
    MatchRepresentationSource[]
  >([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const hasLoadedMatchesRef = useRef(false);
  const scheduledRefetchTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const fetchMatches = useCallback(
    async ({
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
        setOperationalContextMatches([]);
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
        const groupNumber =
          resolveGroupNumberByGroupFilterValue(groupFilterValue);
        const normalizedStatuses = normalizedStatusesKey
          ? (normalizedStatusesKey.split(",") as MatchStatus[])
          : [];

        if (groupFilterValue && typeof groupNumber != "number") {
          setMatches([]);
          setChampionshipSportsForEstimatedStartTime([]);
          setChampionshipBracketEditionsForEstimatedStartTime([]);
          setOperationalContextMatches([]);
          setTotalCount(0);
          return;
        }

        const applyMatchFilters = <
          TQuery extends SupabaseMatchQueryChain<TQuery>,
        >(
          currentQuery: TQuery,
        ) => {
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
            filteredQuery = filteredQuery.or(
              `home_team_id.eq.${teamId},away_team_id.eq.${teamId}`,
            );
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

          if (location) {
            filteredQuery = filteredQuery.eq("location", location);
          }

          if (courtName) {
            filteredQuery = filteredQuery.eq("court_name", courtName);
          }

          return filteredQuery;
        };

        const applyMatchSort = <TQuery extends SupabaseMatchQueryChain<TQuery>>(
          currentQuery: TQuery,
        ) => {
          if (sortMode == "LIVE") {
            return currentQuery
              .order("start_time", { ascending: false, nullsFirst: false })
              .order("created_at", { ascending: false });
          }

          if (sortMode == "FINISHED") {
            return currentQuery
              .order("queue_position", { ascending: false, nullsFirst: false })
              .order("scheduled_slot", { ascending: false, nullsFirst: false })
              .order("scheduled_date", { ascending: false, nullsFirst: false })
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

        const applyOperationalContextFilters = <
          TQuery extends SupabaseMatchQueryChain<TQuery>,
        >(
          currentQuery: TQuery,
        ) => {
          let filteredQuery = currentQuery;

          if (championshipId) {
            filteredQuery = filteredQuery.eq("championship_id", championshipId);
          }

          if (typeof seasonYear == "number") {
            filteredQuery = filteredQuery.eq("season_year", seasonYear);
          }

          if (sportId) {
            filteredQuery = filteredQuery.eq("sport_id", sportId);
          }

          return filteredQuery;
        };

        const isPaginated =
          typeof page == "number" &&
          typeof itemsPerPage == "number" &&
          page > 0 &&
          itemsPerPage > 0;
        const rangeStart = isPaginated ? (page - 1) * itemsPerPage : null;
        const rangeEnd =
          isPaginated && rangeStart != null
            ? rangeStart + itemsPerPage - 1
            : null;
        let matchRows: Match[] = [];
        let resolvedOperationalContextMatches: MatchRepresentationSource[] = [];
        let resolvedTotalCount = 0;

        if (
          (sortMode == "SCHEDULED" || sortMode == "FINISHED") &&
          isPaginated &&
          rangeStart != null &&
          rangeEnd != null
        ) {
          let scheduledOrderQuery = supabaseLoose
            .from("matches")
            .select(
              "id, championship_id, location, court_name, manual_representation_mode, season_year, scheduled_date, start_time, end_time, sport_id, naipe, division, queue_position, created_at, scheduled_slot, sports(name), home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name)",
            )
            .order("scheduled_date", {
              ascending: sortMode == "SCHEDULED",
              nullsFirst: false,
            })
            .order("queue_position", {
              ascending: sortMode == "SCHEDULED",
              nullsFirst: false,
            })
            .order("scheduled_slot", {
              ascending: sortMode == "SCHEDULED",
              nullsFirst: false,
            })
            .order("created_at", { ascending: sortMode == "SCHEDULED" })
            .order("id", { ascending: true });

          if (championshipId) {
            scheduledOrderQuery = scheduledOrderQuery.eq(
              "championship_id",
              championshipId,
            );
          }

          if (typeof seasonYear == "number") {
            scheduledOrderQuery = scheduledOrderQuery.eq(
              "season_year",
              seasonYear,
            );
          }

          if (normalizedStatuses.length > 0) {
            if (normalizedStatuses.length == 1) {
              scheduledOrderQuery = scheduledOrderQuery.eq(
                "status",
                normalizedStatuses[0],
              );
            } else {
              scheduledOrderQuery = scheduledOrderQuery.in(
                "status",
                normalizedStatuses,
              );
            }
          }

          if (sportId) {
            scheduledOrderQuery = scheduledOrderQuery.eq("sport_id", sportId);
          }

          if (teamId) {
            scheduledOrderQuery = scheduledOrderQuery.or(
              `home_team_id.eq.${teamId},away_team_id.eq.${teamId}`,
            );
          }

          if (naipe) {
            scheduledOrderQuery = scheduledOrderQuery.eq("naipe", naipe);
          }

          if (division !== undefined) {
            if (division === null) {
              scheduledOrderQuery = scheduledOrderQuery.is("division", null);
            } else {
              scheduledOrderQuery = scheduledOrderQuery.eq(
                "division",
                division,
              );
            }
          }

          if (typeof groupNumber == "number") {
            scheduledOrderQuery = scheduledOrderQuery.eq(
              "group_number",
              groupNumber,
            );
          }

          if (location) {
            scheduledOrderQuery = scheduledOrderQuery.eq("location", location);
          }

          if (courtName) {
            scheduledOrderQuery = scheduledOrderQuery.eq(
              "court_name",
              courtName,
            );
          }

          const {
            data: scheduledOrderRowsData,
            error: scheduledOrderRowsError,
          } = await scheduledOrderQuery;

          if (scheduledOrderRowsError) {
            console.error(
              "Erro ao carregar ordenação paginada dos jogos:",
              scheduledOrderRowsError.message,
            );
            setMatches([]);
            setChampionshipSportsForEstimatedStartTime([]);
            setChampionshipBracketEditionsForEstimatedStartTime([]);
            setOperationalContextMatches([]);
            setTotalCount(0);
            return;
          }

          const filteredOrderedRows = (scheduledOrderRowsData ??
            []) as MatchRepresentationSource[];
          const normalizedOrderedRows =
            sortMode == "SCHEDULED"
              ? scheduledMatchOrdering == "INTERLEAVED_BY_COMPETITION"
                ? resolveInterleavedScheduledMatchesByCompetition(
                    resolveOrderedScheduledMatches(filteredOrderedRows),
                  )
                : resolveOrderedScheduledMatches(filteredOrderedRows)
              : [...filteredOrderedRows].sort((firstMatch, secondMatch) => {
                  const firstSlot =
                    resolveMatchDisplaySlotValue(firstMatch) ?? 0;
                  const secondSlot =
                    resolveMatchDisplaySlotValue(secondMatch) ?? 0;

                  if (firstSlot != secondSlot) {
                    return secondSlot - firstSlot;
                  }

                  const firstScheduledDate =
                    resolveMatchScheduledDateValue(firstMatch) ?? "";
                  const secondScheduledDate =
                    resolveMatchScheduledDateValue(secondMatch) ?? "";

                  if (firstScheduledDate != secondScheduledDate) {
                    return secondScheduledDate.localeCompare(
                      firstScheduledDate,
                    );
                  }

                  const firstEndedAtTimestamp = firstMatch.end_time
                    ? new Date(firstMatch.end_time).getTime()
                    : 0;
                  const secondEndedAtTimestamp = secondMatch.end_time
                    ? new Date(secondMatch.end_time).getTime()
                    : 0;

                  if (firstEndedAtTimestamp != secondEndedAtTimestamp) {
                    return secondEndedAtTimestamp - firstEndedAtTimestamp;
                  }

                  const firstStartedAtTimestamp = firstMatch.start_time
                    ? new Date(firstMatch.start_time).getTime()
                    : 0;
                  const secondStartedAtTimestamp = secondMatch.start_time
                    ? new Date(secondMatch.start_time).getTime()
                    : 0;

                  if (firstStartedAtTimestamp != secondStartedAtTimestamp) {
                    return secondStartedAtTimestamp - firstStartedAtTimestamp;
                  }

                  return String(secondMatch.created_at ?? "").localeCompare(
                    String(firstMatch.created_at ?? ""),
                  );
                });
          const paginatedOrderedRows = normalizedOrderedRows.slice(
            rangeStart,
            rangeEnd + 1,
          );
          const paginatedMatchIds = paginatedOrderedRows.map(
            (scheduledMatch) => scheduledMatch.id,
          );

          resolvedTotalCount = normalizedOrderedRows.length;

          if (paginatedMatchIds.length > 0) {
            const { data: paginatedMatchesData, error: paginatedMatchesError } =
              await supabaseLoose
                .from("matches")
                .select(
                  "*, championships(*), sports(*), home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*)",
                )
                .in("id", paginatedMatchIds);

            if (paginatedMatchesError) {
              console.error(
                "Erro ao carregar jogos paginados:",
                paginatedMatchesError.message,
              );
              setMatches([]);
              setChampionshipSportsForEstimatedStartTime([]);
              setChampionshipBracketEditionsForEstimatedStartTime([]);
              setOperationalContextMatches([]);
              setTotalCount(0);
              return;
            }

            const paginatedMatches = (paginatedMatchesData ?? []) as Match[];

            const matchById = new Map(
              paginatedMatches.map((match) => [match.id, match]),
            );
            matchRows = paginatedMatchIds.reduce<Match[]>((carry, matchId) => {
              const match = matchById.get(matchId);

              if (!match) {
                return carry;
              }

              return [...carry, match];
            }, []);
          }
        } else {
          let query = supabaseLoose
            .from("matches")
            .select(
              "*, championships(*), sports(*), home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*)",
              { count: "exact" },
            );

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
            setOperationalContextMatches([]);
            setTotalCount(0);
            return;
          }

          matchRows = (data ?? []) as Match[];
          resolvedTotalCount = count ?? matchRows.length;
        }

        let operationalContextQuery = supabaseLoose
          .from("matches")
          .select(
            "id, championship_id, location, court_name, manual_representation_mode, season_year, scheduled_date, start_time, status, sport_id, naipe, division, queue_position, created_at, scheduled_slot, sports(name), home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name)",
          )
          .order("scheduled_date", { ascending: true, nullsFirst: false })
          .order("queue_position", { ascending: true, nullsFirst: false })
          .order("scheduled_slot", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true })
          .order("id", { ascending: true });

        operationalContextQuery = applyOperationalContextFilters(
          operationalContextQuery,
        );

        const {
          data: operationalContextRowsData,
          error: operationalContextRowsError,
        } = await operationalContextQuery;

        if (operationalContextRowsError) {
          console.error(
            "Erro ao carregar contexto operacional dos jogos:",
            operationalContextRowsError.message,
          );
        } else {
          resolvedOperationalContextMatches = (operationalContextRowsData ??
            []) as MatchRepresentationSource[];
        }

        setTotalCount(resolvedTotalCount);

        {
          const matchIds = matchRows.map((match) => match.id);
          const championshipAndSportKeys = [
            ...new Set(
              matchRows.map(
                (match) => `${match.championship_id}:${match.sport_id}`,
              ),
            ),
          ];
          const championshipIds = [
            ...new Set(matchRows.map((match) => match.championship_id)),
          ];
          const sportIds = [
            ...new Set(matchRows.map((match) => match.sport_id)),
          ];
          const seasonYears = [
            ...new Set(matchRows.map((match) => match.season_year)),
          ];

          const [
            championshipSportsResponse,
            matchSetsResponse,
            championshipBracketEditionsResponse,
          ] = await Promise.all([
            championshipAndSportKeys.length == 0
              ? Promise.resolve({ data: [], error: null })
              : supabase
                  .from("championship_sports")
                  .select(
                    "championship_id, sport_id, result_rule, default_match_duration_minutes, show_estimated_start_time_on_cards",
                  )
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
                  .select(
                    "id, championship_id, season_year, payload_snapshot, updated_at, created_at",
                  )
                  .in("championship_id", championshipIds)
                  .in("season_year", seasonYears)
                  .order("updated_at", { ascending: false })
                  .order("created_at", { ascending: false }),
          ]);

          if (championshipSportsResponse.error) {
            console.error(
              "Erro ao carregar regras das modalidades:",
              championshipSportsResponse.error.message,
            );
          }

          if (matchSetsResponse.error) {
            console.error(
              "Erro ao carregar sets das partidas:",
              matchSetsResponse.error.message,
            );
          }

          if (championshipBracketEditionsResponse.error) {
            console.error(
              "Erro ao carregar snapshots do chaveamento:",
              championshipBracketEditionsResponse.error.message,
            );
          }

          const resultRuleByChampionshipAndSportKey = (
            championshipSportsResponse.data ?? []
          ).reduce<Record<string, Match["result_rule"]>>(
            (carry, championshipSport) => {
              carry[
                `${championshipSport.championship_id}:${championshipSport.sport_id}`
              ] = championshipSport.result_rule;
              return carry;
            },
            {},
          );

          const matchSetsByMatchId = (matchSetsResponse.data ?? []).reduce<
            Record<string, MatchSetInput[]>
          >((carry, matchSet) => {
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
            default_match_duration_minutes:
              championshipSport.default_match_duration_minutes,
            show_estimated_start_time_on_cards:
              championshipSport.show_estimated_start_time_on_cards,
          }));

          const latestChampionshipBracketEditionByChampionshipAndSeasonKey = (
            championshipBracketEditionsResponse.data ?? []
          ).reduce<
            Record<string, MatchEstimatedStartTimeBracketEditionCandidate>
          >((carry, championshipBracketEdition) => {
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
                    "id, bracket_edition_id, event_date, start_time, end_time, championship_bracket_day_breaks(break_start_time, break_end_time, position)",
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
            (championshipBracketDaysResponse.data ??
              []) as MatchEstimatedStartTimeBracketDayRow[]
          ).reduce<Record<string, MatchEstimatedStartTimeScheduleDay[]>>(
            (carry, championshipBracketDay) => {
              if (
                !championshipBracketDay.event_date ||
                !championshipBracketDay.start_time ||
                !championshipBracketDay.end_time
              ) {
                return carry;
              }

              const dayBreaks = (
                championshipBracketDay.championship_bracket_day_breaks ?? []
              )
                .slice()
                .sort((a, b) => a.position - b.position);

              carry[championshipBracketDay.bracket_edition_id] = [
                ...(carry[championshipBracketDay.bracket_edition_id] ?? []),
                {
                  date: championshipBracketDay.event_date,
                  start_time: championshipBracketDay.start_time,
                  end_time: championshipBracketDay.end_time,
                  breaks: dayBreaks,
                },
              ];
              return carry;
            },
            {},
          );

          const orderedMatchRows =
            sortMode == "SCHEDULED"
              ? scheduledMatchOrdering == "INTERLEAVED_BY_COMPETITION"
                ? resolveInterleavedScheduledMatchesByCompetition(
                    resolveOrderedScheduledMatches(matchRows),
                  )
                : resolveOrderedScheduledMatches(matchRows)
              : matchRows;

          setMatches(
            orderedMatchRows.map((match) => ({
              ...match,
              result_rule:
                resultRuleByChampionshipAndSportKey[
                  `${match.championship_id}:${match.sport_id}`
                ] ?? null,
              match_sets: matchSetsByMatchId[match.id] ?? [],
            })),
          );
          setOperationalContextMatches(resolvedOperationalContextMatches);
          setChampionshipSportsForEstimatedStartTime(
            championshipSportsForEstimatedStartTimeRows,
          );
          setChampionshipBracketEditionsForEstimatedStartTime(
            latestChampionshipBracketEditions.map(
              (championshipBracketEdition) => ({
                championship_id: championshipBracketEdition.championship_id,
                season_year: championshipBracketEdition.season_year,
                payload_snapshot: championshipBracketEdition.payload_snapshot,
                schedule_days:
                  scheduleDaysByBracketEditionId[
                    championshipBracketEdition.id
                  ] ?? [],
              }),
            ),
          );
        }
      } catch (error) {
        console.error("Erro inesperado ao carregar jogos:", error);
        setMatches([]);
        setChampionshipSportsForEstimatedStartTime([]);
        setChampionshipBracketEditionsForEstimatedStartTime([]);
        setOperationalContextMatches([]);
        setTotalCount(0);
      } finally {
        hasLoadedMatchesRef.current = true;
        setLoading(false);
        if (showFetching) {
          setIsFetching(false);
        }
      }
    },
    [
      championshipId,
      courtName,
      division,
      groupFilterValue,
      itemsPerPage,
      location,
      naipe,
      page,
      seasonYear,
      scheduledMatchOrdering,
      sortMode,
      sportId,
      normalizedStatusesKey,
      teamId,
    ],
  );

  useEffect(() => {
    if (championshipId === null) {
      setMatches([]);
      setChampionshipSportsForEstimatedStartTime([]);
      setChampionshipBracketEditionsForEstimatedStartTime([]);
      setOperationalContextMatches([]);
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
      .channel(
        `matches-realtime-${championshipId ?? "all"}-${seasonYear ?? "all"}`,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
          filter: championshipId
            ? `championship_id=eq.${championshipId}`
            : undefined,
        },
        (payload) => {
          const relevantRows = [payload.new, payload.old].filter(
            isRealtimeScopedRow,
          );
          const shouldRefetch =
            relevantRows.length == 0 ||
            relevantRows.some((row) => {
              if (championshipId && row.championship_id != championshipId) {
                return false;
              }

              if (
                typeof seasonYear == "number" &&
                row.season_year != seasonYear
              ) {
                return false;
              }

              return true;
            });

          if (!shouldRefetch) {
            return;
          }

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
          filter: championshipId
            ? `championship_id=eq.${championshipId}`
            : undefined,
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
          filter: championshipId
            ? `championship_id=eq.${championshipId}`
            : undefined,
        },
        (payload) => {
          const relevantRows = [payload.new, payload.old].filter(
            isRealtimeScopedRow,
          );
          const shouldRefetch =
            relevantRows.length == 0 ||
            relevantRows.some((row) => {
              if (championshipId && row.championship_id != championshipId) {
                return false;
              }

              if (
                typeof seasonYear == "number" &&
                row.season_year != seasonYear
              ) {
                return false;
              }

              return true;
            });

          if (!shouldRefetch) {
            return;
          }

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

  const matchNumberingModeByChampionshipAndSeasonKey = useMemo(() => {
    return championshipBracketEditionsForEstimatedStartTime.reduce<
      Record<string, ChampionshipBracketMatchNumberingMode>
    >((carry, championshipBracketEdition) => {
      const championshipAndSeasonKey = `${championshipBracketEdition.championship_id}:${championshipBracketEdition.season_year}`;

      carry[championshipAndSeasonKey] =
        resolveMatchNumberingModeFromPayloadSnapshot(
          championshipBracketEdition.payload_snapshot,
        );

      return carry;
    }, {});
  }, [championshipBracketEditionsForEstimatedStartTime]);

  const estimatedStartTimeByContextMatchId = useMemo(() => {
    return resolveEstimatedStartTimeByMatchId({
      matches: [...operationalContextMatches, ...matches] as Match[],
      contextMatches: operationalContextMatches,
      championshipSports: championshipSportsForEstimatedStartTime,
      championshipBracketEditions:
        championshipBracketEditionsForEstimatedStartTime,
    });
  }, [
    championshipBracketEditionsForEstimatedStartTime,
    championshipSportsForEstimatedStartTime,
    matches,
    operationalContextMatches,
  ]);

  const matchRepresentationByMatchId = useMemo(() => {
    return resolveMatchRepresentationByMatchId(
      matches,
      operationalContextMatches,
      estimatedStartTimeByContextMatchId,
    );
  }, [estimatedStartTimeByContextMatchId, matches, operationalContextMatches]);

  const visualQueuePositionByMatchId = useMemo(() => {
    const visibleMatchesByChampionshipAndSeasonKey = matches.reduce<
      Record<string, MatchRepresentationSource[]>
    >((carry, match) => {
      const championshipAndSeasonKey = `${match.championship_id}:${match.season_year}`;

      carry[championshipAndSeasonKey] = [
        ...(carry[championshipAndSeasonKey] ?? []),
        match,
      ];

      return carry;
    }, {});

    const contextMatchesByChampionshipAndSeasonKey =
      operationalContextMatches.reduce<
        Record<string, MatchRepresentationSource[]>
      >((carry, match) => {
        const championshipAndSeasonKey = `${match.championship_id}:${match.season_year}`;

        carry[championshipAndSeasonKey] = [
          ...(carry[championshipAndSeasonKey] ?? []),
          match,
        ];

        return carry;
      }, {});

    return Object.entries(visibleMatchesByChampionshipAndSeasonKey).reduce<
      Record<string, number>
    >((carry, [championshipAndSeasonKey, scopedMatches]) => {
      const scopedVisualQueuePositionByMatchId =
        resolveVisualQueuePositionByMatchId(
          scopedMatches,
          contextMatchesByChampionshipAndSeasonKey[championshipAndSeasonKey] ??
            [],
          estimatedStartTimeByContextMatchId,
          matchNumberingModeByChampionshipAndSeasonKey[
            championshipAndSeasonKey
          ] ?? "COURT",
        );

      return {
        ...carry,
        ...scopedVisualQueuePositionByMatchId,
      };
    }, {});
  }, [
    estimatedStartTimeByContextMatchId,
    matchNumberingModeByChampionshipAndSeasonKey,
    matches,
    operationalContextMatches,
  ]);

  const estimatedStartTimeByMatchId = useMemo(() => {
    return matches.reduce<Record<string, string>>((carry, match) => {
      const estimatedStartTime = estimatedStartTimeByContextMatchId[match.id];

      if (estimatedStartTime) {
        carry[match.id] = estimatedStartTime;
      }

      return carry;
    }, {});
  }, [estimatedStartTimeByContextMatchId, matches]);

  const liveMatches = useMemo(() => {
    return [...matches]
      .filter((match) => match.status === MatchStatus.LIVE)
      .sort((firstMatch, secondMatch) => {
        const firstTimestamp = new Date(
          firstMatch.start_time ?? firstMatch.created_at,
        ).getTime();
        const secondTimestamp = new Date(
          secondMatch.start_time ?? secondMatch.created_at,
        ).getTime();

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
        const firstTimestamp = new Date(
          firstMatch.end_time ?? firstMatch.start_time ?? firstMatch.created_at,
        ).getTime();
        const secondTimestamp = new Date(
          secondMatch.end_time ??
            secondMatch.start_time ??
            secondMatch.created_at,
        ).getTime();

        return secondTimestamp - firstTimestamp;
      });
  }, [matches]);

  return {
    matches,
    totalCount,
    matchRepresentationByMatchId,
    visualQueuePositionByMatchId,
    estimatedStartTimeByMatchId,
    liveMatches,
    upcomingMatches,
    finishedMatches,
    loading,
    isFetching,
    refetch: fetchMatches,
  };
}
