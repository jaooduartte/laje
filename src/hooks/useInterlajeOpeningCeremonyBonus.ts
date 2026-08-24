import { useCallback, useEffect, useState } from "react";
import {
  fetchInterlajeOpeningCeremonyBonus,
  type InterlajeOpeningCeremonyBonusSettings,
} from "@/domain/interlaje/interlajeOpeningCeremonyBonus.repository";

export function useInterlajeOpeningCeremonyBonus({
  championshipId,
  seasonYear,
}: {
  championshipId?: string | null;
  seasonYear?: number | null;
}) {
  const [settings, setSettings] =
    useState<InterlajeOpeningCeremonyBonusSettings | null>(null);
  const [eligibleTeamIds, setEligibleTeamIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    const response = await fetchInterlajeOpeningCeremonyBonus({
      championshipId,
      seasonYear,
    });
    setSettings(response.settings);
    setEligibleTeamIds(response.eligibleTeamIds);
    setLoading(false);
    return response;
  }, [championshipId, seasonYear]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return {
    settings,
    eligibleTeamIds,
    loading,
    refetch,
  };
}
