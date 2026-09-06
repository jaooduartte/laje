import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInterlajeOverallStandings } from "@/hooks/useInterlajeOverallStandings";

const {
  fetchInterlajeOverallStandingsMock,
  channelCallbacks,
  channelMock,
  removeChannelMock,
} = vi.hoisted(() => ({
  fetchInterlajeOverallStandingsMock: vi.fn(),
  channelCallbacks: [] as Array<
    (payload: { new?: Record<string, unknown> | null; old?: Record<string, unknown> | null }) => void
  >,
  channelMock: {
    on: vi.fn(),
    subscribe: vi.fn(),
  },
  removeChannelMock: vi.fn(),
}));

channelMock.on.mockImplementation(
  (
    _event: string,
    _config: Record<string, unknown>,
    callback: (payload: { new?: Record<string, unknown> | null; old?: Record<string, unknown> | null }) => void,
  ) => {
    channelCallbacks.push(callback);
    return channelMock;
  },
);
channelMock.subscribe.mockImplementation(() => channelMock);

vi.mock("@/domain/interlaje/interlajeOverallStandings.repository", () => ({
  fetchInterlajeOverallStandings: (...args: unknown[]) =>
    fetchInterlajeOverallStandingsMock(...args),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: vi.fn(() => channelMock),
    removeChannel: removeChannelMock,
  },
}));

describe("useInterlajeOverallStandings", () => {
  beforeEach(() => {
    fetchInterlajeOverallStandingsMock.mockReset();
    fetchInterlajeOverallStandingsMock.mockResolvedValue({ data: [], error: null });
    channelMock.on.mockClear();
    channelMock.subscribe.mockClear();
    removeChannelMock.mockClear();
    channelCallbacks.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("refaz a consulta quando a classificação coletiva da temporada muda", async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() =>
      useInterlajeOverallStandings({
        championshipId: "championship-1",
        seasonYear: 2026,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchInterlajeOverallStandingsMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      channelCallbacks[0]?.({
        new: {
          championship_id: "championship-1",
          season_year: 2026,
        },
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(fetchInterlajeOverallStandingsMock).toHaveBeenCalledTimes(2);

    expect(channelMock.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({ table: "matches" }),
      expect.any(Function),
    );
    expect(channelMock.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({ table: "championship_bracket_matches" }),
      expect.any(Function),
    );
    expect(channelMock.on).toHaveBeenCalledTimes(9);
    unmount();
    expect(removeChannelMock).toHaveBeenCalledWith(channelMock);
  });
});
