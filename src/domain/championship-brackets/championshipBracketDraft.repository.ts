import { ChampionshipBracketWizardDraftDTO } from "@/domain/championship-brackets/ChampionshipBracketWizardDraftDTO";
import type { ChampionshipBracketWizardDraftFormValues } from "@/domain/championship-brackets/championshipBracket.types";

const CHAMPIONSHIP_BRACKET_WIZARD_DRAFT_STORAGE_KEY_PREFIX = "championship_bracket_wizard_draft";

function resolveChampionshipBracketWizardDraftStorageKey(championship_id: string): string {
  return `${CHAMPIONSHIP_BRACKET_WIZARD_DRAFT_STORAGE_KEY_PREFIX}::${championship_id}`;
}

export function fetchChampionshipBracketWizardDraft(championship_id: string): ChampionshipBracketWizardDraftFormValues | null {
  if (typeof window == "undefined") {
    return null;
  }

  const storage_key = resolveChampionshipBracketWizardDraftStorageKey(championship_id);
  const stored_draft = window.localStorage.getItem(storage_key);
  const dto = ChampionshipBracketWizardDraftDTO.fromStorageValue(stored_draft);

  return dto?.bindToSave() ?? null;
}

export function saveChampionshipBracketWizardDraft(
  championship_id: string,
  draft_form_values: ChampionshipBracketWizardDraftFormValues,
): void {
  if (typeof window == "undefined") {
    return;
  }

  const storage_key = resolveChampionshipBracketWizardDraftStorageKey(championship_id);
  const dto = ChampionshipBracketWizardDraftDTO.fromFormValues(draft_form_values);
  window.localStorage.setItem(storage_key, JSON.stringify(dto.bindToSave()));
}

export function clearChampionshipBracketWizardDraft(championship_id: string): void {
  if (typeof window == "undefined") {
    return;
  }

  const storage_key = resolveChampionshipBracketWizardDraftStorageKey(championship_id);
  window.localStorage.removeItem(storage_key);
}
