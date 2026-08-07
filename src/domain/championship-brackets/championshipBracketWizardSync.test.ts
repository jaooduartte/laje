import { describe, expect, it } from "vitest";
import { sanitizeChampionshipBracketWizardDraft } from "@/domain/championship-brackets/championshipBracketWizardSync";
import type { ChampionshipBracketWizardDraftFormValues } from "@/domain/championship-brackets/championshipBracket.types";
import {
  ChampionshipSchedulePeriod,
  ChampionshipSeasonDivisionFormat,
  ChampionshipSeasonDivisionSettlementMode,
  ChampionshipSportNaipeMode,
  ChampionshipSportResultRule,
  ChampionshipSportTieBreakerRule,
  MatchNaipe,
  TeamDivision,
} from "@/lib/enums";
import type { ChampionshipSport, Team } from "@/lib/types";

function buildPlacementPoints(count = 20) {
  const defaults = [
    24, 22, 20, 18, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
  ];
  return Array.from({ length: count }, (_, index) => ({
    placement: index + 1,
    points: defaults[index] ?? null,
  }));
}

function buildTeam(overrides: Partial<Team> & Pick<Team, "id" | "name">): Team {
  return {
    id: overrides.id,
    name: overrides.name,
    city: overrides.city ?? "Joinville",
    division:
      overrides.division === undefined
        ? TeamDivision.DIVISAO_PRINCIPAL
        : overrides.division,
    created_at: overrides.created_at ?? "2026-05-08T00:00:00.000Z",
  };
}

function buildChampionshipSport(
  overrides: Partial<ChampionshipSport> = {},
): ChampionshipSport {
  return {
    id: overrides.id ?? "championship-sport-1",
    championship_id: overrides.championship_id ?? "championship-1",
    sport_id: overrides.sport_id ?? "sport-1",
    naipe_mode:
      overrides.naipe_mode ?? ChampionshipSportNaipeMode.MASCULINO_FEMININO,
    result_rule: overrides.result_rule ?? ChampionshipSportResultRule.POINTS,
    supports_cards: overrides.supports_cards ?? false,
    tie_breaker_rule:
      overrides.tie_breaker_rule ??
      ChampionshipSportTieBreakerRule.BEACH_SOCCER,
    default_match_duration_minutes:
      overrides.default_match_duration_minutes ?? 30,
    show_estimated_start_time_on_cards:
      overrides.show_estimated_start_time_on_cards ?? false,
    points_win: overrides.points_win ?? 3,
    points_draw: overrides.points_draw ?? 1,
    points_loss: overrides.points_loss ?? 0,
    created_at: overrides.created_at ?? "2026-05-08T00:00:00.000Z",
    walkover_winner_points: overrides.walkover_winner_points ?? 3,
    awards_include_knockout_phase:
      overrides.awards_include_knockout_phase ?? true,
    supports_individual_awards: overrides.supports_individual_awards ?? true,
    sports: overrides.sports,
  };
}

function buildDraft(
  overrides: Partial<ChampionshipBracketWizardDraftFormValues> = {},
): ChampionshipBracketWizardDraftFormValues {
  return {
    current_step_index: overrides.current_step_index ?? 1,
    season_settings: overrides.season_settings ?? {
      division_format: ChampionshipSeasonDivisionFormat.SEPARATED,
      division_settlement_mode: ChampionshipSeasonDivisionSettlementMode.NONE,
      principal_slots_count: null,
      principal_relegation_count: null,
      access_promotion_count: null,
    },
    enabled_sport_ids: overrides.enabled_sport_ids ?? ["sport-1"],
    selected_team_ids: overrides.selected_team_ids ?? [],
    selected_sport_ids_by_team_id:
      overrides.selected_sport_ids_by_team_id ?? {},
    show_estimated_start_time_on_cards_by_sport_id:
      overrides.show_estimated_start_time_on_cards_by_sport_id ?? {},
    selected_competition_keys_by_team_id:
      overrides.selected_competition_keys_by_team_id ?? {},
    should_apply_modalities_to_all_teams:
      overrides.should_apply_modalities_to_all_teams ?? false,
    should_apply_naipes_to_all_teams:
      overrides.should_apply_naipes_to_all_teams ?? false,
    should_replicate_previous_schedule_day:
      overrides.should_replicate_previous_schedule_day ?? false,
    competition_config_by_key: overrides.competition_config_by_key ?? {},
    group_assignments_by_competition_key:
      overrides.group_assignments_by_competition_key ?? {},
    group_order_by_competition_key:
      overrides.group_order_by_competition_key ?? {},
    schedule_days: overrides.schedule_days ?? [],
    schedule_periods: overrides.schedule_periods ?? [],
    competition_period_availability:
      overrides.competition_period_availability ?? [],
    team_competition_availability:
      overrides.team_competition_availability ?? [],
    individual_event_configs: overrides.individual_event_configs ?? [],
    individual_session_configs: overrides.individual_session_configs ?? [],
    resource_locks: overrides.resource_locks ?? [],
    knockout_program_blocks: overrides.knockout_program_blocks ?? [],
  };
}

