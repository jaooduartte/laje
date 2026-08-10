import { describe, expect, it } from "vitest";
import { BracketThirdPlaceMode, MatchManualRepresentationMode, MatchNaipe, MatchStatus, TeamDivision } from "@/lib/enums";
import {
  compareAdminMatchCardOrder,
  resolveDisplayedMatchQueueLabel,
  resolveDisplayedMatchQueuePosition,
  resolveEstimatedStartTimeByMatchId,
  resolveInterleavedScheduledMatchesByCompetition,
  resolveMatchBracketContextByMatchId,
  resolveOrderedScheduledMatchesByVisualTime,
  resolveOrderedScheduledMatches,
  resolveMatchRepresentationByMatchId,
  resolveMatchStartedAtLabel,
  resolveVisualQueuePositionByMatchId,
  type MatchEstimatedStartTimeBracketEdition,
  type MatchEstimatedStartTimeChampionshipSport,
} from "@/lib/championship";
import type { ChampionshipBracketView, Match } from "@/lib/types";

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
    manual_representation_mode: overrides.manual_representation_mode ?? MatchManualRepresentationMode.AUTO,
    scheduled_date: overrides.scheduled_date ?? "2026-03-20",
    queue_position: overrides.queue_position ?? 1,
    scheduled_slot: overrides.scheduled_slot ?? null,
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
        },
      ],
    },
    schedule_days: overrides.schedule_days,
  };
}

