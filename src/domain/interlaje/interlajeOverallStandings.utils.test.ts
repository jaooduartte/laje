import { describe, expect, it } from "vitest";
import {
  resolveInterlajeOverallPendingTieBreakTeamIds,
  resolveInterlajeOverallStandingAggregates,
} from "@/domain/interlaje/interlajeOverallStandings.utils";

describe("resolveInterlajeOverallStandingAggregates", () => {
  it("preserva a pontuação geral e mantém uma atlética sem pontos na classificação", () => {
    expect(
      resolveInterlajeOverallStandingAggregates([
        {
          team_id: "team-1",
          team_name: "Atlética sem pontos",
          placement_points: 0,
          confirmed_placement_points: 0,
          projected_placement_points: 0,
          opening_bonus_points: 0,
          walkover_count: 0,
          walkover_penalty_points: 0,
          overall_points: 0,
          confirmed_competitions_count: 0,
          has_projected_placement_points: false,
          has_pending_tie_break: false,
        },
        {
          team_id: "team-2",
          team_name: "Atlética com bônus",
          placement_points: 10,
          confirmed_placement_points: 10,
          projected_placement_points: 0,
          opening_bonus_points: 8,
          walkover_count: 2,
          walkover_penalty_points: 4,
          overall_points: 18,
          confirmed_competitions_count: 1,
          has_projected_placement_points: false,
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

describe("resolveInterlajeOverallPendingTieBreakTeamIds", () => {
  it("retorna somente as atléticas com desempate geral pendente", () => {
    const pendingTeamIds = resolveInterlajeOverallPendingTieBreakTeamIds([
      {
        team_id: "team-pending-1",
        team_name: "Atlética A",
        placement_points: 10,
        confirmed_placement_points: 10,
        projected_placement_points: 0,
        opening_bonus_points: 0,
        walkover_count: 0,
        walkover_penalty_points: 0,
        overall_points: 10,
        confirmed_competitions_count: 1,
        has_projected_placement_points: false,
        has_pending_tie_break: true,
      },
      {
        team_id: "team-resolved",
        team_name: "Atlética B",
        placement_points: 10,
        confirmed_placement_points: 10,
        projected_placement_points: 0,
        opening_bonus_points: 0,
        walkover_count: 0,
        walkover_penalty_points: 0,
        overall_points: 10,
        confirmed_competitions_count: 1,
        has_projected_placement_points: false,
        has_pending_tie_break: false,
      },
      {
        team_id: "team-pending-2",
        team_name: "Atlética C",
        placement_points: 10,
        confirmed_placement_points: 10,
        projected_placement_points: 0,
        opening_bonus_points: 0,
        walkover_count: 0,
        walkover_penalty_points: 0,
        overall_points: 10,
        confirmed_competitions_count: 1,
        has_projected_placement_points: false,
        has_pending_tie_break: true,
      },
    ]);

    expect(pendingTeamIds).toEqual(
      new Set(["team-pending-1", "team-pending-2"]),
    );
  });
});
