import type { ChampionshipBracketSetupFormValues } from "@/domain/championship-brackets/championshipBracket.types";
import { resolveCompetitionKnockoutPairingModeValue } from "@/domain/championship-brackets/championshipBracketPairing";
import {
  ChampionshipSchedulePeriod,
  ChampionshipSeasonDivisionFormat,
  ChampionshipSeasonDivisionSettlementMode,
} from "@/lib/enums";

const COMPETITION_DIVISION_WITHOUT_DIVISION = "WITHOUT_DIVISION";

export class ChampionshipBracketSetupDTO {
  private readonly form_values: ChampionshipBracketSetupFormValues;

  constructor(form_values: ChampionshipBracketSetupFormValues) {
    this.form_values = form_values;
  }

  static fromFormValues(
    form_values: ChampionshipBracketSetupFormValues,
  ): ChampionshipBracketSetupDTO {
    return new ChampionshipBracketSetupDTO(form_values);
  }

  private validateParticipants() {
    if (this.form_values.participants.length == 0) {
      throw new Error("Selecione ao menos uma atlética participante.");
    }

    const enabledSportIdSet = new Set(this.form_values.enabled_sport_ids);

    this.form_values.participants.forEach((participant) => {
      if (!participant.team_id) {
        throw new Error("Atlética inválida na configuração de participantes.");
      }

      if (participant.modalities.length == 0) {
        throw new Error(
          "Cada atlética participante precisa ter ao menos uma modalidade/naipe.",
        );
      }

      participant.modalities.forEach((modality) => {
        if (!enabledSportIdSet.has(modality.sport_id)) {
          throw new Error("Participante com modalidade fora do catálogo ativo do campeonato.");
        }
      });
    });
  }

  private validateEnabledSports() {
    if (this.form_values.enabled_sport_ids.length == 0) {
      throw new Error("Selecione ao menos uma modalidade ativa para o campeonato.");
    }
  }

  private validateSeasonSettings() {
    const seasonSettings = this.form_values.season_settings;

    if (!seasonSettings) {
      throw new Error("Configure o formato sazonal do campeonato.");
    }

    if (seasonSettings.division_format == ChampionshipSeasonDivisionFormat.SEPARATED) {
      if (
        seasonSettings.division_settlement_mode ==
          ChampionshipSeasonDivisionSettlementMode.PROMOTION_RELEGATION &&
        (
          (seasonSettings.principal_relegation_count ?? 0) <= 0 ||
          (seasonSettings.access_promotion_count ?? 0) <= 0
        )
      ) {
        throw new Error("Informe quantas atléticas sobem e caem no formato separado.");
      }
    }

    if (seasonSettings.division_format == ChampionshipSeasonDivisionFormat.UNIFIED) {
      if (
        seasonSettings.division_settlement_mode ==
          ChampionshipSeasonDivisionSettlementMode.TOP_N_TO_PRINCIPAL &&
        (seasonSettings.principal_slots_count ?? 0) <= 0
      ) {
        throw new Error("Informe a quantidade de vagas da divisão principal no formato unificado.");
      }
    }
  }

  private validateCompetitions() {
    const enabledSportIdSet = new Set(this.form_values.enabled_sport_ids);

    if (this.form_values.competitions.length == 0) {
      throw new Error(
        "Configure ao menos uma competição para geração de grupos.",
      );
    }

    this.form_values.competitions.forEach((competition) => {
      if (!competition.sport_id) {
        throw new Error("Modalidade inválida na configuração de grupos.");
      }

      if (!enabledSportIdSet.has(competition.sport_id)) {
        throw new Error("Competição vinculada a uma modalidade inativa.");
      }

      if (competition.groups_count < 1) {
        throw new Error("Quantidade de grupos deve ser maior que zero.");
      }

      if (competition.qualifiers_per_group < 1) {
        throw new Error(
          "Quantidade de classificados por grupo deve ser maior que zero.",
        );
      }

      if (competition.groups.length == 0) {
        throw new Error("Defina as atléticas por grupo para cada competição.");
      }

      if (
        this.form_values.season_settings.division_format ==
          ChampionshipSeasonDivisionFormat.UNIFIED &&
        competition.division != null
      ) {
        throw new Error("Competições unificadas não podem carregar divisão definida.");
      }

      if (
        this.form_values.season_settings.division_format ==
          ChampionshipSeasonDivisionFormat.SEPARATED &&
        competition.division == null
      ) {
        throw new Error("Competições separadas precisam informar a divisão.");
      }
    });
  }

