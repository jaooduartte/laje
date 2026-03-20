import { describe, expect, it } from "vitest";
import { MatchNaipe, MatchStatus, TeamDivision } from "@/lib/enums";
import {
  resolveEstimatedStartTimeByMatchId,
  resolveMatchRepresentationByMatchId,
  type MatchEstimatedStartTimeBracketEdition,
  type MatchEstimatedStartTimeChampionshipSport,
} from "@/lib/championship";
import type { Match } from "@/lib/types";

function buildMatch(overrides: Partial<Match> & Pick<Match, "id">): Match {
  return {
    id: overrides.id,
    championship_id: overrides.championship_id ?? "championship-1",
    season_year: overrides.season_year ?? 2026,
    division: overrides.division === undefined ? TeamDivision.DIVISAO_PRINCIPAL : overrides.division,
    naipe: overrides.naipe ?? MatchNaipe.MASCULINO,
    supports_cards: overrides.supports_cards ?? false,
    result_rule: overrides.result_rule ?? null,
    sport_id: overrides.sport_id ?? "sport-1",
    home_team_id: overrides.home_team_id ?? `${overrides.id}-home-team-id`,
    away_team_id: overrides.away_team_id ?? `${overrides.id}-away-team-id`,
    location: overrides.location ?? "Quadra Central",
    court_name: overrides.court_name ?? null,
    scheduled_date: overrides.scheduled_date ?? "2026-03-20",
    queue_position: overrides.queue_position ?? 1,
    current_set_home_score: overrides.current_set_home_score ?? null,
    current_set_away_score: overrides.current_set_away_score ?? null,
    resolved_tie_breaker_rule: overrides.resolved_tie_breaker_rule ?? null,
    resolved_tie_break_winner_team_id: overrides.resolved_tie_break_winner_team_id ?? null,
    start_time: overrides.start_time ?? null,
    end_time: overrides.end_time ?? null,
    status: overrides.status ?? MatchStatus.SCHEDULED,
    home_score: overrides.home_score ?? 0,
    home_yellow_cards: overrides.home_yellow_cards ?? 0,
    home_red_cards: overrides.home_red_cards ?? 0,
    away_score: overrides.away_score ?? 0,
    away_yellow_cards: overrides.away_yellow_cards ?? 0,
    away_red_cards: overrides.away_red_cards ?? 0,
    created_at: overrides.created_at ?? "2026-03-20T08:00:00.000Z",
    group_number: overrides.group_number ?? null,
    championships: overrides.championships,
    sports: overrides.sports,
    home_team: overrides.home_team,
    away_team: overrides.away_team,
    match_sets: overrides.match_sets ?? [],
  };
}

function buildEstimatedStartTimeChampionshipSport(
  overrides: Partial<MatchEstimatedStartTimeChampionshipSport>,
): MatchEstimatedStartTimeChampionshipSport {
  return {
    championship_id: overrides.championship_id ?? "championship-1",
    sport_id: overrides.sport_id ?? "sport-beach-soccer",
    default_match_duration_minutes:
      overrides.default_match_duration_minutes ?? 30,
    show_estimated_start_time_on_cards:
      overrides.show_estimated_start_time_on_cards ?? true,
  };
}

function buildEstimatedStartTimeBracketEdition(
  overrides: Partial<MatchEstimatedStartTimeBracketEdition>,
): MatchEstimatedStartTimeBracketEdition {
  return {
    championship_id: overrides.championship_id ?? "championship-1",
    season_year: overrides.season_year ?? 2026,
    payload_snapshot: overrides.payload_snapshot ?? {
      schedule_days: [
        {
          date: "2026-03-20",
          start_time: "08:00",
          end_time: "20:00",
          break_start_time: null,
          break_end_time: null,
        },
      ],
    },
    schedule_days: overrides.schedule_days,
  };
}

