import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePendingTieBreaks } from "@/hooks/usePendingTieBreaks";

const {
  fetchChampionshipBracketPendingTieBreaksMock,
  channelMock,
  channelOnMock,
  removeChannelMock,
} = vi.hoisted(() => ({
  fetchChampionshipBracketPendingTieBreaksMock: vi.fn(),
  channelMock: {
    on: vi.fn(),
    subscribe: vi.fn(),
  },
  channelOnMock: vi.fn(),
  removeChannelMock: vi.fn(),
}));

vi.mock("@/domain/championship-brackets/championshipBracket.repository", () => ({
  fetchChampionshipBracketPendingTieBreaks:
    fetchChampionshipBracketPendingTieBreaksMock,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: vi.fn(() => channelMock),
    removeChannel: removeChannelMock,
  },
}));

describe("usePendingTieBreaks", () => {
  beforeEach(() => {
    vi.useRealTimers();
    fetchChampionshipBracketPendingTieBreaksMock.mockReset();
    channelMock.on.mockReset();
    channelMock.subscribe.mockReset();
    channelOnMock.mockReset();
    removeChannelMock.mockReset();
    fetchChampionshipBracketPendingTieBreaksMock.mockResolvedValue({
      data: [],
      error: null,
    });
    channelMock.on.mockImplementation((...arguments_: unknown[]) => {
      channelOnMock(...arguments_);
      return channelMock;
    });
    channelMock.subscribe.mockImplementation(() => channelMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("limita as assinaturas à edição atual", async () => {
    const { unmount } = renderHook(() =>
      usePendingTieBreaks({
        championshipId: "championship-scope",
        bracketEditionId: "edition-scope",
      }),
    );

    await waitFor(() => {
      expect(fetchChampionshipBracketPendingTieBreaksMock).toHaveBeenCalledWith(
        "championship-scope",
        "edition-scope",
      );
    });

    expect(
      channelOnMock.mock.calls.map(
        ([, subscription]) =>
          (subscription as { table: string; filter?: string }).table,
      ),
    ).toEqual([
      "matches",
      "championship_bracket_editions",
      "championship_bracket_competitions",
      "championship_bracket_matches",
      "championship_bracket_tie_break_resolutions",
    ]);

    expect(channelOnMock.mock.calls[2]?.[1]).toMatchObject({
      filter: "bracket_edition_id=eq.edition-scope",
    });

    unmount();
    expect(removeChannelMock).toHaveBeenCalledWith(channelMock);
  });

  it("coalesce eventos realtime por um segundo", async () => {
    vi.useFakeTimers();

    renderHook(() =>
      usePendingTieBreaks({
        championshipId: "championship-debounce",
        bracketEditionId: "edition-debounce",
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    const listeners = channelOnMock.mock.calls.map(([, ,listener]) => listener);

    act(() => {
      listeners.forEach((listener) => listener());
    });

    expect(fetchChampionshipBracketPendingTieBreaksMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
    });

    expect(fetchChampionshipBracketPendingTieBreaksMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(fetchChampionshipBracketPendingTieBreaksMock).toHaveBeenCalledTimes(2);
  });

  it("não consulta quando a edição não está disponível", async () => {
    renderHook(() =>
      usePendingTieBreaks({
        championshipId: "championship-disabled",
        bracketEditionId: null,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchChampionshipBracketPendingTieBreaksMock).not.toHaveBeenCalled();
    expect(channelMock.subscribe).not.toHaveBeenCalled();
  });
});
