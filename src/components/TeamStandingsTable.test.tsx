import { render } from "@testing-library/react";
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
});
