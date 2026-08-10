import { describe, expect, it } from "vitest";
import { ChampionshipBracketWizardDraftDTO } from "@/domain/championship-brackets/ChampionshipBracketWizardDraftDTO";
import type { ChampionshipBracketWizardDraftFormValues } from "@/domain/championship-brackets/championshipBracket.types";
import {
  ChampionshipSchedulePeriod,
  ChampionshipSeasonDivisionFormat,
  ChampionshipSeasonDivisionSettlementMode,
  MatchNaipe,
  TeamDivision,
} from "@/lib/enums";

function buildPlacementPoints(count = 20) {
  const defaults = [
    24, 22, 20, 18, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
  ];
  return Array.from({ length: count }, (_, index) => ({
    placement: index + 1,
    points: defaults[index] ?? null,
  }));
}

function buildStoredScheduleDays({
  sportIds = ["sport-1", "sport-1"],
  sportPreference,
  sportPriorities,
  sportMatchTargets,
  startTime = "08:00",
  endTime = "18:00",
  breakStartTime = "",
  breakEndTime = "",
}: {
  sportIds?: string[];
  sportPreference?: unknown;
  sportPriorities?: unknown;
  sportMatchTargets?: unknown;
  startTime?: string;
  endTime?: string;
  breakStartTime?: string;
  breakEndTime?: string;
} = {}) {
  const storedCourt: Record<string, unknown> = {
    id: "court-1",
    name: "Quadra 1",
    position: 1,
    sport_ids: sportIds,
  };

  if (sportPreference !== undefined) {
    storedCourt.sport_preference = sportPreference;
  }

  if (sportPriorities !== undefined) {
    storedCourt.sport_priorities = sportPriorities;
  }

  if (sportMatchTargets !== undefined) {
    storedCourt.sport_match_targets = sportMatchTargets;
  }

  return [
    {
      id: "day-1",
      date: "2026-08-19",
      start_time: startTime,
      end_time: endTime,
      break_start_time: breakStartTime,
      break_end_time: breakEndTime,
      locations: [
        {
          id: "location-1",
          location_template_id: null,
          name: "Arena",
          position: 1,
          courts: [storedCourt],
        },
      ],
    },
  ];
}

function buildDraft(
  overrides: Partial<ChampionshipBracketWizardDraftFormValues> = {},
): ChampionshipBracketWizardDraftFormValues {
  return {
    current_step_index: overrides.current_step_index ?? 0,
    season_settings: overrides.season_settings ?? {
      division_format: ChampionshipSeasonDivisionFormat.SEPARATED,
      division_settlement_mode: ChampionshipSeasonDivisionSettlementMode.NONE,
      principal_slots_count: null,
      principal_relegation_count: null,
      access_promotion_count: null,
    },
    enabled_sport_ids: overrides.enabled_sport_ids ?? [],
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
    match_numbering_mode: overrides.match_numbering_mode ?? "COURT",
    knockout_program_blocks: overrides.knockout_program_blocks ?? [],
  };
}

function buildLegacyAvailabilityStorageValue({
  matutinoEnabled,
  vespertinoEnabled,
  startTime = "08:00",
  endTime = "18:00",
  breakStartTime = "",
  breakEndTime = "",
}: {
  matutinoEnabled: boolean;
  vespertinoEnabled: boolean;
  startTime?: string;
  endTime?: string;
  breakStartTime?: string;
  breakEndTime?: string;
}) {
  const competitionKey = "sport-1::MASCULINO::DIVISAO_PRINCIPAL";

  return JSON.stringify({
    ...buildDraft(),
    step_flow_version: 2,
    selected_competition_keys_by_team_id: {
      "team-1": [competitionKey],
    },
    schedule_days: buildStoredScheduleDays({
      startTime,
      endTime,
      breakStartTime,
      breakEndTime,
    }),
    schedule_periods: [
      {
        date: "2026-08-19",
        period: ChampionshipSchedulePeriod.MATUTINO,
        enabled: true,
      },
      {
        date: "2026-08-19",
        period: ChampionshipSchedulePeriod.VESPERTINO,
        enabled: true,
      },
    ],
    competition_period_availability: [
      {
        competition_key: competitionKey,
        date: "2026-08-19",
        period: ChampionshipSchedulePeriod.MATUTINO,
        enabled: matutinoEnabled,
      },
      {
        competition_key: competitionKey,
        date: "2026-08-19",
        period: ChampionshipSchedulePeriod.VESPERTINO,
        enabled: vespertinoEnabled,
      },
    ],
    team_competition_availability: [
      {
        team_id: "team-1",
        competition_key: competitionKey,
        date: "2026-08-19",
        period: ChampionshipSchedulePeriod.MATUTINO,
        enabled: matutinoEnabled,
      },
      {
        team_id: "team-1",
        competition_key: competitionKey,
        date: "2026-08-19",
        period: ChampionshipSchedulePeriod.VESPERTINO,
        enabled: vespertinoEnabled,
      },
    ],
  });
}

