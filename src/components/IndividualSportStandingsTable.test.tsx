import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IndividualSportStandingsTable } from "@/components/IndividualSportStandingsTable";

describe("IndividualSportStandingsTable", () => {
  it("mantém a atlética desclassificada em último com o selo", () => {
    render(
      <IndividualSportStandingsTable
        standings={[
          {
            team_id: "team-1",
            team_name: "Atlética desclassificada",
            division: null,
            points: 0,
            scored_events_count: 0,
            first_places: 0,
            second_places: 0,
            third_places: 0,
            fourth_places: 0,
            fifth_places: 0,
            relay_points_total: 0,
          },
          {
            team_id: "team-2",
            team_name: "Atlética com pontos",
            division: null,
            points: 12,
            scored_events_count: 2,
            first_places: 1,
            second_places: 1,
            third_places: 0,
            fourth_places: 0,
            fifth_places: 0,
            relay_points_total: 0,
          },
        ]}
        disqualifiedTeamKeys={new Set(["team-1:WITHOUT_DIVISION"])}
      />,
    );

    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Atlética com pontos");
    expect(rows[2]).toHaveTextContent("Atlética desclassificada");
    expect(screen.getByText("Desclassificada")).toBeInTheDocument();
  });
});
