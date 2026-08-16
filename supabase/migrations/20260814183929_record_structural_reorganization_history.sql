CREATE OR REPLACE FUNCTION championship_bracket_preview_private.record_reorganization_stage_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  pending_matches INTEGER;
BEGIN
  IF (
    NEW.stage NOT LIKE 'Reorganizando grade:%'
    AND NEW.stage NOT LIKE 'Reorganizando slots estruturais:%'
  ) OR (
    COALESCE(OLD.stage, '') LIKE 'Reorganizando grade:%'
    OR COALESCE(OLD.stage, '') LIKE 'Reorganizando slots estruturais:%'
  ) THEN
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
    CASE
      WHEN NEW.stage LIKE 'Reorganizando slots estruturais:%' THEN NEW.stage
      ELSE 'COMPACTING_GROUPS'
    END,
    jsonb_build_object('pending_matches', pending_matches),
    clock_timestamp()
  )
  ON CONFLICT (job_id, event_type, group_match_id, knockout_match_id)
  DO NOTHING;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS championship_bracket_preview_reorganization_stage_event_trigger
ON championship_bracket_preview_private.jobs;

CREATE TRIGGER championship_bracket_preview_reorganization_stage_event_trigger
AFTER UPDATE OF stage
ON championship_bracket_preview_private.jobs
FOR EACH ROW
WHEN (
  (
    NEW.stage LIKE 'Reorganizando grade:%'
    OR NEW.stage LIKE 'Reorganizando slots estruturais:%'
  )
  AND COALESCE(OLD.stage, '') NOT LIKE 'Reorganizando grade:%'
  AND COALESCE(OLD.stage, '') NOT LIKE 'Reorganizando slots estruturais:%'
)
EXECUTE FUNCTION championship_bracket_preview_private.record_reorganization_stage_event();

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.record_group_match_scheduled_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  event_details JSONB;
  current_stage TEXT;
  pending_matches_after INTEGER;
BEGIN
  IF NOT NEW.assigned OR OLD.assigned THEN
    RETURN NEW;
  END IF;

  SELECT
    jobs_table.stage,
    jsonb_build_object(
      'logical_key', NEW.logical_key,
      'sport_name', competitions_table.sport_name,
      'naipe', competitions_table.naipe,
      'division', competitions_table.division,
      'group_number', groups_table.group_number,
      'round_number', NEW.round_number,
      'phase', 'GROUP_STAGE',
      'date', slots_table.event_date,
      'start_at', to_char(slots_table.start_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
      'end_at', to_char(slots_table.end_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
      'location_name', slots_table.location_name,
      'court_name', slots_table.court_name
    )
  INTO current_stage, event_details
  FROM championship_bracket_preview_private.assignments assignments_table
  JOIN championship_bracket_preview_private.slots slots_table
    ON slots_table.id = assignments_table.slot_id
  JOIN championship_bracket_preview_private.competitions competitions_table
    ON competitions_table.id = NEW.competition_id
  JOIN championship_bracket_preview_private.groups groups_table
    ON groups_table.id = NEW.group_id
  JOIN championship_bracket_preview_private.jobs jobs_table
    ON jobs_table.id = NEW.job_id
  WHERE assignments_table.job_id = NEW.job_id
    AND assignments_table.match_id = NEW.id;

  INSERT INTO championship_bracket_preview_private.job_events (
    job_id,
    event_type,
    group_match_id,
    stage,
    details,
    occurred_at
  )
  VALUES (
    NEW.job_id,
    'GROUP_MATCH_SCHEDULED',
    NEW.id,
    current_stage,
    event_details,
    clock_timestamp()
  )
  ON CONFLICT (job_id, event_type, group_match_id, knockout_match_id)
  DO NOTHING;

  IF current_stage = 'COMPACTING_GROUPS'
    OR current_stage LIKE 'Reorganizando grade:%'
    OR current_stage LIKE 'Reorganizando slots estruturais:%'
  THEN
    SELECT count(*)
    INTO pending_matches_after
    FROM championship_bracket_preview_private.matches matches_table
    WHERE matches_table.job_id = NEW.job_id
      AND NOT matches_table.assigned;

    INSERT INTO championship_bracket_preview_private.job_events (
      job_id,
      event_type,
      group_match_id,
      stage,
      details,
      occurred_at
    )
    VALUES (
      NEW.job_id,
      'PENDING_MATCH_COUNT_DECREASED',
      NEW.id,
      CASE
        WHEN current_stage LIKE 'Reorganizando slots estruturais:%'
          THEN current_stage
        ELSE 'COMPACTING_GROUPS'
      END,
      jsonb_build_object(
        'pending_matches_before', pending_matches_after + 1,
        'pending_matches_after', pending_matches_after
      ),
      clock_timestamp()
    )
    ON CONFLICT (job_id, event_type, group_match_id, knockout_match_id)
    DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
