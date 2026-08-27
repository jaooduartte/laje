CREATE OR REPLACE FUNCTION public.get_championship_control_operational_queue(
  _championship_id UUID,
  _season_year INTEGER
)
RETURNS TABLE (
  item_type TEXT,
  item_id UUID
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scheduled_matches AS (
    SELECT
      matches_table.id,
      row_number() OVER (
        PARTITION BY matches_table.location, COALESCE(matches_table.court_name, '')
        ORDER BY
          matches_table.scheduled_date ASC NULLS LAST,
          COALESCE(matches_table.scheduled_slot, matches_table.queue_position) ASC NULLS LAST,
          COALESCE(matches_table.queue_position, matches_table.scheduled_slot) ASC NULLS LAST,
          matches_table.created_at ASC,
          matches_table.id ASC
      ) AS queue_position
    FROM public.matches AS matches_table
    WHERE matches_table.championship_id = _championship_id
      AND matches_table.season_year = _season_year
      AND matches_table.status = 'SCHEDULED'
  ),
  scheduled_sessions AS (
    SELECT
      sessions_table.id,
      row_number() OVER (
        PARTITION BY COALESCE(sessions_table.location_name, ''), COALESCE(sessions_table.court_name, '')
        ORDER BY
          sessions_table.scheduled_date ASC NULLS LAST,
          sessions_table.start_time ASC NULLS LAST,
          sessions_table.created_at ASC,
          sessions_table.id ASC
      ) AS queue_position
    FROM public.championship_individual_sessions AS sessions_table
    WHERE sessions_table.championship_id = _championship_id
      AND sessions_table.season_year = _season_year
      AND sessions_table.status = 'SCHEDULED'
  )
  SELECT 'MATCH'::TEXT, matches_table.id
  FROM public.matches AS matches_table
  WHERE matches_table.championship_id = _championship_id
    AND matches_table.season_year = _season_year
    AND matches_table.status = 'LIVE'

  UNION ALL

  SELECT 'MATCH'::TEXT, scheduled_matches.id
  FROM scheduled_matches
  WHERE scheduled_matches.queue_position <= 2

  UNION ALL

  SELECT 'INDIVIDUAL_SESSION'::TEXT, sessions_table.id
  FROM public.championship_individual_sessions AS sessions_table
  WHERE sessions_table.championship_id = _championship_id
    AND sessions_table.season_year = _season_year
    AND sessions_table.status = 'LIVE'

  UNION ALL

  SELECT 'INDIVIDUAL_SESSION'::TEXT, scheduled_sessions.id
  FROM scheduled_sessions
  WHERE scheduled_sessions.queue_position = 1;
$$;

REVOKE ALL ON FUNCTION public.get_championship_control_operational_queue(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_championship_control_operational_queue(UUID, INTEGER) TO authenticated;
