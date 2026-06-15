import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminSports } from "@/components/admin/AdminSports";
import {
  ChampionshipCode,
  ChampionshipSportNaipeMode,
  ChampionshipSportResultRule,
  ChampionshipSportTieBreakerRule,
  ChampionshipStatus,
} from "@/lib/enums";
import type { Championship, ChampionshipSport, Sport } from "@/lib/types";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock("@/domain/championship-brackets/championshipBracket.repository", () => ({
  updateBracketLocationSportPriorities: vi.fn(),
}));

describe("AdminSports", () => {
  it("prioriza o valor salvo em sports para preencher a duração da modalidade", () => {
    const championship: Championship = {
      id: "championship-1",
      code: ChampionshipCode.SOCIETY,
      name: "Copa Laje Society",
      status: ChampionshipStatus.UPCOMING,
      current_season_year: 2026,
      uses_divisions: true,
      default_location: null,
      created_at: "2026-06-15T00:00:00.000Z",
    };

    const sports: Sport[] = [
      {
        id: "sport-1",
        name: "Futebol Society",
        default_match_duration_minutes: 40,
        created_at: "2026-06-15T00:00:00.000Z",
      },
    ];

    const championshipSports: ChampionshipSport[] = [
      {
        id: "championship-sport-1",
        championship_id: championship.id,
        sport_id: "sport-1",
        naipe_mode: ChampionshipSportNaipeMode.MASCULINO_FEMININO,
        result_rule: ChampionshipSportResultRule.POINTS,
        supports_cards: true,
        tie_breaker_rule: ChampionshipSportTieBreakerRule.FUTEBOL_SOCIETY,
        default_match_duration_minutes: 30,
        show_estimated_start_time_on_cards: true,
        points_win: 3,
        points_draw: 1,
        points_loss: 0,
        created_at: "2026-06-15T00:00:00.000Z",
        walkover_winner_points: 3,
        awards_include_knockout_phase: true,
        supports_individual_awards: true,
      },
    ];

    render(
      <AdminSports
        sports={sports}
        championshipSports={championshipSports}
        selectedChampionship={championship}
      />,
    );

    expect(screen.getByDisplayValue("40")).toBeInTheDocument();
  });
});
