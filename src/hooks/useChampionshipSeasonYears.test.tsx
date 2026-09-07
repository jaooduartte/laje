import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChampionshipSeasonYears } from "@/hooks/useChampionshipSeasonYears";

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

function HookProbe() {
  const { seasonYears, loading } = useChampionshipSeasonYears({
    championshipId: "championship-1",
    currentSeasonYear: 2026,
  });

  return (
    <div>
      <div data-testid="loading-state">{loading ? "loading" : "loaded"}</div>
      <div data-testid="season-years">{seasonYears.join(",")}</div>
    </div>
  );
}

describe("useChampionshipSeasonYears", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("carrega os anos disponíveis pela RPC consolidada, sem duplicar e em ordem decrescente", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { season_year: 2025 },
        { season_year: 2026 },
        { season_year: 2024 },
        { season_year: 2025 },
      ],
      error: null,
    });

    render(<HookProbe />);

    await waitFor(() => {
      expect(screen.getByTestId("loading-state")).toHaveTextContent("loaded");
    });

    expect(screen.getByTestId("season-years")).toHaveTextContent("2026,2025,2024");
    expect(rpcMock).toHaveBeenCalledWith(
      "get_championship_available_season_years",
      { _championship_id: "championship-1" },
    );
  });

  it("mantém a temporada atual sem iniciar consultas de fallback quando a RPC falha", async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error("database timeout") });

    render(<HookProbe />);

    await waitFor(() => {
      expect(screen.getByTestId("loading-state")).toHaveTextContent("loaded");
    });

    expect(screen.getByTestId("season-years")).toHaveTextContent("2026");
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});