  private validateScheduleDays() {
    if (this.form_values.schedule_days.length == 0) {
      throw new Error("Configure ao menos um dia de agenda do campeonato.");
    }

    this.form_values.schedule_days.forEach((schedule_day) => {
      if (
        !schedule_day.date ||
        !schedule_day.start_time ||
        !schedule_day.end_time
      ) {
        throw new Error("Dia de agenda inválido: preencha data, início e fim.");
      }

      const startMinutes = this.resolveTimeValueToMinutes(schedule_day.start_time);
      const endMinutes = this.resolveTimeValueToMinutes(schedule_day.end_time);

      if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
        throw new Error("Dia de agenda inválido: fim precisa ser maior que início.");
      }

      const breakStartTimeValue = schedule_day.break_start_time?.trim() ?? "";
      const breakEndTimeValue = schedule_day.break_end_time?.trim() ?? "";
      const hasBreakStartTime = breakStartTimeValue.length > 0;
      const hasBreakEndTime = breakEndTimeValue.length > 0;

      if (hasBreakStartTime != hasBreakEndTime) {
        throw new Error("Dia de agenda inválido: preencha início e fim do intervalo.");
      }

      if (hasBreakStartTime && hasBreakEndTime) {
        const breakStartMinutes = this.resolveTimeValueToMinutes(breakStartTimeValue);
        const breakEndMinutes = this.resolveTimeValueToMinutes(breakEndTimeValue);

        if (
          breakStartMinutes == null ||
          breakEndMinutes == null ||
          breakEndMinutes <= breakStartMinutes
        ) {
          throw new Error("Dia de agenda inválido: o fim do intervalo precisa ser maior que o início.");
        }

        if (breakStartMinutes < startMinutes || breakEndMinutes > endMinutes) {
          throw new Error("Dia de agenda inválido: intervalo fora da janela do dia.");
        }
      }

      if (schedule_day.locations.length == 0) {
        throw new Error("Cada dia precisa ter ao menos um local configurado.");
      }

      schedule_day.locations.forEach((location) => {
        if (!location.name.trim()) {
          throw new Error("Local inválido na configuração de agenda.");
        }

        if (location.courts.length == 0) {
          throw new Error(
            `O local ${location.name} precisa ter ao menos uma quadra.`,
          );
        }

        location.courts.forEach((court) => {
          if (!court.name.trim()) {
            throw new Error("Quadra inválida na configuração de agenda.");
          }

          if (court.sport_ids.length == 0) {
            throw new Error(
              `A quadra ${court.name} precisa ter ao menos uma modalidade vinculada.`,
            );
          }
        });
      });
    });
  }

  private resolveCompetitionKey(
    sport_id: string,
    naipe: string,
    division: string | null,
  ) {
    return [
      sport_id,
      naipe,
      division ?? COMPETITION_DIVISION_WITHOUT_DIVISION,
    ].join("::");
  }

  private resolveDatePeriodKey(date: string, period: ChampionshipSchedulePeriod) {
    return `${date}::${period}`;
  }

  private resolveScheduleDayDateSet() {
    return new Set(
      this.form_values.schedule_days
        .map((scheduleDay) => scheduleDay.date.trim())
        .filter(Boolean),
    );
  }

  private validateSchedulePeriods() {
    const scheduleDayDateSet = this.resolveScheduleDayDateSet();

    if (this.form_values.schedule_periods.length == 0) {
      throw new Error("Configure os períodos da agenda do campeonato.");
    }

    const seenDatePeriodKeys = new Set<string>();

    this.form_values.schedule_periods.forEach((schedulePeriod) => {
      if (!scheduleDayDateSet.has(schedulePeriod.date)) {
        throw new Error("Período da agenda inválido: dia não encontrado na agenda.");
      }

      if (
        schedulePeriod.period != ChampionshipSchedulePeriod.MATUTINO &&
        schedulePeriod.period != ChampionshipSchedulePeriod.VESPERTINO
      ) {
        throw new Error("Período da agenda inválido.");
      }

      const datePeriodKey = this.resolveDatePeriodKey(
        schedulePeriod.date,
        schedulePeriod.period,
      );

      if (seenDatePeriodKeys.has(datePeriodKey)) {
        throw new Error("Período da agenda duplicado.");
      }

      seenDatePeriodKeys.add(datePeriodKey);
    });

    if (!this.form_values.schedule_periods.some((schedulePeriod) => schedulePeriod.enabled != false)) {
      throw new Error("Habilite ao menos um período global na agenda do campeonato.");
    }
  }

  private validateAvailability() {
    const schedulePeriodEnabledByKey = this.form_values.schedule_periods.reduce<Record<string, boolean>>(
      (carry, schedulePeriod) => {
        carry[
          this.resolveDatePeriodKey(schedulePeriod.date, schedulePeriod.period)
        ] = schedulePeriod.enabled != false;
        return carry;
      },
      {},
    );
    const competitionKeySet = new Set(
      this.form_values.competitions.map((competition) =>
        this.resolveCompetitionKey(
          competition.sport_id,
          competition.naipe,
          competition.division,
        ),
      ),
    );
    const competitionPeriodAvailabilityByKey = this.form_values.competition_period_availability.reduce<Record<string, boolean>>(
      (carry, availabilityItem) => {
        const datePeriodKey = this.resolveDatePeriodKey(
          availabilityItem.date,
          availabilityItem.period,
        );

        if (!competitionKeySet.has(availabilityItem.competition_key)) {
          throw new Error("Disponibilidade por modalidade inválida: competição não encontrada.");
        }

        if (!(datePeriodKey in schedulePeriodEnabledByKey)) {
          throw new Error("Disponibilidade por modalidade inválida: período fora da agenda.");
        }

        carry[`${availabilityItem.competition_key}::${datePeriodKey}`] =
          availabilityItem.enabled != false;
        return carry;
      },
      {},
    );

    this.form_values.competitions.forEach((competition) => {
      const competitionKey = this.resolveCompetitionKey(
        competition.sport_id,
        competition.naipe,
        competition.division,
      );
      const hasAvailableWindow = this.form_values.schedule_periods.some((schedulePeriod) => {
        const datePeriodKey = this.resolveDatePeriodKey(
          schedulePeriod.date,
          schedulePeriod.period,
        );

        return (
          schedulePeriod.enabled != false &&
          competitionPeriodAvailabilityByKey[
            `${competitionKey}::${datePeriodKey}`
          ] != false
        );
      });

      if (!hasAvailableWindow) {
        throw new Error("Toda competição precisa ter ao menos um dia/período disponível.");
      }
    });

    const teamCompetitionKeysByTeamId = this.form_values.participants.reduce<Record<string, string[]>>(
      (carry, participant) => {
        const participantCompetitionKeys = participant.modalities
          .map((modality) =>
            this.resolveCompetitionKey(
              modality.sport_id,
              modality.naipe,
              modality.division,
            ),
          )
          .filter((competitionKey) => competitionKeySet.has(competitionKey));

        if (participantCompetitionKeys.length > 0) {
          carry[participant.team_id] = [...new Set(participantCompetitionKeys)];
        }

        return carry;
      },
      {},
    );
    const validTeamCompetitionPairSet = new Set(
      Object.entries(teamCompetitionKeysByTeamId).flatMap(([team_id, competitionKeys]) =>
        competitionKeys.map((competitionKey) => `${team_id}::${competitionKey}`),
      ),
    );
    const teamCompetitionAvailabilityByKey = this.form_values.team_competition_availability.reduce<Record<string, boolean>>(
      (carry, availabilityItem) => {
        const datePeriodKey = this.resolveDatePeriodKey(
          availabilityItem.date,
          availabilityItem.period,
        );
        const teamCompetitionKey = `${availabilityItem.team_id}::${availabilityItem.competition_key}`;

        if (!validTeamCompetitionPairSet.has(teamCompetitionKey)) {
          throw new Error("Disponibilidade da atlética inválida para a competição configurada.");
        }

        if (!(datePeriodKey in schedulePeriodEnabledByKey)) {
          throw new Error("Disponibilidade da atlética inválida: período fora da agenda.");
        }

        carry[`${teamCompetitionKey}::${datePeriodKey}`] =
          availabilityItem.enabled != false;
        return carry;
      },
      {},
    );

    Object.entries(teamCompetitionKeysByTeamId).forEach(([team_id, competitionKeys]) => {
      competitionKeys.forEach((competitionKey) => {
        const hasAvailableWindow = this.form_values.schedule_periods.some((schedulePeriod) => {
          const datePeriodKey = this.resolveDatePeriodKey(
            schedulePeriod.date,
            schedulePeriod.period,
          );

          return (
            schedulePeriod.enabled != false &&
            competitionPeriodAvailabilityByKey[
              `${competitionKey}::${datePeriodKey}`
            ] != false &&
            teamCompetitionAvailabilityByKey[
              `${team_id}::${competitionKey}::${datePeriodKey}`
            ] != false
          );
        });

        if (!hasAvailableWindow) {
          throw new Error("Toda atlética precisa ter ao menos um dia/período disponível por competição.");
        }
      });
    });
  }

  private validateIndividualEventConfigs() {
    const enabledSportIdSet = new Set(this.form_values.enabled_sport_ids);
    const seenSportIds = new Set<string>();

    this.form_values.individual_event_configs.forEach((configItem) => {
      if (!configItem.sport_id) {
        throw new Error("Configuração de modalidade individual inválida.");
      }

      if (!enabledSportIdSet.has(configItem.sport_id)) {
        throw new Error("Configuração individual vinculada a uma modalidade inativa.");
      }

      if (seenSportIds.has(configItem.sport_id)) {
        throw new Error("Configuração de modalidade individual duplicada.");
      }

      if (
        !Number.isInteger(configItem.placements_count) ||
        configItem.placements_count < 1
      ) {
        throw new Error("Quantidade de colocações pontuadas inválida.");
      }

      const placementPointByPlacement = new Map<number, number | null>();

      configItem.placement_points.forEach((placementPoint) => {
        if (
          !Number.isInteger(placementPoint.placement) ||
          placementPoint.placement < 1 ||
          placementPoint.placement > configItem.placements_count
        ) {
          throw new Error("Posição de pontuação individual inválida.");
        }

        if (placementPointByPlacement.has(placementPoint.placement)) {
          throw new Error("Pontuação individual duplicada para a mesma colocação.");
        }

        if (placementPoint.points == null) {
          throw new Error("Toda colocação pontuada precisa ter pontuação definida.");
        }

        if (placementPoint.points < 0) {
          throw new Error("Pontuação individual não pode ser negativa.");
        }

        placementPointByPlacement.set(
          placementPoint.placement,
          placementPoint.points,
        );
      });

      if (placementPointByPlacement.size != configItem.placements_count) {
        throw new Error("Toda colocação de 1 até N precisa ter pontuação definida.");
      }

      if (configItem.relay_multiplier <= 0) {
        throw new Error("Multiplicador de revezamento inválido.");
      }

      seenSportIds.add(configItem.sport_id);
    });
  }

  private validateIndividualSessionConfigs() {
    const schedulePeriodEnabledByKey = this.form_values.schedule_periods.reduce<Record<string, boolean>>(
      (carry, schedulePeriod) => {
        carry[
          this.resolveDatePeriodKey(schedulePeriod.date, schedulePeriod.period)
        ] = schedulePeriod.enabled != false;
        return carry;
      },
      {},
    );
    const seenSessionKeys = new Set<string>();
    const participantCompetitionKeySet = new Set(
      this.form_values.participants.flatMap((participant) =>
        participant.modalities.map((modality) =>
          this.resolveCompetitionKey(
            modality.sport_id,
            modality.naipe,
            modality.division,
          ),
        ),
      ),
    );

    this.form_values.individual_session_configs.forEach((sessionConfig) => {
      const sessionKey = this.resolveCompetitionKey(
        sessionConfig.sport_id,
        sessionConfig.naipe,
        sessionConfig.division,
      );

      if (seenSessionKeys.has(sessionKey)) {
        throw new Error("Sessão individual duplicada para a mesma modalidade/naipe/divisão.");
      }

      seenSessionKeys.add(sessionKey);

      if (!participantCompetitionKeySet.has(sessionKey)) {
        throw new Error("Sessão individual sem participantes válidos no campeonato.");
      }

      if (
        !sessionConfig.scheduled_date ||
        sessionConfig.period == null ||
        !sessionConfig.location_key ||
        !sessionConfig.court_key
      ) {
        throw new Error("Toda sessão individual ativa precisa ter slot oficial e recurso definidos.");
      }

      const schedulePeriodKey = this.resolveDatePeriodKey(
        sessionConfig.scheduled_date,
        sessionConfig.period,
      );

      if (!(schedulePeriodKey in schedulePeriodEnabledByKey)) {
        throw new Error("Sessão individual fora da agenda do campeonato.");
      }

      if (schedulePeriodEnabledByKey[schedulePeriodKey] != true) {
        throw new Error("Sessão individual precisa usar um período global habilitado.");
      }
    });
  }

  private validateResourceLocks() {
    const schedulePeriodEnabledByKey = this.form_values.schedule_periods.reduce<Record<string, boolean>>(
      (carry, schedulePeriod) => {
        carry[
          this.resolveDatePeriodKey(schedulePeriod.date, schedulePeriod.period)
        ] = schedulePeriod.enabled != false;
        return carry;
      },
      {},
    );
    const seenLockKeys = new Set<string>();

    this.form_values.resource_locks.forEach((resourceLock) => {
      const datePeriodKey = this.resolveDatePeriodKey(
        resourceLock.date,
        resourceLock.period,
      );

      if (!(datePeriodKey in schedulePeriodEnabledByKey)) {
        throw new Error("Reserva de recurso fora da agenda configurada.");
      }

      if (!resourceLock.location_key || !resourceLock.court_key) {
        throw new Error("Reserva de recurso inválida.");
      }

      const lockKey = `${resourceLock.date}::${resourceLock.period}::${resourceLock.location_key}::${resourceLock.court_key}`;

      if (resourceLock.lock_mode == "HARD" && seenLockKeys.has(lockKey)) {
        throw new Error("Existe mais de um bloqueio duro para o mesmo recurso no mesmo período.");
      }

      seenLockKeys.add(lockKey);
    });
  }

  private validateKnockoutProgramBlocks() {
    const schedulePeriodEnabledByKey = this.form_values.schedule_periods.reduce<Record<string, boolean>>(
      (carry, schedulePeriod) => {
        carry[
          this.resolveDatePeriodKey(schedulePeriod.date, schedulePeriod.period)
        ] = schedulePeriod.enabled != false;
        return carry;
      },
      {},
    );
    const competitionKeySet = new Set(
      this.form_values.competitions.map((competition) =>
        this.resolveCompetitionKey(
          competition.sport_id,
          competition.naipe,
          competition.division,
        ),
      ),
    );

    this.form_values.knockout_program_blocks.forEach((programBlock) => {
      if (programBlock.phase != "FINAL") {
        throw new Error("Programação manual da eliminatória inválida.");
      }

      if (
        !programBlock.location_key ||
        !programBlock.court_key ||
        !programBlock.sport_id
      ) {
        throw new Error("Bloco manual de final inválido.");
      }

      if (
        !Number.isInteger(programBlock.display_order) ||
        programBlock.display_order < 1
      ) {
        throw new Error("Ordem do bloco manual de final inválida.");
      }

      const schedulePeriodKey = this.resolveDatePeriodKey(
        programBlock.date,
        programBlock.period,
      );

      if (!(schedulePeriodKey in schedulePeriodEnabledByKey)) {
        throw new Error("Bloco manual de final fora da agenda configurada.");
      }

      if (schedulePeriodEnabledByKey[schedulePeriodKey] != true) {
        throw new Error("Bloco manual de final precisa usar um período global habilitado.");
      }

      if (programBlock.naipe_sequence.length == 0) {
        throw new Error("Defina ao menos um naipe para o bloco manual de final.");
      }

      if (
        this.form_values.season_settings.division_format ==
          ChampionshipSeasonDivisionFormat.UNIFIED &&
        programBlock.division_scope != "ALL"
      ) {
        throw new Error("Blocos manuais de final unificados não podem carregar divisão específica.");
      }

      const seenNaipes = new Set<string>();

      programBlock.naipe_sequence.forEach((naipe) => {
        if (seenNaipes.has(naipe)) {
          throw new Error("Bloco manual de final com naipe duplicado.");
        }

        seenNaipes.add(naipe);

        const resolvedCompetitionKey = this.resolveCompetitionKey(
          programBlock.sport_id,
          naipe,
          this.form_values.season_settings.division_format ==
            ChampionshipSeasonDivisionFormat.UNIFIED
            ? null
            : programBlock.division_scope == "ALL"
              ? null
              : programBlock.division_scope,
        );

        const hasExactCompetition = competitionKeySet.has(resolvedCompetitionKey);
        const hasAnyCompetitionForNaipe =
          programBlock.division_scope == "ALL" &&
          this.form_values.competitions.some((competition) => {
            return (
              competition.sport_id == programBlock.sport_id &&
              competition.naipe == naipe
            );
          });

        if (!hasExactCompetition && !hasAnyCompetitionForNaipe) {
          throw new Error("Bloco manual de final sem competição ativa correspondente.");
        }
      });
    });
  }

  private resolveTimeValueToMinutes(timeValue: string): number | null {
    const [hourPart, minutePart] = timeValue.split(":").map(Number);

    if (Number.isNaN(hourPart) || Number.isNaN(minutePart)) {
      return null;
    }

    if (hourPart < 0 || hourPart > 23 || minutePart < 0 || minutePart > 59) {
      return null;
    }

    return hourPart * 60 + minutePart;
  }

  bindToSave(): ChampionshipBracketSetupFormValues {
    this.validateEnabledSports();
    this.validateSeasonSettings();
    this.validateParticipants();
    this.validateCompetitions();
    this.validateScheduleDays();
    this.validateSchedulePeriods();
    this.validateAvailability();
    this.validateIndividualEventConfigs();
    this.validateIndividualSessionConfigs();
    this.validateResourceLocks();
    this.validateKnockoutProgramBlocks();

    const normalizedParticipants = this.form_values.participants.map(
      (participant) => ({
        team_id: participant.team_id,
        modalities: participant.modalities.map((modality) => ({
          sport_id: modality.sport_id,
          naipe: modality.naipe,
          division: modality.division,
        })),
      }),
    );

    const normalizedCompetitions = this.form_values.competitions.map(
      (competition) => ({
        sport_id: competition.sport_id,
        naipe: competition.naipe,
        division: competition.division,
        groups_count: competition.groups_count,
        qualifiers_per_group: competition.qualifiers_per_group,
        should_complete_knockout_with_best_second_placed_teams:
          competition.should_complete_knockout_with_best_second_placed_teams,
        knockout_pairing_mode: resolveCompetitionKnockoutPairingModeValue(
          competition.knockout_pairing_mode,
        ),
        third_place_mode: competition.third_place_mode,
        groups: competition.groups.map((group) => ({
          group_number: group.group_number,
          team_ids: [...new Set(group.team_ids)],
        })),
      }),
    );

    const normalizedScheduleDays = this.form_values.schedule_days.map(
      (scheduleDay) => ({
        date: scheduleDay.date,
        start_time: scheduleDay.start_time,
        end_time: scheduleDay.end_time,
        break_start_time: scheduleDay.break_start_time?.trim() ? scheduleDay.break_start_time.trim() : null,
        break_end_time: scheduleDay.break_end_time?.trim() ? scheduleDay.break_end_time.trim() : null,
        locations: scheduleDay.locations.map((location) => ({
          location_key: location.location_key,
          name: location.name.trim(),
          position: location.position,
          courts: location.courts.map((court) => {
            const normalizedSportIds = [...new Set(court.sport_ids)];
            const seenPrioritySportIds = new Set<string>();

            return {
              court_key: court.court_key,
              name: court.name.trim(),
              position: court.position,
              sport_ids: normalizedSportIds,
              sport_priorities: (court.sport_priorities ?? []).filter((sportPriority) => {
                if (
                  !normalizedSportIds.includes(sportPriority.sport_id) ||
                  seenPrioritySportIds.has(sportPriority.sport_id) ||
                  (sportPriority.preferred_naipe == null && sportPriority.preferred_division == null)
                ) {
                  return false;
                }

                seenPrioritySportIds.add(sportPriority.sport_id);
                return true;
              }),
            };
          }),
        })),
      }),
    );

    return {
      season_settings: {
        division_format: this.form_values.season_settings.division_format,
        division_settlement_mode:
          this.form_values.season_settings.division_settlement_mode,
        principal_slots_count:
          this.form_values.season_settings.principal_slots_count,
        principal_relegation_count:
          this.form_values.season_settings.principal_relegation_count,
        access_promotion_count:
          this.form_values.season_settings.access_promotion_count,
      },
      enabled_sport_ids: [...new Set(this.form_values.enabled_sport_ids)],
      participants: normalizedParticipants,
      competitions: normalizedCompetitions,
      schedule_days: normalizedScheduleDays,
      schedule_periods: this.form_values.schedule_periods.map((schedulePeriod) => ({
        date: schedulePeriod.date,
        period: schedulePeriod.period,
        enabled: schedulePeriod.enabled != false,
      })),
      competition_period_availability: this.form_values.competition_period_availability.map((availabilityItem) => ({
        competition_key: availabilityItem.competition_key,
        date: availabilityItem.date,
        period: availabilityItem.period,
        enabled: availabilityItem.enabled != false,
      })),
      team_competition_availability: this.form_values.team_competition_availability.map((availabilityItem) => ({
        team_id: availabilityItem.team_id,
        competition_key: availabilityItem.competition_key,
        date: availabilityItem.date,
        period: availabilityItem.period,
        enabled: availabilityItem.enabled != false,
      })),
      individual_event_configs: this.form_values.individual_event_configs.map((configItem) => ({
        sport_id: configItem.sport_id,
        placements_count: configItem.placements_count,
        placement_points: configItem.placement_points.map((placementPoint) => ({
          placement: placementPoint.placement,
          points: placementPoint.points,
        })),
        relay_multiplier: configItem.relay_multiplier,
      })),
      individual_session_configs: this.form_values.individual_session_configs.map((sessionConfig) => ({
        sport_id: sessionConfig.sport_id,
        naipe: sessionConfig.naipe,
        division: sessionConfig.division,
        scheduled_date: sessionConfig.scheduled_date,
        period: sessionConfig.period,
        location_key: sessionConfig.location_key,
        court_key: sessionConfig.court_key,
        location_name: sessionConfig.location_name,
        court_name: sessionConfig.court_name,
        exclusive_lock_enabled: sessionConfig.exclusive_lock_enabled == true,
      })),
      resource_locks: this.form_values.resource_locks.map((resourceLock) => ({
        date: resourceLock.date,
        period: resourceLock.period,
        location_key: resourceLock.location_key,
        court_key: resourceLock.court_key,
        location_name: resourceLock.location_name,
        court_name: resourceLock.court_name,
        lock_mode: resourceLock.lock_mode,
        competition_key: resourceLock.competition_key ?? null,
        sport_id: resourceLock.sport_id ?? null,
        naipe: resourceLock.naipe ?? null,
        division: resourceLock.division ?? null,
      })),
      knockout_program_blocks: this.form_values.knockout_program_blocks.map((programBlock) => ({
        date: programBlock.date,
        period: programBlock.period,
        location_key: programBlock.location_key,
        court_key: programBlock.court_key,
        location_name: programBlock.location_name ?? null,
        court_name: programBlock.court_name ?? null,
        sport_id: programBlock.sport_id,
        phase: "FINAL" as const,
        division_scope:
          this.form_values.season_settings.division_format ==
          ChampionshipSeasonDivisionFormat.UNIFIED
            ? "ALL"
            : programBlock.division_scope,
        naipe_sequence: [...new Set(programBlock.naipe_sequence)],
        display_order: programBlock.display_order,
      })),
    };
  }
}
