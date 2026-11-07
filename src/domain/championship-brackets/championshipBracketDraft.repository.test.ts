import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  supabaseRpc: vi.fn(),
  awsEnabled: true,
}));

vi.mock("@/config/environment", () => ({
  isAwsBackendEnabled: () => mocks.awsEnabled,
}));

vi.mock("@/integrations/laje-api/client", () => ({
  lajeApiRequest: mocks.apiRequest,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.supabaseRpc },
}));

import {
  fetchChampionshipBracketWizardDraft,
  saveChampionshipBracketWizardDraft,
} from "@/domain/championship-brackets/championshipBracketDraft.repository";
import { ChampionshipBracketWizardDraftDTO } from "@/domain/championship-brackets/ChampionshipBracketWizardDraftDTO";

const championshipId = "c6435be1-43e0-4620-b912-648364749a10";

function buildDraft() {
  return ChampionshipBracketWizardDraftDTO.fromStorageValue(
    JSON.stringify({
      step_flow_version: 2,
      current_step_index: 6,
      highest_unlocked_step_index: 6,
      selected_team_ids: ["df232ceb-1076-44cb-8131-16635cf28b4d"],
    }),
  )!.bindToSave();
}

describe("championshipBracketDraft.repository AWS flow", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.awsEnabled = true;
    mocks.apiRequest.mockReset();
    mocks.supabaseRpc.mockReset();
  });

  it("grava e restaura o rascunho pela API AWS sem chamar Supabase", async () => {
    const draft = buildDraft();
    const metadata = {
      edition_id: "d5417725-66af-45e8-b6a0-39c44c9ae321",
      season_year: 2027,
      updated_at: "2026-10-31T20:00:00.000Z",
      updated_by: null,
      updated_by_name: null,
    };
    mocks.apiRequest.mockResolvedValueOnce({ data: { ...metadata, payload_snapshot: draft } });

    const save = await saveChampionshipBracketWizardDraft(championshipId, draft);

    expect(save.error).toBeNull();
    expect(mocks.apiRequest).toHaveBeenCalledWith(
      `/championships/${championshipId}/bracket/draft`,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ payloadSnapshot: draft }),
      }),
    );

    mocks.apiRequest.mockResolvedValueOnce({
      data: { ...metadata, payload_snapshot: JSON.stringify(draft) },
    });

    const restored = await fetchChampionshipBracketWizardDraft(championshipId);

    expect(restored.source).toBe("remote");
    expect(restored.draft_form_values?.current_step_index).toBe(6);
    expect(restored.draft_form_values?.selected_team_ids).toEqual(draft.selected_team_ids);
    expect(mocks.supabaseRpc).not.toHaveBeenCalled();
  });

  it("preserva e sincroniza o backup local quando ele é mais recente que o snapshot AWS", async () => {
    const localDraft = ChampionshipBracketWizardDraftDTO.fromStorageValue(
      JSON.stringify({
        ...buildDraft(),
        current_step_index: 7,
        highest_unlocked_step_index: 7,
      }),
    )!.bindToSave();
    localStorage.setItem(
      `championship_bracket_wizard_draft::${championshipId}`,
      JSON.stringify({
        ...localDraft,
        local_saved_at: "2026-10-31T20:01:00.000Z",
      }),
    );

    mocks.apiRequest
      .mockResolvedValueOnce({
        data: {
          edition_id: "d5417725-66af-45e8-b6a0-39c44c9ae321",
          season_year: 2027,
          updated_at: "2026-10-31T20:00:00.000Z",
          updated_by: null,
          updated_by_name: null,
          payload_snapshot: {
            ...localDraft,
            current_step_index: 0,
            highest_unlocked_step_index: 0,
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          edition_id: "d5417725-66af-45e8-b6a0-39c44c9ae321",
          season_year: 2027,
          updated_at: "2026-10-31T20:02:00.000Z",
          updated_by: null,
          updated_by_name: null,
          payload_snapshot: localDraft,
        },
      });

    const restored = await fetchChampionshipBracketWizardDraft(championshipId);

    expect(restored.source).toBe("local");
    expect(restored.draft_form_values?.current_step_index).toBe(7);
    expect(mocks.apiRequest).toHaveBeenCalledTimes(2);
    expect(mocks.apiRequest).toHaveBeenLastCalledWith(
      `/championships/${championshipId}/bracket/draft`,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ payloadSnapshot: localDraft }),
      }),
    );
    expect(mocks.supabaseRpc).not.toHaveBeenCalled();
  });
});
