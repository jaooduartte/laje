import { useCallback, useEffect, useState } from "react";
import {
  fetchInterlajePositionPointSettings,
  type InterlajePositionPointSetting,
} from "@/domain/interlaje/interlajeOverallStandings.repository";

export function useInterlajePositionPointSettings({
  championshipId,
  seasonYear,
}: {
  championshipId?: string | null;
  seasonYear?: number | null;
}) {
  const [settings, setSettings] = useState<InterlajePositionPointSetting[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    const response = await fetchInterlajePositionPointSettings(
      championshipId,
      seasonYear,
    );
    setSettings(response.data);
    setLoading(false);
    return response;
  }, [championshipId, seasonYear]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { settings, loading, refetch };
}
