import type {
  ChampionshipBracketCourtSequenceMode,
  ChampionshipBracketSetupFormValues,
} from "@/domain/championship-brackets/championshipBracket.types";
import {
  resolveIndividualSessionSharedSlotKey,
} from "@/domain/championship-brackets/championshipBracketIndividualSessionSharing";
import {
  resolveFixedTimeRangeInterval,
  resolveTimeIntervalsOverlap,
} from "@/domain/championship-brackets/championshipBracketFixedTimeRange";
import { resolveCompetitionKnockoutPairingModeValue } from "@/domain/championship-brackets/championshipBracketPairing";
import {
  ChampionshipSeasonDivisionFormat,
  ChampionshipSeasonDivisionSettlementMode,
  YellowCardResetPhase,
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
          throw new Error(
            "Participante com modalidade fora do catálogo ativo do campeonato.",
          );
        }
      });
    });
  }

  private validateEnabledSports() {
    if (this.form_values.enabled_sport_ids.length == 0) {
      throw new Error(
        "Selecione ao menos uma modalidade ativa para o campeonato.",
      );
    }
  }

  private validateSeasonSettings() {
    const seasonSettings = this.form_values.season_settings;

    if (!seasonSettings) {
      throw new Error("Configure o formato sazonal do campeonato.");
    }

    if (
      seasonSettings.division_format ==
      ChampionshipSeasonDivisionFormat.SEPARATED
    ) {
      if (
        seasonSettings.division_settlement_mode ==
          ChampionshipSeasonDivisionSettlementMode.PROMOTION_RELEGATION &&
        ((seasonSettings.principal_relegation_count ?? 0) <= 0 ||
          (seasonSettings.access_promotion_count ?? 0) <= 0)
      ) {
        throw new Error(
          "Informe quantas atléticas sobem e caem no formato separado.",
        );
      }
    }

    if (
      seasonSettings.division_format == ChampionshipSeasonDivisionFormat.UNIFIED
    ) {
      if (
        seasonSettings.division_settlement_mode ==
          ChampionshipSeasonDivisionSettlementMode.TOP_N_TO_PRINCIPAL &&
        (seasonSettings.principal_slots_count ?? 0) <= 0
      ) {
        throw new Error(
          "Informe a quantidade de vagas da divisão principal no formato unificado.",
        );
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
        throw new Error(
          "Competições unificadas não podem carregar divisão definida.",
        );
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

  private resolveCourtSequenceMode(
    sequenceMode: unknown,
  ): ChampionshipBracketCourtSequenceMode {
    if (sequenceMode == null || sequenceMode === "") {
      return "FLEXIBLE";
    }

    switch (sequenceMode) {
      case "FLEXIBLE":
        return "FLEXIBLE";

      case "GROUP_NAIPE":
        return "GROUP_NAIPE";

      case "GROUP_DIVISION":
        return "GROUP_DIVISION";

      default:
        throw new Error("Estratégia de sequenciamento da quadra inválida.");
    }
  }

  private validateScheduleDays() {
    if (this.form_values.schedule_days.length == 0) {
      throw new Error("Configure ao menos um dia de agenda do campeonato.");
    }

    const activeCollectiveSportIdSet = new Set(
      this.form_values.competitions.map((competition) => competition.sport_id),
    );
    const plannedCollectiveSportIdSet = new Set<string>();

    this.form_values.schedule_days.forEach((schedule_day) => {
      if (
        !schedule_day.date ||
        !schedule_day.start_time ||
        !schedule_day.end_time
      ) {
        throw new Error("Dia de agenda inválido: preencha data, início e fim.");
      }

      const startMinutes = this.resolveTimeValueToMinutes(
        schedule_day.start_time,
      );
      const endMinutes = this.resolveTimeValueToMinutes(schedule_day.end_time);

      if (
        startMinutes == null ||
        endMinutes == null ||
        endMinutes <= startMinutes
      ) {
        throw new Error(
          "Dia de agenda inválido: fim precisa ser maior que início.",
        );
      }

      const breakStartTimeValue = schedule_day.break_start_time?.trim() ?? "";
      const breakEndTimeValue = schedule_day.break_end_time?.trim() ?? "";
      const hasBreakStartTime = breakStartTimeValue.length > 0;
      const hasBreakEndTime = breakEndTimeValue.length > 0;

      if (hasBreakStartTime != hasBreakEndTime) {
        throw new Error(
          "Dia de agenda inválido: preencha início e fim do intervalo.",
        );
      }

      if (hasBreakStartTime && hasBreakEndTime) {
        const breakStartMinutes =
          this.resolveTimeValueToMinutes(breakStartTimeValue);
        const breakEndMinutes =
          this.resolveTimeValueToMinutes(breakEndTimeValue);

        if (
          breakStartMinutes == null ||
          breakEndMinutes == null ||
          breakEndMinutes <= breakStartMinutes
        ) {
          throw new Error(
            "Dia de agenda inválido: o fim do intervalo precisa ser maior que o início.",
          );
        }

        if (breakStartMinutes < startMinutes || breakEndMinutes > endMinutes) {
          throw new Error(
            "Dia de agenda inválido: intervalo fora da janela do dia.",
          );
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

          const sportMatchTargets = court.sport_match_targets ?? [];
          const seenTargetSportIds = new Set<string>();

          sportMatchTargets.forEach((target) => {
            if (!court.sport_ids.includes(target.sport_id)) {
              throw new Error(
                `A meta de jogos da quadra ${court.name} possui uma modalidade não vinculada à quadra.`,
              );
            }

            if (
              !this.form_values.competitions.some(
                (competition) => competition.sport_id == target.sport_id,
              )
            ) {
              throw new Error(
                `A meta de jogos da quadra ${court.name} possui uma modalidade sem competição ativa.`,
              );
            }

            if (
              !Number.isInteger(target.planned_match_count) ||
              target.planned_match_count <= 0
            ) {
              throw new Error(
                `A quantidade planejada de jogos da quadra ${court.name} precisa ser um número inteiro maior que zero.`,
              );
            }

            if (seenTargetSportIds.has(target.sport_id)) {
              throw new Error(
                `A quadra ${court.name} possui mais de uma meta para a mesma modalidade.`,
              );
            }

            seenTargetSportIds.add(target.sport_id);
            plannedCollectiveSportIdSet.add(target.sport_id);
          });

          const sportPreference = court.sport_preference;

          if (!sportPreference) {
            return;
          }

          if (!court.sport_ids.includes(sportPreference.preferred_sport_id)) {
            throw new Error(
              `A modalidade preferencial da quadra ${court.name} não está vinculada à quadra.`,
            );
          }

          const preferredSportCompetitions =
            this.form_values.competitions.filter(
              (competition) =>
                competition.sport_id == sportPreference.preferred_sport_id,
            );

          if (preferredSportCompetitions.length == 0) {
            throw new Error(
              `A modalidade preferencial da quadra ${court.name} não possui competição ativa.`,
            );
          }

          const sequenceMode = this.resolveCourtSequenceMode(
            sportPreference.sequence_mode,
          );

          const availableNaipes = [
            ...new Set(
              preferredSportCompetitions.map(
                (competition) => competition.naipe,
              ),
            ),
          ];

          const availableDivisions = [
            ...new Set(
              preferredSportCompetitions
                .map((competition) => competition.division)
                .filter(
                  (division): division is NonNullable<typeof division> =>
                    division != null,
                ),
            ),
          ];

          if (sequenceMode == "GROUP_NAIPE") {
            if (sportPreference.preferred_naipe == null) {
              throw new Error(
                `Defina o primeiro naipe do agrupamento da quadra ${court.name}.`,
              );
            }

            if (availableNaipes.length < 2) {
              throw new Error(
                `A modalidade selecionada na quadra ${court.name} precisa possuir ao menos dois naipes ativos para agrupamento por naipe.`,
              );
            }

            if (sportPreference.preferred_division != null) {
              throw new Error(
                `O agrupamento por naipe da quadra ${court.name} não pode carregar divisão preferencial.`,
              );
            }

            if (
              sportPreference.alternate_naipe_after_exclusive_knockout_phase ===
                true &&
              availableNaipes.length != 2
            ) {
              throw new Error(
                `A alternância após fase eliminatória exclusiva da quadra ${court.name} exige exatamente dois naipes ativos.`,
              );
            }
          } else if (
            sportPreference.alternate_naipe_after_exclusive_knockout_phase ===
            true
          ) {
            throw new Error(
              `A alternância após fase eliminatória exclusiva da quadra ${court.name} exige agrupamento por naipe.`,
            );
          }

          if (sequenceMode == "GROUP_DIVISION") {
            if (
              this.form_values.season_settings.division_format !=
              ChampionshipSeasonDivisionFormat.SEPARATED
            ) {
              throw new Error(
                `A quadra ${court.name} não pode agrupar por divisão em uma temporada unificada.`,
              );
            }

            if (sportPreference.preferred_division == null) {
              throw new Error(
                `Defina a primeira divisão do agrupamento da quadra ${court.name}.`,
              );
            }

            if (availableDivisions.length < 2) {
              throw new Error(
                `A modalidade selecionada na quadra ${court.name} precisa possuir ao menos duas divisões ativas para agrupamento por divisão.`,
              );
            }

            if (sportPreference.preferred_naipe != null) {
              throw new Error(
                `O agrupamento por divisão da quadra ${court.name} não pode carregar naipe preferencial.`,
              );
            }
          }

          if (
            sportPreference.preferred_naipe != null &&
            !preferredSportCompetitions.some(
              (competition) =>
                competition.naipe == sportPreference.preferred_naipe,
            )
          ) {
            throw new Error(
              `O naipe preferencial da quadra ${court.name} não está disponível para a modalidade selecionada.`,
            );
          }

          if (
            this.form_values.season_settings.division_format ==
              ChampionshipSeasonDivisionFormat.UNIFIED &&
            sportPreference.preferred_division != null
          ) {
            throw new Error(
              `A quadra ${court.name} não pode possuir divisão preferencial em uma temporada unificada.`,
            );
          }

          if (
            sportPreference.preferred_division != null &&
            !preferredSportCompetitions.some(
              (competition) =>
                competition.division == sportPreference.preferred_division,
            )
          ) {
            throw new Error(
              `A divisão preferencial da quadra ${court.name} não está disponível para a modalidade selecionada.`,
            );
          }

          if (
            sportPreference.preferred_naipe != null &&
            sportPreference.preferred_division != null &&
            !preferredSportCompetitions.some(
              (competition) =>
                competition.naipe == sportPreference.preferred_naipe &&
                competition.division == sportPreference.preferred_division,
            )
          ) {
            throw new Error(
              `A combinação de naipe e divisão preferencial da quadra ${court.name} não possui competição ativa correspondente.`,
            );
          }
        });
      });
    });

    const hasCollectiveSportWithoutPlan = [...activeCollectiveSportIdSet].some(
      (sportId) => !plannedCollectiveSportIdSet.has(sportId),
    );

    if (hasCollectiveSportWithoutPlan) {
      throw new Error(
        "Toda modalidade coletiva ativa precisa ter ao menos uma quantidade planejada de jogos.",
      );
    }
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

  private validateAvailabilityWindowsForScheduleDay(
    mode: "UNAVAILABLE" | "FULL_DAY" | "CUSTOM",
    windows: Array<{
      start_time: string;
      end_time: string;
    }>,
    scheduleDay: ChampionshipBracketSetupFormValues["schedule_days"][number],
    contextLabel: string,
  ) {
    if (
      mode != "UNAVAILABLE" &&
      mode != "FULL_DAY" &&
      mode != "CUSTOM"
    ) {
      throw new Error(`${contextLabel} possui modo inválido.`);
    }

    if (mode != "CUSTOM") {
      if (windows.length > 0) {
        throw new Error(`${contextLabel} não pode possuir janelas no modo ${mode}.`);
      }

      return;
    }

    if (windows.length == 0) {
      throw new Error(
        `${contextLabel} personalizada precisa possuir ao menos uma janela.`,
      );
    }

    const dayStartMinutes = this.resolveTimeValueToMinutes(
      scheduleDay.start_time,
    );
    const dayEndMinutes = this.resolveTimeValueToMinutes(scheduleDay.end_time);

    if (dayStartMinutes == null || dayEndMinutes == null) {
      throw new Error(`${contextLabel} está vinculada a um dia inválido.`);
    }

    const resolvedWindows = windows
      .map((window) => {
        const startMinutes = this.resolveTimeValueToMinutes(window.start_time);
        const endMinutes = this.resolveTimeValueToMinutes(window.end_time);

        if (
          startMinutes == null ||
          endMinutes == null ||
          endMinutes <= startMinutes
        ) {
          throw new Error(`${contextLabel} possui horário inválido.`);
        }

        if (
          startMinutes < dayStartMinutes ||
          endMinutes > dayEndMinutes
        ) {
          throw new Error(
            `${contextLabel} precisa permanecer dentro da janela do dia.`,
          );
        }

        return {
          start: startMinutes,
          end: endMinutes,
        };
      })
      .sort((left, right) => left.start - right.start);

    for (
      let windowIndex = 1;
      windowIndex < resolvedWindows.length;
      windowIndex += 1
    ) {
      const previousWindow = resolvedWindows[windowIndex - 1];
      const currentWindow = resolvedWindows[windowIndex];

      if (
        previousWindow &&
        currentWindow &&
        currentWindow.start < previousWindow.end
      ) {
        throw new Error(`${contextLabel} possui janelas de horário sobrepostas.`);
      }
    }
  }

  private resolveDateAvailabilityIntervals(
    mode: "UNAVAILABLE" | "FULL_DAY" | "CUSTOM",
    windows: Array<{
      start_time: string;
      end_time: string;
    }>,
    scheduleDay: ChampionshipBracketSetupFormValues["schedule_days"][number],
  ): Array<{
    start: number;
    end: number;
  }> {
    if (mode == "UNAVAILABLE") {
      return [];
    }

    const dayStartMinutes = this.resolveTimeValueToMinutes(
      scheduleDay.start_time,
    );
    const dayEndMinutes = this.resolveTimeValueToMinutes(scheduleDay.end_time);

    if (dayStartMinutes == null || dayEndMinutes == null) {
      return [];
    }

    const baseIntervals =
      mode == "FULL_DAY"
        ? [
            {
              start: dayStartMinutes,
              end: dayEndMinutes,
            },
          ]
        : windows
            .map((window) => {
              const startMinutes = this.resolveTimeValueToMinutes(
                window.start_time,
              );
              const endMinutes = this.resolveTimeValueToMinutes(
                window.end_time,
              );

              return {
                start: startMinutes ?? 0,
                end: endMinutes ?? 0,
              };
            })
            .filter((interval) => interval.end > interval.start);

    const breakStartMinutes = scheduleDay.break_start_time
      ? this.resolveTimeValueToMinutes(scheduleDay.break_start_time)
      : null;
    const breakEndMinutes = scheduleDay.break_end_time
      ? this.resolveTimeValueToMinutes(scheduleDay.break_end_time)
      : null;

    if (
      breakStartMinutes == null ||
      breakEndMinutes == null ||
      breakEndMinutes <= breakStartMinutes
    ) {
      return baseIntervals;
    }

    return baseIntervals.flatMap((interval) => {
      if (
        interval.end <= breakStartMinutes ||
        interval.start >= breakEndMinutes
      ) {
        return [interval];
      }

      const resultingIntervals: Array<{
        start: number;
        end: number;
      }> = [];

      if (interval.start < breakStartMinutes) {
        resultingIntervals.push({
          start: interval.start,
          end: breakStartMinutes,
        });
      }

      if (interval.end > breakEndMinutes) {
        resultingIntervals.push({
          start: breakEndMinutes,
          end: interval.end,
        });
      }

      return resultingIntervals;
    });
  }

  private validateDateAvailability() {
    const competitionDateAvailability =
      this.form_values.competition_date_availability;
    const teamCompetitionDateAvailability =
      this.form_values.team_competition_date_availability;

    if (
      competitionDateAvailability == null &&
      teamCompetitionDateAvailability == null
    ) {
      return;
    }

    if (
      competitionDateAvailability == null ||
      teamCompetitionDateAvailability == null
    ) {
      throw new Error(
        "As disponibilidades por data de competições e atléticas precisam ser configuradas em conjunto.",
      );
    }

    const scheduleDayByDate = new Map(
      this.form_values.schedule_days.map((scheduleDay) => [
        scheduleDay.date,
        scheduleDay,
      ]),
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

    const competitionAvailabilityByKey = new Map<
      string,
      (typeof competitionDateAvailability)[number]
    >();

    competitionDateAvailability.forEach((availabilityItem) => {
      if (!competitionKeySet.has(availabilityItem.competition_key)) {
        throw new Error(
          "Disponibilidade por data vinculada a uma competição inválida.",
        );
      }

      const scheduleDay = scheduleDayByDate.get(availabilityItem.date);

      if (!scheduleDay) {
        throw new Error(
          "Disponibilidade por data da competição fora da agenda.",
        );
      }

      const availabilityKey = `${availabilityItem.competition_key}::${availabilityItem.date}`;

      if (competitionAvailabilityByKey.has(availabilityKey)) {
        throw new Error("Disponibilidade por data da competição duplicada.");
      }

      this.validateAvailabilityWindowsForScheduleDay(
        availabilityItem.mode,
        availabilityItem.windows,
        scheduleDay,
        "Disponibilidade da competição",
      );

      competitionAvailabilityByKey.set(availabilityKey, availabilityItem);
    });

    competitionKeySet.forEach((competitionKey) => {
      this.form_values.schedule_days.forEach((scheduleDay) => {
        if (
          !competitionAvailabilityByKey.has(
            `${competitionKey}::${scheduleDay.date}`,
          )
        ) {
          throw new Error(
            "Toda competição precisa possuir disponibilidade configurada para cada dia da agenda.",
          );
        }
      });

      const hasAvailableDate = this.form_values.schedule_days.some(
        (scheduleDay) => {
          const availabilityItem = competitionAvailabilityByKey.get(
            `${competitionKey}::${scheduleDay.date}`,
          );

          if (!availabilityItem) {
            return false;
          }

          return (
            this.resolveDateAvailabilityIntervals(
              availabilityItem.mode,
              availabilityItem.windows,
              scheduleDay,
            ).length > 0
          );
        },
      );

      if (!hasAvailableDate) {
        throw new Error(
          "Toda competição precisa ter ao menos um dia com disponibilidade real.",
        );
      }
    });

    const teamCompetitionKeysByTeamId =
      this.form_values.participants.reduce<Record<string, string[]>>(
        (carry, participant) => {
          const competitionKeys = participant.modalities
            .map((modality) =>
              this.resolveCompetitionKey(
                modality.sport_id,
                modality.naipe,
                modality.division,
              ),
            )
            .filter((competitionKey) =>
              competitionKeySet.has(competitionKey),
            );

          if (competitionKeys.length > 0) {
            carry[participant.team_id] = [...new Set(competitionKeys)];
          }

          return carry;
        },
        {},
      );
    const validTeamCompetitionPairSet = new Set(
      Object.entries(teamCompetitionKeysByTeamId).flatMap(
        ([team_id, competitionKeys]) =>
          competitionKeys.map(
            (competitionKey) => `${team_id}::${competitionKey}`,
          ),
      ),
    );

    const teamAvailabilityByKey = new Map<
      string,
      (typeof teamCompetitionDateAvailability)[number]
    >();

    teamCompetitionDateAvailability.forEach((availabilityItem) => {
      const teamCompetitionPairKey = `${availabilityItem.team_id}::${availabilityItem.competition_key}`;

      if (!validTeamCompetitionPairSet.has(teamCompetitionPairKey)) {
        throw new Error(
          "Disponibilidade por data da atlética inválida para a competição configurada.",
        );
      }

      const scheduleDay = scheduleDayByDate.get(availabilityItem.date);

      if (!scheduleDay) {
        throw new Error(
          "Disponibilidade por data da atlética fora da agenda.",
        );
      }

      const availabilityKey = `${teamCompetitionPairKey}::${availabilityItem.date}`;

      if (teamAvailabilityByKey.has(availabilityKey)) {
        throw new Error("Disponibilidade por data da atlética duplicada.");
      }

      this.validateAvailabilityWindowsForScheduleDay(
        availabilityItem.mode,
        availabilityItem.windows,
        scheduleDay,
        "Disponibilidade da atlética",
      );

      teamAvailabilityByKey.set(availabilityKey, availabilityItem);
    });

    Object.entries(teamCompetitionKeysByTeamId).forEach(
      ([team_id, competitionKeys]) => {
        competitionKeys.forEach((competitionKey) => {
          this.form_values.schedule_days.forEach((scheduleDay) => {
            if (
              !teamAvailabilityByKey.has(
                `${team_id}::${competitionKey}::${scheduleDay.date}`,
              )
            ) {
              throw new Error(
                "Toda atlética precisa possuir disponibilidade configurada para cada dia e competição.",
              );
            }
          });

          const hasCommonAvailability =
            this.form_values.schedule_days.some((scheduleDay) => {
              const competitionAvailability =
                competitionAvailabilityByKey.get(
                  `${competitionKey}::${scheduleDay.date}`,
                );
              const teamAvailability = teamAvailabilityByKey.get(
                `${team_id}::${competitionKey}::${scheduleDay.date}`,
              );

              if (!competitionAvailability || !teamAvailability) {
                return false;
              }

              const competitionIntervals =
                this.resolveDateAvailabilityIntervals(
                  competitionAvailability.mode,
                  competitionAvailability.windows,
                  scheduleDay,
                );
              const teamIntervals =
                this.resolveDateAvailabilityIntervals(
                  teamAvailability.mode,
                  teamAvailability.windows,
                  scheduleDay,
                );

              return competitionIntervals.some((competitionInterval) =>
                teamIntervals.some(
                  (teamInterval) =>
                    Math.max(
                      competitionInterval.start,
                      teamInterval.start,
                    ) <
                    Math.min(
                      competitionInterval.end,
                      teamInterval.end,
                    ),
                ),
              );
            });

          if (!hasCommonAvailability) {
            throw new Error(
              "Toda atlética precisa ter ao menos uma janela real compatível com sua competição.",
            );
          }
        });
      },
    );
  }

  private validateIndividualEventConfigs() {
    const enabledSportIdSet = new Set(this.form_values.enabled_sport_ids);
    const seenSportIds = new Set<string>();

    this.form_values.individual_event_configs.forEach((configItem) => {
      if (!configItem.sport_id) {
        throw new Error("Configuração de modalidade individual inválida.");
      }

      if (!enabledSportIdSet.has(configItem.sport_id)) {
        throw new Error(
          "Configuração individual vinculada a uma modalidade inativa.",
        );
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
          throw new Error(
            "Pontuação individual duplicada para a mesma colocação.",
          );
        }

        if (placementPoint.points == null) {
          throw new Error(
            "Toda colocação pontuada precisa ter pontuação definida.",
          );
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
        throw new Error(
          "Toda colocação de 1 até N precisa ter pontuação definida.",
        );
      }

      if (configItem.relay_multiplier <= 0) {
        throw new Error("Multiplicador de revezamento inválido.");
      }

      seenSportIds.add(configItem.sport_id);
    });
  }

  private validateIndividualSessionConfigs() {
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
        throw new Error(
          "Sessão individual duplicada para a mesma modalidade/naipe/divisão.",
        );
      }

      seenSessionKeys.add(sessionKey);

      if (!participantCompetitionKeySet.has(sessionKey)) {
        throw new Error(
          "Sessão individual sem participantes válidos no campeonato.",
        );
      }

      if (
        !sessionConfig.scheduled_date ||
        !sessionConfig.start_time ||
        !sessionConfig.end_time ||
        !sessionConfig.location_key ||
        !sessionConfig.court_key
      ) {
        throw new Error(
          "Toda sessão individual ativa precisa ter dia, horário e recurso oficial definidos.",
        );
      }

      const scheduleDay = this.form_values.schedule_days.find(
        (currentScheduleDay) =>
          currentScheduleDay.date == sessionConfig.scheduled_date,
      );

      if (!scheduleDay) {
        throw new Error("Sessão individual fora da agenda do campeonato.");
      }

      if (
        !resolveFixedTimeRangeInterval({
          scheduleDay,
          start_time: sessionConfig.start_time,
          end_time: sessionConfig.end_time,
        })
      ) {
        throw new Error(
          "Sessão individual precisa usar um horário válido dentro da agenda do dia.",
        );
      }
    });
  }

  private validateResourceLocks() {
    const seenLockKeys = new Set<string>();

    this.form_values.resource_locks.forEach((resourceLock) => {
      const scheduleDay = this.form_values.schedule_days.find(
        (currentScheduleDay) => currentScheduleDay.date == resourceLock.date,
      );

      if (!scheduleDay) {
        throw new Error("Reserva de recurso fora da agenda configurada.");
      }

      if (!resourceLock.location_key || !resourceLock.court_key) {
        throw new Error("Reserva de recurso inválida.");
      }

      if (
        !resolveFixedTimeRangeInterval({
          scheduleDay,
          start_time: resourceLock.start_time,
          end_time: resourceLock.end_time,
        })
      ) {
        throw new Error(
          "Reserva de recurso precisa usar um horário válido dentro da agenda do dia.",
        );
      }

      const lockKey = [
        resourceLock.date,
        resourceLock.start_time,
        resourceLock.end_time,
        resourceLock.location_key,
        resourceLock.court_key,
      ].join("::");

      if (resourceLock.lock_mode == "HARD" && seenLockKeys.has(lockKey)) {
        throw new Error(
          "Existe mais de um bloqueio duro para o mesmo recurso no mesmo horário.",
        );
      }

      seenLockKeys.add(lockKey);
    });
  }

  private validateKnockoutProgramBlocks() {
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
        !programBlock.sport_id ||
        !programBlock.start_time ||
        !programBlock.end_time
      ) {
        throw new Error("Bloco manual de final inválido.");
      }

      if (
        !Number.isInteger(programBlock.display_order) ||
        programBlock.display_order < 1
      ) {
        throw new Error("Ordem do bloco manual de final inválida.");
      }

      if (
        programBlock.match_duration_minutes_override != null &&
        (!Number.isInteger(programBlock.match_duration_minutes_override) ||
          programBlock.match_duration_minutes_override <= 0)
      ) {
        throw new Error(
          "A duração especial do bloco manual de final precisa ser um número inteiro maior que zero.",
        );
      }

      const scheduleDay = this.form_values.schedule_days.find(
        (currentScheduleDay) => currentScheduleDay.date == programBlock.date,
      );

      if (!scheduleDay) {
        throw new Error("Bloco manual de final fora da agenda configurada.");
      }

      if (
        !resolveFixedTimeRangeInterval({
          scheduleDay,
          start_time: programBlock.start_time,
          end_time: programBlock.end_time,
        })
      ) {
        throw new Error(
          "Bloco manual de final precisa usar um horário válido dentro da agenda do dia.",
        );
      }

      if (programBlock.naipe_sequence.length == 0) {
        throw new Error(
          "Defina ao menos um naipe para o bloco manual de final.",
        );
      }

      if (
        this.form_values.season_settings.division_format ==
          ChampionshipSeasonDivisionFormat.UNIFIED &&
        programBlock.division_scope != "ALL"
      ) {
        throw new Error(
          "Blocos manuais de final unificados não podem carregar divisão específica.",
        );
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

        const hasExactCompetition = competitionKeySet.has(
          resolvedCompetitionKey,
        );
        const hasAnyCompetitionForNaipe =
          programBlock.division_scope == "ALL" &&
          this.form_values.competitions.some((competition) => {
            return (
              competition.sport_id == programBlock.sport_id &&
              competition.naipe == naipe
            );
          });

        if (!hasExactCompetition && !hasAnyCompetitionForNaipe) {
          throw new Error(
            "Bloco manual de final sem competição ativa correspondente.",
          );
        }
      });
    });
  }

  private validateFixedTimeConflicts() {
    const derivedSessionLockKeySet = new Set(
      this.form_values.individual_session_configs
        .filter(
          (sessionConfig) =>
            sessionConfig.exclusive_lock_enabled == true &&
            sessionConfig.scheduled_date &&
            sessionConfig.start_time &&
            sessionConfig.end_time &&
            sessionConfig.location_key &&
            sessionConfig.court_key,
        )
        .map((sessionConfig) =>
          resolveIndividualSessionSharedSlotKey({
            sport_id: sessionConfig.sport_id,
            division: sessionConfig.division,
            scheduled_date: sessionConfig.scheduled_date,
            start_time: sessionConfig.start_time,
            end_time: sessionConfig.end_time,
            location_key: sessionConfig.location_key,
            court_key: sessionConfig.court_key,
          }),
        ),
    );
    const derivedSessionLockKeySetWithoutNull = new Set(
      [...derivedSessionLockKeySet].filter(
        (sessionKey): sessionKey is string => sessionKey != null,
      ),
    );

    const fixedEntries = [
      ...this.form_values.individual_session_configs.flatMap((sessionConfig) => {
        if (
          !sessionConfig.scheduled_date ||
          !sessionConfig.start_time ||
          !sessionConfig.end_time ||
          !sessionConfig.location_key ||
          !sessionConfig.court_key
        ) {
          return [];
        }

        const scheduleDay = this.form_values.schedule_days.find(
          (currentScheduleDay) =>
            currentScheduleDay.date == sessionConfig.scheduled_date,
        );

        const interval = scheduleDay
          ? resolveFixedTimeRangeInterval({
              scheduleDay,
              start_time: sessionConfig.start_time,
              end_time: sessionConfig.end_time,
            })
          : null;

        if (!interval) {
          return [];
        }

        return [
          {
            key: [
              sessionConfig.scheduled_date,
              sessionConfig.location_key,
              sessionConfig.court_key,
              sessionConfig.start_time,
              sessionConfig.end_time,
              "INDIVIDUAL_SESSION",
            ].join("::"),
            type: "INDIVIDUAL_SESSION" as const,
            date: sessionConfig.scheduled_date,
            location_key: sessionConfig.location_key,
            court_key: sessionConfig.court_key,
            sport_id: sessionConfig.sport_id,
            naipe: sessionConfig.naipe,
            division: sessionConfig.division,
            shared_slot_key: resolveIndividualSessionSharedSlotKey({
              sport_id: sessionConfig.sport_id,
              naipe: sessionConfig.naipe,
              division: sessionConfig.division,
              scheduled_date: sessionConfig.scheduled_date,
              start_time: sessionConfig.start_time,
              end_time: sessionConfig.end_time,
              location_key: sessionConfig.location_key,
              court_key: sessionConfig.court_key,
            }),
            interval,
          },
        ];
      }),
      ...this.form_values.resource_locks.flatMap((resourceLock) => {
        if (
          !resourceLock.location_key ||
          !resourceLock.court_key ||
          derivedSessionLockKeySetWithoutNull.has(
            resolveIndividualSessionSharedSlotKey({
              sport_id: resourceLock.sport_id,
              division: resourceLock.division,
              date: resourceLock.date,
              start_time: resourceLock.start_time,
              end_time: resourceLock.end_time,
              location_key: resourceLock.location_key,
              court_key: resourceLock.court_key,
            }),
          )
        ) {
          return [];
        }

        const scheduleDay = this.form_values.schedule_days.find(
          (currentScheduleDay) => currentScheduleDay.date == resourceLock.date,
        );

        const interval = scheduleDay
          ? resolveFixedTimeRangeInterval({
              scheduleDay,
              start_time: resourceLock.start_time,
              end_time: resourceLock.end_time,
            })
          : null;

        if (!interval) {
          return [];
        }

        return [
          {
            key: [
              resourceLock.date,
              resourceLock.location_key,
              resourceLock.court_key,
              resourceLock.start_time,
              resourceLock.end_time,
              "RESOURCE_LOCK",
            ].join("::"),
            type: "RESOURCE_LOCK" as const,
            date: resourceLock.date,
            location_key: resourceLock.location_key,
            court_key: resourceLock.court_key,
            sport_id: resourceLock.sport_id,
            naipe: resourceLock.naipe,
            division: resourceLock.division,
            shared_slot_key: null,
            interval,
          },
        ];
      }),
      ...this.form_values.knockout_program_blocks.flatMap((programBlock) => {
        if (
          !programBlock.location_key ||
          !programBlock.court_key ||
          !programBlock.start_time ||
          !programBlock.end_time
        ) {
          return [];
        }

        const scheduleDay = this.form_values.schedule_days.find(
          (currentScheduleDay) => currentScheduleDay.date == programBlock.date,
        );

        const interval = scheduleDay
          ? resolveFixedTimeRangeInterval({
              scheduleDay,
              start_time: programBlock.start_time,
              end_time: programBlock.end_time,
            })
          : null;

        if (!interval) {
          return [];
        }

        return [
          {
            key: [
              programBlock.date,
              programBlock.location_key,
              programBlock.court_key,
              programBlock.start_time,
              programBlock.end_time,
              "MANUAL_FINAL_BLOCK",
            ].join("::"),
            type: "MANUAL_FINAL_BLOCK" as const,
            date: programBlock.date,
            location_key: programBlock.location_key,
            court_key: programBlock.court_key,
            sport_id: programBlock.sport_id,
            naipe: null,
            division: null,
            shared_slot_key: null,
            interval,
          },
        ];
      }),
    ]
      .sort((left, right) => left.interval.start - right.interval.start)
      .sort((left, right) => left.date.localeCompare(right.date));

    for (let entryIndex = 1; entryIndex < fixedEntries.length; entryIndex += 1) {
      const previousEntry = fixedEntries[entryIndex - 1];
      const currentEntry = fixedEntries[entryIndex];

      if (
        !previousEntry ||
        !currentEntry ||
        previousEntry.date != currentEntry.date ||
        previousEntry.location_key != currentEntry.location_key ||
        previousEntry.court_key != currentEntry.court_key
      ) {
        continue;
      }

      const canShareIndividualSessionSlot =
        previousEntry.type == "INDIVIDUAL_SESSION" &&
        currentEntry.type == "INDIVIDUAL_SESSION" &&
        previousEntry.shared_slot_key != null &&
        previousEntry.shared_slot_key == currentEntry.shared_slot_key &&
        previousEntry.naipe != null &&
        currentEntry.naipe != null &&
        previousEntry.naipe != currentEntry.naipe;

      if (
        !canShareIndividualSessionSlot &&
        resolveTimeIntervalsOverlap(previousEntry.interval, currentEntry.interval)
      ) {
        throw new Error(
          "Existem blocos fixos com horários sobrepostos no mesmo recurso.",
        );
      }
    }
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
    this.validateDateAvailability();
    this.validateIndividualEventConfigs();
    this.validateIndividualSessionConfigs();
    this.validateResourceLocks();
    this.validateKnockoutProgramBlocks();
    this.validateFixedTimeConflicts();

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
        break_start_time: scheduleDay.break_start_time?.trim()
          ? scheduleDay.break_start_time.trim()
          : null,
        break_end_time: scheduleDay.break_end_time?.trim()
          ? scheduleDay.break_end_time.trim()
          : null,
        locations: scheduleDay.locations.map((location) => ({
          location_key: location.location_key,
          name: location.name.trim(),
          position: location.position,
          courts: location.courts.map((court) => {
            const normalizedSportIds = [...new Set(court.sport_ids)];

            const normalizedSportMatchTargets = [
              ...(court.sport_match_targets ?? []).reduce(
                (targetBySportId, target) => {
                  if (
                    normalizedSportIds.includes(target.sport_id) &&
                    Number.isInteger(target.planned_match_count) &&
                    target.planned_match_count > 0
                  ) {
                    targetBySportId.set(target.sport_id, {
                      sport_id: target.sport_id,
                      planned_match_count: target.planned_match_count,
                    });
                  }

                  return targetBySportId;
                },
                new Map<
                  string,
                  {
                    sport_id: string;
                    planned_match_count: number;
                  }
                >(),
              ).values(),
            ];

            const sportPreference = court.sport_preference;

            return {
              court_key: court.court_key,
              name: court.name.trim(),
              position: court.position,
              sport_ids: normalizedSportIds,
              sport_match_targets: normalizedSportMatchTargets,
              sport_preference: sportPreference
                ? {
                    preferred_sport_id: sportPreference.preferred_sport_id,

                    preferred_naipe: sportPreference.preferred_naipe ?? null,

                    preferred_division:
                      this.form_values.season_settings.division_format ==
                      ChampionshipSeasonDivisionFormat.SEPARATED
                        ? (sportPreference.preferred_division ?? null)
                        : null,

                    sequence_mode: this.resolveCourtSequenceMode(
                      sportPreference.sequence_mode,
                    ),

                    alternate_naipe_after_exclusive_knockout_phase:
                      sportPreference.alternate_naipe_after_exclusive_knockout_phase ===
                        true &&
                      this.resolveCourtSequenceMode(
                        sportPreference.sequence_mode,
                      ) == "GROUP_NAIPE",
                  }
                : null,
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
        yellow_card_reset_phase:
          this.form_values.season_settings.yellow_card_reset_phase ??
          YellowCardResetPhase.NONE,
      },
      enabled_sport_ids: [...new Set(this.form_values.enabled_sport_ids)],
      participants: normalizedParticipants,
      competitions: normalizedCompetitions,
      schedule_days: normalizedScheduleDays,
      competition_date_availability:
        this.form_values.competition_date_availability?.map(
          (availabilityItem) => ({
            competition_key: availabilityItem.competition_key,
            date: availabilityItem.date,
            mode: availabilityItem.mode,
            windows: availabilityItem.windows.map((window) => ({
              start_time: window.start_time,
              end_time: window.end_time,
            })),
          }),
        ),
      team_competition_date_availability:
        this.form_values.team_competition_date_availability?.map(
          (availabilityItem) => ({
            team_id: availabilityItem.team_id,
            competition_key: availabilityItem.competition_key,
            date: availabilityItem.date,
            mode: availabilityItem.mode,
            windows: availabilityItem.windows.map((window) => ({
              start_time: window.start_time,
              end_time: window.end_time,
            })),
          }),
        ),
      individual_event_configs: this.form_values.individual_event_configs.map(
        (configItem) => ({
          sport_id: configItem.sport_id,
          placements_count: configItem.placements_count,
          placement_points: configItem.placement_points.map(
            (placementPoint) => ({
              placement: placementPoint.placement,
              points: placementPoint.points,
            }),
          ),
          relay_multiplier: configItem.relay_multiplier,
        }),
      ),
      individual_session_configs:
        this.form_values.individual_session_configs.map((sessionConfig) => ({
          sport_id: sessionConfig.sport_id,
          naipe: sessionConfig.naipe,
          division: sessionConfig.division,
          scheduled_date: sessionConfig.scheduled_date,
          start_time: sessionConfig.start_time,
          end_time: sessionConfig.end_time,
          location_key: sessionConfig.location_key,
          court_key: sessionConfig.court_key,
          location_name: sessionConfig.location_name,
          court_name: sessionConfig.court_name,
          exclusive_lock_enabled: sessionConfig.exclusive_lock_enabled == true,
        })),
      resource_locks: this.form_values.resource_locks.map((resourceLock) => ({
        date: resourceLock.date,
        start_time: resourceLock.start_time,
        end_time: resourceLock.end_time,
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
      match_numbering_mode: this.form_values.match_numbering_mode,
      knockout_program_blocks: this.form_values.knockout_program_blocks.map(
        (programBlock, programBlockIndex) => ({
          date: programBlock.date,
          start_time: programBlock.start_time,
          end_time: programBlock.end_time,
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
          match_duration_minutes_override:
            programBlock.match_duration_minutes_override ?? null,
          display_order: programBlockIndex + 1,
        }),
      ),
    };
  }
}
