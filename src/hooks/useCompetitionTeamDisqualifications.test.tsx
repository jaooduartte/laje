import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompetitionTeamDisqualifications } from "@/hooks/useCompetitionTeamDisqualifications";

const {
  rpcMock,
  channelMock,
  removeChannelMock,
} = vi.hoisted(() => ({
  rpcMock: vi.fn(function rpc(
    this: { rest?: object },
    _functionName: string,
    _payload: Record<string, unknown>,
  ) {
    if (!this?.rest) {
      throw new TypeError("missing rest context");
    }

    return Promise.resolve({
      data: [
        {
          championship_id: "championship-1",
          season_year: 2026,
          sport_id: "sport-1",
          naipe: "MASCULINO",
          division: null,
          team_id: "team-1",
        },
      ],
      error: null,
    });
  }),
  channelMock: {
    on: vi.fn(),
    subscribe: vi.fn(),
  },
  removeChannelMock: vi.fn(),
}));

channelMock.on.mockImplementation(() => channelMock);
channelMock.subscribe.mockImplementation(() => channelMock);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rest: {},
    rpc: rpcMock,
    channel: vi.fn(() => channelMock),
    removeChannel: removeChannelMock,
  },
}));

describe("useCompetitionTeamDisqualifications", () => {
  beforeEach(() => {
    rpcMock.mockClear();
    channelMock.on.mockClear();
    channelMock.subscribe.mockClear();
    removeChannelMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("consulta a RPC sem perder o contexto interno do client", async () => {
    const { result } = renderHook(() =>
      useCompetitionTeamDisqualifications({
        championshipId: "championship-1",
        seasonYears: [2026],
      }),
    );

    await waitFor(() => {
      expect(result.current.disqualifications).toHaveLength(1);
    });

    expect(rpcMock).toHaveBeenCalledWith("list_championship_competition_team_disqualifications", {
      _championship_id: "championship-1",
      _season_year: 2026,
    });
    expect(channelMock.on).toHaveBeenCalled();
    expect(channelMock.subscribe).toHaveBeenCalled();
  });

  it("não refaz a consulta quando a lista de anos mantém o mesmo conteúdo", async () => {
    const { rerender } = renderHook(
      ({ seasonYears }: { seasonYears: number[] }) =>
        useCompetitionTeamDisqualifications({
          championshipId: "championship-1",
          seasonYears,
        }),
      { initialProps: { seasonYears: [2026] } },
    );

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledTimes(1);
    });

    rerender({ seasonYears: [2026] });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(removeChannelMock).not.toHaveBeenCalled();
  });
});
