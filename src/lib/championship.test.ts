import { describe, expect, it } from "vitest";
import { MatchNaipe, MatchStatus, TeamDivision } from "@/lib/enums";
import {
  resolveEstimatedStartTimeByMatchId,
  resolveInterleavedScheduledMatchesByCompetition,
  resolveOrderedScheduledMatches,
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

  it("isolates operational representation by naipe and division within the same modality", () => {
    const firstMatch = buildMatch({
      id: "match-queue-1",
      queue_position: 1,
      naipe: MatchNaipe.MASCULINO,
      division: TeamDivision.DIVISAO_PRINCIPAL,
      home_team: { id: "team-1", name: "Alpha", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-2", name: "Beta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const secondMatch = buildMatch({
      id: "match-queue-2",
      queue_position: 2,
      naipe: MatchNaipe.FEMININO,
      division: TeamDivision.DIVISAO_ACESSO,
      home_team: { id: "team-3", name: "Gamma", city: "Joinville", division: TeamDivision.DIVISAO_ACESSO, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-4", name: "Delta", city: "Joinville", division: TeamDivision.DIVISAO_ACESSO, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const thirdMatch = buildMatch({
      id: "match-queue-3",
      queue_position: 3,
      naipe: MatchNaipe.MASCULINO,
      division: null,
      home_team: { id: "team-5", name: "Epsilon", city: "Joinville", division: null, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-6", name: "Zeta", city: "Joinville", division: null, created_at: "2026-03-01T00:00:00.000Z" },
    });

    const representationByMatchId = resolveMatchRepresentationByMatchId([
      secondMatch,
      thirdMatch,
      firstMatch,
    ]);

    expect(representationByMatchId["match-queue-1"]).toBe("CO");
    expect(representationByMatchId["match-queue-2"]).toBe("CO");
    expect(representationByMatchId["match-queue-3"]).toBe("CO");
  });

  it("keeps male and female game 1 as independent CO entries", () => {
    const maleGameOneMatch = buildMatch({
      id: "male-game-1",
      queue_position: 1,
      naipe: MatchNaipe.MASCULINO,
      home_team: { id: "team-1", name: "Alpha", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-2", name: "Beta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const femaleGameOneMatch = buildMatch({
      id: "female-game-1",
      queue_position: 1,
      naipe: MatchNaipe.FEMININO,
      home_team: { id: "team-3", name: "Gamma", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-4", name: "Delta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });

    const representationByMatchId = resolveMatchRepresentationByMatchId([
      femaleGameOneMatch,
      maleGameOneMatch,
    ]);

    expect(representationByMatchId["male-game-1"]).toBe("CO");
    expect(representationByMatchId["female-game-1"]).toBe("CO");
  });

  it("uses a single sequential queue for beach soccer across naipes", () => {
    const gameOneMaleMatch = buildMatch({
      id: "beach-game-1-male",
      sport_id: "sport-beach-soccer",
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
      naipe: MatchNaipe.MASCULINO,
      queue_position: 1,
      home_team: { id: "team-1", name: "Alpha", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-2", name: "Beta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const gameTwoMaleMatch = buildMatch({
      id: "beach-game-2-male",
      sport_id: "sport-beach-soccer",
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
      naipe: MatchNaipe.MASCULINO,
      queue_position: 2,
      home_team: { id: "team-3", name: "Gamma", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-4", name: "Delta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const gameThreeMaleMatch = buildMatch({
      id: "beach-game-3-male",
      sport_id: "sport-beach-soccer",
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
      naipe: MatchNaipe.MASCULINO,
      queue_position: 3,
      home_team: { id: "team-5", name: "Epsilon", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-6", name: "Zeta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const gameFourFemaleMatch = buildMatch({
      id: "beach-game-4-female",
      sport_id: "sport-beach-soccer",
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
      naipe: MatchNaipe.FEMININO,
      queue_position: 4,
      home_team: { id: "team-7", name: "Eta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-8", name: "Theta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const gameFiveMaleMatch = buildMatch({
      id: "beach-game-5-male",
      sport_id: "sport-beach-soccer",
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
      naipe: MatchNaipe.MASCULINO,
      queue_position: 5,
      home_team: { id: "team-9", name: "Iota", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-10", name: "Kappa", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });

    const representationByMatchId = resolveMatchRepresentationByMatchId([
      gameFiveMaleMatch,
      gameThreeMaleMatch,
      gameOneMaleMatch,
      gameFourFemaleMatch,
      gameTwoMaleMatch,
    ]);

    expect(representationByMatchId["beach-game-1-male"]).toBe("CO");
    expect(representationByMatchId["beach-game-2-male"]).toBe("Alpha x Beta");
    expect(representationByMatchId["beach-game-3-male"]).toBe("Gamma x Delta");
    expect(representationByMatchId["beach-game-4-female"]).toBe("Epsilon x Zeta");
    expect(representationByMatchId["beach-game-5-male"]).toBe("Eta x Theta");
  });

  it("keeps different sports and days isolated in their own operational queues", () => {
    const beachSoccerFirstMatch = buildMatch({
      id: "beach-1",
      sport_id: "sport-beach-soccer",
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
      scheduled_date: "2026-03-20",
      queue_position: 1,
      home_team: { id: "team-1", name: "Alpha", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-2", name: "Beta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const beachSoccerSecondMatch = buildMatch({
      id: "beach-2",
      sport_id: "sport-beach-soccer",
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
      scheduled_date: "2026-03-20",
      queue_position: 2,
      home_team: { id: "team-3", name: "Gamma", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-4", name: "Delta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const futsalFirstMatch = buildMatch({
      id: "futsal-1",
      sport_id: "sport-futsal",
      sports: { id: "sport-futsal", name: "Futsal", created_at: "2026-03-01T00:00:00.000Z" },
      scheduled_date: "2026-03-20",
      queue_position: 1,
      home_team: { id: "team-5", name: "Epsilon", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-6", name: "Zeta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const beachSoccerNextDayFirstMatch = buildMatch({
      id: "beach-next-day-1",
      sport_id: "sport-beach-soccer",
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
      scheduled_date: "2026-03-21",
      queue_position: 1,
      home_team: { id: "team-7", name: "Eta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-8", name: "Theta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });

    const representationByMatchId = resolveMatchRepresentationByMatchId([
      beachSoccerSecondMatch,
      beachSoccerFirstMatch,
      futsalFirstMatch,
      beachSoccerNextDayFirstMatch,
    ]);

    expect(representationByMatchId["beach-1"]).toBe("CO");
    expect(representationByMatchId["beach-2"]).toBe("Alpha x Beta");
    expect(representationByMatchId["futsal-1"]).toBe("CO");
    expect(representationByMatchId["beach-next-day-1"]).toBe("CO");
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

describe("resolveOrderedScheduledMatches", () => {
  it("orders scheduled matches by date, queue/slot, created_at and id", () => {
    const dayOneSlotOne = buildMatch({
      id: "day-1-slot-1",
      scheduled_date: "2026-03-20",
      queue_position: 1,
      created_at: "2026-03-20T08:00:00.000Z",
    });
    const dayOneSlotTwo = buildMatch({
      id: "day-1-slot-2",
      scheduled_date: "2026-03-20",
      queue_position: 2,
      created_at: "2026-03-20T08:01:00.000Z",
    });
    const dayOneSlotFour = buildMatch({
      id: "day-1-slot-4",
      scheduled_date: "2026-03-20",
      queue_position: 4,
      created_at: "2026-03-20T08:02:00.000Z",
    });
    const dayTwoSlotOne = buildMatch({
      id: "day-2-slot-1",
      scheduled_date: "2026-03-21",
      queue_position: 1,
      created_at: "2026-03-21T08:00:00.000Z",
    });

    const orderedMatches = resolveOrderedScheduledMatches([
      dayOneSlotFour,
      dayTwoSlotOne,
      dayOneSlotTwo,
      dayOneSlotOne,
    ]);

    expect(orderedMatches.map((match) => match.id)).toEqual([
      "day-1-slot-1",
      "day-1-slot-2",
      "day-1-slot-4",
      "day-2-slot-1",
    ]);
  });
});

describe("resolveInterleavedScheduledMatchesByCompetition", () => {
  it("keeps beach soccer sequential across naipes while interleaving other modalities by slot rounds", () => {
    const beachSoccerGameOne = buildMatch({
      id: "beach-soccer-game-1",
      sport_id: "sport-beach-soccer",
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
      naipe: MatchNaipe.MASCULINO,
      queue_position: 1,
    });
    const futevoleiGameOne = buildMatch({
      id: "futevolei-game-1",
      sport_id: "sport-futevolei",
      sports: { id: "sport-futevolei", name: "Futevôlei", created_at: "2026-03-01T00:00:00.000Z" },
      naipe: MatchNaipe.MASCULINO,
      queue_position: 1,
    });
    const voleiGameOne = buildMatch({
      id: "volei-game-1",
      sport_id: "sport-volei",
      sports: { id: "sport-volei", name: "Vôlei de Praia", created_at: "2026-03-01T00:00:00.000Z" },
      naipe: MatchNaipe.FEMININO,
      queue_position: 1,
    });
    const beachSoccerGameTwo = buildMatch({
      id: "beach-soccer-game-2",
      sport_id: "sport-beach-soccer",
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
      naipe: MatchNaipe.MASCULINO,
      queue_position: 2,
    });
    const futevoleiGameTwo = buildMatch({
      id: "futevolei-game-2",
      sport_id: "sport-futevolei",
      sports: { id: "sport-futevolei", name: "Futevôlei", created_at: "2026-03-01T00:00:00.000Z" },
      naipe: MatchNaipe.MASCULINO,
      queue_position: 2,
    });
    const voleiGameTwo = buildMatch({
      id: "volei-game-2",
      sport_id: "sport-volei",
      sports: { id: "sport-volei", name: "Vôlei de Praia", created_at: "2026-03-01T00:00:00.000Z" },
      naipe: MatchNaipe.FEMININO,
      queue_position: 2,
    });
    const beachSoccerGameFourFemale = buildMatch({
      id: "beach-soccer-game-4-female",
      sport_id: "sport-beach-soccer",
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
      naipe: MatchNaipe.FEMININO,
      queue_position: 4,
    });

    const orderedAndInterleavedMatches = resolveInterleavedScheduledMatchesByCompetition(
      resolveOrderedScheduledMatches([
        beachSoccerGameFourFemale,
        voleiGameTwo,
        beachSoccerGameTwo,
        futevoleiGameOne,
        voleiGameOne,
        beachSoccerGameOne,
        futevoleiGameTwo,
      ]),
    );

    expect(orderedAndInterleavedMatches.map((match) => match.id)).toEqual([
      "beach-soccer-game-1",
      "futevolei-game-1",
      "volei-game-1",
      "beach-soccer-game-2",
      "futevolei-game-2",
      "volei-game-2",
      "beach-soccer-game-4-female",
    ]);
  });
});
