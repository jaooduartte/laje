import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Standing } from "@/lib/types";
import type { MatchNaipe, TeamDivision } from "@/lib/enums";
import { fetchChampionshipEffectiveStandings } from "@/domain/individual-events/championshipIndividualEvents.repository";

interface UseStandingsOptions {
  championshipId?: string | null;
  seasonYear?: number | null;
  division?: TeamDivision | null;
  naipe?: MatchNaipe;
}

export function useStandings({ championshipId, seasonYear, division, naipe }: UseStandingsOptions = {}) {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStandings = useCallback(async () => {
    if (championshipId === null) {
      setStandings([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await fetchChampionshipEffectiveStandings({
        championshipId,
        seasonYear,
        division,
        naipe,
      });

      if (error) {
        console.error("Erro ao carregar classificação:", error.message);
        setStandings([]);
        return;
      }

      if (data) {
        setStandings(((data as Array<Record<string, unknown>> | null) ?? []).map((standingRow) => ({
          id: String(standingRow.id),
          championship_id: String(standingRow.championship_id),
          season_year: Number(standingRow.season_year),
          division: (standingRow.division as TeamDivision | null) ?? null,
          naipe: standingRow.naipe as MatchNaipe,
          sport_id: String(standingRow.sport_id),
          team_id: String(standingRow.team_id),
          played: Number(standingRow.played ?? 0),
          wins: Number(standingRow.wins ?? 0),
          draws: Number(standingRow.draws ?? 0),
          losses: Number(standingRow.losses ?? 0),
          goals_for: Number(standingRow.goals_for ?? 0),
          goals_against: Number(standingRow.goals_against ?? 0),
          goal_diff: Number(standingRow.goal_diff ?? 0),
          points: Number(standingRow.points ?? 0),
          yellow_cards: Number(standingRow.yellow_cards ?? 0),
          red_cards: Number(standingRow.red_cards ?? 0),
          blue_cards: Number(standingRow.blue_cards ?? 0),
          two_minute_penalties: Number(standingRow.two_minute_penalties ?? 0),
          updated_at: String(standingRow.updated_at ?? new Date(0).toISOString()),
          is_individual_sport: Boolean(standingRow.is_individual_sport),
          scored_events_count: Number(standingRow.scored_events_count ?? 0),
          first_places: Number(standingRow.first_places ?? 0),
          second_places: Number(standingRow.second_places ?? 0),
          third_places: Number(standingRow.third_places ?? 0),
          fourth_places: Number(standingRow.fourth_places ?? 0),
          fifth_places: Number(standingRow.fifth_places ?? 0),
          sixth_places: Number(standingRow.sixth_places ?? 0),
          seventh_places: Number(standingRow.seventh_places ?? 0),
          eighth_places: Number(standingRow.eighth_places ?? 0),
          ninth_places: Number(standingRow.ninth_places ?? 0),
          tenth_places: Number(standingRow.tenth_places ?? 0),
          eleventh_places: Number(standingRow.eleventh_places ?? 0),
          twelfth_places: Number(standingRow.twelfth_places ?? 0),
          thirteenth_places: Number(standingRow.thirteenth_places ?? 0),
          fourteenth_places: Number(standingRow.fourteenth_places ?? 0),
          fifteenth_places: Number(standingRow.fifteenth_places ?? 0),
          sixteenth_places: Number(standingRow.sixteenth_places ?? 0),
          seventeenth_places: Number(standingRow.seventeenth_places ?? 0),
          eighteenth_places: Number(standingRow.eighteenth_places ?? 0),
          nineteenth_places: Number(standingRow.nineteenth_places ?? 0),
          twentieth_places: Number(standingRow.twentieth_places ?? 0),
          relay_points_total: Number(standingRow.relay_points_total ?? 0),
          teams: {
            id: String(standingRow.team_id),
            name: String(standingRow.team_name ?? ""),
            city: String(standingRow.team_city ?? ""),
            division: (standingRow.division as TeamDivision | null) ?? null,
            created_at: "",
          },
          sports: {
            id: String(standingRow.sport_id),
            name: String(standingRow.sport_name ?? ""),
            created_at: "",
          },
        })) as Standing[]);
      }
    } catch (error) {
      console.error("Erro inesperado ao carregar classificação:", error);
      setStandings([]);
    } finally {
      setLoading(false);
    }
  }, [championshipId, division, naipe, seasonYear]);

  useEffect(() => {
    if (championshipId === null) {
      setStandings([]);
      setLoading(false);
      return;
    }

    fetchStandings();

    const channel = supabase
      .channel(`standings-realtime-${championshipId ?? "all"}-${seasonYear ?? "all"}-${division ?? "any"}-${naipe ?? "all"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "standings",
          filter: championshipId ? `championship_id=eq.${championshipId}` : undefined,
        },
        (payload) => {
          const relevantRows = [payload.new, payload.old].filter((row) => row && typeof row == "object");
          const shouldRefetch = relevantRows.length == 0 || relevantRows.some((row) => {
            if (championshipId && row.championship_id != championshipId) {
              return false;
            }

            if (typeof seasonYear == "number" && row.season_year != seasonYear) {
              return false;
            }

            if (division === null && row.division != null) {
              return false;
            }

            if (division !== undefined && division !== null && row.division != division) {
              return false;
            }

            if (naipe && row.naipe != naipe) {
              return false;
            }

            return true;
          });

          if (shouldRefetch) {
            fetchStandings();
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "championship_individual_team_standings",
          filter: championshipId ? `championship_id=eq.${championshipId}` : undefined,
        },
        (payload) => {
          const relevantRows = [payload.new, payload.old].filter((row) => row && typeof row == "object");
          const shouldRefetch = relevantRows.length == 0 || relevantRows.some((row) => {
            if (championshipId && row.championship_id != championshipId) {
              return false;
            }

            if (typeof seasonYear == "number" && row.season_year != seasonYear) {
              return false;
            }

            if (division === null && row.division != null) {
              return false;
            }

            if (division !== undefined && division !== null && row.division != division) {
              return false;
            }

            if (naipe && row.naipe != naipe) {
              return false;
            }

            return true;
          });

          if (shouldRefetch) {
            fetchStandings();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [championshipId, division, fetchStandings, naipe, seasonYear]);

  return { standings, loading, refetch: fetchStandings };
}
