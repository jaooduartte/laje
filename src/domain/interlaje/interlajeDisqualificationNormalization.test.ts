import { describe, expect, it } from "vitest";
import { MatchNaipe } from "@/lib/enums";
import type { CompetitionTeamDisqualification } from "@/lib/types";
import {
  applyInterlajePlacementAdjustmentsToOverallStandings,
  normalizeInterlajeCompetitionStandingsAfterDisqualification,
  resolveInterlajeDisqualificationContexts,
  resolveInterlajePlacementAdjustments,
} from "@/domain/interlaje/interlajeDisqualificationNormalization";
import type {
  InterlajeCompetitionStanding,
  InterlajeOverallStanding,
  InterlajePositionPointSetting,
} from "@/domain/interlaje/interlajeOverallStandings.repository";

const positionPointSettings: InterlajePositionPointSetting[] = [
  { final_position: 1, points: 24 },
  { final_position: 2, points: 22 },
  { final_position: 3, points: 20 },
  { final_position: 4, points: 18 },
  { final_position: 5, points: 16 },
  { final_position: 6, points: 15 },
  { final_position: 7, points: 14 },
  { final_position: 8, points: 13 },
  { final_position: 9, points: 12 },
  { final_position: 10, points: 11 },
  { final_position: 11, points: 10 },
  { final_position: 12, points: 9 },
  { final_position: 13, points: 8 },
  { final_position: 14, points: 7 },
  { final_position: 15, points: 6 },
  { final_position: 16, points: 5 },
];

function buildCompetitionStanding(input: {
  teamId: string;
  teamName: string;
  finalPosition: number;
  placementPoints: number;
}): InterlajeCompetitionStanding {
  return {
    team_id: input.teamId,
    team_name: input.teamName,
    division: null,
    played: 2,
    wins: 1,
    draws: 0,
    losses: 1,
    goals_for: 10,
    goals_against: 10,
    goal_diff: 0,
    points: 3,
    yellow_cards: 0,
    red_cards: 0,
    blue_cards: 0,
    two_minute_penalties: 0,
    final_position: input.finalPosition,
    placement_points: input.placementPoints,
    placement_status: "CONFIRMED",
    placement_basis: "GROUP_STAGE",
    has_pending_tie_break: false,
    classification_policy: {
      placement_context: {
        final_position: input.finalPosition,
      },
    },
  };
}

function buildDisqualification(input: {
  id: string;
  teamId: string;
  sportId?: string;
  naipe?: MatchNaipe;
}): CompetitionTeamDisqualification {
  return {
    id: input.id,
    championship_id: "interlaje",
    season_year: 2026,
    sport_id: input.sportId ?? "handebol",
    naipe: input.naipe ?? MatchNaipe.FEMININO,
    division: null,
    team_id: input.teamId,
    created_at: "2026-10-02T12:00:00.000Z",
    created_by: null,
  };
}

function buildOverallStanding(
  teamId: string,
  teamName: string,
  overallPoints: number,
): InterlajeOverallStanding {
  return {
    team_id: teamId,
    team_name: teamName,
    placement_points: overallPoints,
    confirmed_placement_points: overallPoints,
    projected_placement_points: 0,
    opening_bonus_points: 0,
    walkover_count: 0,
    walkover_penalty_points: 0,
    overall_points: overallPoints,
    confirmed_competitions_count: 1,
    has_projected_placement_points: false,
    has_pending_tie_break: false,
  };
}

