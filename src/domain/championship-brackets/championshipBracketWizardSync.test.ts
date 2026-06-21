import { describe, expect, it } from "vitest";
import { sanitizeChampionshipBracketWizardDraft } from "@/domain/championship-brackets/championshipBracketWizardSync";
import type { ChampionshipBracketWizardDraftFormValues } from "@/domain/championship-brackets/championshipBracket.types";
import { ChampionshipSportNaipeMode, ChampionshipSportResultRule, ChampionshipSportTieBreakerRule, TeamDivision } from "@/lib/enums";
import type { ChampionshipSport, Team } from "@/lib/types";

function buildTeam(overrides: Partial<Team> & Pick<Team, "id" | "name">): Team {
  return {
    id: overrides.id,
    name: overrides.name,
    city: overrides.city ?? "Joinville",
    division: overrides.division === undefined ? TeamDivision.DIVISAO_PRINCIPAL : overrides.division,
    created_at: overrides.created_at ?? "2026-05-08T00:00:00.000Z",
  };
}

function buildChampionshipSport(overrides: Partial<ChampionshipSport> = {}): ChampionshipSport {
  return {
    id: overrides.id ?? "championship-sport-1",
    championship_id: overrides.championship_id ?? "championship-1",
    sport_id: overrides.sport_id ?? "sport-1",
    naipe_mode: overrides.naipe_mode ?? ChampionshipSportNaipeMode.MASCULINO_FEMININO,
    result_rule: overrides.result_rule ?? ChampionshipSportResultRule.POINTS,
    supports_cards: overrides.supports_cards ?? false,
    tie_breaker_rule: overrides.tie_breaker_rule ?? ChampionshipSportTieBreakerRule.BEACH_SOCCER,
    default_match_duration_minutes: overrides.default_match_duration_minutes ?? 30,
    show_estimated_start_time_on_cards: overrides.show_estimated_start_time_on_cards ?? false,
    points_win: overrides.points_win ?? 3,
    points_draw: overrides.points_draw ?? 1,
    points_loss: overrides.points_loss ?? 0,
    created_at: overrides.created_at ?? "2026-05-08T00:00:00.000Z",
    walkover_winner_points: overrides.walkover_winner_points ?? 3,
    awards_include_knockout_phase: overrides.awards_include_knockout_phase ?? true,
    supports_individual_awards: overrides.supports_individual_awards ?? true,
    sports: overrides.sports,
  };
}

function buildDraft(overrides: Partial<ChampionshipBracketWizardDraftFormValues> = {}): ChampionshipBracketWizardDraftFormValues {
  return {
    current_step_index: overrides.current_step_index ?? 1,
    selected_team_ids: overrides.selected_team_ids ?? [],
    selected_sport_ids_by_team_id: overrides.selected_sport_ids_by_team_id ?? {},
    show_estimated_start_time_on_cards_by_sport_id: overrides.show_estimated_start_time_on_cards_by_sport_id ?? {},
    selected_competition_keys_by_team_id: overrides.selected_competition_keys_by_team_id ?? {},
    should_apply_modalities_to_all_teams: overrides.should_apply_modalities_to_all_teams ?? false,
    should_apply_naipes_to_all_teams: overrides.should_apply_naipes_to_all_teams ?? false,
    should_replicate_previous_schedule_day: overrides.should_replicate_previous_schedule_day ?? false,
    competition_config_by_key: overrides.competition_config_by_key ?? {},
    group_assignments_by_competition_key: overrides.group_assignments_by_competition_key ?? {},
    group_order_by_competition_key: overrides.group_order_by_competition_key ?? {},
    schedule_days: overrides.schedule_days ?? [],
  };
}

