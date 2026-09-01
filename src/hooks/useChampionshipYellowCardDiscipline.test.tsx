import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChampionshipYellowCardDiscipline } from "@/hooks/useChampionshipYellowCardDiscipline";

const { rpcMock, channelMock, removeChannelMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  channelMock: {
    on: vi.fn(),
    subscribe: vi.fn(),
  },
  removeChannelMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: rpcMock,
    channel: vi.fn(() => channelMock),
    removeChannel: removeChannelMock,
  },
}));

describe("useChampionshipYellowCardDiscipline", () => {
  beforeEach(() => {
    vi.useRealTimers();
    rpcMock.mockReset();
    channelMock.on.mockReset();
    channelMock.subscribe.mockReset();
    removeChannelMock.mockReset();
    rpcMock.mockResolvedValue({
      data: { season_year: 2026, athletes: [] },
      error: null,
    });
    channelMock.on.mockImplementation(() => channelMock);
    channelMock.subscribe.mockImplementation(() => channelMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("expõe uma falha da RPC para a interface", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "Falha ao consultar cartões" },
    });

    const { result } = renderHook(() =>
      useChampionshipYellowCardDiscipline({
        championshipId: "championship-1",
        seasonYear: 2026,
      }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.discipline).toBeNull();
    expect(result.current.error).toBe(
      "Não foi possível carregar os cartões. Tente novamente.",
    );
    expect(rpcMock).toHaveBeenCalledWith(
      "get_championship_yellow_card_discipline",
      {
        _championship_id: "championship-1",
        _season_year: 2026,
      },
    );
  });

  it("agrupa eventos realtime próximos em uma única atualização", async () => {
    vi.useFakeTimers();

    renderHook(() =>
      useChampionshipYellowCardDiscipline({
        championshipId: "championship-1",
        seasonYear: 2026,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    const listeners = channelMock.on.mock.calls.map(([, ,listener]) => listener);

    act(() => {
      listeners.forEach((listener) => listener());
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });

    expect(rpcMock).toHaveBeenCalledTimes(2);
  });
});
