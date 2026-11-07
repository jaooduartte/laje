import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useChampionshipBracketHistory } from "@/hooks/useChampionshipBracketHistory";

vi.mock("@/hooks/useAwsRealtimePolling", () => ({
  useAwsRealtimePolling: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { channel: vi.fn() },
}));

vi.mock("@/domain/championship-brackets/championshipBracket.repository", () => ({
  fetchChampionshipBracketView: vi.fn(),
}));

vi.mock("@/config/environment", () => ({
  isSupabaseBackendEnabled: () => false,
}));

describe("useChampionshipBracketHistory", () => {
  it("não entra em ciclo de renderização quando recebe um array vazio recriado pelo chamador", async () => {
    let renderCount = 0;
    const { result, rerender } = renderHook(() => {
      renderCount += 1;

      return useChampionshipBracketHistory({
        championshipId: "championship-1",
        seasonYears: [],
        enabled: false,
        realtimeEnabled: false,
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender();

    expect(result.current.championshipBracketSeasonViews).toEqual([]);
    expect(renderCount).toBeLessThanOrEqual(3);
  });
});
