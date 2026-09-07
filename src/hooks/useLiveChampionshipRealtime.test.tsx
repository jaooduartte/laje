import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveChampionshipRealtime } from "@/hooks/useLiveChampionshipRealtime";
import { MatchStatus } from "@/lib/enums";

const {
  channelCallbacks,
  channelMock,
  removeChannelMock,
} = vi.hoisted(() => ({
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

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: vi.fn(() => channelMock),
    removeChannel: removeChannelMock,
  },
}));

describe("useLiveChampionshipRealtime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    channelCallbacks.length = 0;
    channelMock.on.mockClear();
    channelMock.subscribe.mockClear();
    removeChannelMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("coalesce alterações de placar em uma única leitura da partida ao vivo", async () => {
    const onLiveMatchesChange = vi.fn();
    const onUpcomingMatchesChange = vi.fn();
    const onBracketChange = vi.fn();

    renderHook(() =>
      useLiveChampionshipRealtime({
        championshipId: "championship-1",
        seasonYear: 2026,
        onLiveMatchesChange,
        onUpcomingMatchesChange,
        onBracketChange,
      }),
    );

    expect(channelMock.on).toHaveBeenCalledTimes(1);
    expect(channelMock.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({
        filter: "championship_id=eq.championship-1",
        table: "matches",
      }),
      expect.any(Function),
    );

    await act(async () => {
      channelCallbacks[0]?.({
        new: {
          championship_id: "championship-1",
          season_year: 2026,
          status: MatchStatus.LIVE,
        },
        old: {
          championship_id: "championship-1",
          season_year: 2026,
          status: MatchStatus.LIVE,
        },
      });
      channelCallbacks[0]?.({
        new: {
          championship_id: "championship-1",
          season_year: 2026,
          status: MatchStatus.LIVE,
        },
      });
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(onLiveMatchesChange).toHaveBeenCalledTimes(1);
    expect(onUpcomingMatchesChange).not.toHaveBeenCalled();
    expect(onBracketChange).not.toHaveBeenCalled();
  });

  it("atualiza agenda e chaveamento ao encerrar uma partida", async () => {
    const onLiveMatchesChange = vi.fn();
    const onUpcomingMatchesChange = vi.fn();
    const onBracketChange = vi.fn();

    renderHook(() =>
      useLiveChampionshipRealtime({
        championshipId: "championship-1",
        seasonYear: 2026,
        onLiveMatchesChange,
        onUpcomingMatchesChange,
        onBracketChange,
      }),
    );

    await act(async () => {
      channelCallbacks[0]?.({
        new: {
          championship_id: "championship-1",
          season_year: 2026,
          status: MatchStatus.FINISHED,
        },
        old: {
          championship_id: "championship-1",
          season_year: 2026,
          status: MatchStatus.LIVE,
        },
      });
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(onLiveMatchesChange).toHaveBeenCalledTimes(1);
    expect(onUpcomingMatchesChange).toHaveBeenCalledTimes(1);
    expect(onBracketChange).toHaveBeenCalledTimes(1);
  });

  it("ignora outra temporada e encerra o canal no desmontar", async () => {
    const onLiveMatchesChange = vi.fn();
    const onUpcomingMatchesChange = vi.fn();
    const onBracketChange = vi.fn();
    const { unmount } = renderHook(() =>
      useLiveChampionshipRealtime({
        championshipId: "championship-1",
        seasonYear: 2026,
        onLiveMatchesChange,
        onUpcomingMatchesChange,
        onBracketChange,
      }),
    );

    await act(async () => {
      channelCallbacks[0]?.({
        new: {
          championship_id: "championship-1",
          season_year: 2025,
          status: MatchStatus.LIVE,
        },
      });
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(onLiveMatchesChange).not.toHaveBeenCalled();
    unmount();
    expect(removeChannelMock).toHaveBeenCalledWith(channelMock);
  });
});
