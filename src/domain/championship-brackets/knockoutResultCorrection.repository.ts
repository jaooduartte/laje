import { supabase } from "@/integrations/supabase/client";
import type {
  ApplyKnockoutResultCorrectionResult,
  KnockoutResultCorrectionPreview,
  KnockoutResultCorrectionWalkoverMode,
} from "@/domain/championship-brackets/knockoutResultCorrection.types";

type RpcError = {
  code?: string;
  message: string;
};

type LooseRpcResult<T> = {
  data: T | null;
  error: RpcError | null;
};

type LooseSupabaseClient = {
  rpc: <T>(
    functionName: string,
    payload: Record<string, unknown>,
  ) => Promise<LooseRpcResult<T>>;
};

const looseSupabase = supabase as unknown as LooseSupabaseClient;

function normalizePreview(
  payload: KnockoutResultCorrectionPreview,
): KnockoutResultCorrectionPreview {
  return {
    ...payload,
    impacts: Array.isArray(payload.impacts) ? payload.impacts : [],
    schedule_candidates: Array.isArray(payload.schedule_candidates)
      ? payload.schedule_candidates
      : [],
    remaining_event_days: Number(payload.remaining_event_days ?? 0),
    schedule_preview_generated: payload.schedule_preview_generated == true,
    requires_replay_schedule: payload.requires_replay_schedule == true,
    requires_reprocessing: payload.requires_reprocessing == true,
    is_knockout_match: payload.is_knockout_match == true,
    blocked: payload.blocked == true,
  };
}

export async function previewKnockoutResultCorrection(
  matchId: string,
  walkoverMode: KnockoutResultCorrectionWalkoverMode,
  includeScheduleCandidates = false,
): Promise<LooseRpcResult<KnockoutResultCorrectionPreview>> {
  const result = await looseSupabase.rpc<KnockoutResultCorrectionPreview>(
    "preview_knockout_result_correction",
    {
      _match_id: matchId,
      _walkover_mode: walkoverMode,
      _include_schedule_candidates: includeScheduleCandidates,
    },
  );

  return {
    ...result,
    data: result.data ? normalizePreview(result.data) : null,
  };
}

export async function applyKnockoutResultCorrection(input: {
  matchId: string;
  walkoverMode: KnockoutResultCorrectionWalkoverMode;
  scheduleCandidateId?: string | null;
  reason?: string | null;
}): Promise<LooseRpcResult<ApplyKnockoutResultCorrectionResult>> {
  return looseSupabase.rpc<ApplyKnockoutResultCorrectionResult>(
    "apply_knockout_result_correction",
    {
      _match_id: input.matchId,
      _walkover_mode: input.walkoverMode,
      _schedule_candidate_id: input.scheduleCandidateId ?? null,
      _reason: input.reason ?? null,
    },
  );
}

export function resolveKnockoutResultCorrectionRpcErrorMessage(
  error: RpcError,
): string {
  if (
    error.code == "42883" ||
    error.message.includes("preview_knockout_result_correction") ||
    error.message.includes("apply_knockout_result_correction")
  ) {
    return "A migration do reprocessamento de mata-mata ainda não foi aplicada no Supabase.";
  }

  return error.message;
}
