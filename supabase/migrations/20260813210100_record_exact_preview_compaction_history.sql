ALTER TABLE championship_bracket_preview_private.job_events
DROP CONSTRAINT IF EXISTS job_events_event_type_check;

ALTER TABLE championship_bracket_preview_private.job_events
ADD CONSTRAINT job_events_event_type_check
CHECK (event_type IN (
  'STAGE_CHANGED',
  'GROUP_MATCH_SCHEDULED',
  'KNOCKOUT_MATCH_SCHEDULED',
  'PENDING_MATCH_COUNT_DECREASED'
));

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

  IF current_stage = 'COMPACTING_GROUPS' THEN
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
      'COMPACTING_GROUPS',
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

CREATE OR REPLACE FUNCTION public.get_championship_bracket_preview_job_status(
  _job_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  job_record RECORD;
BEGIN
  SELECT *
  INTO job_record
  FROM championship_bracket_preview_private.jobs
  WHERE id = _job_id;

  IF job_record.id IS NULL
    OR (
      job_record.requested_by <> auth.uid()
      AND NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true)
    )
  THEN
    RAISE EXCEPTION 'Job de prévia não encontrado.';
  END IF;

  RETURN jsonb_build_object(
    'job_id', job_record.id,
    'championship_id', job_record.championship_id,
    'season_year', job_record.season_year,
    'status', job_record.status,
    'stage', job_record.stage,
    'current_date', job_record.current_processing_date,
    'progress_percentage', job_record.progress_percentage,
    'processed_slots', job_record.processed_slots,
    'total_slots', job_record.total_slots,
    'attempt_count', job_record.attempt_count,
    'error_message', job_record.error_message,
    'summary', job_record.summary,
    'diagnostics', job_record.diagnostics,
    'payload_signature', job_record.payload_signature,
    'dependency_signature', job_record.dependency_signature,
    'algorithm_version', job_record.algorithm_version,
    'generation_signature', job_record.generation_signature,
    'created_at', job_record.created_at,
    'started_at', job_record.started_at,
    'completed_at', job_record.completed_at,
    'expires_at', job_record.expires_at,
    'is_valid_for_creation',
      job_record.status = 'COMPLETED'
      AND job_record.algorithm_version = 'async-exact-v8'
      AND job_record.generation_signature IS NOT NULL
      AND job_record.expires_at > now()
      AND jsonb_array_length(job_record.diagnostics) = 0,
    'events', COALESCE(
      (
        WITH event_history AS (
          SELECT
            job_record.created_at AS occurred_at,
            0 AS event_order,
            jsonb_build_object(
              'event_type', 'STAGE_CHANGED',
              'stage', 'QUEUED',
              'status', 'QUEUED',
              'occurred_at', job_record.created_at,
              'details', '{}'::jsonb
            ) AS event

          UNION ALL

          SELECT
            COALESCE(job_record.started_at, job_record.created_at),
            1,
            jsonb_build_object(
              'event_type', 'STAGE_CHANGED',
              'stage', 'SCHEDULING_GROUPS',
              'status', 'SCHEDULING',
              'occurred_at', COALESCE(job_record.started_at, job_record.created_at),
              'details', '{}'::jsonb
            )
          WHERE job_record.started_at IS NOT NULL

          UNION ALL

          SELECT
            events_table.occurred_at,
            2,
            jsonb_build_object(
              'event_type', events_table.event_type,
              'stage', events_table.stage,
              'status', 'SCHEDULING',
              'occurred_at', events_table.occurred_at,
              'details', events_table.details
            )
          FROM championship_bracket_preview_private.job_events events_table
          WHERE events_table.job_id = job_record.id

          UNION ALL

          SELECT
            job_record.completed_at,
            3,
            jsonb_build_object(
              'event_type', 'STAGE_CHANGED',
              'stage', job_record.stage,
              'status', job_record.status,
              'occurred_at', job_record.completed_at,
              'details', '{}'::jsonb
            )
          WHERE job_record.completed_at IS NOT NULL
        )
        SELECT jsonb_agg(event ORDER BY occurred_at, event_order)
        FROM event_history
      ),
      '[]'::jsonb
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.process_job(
  _job_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
SET statement_timeout = '20s'
AS $function$
DECLARE
  job_record RECORD;
  result JSONB;
  job_diagnostics JSONB;
BEGIN
  SELECT *
  INTO job_record
  FROM championship_bracket_preview_private.jobs
  WHERE id = _job_id;

  IF job_record.id IS NULL THEN
    RETURN jsonb_build_object(
      'continue',
      false
    );
  END IF;

  IF job_record.algorithm_version
    <> 'async-exact-v8'
  THEN
    IF job_record.status = 'FINALIZING' THEN
      PERFORM
        championship_bracket_preview_private.finalize_job_v7(
          _job_id
        );

      RETURN jsonb_build_object(
        'continue',
        false
      );
    END IF;

    RETURN
      championship_bracket_preview_private.process_batch_v7(
        _job_id
      );
  END IF;

  IF job_record.status IN (
    'COMPLETED',
    'FAILED',
    'CANCELLED',
    'CONSUMED'
  ) THEN
    RETURN jsonb_build_object(
      'continue',
      false
    );
  END IF;

  IF job_record.stage = 'COMPACTING_GROUPS' THEN
    result :=
      championship_bracket_preview_private.compact_v8_schedule_batch(
        _job_id
      );

    IF COALESCE(
      (result ->> 'done')::boolean,
      false
    ) THEN
      SELECT
        championship_bracket_preview_private.resolve_v8_target_completion_diagnostics(
          _job_id
        )
      INTO job_diagnostics;

      IF jsonb_array_length(
        job_diagnostics
      ) > 0 THEN
        UPDATE championship_bracket_preview_private.jobs
        SET
          status = 'FAILED',
          stage = 'Validação da grade',
          diagnostics = job_diagnostics,
          error_message =
            job_diagnostics -> 0 ->> 'message',
          completed_at = now(),
          updated_at = now()
        WHERE id = _job_id;

        RETURN jsonb_build_object(
          'continue',
          false
        );
      END IF;

      PERFORM
        championship_bracket_preview_private.assign_job_match_numbers(
          _job_id
        );

      PERFORM
        championship_bracket_preview_private.create_v8_knockout_matches(
          _job_id
        );

      UPDATE championship_bracket_preview_private.jobs
      SET
        status = 'SCHEDULING',
        stage = 'SCHEDULING_KNOCKOUT',
        updated_at = now()
      WHERE id = _job_id;
    END IF;

    RETURN jsonb_build_object(
      'continue',
      true
    );
  END IF;

  IF job_record.stage = 'SCHEDULING_KNOCKOUT' THEN
    result :=
      championship_bracket_preview_private.schedule_v8_knockout_batch(
        _job_id
      );

    job_diagnostics :=
      COALESCE(
        result -> 'diagnostics',
        '[]'::jsonb
      );

    IF jsonb_array_length(
      job_diagnostics
    ) > 0 THEN
      UPDATE championship_bracket_preview_private.jobs
      SET
        status = 'FAILED',
        stage = 'Programação eliminatória',
        diagnostics = job_diagnostics,
        error_message =
          job_diagnostics -> 0 ->> 'message',
        completed_at = now(),
        updated_at = now()
      WHERE id = _job_id;

      RETURN jsonb_build_object(
        'continue',
        false
      );
    END IF;

    IF COALESCE(
      (result ->> 'done')::boolean,
      false
    ) THEN
      UPDATE championship_bracket_preview_private.jobs
      SET
        status = 'FINALIZING',
        stage = 'FINALIZING',
        updated_at = now()
      WHERE id = _job_id;
    END IF;

    RETURN jsonb_build_object(
      'continue',
      true
    );
  END IF;

  IF job_record.status = 'FINALIZING'
    OR job_record.stage = 'FINALIZING'
  THEN
    UPDATE championship_bracket_preview_private.jobs
    SET
      status = 'FINALIZING',
      stage = 'FINALIZING',
      updated_at = now()
    WHERE id = _job_id;

    PERFORM
      championship_bracket_preview_private.finalize_job(
        _job_id
      );

    RETURN jsonb_build_object(
      'continue',
      false
    );
  END IF;

  result :=
    championship_bracket_preview_private.process_batch(
      _job_id
    );

  SELECT *
  INTO job_record
  FROM championship_bracket_preview_private.jobs
  WHERE id = _job_id;

  IF job_record.status = 'FINALIZING' THEN
    UPDATE championship_bracket_preview_private.jobs
    SET
      status = 'SCHEDULING',
      stage = 'COMPACTING_GROUPS',
      updated_at = now()
    WHERE id = _job_id;

    INSERT INTO championship_bracket_preview_private.job_events (
      job_id,
      event_type,
      stage,
      details,
      occurred_at
    )
    VALUES (
      _job_id,
      'STAGE_CHANGED',
      'COMPACTING_GROUPS',
      jsonb_build_object(
        'pending_matches', (
          SELECT count(*)
          FROM championship_bracket_preview_private.matches matches_table
          WHERE matches_table.job_id = _job_id
            AND NOT matches_table.assigned
        )
      ),
      clock_timestamp()
    )
    ON CONFLICT (job_id, event_type, group_match_id, knockout_match_id)
    DO NOTHING;

    RETURN jsonb_build_object(
      'continue',
      true
    );
  END IF;

  RETURN result;

EXCEPTION
  WHEN OTHERS THEN
    UPDATE championship_bracket_preview_private.jobs
    SET
      attempt_count = attempt_count + 1,
      heartbeat_at = now(),
      updated_at = now(),
      error_message = SQLERRM,
      status =
        CASE
          WHEN attempt_count + 1 >= 5
            THEN 'FAILED'
          ELSE status
        END,
      stage =
        CASE
          WHEN attempt_count + 1 >= 5
            THEN 'Falha após cinco tentativas'
          ELSE stage
        END,
      expires_at =
        CASE
          WHEN attempt_count + 1 >= 5
            THEN now() + interval '24 hours'
          ELSE expires_at
        END
    WHERE id = _job_id;

    RETURN jsonb_build_object(
      'continue',
      (
        SELECT jobs_table.attempt_count < 5
        FROM championship_bracket_preview_private.jobs
          AS jobs_table
        WHERE jobs_table.id = _job_id
      ),
      'delay',
      LEAST(
        60,
        power(
          2,
          (
            SELECT jobs_table.attempt_count
            FROM championship_bracket_preview_private.jobs
              AS jobs_table
            WHERE jobs_table.id = _job_id
          )
        )::integer
      )
    );
END;
$function$;

NOTIFY pgrst, 'reload schema';
