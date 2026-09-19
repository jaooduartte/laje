import { describe, expect, it } from "vitest";
import { toTeamStandingAggregate } from "@/domain/championship-brackets/championshipGroupStageStandings";
import type { ChampionshipGroupStageStanding } from "@/domain/championship-brackets/championshipBracket.types";

describe("toTeamStandingAggregate", () => {
  it("preserva as métricas de voleibol na classificação pública", () => {
    const aggregate = toTeamStandingAggregate({
      competition_id: "competition-1",
      sport_id: "sport-1",
      sport_name: "Voleibol",
      naipe: "MASCULINO",
      division: null,
      group_id: "group-1",
      group_number: 1,
      team_id: "team-1",
      team_name: "UEFA",
      played: 3,
      wins: 3,
      draws: 0,
      losses: 0,
      goals_for: 0,
      goals_against: 0,
      goal_diff: 0,
      points: 9,
      comparison_points: 9,
      yellow_cards: 0,
      red_cards: 0,
      blue_cards: 0,
      two_minute_penalties: 0,
      sets_for: 6,
      sets_against: 0,
      rally_points_for: 150,
      rally_points_against: 82,
      group_rank: 1,
      comparison_rank: 1,
      comparison_goals_for: 0,
      comparison_goals_against: 0,
      comparison_goal_diff: 0,
      comparison_yellow_cards: 0,
      comparison_red_cards: 0,
      comparison_blue_cards: 0,
      comparison_two_minute_penalties: 0,
      comparison_sets_for: 6,
      comparison_sets_against: 0,
      comparison_rally_points_for: 150,
      comparison_rally_points_against: 82,
      qualification_rank: 1,
      qualification_pool_rank: null,
    } as ChampionshipGroupStageStanding);

    expect(aggregate).toMatchObject({
      sets_for: 6,
      sets_against: 0,
      rally_points_for: 150,
      rally_points_against: 82,
    });
  });
});
