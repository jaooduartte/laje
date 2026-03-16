import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EMPTY_CHAMPIONSHIP_BRACKET_VIEW } from "@/lib/championship";
import { fetchChampionshipBracketView } from "@/domain/championship-brackets/championshipBracket.repository";

interface UseChampionshipBracketOptions {
  championshipId?: string | null;
  seasonYear?: number | null;
}

export function useChampionshipBracket({ championshipId, seasonYear }: UseChampionshipBracketOptions = {}) {
  const [championshipBracketView, setChampionshipBracketView] = useState<ChampionshipBracketView>(
    EMPTY_CHAMPIONSHIP_BRACKET_VIEW,
  );
  const [loading, setLoading] = useState(true);
  const hasLoadedBracketRef = useRef(false);
  const scheduledRefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchBracket = useCallback(async (shouldShowLoading = false) => {
    if (!championshipId) {
      setChampionshipBracketView(EMPTY_CHAMPIONSHIP_BRACKET_VIEW);
      setLoading(false);
      hasLoadedBracketRef.current = false;
      return;
    }

    if (shouldShowLoading || !hasLoadedBracketRef.current) {
      setLoading(true);
    }

    const { data, error } = await fetchChampionshipBracketView(championshipId, seasonYear);

    if (error || !data) {
      setChampionshipBracketView(EMPTY_CHAMPIONSHIP_BRACKET_VIEW);
      hasLoadedBracketRef.current = true;
      setLoading(false);
      return;
    }

    setChampionshipBracketView(data);
    hasLoadedBracketRef.current = true;
    setLoading(false);
  }, [championshipId, seasonYear]);

  useEffect(() => {
    if (!championshipId) {
      setChampionshipBracketView(EMPTY_CHAMPIONSHIP_BRACKET_VIEW);
      setLoading(false);
      hasLoadedBracketRef.current = false;
      return;
    }

    fetchBracket(true);

    const channel = supabase
      .channel(`championship-bracket-realtime-${championshipId}-${seasonYear ?? "current"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
          filter: `championship_id=eq.${championshipId}`,
        },
        () => {
          if (scheduledRefetchTimeoutRef.current) {
            clearTimeout(scheduledRefetchTimeoutRef.current);
          }

          scheduledRefetchTimeoutRef.current = setTimeout(() => {
            fetchBracket();
          }, 120);
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_bracket_matches" }, () => {
        if (scheduledRefetchTimeoutRef.current) {
          clearTimeout(scheduledRefetchTimeoutRef.current);
        }

        scheduledRefetchTimeoutRef.current = setTimeout(() => {
          fetchBracket();
        }, 120);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_bracket_groups" }, () => {
        if (scheduledRefetchTimeoutRef.current) {
          clearTimeout(scheduledRefetchTimeoutRef.current);
        }

        scheduledRefetchTimeoutRef.current = setTimeout(() => {
          fetchBracket();
        }, 120);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_bracket_competitions" }, () => {
        if (scheduledRefetchTimeoutRef.current) {
          clearTimeout(scheduledRefetchTimeoutRef.current);
        }

        scheduledRefetchTimeoutRef.current = setTimeout(() => {
          fetchBracket();
        }, 120);
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "championship_bracket_editions",
          filter: `championship_id=eq.${championshipId}`,
        },
        () => {
          if (scheduledRefetchTimeoutRef.current) {
            clearTimeout(scheduledRefetchTimeoutRef.current);
          }

          scheduledRefetchTimeoutRef.current = setTimeout(() => {
            fetchBracket();
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
  }, [championshipId, fetchBracket, seasonYear]);

  useEffect(() => {
    return () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
        scheduledRefetchTimeoutRef.current = null;
      }
    };
  }, []);

  return {
    championshipBracketView,
    loading,
    refetch: fetchBracket,
  };
}
