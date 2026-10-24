import { isAwsBackendEnabled } from "@/config/environment";
import { lajeApiRequest } from "@/integrations/laje-api/client";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { ChampionshipBracketWizardDraftDTO } from "@/domain/championship-brackets/ChampionshipBracketWizardDraftDTO";
import type {
  ChampionshipBracketRemoteDraftMetadata,
  ChampionshipBracketWizardDraftFetchResult,
  ChampionshipBracketWizardDraftFormValues,
} from "@/domain/championship-brackets/championshipBracket.types";

const CHAMPIONSHIP_BRACKET_WIZARD_DRAFT_STORAGE_KEY_PREFIX = "championship_bracket_wizard_draft";

interface ChampionshipBracketDraftRpcRow {
  edition_id: string;
  payload_snapshot: unknown;
  season_year: number;
  updated_at: string;
  updated_by: string | null;
  updated_by_name: string | null;
}

interface DraftRpcResult {
  data: ChampionshipBracketDraftRpcRow[] | null;
  error: Error | null;
}

async function fetchRemoteBracketDraft(championshipId: string): Promise<DraftRpcResult> {
  if (isAwsBackendEnabled()) {
    try {
      const response = await lajeApiRequest<{ data: ChampionshipBracketDraftRpcRow | null }>(
        "/championships/" + championshipId + "/bracket/draft",
      );
      return { data: response.data ? [response.data] : [], error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }

  const response = await supabase.rpc("get_championship_bracket_draft", {
    _championship_id: championshipId,
    _season_year: null,
  });
  return {
    data: response.data as unknown as ChampionshipBracketDraftRpcRow[] | null,
    error: response.error,
  };
}

async function persistRemoteBracketDraft(
  championshipId: string,
  dto: ChampionshipBracketWizardDraftDTO,
): Promise<DraftRpcResult> {
  if (isAwsBackendEnabled()) {
    try {
      const response = await lajeApiRequest<{ data: ChampionshipBracketDraftRpcRow }>(
        "/championships/" + championshipId + "/bracket/draft",
        { method: "PUT", body: JSON.stringify({ payloadSnapshot: dto.bindToSave() }) },
      );
      return { data: [response.data], error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }

  const response = await supabase.rpc("save_championship_bracket_draft", {
    _championship_id: championshipId,
    _payload: dto.bindToSave() as unknown as Json,
  });
  return {
    data: response.data as unknown as ChampionshipBracketDraftRpcRow[] | null,
    error: response.error,
  };
}

function resolveChampionshipBracketWizardDraftStorageKey(championship_id: string): string {
  return `${CHAMPIONSHIP_BRACKET_WIZARD_DRAFT_STORAGE_KEY_PREFIX}::${championship_id}`;
}

function fetchChampionshipBracketWizardDraftFromLocalStorage(
  championship_id: string,
): ChampionshipBracketWizardDraftFormValues | null {
  if (typeof window == "undefined") {
    return null;
  }

  const storage_key = resolveChampionshipBracketWizardDraftStorageKey(championship_id);
  const stored_draft = window.localStorage.getItem(storage_key);
  const dto = ChampionshipBracketWizardDraftDTO.fromStorageValue(stored_draft);
  return dto?.bindToSave() ?? null;
}

function saveChampionshipBracketWizardDraftInLocalStorage(
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

function clearChampionshipBracketWizardDraftFromLocalStorage(championship_id: string): void {
  if (typeof window == "undefined") {
    return;
  }

  const storage_key = resolveChampionshipBracketWizardDraftStorageKey(championship_id);
  window.localStorage.removeItem(storage_key);
}

function resolveRemoteDraftMetadata(
  row: ChampionshipBracketDraftRpcRow | null,
): ChampionshipBracketRemoteDraftMetadata | null {
  if (!row) {
    return null;
  }

  return {
    edition_id: row.edition_id,
    season_year: row.season_year,
    updated_at: row.updated_at,
    updated_by: row.updated_by,
    updated_by_name: row.updated_by_name,
  };
}

export async function fetchChampionshipBracketWizardDraft(
  championship_id: string,
): Promise<ChampionshipBracketWizardDraftFetchResult> {
  const remoteResponse = await fetchRemoteBracketDraft(championship_id);

  if (!remoteResponse.error) {
    const remoteRow = ((remoteResponse.data as ChampionshipBracketDraftRpcRow[] | null) ?? [])[0] ?? null;
    if (remoteRow?.payload_snapshot) {
      const remoteDto = ChampionshipBracketWizardDraftDTO.fromStorageValue(
        JSON.stringify(remoteRow.payload_snapshot),
      );

      if (remoteDto) {
        clearChampionshipBracketWizardDraftFromLocalStorage(championship_id);
        return {
          draft_form_values: remoteDto.bindToSave(),
          metadata: resolveRemoteDraftMetadata(remoteRow),
          source: "remote",
        };
      }
    }
  }

  const localDraft = fetchChampionshipBracketWizardDraftFromLocalStorage(championship_id);
  if (!localDraft) {
    return {
      draft_form_values: null,
      metadata: null,
      source: "none",
    };
  }

  const promotionResponse = await saveChampionshipBracketWizardDraft(
    championship_id,
    localDraft,
  );

  if (!promotionResponse.error) {
    clearChampionshipBracketWizardDraftFromLocalStorage(championship_id);
    return {
      draft_form_values: localDraft,
      metadata: promotionResponse.metadata,
      source: "local",
    };
  }

  return {
    draft_form_values: localDraft,
    metadata: null,
    source: "local",
  };
}

export async function saveChampionshipBracketWizardDraft(
  championship_id: string,
  draft_form_values: ChampionshipBracketWizardDraftFormValues,
): Promise<{ metadata: ChampionshipBracketRemoteDraftMetadata | null; error: Error | null }> {
  saveChampionshipBracketWizardDraftInLocalStorage(championship_id, draft_form_values);

  const dto = ChampionshipBracketWizardDraftDTO.fromFormValues(draft_form_values);
  const remoteResponse = await persistRemoteBracketDraft(championship_id, dto);

  if (remoteResponse.error) {
    return {
      metadata: null,
      error: remoteResponse.error,
    };
  }

  const remoteRow = ((remoteResponse.data as ChampionshipBracketDraftRpcRow[] | null) ?? [])[0] ?? null;
  return {
    metadata: resolveRemoteDraftMetadata(remoteRow),
    error: null,
  };
}

export function clearChampionshipBracketWizardDraft(championship_id: string): void {
  clearChampionshipBracketWizardDraftFromLocalStorage(championship_id);
}
