import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AdminDiscipline } from "@/components/admin/AdminDiscipline";
import {
  ChampionshipCode,
  ChampionshipSeasonDivisionFormat,
  ChampionshipSportNaipeMode,
  ChampionshipSportResultRule,
  ChampionshipSportTieBreakerRule,
  ChampionshipStatus,
  MatchNaipe,
} from "@/lib/enums";
import type { Championship, ChampionshipSport } from "@/lib/types";

vi.mock("@/components/YellowCardDisciplineTable", () => ({
  YellowCardDisciplineTable: () => <div>Lista disciplinar</div>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

vi.mock("@/hooks/useChampionshipYellowCardDiscipline", () => ({
  useChampionshipYellowCardDiscipline: () => ({
    loading: false,
    discipline: {
      season_year: 2026,
      athletes: [
        {
          player_id: "player-1",
          player_name: "Atleta 1",
          team_id: "team-1",
          team_name: "Atlética 1",
          sport_id: "futsal",
          sport_name: "Futsal",
          naipe: MatchNaipe.MASCULINO,
          division: null,
          yellow_cards_total: 1,
          yellow_cards_active: 1,
          red_cards_direct_total: 0,
          red_cards_derived_total: 0,
          is_suspended: false,
          suspension_causes: [],
          effective_reset_phase: "NONE",
          next_match: null,
          matches: [],
        },
      ],
    },
  }),
}));

vi.mock("@/hooks/useChampionshipSeasonRuntime", () => ({
  useChampionshipSeasonRuntime: () => ({ usesDivisions: false }),
}));

const championship: Championship = {
  id: "championship-1",
  code: ChampionshipCode.INTERLAJE,
  name: "Interlaje",
  status: ChampionshipStatus.IN_PROGRESS,
  current_season_year: 2026,
  uses_divisions: false,
  default_location: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

const championshipSport: ChampionshipSport = {
  id: "championship-sport-1",
  championship_id: championship.id,
  sport_id: "futsal",
  naipe_mode: ChampionshipSportNaipeMode.MASCULINO_FEMININO,
  result_rule: ChampionshipSportResultRule.POINTS,
  supports_cards: true,
  tie_breaker_rule: ChampionshipSportTieBreakerRule.STANDARD,
  default_match_duration_minutes: 40,
  show_estimated_start_time_on_cards: false,
  points_win: 3,
  points_draw: 1,
  points_loss: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  walkover_winner_points: null,
  walkover_winner_set_count: 0,
  awards_include_knockout_phase: false,
  supports_individual_awards: false,
};

describe("AdminDiscipline", () => {
  it("lista modalidades presentes na disciplina e omite divisão e naipes não configurados", () => {
    render(
      <AdminDiscipline
        championship={championship}
        sports={[]}
        championshipSports={[championshipSport]}
        availableSeasonYears={[2026]}
      />,
    );

    expect(screen.getByText("Futsal")).toBeInTheDocument();
    expect(screen.getByText("Masculino")).toBeInTheDocument();
    expect(screen.getByText("Feminino")).toBeInTheDocument();
    expect(screen.getByText("Todas as atléticas")).toBeInTheDocument();
    expect(screen.getByText("Ordem alfabética")).toBeInTheDocument();
    expect(screen.getByText("Mais cartões")).toBeInTheDocument();
    expect(screen.getByText("Suspensos primeiro")).toBeInTheDocument();
    expect(screen.queryByText("Misto")).not.toBeInTheDocument();
    expect(screen.queryByText("Todas as divisões")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Buscar atleta")).toHaveClass("sm:w-2/3");
  });
});
