ALTER TABLE championship_bracket_preview_private.matches
ADD COLUMN IF NOT EXISTS relocation_candidate_cursor BIGINT NOT NULL DEFAULT 0;

ALTER TABLE championship_bracket_preview_private.matches
ADD COLUMN IF NOT EXISTS relocation_search_exhausted BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS championship_bracket_preview_matches_search_idx
ON championship_bracket_preview_private.matches (
  job_id,
  assigned,
  relocation_search_exhausted,
  relocation_attempt_count,
  priority_weight DESC,
  round_number,
  slot_number
);

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_match_relocation_candidate_slots_ranked(
  _job_id UUID,
  _match_id UUID,
  _origin_slot_id BIGINT DEFAULT NULL,
  _excluded_slot_ids BIGINT[] DEFAULT ARRAY[]::BIGINT[],
  _after_rank BIGINT DEFAULT 0,
  _maximum_candidates INTEGER DEFAULT 300
)
RETURNS TABLE (
  candidate_rank BIGINT,
  slot_id BIGINT,
  event_date DATE,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  location_key UUID,
  court_key UUID,
  sequence_index INTEGER,
  day_distance INTEGER,
  time_distance_seconds NUMERIC,
  direct_eligible BOOLEAN,
  total_blocker_count INTEGER,
  hard_blocker_count INTEGER,
  capacity_blocker_count INTEGER,
  relocation_cost INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  WITH candidate_base AS (
    SELECT candidate_slot.*
    FROM championship_bracket_preview_private.resolve_match_relocation_candidate_slots(
      _job_id,
      _match_id,
      _origin_slot_id,
      _excluded_slot_ids,
      1000000
    ) AS candidate_slot
  ),
  scored_raw AS (
    SELECT
      candidate_base.*,
      championship_bracket_preview_private.is_match_slot_eligible(
        _job_id,
        _match_id,
        candidate_base.slot_id,
        true
      ) AS direct_eligible,
      blocker_stats.total_blocker_count,
      blocker_stats.hard_blocker_count,
      blocker_stats.earlier_round_blocker_count,
      blocker_stats.occupation_blocker_count,
      blocker_stats.rest_blocker_count,
      blocker_stats.round_order_blocker_count,
      blocker_stats.capacity_blocker_count
    FROM candidate_base
    JOIN championship_bracket_preview_private.slots AS slot_context
      ON slot_context.job_id = _job_id
      AND slot_context.id = candidate_base.slot_id
    JOIN championship_bracket_preview_private.jobs AS job_context
      ON job_context.id = _job_id
    CROSS JOIN LATERAL
      championship_bracket_preview_private.resolve_slot_sport_target(
        job_context.payload,
        slot_context.event_date,
        slot_context.court_key,
        slot_context.sport_id
      ) AS target_state
    CROSS JOIN LATERAL (
      SELECT
        count(*)::integer AS total_blocker_count,
        count(*) FILTER (
          WHERE blockers.blocker_reasons && ARRAY[
            'EARLIER_ROUND_PENDING',
            'COURT_OCCUPATION',
            'TEAM_REST_CONSTRAINT',
            'ROUND_ORDER_CONSTRAINT'
          ]::TEXT[]
        )::integer AS hard_blocker_count,
        count(*) FILTER (
          WHERE 'EARLIER_ROUND_PENDING' = ANY(blockers.blocker_reasons)
        )::integer AS earlier_round_blocker_count,
        count(*) FILTER (
          WHERE 'COURT_OCCUPATION' = ANY(blockers.blocker_reasons)
        )::integer AS occupation_blocker_count,
        count(*) FILTER (
          WHERE 'TEAM_REST_CONSTRAINT' = ANY(blockers.blocker_reasons)
        )::integer AS rest_blocker_count,
        count(*) FILTER (
          WHERE 'ROUND_ORDER_CONSTRAINT' = ANY(blockers.blocker_reasons)
        )::integer AS round_order_blocker_count,
        count(*) FILTER (
          WHERE 'TARGET_CAPACITY' = ANY(blockers.blocker_reasons)
        )::integer AS capacity_blocker_count
      FROM championship_bracket_preview_private.resolve_match_slot_blockers(
        _job_id,
        _match_id,
        candidate_base.slot_id
      ) AS blockers
      WHERE blockers.blocker_match_id <> _match_id
    ) AS blocker_stats
    WHERE
      NOT target_state.has_sport_targets
      OR COALESCE(target_state.planned_match_count, 0) > 0
  ),
  scored AS (
    SELECT
      scored_raw.*,
      (
        scored_raw.hard_blocker_count * 100
        + scored_raw.earlier_round_blocker_count * 40
        + scored_raw.round_order_blocker_count * 30
        + scored_raw.rest_blocker_count * 20
        + scored_raw.occupation_blocker_count * 10
        + CASE
            WHEN scored_raw.capacity_blocker_count > 0
              THEN 15 + least(scored_raw.capacity_blocker_count, 5)
            ELSE 0
          END
      )::integer AS relocation_cost
    FROM scored_raw
  ),
  ranked AS (
    SELECT
      row_number() OVER (
        ORDER BY
          CASE
            WHEN scored.direct_eligible THEN 0
            ELSE 1
          END,
          scored.relocation_cost,
          scored.hard_blocker_count,
          CASE
            WHEN scored.capacity_blocker_count > 0 THEN 1
            ELSE 0
          END,
          scored.total_blocker_count,
          scored.day_distance,
          scored.time_distance_seconds,
          scored.event_date,
          scored.start_at,
          scored.location_key,
          scored.court_key,
          scored.sequence_index,
          scored.slot_id
      ) AS candidate_rank,
      scored.*
    FROM scored
  )
  SELECT
    ranked.candidate_rank,
    ranked.slot_id,
    ranked.event_date,
    ranked.start_at,
    ranked.end_at,
    ranked.location_key,
    ranked.court_key,
    ranked.sequence_index,
    ranked.day_distance,
    ranked.time_distance_seconds,
    ranked.direct_eligible,
    ranked.total_blocker_count,
    ranked.hard_blocker_count,
    ranked.capacity_blocker_count,
    ranked.relocation_cost
  FROM ranked
  WHERE ranked.candidate_rank >
    greatest(COALESCE(_after_rank, 0), 0)
  ORDER BY ranked.candidate_rank
  LIMIT greatest(
    COALESCE(_maximum_candidates, 300),
    1
  );
$function$;

REVOKE ALL ON FUNCTION championship_bracket_preview_private.resolve_match_relocation_candidate_slots_ranked(
  UUID,
  UUID,
  BIGINT,
  BIGINT[],
  BIGINT,
  INTEGER
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.try_resolve_match_slot_backtracking(
  _job_id UUID,
  _match_id UUID,
  _target_slot_id BIGINT,
  _match_number INTEGER,
  _path_match_ids UUID[],
  _reserved_slot_ids BIGINT[],
  _depth INTEGER,
  _maximum_depth INTEGER,
  _maximum_candidates_per_match INTEGER,
  _maximum_relocations INTEGER,
  _relocations_used INTEGER,
  _deadline TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  blocker_record RECORD;
  candidate_slot_record RECORD;
  target_event_date DATE;
  target_court_key UUID;
  target_start_at TIMESTAMPTZ;
  target_end_at TIMESTAMPTZ;
  target_round_number INTEGER;
  has_hard_blockers BOOLEAN := false;
BEGIN
  IF clock_timestamp() >= _deadline THEN
    RETURN false;
  END IF;

  IF _depth > GREATEST(_maximum_depth, 1) THEN
    RETURN false;
  END IF;

  IF _relocations_used >= GREATEST(_maximum_relocations, 1) THEN
    RETURN false;
  END IF;

  SELECT
    target_slot.event_date,
    target_slot.court_key,
    target_slot.start_at,
    target_slot.end_at,
    target_match.round_number
  INTO
    target_event_date,
    target_court_key,
    target_start_at,
    target_end_at,
    target_round_number
  FROM championship_bracket_preview_private.slots AS target_slot
  JOIN championship_bracket_preview_private.matches AS target_match
    ON target_match.job_id = target_slot.job_id
    AND target_match.id = _match_id
  WHERE target_slot.job_id = _job_id
    AND target_slot.id = _target_slot_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF championship_bracket_preview_private.is_match_slot_eligible(
    _job_id,
    _match_id,
    _target_slot_id,
    true
  ) THEN
    INSERT INTO championship_bracket_preview_private.assignments (
      job_id,
      match_id,
      slot_id,
      match_number
    )
    VALUES (
      _job_id,
      _match_id,
      _target_slot_id,
      _match_number
    );

    UPDATE championship_bracket_preview_private.matches
    SET assigned = true
    WHERE job_id = _job_id
      AND id = _match_id;

    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.resolve_match_slot_blockers(
      _job_id,
      _match_id,
      _target_slot_id
    ) AS blockers
    WHERE blockers.blocker_match_id <> _match_id
      AND NOT (
        blockers.blocker_match_id = ANY(
          COALESCE(
            _path_match_ids,
            ARRAY[]::UUID[]
          )
        )
      )
      AND blockers.blocker_reasons && ARRAY[
        'EARLIER_ROUND_PENDING',
        'COURT_OCCUPATION',
        'TEAM_REST_CONSTRAINT',
        'ROUND_ORDER_CONSTRAINT'
      ]::TEXT[]
  )
  INTO has_hard_blockers;

  FOR blocker_record IN
    SELECT
      blockers.blocker_match_id,
      blockers.blocker_slot_id,
      blockers.blocker_is_assigned,
      blockers.blocker_reasons,
      blocker_match.round_number AS blocker_round_number,
      blocker_match.priority_weight AS blocker_priority_weight,
      blocker_match.slot_number AS blocker_slot_number,
      blocker_match.logical_key AS blocker_logical_key
    FROM championship_bracket_preview_private.resolve_match_slot_blockers(
      _job_id,
      _match_id,
      _target_slot_id
    ) AS blockers
    LEFT JOIN championship_bracket_preview_private.matches AS blocker_match
      ON blocker_match.job_id = _job_id
      AND blocker_match.id = blockers.blocker_match_id
    WHERE blockers.blocker_match_id <> _match_id
      AND NOT (
        blockers.blocker_match_id = ANY(
          COALESCE(
            _path_match_ids,
            ARRAY[]::UUID[]
          )
        )
      )
      AND (
        (
          has_hard_blockers
          AND blockers.blocker_reasons && ARRAY[
            'EARLIER_ROUND_PENDING',
            'COURT_OCCUPATION',
            'TEAM_REST_CONSTRAINT',
            'ROUND_ORDER_CONSTRAINT'
          ]::TEXT[]
        )
        OR (
          NOT has_hard_blockers
          AND 'TARGET_CAPACITY' = ANY(
            blockers.blocker_reasons
          )
        )
      )
    ORDER BY
      CASE
        WHEN 'EARLIER_ROUND_PENDING' = ANY(blockers.blocker_reasons)
          THEN 1
        WHEN 'COURT_OCCUPATION' = ANY(blockers.blocker_reasons)
          THEN 2
        WHEN 'TEAM_REST_CONSTRAINT' = ANY(blockers.blocker_reasons)
          THEN 3
        WHEN 'ROUND_ORDER_CONSTRAINT' = ANY(blockers.blocker_reasons)
          THEN 4
        ELSE 5
      END,
      blocker_match.priority_weight DESC NULLS LAST,
      blocker_match.round_number NULLS LAST,
      blocker_match.slot_number NULLS LAST,
      blocker_match.logical_key NULLS LAST,
      blockers.blocker_match_id
  LOOP
    FOR candidate_slot_record IN
      SELECT candidate_slot.*
      FROM championship_bracket_preview_private.resolve_match_relocation_candidate_slots_ranked(
        _job_id,
        blocker_record.blocker_match_id,
        blocker_record.blocker_slot_id,
        _reserved_slot_ids,
        0,
        _maximum_candidates_per_match
      ) AS candidate_slot
      WHERE (
        NOT (
          'TARGET_CAPACITY' = ANY(
            blocker_record.blocker_reasons
          )
        )
        OR candidate_slot.event_date <> target_event_date
        OR candidate_slot.court_key <> target_court_key
      )
      AND (
        NOT (
          'EARLIER_ROUND_PENDING' = ANY(
            blocker_record.blocker_reasons
          )
        )
        OR candidate_slot.end_at <= target_start_at
      )
      AND (
        NOT (
          'ROUND_ORDER_CONSTRAINT' = ANY(
            blocker_record.blocker_reasons
          )
        )
        OR blocker_record.blocker_round_number IS NULL
        OR (
          blocker_record.blocker_round_number < target_round_number
          AND candidate_slot.end_at <= target_start_at
        )
        OR (
          blocker_record.blocker_round_number > target_round_number
          AND candidate_slot.start_at >= target_end_at
        )
        OR blocker_record.blocker_round_number = target_round_number
      )
      ORDER BY candidate_slot.candidate_rank
    LOOP
      EXIT WHEN clock_timestamp() >= _deadline;

      BEGIN
        IF NOT championship_bracket_preview_private.try_place_match_backtracking(
          _job_id,
          blocker_record.blocker_match_id,
          candidate_slot_record.slot_id,
          _path_match_ids,
          _reserved_slot_ids,
          _depth + 1,
          _maximum_depth,
          _maximum_candidates_per_match,
          _maximum_relocations,
          _deadline
        ) THEN
          RAISE EXCEPTION
            USING
              ERRCODE = 'LJ002',
              MESSAGE = 'Relocation branch failed';
        END IF;

        IF championship_bracket_preview_private.try_resolve_match_slot_backtracking(
          _job_id,
          _match_id,
          _target_slot_id,
          _match_number,
          array_append(
            COALESCE(
              _path_match_ids,
              ARRAY[]::UUID[]
            ),
            blocker_record.blocker_match_id
          ),
          _reserved_slot_ids,
          _depth + 1,
          _maximum_depth,
          _maximum_candidates_per_match,
          _maximum_relocations,
          _relocations_used + 1,
          _deadline
        ) THEN
          RETURN true;
        END IF;

        RAISE EXCEPTION
          USING
            ERRCODE = 'LJ002',
            MESSAGE = 'Relocation branch reached dead end';

      EXCEPTION
        WHEN SQLSTATE 'LJ002' THEN
          NULL;
      END;
    END LOOP;
  END LOOP;

  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION championship_bracket_preview_private.try_resolve_match_slot_backtracking(
  UUID,
  UUID,
  BIGINT,
  INTEGER,
  UUID[],
  BIGINT[],
  INTEGER,
  INTEGER,
  INTEGER,
  INTEGER,
  INTEGER,
  TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;

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
  effective_deadline TIMESTAMPTZ :=
    clock_timestamp() + interval '10 seconds';
  candidate_deadline TIMESTAMPTZ;
  candidate_limit INTEGER := LEAST(
    GREATEST(
      COALESCE(_maximum_moves, 100) * 3,
      300
    ),
    1000
  );
  last_candidate_rank BIGINT := 0;
  attempted_candidates INTEGER := 0;
  has_more_candidates BOOLEAN := false;
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

  IF pending_match_record.assigned THEN
    RETURN jsonb_build_object(
      'assigned',
      true,
      'progressed',
      false,
      'exhausted',
      false,
      'attempted_candidates',
      0
    );
  END IF;

  IF pending_match_record.relocation_search_exhausted THEN
    RETURN jsonb_build_object(
      'assigned',
      false,
      'progressed',
      false,
      'exhausted',
      true,
      'attempted_candidates',
      0,
      'candidate_cursor',
      pending_match_record.relocation_candidate_cursor
    );
  END IF;

  last_candidate_rank :=
    pending_match_record.relocation_candidate_cursor;

  FOR candidate_slot_record IN
    SELECT candidate_slot.*
    FROM championship_bracket_preview_private.resolve_match_relocation_candidate_slots_ranked(
      _job_id,
      _pending_match_id,
      NULL,
      ARRAY[]::BIGINT[],
      last_candidate_rank,
      candidate_limit
    ) AS candidate_slot
    ORDER BY candidate_slot.candidate_rank
  LOOP
    EXIT WHEN clock_timestamp() >= effective_deadline;

    candidate_deadline :=
      LEAST(
        effective_deadline,
        clock_timestamp() + interval '3 seconds'
      );

    attempted_candidates :=
      attempted_candidates + 1;

    IF championship_bracket_preview_private.try_place_match_backtracking(
      _job_id,
      _pending_match_id,
      candidate_slot_record.slot_id,
      ARRAY[]::UUID[],
      ARRAY[]::BIGINT[],
      0,
      12,
      120,
      40,
      candidate_deadline
    ) THEN
      UPDATE championship_bracket_preview_private.matches
      SET
        relocation_candidate_cursor = 0,
        relocation_search_exhausted = false,
        relocation_attempt_count = 0
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
        'candidate_rank',
        candidate_slot_record.candidate_rank,
        'candidate_slot_id',
        candidate_slot_record.slot_id,
        'candidate_cost',
        candidate_slot_record.relocation_cost
      );
    END IF;

    last_candidate_rank :=
      candidate_slot_record.candidate_rank;

    UPDATE championship_bracket_preview_private.matches
    SET
      relocation_candidate_cursor =
        last_candidate_rank
    WHERE job_id = _job_id
      AND id = _pending_match_id
      AND assigned = false;

    EXIT WHEN clock_timestamp() >= effective_deadline;
  END LOOP;

  IF attempted_candidates > 0 THEN
    UPDATE championship_bracket_preview_private.matches
    SET
      relocation_attempt_count =
        relocation_attempt_count + 1
    WHERE job_id = _job_id
      AND id = _pending_match_id
      AND assigned = false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.resolve_match_relocation_candidate_slots_ranked(
      _job_id,
      _pending_match_id,
      NULL,
      ARRAY[]::BIGINT[],
      last_candidate_rank,
      1
    )
  )
  INTO has_more_candidates;

  IF has_more_candidates THEN
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
      last_candidate_rank
    );
  END IF;

  UPDATE championship_bracket_preview_private.matches
  SET
    relocation_candidate_cursor =
      last_candidate_rank,
    relocation_search_exhausted = true
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
    'candidate_cursor',
    last_candidate_rank
  );