type TestCourtSportPreference = NonNullable<
  ChampionshipBracketWizardDraftFormValues["schedule_days"][number]["locations"][number]["courts"][number]["sport_preference"]
>;

function sanitizeCourtSportPreference({
  teams,
  selectedCompetitionKeysByTeamId,
  sportPreference,
  seasonSettings = {
    division_format: ChampionshipSeasonDivisionFormat.SEPARATED,
    division_settlement_mode: ChampionshipSeasonDivisionSettlementMode.NONE,
    principal_slots_count: null,
    principal_relegation_count: null,
    access_promotion_count: null,
  },
}: {
  teams: Team[];
  selectedCompetitionKeysByTeamId: Record<string, string[]>;
  sportPreference: TestCourtSportPreference;
  seasonSettings?: ChampionshipBracketWizardDraftFormValues["season_settings"];
}) {
  const selectedTeamIds = teams.map((team) => team.id);

  const selectedSportIdsByTeamId = teams.reduce<Record<string, string[]>>(
    (carry, team) => {
      carry[team.id] = ["sport-1"];
      return carry;
    },
    {},
  );

  const sanitizedDraft = sanitizeChampionshipBracketWizardDraft({
    draftFormValues: buildDraft({
      season_settings: seasonSettings,

      enabled_sport_ids: ["sport-1"],

      selected_team_ids: selectedTeamIds,

      selected_sport_ids_by_team_id: selectedSportIdsByTeamId,

      selected_competition_keys_by_team_id: selectedCompetitionKeysByTeamId,

      schedule_days: [
        {
          id: "day-sequence",
          date: "2026-08-19",
          start_time: "08:00",
          end_time: "20:00",
          break_start_time: "",
          break_end_time: "",

          locations: [
            {
              id: "location-sequence",
              location_template_id: null,
              name: "Arena",
              position: 1,

              courts: [
                {
                  id: "court-sequence",
                  name: "Quadra Interna",
                  position: 1,
                  sport_ids: ["sport-1"],
                  sport_preference: sportPreference,
                },
              ],
            },
          ],
        },
      ],
    }),

    teams,

    championshipSports: [
      buildChampionshipSport({
        sport_id: "sport-1",

        naipe_mode: ChampionshipSportNaipeMode.MASCULINO_FEMININO,

        sports: {
          id: "sport-1",
          name: "Basquetebol",
          default_match_duration_minutes: 40,
          created_at: "2026-05-08T00:00:00.000Z",
        },
      }),
    ],

    seasonSettings,
  });

  return (
    sanitizedDraft.schedule_days[0]?.locations[0]?.courts[0]
      ?.sport_preference ?? null
  );
}

