import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TeamStandingsTable } from "@/components/TeamStandingsTable";
import { TooltipProvider } from "@/components/ui/tooltip";

const standings = [
  {
    team_id: "team-1",
    team_name: "TIME 1",
    team_city: "Joinville",
    division: null,
    played: 2,
    wins: 2,
    draws: 0,
    losses: 0,
    goals_for: 4,
    goals_against: 1,
    goal_diff: 3,
    points: 6,
    yellow_cards: 0,
    red_cards: 0,
  },
];

describe("TeamStandingsTable draw winner icon", () => {
  it("exibe ícone de sorteio na variante full", () => {
    const { container } = render(
      <TooltipProvider>
        <TeamStandingsTable standings={standings} variant="full" drawWinners={new Set(["team-1"])} />
      </TooltipProvider>,
    );

    expect(container.querySelector(".lucide-shuffle")).not.toBeNull();
  });

  it("não exibe ícone de sorteio na variante public", () => {
    const { container } = render(
      <TooltipProvider>
        <TeamStandingsTable standings={standings} variant="public" drawWinners={new Set(["team-1"])} />
      </TooltipProvider>,
    );

    expect(container.querySelector(".lucide-shuffle")).toBeNull();
  });

  it("exibe badge e força o time desclassificado para o fim", () => {
    render(
      <TooltipProvider>
        <TeamStandingsTable
          standings={[
            ...standings,
            {
              team_id: "team-2",
              team_name: "TIME 2",
              team_city: "Joinville",
              division: null,
              played: 2,
              wins: 0,
              draws: 0,
              losses: 2,
              goals_for: 1,
              goals_against: 4,
              goal_diff: -3,
              points: 0,
              yellow_cards: 0,
              red_cards: 0,
            },
          ]}
          variant="full"
          disqualifiedTeamKeys={new Set(["team-1:WITHOUT_DIVISION"])}
        />
      </TooltipProvider>,
    );

    const rows = screen.getAllByRole("row");
    expect(rows[2]).toHaveTextContent("TIME 1");
    expect(screen.getByText("Desclassificada")).toBeInTheDocument();
  });

  it("sinaliza desempates gerais pendentes sem alterar a ordem recebida", () => {
    render(
      <TooltipProvider>
        <TeamStandingsTable
          variant="public"
          standings={[
            { ...standings[0], team_id: "team-2", team_name: "TIME 2", points: 12 },
            { ...standings[0], team_id: "team-1", team_name: "TIME 1", points: 12 },
            { ...standings[0], team_id: "team-3", team_name: "TIME 3", points: 8 },
          ]}
          pendingTieBreakTeamIds={new Set(["team-2", "team-1"])}
        />
      </TooltipProvider>,
    );

    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("TIME 2");
    expect(rows[2]).toHaveTextContent("TIME 1");
    expect(rows[3]).toHaveTextContent("TIME 3");
    expect(screen.getAllByText("Desempate geral pendente")).toHaveLength(2);
  });

  it("não sinaliza desempate quando não há pendência", () => {
    render(
      <TooltipProvider>
        <TeamStandingsTable standings={standings} variant="public" />
      </TooltipProvider>,
    );

    expect(screen.queryByText("Desempate geral pendente")).not.toBeInTheDocument();
  });
});