describe("resolveMatchRepresentationByMatchId", () => {
  it("usa o jogo anterior da mesma quadra mesmo com naipe e modalidade diferentes", () => {
    const firstMatch = buildMatch({
      id: "court-a-game-1",
      sport_id: "sport-futsal",
      naipe: MatchNaipe.MASCULINO,
      queue_position: 1,
      location: "Arena Seven",
      court_name: "Quadra A",
      home_team: { id: "team-1", name: "Alpha", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-2", name: "Beta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const secondMatch = buildMatch({
      id: "court-a-game-2",
      sport_id: "sport-volei",
      naipe: MatchNaipe.FEMININO,
      division: TeamDivision.DIVISAO_ACESSO,
      queue_position: 2,
      location: "Arena Seven",
      court_name: "Quadra A",
      home_team: { id: "team-3", name: "Gamma", city: "Joinville", division: TeamDivision.DIVISAO_ACESSO, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-4", name: "Delta", city: "Joinville", division: TeamDivision.DIVISAO_ACESSO, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const thirdMatch = buildMatch({
      id: "court-a-game-3",
      sport_id: "sport-handebol",
      naipe: MatchNaipe.MASCULINO,
      queue_position: 3,
      location: "Arena Seven",
      court_name: "Quadra A",
      status: MatchStatus.LIVE,
      home_team: { id: "team-5", name: "Epsilon", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-6", name: "Zeta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });

    const representationByMatchId = resolveMatchRepresentationByMatchId([thirdMatch, secondMatch, firstMatch]);

    expect(representationByMatchId).toEqual({
      "court-a-game-1": "CO",
      "court-a-game-2": "Alpha x Beta",
      "court-a-game-3": "Gamma x Delta",
    });
  });

  it("prioriza a ordem por horário da quadra para definir a representação visual", () => {
    const firstMatch = buildMatch({
      id: "court-a-game-1",
      queue_position: 1,
      start_time: "2026-03-20 11:00:00+00",
      location: "Arena Seven",
      court_name: "Quadra A",
      home_team: { id: "team-1", name: "Alpha", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-2", name: "Beta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const secondMatch = buildMatch({
      id: "court-a-game-2",
      queue_position: 2,
      start_time: "2026-03-20 11:40:00+00",
      location: "Arena Seven",
      court_name: "Quadra A",
      home_team: { id: "team-3", name: "Gamma", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-4", name: "Delta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const thirdMatch = buildMatch({
      id: "court-a-game-4",
      queue_position: 4,
      start_time: "2026-03-20 12:20:00+00",
      location: "Arena Seven",
      court_name: "Quadra A",
      home_team: { id: "team-5", name: "Epsilon", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-6", name: "Zeta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const fourthMatch = buildMatch({
      id: "court-a-game-3",
      queue_position: 3,
      start_time: "2026-03-20 13:00:00+00",
      location: "Arena Seven",
      court_name: "Quadra A",
      home_team: { id: "team-7", name: "Eta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-8", name: "Theta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });

    const representationByMatchId = resolveMatchRepresentationByMatchId([
      fourthMatch,
      thirdMatch,
      secondMatch,
      firstMatch,
    ]);

    expect(representationByMatchId["court-a-game-4"]).toBe("Gamma x Delta");
    expect(representationByMatchId["court-a-game-3"]).toBe("Epsilon x Zeta");
  });

  it("isola a representação por local e quadra", () => {
    const firstCourtMatch = buildMatch({
      id: "arena-seven-court-a-game-1",
      queue_position: 1,
      location: "Arena Seven",
      court_name: "Quadra A",
      home_team: { id: "team-1", name: "Alpha", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-2", name: "Beta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const secondCourtMatch = buildMatch({
      id: "arena-seven-court-b-game-1",
      queue_position: 2,
      location: "Arena Seven",
      court_name: "Quadra B",
      home_team: { id: "team-3", name: "Gamma", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-4", name: "Delta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const thirdCourtMatch = buildMatch({
      id: "ginasio-court-a-game-1",
      queue_position: 3,
      location: "Ginásio Principal",
      court_name: "Quadra A",
      home_team: { id: "team-5", name: "Epsilon", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-6", name: "Zeta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });

    const representationByMatchId = resolveMatchRepresentationByMatchId([
      firstCourtMatch,
      secondCourtMatch,
      thirdCourtMatch,
    ]);

    expect(representationByMatchId["arena-seven-court-a-game-1"]).toBe("CO");
    expect(representationByMatchId["arena-seven-court-b-game-1"]).toBe("CO");
    expect(representationByMatchId["ginasio-court-a-game-1"]).toBe("CO");
  });

  it("reinicia a representação com CO no primeiro jogo de cada novo dia da quadra", () => {
    const firstDayMatch = buildMatch({
      id: "court-a-day-1",
      scheduled_date: "2026-03-20",
      queue_position: 10,
      location: "Arena Seven",
      court_name: "Quadra A",
      home_team: { id: "team-1", name: "Alpha", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-2", name: "Beta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const nextDayMatch = buildMatch({
      id: "court-a-day-2",
      scheduled_date: "2026-03-21",
      queue_position: 1,
      location: "Arena Seven",
      court_name: "Quadra A",
      home_team: { id: "team-3", name: "Gamma", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-4", name: "Delta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const secondMatchOfNextDay = buildMatch({
      id: "court-a-day-2-game-2",
      scheduled_date: "2026-03-21",
      queue_position: 2,
      location: "Arena Seven",
      court_name: "Quadra A",
      home_team: { id: "team-5", name: "Epsilon", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-6", name: "Zeta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });

    const representationByMatchId = resolveMatchRepresentationByMatchId([
      secondMatchOfNextDay,
      nextDayMatch,
      firstDayMatch,
    ]);

    expect(representationByMatchId["court-a-day-1"]).toBe("CO");
    expect(representationByMatchId["court-a-day-2"]).toBe("CO");
    expect(representationByMatchId["court-a-day-2-game-2"]).toBe("Gamma x Delta");
  });

  it("prioriza o override manual de CO no próprio jogo", () => {
    const previousMatch = buildMatch({
      id: "court-a-override-previous",
      queue_position: 1,
      location: "Arena Seven",
      court_name: "Quadra A",
      home_team: { id: "team-1", name: "Alpha", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-2", name: "Beta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const currentMatch = buildMatch({
      id: "court-a-override-current",
      queue_position: 2,
      location: "Arena Seven",
      court_name: "Quadra A",
      manual_representation_mode: MatchManualRepresentationMode.CO,
      home_team: { id: "team-3", name: "Gamma", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-4", name: "Delta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });

    const representationByMatchId = resolveMatchRepresentationByMatchId([currentMatch, previousMatch]);

    expect(representationByMatchId["court-a-override-previous"]).toBe("CO");
    expect(representationByMatchId["court-a-override-current"]).toBe("CO");
  });

  it("mantém a representação do último jogo da quadra mesmo quando há atlética repetida", () => {
    const previousMatch = buildMatch({
      id: "court-a-game-previous",
      scheduled_date: "2026-03-21",
      queue_position: 1,
      location: "Arena Seven",
      court_name: "Quadra A",
      home_team_id: "team-1",
      away_team_id: "team-2",
      home_team: { id: "team-1", name: "Alpha", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-2", name: "Beta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const currentMatch = buildMatch({
      id: "court-a-game-current",
      scheduled_date: "2026-03-21",
      queue_position: 2,
      location: "Arena Seven",
      court_name: "Quadra A",
      home_team_id: "team-2",
      away_team_id: "team-3",
      home_team: { id: "team-2", name: "Beta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-3", name: "Gamma", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });

    const representationByMatchId = resolveMatchRepresentationByMatchId([currentMatch, previousMatch]);

    expect(representationByMatchId["court-a-game-previous"]).toBe("CO");
    expect(representationByMatchId["court-a-game-current"]).toBe("Alpha x Beta");
  });

  it("usa o contexto completo da quadra quando a lista visível está filtrada", () => {
    const previousCourtMatch = buildMatch({
      id: "court-a-hidden-previous",
      sport_id: "sport-futsal",
      queue_position: 1,
      location: "Arena Seven",
      court_name: "Quadra A",
      home_team: { id: "team-1", name: "ATENUN", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-2", name: "AACOM", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const visibleMatch = buildMatch({
      id: "court-a-visible",
      sport_id: "sport-volei",
      queue_position: 2,
      location: "Arena Seven",
      court_name: "Quadra A",
      home_team: { id: "team-3", name: "AAAUS", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-4", name: "RASANTE", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });

    const representationByMatchId = resolveMatchRepresentationByMatchId(
      [visibleMatch],
      [previousCourtMatch, visibleMatch],
    );

    expect(representationByMatchId["court-a-visible"]).toBe("ATENUN x AACOM");
  });

  it("usa o jogo anterior da quadra mesmo em outro status dentro do contexto", () => {
    const livePreviousMatch = buildMatch({
      id: "court-a-live-previous",
      status: MatchStatus.LIVE,
      queue_position: 1,
      location: "Arena Seven",
      court_name: "Quadra A",
      home_team: { id: "team-1", name: "Alpha", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-2", name: "Beta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const visibleScheduledMatch = buildMatch({
      id: "court-a-scheduled-visible",
      status: MatchStatus.SCHEDULED,
      queue_position: 2,
      location: "Arena Seven",
      court_name: "Quadra A",
      home_team: { id: "team-3", name: "Gamma", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-4", name: "Delta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });

    const representationByMatchId = resolveMatchRepresentationByMatchId(
      [visibleScheduledMatch],
      [livePreviousMatch, visibleScheduledMatch],
    );

    expect(representationByMatchId["court-a-scheduled-visible"]).toBe("Alpha x Beta");
  });

  it("usa created_at e id como desempate e volta para A definir quando o jogo anterior está incompleto", () => {
    const firstMatch = buildMatch({
      id: "match-a",
      queue_position: 1,
      created_at: "2026-03-20T08:00:00.000Z",
      location: "Arena Seven",
      court_name: "Quadra A",
      home_team: { id: "team-1", name: "Alpha", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-2", name: "Beta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const secondMatch = buildMatch({
      id: "match-b",
      queue_position: 1,
      created_at: "2026-03-20T08:05:00.000Z",
      location: "Arena Seven",
      court_name: "Quadra A",
      home_team: { id: "team-3", name: "Gamma", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-4", name: "", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });
    const thirdMatch = buildMatch({
      id: "match-c",
      queue_position: 1,
      created_at: "2026-03-20T08:05:00.000Z",
      location: "Arena Seven",
      court_name: "Quadra A",
      home_team: { id: "team-5", name: "Delta", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
      away_team: { id: "team-6", name: "Epsilon", city: "Joinville", division: TeamDivision.DIVISAO_PRINCIPAL, created_at: "2026-03-01T00:00:00.000Z" },
    });

    const representationByMatchId = resolveMatchRepresentationByMatchId([thirdMatch, secondMatch, firstMatch]);

    expect(representationByMatchId["match-a"]).toBe("CO");
    expect(representationByMatchId["match-b"]).toBe("Alpha x Beta");
    expect(representationByMatchId["match-c"]).toBe("A definir");
  });
});

describe("resolveMatchBracketContextByMatchId", () => {
  it("mantém o badge de semifinal quando a chave projetada tem 4 vagas e só a primeira rodada foi materializada", () => {
    const championshipBracketView: ChampionshipBracketView = {
      edition: null,
      competitions: [
        {
          id: "competition-feminino-acesso",
          sport_id: "sport-society",
          sport_name: "Futebol Society",
          naipe: MatchNaipe.FEMININO,
          division: TeamDivision.DIVISAO_ACESSO,
          groups_count: 2,
          qualifiers_per_group: 1,
          should_complete_knockout_with_best_second_placed_teams: true,
          third_place_mode: BracketThirdPlaceMode.NONE,
          groups: [],
          knockout_matches: [
            {
              id: "semi-1",
              round_number: 1,
              slot_number: 1,
              match_id: "match-semi-1",
              status: MatchStatus.SCHEDULED,
              scheduled_date: "2026-06-21",
              queue_position: 22,
              scheduled_slot: 7,
              start_time: "2026-06-21 13:00:00+00",
              end_time: "2026-06-21 13:40:00+00",
              location: "Arena Seven",
              court_name: "Quadra B",
              home_team_id: "team-1",
              away_team_id: "team-4",
              home_team_name: "AFA",
              away_team_name: "SOBERANOS",
              winner_team_id: null,
              winner_team_name: null,
              is_bye: false,
              is_third_place: false,
            },
            {
              id: "semi-2",
              round_number: 1,
              slot_number: 2,
              match_id: "match-semi-2",
              status: MatchStatus.SCHEDULED,
              scheduled_date: "2026-06-21",
              queue_position: 23,
              scheduled_slot: 8,
              start_time: "2026-06-21 13:40:00+00",
              end_time: "2026-06-21 14:20:00+00",
              location: "Arena Seven",
              court_name: "Quadra B",
              home_team_id: "team-2",
              away_team_id: "team-3",
              home_team_name: "AGUA",
              away_team_name: "AMEN",
              winner_team_id: null,
              winner_team_name: null,
              is_bye: false,
              is_third_place: false,
            },
          ],
        },
      ],
    };

    const bracketContextByMatchId = resolveMatchBracketContextByMatchId(championshipBracketView, 2026);

    expect(bracketContextByMatchId["match-semi-1"]).toMatchObject({
      badgeLabel: "Semifinal",
      phase: "KNOCKOUT",
      seasonYear: 2026,
      stageLabel: "Futebol Society • Feminino • Divisão de Acesso • 2026 • Semifinal",
    });
    expect(bracketContextByMatchId["match-semi-2"]).toMatchObject({
      badgeLabel: "Semifinal",
      phase: "KNOCKOUT",
      seasonYear: 2026,
      stageLabel: "Futebol Society • Feminino • Divisão de Acesso • 2026 • Semifinal",
    });
  });
});

describe("compareAdminMatchCardOrder", () => {
  it("prioriza o horário estimado e a fila visual para jogos agendados", () => {
    const laterDisplayedMatch = buildMatch({
      id: "scheduled-match-2",
      scheduled_date: "2026-04-12",
      queue_position: 4,
      scheduled_slot: 4,
      location: "Arena Seven",
      court_name: "Quadra A",
    });
    const earlierDisplayedMatch = buildMatch({
      id: "scheduled-match-1",
      scheduled_date: "2026-04-12",
      queue_position: 7,
      scheduled_slot: 1,
      location: "Arena Seven",
      court_name: "Quadra A",
    });

    const orderedMatches = [laterDisplayedMatch, earlierDisplayedMatch].sort((firstMatch, secondMatch) =>
      compareAdminMatchCardOrder(firstMatch, secondMatch, {
        estimatedStartTimeByMatchId: {
          "scheduled-match-1": "08:10",
          "scheduled-match-2": "09:00",
        },
        visualQueuePositionByMatchId: {
          "scheduled-match-1": 1,
          "scheduled-match-2": 2,
        },
      }),
    );

    expect(orderedMatches.map((match) => match.id)).toEqual([
      "scheduled-match-1",
      "scheduled-match-2",
    ]);
  });
});

describe("resolveDisplayedMatchQueuePosition", () => {
  it("prioriza a fila visual e usa slot planejado como fallback antes do legado", () => {
    const match = buildMatch({
      id: "displayed-queue-match",
      queue_position: 7,
      scheduled_slot: 1,
    });

    expect(resolveDisplayedMatchQueuePosition(match, 3)).toBe(3);
    expect(resolveDisplayedMatchQueuePosition(match)).toBe(1);
    expect(resolveDisplayedMatchQueueLabel(match, 3)).toBe("Jogo 3");
  });

  it("usa o queue_position legado apenas quando não há fila visual nem slot planejado", () => {
    const match = buildMatch({
      id: "displayed-queue-fallback-match",
      scheduled_slot: 4,
    });
    match.queue_position = null;

    expect(resolveDisplayedMatchQueuePosition(match, 17)).toBe(17);
    expect(resolveDisplayedMatchQueuePosition(match)).toBe(4);
  });
});

describe("resolveVisualQueuePositionByMatchId", () => {
  it("mantém a numeração estável da quadra mesmo depois que jogos anteriores deixam de estar agendados", () => {
    const firstFinishedMatch = buildMatch({
      id: "court-a-game-1",
      status: MatchStatus.FINISHED,
      scheduled_slot: 1,
      queue_position: 7,
      location: "Arena Seven",
      court_name: "Quadra A",
      start_time: "2026-03-20T11:00:00.000Z",
    });
    const secondFinishedMatch = buildMatch({
      id: "court-a-game-2",
      status: MatchStatus.FINISHED,
      scheduled_slot: 2,
      queue_position: 1,
      location: "Arena Seven",
      court_name: "Quadra A",
      start_time: "2026-03-20T11:40:00.000Z",
    });
    const nextScheduledMatch = buildMatch({
      id: "court-a-game-3",
      status: MatchStatus.SCHEDULED,
      scheduled_slot: 3,
      queue_position: 2,
      location: "Arena Seven",
      court_name: "Quadra A",
      start_time: "2026-03-20T12:20:00.000Z",
    });

    const visualQueuePositionByMatchId = resolveVisualQueuePositionByMatchId([
      nextScheduledMatch,
      secondFinishedMatch,
      firstFinishedMatch,
    ]);

    expect(visualQueuePositionByMatchId["court-a-game-1"]).toBe(1);
    expect(visualQueuePositionByMatchId["court-a-game-2"]).toBe(2);
    expect(visualQueuePositionByMatchId["court-a-game-3"]).toBe(3);
  });

  it("numera os jogos pela fila visual da própria quadra", () => {
    const firstCourtMatch = buildMatch({
      id: "court-a-game-1",
      sport_id: "sport-futsal",
      naipe: MatchNaipe.MASCULINO,
      queue_position: 7,
      location: "Arena Seven",
      court_name: "Quadra A",
    });
    const secondCourtMatch = buildMatch({
      id: "court-a-game-2",
      sport_id: "sport-volei",
      naipe: MatchNaipe.FEMININO,
      queue_position: 8,
      location: "Arena Seven",
      court_name: "Quadra A",
    });
    const thirdCourtMatch = buildMatch({
      id: "court-a-game-3",
      sport_id: "sport-handebol",
      naipe: MatchNaipe.MASCULINO,
      queue_position: 9,
      location: "Arena Seven",
      court_name: "Quadra A",
    });
    const otherCourtMatch = buildMatch({
      id: "court-b-game-1",
      queue_position: 2,
      location: "Arena Seven",
      court_name: "Quadra B",
    });

    const visualQueuePositionByMatchId = resolveVisualQueuePositionByMatchId([
      secondCourtMatch,
      otherCourtMatch,
      thirdCourtMatch,
      firstCourtMatch,
    ]);

    expect(visualQueuePositionByMatchId["court-a-game-1"]).toBe(1);
    expect(visualQueuePositionByMatchId["court-a-game-2"]).toBe(2);
    expect(visualQueuePositionByMatchId["court-a-game-3"]).toBe(3);
    expect(visualQueuePositionByMatchId["court-b-game-1"]).toBe(1);
  });

  it("ordena a fila visual por data, slot, created_at e id", () => {
    const firstMatch = buildMatch({
      id: "court-a-day-1-slot-1",
      scheduled_date: "2026-03-20",
      queue_position: 1,
      created_at: "2026-03-20T08:00:00.000Z",
      location: "Arena Seven",
      court_name: "Quadra A",
    });
    const secondMatch = buildMatch({
      id: "court-a-day-1-slot-1-b",
      scheduled_date: "2026-03-20",
      queue_position: 1,
      created_at: "2026-03-20T08:05:00.000Z",
      location: "Arena Seven",
      court_name: "Quadra A",
    });
    const thirdMatch = buildMatch({
      id: "court-a-day-1-slot-1-c",
      scheduled_date: "2026-03-20",
      queue_position: 1,
      created_at: "2026-03-20T08:05:00.000Z",
      location: "Arena Seven",
      court_name: "Quadra A",
    });
    const fourthMatch = buildMatch({
      id: "court-a-day-2-slot-1",
      scheduled_date: "2026-03-21",
      queue_position: 1,
      created_at: "2026-03-21T08:00:00.000Z",
      location: "Arena Seven",
      court_name: "Quadra A",
    });

    const visualQueuePositionByMatchId = resolveVisualQueuePositionByMatchId([
      fourthMatch,
      thirdMatch,
      secondMatch,
      firstMatch,
    ]);

    expect(visualQueuePositionByMatchId["court-a-day-1-slot-1"]).toBe(1);
    expect(visualQueuePositionByMatchId["court-a-day-1-slot-1-b"]).toBe(2);
    expect(visualQueuePositionByMatchId["court-a-day-1-slot-1-c"]).toBe(3);
    expect(visualQueuePositionByMatchId["court-a-day-2-slot-1"]).toBe(4);
  });

  it("prioriza o horário planejado da quadra antes do queue_position para numerar visualmente", () => {
    const firstMatch = buildMatch({
      id: "court-a-game-1",
      queue_position: 1,
      start_time: "2026-03-20 11:00:00+00",
      location: "Arena Seven",
      court_name: "Quadra A",
    });
    const secondMatch = buildMatch({
      id: "court-a-game-2",
      queue_position: 2,
      start_time: "2026-03-20 11:40:00+00",
      location: "Arena Seven",
      court_name: "Quadra A",
    });
    const thirdMatch = buildMatch({
      id: "court-a-game-4",
      queue_position: 4,
      start_time: "2026-03-20 12:20:00+00",
      location: "Arena Seven",
      court_name: "Quadra A",
    });
    const fourthMatch = buildMatch({
      id: "court-a-game-3",
      queue_position: 3,
      start_time: "2026-03-20 13:00:00+00",
      location: "Arena Seven",
      court_name: "Quadra A",
    });

    const visualQueuePositionByMatchId = resolveVisualQueuePositionByMatchId([
      fourthMatch,
      thirdMatch,
      secondMatch,
      firstMatch,
    ]);

    expect(visualQueuePositionByMatchId["court-a-game-4"]).toBe(3);
    expect(visualQueuePositionByMatchId["court-a-game-3"]).toBe(4);
  });

  it("mantém a posição visual pelo slot quando o jogo já foi iniciado", () => {
    const previousMatches = Array.from({ length: 7 }, (_, matchIndex) =>
      buildMatch({
        id: `court-a-finished-game-${matchIndex + 1}`,
        status: MatchStatus.FINISHED,
        scheduled_date: "2026-03-20",
        scheduled_slot: matchIndex + 1,
        queue_position: matchIndex + 1,
        start_time: `2026-03-20T${String(10 + Math.floor(matchIndex / 6)).padStart(2, "0")}:${String((matchIndex % 6) * 10).padStart(2, "0")}:00.000Z`,
        location: "Arena Seven",
        court_name: "Quadra A",
      }),
    );
    const liveMatch = buildMatch({
      id: "court-a-live-game-8",
      status: MatchStatus.LIVE,
      scheduled_date: "2026-03-20",
      scheduled_slot: 8,
      queue_position: 8,
      start_time: "2026-03-20T20:29:00.000Z",
      location: "Arena Seven",
      court_name: "Quadra A",
    });
    const nextScheduledMatch = buildMatch({
      id: "court-a-scheduled-game-9",
      status: MatchStatus.SCHEDULED,
      scheduled_date: "2026-03-20",
      scheduled_slot: 9,
      queue_position: 9,
      start_time: "2026-03-20T17:20:00.000Z",
      location: "Arena Seven",
      court_name: "Quadra A",
    });
    const lastScheduledMatch = buildMatch({
      id: "court-a-scheduled-game-10",
      status: MatchStatus.SCHEDULED,
      scheduled_date: "2026-03-20",
      scheduled_slot: 10,
      queue_position: 10,
      start_time: "2026-03-20T18:00:00.000Z",
      location: "Arena Seven",
      court_name: "Quadra A",
    });

    const visualQueuePositionByMatchId = resolveVisualQueuePositionByMatchId([
      ...previousMatches,
      lastScheduledMatch,
      nextScheduledMatch,
      liveMatch,
    ]);

        expect(visualQueuePositionByMatchId["court-a-live-game-8"]).toBe(8);
    expect(visualQueuePositionByMatchId["court-a-scheduled-game-9"]).toBe(9);
    expect(visualQueuePositionByMatchId["court-a-scheduled-game-10"]).toBe(10);
  });

  it("numera SPORT_NAIPE em uma sequência única mesmo entre quadras e dias diferentes", () => {
    const firstMatch = buildMatch({
      id: "futsal-fem-game-1",
      sport_id: "sport-futsal",
      naipe: MatchNaipe.FEMININO,
      division: TeamDivision.DIVISAO_PRINCIPAL,
      scheduled_date: "2026-03-20",
      start_time: "2026-03-20T11:00:00.000Z",
      queue_position: 20,
      location: "Arena Seven",
      court_name: "Quadra A",
    });

    const secondMatch = buildMatch({
      id: "futsal-fem-game-2",
      sport_id: "sport-futsal",
      naipe: MatchNaipe.FEMININO,
      division: TeamDivision.DIVISAO_ACESSO,
      scheduled_date: "2026-03-20",
      start_time: "2026-03-20T12:00:00.000Z",
      queue_position: 3,
      location: "Arena Seven",
      court_name: "Quadra B",
    });

    const thirdMatch = buildMatch({
      id: "futsal-fem-game-3",
      sport_id: "sport-futsal",
      naipe: MatchNaipe.FEMININO,
      division: TeamDivision.DIVISAO_PRINCIPAL,
      scheduled_date: "2026-03-21",
      start_time: "2026-03-21T11:00:00.000Z",
      queue_position: 1,
      location: "Ginásio Principal",
      court_name: "Quadra Externa",
    });

    const visualQueuePositionByMatchId = resolveVisualQueuePositionByMatchId(
      [thirdMatch, secondMatch, firstMatch],
      undefined,
      undefined,
      "SPORT_NAIPE",
    );

    expect(visualQueuePositionByMatchId["futsal-fem-game-1"]).toBe(1);
    expect(visualQueuePositionByMatchId["futsal-fem-game-2"]).toBe(2);
    expect(visualQueuePositionByMatchId["futsal-fem-game-3"]).toBe(3);
  });

  it("mantém sequências independentes por modalidade e naipe em SPORT_NAIPE", () => {
    const futsalFemaleMatch = buildMatch({
      id: "futsal-fem-game",
      sport_id: "sport-futsal",
      naipe: MatchNaipe.FEMININO,
      scheduled_date: "2026-03-20",
      start_time: "2026-03-20T11:00:00.000Z",
      location: "Arena Seven",
      court_name: "Quadra A",
    });

    const futsalMaleMatch = buildMatch({
      id: "futsal-masc-game",
      sport_id: "sport-futsal",
      naipe: MatchNaipe.MASCULINO,
      scheduled_date: "2026-03-20",
      start_time: "2026-03-20T11:30:00.000Z",
      location: "Arena Seven",
      court_name: "Quadra A",
    });

    const volleyballFemaleMatch = buildMatch({
      id: "volei-fem-game",
      sport_id: "sport-volei",
      naipe: MatchNaipe.FEMININO,
      scheduled_date: "2026-03-20",
      start_time: "2026-03-20T12:00:00.000Z",
      location: "Arena Seven",
      court_name: "Quadra A",
    });

    const visualQueuePositionByMatchId = resolveVisualQueuePositionByMatchId(
      [volleyballFemaleMatch, futsalMaleMatch, futsalFemaleMatch],
      undefined,
      undefined,
      "SPORT_NAIPE",
    );

    expect(visualQueuePositionByMatchId["futsal-fem-game"]).toBe(1);
    expect(visualQueuePositionByMatchId["futsal-masc-game"]).toBe(1);
    expect(visualQueuePositionByMatchId["volei-fem-game"]).toBe(1);
  });
});

describe("resolveMatchStartedAtLabel", () => {
  it("ignores start_time for scheduled matches because cards must use the estimated time only", () => {
    expect(
      resolveMatchStartedAtLabel("2026-06-15T08:00:00-03:00", MatchStatus.SCHEDULED),
    ).toBeNull();
  });

  it("keeps the started label for live matches", () => {
    expect(
      resolveMatchStartedAtLabel("2026-06-15T08:00:00-03:00", MatchStatus.LIVE),
    ).toBe("Jogo iniciado às 08:00");
  });
});

describe("resolveEstimatedStartTimeByMatchId", () => {
  it("prefers the planned start_time already persisted on the scheduled match", () => {
    const matchWithPlannedStartTime = buildMatch({
      id: "match-with-planned-start-time",
      sport_id: "sport-beach-soccer",
      queue_position: 9,
      start_time: "2026-03-20 11:30:00+00",
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
    });

    const estimatedStartTimeByMatchId = resolveEstimatedStartTimeByMatchId({
      matches: [matchWithPlannedStartTime],
      championshipSports: [
        buildEstimatedStartTimeChampionshipSport({
          sport_id: "sport-beach-soccer",
          default_match_duration_minutes: 30,
          show_estimated_start_time_on_cards: true,
        }),
      ],
      championshipBracketEditions: [buildEstimatedStartTimeBracketEdition({})],
    });

    expect(estimatedStartTimeByMatchId["match-with-planned-start-time"]).toBe("08:30");
  });

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
          schedule_days: [
            {
              date: "2026-03-20",
              start_time: "08:00",
              end_time: "20:00",
              breaks: [
                { break_start_time: "08:45", break_end_time: "09:45", position: 1 },
              ],
            },
          ],
        }),
      ],
    });

    // match-2 inicia às 08:30 mas terminaria às 09:00 (dentro do intervalo 08:45-09:45), então é empurrado para 09:45
    // match-3 segue a partir de 09:45 + 30min = 10:15
    expect(estimatedStartTimeByMatchId["match-2"]).toBe("09:45");
    expect(estimatedStartTimeByMatchId["match-3"]).toBe("10:15");
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
          show_estimated_start_time_on_cards: false,
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
              },
              {
                date: "2026-03-21",
                start_time: "08:00",
                end_time: "20:00",
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

  it("uses the real operational slot progression when the visible list is filtered", () => {
    const liveOperationalMatch = buildMatch({
      id: "beach-game-1",
      sport_id: "sport-beach-soccer",
      status: MatchStatus.LIVE,
      queue_position: 1,
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
    });
    const filteredVisibleMatch = buildMatch({
      id: "beach-game-2",
      sport_id: "sport-beach-soccer",
      status: MatchStatus.SCHEDULED,
      queue_position: 2,
      sports: { id: "sport-beach-soccer", name: "Beach Soccer", created_at: "2026-03-01T00:00:00.000Z" },
    });

    const estimatedStartTimeByMatchId = resolveEstimatedStartTimeByMatchId({
      matches: [filteredVisibleMatch],
      contextMatches: [liveOperationalMatch, filteredVisibleMatch],
      championshipSports: [
        buildEstimatedStartTimeChampionshipSport({
          sport_id: "sport-beach-soccer",
          default_match_duration_minutes: 30,
          show_estimated_start_time_on_cards: true,
        }),
      ],
      championshipBracketEditions: [buildEstimatedStartTimeBracketEdition({})],
    });

    expect(estimatedStartTimeByMatchId["beach-game-2"]).toBe("08:30");
  });
});

describe("resolveOrderedScheduledMatchesByVisualTime", () => {
  it("ordena os cards agendados pelo horario estimado antes da fila original", () => {
    const tenAMatch = buildMatch({
      id: "match-10h",
      queue_position: 2,
      location: "Arena Seven",
      court_name: "Quadra B",
    });
    const eightAMatch = buildMatch({
      id: "match-08h",
      queue_position: 1,
      location: "Arena Seven",
      court_name: "Quadra A",
    });
    const nineTwentyMatch = buildMatch({
      id: "match-09h20",
      queue_position: 3,
      location: "Arena Seven",
      court_name: "Quadra A",
    });

    const orderedMatches = resolveOrderedScheduledMatchesByVisualTime(
      [tenAMatch, eightAMatch, nineTwentyMatch],
      {
        "match-10h": "10:00",
        "match-08h": "08:00",
        "match-09h20": "09:20",
      },
    );

    expect(orderedMatches.map((match) => match.id)).toEqual([
      "match-08h",
      "match-09h20",
      "match-10h",
    ]);
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
