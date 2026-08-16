import { describe, expect, it } from "vitest";
import { ChampionshipBracketSetupDTO } from "@/domain/championship-brackets/ChampionshipBracketSetupDTO";
import type { ChampionshipBracketSetupFormValues } from "@/domain/championship-brackets/championshipBracket.types";
import {
  BracketThirdPlaceMode,
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
    points: defaults[index] ?? 0,
  }));
}

function buildFormValues(
  overrides: Partial<ChampionshipBracketSetupFormValues> = {},
): ChampionshipBracketSetupFormValues {
  return {
    season_settings: overrides.season_settings ?? {
      division_format: ChampionshipSeasonDivisionFormat.SEPARATED,
      division_settlement_mode:
        ChampionshipSeasonDivisionSettlementMode.PROMOTION_RELEGATION,
      principal_slots_count: null,
      principal_relegation_count: 2,
      access_promotion_count: 2,
    },
    enabled_sport_ids: overrides.enabled_sport_ids ?? ["sport-1", "sport-1"],
    participants: overrides.participants ?? [
      {
        team_id: "team-1",
        modalities: [
          {
            sport_id: "sport-1",
            naipe: MatchNaipe.MASCULINO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
          },
        ],
      },
      {
        team_id: "team-2",
        modalities: [
          {
            sport_id: "sport-1",
            naipe: MatchNaipe.MASCULINO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
          },
        ],
      },
    ],
    competitions: overrides.competitions ?? [
      {
        sport_id: "sport-1",
        naipe: MatchNaipe.MASCULINO,
        division: TeamDivision.DIVISAO_PRINCIPAL,
        groups_count: 1,
        qualifiers_per_group: 1,
        should_complete_knockout_with_best_second_placed_teams: false,
        knockout_pairing_mode: "LINEAR",
        third_place_mode: BracketThirdPlaceMode.NONE,
        groups: [
          {
            group_number: 1,
            team_ids: ["team-1", "team-2"],
          },
        ],
      },
    ],
    schedule_days: overrides.schedule_days ?? [
      {
        date: "2026-08-10",
        start_time: "08:00",
        end_time: "18:00",
        break_start_time: "",
        break_end_time: "",
        locations: [
          {
            location_key: "loc-1",
            name: "Ginásio Central",
            position: 1,
            courts: [
              {
                court_key: "court-1",
                name: "Quadra 1",
                position: 1,
                sport_ids: ["sport-1", "sport-1"],
                sport_match_targets: [
                  {
                    sport_id: "sport-1",
                    planned_match_count: 10,
                  },
                ],
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
    competition_date_availability: overrides.competition_date_availability ?? [
      {
        competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
        date: "2026-08-10",
        mode: "FULL_DAY",
        windows: [],
      },
    ],
    team_competition_date_availability:
      overrides.team_competition_date_availability ?? [
        {
          team_id: "team-1",
          competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
          date: "2026-08-10",
          mode: "FULL_DAY",
          windows: [],
        },
        {
          team_id: "team-2",
          competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
          date: "2026-08-10",
          mode: "FULL_DAY",
          windows: [],
        },
      ],
    individual_event_configs: overrides.individual_event_configs ?? [
      {
        sport_id: "sport-1",
        placements_count: 20,
        placement_points: buildPlacementPoints(),
        relay_multiplier: 2,
      },
    ],
    individual_session_configs: overrides.individual_session_configs ?? [],
    resource_locks: overrides.resource_locks ?? [],
    match_numbering_mode: overrides.match_numbering_mode ?? "COURT",
    knockout_program_blocks: overrides.knockout_program_blocks ?? [],
  };
}

function addCompetitionVariant(
  formValues: ChampionshipBracketSetupFormValues,
  naipe: MatchNaipe,
  division: TeamDivision,
) {
  const baseCompetition = formValues.competitions[0];

  if (!baseCompetition) {
    throw new Error("Competição padrão do teste não encontrada.");
  }

  formValues.competitions.push({
    ...baseCompetition,
    naipe,
    division,

    groups: baseCompetition.groups.map((group) => ({
      ...group,
      team_ids: [...group.team_ids],
    })),
  });

  formValues.participants.forEach((participant) => {
    participant.modalities.push({
      sport_id: "sport-1",
      naipe,
      division,
    });
  });

  const competitionKey = `sport-1::${naipe}::${division}`;
  formValues.competition_date_availability?.push({
    competition_key: competitionKey,
    date: "2026-08-10",
    mode: "FULL_DAY",
    windows: [],
  });

  formValues.participants.forEach((participant) => {
    formValues.team_competition_date_availability?.push({
      team_id: participant.team_id,
      competition_key: competitionKey,
      date: "2026-08-10",
      mode: "FULL_DAY",
      windows: [],
    });
  });
}

function resolveDefaultCourt(formValues: ChampionshipBracketSetupFormValues) {
  const court = formValues.schedule_days[0]?.locations[0]?.courts[0];

  if (!court) {
    throw new Error("Quadra padrão do teste não encontrada.");
  }

  return court;
}

function applyDefaultDateAvailability(
  formValues: ChampionshipBracketSetupFormValues,
) {
  const competitionKey = "sport-1::MASCULINO::DIVISAO_PRINCIPAL";

  formValues.competition_date_availability = [
    {
      competition_key: competitionKey,
      date: "2026-08-10",
      mode: "FULL_DAY",
      windows: [],
    },
  ];

  formValues.team_competition_date_availability = [
    {
      team_id: "team-1",
      competition_key: competitionKey,
      date: "2026-08-10",
      mode: "FULL_DAY",
      windows: [],
    },
    {
      team_id: "team-2",
      competition_key: competitionKey,
      date: "2026-08-10",
      mode: "FULL_DAY",
      windows: [],
    },
  ];
}

describe("ChampionshipBracketSetupDTO", () => {
  it("preserva disponibilidades por data válidas ao salvar", () => {
    const formValues = buildFormValues();

    applyDefaultDateAvailability(formValues);

    formValues.competition_date_availability = [
      {
        competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
        date: "2026-08-10",
        mode: "CUSTOM",
        windows: [
          {
            start_time: "08:00",
            end_time: "12:00",
          },
          {
            start_time: "14:00",
            end_time: "18:00",
          },
        ],
      },
    ];

    const payload = ChampionshipBracketSetupDTO.fromFormValues(
      formValues,
    ).bindToSave();

    expect(payload.competition_date_availability).toEqual([
      {
        competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
        date: "2026-08-10",
        mode: "CUSTOM",
        windows: [
          {
            start_time: "08:00",
            end_time: "12:00",
          },
          {
            start_time: "14:00",
            end_time: "18:00",
          },
        ],
      },
    ]);

    expect(payload.team_competition_date_availability).toEqual([
      {
        team_id: "team-1",
        competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
        date: "2026-08-10",
        mode: "FULL_DAY",
        windows: [],
      },
      {
        team_id: "team-2",
        competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
        date: "2026-08-10",
        mode: "FULL_DAY",
        windows: [],
      },
    ]);
  });

  it("rejeita disponibilidade personalizada sem janelas", () => {
    const formValues = buildFormValues();

    applyDefaultDateAvailability(formValues);

    formValues.competition_date_availability = [
      {
        competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
        date: "2026-08-10",
        mode: "CUSTOM",
        windows: [],
      },
    ];

    const dto = ChampionshipBracketSetupDTO.fromFormValues(formValues);

    expect(() => dto.bindToSave()).toThrow(
      "Disponibilidade da competição personalizada precisa possuir ao menos uma janela.",
    );
  });

  it("rejeita janela de disponibilidade fora do horário do dia", () => {
    const formValues = buildFormValues();

    applyDefaultDateAvailability(formValues);

    formValues.competition_date_availability = [
      {
        competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
        date: "2026-08-10",
        mode: "CUSTOM",
        windows: [
          {
            start_time: "07:30",
            end_time: "12:00",
          },
        ],
      },
    ];

    const dto = ChampionshipBracketSetupDTO.fromFormValues(formValues);

    expect(() => dto.bindToSave()).toThrow(
      "Disponibilidade da competição precisa permanecer dentro da janela do dia.",
    );
  });

  it("rejeita janelas de disponibilidade sobrepostas", () => {
    const formValues = buildFormValues();

    applyDefaultDateAvailability(formValues);

    formValues.competition_date_availability = [
      {
        competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
        date: "2026-08-10",
        mode: "CUSTOM",
        windows: [
          {
            start_time: "08:00",
            end_time: "13:00",
          },
          {
            start_time: "12:00",
            end_time: "16:00",
          },
        ],
      },
    ];

    const dto = ChampionshipBracketSetupDTO.fromFormValues(formValues);

    expect(() => dto.bindToSave()).toThrow(
      "Disponibilidade da competição possui janelas de horário sobrepostas.",
    );
  });

  it("rejeita matriz de disponibilidade por data incompleta", () => {
    const formValues = buildFormValues();

    applyDefaultDateAvailability(formValues);

    formValues.competition_date_availability = [];

    const dto = ChampionshipBracketSetupDTO.fromFormValues(formValues);

    expect(() => dto.bindToSave()).toThrow(
      "Toda competição precisa possuir disponibilidade configurada para cada dia da agenda.",
    );
  });

  it("rejeita atlética sem interseção real com a disponibilidade da competição", () => {
    const formValues = buildFormValues();

    applyDefaultDateAvailability(formValues);

    formValues.competition_date_availability = [
      {
        competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
        date: "2026-08-10",
        mode: "CUSTOM",
        windows: [
          {
            start_time: "08:00",
            end_time: "11:00",
          },
        ],
      },
    ];

    formValues.team_competition_date_availability = [
      {
        team_id: "team-1",
        competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
        date: "2026-08-10",
        mode: "CUSTOM",
        windows: [
          {
            start_time: "13:00",
            end_time: "18:00",
          },
        ],
      },
      {
        team_id: "team-2",
        competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
        date: "2026-08-10",
        mode: "FULL_DAY",
        windows: [],
      },
    ];

    const dto = ChampionshipBracketSetupDTO.fromFormValues(formValues);

    expect(() => dto.bindToSave()).toThrow(
      "Toda atlética precisa ter ao menos uma janela real compatível com sua competição.",
    );
  });

  it("rejeita competições com divisão definida quando a temporada é unificada", () => {
    const dto = ChampionshipBracketSetupDTO.fromFormValues(
      buildFormValues({
        season_settings: {
          division_format: ChampionshipSeasonDivisionFormat.UNIFIED,
          division_settlement_mode:
            ChampionshipSeasonDivisionSettlementMode.TOP_N_TO_PRINCIPAL,
          principal_slots_count: 12,
          principal_relegation_count: null,
          access_promotion_count: null,
        },
      }),
    );

    expect(() => dto.bindToSave()).toThrow(
      "Competições unificadas não podem carregar divisão definida.",
    );
  });

  it("rejeita sessão individual com horário inválido fora da agenda do dia", () => {
    const dto = ChampionshipBracketSetupDTO.fromFormValues(
      buildFormValues({
        individual_session_configs: [
          {
            sport_id: "sport-1",
            naipe: MatchNaipe.MASCULINO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
            scheduled_date: "2026-08-10",
            start_time: "07:00",
            end_time: "08:30",
            location_key: "loc-1",
            court_key: "court-1",
            location_name: "Ginásio Central",
            court_name: "Quadra 1",
            exclusive_lock_enabled: true,
          },
        ],
      }),
    );

    expect(() => dto.bindToSave()).toThrow(
      "Sessão individual precisa usar um horário válido dentro da agenda do dia.",
    );
  });

  it("aceita sessão individual compartilhada entre naipes da mesma modalidade no mesmo recurso e horário", () => {
    const formValues = buildFormValues();

    addCompetitionVariant(
      formValues,
      MatchNaipe.FEMININO,
      TeamDivision.DIVISAO_PRINCIPAL,
    );

    formValues.individual_session_configs = [
      {
        sport_id: "sport-1",
        naipe: MatchNaipe.MASCULINO,
        division: TeamDivision.DIVISAO_PRINCIPAL,
        scheduled_date: "2026-08-10",
        start_time: "08:00",
        end_time: "10:00",
        location_key: "loc-1",
        court_key: "court-1",
        location_name: "Ginásio Central",
        court_name: "Quadra 1",
        exclusive_lock_enabled: true,
      },
      {
        sport_id: "sport-1",
        naipe: MatchNaipe.FEMININO,
        division: TeamDivision.DIVISAO_PRINCIPAL,
        scheduled_date: "2026-08-10",
        start_time: "08:00",
        end_time: "10:00",
        location_key: "loc-1",
        court_key: "court-1",
        location_name: "Ginásio Central",
        court_name: "Quadra 1",
        exclusive_lock_enabled: true,
      },
    ];
    formValues.resource_locks = [
      {
        date: "2026-08-10",
        start_time: "08:00",
        end_time: "10:00",
        location_key: "loc-1",
        court_key: "court-1",
        location_name: "Ginásio Central",
        court_name: "Quadra 1",
        lock_mode: "HARD",
        competition_key: null,
        sport_id: "sport-1",
        naipe: MatchNaipe.MASCULINO,
        division: TeamDivision.DIVISAO_PRINCIPAL,
      },
    ];

    const dto = ChampionshipBracketSetupDTO.fromFormValues(formValues);

    expect(() => dto.bindToSave()).not.toThrow();
  });

  it("rejeita bloqueio duro duplicado no mesmo recurso e horário", () => {
    const dto = ChampionshipBracketSetupDTO.fromFormValues(
      buildFormValues({
        resource_locks: [
          {
            date: "2026-08-10",
            start_time: "08:00",
            end_time: "10:00",
            location_key: "loc-1",
            court_key: "court-1",
            location_name: "Ginásio Central",
            court_name: "Quadra 1",
            lock_mode: "HARD",
            competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
            sport_id: "sport-1",
            naipe: MatchNaipe.MASCULINO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
          },
          {
            date: "2026-08-10",
            start_time: "08:00",
            end_time: "10:00",
            location_key: "loc-1",
            court_key: "court-1",
            location_name: "Ginásio Central",
            court_name: "Quadra 1",
            lock_mode: "HARD",
            competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
            sport_id: "sport-1",
            naipe: MatchNaipe.MASCULINO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
          },
        ],
      }),
    );

    expect(() => dto.bindToSave()).toThrow(
      "Existe mais de um bloqueio duro para o mesmo recurso no mesmo horário.",
    );
  });

  it("rejeita modalidade coletiva ativa sem quantidade planejada de jogos", () => {
    const formValues = buildFormValues();
    const court = resolveDefaultCourt(formValues);

    court.sport_match_targets = [];

    const dto = ChampionshipBracketSetupDTO.fromFormValues(formValues);

    expect(() => dto.bindToSave()).toThrow(
      "Toda modalidade coletiva ativa precisa ter ao menos uma quantidade planejada de jogos.",
    );
  });

  it("aceita uma única meta da modalidade para múltiplas competições do mesmo esporte", () => {
    const formValues = buildFormValues();

    addCompetitionVariant(
      formValues,
      MatchNaipe.FEMININO,
      TeamDivision.DIVISAO_PRINCIPAL,
    );

    const payload = ChampionshipBracketSetupDTO.fromFormValues(
      formValues,
    ).bindToSave();

    expect(
      payload.schedule_days[0]?.locations[0]?.courts[0]?.sport_match_targets,
    ).toEqual([
      {
        sport_id: "sport-1",
        planned_match_count: 10,
      },
    ]);
  });

  it("preserva a meta planejada de jogos da modalidade ao salvar", () => {
    const formValues = buildFormValues();
    const court = resolveDefaultCourt(formValues);

    court.sport_match_targets = [
      {
        sport_id: "sport-1",
        planned_match_count: 16,
      },
    ];

    const payload =
      ChampionshipBracketSetupDTO.fromFormValues(formValues).bindToSave();

    expect(
      payload.schedule_days[0]?.locations[0]?.courts[0]?.sport_match_targets,
    ).toEqual([
      {
        sport_id: "sport-1",
        planned_match_count: 16,
      },
    ]);
  });

  it("rejeita meta de jogos para modalidade não vinculada à quadra", () => {
    const formValues = buildFormValues();
    const court = resolveDefaultCourt(formValues);

    court.sport_match_targets = [
      {
        sport_id: "sport-x",
        planned_match_count: 10,
      },
    ];

    const dto = ChampionshipBracketSetupDTO.fromFormValues(formValues);

    expect(() => dto.bindToSave()).toThrow(
      "A meta de jogos da quadra Quadra 1 possui uma modalidade não vinculada à quadra.",
    );
  });

  it("rejeita quantidade planejada de jogos inválida", () => {
    const formValues = buildFormValues();
    const court = resolveDefaultCourt(formValues);

    court.sport_match_targets = [
      {
        sport_id: "sport-1",
        planned_match_count: 0,
      },
    ];

    const dto = ChampionshipBracketSetupDTO.fromFormValues(formValues);

    expect(() => dto.bindToSave()).toThrow(
      "A quantidade planejada de jogos da quadra Quadra 1 precisa ser um número inteiro maior que zero.",
    );
  });

  it("rejeita mais de uma meta da mesma modalidade na mesma quadra", () => {
    const formValues = buildFormValues();
    const court = resolveDefaultCourt(formValues);

    court.sport_match_targets = [
      {
        sport_id: "sport-1",
        planned_match_count: 10,
      },
      {
        sport_id: "sport-1",
        planned_match_count: 12,
      },
    ];

    const dto = ChampionshipBracketSetupDTO.fromFormValues(formValues);

    expect(() => dto.bindToSave()).toThrow(
      "A quadra Quadra 1 possui mais de uma meta para a mesma modalidade.",
    );
  });

  it("normaliza esportes habilitados e a preferência da quadra ao salvar", () => {
    const dto = ChampionshipBracketSetupDTO.fromFormValues(buildFormValues());

    const payload = dto.bindToSave();

    expect(payload.enabled_sport_ids).toEqual(["sport-1"]);

    expect(
      payload.schedule_days[0]?.locations[0]?.courts[0]?.sport_ids,
    ).toEqual(["sport-1"]);

    expect(
      payload.schedule_days[0]?.locations[0]?.courts[0]?.sport_preference,
    ).toEqual({
      preferred_sport_id: "sport-1",
      preferred_naipe: MatchNaipe.MASCULINO,
      preferred_division: TeamDivision.DIVISAO_PRINCIPAL,
      sequence_mode: "FLEXIBLE",
      alternate_naipe_after_exclusive_knockout_phase: false,
    });
  });

  it("preserva o modo de numeração por modalidade ao salvar", () => {
    const dto = ChampionshipBracketSetupDTO.fromFormValues(
      buildFormValues({
        match_numbering_mode: "SPORT",
      }),
    );

    const payload = dto.bindToSave();

    expect(payload.match_numbering_mode).toBe("SPORT");
  });

  it("preserva preferência somente pela modalidade", () => {
    const formValues = buildFormValues();

    const court = formValues.schedule_days[0]?.locations[0]?.courts[0];

    if (!court) {
      throw new Error("Quadra padrão do teste não encontrada.");
    }

    court.sport_preference = {
      preferred_sport_id: "sport-1",
      preferred_naipe: null,
      preferred_division: null,
      sequence_mode: "FLEXIBLE",
      alternate_naipe_after_exclusive_knockout_phase: false,
    };

    const payload =
      ChampionshipBracketSetupDTO.fromFormValues(formValues).bindToSave();

    expect(
      payload.schedule_days[0]?.locations[0]?.courts[0]?.sport_preference,
    ).toEqual({
      preferred_sport_id: "sport-1",
      preferred_naipe: null,
      preferred_division: null,
      sequence_mode: "FLEXIBLE",
      alternate_naipe_after_exclusive_knockout_phase: false,
    });
  });

  it("rejeita preferência por modalidade não vinculada à quadra", () => {
    const formValues = buildFormValues();

    const court = formValues.schedule_days[0]?.locations[0]?.courts[0];

    if (!court) {
      throw new Error("Quadra padrão do teste não encontrada.");
    }

    court.sport_preference = {
      preferred_sport_id: "sport-x",
      preferred_naipe: null,
      preferred_division: null,
      sequence_mode: "FLEXIBLE",
    };

    const dto = ChampionshipBracketSetupDTO.fromFormValues(formValues);

    expect(() => dto.bindToSave()).toThrow(
      "A modalidade preferencial da quadra Quadra 1 não está vinculada à quadra.",
    );
  });

  it("deriva a ordem do bloco final pela posição no array", () => {
    const dto = ChampionshipBracketSetupDTO.fromFormValues(
      buildFormValues({
        knockout_program_blocks: [
          {
            date: "2026-08-10",
            start_time: "08:00",
            end_time: "10:00",
            location_key: "loc-1",
            court_key: "court-1",
            location_name: "Ginásio Central",
            court_name: "Quadra 1",
            sport_id: "sport-1",
            phase: "FINAL",
            division_scope: TeamDivision.DIVISAO_PRINCIPAL,
            naipe_sequence: [MatchNaipe.MASCULINO],
            match_duration_minutes_override: 75,
            display_order: 99,
          },
        ],
      }),
    );

    const payload = dto.bindToSave();

    expect(payload.knockout_program_blocks[0]?.display_order).toBe(1);
    expect(
      payload.knockout_program_blocks[0]?.match_duration_minutes_override,
    ).toBe(75);
  });

  it("rejeita duração especial inválida no bloco manual de final", () => {
    const dto = ChampionshipBracketSetupDTO.fromFormValues(
      buildFormValues({
        knockout_program_blocks: [
          {
            date: "2026-08-10",
            start_time: "08:00",
            end_time: "10:00",
            location_key: "loc-1",
            court_key: "court-1",
            location_name: "Ginásio Central",
            court_name: "Quadra 1",
            sport_id: "sport-1",
            phase: "FINAL",
            division_scope: TeamDivision.DIVISAO_PRINCIPAL,
            naipe_sequence: [MatchNaipe.MASCULINO],
            match_duration_minutes_override: 0,
            display_order: 1,
          },
        ],
      }),
    );

    expect(() => dto.bindToSave()).toThrow(
      "A duração especial do bloco manual de final precisa ser um número inteiro maior que zero.",
    );
  });

  it("rejeita configuração individual com colocação sem pontuação", () => {
    const dto = ChampionshipBracketSetupDTO.fromFormValues(
      buildFormValues({
        individual_event_configs: [
          {
            sport_id: "sport-1",
            placements_count: 3,
            placement_points: [
              { placement: 1, points: 24 },
              { placement: 2, points: null },
              { placement: 3, points: 20 },
            ],
            relay_multiplier: 2,
          },
        ],
      }),
    );

    expect(() => dto.bindToSave()).toThrow(
      "Toda colocação pontuada precisa ter pontuação definida.",
    );
  });

  it("rejeita bloco manual de final sem competição ativa correspondente", () => {
    const dto = ChampionshipBracketSetupDTO.fromFormValues(
      buildFormValues({
        knockout_program_blocks: [
          {
            date: "2026-08-10",
            start_time: "08:00",
            end_time: "10:00",
            location_key: "loc-1",
            court_key: "court-1",
            location_name: "Ginásio Central",
            court_name: "Quadra 1",
            sport_id: "sport-1",
            phase: "FINAL",
            division_scope: TeamDivision.DIVISAO_ACESSO,
            naipe_sequence: [MatchNaipe.FEMININO],
            match_duration_minutes_override: null,
            display_order: 1,
          },
        ],
      }),
    );

    expect(() => dto.bindToSave()).toThrow(
      "Bloco manual de final sem competição ativa correspondente.",
    );
  });

  it("converte preferência antiga sem modo para FLEXIBLE", () => {
    const formValues = buildFormValues();
    const court = resolveDefaultCourt(formValues);

    const legacyPreference = court.sport_preference as
      | (NonNullable<typeof court.sport_preference> & {
          sequence_mode?: unknown;
        })
      | null;

    if (!legacyPreference) {
      throw new Error("Preferência padrão do teste não encontrada.");
    }

    delete legacyPreference.sequence_mode;

    const payload =
      ChampionshipBracketSetupDTO.fromFormValues(formValues).bindToSave();

    expect(
      payload.schedule_days[0]?.locations[0]?.courts[0]?.sport_preference
        ?.sequence_mode,
    ).toBe("FLEXIBLE");
  });

  it("preserva agrupamento válido por naipe", () => {
    const formValues = buildFormValues();

    addCompetitionVariant(
      formValues,
      MatchNaipe.FEMININO,
      TeamDivision.DIVISAO_PRINCIPAL,
    );

    const court = resolveDefaultCourt(formValues);

    court.sport_preference = {
      preferred_sport_id: "sport-1",
      preferred_naipe: MatchNaipe.FEMININO,
      preferred_division: null,
      sequence_mode: "GROUP_NAIPE",
      alternate_naipe_after_exclusive_knockout_phase: true,
    };

    const payload =
      ChampionshipBracketSetupDTO.fromFormValues(formValues).bindToSave();

    expect(
      payload.schedule_days[0]?.locations[0]?.courts[0]?.sport_preference,
    ).toEqual({
      preferred_sport_id: "sport-1",
      preferred_naipe: MatchNaipe.FEMININO,
      preferred_division: null,
      sequence_mode: "GROUP_NAIPE",
      alternate_naipe_after_exclusive_knockout_phase: true,
    });
  });

  it("rejeita agrupamento por naipe sem dois naipes ativos", () => {
    const formValues = buildFormValues();
    const court = resolveDefaultCourt(formValues);

    court.sport_preference = {
      preferred_sport_id: "sport-1",
      preferred_naipe: MatchNaipe.MASCULINO,
      preferred_division: null,
      sequence_mode: "GROUP_NAIPE",
    };

    const dto = ChampionshipBracketSetupDTO.fromFormValues(formValues);

    expect(() => dto.bindToSave()).toThrow(
      "A modalidade selecionada na quadra Quadra 1 precisa possuir ao menos dois naipes ativos para agrupamento por naipe.",
    );
  });

  it("preserva agrupamento válido por divisão", () => {
    const formValues = buildFormValues();

    addCompetitionVariant(
      formValues,
      MatchNaipe.MASCULINO,
      TeamDivision.DIVISAO_ACESSO,
    );

    const court = resolveDefaultCourt(formValues);

    court.sport_preference = {
      preferred_sport_id: "sport-1",
      preferred_naipe: null,
      preferred_division: TeamDivision.DIVISAO_ACESSO,
      sequence_mode: "GROUP_DIVISION",
      alternate_naipe_after_exclusive_knockout_phase: false,
    };

    const payload =
      ChampionshipBracketSetupDTO.fromFormValues(formValues).bindToSave();

    expect(
      payload.schedule_days[0]?.locations[0]?.courts[0]?.sport_preference,
    ).toEqual({
      preferred_sport_id: "sport-1",
      preferred_naipe: null,
      preferred_division: TeamDivision.DIVISAO_ACESSO,
      sequence_mode: "GROUP_DIVISION",
      alternate_naipe_after_exclusive_knockout_phase: false,
    });
  });

  it("rejeita agrupamento por divisão sem duas divisões ativas", () => {
    const formValues = buildFormValues();
    const court = resolveDefaultCourt(formValues);

    court.sport_preference = {
      preferred_sport_id: "sport-1",
      preferred_naipe: null,
      preferred_division: TeamDivision.DIVISAO_PRINCIPAL,
      sequence_mode: "GROUP_DIVISION",
    };

    const dto = ChampionshipBracketSetupDTO.fromFormValues(formValues);

    expect(() => dto.bindToSave()).toThrow(
      "A modalidade selecionada na quadra Quadra 1 precisa possuir ao menos duas divisões ativas para agrupamento por divisão.",
    );
  });

  it("rejeita modo de sequenciamento desconhecido", () => {
    const formValues = buildFormValues();
    const court = resolveDefaultCourt(formValues);

    court.sport_preference = {
      preferred_sport_id: "sport-1",
      preferred_naipe: null,
      preferred_division: null,
      sequence_mode: "UNKNOWN" as "FLEXIBLE",
    };

    const dto = ChampionshipBracketSetupDTO.fromFormValues(formValues);

    expect(() => dto.bindToSave()).toThrow(
      "Estratégia de sequenciamento da quadra inválida.",
    );
  });
});
