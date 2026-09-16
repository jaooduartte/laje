import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TeamStandingsTable } from "@/components/TeamStandingsTable";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ModalidadeConfig } from "@/lib/modalidadeConfig";

const modalidadeConfig: ModalidadeConfig = {
  sport_code: "BASQUETEBOL",
  naipe: null,
  display_columns: ["J", "V", "E", "D", "PTS"],
  tie_breaker_cascade: [],
  uses_points_average: true,
  uses_cards: true,
  knockout_pairing_mode: "LINEAR",
  legacy_tie_breaker_rule: "POINTS_AVERAGE",
};

describe("TeamStandingsTable - pontos da modalidade do INTERLAJE", () => {
  it("mantém PTS da disputa sem destaque e destaca os pontos transferidos para a geral", () => {
    render(
      <TooltipProvider>
        <TeamStandingsTable
          variant="public"
          modalidadeConfig={modalidadeConfig}
          standings={[
            {
              team_id: "team-1",
              team_name: "AAASF",
              division: null,
              played: 4,
              wins: 4,
              draws: 0,
              losses: 0,
              goals_for: 121,
              goals_against: 17,
              goal_diff: 104,
              points: 12,
              placement_points: 24,
              final_position: 1,
              yellow_cards: 0,
              red_cards: 0,
            },
          ]}
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole("columnheader", { name: "PTS" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "PTS MOD." })).toBeInTheDocument();

    const regularPoints = screen.getByText("12");
    const modalityPoints = screen.getByText("24");

    expect(regularPoints).toHaveClass("font-bold");
    expect(regularPoints).not.toHaveClass("text-primary");
    expect(modalityPoints).toHaveClass("font-bold");
    expect(modalityPoints).toHaveClass("text-primary");
  });

  it("não adiciona a coluna fora da classificação que contém placement_points", () => {
    render(
      <TooltipProvider>
        <TeamStandingsTable
          variant="public"
          modalidadeConfig={modalidadeConfig}
          standings={[
            {
              team_id: "team-1",
              team_name: "AAASF",
              division: null,
              played: 3,
              wins: 3,
              draws: 0,
              losses: 0,
              goals_for: 55,
              goals_against: 26,
              goal_diff: 29,
              points: 9,
              yellow_cards: 0,
              red_cards: 0,
            },
          ]}
        />
      </TooltipProvider>,
    );

    expect(screen.queryByRole("columnheader", { name: "PTS MOD." })).not.toBeInTheDocument();
    expect(screen.getByText("9")).toHaveClass("text-primary");
  });
});
