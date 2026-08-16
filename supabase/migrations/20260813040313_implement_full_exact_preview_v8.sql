ALTER TABLE championship_bracket_preview_private.jobs
ALTER COLUMN algorithm_version
SET DEFAULT 'async-exact-v8';

CREATE TABLE IF NOT EXISTS championship_bracket_preview_private.knockout_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES championship_bracket_preview_private.jobs(id) ON DELETE CASCADE,
  competition_id UUID NOT NULL REFERENCES championship_bracket_preview_private.competitions(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  slot_number INTEGER NOT NULL,
  logical_key TEXT NOT NULL,
  home_source_type TEXT NOT NULL,
  home_source_reference TEXT NOT NULL,
  away_source_type TEXT NOT NULL,
  away_source_reference TEXT NOT NULL,
  predecessor_match_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  scheduled_slot_id BIGINT NULL REFERENCES championship_bracket_preview_private.slots(id) ON DELETE SET NULL,
  scheduled_date DATE NULL,
  location_key UUID NULL,
  location_name TEXT NULL,
  court_key UUID NULL,
  court_name TEXT NULL,
  start_at TIMESTAMPTZ NULL,
  end_at TIMESTAMPTZ NULL,
  duration_minutes INTEGER NOT NULL,
  projected BOOLEAN NOT NULL DEFAULT true,
  manual_final BOOLEAN NOT NULL DEFAULT false,
  is_bye BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, logical_key),
  UNIQUE (job_id, competition_id, round_number, slot_number, phase)
);

CREATE INDEX IF NOT EXISTS championship_bracket_preview_knockout_schedule_idx ON championship_bracket_preview_private.knockout_matches (
    job_id,
    scheduled_date,
    start_at,
    location_key,
    court_key
);

