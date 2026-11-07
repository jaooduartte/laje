import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMatches } from "@/hooks/useMatches";
import { MatchStatus } from "@/lib/enums";
import type { Match } from "@/lib/types";

const { getAwsMatchRuntimeContextMock, listSportsCoreMatchesMock } = vi.hoisted(() => ({
  getAwsMatchRuntimeContextMock: vi.fn(),
  listSportsCoreMatchesMock: vi.fn(),
}));

vi.mock("@/config/environment", () => ({
  isSupabaseBackendEnabled: vi.fn(() => false),
}));

vi.mock("@/hooks/useAwsRealtimePolling", () => ({
  useAwsRealtimePolling: vi.fn(),
}));

vi.mock("@/integrations/laje-api/public-runtime", () => ({
  getAwsMatchRuntimeContext: getAwsMatchRuntimeContextMock,
}));

vi.mock("@/integrations/laje-api/sports-core", () => ({
  isDedicatedSportsCoreEnabled: vi.fn(() => true),
  listSportsCoreMatches: listSportsCoreMatchesMock,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

describe("useMatches", () => {
  it("não permanece carregando ao desabilitar a consulta", async () => {
    const { result, rerender } = renderHook(
      ({ championshipId, enabled }: { championshipId: string | null; enabled: boolean }) =>
        useMatches({
          championshipId,
          enabled,
          includeRealtime: false,
        }),
      {
        initialProps: {
          championshipId: null,
          enabled: true,
        },
      },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    rerender({
      championshipId: "championship-1",
      enabled: false,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  beforeEach(() => {
    const match = {
      id: "match-1",
      championship_id: "championship-1",
      season_year: 2027,
      sport_id: "sport-1",
      status: MatchStatus.LIVE,
      home_score: 0,
      away_score: 0,
      match_sets: [],
    } as Match;

    listSportsCoreMatchesMock.mockResolvedValue({ matches: [match], total: 1 });
    getAwsMatchRuntimeContextMock.mockResolvedValue({
      championshipSports: [],
      bracketEdition: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("preserva o contexto do campeonato em uma atualização que não o solicita", async () => {
    const { result } = renderHook(() =>
      useMatches({
        championshipId: "championship-1",
        seasonYear: 2027,
        statuses: [MatchStatus.LIVE],
        sortMode: "LIVE",
        includeRealtime: false,
      }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(getAwsMatchRuntimeContextMock).toHaveBeenCalledTimes(1);
    expect(listSportsCoreMatchesMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await result.current.refetch({ refreshOperationalContext: false });
    });

    expect(getAwsMatchRuntimeContextMock).toHaveBeenCalledTimes(1);
    expect(listSportsCoreMatchesMock).toHaveBeenCalledTimes(3);
  });
});
