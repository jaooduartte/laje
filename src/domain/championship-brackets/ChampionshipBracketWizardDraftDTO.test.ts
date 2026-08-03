import { describe, expect, it } from "vitest";
import { ChampionshipBracketWizardDraftDTO } from "@/domain/championship-brackets/ChampionshipBracketWizardDraftDTO";
import type { ChampionshipBracketWizardDraftFormValues } from "@/domain/championship-brackets/championshipBracket.types";
import {
  ChampionshipSeasonDivisionFormat,
  ChampionshipSeasonDivisionSettlementMode,
} from "@/lib/enums";

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
  };
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
});
