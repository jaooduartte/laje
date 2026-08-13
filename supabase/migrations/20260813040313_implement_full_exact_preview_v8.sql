ALTER TABLE championship_bracket_preview_private.jobs
  ALTER COLUMN algorithm_version SET DEFAULT 'async-exact-v8';

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
CREATE INDEX IF NOT EXISTS championship_bracket_preview_knockout_schedule_idx
  ON championship_bracket_preview_private.knockout_matches (job_id, scheduled_date, start_at, location_key, court_key);

CREATE TABLE IF NOT EXISTS championship_bracket_preview_private.relocation_attempt_metrics (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES championship_bracket_preview_private.jobs(id) ON DELETE CASCADE,
  match_id UUID NULL REFERENCES championship_bracket_preview_private.matches(id) ON DELETE SET NULL,
  phase TEXT NOT NULL,
  rest_gap INTEGER NOT NULL,
  search_tier TEXT NOT NULL,
  candidate_rank INTEGER NULL,
  candidate_slot_id BIGINT NULL REFERENCES championship_bracket_preview_private.slots(id) ON DELETE SET NULL,
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
CREATE INDEX IF NOT EXISTS championship_bracket_preview_relocation_metrics_job_idx
  ON championship_bracket_preview_private.relocation_attempt_metrics (job_id, created_at DESC);

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
  tier_deadline TIMESTAMPTZ;
  attempted_slot_ids BIGINT[] := ARRAY[]::BIGINT[];
  attempted_candidates INTEGER := 0;
  tier_attempted INTEGER;
  has_relaxation_opportunity BOOLEAN := false;
  candidate_limit INTEGER;
BEGIN
  SELECT * INTO pending_match_record FROM championship_bracket_preview_private.matches
  WHERE job_id = _job_id AND id = _pending_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('assigned', false, 'progressed', false, 'exhausted', true, 'attempted_candidates', 0);
  END IF;
  IF pending_match_record.assigned OR pending_match_record.relocation_search_exhausted THEN
    RETURN jsonb_build_object('assigned', pending_match_record.assigned, 'progressed', false, 'exhausted', pending_match_record.relocation_search_exhausted, 'attempted_candidates', 0);
  END IF;
  current_phase := CASE WHEN pending_match_record.relocation_search_phase = 'RELAXED' THEN 'RELAXED' ELSE 'STRICT' END;
  current_rest_gap := CASE WHEN current_phase = 'RELAXED' THEN 3 ELSE 4 END;

  FOR tier_record IN
    SELECT * FROM (VALUES
      ('FAST'::text, 2, 12, 4, 400),
      ('MEDIUM'::text, 6, 48, 16, 1800),
      ('DEEP'::text, 12, 120, 40, 9000)
    ) AS tiers(search_tier, max_depth, candidate_limit, relocation_limit, budget_ms)
  LOOP
    tier_deadline := clock_timestamp() + make_interval(secs => tier_record.budget_ms::numeric / 1000);
    tier_attempted := 0;
    candidate_limit := tier_record.candidate_limit;
    LOOP
      EXIT WHEN clock_timestamp() >= tier_deadline;
      SELECT candidate_slots.*, COALESCE(candidate_states.timeout_count, 0) AS timeout_count
      INTO candidate_slot_record
      FROM championship_bracket_preview_private.resolve_match_relocation_candidate_slots_ranked_v7(
        _job_id, _pending_match_id, NULL, ARRAY[]::BIGINT[], 0, candidate_limit, current_rest_gap
      ) candidate_slots
      LEFT JOIN championship_bracket_preview_private.relocation_candidate_states candidate_states
        ON candidate_states.job_id = _job_id AND candidate_states.match_id = _pending_match_id
        AND candidate_states.phase = current_phase AND candidate_states.slot_id = candidate_slots.slot_id
      WHERE (candidate_states.status IS NULL OR (candidate_states.status = 'TIMED_OUT' AND candidate_states.timeout_count < 5))
        AND NOT candidate_slots.slot_id = ANY(attempted_slot_ids)
      ORDER BY candidate_slots.candidate_rank LIMIT 1;
      EXIT WHEN NOT FOUND;
      attempted_slot_ids := array_append(attempted_slot_ids, candidate_slot_record.slot_id);
      attempted_candidates := attempted_candidates + 1;
      tier_attempted := tier_attempted + 1;
      attempt_started_at := clock_timestamp();
      branch_status := championship_bracket_preview_private.try_place_match_backtracking_status(
        _job_id, _pending_match_id, candidate_slot_record.slot_id,
        ARRAY[]::uuid[], ARRAY[]::bigint[], 0,
        tier_record.max_depth, tier_record.candidate_limit, tier_record.relocation_limit,
        CASE WHEN current_phase = 'RELAXED' THEN _pending_match_id ELSE NULL END,
        3, tier_deadline
      );
      INSERT INTO championship_bracket_preview_private.relocation_attempt_metrics (
        job_id, match_id, phase, rest_gap, search_tier, candidate_rank, candidate_slot_id,
        max_depth, candidate_limit, relocation_limit, result_status, timeout_count,
        relocations_used, branches_examined, duration_ms
      ) VALUES (
        _job_id, _pending_match_id, current_phase, current_rest_gap, tier_record.search_tier,
        candidate_slot_record.candidate_rank, candidate_slot_record.slot_id,
        tier_record.max_depth, tier_record.candidate_limit, tier_record.relocation_limit,
        branch_status, candidate_slot_record.timeout_count, 0, 0,
        (extract(epoch FROM clock_timestamp() - attempt_started_at) * 1000)::integer
      );
      IF branch_status = 'SUCCESS' THEN
        UPDATE championship_bracket_preview_private.matches
        SET relaxed_rest_gap_applied = current_phase = 'RELAXED', applied_rest_gap = current_rest_gap,
            relocation_candidate_cursor = 0, relocation_search_exhausted = false,
            relocation_attempt_count = 0, relocation_search_phase = 'STRICT'
        WHERE job_id = _job_id AND id = _pending_match_id;
        DELETE FROM championship_bracket_preview_private.relocation_candidate_states states
        WHERE states.job_id = _job_id
          AND EXISTS (
            SELECT 1 FROM championship_bracket_preview_private.assignments changed_assignments
            WHERE changed_assignments.job_id = _job_id
              AND (states.match_id = changed_assignments.match_id OR states.slot_id = changed_assignments.slot_id)
          );
        RETURN jsonb_build_object('assigned', true, 'progressed', true, 'exhausted', false, 'attempted_candidates', attempted_candidates, 'search_tier', tier_record.search_tier, 'rest_gap', current_rest_gap);
      END IF;
      INSERT INTO championship_bracket_preview_private.relocation_candidate_states(job_id,match_id,phase,slot_id,status,attempt_count,timeout_count,last_attempt_at)
      VALUES (_job_id,_pending_match_id,current_phase,candidate_slot_record.slot_id,
        CASE WHEN branch_status = 'TIMEOUT' THEN 'TIMED_OUT' ELSE 'DEAD_END' END,1,
        CASE WHEN branch_status = 'TIMEOUT' THEN 1 ELSE 0 END,now())
      ON CONFLICT (job_id,match_id,phase,slot_id) DO UPDATE SET
        status = EXCLUDED.status, attempt_count = championship_bracket_preview_private.relocation_candidate_states.attempt_count + 1,
        timeout_count = championship_bracket_preview_private.relocation_candidate_states.timeout_count + EXCLUDED.timeout_count,
        last_attempt_at = now();
    END LOOP;
  END LOOP;

  IF current_phase = 'STRICT' THEN
    SELECT EXISTS (
      SELECT 1 FROM championship_bracket_preview_private.resolve_match_relocation_candidate_slots(_job_id,_pending_match_id,NULL,ARRAY[]::bigint[],1000000) candidate_slot
      WHERE EXISTS (
        SELECT 1 FROM championship_bracket_preview_private.assignments assignments_table
        WHERE assignments_table.job_id = _job_id
          AND championship_bracket_preview_private.is_match_rest_conflict_with_gap(_job_id,_pending_match_id,candidate_slot.slot_id,assignments_table.match_id,4)
          AND NOT championship_bracket_preview_private.is_match_rest_conflict_with_gap(_job_id,_pending_match_id,candidate_slot.slot_id,assignments_table.match_id,3)
      )
    ) INTO has_relaxation_opportunity;
    IF has_relaxation_opportunity THEN
      UPDATE championship_bracket_preview_private.matches
      SET relocation_search_phase = 'RELAXED', relocation_candidate_cursor = 0
      WHERE job_id = _job_id AND id = _pending_match_id;
      RETURN jsonb_build_object('assigned', false, 'progressed', attempted_candidates > 0, 'exhausted', false, 'phase_changed', true, 'search_phase', 'RELAXED', 'rest_gap', 3);
    END IF;
  END IF;
  UPDATE championship_bracket_preview_private.matches SET relocation_search_exhausted = true
  WHERE job_id = _job_id AND id = _pending_match_id AND assigned = false;
  RETURN jsonb_build_object('assigned', false, 'progressed', attempted_candidates > 0, 'exhausted', true, 'attempted_candidates', attempted_candidates, 'rest_gap', current_rest_gap);
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_v8_internal_empty_diagnostics(
  _job_id UUID
)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  WITH assigned AS (
    SELECT
      assignments_table.match_id,
      matches_table.competition_id,
      slots_table.event_date,
      slots_table.location_key,
      slots_table.court_key,
      slots_table.start_at,
      slots_table.end_at,
      lead(slots_table.start_at) OVER (
        PARTITION BY slots_table.event_date, slots_table.location_key, slots_table.court_key
        ORDER BY slots_table.start_at, slots_table.end_at, assignments_table.match_id
      ) AS next_start_at
    FROM championship_bracket_preview_private.assignments assignments_table
    JOIN championship_bracket_preview_private.matches matches_table ON matches_table.id = assignments_table.match_id
    JOIN championship_bracket_preview_private.slots slots_table ON slots_table.id = assignments_table.slot_id
    WHERE assignments_table.job_id = _job_id
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
    AND EXISTS (
      SELECT 1
      FROM championship_bracket_preview_private.slots empty_slots
      WHERE empty_slots.job_id = _job_id
        AND empty_slots.event_date = assigned.event_date
        AND empty_slots.location_key = assigned.location_key
        AND empty_slots.court_key = assigned.court_key
        AND empty_slots.start_at >= assigned.end_at
        AND empty_slots.end_at <= assigned.next_start_at
        AND NOT EXISTS (
          SELECT 1 FROM championship_bracket_preview_private.assignments occupied
          WHERE occupied.job_id = _job_id AND occupied.slot_id = empty_slots.id
        )
    );
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
          tier_record.candidate_limit, tier_record.relocation_limit, branch_status,
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
  _best_second BOOLEAN,
  _pairing_mode TEXT,
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
    RETURN jsonb_build_object('type', 'BYE', 'reference', format('BYE_SEED_%s', _seed_number));
  END IF;

  IF _seed_number <= _groups_count * _qualifiers_per_group THEN
    group_number_value := ((_seed_number - 1) % _groups_count) + 1;
    position_value := ((_seed_number - 1) / _groups_count) + 1;
    RETURN jsonb_build_object(
      'type', 'GROUP_POSITION',
      'reference', format('GROUP_%s_POSITION_%s', group_number_value, position_value)
    );
  END IF;

  IF _qualifiers_per_group = 1 AND _best_second THEN
    RETURN jsonb_build_object(
      'type', 'BEST_SECOND_POOL',
      'reference', format('BEST_SECOND_POOL_POSITION_%s', _seed_number - _groups_count)
    );
  END IF;

  IF _qualifiers_per_group = 2 THEN
    RETURN jsonb_build_object(
      'type', 'BEST_THIRD_POOL',
      'reference', format('BEST_THIRD_POOL_POSITION_%s', _seed_number - (_groups_count * 2))
    );
  END IF;

  RETURN jsonb_build_object('type', 'BYE', 'reference', format('BYE_SEED_%s', _seed_number));
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.create_v8_knockout_matches(_job_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE competition_record RECORD; bracket_size INTEGER; direct_qualified_count INTEGER; qualified_count INTEGER; total_rounds INTEGER; round_number_value INTEGER; slot_number_value INTEGER; round_match_count INTEGER; phase_name TEXT; predecessor_ids UUID[]; is_bye_value BOOLEAN; home_seed INTEGER; away_seed INTEGER; home_source JSONB; away_source JSONB;
BEGIN
  DELETE FROM championship_bracket_preview_private.knockout_matches WHERE job_id = _job_id;
  FOR competition_record IN
    SELECT competitions_table.*, COALESCE(championship_sports_table.default_match_duration_minutes, 35)::integer AS duration_minutes
    FROM championship_bracket_preview_private.competitions competitions_table
    LEFT JOIN public.championship_sports championship_sports_table ON championship_sports_table.championship_id = (SELECT championship_id FROM championship_bracket_preview_private.jobs WHERE id = _job_id) AND championship_sports_table.sport_id = competitions_table.sport_id
    WHERE competitions_table.job_id = _job_id ORDER BY competitions_table.position, competitions_table.competition_key
  LOOP
    direct_qualified_count := competition_record.groups_count * competition_record.qualifiers_per_group;
    bracket_size := 1;
    IF competition_record.qualifiers_per_group = 1 AND competition_record.best_second THEN
      WHILE bracket_size <= direct_qualified_count LOOP bracket_size := bracket_size * 2; END LOOP;
    ELSE
      WHILE bracket_size < direct_qualified_count LOOP bracket_size := bracket_size * 2; END LOOP;
    END IF;
    qualified_count := CASE
      WHEN competition_record.qualifiers_per_group IN (1, 2)
        AND bracket_size > direct_qualified_count
        THEN bracket_size
      ELSE direct_qualified_count
    END;
    IF bracket_size < 2 OR qualified_count < 2 THEN CONTINUE; END IF;
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
          competition_record.best_second, competition_record.pairing_mode,
          home_seed, qualified_count
        );
        away_source := championship_bracket_preview_private.resolve_v8_knockout_seed_source(
          competition_record.groups_count, competition_record.qualifiers_per_group,
          competition_record.best_second, competition_record.pairing_mode,
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
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_array_length(COALESCE(court_item.value -> 'sport_match_targets', '[]'::jsonb)) > 0
        THEN court_item.value -> 'sport_match_targets'
        ELSE COALESCE(court_item.value -> 'sport_ids', '[]'::jsonb)
      END
    ) sport_item(value)
    WHERE CASE
      WHEN jsonb_array_length(COALESCE(court_item.value -> 'sport_match_targets', '[]'::jsonb)) > 0
      THEN NULLIF(sport_item.value ->> 'sport_id', '')::uuid
      ELSE trim(both '"' from sport_item.value::text)::uuid
    END = _sport_id
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
          (COALESCE(NULLIF(block_item.value ->> 'division_scope', ''), 'ALL') = 'ALL' AND knockout_record.division IS NULL)
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
  VALUES(edition_id,_championship_id,job_record.season_year,'GROUPS_GENERATED',_payload,auth.uid(),auth.uid());
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
BEGIN
  SELECT
    competitions_table.id,
    competitions_table.bracket_edition_id,
    competitions_table.qualifiers_per_group,
    competitions_table.should_complete_knockout_with_best_second_placed_teams
  INTO competition_record
  FROM public.championship_bracket_competitions AS competitions_table
  WHERE competitions_table.id = _competition_id
    AND competitions_table.bracket_edition_id = _bracket_edition_id
  LIMIT 1;

  IF competition_record.id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM championship_bracket_preview_private.jobs AS jobs_table
      WHERE jobs_table.result_edition_id = _bracket_edition_id
        AND jobs_table.algorithm_version = 'async-exact-v8'
        AND jobs_table.status = 'CONSUMED'
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

    UPDATE public.championship_bracket_matches AS bracket_matches_table
    SET
      home_team_id = home_team_id,
      away_team_id = away_team_id,
      winner_team_id = CASE
        WHEN home_team_id IS NULL AND away_team_id IS NOT NULL THEN away_team_id
        WHEN away_team_id IS NULL AND home_team_id IS NOT NULL THEN home_team_id
        ELSE NULL
      END,
      is_bye = (home_team_id IS NULL) <> (away_team_id IS NULL)
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
      FROM championship_bracket_preview_private.jobs AS jobs_table
      WHERE jobs_table.result_edition_id = resolved_edition_id
        AND jobs_table.algorithm_version = 'async-exact-v8'
        AND jobs_table.status = 'CONSUMED'
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

REVOKE ALL ON FUNCTION public.hydrate_championship_bracket_preview_v8_knockout(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_championship_knockout_for_competition_v7(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_championship_knockout_for_competition(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_championship_knockout_for_competition(UUID, UUID, UUID) TO authenticated;

REVOKE ALL ON championship_bracket_preview_private.knockout_matches FROM PUBLIC,anon,authenticated;
REVOKE ALL ON championship_bracket_preview_private.relocation_attempt_metrics FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION championship_bracket_preview_private.process_batch(UUID) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION championship_bracket_preview_private.finalize_job(UUID) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.start_championship_bracket_preview_job(UUID,JSONB) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_championship_bracket_preview_job_status(UUID) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_championship_bracket_preview_job_day(UUID,DATE) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.create_championship_bracket_from_preview_job(UUID,UUID,JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_championship_bracket_preview_job(UUID,JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_championship_bracket_preview_job_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_championship_bracket_preview_job_day(UUID,DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_championship_bracket_from_preview_job(UUID,UUID,JSONB) TO authenticated;

NOTIFY pgrst,'reload schema';
