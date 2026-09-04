import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInterlajeCompetitionStandings } from "@/hooks/useInterlajeCompetitionStandings";
import { MatchNaipe } from "@/lib/enums";

const {
  fetchInterlajeCompetitionStandingsMock,
  channelCallbacks,
  channelMock,
  removeChannelMock,
} = vi.hoisted(() => ({
  fetchInterlajeCompetitionStandingsMock: vi.fn(),
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
  fetchInterlajeCompetitionStandings: (...args: unknown[]) =>
    fetchInterlajeCompetitionStandingsMock(...args),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: vi.fn(() => channelMock),
    removeChannel: removeChannelMock,
  },
}));

describe("useInterlajeCompetitionStandings", () => {
  beforeEach(() => {
    fetchInterlajeCompetitionStandingsMock.mockReset();
    fetchInterlajeCompetitionStandingsMock.mockResolvedValue({ data: [], error: null });
    channelMock.on.mockClear();
    channelMock.subscribe.mockClear();
    removeChannelMock.mockClear();
    channelCallbacks.length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("atualiza a projeção quando uma partida ou o chaveamento muda", async () => {
    const { unmount } = renderHook(() =>
      useInterlajeCompetitionStandings({
        championshipId: "championship-1",
        seasonYear: 2026,
        sportId: "sport-1",
        naipe: MatchNaipe.MASCULINO,
        division: null,
      }),
    );

    await waitFor(() => {
      expect(fetchInterlajeCompetitionStandingsMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      channelCallbacks[2]?.({
        new: {
          championship_id: "championship-1",
          season_year: 2026,
        },
      });
    });

    await waitFor(() => {
      expect(fetchInterlajeCompetitionStandingsMock).toHaveBeenCalledTimes(2);
    });

    expect(channelMock.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({ table: "championship_bracket_matches" }),
      expect.any(Function),
    );
    expect(channelMock.on).toHaveBeenCalledTimes(6);
    unmount();
    expect(removeChannelMock).toHaveBeenCalledWith(channelMock);
  });
});
