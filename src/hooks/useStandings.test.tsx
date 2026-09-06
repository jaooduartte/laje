import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStandings } from "@/hooks/useStandings";
import { MatchNaipe } from "@/lib/enums";

const {
  fetchChampionshipEffectiveStandingsMock,
  channelCallbacks,
  channelMock,
  removeChannelMock,
} = vi.hoisted(() => ({
  fetchChampionshipEffectiveStandingsMock: vi.fn(),
  channelCallbacks: [] as Array<(payload: { new?: Record<string, unknown> | null; old?: Record<string, unknown> | null }) => void>,
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

vi.mock("@/domain/individual-events/championshipIndividualEvents.repository", () => ({
  fetchChampionshipEffectiveStandings: (...args: unknown[]) => fetchChampionshipEffectiveStandingsMock(...args),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: vi.fn(() => channelMock),
    removeChannel: removeChannelMock,
  },
}));

describe("useStandings", () => {
  beforeEach(() => {
    fetchChampionshipEffectiveStandingsMock.mockReset();
    channelMock.on.mockClear();
    channelMock.subscribe.mockClear();
    removeChannelMock.mockClear();
    channelCallbacks.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("mapeia a classificação efetiva com campos de coletivos e individuais", async () => {
    fetchChampionshipEffectiveStandingsMock.mockResolvedValue({
      data: [
        {
          id: "standing-1",
          championship_id: "championship-1",
          season_year: 2026,
          division: null,
          naipe: MatchNaipe.MASCULINO,
          sport_id: "sport-1",
          sport_name: "Handebol",
          team_id: "team-1",
          team_name: "Atlética A",
          team_city: "Joinville",
          played: 3,
          wins: 2,
          draws: 1,
          losses: 0,
          goals_for: 12,
          goals_against: 8,
          goal_diff: 4,
          points: 7,
          yellow_cards: 1,
          red_cards: 0,
          blue_cards: 2,
          two_minute_penalties: 5,
          updated_at: "2026-08-03T10:00:00.000Z",
          is_individual_sport: true,
          scored_events_count: 4,
          first_places: 1,
          second_places: 2,
          third_places: 1,
          fourth_places: 0,
          fifth_places: 0,
          sixth_places: 0,
          seventh_places: 0,
          eighth_places: 0,
          ninth_places: 0,
          tenth_places: 0,
          eleventh_places: 0,
          twelfth_places: 0,
          thirteenth_places: 0,
          fourteenth_places: 0,
          fifteenth_places: 0,
          sixteenth_places: 0,
          seventeenth_places: 0,
          eighteenth_places: 0,
          nineteenth_places: 0,
          twentieth_places: 0,
          relay_points_total: 44,
        },
      ],
      error: null,
    });

    const { result, unmount } = renderHook(() =>
      useStandings({
        championshipId: "championship-1",
        seasonYear: 2026,
        division: null,
        naipe: MatchNaipe.MASCULINO,
      }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.standings).toHaveLength(1);
    });

    expect(result.current.standings[0]).toMatchObject({
      championship_id: "championship-1",
      sport_id: "sport-1",
      team_id: "team-1",
      points: 7,
      blue_cards: 2,
      two_minute_penalties: 5,
      is_individual_sport: true,
      scored_events_count: 4,
      first_places: 1,
      relay_points_total: 44,
      teams: {
        name: "Atlética A",
      },
      sports: {
        name: "Handebol",
      },
    });
    expect(channelMock.on).toHaveBeenCalledTimes(2);
    expect(channelMock.subscribe).toHaveBeenCalledTimes(1);

    unmount();

    expect(removeChannelMock).toHaveBeenCalledWith(channelMock);
  });

  it("coalesce eventos relevantes em uma única consulta após um segundo", async () => {
    vi.useFakeTimers();
    fetchChampionshipEffectiveStandingsMock.mockResolvedValue({
      data: [],
      error: null,
    });

    renderHook(() =>
      useStandings({
        championshipId: "championship-1",
        seasonYear: 2026,
        division: null,
        naipe: MatchNaipe.MASCULINO,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchChampionshipEffectiveStandingsMock).toHaveBeenCalledTimes(1);

    act(() => {
      channelCallbacks[1]?.({
        new: {
          championship_id: "championship-1",
          season_year: 2026,
          division: null,
          naipe: MatchNaipe.MASCULINO,
        },
      });
      channelCallbacks[1]?.({
        new: {
          championship_id: "championship-1",
          season_year: 2026,
          division: null,
          naipe: MatchNaipe.MASCULINO,
        },
      });
      channelCallbacks[0]?.({
        new: {
          championship_id: "championship-1",
          season_year: 2026,
          division: null,
          naipe: MatchNaipe.MASCULINO,
        },
      });
    });

    expect(fetchChampionshipEffectiveStandingsMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchChampionshipEffectiveStandingsMock).toHaveBeenCalledTimes(2);
  });

  it("limpa o refetch agendado quando a assinatura é desmontada", async () => {
    vi.useFakeTimers();
    fetchChampionshipEffectiveStandingsMock.mockResolvedValue({ data: [], error: null });

    const { unmount } = renderHook(() =>
      useStandings({
        championshipId: "championship-1",
        seasonYear: 2026,
        division: null,
        naipe: MatchNaipe.MASCULINO,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchChampionshipEffectiveStandingsMock).toHaveBeenCalledTimes(1);

    act(() => {
      channelCallbacks[0]?.({
        new: {
          championship_id: "championship-1",
          season_year: 2026,
          division: null,
          naipe: MatchNaipe.MASCULINO,
        },
      });
    });

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(fetchChampionshipEffectiveStandingsMock).toHaveBeenCalledTimes(1);
    expect(removeChannelMock).toHaveBeenCalledWith(channelMock);
  });
});
