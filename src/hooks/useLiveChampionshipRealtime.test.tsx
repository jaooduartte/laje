import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveChampionshipRealtime } from "@/hooks/useLiveChampionshipRealtime";
import { MatchStatus } from "@/lib/enums";
import type { Match } from "@/lib/types";

const {
  channelCallbacks,
  channelMock,
  removeChannelMock,
  awsPollingRegistrations,
  listSportsCoreMatchesMock,
} = vi.hoisted(() => ({
  channelCallbacks: [] as Array<
    (payload: { new?: Record<string, unknown> | null; old?: Record<string, unknown> | null }) => void
  >,
  channelMock: {
    on: vi.fn(),
    subscribe: vi.fn(),
  },
  removeChannelMock: vi.fn(),
  awsPollingRegistrations: [] as Array<{
    intervalMs: number;
    onRefresh: () => void | Promise<void>;
  }>,
  listSportsCoreMatchesMock: vi.fn(),
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

vi.mock("@/hooks/useAwsRealtimePolling", () => ({
  useAwsRealtimePolling: vi.fn((options: {
    intervalMs: number;
    onRefresh: () => void | Promise<void>;
  }) => {
    awsPollingRegistrations.push(options);
  }),
}));

vi.mock("@/config/environment", () => ({
  isSupabaseBackendEnabled: vi.fn(() => true),
}));

vi.mock("@/integrations/laje-api/sports-core", () => ({
  isDedicatedSportsCoreEnabled: vi.fn(() => true),
  listSportsCoreMatches: listSportsCoreMatchesMock,
}));

describe("useLiveChampionshipRealtime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    channelCallbacks.length = 0;
    awsPollingRegistrations.length = 0;
    listSportsCoreMatchesMock.mockReset();
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

  it("consulta uma lista compacta de jogos ao vivo e só recarrega os dados afetados", async () => {
    const onLiveMatchesChange = vi.fn();
    const onUpcomingMatchesChange = vi.fn();
    const onBracketChange = vi.fn();
    const liveMatch = {
      id: "match-1",
      status: MatchStatus.LIVE,
      home_score: 0,
      away_score: 0,
    } as Match;
    const updatedLiveMatch = {
      ...liveMatch,
      home_score: 1,
    };
    const refresh = () =>
      awsPollingRegistrations.find((registration) => registration.intervalMs == 30_000)
        ?.onRefresh();

    listSportsCoreMatchesMock
      .mockResolvedValueOnce({ matches: [], total: 0 })
      .mockResolvedValueOnce({ matches: [liveMatch], total: 1 })
      .mockResolvedValueOnce({ matches: [updatedLiveMatch], total: 1 });

    renderHook(() =>
      useLiveChampionshipRealtime({
        championshipId: "championship-1",
        seasonYear: 2027,
        sportId: "sport-1",
        liveMatches: [],
        onLiveMatchesChange,
        onUpcomingMatchesChange,
        onBracketChange,
      }),
    );

    await act(async () => {
      await refresh();
    });

    expect(onLiveMatchesChange).not.toHaveBeenCalled();
    expect(onUpcomingMatchesChange).not.toHaveBeenCalled();
    expect(onBracketChange).not.toHaveBeenCalled();

    await act(async () => {
      await refresh();
    });

    expect(onLiveMatchesChange).toHaveBeenCalledTimes(1);
    expect(onUpcomingMatchesChange).toHaveBeenCalledTimes(1);
    expect(onBracketChange).toHaveBeenCalledTimes(1);

    await act(async () => {
      await refresh();
    });

    expect(onLiveMatchesChange).toHaveBeenCalledTimes(2);
    expect(onUpcomingMatchesChange).toHaveBeenCalledTimes(1);
    expect(onBracketChange).toHaveBeenCalledTimes(1);
    expect(listSportsCoreMatchesMock).toHaveBeenCalledWith({
      championshipId: "championship-1",
      seasonYear: 2027,
      sportId: "sport-1",
      statuses: [MatchStatus.LIVE],
    });
  });
});
