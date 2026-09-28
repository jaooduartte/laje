import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/environment", () => ({
  frontendEnvironment: {
    apiUrl: "https://api.example.com/api/v1",
  },
}));

import {
  listSportsCoreMatches,
  updateSportsCoreScoreboard,
} from "@/integrations/laje-api/sports-core";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const apiMatch = {
  id: "00000000-0000-0000-0000-000000000101",
  championshipId: "00000000-0000-0000-0000-000000000102",
  seasonYear: 2026,
  division: "DIVISAO_PRINCIPAL",
  naipe: "MASCULINO",
  supportsCards: true,
  resultRule: "POINTS",
  sportId: "00000000-0000-0000-0000-000000000103",
  homeTeamId: "00000000-0000-0000-0000-000000000104",
  awayTeamId: "00000000-0000-0000-0000-000000000105",
  location: "Ginásio",
  courtName: "Quadra 1",
  scheduledDate: "2026-09-28",
  queuePosition: 1,
  scheduledSlot: 1,
  scheduledStartTime: "2026-09-28T12:00:00.000Z",
  startTime: null,
  endTime: null,
  status: "SCHEDULED",
  homeScore: 0,
  awayScore: 0,
  homeYellowCards: 0,
  homeRedCards: 0,
  awayYellowCards: 0,
  awayRedCards: 0,
  createdAt: "2026-09-28T10:00:00.000Z",
  groupNumber: 1,
  sport: { id: "00000000-0000-0000-0000-000000000103", name: "Vôlei", code: "VOLEIBOL" },
  homeTeam: {
    id: "00000000-0000-0000-0000-000000000104",
    name: "Engênios",
    city: "Joinville",
    division: "DIVISAO_PRINCIPAL",
  },
  awayTeam: {
    id: "00000000-0000-0000-0000-000000000105",
    name: "Adversária",
    city: "Joinville",
    division: "DIVISAO_PRINCIPAL",
  },
  matchSets: [{ setNumber: 1, homePoints: 25, awayPoints: 20 }],
};

describe("laje-api sports core integration", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("usa a API dedicada como fonte de jogos e adapta o DTO para o modelo atual da UI", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [apiMatch], meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 } }),
    );

    const result = await listSportsCoreMatches({
      championshipId: apiMatch.championshipId,
      seasonYear: 2026,
      statuses: ["SCHEDULED"],
      groupNumber: 1,
      page: 1,
      pageSize: 25,
    });

    expect(result.total).toBe(1);
    expect(result.matches[0]).toMatchObject({
      id: apiMatch.id,
      championship_id: apiMatch.championshipId,
      sport_id: apiMatch.sportId,
      status: "SCHEDULED",
      group_number: 1,
      home_team: { name: "Engênios" },
      sports: { name: "Vôlei" },
      match_sets: [{ set_number: 1, home_points: 25, away_points: 20 }],
    });

    const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestUrl).toContain("/matches?");
    expect(requestUrl).toContain(`championshipId=${apiMatch.championshipId}`);
    expect(requestUrl).toContain("seasonYear=2026");
    expect(requestUrl).toContain("status=SCHEDULED");
    expect(requestUrl).toContain("groupNumber=1");
  });

  it("envia comandos de placar com bearer token para o backend", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { ...apiMatch, status: "LIVE", homeScore: 1 } }),
    );

    await updateSportsCoreScoreboard(apiMatch.id, { homeScore: 1 }, "access-token");

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.example.com/api/v1/matches/${apiMatch.id}/scoreboard`,
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
        headers: expect.any(Headers),
      }),
    );

    const requestOptions = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(requestOptions.headers).get("authorization")).toBe("Bearer access-token");
  });
});
