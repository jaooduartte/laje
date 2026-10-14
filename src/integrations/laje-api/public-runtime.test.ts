import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/environment", () => ({
  frontendEnvironment: {
    backendProvider: "aws",
    apiUrl: "https://api.example.com/api/v1",
  },
  isAwsBackendEnabled: () => true,
  isSupabaseBackendEnabled: () => false,
}));

import { listAwsSports } from "@/integrations/laje-api/public-runtime";

const fetchMock = vi.fn();

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

describe("LAJE-89 AWS championship sport relations", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves the nested sport relation used by the edit-match modality selector", async () => {
    const championshipId = "c7718ca6-4447-4c20-a8ca-5781a34a3778";
    const sportId = "906e409b-9ca8-44a0-99f8-14bbbda2ef5a";

    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          sports: [
            {
              id: sportId,
              name: "Futsal",
              code: "FUTSAL",
              defaultMatchDurationMinutes: 40,
              createdAt: "2026-08-01T21:39:27Z",
            },
          ],
          championshipSports: [
            {
              id: "8d010ff6-afdc-4cde-84bc-24bfde43e1e0",
              championshipId,
              sportId,
              naipeMode: "MASCULINO_FEMININO",
              resultRule: "POINTS",
              supportsCards: true,
              tieBreakerRule: "GOAL_DIFFERENCE",
              defaultMatchDurationMinutes: 40,
              pointsWin: 3,
              pointsDraw: 1,
              pointsLoss: 0,
              createdAt: "2026-08-01T21:39:27Z",
            },
          ],
        },
      }),
    );

    const { sports, championshipSports } = await listAwsSports(championshipId);

    expect(sports).toHaveLength(1);
    expect(championshipSports).toHaveLength(1);
    expect(championshipSports[0].sport_id).toBe(sportId);
    expect(championshipSports[0].sports).toEqual(sports[0]);
    expect(championshipSports[0].sports?.name).toBe("Futsal");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      `/public-runtime/sports?championshipId=${championshipId}`,
    );
  });

  it("does not invent a sport relation when the backend omits a referenced sport", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          sports: [],
          championshipSports: [
            { id: "cs-1", championshipId: "champ-1", sportId: "missing-sport-1" },
          ],
        },
      }),
    );
    const result = await listAwsSports("champ-1");
    expect(result.championshipSports).toHaveLength(1);
    expect(result.championshipSports[0].sports).toBeUndefined();
  });
});