describe("Interlaje disqualification position normalization", () => {
  it("removes a disqualified team from the ordinal slots without hiding it", () => {
    const standings = [
      buildCompetitionStanding({
        teamId: "garrudos",
        teamName: "GARRUDOS",
        finalPosition: 12,
        placementPoints: 0,
      }),
      buildCompetitionStanding({
        teamId: "engenios",
        teamName: "ENGÊNIOS",
        finalPosition: 13,
        placementPoints: 8,
      }),
      buildCompetitionStanding({
        teamId: "raposas",
        teamName: "RAPOSAS",
        finalPosition: 14,
        placementPoints: 7,
      }),
      buildCompetitionStanding({
        teamId: "camaleao",
        teamName: "CAMALEÃO",
        finalPosition: 15,
        placementPoints: 6,
      }),
    ];

    const normalized = normalizeInterlajeCompetitionStandingsAfterDisqualification(
      standings,
      new Set(["garrudos"]),
      positionPointSettings,
    );

    expect(
      normalized.map(({ team_name, final_position, placement_points }) => ({
        team_name,
        final_position,
        placement_points,
      })),
    ).toEqual([
      { team_name: "ENGÊNIOS", final_position: 1, placement_points: 24 },
      { team_name: "RAPOSAS", final_position: 2, placement_points: 22 },
      { team_name: "CAMALEÃO", final_position: 3, placement_points: 20 },
      { team_name: "GARRUDOS", final_position: 4, placement_points: 0 },
    ]);
  });

  it("compacts positions relative to the complete competition standings", () => {
    const standings = Array.from({ length: 16 }, (_, index) =>
      buildCompetitionStanding({
        teamId: `team-${index + 1}`,
        teamName: `TEAM ${index + 1}`,
        finalPosition: index + 1,
        placementPoints: positionPointSettings[index]?.points ?? 0,
      }),
    );
    standings[13] = buildCompetitionStanding({
      teamId: "garrudos",
      teamName: "GARRUDOS",
      finalPosition: 14,
      placementPoints: 0,
    });
    standings[14] = buildCompetitionStanding({
      teamId: "afa",
      teamName: "AFA",
      finalPosition: 15,
      placementPoints: 6,
    });
    standings[15] = buildCompetitionStanding({
      teamId: "agua",
      teamName: "AGUA",
      finalPosition: 16,
      placementPoints: 5,
    });

    const normalized = normalizeInterlajeCompetitionStandingsAfterDisqualification(
      standings,
      new Set(["garrudos"]),
      positionPointSettings,
    );

    expect(normalized.find((row) => row.team_id == "afa")).toMatchObject({
      final_position: 14,
      placement_points: 7,
    });
    expect(normalized.find((row) => row.team_id == "agua")).toMatchObject({
      final_position: 15,
      placement_points: 6,
    });
    expect(normalized.find((row) => row.team_id == "garrudos")).toMatchObject({
      final_position: 16,
      placement_points: 0,
    });
  });

  it("keeps zero placement points for an unresolved team after compaction", () => {
    const unresolved = buildCompetitionStanding({
      teamId: "pending",
      teamName: "PENDING",
      finalPosition: 2,
      placementPoints: 0,
    });
    unresolved.placement_status = "PENDING_TIE_BREAK";

    const normalized = normalizeInterlajeCompetitionStandingsAfterDisqualification(
      [
        buildCompetitionStanding({
          teamId: "dq",
          teamName: "DQ",
          finalPosition: 1,
          placementPoints: 0,
        }),
        unresolved,
      ],
      new Set(["dq"]),
      positionPointSettings,
    );

    expect(normalized.find((row) => row.team_id == "pending")).toMatchObject({
      final_position: 1,
      placement_points: 0,
    });
  });

  it("applies only the placement-point delta to the overall table", () => {
    const original = [
      buildCompetitionStanding({
        teamId: "garrudos",
        teamName: "GARRUDOS",
        finalPosition: 14,
        placementPoints: 0,
      }),
      buildCompetitionStanding({
        teamId: "afa",
        teamName: "AFA",
        finalPosition: 15,
        placementPoints: 6,
      }),
      buildCompetitionStanding({
        teamId: "agua",
        teamName: "AGUA",
        finalPosition: 16,
        placementPoints: 5,
      }),
    ];
    const normalized = normalizeInterlajeCompetitionStandingsAfterDisqualification(
      original,
      new Set(["garrudos"]),
      positionPointSettings,
    );
    const adjustments = resolveInterlajePlacementAdjustments(original, normalized);
    const overall = applyInterlajePlacementAdjustmentsToOverallStandings(
      [
        buildOverallStanding("agua", "AGUA", 71),
        buildOverallStanding("afa", "AFA", 42),
        buildOverallStanding("garrudos", "GARRUDOS", 36),
      ],
      adjustments,
    );

    expect(overall.map(({ team_name, overall_points }) => [team_name, overall_points])).toEqual([
      ["AGUA", 72],
      ["AFA", 43],
      ["GARRUDOS", 36],
    ]);
  });

  it("deduplicates disqualification contexts", () => {
    expect(
      resolveInterlajeDisqualificationContexts([
        buildDisqualification({ id: "1", teamId: "a" }),
        buildDisqualification({ id: "2", teamId: "b" }),
        buildDisqualification({
          id: "3",
          teamId: "c",
          naipe: MatchNaipe.MASCULINO,
        }),
      ]),
    ).toHaveLength(2);
  });
});