describe("sanitizeChampionshipBracketWizardDraft", () => {
  it("remove atléticas inválidas e limpa competições que deixaram de existir após mudança de divisão", () => {
    const principalCompetitionKey = "sport-1::MASCULINO::DIVISAO_PRINCIPAL";
    const accessCompetitionKey = "sport-1::MASCULINO::DIVISAO_ACESSO";
    const teams = [
      buildTeam({
        id: "team-principal",
        name: "Principal",
        division: TeamDivision.DIVISAO_PRINCIPAL,
      }),
      buildTeam({
        id: "team-access",
        name: "Acesso",
        division: TeamDivision.DIVISAO_ACESSO,
      }),
      buildTeam({
        id: "team-without-division",
        name: "Sem divisão",
        division: null,
      }),
    ];

    const sanitizedDraft = sanitizeChampionshipBracketWizardDraft({
      draftFormValues: buildDraft({
        selected_team_ids: [
          "team-principal",
          "team-access",
          "team-without-division",
        ],
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
      seasonSettings: {
        division_format: ChampionshipSeasonDivisionFormat.SEPARATED,
        division_settlement_mode: ChampionshipSeasonDivisionSettlementMode.NONE,
        principal_slots_count: null,
        principal_relegation_count: null,
        access_promotion_count: null,
      },
    });

    expect(sanitizedDraft.selected_team_ids).toEqual([
      "team-principal",
      "team-access",
    ]);
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

  it("remove atléticas somente de eventos mesmo em formato unificado", () => {
    const teams = [
      buildTeam({
        id: "team-principal",
        name: "Principal",
        division: TeamDivision.DIVISAO_PRINCIPAL,
      }),
      buildTeam({
        id: "team-access",
        name: "Acesso",
        division: TeamDivision.DIVISAO_ACESSO,
      }),
      buildTeam({
        id: "team-events-only",
        name: "Somente eventos",
        division: null,
      }),
    ];

    const sanitizedDraft = sanitizeChampionshipBracketWizardDraft({
      draftFormValues: buildDraft({
        selected_team_ids: [
          "team-principal",
          "team-access",
          "team-events-only",
        ],
        selected_sport_ids_by_team_id: {
          "team-principal": ["sport-1"],
          "team-access": ["sport-1"],
          "team-events-only": ["sport-1"],
        },
      }),
      teams,
      championshipSports: [buildChampionshipSport()],
      seasonSettings: {
        division_format: ChampionshipSeasonDivisionFormat.UNIFIED,
        division_settlement_mode: ChampionshipSeasonDivisionSettlementMode.NONE,
        principal_slots_count: null,
        principal_relegation_count: null,
        access_promotion_count: null,
      },
    });

    expect(sanitizedDraft.selected_team_ids).toEqual([
      "team-principal",
      "team-access",
    ]);
    expect(sanitizedDraft.selected_sport_ids_by_team_id).toEqual({
      "team-principal": ["sport-1"],
      "team-access": ["sport-1"],
    });
  });

  it("preserva apenas competições ativas com duas ou mais participantes e recalcula grupos com segurança", () => {
    const competitionKey = "sport-1::FEMININO::DIVISAO_PRINCIPAL";
    const teams = [
      buildTeam({
        id: "team-1",
        name: "Atlética 1",
        division: TeamDivision.DIVISAO_PRINCIPAL,
      }),
      buildTeam({
        id: "team-2",
        name: "Atlética 2",
        division: TeamDivision.DIVISAO_PRINCIPAL,
      }),
      buildTeam({
        id: "team-3",
        name: "Atlética 3",
        division: TeamDivision.DIVISAO_PRINCIPAL,
      }),
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
      championshipSports: [
        buildChampionshipSport({
          naipe_mode: ChampionshipSportNaipeMode.MASCULINO_FEMININO,
        }),
      ],
      seasonSettings: {
        division_format: ChampionshipSeasonDivisionFormat.SEPARATED,
        division_settlement_mode: ChampionshipSeasonDivisionSettlementMode.NONE,
        principal_slots_count: null,
        principal_relegation_count: null,
        access_promotion_count: null,
      },
    });

    expect(sanitizedDraft.competition_config_by_key[competitionKey]).toEqual({
      groups_count: 2,
      qualifiers_per_group: 1,
      should_complete_knockout_with_best_second_placed_teams: true,
      knockout_pairing_mode: "LINEAR",
    });
    expect(
      Object.keys(
        sanitizedDraft.group_assignments_by_competition_key[competitionKey] ??
          {},
      ),
    ).toEqual(["team-1", "team-2", "team-3"]);
    expect(
      sanitizedDraft.group_assignments_by_competition_key[competitionKey],
    ).toEqual({
      "team-1": 1,
      "team-2": 2,
      "team-3": 2,
    });
    expect(
      sanitizedDraft.group_order_by_competition_key[competitionKey],
    ).toEqual({
      "1": ["team-1"],
      "2": ["team-3", "team-2"],
    });
  });

  it("aplica LINEAR como padrão mesmo no feminino da divisão de acesso do Futebol Society", () => {
    const competitionKey = "sport-society::FEMININO::DIVISAO_ACESSO";
    const teams = [
      buildTeam({
        id: "team-1",
        name: "Atlética 1",
        division: TeamDivision.DIVISAO_ACESSO,
      }),
      buildTeam({
        id: "team-2",
        name: "Atlética 2",
        division: TeamDivision.DIVISAO_ACESSO,
      }),
    ];

    const sanitizedDraft = sanitizeChampionshipBracketWizardDraft({
      draftFormValues: buildDraft({
        enabled_sport_ids: ["sport-society"],
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
      seasonSettings: {
        division_format: ChampionshipSeasonDivisionFormat.SEPARATED,
        division_settlement_mode: ChampionshipSeasonDivisionSettlementMode.NONE,
        principal_slots_count: null,
        principal_relegation_count: null,
        access_promotion_count: null,
      },
    });

    expect(sanitizedDraft.competition_config_by_key[competitionKey]).toEqual({
      groups_count: 2,
      qualifiers_per_group: 1,
      should_complete_knockout_with_best_second_placed_teams: true,
      knockout_pairing_mode: "LINEAR",
    });
  });

  it("sanitiza períodos, disponibilidades e configs individuais conforme agenda e competições ativas", () => {
    const competitionKey = "sport-collective::MASCULINO::WITHOUT_DIVISION";
    const teams = [
      buildTeam({
        id: "team-1",
        name: "Atlética 1",
        division: TeamDivision.DIVISAO_PRINCIPAL,
      }),
      buildTeam({
        id: "team-2",
        name: "Atlética 2",
        division: TeamDivision.DIVISAO_ACESSO,
      }),
    ];

    const sanitizedDraft = sanitizeChampionshipBracketWizardDraft({
      draftFormValues: buildDraft({
        season_settings: {
          division_format: ChampionshipSeasonDivisionFormat.UNIFIED,
          division_settlement_mode:
            ChampionshipSeasonDivisionSettlementMode.NONE,
          principal_slots_count: null,
          principal_relegation_count: null,
          access_promotion_count: null,
        },
        enabled_sport_ids: ["sport-collective", "sport-individual"],
        selected_team_ids: teams.map((team) => team.id),
        selected_sport_ids_by_team_id: {
          "team-1": ["sport-collective", "sport-individual"],
          "team-2": ["sport-collective", "sport-individual"],
        },
        selected_competition_keys_by_team_id: {
          "team-1": [competitionKey],
          "team-2": [competitionKey],
        },
        schedule_days: [
          {
            id: "day-1",
            date: "2026-09-12",
            start_time: "08:00",
            end_time: "18:00",
            break_start_time: "",
            break_end_time: "",
            locations: [],
          },
        ],
        schedule_periods: [
          {
            date: "2026-09-12",
            period: ChampionshipSchedulePeriod.MATUTINO,
            enabled: false,
          },
        ],
        competition_period_availability: [
          {
            competition_key: competitionKey,
            date: "2026-09-12",
            period: ChampionshipSchedulePeriod.VESPERTINO,
            enabled: false,
          },
          {
            competition_key: "invalid::competition",
            date: "2026-09-12",
            period: ChampionshipSchedulePeriod.MATUTINO,
            enabled: false,
          },
        ],
        team_competition_availability: [
          {
            team_id: "team-1",
            competition_key: competitionKey,
            date: "2026-09-12",
            period: ChampionshipSchedulePeriod.VESPERTINO,
            enabled: false,
          },
          {
            team_id: "team-x",
            competition_key: competitionKey,
            date: "2026-09-12",
            period: ChampionshipSchedulePeriod.MATUTINO,
            enabled: false,
          },
        ],
        individual_event_configs: [
          {
            sport_id: "sport-individual",
            placements_count: 5,
            placement_points: [
              { placement: 1, points: 30 },
              { placement: 2, points: 25 },
              { placement: 3, points: 20 },
              { placement: 4, points: 15 },
              { placement: 5, points: 10 },
            ],
            relay_multiplier: 4,
          },
          {
            sport_id: "sport-invalid",
            placements_count: 3,
            placement_points: buildPlacementPoints(3),
            relay_multiplier: 9,
          },
        ],
      }),
      teams,
      championshipSports: [
        buildChampionshipSport({
          sport_id: "sport-collective",
          sports: {
            id: "sport-collective",
            name: "Futsal",
            default_match_duration_minutes: 40,
            created_at: "2026-05-08T00:00:00.000Z",
          },
        }),
        buildChampionshipSport({
          sport_id: "sport-individual",
          sports: {
            id: "sport-individual",
            name: "Atletismo",
            default_match_duration_minutes: 0,
            created_at: "2026-05-08T00:00:00.000Z",
          },
        }),
      ],
      seasonSettings: {
        division_format: ChampionshipSeasonDivisionFormat.UNIFIED,
        division_settlement_mode: ChampionshipSeasonDivisionSettlementMode.NONE,
        principal_slots_count: null,
        principal_relegation_count: null,
        access_promotion_count: null,
      },
    });

    expect(sanitizedDraft.schedule_periods).toEqual([
      {
        date: "2026-09-12",
        period: ChampionshipSchedulePeriod.MATUTINO,
        enabled: false,
      },
      {
        date: "2026-09-12",
        period: ChampionshipSchedulePeriod.VESPERTINO,
        enabled: true,
      },
    ]);
    expect(sanitizedDraft.competition_period_availability).toEqual([
      {
        competition_key: competitionKey,
        date: "2026-09-12",
        period: ChampionshipSchedulePeriod.MATUTINO,
        enabled: true,
      },
      {
        competition_key: competitionKey,
        date: "2026-09-12",
        period: ChampionshipSchedulePeriod.VESPERTINO,
        enabled: false,
      },
    ]);
    expect(sanitizedDraft.team_competition_availability).toEqual([
      {
        team_id: "team-1",
        competition_key: competitionKey,
        date: "2026-09-12",
        period: ChampionshipSchedulePeriod.MATUTINO,
        enabled: true,
      },
      {
        team_id: "team-1",
        competition_key: competitionKey,
        date: "2026-09-12",
        period: ChampionshipSchedulePeriod.VESPERTINO,
        enabled: false,
      },
      {
        team_id: "team-2",
        competition_key: competitionKey,
        date: "2026-09-12",
        period: ChampionshipSchedulePeriod.MATUTINO,
        enabled: true,
      },
      {
        team_id: "team-2",
        competition_key: competitionKey,
        date: "2026-09-12",
        period: ChampionshipSchedulePeriod.VESPERTINO,
        enabled: true,
      },
    ]);
    expect(sanitizedDraft.individual_event_configs).toEqual([
      {
        sport_id: "sport-individual",
        placements_count: 5,
        placement_points: [
          { placement: 1, points: 30 },
          { placement: 2, points: 25 },
          { placement: 3, points: 20 },
          { placement: 4, points: 15 },
          { placement: 5, points: 10 },
        ],
        relay_multiplier: 4,
      },
    ]);
  });

  it("reidrata configurações individuais legadas com preset 24 a 1", () => {
    const sanitizedDraft = sanitizeChampionshipBracketWizardDraft({
      draftFormValues: buildDraft({
        enabled_sport_ids: ["sport-individual"],
        selected_team_ids: ["team-1"],
        selected_sport_ids_by_team_id: {
          "team-1": ["sport-individual"],
        },
        individual_event_configs: [
          {
            sport_id: "sport-individual",
            relay_multiplier: 3,
          } as ChampionshipBracketWizardDraftFormValues["individual_event_configs"][number],
        ],
      }),
      teams: [
        buildTeam({
          id: "team-1",
          name: "Atlética 1",
          division: TeamDivision.DIVISAO_PRINCIPAL,
        }),
      ],
      championshipSports: [
        buildChampionshipSport({
          sport_id: "sport-individual",
          sports: {
            id: "sport-individual",
            name: "Atletismo",
            default_match_duration_minutes: 0,
            created_at: "2026-05-08T00:00:00.000Z",
          },
        }),
      ],
      seasonSettings: {
        division_format: ChampionshipSeasonDivisionFormat.UNIFIED,
        division_settlement_mode: ChampionshipSeasonDivisionSettlementMode.NONE,
        principal_slots_count: null,
        principal_relegation_count: null,
        access_promotion_count: null,
      },
    });

    expect(sanitizedDraft.individual_event_configs).toEqual([
      {
        sport_id: "sport-individual",
        placements_count: 20,
        placement_points: buildPlacementPoints(),
        relay_multiplier: 3,
      },
    ]);
  });

  it("preserva a desativação explícita de todas as modalidades no draft", () => {
    const sanitizedDraft = sanitizeChampionshipBracketWizardDraft({
      draftFormValues: buildDraft({
        enabled_sport_ids: [],
        selected_team_ids: ["team-1"],
        selected_sport_ids_by_team_id: {
          "team-1": ["sport-1"],
        },
      }),
      teams: [
        buildTeam({
          id: "team-1",
          name: "Atlética 1",
          division: TeamDivision.DIVISAO_PRINCIPAL,
        }),
      ],
      championshipSports: [buildChampionshipSport()],
      seasonSettings: {
        division_format: ChampionshipSeasonDivisionFormat.SEPARATED,
        division_settlement_mode: ChampionshipSeasonDivisionSettlementMode.NONE,
        principal_slots_count: null,
        principal_relegation_count: null,
        access_promotion_count: null,
      },
    });

    expect(sanitizedDraft.enabled_sport_ids).toEqual([]);
    expect(sanitizedDraft.selected_sport_ids_by_team_id).toEqual({});
    expect(sanitizedDraft.selected_competition_keys_by_team_id).toEqual({});
  });

  it("preserva preferência válida da quadra e remove modalidades duplicadas", () => {
    const competitionKey = "sport-1::MASCULINO::DIVISAO_PRINCIPAL";

    const teams = [
      buildTeam({
        id: "team-1",
        name: "Atlética 1",
        division: TeamDivision.DIVISAO_PRINCIPAL,
      }),
      buildTeam({
        id: "team-2",
        name: "Atlética 2",
        division: TeamDivision.DIVISAO_PRINCIPAL,
      }),
    ];

    const sanitizedDraft = sanitizeChampionshipBracketWizardDraft({
      draftFormValues: buildDraft({
        enabled_sport_ids: ["sport-1"],

        selected_team_ids: ["team-1", "team-2"],

        selected_sport_ids_by_team_id: {
          "team-1": ["sport-1"],
          "team-2": ["sport-1"],
        },

        selected_competition_keys_by_team_id: {
          "team-1": [competitionKey],
          "team-2": [competitionKey],
        },

        schedule_days: [
          {
            id: "day-1",
            date: "2026-08-19",
            start_time: "08:00",
            end_time: "20:00",
            break_start_time: "",
            break_end_time: "",

            locations: [
              {
                id: "location-1",
                location_template_id: null,
                name: "Arena",
                position: 1,

                courts: [
                  {
                    id: "court-1",
                    name: "Quadra Interna",
                    position: 1,

                    sport_ids: ["sport-1", "sport-1"],

                    sport_preference: {
                      preferred_sport_id: "sport-1",

                      preferred_naipe: MatchNaipe.MASCULINO,

                      preferred_division: TeamDivision.DIVISAO_PRINCIPAL,

                      sequence_mode: "FLEXIBLE",
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),

      teams,

      championshipSports: [
        buildChampionshipSport({
          sport_id: "sport-1",

          sports: {
            id: "sport-1",
            name: "Basquetebol",
            default_match_duration_minutes: 40,
            created_at: "2026-05-08T00:00:00.000Z",
          },
        }),
      ],

      seasonSettings: {
        division_format: ChampionshipSeasonDivisionFormat.SEPARATED,

        division_settlement_mode: ChampionshipSeasonDivisionSettlementMode.NONE,

        principal_slots_count: null,
        principal_relegation_count: null,
        access_promotion_count: null,
      },
    });

    const sanitizedCourt =
      sanitizedDraft.schedule_days[0]?.locations[0]?.courts[0];

    expect(sanitizedCourt?.sport_ids).toEqual(["sport-1"]);

    expect(sanitizedCourt?.sport_preference).toEqual({
      preferred_sport_id: "sport-1",
      preferred_naipe: MatchNaipe.MASCULINO,
      preferred_division: TeamDivision.DIVISAO_PRINCIPAL,
      sequence_mode: "FLEXIBLE",
    });
  });

  it("remove refinamentos indisponíveis sem remover a modalidade preferencial", () => {
    const competitionKey = "sport-1::MASCULINO::DIVISAO_PRINCIPAL";

    const teams = [
      buildTeam({
        id: "team-1",
        name: "Atlética 1",
        division: TeamDivision.DIVISAO_PRINCIPAL,
      }),
      buildTeam({
        id: "team-2",
        name: "Atlética 2",
        division: TeamDivision.DIVISAO_PRINCIPAL,
      }),
    ];

    const sanitizedDraft = sanitizeChampionshipBracketWizardDraft({
      draftFormValues: buildDraft({
        enabled_sport_ids: ["sport-1"],

        selected_team_ids: ["team-1", "team-2"],

        selected_sport_ids_by_team_id: {
          "team-1": ["sport-1"],
          "team-2": ["sport-1"],
        },

        selected_competition_keys_by_team_id: {
          "team-1": [competitionKey],
          "team-2": [competitionKey],
        },

        schedule_days: [
          {
            id: "day-1",
            date: "2026-08-19",
            start_time: "08:00",
            end_time: "20:00",
            break_start_time: "",
            break_end_time: "",

            locations: [
              {
                id: "location-1",
                location_template_id: null,
                name: "Arena",
                position: 1,

                courts: [
                  {
                    id: "court-1",
                    name: "Quadra Interna",
                    position: 1,
                    sport_ids: ["sport-1"],

                    sport_preference: {
                      preferred_sport_id: "sport-1",

                      preferred_naipe: MatchNaipe.FEMININO,

                      preferred_division: TeamDivision.DIVISAO_ACESSO,

                      sequence_mode: "FLEXIBLE",
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),

      teams,

      championshipSports: [
        buildChampionshipSport({
          sport_id: "sport-1",

          sports: {
            id: "sport-1",
            name: "Basquetebol",
            default_match_duration_minutes: 40,
            created_at: "2026-05-08T00:00:00.000Z",
          },
        }),
      ],

      seasonSettings: {
        division_format: ChampionshipSeasonDivisionFormat.SEPARATED,

        division_settlement_mode: ChampionshipSeasonDivisionSettlementMode.NONE,

        principal_slots_count: null,
        principal_relegation_count: null,
        access_promotion_count: null,
      },
    });

    expect(
      sanitizedDraft.schedule_days[0]?.locations[0]?.courts[0]
        ?.sport_preference,
    ).toEqual({
      preferred_sport_id: "sport-1",
      preferred_naipe: null,
      preferred_division: null,
      sequence_mode: "FLEXIBLE",
    });
  });

  it("remove preferência cuja modalidade não está mais disponível na quadra", () => {
    const competitionKey = "sport-1::MASCULINO::DIVISAO_PRINCIPAL";

    const teams = [
      buildTeam({
        id: "team-1",
        name: "Atlética 1",
        division: TeamDivision.DIVISAO_PRINCIPAL,
      }),
      buildTeam({
        id: "team-2",
        name: "Atlética 2",
        division: TeamDivision.DIVISAO_PRINCIPAL,
      }),
    ];

    const sanitizedDraft = sanitizeChampionshipBracketWizardDraft({
      draftFormValues: buildDraft({
        enabled_sport_ids: ["sport-1"],

        selected_team_ids: ["team-1", "team-2"],

        selected_sport_ids_by_team_id: {
          "team-1": ["sport-1"],
          "team-2": ["sport-1"],
        },

        selected_competition_keys_by_team_id: {
          "team-1": [competitionKey],
          "team-2": [competitionKey],
        },

        schedule_days: [
          {
            id: "day-1",
            date: "2026-08-19",
            start_time: "08:00",
            end_time: "20:00",
            break_start_time: "",
            break_end_time: "",

            locations: [
              {
                id: "location-1",
                location_template_id: null,
                name: "Arena",
                position: 1,

                courts: [
                  {
                    id: "court-1",
                    name: "Quadra Interna",
                    position: 1,
                    sport_ids: ["sport-1"],

                    sport_preference: {
                      preferred_sport_id: "sport-x",

                      preferred_naipe: null,
                      preferred_division: null,
                      sequence_mode: "FLEXIBLE",
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),

      teams,

      championshipSports: [
        buildChampionshipSport({
          sport_id: "sport-1",

          sports: {
            id: "sport-1",
            name: "Basquetebol",
            default_match_duration_minutes: 40,
            created_at: "2026-05-08T00:00:00.000Z",
          },
        }),
      ],

      seasonSettings: {
        division_format: ChampionshipSeasonDivisionFormat.SEPARATED,

        division_settlement_mode: ChampionshipSeasonDivisionSettlementMode.NONE,

        principal_slots_count: null,
        principal_relegation_count: null,
        access_promotion_count: null,
      },
    });

    expect(
      sanitizedDraft.schedule_days[0]?.locations[0]?.courts[0]
        ?.sport_preference,
    ).toBeNull();
  });

  it("preserva agrupamento válido por naipe", () => {
    const masculineCompetitionKey = "sport-1::MASCULINO::DIVISAO_PRINCIPAL";

    const feminineCompetitionKey = "sport-1::FEMININO::DIVISAO_PRINCIPAL";

    const teams = [
      buildTeam({
        id: "team-1",
        name: "Atlética 1",
        division: TeamDivision.DIVISAO_PRINCIPAL,
      }),

      buildTeam({
        id: "team-2",
        name: "Atlética 2",
        division: TeamDivision.DIVISAO_PRINCIPAL,
      }),
    ];

    const sanitizedPreference = sanitizeCourtSportPreference({
      teams,

      selectedCompetitionKeysByTeamId: {
        "team-1": [masculineCompetitionKey, feminineCompetitionKey],

        "team-2": [masculineCompetitionKey, feminineCompetitionKey],
      },

      sportPreference: {
        preferred_sport_id: "sport-1",
        preferred_naipe: MatchNaipe.FEMININO,
        preferred_division: null,
        sequence_mode: "GROUP_NAIPE",
      },
    });

    expect(sanitizedPreference).toEqual({
      preferred_sport_id: "sport-1",
      preferred_naipe: MatchNaipe.FEMININO,
      preferred_division: null,
      sequence_mode: "GROUP_NAIPE",
    });
  });

  it("retorna agrupamento por naipe para FLEXIBLE quando existe apenas um naipe ativo", () => {
    const competitionKey = "sport-1::MASCULINO::DIVISAO_PRINCIPAL";

    const teams = [
      buildTeam({
        id: "team-1",
        name: "Atlética 1",
        division: TeamDivision.DIVISAO_PRINCIPAL,
      }),

      buildTeam({
        id: "team-2",
        name: "Atlética 2",
        division: TeamDivision.DIVISAO_PRINCIPAL,
      }),
    ];

    const sanitizedPreference = sanitizeCourtSportPreference({
      teams,

      selectedCompetitionKeysByTeamId: {
        "team-1": [competitionKey],
        "team-2": [competitionKey],
      },

      sportPreference: {
        preferred_sport_id: "sport-1",
        preferred_naipe: MatchNaipe.MASCULINO,
        preferred_division: null,
        sequence_mode: "GROUP_NAIPE",
      },
    });

    expect(sanitizedPreference).toEqual({
      preferred_sport_id: "sport-1",
      preferred_naipe: MatchNaipe.MASCULINO,
      preferred_division: null,
      sequence_mode: "FLEXIBLE",
    });
  });

  it("preserva agrupamento válido por divisão", () => {
    const principalCompetitionKey = "sport-1::MASCULINO::DIVISAO_PRINCIPAL";

    const accessCompetitionKey = "sport-1::MASCULINO::DIVISAO_ACESSO";

    const teams = [
      buildTeam({
        id: "team-principal-1",
        name: "Principal 1",
        division: TeamDivision.DIVISAO_PRINCIPAL,
      }),

      buildTeam({
        id: "team-principal-2",
        name: "Principal 2",
        division: TeamDivision.DIVISAO_PRINCIPAL,
      }),

      buildTeam({
        id: "team-access-1",
        name: "Acesso 1",
        division: TeamDivision.DIVISAO_ACESSO,
      }),

      buildTeam({
        id: "team-access-2",
        name: "Acesso 2",
        division: TeamDivision.DIVISAO_ACESSO,
      }),
    ];

    const sanitizedPreference = sanitizeCourtSportPreference({
      teams,

      selectedCompetitionKeysByTeamId: {
        "team-principal-1": [principalCompetitionKey],

        "team-principal-2": [principalCompetitionKey],

        "team-access-1": [accessCompetitionKey],

        "team-access-2": [accessCompetitionKey],
      },

      sportPreference: {
        preferred_sport_id: "sport-1",
        preferred_naipe: null,
        preferred_division: TeamDivision.DIVISAO_ACESSO,
        sequence_mode: "GROUP_DIVISION",
      },
    });

    expect(sanitizedPreference).toEqual({
      preferred_sport_id: "sport-1",
      preferred_naipe: null,
      preferred_division: TeamDivision.DIVISAO_ACESSO,
      sequence_mode: "GROUP_DIVISION",
    });
  });

  it("retorna agrupamento por divisão para FLEXIBLE quando existe apenas uma divisão ativa", () => {
    const competitionKey = "sport-1::MASCULINO::DIVISAO_PRINCIPAL";

    const teams = [
      buildTeam({
        id: "team-1",
        name: "Atlética 1",
        division: TeamDivision.DIVISAO_PRINCIPAL,
      }),

      buildTeam({
        id: "team-2",
        name: "Atlética 2",
        division: TeamDivision.DIVISAO_PRINCIPAL,
      }),
    ];

    const sanitizedPreference = sanitizeCourtSportPreference({
      teams,

      selectedCompetitionKeysByTeamId: {
        "team-1": [competitionKey],
        "team-2": [competitionKey],
      },

      sportPreference: {
        preferred_sport_id: "sport-1",
        preferred_naipe: null,
        preferred_division: TeamDivision.DIVISAO_PRINCIPAL,
        sequence_mode: "GROUP_DIVISION",
      },
    });

    expect(sanitizedPreference).toEqual({
      preferred_sport_id: "sport-1",
      preferred_naipe: null,
      preferred_division: TeamDivision.DIVISAO_PRINCIPAL,
      sequence_mode: "FLEXIBLE",
    });
  });

  it("sanitiza blocos manuais de final conforme esportes coletivos ativos e agenda", () => {
    const competitionKey = "sport-1::MASCULINO::DIVISAO_PRINCIPAL";
    const teams = [
      buildTeam({
        id: "team-1",
        name: "Atlética 1",
        division: TeamDivision.DIVISAO_PRINCIPAL,
      }),
      buildTeam({
        id: "team-2",
        name: "Atlética 2",
        division: TeamDivision.DIVISAO_PRINCIPAL,
      }),
    ];

    const sanitizedDraft = sanitizeChampionshipBracketWizardDraft({
      draftFormValues: buildDraft({
        enabled_sport_ids: ["sport-1"],
        selected_team_ids: ["team-1", "team-2"],
        selected_sport_ids_by_team_id: {
          "team-1": ["sport-1"],
          "team-2": ["sport-1"],
        },
        selected_competition_keys_by_team_id: {
          "team-1": [competitionKey],
          "team-2": [competitionKey],
        },
        schedule_days: [
          {
            id: "day-1",
            date: "2026-08-19",
            start_time: "08:00",
            end_time: "20:00",
            break_start_time: "",
            break_end_time: "",
            locations: [],
          },
        ],
        schedule_periods: [
          {
            date: "2026-08-19",
            period: ChampionshipSchedulePeriod.VESPERTINO,
            enabled: true,
          },
        ],
        knockout_program_blocks: [
          {
            date: "2026-08-19",
            period: ChampionshipSchedulePeriod.MATUTINO,
            location_key: "loc-1",
            court_key: "court-1",
            location_name: "Arena",
            court_name: "Quadra Interna",
            sport_id: "sport-1",
            phase: "FINAL",
            division_scope: TeamDivision.DIVISAO_PRINCIPAL,
            naipe_sequence: [MatchNaipe.MASCULINO],
            display_order: 9,
          },
          {
            date: "2026-08-19",
            period: ChampionshipSchedulePeriod.VESPERTINO,
            location_key: "loc-1",
            court_key: "court-1",
            location_name: "Arena",
            court_name: "Quadra Interna",
            sport_id: "sport-1",
            phase: "FINAL",
            division_scope: TeamDivision.DIVISAO_PRINCIPAL,
            naipe_sequence: [MatchNaipe.FEMININO, MatchNaipe.MASCULINO],
            display_order: 3,
          },
        ],
      }),
      teams,
      championshipSports: [
        buildChampionshipSport({
          sport_id: "sport-1",
          sports: {
            id: "sport-1",
            name: "Basquetebol",
            default_match_duration_minutes: 40,
            created_at: "2026-05-08T00:00:00.000Z",
          },
        }),
      ],
      seasonSettings: {
        division_format: ChampionshipSeasonDivisionFormat.SEPARATED,
        division_settlement_mode: ChampionshipSeasonDivisionSettlementMode.NONE,
        principal_slots_count: null,
        principal_relegation_count: null,
        access_promotion_count: null,
      },
    });

    expect(
      sanitizedDraft.knockout_program_blocks.map((programBlock) => ({
        period: programBlock.period,
        display_order: programBlock.display_order,
        naipe_sequence: programBlock.naipe_sequence,
      })),
    ).toEqual([
      {
        period: ChampionshipSchedulePeriod.VESPERTINO,
        display_order: 1,
        naipe_sequence: [MatchNaipe.MASCULINO],
      },
      {
        period: ChampionshipSchedulePeriod.MATUTINO,
        display_order: 2,
        naipe_sequence: [MatchNaipe.MASCULINO],
      },
    ]);
  });
});
