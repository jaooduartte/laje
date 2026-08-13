import type {
  ChampionshipBracketExactPreviewCache,
  ChampionshipBracketMatchNumberingMode,
  ChampionshipBracketPreviewJob,
  ChampionshipBracketPreviewResult,
  ChampionshipBracketScheduleDayInput,
} from "@/domain/championship-brackets/championshipBracket.types";

export function resolveExactPreviewCacheFromJob({
  job,
  localPayloadSignature,
  matchNumberingMode,
  previousResult,
  scheduleDays,
}: {
  job: ChampionshipBracketPreviewJob;
  localPayloadSignature: string;
  matchNumberingMode: ChampionshipBracketMatchNumberingMode;
  previousResult: ChampionshipBracketPreviewResult | null;
  scheduleDays: ChampionshipBracketScheduleDayInput[];
}): ChampionshipBracketExactPreviewCache {
  const availableDays = new Map(
    (previousResult?.days ?? []).map((previewDay) => [
      previewDay.date,
      previewDay,
    ]),
  );

  return {
    job_id: job.job_id,
    payload_signature: localPayloadSignature,
    server_payload_signature: job.payload_signature,
    generation_signature: job.generation_signature ?? "",
    dependency_signature: job.dependency_signature,
    algorithm_version: job.algorithm_version,
    status: job.status,
    stage: job.stage,
    current_date: job.current_date,
    progress_percentage: job.progress_percentage,
    processed_slots: job.processed_slots,
    total_slots: job.total_slots,
    expires_at: job.expires_at,
    started_at: job.started_at,
    is_valid_for_creation: job.is_valid_for_creation,
    generated_at: job.completed_at ?? job.created_at,
    result: {
      ok: job.status == "COMPLETED",
      message: job.error_message,
      server_payload_signature: job.payload_signature,
      generation_signature: job.generation_signature,
      match_numbering_mode: matchNumberingMode,
      summary: job.summary,
      days: scheduleDays.map(
        (scheduleDay) =>
          availableDays.get(scheduleDay.date) ?? {
            date: scheduleDay.date,
            start_time: scheduleDay.start_time,
            end_time: scheduleDay.end_time,
            breaks: [],
            occupied_minutes: 0,
            available_minutes: 0,
            utilization_percentage: 0,
            free_windows: 0,
            locations: [],
          },
      ),
      diagnostics: job.diagnostics,
    },
  };
}
