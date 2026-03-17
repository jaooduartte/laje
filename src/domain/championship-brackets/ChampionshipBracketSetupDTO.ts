import type { ChampionshipBracketSetupFormValues } from "@/domain/championship-brackets/championshipBracket.types";

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

    this.form_values.participants.forEach((participant) => {
      if (!participant.team_id) {
        throw new Error("Atlética inválida na configuração de participantes.");
      }

      if (participant.modalities.length == 0) {
        throw new Error(
          "Cada atlética participante precisa ter ao menos uma modalidade/naipe.",
        );
      }
    });
  }

  private validateCompetitions() {
    if (this.form_values.competitions.length == 0) {
      throw new Error(
        "Configure ao menos uma competição para geração de grupos.",
      );
    }

    this.form_values.competitions.forEach((competition) => {
      if (!competition.sport_id) {
        throw new Error("Modalidade inválida na configuração de grupos.");
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

  bindToSave(): ChampionshipBracketSetupFormValues {
    this.validateParticipants();
    this.validateCompetitions();
    this.validateScheduleDays();

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
          competition.qualifiers_per_group == 1,
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
        break_start_time: null,
        break_end_time: null,
        locations: scheduleDay.locations.map((location) => ({
          name: location.name.trim(),
          position: location.position,
          courts: location.courts.map((court) => ({
            name: court.name.trim(),
            position: court.position,
            sport_ids: [...new Set(court.sport_ids)],
          })),
        })),
      }),
    );

    return {
      participants: normalizedParticipants,
      competitions: normalizedCompetitions,
      schedule_days: normalizedScheduleDays,
    };
  }
}