CREATE TABLE IF NOT EXISTS championship_bracket_preview_private.relocation_attempt_metrics (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES championship_bracket_preview_private.jobs (id) ON DELETE CASCADE,
    match_id UUID NULL REFERENCES championship_bracket_preview_private.matches (id) ON DELETE SET NULL,
    phase TEXT NOT NULL,
    rest_gap INTEGER NOT NULL,
    search_tier TEXT NOT NULL,
    candidate_rank INTEGER NULL,
    candidate_slot_id BIGINT NULL REFERENCES championship_bracket_preview_private.slots (id) ON DELETE SET NULL,
    max_depth INTEGER NOT NULL,
    candidate_limit INTEGER NOT NULL,
    relocation_limit INTEGER NOT NULL,
    result_status TEXT NOT NULL,
    timeout_count INTEGER NOT NULL DEFAULT 0,
    relocations_used INTEGER NOT NULL DEFAULT 0,
    branches_examined INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS championship_bracket_preview_relocation_metrics_job_idx ON championship_bracket_preview_private.relocation_attempt_metrics (job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS championship_bracket_preview_private.relocation_candidate_tier_states (
    job_id UUID NOT NULL REFERENCES championship_bracket_preview_private.jobs (id) ON DELETE CASCADE,
    match_id UUID NOT NULL REFERENCES championship_bracket_preview_private.matches (id) ON DELETE CASCADE,
    phase TEXT NOT NULL,
    search_tier TEXT NOT NULL,
    slot_id BIGINT NOT NULL REFERENCES championship_bracket_preview_private.slots (id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    timeout_count INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        job_id,
        match_id,
        phase,
        search_tier,
        slot_id
    )
);

CREATE INDEX IF NOT EXISTS championship_bracket_preview_relocation_tier_states_job_idx ON championship_bracket_preview_private.relocation_candidate_tier_states (
    job_id,
    match_id,
    phase,
    search_tier
);

CREATE TABLE IF NOT EXISTS championship_bracket_preview_private.compaction_gaps (
    job_id UUID NOT NULL REFERENCES championship_bracket_preview_private.jobs (id) ON DELETE CASCADE,
    gap_key TEXT NOT NULL,
    status TEXT NOT NULL,
    timeout_count INTEGER NOT NULL DEFAULT 0,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (job_id, gap_key)
);

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_v8_sport_targets(
  _job_id UUID
)
RETURNS TABLE (
  event_date DATE,
  court_key UUID,
  court_name TEXT,
  sport_id UUID,
  sport_name TEXT,
  planned_match_count INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  SELECT
    court_dimensions.event_date,
    court_dimensions.court_key,
    court_dimensions.court_name,
    court_dimensions.sport_id,
    COALESCE(sports_table.name, court_dimensions.sport_id::text),
    target_resolution.planned_match_count
  FROM championship_bracket_preview_private.jobs jobs_table
  CROSS JOIN LATERAL (
    SELECT DISTINCT
      (day_item.value ->> 'date')::date AS event_date,
      (court_item.value ->> 'court_key')::uuid AS court_key,
      court_item.value ->> 'name' AS court_name,
      (target_item.value ->> 'sport_id')::uuid AS sport_id
    FROM jsonb_array_elements(COALESCE(jobs_table.payload -> 'schedule_days', '[]'::jsonb)) day_item(value)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(day_item.value -> 'locations', '[]'::jsonb)) location_item(value)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(location_item.value -> 'courts', '[]'::jsonb)) court_item(value)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(court_item.value -> 'sport_match_targets', '[]'::jsonb)) target_item(value)
  ) AS court_dimensions
  CROSS JOIN LATERAL championship_bracket_preview_private.resolve_slot_sport_target(
    jobs_table.payload,
    court_dimensions.event_date,
    court_dimensions.court_key,
    court_dimensions.sport_id
  ) AS target_resolution
  LEFT JOIN public.sports sports_table ON sports_table.id = court_dimensions.sport_id
  WHERE jobs_table.id = _job_id
    AND target_resolution.has_sport_targets;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_v8_target_preflight(
  _job_id UUID
)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  WITH targets AS (
    SELECT * FROM championship_bracket_preview_private.resolve_v8_sport_targets(_job_id)
  ), target_capacities AS (
    SELECT targets.*, count(slots_table.id)::integer AS available_slots
    FROM targets
    LEFT JOIN championship_bracket_preview_private.slots slots_table
      ON slots_table.job_id = _job_id
      AND slots_table.event_date = targets.event_date
      AND slots_table.court_key = targets.court_key
      AND slots_table.sport_id = targets.sport_id
    GROUP BY targets.event_date, targets.court_key, targets.court_name, targets.sport_id, targets.sport_name, targets.planned_match_count
  ), court_target_minutes AS (
    SELECT
      targets.event_date,
      targets.court_key,
      max(targets.court_name) AS court_name,
      sum(targets.planned_match_count * COALESCE(championship_sports_table.default_match_duration_minutes, sports_table.default_match_duration_minutes, 35))::integer AS requested_minutes
    FROM targets
    JOIN championship_bracket_preview_private.jobs jobs_table ON jobs_table.id = _job_id
    LEFT JOIN public.championship_sports championship_sports_table
      ON championship_sports_table.championship_id = jobs_table.championship_id
      AND championship_sports_table.sport_id = targets.sport_id
    LEFT JOIN public.sports sports_table ON sports_table.id = targets.sport_id
    GROUP BY targets.event_date, targets.court_key
  ), court_windows AS (
    SELECT
      court_dimensions.event_date,
      court_dimensions.court_key,
      COALESCE(sum(extract(epoch FROM (free_intervals.end_at - free_intervals.start_at)) / 60)::integer, 0) AS available_minutes
    FROM championship_bracket_preview_private.jobs jobs_table
    CROSS JOIN LATERAL (
      SELECT DISTINCT
        (day_item.value ->> 'date')::date AS event_date,
        (location_item.value ->> 'location_key')::uuid AS location_key,
        (court_item.value ->> 'court_key')::uuid AS court_key
      FROM jsonb_array_elements(COALESCE(jobs_table.payload -> 'schedule_days', '[]'::jsonb)) day_item(value)
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(day_item.value -> 'locations', '[]'::jsonb)) location_item(value)
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(location_item.value -> 'courts', '[]'::jsonb)) court_item(value)
      WHERE jsonb_array_length(COALESCE(court_item.value -> 'sport_match_targets', '[]'::jsonb)) > 0
    ) AS court_dimensions
    CROSS JOIN LATERAL championship_bracket_preview_private.resolve_court_free_intervals(
      jobs_table.payload,
      court_dimensions.event_date,
      court_dimensions.location_key,
      court_dimensions.court_key
    ) AS free_intervals
    WHERE jobs_table.id = _job_id
    GROUP BY court_dimensions.event_date, court_dimensions.court_key
  ), court_capacities AS (
    SELECT court_target_minutes.*, court_windows.available_minutes
    FROM court_target_minutes
    JOIN court_windows USING (event_date, court_key)
  ), global_targets AS (
    SELECT sport_id, sport_name, sum(planned_match_count)::integer AS planned_match_count
    FROM targets GROUP BY sport_id, sport_name
  ), group_matches AS (
    SELECT competitions_table.sport_id, count(*)::integer AS match_count
    FROM championship_bracket_preview_private.matches matches_table
    JOIN championship_bracket_preview_private.competitions competitions_table ON competitions_table.id = matches_table.competition_id
    WHERE matches_table.job_id = _job_id GROUP BY competitions_table.sport_id
  )
  SELECT COALESCE(jsonb_agg(diagnostic ORDER BY diagnostic ->> 'code', diagnostic ->> 'date', diagnostic ->> 'court_name'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'code', 'SPORT_MATCH_TARGET_CAPACITY_EXCEEDED',
      'message', format('%s em %s possui capacidade de %s jogos, mas o target exige %s.', court_name, event_date, available_slots, planned_match_count),
      'date', event_date, 'court_key', court_key, 'court_name', court_name,
      'sport_id', sport_id, 'sport_name', sport_name, 'target', planned_match_count, 'obtained', 0
    ) AS diagnostic
    FROM target_capacities WHERE available_slots < planned_match_count
    UNION ALL
    SELECT jsonb_build_object(
      'code', 'SPORT_MATCH_TARGET_COURT_CAPACITY_EXCEEDED',
      'message', format('%s em %s precisa de %s minutos para os targets, mas possui somente %s minutos jogáveis.', court_name, event_date, requested_minutes, available_minutes),
      'date', event_date, 'court_key', court_key, 'court_name', court_name,
      'target', requested_minutes, 'obtained', available_minutes
    )
    FROM court_capacities
    WHERE requested_minutes > available_minutes
    UNION ALL
    SELECT jsonb_build_object(
      'code', 'SPORT_MATCH_TARGET_TOTAL_MISMATCH',
      'message', format('%s possui %s partidas de grupos, mas os targets configurados somam %s.', global_targets.sport_name, COALESCE(group_matches.match_count, 0), global_targets.planned_match_count),
      'sport_id', global_targets.sport_id, 'sport_name', global_targets.sport_name,
      'target', global_targets.planned_match_count, 'obtained', COALESCE(group_matches.match_count, 0)
    )
    FROM global_targets LEFT JOIN group_matches ON group_matches.sport_id = global_targets.sport_id
    WHERE global_targets.planned_match_count <> COALESCE(group_matches.match_count, 0)
  ) diagnostics;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_v8_target_completion_diagnostics(
  _job_id UUID
)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  WITH targets AS (
    SELECT * FROM championship_bracket_preview_private.resolve_v8_sport_targets(_job_id)
  ), target_usage AS (
    SELECT targets.*, count(assignments_table.match_id)::integer AS assigned_match_count
    FROM targets
    LEFT JOIN championship_bracket_preview_private.slots slots_table
      ON slots_table.job_id = _job_id AND slots_table.event_date = targets.event_date
      AND slots_table.court_key = targets.court_key AND slots_table.sport_id = targets.sport_id
    LEFT JOIN championship_bracket_preview_private.assignments assignments_table
      ON assignments_table.job_id = _job_id AND assignments_table.slot_id = slots_table.id
    GROUP BY targets.event_date, targets.court_key, targets.court_name, targets.sport_id, targets.sport_name, targets.planned_match_count
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'code', 'SPORT_MATCH_TARGET_NOT_MET',
    'message', format('%s em %s para %s exige %s jogos, mas recebeu %s.', court_name, event_date, sport_name, planned_match_count, assigned_match_count),
    'date', event_date, 'court_key', court_key, 'court_name', court_name,
    'sport_id', sport_id, 'sport_name', sport_name, 'target', planned_match_count, 'obtained', assigned_match_count
  ) ORDER BY event_date, court_name, sport_name), '[]'::jsonb)
  FROM target_usage WHERE assigned_match_count <> planned_match_count;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.try_relocate_for_match_search(
  _job_id UUID,
  _pending_match_id UUID,
  _maximum_moves INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  pending_match_record RECORD;
  candidate_slot_record RECORD;
  tier_record RECORD;
  current_phase TEXT;
  current_rest_gap INTEGER;
  branch_status TEXT;
  attempt_started_at TIMESTAMPTZ;
  overall_deadline TIMESTAMPTZ;
  tier_deadline TIMESTAMPTZ;
  attempted_slot_ids BIGINT[] := ARRAY[]::BIGINT[];
  attempted_candidates INTEGER := 0;
  has_relaxation_opportunity BOOLEAN := false;
  tier_has_remaining BOOLEAN := false;
  candidate_limit INTEGER;
  next_timeout_count INTEGER;
  state_status TEXT;
  attempt_result_status TEXT;
BEGIN
  SELECT *
  INTO pending_match_record
  FROM championship_bracket_preview_private.matches
  WHERE job_id = _job_id
    AND id = _pending_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'assigned', false,
      'progressed', false,
      'exhausted', true,
      'attempted_candidates', 0
    );
  END IF;

  IF pending_match_record.assigned
    OR pending_match_record.relocation_search_exhausted
  THEN
    RETURN jsonb_build_object(
      'assigned', pending_match_record.assigned,
      'progressed', false,
      'exhausted', pending_match_record.relocation_search_exhausted,
      'attempted_candidates', 0
    );
  END IF;

  current_phase :=
    CASE
      WHEN pending_match_record.relocation_search_phase = 'RELAXED'
        THEN 'RELAXED'
      ELSE 'STRICT'
    END;

  current_rest_gap :=
    CASE
      WHEN current_phase = 'RELAXED' THEN 3
      ELSE 4
    END;

  overall_deadline := clock_timestamp() + interval '10 seconds';

  FOR tier_record IN
    SELECT *
    FROM (
      VALUES
        ('FAST'::text, 2, 12, 4, 400, 1),
        ('MEDIUM'::text, 6, 48, 16, 1800, 1),
        ('DEEP'::text, 12, 120, 40, 7000, 3)
    ) AS tiers(
      search_tier,
      max_depth,
      candidate_limit,
      relocation_limit,
      budget_ms,
      retry_limit
    )
  LOOP
    IF clock_timestamp() >= overall_deadline THEN
      RETURN jsonb_build_object(
        'assigned', false,
        'progressed', attempted_candidates > 0,
        'exhausted', false,
        'attempted_candidates', attempted_candidates,
        'search_tier', tier_record.search_tier,
        'search_phase', current_phase,
        'rest_gap', current_rest_gap
      );
    END IF;

    candidate_limit := tier_record.candidate_limit;
    attempted_slot_ids := ARRAY[]::BIGINT[];

    tier_deadline := LEAST(
      overall_deadline,
      clock_timestamp()
        + make_interval(
            secs => tier_record.budget_ms::numeric / 1000
          )
    );

    LOOP
      EXIT WHEN clock_timestamp() >= tier_deadline;

      SELECT
        candidate_slots.*,
        COALESCE(candidate_states.timeout_count, 0) AS timeout_count
      INTO candidate_slot_record
      FROM championship_bracket_preview_private.resolve_match_relocation_candidate_slots_ranked_v7(
        _job_id,
        _pending_match_id,
        NULL,
        ARRAY[]::BIGINT[],
        0,
        candidate_limit,
        current_rest_gap
      ) AS candidate_slots
      LEFT JOIN championship_bracket_preview_private.relocation_candidate_tier_states
        AS candidate_states
        ON candidate_states.job_id = _job_id
        AND candidate_states.match_id = _pending_match_id
        AND candidate_states.phase = current_phase
        AND candidate_states.search_tier = tier_record.search_tier
        AND candidate_states.slot_id = candidate_slots.slot_id
      WHERE (
          candidate_states.status IS NULL
          OR (
            candidate_states.status =
              tier_record.search_tier || '_TIMEOUT'
            AND candidate_states.timeout_count < tier_record.retry_limit
          )
        )
        AND NOT candidate_slots.slot_id = ANY(attempted_slot_ids)
      ORDER BY candidate_slots.candidate_rank
      LIMIT 1;

      EXIT WHEN NOT FOUND;

      attempted_slot_ids :=
        array_append(
          attempted_slot_ids,
          candidate_slot_record.slot_id
        );

      attempted_candidates := attempted_candidates + 1;
      attempt_started_at := clock_timestamp();

      branch_status :=
        championship_bracket_preview_private.try_place_match_backtracking_status(
          _job_id,
          _pending_match_id,
          candidate_slot_record.slot_id,
          ARRAY[]::UUID[],
          ARRAY[]::BIGINT[],
          0,
          tier_record.max_depth,
          tier_record.candidate_limit,
          tier_record.relocation_limit,
          CASE
            WHEN current_phase = 'RELAXED'
              THEN _pending_match_id
            ELSE NULL
          END,
          3,
          tier_deadline
        );

      attempt_result_status :=
        CASE
          WHEN branch_status = 'SUCCESS'
            THEN 'SUCCESS'
          WHEN branch_status = 'TIMEOUT'
            THEN tier_record.search_tier || '_TIMEOUT'
          ELSE tier_record.search_tier || '_DEAD_END'
        END;

      INSERT INTO championship_bracket_preview_private.relocation_attempt_metrics (
        job_id,
        match_id,
        phase,
        rest_gap,
        search_tier,
        candidate_rank,
        candidate_slot_id,
        max_depth,
        candidate_limit,
        relocation_limit,
        result_status,
        timeout_count,
        relocations_used,
        branches_examined,
        duration_ms
      )
      VALUES (
        _job_id,
        _pending_match_id,
        current_phase,
        current_rest_gap,
        tier_record.search_tier,
        candidate_slot_record.candidate_rank,
        candidate_slot_record.slot_id,
        tier_record.max_depth,
        tier_record.candidate_limit,
        tier_record.relocation_limit,
        attempt_result_status,
        candidate_slot_record.timeout_count,
        0,
        0,
        (
          extract(
            epoch FROM clock_timestamp() - attempt_started_at
          ) * 1000
        )::integer
      );

      IF branch_status = 'SUCCESS' THEN
        UPDATE championship_bracket_preview_private.matches
        SET
          relaxed_rest_gap_applied = current_phase = 'RELAXED',
          applied_rest_gap = current_rest_gap,
          relocation_candidate_cursor = 0,
          relocation_search_exhausted = false,
          relocation_attempt_count = 0,
          relocation_search_phase = 'STRICT'
        WHERE job_id = _job_id
          AND id = _pending_match_id;

        DELETE FROM championship_bracket_preview_private.relocation_candidate_states
          AS states
        WHERE states.job_id = _job_id
          AND EXISTS (
            SELECT 1
            FROM championship_bracket_preview_private.assignments
              AS changed_assignments
            WHERE changed_assignments.job_id = _job_id
              AND (
                states.match_id = changed_assignments.match_id
                OR states.slot_id = changed_assignments.slot_id
              )
          );

        DELETE FROM championship_bracket_preview_private.relocation_candidate_tier_states
          AS states
        WHERE states.job_id = _job_id
          AND EXISTS (
            SELECT 1
            FROM championship_bracket_preview_private.assignments
              AS changed_assignments
            WHERE changed_assignments.job_id = _job_id
              AND (
                states.match_id = changed_assignments.match_id
                OR states.slot_id = changed_assignments.slot_id
              )
          );

        RETURN jsonb_build_object(
          'assigned', true,
          'progressed', true,
          'exhausted', false,
          'attempted_candidates', attempted_candidates,
          'search_tier', tier_record.search_tier,
          'search_phase', current_phase,
          'rest_gap', current_rest_gap
        );
      END IF;

      IF branch_status = 'TIMEOUT' THEN
        next_timeout_count :=
          candidate_slot_record.timeout_count + 1;

        state_status :=
          CASE
            WHEN next_timeout_count >= tier_record.retry_limit
              THEN tier_record.search_tier || '_SEARCH_LIMIT'
            ELSE tier_record.search_tier || '_TIMEOUT'
          END;
      ELSE
        next_timeout_count :=
          candidate_slot_record.timeout_count;

        state_status :=
          tier_record.search_tier || '_DEAD_END';
      END IF;

      INSERT INTO championship_bracket_preview_private.relocation_candidate_tier_states (
        job_id,
        match_id,
        phase,
        search_tier,
        slot_id,
        status,
        attempt_count,
        timeout_count,
        last_attempt_at
      )
      VALUES (
        _job_id,
        _pending_match_id,
        current_phase,
        tier_record.search_tier,
        candidate_slot_record.slot_id,
        state_status,
        1,
        next_timeout_count,
        now()
      )
      ON CONFLICT (
        job_id,
        match_id,
        phase,
        search_tier,
        slot_id
      )
      DO UPDATE SET
        status = EXCLUDED.status,
        attempt_count =
          championship_bracket_preview_private
            .relocation_candidate_tier_states
            .attempt_count + 1,
        timeout_count = EXCLUDED.timeout_count,
        last_attempt_at = now();
    END LOOP;

    SELECT EXISTS (
      SELECT 1
      FROM championship_bracket_preview_private.resolve_match_relocation_candidate_slots_ranked_v7(
        _job_id,
        _pending_match_id,
        NULL,
        ARRAY[]::BIGINT[],
        0,
        candidate_limit,
        current_rest_gap
      ) AS candidate_slots
      LEFT JOIN championship_bracket_preview_private.relocation_candidate_tier_states
        AS candidate_states
        ON candidate_states.job_id = _job_id
        AND candidate_states.match_id = _pending_match_id
        AND candidate_states.phase = current_phase
        AND candidate_states.search_tier = tier_record.search_tier
        AND candidate_states.slot_id = candidate_slots.slot_id
      WHERE candidate_states.status IS NULL
        OR (
          candidate_states.status =
            tier_record.search_tier || '_TIMEOUT'
          AND candidate_states.timeout_count < tier_record.retry_limit
        )
    )
    INTO tier_has_remaining;

    IF tier_has_remaining THEN
      RETURN jsonb_build_object(
        'assigned', false,
        'progressed', attempted_candidates > 0,
        'exhausted', false,
        'attempted_candidates', attempted_candidates,
        'search_tier', tier_record.search_tier,
        'search_phase', current_phase,
        'rest_gap', current_rest_gap
      );
    END IF;
  END LOOP;

  IF current_phase = 'STRICT' THEN
    SELECT EXISTS (
      SELECT 1
      FROM championship_bracket_preview_private.resolve_match_relocation_candidate_slots(
        _job_id,
        _pending_match_id,
        NULL,
        ARRAY[]::BIGINT[],
        1000000
      ) AS candidate_slot
      WHERE EXISTS (
        SELECT 1
        FROM championship_bracket_preview_private.assignments
          AS assignments_table
        WHERE assignments_table.job_id = _job_id
          AND championship_bracket_preview_private.is_match_rest_conflict_with_gap(
            _job_id,
            _pending_match_id,
            candidate_slot.slot_id,
            assignments_table.match_id,
            4
          )
          AND NOT championship_bracket_preview_private.is_match_rest_conflict_with_gap(
            _job_id,
            _pending_match_id,
            candidate_slot.slot_id,
            assignments_table.match_id,
            3
          )
      )
    )
    INTO has_relaxation_opportunity;

    IF has_relaxation_opportunity THEN
      UPDATE championship_bracket_preview_private.matches
      SET
        relocation_search_phase = 'RELAXED',
        relocation_candidate_cursor = 0
      WHERE job_id = _job_id
        AND id = _pending_match_id;

      RETURN jsonb_build_object(
        'assigned', false,
        'progressed', attempted_candidates > 0,
        'exhausted', false,
        'phase_changed', true,
        'search_phase', 'RELAXED',
        'rest_gap', 3
      );
    END IF;
  END IF;

  UPDATE championship_bracket_preview_private.matches
  SET relocation_search_exhausted = true
  WHERE job_id = _job_id
    AND id = _pending_match_id
    AND assigned = false;

  RETURN jsonb_build_object(
    'assigned', false,
    'progressed', attempted_candidates > 0,
    'exhausted', true,
    'attempted_candidates', attempted_candidates,
    'search_phase', current_phase,
    'rest_gap', current_rest_gap
  );
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_v8_internal_empty_diagnostics(
  _job_id UUID
)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  WITH scheduled AS (
    SELECT
      assignments_table.match_id::text AS match_key,
      slots_table.event_date,
      slots_table.location_key,
      slots_table.court_key,
      slots_table.start_at,
      slots_table.end_at
    FROM championship_bracket_preview_private.assignments assignments_table
    JOIN championship_bracket_preview_private.slots slots_table ON slots_table.id = assignments_table.slot_id
    WHERE assignments_table.job_id = _job_id
    UNION ALL
    SELECT
      knockout_matches.id::text AS match_key,
      knockout_matches.scheduled_date,
      knockout_matches.location_key,
      knockout_matches.court_key,
      knockout_matches.start_at,
      knockout_matches.end_at
    FROM championship_bracket_preview_private.knockout_matches knockout_matches
    WHERE knockout_matches.job_id = _job_id
      AND NOT knockout_matches.is_bye
      AND knockout_matches.scheduled_date IS NOT NULL
      AND knockout_matches.location_key IS NOT NULL
      AND knockout_matches.court_key IS NOT NULL
      AND knockout_matches.start_at IS NOT NULL
      AND knockout_matches.end_at IS NOT NULL
  ), assigned AS (
    SELECT
      scheduled.*,
      lead(scheduled.start_at) OVER (
        PARTITION BY scheduled.event_date, scheduled.location_key, scheduled.court_key
        ORDER BY scheduled.start_at, scheduled.end_at, scheduled.match_key
      ) AS next_start_at
    FROM scheduled
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'code', 'INTERNAL_EMPTY_WINDOW',
    'message', format('A quadra %s possui uma janela interna vazia entre %s e %s.', assigned.court_key, assigned.end_at, assigned.next_start_at),
    'date', assigned.event_date,
    'court_key', assigned.court_key,
    'start_at', assigned.end_at,
    'end_at', assigned.next_start_at
  ) ORDER BY assigned.event_date, assigned.court_key, assigned.end_at), '[]'::jsonb)
  FROM assigned
  WHERE assigned.next_start_at > assigned.end_at
    AND EXISTS (
      SELECT 1
      FROM championship_bracket_preview_private.jobs jobs_table
      CROSS JOIN LATERAL championship_bracket_preview_private.resolve_court_free_intervals(
        jobs_table.payload,
        assigned.event_date,
        assigned.location_key,
        assigned.court_key
      ) AS free_intervals
      WHERE jobs_table.id = _job_id
        AND free_intervals.start_at <= assigned.end_at
        AND free_intervals.end_at >= assigned.next_start_at
    )
    ;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.compact_v8_schedule(
  _job_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  gap_record RECORD;
  candidate_slot_record RECORD;
  tier_record RECORD;
  branch_status TEXT;
  attempt_started_at TIMESTAMPTZ;
  moved BOOLEAN;
  passes INTEGER := 0;
BEGIN
  WHILE passes < 4 LOOP
    moved := false;
    passes := passes + 1;
    FOR gap_record IN
      WITH assigned AS (
        SELECT
          assignments_table.match_id,
          slots_table.event_date,
          slots_table.location_key,
          slots_table.court_key,
          slots_table.start_at,
          slots_table.end_at,
          lead(assignments_table.match_id) OVER physical_order AS next_match_id,
          lead(slots_table.start_at) OVER physical_order AS next_start_at
        FROM championship_bracket_preview_private.assignments assignments_table
        JOIN championship_bracket_preview_private.slots slots_table ON slots_table.id = assignments_table.slot_id
        WHERE assignments_table.job_id = _job_id
        WINDOW physical_order AS (
          PARTITION BY slots_table.event_date, slots_table.location_key, slots_table.court_key
          ORDER BY slots_table.start_at, slots_table.end_at, assignments_table.match_id
        )
      )
      SELECT *
      FROM assigned
      WHERE next_start_at > end_at
        AND EXISTS (
          SELECT 1
          FROM championship_bracket_preview_private.assignments next_assignment
          WHERE next_assignment.job_id = _job_id
            AND next_assignment.match_id = assigned.next_match_id
        )
    LOOP
      SELECT candidate_slots.* INTO candidate_slot_record
      FROM championship_bracket_preview_private.slots candidate_slots
      JOIN championship_bracket_preview_private.matches next_match ON next_match.id = gap_record.next_match_id
      JOIN championship_bracket_preview_private.competitions next_competition ON next_competition.id = next_match.competition_id
      WHERE candidate_slots.job_id = _job_id
        AND candidate_slots.event_date = gap_record.event_date
        AND candidate_slots.location_key = gap_record.location_key
        AND candidate_slots.court_key = gap_record.court_key
        AND candidate_slots.sport_id = next_competition.sport_id
        AND candidate_slots.start_at >= gap_record.end_at
        AND candidate_slots.end_at <= gap_record.next_start_at
        AND NOT EXISTS (
          SELECT 1 FROM championship_bracket_preview_private.assignments occupied
          WHERE occupied.job_id = _job_id AND occupied.slot_id = candidate_slots.id
        )
      ORDER BY candidate_slots.start_at, candidate_slots.id
      LIMIT 1;

      IF candidate_slot_record.id IS NULL THEN
        CONTINUE;
      END IF;

      IF championship_bracket_preview_private.is_match_slot_eligible_with_rest_gap(
        _job_id, gap_record.next_match_id, candidate_slot_record.id, 4
      ) THEN
        UPDATE championship_bracket_preview_private.assignments
        SET slot_id = candidate_slot_record.id
        WHERE job_id = _job_id AND match_id = gap_record.next_match_id;
        moved := true;
        EXIT;
      END IF;

      FOR tier_record IN
        SELECT *
        FROM (VALUES
          ('FAST'::text, 2, 12, 4, 400),
          ('MEDIUM'::text, 6, 48, 16, 1800),
          ('DEEP'::text, 12, 120, 40, 9000)
        ) AS tiers(search_tier, max_depth, candidate_limit, relocation_limit, budget_ms)
      LOOP
        attempt_started_at := clock_timestamp();
        branch_status := championship_bracket_preview_private.try_place_match_backtracking_status(
          _job_id, gap_record.next_match_id, candidate_slot_record.id,
          ARRAY[]::uuid[], ARRAY[]::bigint[], 0,
          tier_record.max_depth, tier_record.candidate_limit, tier_record.relocation_limit,
          NULL, 3, clock_timestamp() + make_interval(secs => tier_record.budget_ms::numeric / 1000)
        );
        INSERT INTO championship_bracket_preview_private.relocation_attempt_metrics(
          job_id, match_id, phase, rest_gap, search_tier, candidate_rank,
          candidate_slot_id, max_depth, candidate_limit, relocation_limit,
          result_status, timeout_count, relocations_used, branches_examined, duration_ms
        ) VALUES (
          _job_id, gap_record.next_match_id, 'COMPACTION', 4, tier_record.search_tier,
          NULL, candidate_slot_record.id, tier_record.max_depth,
          tier_record.candidate_limit, tier_record.relocation_limit,
          CASE WHEN branch_status = 'SUCCESS' THEN 'SUCCESS' ELSE format('%s_%s', tier_record.search_tier, CASE WHEN branch_status = 'TIMEOUT' THEN 'TIMEOUT' ELSE 'DEAD_END' END) END,
          CASE WHEN branch_status = 'TIMEOUT' THEN 1 ELSE 0 END, 0, 0,
          (extract(epoch FROM clock_timestamp() - attempt_started_at) * 1000)::integer
        );
        EXIT WHEN branch_status = 'SUCCESS';
      END LOOP;
      IF branch_status = 'SUCCESS' THEN
        moved := true;
        EXIT;
      END IF;
    END LOOP;
    EXIT WHEN NOT moved;
  END LOOP;
  RETURN championship_bracket_preview_private.resolve_v8_internal_empty_diagnostics(_job_id);
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_v8_knockout_seed_source(
  _groups_count INTEGER,
  _qualifiers_per_group INTEGER,
  _include_best_second_pool BOOLEAN,
  _use_cross_groups_pairing BOOLEAN,
  _seed_number INTEGER,
  _qualified_count INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog
AS $function$
DECLARE
  group_number_value INTEGER;
  position_value INTEGER;
BEGIN
  IF _seed_number > _qualified_count THEN
    RETURN jsonb_build_object(
      'type', 'BYE',
      'reference', format('BYE_SEED_%s', _seed_number)
    );
  END IF;

  IF _use_cross_groups_pairing THEN
    group_number_value := ((_seed_number - 1) / 2) + 1;
    position_value := ((_seed_number - 1) % 2) + 1;

    RETURN jsonb_build_object(
      'type', 'GROUP_POSITION',
      'reference', format(
        'GROUP_%s_POSITION_%s',
        group_number_value,
        position_value
      )
    );
  END IF;

  IF _seed_number <= _groups_count * _qualifiers_per_group THEN
    group_number_value :=
      ((_seed_number - 1) % _groups_count) + 1;

    position_value :=
      ((_seed_number - 1) / _groups_count) + 1;

    RETURN jsonb_build_object(
      'type', 'GROUP_POSITION',
      'reference', format(
        'GROUP_%s_POSITION_%s',
        group_number_value,
        position_value
      )
    );
  END IF;

  IF _qualifiers_per_group = 1
    AND _include_best_second_pool
  THEN
    RETURN jsonb_build_object(
      'type', 'BEST_SECOND_POOL',
      'reference', format(
        'BEST_SECOND_POOL_POSITION_%s',
        _seed_number - _groups_count
      )
    );
  END IF;

  IF _qualifiers_per_group = 2 THEN
    RETURN jsonb_build_object(
      'type', 'BEST_THIRD_POOL',
      'reference', format(
        'BEST_THIRD_POOL_POSITION_%s',
        _seed_number - (_groups_count * 2)
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'type', 'BYE',
    'reference', format('BYE_SEED_%s', _seed_number)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.create_v8_knockout_matches(_job_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE competition_record RECORD; bracket_size INTEGER; direct_qualified_count INTEGER; qualified_count INTEGER; total_rounds INTEGER; round_number_value INTEGER; slot_number_value INTEGER; round_match_count INTEGER; phase_name TEXT; predecessor_ids UUID[]; is_bye_value BOOLEAN; home_seed INTEGER; away_seed INTEGER; home_source JSONB; away_source JSONB; should_include_best_second_placed_teams BOOLEAN; should_use_cross_groups_pairing BOOLEAN;
BEGIN
  DELETE FROM championship_bracket_preview_private.knockout_matches WHERE job_id = _job_id;
  FOR competition_record IN
    SELECT competitions_table.*, COALESCE(championship_sports_table.default_match_duration_minutes, 35)::integer AS duration_minutes,
      sports_table.code AS sport_code
    FROM championship_bracket_preview_private.competitions competitions_table
    LEFT JOIN public.championship_sports championship_sports_table ON championship_sports_table.championship_id = (SELECT championship_id FROM championship_bracket_preview_private.jobs WHERE id = _job_id) AND championship_sports_table.sport_id = competitions_table.sport_id
    LEFT JOIN public.sports sports_table ON sports_table.id = competitions_table.sport_id
    WHERE competitions_table.job_id = _job_id ORDER BY competitions_table.position, competitions_table.competition_key
  LOOP
    direct_qualified_count := competition_record.groups_count * competition_record.qualifiers_per_group;
    bracket_size := 1;
    IF competition_record.qualifiers_per_group = 1 AND competition_record.best_second THEN
      WHILE bracket_size <= direct_qualified_count LOOP bracket_size := bracket_size * 2; END LOOP;
    ELSE
      WHILE bracket_size < direct_qualified_count LOOP bracket_size := bracket_size * 2; END LOOP;
    END IF;
    should_include_best_second_placed_teams :=
  competition_record.qualifiers_per_group = 1
  AND bracket_size > direct_qualified_count;
    qualified_count := CASE
      WHEN competition_record.qualifiers_per_group IN (1, 2)
        AND bracket_size > direct_qualified_count
        THEN bracket_size
      ELSE direct_qualified_count
    END;
    IF bracket_size < 2 OR qualified_count < 2 THEN CONTINUE; END IF;
    should_use_cross_groups_pairing := competition_record.pairing_mode = 'FUTEBOL_SOCIETY_FEM_ACCESS_CROSS_GROUPS'
      AND competition_record.sport_code = 'FUTEBOL_SOCIETY'
      AND competition_record.naipe = 'FEMININO'
      AND competition_record.division = 'DIVISAO_ACESSO'
      AND competition_record.groups_count = 2
      AND competition_record.qualifiers_per_group = 1
      AND should_include_best_second_placed_teams
      AND bracket_size = 4;
    total_rounds := 0; WHILE power(2,total_rounds)::integer < bracket_size LOOP total_rounds := total_rounds + 1; END LOOP;
    FOR round_number_value IN 1..total_rounds LOOP
      round_match_count := power(2,total_rounds-round_number_value)::integer;
      FOR slot_number_value IN 1..round_match_count LOOP
        SELECT COALESCE(array_agg(previous_matches.id ORDER BY previous_matches.slot_number),ARRAY[]::uuid[])
        INTO predecessor_ids FROM championship_bracket_preview_private.knockout_matches previous_matches
        WHERE previous_matches.job_id = _job_id AND previous_matches.competition_id = competition_record.id
          AND previous_matches.round_number = round_number_value - 1
          AND previous_matches.slot_number IN ((slot_number_value*2)-1,slot_number_value*2) AND previous_matches.phase <> 'THIRD_PLACE';
        home_seed := slot_number_value;
        away_seed := bracket_size + 1 - slot_number_value;
        home_source := championship_bracket_preview_private.resolve_v8_knockout_seed_source(
          competition_record.groups_count, competition_record.qualifiers_per_group,
          should_include_best_second_placed_teams, should_use_cross_groups_pairing,
          home_seed, qualified_count
        );
        away_source := championship_bracket_preview_private.resolve_v8_knockout_seed_source(
          competition_record.groups_count, competition_record.qualifiers_per_group,
          should_include_best_second_placed_teams, should_use_cross_groups_pairing,
          away_seed, qualified_count
        );
        is_bye_value := round_number_value = 1
          AND ((home_source ->> 'type' = 'BYE') <> (away_source ->> 'type' = 'BYE'));
        phase_name := CASE WHEN round_number_value = total_rounds THEN 'FINAL' WHEN round_number_value = total_rounds - 1 THEN 'SEMIFINAL' WHEN round_match_count = 4 THEN 'QUARTERFINAL' WHEN round_match_count = 8 THEN 'ROUND_OF_16' WHEN round_match_count = 16 THEN 'ROUND_OF_32' ELSE 'KNOCKOUT' END;
        INSERT INTO championship_bracket_preview_private.knockout_matches(
          job_id,competition_id,phase,round_number,slot_number,logical_key,home_source_type,home_source_reference,away_source_type,away_source_reference,predecessor_match_ids,duration_minutes,is_bye
        ) VALUES (
          _job_id,competition_record.id,phase_name,round_number_value,slot_number_value,
          format('%s::%s::%s',competition_record.competition_key,phase_name,slot_number_value),
          CASE WHEN round_number_value=1 THEN home_source ->> 'type' ELSE 'WINNER_OF_MATCH' END,
          CASE WHEN round_number_value=1 THEN home_source ->> 'reference' ELSE format('WINNER_OF_%s',predecessor_ids[1]) END,
          CASE WHEN round_number_value=1 THEN away_source ->> 'type' ELSE 'WINNER_OF_MATCH' END,
          CASE WHEN round_number_value=1 THEN away_source ->> 'reference' ELSE format('WINNER_OF_%s',predecessor_ids[2]) END,
          predecessor_ids,competition_record.duration_minutes,is_bye_value
        );
      END LOOP;
    END LOOP;
    IF competition_record.third_place_mode = 'MATCH' AND total_rounds > 1 THEN
      SELECT array_agg(semifinals.id ORDER BY semifinals.slot_number) INTO predecessor_ids
      FROM championship_bracket_preview_private.knockout_matches semifinals
      WHERE semifinals.job_id=_job_id AND semifinals.competition_id=competition_record.id AND semifinals.round_number=total_rounds-1;
      INSERT INTO championship_bracket_preview_private.knockout_matches(job_id,competition_id,phase,round_number,slot_number,logical_key,home_source_type,home_source_reference,away_source_type,away_source_reference,predecessor_match_ids,duration_minutes)
      VALUES (_job_id,competition_record.id,'THIRD_PLACE',total_rounds,2,format('%s::THIRD_PLACE::1',competition_record.competition_key),'LOSER_OF_MATCH',format('LOSER_OF_%s',predecessor_ids[1]),'LOSER_OF_MATCH',format('LOSER_OF_%s',predecessor_ids[2]),predecessor_ids,competition_record.duration_minutes);
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_v8_knockout_court_windows(
  _job_id UUID,
  _sport_id UUID
)
RETURNS TABLE (
  event_date DATE,
  location_key UUID,
  location_name TEXT,
  location_position INTEGER,
  court_key UUID,
  court_name TEXT,
  court_position INTEGER,
  free_start_at TIMESTAMPTZ,
  free_end_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  SELECT
    courts.event_date, courts.location_key, courts.location_name, courts.location_position,
    courts.court_key, courts.court_name, courts.court_position,
    free_intervals.start_at, free_intervals.end_at
  FROM championship_bracket_preview_private.jobs jobs_table
  CROSS JOIN LATERAL (
    SELECT DISTINCT
      (day_item.value ->> 'date')::date AS event_date,
      (location_item.value ->> 'location_key')::uuid AS location_key,
      location_item.value ->> 'name' AS location_name,
      COALESCE((location_item.value ->> 'position')::integer, location_item.ordinality::integer) AS location_position,
      (court_item.value ->> 'court_key')::uuid AS court_key,
      court_item.value ->> 'name' AS court_name,
      COALESCE((court_item.value ->> 'position')::integer, court_item.ordinality::integer) AS court_position
    FROM jsonb_array_elements(COALESCE(jobs_table.payload -> 'schedule_days', '[]'::jsonb)) WITH ORDINALITY day_item(value, ordinality)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(day_item.value -> 'locations', '[]'::jsonb)) WITH ORDINALITY location_item(value, ordinality)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(location_item.value -> 'courts', '[]'::jsonb)) WITH ORDINALITY court_item(value, ordinality)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(court_item.value -> 'sport_ids', '[]'::jsonb)) sport_item(value)
    WHERE trim(both '"' from sport_item.value::text)::uuid = _sport_id
  ) courts
  CROSS JOIN LATERAL championship_bracket_preview_private.resolve_court_free_intervals(
    jobs_table.payload, courts.event_date, courts.location_key, courts.court_key
  ) free_intervals
  WHERE jobs_table.id = _job_id;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.schedule_v8_knockout_matches(_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  knockout_record RECORD;
  block_value JSONB;
  court_window RECORD;
  candidate_start_at TIMESTAMPTZ;
  candidate_end_at TIMESTAMPTZ;
  candidate_conflict_end_at TIMESTAMPTZ;
  dependency_ready_at TIMESTAMPTZ;
  group_ready_at TIMESTAMPTZ;
  sequence_position INTEGER;
  duration_value INTEGER;
  scheduled_count INTEGER;
  expected_count INTEGER;
  diagnostics JSONB := '[]'::jsonb;
BEGIN
  UPDATE championship_bracket_preview_private.knockout_matches knockout_matches
  SET start_at = group_ready.ready_at, end_at = group_ready.ready_at
  FROM (
    SELECT matches_table.competition_id, max(slots_table.end_at) AS ready_at
    FROM championship_bracket_preview_private.assignments assignments_table
    JOIN championship_bracket_preview_private.matches matches_table ON matches_table.id = assignments_table.match_id
    JOIN championship_bracket_preview_private.slots slots_table ON slots_table.id = assignments_table.slot_id
    WHERE assignments_table.job_id = _job_id
    GROUP BY matches_table.competition_id
  ) group_ready
  WHERE knockout_matches.job_id = _job_id
    AND knockout_matches.is_bye
    AND knockout_matches.competition_id = group_ready.competition_id;

  FOR knockout_record IN
    SELECT knockout_matches.*, competitions.sport_id, competitions.naipe, competitions.division, competitions.competition_key, jobs_table.payload
    FROM championship_bracket_preview_private.knockout_matches knockout_matches
    JOIN championship_bracket_preview_private.competitions competitions ON competitions.id = knockout_matches.competition_id
    JOIN championship_bracket_preview_private.jobs jobs_table ON jobs_table.id = knockout_matches.job_id
    WHERE knockout_matches.job_id = _job_id AND NOT knockout_matches.is_bye
    ORDER BY knockout_matches.round_number,
      CASE WHEN knockout_matches.phase = 'THIRD_PLACE' THEN 1 ELSE 0 END,
      knockout_matches.slot_number, knockout_matches.logical_key
  LOOP
    IF knockout_record.round_number = 1 THEN
      SELECT max(slots_table.end_at) INTO group_ready_at
      FROM championship_bracket_preview_private.assignments assignments_table
      JOIN championship_bracket_preview_private.matches group_matches ON group_matches.id = assignments_table.match_id
      JOIN championship_bracket_preview_private.slots slots_table ON slots_table.id = assignments_table.slot_id
      WHERE assignments_table.job_id = _job_id AND group_matches.competition_id = knockout_record.competition_id;
      dependency_ready_at := group_ready_at;
    ELSE
      SELECT max(predecessors.end_at) INTO dependency_ready_at
      FROM championship_bracket_preview_private.knockout_matches predecessors
      WHERE predecessors.id = ANY(knockout_record.predecessor_match_ids);
      IF (SELECT count(*) FROM championship_bracket_preview_private.knockout_matches predecessors WHERE predecessors.id = ANY(knockout_record.predecessor_match_ids) AND predecessors.end_at IS NOT NULL) <> cardinality(knockout_record.predecessor_match_ids) THEN
        dependency_ready_at := NULL;
      END IF;
    END IF;

    IF dependency_ready_at IS NULL THEN
      diagnostics := diagnostics || jsonb_build_array(jsonb_build_object(
        'code', 'KNOCKOUT_DEPENDENCY_NOT_SCHEDULED',
        'message', format('As dependências de %s não possuem término programado.', knockout_record.logical_key),
        'logical_key', knockout_record.logical_key
      ));
      CONTINUE;
    END IF;

    block_value := NULL;
    IF knockout_record.phase = 'FINAL' THEN
      SELECT block_item.value INTO block_value
      FROM jsonb_array_elements(COALESCE(knockout_record.payload -> 'knockout_program_blocks', '[]'::jsonb)) WITH ORDINALITY block_item(value, ordinality)
      WHERE block_item.value ->> 'phase' = 'FINAL'
        AND block_item.value ->> 'sport_id' = knockout_record.sport_id::text
        AND (
          COALESCE(NULLIF(block_item.value ->> 'division_scope', ''), 'ALL') = 'ALL'
          OR COALESCE(NULLIF(block_item.value ->> 'division_scope', ''), 'ALL') = knockout_record.division::text
        )
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(block_item.value -> 'naipe_sequence', '[]'::jsonb)) seq(value)
          WHERE seq.value = knockout_record.naipe::text
        )
      ORDER BY COALESCE(NULLIF(block_item.value ->> 'display_order', '')::integer, block_item.ordinality::integer)
      LIMIT 1;
    END IF;

    IF block_value IS NOT NULL THEN
      SELECT seq.ordinality::integer INTO sequence_position
      FROM jsonb_array_elements_text(COALESCE(block_value -> 'naipe_sequence', '[]'::jsonb)) WITH ORDINALITY seq(value, ordinality)
      WHERE seq.value = knockout_record.naipe::text;
      duration_value := COALESCE(NULLIF(block_value ->> 'match_duration_minutes_override', '')::integer, knockout_record.duration_minutes);
      candidate_start_at := public.combine_bracket_schedule_timestamp((block_value ->> 'date')::date, (block_value ->> 'start_time')::time)
        + make_interval(mins => (sequence_position - 1) * duration_value);
      candidate_end_at := candidate_start_at + make_interval(mins => duration_value);
      IF sequence_position IS NULL
        OR duration_value < 1
        OR candidate_end_at > public.combine_bracket_schedule_timestamp((block_value ->> 'date')::date, (block_value ->> 'end_time')::time)
      THEN
        diagnostics := diagnostics || jsonb_build_array(jsonb_build_object('code', 'MANUAL_FINAL_CAPACITY_EXCEEDED', 'message', format('O bloco manual não comporta a final %s.', knockout_record.logical_key), 'logical_key', knockout_record.logical_key));
        CONTINUE;
      END IF;
      IF candidate_start_at < dependency_ready_at THEN
        diagnostics := diagnostics || jsonb_build_array(jsonb_build_object('code', 'MANUAL_FINAL_DEPENDENCY_CONFLICT', 'message', format('A final manual %s inicia antes das semifinal(is).', knockout_record.logical_key), 'logical_key', knockout_record.logical_key));
        CONTINUE;
      END IF;
      IF EXISTS (
        SELECT 1 FROM championship_bracket_preview_private.knockout_matches occupied
        WHERE occupied.job_id = _job_id AND occupied.id <> knockout_record.id
          AND occupied.location_key = (block_value ->> 'location_key')::uuid
          AND occupied.court_key = (block_value ->> 'court_key')::uuid
          AND occupied.start_at < candidate_end_at AND occupied.end_at > candidate_start_at
      ) THEN
        diagnostics := diagnostics || jsonb_build_array(jsonb_build_object('code', 'MANUAL_FINAL_OVERLAP', 'message', format('O bloco manual conflita com outra partida em %s.', knockout_record.logical_key), 'logical_key', knockout_record.logical_key));
        CONTINUE;
      END IF;
      UPDATE championship_bracket_preview_private.knockout_matches SET
        scheduled_date = (block_value ->> 'date')::date,
        location_key = (block_value ->> 'location_key')::uuid,
        location_name = block_value ->> 'location_name',
        court_key = (block_value ->> 'court_key')::uuid,
        court_name = block_value ->> 'court_name',
        start_at = candidate_start_at, end_at = candidate_end_at,
        duration_minutes = duration_value, manual_final = true
      WHERE id = knockout_record.id;
      CONTINUE;
    END IF;

    candidate_start_at := NULL;
    candidate_end_at := NULL;
    FOR court_window IN
      SELECT court_windows.*, availability_windows.window_start_at, availability_windows.window_end_at
      FROM championship_bracket_preview_private.resolve_v8_knockout_court_windows(_job_id, knockout_record.sport_id) court_windows
      CROSS JOIN LATERAL public.resolve_championship_bracket_competition_schedule_windows(
        knockout_record.payload, knockout_record.competition_key, court_windows.event_date
      ) availability_windows
      ORDER BY court_windows.event_date, court_windows.location_position, court_windows.court_position, availability_windows.window_start_at
    LOOP
      candidate_conflict_end_at := GREATEST(court_window.free_start_at, court_window.window_start_at, dependency_ready_at);
      LOOP
        EXIT WHEN candidate_conflict_end_at + make_interval(mins => knockout_record.duration_minutes)
          > LEAST(court_window.free_end_at, court_window.window_end_at);
        SELECT max(conflicts.end_at) INTO candidate_end_at
        FROM (
          SELECT slots_table.end_at
          FROM championship_bracket_preview_private.assignments assignments_table
          JOIN championship_bracket_preview_private.slots slots_table ON slots_table.id = assignments_table.slot_id
          WHERE assignments_table.job_id = _job_id
            AND slots_table.event_date = court_window.event_date
            AND slots_table.location_key = court_window.location_key
            AND slots_table.court_key = court_window.court_key
            AND slots_table.start_at < candidate_conflict_end_at + make_interval(mins => knockout_record.duration_minutes)
            AND slots_table.end_at > candidate_conflict_end_at
          UNION ALL
          SELECT scheduled.end_at
          FROM championship_bracket_preview_private.knockout_matches scheduled
          WHERE scheduled.job_id = _job_id AND scheduled.id <> knockout_record.id
            AND scheduled.location_key = court_window.location_key AND scheduled.court_key = court_window.court_key
            AND scheduled.start_at < candidate_conflict_end_at + make_interval(mins => knockout_record.duration_minutes)
            AND scheduled.end_at > candidate_conflict_end_at
        ) conflicts;
        IF candidate_end_at IS NULL THEN
          candidate_start_at := candidate_conflict_end_at;
          candidate_end_at := candidate_start_at + make_interval(mins => knockout_record.duration_minutes);
          EXIT;
        END IF;
        candidate_conflict_end_at := candidate_end_at;
      END LOOP;
      EXIT WHEN candidate_start_at IS NOT NULL;
    END LOOP;

    IF candidate_start_at IS NULL THEN
      diagnostics := diagnostics || jsonb_build_array(jsonb_build_object('code', 'KNOCKOUT_NO_AVAILABLE_SLOT', 'message', format('Não existe janela compatível após as dependências para %s.', knockout_record.logical_key), 'logical_key', knockout_record.logical_key));
    ELSE
      UPDATE championship_bracket_preview_private.knockout_matches SET
        scheduled_date = court_window.event_date, location_key = court_window.location_key,
        location_name = court_window.location_name, court_key = court_window.court_key,
        court_name = court_window.court_name, start_at = candidate_start_at, end_at = candidate_end_at
      WHERE id = knockout_record.id;
    END IF;
  END LOOP;

  SELECT count(*) INTO expected_count FROM championship_bracket_preview_private.knockout_matches WHERE job_id = _job_id AND NOT is_bye;
  SELECT count(*) INTO scheduled_count FROM championship_bracket_preview_private.knockout_matches WHERE job_id = _job_id AND NOT is_bye AND scheduled_date IS NOT NULL AND location_key IS NOT NULL AND court_key IS NOT NULL AND start_at IS NOT NULL AND end_at IS NOT NULL;
  IF scheduled_count <> expected_count THEN
    diagnostics := diagnostics || jsonb_build_array(jsonb_build_object('code', 'KNOCKOUT_INCOMPLETE_SCHEDULE', 'message', format('A agenda do mata-mata programou %s de %s confrontos.', scheduled_count, expected_count), 'target', expected_count, 'obtained', scheduled_count));
  END IF;
  diagnostics := diagnostics || COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'code', 'KNOCKOUT_TEMPORAL_DEPENDENCY_CONFLICT',
      'message', format('%s inicia antes do término de uma partida predecessora.', dependent.logical_key),
      'logical_key', dependent.logical_key
    ) ORDER BY dependent.logical_key)
    FROM championship_bracket_preview_private.knockout_matches dependent
    JOIN LATERAL (
      SELECT max(predecessors.end_at) AS ready_at
      FROM championship_bracket_preview_private.knockout_matches predecessors
      WHERE predecessors.id = ANY(dependent.predecessor_match_ids)
    ) predecessor_window ON true
    WHERE dependent.job_id = _job_id AND NOT dependent.is_bye
      AND cardinality(dependent.predecessor_match_ids) > 0
      AND (dependent.start_at IS NULL OR predecessor_window.ready_at IS NULL OR dependent.start_at < predecessor_window.ready_at)
  ), '[]'::jsonb);
  RETURN diagnostics;
