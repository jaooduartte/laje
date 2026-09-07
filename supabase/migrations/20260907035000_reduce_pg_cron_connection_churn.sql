-- Reduce recurring pg_cron connection churn during infrastructure pressure.
-- The async bracket preview queue is admin-only and rare; keeping a two-minute
-- watchdog preserves recovery/processing while cutting connection attempts by 75%
-- compared with the previous 30-second cadence.
--
-- The partial indexes keep the watchdog's stale-job and expiration probes cheap
-- when preview history accumulates.

CREATE INDEX IF NOT EXISTS championship_bracket_preview_jobs_recovery_idx
  ON championship_bracket_preview_private.jobs (heartbeat_at)
  WHERE status IN ('QUEUED', 'INITIALIZING', 'SCHEDULING', 'FINALIZING');

CREATE INDEX IF NOT EXISTS championship_bracket_preview_jobs_terminal_expiration_idx
  ON championship_bracket_preview_private.jobs (expires_at)
  WHERE status IN ('COMPLETED', 'FAILED', 'CANCELLED', 'CONSUMED');

DO $cron$
DECLARE
  existing_job_id BIGINT;
BEGIN
  SELECT jobid
  INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'process-championship-bracket-preview-jobs';

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'process-championship-bracket-preview-jobs',
    '2 minutes',
    'SELECT championship_bracket_preview_private.recover_and_cleanup();'
  );
END;
$cron$;
