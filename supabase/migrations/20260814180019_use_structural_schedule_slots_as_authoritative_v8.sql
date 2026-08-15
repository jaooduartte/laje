ALTER TABLE championship_bracket_preview_private.slots
ADD COLUMN IF NOT EXISTS structural_slot_key TEXT;

ALTER TABLE championship_bracket_preview_private.slots
ADD COLUMN IF NOT EXISTS structural_competition_id UUID;

ALTER TABLE championship_bracket_preview_private.slots
ADD COLUMN IF NOT EXISTS structural_competition_key TEXT;

ALTER TABLE championship_bracket_preview_private.slots
ADD COLUMN IF NOT EXISTS structural_phase TEXT;

ALTER TABLE championship_bracket_preview_private.slots
ADD COLUMN IF NOT EXISTS structural_phase_slot_number INTEGER;

ALTER TABLE championship_bracket_preview_private.slots
ADD COLUMN IF NOT EXISTS structural_match_kind TEXT;

ALTER TABLE championship_bracket_preview_private.slots
ADD COLUMN IF NOT EXISTS structural_manual_final BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS championship_bracket_preview_slots_structural_key_idx
ON championship_bracket_preview_private.slots (
  job_id,
  structural_slot_key
)
WHERE structural_slot_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS championship_bracket_preview_slots_structural_phase_idx
ON championship_bracket_preview_private.slots (
  job_id,
  structural_competition_id,
  structural_phase,
  structural_phase_slot_number
)
WHERE structural_competition_id IS NOT NULL
  AND structural_phase IS NOT NULL
  AND structural_phase_slot_number IS NOT NULL;

