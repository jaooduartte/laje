import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Match } from "@/lib/types";
import { MatchStatus } from "@/lib/enums";
import {
  type MatchEstimatedStartTimeBracketEdition,
  type MatchEstimatedStartTimeChampionshipSport,
  type MatchEstimatedStartTimeScheduleDay,
  resolveEstimatedStartTimeByMatchId,
  resolveMatchDisplaySlotValue,
  resolveMatchRepresentationByMatchId,
  resolveMatchScheduledDateValue,
} from "@/lib/championship";
import type { MatchSetInput } from "@/domain/championship-brackets/championshipBracket.types";

interface UseMatchesOptions {
  championshipId?: string | null;
  seasonYear?: number | null;
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

export function useMatches({ championshipId, seasonYear }: UseMatchesOptions = {}) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [championshipSportsForEstimatedStartTime, setChampionshipSportsForEstimatedStartTime] = useState<
    MatchEstimatedStartTimeChampionshipSport[]
  >([]);
  const [championshipBracketEditionsForEstimatedStartTime, setChampionshipBracketEditionsForEstimatedStartTime] = useState<
    MatchEstimatedStartTimeBracketEdition[]
  >([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedMatchesRef = useRef(false);
  const scheduledRefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchMatches = useCallback(async (shouldShowLoading = false) => {
    if (championshipId === null) {
      setMatches([]);
      setChampionshipSportsForEstimatedStartTime([]);
      setChampionshipBracketEditionsForEstimatedStartTime([]);
      setLoading(false);
      hasLoadedMatchesRef.current = false;
      return;
    }

    if (shouldShowLoading || !hasLoadedMatchesRef.current) {
      setLoading(true);
    }

    try {
      let query = supabase
        .from("matches")
        .select(
          "*, championships(*), sports(*), home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*)",
        )
          .order("scheduled_date", { ascending: true })
          .order("scheduled_slot", { ascending: true })
          .order("queue_position", { ascending: true })
          .order("created_at", { ascending: true });

      if (championshipId) {
        query = query.eq("championship_id", championshipId);
      }

      if (typeof seasonYear == "number") {
        query = query.eq("season_year", seasonYear);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Erro ao carregar jogos:", error.message);
        setMatches([]);
        setChampionshipSportsForEstimatedStartTime([]);
        setChampionshipBracketEditionsForEstimatedStartTime([]);
        return;
      }

      if (data) {
        const matchRows = data as unknown as Match[];
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

        setMatches(
          matchRows.map((match) => ({
            ...match,
            result_rule: resultRuleByChampionshipAndSportKey[`${match.championship_id}:${match.sport_id}`] ?? null,
            match_sets: matchSetsByMatchId[match.id] ?? [],
          })),
        );
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
    } finally {
      hasLoadedMatchesRef.current = true;
      setLoading(false);
    }
  }, [championshipId, seasonYear]);

  useEffect(() => {
    if (championshipId === null) {
      setMatches([]);
      setChampionshipSportsForEstimatedStartTime([]);
      setChampionshipBracketEditionsForEstimatedStartTime([]);
      setLoading(false);
      hasLoadedMatchesRef.current = false;
      return;
    }

    fetchMatches(true);

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
  }, [championshipId, fetchMatches, seasonYear]);

  useEffect(() => {
    return () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
        scheduledRefetchTimeoutRef.current = null;
      }
    };
  }, []);

  const matchRepresentationByMatchId = useMemo(() => {
    return resolveMatchRepresentationByMatchId(matches);
  }, [matches]);

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
    return [...matches]
      .filter((match) => match.status === MatchStatus.SCHEDULED)
      .sort((firstMatch, secondMatch) => {
        const firstScheduledDate = resolveMatchScheduledDateValue(firstMatch) ?? "9999-12-31";
        const secondScheduledDate = resolveMatchScheduledDateValue(secondMatch) ?? "9999-12-31";

        if (firstScheduledDate != secondScheduledDate) {
          return firstScheduledDate.localeCompare(secondScheduledDate);
        }

        const slotDifference =
          (resolveMatchDisplaySlotValue(firstMatch) ?? Number.MAX_SAFE_INTEGER) -
          (resolveMatchDisplaySlotValue(secondMatch) ?? Number.MAX_SAFE_INTEGER);

        if (slotDifference != 0) {
          return slotDifference;
        }

        if (firstMatch.created_at != secondMatch.created_at) {
          return firstMatch.created_at.localeCompare(secondMatch.created_at);
        }

        return firstMatch.id.localeCompare(secondMatch.id);
      });
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
    matchRepresentationByMatchId,
    estimatedStartTimeByMatchId,
    liveMatches,
    upcomingMatches,
    finishedMatches,
    loading,
    refetch: fetchMatches,
  };
}
