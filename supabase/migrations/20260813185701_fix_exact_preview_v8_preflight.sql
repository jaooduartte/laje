CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_v8_target_preflight(
  _job_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  WITH targets AS (
    SELECT *
    FROM championship_bracket_preview_private.resolve_v8_sport_targets(
      _job_id
    )
  ),
  target_capacities AS (
    SELECT
      targets.*,
      count(slots_table.id)::integer AS available_slots
    FROM targets
    LEFT JOIN championship_bracket_preview_private.slots AS slots_table
      ON slots_table.job_id = _job_id
      AND slots_table.event_date = targets.event_date
      AND slots_table.court_key = targets.court_key
      AND slots_table.sport_id = targets.sport_id
    GROUP BY
      targets.event_date,
      targets.court_key,
      targets.court_name,
      targets.sport_id,
      targets.sport_name,
      targets.planned_match_count
  ),
  court_target_minutes AS (
    SELECT
      targets.event_date,
      targets.court_key,
      max(targets.court_name) AS court_name,
      sum(
        targets.planned_match_count
        * COALESCE(
            championship_sports_table.default_match_duration_minutes,
            sports_table.default_match_duration_minutes,
            35
          )
      )::integer AS requested_minutes
    FROM targets
    JOIN championship_bracket_preview_private.jobs AS jobs_table
      ON jobs_table.id = _job_id
    LEFT JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id =
        jobs_table.championship_id
      AND championship_sports_table.sport_id =
        targets.sport_id
    LEFT JOIN public.sports AS sports_table
      ON sports_table.id = targets.sport_id
    GROUP BY
      targets.event_date,
      targets.court_key
  ),
  court_windows AS (
    SELECT
      court_dimensions.event_date,
      court_dimensions.court_key,
      COALESCE(
        sum(
          extract(
            epoch FROM (
              free_intervals.end_at
              - free_intervals.start_at
            )
          ) / 60
        )::integer,
        0
      ) AS available_minutes
    FROM championship_bracket_preview_private.jobs AS jobs_table
    CROSS JOIN LATERAL (
      SELECT DISTINCT
        (day_item.value ->> 'date')::date AS event_date,
        (location_item.value ->> 'location_key')::uuid AS location_key,
        (court_item.value ->> 'court_key')::uuid AS court_key
      FROM jsonb_array_elements(
        COALESCE(
          jobs_table.payload -> 'schedule_days',
          '[]'::jsonb
        )
      ) AS day_item(value)
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(
          day_item.value -> 'locations',
          '[]'::jsonb
        )
      ) AS location_item(value)
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(
          location_item.value -> 'courts',
          '[]'::jsonb
        )
      ) AS court_item(value)
      WHERE jsonb_array_length(
        COALESCE(
          court_item.value -> 'sport_match_targets',
          '[]'::jsonb
        )
      ) > 0
    ) AS court_dimensions
    CROSS JOIN LATERAL
      championship_bracket_preview_private.resolve_court_free_intervals(
        jobs_table.payload,
        court_dimensions.event_date,
        court_dimensions.location_key,
        court_dimensions.court_key
      ) AS free_intervals
    WHERE jobs_table.id = _job_id
    GROUP BY
      court_dimensions.event_date,
      court_dimensions.court_key
  ),
  court_capacities AS (
    SELECT
      court_target_minutes.*,
      court_windows.available_minutes
    FROM court_target_minutes
    JOIN court_windows
      USING (event_date, court_key)
  ),
  global_targets AS (
    SELECT
      sport_id,
      sport_name,
      sum(planned_match_count)::integer AS planned_match_count
    FROM targets
    GROUP BY
      sport_id,
      sport_name
  ),
  group_matches AS (
    SELECT
      competitions_table.sport_id,
      count(*)::integer AS match_count
    FROM championship_bracket_preview_private.matches AS matches_table
    JOIN championship_bracket_preview_private.competitions
      AS competitions_table
      ON competitions_table.id =
        matches_table.competition_id
    WHERE matches_table.job_id = _job_id
    GROUP BY
      competitions_table.sport_id
  )
  SELECT COALESCE(
    jsonb_agg(
      diagnostic
      ORDER BY
        diagnostic ->> 'code',
        diagnostic ->> 'date',
        diagnostic ->> 'court_name'
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT jsonb_build_object(
      'code',
      'SPORT_MATCH_TARGET_CAPACITY_EXCEEDED',
      'message',
      format(
        '%s em %s possui capacidade de %s jogos, mas o target exige %s.',
        court_name,
        event_date,
        available_slots,
        planned_match_count
      ),
      'date',
      event_date,
      'court_key',
      court_key,
      'court_name',
      court_name,
      'sport_id',
      sport_id,
      'sport_name',
      sport_name,
      'target',
      planned_match_count,
      'obtained',
      available_slots
    ) AS diagnostic
    FROM target_capacities
    WHERE available_slots < planned_match_count

    UNION ALL

    SELECT jsonb_build_object(
      'code',
      'SPORT_MATCH_TARGET_COURT_CAPACITY_EXCEEDED',
      'message',
      format(
        '%s em %s precisa de %s minutos para os targets, mas possui somente %s minutos jogáveis.',
        court_name,
        event_date,
        requested_minutes,
        available_minutes
      ),
      'date',
      event_date,
      'court_key',
      court_key,
      'court_name',
      court_name,
      'target',
      requested_minutes,
      'obtained',
      available_minutes
    )
    FROM court_capacities
    WHERE requested_minutes > available_minutes

    UNION ALL

    SELECT jsonb_build_object(
      'code',
      'SPORT_MATCH_TARGET_TOTAL_INSUFFICIENT',
      'message',
      format(
        '%s possui %s partidas de grupos, mas os targets configurados comportam somente %s.',
        global_targets.sport_name,
        group_matches.match_count,
        global_targets.planned_match_count
      ),
      'sport_id',
      global_targets.sport_id,
      'sport_name',
      global_targets.sport_name,
      'target',
      group_matches.match_count,
      'obtained',
      global_targets.planned_match_count
    )
    FROM global_targets
    JOIN group_matches
      ON group_matches.sport_id =
        global_targets.sport_id
    WHERE global_targets.planned_match_count
      < group_matches.match_count
  ) AS diagnostics_result;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_v8_target_completion_diagnostics(
  _job_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  WITH targets AS (
    SELECT *
    FROM championship_bracket_preview_private.resolve_v8_sport_targets(
      _job_id
    )
  ),
  target_usage AS (
    SELECT
      targets.*,
      count(assignments_table.match_id)::integer AS assigned_match_count
    FROM targets
    LEFT JOIN championship_bracket_preview_private.slots
      AS slots_table
      ON slots_table.job_id = _job_id
      AND slots_table.event_date =
        targets.event_date
      AND slots_table.court_key =
        targets.court_key
      AND slots_table.sport_id =
        targets.sport_id
    LEFT JOIN championship_bracket_preview_private.assignments
      AS assignments_table
      ON assignments_table.job_id = _job_id
      AND assignments_table.slot_id =
        slots_table.id
    GROUP BY
      targets.event_date,
      targets.court_key,
      targets.court_name,
      targets.sport_id,
      targets.sport_name,
      targets.planned_match_count
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'code',
        'SPORT_MATCH_TARGET_EXCEEDED',
        'message',
        format(
          '%s em %s para %s permite %s jogos, mas recebeu %s partidas de grupos.',
          court_name,
          event_date,
          sport_name,
          planned_match_count,
          assigned_match_count
        ),
        'date',
        event_date,
        'court_key',
        court_key,
        'court_name',
        court_name,
        'sport_id',
        sport_id,
        'sport_name',
        sport_name,
        'target',
        planned_match_count,
        'obtained',
        assigned_match_count
      )
      ORDER BY
        event_date,
        court_name,
        sport_name
    ),
    '[]'::jsonb
  )
  FROM target_usage
  WHERE assigned_match_count
    > planned_match_count;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.process_batch(
  _job_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  job_record RECORD;
  preflight_diagnostics JSONB;
  result JSONB;
BEGIN
  SELECT *
  INTO job_record
  FROM championship_bracket_preview_private.jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF job_record.status IN (
    'QUEUED',
    'INITIALIZING'
  ) THEN
    PERFORM
      championship_bracket_preview_private.initialize_job(
        _job_id
      );

    PERFORM
      championship_bracket_preview_private.rebuild_job_round_robin_matches(
        _job_id
      );

    PERFORM
      championship_bracket_preview_private.rebuild_job_slots(
        _job_id
      );

    SELECT
      championship_bracket_preview_private.resolve_v8_target_preflight(
        _job_id
      )
    INTO preflight_diagnostics;

    IF jsonb_array_length(
      preflight_diagnostics
    ) > 0 THEN
      UPDATE championship_bracket_preview_private.jobs
      SET
        status = 'FAILED',
        stage = 'Validação estrutural',
        diagnostics = preflight_diagnostics,
        error_message =
          preflight_diagnostics -> 0 ->> 'message',
        completed_at = now(),
        updated_at = now()
      WHERE id = _job_id;

      RETURN jsonb_build_object(
        'continue',
        false
      );
    END IF;

    UPDATE championship_bracket_preview_private.jobs
    SET
      stage = 'SCHEDULING_GROUPS',
      updated_at = now()
    WHERE id = _job_id;
  END IF;

  result :=
    championship_bracket_preview_private.process_batch_v7(
      _job_id
    );

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.process_job(
  _job_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
SET statement_timeout = '15s'
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

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.finalize_job(
  _job_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  job_record RECORD;
  target_diagnostics JSONB;
  timeline_diagnostics JSONB;
  final_diagnostics JSONB;
  manifest JSONB;
  group_count INTEGER;
  knockout_count INTEGER;
  scheduled_knockout_count INTEGER;
BEGIN
  SELECT *
  INTO job_record
  FROM championship_bracket_preview_private.jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF job_record.status <> 'FINALIZING'
    OR job_record.stage <> 'FINALIZING'
  THEN
    RETURN;
  END IF;

  SELECT
    championship_bracket_preview_private.resolve_v8_target_completion_diagnostics(
      _job_id
    )
  INTO target_diagnostics;

  SELECT
    championship_bracket_preview_private.resolve_v8_internal_empty_diagnostics(
      _job_id
    )
  INTO timeline_diagnostics;

  SELECT count(*)
  INTO group_count
  FROM championship_bracket_preview_private.assignments
  WHERE job_id = _job_id;

  SELECT count(*)
  INTO knockout_count
  FROM championship_bracket_preview_private.knockout_matches
  WHERE job_id = _job_id
    AND NOT is_bye;

  SELECT count(*)
  INTO scheduled_knockout_count
  FROM championship_bracket_preview_private.knockout_matches
  WHERE job_id = _job_id
    AND NOT is_bye
    AND scheduled_date IS NOT NULL
    AND location_key IS NOT NULL
    AND court_key IS NOT NULL
    AND start_at IS NOT NULL
    AND end_at IS NOT NULL;

  final_diagnostics :=
    target_diagnostics
    || timeline_diagnostics;

  IF group_count <> (
    SELECT count(*)
    FROM championship_bracket_preview_private.matches
    WHERE job_id = _job_id
  )
    OR knockout_count <> scheduled_knockout_count
  THEN
    final_diagnostics :=
      final_diagnostics
      || jsonb_build_array(
        jsonb_build_object(
          'code',
          'SCHEDULE_INCOMPLETE',
          'message',
          'A prévia v8 não possui todas as partidas estruturais programadas.',
          'target',
          (
            SELECT count(*)
            FROM championship_bracket_preview_private.matches
            WHERE job_id = _job_id
          ) + knockout_count,
          'obtained',
          group_count + scheduled_knockout_count
        )
      );
  END IF;

  IF jsonb_array_length(
    final_diagnostics
  ) > 0 THEN
    UPDATE championship_bracket_preview_private.jobs
    SET
      status = 'FAILED',
      stage = 'Validação da programação',
      diagnostics = final_diagnostics,
      error_message =
        final_diagnostics -> 0 ->> 'message',
      completed_at = now(),
      updated_at = now()
    WHERE id = _job_id;

    RETURN;
  END IF;

  SELECT jsonb_build_object(
    'algorithm_version',
    'async-exact-v8',
    'groups',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'competition',
            competitions.competition_key,
            'group',
            groups.group_number,
            'teams',
            (
              SELECT jsonb_agg(
                group_teams.team_id
                ORDER BY group_teams.position
              )
              FROM championship_bracket_preview_private.group_teams
                AS group_teams
              WHERE group_teams.group_id =
                groups.id
            )
          )
          ORDER BY
            competitions.position,
            groups.group_number
        )
        FROM championship_bracket_preview_private.groups
          AS groups
        JOIN championship_bracket_preview_private.competitions
          AS competitions
          ON competitions.id =
            groups.competition_id
        WHERE groups.job_id = _job_id
      ),
      '[]'::jsonb
    ),
    'group_matches',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'key',
            matches.logical_key,
            'slot_id',
            assignments.slot_id,
            'home_team_id',
            matches.home_team_id,
            'away_team_id',
            matches.away_team_id,
            'date',
            slots.event_date,
            'location_key',
            slots.location_key,
            'location',
            slots.location_name,
            'court_key',
            slots.court_key,
            'court',
            slots.court_name,
            'start',
            slots.start_at,
            'end',
            slots.end_at,
            'match_number',
            assignments.match_number
          )
          ORDER BY matches.logical_key
        )
        FROM championship_bracket_preview_private.assignments
          AS assignments
        JOIN championship_bracket_preview_private.matches
          AS matches
          ON matches.id =
            assignments.match_id
        JOIN championship_bracket_preview_private.slots
          AS slots
          ON slots.id =
            assignments.slot_id
        WHERE assignments.job_id = _job_id
      ),
      '[]'::jsonb
    ),
    'knockout_matches',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'key',
            knockout_matches.logical_key,
            'phase',
            knockout_matches.phase,
            'round',
            knockout_matches.round_number,
            'slot',
            knockout_matches.slot_number,
            'home_source_type',
            knockout_matches.home_source_type,
            'home_source',
            knockout_matches.home_source_reference,
            'away_source_type',
            knockout_matches.away_source_type,
            'away_source',
            knockout_matches.away_source_reference,
            'predecessors',
            knockout_matches.predecessor_match_ids,
            'is_bye',
            knockout_matches.is_bye,
            'date',
            knockout_matches.scheduled_date,
            'location_key',
            knockout_matches.location_key,
            'location',
            knockout_matches.location_name,
            'court_key',
            knockout_matches.court_key,
            'court',
            knockout_matches.court_name,
            'start',
            CASE
              WHEN knockout_matches.is_bye
                THEN NULL
              ELSE knockout_matches.start_at
            END,
            'end',
            CASE
              WHEN knockout_matches.is_bye
                THEN NULL
              ELSE knockout_matches.end_at
            END,
            'manual_final',
            knockout_matches.manual_final
          )
          ORDER BY
            knockout_matches.round_number,
            knockout_matches.slot_number,
            knockout_matches.logical_key
        )
        FROM championship_bracket_preview_private.knockout_matches
          AS knockout_matches
        WHERE knockout_matches.job_id = _job_id
      ),
      '[]'::jsonb
    )
  )
  INTO manifest;

  UPDATE championship_bracket_preview_private.jobs
  SET
    status = 'COMPLETED',
    stage = 'Concluída',
    progress_percentage = 100,
    summary = jsonb_build_object(
      'total_matches',
      group_count + knockout_count,
      'group_stage_matches',
      group_count,
      'knockout_matches',
      knockout_count,
      'scheduled_matches',
      group_count + scheduled_knockout_count,
      'occupied_minutes',
      (
        SELECT COALESCE(
          sum(minutes),
          0
        )::integer
        FROM (
          SELECT
            extract(
              epoch FROM (
                slots_table.end_at
                - slots_table.start_at
              )
            ) / 60 AS minutes
          FROM championship_bracket_preview_private.assignments
            AS assignments_table
          JOIN championship_bracket_preview_private.slots
            AS slots_table
            ON slots_table.id =
              assignments_table.slot_id
          WHERE assignments_table.job_id = _job_id

          UNION ALL

          SELECT
            extract(
              epoch FROM (
                knockout_matches.end_at
                - knockout_matches.start_at
              )
            ) / 60
          FROM championship_bracket_preview_private.knockout_matches
            AS knockout_matches
          WHERE knockout_matches.job_id = _job_id
            AND NOT knockout_matches.is_bye
        ) AS occupied
      ),
      'available_minutes',
      (
        SELECT COALESCE(
          sum(
            extract(
              epoch FROM (
                end_at - start_at
              )
            ) / 60
          )::integer,
          0
        )
        FROM championship_bracket_preview_private.slots
        WHERE job_id = _job_id
      ),
      'utilization_percentage',
      NULL,
      'free_windows',
      NULL,
      'conflict_count',
      0,
      'warning_count',
      0,
      'search_tiers',
      jsonb_build_object(
        'fast_attempts',
        (
          SELECT count(*)
          FROM championship_bracket_preview_private.relocation_attempt_metrics
          WHERE job_id = _job_id
            AND search_tier = 'FAST'
        ),
        'medium_attempts',
        (
          SELECT count(*)
          FROM championship_bracket_preview_private.relocation_attempt_metrics
          WHERE job_id = _job_id
            AND search_tier = 'MEDIUM'
        ),
        'deep_attempts',
        (
          SELECT count(*)
          FROM championship_bracket_preview_private.relocation_attempt_metrics
          WHERE job_id = _job_id
            AND search_tier = 'DEEP'
        ),
        'relocations_used',
        0,
        'branches_examined',
        0
      )
    ),
    generation_signature =
      encode(
        extensions.digest(
          convert_to(
            manifest::text,
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      ),
    completed_at = now(),
    expires_at =
      now() + interval '7 days',
    updated_at = now()
  WHERE id = _job_id;
END;
$function$;

NOTIFY pgrst, 'reload schema';