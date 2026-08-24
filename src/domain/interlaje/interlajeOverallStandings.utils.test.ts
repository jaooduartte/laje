import { describe, expect, it } from "vitest";
import { resolveInterlajeOverallStandingAggregates } from "@/domain/interlaje/interlajeOverallStandings.utils";

describe("resolveInterlajeOverallStandingAggregates", () => {
  it("preserva a pontuação geral e mantém uma atlética sem pontos na classificação", () => {
    expect(
      resolveInterlajeOverallStandingAggregates([
        {
          team_id: "team-1",
          team_name: "Atlética sem pontos",
          placement_points: 0,
          opening_bonus_points: 0,
          overall_points: 0,
          confirmed_competitions_count: 0,
          has_pending_tie_break: false,
        },
        {
          team_id: "team-2",
          team_name: "Atlética com bônus",
          placement_points: 10,
          opening_bonus_points: 8,
          overall_points: 18,
          confirmed_competitions_count: 1,
          has_pending_tie_break: false,
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        team_id: "team-1",
        points: 0,
        played: 0,
      }),
      expect.objectContaining({
        team_id: "team-2",
        points: 18,
        played: 0,
      }),
    ]);
  });
});
