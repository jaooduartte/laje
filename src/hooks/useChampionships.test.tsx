import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChampionships } from "@/hooks/useChampionships";
import { ChampionshipCode, ChampionshipStatus } from "@/lib/enums";

const {
  rpcMock,
  selectChampionshipsMock,
  channelOnMock,
  subscribeMock,
  removeChannelMock,
} = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  selectChampionshipsMock: vi.fn(),
  channelOnMock: vi.fn(),
  subscribeMock: vi.fn(),
  removeChannelMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: rpcMock,
    from: (table: string) => {
      if (table == "championships") {
        return {
          select: selectChampionshipsMock,
        };
      }

      throw new Error(`Tabela não mockada: ${table}`);
    },
    channel: () => {
      const channel = {
        on: channelOnMock,
        subscribe: subscribeMock,
      };

      channelOnMock.mockImplementation(() => channel);

      return channel;
    },
    removeChannel: removeChannelMock,
  },
}));

function HookProbe() {
  const { championships, loading } = useChampionships();

  return (
    <div>
      <div data-testid="loading-state">{loading ? "loading" : "loaded"}</div>
      <div data-testid="championship-names">{championships.map((championship) => championship.name).join(" | ")}</div>
    </div>
  );
}

describe("useChampionships", () => {
  afterEach(() => {
    vi.clearAllMocks();
    channelOnMock.mockReturnThis();
    subscribeMock.mockReturnValue({ unsubscribe: vi.fn() });
  });

  it("carrega campeonatos sem disparar virada automática e mantém a ordem visual oficial", async () => {
    selectChampionshipsMock.mockResolvedValue({
      data: [
        {
          id: "interlaje",
          code: ChampionshipCode.INTERLAJE,
          name: "Interlaje",
          status: ChampionshipStatus.PLANNING,
          current_season_year: 2026,
          uses_divisions: true,
          default_location: null,
          created_at: "2026-07-01T00:00:00.000Z",
        },
        {
          id: "clv",
          code: ChampionshipCode.CLV,
          name: "Copa Laje de Verão",
          status: ChampionshipStatus.FINISHED,
          current_season_year: 2025,
          uses_divisions: false,
          default_location: null,
          created_at: "2026-07-01T00:00:00.000Z",
        },
        {
          id: "society",
          code: ChampionshipCode.SOCIETY,
          name: "Copa Laje Society",
          status: ChampionshipStatus.IN_PROGRESS,
          current_season_year: 2026,
          uses_divisions: true,
          default_location: null,
          created_at: "2026-07-01T00:00:00.000Z",
        },
      ],
      error: null,
    });

    render(<HookProbe />);

    await waitFor(() => {
      expect(screen.getByTestId("loading-state")).toHaveTextContent("loaded");
    });

    expect(rpcMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("championship-names")).toHaveTextContent(
      "Copa Laje de Verão | Copa Laje Society | Interlaje",
    );
  });
});
