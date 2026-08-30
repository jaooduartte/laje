-- Reduce pg_cron connection pressure while preserving asynchronous preview processing.
-- The 30-second cadence is a conservative compromise between database pressure
-- and admin preview responsiveness during degraded infrastructure conditions.

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
    '30 seconds',
    'SELECT championship_bracket_preview_private.recover_and_cleanup();'
  );
END;
$cron$;
