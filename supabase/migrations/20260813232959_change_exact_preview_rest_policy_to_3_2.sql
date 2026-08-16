ALTER TABLE championship_bracket_preview_private.matches
ALTER COLUMN applied_rest_gap
SET DEFAULT 3;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.is_match_pair_rest_conflict(
  _job_id UUID,
  _candidate_match_id UUID,
  _candidate_slot_id BIGINT,
  _other_match_id UUID,
  _other_slot_id BIGINT,
  _required_gap INTEGER DEFAULT 3
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  WITH candidate_context AS (
    SELECT
      candidate_match.home_team_id,
      candidate_match.away_team_id,
      candidate_competition.sport_id,
      candidate_competition.naipe,
      candidate_slot.event_date,
      candidate_slot.court_key,
      candidate_slot.start_at,
      candidate_slot.end_at,
      candidate_slot.sequence_index
    FROM championship_bracket_preview_private.matches
      AS candidate_match
    JOIN championship_bracket_preview_private.competitions
      AS candidate_competition
      ON candidate_competition.id =
        candidate_match.competition_id
    JOIN championship_bracket_preview_private.slots
      AS candidate_slot
      ON candidate_slot.job_id =
        candidate_match.job_id
      AND candidate_slot.id =
        _candidate_slot_id
    WHERE candidate_match.job_id = _job_id
      AND candidate_match.id =
        _candidate_match_id
  ),
  other_context AS (
    SELECT
      other_match.home_team_id,
      other_match.away_team_id,
      other_competition.sport_id,
      other_competition.naipe,
      other_slot.event_date,
      other_slot.court_key,
      other_slot.start_at,
      other_slot.end_at,
      other_slot.sequence_index
    FROM championship_bracket_preview_private.matches
      AS other_match
    JOIN championship_bracket_preview_private.competitions
      AS other_competition
      ON other_competition.id =
        other_match.competition_id
    JOIN championship_bracket_preview_private.slots
      AS other_slot
      ON other_slot.job_id =
        other_match.job_id
      AND other_slot.id =
        _other_slot_id
    WHERE other_match.job_id = _job_id
      AND other_match.id =
        _other_match_id
  ),
  comparison AS (
    SELECT
      candidate_context.*,
      other_context.home_team_id
        AS other_home_team_id,
      other_context.away_team_id
        AS other_away_team_id,
      other_context.sport_id
        AS other_sport_id,
      other_context.naipe
        AS other_naipe,
      other_context.event_date
        AS other_event_date,
      other_context.court_key
        AS other_court_key,
      other_context.start_at
        AS other_start_at,
      other_context.end_at
        AS other_end_at,
      other_context.sequence_index
        AS other_sequence_index,
      CASE
        WHEN candidate_context.sport_id =
          other_context.sport_id
        THEN 3
        ELSE LEAST(
          3,
          GREATEST(
            COALESCE(_required_gap, 3),
            2
          )
        )
      END AS effective_required_gap
    FROM candidate_context
    CROSS JOIN other_context
  )
  SELECT COALESCE(
    (
      SELECT
        comparison.event_date =
          comparison.other_event_date
        AND comparison.naipe IS NOT NULL
        AND comparison.other_naipe IS NOT NULL
        AND comparison.naipe =
          comparison.other_naipe
        AND (
          comparison.other_home_team_id IN (
            comparison.home_team_id,
            comparison.away_team_id
          )
          OR comparison.other_away_team_id IN (
            comparison.home_team_id,
            comparison.away_team_id
          )
        )
        AND (
          CASE
            WHEN comparison.court_key =
              comparison.other_court_key
            THEN
              comparison.sequence_index
                IS NOT NULL
              AND comparison.other_sequence_index
                IS NOT NULL
              AND abs(
                comparison.sequence_index
                  - comparison.other_sequence_index
              ) < comparison.effective_required_gap
            ELSE
              abs(
                extract(
                  epoch FROM (
                    comparison.other_start_at
                      - comparison.start_at
                  )
                ) / 60.0
              ) <
              GREATEST(
                (
                  extract(
                    epoch FROM (
                      comparison.end_at
                        - comparison.start_at
                    )
                  ) / 60
                )::integer,
                (
                  extract(
                    epoch FROM (
                      comparison.other_end_at
                        - comparison.other_start_at
                    )
                  ) / 60
                )::integer,
                1
              )
              * comparison.effective_required_gap
          END
        )
      FROM comparison
    ),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.is_match_rest_conflict_with_gap(
  _job_id UUID,
  _candidate_match_id UUID,
  _candidate_slot_id BIGINT,
  _other_match_id UUID,
  _required_gap INTEGER DEFAULT 3
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  SELECT COALESCE(
    (
      SELECT
        championship_bracket_preview_private.is_match_pair_rest_conflict(
          _job_id,
          _candidate_match_id,
          _candidate_slot_id,
          _other_match_id,
          other_assignment.slot_id,
          GREATEST(
            COALESCE(_required_gap, 3),
            1
          )
        )
      FROM championship_bracket_preview_private.assignments
        AS other_assignment
      WHERE other_assignment.job_id = _job_id
        AND other_assignment.match_id =
          _other_match_id
    ),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.is_match_rest_conflict(
  _job_id UUID,
  _candidate_match_id UUID,
  _candidate_slot_id BIGINT,
  _other_match_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  SELECT
    championship_bracket_preview_private.is_match_rest_conflict_with_gap(
      _job_id,
      _candidate_match_id,
      _candidate_slot_id,
      _other_match_id,
      3
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
    championship_bracket_preview_private.is_match_slot_eligible(
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

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_match_slot_blockers_with_rest_gap(
  _job_id UUID,
  _match_id UUID,
  _slot_id BIGINT,
  _required_gap INTEGER DEFAULT 3
)
RETURNS TABLE(
  blocker_match_id UUID,
  blocker_slot_id BIGINT,
  blocker_is_assigned BOOLEAN,
  blocker_reasons TEXT[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  WITH adjusted AS (
    SELECT
      blockers.blocker_match_id,
      blockers.blocker_slot_id,
      blockers.blocker_is_assigned,
      CASE
        WHEN
          'TEAM_REST_CONSTRAINT' =
            ANY(blockers.blocker_reasons)
          AND NOT championship_bracket_preview_private.is_match_rest_conflict_with_gap(
            _job_id,
            _match_id,
            _slot_id,
            blockers.blocker_match_id,
            GREATEST(
              COALESCE(_required_gap, 3),
              1
            )
          )
        THEN array_remove(
          blockers.blocker_reasons,
          'TEAM_REST_CONSTRAINT'
        )
        ELSE blockers.blocker_reasons
      END AS blocker_reasons
    FROM championship_bracket_preview_private.resolve_match_slot_blockers(
      _job_id,
      _match_id,
      _slot_id
    ) AS blockers
  )
  SELECT
    adjusted.blocker_match_id,
    adjusted.blocker_slot_id,
    adjusted.blocker_is_assigned,
    adjusted.blocker_reasons
  FROM adjusted
  WHERE cardinality(
    adjusted.blocker_reasons
  ) > 0;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.normalize_relocation_metric_rest_gap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
BEGIN
  IF NEW.rest_gap > 3 THEN
    NEW.rest_gap := 3;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS championship_bracket_preview_normalize_relocation_metric_rest_gap
ON championship_bracket_preview_private.relocation_attempt_metrics;

CREATE TRIGGER championship_bracket_preview_normalize_relocation_metric_rest_gap
BEFORE INSERT
ON championship_bracket_preview_private.relocation_attempt_metrics
FOR EACH ROW
EXECUTE FUNCTION championship_bracket_preview_private.normalize_relocation_metric_rest_gap();

REVOKE ALL
ON FUNCTION championship_bracket_preview_private.normalize_relocation_metric_rest_gap()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION championship_bracket_preview_private.normalize_relocation_metric_rest_gap()
TO postgres;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.try_relocate_for_match_search(
  _job_id UUID,
  _pending_match_id UUID,
  _maximum_moves INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  pending_match_record RECORD;
  candidate_slot_record RECORD;
  tier_record RECORD;
  current_phase TEXT;
  current_tier TEXT;
  current_rest_gap INTEGER;
  branch_status TEXT;
  attempt_started_at TIMESTAMPTZ;
  overall_deadline TIMESTAMPTZ;
  candidate_deadline TIMESTAMPTZ;
  attempted_candidates INTEGER := 0;
  has_relaxation_opportunity BOOLEAN := false;
  has_retryable_after_attempt BOOLEAN := false;
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
      'assigned',
      false,
      'progressed',
      false,
      'exhausted',
      true,
      'attempted_candidates',
      0
    );
  END IF;

  IF pending_match_record.assigned
    OR pending_match_record.relocation_search_exhausted
  THEN
    RETURN jsonb_build_object(
      'assigned',
      pending_match_record.assigned,
      'progressed',
      false,
      'exhausted',
      pending_match_record.relocation_search_exhausted,
      'attempted_candidates',
      0
    );
  END IF;

  current_phase :=
    CASE
      WHEN pending_match_record.relocation_search_phase =
        'RELAXED'
      THEN 'RELAXED'
      ELSE 'STRICT'
    END;

  current_tier :=
    CASE
      WHEN pending_match_record.relocation_search_tier IN (
        'FAST',
        'MEDIUM',
        'DEEP'
      )
      THEN pending_match_record.relocation_search_tier
      ELSE 'FAST'
    END;

  current_rest_gap :=
    CASE
      WHEN current_phase = 'RELAXED'
      THEN 2
      ELSE 3
    END;

  IF pending_match_record.relocation_search_tier
    IS DISTINCT FROM current_tier
  THEN
    UPDATE championship_bracket_preview_private.matches
    SET relocation_search_tier = current_tier
    WHERE job_id = _job_id
      AND id = _pending_match_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.relocation_ranked_candidate_cache_runs
      AS cache_runs
    WHERE cache_runs.job_id = _job_id
      AND cache_runs.match_id = _pending_match_id
      AND cache_runs.phase = current_phase
  ) THEN
    DELETE FROM championship_bracket_preview_private.relocation_ranked_candidate_cache
      AS cached_candidates
    WHERE cached_candidates.job_id = _job_id
      AND cached_candidates.match_id = _pending_match_id
      AND cached_candidates.phase = current_phase;

    INSERT INTO championship_bracket_preview_private.relocation_ranked_candidate_cache (
      job_id,
      match_id,
      phase,
      slot_id,
      candidate_rank
    )
    SELECT
      _job_id,
      _pending_match_id,
      current_phase,
      ranked_candidates.slot_id,
      ranked_candidates.candidate_rank
    FROM championship_bracket_preview_private.resolve_match_relocation_candidate_slots_ranked_v7(
      _job_id,
      _pending_match_id,
      NULL,
      ARRAY[]::BIGINT[],
      0,
      120,
      current_rest_gap
    ) AS ranked_candidates
    ON CONFLICT DO NOTHING;

    INSERT INTO championship_bracket_preview_private.relocation_ranked_candidate_cache_runs (
      job_id,
      match_id,
      phase
    )
    VALUES (
      _job_id,
      _pending_match_id,
      current_phase
    )
    ON CONFLICT (
      job_id,
      match_id,
      phase
    )
    DO UPDATE SET
      generated_at = now();

    RETURN jsonb_build_object(
      'assigned',
      false,
      'progressed',
      true,
      'exhausted',
      false,
      'cache_generated',
      true,
      'search_tier',
      current_tier,
      'search_phase',
      current_phase,
      'rest_gap',
      current_rest_gap,
      'attempted_candidates',
      0
    );
  END IF;

  SELECT *
  INTO tier_record
  FROM (
    VALUES
      (
        'FAST'::TEXT,
        2,
        12,
        4,
        400,
        1
      ),
      (
        'MEDIUM'::TEXT,
        6,
        48,
        16,
        1800,
        1
      ),
      (
        'DEEP'::TEXT,
        12,
        120,
        40,
        7000,
        3
      )
  ) AS tiers(
    search_tier,
    max_depth,
    candidate_limit,
    relocation_limit,
    budget_ms,
    retry_limit
  )
  WHERE tiers.search_tier = current_tier;

  IF NOT FOUND THEN
    current_tier := 'FAST';

    UPDATE championship_bracket_preview_private.matches
    SET
      relocation_search_tier = 'FAST',
      relocation_candidate_cursor = 0
    WHERE job_id = _job_id
      AND id = _pending_match_id;

    SELECT *
    INTO tier_record
    FROM (
      VALUES
        (
          'FAST'::TEXT,
          2,
          12,
          4,
          400,
          1
        )
    ) AS tiers(
      search_tier,
      max_depth,
      candidate_limit,
      relocation_limit,
      budget_ms,
      retry_limit
    );
  END IF;

  overall_deadline :=
    clock_timestamp()
    + interval '10 seconds';

  FOR candidate_slot_record IN
    SELECT
      cached_candidates.candidate_rank,
      cached_candidates.slot_id,
      candidate_states.status
        AS candidate_status,
      COALESCE(
        candidate_states.timeout_count,
        0
      ) AS timeout_count
    FROM championship_bracket_preview_private.relocation_ranked_candidate_cache
      AS cached_candidates
    LEFT JOIN championship_bracket_preview_private.relocation_candidate_tier_states
      AS candidate_states
      ON candidate_states.job_id = _job_id
      AND candidate_states.match_id = _pending_match_id
      AND candidate_states.phase = current_phase
      AND candidate_states.search_tier = current_tier
      AND candidate_states.slot_id =
        cached_candidates.slot_id
    WHERE cached_candidates.job_id = _job_id
      AND cached_candidates.match_id = _pending_match_id
      AND cached_candidates.phase = current_phase
      AND cached_candidates.candidate_rank
        <= tier_record.candidate_limit
      AND (
        candidate_states.status IS NULL
        OR (
          candidate_states.status =
            current_tier || '_TIMEOUT'
          AND candidate_states.timeout_count
            < tier_record.retry_limit
        )
      )
    ORDER BY cached_candidates.candidate_rank
  LOOP
    IF clock_timestamp() >= overall_deadline THEN
      RETURN jsonb_build_object(
        'assigned',
        false,
        'progressed',
        attempted_candidates > 0,
        'exhausted',
        false,
        'attempted_candidates',
        attempted_candidates,
        'candidate_cursor',
        (
          SELECT relocation_candidate_cursor
          FROM championship_bracket_preview_private.matches
          WHERE job_id = _job_id
            AND id = _pending_match_id
        ),
        'search_tier',
        current_tier,
        'search_phase',
        current_phase,
        'rest_gap',
        current_rest_gap
      );
    END IF;

    attempted_candidates :=
      attempted_candidates + 1;

    attempt_started_at :=
      clock_timestamp();

    candidate_deadline :=
      LEAST(
        overall_deadline,
        clock_timestamp()
          + make_interval(
              secs =>
                tier_record.budget_ms::double precision
                / 1000.0
            )
      );

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
        2,
        candidate_deadline
      );

    attempt_result_status :=
      CASE
        WHEN branch_status = 'SUCCESS'
        THEN 'SUCCESS'
        WHEN branch_status = 'TIMEOUT'
        THEN current_tier || '_TIMEOUT'
        ELSE current_tier || '_DEAD_END'
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
      current_tier,
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
          epoch FROM (
            clock_timestamp()
              - attempt_started_at
          )
        ) * 1000
      )::integer
    );

    UPDATE championship_bracket_preview_private.matches
    SET
      relocation_candidate_cursor =
        GREATEST(
          relocation_candidate_cursor,
          candidate_slot_record.candidate_rank::integer
        ),
      relocation_attempt_count =
        relocation_attempt_count + 1
    WHERE job_id = _job_id
      AND id = _pending_match_id;

    IF branch_status = 'SUCCESS' THEN
      UPDATE championship_bracket_preview_private.matches
      SET
        relaxed_rest_gap_applied =
          current_phase = 'RELAXED',
        applied_rest_gap =
          current_rest_gap,
        relocation_candidate_cursor = 0,
        relocation_search_exhausted = false,
        relocation_attempt_count = 0,
        relocation_search_phase = 'STRICT',
        relocation_search_tier = 'FAST'
      WHERE job_id = _job_id
        AND id = _pending_match_id;

      DELETE FROM championship_bracket_preview_private.relocation_ranked_candidate_cache
      WHERE job_id = _job_id;

      DELETE FROM championship_bracket_preview_private.relocation_ranked_candidate_cache_runs
      WHERE job_id = _job_id;

      DELETE FROM championship_bracket_preview_private.relocation_candidate_tier_states
      WHERE job_id = _job_id;

      DELETE FROM championship_bracket_preview_private.relocation_candidate_states
      WHERE job_id = _job_id;

      UPDATE championship_bracket_preview_private.matches
      SET
        relocation_candidate_cursor = 0,
        relocation_search_exhausted = false,
        relocation_search_phase = 'STRICT',
        relocation_search_tier = 'FAST',
        relaxed_rest_gap_applied = false,
        applied_rest_gap = 3
      WHERE job_id = _job_id
        AND assigned = false;

      RETURN jsonb_build_object(
        'assigned',
        true,
        'progressed',
        true,
        'exhausted',
        false,
        'attempted_candidates',
        attempted_candidates,
        'search_tier',
        current_tier,
        'search_phase',
        current_phase,
        'rest_gap',
        current_rest_gap
      );
    END IF;

    IF branch_status = 'TIMEOUT' THEN
      next_timeout_count :=
        candidate_slot_record.timeout_count + 1;

      state_status :=
        CASE
          WHEN next_timeout_count
            >= tier_record.retry_limit
          THEN current_tier || '_SEARCH_LIMIT'
          ELSE current_tier || '_TIMEOUT'
        END;

      IF next_timeout_count
        < tier_record.retry_limit
      THEN
        has_retryable_after_attempt := true;
      END IF;
    ELSE
      next_timeout_count :=
        candidate_slot_record.timeout_count;

      state_status :=
        current_tier || '_DEAD_END';
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
      current_tier,
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
      timeout_count =
        EXCLUDED.timeout_count,
      last_attempt_at =
        now();
  END LOOP;

  IF has_retryable_after_attempt THEN
    RETURN jsonb_build_object(
      'assigned',
      false,
      'progressed',
      attempted_candidates > 0,
      'exhausted',
      false,
      'attempted_candidates',
      attempted_candidates,
      'candidate_cursor',
      (
        SELECT relocation_candidate_cursor
        FROM championship_bracket_preview_private.matches
        WHERE job_id = _job_id
          AND id = _pending_match_id
      ),
      'search_tier',
      current_tier,
      'search_phase',
      current_phase,
      'rest_gap',
      current_rest_gap
    );
  END IF;

  IF current_tier = 'FAST' THEN
    UPDATE championship_bracket_preview_private.matches
    SET
      relocation_search_tier = 'MEDIUM',
      relocation_candidate_cursor = 0
    WHERE job_id = _job_id
      AND id = _pending_match_id;

    RETURN jsonb_build_object(
      'assigned',
      false,
      'progressed',
      true,
      'exhausted',
      false,
      'tier_changed',
      true,
      'search_tier',
      'MEDIUM',
      'search_phase',
      current_phase,
      'rest_gap',
      current_rest_gap,
      'attempted_candidates',
      attempted_candidates
    );
  END IF;

  IF current_tier = 'MEDIUM' THEN
    UPDATE championship_bracket_preview_private.matches
    SET
      relocation_search_tier = 'DEEP',
      relocation_candidate_cursor = 0
    WHERE job_id = _job_id
      AND id = _pending_match_id;

    RETURN jsonb_build_object(
      'assigned',
      false,
      'progressed',
      true,
      'exhausted',
      false,
      'tier_changed',
      true,
      'search_tier',
      'DEEP',
      'search_phase',
      current_phase,
      'rest_gap',
      current_rest_gap,
      'attempted_candidates',
      attempted_candidates
    );
  END IF;

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
            3
          )
          AND NOT championship_bracket_preview_private.is_match_rest_conflict_with_gap(
            _job_id,
            _pending_match_id,
            candidate_slot.slot_id,
            assignments_table.match_id,
            2
          )
      )
    )
    INTO has_relaxation_opportunity;

    IF has_relaxation_opportunity THEN
      DELETE FROM championship_bracket_preview_private.relocation_ranked_candidate_cache
      WHERE job_id = _job_id
        AND match_id = _pending_match_id
        AND phase = 'RELAXED';

      DELETE FROM championship_bracket_preview_private.relocation_ranked_candidate_cache_runs
      WHERE job_id = _job_id
        AND match_id = _pending_match_id
        AND phase = 'RELAXED';

      DELETE FROM championship_bracket_preview_private.relocation_candidate_tier_states
      WHERE job_id = _job_id
        AND match_id = _pending_match_id
        AND phase = 'RELAXED';

      UPDATE championship_bracket_preview_private.matches
      SET
        relocation_search_phase = 'RELAXED',
        relocation_search_tier = 'FAST',
        relocation_candidate_cursor = 0
      WHERE job_id = _job_id
        AND id = _pending_match_id;

      RETURN jsonb_build_object(
        'assigned',
        false,
        'progressed',
        true,
        'exhausted',
        false,
        'phase_changed',
        true,
        'search_tier',
        'FAST',
        'search_phase',
        'RELAXED',
        'rest_gap',
        2,
        'attempted_candidates',
        attempted_candidates
      );
    END IF;
  END IF;

  UPDATE championship_bracket_preview_private.matches
  SET
    relocation_search_exhausted = true,
    relocation_candidate_cursor = 0
  WHERE job_id = _job_id
    AND id = _pending_match_id
    AND assigned = false;

  RETURN jsonb_build_object(
    'assigned',
    false,
    'progressed',
    attempted_candidates > 0,
    'exhausted',
    true,
    'attempted_candidates',
    attempted_candidates,
    'search_tier',
    current_tier,
    'search_phase',
    current_phase,
    'rest_gap',
    current_rest_gap
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';