describe("ChampionshipBracketWizardDraftDTO", () => {
  it("salva drafts novos com a versão atual do fluxo", () => {
    const dto = ChampionshipBracketWizardDraftDTO.fromFormValues(
      buildDraft({ current_step_index: 6 }),
    );

    expect(dto.bindToSave().step_flow_version).toBe(2);
    expect(dto.bindToSave().current_step_index).toBe(6);
  });

  it("remapeia índice legado 6 para a nova etapa 12 de sorteio", () => {
    const dto = ChampionshipBracketWizardDraftDTO.fromStorageValue(
      JSON.stringify(buildDraft({ current_step_index: 6 })),
    );

    expect(dto?.bindToSave().step_flow_version).toBe(2);
    expect(dto?.bindToSave().current_step_index).toBe(11);
  });

  it("remapeia índice legado 7 para a nova etapa 7 de agenda", () => {
    const dto = ChampionshipBracketWizardDraftDTO.fromStorageValue(
      JSON.stringify(buildDraft({ current_step_index: 7 })),
    );

    expect(dto?.bindToSave().current_step_index).toBe(6);
  });

  it("preserva drafts já salvos com a versão nova", () => {
    const dto = ChampionshipBracketWizardDraftDTO.fromStorageValue(
      JSON.stringify({
        ...buildDraft({ current_step_index: 11 }),
        step_flow_version: 2,
      }),
    );

    expect(dto?.bindToSave().step_flow_version).toBe(2);
    expect(dto?.bindToSave().current_step_index).toBe(11);
  });

  it("normaliza modo de numeração ausente em draft legado para COURT", () => {
    const dto = ChampionshipBracketWizardDraftDTO.fromStorageValue(
      JSON.stringify({
        step_flow_version: 2,
        current_step_index: 10,
      }),
    );

    expect(dto?.bindToSave().match_numbering_mode).toBe("COURT");
  });

  it("preserva modo de numeração SPORT_NAIPE ao carregar e salvar", () => {
    const dto = ChampionshipBracketWizardDraftDTO.fromStorageValue(
      JSON.stringify({
        ...buildDraft({
          match_numbering_mode: "SPORT_NAIPE",
        }),
        step_flow_version: 2,
      }),
    );

    expect(dto?.bindToSave().match_numbering_mode).toBe("SPORT_NAIPE");
  });

  it("preserva a preferência singular da quadra ao carregar e salvar", () => {
    const dto = ChampionshipBracketWizardDraftDTO.fromStorageValue(
      JSON.stringify({
        ...buildDraft(),
        step_flow_version: 2,
        schedule_days: buildStoredScheduleDays({
          sportPreference: {
            preferred_sport_id: "sport-1",
            preferred_naipe: MatchNaipe.MASCULINO,
            preferred_division: TeamDivision.DIVISAO_PRINCIPAL,
            sequence_mode: "FLEXIBLE",
          },
        }),
      }),
    );

    const savedCourt =
      dto?.bindToSave().schedule_days[0]?.locations[0]?.courts[0];

    expect(savedCourt?.sport_ids).toEqual(["sport-1"]);

    expect(savedCourt?.sport_preference).toEqual({
      preferred_sport_id: "sport-1",
      preferred_naipe: MatchNaipe.MASCULINO,
      preferred_division: TeamDivision.DIVISAO_PRINCIPAL,
      sequence_mode: "FLEXIBLE",
    });
  });

  it("converte a primeira prioridade legada válida para preferência singular", () => {
    const dto = ChampionshipBracketWizardDraftDTO.fromStorageValue(
      JSON.stringify({
        ...buildDraft(),
        step_flow_version: 2,
        schedule_days: buildStoredScheduleDays({
          sportPriorities: [
            {
              sport_id: "sport-x",
              preferred_naipe: MatchNaipe.MASCULINO,
              preferred_division: null,
            },
            {
              sport_id: "sport-1",
              preferred_naipe: MatchNaipe.FEMININO,
              preferred_division: TeamDivision.DIVISAO_PRINCIPAL,
            },
            {
              sport_id: "sport-1",
              preferred_naipe: null,
              preferred_division: null,
            },
          ],
        }),
      }),
    );

    const savedPreference =
      dto?.bindToSave().schedule_days[0]?.locations[0]?.courts[0]
        ?.sport_preference;

    expect(savedPreference).toEqual({
      preferred_sport_id: "sport-1",
      preferred_naipe: MatchNaipe.FEMININO,
      preferred_division: TeamDivision.DIVISAO_PRINCIPAL,
      sequence_mode: "FLEXIBLE",
    });
  });

  it("remove preferência cuja modalidade não pertence à quadra", () => {
    const dto = ChampionshipBracketWizardDraftDTO.fromStorageValue(
      JSON.stringify({
        ...buildDraft(),
        step_flow_version: 2,
        schedule_days: buildStoredScheduleDays({
          sportPreference: {
            preferred_sport_id: "sport-x",
            preferred_naipe: MatchNaipe.MASCULINO,
            preferred_division: null,
          },
        }),
      }),
    );

    const savedPreference =
      dto?.bindToSave().schedule_days[0]?.locations[0]?.courts[0]
        ?.sport_preference;

    expect(savedPreference).toBeNull();
  });

  it("remove divisão preferencial ao salvar temporada unificada", () => {
    const dto = ChampionshipBracketWizardDraftDTO.fromStorageValue(
      JSON.stringify({
        ...buildDraft(),
        step_flow_version: 2,
        season_settings: {
          division_format: ChampionshipSeasonDivisionFormat.UNIFIED,
          division_settlement_mode:
            ChampionshipSeasonDivisionSettlementMode.NONE,
          principal_slots_count: null,
          principal_relegation_count: null,
          access_promotion_count: null,
        },
        schedule_days: buildStoredScheduleDays({
          sportPreference: {
            preferred_sport_id: "sport-1",
            preferred_naipe: MatchNaipe.MASCULINO,
            preferred_division: TeamDivision.DIVISAO_PRINCIPAL,
            sequence_mode: "FLEXIBLE",
          },
        }),
      }),
    );

    const savedPreference =
      dto?.bindToSave().schedule_days[0]?.locations[0]?.courts[0]
        ?.sport_preference;

    expect(savedPreference).toEqual({
      preferred_sport_id: "sport-1",
      preferred_naipe: MatchNaipe.MASCULINO,
      preferred_division: null,
      sequence_mode: "FLEXIBLE",
    });
  });

  it("converte preferência antiga sem sequence_mode para FLEXIBLE", () => {
    const dto = ChampionshipBracketWizardDraftDTO.fromStorageValue(
      JSON.stringify({
        ...buildDraft(),
        step_flow_version: 2,

        schedule_days: buildStoredScheduleDays({
          sportPreference: {
            preferred_sport_id: "sport-1",
            preferred_naipe: MatchNaipe.MASCULINO,
            preferred_division: TeamDivision.DIVISAO_PRINCIPAL,
          },
        }),
      }),
    );

    const savedPreference =
      dto?.bindToSave().schedule_days[0]?.locations[0]?.courts[0]
        ?.sport_preference;

    expect(savedPreference).toEqual({
      preferred_sport_id: "sport-1",
      preferred_naipe: MatchNaipe.MASCULINO,
      preferred_division: TeamDivision.DIVISAO_PRINCIPAL,
      sequence_mode: "FLEXIBLE",
    });
  });

  it("converte disponibilidade legada matutino e vespertino para dia inteiro", () => {
    const dto = ChampionshipBracketWizardDraftDTO.fromStorageValue(
      buildLegacyAvailabilityStorageValue({
        matutinoEnabled: true,
        vespertinoEnabled: true,
      }),
    );

    const savedDraft = dto?.bindToSave();

    expect(savedDraft?.competition_date_availability).toEqual([
      {
        competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
        date: "2026-08-19",
        mode: "FULL_DAY",
        windows: [],
      },
    ]);

    expect(savedDraft?.team_competition_date_availability).toEqual([
      {
        team_id: "team-1",
        competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
        date: "2026-08-19",
        mode: "FULL_DAY",
        windows: [],
      },
    ]);
  });

  it("converte somente matutino usando o intervalo real do dia", () => {
    const dto = ChampionshipBracketWizardDraftDTO.fromStorageValue(
      buildLegacyAvailabilityStorageValue({
        matutinoEnabled: true,
        vespertinoEnabled: false,
        startTime: "08:00",
        endTime: "18:00",
        breakStartTime: "12:00",
        breakEndTime: "13:30",
      }),
    );

    const savedDraft = dto?.bindToSave();

    expect(savedDraft?.competition_date_availability).toEqual([
      {
        competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
        date: "2026-08-19",
        mode: "CUSTOM",
        windows: [
          {
            start_time: "08:00",
            end_time: "12:00",
          },
        ],
      },
    ]);

    expect(savedDraft?.team_competition_date_availability).toEqual([
      {
        team_id: "team-1",
        competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
        date: "2026-08-19",
        mode: "CUSTOM",
        windows: [
          {
            start_time: "08:00",
            end_time: "12:00",
          },
        ],
      },
    ]);
  });

  it("converte somente vespertino usando o ponto médio quando não há intervalo", () => {
    const dto = ChampionshipBracketWizardDraftDTO.fromStorageValue(
      buildLegacyAvailabilityStorageValue({
        matutinoEnabled: false,
        vespertinoEnabled: true,
        startTime: "08:00",
        endTime: "18:00",
      }),
    );

    const savedDraft = dto?.bindToSave();

    expect(savedDraft?.competition_date_availability).toEqual([
      {
        competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
        date: "2026-08-19",
        mode: "CUSTOM",
        windows: [
          {
            start_time: "13:00",
            end_time: "18:00",
          },
        ],
      },
    ]);

    expect(savedDraft?.team_competition_date_availability).toEqual([
      {
        team_id: "team-1",
        competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
        date: "2026-08-19",
        mode: "CUSTOM",
        windows: [
          {
            start_time: "13:00",
            end_time: "18:00",
          },
        ],
      },
    ]);
  });

  it("converte matutino e vespertino indisponíveis para dia indisponível", () => {
    const dto = ChampionshipBracketWizardDraftDTO.fromStorageValue(
      buildLegacyAvailabilityStorageValue({
        matutinoEnabled: false,
        vespertinoEnabled: false,
      }),
    );

    const savedDraft = dto?.bindToSave();

    expect(savedDraft?.competition_date_availability).toEqual([
      {
        competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
        date: "2026-08-19",
        mode: "UNAVAILABLE",
        windows: [],
      },
    ]);

    expect(savedDraft?.team_competition_date_availability).toEqual([
      {
        team_id: "team-1",
        competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
        date: "2026-08-19",
        mode: "UNAVAILABLE",
        windows: [],
      },
    ]);
  });

  it("preserva agrupamento por naipe ao carregar e salvar", () => {
    const dto = ChampionshipBracketWizardDraftDTO.fromStorageValue(
      JSON.stringify({
        ...buildDraft(),
        step_flow_version: 2,

        schedule_days: buildStoredScheduleDays({
          sportPreference: {
            preferred_sport_id: "sport-1",
            preferred_naipe: MatchNaipe.FEMININO,
            preferred_division: null,
            sequence_mode: "GROUP_NAIPE",
          },
        }),
      }),
    );

    const savedPreference =
      dto?.bindToSave().schedule_days[0]?.locations[0]?.courts[0]
        ?.sport_preference;

    expect(savedPreference).toEqual({
      preferred_sport_id: "sport-1",
      preferred_naipe: MatchNaipe.FEMININO,
      preferred_division: null,
      sequence_mode: "GROUP_NAIPE",
    });
  });

  it("preserva agrupamento por divisão ao carregar e salvar", () => {
    const dto = ChampionshipBracketWizardDraftDTO.fromStorageValue(
      JSON.stringify({
        ...buildDraft(),
        step_flow_version: 2,

        schedule_days: buildStoredScheduleDays({
          sportPreference: {
            preferred_sport_id: "sport-1",
            preferred_naipe: null,
            preferred_division: TeamDivision.DIVISAO_ACESSO,
            sequence_mode: "GROUP_DIVISION",
          },
        }),
      }),
    );

    const savedPreference =
      dto?.bindToSave().schedule_days[0]?.locations[0]?.courts[0]
        ?.sport_preference;

    expect(savedPreference).toEqual({
      preferred_sport_id: "sport-1",
      preferred_naipe: null,
      preferred_division: TeamDivision.DIVISAO_ACESSO,
      sequence_mode: "GROUP_DIVISION",
    });
  });

  it("normaliza modo de sequenciamento desconhecido para FLEXIBLE", () => {
    const dto = ChampionshipBracketWizardDraftDTO.fromStorageValue(
      JSON.stringify({
        ...buildDraft(),
        step_flow_version: 2,

        schedule_days: buildStoredScheduleDays({
          sportPreference: {
            preferred_sport_id: "sport-1",
            preferred_naipe: MatchNaipe.MASCULINO,
            preferred_division: null,
            sequence_mode: "UNKNOWN",
          },
        }),
      }),
    );

    const savedPreference =
      dto?.bindToSave().schedule_days[0]?.locations[0]?.courts[0]
        ?.sport_preference;

    expect(savedPreference).toEqual({
      preferred_sport_id: "sport-1",
      preferred_naipe: MatchNaipe.MASCULINO,
      preferred_division: null,
      sequence_mode: "FLEXIBLE",
    });
  });

  it("normaliza drafts antigos sem metas de jogos para lista vazia", () => {
    const dto = ChampionshipBracketWizardDraftDTO.fromStorageValue(
      JSON.stringify({
        ...buildDraft(),
        step_flow_version: 2,
        schedule_days: buildStoredScheduleDays({
          sportIds: ["sport-1"],
        }),
      }),
    );

    const savedCourt =
      dto?.bindToSave().schedule_days[0]?.locations[0]?.courts[0];

    expect(savedCourt?.sport_match_targets).toEqual([]);
  });

  it("preserva e normaliza metas de jogos por modalidade da quadra", () => {
    const dto = ChampionshipBracketWizardDraftDTO.fromStorageValue(
      JSON.stringify({
        ...buildDraft(),
        step_flow_version: 2,
        schedule_days: buildStoredScheduleDays({
          sportIds: ["sport-1", "sport-2"],
          sportMatchTargets: [
            {
              sport_id: "sport-1",
              planned_match_count: 12,
            },
            {
              sport_id: "sport-x",
              planned_match_count: 20,
            },
            {
              sport_id: "sport-2",
              planned_match_count: 0,
            },
            {
              sport_id: "sport-2",
              planned_match_count: 7,
            },
            {
              sport_id: "sport-1",
              planned_match_count: 14,
            },
            {
              sport_id: "sport-2",
              planned_match_count: 4.5,
            },
          ],
        }),
      }),
    );

    const savedCourt =
      dto?.bindToSave().schedule_days[0]?.locations[0]?.courts[0];

    expect(savedCourt?.sport_match_targets).toEqual([
      {
        sport_id: "sport-1",
        planned_match_count: 14,
      },
      {
        sport_id: "sport-2",
        planned_match_count: 7,
      },
    ]);
  });

  it("normaliza config legada de modalidades individuais ao carregar do storage", () => {
    const dto = ChampionshipBracketWizardDraftDTO.fromStorageValue(
      JSON.stringify({
        ...buildDraft(),
        individual_event_configs: [
          {
            sport_id: "sport-1",
            scoring_mode: "DEFAULT_24_TO_1",
            relay_multiplier: 4,
          },
        ],
      }),
    );

    expect(dto?.bindToSave().individual_event_configs).toEqual([
      {
        sport_id: "sport-1",
        placements_count: 20,
        placement_points: buildPlacementPoints(),
        relay_multiplier: 4,
      },
    ]);
  });

  it("ordena e renumera os blocos manuais de finais ao carregar o rascunho", () => {
    const dto = ChampionshipBracketWizardDraftDTO.fromStorageValue(
      JSON.stringify({
        ...buildDraft(),
        step_flow_version: 2,
        knockout_program_blocks: [
          {
            date: "2026-08-19",
            period: ChampionshipSchedulePeriod.VESPERTINO,
            location_key: "loc-final",
            court_key: "court-second",
            location_name: "Arena",
            court_name: "Quadra 2",
            sport_id: "sport-1",
            phase: "FINAL",
            division_scope: "ALL",
            naipe_sequence: [MatchNaipe.MASCULINO],
            match_duration_minutes_override: null,
            display_order: 8,
          },
          {
            date: "2026-08-19",
            period: ChampionshipSchedulePeriod.VESPERTINO,
            location_key: "loc-final",
            court_key: "court-first",
            location_name: "Arena",
            court_name: "Quadra 1",
            sport_id: "sport-1",
            phase: "FINAL",
            division_scope: "ALL",
            naipe_sequence: [MatchNaipe.FEMININO],
            match_duration_minutes_override: null,
            display_order: 2,
          },
        ],
      }),
    );

    const savedBlocks = dto?.bindToSave().knockout_program_blocks;

    expect(
      savedBlocks?.map((programBlock) => ({
        court_key: programBlock.court_key,
        display_order: programBlock.display_order,
      })),
    ).toEqual([
      {
        court_key: "court-first",
        display_order: 1,
      },
      {
        court_key: "court-second",
        display_order: 2,
      },
    ]);
  });

  it("normaliza duração especial ausente em bloco legado para null", () => {
    const dto = ChampionshipBracketWizardDraftDTO.fromStorageValue(
      JSON.stringify({
        step_flow_version: 2,
        current_step_index: 10,
        knockout_program_blocks: [
          {
            date: "2026-08-29",
            period: ChampionshipSchedulePeriod.VESPERTINO,
            location_key: "loc-final",
            court_key: "court-final",
            location_name: "Campus Park",
            court_name: "Quadra Interna",
            sport_id: "sport-1",
            phase: "FINAL",
            division_scope: "ALL",
            naipe_sequence: [MatchNaipe.FEMININO, MatchNaipe.MASCULINO],
            display_order: 1,
          },
        ],
      }),
    );

    const savedBlock = dto?.bindToSave().knockout_program_blocks[0];

    expect(savedBlock?.match_duration_minutes_override).toBeNull();
  });

  it("preserva duração especial válida do bloco manual de final", () => {
    const dto = ChampionshipBracketWizardDraftDTO.fromStorageValue(
      JSON.stringify({
        step_flow_version: 2,
        current_step_index: 10,
        knockout_program_blocks: [
          {
            date: "2026-08-29",
            period: ChampionshipSchedulePeriod.VESPERTINO,
            location_key: "loc-final",
            court_key: "court-final",
            location_name: "Campus Park",
            court_name: "Quadra Interna",
            sport_id: "sport-1",
            phase: "FINAL",
            division_scope: "ALL",
            naipe_sequence: [MatchNaipe.FEMININO, MatchNaipe.MASCULINO],
            match_duration_minutes_override: 75,
            display_order: 1,
          },
        ],
      }),
    );

    const savedBlock = dto?.bindToSave().knockout_program_blocks[0];

    expect(savedBlock?.match_duration_minutes_override).toBe(75);
  });
});
