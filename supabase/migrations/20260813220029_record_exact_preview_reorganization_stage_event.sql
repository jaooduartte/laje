CREATE OR REPLACE FUNCTION championship_bracket_preview_private.record_reorganization_stage_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  pending_matches INTEGER;
BEGIN
  IF NEW.stage NOT LIKE 'Reorganizando grade:%'
    OR COALESCE(OLD.stage, '') LIKE 'Reorganizando grade:%'
  THEN
    RETURN NEW;
  END IF;

  SELECT count(*)
  INTO pending_matches
  FROM championship_bracket_preview_private.matches matches_table
  WHERE matches_table.job_id = NEW.id
    AND NOT matches_table.assigned;

  INSERT INTO championship_bracket_preview_private.job_events (
    job_id,
    event_type,
    stage,
    details,
    occurred_at
  )
  VALUES (
    NEW.id,
    'STAGE_CHANGED',
    'COMPACTING_GROUPS',
    jsonb_build_object('pending_matches', pending_matches),
    clock_timestamp()
  )
  ON CONFLICT (job_id, event_type, group_match_id, knockout_match_id)
  DO NOTHING;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER championship_bracket_preview_reorganization_stage_event_trigger
AFTER UPDATE OF stage
ON championship_bracket_preview_private.jobs
FOR EACH ROW
WHEN (
  NEW.stage LIKE 'Reorganizando grade:%'
  AND COALESCE(OLD.stage, '') NOT LIKE 'Reorganizando grade:%'
)
EXECUTE FUNCTION championship_bracket_preview_private.record_reorganization_stage_event();

REVOKE ALL ON FUNCTION championship_bracket_preview_private.record_reorganization_stage_event()
FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
