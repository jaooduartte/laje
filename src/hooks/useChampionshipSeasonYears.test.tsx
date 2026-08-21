import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChampionshipSeasonYears } from "@/hooks/useChampionshipSeasonYears";

const matchesEqMock = vi.fn();
const standingsEqMock = vi.fn();
const bracketEditionsEqMock = vi.fn();
const individualEventsEqMock = vi.fn();
const individualSessionsEqMock = vi.fn();
const individualTeamStandingsEqMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table == "matches") {
        return {
          select: () => ({
            eq: matchesEqMock,
          }),
        };
      }

      if (table == "standings") {
        return {
          select: () => ({
            eq: standingsEqMock,
          }),
        };
      }

      if (table == "championship_bracket_editions") {
        return {
          select: () => ({
            eq: bracketEditionsEqMock,
          }),
        };
      }

      if (table == "championship_individual_events") {
        return { select: () => ({ eq: individualEventsEqMock }) };
      }

      if (table == "championship_individual_sessions") {
        return { select: () => ({ eq: individualSessionsEqMock }) };
      }

      if (table == "championship_individual_team_standings") {
        return { select: () => ({ eq: individualTeamStandingsEqMock }) };
      }

      throw new Error(`Tabela não mockada: ${table}`);
    },
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

  it("combina anos reais de jogos, classificação, chave e provas individuais, sem duplicar e em ordem decrescente", async () => {
    matchesEqMock.mockResolvedValue({
      data: [{ season_year: 2025 }, { season_year: 2026 }, { season_year: null }],
      error: null,
    });
    standingsEqMock.mockResolvedValue({
      data: [{ season_year: 2024 }, { season_year: 2025 }],
      error: null,
    });
    bracketEditionsEqMock.mockResolvedValue({
      data: [{ season_year: 2023 }, { season_year: 2026 }],
      error: null,
    });
    individualEventsEqMock.mockResolvedValue({
      data: [{ season_year: 2022 }],
      error: null,
    });
    individualSessionsEqMock.mockResolvedValue({
      data: [{ season_year: 2021 }],
      error: null,
    });
    individualTeamStandingsEqMock.mockResolvedValue({
      data: [{ season_year: 2020 }, { season_year: 2025 }],
      error: null,
    });

    render(<HookProbe />);

    await waitFor(() => {
      expect(screen.getByTestId("loading-state")).toHaveTextContent("loaded");
    });

    expect(screen.getByTestId("season-years")).toHaveTextContent("2026,2025,2024,2023,2022,2021,2020");
  });
});
