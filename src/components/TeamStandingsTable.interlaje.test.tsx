import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TeamStandingsTable } from "@/components/TeamStandingsTable";
import { TooltipProvider } from "@/components/ui/tooltip";

const standingBase = {
  team_city: "Joinville",
  division: null,
  played: 3,
  wins: 2,
  draws: 0,
  losses: 1,
  goals_for: 10,
  goals_against: 5,
  goal_diff: 5,
  points: 6,
  yellow_cards: 0,
  red_cards: 0,
};

describe("TeamStandingsTable - classificação final do INTERLAJE", () => {
  it("prioriza final_position mesmo quando a ordem por pontos da fase de grupos seria diferente", () => {
    render(
      <TooltipProvider>
        <TeamStandingsTable
          standings={[
            {
              ...standingBase,
              team_id: "third",
              team_name: "TERCEIRO",
              points: 12,
              final_position: 3,
            },
            {
              ...standingBase,
              team_id: "champion",
              team_name: "CAMPEÃO",
              points: 3,
              final_position: 1,
            },
            {
              ...standingBase,
              team_id: "runner-up",
              team_name: "VICE",
              points: 9,
              final_position: 2,
            },
          ]}
          variant="full"
        />
      </TooltipProvider>,
    );

    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("CAMPEÃO");
    expect(rows[2]).toHaveTextContent("VICE");
    expect(rows[3]).toHaveTextContent("TERCEIRO");
  });

  it("mostra etapa, eliminador e projeção na classificação geral da modalidade", () => {
    render(
      <TooltipProvider>
        <TeamStandingsTable
          standings={[
            {
              ...standingBase,
              team_id: "qf-loser",
              team_name: "QUARTAS",
              final_position: 5,
              classification_policy: {
                placement_context: {
                  stage: "QUARTERFINAL",
                  status: "PROJECTED",
                  reason: "QUARTERFINAL_LOSS_TO_CHAMPION",
                  is_knockout_participant: true,
                  eliminated_by_team_name: "CAMPEÃO",
                  eliminated_by_final_position: 1,
                },
              },
            },
          ]}
          variant="full"
        />
      </TooltipProvider>,
    );

    expect(screen.getAllByText("Quartas").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Eliminada por CAMPEÃO (campeã)").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Colocação projetada").length).toBeGreaterThan(0);
  });
});
