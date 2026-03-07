import { useEffect, useState } from "react";
import type { ChampionshipBracketView } from "@/lib/types";
import { fetchChampionshipBracketView } from "@/domain/championship-brackets/championshipBracket.repository";

interface UseChampionshipBracketOptions {
  championshipId?: string | null;
}

const EMPTY_CHAMPIONSHIP_BRACKET_VIEW: ChampionshipBracketView = {
  edition: null,
  competitions: [],
};

export function useChampionshipBracket({ championshipId }: UseChampionshipBracketOptions = {}) {
  const [championshipBracketView, setChampionshipBracketView] = useState<ChampionshipBracketView>(
    EMPTY_CHAMPIONSHIP_BRACKET_VIEW,
  );
  const [loading, setLoading] = useState(true);

  const fetchBracket = async () => {
    if (!championshipId) {
      setChampionshipBracketView(EMPTY_CHAMPIONSHIP_BRACKET_VIEW);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await fetchChampionshipBracketView(championshipId);

    if (error || !data) {
      setChampionshipBracketView(EMPTY_CHAMPIONSHIP_BRACKET_VIEW);
      setLoading(false);
      return;
    }

    setChampionshipBracketView(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchBracket();
  }, [championshipId]);

  return {
    championshipBracketView,
    loading,
    refetch: fetchBracket,
  };
}
