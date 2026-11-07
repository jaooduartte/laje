import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  supabaseRpc: vi.fn(),
  awsEnabled: true,
}));

vi.mock("@/config/environment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/config/environment")>()),
  isAwsBackendEnabled: () => mocks.awsEnabled,
}));

vi.mock("@/integrations/laje-api/client", () => ({
  lajeApiRequest: mocks.apiRequest,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.supabaseRpc },
}));

import { generateChampionshipKnockout } from "@/domain/championship-brackets/championshipBracket.repository";

describe("generateChampionshipKnockout", () => {
  beforeEach(() => {
    mocks.awsEnabled = true;
    mocks.apiRequest.mockReset();
    mocks.supabaseRpc.mockReset();
  });

  it("gera o mata-mata pela API no ambiente AWS", async () => {
    mocks.apiRequest.mockResolvedValueOnce({ data: "edition-1" });

    const result = await generateChampionshipKnockout("championship-1", "edition-1");

    expect(result).toEqual({ data: "edition-1", error: null });
    expect(mocks.apiRequest).toHaveBeenCalledWith("/bracket-operations/knockout-generate-edition", {
      method: "POST",
      body: JSON.stringify({ championshipId: "championship-1", editionId: "edition-1" }),
    });
    expect(mocks.supabaseRpc).not.toHaveBeenCalled();
  });

  it("mantém a chamada Supabase quando esse backend está ativo", async () => {
    mocks.awsEnabled = false;
    mocks.supabaseRpc.mockResolvedValueOnce({ data: "edition-1", error: null });

    const result = await generateChampionshipKnockout("championship-1", "edition-1");

    expect(result.error).toBeNull();
    expect(mocks.supabaseRpc).toHaveBeenCalledWith("generate_championship_knockout", {
      _championship_id: "championship-1",
      _bracket_edition_id: "edition-1",
    });
    expect(mocks.apiRequest).not.toHaveBeenCalled();
  });
});
