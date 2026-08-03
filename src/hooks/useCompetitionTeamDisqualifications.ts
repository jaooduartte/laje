import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CompetitionTeamDisqualification } from "@/lib/types";

interface UseCompetitionTeamDisqualificationsOptions {
  championshipId: string | null;
  seasonYear?: number | null;
  seasonYears?: number[];
}

export function useCompetitionTeamDisqualifications({
  championshipId,
  seasonYear,
  seasonYears,
}: UseCompetitionTeamDisqualificationsOptions) {
  const [disqualifications, setDisqualifications] = useState<CompetitionTeamDisqualification[]>([]);
  const [loading, setLoading] = useState(false);

  const resolvedSeasonYears = useMemo(() => {
    return Array.from(new Set(
      (seasonYears ?? [seasonYear ?? null]).filter((value): value is number => value != null && Number.isFinite(value)),
    ));
  }, [seasonYear, seasonYears]);

  const fetch = useCallback(async () => {
    if (!championshipId || resolvedSeasonYears.length == 0) {
      setDisqualifications([]);
      return;
    }

    setLoading(true);

    try {
      const responses = await Promise.all(
        resolvedSeasonYears.map((resolvedSeasonYear) => {
          return (supabase as unknown as {
            rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
          }).rpc("list_championship_competition_team_disqualifications", {
            _championship_id: championshipId,
            _season_year: resolvedSeasonYear,
          });
        }),
      );

      const hasError = responses.some((response) => response.error);
      if (hasError) {
        setDisqualifications([]);
        return;
      }

      setDisqualifications(
        responses.flatMap((response) => {
          return Array.isArray(response.data) ? (response.data as CompetitionTeamDisqualification[]) : [];
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [championshipId, resolvedSeasonYears]);

  useEffect(() => {
    void fetch();

    if (!championshipId || resolvedSeasonYears.length == 0) {
      return;
    }

    const channel = supabase
      .channel(`competition-team-disqualifications-${championshipId}-${resolvedSeasonYears.join("-")}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "championship_competition_team_disqualifications",
          filter: `championship_id=eq.${championshipId}`,
        },
        () => void fetch(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [championshipId, fetch, resolvedSeasonYears]);

  return {
    disqualifications,
    loading,
    refetch: fetch,
  };
}
