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
  const [registeredTeamIds, setRegisteredTeamIds] = useState<string[]>([]);
  const [walkoverPenaltyPoints, setWalkoverPenaltyPoints] = useState<number | null>(null);
  const [walkoverCounts, setWalkoverCounts] = useState<
    Array<{ teamId: string; walkoverCount: number }>
  >([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    const response = await fetchInterlajeOpeningCeremonyBonus({
      championshipId,
      seasonYear,
    });
    setSettings(response.settings);
    setEligibleTeamIds(response.eligibleTeamIds);
    setRegisteredTeamIds(response.registeredTeamIds);
    setWalkoverPenaltyPoints(response.walkoverPenaltyPoints);
    setWalkoverCounts(response.walkoverCounts);
    setLoading(false);
    return response;
  }, [championshipId, seasonYear]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return {
    settings,
    eligibleTeamIds,
    registeredTeamIds,
    walkoverPenaltyPoints,
    walkoverCounts,
    loading,
    refetch,
  };
}