describe("sanitizeChampionshipBracketWizardDraft", () => {
  it("remove atléticas inválidas e limpa competições que deixaram de existir após mudança de divisão", () => {
    const principalCompetitionKey = "sport-1::MASCULINO::DIVISAO_PRINCIPAL";
    const accessCompetitionKey = "sport-1::MASCULINO::DIVISAO_ACESSO";
    const teams = [
      buildTeam({ id: "team-principal", name: "Principal", division: TeamDivision.DIVISAO_PRINCIPAL }),
      buildTeam({ id: "team-access", name: "Acesso", division: TeamDivision.DIVISAO_ACESSO }),
      buildTeam({ id: "team-without-division", name: "Sem divisão", division: null }),
    ];

    const sanitizedDraft = sanitizeChampionshipBracketWizardDraft({
      draftFormValues: buildDraft({
        selected_team_ids: ["team-principal", "team-access", "team-without-division"],
        selected_sport_ids_by_team_id: {
          "team-principal": ["sport-1"],
          "team-access": ["sport-1"],
          "team-without-division": ["sport-1"],
        },
        selected_competition_keys_by_team_id: {
          "team-principal": [principalCompetitionKey],
          "team-access": [accessCompetitionKey],
          "team-without-division": [principalCompetitionKey],
        },
        competition_config_by_key: {
          [principalCompetitionKey]: {
            groups_count: 4,
            qualifiers_per_group: 2,
            should_complete_knockout_with_best_second_placed_teams: false,
            knockout_pairing_mode: "LINEAR",
          },
          [accessCompetitionKey]: {
            groups_count: 2,
            qualifiers_per_group: 1,
            should_complete_knockout_with_best_second_placed_teams: true,
            knockout_pairing_mode: "LINEAR",
          },
        },
        group_assignments_by_competition_key: {
          [principalCompetitionKey]: {
            "team-principal": 1,
            "team-without-division": 2,
          },
          [accessCompetitionKey]: {
            "team-access": 1,
          },
        },
        group_order_by_competition_key: {
          [principalCompetitionKey]: {
            "1": ["team-principal"],
            "2": ["team-without-division"],
          },
          [accessCompetitionKey]: {
            "1": ["team-access"],
          },
        },
      }),
      teams,
      championshipSports: [buildChampionshipSport()],
      usesDivisions: true,
    });

    expect(sanitizedDraft.selected_team_ids).toEqual(["team-principal", "team-access"]);
    expect(sanitizedDraft.selected_sport_ids_by_team_id).toEqual({
      "team-principal": ["sport-1"],
      "team-access": ["sport-1"],
    });
    expect(sanitizedDraft.selected_competition_keys_by_team_id).toEqual({
      "team-principal": [principalCompetitionKey],
      "team-access": [accessCompetitionKey],
    });
    expect(sanitizedDraft.competition_config_by_key).toEqual({});
    expect(sanitizedDraft.group_assignments_by_competition_key).toEqual({});
    expect(sanitizedDraft.group_order_by_competition_key).toEqual({});
  });

  it("preserva apenas competições ativas com duas ou mais participantes e recalcula grupos com segurança", () => {
    const competitionKey = "sport-1::FEMININO::DIVISAO_PRINCIPAL";
    const teams = [
      buildTeam({ id: "team-1", name: "Atlética 1", division: TeamDivision.DIVISAO_PRINCIPAL }),
      buildTeam({ id: "team-2", name: "Atlética 2", division: TeamDivision.DIVISAO_PRINCIPAL }),
      buildTeam({ id: "team-3", name: "Atlética 3", division: TeamDivision.DIVISAO_PRINCIPAL }),
    ];

    const sanitizedDraft = sanitizeChampionshipBracketWizardDraft({
      draftFormValues: buildDraft({
        selected_team_ids: teams.map((team) => team.id),
        selected_sport_ids_by_team_id: {
          "team-1": ["sport-1"],
          "team-2": ["sport-1"],
          "team-3": ["sport-1"],
        },
        selected_competition_keys_by_team_id: {
          "team-1": [competitionKey],
          "team-2": [competitionKey],
          "team-3": [competitionKey],
        },
        competition_config_by_key: {
          [competitionKey]: {
            groups_count: 2,
            qualifiers_per_group: 1,
            should_complete_knockout_with_best_second_placed_teams: true,
            knockout_pairing_mode: "LINEAR",
          },
        },
        group_assignments_by_competition_key: {
          [competitionKey]: {
            "team-1": 1,
            "team-2": 2,
            "team-3": 2,
          },
        },
        group_order_by_competition_key: {
          [competitionKey]: {
            "1": ["team-1"],
            "2": ["team-3", "team-2"],
          },
        },
      }),
      teams,
      championshipSports: [buildChampionshipSport({ naipe_mode: ChampionshipSportNaipeMode.MASCULINO_FEMININO })],
      usesDivisions: true,
    });

    expect(sanitizedDraft.competition_config_by_key[competitionKey]).toEqual({
      groups_count: 2,
      qualifiers_per_group: 1,
      should_complete_knockout_with_best_second_placed_teams: true,
      knockout_pairing_mode: "LINEAR",
    });
    expect(Object.keys(sanitizedDraft.group_assignments_by_competition_key[competitionKey] ?? {})).toEqual([
      "team-1",
      "team-2",
      "team-3",
    ]);
    expect(sanitizedDraft.group_assignments_by_competition_key[competitionKey]).toEqual({
      "team-1": 1,
      "team-2": 2,
      "team-3": 2,
    });
    expect(sanitizedDraft.group_order_by_competition_key[competitionKey]).toEqual({
      "1": ["team-1"],
      "2": ["team-3", "team-2"],
    });
  });

  it("aplica o novo cruzamento por padrão no feminino da divisão de acesso do Futebol Society", () => {
    const competitionKey = "sport-society::FEMININO::DIVISAO_ACESSO";
    const teams = [
      buildTeam({ id: "team-1", name: "Atlética 1", division: TeamDivision.DIVISAO_ACESSO }),
      buildTeam({ id: "team-2", name: "Atlética 2", division: TeamDivision.DIVISAO_ACESSO }),
    ];

    const sanitizedDraft = sanitizeChampionshipBracketWizardDraft({
      draftFormValues: buildDraft({
        selected_team_ids: teams.map((team) => team.id),
        selected_sport_ids_by_team_id: {
          "team-1": ["sport-society"],
          "team-2": ["sport-society"],
        },
        selected_competition_keys_by_team_id: {
          "team-1": [competitionKey],
          "team-2": [competitionKey],
        },
      }),
      teams,
      championshipSports: [
        buildChampionshipSport({
          sport_id: "sport-society",
          sports: {
            id: "sport-society",
            name: "Futebol Society",
            default_match_duration_minutes: 40,
            created_at: "2026-05-08T00:00:00.000Z",
          },
        }),
      ],
      usesDivisions: true,
    });

    expect(sanitizedDraft.competition_config_by_key[competitionKey]).toEqual({
      groups_count: 2,
      qualifiers_per_group: 1,
      should_complete_knockout_with_best_second_placed_teams: true,
      knockout_pairing_mode: "FUTEBOL_SOCIETY_FEM_ACCESS_CROSS_GROUPS",
    });
  });
});
