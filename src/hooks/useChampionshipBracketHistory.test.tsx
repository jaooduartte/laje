import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChampionshipBracketHistory } from "@/hooks/useChampionshipBracketHistory";

const {
  channelMock,
  channelOnMock,
  fetchChampionshipBracketViewMock,
  removeChannelMock,
  supabaseEnabledMock,
} = vi.hoisted(() => ({
  channelMock: {
    on: vi.fn(),
    subscribe: vi.fn(),
  },
  channelOnMock: vi.fn(),
  fetchChampionshipBracketViewMock: vi.fn(),
  removeChannelMock: vi.fn(),
  supabaseEnabledMock: vi.fn(),
}));

vi.mock("@/hooks/useAwsRealtimePolling", () => ({
  useAwsRealtimePolling: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: vi.fn(() => channelMock),
    removeChannel: (...arguments_: unknown[]) => removeChannelMock(...arguments_),
  },
}));

vi.mock("@/domain/championship-brackets/championshipBracket.repository", () => ({
  fetchChampionshipBracketView: (...arguments_: unknown[]) =>
    fetchChampionshipBracketViewMock(...arguments_),
}));

vi.mock("@/config/environment", () => ({
  isSupabaseBackendEnabled: () => supabaseEnabledMock(),
}));

describe("useChampionshipBracketHistory", () => {
  beforeEach(() => {
    supabaseEnabledMock.mockReset().mockReturnValue(false);
    fetchChampionshipBracketViewMock.mockReset();
    removeChannelMock.mockReset().mockResolvedValue("ok");
    channelOnMock.mockReset();
    channelMock.on.mockReset().mockImplementation((...arguments_: unknown[]) => {
      channelOnMock(...arguments_);
      return channelMock;
    });
    channelMock.subscribe.mockReset().mockReturnValue(channelMock);
  });

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

  it("remove o canal realtime ao desmontar", async () => {
    supabaseEnabledMock.mockReturnValue(true);
    fetchChampionshipBracketViewMock.mockResolvedValue({ data: null, error: null });

    const { unmount } = renderHook(() =>
      useChampionshipBracketHistory({
        championshipId: "championship-1",
        seasonYears: [2026],
      }),
    );

    await waitFor(() => {
      expect(fetchChampionshipBracketViewMock).toHaveBeenCalledWith("championship-1", 2026);
    });

    unmount();
    expect(removeChannelMock).toHaveBeenCalledWith(channelMock);
  });
});