DO $migration$
BEGIN
  IF to_regprocedure(
    'championship_bracket_preview_private.rebuild_job_slots_legacy_structural_v8(uuid)'
  ) IS NULL THEN
    ALTER FUNCTION championship_bracket_preview_private.rebuild_job_slots(UUID)
    RENAME TO rebuild_job_slots_legacy_structural_v8;
  END IF;

  IF to_regprocedure(
    'championship_bracket_preview_private.process_batch_legacy_structural_v8(uuid)'
  ) IS NULL THEN
    ALTER FUNCTION championship_bracket_preview_private.process_batch(UUID)
    RENAME TO process_batch_legacy_structural_v8;
  END IF;

  IF to_regprocedure(
    'championship_bracket_preview_private.process_job_legacy_structural_v8(uuid)'
  ) IS NULL THEN
    ALTER FUNCTION championship_bracket_preview_private.process_job(UUID)
    RENAME TO process_job_legacy_structural_v8;
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.is_match_slot_static_eligible(
  _job_id UUID,
  _match_id UUID,
  _slot_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  WITH context AS (
    SELECT
      jobs_table.payload,
      matches_table.competition_id AS match_competition_id,
      competitions_table.sport_id,
      competitions_table.naipe,
      competitions_table.division,
      competitions_table.competition_key,
      matches_table.home_team_id,
      matches_table.away_team_id,
      slots_table.event_date,
      slots_table.start_at,
      slots_table.end_at,
      slots_table.preferred_naipe,
      slots_table.preferred_division,
      slots_table.sequence_mode,
      slots_table.structural_competition_id,
      slots_table.structural_phase
    FROM championship_bracket_preview_private.jobs AS jobs_table
    JOIN championship_bracket_preview_private.matches AS matches_table
      ON matches_table.job_id = jobs_table.id
      AND matches_table.id = _match_id
    JOIN championship_bracket_preview_private.competitions AS competitions_table
      ON competitions_table.id = matches_table.competition_id
    JOIN championship_bracket_preview_private.slots AS slots_table
      ON slots_table.job_id = jobs_table.id
      AND slots_table.id = _slot_id
      AND slots_table.sport_id = competitions_table.sport_id
    WHERE jobs_table.id = _job_id
  )
  SELECT COALESCE(
    (
      SELECT
        (
          context.structural_phase IS NULL
          OR (
            context.structural_phase = 'GROUP_STAGE'
            AND context.structural_competition_id =
              context.match_competition_id
          )
        )
        AND (
          context.sequence_mode <> 'GROUP_NAIPE'
          OR context.preferred_naipe IS NULL
          OR context.preferred_naipe = context.naipe
        )
        AND (
          context.preferred_division IS NULL
          OR context.preferred_division
            IS NOT DISTINCT FROM context.division
          OR context.sequence_mode <> 'GROUP_DIVISION'
        )
        AND public.is_championship_bracket_competition_slot_playable(
          context.payload,
          context.competition_key,
          context.event_date,
          context.start_at,
          context.end_at
        )
        AND public.is_championship_bracket_team_slot_playable(
          context.payload,
          context.home_team_id,
          context.competition_key,
          context.event_date,
          context.start_at,
          context.end_at
        )
        AND public.is_championship_bracket_team_slot_playable(
          context.payload,
          context.away_team_id,
          context.competition_key,
          context.event_date,
          context.start_at,
          context.end_at
        )
        AND championship_bracket_preview_private.is_job_slot_within_day_bounds(
          _job_id,
          _slot_id
        )
      FROM context
    ),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.is_match_slot_eligible_with_rest_gap(
  _job_id UUID,
  _match_id UUID,
  _slot_id BIGINT,
  _required_gap INTEGER DEFAULT 3
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  SELECT
    championship_bracket_preview_private.is_match_slot_static_eligible(
      _job_id,
      _match_id,
      _slot_id
    )
    AND championship_bracket_preview_private.is_match_slot_eligible(
      _job_id,
      _match_id,
      _slot_id,
      false
    )
    AND NOT EXISTS (
      SELECT 1
      FROM championship_bracket_preview_private.assignments
        AS previous_assignment
      WHERE previous_assignment.job_id = _job_id
        AND previous_assignment.match_id <> _match_id
        AND championship_bracket_preview_private.is_match_rest_conflict_with_gap(
          _job_id,
          _match_id,
          _slot_id,
          previous_assignment.match_id,
          GREATEST(
            COALESCE(_required_gap, 3),
            1
          )
        )
    );
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.rebuild_job_slots(
  _job_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  job_record RECORD;
  inserted_count INTEGER;
  manifest_count INTEGER;
BEGIN
  SELECT *
  INTO job_record
  FROM championship_bracket_preview_private.jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF job_record.id IS NULL THEN
    RAISE EXCEPTION
      'Job de prévia não encontrado para reconstruir os horários.';
  END IF;

  IF job_record.algorithm_version <> 'async-exact-v8'
    OR jsonb_typeof(
      job_record.payload -> 'structural_schedule_slots'
    ) IS DISTINCT FROM 'array'
  THEN
    PERFORM championship_bracket_preview_private.rebuild_job_slots_legacy_structural_v8(
      _job_id
    );
    RETURN;
  END IF;

  manifest_count := jsonb_array_length(
    COALESCE(
      job_record.payload -> 'structural_schedule_slots',
      '[]'::jsonb
    )
  );

  IF manifest_count = 0 THEN
    RAISE EXCEPTION
      'O payload v8 não possui structural_schedule_slots.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      job_record.payload -> 'structural_schedule_slots'
    ) AS slot_item(value)
    GROUP BY slot_item.value ->> 'slot_key'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'O manifesto estrutural possui slot_key duplicado.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      job_record.payload -> 'structural_schedule_slots'
    ) AS slot_item(value)
    WHERE NULLIF(
      slot_item.value ->> 'slot_key',
      ''
    ) IS NULL
      OR NULLIF(
        slot_item.value ->> 'competition_key',
        ''
      ) IS NULL
      OR NULLIF(
        slot_item.value ->> 'phase',
        ''
      ) IS NULL
      OR NULLIF(
        slot_item.value ->> 'date',
        ''
      ) IS NULL
      OR NULLIF(
        slot_item.value ->> 'start_time',
        ''
      ) IS NULL
      OR NULLIF(
        slot_item.value ->> 'end_time',
        ''
      ) IS NULL
      OR COALESCE(
        (slot_item.value ->> 'phase_slot_number')::integer,
        0
      ) < 1
  ) THEN
    RAISE EXCEPTION
      'O manifesto estrutural possui slots incompletos.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      job_record.payload -> 'structural_schedule_slots'
    ) AS slot_item(value)
    WHERE slot_item.value ->> 'phase' NOT IN (
      'GROUP_STAGE',
      'ROUND_OF_32',
      'ROUND_OF_16',
      'QUARTERFINAL',
      'SEMIFINAL',
      'FINAL'
    )
  ) THEN
    RAISE EXCEPTION
      'O manifesto estrutural possui uma fase não suportada.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.assignments
    WHERE job_id = _job_id
  ) THEN
    RAISE EXCEPTION
      'Os horários não podem ser reconstruídos depois do início das atribuições.';
  END IF;

  DELETE FROM championship_bracket_preview_private.slots
  WHERE job_id = _job_id;

  WITH raw_slots AS (
    SELECT
      slot_item.value ->> 'slot_key'
        AS structural_slot_key,
      (slot_item.value ->> 'date')::date
        AS event_date,
      (slot_item.value ->> 'location_key')::uuid
        AS location_key,
      slot_item.value ->> 'location_name'
        AS location_name,
      (slot_item.value ->> 'court_key')::uuid
        AS court_key,
      slot_item.value ->> 'court_name'
        AS court_name,
      slot_item.value ->> 'competition_key'
        AS competition_key,
      (slot_item.value ->> 'sport_id')::uuid
        AS sport_id,
      NULLIF(
        slot_item.value ->> 'naipe',
        ''
      )::public.match_naipe
        AS naipe,
      NULLIF(
        slot_item.value ->> 'division',
        ''
      )::public.team_division
        AS division,
      slot_item.value ->> 'phase'
        AS phase,
      (slot_item.value ->> 'phase_slot_number')::integer
        AS phase_slot_number,
      slot_item.value ->> 'match_kind'
        AS match_kind,
      COALESCE(
        (slot_item.value ->> 'manual_final')::boolean,
        false
      ) AS manual_final,
      public.combine_bracket_schedule_timestamp(
        (slot_item.value ->> 'date')::date,
        (slot_item.value ->> 'start_time')::time
      ) AS start_at,
      public.combine_bracket_schedule_timestamp(
        (slot_item.value ->> 'date')::date,
        (slot_item.value ->> 'end_time')::time
      ) AS end_at,
      COALESCE(
        (slot_item.value ->> 'duration_minutes')::integer,
        0
      ) AS duration_minutes
    FROM jsonb_array_elements(
      job_record.payload -> 'structural_schedule_slots'
    ) AS slot_item(value)
  ),
  enriched_slots AS (
    SELECT
      raw_slots.*,
      competitions_table.id
        AS competition_id,
      COALESCE(
        location_metadata.location_position,
        1
      ) AS location_position,
      COALESCE(
        location_metadata.court_position,
        1
      ) AS court_position
    FROM raw_slots
    JOIN championship_bracket_preview_private.competitions
      AS competitions_table
      ON competitions_table.job_id = _job_id
      AND competitions_table.competition_key =
        raw_slots.competition_key
      AND competitions_table.sport_id =
        raw_slots.sport_id
      AND competitions_table.naipe
        IS NOT DISTINCT FROM raw_slots.naipe
      AND competitions_table.division
        IS NOT DISTINCT FROM raw_slots.division
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(
          (location_item.value ->> 'position')::integer,
          location_item.ordinality::integer
        ) AS location_position,
        COALESCE(
          (court_item.value ->> 'position')::integer,
          court_item.ordinality::integer
        ) AS court_position
      FROM jsonb_array_elements(
        COALESCE(
          job_record.payload -> 'schedule_days',
          '[]'::jsonb
        )
      ) AS day_item(value)
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(
          day_item.value -> 'locations',
          '[]'::jsonb
        )
      ) WITH ORDINALITY
        AS location_item(value, ordinality)
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(
          location_item.value -> 'courts',
          '[]'::jsonb
        )
      ) WITH ORDINALITY
        AS court_item(value, ordinality)
      WHERE day_item.value ->> 'date' =
        raw_slots.event_date::text
        AND location_item.value ->> 'location_key' =
          raw_slots.location_key::text
        AND court_item.value ->> 'court_key' =
          raw_slots.court_key::text
      LIMIT 1
    ) AS location_metadata
      ON true
  ),
  numbered_slots AS (
    SELECT
      enriched_slots.*,
      row_number() OVER (
        PARTITION BY
          enriched_slots.event_date,
          enriched_slots.court_key
        ORDER BY
          enriched_slots.start_at,
          enriched_slots.end_at,
          enriched_slots.structural_slot_key
      )::integer AS sequence_index,
      row_number() OVER (
        ORDER BY
          enriched_slots.event_date,
          enriched_slots.start_at,
          enriched_slots.location_position,
          enriched_slots.court_position,
          enriched_slots.structural_slot_key
      )::bigint AS cursor_position
    FROM enriched_slots
  )
  INSERT INTO championship_bracket_preview_private.slots (
    job_id,
    event_date,
    location_key,
    location_name,
    location_position,
    court_key,
    court_name,
    court_position,
    sport_id,
    start_at,
    end_at,
    sequence_index,
    preferred_sport,
    preferred_naipe,
    preferred_division,
    sequence_mode,
    cursor_position,
    processed,
    structural_slot_key,
    structural_competition_id,
    structural_competition_key,
    structural_phase,
    structural_phase_slot_number,
    structural_match_kind,
    structural_manual_final
  )
  SELECT
    _job_id,
    numbered_slots.event_date,
    numbered_slots.location_key,
    numbered_slots.location_name,
    numbered_slots.location_position,
    numbered_slots.court_key,
    numbered_slots.court_name,
    numbered_slots.court_position,
    numbered_slots.sport_id,
    numbered_slots.start_at,
    numbered_slots.end_at,
    numbered_slots.sequence_index,
    true,
    numbered_slots.naipe,
    numbered_slots.division,
    'FLEXIBLE',
    numbered_slots.cursor_position,
    numbered_slots.phase <> 'GROUP_STAGE',
    numbered_slots.structural_slot_key,
    numbered_slots.competition_id,
    numbered_slots.competition_key,
    numbered_slots.phase,
    numbered_slots.phase_slot_number,
    numbered_slots.match_kind,
    numbered_slots.manual_final
  FROM numbered_slots;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF inserted_count <> manifest_count THEN
    RAISE EXCEPTION
      'O manifesto possui % slots, mas somente % foram materializados.',
      manifest_count,
      inserted_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.slots
    WHERE job_id = _job_id
      AND (
        end_at <= start_at
        OR structural_competition_id IS NULL
      )
  ) THEN
    RAISE EXCEPTION
      'Um ou mais slots estruturais possuem horário ou competição inválidos.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.slots
      AS slots_table
    JOIN LATERAL (
      SELECT
        COALESCE(
          (slot_item.value ->> 'duration_minutes')::integer,
          0
        ) AS duration_minutes
      FROM jsonb_array_elements(
        job_record.payload -> 'structural_schedule_slots'
      ) AS slot_item(value)
      WHERE slot_item.value ->> 'slot_key' =
        slots_table.structural_slot_key
      LIMIT 1
    ) AS payload_slot
      ON true
    WHERE slots_table.job_id = _job_id
      AND (
        extract(
          epoch FROM (
            slots_table.end_at - slots_table.start_at
          )
        ) / 60
      )::integer
        <> payload_slot.duration_minutes
  ) THEN
    RAISE EXCEPTION
      'A duração materializada diverge do structural_schedule_slots.';
  END IF;

  UPDATE championship_bracket_preview_private.jobs
  SET
    total_slots = (
      SELECT count(*)
      FROM championship_bracket_preview_private.slots
      WHERE job_id = _job_id
        AND structural_phase = 'GROUP_STAGE'
    ),
    processed_slots = 0,
    updated_at = now()
  WHERE id = _job_id;