describe("resolveMatchRepresentationByMatchId", () => {
  it("calculates the operational representation within the same scope and queue order", () => {
    const firstMatch = buildMatch({
      id: "match-1",
      queue_position: 1,
      home_team: { id: "team-1", name: "Alpha", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-2", name: "Beta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const secondMatch = buildMatch({
      id: "match-2",
      queue_position: 2,
      status: MatchStatus.LIVE,
      home_team: { id: "team-3", name: "Gamma", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-4", name: "Delta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const thirdMatch = buildMatch({
      id: "match-3",
      queue_position: 3,
      status: MatchStatus.FINISHED,
      home_team: { id: "team-5", name: "Epsilon", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-6", name: "Zeta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });

    const representationByMatchId = resolveMatchRepresentationByMatchId([thirdMatch, secondMatch, firstMatch]);

    expect(representationByMatchId).toEqual({
      "match-1": "CO",
      "match-2": "Alpha x Beta",
      "match-3": "Gamma x Delta",
    });
  });

  it("keeps divisions isolated, including matches without division", () => {
    const principalDivisionMatch = buildMatch({
      id: "principal-1",
      division: TeamDivision.DIVISAO_PRINCIPAL,
      queue_position: 1,
      home_team: { id: "team-1", name: "Alpha", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-2", name: "Beta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const accessDivisionMatch = buildMatch({
      id: "access-1",
      division: TeamDivision.DIVISAO_ACESSO,
      queue_position: 1,
      home_team: { id: "team-3", name: "Gamma", city: "Joinville", division: TeamDivision.DIVISAO_ACESSO, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-4", name: "Delta", city: "Joinville", division: TeamDivision.DIVISAO_ACESSO, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const withoutDivisionMatch = buildMatch({
      id: "without-1",
      division: null,
      queue_position: 1,
      home_team: { id: "team-5", name: "Epsilon", city: "Joinville", division: null, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-6", name: "Zeta", city: "Joinville", division: null, created_at: "2026-03-01T00:00:00.000Z" },
    });

    const representationByMatchId = resolveMatchRepresentationByMatchId([
      principalDivisionMatch,
      accessDivisionMatch,
      withoutDivisionMatch,
    ]);

    expect(representationByMatchId["principal-1"]).toBe("CO");
    expect(representationByMatchId["access-1"]).toBe("CO");
    expect(representationByMatchId["without-1"]).toBe("CO");
  });

  it("uses created_at and id as tie-breakers and falls back to A definir when the previous teams are undefined", () => {
    const firstMatch = buildMatch({
      id: "match-a",
      queue_position: 1,
      created_at: "2026-03-20T08:00:00.000Z",
      home_team: { id: "team-1", name: "Alpha", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-2", name: "Beta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const secondMatch = buildMatch({
      id: "match-b",
      queue_position: 1,
      created_at: "2026-03-20T08:05:00.000Z",
      home_team: { id: "team-3", name: "Gamma", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-4", name: "", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const thirdMatch = buildMatch({
      id: "match-c",
      queue_position: 1,
      created_at: "2026-03-20T08:05:00.000Z",
      home_team: { id: "team-5", name: "Delta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-6", name: "Epsilon", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });

    const representationByMatchId = resolveMatchRepresentationByMatchId([thirdMatch, secondMatch, firstMatch]);

    expect(representationByMatchId["match-a"]).toBe("CO");
    expect(representationByMatchId["match-b"]).toBe("Alpha x Beta");
    expect(representationByMatchId["match-c"]).toBe("A definir");
  });
});

describe("resolveEstimatedStartTimeByMatchId", () => {
  it("starts slot 1 at day start and advances each slot by match duration", () => {
    const firstMatch = buildMatch({
      id: "match-1",
      sport_id: "sport-beach-soccer",
      queue_position: 1,
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
    });
    const secondMatch = buildMatch({
      id: "match-2",
      sport_id: "sport-beach-soccer",
      queue_position: 2,
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
    });
    const thirdMatch = buildMatch({
      id: "match-3",
      sport_id: "sport-beach-soccer",
      queue_position: 3,
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
    });

    const estimatedStartTimeByMatchId = resolveEstimatedStartTimeByMatchId({
      matches: [firstMatch, secondMatch, thirdMatch],
      championshipSports: [
        buildEstimatedStartTimeChampionshipSport({
          sport_id: "sport-beach-soccer",
          default_match_duration_minutes: 30,
          show_estimated_start_time_on_cards: true,
        }),
      ],
      championshipBracketEditions: [buildEstimatedStartTimeBracketEdition({})],
    });

    expect(estimatedStartTimeByMatchId).toEqual({
      "match-1": "08:00",
      "match-2": "08:30",
      "match-3": "09:00",
    });
  });

  it("respects break window when slot progression crosses the interval", () => {
    const firstMatch = buildMatch({
      id: "match-1",
      sport_id: "sport-beach-soccer",
      queue_position: 1,
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
    });
    const secondMatch = buildMatch({
      id: "match-2",
      sport_id: "sport-beach-soccer",
      queue_position: 2,
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
    });
    const thirdMatch = buildMatch({
      id: "match-3",
      sport_id: "sport-beach-soccer",
      queue_position: 3,
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
    });

    const estimatedStartTimeByMatchId = resolveEstimatedStartTimeByMatchId({
      matches: [firstMatch, secondMatch, thirdMatch],
      championshipSports: [
        buildEstimatedStartTimeChampionshipSport({
          sport_id: "sport-beach-soccer",
          default_match_duration_minutes: 30,
        }),
      ],
      championshipBracketEditions: [
        buildEstimatedStartTimeBracketEdition({
          payload_snapshot: {
            schedule_days: [
              {
                date: "2026-03-20",
                start_time: "08:00",
                end_time: "20:00",
                break_start_time: "08:45",
                break_end_time: "09:45",
              },
            ],
          },
        }),
      ],
    });

    expect(estimatedStartTimeByMatchId["match-2"]).toBe("08:30");
    expect(estimatedStartTimeByMatchId["match-3"]).toBe("09:45");
  });

  it("does not generate estimated time for non-beach-soccer, disabled toggle, or non-scheduled status", () => {
    const nonBeachSoccerMatch = buildMatch({
      id: "match-non-beach-soccer",
      sport_id: "sport-volei",
      queue_position: 1,
      sports: { id: "sport-volei", name: "Vôlei de Praia", created_at: "2026-03-01T00:00:00.000Z" },
    });
    const beachSoccerDisabledMatch = buildMatch({
      id: "match-beach-disabled",
      sport_id: "sport-beach-disabled",
      queue_position: 1,
      sports: { id: "sport-beach-disabled", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
    });
    const liveBeachSoccerMatch = buildMatch({
      id: "match-live",
      sport_id: "sport-beach-soccer",
      queue_position: 1,
      status: MatchStatus.LIVE,
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
    });

    const estimatedStartTimeByMatchId = resolveEstimatedStartTimeByMatchId({
      matches: [nonBeachSoccerMatch, beachSoccerDisabledMatch, liveBeachSoccerMatch],
      championshipSports: [
        buildEstimatedStartTimeChampionshipSport({
          sport_id: "sport-volei",
          show_estimated_start_time_on_cards: true,
        }),
        buildEstimatedStartTimeChampionshipSport({
          sport_id: "sport-beach-disabled",
          show_estimated_start_time_on_cards: false,
        }),
        buildEstimatedStartTimeChampionshipSport({
          sport_id: "sport-beach-soccer",
          show_estimated_start_time_on_cards: true,
        }),
      ],
      championshipBracketEditions: [buildEstimatedStartTimeBracketEdition({})],
    });

    expect(estimatedStartTimeByMatchId).toEqual({});
  });

  it("uses the same estimated time for different cards in the same slot", () => {
    const firstDayMatch = buildMatch({
      id: "day-match-1",
      sport_id: "sport-beach-soccer",
      queue_position: 1,
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
    });
    const firstMatch = buildMatch({
      id: "match-1",
      sport_id: "sport-beach-soccer",
      queue_position: 2,
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
    });
    const secondMatch = buildMatch({
      id: "match-2",
      sport_id: "sport-beach-soccer",
      queue_position: 2,
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
    });

    const estimatedStartTimeByMatchId = resolveEstimatedStartTimeByMatchId({
      matches: [firstDayMatch, firstMatch, secondMatch],
      championshipSports: [
        buildEstimatedStartTimeChampionshipSport({
          sport_id: "sport-beach-soccer",
          default_match_duration_minutes: 30,
        }),
      ],
      championshipBracketEditions: [buildEstimatedStartTimeBracketEdition({})],
    });

    expect(estimatedStartTimeByMatchId["match-1"]).toBe("08:30");
    expect(estimatedStartTimeByMatchId["match-2"]).toBe("08:30");
  });

  it("uses fallback schedule days when payload snapshot has no schedule_days", () => {
    const match = buildMatch({
      id: "match-fallback",
      sport_id: "sport-beach-soccer",
      queue_position: 1,
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
    });

    const estimatedStartTimeByMatchId = resolveEstimatedStartTimeByMatchId({
      matches: [match],
      championshipSports: [
        buildEstimatedStartTimeChampionshipSport({
          sport_id: "sport-beach-soccer",
          default_match_duration_minutes: 30,
          show_estimated_start_time_on_cards: true,
        }),
      ],
      championshipBracketEditions: [
        buildEstimatedStartTimeBracketEdition({
          payload_snapshot: {},
          schedule_days: [
            {
              date: "2026-03-20",
              start_time: "09:00",
              end_time: "20:00",
              break_start_time: null,
              break_end_time: null,
            },
          ],
        }),
      ],
    });

    expect(estimatedStartTimeByMatchId["match-fallback"]).toBe("09:00");
  });

  it("resets the estimated slot progression when the scheduled day changes", () => {
    const dayOneMatch = buildMatch({
      id: "day-one-match",
      scheduled_date: "2026-03-20",
      sport_id: "sport-beach-soccer",
      queue_position: 18,
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
    });
    const dayTwoFirstMatch = buildMatch({
      id: "day-two-first-match",
      scheduled_date: "2026-03-21",
      sport_id: "sport-beach-soccer",
      queue_position: 19,
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
    });
    const dayTwoSecondMatch = buildMatch({
      id: "day-two-second-match",
      scheduled_date: "2026-03-21",
      sport_id: "sport-beach-soccer",
      queue_position: 20,
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
    });

    const estimatedStartTimeByMatchId = resolveEstimatedStartTimeByMatchId({
      matches: [dayOneMatch, dayTwoFirstMatch, dayTwoSecondMatch],
      championshipSports: [
        buildEstimatedStartTimeChampionshipSport({
          sport_id: "sport-beach-soccer",
          default_match_duration_minutes: 30,
          show_estimated_start_time_on_cards: true,
        }),
      ],
      championshipBracketEditions: [
        buildEstimatedStartTimeBracketEdition({
          payload_snapshot: {
            schedule_days: [
              {
                date: "2026-03-20",
                start_time: "08:00",
                end_time: "20:00",
                break_start_time: null,
                break_end_time: null,
              },
              {
                date: "2026-03-21",
                start_time: "08:00",
                end_time: "20:00",
                break_start_time: null,
                break_end_time: null,
              },
            ],
          },
        }),
      ],
    });

    expect(estimatedStartTimeByMatchId["day-one-match"]).toBe("08:00");
    expect(estimatedStartTimeByMatchId["day-two-first-match"]).toBe("08:00");
    expect(estimatedStartTimeByMatchId["day-two-second-match"]).toBe("08:30");
  });
});
