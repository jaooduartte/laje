import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Match } from "@/lib/types";
import { MatchStatus } from "@/lib/enums";
import { resolveMatchScheduledDateValue } from "@/lib/championship";
import type { MatchSetInput } from "@/domain/championship-brackets/championshipBracket.types";

interface UseMatchesOptions {
  championshipId?: string | null;
  seasonYear?: number | null;
}

export function useMatches({ championshipId, seasonYear }: UseMatchesOptions = {}) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedMatchesRef = useRef(false);
  const scheduledRefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchMatches = useCallback(async (shouldShowLoading = false) => {
    if (championshipId === null) {
      setMatches([]);
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
        return;
      }

      if (data) {
        const matchRows = data as unknown as Match[];
        const matchIds = matchRows.map((match) => match.id);
        const championshipAndSportKeys = [...new Set(matchRows.map((match) => `${match.championship_id}:${match.sport_id}`))];
        const championshipIds = [...new Set(matchRows.map((match) => match.championship_id))];
        const sportIds = [...new Set(matchRows.map((match) => match.sport_id))];

        const [championshipSportsResponse, matchSetsResponse] = await Promise.all([
          championshipAndSportKeys.length == 0
            ? Promise.resolve({ data: [], error: null })
            : supabase
                .from("championship_sports")
                .select("championship_id, sport_id, result_rule")
                .in("championship_id", championshipIds)
                .in("sport_id", sportIds),
          matchIds.length == 0
            ? Promise.resolve({ data: [], error: null })
            : supabase
                .from("match_sets")
                .select("match_id, set_number, home_points, away_points")
                .in("match_id", matchIds)
                .order("set_number", { ascending: true }),
        ]);

        if (championshipSportsResponse.error) {
          console.error("Erro ao carregar regras das modalidades:", championshipSportsResponse.error.message);
        }

        if (matchSetsResponse.error) {
          console.error("Erro ao carregar sets das partidas:", matchSetsResponse.error.message);
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

        setMatches(
          matchRows.map((match) => ({
            ...match,
            result_rule: resultRuleByChampionshipAndSportKey[`${match.championship_id}:${match.sport_id}`] ?? null,
            match_sets: matchSetsByMatchId[match.id] ?? [],
          })),
        );
      }
    } catch (error) {
      console.error("Erro inesperado ao carregar jogos:", error);
      setMatches([]);
    } finally {
      hasLoadedMatchesRef.current = true;
      setLoading(false);
    }
  }, [championshipId, seasonYear]);

  useEffect(() => {
    if (championshipId === null) {
      setMatches([]);
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

        return (firstMatch.queue_position ?? Number.MAX_SAFE_INTEGER) - (secondMatch.queue_position ?? Number.MAX_SAFE_INTEGER);
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

  return { matches, liveMatches, upcomingMatches, finishedMatches, loading, refetch: fetchMatches };
}
