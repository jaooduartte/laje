import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TeamStandingsTable } from "@/components/TeamStandingsTable";

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

describe("TeamStandingsTable - colunas agregadas", () => {
  it("mantém PTS como última coluna quando não há configuração de modalidade", () => {
    render(<TeamStandingsTable standings={standings} variant="full" />);

    const headers = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent);

    expect(headers).toEqual([
      "#",
      "Atlética",
      "J",
      "V",
      "E",
      "D",
      "SG",
      "GP",
      "GC",
      "PTS",
    ]);
  });
});
