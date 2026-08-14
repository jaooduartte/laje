CREATE OR REPLACE FUNCTION championship_bracket_preview_private.try_resolve_match_slot_backtracking_status(
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
  _relaxed_match_id UUID,
  _relaxed_rest_gap INTEGER,
  _deadline TIMESTAMPTZ
)
RETURNS TEXT
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
  effective_rest_gap INTEGER;
  blocker_rest_gap INTEGER;
  branch_status TEXT;
  saw_blocker BOOLEAN := false;
BEGIN
  IF clock_timestamp() >= _deadline THEN
    RETURN 'TIMEOUT';
  END IF;

  IF _depth > GREATEST(
    COALESCE(_maximum_depth, 12),
    1
  ) THEN
    RETURN 'DEAD_END';
  END IF;

  IF _relocations_used >= GREATEST(
    COALESCE(_maximum_relocations, 40),
    1
  ) THEN
    RETURN 'DEAD_END';
  END IF;

  effective_rest_gap :=
    CASE
      WHEN _relaxed_match_id IS NOT NULL
        AND _match_id = _relaxed_match_id
      THEN GREATEST(
        COALESCE(
          _relaxed_rest_gap,
          3
        ),
        1
      )
      ELSE 4
    END;

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
  FROM championship_bracket_preview_private.slots
    AS target_slot
  JOIN championship_bracket_preview_private.matches
    AS target_match
    ON target_match.job_id =
      target_slot.job_id
    AND target_match.id =
      _match_id
  WHERE target_slot.job_id = _job_id
    AND target_slot.id =
      _target_slot_id;

  IF NOT FOUND THEN
    RETURN 'DEAD_END';
  END IF;

  IF clock_timestamp() >= _deadline THEN
    RETURN 'TIMEOUT';
  END IF;

  FOR blocker_record IN
    WITH raw_blockers AS MATERIALIZED (
      SELECT
        blockers.blocker_match_id,
        blockers.blocker_slot_id,
        blockers.blocker_is_assigned,
        blockers.blocker_reasons,
        blocker_match.round_number
          AS blocker_round_number,
        blocker_match.priority_weight
          AS blocker_priority_weight,
        blocker_match.slot_number
          AS blocker_slot_number,
        blocker_match.logical_key
          AS blocker_logical_key,
        blockers.blocker_reasons && ARRAY[
          'EARLIER_ROUND_PENDING',
          'COURT_OCCUPATION',
          'TEAM_REST_CONSTRAINT',
          'ROUND_ORDER_CONSTRAINT'
        ]::TEXT[] AS is_hard_blocker
      FROM championship_bracket_preview_private.resolve_match_slot_blockers_with_rest_gap(
        _job_id,
        _match_id,
        _target_slot_id,
        effective_rest_gap
      ) AS blockers
      LEFT JOIN championship_bracket_preview_private.matches
        AS blocker_match
        ON blocker_match.job_id = _job_id
        AND blocker_match.id =
          blockers.blocker_match_id
      WHERE blockers.blocker_match_id <> _match_id
        AND NOT (
          blockers.blocker_match_id = ANY(
            COALESCE(
              _path_match_ids,
              ARRAY[]::UUID[]
            )
          )
        )
    ),
    annotated_blockers AS (
      SELECT
        raw_blockers.*,
        bool_or(
          raw_blockers.is_hard_blocker
        ) OVER () AS has_hard_blockers
      FROM raw_blockers
    )
    SELECT
      annotated_blockers.blocker_match_id,
      annotated_blockers.blocker_slot_id,
      annotated_blockers.blocker_is_assigned,
      annotated_blockers.blocker_reasons,
      annotated_blockers.blocker_round_number,
      annotated_blockers.blocker_priority_weight,
      annotated_blockers.blocker_slot_number,
      annotated_blockers.blocker_logical_key
    FROM annotated_blockers
    WHERE (
      annotated_blockers.has_hard_blockers
      AND annotated_blockers.is_hard_blocker
    )
    OR (
      NOT annotated_blockers.has_hard_blockers
      AND 'TARGET_CAPACITY' = ANY(
        annotated_blockers.blocker_reasons
      )
    )
    ORDER BY
      CASE
        WHEN 'EARLIER_ROUND_PENDING' = ANY(
          annotated_blockers.blocker_reasons
        )
        THEN 1
        WHEN 'COURT_OCCUPATION' = ANY(
          annotated_blockers.blocker_reasons
        )
        THEN 2
        WHEN 'TEAM_REST_CONSTRAINT' = ANY(
          annotated_blockers.blocker_reasons
        )
        THEN 3
        WHEN 'ROUND_ORDER_CONSTRAINT' = ANY(
          annotated_blockers.blocker_reasons
        )
        THEN 4
        ELSE 5
      END,
      annotated_blockers.blocker_priority_weight
        DESC NULLS LAST,
      annotated_blockers.blocker_round_number
        NULLS LAST,
      annotated_blockers.blocker_slot_number
        NULLS LAST,
      annotated_blockers.blocker_logical_key
        NULLS LAST,
      annotated_blockers.blocker_match_id
  LOOP
    saw_blocker := true;

    IF clock_timestamp() >= _deadline THEN
      RETURN 'TIMEOUT';
    END IF;

    blocker_rest_gap :=
      CASE
        WHEN _relaxed_match_id IS NOT NULL
          AND blocker_record.blocker_match_id =
            _relaxed_match_id
        THEN GREATEST(
          COALESCE(
            _relaxed_rest_gap,
            3
          ),
          1
        )
        ELSE 4
      END;

    FOR candidate_slot_record IN
      SELECT
        candidate_slot.*
      FROM championship_bracket_preview_private.resolve_match_relocation_candidate_slots(
        _job_id,
        blocker_record.blocker_match_id,
        blocker_record.blocker_slot_id,
        _reserved_slot_ids,
        GREATEST(
          COALESCE(
            _maximum_candidates_per_match,
            120
          ),
          1
        )
      ) AS candidate_slot
      WHERE (
        NOT (
          'TARGET_CAPACITY' = ANY(
            blocker_record.blocker_reasons
          )
        )
        OR candidate_slot.event_date <>
          target_event_date
        OR candidate_slot.court_key <>
          target_court_key
      )
      AND (
        NOT (
          'EARLIER_ROUND_PENDING' = ANY(
            blocker_record.blocker_reasons
          )
        )
        OR candidate_slot.end_at <=
          target_start_at
      )
      AND (
        NOT (
          'ROUND_ORDER_CONSTRAINT' = ANY(
            blocker_record.blocker_reasons
          )
        )
        OR blocker_record.blocker_round_number
          IS NULL
        OR (
          blocker_record.blocker_round_number <
            target_round_number
          AND candidate_slot.end_at <=
            target_start_at
        )
        OR (
          blocker_record.blocker_round_number >
            target_round_number
          AND candidate_slot.start_at >=
            target_end_at
        )
        OR blocker_record.blocker_round_number =
          target_round_number
      )
      AND (
        NOT (
          'TEAM_REST_CONSTRAINT' = ANY(
            blocker_record.blocker_reasons
          )
        )
        OR NOT championship_bracket_preview_private.is_match_pair_rest_conflict(
          _job_id,
          _match_id,
          _target_slot_id,
          blocker_record.blocker_match_id,
          candidate_slot.slot_id,
          effective_rest_gap
        )
      )
      ORDER BY
        candidate_slot.day_distance,
        candidate_slot.time_distance_seconds,
        candidate_slot.event_date,
        candidate_slot.start_at,
        candidate_slot.location_key,
        candidate_slot.court_key,
        candidate_slot.sequence_index,
        candidate_slot.slot_id
    LOOP
      IF clock_timestamp() >= _deadline THEN
        RETURN 'TIMEOUT';
      END IF;

      BEGIN
        branch_status :=
          championship_bracket_preview_private.try_place_match_backtracking_status(
            _job_id,
            blocker_record.blocker_match_id,
            candidate_slot_record.slot_id,
            _path_match_ids,
            _reserved_slot_ids,
            _depth + 1,
            _maximum_depth,
            _maximum_candidates_per_match,
            _maximum_relocations,
            _relaxed_match_id,
            _relaxed_rest_gap,
            _deadline
          );

        IF branch_status = 'TIMEOUT' THEN
          RAISE EXCEPTION
            USING
              ERRCODE = 'LJ003',
              MESSAGE = 'Relocation branch timed out';
        END IF;

        IF branch_status <> 'SUCCESS' THEN
          RAISE EXCEPTION
            USING
              ERRCODE = 'LJ002',
              MESSAGE = 'Relocation branch failed';
        END IF;

        branch_status :=
          championship_bracket_preview_private.try_resolve_match_slot_backtracking_status(
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
            _relaxed_match_id,
            _relaxed_rest_gap,
            _deadline
          );

        IF branch_status = 'SUCCESS' THEN
          RETURN 'SUCCESS';
        END IF;

        IF branch_status = 'TIMEOUT' THEN
          RAISE EXCEPTION
            USING
              ERRCODE = 'LJ003',
              MESSAGE = 'Relocation branch timed out';
        END IF;

        RAISE EXCEPTION
          USING
            ERRCODE = 'LJ002',
            MESSAGE = 'Relocation branch reached dead end';

      EXCEPTION
        WHEN SQLSTATE 'LJ003' THEN
          RETURN 'TIMEOUT';
        WHEN SQLSTATE 'LJ002' THEN
          NULL;
      END;
    END LOOP;
  END LOOP;

  IF NOT saw_blocker THEN
    IF clock_timestamp() >= _deadline THEN
      RETURN 'TIMEOUT';
    END IF;

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

    RETURN 'SUCCESS';
  END IF;

  IF clock_timestamp() >= _deadline THEN
    RETURN 'TIMEOUT';
  END IF;

  RETURN 'DEAD_END';
END;
$function$;

NOTIFY pgrst, 'reload schema';