END;
$function$;

REVOKE ALL ON FUNCTION championship_bracket_preview_private.try_relocate_for_match_search(
  UUID,
  UUID,
  INTEGER
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.process_batch(
  _job_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
SET statement_timeout = '15s'
AS $function$
DECLARE
  started_clock TIMESTAMPTZ := clock_timestamp();
  job_record RECORD;
  slot_record RECORD;
  candidate RECORD;
  batch_slots INTEGER := 0;
  candidates INTEGER := 0;
  slot_candidates INTEGER := 0;
  produced INTEGER := 0;
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

    SELECT *
    INTO job_record
    FROM championship_bracket_preview_private.jobs
    WHERE id = _job_id;
  END IF;

  IF job_record.algorithm_version IN (
    'async-exact-v4',
    'async-exact-v5',
    'async-exact-v6'
  )
    AND job_record.processed_slots = 0
    AND NOT EXISTS (
      SELECT 1
      FROM championship_bracket_preview_private.assignments
      WHERE job_id = _job_id
    )
  THEN
    PERFORM championship_bracket_preview_private.rebuild_job_slots(
      _job_id
    );

    SELECT *
    INTO job_record
    FROM championship_bracket_preview_private.jobs
    WHERE id = _job_id;
  END IF;

  FOR slot_record IN
    SELECT
      slots_table.*,
      slot_target.has_sport_targets,
      slot_target.planned_match_count,
      GREATEST(
        slot_target.planned_match_count
          - COALESCE(
            target_usage.assigned_match_count,
            0
          ),
        0
      ) AS remaining_target_count
    FROM championship_bracket_preview_private.slots AS slots_table

    CROSS JOIN LATERAL
      championship_bracket_preview_private.resolve_slot_sport_target(
        job_record.payload,
        slots_table.event_date,
        slots_table.court_key,
        slots_table.sport_id
      ) AS slot_target

    LEFT JOIN LATERAL (
      SELECT
        count(*)::integer AS assigned_match_count
      FROM championship_bracket_preview_private.assignments
        AS target_assignments
      JOIN championship_bracket_preview_private.slots
        AS assigned_slots
        ON assigned_slots.id =
          target_assignments.slot_id
      WHERE target_assignments.job_id = _job_id
        AND assigned_slots.event_date =
          slots_table.event_date
        AND assigned_slots.court_key =
          slots_table.court_key
        AND assigned_slots.sport_id =
          slots_table.sport_id
    ) AS target_usage
      ON true

    WHERE slots_table.job_id = _job_id
      AND slots_table.processed = false

      AND slots_table.event_date = (
        SELECT min(next_slot.event_date)
        FROM championship_bracket_preview_private.slots
          AS next_slot
        WHERE next_slot.job_id = _job_id
          AND next_slot.processed = false
      )

    ORDER BY
      slots_table.event_date,
      slots_table.start_at,
      slots_table.location_position,
      slots_table.court_position,

      CASE
        WHEN NOT slot_target.has_sport_targets
          OR slot_target.planned_match_count >
            COALESCE(
              target_usage.assigned_match_count,
              0
            )
        THEN 0
        ELSE 1
      END,

      GREATEST(
        slot_target.planned_match_count
          - COALESCE(
            target_usage.assigned_match_count,
            0
          ),
        0
      ) DESC,

      CASE
        WHEN slots_table.preferred_sport
          THEN 0
        ELSE 1
      END,

      slots_table.sport_id,
      slots_table.cursor_position

    LIMIT 20
    FOR UPDATE OF slots_table SKIP LOCKED

  LOOP
    EXIT WHEN
      clock_timestamp() - started_clock
        >= interval '5 seconds';

    batch_slots := batch_slots + 1;

    SELECT count(*)
    INTO slot_candidates
    FROM championship_bracket_preview_private.matches
      AS matches_table
    JOIN championship_bracket_preview_private.competitions
      AS competitions_table
      ON competitions_table.id =
        matches_table.competition_id
    WHERE matches_table.job_id = _job_id
      AND matches_table.assigned = false
      AND competitions_table.sport_id =
        slot_record.sport_id;

    candidates :=
      candidates + slot_candidates;

    SELECT
      matches_table.*,
      competitions_table.naipe,
      competitions_table.division,
      competitions_table.competition_key,
      competitions_table.position AS competition_position,
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
      ON groups_table.job_id = matches_table.job_id
      AND groups_table.id = matches_table.group_id
    WHERE matches_table.job_id = _job_id
      AND matches_table.assigned = false
      AND competitions_table.sport_id =
        slot_record.sport_id

      AND (
        NOT slot_record.has_sport_targets
        OR slot_record.planned_match_count > (
          SELECT count(*)
          FROM championship_bracket_preview_private.assignments
            AS target_assignments
          JOIN championship_bracket_preview_private.slots
            AS assigned_slots
            ON assigned_slots.id =
              target_assignments.slot_id
          WHERE target_assignments.job_id = _job_id
            AND assigned_slots.event_date =
              slot_record.event_date
            AND assigned_slots.court_key =
              slot_record.court_key
            AND assigned_slots.sport_id =
              slot_record.sport_id
        )
      )

      AND (
        slot_record.sequence_mode <> 'GROUP_NAIPE'
        OR slot_record.preferred_naipe IS NULL
        OR competitions_table.naipe =
          slot_record.preferred_naipe
      )

      AND public.is_championship_bracket_competition_slot_playable(
        job_record.payload,
        competitions_table.competition_key,
        slot_record.event_date,
        slot_record.start_at,
        slot_record.end_at
      )

      AND public.is_championship_bracket_team_slot_playable(
        job_record.payload,
        matches_table.home_team_id,
        competitions_table.competition_key,
        slot_record.event_date,
        slot_record.start_at,
        slot_record.end_at
      )

      AND public.is_championship_bracket_team_slot_playable(
        job_record.payload,
        matches_table.away_team_id,
        competitions_table.competition_key,
        slot_record.event_date,
        slot_record.start_at,
        slot_record.end_at
      )

      AND NOT EXISTS (
        SELECT 1
        FROM championship_bracket_preview_private.assignments
          AS occupied_assignment
        JOIN championship_bracket_preview_private.slots
          AS occupied_slot
          ON occupied_slot.id =
            occupied_assignment.slot_id
        WHERE occupied_assignment.job_id = _job_id
          AND occupied_slot.court_key =
            slot_record.court_key
          AND occupied_slot.start_at <
            slot_record.end_at
          AND occupied_slot.end_at >
            slot_record.start_at
      )

      AND championship_bracket_preview_private.is_job_slot_within_day_bounds(
        _job_id,
        slot_record.id
      )

      AND championship_bracket_preview_private.is_match_round_order_eligible(
        _job_id,
        matches_table.id,
        slot_record.id
      )

      AND NOT EXISTS (
        SELECT 1
        FROM championship_bracket_preview_private.assignments
          AS previous_assignment
        WHERE previous_assignment.job_id = _job_id
          AND championship_bracket_preview_private.is_match_rest_conflict(
            _job_id,
            matches_table.id,
            slot_record.id,
            previous_assignment.match_id
          )
      )

    ORDER BY
      CASE
        WHEN slot_record.preferred_naipe IS NOT NULL
          AND competitions_table.naipe
            IS DISTINCT FROM
              slot_record.preferred_naipe
        THEN 1
        ELSE 0
      END,

      CASE
        WHEN slot_record.preferred_division IS NOT NULL
          AND competitions_table.division
            IS DISTINCT FROM
              slot_record.preferred_division
        THEN 1
        ELSE 0
      END,

      matches_table.priority_weight DESC,
      competitions_table.position,
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

      UPDATE championship_bracket_preview_private.matches
      SET
        assigned = true,
        relocation_attempt_count = 0,
        relocation_candidate_cursor = 0,
        relocation_search_exhausted = false
      WHERE job_id = _job_id
        AND id = candidate.id;

      produced := produced + 1;
    END IF;

    UPDATE championship_bracket_preview_private.slots
    SET processed = true
    WHERE id = slot_record.id;
  END LOOP;

  SELECT count(*)
  INTO pending_count
  FROM championship_bracket_preview_private.matches
  WHERE job_id = _job_id
    AND assigned = false;

  SELECT count(*)
  INTO processed_count
  FROM championship_bracket_preview_private.slots
  WHERE job_id = _job_id
    AND processed;

  UPDATE championship_bracket_preview_private.jobs
  SET
    processed_slots = processed_count,

    current_processing_date = (
      SELECT max(event_date)
      FROM championship_bracket_preview_private.slots
      WHERE job_id = _job_id
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

  INSERT INTO championship_bracket_preview_private.stage_metrics (
    job_id,
    stage,
    batch_number,
    duration_ms,
    processed_slots,
    candidates_examined,
    produced_rows
  )
  VALUES (
    _job_id,
    'SCHEDULING',
    job_record.attempt_count + 1,
    (
      EXTRACT(
        EPOCH FROM (
          clock_timestamp() - started_clock
        )
      ) * 1000
    )::integer,
    batch_slots,
    candidates,
    produced
  );

  IF pending_count = 0 THEN
    UPDATE championship_bracket_preview_private.jobs
    SET
      status = 'FINALIZING',
      stage = 'Montando manifesto final',
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
      AND processed = false
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
    competitions_table.position AS competition_position,
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
    AND pending_match.assigned = false
    AND pending_match.relocation_search_exhausted = false
  ORDER BY
    pending_match.relocation_attempt_count,
    pending_match.priority_weight DESC,
    competitions_table.position,
    groups_table.group_number,
    pending_match.round_number,
    pending_match.slot_number,
    least(
      pending_match.home_team_id::text,
      pending_match.away_team_id::text
    ),
    greatest(
      pending_match.home_team_id::text,
      pending_match.away_team_id::text
    )
  LIMIT 1;

  IF FOUND THEN
    UPDATE championship_bracket_preview_private.jobs
    SET
      stage = format(
        'Reorganizando grade: %s jogo(s) pendente(s), busca a partir do candidato %s',
        pending_count,
        candidate.relocation_candidate_cursor + 1
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
      produced := produced + 1;

      SELECT count(*)
      INTO pending_count
      FROM championship_bracket_preview_private.matches
      WHERE job_id = _job_id
        AND assigned = false;

      IF pending_count = 0 THEN
        UPDATE championship_bracket_preview_private.jobs
        SET
          status = 'FINALIZING',
          stage = 'Montando manifesto final após reorganização',
          progress_percentage = 90,
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

      UPDATE championship_bracket_preview_private.jobs
      SET
        stage = format(
          'Reorganizando grade: %s jogo(s) pendente(s)',
          pending_count
        ),
        progress_percentage = 90,
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

    IF COALESCE(
      (relocation_result ->> 'progressed')::boolean,
      false
    )
      AND NOT COALESCE(
        (relocation_result ->> 'exhausted')::boolean,
        false
      )
    THEN
      UPDATE championship_bracket_preview_private.jobs
      SET
        stage = format(
          'Reorganizando grade: %s jogo(s) pendente(s), busca avançou até o candidato %s',
          pending_count,
          COALESCE(
            relocation_result ->> 'candidate_cursor',
            candidate.relocation_candidate_cursor::text
          )
        ),
        progress_percentage = 90,
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
  END IF;

  SELECT count(*)
  INTO remaining_relocation_candidates
  FROM championship_bracket_preview_private.matches
  WHERE job_id = _job_id
    AND assigned = false
    AND relocation_search_exhausted = false;

  SELECT count(*)
  INTO pending_count
  FROM championship_bracket_preview_private.matches
  WHERE job_id = _job_id
    AND assigned = false;

  IF pending_count = 0 THEN
    UPDATE championship_bracket_preview_private.jobs
    SET
      status = 'FINALIZING',
      stage = 'Montando manifesto final após reorganização',
      progress_percentage = 90,
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
    UPDATE championship_bracket_preview_private.jobs
    SET
      stage = format(
        'Reorganizando grade: %s jogo(s) pendente(s)',
        pending_count
      ),
      progress_percentage = 90,
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

  UPDATE championship_bracket_preview_private.jobs
  SET
    status = 'FAILED',
    stage = 'Falha',
    progress_percentage = 100,

    error_message = format(
      'Não foi possível encaixar %s jogo(s) após esgotar os destinos estruturais disponíveis e as cadeias de reorganização analisadas.',
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

ALTER TABLE championship_bracket_preview_private.jobs
ALTER COLUMN algorithm_version
SET DEFAULT 'async-exact-v6';

DO $$
DECLARE
  function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.start_championship_bracket_preview_job(uuid,jsonb)'::regprocedure
  )
  INTO function_definition;

  EXECUTE replace(
    function_definition,
    'async-exact-v5',
    'async-exact-v6'
  );

  SELECT pg_get_functiondef(
    'public.get_championship_bracket_preview_job_status(uuid)'::regprocedure
  )
  INTO function_definition;

  EXECUTE replace(
    function_definition,
    'async-exact-v5',
    'async-exact-v6'
  );

  SELECT pg_get_functiondef(
    'public.create_championship_bracket_from_preview_job(uuid,uuid,jsonb)'::regprocedure
  )
  INTO function_definition;

  EXECUTE replace(
    function_definition,
    'async-exact-v5',
    'async-exact-v6'
  );
END;
$$;

UPDATE championship_bracket_preview_private.jobs
SET
  status = 'CANCELLED',
  stage = 'Substituída pelo algoritmo async-exact-v6',
  expires_at = now() + interval '24 hours',
  heartbeat_at = now(),
  updated_at = now()
WHERE algorithm_version = 'async-exact-v5'
  AND status IN (
    'QUEUED',
    'INITIALIZING',
    'SCHEDULING',
    'FINALIZING'
  );

DO $$
DECLARE
  algorithm_default TEXT;
  start_definition TEXT;
  status_definition TEXT;
  creation_definition TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema =
      'championship_bracket_preview_private'
      AND table_name = 'matches'
      AND column_name =
        'relocation_candidate_cursor'
  ) THEN
    RAISE EXCEPTION
      'relocation_candidate_cursor não foi criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema =
      'championship_bracket_preview_private'
      AND table_name = 'matches'
      AND column_name =
        'relocation_search_exhausted'
  ) THEN
    RAISE EXCEPTION
      'relocation_search_exhausted não foi criada.';
  END IF;

  IF to_regprocedure(
    'championship_bracket_preview_private.resolve_match_relocation_candidate_slots_ranked(uuid,uuid,bigint,bigint[],bigint,integer)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'resolve_match_relocation_candidate_slots_ranked não foi criada.';
  END IF;

  IF to_regprocedure(
    'championship_bracket_preview_private.try_relocate_for_match_search(uuid,uuid,integer)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'try_relocate_for_match_search não foi criada.';
  END IF;

  SELECT pg_get_expr(
    attribute_default.adbin,
    attribute_default.adrelid
  )
  INTO algorithm_default
  FROM pg_attrdef AS attribute_default
  JOIN pg_attribute AS attribute
    ON attribute.attrelid =
      attribute_default.adrelid
    AND attribute.attnum =
      attribute_default.adnum
  JOIN pg_class AS relation
    ON relation.oid =
      attribute.attrelid
  JOIN pg_namespace AS namespace
    ON namespace.oid =
      relation.relnamespace
  WHERE namespace.nspname =
      'championship_bracket_preview_private'
    AND relation.relname = 'jobs'
    AND attribute.attname =
      'algorithm_version';

  IF algorithm_default IS NULL
    OR position(
      'async-exact-v6'
      IN algorithm_default
    ) = 0
  THEN
    RAISE EXCEPTION
      'O default de algorithm_version não foi atualizado para async-exact-v6.';
  END IF;

  SELECT pg_get_functiondef(
    'public.start_championship_bracket_preview_job(uuid,jsonb)'::regprocedure
  )
  INTO start_definition;

  SELECT pg_get_functiondef(
    'public.get_championship_bracket_preview_job_status(uuid)'::regprocedure
  )
  INTO status_definition;

  SELECT pg_get_functiondef(
    'public.create_championship_bracket_from_preview_job(uuid,uuid,jsonb)'::regprocedure
  )
  INTO creation_definition;

  IF position(
    'async-exact-v6'
    IN start_definition
  ) = 0 THEN
    RAISE EXCEPTION
      'start_championship_bracket_preview_job não foi atualizada para async-exact-v6.';
  END IF;

  IF position(
    'async-exact-v6'
    IN status_definition
  ) = 0 THEN
    RAISE EXCEPTION
      'get_championship_bracket_preview_job_status não foi atualizada para async-exact-v6.';
  END IF;

  IF position(
    'async-exact-v6'
    IN creation_definition
  ) = 0 THEN
    RAISE EXCEPTION
      'create_championship_bracket_from_preview_job não foi atualizada para async-exact-v6.';
  END IF;
END;
$$;