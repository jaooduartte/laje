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
    window.history.replaceState({}, "", "/");
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

  it("consulta a classificação pública uma única vez ao entrar na página", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/campeonatos");

    const { unmount } = renderHook(() =>
      useInterlajeOverallStandings({
        championshipId: "championship-1",
        seasonYear: 2026,
      }),
    );

    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(60000);
    });

    expect(fetchInterlajeOverallStandingsMock).toHaveBeenCalledTimes(1);
    expect(channelMock.subscribe).not.toHaveBeenCalled();
    unmount();
    expect(removeChannelMock).not.toHaveBeenCalled();
  });

  it("expõe falha recuperável e permite tentar novamente", async () => {
    window.history.replaceState({}, "", "/campeonatos");
    fetchInterlajeOverallStandingsMock
      .mockResolvedValueOnce({ data: [], error: { message: "Falha" } })
      .mockResolvedValueOnce({ data: [{ team_id: "team-1" }], error: null });

    const { result } = renderHook(() =>
      useInterlajeOverallStandings({
        championshipId: "championship-1",
        seasonYear: 2026,
      }),
    );

    await waitFor(() => {
      expect(result.current.error).toBe(
        "Não foi possível carregar a classificação geral. Tente novamente.",
      );
    });

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.standings).toEqual([{ team_id: "team-1" }]);
  });
});