END;
$function$;

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
  target_usage AS (
    SELECT
      targets.event_date,
      targets.court_key,
      targets.court_name,
      targets.sport_id,
      targets.sport_name,
      targets.planned_match_count,
      count(slots_table.id)::integer
        AS structural_match_count
    FROM targets
    LEFT JOIN championship_bracket_preview_private.slots
      AS slots_table
      ON slots_table.job_id = _job_id
      AND slots_table.event_date = targets.event_date
      AND slots_table.court_key = targets.court_key
      AND slots_table.sport_id = targets.sport_id
      AND NOT slots_table.structural_manual_final
    GROUP BY
      targets.event_date,
      targets.court_key,
      targets.court_name,
      targets.sport_id,
      targets.sport_name,
      targets.planned_match_count
  ),
  group_matches AS (
    SELECT
      competitions_table.id AS competition_id,
      competitions_table.competition_key,
      competitions_table.sport_name,
      competitions_table.naipe,
      competitions_table.division,
      count(matches_table.id)::integer
        AS match_count
    FROM championship_bracket_preview_private.competitions
      AS competitions_table
    LEFT JOIN championship_bracket_preview_private.matches
      AS matches_table
      ON matches_table.job_id = _job_id
      AND matches_table.competition_id =
        competitions_table.id
    WHERE competitions_table.job_id = _job_id
    GROUP BY
      competitions_table.id,
      competitions_table.competition_key,
      competitions_table.sport_name,
      competitions_table.naipe,
      competitions_table.division
  ),
  group_slots AS (
    SELECT
      slots_table.structural_competition_id
        AS competition_id,
      count(*)::integer
        AS slot_count
    FROM championship_bracket_preview_private.slots
      AS slots_table
    WHERE slots_table.job_id = _job_id
      AND slots_table.structural_phase =
        'GROUP_STAGE'
    GROUP BY
      slots_table.structural_competition_id
  ),
  slot_overlaps AS (
    SELECT
      first_slot.event_date,
      first_slot.court_key,
      first_slot.court_name,
      first_slot.structural_slot_key
        AS first_slot_key,
      second_slot.structural_slot_key
        AS second_slot_key
    FROM championship_bracket_preview_private.slots
      AS first_slot
    JOIN championship_bracket_preview_private.slots
      AS second_slot
      ON second_slot.job_id = first_slot.job_id
      AND second_slot.id > first_slot.id
      AND second_slot.event_date =
        first_slot.event_date
      AND second_slot.court_key =
        first_slot.court_key
      AND second_slot.start_at <
        first_slot.end_at
      AND second_slot.end_at >
        first_slot.start_at
    WHERE first_slot.job_id = _job_id
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
      'STRUCTURAL_TARGET_MISMATCH',
      'message',
      format(
        '%s em %s para %s possui target %s, mas o manifesto estrutural possui %s slots.',
        target_usage.court_name,
        target_usage.event_date,
        target_usage.sport_name,
        target_usage.planned_match_count,
        target_usage.structural_match_count
      ),
      'date',
      target_usage.event_date,
      'court_key',
      target_usage.court_key,
      'court_name',
      target_usage.court_name,
      'sport_id',
      target_usage.sport_id,
      'sport_name',
      target_usage.sport_name,
      'target',
      target_usage.planned_match_count,
      'obtained',
      target_usage.structural_match_count
    ) AS diagnostic
    FROM target_usage
    WHERE target_usage.structural_match_count
      <> target_usage.planned_match_count

    UNION ALL

    SELECT jsonb_build_object(
      'code',
      'STRUCTURAL_GROUP_SLOT_COUNT_MISMATCH',
      'message',
      format(
        '%s possui %s partidas de grupos, mas o manifesto reservou %s slots de grupos.',
        group_matches.competition_key,
        group_matches.match_count,
        COALESCE(
          group_slots.slot_count,
          0
        )
      ),
      'competition_key',
      group_matches.competition_key,
      'target',
      group_matches.match_count,
      'obtained',
      COALESCE(
        group_slots.slot_count,
        0
      )
    )
    FROM group_matches
    LEFT JOIN group_slots
      ON group_slots.competition_id =
        group_matches.competition_id
    WHERE COALESCE(
      group_slots.slot_count,
      0
    ) <> group_matches.match_count

    UNION ALL

    SELECT jsonb_build_object(
      'code',
      'STRUCTURAL_SLOT_OVERLAP',
      'message',
      format(
        'A quadra %s em %s possui slots estruturais sobrepostos.',
        slot_overlaps.court_name,
        slot_overlaps.event_date
      ),
      'date',
      slot_overlaps.event_date,
      'court_key',
      slot_overlaps.court_key,
      'court_name',
      slot_overlaps.court_name,
      'first_slot_key',
      slot_overlaps.first_slot_key,
      'second_slot_key',
      slot_overlaps.second_slot_key
    )
    FROM slot_overlaps
  ) AS diagnostics_result;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.process_manifest_group_batch(
  _job_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
SET statement_timeout = '20s'
AS $function$
DECLARE
  started_clock TIMESTAMPTZ := clock_timestamp();
  job_record RECORD;
  slot_record RECORD;
  candidate RECORD;
  pending_count INTEGER;
  processed_count INTEGER;
  remaining_relocation_candidates INTEGER;
  relocation_result JSONB;
BEGIN
  IF NOT pg_try_advisory_xact_lock(
    hashtextextended(
      'championship-bracket-preview-global',
      0
    )
  ) THEN
    RETURN jsonb_build_object(
      'continue',
      true,
      'delay',
      2
    );
  END IF;

  SELECT *
  INTO job_record
  FROM championship_bracket_preview_private.jobs
  WHERE id = _job_id
  FOR UPDATE;

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

  FOR slot_record IN
    SELECT slots_table.*
    FROM championship_bracket_preview_private.slots
      AS slots_table
    WHERE slots_table.job_id = _job_id
      AND slots_table.structural_phase =
        'GROUP_STAGE'
      AND NOT slots_table.processed
      AND slots_table.event_date = (
        SELECT min(next_slot.event_date)
        FROM championship_bracket_preview_private.slots
          AS next_slot
        WHERE next_slot.job_id = _job_id
          AND next_slot.structural_phase =
            'GROUP_STAGE'
          AND NOT next_slot.processed
      )
    ORDER BY
      slots_table.event_date,
      slots_table.start_at,
      slots_table.location_position,
      slots_table.court_position,
      slots_table.cursor_position
    LIMIT 20
    FOR UPDATE OF slots_table SKIP LOCKED
  LOOP
    EXIT WHEN
      clock_timestamp() - started_clock
        >= interval '5 seconds';

    SELECT
      matches_table.*,
      competitions_table.position
        AS competition_position,
      groups_table.group_number
    INTO candidate
    FROM championship_bracket_preview_private.matches
      AS matches_table
    JOIN championship_bracket_preview_private.competitions
      AS competitions_table
      ON competitions_table.id =
        matches_table.competition_id
    JOIN championship_bracket_preview_private.groups
      AS groups_table
      ON groups_table.job_id =
        matches_table.job_id
      AND groups_table.id =
        matches_table.group_id
    WHERE matches_table.job_id = _job_id
      AND NOT matches_table.assigned
      AND matches_table.competition_id =
        slot_record.structural_competition_id
      AND championship_bracket_preview_private.is_match_slot_eligible_with_rest_gap(
        _job_id,
        matches_table.id,
        slot_record.id,
        3
      )
    ORDER BY
      matches_table.priority_weight DESC,
      groups_table.group_number,
      matches_table.round_number,
      matches_table.slot_number,
      least(
        matches_table.home_team_id::text,
        matches_table.away_team_id::text
      ),
      greatest(
        matches_table.home_team_id::text,
        matches_table.away_team_id::text
      )
    LIMIT 1;

    IF candidate.id IS NOT NULL THEN
      INSERT INTO championship_bracket_preview_private.assignments (
        job_id,
        match_id,
        slot_id
      )
      VALUES (
        _job_id,
        candidate.id,
        slot_record.id
      )
      ON CONFLICT DO NOTHING;

      IF EXISTS (
        SELECT 1
        FROM championship_bracket_preview_private.assignments
        WHERE job_id = _job_id
          AND match_id = candidate.id
          AND slot_id = slot_record.id
      ) THEN
        UPDATE championship_bracket_preview_private.matches
        SET
          assigned = true,
          relocation_attempt_count = 0,
          relocation_candidate_cursor = 0,
          relocation_search_exhausted = false
        WHERE job_id = _job_id
          AND id = candidate.id;
      END IF;
    END IF;

    UPDATE championship_bracket_preview_private.slots
    SET processed = true
    WHERE id = slot_record.id;
  END LOOP;

  SELECT count(*)
  INTO pending_count
  FROM championship_bracket_preview_private.matches
  WHERE job_id = _job_id
    AND NOT assigned;

  SELECT count(*)
  INTO processed_count
  FROM championship_bracket_preview_private.slots
  WHERE job_id = _job_id
    AND structural_phase = 'GROUP_STAGE'
    AND processed;

  UPDATE championship_bracket_preview_private.jobs
  SET
    processed_slots = processed_count,
    current_processing_date = (
      SELECT max(event_date)
      FROM championship_bracket_preview_private.slots
      WHERE job_id = _job_id
        AND structural_phase = 'GROUP_STAGE'
        AND processed
    ),
    progress_percentage = LEAST(
      90,
      5 + (
        85
        * processed_count::numeric
        / GREATEST(total_slots, 1)
      )
    ),
    heartbeat_at = now(),
    updated_at = now()
  WHERE id = _job_id;

  IF pending_count = 0 THEN
    UPDATE championship_bracket_preview_private.jobs
    SET
      status = 'FINALIZING',
      stage = 'Materializando mata-mata estrutural',
      progress_percentage = 95,
      heartbeat_at = now(),
      updated_at = now()
    WHERE id = _job_id;

    RETURN jsonb_build_object(
      'continue',
      true,
      'delay',
      0
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.slots
    WHERE job_id = _job_id
      AND structural_phase = 'GROUP_STAGE'
      AND NOT processed
  ) THEN
    RETURN jsonb_build_object(
      'continue',
      true,
      'delay',
      0
    );
  END IF;

  SELECT
    pending_match.*,
    competitions_table.position
      AS competition_position,
    groups_table.group_number
  INTO candidate
  FROM championship_bracket_preview_private.matches
    AS pending_match
  JOIN championship_bracket_preview_private.competitions
    AS competitions_table
    ON competitions_table.id =
      pending_match.competition_id
  JOIN championship_bracket_preview_private.groups
    AS groups_table
    ON groups_table.job_id =
      pending_match.job_id
    AND groups_table.id =
      pending_match.group_id
  WHERE pending_match.job_id = _job_id
    AND NOT pending_match.assigned
    AND NOT pending_match.relocation_search_exhausted
  ORDER BY
    pending_match.relocation_attempt_count,
    pending_match.priority_weight DESC,
    competitions_table.position,
    groups_table.group_number,
    pending_match.round_number,
    pending_match.slot_number
  LIMIT 1;

  IF FOUND THEN
    UPDATE championship_bracket_preview_private.jobs
    SET
      stage = format(
        'Reorganizando slots estruturais: %s jogo(s) pendente(s)',
        pending_count
      ),
      progress_percentage = 90,
      heartbeat_at = now(),
      updated_at = now()
    WHERE id = _job_id;

    relocation_result :=
      championship_bracket_preview_private.try_relocate_for_match_search(
        _job_id,
        candidate.id,
        100
      );

    IF COALESCE(
      (relocation_result ->> 'assigned')::boolean,
      false
    ) THEN
      SELECT count(*)
      INTO pending_count
      FROM championship_bracket_preview_private.matches
      WHERE job_id = _job_id
        AND NOT assigned;

      IF pending_count = 0 THEN
        UPDATE championship_bracket_preview_private.jobs
        SET
          status = 'FINALIZING',
          stage = 'Materializando mata-mata estrutural',
          progress_percentage = 95,
          heartbeat_at = now(),
          updated_at = now()
        WHERE id = _job_id;

        RETURN jsonb_build_object(
          'continue',
          true,
          'delay',
          0
        );
      END IF;

      RETURN jsonb_build_object(
        'continue',
        true,
        'delay',
        0
      );
    END IF;

    IF COALESCE(
      (relocation_result ->> 'progressed')::boolean,
      false
    )
      AND NOT COALESCE(
        (relocation_result ->> 'exhausted')::boolean,
        false
      )
    THEN
      RETURN jsonb_build_object(
        'continue',
        true,
        'delay',
        0
      );
    END IF;
  END IF;

  SELECT count(*)
  INTO remaining_relocation_candidates
  FROM championship_bracket_preview_private.matches
  WHERE job_id = _job_id
    AND NOT assigned
    AND NOT relocation_search_exhausted;

  SELECT count(*)
  INTO pending_count
  FROM championship_bracket_preview_private.matches
  WHERE job_id = _job_id
    AND NOT assigned;

  IF pending_count = 0 THEN
    UPDATE championship_bracket_preview_private.jobs
    SET
      status = 'FINALIZING',
      stage = 'Materializando mata-mata estrutural',
      progress_percentage = 95,
      heartbeat_at = now(),
      updated_at = now()
    WHERE id = _job_id;

    RETURN jsonb_build_object(
      'continue',
      true,
      'delay',
      0
    );
  END IF;

  IF remaining_relocation_candidates > 0 THEN
    RETURN jsonb_build_object(
      'continue',
      true,
      'delay',
      0
    );
  END IF;

  UPDATE championship_bracket_preview_private.jobs
  SET
    status = 'FAILED',
    stage = 'Falha',
    progress_percentage = 100,
    error_message = format(
      'Não foi possível distribuir %s jogo(s) dentro dos slots GROUP_STAGE autoritativos do manifesto estrutural.',
      pending_count
    ),
    diagnostics =
      championship_bracket_preview_private.build_unassigned_match_diagnostics(
        _job_id
      ),
    completed_at = now(),
    expires_at = now() + interval '24 hours',
    heartbeat_at = now(),
    updated_at = now()
  WHERE id = _job_id;

  RETURN jsonb_build_object(
    'continue',
    false
  );
END;
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
BEGIN
  SELECT *
  INTO job_record
  FROM championship_bracket_preview_private.jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF job_record.algorithm_version <> 'async-exact-v8'
    OR jsonb_typeof(
      job_record.payload -> 'structural_schedule_slots'
    ) IS DISTINCT FROM 'array'
  THEN
    RETURN championship_bracket_preview_private.process_batch_legacy_structural_v8(
      _job_id
    );
  END IF;

  IF job_record.status IN (
    'QUEUED',
    'INITIALIZING'
  ) THEN
    PERFORM championship_bracket_preview_private.initialize_job(
      _job_id
    );

    PERFORM championship_bracket_preview_private.rebuild_job_round_robin_matches(
      _job_id
    );

    PERFORM championship_bracket_preview_private.rebuild_job_slots(
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
      status = 'SCHEDULING',
      stage = 'SCHEDULING_GROUPS',
      progress_percentage = 5,
      updated_at = now()
    WHERE id = _job_id;
  END IF;

  RETURN championship_bracket_preview_private.process_manifest_group_batch(
    _job_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.apply_v8_structural_knockout_schedule(
  _job_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  diagnostics JSONB := '[]'::jsonb;
BEGIN
  PERFORM championship_bracket_preview_private.create_v8_knockout_matches(
    _job_id
  );

  UPDATE championship_bracket_preview_private.knockout_matches
    AS knockout_matches
  SET
    scheduled_slot_id = structural_slot.id,
    scheduled_date = structural_slot.event_date,
    location_key = structural_slot.location_key,
    location_name = structural_slot.location_name,
    court_key = structural_slot.court_key,
    court_name = structural_slot.court_name,
    start_at = structural_slot.start_at,
    end_at = structural_slot.end_at,
    duration_minutes = (
      extract(
        epoch FROM (
          structural_slot.end_at
          - structural_slot.start_at
        )
      ) / 60
    )::integer,
    manual_final =
      structural_slot.structural_manual_final
  FROM championship_bracket_preview_private.slots
    AS structural_slot
  WHERE knockout_matches.job_id = _job_id
    AND NOT knockout_matches.is_bye
    AND structural_slot.job_id = _job_id
    AND structural_slot.structural_competition_id =
      knockout_matches.competition_id
    AND structural_slot.structural_phase =
      knockout_matches.phase
    AND structural_slot.structural_phase_slot_number =
      knockout_matches.slot_number
    AND structural_slot.structural_phase <>
      'GROUP_STAGE';

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'code',
        'STRUCTURAL_KNOCKOUT_SLOT_MISSING',
        'message',
        format(
          'O confronto %s não possui slot estrutural correspondente no manifesto.',
          knockout_matches.logical_key
        ),
        'logical_key',
        knockout_matches.logical_key,
        'phase',
        knockout_matches.phase,
        'slot_number',
        knockout_matches.slot_number
      )
      ORDER BY
        knockout_matches.round_number,
        knockout_matches.slot_number,
        knockout_matches.logical_key
    ),
    '[]'::jsonb
  )
  INTO diagnostics
  FROM championship_bracket_preview_private.knockout_matches
    AS knockout_matches
  WHERE knockout_matches.job_id = _job_id
    AND NOT knockout_matches.is_bye
    AND (
      knockout_matches.scheduled_date IS NULL
      OR knockout_matches.start_at IS NULL
      OR knockout_matches.end_at IS NULL
      OR knockout_matches.court_key IS NULL
      OR knockout_matches.location_key IS NULL
    );

  IF jsonb_array_length(diagnostics) > 0 THEN
    RETURN diagnostics;
  END IF;

  SELECT diagnostics || COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'code',
        'STRUCTURAL_KNOCKOUT_SLOT_UNUSED',
        'message',
        format(
          'O slot estrutural %s não corresponde a nenhum confronto eliminatório.',
          structural_slot.structural_slot_key
        ),
        'slot_key',
        structural_slot.structural_slot_key,
        'phase',
        structural_slot.structural_phase,
        'phase_slot_number',
        structural_slot.structural_phase_slot_number
      )
      ORDER BY
        structural_slot.event_date,
        structural_slot.start_at,
        structural_slot.structural_slot_key
    ),
    '[]'::jsonb
  )
  INTO diagnostics
  FROM championship_bracket_preview_private.slots
    AS structural_slot
  LEFT JOIN championship_bracket_preview_private.knockout_matches
    AS knockout_matches
    ON knockout_matches.job_id = _job_id
    AND knockout_matches.competition_id =
      structural_slot.structural_competition_id
    AND knockout_matches.phase =
      structural_slot.structural_phase
    AND knockout_matches.slot_number =
      structural_slot.structural_phase_slot_number
  WHERE structural_slot.job_id = _job_id
    AND structural_slot.structural_phase <>
      'GROUP_STAGE'
    AND knockout_matches.id IS NULL;

  IF jsonb_array_length(diagnostics) > 0 THEN
    RETURN diagnostics;
  END IF;

  SELECT diagnostics || COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'code',
        'STRUCTURAL_KNOCKOUT_DEPENDENCY_ORDER',
        'message',
        format(
          'O confronto %s inicia antes do término de uma dependência anterior.',
          child_match.logical_key
        ),
        'logical_key',
        child_match.logical_key,
        'start_at',
        child_match.start_at,
        'dependency_end_at',
        predecessor_state.latest_end_at
      )
      ORDER BY
        child_match.round_number,
        child_match.slot_number,
        child_match.logical_key
    ),
    '[]'::jsonb
  )
  INTO diagnostics
  FROM championship_bracket_preview_private.knockout_matches
    AS child_match
  CROSS JOIN LATERAL (
    SELECT max(predecessor.end_at)
      AS latest_end_at
    FROM championship_bracket_preview_private.knockout_matches
      AS predecessor
    WHERE predecessor.id = ANY(
      child_match.predecessor_match_ids
    )
      AND NOT predecessor.is_bye
  ) AS predecessor_state
  WHERE child_match.job_id = _job_id
    AND NOT child_match.is_bye
    AND cardinality(
      child_match.predecessor_match_ids
    ) > 0
    AND predecessor_state.latest_end_at IS NOT NULL
    AND child_match.start_at <
      predecessor_state.latest_end_at;

  RETURN diagnostics;
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
  structural_diagnostics JSONB;
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

  IF job_record.algorithm_version <> 'async-exact-v8'
    OR jsonb_typeof(
      job_record.payload -> 'structural_schedule_slots'
    ) IS DISTINCT FROM 'array'
  THEN
    RETURN championship_bracket_preview_private.process_job_legacy_structural_v8(
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

  IF job_record.status = 'FINALIZING' THEN
    PERFORM championship_bracket_preview_private.assign_job_match_numbers(
      _job_id
    );

    structural_diagnostics :=
      championship_bracket_preview_private.apply_v8_structural_knockout_schedule(
        _job_id
      );

    IF jsonb_array_length(
      structural_diagnostics
    ) > 0 THEN
      UPDATE championship_bracket_preview_private.jobs
      SET
        status = 'FAILED',
        stage = 'Validação do manifesto eliminatório',
        diagnostics = structural_diagnostics,
        error_message =
          structural_diagnostics -> 0 ->> 'message',
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
      status = 'FINALIZING',
      stage = 'FINALIZING',
      progress_percentage = 98,
      heartbeat_at = now(),
      updated_at = now()
    WHERE id = _job_id;

    PERFORM championship_bracket_preview_private.finalize_job(
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
    PERFORM championship_bracket_preview_private.assign_job_match_numbers(
      _job_id
    );

    structural_diagnostics :=
      championship_bracket_preview_private.apply_v8_structural_knockout_schedule(
        _job_id
      );

    IF jsonb_array_length(
      structural_diagnostics
    ) > 0 THEN
      UPDATE championship_bracket_preview_private.jobs
      SET
        status = 'FAILED',
        stage = 'Validação do manifesto eliminatório',
        diagnostics = structural_diagnostics,
        error_message =
          structural_diagnostics -> 0 ->> 'message',
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
      status = 'FINALIZING',
      stage = 'FINALIZING',
      progress_percentage = 98,
      heartbeat_at = now(),
      updated_at = now()
    WHERE id = _job_id;

    PERFORM championship_bracket_preview_private.finalize_job(
      _job_id
    );

    RETURN jsonb_build_object(
      'continue',
      false
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
      completed_at =
        CASE
          WHEN attempt_count + 1 >= 5
            THEN COALESCE(
              completed_at,
              now()
            )
          ELSE completed_at
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