END;
$function$;

ALTER FUNCTION championship_bracket_preview_private.process_batch(UUID) RENAME TO process_batch_v7;

ALTER FUNCTION championship_bracket_preview_private.finalize_job(UUID) RENAME TO finalize_job_v7;

ALTER FUNCTION public.start_championship_bracket_preview_job(UUID,JSONB) RENAME TO start_championship_bracket_preview_job_v7;

ALTER FUNCTION public.get_championship_bracket_preview_job_status(UUID) RENAME TO get_championship_bracket_preview_job_status_v7;

ALTER FUNCTION public.get_championship_bracket_preview_job_day(UUID,DATE) RENAME TO get_championship_bracket_preview_job_day_v7;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.process_batch(_job_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE job_record RECORD; diagnostics JSONB; result JSONB;
BEGIN
  SELECT * INTO job_record FROM championship_bracket_preview_private.jobs WHERE id=_job_id FOR UPDATE;
  IF job_record.status IN ('QUEUED','INITIALIZING') THEN
    PERFORM championship_bracket_preview_private.initialize_job(_job_id);
    PERFORM championship_bracket_preview_private.rebuild_job_round_robin_matches(_job_id);
    PERFORM championship_bracket_preview_private.rebuild_job_slots(_job_id);
    SELECT championship_bracket_preview_private.resolve_v8_target_preflight(_job_id) INTO diagnostics;
    IF jsonb_array_length(diagnostics)>0 THEN
      UPDATE championship_bracket_preview_private.jobs SET status='FAILED',stage='Validação estrutural',diagnostics=diagnostics,error_message=diagnostics->0->>'message',completed_at=now(),updated_at=now() WHERE id=_job_id;
      RETURN jsonb_build_object('continue',false);
    END IF;
    UPDATE championship_bracket_preview_private.jobs
    SET stage = 'SCHEDULING_GROUPS', updated_at = now()
    WHERE id = _job_id;
  END IF;
  result := championship_bracket_preview_private.process_batch_v7(_job_id);
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.finalize_job(_job_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE job_record RECORD; target_diagnostics JSONB; compaction_diagnostics JSONB; knockout_diagnostics JSONB; manifest JSONB; group_count INTEGER; knockout_count INTEGER; scheduled_knockout_count INTEGER;
BEGIN
  SELECT * INTO job_record FROM championship_bracket_preview_private.jobs WHERE id=_job_id FOR UPDATE;
  IF job_record.status <> 'FINALIZING' THEN RETURN; END IF;
  SELECT championship_bracket_preview_private.resolve_v8_target_completion_diagnostics(_job_id) INTO target_diagnostics;
  SELECT championship_bracket_preview_private.compact_v8_schedule(_job_id) INTO compaction_diagnostics;
  IF jsonb_array_length(target_diagnostics)>0 OR jsonb_array_length(compaction_diagnostics)>0 THEN
    UPDATE championship_bracket_preview_private.jobs SET status='FAILED',stage='Validação da grade',diagnostics=target_diagnostics||compaction_diagnostics,error_message=(target_diagnostics||compaction_diagnostics)->0->>'message',completed_at=now(),updated_at=now() WHERE id=_job_id;
    RETURN;
  END IF;
  PERFORM championship_bracket_preview_private.assign_job_match_numbers(_job_id);
  PERFORM championship_bracket_preview_private.create_v8_knockout_matches(_job_id);
  SELECT championship_bracket_preview_private.schedule_v8_knockout_matches(_job_id) INTO knockout_diagnostics;
  IF jsonb_array_length(knockout_diagnostics)>0 THEN
    UPDATE championship_bracket_preview_private.jobs SET status='FAILED',stage='Programação eliminatória',diagnostics=knockout_diagnostics,error_message=knockout_diagnostics->0->>'message',completed_at=now(),updated_at=now() WHERE id=_job_id;
    RETURN;
  END IF;
  SELECT count(*) INTO group_count FROM championship_bracket_preview_private.assignments WHERE job_id=_job_id;
  SELECT count(*) INTO knockout_count FROM championship_bracket_preview_private.knockout_matches WHERE job_id=_job_id AND NOT is_bye;
  SELECT count(*) INTO scheduled_knockout_count FROM championship_bracket_preview_private.knockout_matches WHERE job_id=_job_id AND NOT is_bye AND scheduled_date IS NOT NULL AND start_at IS NOT NULL AND end_at IS NOT NULL;
  IF group_count <> (SELECT count(*) FROM championship_bracket_preview_private.matches WHERE job_id=_job_id) OR knockout_count <> scheduled_knockout_count THEN
    UPDATE championship_bracket_preview_private.jobs
    SET status = 'FAILED', stage = 'Validação da programação',
      diagnostics = jsonb_build_array(jsonb_build_object(
        'code', 'SCHEDULE_INCOMPLETE',
        'message', 'A prévia v8 não possui todas as partidas estruturais programadas.',
        'target', (SELECT count(*) FROM championship_bracket_preview_private.matches WHERE job_id = _job_id) + knockout_count,
        'obtained', group_count + scheduled_knockout_count
      )),
      error_message = 'A prévia v8 não possui todas as partidas estruturais programadas.',
      completed_at = now(), updated_at = now()
    WHERE id = _job_id;
    RETURN;
  END IF;
  SELECT jsonb_build_object(
    'algorithm_version','async-exact-v8',
    'groups',COALESCE((SELECT jsonb_agg(jsonb_build_object('competition',competitions.competition_key,'group',groups.group_number,'teams',(SELECT jsonb_agg(group_teams.team_id ORDER BY group_teams.position) FROM championship_bracket_preview_private.group_teams group_teams WHERE group_teams.group_id=groups.id)) ORDER BY competitions.position,groups.group_number) FROM championship_bracket_preview_private.groups groups JOIN championship_bracket_preview_private.competitions competitions ON competitions.id=groups.competition_id WHERE groups.job_id=_job_id),'[]'::jsonb),
    'group_matches',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'key',matches.logical_key,'slot_id',assignments.slot_id,
      'home_team_id',matches.home_team_id,'away_team_id',matches.away_team_id,
      'date',slots.event_date,'location_key',slots.location_key,'location',slots.location_name,
      'court_key',slots.court_key,'court',slots.court_name,'start',slots.start_at,'end',slots.end_at,
      'match_number',assignments.match_number
    ) ORDER BY matches.logical_key)
      FROM championship_bracket_preview_private.assignments assignments
      JOIN championship_bracket_preview_private.matches matches ON matches.id=assignments.match_id
      JOIN championship_bracket_preview_private.slots slots ON slots.id=assignments.slot_id
      WHERE assignments.job_id=_job_id),'[]'::jsonb),
    'knockout_matches',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'key',knockout_matches.logical_key,
      'phase',knockout_matches.phase,
      'round',knockout_matches.round_number,
      'slot',knockout_matches.slot_number,
      'home_source_type',knockout_matches.home_source_type,
      'home_source',knockout_matches.home_source_reference,
      'away_source_type',knockout_matches.away_source_type,
      'away_source',knockout_matches.away_source_reference,
      'predecessors',knockout_matches.predecessor_match_ids,
      'is_bye',knockout_matches.is_bye,
      'date',knockout_matches.scheduled_date,
      'location_key',knockout_matches.location_key,
      'location',knockout_matches.location_name,
      'court_key',knockout_matches.court_key,
      'court',knockout_matches.court_name,
      'start',CASE WHEN knockout_matches.is_bye THEN NULL ELSE knockout_matches.start_at END,
      'end',CASE WHEN knockout_matches.is_bye THEN NULL ELSE knockout_matches.end_at END,
      'manual_final',knockout_matches.manual_final
    ) ORDER BY knockout_matches.round_number, knockout_matches.slot_number, knockout_matches.logical_key)
      FROM championship_bracket_preview_private.knockout_matches knockout_matches WHERE knockout_matches.job_id=_job_id),'[]'::jsonb)
  ) INTO manifest;
  UPDATE championship_bracket_preview_private.jobs SET status='COMPLETED',stage='Concluída',progress_percentage=100,
    summary=jsonb_build_object('total_matches',group_count+knockout_count,'group_stage_matches',group_count,'knockout_matches',knockout_count,'scheduled_matches',group_count+scheduled_knockout_count,
      'occupied_minutes',(
        SELECT COALESCE(sum(minutes),0)::integer FROM (
          SELECT extract(epoch FROM (slots_table.end_at-slots_table.start_at))/60 AS minutes
          FROM championship_bracket_preview_private.assignments assignments_table JOIN championship_bracket_preview_private.slots slots_table ON slots_table.id=assignments_table.slot_id WHERE assignments_table.job_id=_job_id
          UNION ALL
          SELECT extract(epoch FROM (knockout_matches.end_at-knockout_matches.start_at))/60 FROM championship_bracket_preview_private.knockout_matches knockout_matches WHERE knockout_matches.job_id=_job_id AND NOT knockout_matches.is_bye
        ) occupied
      ),
      'available_minutes',(SELECT COALESCE(sum(extract(epoch FROM end_at-start_at)/60)::integer,0) FROM championship_bracket_preview_private.slots WHERE job_id=_job_id),
      'utilization_percentage',NULL,'free_windows',NULL,'conflict_count',0,'warning_count',0,
      'games_by_day',COALESCE((SELECT jsonb_agg(jsonb_build_object('date',event_date,'matches',matches) ORDER BY event_date) FROM (SELECT event_date,count(*)::integer matches FROM (SELECT slots.event_date FROM championship_bracket_preview_private.assignments assignments JOIN championship_bracket_preview_private.slots slots ON slots.id=assignments.slot_id WHERE assignments.job_id=_job_id UNION ALL SELECT scheduled_date FROM championship_bracket_preview_private.knockout_matches WHERE job_id=_job_id AND NOT is_bye AND scheduled_date IS NOT NULL) all_matches GROUP BY event_date) day_counts),'[]'::jsonb)),
    generation_signature=encode(extensions.digest(convert_to(manifest::text,'UTF8'),'sha256'),'hex'),completed_at=now(),expires_at=now()+interval '7 days',updated_at=now() WHERE id=_job_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_championship_bracket_preview_job(_championship_id UUID,_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE season INTEGER; payload_hash TEXT; dependency_hash TEXT; existing_job RECORD; new_job_id UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_admin_tab_access('matches'::public.admin_panel_tab,true) THEN RAISE EXCEPTION 'Usuário sem permissão para calcular a programação.'; END IF;
  SELECT current_season_year INTO season FROM public.championships WHERE id=_championship_id AND status='UPCOMING'::public.championship_status;
  IF season IS NULL THEN RAISE EXCEPTION 'Campeonato inválido ou fora do status Configurando campeonato.'; END IF;
  payload_hash:=public.resolve_championship_bracket_preview_payload_signature(COALESCE(_payload,'{}'::jsonb));
  dependency_hash:=championship_bracket_preview_private.resolve_dependency_signature(_championship_id,COALESCE(_payload,'{}'::jsonb));
  SELECT * INTO existing_job FROM championship_bracket_preview_private.jobs WHERE championship_id=_championship_id AND season_year=season AND requested_by=auth.uid() AND payload_signature=payload_hash AND dependency_signature=dependency_hash AND algorithm_version='async-exact-v8' AND expires_at>now() AND status IN ('QUEUED','INITIALIZING','SCHEDULING','FINALIZING','COMPLETED') ORDER BY created_at DESC LIMIT 1;
  IF existing_job.id IS NOT NULL THEN RETURN public.get_championship_bracket_preview_job_status(existing_job.id); END IF;
  IF EXISTS(SELECT 1 FROM championship_bracket_preview_private.jobs WHERE championship_id=_championship_id AND season_year=season AND requested_by<>auth.uid() AND status IN ('QUEUED','INITIALIZING','SCHEDULING','FINALIZING')) THEN RAISE EXCEPTION 'Já existe uma programação exata em andamento para este campeonato.'; END IF;
  UPDATE championship_bracket_preview_private.jobs SET status='CANCELLED',stage='Substituída por nova configuração',expires_at=now()+interval '24 hours',updated_at=now() WHERE championship_id=_championship_id AND season_year=season AND status IN ('QUEUED','INITIALIZING','SCHEDULING','FINALIZING');
  INSERT INTO championship_bracket_preview_private.jobs(championship_id,season_year,requested_by,payload,payload_signature,dependency_signature,algorithm_version) VALUES(_championship_id,season,auth.uid(),COALESCE(_payload,'{}'::jsonb),payload_hash,dependency_hash,'async-exact-v8') RETURNING id INTO new_job_id;
  PERFORM championship_bracket_preview_private.enqueue(new_job_id,0);
  RETURN public.get_championship_bracket_preview_job_status(new_job_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_championship_bracket_preview_job_status(_job_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE job_record RECORD;
BEGIN
  SELECT * INTO job_record FROM championship_bracket_preview_private.jobs WHERE id=_job_id;
  IF job_record.id IS NULL OR (job_record.requested_by<>auth.uid() AND NOT public.has_admin_tab_access('matches'::public.admin_panel_tab,true)) THEN RAISE EXCEPTION 'Job de prévia não encontrado.'; END IF;
  RETURN jsonb_build_object('job_id',job_record.id,'championship_id',job_record.championship_id,'season_year',job_record.season_year,'status',job_record.status,'stage',job_record.stage,'current_date',job_record.current_processing_date,'progress_percentage',job_record.progress_percentage,'processed_slots',job_record.processed_slots,'total_slots',job_record.total_slots,'attempt_count',job_record.attempt_count,'error_message',job_record.error_message,'summary',job_record.summary,'diagnostics',job_record.diagnostics,'payload_signature',job_record.payload_signature,'dependency_signature',job_record.dependency_signature,'algorithm_version',job_record.algorithm_version,'generation_signature',job_record.generation_signature,'created_at',job_record.created_at,'started_at',job_record.started_at,'completed_at',job_record.completed_at,'expires_at',job_record.expires_at,'is_valid_for_creation',job_record.status='COMPLETED' AND job_record.algorithm_version='async-exact-v8' AND job_record.generation_signature IS NOT NULL AND job_record.expires_at>now() AND jsonb_array_length(job_record.diagnostics)=0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_championship_bracket_preview_job_day(_job_id UUID,_date DATE)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE result JSONB; knockout_record RECORD; scheduled_match RECORD; location_index INTEGER; court_index INTEGER; entries JSONB;
BEGIN
  result:=public.get_championship_bracket_preview_job_day_v7(_job_id,_date);
  FOR knockout_record IN SELECT knockout_matches.*,competitions.sport_id,competitions.sport_name,competitions.naipe,competitions.division FROM championship_bracket_preview_private.knockout_matches knockout_matches JOIN championship_bracket_preview_private.competitions competitions ON competitions.id=knockout_matches.competition_id WHERE knockout_matches.job_id=_job_id AND knockout_matches.scheduled_date=_date AND NOT knockout_matches.is_bye ORDER BY knockout_matches.start_at,knockout_matches.logical_key LOOP
    SELECT location_item.ordinality::integer-1,court_item.ordinality::integer-1 INTO location_index,court_index FROM jsonb_array_elements(COALESCE(result->'locations','[]'::jsonb)) WITH ORDINALITY location_item(value,ordinality) CROSS JOIN LATERAL jsonb_array_elements(COALESCE(location_item.value->'courts','[]'::jsonb)) WITH ORDINALITY court_item(value,ordinality) WHERE location_item.value->>'location_key'=knockout_record.location_key::text AND court_item.value->>'court_key'=knockout_record.court_key::text LIMIT 1;
    IF location_index IS NULL THEN CONTINUE; END IF;
    SELECT COALESCE(jsonb_agg(item.value ORDER BY item.value->>'start_time',item.value->>'end_time'),'[]'::jsonb) INTO entries FROM jsonb_array_elements(COALESCE(result#>ARRAY['locations',location_index::text,'courts',court_index::text,'entries'],'[]'::jsonb)) item(value) WHERE COALESCE(item.value->>'reason_code','') <> 'MANUAL_FINAL_BLOCK';
    entries:=entries||jsonb_build_array(jsonb_build_object('type','MATCH','start_time',to_char(knockout_record.start_at AT TIME ZONE 'America/Sao_Paulo','HH24:MI'),'end_time',to_char(knockout_record.end_at AT TIME ZONE 'America/Sao_Paulo','HH24:MI'),'duration_minutes',knockout_record.duration_minutes,'match_kind','KNOCKOUT','match_number',NULL,'sport_id',knockout_record.sport_id,'sport_name',knockout_record.sport_name,'naipe',knockout_record.naipe,'division',knockout_record.division,'phase',knockout_record.phase,'phase_label',knockout_record.phase,'group_number',NULL,'round_number',knockout_record.round_number,'reason_code',NULL,'reason',format('%s × %s',knockout_record.home_source_reference,knockout_record.away_source_reference),'projected',true,'manual_final',knockout_record.manual_final));
    SELECT jsonb_agg(item.value ORDER BY item.value->>'start_time',item.value->>'end_time') INTO entries FROM jsonb_array_elements(entries) item(value);
    result:=jsonb_set(result,ARRAY['locations',location_index::text,'courts',court_index::text,'entries'],entries);
  END LOOP;
  FOR scheduled_match IN
    SELECT slots_table.location_key,slots_table.court_key,assignments_table.match_number,
      matches_table.home_team_id,home_teams_table.name AS home_team_name,
      matches_table.away_team_id,away_teams_table.name AS away_team_name
    FROM championship_bracket_preview_private.assignments assignments_table
    JOIN championship_bracket_preview_private.slots slots_table ON slots_table.id=assignments_table.slot_id
    JOIN championship_bracket_preview_private.matches matches_table ON matches_table.id=assignments_table.match_id
    JOIN public.teams home_teams_table ON home_teams_table.id=matches_table.home_team_id
    JOIN public.teams away_teams_table ON away_teams_table.id=matches_table.away_team_id
    WHERE assignments_table.job_id=_job_id AND slots_table.event_date=_date
  LOOP
    SELECT location_item.ordinality::integer-1,court_item.ordinality::integer-1 INTO location_index,court_index
    FROM jsonb_array_elements(COALESCE(result->'locations','[]'::jsonb)) WITH ORDINALITY location_item(value,ordinality)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(location_item.value->'courts','[]'::jsonb)) WITH ORDINALITY court_item(value,ordinality)
    WHERE location_item.value->>'location_key'=scheduled_match.location_key::text
      AND court_item.value->>'court_key'=scheduled_match.court_key::text LIMIT 1;
    IF location_index IS NULL THEN CONTINUE; END IF;
    SELECT COALESCE(jsonb_agg(
      CASE WHEN item.value->>'type'='MATCH' AND item.value->>'match_kind'='GROUP_STAGE'
          AND item.value->>'match_number'=scheduled_match.match_number::text
        THEN item.value || jsonb_build_object(
          'home_team_id',scheduled_match.home_team_id,'home_team_name',scheduled_match.home_team_name,
          'away_team_id',scheduled_match.away_team_id,'away_team_name',scheduled_match.away_team_name
        )
        ELSE item.value END
      ORDER BY item.ordinality
    ),'[]'::jsonb) INTO entries
    FROM jsonb_array_elements(COALESCE(result#>ARRAY['locations',location_index::text,'courts',court_index::text,'entries'],'[]'::jsonb)) WITH ORDINALITY item(value,ordinality);
    result:=jsonb_set(result,ARRAY['locations',location_index::text,'courts',court_index::text,'entries'],entries);
  END LOOP;
  RETURN result;
END;
$function$;

ALTER FUNCTION public.create_championship_bracket_from_preview_job(UUID,UUID,JSONB)
  RENAME TO create_championship_bracket_from_preview_job_v7;

CREATE OR REPLACE FUNCTION public.create_championship_bracket_from_preview_job(
  _job_id UUID,
  _championship_id UUID,
  _payload JSONB
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public,championship_bracket_preview_private
SET statement_timeout = '30s'
AS $function$
DECLARE
  job_record RECORD;
  edition_id UUID := gen_random_uuid();
  actual_dependency TEXT;
  persisted_manifest JSONB;
  persisted_signature TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_admin_tab_access('matches'::public.admin_panel_tab,true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para criar o campeonato.';
  END IF;
  SELECT * INTO job_record FROM championship_bracket_preview_private.jobs WHERE id = _job_id FOR UPDATE;
  IF job_record.status = 'CONSUMED' AND job_record.result_edition_id IS NOT NULL THEN
    RETURN job_record.result_edition_id;
  END IF;
  IF job_record.status <> 'COMPLETED'
    OR job_record.algorithm_version <> 'async-exact-v8'
    OR job_record.championship_id <> _championship_id
    OR job_record.requested_by <> auth.uid()
    OR job_record.expires_at <= now()
    OR job_record.generation_signature IS NULL
    OR jsonb_array_length(job_record.diagnostics) > 0
  THEN
    RAISE EXCEPTION 'A prévia exata v8 não está concluída, pertence a outra configuração ou expirou.';
  END IF;
  IF public.resolve_championship_bracket_preview_payload_signature(COALESCE(_payload, '{}'::jsonb)) <> job_record.payload_signature THEN
    RAISE EXCEPTION 'A configuração foi alterada desde a prévia. Calcule novamente.';
  END IF;
  actual_dependency := championship_bracket_preview_private.resolve_dependency_signature(_championship_id, COALESCE(_payload, '{}'::jsonb));
  IF actual_dependency <> job_record.dependency_signature THEN
    RAISE EXCEPTION 'Dados externos usados no cálculo foram alterados. Calcule novamente.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.matches WHERE championship_id = _championship_id AND season_year = job_record.season_year) THEN
    RAISE EXCEPTION 'Este campeonato já possui jogos cadastrados.';
  END IF;

  PERFORM set_config('app.skip_queue_trigger','true',true);
  PERFORM set_config('app.skip_match_conflict_trigger','true',true);
  INSERT INTO public.championship_bracket_editions(id,championship_id,season_year,status,payload_snapshot,created_by,updated_by)
  VALUES(edition_id,_championship_id,job_record.season_year,'GROUPS_GENERATED',_payload || jsonb_build_object('exact_preview_algorithm_version','async-exact-v8'),auth.uid(),auth.uid());
  INSERT INTO public.championship_bracket_team_registrations(bracket_edition_id,team_id)
    SELECT DISTINCT edition_id,group_teams.team_id FROM championship_bracket_preview_private.group_teams group_teams WHERE group_teams.job_id=_job_id;
  INSERT INTO public.championship_bracket_team_modalities(bracket_edition_id,team_id,sport_id,naipe,division)
    SELECT DISTINCT edition_id,group_teams.team_id,competitions.sport_id,competitions.naipe,competitions.division
    FROM championship_bracket_preview_private.group_teams group_teams
    JOIN championship_bracket_preview_private.groups groups ON groups.id=group_teams.group_id
    JOIN championship_bracket_preview_private.competitions competitions ON competitions.id=groups.competition_id
    WHERE group_teams.job_id=_job_id;
  INSERT INTO public.championship_bracket_competitions(id,bracket_edition_id,sport_id,naipe,division,groups_count,qualifiers_per_group,third_place_mode,should_complete_knockout_with_best_second_placed_teams,knockout_pairing_mode)
    SELECT id,edition_id,sport_id,naipe,division,groups_count,qualifiers_per_group,third_place_mode,best_second,pairing_mode
    FROM championship_bracket_preview_private.competitions WHERE job_id=_job_id;
  INSERT INTO public.championship_bracket_groups(id,competition_id,group_number)
    SELECT id,competition_id,group_number FROM championship_bracket_preview_private.groups WHERE job_id=_job_id;
  INSERT INTO public.championship_bracket_group_teams(group_id,team_id,position)
    SELECT group_id,team_id,position FROM championship_bracket_preview_private.group_teams WHERE job_id=_job_id;

  WITH inserted_days AS (
    INSERT INTO public.championship_bracket_days(bracket_edition_id,event_date,start_time,end_time,break_start_time,break_end_time)
    SELECT edition_id,(day_item.value->>'date')::date,(day_item.value->>'start_time')::time,(day_item.value->>'end_time')::time,NULLIF(day_item.value->>'break_start_time','')::time,NULLIF(day_item.value->>'break_end_time','')::time
    FROM jsonb_array_elements(COALESCE(_payload->'schedule_days','[]'::jsonb)) day_item(value)
    RETURNING id,event_date
  ), inserted_locations AS (
    INSERT INTO public.championship_bracket_locations(bracket_day_id,name,position,location_group_id)
    SELECT inserted_days.id,location_item.value->>'name',COALESCE((location_item.value->>'position')::integer,location_item.ordinality::integer),(location_item.value->>'location_key')::uuid
    FROM inserted_days
    JOIN LATERAL jsonb_array_elements(COALESCE((SELECT day_item.value->'locations' FROM jsonb_array_elements(COALESCE(_payload->'schedule_days','[]'::jsonb)) day_item(value) WHERE (day_item.value->>'date')::date=inserted_days.event_date LIMIT 1),'[]'::jsonb)) WITH ORDINALITY location_item(value,ordinality) ON true
    RETURNING id,bracket_day_id,location_group_id
  ), inserted_courts AS (
    INSERT INTO public.championship_bracket_courts(bracket_location_id,name,position,court_group_id)
    SELECT inserted_locations.id,court_item.value->>'name',COALESCE((court_item.value->>'position')::integer,court_item.ordinality::integer),(court_item.value->>'court_key')::uuid
    FROM inserted_locations
    JOIN public.championship_bracket_days days_table ON days_table.id=inserted_locations.bracket_day_id
    JOIN LATERAL jsonb_array_elements(COALESCE((SELECT location_item.value->'courts' FROM jsonb_array_elements(COALESCE(_payload->'schedule_days','[]'::jsonb)) day_item(value) CROSS JOIN LATERAL jsonb_array_elements(COALESCE(day_item.value->'locations','[]'::jsonb)) location_item(value) WHERE (day_item.value->>'date')::date=days_table.event_date AND (location_item.value->>'location_key')::uuid=inserted_locations.location_group_id LIMIT 1),'[]'::jsonb)) WITH ORDINALITY court_item(value,ordinality) ON true
    RETURNING id,court_group_id
  )
  INSERT INTO public.championship_bracket_court_sports(bracket_court_id,sport_id)
    SELECT DISTINCT inserted_courts.id,slots_table.sport_id
    FROM inserted_courts
    JOIN championship_bracket_preview_private.slots slots_table ON slots_table.job_id=_job_id AND slots_table.court_key=inserted_courts.court_group_id
    ON CONFLICT DO NOTHING;
  PERFORM public.sync_championship_bracket_court_sport_preferences(edition_id,_payload);

  INSERT INTO public.matches(id,championship_id,division,naipe,sport_id,home_team_id,away_team_id,location,court_name,scheduled_date,scheduled_slot,queue_position,global_queue_order,start_time,end_time,season_year,status)
  SELECT matches_table.id,_championship_id,competitions.division,competitions.naipe,competitions.sport_id,matches_table.home_team_id,matches_table.away_team_id,slots_table.location_name,slots_table.court_name,slots_table.event_date,
    dense_rank() OVER(PARTITION BY slots_table.event_date ORDER BY slots_table.start_at),row_number() OVER(PARTITION BY slots_table.event_date,competitions.sport_id,competitions.naipe,competitions.division ORDER BY slots_table.start_at,slots_table.location_position,slots_table.court_position),
    row_number() OVER(ORDER BY slots_table.event_date,slots_table.start_at,slots_table.location_position,slots_table.court_position),slots_table.start_at,slots_table.end_at,job_record.season_year,'SCHEDULED'
  FROM championship_bracket_preview_private.assignments assignments_table
  JOIN championship_bracket_preview_private.matches matches_table ON matches_table.id=assignments_table.match_id
  JOIN championship_bracket_preview_private.competitions competitions ON competitions.id=matches_table.competition_id
  JOIN championship_bracket_preview_private.slots slots_table ON slots_table.id=assignments_table.slot_id
  WHERE assignments_table.job_id=_job_id;
  INSERT INTO public.championship_bracket_matches(bracket_edition_id,competition_id,group_id,phase,round_number,slot_number,match_id,home_team_id,away_team_id)
    SELECT edition_id,competition_id,group_id,'GROUP_STAGE',round_number,slot_number,id,home_team_id,away_team_id
    FROM championship_bracket_preview_private.matches WHERE job_id=_job_id;

  INSERT INTO public.championship_bracket_matches(
    id,bracket_edition_id,competition_id,phase,round_number,slot_number,
    source_home_bracket_match_id,source_away_bracket_match_id,is_bye,is_third_place,
    planned_scheduled_date,planned_period,planned_scheduled_slot,planned_queue_position,
    planned_start_time,planned_end_time,planned_location_group_id,planned_court_group_id,
    planned_location_name,planned_court_name
  )
  SELECT knockout_matches.id,edition_id,knockout_matches.competition_id,'KNOCKOUT',knockout_matches.round_number,knockout_matches.slot_number,
    CASE WHEN cardinality(knockout_matches.predecessor_match_ids) > 0 THEN knockout_matches.predecessor_match_ids[1] END,
    CASE WHEN cardinality(knockout_matches.predecessor_match_ids) > 1 THEN knockout_matches.predecessor_match_ids[2] END,
    knockout_matches.is_bye,knockout_matches.phase='THIRD_PLACE',
    knockout_matches.scheduled_date,
    CASE WHEN knockout_matches.scheduled_date IS NULL THEN NULL ELSE public.resolve_bracket_schedule_period_by_timestamp(_payload,knockout_matches.scheduled_date,knockout_matches.start_at) END,
    NULL,NULL,
    CASE WHEN knockout_matches.start_at IS NULL THEN NULL ELSE (knockout_matches.start_at AT TIME ZONE 'America/Sao_Paulo')::time END,
    CASE WHEN knockout_matches.end_at IS NULL THEN NULL ELSE (knockout_matches.end_at AT TIME ZONE 'America/Sao_Paulo')::time END,
    knockout_matches.location_key,knockout_matches.court_key,knockout_matches.location_name,knockout_matches.court_name
  FROM championship_bracket_preview_private.knockout_matches knockout_matches
  WHERE knockout_matches.job_id=_job_id;
  UPDATE public.championship_bracket_matches predecessor_matches
  SET next_bracket_match_id=next_matches.id
  FROM public.championship_bracket_matches next_matches
  JOIN championship_bracket_preview_private.knockout_matches next_private ON next_private.id=next_matches.id
  WHERE predecessor_matches.bracket_edition_id=edition_id
    AND next_matches.bracket_edition_id=edition_id
    AND NOT next_matches.is_third_place
    AND predecessor_matches.id=ANY(next_private.predecessor_match_ids);

    IF EXISTS (
  SELECT 1
  FROM championship_bracket_preview_private.knockout_matches
    AS private_matches
  LEFT JOIN public.championship_bracket_matches
    AS persisted_matches
    ON persisted_matches.id = private_matches.id
  WHERE private_matches.job_id = _job_id
    AND (
      persisted_matches.id IS NULL
      OR persisted_matches.bracket_edition_id
        IS DISTINCT FROM edition_id
      OR persisted_matches.competition_id
        IS DISTINCT FROM private_matches.competition_id
      OR persisted_matches.phase
        IS DISTINCT FROM 'KNOCKOUT'::public.bracket_phase
      OR persisted_matches.round_number
        IS DISTINCT FROM private_matches.round_number
      OR persisted_matches.slot_number
        IS DISTINCT FROM private_matches.slot_number
      OR persisted_matches.is_bye
        IS DISTINCT FROM private_matches.is_bye
      OR persisted_matches.is_third_place
        IS DISTINCT FROM (
          private_matches.phase = 'THIRD_PLACE'
        )
      OR persisted_matches.source_home_bracket_match_id
        IS DISTINCT FROM (
          CASE
            WHEN cardinality(
              private_matches.predecessor_match_ids
            ) > 0
            THEN private_matches.predecessor_match_ids[1]
            ELSE NULL
          END
        )
      OR persisted_matches.source_away_bracket_match_id
        IS DISTINCT FROM (
          CASE
            WHEN cardinality(
              private_matches.predecessor_match_ids
            ) > 1
            THEN private_matches.predecessor_match_ids[2]
            ELSE NULL
          END
        )
    )
)
THEN
  RAISE EXCEPTION
    'A árvore eliminatória persistida divergiu da estrutura aprovada pela prévia v8.';
END IF;

IF EXISTS (
  SELECT 1
  FROM public.championship_bracket_matches
    AS persisted_matches
  LEFT JOIN championship_bracket_preview_private.knockout_matches
    AS private_matches
    ON private_matches.id = persisted_matches.id
    AND private_matches.job_id = _job_id
  WHERE persisted_matches.bracket_edition_id = edition_id
    AND persisted_matches.phase =
      'KNOCKOUT'::public.bracket_phase
    AND private_matches.id IS NULL
)
THEN
  RAISE EXCEPTION
    'Foram criados confrontos eliminatórios que não existem na prévia v8 aprovada.';
END IF;

IF EXISTS (
  SELECT 1
  FROM championship_bracket_preview_private.knockout_matches
    AS child_private
  CROSS JOIN LATERAL unnest(
    child_private.predecessor_match_ids
  ) AS predecessor_reference(predecessor_id)
  JOIN public.championship_bracket_matches
    AS predecessor_persisted
    ON predecessor_persisted.id =
      predecessor_reference.predecessor_id
  WHERE child_private.job_id = _job_id
    AND child_private.phase <> 'THIRD_PLACE'
    AND predecessor_persisted.next_bracket_match_id
      IS DISTINCT FROM child_private.id
)
THEN
  RAISE EXCEPTION
    'O encadeamento next_bracket_match_id divergiu da árvore eliminatória aprovada pela prévia v8.';
END IF;

IF EXISTS (
  SELECT 1
  FROM championship_bracket_preview_private.knockout_matches
    AS first_round_private
  JOIN public.championship_bracket_matches
    AS first_round_persisted
    ON first_round_persisted.id =
      first_round_private.id
  WHERE first_round_private.job_id = _job_id
    AND first_round_private.round_number = 1
    AND (
      first_round_persisted.source_home_bracket_match_id
        IS NOT NULL
      OR first_round_persisted.source_away_bracket_match_id
        IS NOT NULL
    )
)
THEN
  RAISE EXCEPTION
    'A primeira rodada eliminatória v8 possui dependências predecessoras inválidas.';
END IF;

  INSERT INTO public.championship_bracket_knockout_schedule_reservations(
    bracket_edition_id,competition_id,round_number,slot_number,is_third_place,
    scheduled_date,schedule_period,location_name,court_name,location_group_id,court_group_id,
    bracket_day_id,bracket_court_id,scheduled_slot,queue_position,start_at,end_at,duration_minutes,is_manual_final
  )
  SELECT edition_id,knockout_matches.competition_id,knockout_matches.round_number,knockout_matches.slot_number,knockout_matches.phase='THIRD_PLACE',
    knockout_matches.scheduled_date,
    public.resolve_bracket_schedule_period_by_timestamp(_payload,knockout_matches.scheduled_date,knockout_matches.start_at),
    knockout_matches.location_name,knockout_matches.court_name,knockout_matches.location_key,knockout_matches.court_key,
    days_table.id,courts_table.id,
    dense_rank() OVER(PARTITION BY knockout_matches.scheduled_date ORDER BY knockout_matches.start_at),
    row_number() OVER(PARTITION BY knockout_matches.scheduled_date,knockout_matches.court_key ORDER BY knockout_matches.start_at,knockout_matches.logical_key),
    knockout_matches.start_at,knockout_matches.end_at,knockout_matches.duration_minutes,knockout_matches.manual_final
  FROM championship_bracket_preview_private.knockout_matches knockout_matches
  JOIN public.championship_bracket_days days_table ON days_table.bracket_edition_id=edition_id AND days_table.event_date=knockout_matches.scheduled_date
  JOIN public.championship_bracket_locations locations_table ON locations_table.bracket_day_id=days_table.id AND locations_table.location_group_id=knockout_matches.location_key
  JOIN public.championship_bracket_courts courts_table ON courts_table.bracket_location_id=locations_table.id AND courts_table.court_group_id=knockout_matches.court_key
  WHERE knockout_matches.job_id=_job_id AND NOT knockout_matches.is_bye;

  UPDATE public.championship_bracket_matches AS bracket_matches
SET
  planned_scheduled_date = reservations.scheduled_date,
  planned_period = reservations.schedule_period,
  planned_scheduled_slot = reservations.scheduled_slot,
  planned_queue_position = reservations.queue_position,
  planned_start_time = (
    reservations.start_at
    AT TIME ZONE 'America/Sao_Paulo'
  )::time,
  planned_end_time = (
    reservations.end_at
    AT TIME ZONE 'America/Sao_Paulo'
  )::time,
  planned_location_group_id = reservations.location_group_id,
  planned_court_group_id = reservations.court_group_id,
  planned_location_name = reservations.location_name,
  planned_court_name = reservations.court_name
FROM public.championship_bracket_knockout_schedule_reservations
  AS reservations
WHERE bracket_matches.bracket_edition_id = edition_id
  AND bracket_matches.competition_id = reservations.competition_id
  AND bracket_matches.round_number = reservations.round_number
  AND bracket_matches.slot_number = reservations.slot_number
  AND bracket_matches.is_third_place = reservations.is_third_place
  AND reservations.bracket_edition_id = edition_id;

IF EXISTS (
  SELECT 1
  FROM championship_bracket_preview_private.knockout_matches
    AS private_matches
  LEFT JOIN public.championship_bracket_knockout_schedule_reservations
    AS reservations
    ON reservations.bracket_edition_id = edition_id
    AND reservations.competition_id =
      private_matches.competition_id
    AND reservations.round_number =
      private_matches.round_number
    AND reservations.slot_number =
      private_matches.slot_number
    AND reservations.is_third_place =
      (private_matches.phase = 'THIRD_PLACE')
  WHERE private_matches.job_id = _job_id
    AND NOT private_matches.is_bye
    AND (
      reservations.id IS NULL
      OR reservations.scheduled_date
        IS DISTINCT FROM private_matches.scheduled_date
      OR reservations.location_group_id
        IS DISTINCT FROM private_matches.location_key
      OR reservations.court_group_id
        IS DISTINCT FROM private_matches.court_key
      OR reservations.location_name
        IS DISTINCT FROM private_matches.location_name
      OR reservations.court_name
        IS DISTINCT FROM private_matches.court_name
      OR reservations.start_at
        IS DISTINCT FROM private_matches.start_at
      OR reservations.end_at
        IS DISTINCT FROM private_matches.end_at
      OR reservations.duration_minutes
        IS DISTINCT FROM private_matches.duration_minutes
      OR reservations.is_manual_final
        IS DISTINCT FROM private_matches.manual_final
    )
)
THEN
  RAISE EXCEPTION
    'Uma ou mais reservas eliminatórias persistidas divergem da programação exata aprovada pela prévia v8.';
END IF;

IF EXISTS (
  SELECT 1
  FROM championship_bracket_preview_private.knockout_matches
    AS private_matches
  JOIN public.championship_bracket_knockout_schedule_reservations
    AS reservations
    ON reservations.bracket_edition_id = edition_id
    AND reservations.competition_id =
      private_matches.competition_id
    AND reservations.round_number =
      private_matches.round_number
    AND reservations.slot_number =
      private_matches.slot_number
    AND reservations.is_third_place =
      (private_matches.phase = 'THIRD_PLACE')
  WHERE private_matches.job_id = _job_id
    AND private_matches.is_bye
)
THEN
  RAISE EXCEPTION
    'Uma partida BYE da prévia v8 recebeu indevidamente uma reserva de horário.';
END IF;

IF EXISTS (
  SELECT 1
  FROM public.championship_bracket_knockout_schedule_reservations
    AS reservations
  LEFT JOIN championship_bracket_preview_private.knockout_matches
    AS private_matches
    ON private_matches.job_id = _job_id
    AND private_matches.competition_id =
      reservations.competition_id
    AND private_matches.round_number =
      reservations.round_number
    AND private_matches.slot_number =
      reservations.slot_number
    AND (
      private_matches.phase = 'THIRD_PLACE'
    ) = reservations.is_third_place
  WHERE reservations.bracket_edition_id = edition_id
    AND (
      private_matches.id IS NULL
      OR private_matches.is_bye
    )
)
THEN
  RAISE EXCEPTION
    'Foi persistida uma reserva eliminatória que não corresponde a uma partida real da prévia v8.';
END IF;

IF EXISTS (
  SELECT 1
  FROM public.championship_bracket_matches
    AS bracket_matches
  JOIN championship_bracket_preview_private.knockout_matches
    AS private_matches
    ON private_matches.id = bracket_matches.id
    AND private_matches.job_id = _job_id
  LEFT JOIN public.championship_bracket_knockout_schedule_reservations
    AS reservations
    ON reservations.bracket_edition_id = edition_id
    AND reservations.competition_id =
      bracket_matches.competition_id
    AND reservations.round_number =
      bracket_matches.round_number
    AND reservations.slot_number =
      bracket_matches.slot_number
    AND reservations.is_third_place =
      bracket_matches.is_third_place
  WHERE bracket_matches.bracket_edition_id = edition_id
    AND NOT private_matches.is_bye
    AND (
      reservations.id IS NULL
      OR bracket_matches.planned_scheduled_date
        IS DISTINCT FROM reservations.scheduled_date
      OR bracket_matches.planned_period
        IS DISTINCT FROM reservations.schedule_period
      OR bracket_matches.planned_scheduled_slot
        IS DISTINCT FROM reservations.scheduled_slot
      OR bracket_matches.planned_queue_position
        IS DISTINCT FROM reservations.queue_position
      OR bracket_matches.planned_start_time
        IS DISTINCT FROM (
          reservations.start_at
          AT TIME ZONE 'America/Sao_Paulo'
        )::time
      OR bracket_matches.planned_end_time
        IS DISTINCT FROM (
          reservations.end_at
          AT TIME ZONE 'America/Sao_Paulo'
        )::time
      OR bracket_matches.planned_location_group_id
        IS DISTINCT FROM reservations.location_group_id
      OR bracket_matches.planned_court_group_id
        IS DISTINCT FROM reservations.court_group_id
      OR bracket_matches.planned_location_name
        IS DISTINCT FROM reservations.location_name
      OR bracket_matches.planned_court_name
        IS DISTINCT FROM reservations.court_name
    )
)
THEN
  RAISE EXCEPTION
    'Os campos planned_* do mata-mata divergem da reserva estrutural aprovada pela prévia v8.';
END IF;

  IF (SELECT count(*) FROM public.matches WHERE championship_id=_championship_id AND season_year=job_record.season_year)
      <> (SELECT count(*) FROM championship_bracket_preview_private.matches WHERE job_id=_job_id)
    OR (SELECT count(*) FROM public.championship_bracket_knockout_schedule_reservations WHERE bracket_edition_id=edition_id)
      <> (SELECT count(*) FROM championship_bracket_preview_private.knockout_matches WHERE job_id=_job_id AND NOT is_bye)
  THEN
    RAISE EXCEPTION 'A criação não materializou todas as partidas da prévia v8.';
  END IF;

  SELECT jsonb_build_object(
    'algorithm_version','async-exact-v8',
    'groups',COALESCE((SELECT jsonb_agg(jsonb_build_object('competition',competitions.competition_key,'group',groups.group_number,'teams',(SELECT jsonb_agg(group_teams.team_id ORDER BY group_teams.position) FROM public.championship_bracket_group_teams group_teams WHERE group_teams.group_id=groups.id)) ORDER BY competitions.position,groups.group_number) FROM public.championship_bracket_groups groups JOIN championship_bracket_preview_private.competitions competitions ON competitions.id=groups.competition_id WHERE groups.competition_id IN (SELECT id FROM championship_bracket_preview_private.competitions WHERE job_id=_job_id)),'[]'::jsonb),
    'group_matches',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'key',matches_table.logical_key,'slot_id',assignments_table.slot_id,
      'home_team_id',public_matches.home_team_id,'away_team_id',public_matches.away_team_id,
      'date',public_matches.scheduled_date,'location_key',slots_table.location_key,'location',public_matches.location,
      'court_key',slots_table.court_key,'court',public_matches.court_name,'start',public_matches.start_time,'end',public_matches.end_time,
      'match_number',assignments_table.match_number
    ) ORDER BY matches_table.logical_key)
      FROM championship_bracket_preview_private.assignments assignments_table
      JOIN championship_bracket_preview_private.matches matches_table ON matches_table.id=assignments_table.match_id
      JOIN championship_bracket_preview_private.slots slots_table ON slots_table.id=assignments_table.slot_id
      JOIN public.matches public_matches ON public_matches.id=matches_table.id
      WHERE assignments_table.job_id=_job_id),'[]'::jsonb),
    'knockout_matches',COALESCE((SELECT jsonb_agg(jsonb_build_object('key',knockout_matches.logical_key,'phase',knockout_matches.phase,'round',knockout_matches.round_number,'slot',knockout_matches.slot_number,'home_source_type',knockout_matches.home_source_type,'home_source',knockout_matches.home_source_reference,'away_source_type',knockout_matches.away_source_type,'away_source',knockout_matches.away_source_reference,'predecessors',array_remove(ARRAY[bracket_matches.source_home_bracket_match_id,bracket_matches.source_away_bracket_match_id]::uuid[],NULL),'is_bye',bracket_matches.is_bye,'date',reservations.scheduled_date,'location_key',reservations.location_group_id,'location',reservations.location_name,'court_key',reservations.court_group_id,'court',reservations.court_name,'start',reservations.start_at,'end',reservations.end_at,'manual_final',COALESCE(reservations.is_manual_final,false)) ORDER BY knockout_matches.round_number,knockout_matches.slot_number,knockout_matches.logical_key) FROM championship_bracket_preview_private.knockout_matches knockout_matches JOIN public.championship_bracket_matches bracket_matches ON bracket_matches.id=knockout_matches.id LEFT JOIN public.championship_bracket_knockout_schedule_reservations reservations ON reservations.bracket_edition_id=edition_id AND reservations.competition_id=knockout_matches.competition_id AND reservations.round_number=knockout_matches.round_number AND reservations.slot_number=knockout_matches.slot_number AND reservations.is_third_place=(knockout_matches.phase='THIRD_PLACE') WHERE knockout_matches.job_id=_job_id),'[]'::jsonb)
  ) INTO persisted_manifest;
  persisted_signature := encode(extensions.digest(convert_to(persisted_manifest::text,'UTF8'),'sha256'),'hex');
  IF persisted_signature <> job_record.generation_signature THEN
    RAISE EXCEPTION 'A programação inserida divergiu estruturalmente da prévia v8; nenhuma alteração foi confirmada.';
  END IF;
  UPDATE public.championships SET status='UPCOMING' WHERE id=_championship_id;
  UPDATE championship_bracket_preview_private.jobs SET status='CONSUMED',stage='Campeonato criado',result_edition_id=edition_id,consumed_at=now(),updated_at=now() WHERE id=_job_id;
  RETURN edition_id;
END;
$function$;

ALTER FUNCTION public.create_championship_knockout_match_schedule(UUID, UUID)
RENAME TO create_championship_knockout_match_schedule_v7;

CREATE OR REPLACE FUNCTION public.create_championship_knockout_match_schedule(
  _championship_id UUID,
  _bracket_match_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  bracket_match_record RECORD;
  reservation_record RECORD;
  new_match_id UUID;
BEGIN
  SELECT
    bracket_matches_table.id,
    bracket_matches_table.bracket_edition_id,
    bracket_matches_table.competition_id,
    bracket_matches_table.match_id,
    bracket_matches_table.home_team_id,
    bracket_matches_table.away_team_id,
    bracket_matches_table.round_number,
    bracket_matches_table.slot_number,
    bracket_matches_table.is_third_place,
    competitions_table.division,
    competitions_table.naipe,
    competitions_table.sport_id,
    editions_table.season_year,
    editions_table.championship_id,
    editions_table.payload_snapshot ->> 'exact_preview_algorithm_version'
      AS exact_preview_algorithm_version
  INTO bracket_match_record
  FROM public.championship_bracket_matches AS bracket_matches_table
  JOIN public.championship_bracket_competitions AS competitions_table
    ON competitions_table.id = bracket_matches_table.competition_id
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = bracket_matches_table.bracket_edition_id
  WHERE bracket_matches_table.id = _bracket_match_id
  LIMIT 1;

  IF bracket_match_record.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF bracket_match_record.exact_preview_algorithm_version
    IS DISTINCT FROM 'async-exact-v8'
  THEN
    RETURN public.create_championship_knockout_match_schedule_v7(
      _championship_id,
      _bracket_match_id
    );
  END IF;

  IF bracket_match_record.championship_id <> _championship_id THEN
    RAISE EXCEPTION
      'A partida eliminatória % não pertence ao campeonato informado.',
      _bracket_match_id;
  END IF;

  IF bracket_match_record.match_id IS NOT NULL THEN
    RETURN bracket_match_record.match_id;
  END IF;

  IF bracket_match_record.home_team_id IS NULL
    OR bracket_match_record.away_team_id IS NULL
  THEN
    RETURN NULL;
  END IF;

  SELECT reservations_table.*
  INTO reservation_record
  FROM public.championship_bracket_knockout_schedule_reservations
    AS reservations_table
  WHERE reservations_table.bracket_edition_id =
      bracket_match_record.bracket_edition_id
    AND reservations_table.competition_id =
      bracket_match_record.competition_id
    AND reservations_table.round_number =
      bracket_match_record.round_number
    AND reservations_table.slot_number =
      bracket_match_record.slot_number
    AND reservations_table.is_third_place =
      bracket_match_record.is_third_place
  LIMIT 1;

  IF reservation_record.id IS NULL THEN
    RAISE EXCEPTION
      'A partida eliminatória v8 % não possui reserva estrutural aprovada na Etapa 13.',
      _bracket_match_id;
  END IF;

  IF reservation_record.scheduled_date IS NULL
    OR reservation_record.location_name IS NULL
    OR reservation_record.court_name IS NULL
    OR reservation_record.start_at IS NULL
    OR reservation_record.end_at IS NULL
  THEN
    RAISE EXCEPTION
      'A reserva estrutural da partida eliminatória v8 % está incompleta.',
      _bracket_match_id;
  END IF;

  PERFORM set_config(
    'app.skip_queue_trigger',
    'true',
    true
  );

  PERFORM set_config(
    'app.skip_match_conflict_trigger',
    'true',
    true
  );

  INSERT INTO public.matches (
    championship_id,
    division,
    naipe,
    sport_id,
    home_team_id,
    away_team_id,
    location,
    court_name,
    scheduled_date,
    queue_position,
    scheduled_slot,
    start_time,
    end_time,
    season_year,
    status
  )
  VALUES (
    _championship_id,
    bracket_match_record.division,
    bracket_match_record.naipe,
    bracket_match_record.sport_id,
    bracket_match_record.home_team_id,
    bracket_match_record.away_team_id,
    reservation_record.location_name,
    reservation_record.court_name,
    reservation_record.scheduled_date,
    reservation_record.queue_position,
    reservation_record.scheduled_slot,
    reservation_record.start_at,
    reservation_record.end_at,
    bracket_match_record.season_year,
    'SCHEDULED'::public.match_status
  )
  RETURNING id
  INTO new_match_id;

  UPDATE public.championship_bracket_matches
  SET match_id = new_match_id
  WHERE id = _bracket_match_id;

  PERFORM set_config(
    'app.skip_match_conflict_trigger',
    'false',
    true
  );

  PERFORM set_config(
    'app.skip_queue_trigger',
    'false',
    true
  );

  RETURN new_match_id;

EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config(
      'app.skip_match_conflict_trigger',
      'false',
      true
    );

    PERFORM set_config(
      'app.skip_queue_trigger',
      'false',
      true
    );

    RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_championship_knockout_match_schedule_v7 (UUID, UUID)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.create_championship_knockout_match_schedule (UUID, UUID)
FROM PUBLIC, anon, authenticated;

GRANT
EXECUTE ON FUNCTION public.create_championship_knockout_match_schedule (UUID, UUID) TO service_role;

ALTER FUNCTION public.ensure_championship_knockout_next_round_match(
  UUID,
  UUID,
  INTEGER,
  INTEGER
)
RENAME TO ensure_championship_knockout_next_round_match_v7;

CREATE OR REPLACE FUNCTION public.ensure_championship_knockout_next_round_match(
  _championship_id UUID,
  _competition_id UUID,
  _source_round_number INTEGER,
  _next_slot_number INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  competition_record RECORD;
  source_home_bracket_match RECORD;
  source_away_bracket_match RECORD;
  target_bracket_match RECORD;
  existing_public_match RECORD;
  next_round_number INTEGER;
  resolved_home_team_id UUID;
  resolved_away_team_id UUID;
BEGIN
  IF _next_slot_number < 1
    OR _source_round_number < 1
  THEN
    RETURN NULL;
  END IF;

  SELECT
    competitions_table.id,
    competitions_table.bracket_edition_id,
    editions_table.championship_id,
    editions_table.payload_snapshot ->> 'exact_preview_algorithm_version'
      AS exact_preview_algorithm_version
  INTO competition_record
  FROM public.championship_bracket_competitions AS competitions_table
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = competitions_table.bracket_edition_id
  WHERE competitions_table.id = _competition_id
  LIMIT 1;

  IF competition_record.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF competition_record.exact_preview_algorithm_version
    IS DISTINCT FROM 'async-exact-v8'
  THEN
    RETURN public.ensure_championship_knockout_next_round_match_v7(
      _championship_id,
      _competition_id,
      _source_round_number,
      _next_slot_number
    );
  END IF;

  IF competition_record.championship_id <> _championship_id THEN
    RAISE EXCEPTION
      'A competição % não pertence ao campeonato informado.',
      _competition_id;
  END IF;

  SELECT
    bracket_matches_table.id,
    bracket_matches_table.winner_team_id,
    bracket_matches_table.next_bracket_match_id
  INTO source_home_bracket_match
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false
    AND bracket_matches_table.round_number = _source_round_number
    AND bracket_matches_table.slot_number =
      ((_next_slot_number * 2) - 1)
  LIMIT 1;

  SELECT
    bracket_matches_table.id,
    bracket_matches_table.winner_team_id,
    bracket_matches_table.next_bracket_match_id
  INTO source_away_bracket_match
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false
    AND bracket_matches_table.round_number = _source_round_number
    AND bracket_matches_table.slot_number =
      (_next_slot_number * 2)
  LIMIT 1;

  IF source_home_bracket_match.id IS NULL
    OR source_away_bracket_match.id IS NULL
  THEN
    RAISE EXCEPTION
      'As partidas predecessoras da rodada %, slot %, não existem na estrutura eliminatória v8.',
      _source_round_number,
      _next_slot_number;
  END IF;

  next_round_number := _source_round_number + 1;

  resolved_home_team_id :=
    source_home_bracket_match.winner_team_id;

  resolved_away_team_id :=
    source_away_bracket_match.winner_team_id;

  SELECT
    bracket_matches_table.id,
    bracket_matches_table.match_id,
    bracket_matches_table.home_team_id,
    bracket_matches_table.away_team_id,
    bracket_matches_table.is_bye,
    bracket_matches_table.source_home_bracket_match_id,
    bracket_matches_table.source_away_bracket_match_id,
    bracket_matches_table.planned_scheduled_date,
    bracket_matches_table.planned_start_time,
    bracket_matches_table.planned_end_time,
    bracket_matches_table.planned_location_group_id,
    bracket_matches_table.planned_court_group_id,
    bracket_matches_table.planned_location_name,
    bracket_matches_table.planned_court_name
  INTO target_bracket_match
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false
    AND bracket_matches_table.round_number = next_round_number
    AND bracket_matches_table.slot_number = _next_slot_number
  LIMIT 1;

  IF target_bracket_match.id IS NULL THEN
    RAISE EXCEPTION
      'A próxima partida da rodada %, slot %, não existe na estrutura aprovada pela prévia v8.',
      next_round_number,
      _next_slot_number;
  END IF;

  IF target_bracket_match.source_home_bracket_match_id
      IS DISTINCT FROM source_home_bracket_match.id
    OR target_bracket_match.source_away_bracket_match_id
      IS DISTINCT FROM source_away_bracket_match.id
  THEN
    RAISE EXCEPTION
      'As dependências da rodada %, slot %, divergem da estrutura eliminatória aprovada na prévia v8.',
      next_round_number,
      _next_slot_number;
  END IF;

  IF source_home_bracket_match.next_bracket_match_id
      IS DISTINCT FROM target_bracket_match.id
    OR source_away_bracket_match.next_bracket_match_id
      IS DISTINCT FROM target_bracket_match.id
  THEN
    RAISE EXCEPTION
      'O encadeamento da rodada %, slot %, diverge da estrutura eliminatória aprovada na prévia v8.',
      next_round_number,
      _next_slot_number;
  END IF;

  IF target_bracket_match.is_bye THEN
    RAISE EXCEPTION
      'Uma partida posterior à primeira rodada foi marcada como BYE na estrutura eliminatória v8: rodada %, slot %.',
      next_round_number,
      _next_slot_number;
  END IF;

  IF target_bracket_match.match_id IS NOT NULL THEN
    SELECT
      matches_table.id,
      matches_table.home_team_id,
      matches_table.away_team_id
    INTO existing_public_match
    FROM public.matches AS matches_table
    WHERE matches_table.id = target_bracket_match.match_id
    LIMIT 1;

    IF existing_public_match.id IS NULL THEN
      RAISE EXCEPTION
        'A partida eliminatória v8 % referencia um jogo inexistente.',
        target_bracket_match.id;
    END IF;

    IF resolved_home_team_id IS NOT NULL
      AND resolved_away_team_id IS NOT NULL
      AND (
        existing_public_match.home_team_id
          IS DISTINCT FROM resolved_home_team_id
        OR existing_public_match.away_team_id
          IS DISTINCT FROM resolved_away_team_id
      )
    THEN
      RAISE EXCEPTION
        'Os participantes da partida eliminatória v8 % divergem dos vencedores das partidas predecessoras.',
        target_bracket_match.id;
    END IF;

    RETURN target_bracket_match.id;
  END IF;

  UPDATE public.championship_bracket_matches AS bracket_matches_table
  SET
    home_team_id = resolved_home_team_id,
    away_team_id = resolved_away_team_id,
    winner_team_id = NULL
  WHERE bracket_matches_table.id = target_bracket_match.id;

  IF resolved_home_team_id IS NULL
    OR resolved_away_team_id IS NULL
  THEN
    RETURN target_bracket_match.id;
  END IF;

  IF target_bracket_match.planned_scheduled_date IS NULL
    OR target_bracket_match.planned_start_time IS NULL
    OR target_bracket_match.planned_end_time IS NULL
    OR target_bracket_match.planned_location_group_id IS NULL
    OR target_bracket_match.planned_court_group_id IS NULL
    OR target_bracket_match.planned_location_name IS NULL
    OR target_bracket_match.planned_court_name IS NULL
  THEN
    RAISE EXCEPTION
      'A partida eliminatória v8 da rodada %, slot %, não possui programação estrutural completa.',
      next_round_number,
      _next_slot_number;
  END IF;

  PERFORM public.create_championship_knockout_match_schedule(
    _championship_id,
    target_bracket_match.id
  );

  RETURN target_bracket_match.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_championship_knockout_next_round_match_v7 (UUID, UUID, INTEGER, INTEGER)
FROM
    PUBLIC,
    anon,
    authenticated,
    service_role;

REVOKE ALL ON FUNCTION public.ensure_championship_knockout_next_round_match (UUID, UUID, INTEGER, INTEGER)
FROM PUBLIC;

GRANT
EXECUTE ON FUNCTION public.ensure_championship_knockout_next_round_match (UUID, UUID, INTEGER, INTEGER) TO anon,
authenticated,
service_role;

ALTER FUNCTION public.ensure_championship_knockout_third_place_match(
  UUID,
  UUID,
  INTEGER
)
RENAME TO ensure_championship_knockout_third_place_match_v7;

CREATE OR REPLACE FUNCTION public.ensure_championship_knockout_third_place_match(
  _championship_id UUID,
  _competition_id UUID,
  _semifinal_round_number INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  competition_record RECORD;
  semifinal_home_match RECORD;
  semifinal_away_match RECORD;
  third_place_match RECORD;
  existing_public_match RECORD;
  third_place_home_team_id UUID;
  third_place_away_team_id UUID;
BEGIN
  SELECT
    competitions_table.id,
    competitions_table.bracket_edition_id,
    competitions_table.third_place_mode,
    editions_table.championship_id,
    editions_table.payload_snapshot ->> 'exact_preview_algorithm_version'
      AS exact_preview_algorithm_version
  INTO competition_record
  FROM public.championship_bracket_competitions AS competitions_table
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = competitions_table.bracket_edition_id
  WHERE competitions_table.id = _competition_id
  LIMIT 1;

  IF competition_record.id IS NULL
    OR competition_record.third_place_mode
      <> 'MATCH'::public.bracket_third_place_mode
    OR _semifinal_round_number < 1
  THEN
    RETURN NULL;
  END IF;

  IF competition_record.exact_preview_algorithm_version
    IS DISTINCT FROM 'async-exact-v8'
  THEN
    RETURN public.ensure_championship_knockout_third_place_match_v7(
      _championship_id,
      _competition_id,
      _semifinal_round_number
    );
  END IF;

  IF competition_record.championship_id <> _championship_id THEN
    RAISE EXCEPTION
      'A competição % não pertence ao campeonato informado.',
      _competition_id;
  END IF;

  SELECT
    bracket_matches_table.id
  INTO semifinal_home_match
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false
    AND bracket_matches_table.round_number = _semifinal_round_number
    AND bracket_matches_table.slot_number = 1
  LIMIT 1;

  SELECT
    bracket_matches_table.id
  INTO semifinal_away_match
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false
    AND bracket_matches_table.round_number = _semifinal_round_number
    AND bracket_matches_table.slot_number = 2
  LIMIT 1;

  IF semifinal_home_match.id IS NULL
    OR semifinal_away_match.id IS NULL
  THEN
    RAISE EXCEPTION
      'As semifinais necessárias para o terceiro lugar não existem na estrutura v8 da competição %.',
      _competition_id;
  END IF;

  third_place_home_team_id :=
    public.resolve_championship_bracket_match_loser_team_id(
      semifinal_home_match.id
    );

  third_place_away_team_id :=
    public.resolve_championship_bracket_match_loser_team_id(
      semifinal_away_match.id
    );

  SELECT
    bracket_matches_table.id,
    bracket_matches_table.match_id,
    bracket_matches_table.home_team_id,
    bracket_matches_table.away_team_id,
    bracket_matches_table.source_home_bracket_match_id,
    bracket_matches_table.source_away_bracket_match_id,
    bracket_matches_table.is_bye,
    bracket_matches_table.planned_scheduled_date,
    bracket_matches_table.planned_start_time,
    bracket_matches_table.planned_end_time,
    bracket_matches_table.planned_location_group_id,
    bracket_matches_table.planned_court_group_id,
    bracket_matches_table.planned_location_name,
    bracket_matches_table.planned_court_name
  INTO third_place_match
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = true
  LIMIT 1;

  IF third_place_match.id IS NULL THEN
    RAISE EXCEPTION
      'A disputa de terceiro lugar não existe na estrutura aprovada pela prévia v8 da competição %.',
      _competition_id;
  END IF;

  IF third_place_match.source_home_bracket_match_id
      IS DISTINCT FROM semifinal_home_match.id
    OR third_place_match.source_away_bracket_match_id
      IS DISTINCT FROM semifinal_away_match.id
  THEN
    RAISE EXCEPTION
      'As dependências da disputa de terceiro lugar divergem da estrutura aprovada pela prévia v8.';
  END IF;

  IF third_place_match.is_bye THEN
    RAISE EXCEPTION
      'A disputa de terceiro lugar foi marcada incorretamente como BYE na estrutura v8.';
  END IF;

  IF third_place_match.match_id IS NOT NULL THEN
    SELECT
      matches_table.id,
      matches_table.home_team_id,
      matches_table.away_team_id
    INTO existing_public_match
    FROM public.matches AS matches_table
    WHERE matches_table.id = third_place_match.match_id
    LIMIT 1;

    IF existing_public_match.id IS NULL THEN
      RAISE EXCEPTION
        'A disputa de terceiro lugar v8 referencia um jogo inexistente.';
    END IF;

    IF third_place_home_team_id IS NOT NULL
      AND third_place_away_team_id IS NOT NULL
      AND (
        existing_public_match.home_team_id
          IS DISTINCT FROM third_place_home_team_id
        OR existing_public_match.away_team_id
          IS DISTINCT FROM third_place_away_team_id
      )
    THEN
      RAISE EXCEPTION
        'Os participantes da disputa de terceiro lugar divergem dos perdedores das semifinais.';
    END IF;

    RETURN third_place_match.id;
  END IF;

  UPDATE public.championship_bracket_matches AS bracket_matches_table
  SET
    home_team_id = third_place_home_team_id,
    away_team_id = third_place_away_team_id,
    winner_team_id = NULL,
    is_bye = false
  WHERE bracket_matches_table.id = third_place_match.id;

  IF third_place_home_team_id IS NULL
    OR third_place_away_team_id IS NULL
  THEN
    RETURN third_place_match.id;
  END IF;

  IF third_place_match.planned_scheduled_date IS NULL
    OR third_place_match.planned_start_time IS NULL
    OR third_place_match.planned_end_time IS NULL
    OR third_place_match.planned_location_group_id IS NULL
    OR third_place_match.planned_court_group_id IS NULL
    OR third_place_match.planned_location_name IS NULL
    OR third_place_match.planned_court_name IS NULL
  THEN
    RAISE EXCEPTION
      'A disputa de terceiro lugar v8 não possui programação estrutural completa aprovada.';
  END IF;

  PERFORM public.create_championship_knockout_match_schedule(
    _championship_id,
    third_place_match.id
  );

  RETURN third_place_match.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_championship_knockout_third_place_match_v7 (UUID, UUID, INTEGER)
FROM
    PUBLIC,
    anon,
    authenticated,
    service_role;

REVOKE ALL ON FUNCTION public.ensure_championship_knockout_third_place_match (UUID, UUID, INTEGER)
FROM PUBLIC;

GRANT
EXECUTE ON FUNCTION public.ensure_championship_knockout_third_place_match (UUID, UUID, INTEGER) TO anon,
authenticated,
service_role;

CREATE OR REPLACE FUNCTION public.hydrate_championship_bracket_preview_v8_knockout(
  _championship_id UUID,
  _competition_id UUID,
  _bracket_edition_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
#variable_conflict use_variable
DECLARE
  competition_record RECORD;
  ranking_record RECORD;
  qualified_team_ids UUID[] := ARRAY[]::UUID[];
  group_count_value INTEGER;
  all_groups_finished BOOLEAN := false;
  direct_qualified_team_count INTEGER;
  target_bracket_size INTEGER := 1;
  total_rounds INTEGER := 0;
  should_expand_with_best_second_placed_teams BOOLEAN;
  should_include_best_second_placed_teams BOOLEAN;
  should_use_cross_groups_pairing BOOLEAN := false;
  additional_qualification_rank INTEGER;
  pending_tie_breaks_count INTEGER;
  standard_seed_order INTEGER[] := ARRAY[]::INTEGER[];
  seed_iter INTEGER;
  slot_index INTEGER;
  source_round_number INTEGER;
  next_slot_number INTEGER;
  home_seed_index INTEGER;
  away_seed_index INTEGER;
  home_team_id UUID;
  away_team_id UUID;
  first_round_match_id UUID;
  first_round_match_record RECORD;
  expected_is_bye BOOLEAN;
BEGIN
  SELECT
    competitions_table.id,
    competitions_table.bracket_edition_id,
    competitions_table.qualifiers_per_group,
    competitions_table.should_complete_knockout_with_best_second_placed_teams,
    competitions_table.third_place_mode,
    competitions_table.knockout_pairing_mode,
    competitions_table.naipe,
    competitions_table.division,
    sports_table.code AS sport_code
  INTO competition_record
  FROM public.championship_bracket_competitions AS competitions_table
  JOIN public.sports AS sports_table ON sports_table.id = competitions_table.sport_id
  WHERE competitions_table.id = _competition_id
    AND competitions_table.bracket_edition_id = _bracket_edition_id
  LIMIT 1;

  IF competition_record.id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.championship_bracket_editions AS editions_table
      WHERE editions_table.id = _bracket_edition_id
        AND editions_table.payload_snapshot ->> 'exact_preview_algorithm_version' = 'async-exact-v8'
    )
  THEN
    RETURN NULL;
  END IF;

  SELECT
    count(*)::integer,
    bool_and(group_statuses.is_group_finished)
  INTO group_count_value, all_groups_finished
  FROM (
    SELECT
      groups_table.id,
      (
        count(bracket_matches_table.match_id) > 0
        AND count(*) FILTER (
          WHERE matches_table.status = 'FINISHED'::public.match_status
        ) = count(bracket_matches_table.match_id)
      ) AS is_group_finished
    FROM public.championship_bracket_groups AS groups_table
    LEFT JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.group_id = groups_table.id
      AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE groups_table.competition_id = _competition_id
    GROUP BY groups_table.id
  ) AS group_statuses;

  IF group_count_value < 1 OR all_groups_finished IS NOT TRUE THEN
    RETURN _competition_id;
  END IF;

  direct_qualified_team_count := group_count_value * competition_record.qualifiers_per_group;
  should_expand_with_best_second_placed_teams :=
    competition_record.qualifiers_per_group = 1
    AND competition_record.should_complete_knockout_with_best_second_placed_teams = true;

  IF should_expand_with_best_second_placed_teams THEN
    WHILE target_bracket_size <= direct_qualified_team_count LOOP
      target_bracket_size := target_bracket_size * 2;
    END LOOP;
  ELSE
    WHILE target_bracket_size < direct_qualified_team_count LOOP
      target_bracket_size := target_bracket_size * 2;
    END LOOP;
  END IF;

  IF target_bracket_size < 2 THEN
    RETURN _competition_id;
  END IF;

  WHILE power(2, total_rounds)::integer < target_bracket_size LOOP
    total_rounds := total_rounds + 1;
  END LOOP;

  should_include_best_second_placed_teams :=
    competition_record.qualifiers_per_group = 1
    AND target_bracket_size > direct_qualified_team_count;
  should_use_cross_groups_pairing :=
    competition_record.knockout_pairing_mode = 'FUTEBOL_SOCIETY_FEM_ACCESS_CROSS_GROUPS'
    AND competition_record.sport_code = 'FUTEBOL_SOCIETY'
    AND competition_record.naipe = 'FEMININO'
    AND competition_record.division = 'DIVISAO_ACESSO'
    AND group_count_value = 2
    AND competition_record.qualifiers_per_group = 1
    AND should_include_best_second_placed_teams
    AND target_bracket_size = 4;
  additional_qualification_rank := CASE
    WHEN target_bracket_size <= direct_qualified_team_count THEN NULL
    WHEN competition_record.qualifiers_per_group = 1 THEN 2
    WHEN competition_record.qualifiers_per_group = 2 THEN 3
    ELSE NULL
  END;

  SELECT count(*)
  INTO pending_tie_breaks_count
  FROM jsonb_array_elements(
    public.get_championship_bracket_pending_tie_breaks(_championship_id, _bracket_edition_id)
  ) AS tie_break
  WHERE (tie_break ->> 'competition_id')::uuid = _competition_id
    AND (
      tie_break ->> 'context_type' <> 'QUALIFICATION_POOL'
      OR (
        additional_qualification_rank IS NOT NULL
        AND (tie_break ->> 'qualification_rank')::integer = additional_qualification_rank
      )
    );

  IF pending_tie_breaks_count > 0 THEN
    RETURN _competition_id;
  END IF;

  IF should_use_cross_groups_pairing THEN
    FOR ranking_record IN
      WITH ordered_groups AS (
        SELECT groups_table.id AS group_id, groups_table.group_number
        FROM public.championship_bracket_groups AS groups_table
        WHERE groups_table.competition_id = _competition_id
      )
      SELECT rankings_table.team_id
      FROM ordered_groups
      CROSS JOIN generate_series(1, 2) AS qualifiers(rank_number)
      LEFT JOIN public.get_championship_bracket_competition_group_rankings(
        _championship_id,
        _competition_id
      ) AS rankings_table
        ON rankings_table.group_id = ordered_groups.group_id
        AND rankings_table.team_rank = qualifiers.rank_number
      ORDER BY ordered_groups.group_number, qualifiers.rank_number
    LOOP
      qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
    END LOOP;
  ELSE
    FOR ranking_record IN
      WITH ordered_groups AS (
      SELECT groups_table.id AS group_id, groups_table.group_number
      FROM public.championship_bracket_groups AS groups_table
      WHERE groups_table.competition_id = _competition_id
    )
    SELECT rankings_table.team_id
    FROM ordered_groups
    CROSS JOIN generate_series(1, competition_record.qualifiers_per_group) AS qualifiers(rank_number)
    LEFT JOIN public.get_championship_bracket_competition_group_rankings(
      _championship_id,
      _competition_id
    ) AS rankings_table
      ON rankings_table.group_id = ordered_groups.group_id
      AND rankings_table.team_rank = qualifiers.rank_number
    LEFT JOIN public.get_championship_bracket_competition_qualification_pool_rankings(
      _championship_id,
      _competition_id
    ) AS pool_rankings
      ON pool_rankings.team_id = rankings_table.team_id
      AND pool_rankings.qualification_rank = qualifiers.rank_number
    ORDER BY
      qualifiers.rank_number ASC,
      CASE
        WHEN should_include_best_second_placed_teams
          THEN COALESCE(pool_rankings.pool_rank, ordered_groups.group_number + 1000)
        ELSE ordered_groups.group_number
      END ASC
    LOOP
      qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
    END LOOP;
  END IF;

  IF additional_qualification_rank IS NOT NULL THEN
    FOR ranking_record IN
      SELECT qualification_pool_rankings.team_id
      FROM public.get_championship_bracket_competition_qualification_pool_rankings(
        _championship_id,
        _competition_id
      ) AS qualification_pool_rankings
      WHERE qualification_pool_rankings.qualification_rank = additional_qualification_rank
      ORDER BY qualification_pool_rankings.pool_rank ASC
    LOOP
      EXIT WHEN COALESCE(cardinality(qualified_team_ids), 0) >= target_bracket_size;

      IF ranking_record.team_id IS NOT NULL
        AND NOT ranking_record.team_id = ANY(qualified_team_ids) THEN
        qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
      END IF;
    END LOOP;
  END IF;

  WHILE COALESCE(cardinality(qualified_team_ids), 0) < target_bracket_size LOOP
    qualified_team_ids := array_append(qualified_team_ids, NULL);
  END LOOP;
  qualified_team_ids := qualified_team_ids[1:target_bracket_size];

  FOR seed_iter IN 1..(target_bracket_size / 2) LOOP
    standard_seed_order := array_append(standard_seed_order, seed_iter);
    standard_seed_order := array_append(standard_seed_order, target_bracket_size + 1 - seed_iter);
  END LOOP;

  IF (
    SELECT count(*)
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number = 1
  ) <> target_bracket_size / 2 THEN
    RAISE EXCEPTION 'A estrutura eliminatória persistida diverge do chaveamento exato aprovado.';
  END IF;

  FOR slot_index IN 1..(target_bracket_size / 2) LOOP
    home_seed_index := standard_seed_order[((slot_index - 1) * 2) + 1];
    away_seed_index := standard_seed_order[((slot_index - 1) * 2) + 2];
    home_team_id := qualified_team_ids[home_seed_index];
    away_team_id := qualified_team_ids[away_seed_index];

    SELECT
  bracket_matches_table.id,
  bracket_matches_table.is_bye,
  bracket_matches_table.planned_scheduled_date,
  bracket_matches_table.planned_start_time,
  bracket_matches_table.planned_end_time,
  bracket_matches_table.planned_location_group_id,
  bracket_matches_table.planned_court_group_id,
  bracket_matches_table.planned_location_name,
  bracket_matches_table.planned_court_name
INTO first_round_match_record
FROM public.championship_bracket_matches AS bracket_matches_table
WHERE bracket_matches_table.competition_id = _competition_id
  AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
  AND bracket_matches_table.is_third_place = false
  AND bracket_matches_table.round_number = 1
  AND bracket_matches_table.slot_number = slot_index
LIMIT 1;

IF first_round_match_record.id IS NULL THEN
  RAISE EXCEPTION
    'A partida estrutural da primeira rodada, slot %, não existe na programação exata v8.',
    slot_index;
END IF;

expected_is_bye :=
  (home_team_id IS NULL) <> (away_team_id IS NULL);

IF home_team_id IS NULL
  AND away_team_id IS NULL
THEN
  RAISE EXCEPTION
    'A classificação real não resolveu nenhum participante para a primeira rodada, slot %, da competição %.',
    slot_index,
    _competition_id;
END IF;

IF first_round_match_record.is_bye IS DISTINCT FROM expected_is_bye THEN
  RAISE EXCEPTION
    'A classificação real divergiu da estrutura eliminatória aprovada na prévia v8 para a primeira rodada, slot %. BYE projetado: %, BYE real: %.',
    slot_index,
    first_round_match_record.is_bye,
    expected_is_bye;
END IF;

IF NOT expected_is_bye
  AND (
    first_round_match_record.planned_scheduled_date IS NULL
    OR first_round_match_record.planned_start_time IS NULL
    OR first_round_match_record.planned_end_time IS NULL
    OR first_round_match_record.planned_location_group_id IS NULL
    OR first_round_match_record.planned_court_group_id IS NULL
    OR first_round_match_record.planned_location_name IS NULL
    OR first_round_match_record.planned_court_name IS NULL
  )
THEN
  RAISE EXCEPTION
    'A partida real da primeira rodada, slot %, não possui programação estrutural completa aprovada na prévia v8.',
    slot_index;
END IF;

    UPDATE public.championship_bracket_matches AS bracket_matches_table
    SET
      home_team_id = home_team_id,
      away_team_id = away_team_id,
      winner_team_id = CASE
        WHEN home_team_id IS NULL AND away_team_id IS NOT NULL THEN away_team_id
        WHEN away_team_id IS NULL AND home_team_id IS NOT NULL THEN home_team_id
        ELSE NULL
      END,
      is_bye = first_round_match_record.is_bye
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number = 1
      AND bracket_matches_table.slot_number = slot_index
    RETURNING bracket_matches_table.id INTO first_round_match_id;

    IF home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN
      PERFORM public.create_championship_knockout_match_schedule(
        _championship_id,
        first_round_match_id
      );
    END IF;
  END LOOP;

  FOR source_round_number IN 1..(total_rounds - 1) LOOP
    FOR next_slot_number IN 1..power(2, total_rounds - source_round_number - 1)::integer LOOP
      PERFORM public.ensure_championship_knockout_next_round_match(
        _championship_id,
        _competition_id,
        source_round_number,
        next_slot_number
      );
    END LOOP;
  END LOOP;

  IF competition_record.third_place_mode =
    'MATCH'::public.bracket_third_place_mode
  AND total_rounds > 1
THEN
  PERFORM public.ensure_championship_knockout_third_place_match(
    _championship_id,
    _competition_id,
    total_rounds - 1
  );
END IF;

  PERFORM public.sync_championship_bracket_edition_status(_bracket_edition_id);
  RETURN _competition_id;
END;
$function$;

ALTER FUNCTION public.generate_championship_knockout_for_competition(UUID, UUID, UUID)
RENAME TO generate_championship_knockout_for_competition_v7;

CREATE OR REPLACE FUNCTION public.generate_championship_knockout_for_competition(
  _championship_id UUID,
  _competition_id UUID,
  _bracket_edition_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  resolved_edition_id UUID;
BEGIN
  SELECT competitions_table.bracket_edition_id
  INTO resolved_edition_id
  FROM public.championship_bracket_competitions AS competitions_table
  WHERE competitions_table.id = _competition_id
    AND (_bracket_edition_id IS NULL OR competitions_table.bracket_edition_id = _bracket_edition_id)
  LIMIT 1;

  IF resolved_edition_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.championship_bracket_editions AS editions_table
      WHERE editions_table.id = resolved_edition_id
        AND editions_table.payload_snapshot ->> 'exact_preview_algorithm_version' = 'async-exact-v8'
    )
  THEN
    RETURN public.hydrate_championship_bracket_preview_v8_knockout(
      _championship_id,
      _competition_id,
      resolved_edition_id
    );
  END IF;

  RETURN public.generate_championship_knockout_for_competition_v7(
    _championship_id,
    _competition_id,
    _bracket_edition_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.compact_v8_schedule_batch(_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  gap_record RECORD;
  candidate_slot_record RECORD;
  tier_record RECORD;
  branch_status TEXT := 'DEAD_END';
  attempt_started_at TIMESTAMPTZ;
  overall_deadline TIMESTAMPTZ;
  tier_deadline TIMESTAMPTZ;
  moved BOOLEAN := false;
  search_timed_out BOOLEAN := false;
  compaction_status TEXT;
  compaction_timeout_count INTEGER;
BEGIN
  overall_deadline := clock_timestamp() + interval '10 seconds';

  WITH assigned AS (
    SELECT
      assignments_table.match_id,
      slots_table.event_date,
      slots_table.location_key,
      slots_table.court_key,
      slots_table.start_at,
      slots_table.end_at,
      lead(assignments_table.match_id) OVER physical_order AS next_match_id,
      lead(slots_table.start_at) OVER physical_order AS next_start_at
    FROM championship_bracket_preview_private.assignments assignments_table
    JOIN championship_bracket_preview_private.slots slots_table
      ON slots_table.id = assignments_table.slot_id
    WHERE assignments_table.job_id = _job_id
    WINDOW physical_order AS (
      PARTITION BY
        slots_table.event_date,
        slots_table.location_key,
        slots_table.court_key
      ORDER BY
        slots_table.start_at,
        slots_table.end_at,
        assignments_table.match_id
    )
  ),
  gaps AS (
    SELECT
      assigned.*,
      format(
        '%s:%s:%s:%s',
        assigned.location_key,
        assigned.court_key,
        assigned.end_at,
        assigned.next_match_id
      ) AS gap_key
    FROM assigned
    WHERE assigned.next_start_at > assigned.end_at
  )
  SELECT gaps.*
  INTO gap_record
  FROM gaps
  WHERE NOT EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.compaction_gaps
      AS compaction_gaps
    WHERE compaction_gaps.job_id = _job_id
  AND compaction_gaps.gap_key = gaps.gap_key
  AND compaction_gaps.status = 'UNRESOLVED'
  )
  ORDER BY
    gaps.event_date,
    gaps.location_key,
    gaps.court_key,
    gaps.end_at,
    gaps.next_match_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'continue', false,
      'done', true
    );
  END IF;

  SELECT candidate_slots.*
  INTO candidate_slot_record
  FROM championship_bracket_preview_private.slots candidate_slots
  JOIN championship_bracket_preview_private.matches next_match
    ON next_match.id = gap_record.next_match_id
  JOIN championship_bracket_preview_private.competitions next_competition
    ON next_competition.id = next_match.competition_id
  WHERE candidate_slots.job_id = _job_id
    AND candidate_slots.event_date = gap_record.event_date
    AND candidate_slots.location_key = gap_record.location_key
    AND candidate_slots.court_key = gap_record.court_key
    AND candidate_slots.sport_id = next_competition.sport_id
    AND candidate_slots.start_at >= gap_record.end_at
    AND candidate_slots.end_at <= gap_record.next_start_at
    AND NOT EXISTS (
      SELECT 1
      FROM championship_bracket_preview_private.assignments occupied
      WHERE occupied.job_id = _job_id
        AND occupied.slot_id = candidate_slots.id
    )
  ORDER BY
    candidate_slots.start_at,
    candidate_slots.id
  LIMIT 1;

  IF candidate_slot_record.id IS NOT NULL
    AND championship_bracket_preview_private.is_match_slot_eligible_with_rest_gap(
      _job_id,
      gap_record.next_match_id,
      candidate_slot_record.id,
      4
    )
  THEN
    UPDATE championship_bracket_preview_private.assignments
    SET slot_id = candidate_slot_record.id
    WHERE job_id = _job_id
      AND match_id = gap_record.next_match_id;

    moved := true;
  ELSIF candidate_slot_record.id IS NOT NULL THEN
    FOR tier_record IN
      SELECT *
      FROM (
        VALUES
          ('FAST'::text, 2, 12, 4, 400),
          ('MEDIUM'::text, 6, 48, 16, 1800),
          ('DEEP'::text, 12, 120, 40, 7000)
      ) AS tiers(
        search_tier,
        max_depth,
        candidate_limit,
        relocation_limit,
        budget_ms
      )
    LOOP
      IF clock_timestamp() >= overall_deadline THEN
        search_timed_out := true;
        EXIT;
      END IF;

      tier_deadline := LEAST(
        overall_deadline,
        clock_timestamp()
          + make_interval(
              secs => tier_record.budget_ms::numeric / 1000
            )
      );

      attempt_started_at := clock_timestamp();

      branch_status :=
        championship_bracket_preview_private.try_place_match_backtracking_status(
          _job_id,
          gap_record.next_match_id,
          candidate_slot_record.id,
          ARRAY[]::UUID[],
          ARRAY[]::BIGINT[],
          0,
          tier_record.max_depth,
          tier_record.candidate_limit,
          tier_record.relocation_limit,
          NULL,
          3,
          tier_deadline
        );

      INSERT INTO championship_bracket_preview_private.relocation_attempt_metrics (
        job_id,
        match_id,
        phase,
        rest_gap,
        search_tier,
        candidate_rank,
        candidate_slot_id,
        max_depth,
        candidate_limit,
        relocation_limit,
        result_status,
        timeout_count,
        relocations_used,
        branches_examined,
        duration_ms
      )
      VALUES (
        _job_id,
        gap_record.next_match_id,
        'COMPACTION',
        4,
        tier_record.search_tier,
        1,
        candidate_slot_record.id,
        tier_record.max_depth,
        tier_record.candidate_limit,
        tier_record.relocation_limit,
        CASE
          WHEN branch_status = 'SUCCESS'
            THEN 'SUCCESS'
          WHEN branch_status = 'TIMEOUT'
            THEN tier_record.search_tier || '_TIMEOUT'
          ELSE tier_record.search_tier || '_DEAD_END'
        END,
        CASE
          WHEN branch_status = 'TIMEOUT' THEN 1
          ELSE 0
        END,
        0,
        0,
        (
          extract(
            epoch FROM clock_timestamp() - attempt_started_at
          ) * 1000
        )::integer
      );

      IF branch_status = 'SUCCESS' THEN
        moved := true;
        EXIT;
      END IF;

      IF branch_status = 'TIMEOUT' THEN
        search_timed_out := true;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  IF moved THEN
  DELETE FROM championship_bracket_preview_private.compaction_gaps
WHERE job_id = _job_id
  AND gap_key = gap_record.gap_key;
    RETURN jsonb_build_object(
      'continue', true,
      'done', false,
      'progressed', true
    );
  END IF;

  IF search_timed_out
  OR clock_timestamp() >= overall_deadline
THEN
  INSERT INTO championship_bracket_preview_private.compaction_gaps (
    job_id,
    gap_key,
    status,
    timeout_count
  )
  VALUES (
    _job_id,
    gap_record.gap_key,
    'RETRY',
    1
  )
  ON CONFLICT (job_id, gap_key)
  DO UPDATE SET
    timeout_count =
      championship_bracket_preview_private.compaction_gaps.timeout_count + 1,
    status =
      CASE
        WHEN championship_bracket_preview_private.compaction_gaps.timeout_count + 1 >= 3
          THEN 'UNRESOLVED'
        ELSE 'RETRY'
      END,
    attempted_at = now()
  RETURNING status, timeout_count
  INTO compaction_status, compaction_timeout_count;

  RETURN jsonb_build_object(
    'continue', true,
    'done', false,
    'progressed', false,
    'retry', compaction_status = 'RETRY',
    'search_limit', compaction_status = 'UNRESOLVED',
    'timeout_count', compaction_timeout_count,
    'gap_key', gap_record.gap_key
  );
END IF;

  INSERT INTO championship_bracket_preview_private.compaction_gaps (
    job_id,
    gap_key,
    status
  )
  VALUES (
    _job_id,
    gap_record.gap_key,
    'UNRESOLVED'
  )
  ON CONFLICT (job_id, gap_key)
  DO UPDATE SET
    status = EXCLUDED.status,
    attempted_at = now();

  RETURN jsonb_build_object(
    'continue', true,
    'done', false,
    'progressed', false,
    'retry', false,
    'gap_key', gap_record.gap_key
  );
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.schedule_v8_knockout_batch(_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  knockout_record RECORD;
  block_value JSONB;
  court_window RECORD;
  candidate_start_at TIMESTAMPTZ;
  candidate_end_at TIMESTAMPTZ;
  candidate_conflict_end_at TIMESTAMPTZ;
  dependency_ready_at TIMESTAMPTZ;
  group_ready_at TIMESTAMPTZ;
  sequence_position INTEGER;
  duration_value INTEGER;
BEGIN
  UPDATE championship_bracket_preview_private.knockout_matches knockout_matches
  SET start_at = group_ready.ready_at, end_at = group_ready.ready_at
  FROM (
    SELECT matches_table.competition_id, max(slots_table.end_at) AS ready_at
    FROM championship_bracket_preview_private.assignments assignments_table
    JOIN championship_bracket_preview_private.matches matches_table ON matches_table.id = assignments_table.match_id
    JOIN championship_bracket_preview_private.slots slots_table ON slots_table.id = assignments_table.slot_id
    WHERE assignments_table.job_id = _job_id
    GROUP BY matches_table.competition_id
  ) group_ready
  WHERE knockout_matches.job_id = _job_id
    AND knockout_matches.is_bye
    AND knockout_matches.competition_id = group_ready.competition_id;

  SELECT knockout_matches.*, competitions.sport_id, competitions.naipe, competitions.division, competitions.competition_key, jobs_table.payload
  INTO knockout_record
  FROM championship_bracket_preview_private.knockout_matches knockout_matches
  JOIN championship_bracket_preview_private.competitions competitions ON competitions.id = knockout_matches.competition_id
  JOIN championship_bracket_preview_private.jobs jobs_table ON jobs_table.id = knockout_matches.job_id
  WHERE knockout_matches.job_id = _job_id
    AND NOT knockout_matches.is_bye
    AND knockout_matches.scheduled_date IS NULL
    AND (
      knockout_matches.round_number = 1
      OR (
        SELECT count(*)
        FROM championship_bracket_preview_private.knockout_matches predecessors
        WHERE predecessors.id = ANY(knockout_matches.predecessor_match_ids)
          AND predecessors.end_at IS NOT NULL
      ) = cardinality(knockout_matches.predecessor_match_ids)
    )
  ORDER BY knockout_matches.round_number,
    CASE WHEN knockout_matches.phase = 'THIRD_PLACE' THEN 1 ELSE 0 END,
    knockout_matches.slot_number, knockout_matches.logical_key
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM championship_bracket_preview_private.knockout_matches knockout_matches
      WHERE knockout_matches.job_id = _job_id
        AND NOT knockout_matches.is_bye
        AND knockout_matches.scheduled_date IS NULL
    ) THEN
      RETURN jsonb_build_object(
        'continue', false,
        'diagnostics', jsonb_build_array(jsonb_build_object(
          'code', 'KNOCKOUT_DEPENDENCY_NOT_SCHEDULED',
          'message', 'Existem partidas eliminatórias sem uma dependência programada.'
        ))
      );
    END IF;
    RETURN jsonb_build_object('continue', false, 'done', true, 'diagnostics', '[]'::jsonb);
  END IF;

  IF knockout_record.round_number = 1 THEN
    SELECT max(slots_table.end_at) INTO group_ready_at
    FROM championship_bracket_preview_private.assignments assignments_table
    JOIN championship_bracket_preview_private.matches group_matches ON group_matches.id = assignments_table.match_id
    JOIN championship_bracket_preview_private.slots slots_table ON slots_table.id = assignments_table.slot_id
    WHERE assignments_table.job_id = _job_id AND group_matches.competition_id = knockout_record.competition_id;
    dependency_ready_at := group_ready_at;
  ELSE
    SELECT max(predecessors.end_at) INTO dependency_ready_at
    FROM championship_bracket_preview_private.knockout_matches predecessors
    WHERE predecessors.id = ANY(knockout_record.predecessor_match_ids);
  END IF;

  IF dependency_ready_at IS NULL THEN
    RETURN jsonb_build_object(
      'continue', false,
      'diagnostics', jsonb_build_array(jsonb_build_object(
        'code', 'KNOCKOUT_DEPENDENCY_NOT_SCHEDULED',
        'message', format('As dependências de %s não possuem término programado.', knockout_record.logical_key),
        'logical_key', knockout_record.logical_key
      ))
    );
  END IF;

  block_value := NULL;
  IF knockout_record.phase = 'FINAL' THEN
    SELECT block_item.value INTO block_value
    FROM jsonb_array_elements(COALESCE(knockout_record.payload -> 'knockout_program_blocks', '[]'::jsonb)) WITH ORDINALITY block_item(value, ordinality)
    WHERE block_item.value ->> 'phase' = 'FINAL'
      AND block_item.value ->> 'sport_id' = knockout_record.sport_id::text
      AND (
        COALESCE(NULLIF(block_item.value ->> 'division_scope', ''), 'ALL') = 'ALL'
        OR COALESCE(NULLIF(block_item.value ->> 'division_scope', ''), 'ALL') = knockout_record.division::text
      )
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(COALESCE(block_item.value -> 'naipe_sequence', '[]'::jsonb)) seq(value)
        WHERE seq.value = knockout_record.naipe::text
      )
    ORDER BY COALESCE(NULLIF(block_item.value ->> 'display_order', '')::integer, block_item.ordinality::integer)
    LIMIT 1;
  END IF;

  IF block_value IS NOT NULL THEN
    SELECT seq.ordinality::integer INTO sequence_position
    FROM jsonb_array_elements_text(COALESCE(block_value -> 'naipe_sequence', '[]'::jsonb)) WITH ORDINALITY seq(value, ordinality)
    WHERE seq.value = knockout_record.naipe::text;
    duration_value := COALESCE(NULLIF(block_value ->> 'match_duration_minutes_override', '')::integer, knockout_record.duration_minutes);
    candidate_start_at := public.combine_bracket_schedule_timestamp((block_value ->> 'date')::date, (block_value ->> 'start_time')::time)
      + make_interval(mins => (sequence_position - 1) * duration_value);
    candidate_end_at := candidate_start_at + make_interval(mins => duration_value);
    IF sequence_position IS NULL OR duration_value < 1
      OR candidate_end_at > public.combine_bracket_schedule_timestamp((block_value ->> 'date')::date, (block_value ->> 'end_time')::time)
    THEN
      RETURN jsonb_build_object('continue', false, 'diagnostics', jsonb_build_array(jsonb_build_object(
        'code', 'MANUAL_FINAL_CAPACITY_EXCEEDED',
        'message', format('O bloco manual não comporta a final %s.', knockout_record.logical_key),
        'logical_key', knockout_record.logical_key
      )));
    END IF;
    IF candidate_start_at < dependency_ready_at THEN
      RETURN jsonb_build_object('continue', false, 'diagnostics', jsonb_build_array(jsonb_build_object(
        'code', 'MANUAL_FINAL_DEPENDENCY_CONFLICT',
        'message', format('A final manual %s inicia antes das semifinal(is).', knockout_record.logical_key),
        'logical_key', knockout_record.logical_key
      )));
    END IF;
    IF EXISTS (
      SELECT 1 FROM championship_bracket_preview_private.knockout_matches occupied
      WHERE occupied.job_id = _job_id AND occupied.id <> knockout_record.id
        AND occupied.location_key = (block_value ->> 'location_key')::uuid
        AND occupied.court_key = (block_value ->> 'court_key')::uuid
        AND occupied.start_at < candidate_end_at AND occupied.end_at > candidate_start_at
    ) THEN
      RETURN jsonb_build_object('continue', false, 'diagnostics', jsonb_build_array(jsonb_build_object(
        'code', 'MANUAL_FINAL_OVERLAP',
        'message', format('O bloco manual conflita com outra partida em %s.', knockout_record.logical_key),
        'logical_key', knockout_record.logical_key
      )));
    END IF;
    UPDATE championship_bracket_preview_private.knockout_matches SET
      scheduled_date = (block_value ->> 'date')::date,
      location_key = (block_value ->> 'location_key')::uuid,
      location_name = block_value ->> 'location_name',
      court_key = (block_value ->> 'court_key')::uuid,
      court_name = block_value ->> 'court_name',
      start_at = candidate_start_at, end_at = candidate_end_at,
      duration_minutes = duration_value, manual_final = true
    WHERE id = knockout_record.id;
    RETURN jsonb_build_object('continue', true, 'done', false, 'diagnostics', '[]'::jsonb);
  END IF;

  candidate_start_at := NULL;
  candidate_end_at := NULL;
  FOR court_window IN
    SELECT court_windows.*, availability_windows.window_start_at, availability_windows.window_end_at
    FROM championship_bracket_preview_private.resolve_v8_knockout_court_windows(_job_id, knockout_record.sport_id) court_windows
    CROSS JOIN LATERAL public.resolve_championship_bracket_competition_schedule_windows(
      knockout_record.payload, knockout_record.competition_key, court_windows.event_date
    ) availability_windows
    ORDER BY court_windows.event_date, court_windows.location_position, court_windows.court_position, availability_windows.window_start_at
  LOOP
    candidate_conflict_end_at := GREATEST(court_window.free_start_at, court_window.window_start_at, dependency_ready_at);
    LOOP
      EXIT WHEN candidate_conflict_end_at + make_interval(mins => knockout_record.duration_minutes)
        > LEAST(court_window.free_end_at, court_window.window_end_at);
      SELECT max(conflicts.end_at) INTO candidate_end_at
      FROM (
        SELECT slots_table.end_at
        FROM championship_bracket_preview_private.assignments assignments_table
        JOIN championship_bracket_preview_private.slots slots_table ON slots_table.id = assignments_table.slot_id
        WHERE assignments_table.job_id = _job_id
          AND slots_table.event_date = court_window.event_date
          AND slots_table.location_key = court_window.location_key
          AND slots_table.court_key = court_window.court_key
          AND slots_table.start_at < candidate_conflict_end_at + make_interval(mins => knockout_record.duration_minutes)
          AND slots_table.end_at > candidate_conflict_end_at
        UNION ALL
        SELECT scheduled.end_at
        FROM championship_bracket_preview_private.knockout_matches scheduled
        WHERE scheduled.job_id = _job_id AND scheduled.id <> knockout_record.id
          AND scheduled.location_key = court_window.location_key AND scheduled.court_key = court_window.court_key
          AND scheduled.start_at < candidate_conflict_end_at + make_interval(mins => knockout_record.duration_minutes)
          AND scheduled.end_at > candidate_conflict_end_at
      ) conflicts;
      IF candidate_end_at IS NULL THEN
        candidate_start_at := candidate_conflict_end_at;
        candidate_end_at := candidate_start_at + make_interval(mins => knockout_record.duration_minutes);
        EXIT;
      END IF;
      candidate_conflict_end_at := candidate_end_at;
    END LOOP;
    EXIT WHEN candidate_start_at IS NOT NULL;
  END LOOP;

  IF candidate_start_at IS NULL THEN
    RETURN jsonb_build_object('continue', false, 'diagnostics', jsonb_build_array(jsonb_build_object(
      'code', 'KNOCKOUT_NO_AVAILABLE_SLOT',
      'message', format('Não existe janela compatível após as dependências para %s.', knockout_record.logical_key),
      'logical_key', knockout_record.logical_key
    )));
  END IF;

  UPDATE championship_bracket_preview_private.knockout_matches SET
    scheduled_date = court_window.event_date, location_key = court_window.location_key,
    location_name = court_window.location_name, court_key = court_window.court_key,
    court_name = court_window.court_name, start_at = candidate_start_at, end_at = candidate_end_at
  WHERE id = knockout_record.id;
  RETURN jsonb_build_object('continue', true, 'done', false, 'diagnostics', '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.finalize_job(_job_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  job_record RECORD;
  target_diagnostics JSONB;
  timeline_diagnostics JSONB;
  diagnostics JSONB;
  manifest JSONB;
  group_count INTEGER;
  knockout_count INTEGER;
  scheduled_knockout_count INTEGER;
BEGIN
  SELECT * INTO job_record
  FROM championship_bracket_preview_private.jobs
  WHERE id = _job_id
  FOR UPDATE;
  IF job_record.status <> 'FINALIZING' OR job_record.stage <> 'FINALIZING' THEN
    RETURN;
  END IF;
  SELECT championship_bracket_preview_private.resolve_v8_target_completion_diagnostics(_job_id) INTO target_diagnostics;
  SELECT championship_bracket_preview_private.resolve_v8_internal_empty_diagnostics(_job_id) INTO timeline_diagnostics;
  SELECT count(*) INTO group_count
  FROM championship_bracket_preview_private.assignments
  WHERE job_id = _job_id;
  SELECT count(*) INTO knockout_count
  FROM championship_bracket_preview_private.knockout_matches
  WHERE job_id = _job_id AND NOT is_bye;
  SELECT count(*) INTO scheduled_knockout_count
  FROM championship_bracket_preview_private.knockout_matches
  WHERE job_id = _job_id
    AND NOT is_bye
    AND scheduled_date IS NOT NULL
    AND location_key IS NOT NULL
    AND court_key IS NOT NULL
    AND start_at IS NOT NULL
    AND end_at IS NOT NULL;
  diagnostics := target_diagnostics || timeline_diagnostics;
  IF group_count <> (SELECT count(*) FROM championship_bracket_preview_private.matches WHERE job_id = _job_id)
    OR knockout_count <> scheduled_knockout_count
  THEN
    diagnostics := diagnostics || jsonb_build_array(jsonb_build_object(
      'code', 'SCHEDULE_INCOMPLETE',
      'message', 'A prévia v8 não possui todas as partidas estruturais programadas.',
      'target', (SELECT count(*) FROM championship_bracket_preview_private.matches WHERE job_id = _job_id) + knockout_count,
      'obtained', group_count + scheduled_knockout_count
    ));
  END IF;
  IF jsonb_array_length(diagnostics) > 0 THEN
    UPDATE championship_bracket_preview_private.jobs
    SET status = 'FAILED', stage = 'Validação da programação', diagnostics = diagnostics,
      error_message = diagnostics -> 0 ->> 'message', completed_at = now(), updated_at = now()
    WHERE id = _job_id;
    RETURN;
  END IF;
  SELECT jsonb_build_object(
    'algorithm_version', 'async-exact-v8',
    'groups', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'competition', competitions.competition_key,
        'group', groups.group_number,
        'teams', (
          SELECT jsonb_agg(group_teams.team_id ORDER BY group_teams.position)
          FROM championship_bracket_preview_private.group_teams group_teams
          WHERE group_teams.group_id = groups.id
        )
      ) ORDER BY competitions.position, groups.group_number)
      FROM championship_bracket_preview_private.groups groups
      JOIN championship_bracket_preview_private.competitions competitions ON competitions.id = groups.competition_id
      WHERE groups.job_id = _job_id
    ), '[]'::jsonb),
    'group_matches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'key', matches.logical_key, 'slot_id', assignments.slot_id,
        'home_team_id', matches.home_team_id, 'away_team_id', matches.away_team_id,
        'date', slots.event_date, 'location_key', slots.location_key, 'location', slots.location_name,
        'court_key', slots.court_key, 'court', slots.court_name, 'start', slots.start_at, 'end', slots.end_at,
        'match_number', assignments.match_number
      ) ORDER BY matches.logical_key)
      FROM championship_bracket_preview_private.assignments assignments
      JOIN championship_bracket_preview_private.matches matches ON matches.id = assignments.match_id
      JOIN championship_bracket_preview_private.slots slots ON slots.id = assignments.slot_id
      WHERE assignments.job_id = _job_id
    ), '[]'::jsonb),
    'knockout_matches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'key', knockout_matches.logical_key, 'phase', knockout_matches.phase,
        'round', knockout_matches.round_number, 'slot', knockout_matches.slot_number,
        'home_source_type', knockout_matches.home_source_type, 'home_source', knockout_matches.home_source_reference,
        'away_source_type', knockout_matches.away_source_type, 'away_source', knockout_matches.away_source_reference,
        'predecessors', knockout_matches.predecessor_match_ids, 'is_bye', knockout_matches.is_bye,
        'date', knockout_matches.scheduled_date, 'location_key', knockout_matches.location_key,
        'location', knockout_matches.location_name, 'court_key', knockout_matches.court_key,
        'court', knockout_matches.court_name,
        'start', CASE WHEN knockout_matches.is_bye THEN NULL ELSE knockout_matches.start_at END,
        'end', CASE WHEN knockout_matches.is_bye THEN NULL ELSE knockout_matches.end_at END,
        'manual_final', knockout_matches.manual_final
      ) ORDER BY knockout_matches.round_number, knockout_matches.slot_number, knockout_matches.logical_key)
      FROM championship_bracket_preview_private.knockout_matches knockout_matches
      WHERE knockout_matches.job_id = _job_id
    ), '[]'::jsonb)
  ) INTO manifest;
  UPDATE championship_bracket_preview_private.jobs
  SET status = 'COMPLETED', stage = 'Concluída', progress_percentage = 100,
    summary = jsonb_build_object(
      'total_matches', group_count + knockout_count,
      'group_stage_matches', group_count,
      'knockout_matches', knockout_count,
      'scheduled_matches', group_count + scheduled_knockout_count,
      'occupied_minutes', (
        SELECT COALESCE(sum(minutes), 0)::integer FROM (
          SELECT extract(epoch FROM (slots_table.end_at - slots_table.start_at)) / 60 AS minutes
          FROM championship_bracket_preview_private.assignments assignments_table
          JOIN championship_bracket_preview_private.slots slots_table ON slots_table.id = assignments_table.slot_id
          WHERE assignments_table.job_id = _job_id
          UNION ALL
          SELECT extract(epoch FROM (knockout_matches.end_at - knockout_matches.start_at)) / 60
          FROM championship_bracket_preview_private.knockout_matches knockout_matches
          WHERE knockout_matches.job_id = _job_id AND NOT knockout_matches.is_bye
        ) occupied
      ),
      'available_minutes', (
        SELECT COALESCE(sum(extract(epoch FROM end_at - start_at) / 60)::integer, 0)
        FROM championship_bracket_preview_private.slots WHERE job_id = _job_id
      ),
      'utilization_percentage', NULL, 'free_windows', NULL, 'conflict_count', 0, 'warning_count', 0,
      'search_tiers', jsonb_build_object(
        'fast_attempts', (SELECT count(*) FROM championship_bracket_preview_private.relocation_attempt_metrics WHERE job_id = _job_id AND search_tier = 'FAST'),
        'medium_attempts', (SELECT count(*) FROM championship_bracket_preview_private.relocation_attempt_metrics WHERE job_id = _job_id AND search_tier = 'MEDIUM'),
        'deep_attempts', (SELECT count(*) FROM championship_bracket_preview_private.relocation_attempt_metrics WHERE job_id = _job_id AND search_tier = 'DEEP'),
        'relocations_used', 0,
        'branches_examined', 0
      )
    ),
    generation_signature = encode(extensions.digest(convert_to(manifest::text, 'UTF8'), 'sha256'), 'hex'),
    completed_at = now(), expires_at = now() + interval '7 days', updated_at = now()
  WHERE id = _job_id;
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.process_job(_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
SET statement_timeout = '15s'
AS $function$
DECLARE
  job_record RECORD;
  result JSONB;
  diagnostics JSONB;
BEGIN
  SELECT * INTO job_record
  FROM championship_bracket_preview_private.jobs
  WHERE id = _job_id;
  IF job_record.id IS NULL THEN
    RETURN jsonb_build_object('continue', false);
  END IF;
  IF job_record.algorithm_version <> 'async-exact-v8' THEN
    IF job_record.status = 'FINALIZING' THEN
      PERFORM championship_bracket_preview_private.finalize_job_v7(_job_id);
      RETURN jsonb_build_object('continue', false);
    END IF;
    RETURN championship_bracket_preview_private.process_batch_v7(_job_id);
  END IF;
  IF job_record.status IN ('COMPLETED', 'FAILED', 'CANCELLED', 'CONSUMED') THEN
    RETURN jsonb_build_object('continue', false);
  END IF;
  IF job_record.stage = 'COMPACTING_GROUPS' THEN
    result := championship_bracket_preview_private.compact_v8_schedule_batch(_job_id);
    IF COALESCE((result ->> 'done')::boolean, false) THEN
      SELECT
  championship_bracket_preview_private.resolve_v8_target_completion_diagnostics(_job_id)
  ||
  championship_bracket_preview_private.resolve_v8_internal_empty_diagnostics(_job_id)
INTO diagnostics;
      IF jsonb_array_length(diagnostics) > 0 THEN
        UPDATE championship_bracket_preview_private.jobs
        SET status = 'FAILED', stage = 'Validação da grade', diagnostics = diagnostics,
          error_message = diagnostics -> 0 ->> 'message', completed_at = now(), updated_at = now()
        WHERE id = _job_id;
        RETURN jsonb_build_object('continue', false);
      END IF;
      PERFORM championship_bracket_preview_private.assign_job_match_numbers(_job_id);
      PERFORM championship_bracket_preview_private.create_v8_knockout_matches(_job_id);
      UPDATE championship_bracket_preview_private.jobs
      SET status = 'SCHEDULING', stage = 'SCHEDULING_KNOCKOUT', updated_at = now()
      WHERE id = _job_id;
    END IF;
    RETURN jsonb_build_object('continue', true);
  END IF;
  IF job_record.stage = 'SCHEDULING_KNOCKOUT' THEN
    result := championship_bracket_preview_private.schedule_v8_knockout_batch(_job_id);
    diagnostics := COALESCE(result -> 'diagnostics', '[]'::jsonb);
    IF jsonb_array_length(diagnostics) > 0 THEN
      UPDATE championship_bracket_preview_private.jobs
      SET status = 'FAILED', stage = 'Programação eliminatória', diagnostics = diagnostics,
        error_message = diagnostics -> 0 ->> 'message', completed_at = now(), updated_at = now()
      WHERE id = _job_id;
      RETURN jsonb_build_object('continue', false);
    END IF;
    IF COALESCE((result ->> 'done')::boolean, false) THEN
      UPDATE championship_bracket_preview_private.jobs
      SET status = 'FINALIZING', stage = 'FINALIZING', updated_at = now()
      WHERE id = _job_id;
    END IF;
    RETURN jsonb_build_object('continue', true);
  END IF;
  IF job_record.status = 'FINALIZING' OR job_record.stage = 'FINALIZING' THEN
    UPDATE championship_bracket_preview_private.jobs
    SET status = 'FINALIZING', stage = 'FINALIZING', updated_at = now()
    WHERE id = _job_id;
    PERFORM championship_bracket_preview_private.finalize_job(_job_id);
    RETURN jsonb_build_object('continue', false);
  END IF;
  result := championship_bracket_preview_private.process_batch(_job_id);
  SELECT * INTO job_record
  FROM championship_bracket_preview_private.jobs
  WHERE id = _job_id;
  IF job_record.status = 'FINALIZING' THEN
    UPDATE championship_bracket_preview_private.jobs
    SET status = 'SCHEDULING', stage = 'COMPACTING_GROUPS', updated_at = now()
    WHERE id = _job_id;
    RETURN jsonb_build_object('continue', true);
  END IF;
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  UPDATE championship_bracket_preview_private.jobs
  SET attempt_count = attempt_count + 1, heartbeat_at = now(), updated_at = now(),
    error_message = SQLERRM, status = CASE WHEN attempt_count + 1 >= 5 THEN 'FAILED' ELSE status END,
    stage = CASE WHEN attempt_count + 1 >= 5 THEN 'Falha após cinco tentativas' ELSE stage END,
    expires_at = CASE WHEN attempt_count + 1 >= 5 THEN now() + interval '24 hours' ELSE expires_at END
  WHERE id = _job_id;
  RETURN jsonb_build_object(
    'continue', (SELECT attempt_count < 5 FROM championship_bracket_preview_private.jobs WHERE id = _job_id),
    'delay', LEAST(60, power(2, (SELECT attempt_count FROM championship_bracket_preview_private.jobs WHERE id = _job_id))::integer)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.hydrate_championship_bracket_preview_v8_knockout (UUID, UUID, UUID)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.generate_championship_knockout_for_competition_v7 (UUID, UUID, UUID)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.generate_championship_knockout_for_competition (UUID, UUID, UUID)
FROM PUBLIC, anon;

GRANT
EXECUTE ON FUNCTION public.generate_championship_knockout_for_competition (UUID, UUID, UUID) TO authenticated;

REVOKE ALL ON championship_bracket_preview_private.knockout_matches
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON championship_bracket_preview_private.relocation_attempt_metrics
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON championship_bracket_preview_private.relocation_candidate_tier_states
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON championship_bracket_preview_private.compaction_gaps
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION championship_bracket_preview_private.process_batch (UUID)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION championship_bracket_preview_private.finalize_job (UUID)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION championship_bracket_preview_private.compact_v8_schedule_batch (UUID)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION championship_bracket_preview_private.schedule_v8_knockout_batch (UUID)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION championship_bracket_preview_private.process_job (UUID)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.start_championship_bracket_preview_job (UUID, JSONB)
FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.get_championship_bracket_preview_job_status (UUID)
FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.get_championship_bracket_preview_job_day (UUID, DATE)
FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.create_championship_bracket_from_preview_job (UUID, UUID, JSONB)
FROM PUBLIC, anon;

GRANT
EXECUTE ON FUNCTION public.start_championship_bracket_preview_job (UUID, JSONB) TO authenticated;

GRANT
EXECUTE ON FUNCTION public.get_championship_bracket_preview_job_status (UUID) TO authenticated;

GRANT
EXECUTE ON FUNCTION public.get_championship_bracket_preview_job_day (UUID, DATE) TO authenticated;

GRANT
EXECUTE ON FUNCTION public.create_championship_bracket_from_preview_job (UUID, UUID, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';