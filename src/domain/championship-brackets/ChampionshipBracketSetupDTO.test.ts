import { describe, expect, it } from "vitest";
import { ChampionshipBracketSetupDTO } from "@/domain/championship-brackets/ChampionshipBracketSetupDTO";
import type { ChampionshipBracketSetupFormValues } from "@/domain/championship-brackets/championshipBracket.types";
import {
  BracketThirdPlaceMode,
  ChampionshipSchedulePeriod,
  ChampionshipSeasonDivisionFormat,
  ChampionshipSeasonDivisionSettlementMode,
  MatchNaipe,
  TeamDivision,
} from "@/lib/enums";

function buildFormValues(
  overrides: Partial<ChampionshipBracketSetupFormValues> = {},
): ChampionshipBracketSetupFormValues {
  return {
    season_settings: overrides.season_settings ?? {
      division_format: ChampionshipSeasonDivisionFormat.SEPARATED,
      division_settlement_mode: ChampionshipSeasonDivisionSettlementMode.PROMOTION_RELEGATION,
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
                sport_priorities: [
                  {
                    sport_id: "sport-1",
                    preferred_naipe: MatchNaipe.MASCULINO,
                    preferred_division: null,
                  },
                  {
                    sport_id: "sport-1",
                    preferred_naipe: null,
                    preferred_division: null,
                  },
                  {
                    sport_id: "sport-x",
                    preferred_naipe: MatchNaipe.FEMININO,
                    preferred_division: null,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    schedule_periods: overrides.schedule_periods ?? [
      {
        date: "2026-08-10",
        period: ChampionshipSchedulePeriod.MATUTINO,
        enabled: true,
      },
    ],
    competition_period_availability: overrides.competition_period_availability ?? [
      {
        competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
        date: "2026-08-10",
        period: ChampionshipSchedulePeriod.MATUTINO,
        enabled: true,
      },
    ],
    team_competition_availability: overrides.team_competition_availability ?? [
      {
        team_id: "team-1",
        competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
        date: "2026-08-10",
        period: ChampionshipSchedulePeriod.MATUTINO,
        enabled: true,
      },
      {
        team_id: "team-2",
        competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
        date: "2026-08-10",
        period: ChampionshipSchedulePeriod.MATUTINO,
        enabled: true,
      },
    ],
    individual_event_configs: overrides.individual_event_configs ?? [
      {
        sport_id: "sport-1",
        scoring_mode: "DEFAULT_24_TO_1",
        relay_multiplier: 2,
      },
    ],
    individual_session_configs: overrides.individual_session_configs ?? [],
    resource_locks: overrides.resource_locks ?? [],
  };
}

describe("ChampionshipBracketSetupDTO", () => {
  it("rejeita competições com divisão definida quando a temporada é unificada", () => {
    const dto = ChampionshipBracketSetupDTO.fromFormValues(
      buildFormValues({
        season_settings: {
          division_format: ChampionshipSeasonDivisionFormat.UNIFIED,
          division_settlement_mode: ChampionshipSeasonDivisionSettlementMode.TOP_N_TO_PRINCIPAL,
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

  it("rejeita sessão individual em período global desabilitado", () => {
    const dto = ChampionshipBracketSetupDTO.fromFormValues(
      buildFormValues({
        individual_session_configs: [
          {
            sport_id: "sport-1",
            naipe: MatchNaipe.MASCULINO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
            scheduled_date: "2026-08-10",
            period: ChampionshipSchedulePeriod.MATUTINO,
            location_key: "loc-1",
            court_key: "court-1",
            location_name: "Ginásio Central",
            court_name: "Quadra 1",
            exclusive_lock_enabled: true,
          },
        ],
        schedule_periods: [
          {
            date: "2026-08-10",
            period: ChampionshipSchedulePeriod.MATUTINO,
            enabled: false,
          },
        ],
      }),
    );

    expect(() => dto.bindToSave()).toThrow(
      "Habilite ao menos um período global na agenda do campeonato.",
    );
  });

  it("rejeita bloqueio duro duplicado no mesmo recurso e período", () => {
    const dto = ChampionshipBracketSetupDTO.fromFormValues(
      buildFormValues({
        resource_locks: [
          {
            date: "2026-08-10",
            period: ChampionshipSchedulePeriod.MATUTINO,
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
            period: ChampionshipSchedulePeriod.MATUTINO,
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
      "Existe mais de um bloqueio duro para o mesmo recurso no mesmo período.",
    );
  });

  it("normaliza esportes habilitados e prioridades válidas de quadra ao salvar", () => {
    const dto = ChampionshipBracketSetupDTO.fromFormValues(buildFormValues());

    const payload = dto.bindToSave();

    expect(payload.enabled_sport_ids).toEqual(["sport-1"]);
    expect(payload.schedule_days[0]?.locations[0]?.courts[0]?.sport_ids).toEqual(["sport-1"]);
    expect(payload.schedule_days[0]?.locations[0]?.courts[0]?.sport_priorities).toEqual([
      {
        sport_id: "sport-1",
        preferred_naipe: MatchNaipe.MASCULINO,
        preferred_division: null,
      },
    ]);
  });
});
