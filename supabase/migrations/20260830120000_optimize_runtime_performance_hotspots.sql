-- Reduce Data API request fan-out in the championship control screen and
-- avoid unnecessary bracket-preview worker activity when there is no work.

CREATE OR REPLACE FUNCTION public.get_championship_control_operational_queue_state(
  _championship_id UUID,
  _season_year INTEGER
)
RETURNS TABLE (
  match_ids UUID[],
  individual_session_ids UUID[],
  full_queue_items_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH operational_queue AS MATERIALIZED (
    SELECT queue.item_type, queue.item_id
    FROM public.get_championship_control_operational_queue(
      _championship_id,
      _season_year
    ) AS queue
  )
  SELECT
    COALESCE(
      array_agg(operational_queue.item_id)
        FILTER (WHERE operational_queue.item_type = 'MATCH'),
      ARRAY[]::UUID[]
    ) AS match_ids,
    COALESCE(
      array_agg(operational_queue.item_id)
        FILTER (WHERE operational_queue.item_type = 'INDIVIDUAL_SESSION'),
      ARRAY[]::UUID[]
    ) AS individual_session_ids,
    (
      SELECT count(*)::BIGINT
      FROM public.matches AS matches_table
      WHERE matches_table.championship_id = _championship_id
        AND matches_table.season_year = _season_year
        AND matches_table.status IN ('SCHEDULED', 'LIVE')
    ) + (
      SELECT count(*)::BIGINT
      FROM public.championship_individual_sessions AS sessions_table
      WHERE sessions_table.championship_id = _championship_id
        AND sessions_table.season_year = _season_year
        AND sessions_table.status IN ('DRAFT', 'SCHEDULED', 'LIVE', 'FINISHED')
    ) AS full_queue_items_count
  FROM operational_queue;
$$;

REVOKE ALL ON FUNCTION public.get_championship_control_operational_queue_state(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_championship_control_operational_queue_state(UUID, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.recover_and_cleanup()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = championship_bracket_preview_private, pgmq
AS $function$
DECLARE
  stale_job UUID;
  has_pending_job BOOLEAN;
BEGIN
  -- Avoid overlapping worker executions while Postgres is under pressure.
  IF NOT pg_catalog.pg_try_advisory_xact_lock(487302910321::BIGINT) THEN
    RETURN;
  END IF;

  FOR stale_job IN
    SELECT id
    FROM championship_bracket_preview_private.jobs
    WHERE status IN ('QUEUED', 'INITIALIZING', 'SCHEDULING', 'FINALIZING')
      AND (heartbeat_at IS NULL OR heartbeat_at < now() - interval '90 seconds')
  LOOP
    PERFORM championship_bracket_preview_private.enqueue(stale_job, 0);
  END LOOP;

  DELETE FROM championship_bracket_preview_private.jobs
  WHERE expires_at < now()
    AND status IN ('COMPLETED', 'FAILED', 'CANCELLED', 'CONSUMED');

  SELECT EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.jobs
    WHERE status IN ('QUEUED', 'INITIALIZING', 'SCHEDULING', 'FINALIZING')
  )
  INTO has_pending_job;

  -- Preserve the existing 10-second responsiveness for active jobs, but do not
  -- hit the durable queue at all while there is nothing to process.
  IF has_pending_job THEN
    PERFORM championship_bracket_preview_private.consume_queue(1);
  END IF;
END;
$function$;
