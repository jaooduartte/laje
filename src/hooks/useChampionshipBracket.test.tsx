import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChampionshipBracket } from "@/hooks/useChampionshipBracket";
import { EMPTY_CHAMPIONSHIP_BRACKET_VIEW } from "@/lib/championship";

const {
  fetchChampionshipBracketViewMock,
  realtimeChannelOnMock,
  realtimeChannelSubscribeMock,
} = vi.hoisted(() => ({
  fetchChampionshipBracketViewMock: vi.fn(),
  realtimeChannelOnMock: vi.fn(),
  realtimeChannelSubscribeMock: vi.fn(),
}));

vi.mock("@/domain/championship-brackets/championshipBracket.repository", () => ({
  fetchChampionshipBracketView: fetchChampionshipBracketViewMock,
}));

vi.mock("@/integrations/supabase/client", () => {
  const channel = {
    on: (...arguments_: unknown[]) => {
      realtimeChannelOnMock(...arguments_);
      return channel;
    },
    subscribe: (...arguments_: unknown[]) => {
      realtimeChannelSubscribeMock(...arguments_);
      return channel;
    },
  };

  return {
    supabase: {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },
  };
});

describe("useChampionshipBracket", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("assina apenas mudanças associadas ao campeonato atual", async () => {
    fetchChampionshipBracketViewMock.mockResolvedValue({
      data: EMPTY_CHAMPIONSHIP_BRACKET_VIEW,
      error: null,
    });

    const { unmount } = renderHook(() =>
      useChampionshipBracket({
        championshipId: "championship-1",
        seasonYear: 2026,
      }),
    );

    await waitFor(() => {
      expect(fetchChampionshipBracketViewMock).toHaveBeenCalledTimes(1);
    });

    expect(
      realtimeChannelOnMock.mock.calls.map(
        ([, subscription]) =>
          (subscription as { table: string }).table,
      ),
    ).toEqual(["matches", "championship_bracket_editions"]);

    unmount();
  });

  it("coalesce atualizações enquanto a consulta do chaveamento está pendente", async () => {
    let resolveFirstRequest: ((value: unknown) => void) | null = null;
    let resolveSecondRequest: ((value: unknown) => void) | null = null;

    fetchChampionshipBracketViewMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstRequest = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecondRequest = resolve;
          }),
      );

    const { result, unmount } = renderHook(() =>
      useChampionshipBracket({
        championshipId: "championship-1",
        seasonYear: 2026,
      }),
    );

    await waitFor(() => {
      expect(fetchChampionshipBracketViewMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      void result.current.refetch();
      void result.current.refetch();
    });

    expect(fetchChampionshipBracketViewMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirstRequest?.({
        data: EMPTY_CHAMPIONSHIP_BRACKET_VIEW,
        error: null,
      });
    });

    await waitFor(() => {
      expect(fetchChampionshipBracketViewMock).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      resolveSecondRequest?.({
        data: EMPTY_CHAMPIONSHIP_BRACKET_VIEW,
        error: null,
      });
    });

    unmount();
  });

  it("compartilha a mesma consulta entre consumidores do mesmo chaveamento", async () => {
    let resolveRequest: ((value: unknown) => void) | null = null;

    fetchChampionshipBracketViewMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const firstHook = renderHook(() =>
      useChampionshipBracket({
        championshipId: "championship-1",
        seasonYear: 2026,
      }),
    );
    const secondHook = renderHook(() =>
      useChampionshipBracket({
        championshipId: "championship-1",
        seasonYear: 2026,
      }),
    );

    await waitFor(() => {
      expect(fetchChampionshipBracketViewMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      resolveRequest?.({
        data: EMPTY_CHAMPIONSHIP_BRACKET_VIEW,
        error: null,
      });
    });

    firstHook.unmount();
    secondHook.unmount();
  });
});
