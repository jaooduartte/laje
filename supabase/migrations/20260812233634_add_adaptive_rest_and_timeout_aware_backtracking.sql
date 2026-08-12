ALTER TABLE championship_bracket_preview_private.matches
ADD COLUMN IF NOT EXISTS relocation_search_phase TEXT NOT NULL DEFAULT 'STRICT';

ALTER TABLE championship_bracket_preview_private.matches
ADD COLUMN IF NOT EXISTS relaxed_rest_gap_applied BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE championship_bracket_preview_private.matches
ADD COLUMN IF NOT EXISTS applied_rest_gap INTEGER NOT NULL DEFAULT 4;

CREATE TABLE IF NOT EXISTS championship_bracket_preview_private.relocation_candidate_states (
  job_id UUID NOT NULL
    REFERENCES championship_bracket_preview_private.jobs(id)
    ON DELETE CASCADE,
  match_id UUID NOT NULL
    REFERENCES championship_bracket_preview_private.matches(id)
    ON DELETE CASCADE,
  phase TEXT NOT NULL,
  slot_id BIGINT NOT NULL
    REFERENCES championship_bracket_preview_private.slots(id)
    ON DELETE CASCADE,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  timeout_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (
    job_id,
    match_id,
    phase,
    slot_id
  )
);

CREATE INDEX IF NOT EXISTS championship_bracket_preview_relocation_candidate_states_search_idx
ON championship_bracket_preview_private.relocation_candidate_states (
  job_id,
  match_id,
  phase,
  status,
  timeout_count,
  last_attempt_at
);

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.is_match_pair_rest_conflict(
  _job_id UUID,
  _candidate_match_id UUID,
  _candidate_slot_id BIGINT,
  _other_match_id UUID,
  _other_slot_id BIGINT,
  _required_gap INTEGER DEFAULT 4
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
  )
  SELECT COALESCE(
    (
      SELECT
        candidate_context.event_date =
          other_context.event_date
        AND candidate_context.naipe IS NOT NULL
        AND other_context.naipe IS NOT NULL
        AND candidate_context.naipe =
          other_context.naipe
        AND (
          other_context.home_team_id IN (
            candidate_context.home_team_id,
            candidate_context.away_team_id
          )
          OR other_context.away_team_id IN (
            candidate_context.home_team_id,
            candidate_context.away_team_id
          )
        )
        AND (
          CASE
            WHEN candidate_context.court_key =
              other_context.court_key
            THEN
              candidate_context.sequence_index
                IS NOT NULL
              AND other_context.sequence_index
                IS NOT NULL
              AND abs(
                candidate_context.sequence_index
                  - other_context.sequence_index
              ) < GREATEST(
                COALESCE(_required_gap, 4),
                1
              )
            ELSE
              abs(
                extract(
                  epoch FROM (
                    other_context.start_at
                      - candidate_context.start_at
                  )
                ) / 60.0
              ) <
              GREATEST(
                (
                  extract(
                    epoch FROM (
                      candidate_context.end_at
                        - candidate_context.start_at
                    )
                  ) / 60
                )::integer,
                (
                  extract(
                    epoch FROM (
                      other_context.end_at
                        - other_context.start_at
                    )
                  ) / 60
                )::integer,
                1
              )
              * GREATEST(
                COALESCE(_required_gap, 4),
                1
              )
          END
        )
      FROM candidate_context
      CROSS JOIN other_context
    ),
    false
  );
$function$;

REVOKE ALL ON FUNCTION championship_bracket_preview_private.is_match_pair_rest_conflict(
  UUID,
  UUID,
  BIGINT,
  UUID,
  BIGINT,
  INTEGER
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.is_match_rest_conflict_with_gap(
  _job_id UUID,
  _candidate_match_id UUID,
  _candidate_slot_id BIGINT,
  _other_match_id UUID,
  _required_gap INTEGER DEFAULT 4
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
            COALESCE(_required_gap, 4),
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

REVOKE ALL ON FUNCTION championship_bracket_preview_private.is_match_rest_conflict_with_gap(
  UUID,
  UUID,
  BIGINT,
  UUID,
  INTEGER
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.is_match_slot_eligible_with_rest_gap(
  _job_id UUID,
  _match_id UUID,
  _slot_id BIGINT,
  _required_gap INTEGER DEFAULT 4
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
            COALESCE(_required_gap, 4),
            1
          )
        )
    );
$function$;

REVOKE ALL ON FUNCTION championship_bracket_preview_private.is_match_slot_eligible_with_rest_gap(
  UUID,
  UUID,
  BIGINT,
  INTEGER
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_match_slot_blockers_with_rest_gap(
  _job_id UUID,
  _match_id UUID,
  _slot_id BIGINT,
  _required_gap INTEGER DEFAULT 4
)
RETURNS TABLE (
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
              COALESCE(_required_gap, 4),
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

REVOKE ALL ON FUNCTION championship_bracket_preview_private.resolve_match_slot_blockers_with_rest_gap(
  UUID,
  UUID,
  BIGINT,
  INTEGER
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_match_relocation_candidate_slots_ranked_v7(
  _job_id UUID,
  _match_id UUID,
  _origin_slot_id BIGINT DEFAULT NULL,
  _excluded_slot_ids BIGINT[] DEFAULT ARRAY[]::BIGINT[],
  _after_rank BIGINT DEFAULT 0,
  _maximum_candidates INTEGER DEFAULT 300,
  _required_gap INTEGER DEFAULT 4
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
      championship_bracket_preview_private.is_match_slot_eligible_with_rest_gap(
        _job_id,
        _match_id,
        candidate_base.slot_id,
        GREATEST(
          COALESCE(_required_gap, 4),
          1
        )
      ) AS direct_eligible,
      blocker_stats.total_blocker_count,
      blocker_stats.hard_blocker_count,
      blocker_stats.earlier_round_blocker_count,
      blocker_stats.occupation_blocker_count,
      blocker_stats.rest_blocker_count,
      blocker_stats.round_order_blocker_count,
      blocker_stats.capacity_blocker_count
    FROM candidate_base
    JOIN championship_bracket_preview_private.slots
      AS slot_context
      ON slot_context.job_id = _job_id
      AND slot_context.id =
        candidate_base.slot_id
    JOIN championship_bracket_preview_private.jobs
      AS job_context
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
          WHERE
            'EARLIER_ROUND_PENDING' =
              ANY(blockers.blocker_reasons)
        )::integer AS earlier_round_blocker_count,
        count(*) FILTER (
          WHERE
            'COURT_OCCUPATION' =
              ANY(blockers.blocker_reasons)
        )::integer AS occupation_blocker_count,
        count(*) FILTER (
          WHERE
            'TEAM_REST_CONSTRAINT' =
              ANY(blockers.blocker_reasons)
        )::integer AS rest_blocker_count,
        count(*) FILTER (
          WHERE
            'ROUND_ORDER_CONSTRAINT' =
              ANY(blockers.blocker_reasons)
        )::integer AS round_order_blocker_count,
        count(*) FILTER (
          WHERE
            'TARGET_CAPACITY' =
              ANY(blockers.blocker_reasons)
        )::integer AS capacity_blocker_count
      FROM championship_bracket_preview_private.resolve_match_slot_blockers_with_rest_gap(
        _job_id,
        _match_id,
        candidate_base.slot_id,
        GREATEST(
          COALESCE(_required_gap, 4),
          1
        )
      ) AS blockers
      WHERE blockers.blocker_match_id <> _match_id
    ) AS blocker_stats
    WHERE
      NOT target_state.has_sport_targets
      OR COALESCE(
        target_state.planned_match_count,
        0
      ) > 0
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
            THEN
              15
              + least(
                scored_raw.capacity_blocker_count,
                5
              )
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
            WHEN scored.direct_eligible
              THEN 0
            ELSE 1
          END,
          scored.relocation_cost,
          scored.hard_blocker_count,
          CASE
            WHEN scored.capacity_blocker_count > 0
              THEN 1
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
    greatest(
      COALESCE(_after_rank, 0),
      0
    )
  ORDER BY ranked.candidate_rank
  LIMIT greatest(
    COALESCE(
      _maximum_candidates,
      300
    ),
    1
  );
$function$;

REVOKE ALL ON FUNCTION championship_bracket_preview_private.resolve_match_relocation_candidate_slots_ranked_v7(
  UUID,
  UUID,
  BIGINT,
  BIGINT[],
  BIGINT,
  INTEGER,
  INTEGER
) FROM PUBLIC, anon, authenticated;

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
BEGIN
  RETURN 'DEAD_END';
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.try_place_match_backtracking_status(
  _job_id UUID,
  _match_id UUID,
  _target_slot_id BIGINT,
  _path_match_ids UUID[],
  _reserved_slot_ids BIGINT[],
  _depth INTEGER,
  _maximum_depth INTEGER,
  _maximum_candidates_per_match INTEGER,
  _maximum_relocations_per_level INTEGER,
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
  current_assignment RECORD;
  has_current_assignment BOOLEAN := false;
  original_match_number INTEGER;
  next_path UUID[];
  next_reserved_slots BIGINT[];
  branch_status TEXT;
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

  IF _match_id = ANY(
    COALESCE(
      _path_match_ids,
      ARRAY[]::UUID[]
    )
  ) THEN
    RETURN 'DEAD_END';
  END IF;

  IF NOT championship_bracket_preview_private.is_match_slot_static_eligible(
    _job_id,
    _match_id,
    _target_slot_id
  ) THEN
    RETURN 'DEAD_END';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.slots
      AS target_slot
    JOIN championship_bracket_preview_private.slots
      AS reserved_slot
      ON reserved_slot.job_id =
        target_slot.job_id
      AND reserved_slot.id = ANY(
        COALESCE(
          _reserved_slot_ids,
          ARRAY[]::BIGINT[]
        )
      )
      AND reserved_slot.court_key =
        target_slot.court_key
      AND reserved_slot.start_at <
        target_slot.end_at
      AND reserved_slot.end_at >
        target_slot.start_at
    WHERE target_slot.job_id = _job_id
      AND target_slot.id =
        _target_slot_id
  ) THEN
    RETURN 'DEAD_END';
  END IF;

  SELECT
    assignment.slot_id,
    assignment.match_number,
    assignment.assigned_at
  INTO current_assignment
  FROM championship_bracket_preview_private.assignments
    AS assignment
  WHERE assignment.job_id = _job_id
    AND assignment.match_id = _match_id;

  has_current_assignment := FOUND;

  IF has_current_assignment THEN
    original_match_number :=
      current_assignment.match_number;

    IF current_assignment.slot_id =
      _target_slot_id
      AND championship_bracket_preview_private.is_match_slot_eligible_with_rest_gap(
        _job_id,
        _match_id,
        _target_slot_id,
        CASE
          WHEN _relaxed_match_id IS NOT NULL
            AND _match_id =
              _relaxed_match_id
          THEN GREATEST(
            COALESCE(
              _relaxed_rest_gap,
              3
            ),
            1
          )
          ELSE 4
        END
      )
    THEN
      RETURN 'SUCCESS';
    END IF;
  END IF;

  next_path :=
    array_append(
      COALESCE(
        _path_match_ids,
        ARRAY[]::UUID[]
      ),
      _match_id
    );

  next_reserved_slots :=
    array_append(
      COALESCE(
        _reserved_slot_ids,
        ARRAY[]::BIGINT[]
      ),
      _target_slot_id
    );

  BEGIN
    IF has_current_assignment THEN
      DELETE FROM championship_bracket_preview_private.assignments
      WHERE job_id = _job_id
        AND match_id = _match_id;

      UPDATE championship_bracket_preview_private.matches
      SET assigned = false
      WHERE job_id = _job_id
        AND id = _match_id;
    END IF;

    branch_status :=
      championship_bracket_preview_private.try_resolve_match_slot_backtracking_status(
        _job_id,
        _match_id,
        _target_slot_id,
        original_match_number,
        next_path,
        next_reserved_slots,
        _depth,
        GREATEST(
          COALESCE(
            _maximum_depth,
            12
          ),
          1
        ),
        GREATEST(
          COALESCE(
            _maximum_candidates_per_match,
            120
          ),
          1
        ),
        GREATEST(
          COALESCE(
            _maximum_relocations_per_level,
            40
          ),
          1
        ),
        0,
        _relaxed_match_id,
        GREATEST(
          COALESCE(
            _relaxed_rest_gap,
            3
          ),
          1
        ),
        _deadline
      );

    IF branch_status = 'SUCCESS' THEN
      RETURN 'SUCCESS';
    END IF;

    IF branch_status = 'TIMEOUT' THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'LJ003',
          MESSAGE = 'Backtracking branch timed out';
    END IF;

    RAISE EXCEPTION
      USING
        ERRCODE = 'LJ001',
        MESSAGE = 'Backtracking branch failed';

  EXCEPTION
    WHEN SQLSTATE 'LJ003' THEN
      RETURN 'TIMEOUT';
    WHEN SQLSTATE 'LJ001' THEN
      RETURN 'DEAD_END';
  END;
END;
$function$;

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
  has_hard_blockers BOOLEAN := false;
  effective_rest_gap INTEGER;
  blocker_rest_gap INTEGER;
  branch_status TEXT;
BEGIN
  IF clock_timestamp() >= _deadline THEN
    RETURN 'TIMEOUT';
  END IF;

  IF _depth > GREATEST(
    _maximum_depth,
    1
  ) THEN
    RETURN 'DEAD_END';
  END IF;

  IF _relocations_used >= GREATEST(
    _maximum_relocations,
    1
  ) THEN
    RETURN 'DEAD_END';
  END IF;

  effective_rest_gap :=
    CASE
      WHEN _relaxed_match_id IS NOT NULL
        AND _match_id =
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

  IF championship_bracket_preview_private.is_match_slot_eligible_with_rest_gap(
    _job_id,
    _match_id,
    _target_slot_id,
    effective_rest_gap
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

    RETURN 'SUCCESS';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.resolve_match_slot_blockers_with_rest_gap(
      _job_id,
      _match_id,
      _target_slot_id,
      effective_rest_gap
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
      blocker_match.round_number
        AS blocker_round_number,
      blocker_match.priority_weight
        AS blocker_priority_weight,
      blocker_match.slot_number
        AS blocker_slot_number,
      blocker_match.logical_key
        AS blocker_logical_key
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
          AND 'TARGET_CAPACITY' =
            ANY(
              blockers.blocker_reasons
            )
        )
      )
    ORDER BY
      CASE
        WHEN 'EARLIER_ROUND_PENDING' =
          ANY(blockers.blocker_reasons)
        THEN 1
        WHEN 'COURT_OCCUPATION' =
          ANY(blockers.blocker_reasons)
        THEN 2
        WHEN 'TEAM_REST_CONSTRAINT' =
          ANY(blockers.blocker_reasons)
        THEN 3
        WHEN 'ROUND_ORDER_CONSTRAINT' =
          ANY(blockers.blocker_reasons)
        THEN 4
        ELSE 5
      END,
      blocker_match.priority_weight
        DESC NULLS LAST,
      blocker_match.round_number
        NULLS LAST,
      blocker_match.slot_number
        NULLS LAST,
      blocker_match.logical_key
        NULLS LAST,
      blockers.blocker_match_id
  LOOP
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
      SELECT candidate_slot.*
      FROM championship_bracket_preview_private.resolve_match_relocation_candidate_slots_ranked_v7(
        _job_id,
        blocker_record.blocker_match_id,
        blocker_record.blocker_slot_id,
        _reserved_slot_ids,
        0,
        _maximum_candidates_per_match,
        blocker_rest_gap
      ) AS candidate_slot
      WHERE (
        NOT (
          'TARGET_CAPACITY' =
            ANY(
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
          'EARLIER_ROUND_PENDING' =
            ANY(
              blocker_record.blocker_reasons
            )
        )
        OR candidate_slot.end_at <=
          target_start_at
      )
      AND (
        NOT (
          'ROUND_ORDER_CONSTRAINT' =
            ANY(
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
          'TEAM_REST_CONSTRAINT' =
            ANY(
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
        candidate_slot.candidate_rank
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

  IF clock_timestamp() >= _deadline THEN
    RETURN 'TIMEOUT';
  END IF;

  RETURN 'DEAD_END';
END;
$function$;

REVOKE ALL ON FUNCTION championship_bracket_preview_private.try_place_match_backtracking_status(
  UUID,
  UUID,
  BIGINT,
  UUID[],
  BIGINT[],
  INTEGER,
  INTEGER,
  INTEGER,
  INTEGER,
  UUID,
  INTEGER,
  TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION championship_bracket_preview_private.try_resolve_match_slot_backtracking_status(
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
  UUID,
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
  current_phase TEXT;
  current_rest_gap INTEGER;
  branch_status TEXT;
  attempted_slot_ids BIGINT[] :=
    ARRAY[]::BIGINT[];
  attempted_candidates INTEGER := 0;
  has_unresolved_candidates BOOLEAN := false;
  has_relaxation_opportunity BOOLEAN := false;
  candidate_budget_seconds INTEGER;
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
      pending_match_record.relocation_candidate_cursor,
      'search_phase',
      pending_match_record.relocation_search_phase
    );
  END IF;

  current_phase :=
    CASE
      WHEN pending_match_record.relocation_search_phase =
        'RELAXED'
      THEN 'RELAXED'
      ELSE 'STRICT'
    END;

  current_rest_gap :=
    CASE
      WHEN current_phase = 'RELAXED'
      THEN 3
      ELSE 4
    END;

  LOOP
    EXIT WHEN clock_timestamp() >=
      effective_deadline;

    SELECT
      candidate_slot.*,
      COALESCE(
        candidate_state.timeout_count,
        0
      ) AS previous_timeout_count
    INTO candidate_slot_record
    FROM championship_bracket_preview_private.resolve_match_relocation_candidate_slots_ranked_v7(
      _job_id,
      _pending_match_id,
      NULL,
      ARRAY[]::BIGINT[],
      0,
      candidate_limit,
      current_rest_gap
    ) AS candidate_slot
    LEFT JOIN championship_bracket_preview_private.relocation_candidate_states
      AS candidate_state
      ON candidate_state.job_id = _job_id
      AND candidate_state.match_id =
        _pending_match_id
      AND candidate_state.phase =
        current_phase
      AND candidate_state.slot_id =
        candidate_slot.slot_id
    WHERE (
      candidate_state.status IS NULL
      OR candidate_state.status =
        'TIMED_OUT'
    )
      AND NOT (
        candidate_slot.slot_id = ANY(
          attempted_slot_ids
        )
      )
    ORDER BY
      CASE
        WHEN candidate_state.status IS NULL
        THEN 0
        ELSE 1
      END,
      COALESCE(
        candidate_state.timeout_count,
        0
      ),
      candidate_slot.candidate_rank
    LIMIT 1;

    IF NOT FOUND THEN
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
        ) AS remaining_candidate
        LEFT JOIN championship_bracket_preview_private.relocation_candidate_states
          AS remaining_state
          ON remaining_state.job_id =
            _job_id
          AND remaining_state.match_id =
            _pending_match_id
          AND remaining_state.phase =
            current_phase
          AND remaining_state.slot_id =
            remaining_candidate.slot_id
        WHERE
          remaining_state.status IS NULL
          OR remaining_state.status =
            'TIMED_OUT'
      )
      INTO has_unresolved_candidates;

      IF has_unresolved_candidates THEN
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
          pending_match_record.relocation_candidate_cursor,
          'search_phase',
          current_phase,
          'rest_gap',
          current_rest_gap
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
          ) AS relaxation_candidate
          WHERE EXISTS (
            SELECT 1
            FROM championship_bracket_preview_private.assignments
              AS strict_assignment
            WHERE strict_assignment.job_id =
              _job_id
              AND strict_assignment.match_id <>
                _pending_match_id
              AND championship_bracket_preview_private.is_match_rest_conflict_with_gap(
                _job_id,
                _pending_match_id,
                relaxation_candidate.slot_id,
                strict_assignment.match_id,
                4
              )
              AND NOT championship_bracket_preview_private.is_match_rest_conflict_with_gap(
                _job_id,
                _pending_match_id,
                relaxation_candidate.slot_id,
                strict_assignment.match_id,
                3
              )
          )
        )
        INTO has_relaxation_opportunity;

        IF has_relaxation_opportunity THEN
          UPDATE championship_bracket_preview_private.matches
          SET
            relocation_search_phase = 'RELAXED',
            relocation_candidate_cursor = 0,
            relocation_search_exhausted = false
          WHERE job_id = _job_id
            AND id = _pending_match_id
            AND assigned = false;

          RETURN jsonb_build_object(
            'assigned',
            false,
            'progressed',
            true,
            'exhausted',
            false,
            'attempted_candidates',
            attempted_candidates,
            'candidate_cursor',
            0,
            'search_phase',
            'RELAXED',
            'rest_gap',
            3,
            'phase_changed',
            true
          );
        END IF;
      END IF;

      UPDATE championship_bracket_preview_private.matches
      SET
        relocation_search_exhausted = true,
        relocation_candidate_cursor =
          COALESCE(
            relocation_candidate_cursor,
            0
          )
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
        pending_match_record.relocation_candidate_cursor,
        'search_phase',
        current_phase,
        'rest_gap',
        current_rest_gap
      );
    END IF;

    attempted_slot_ids :=
      array_append(
        attempted_slot_ids,
        candidate_slot_record.slot_id
      );

    attempted_candidates :=
      attempted_candidates + 1;

    candidate_budget_seconds :=
      LEAST(
        10,
        3
        + COALESCE(
            candidate_slot_record.previous_timeout_count,
            0
          ) * 2
      );

    candidate_deadline :=
      LEAST(
        effective_deadline,
        clock_timestamp()
          + make_interval(
              secs =>
                candidate_budget_seconds
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
        12,
        120,
        40,
        CASE
          WHEN current_phase = 'RELAXED'
          THEN _pending_match_id
          ELSE NULL
        END,
        3,
        candidate_deadline
      );

    IF branch_status = 'SUCCESS' THEN
      UPDATE championship_bracket_preview_private.matches
      SET
        relaxed_rest_gap_applied =
          current_phase = 'RELAXED',
        applied_rest_gap =
          CASE
            WHEN current_phase = 'RELAXED'
            THEN 3
            ELSE 4
          END
      WHERE job_id = _job_id
        AND id = _pending_match_id;

      DELETE FROM championship_bracket_preview_private.relocation_candidate_states
      WHERE job_id = _job_id;

      UPDATE championship_bracket_preview_private.matches
      SET
        relocation_candidate_cursor = 0,
        relocation_search_exhausted = false,
        relocation_attempt_count = 0,
        relocation_search_phase = 'STRICT'
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
        candidate_slot_record.relocation_cost,
        'search_phase',
        current_phase,
        'rest_gap',
        current_rest_gap,
        'relaxed_rest_gap_applied',
        current_phase = 'RELAXED'
      );
    END IF;

    IF branch_status = 'TIMEOUT' THEN
      INSERT INTO championship_bracket_preview_private.relocation_candidate_states (
        job_id,
        match_id,
        phase,
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
        candidate_slot_record.slot_id,
        'TIMED_OUT',
        1,
        1,
        now()
      )
      ON CONFLICT (
        job_id,
        match_id,
        phase,
        slot_id
      )
      DO UPDATE
      SET
        status = 'TIMED_OUT',
        attempt_count =
          championship_bracket_preview_private.relocation_candidate_states.attempt_count
            + 1,
        timeout_count =
          championship_bracket_preview_private.relocation_candidate_states.timeout_count
            + 1,
        last_attempt_at = now();
    ELSE
      INSERT INTO championship_bracket_preview_private.relocation_candidate_states (
        job_id,
        match_id,
        phase,
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
        candidate_slot_record.slot_id,
        'DEAD_END',
        1,
        0,
        now()
      )
      ON CONFLICT (
        job_id,
        match_id,
        phase,
        slot_id
      )
      DO UPDATE
      SET
        status = 'DEAD_END',
        attempt_count =
          championship_bracket_preview_private.relocation_candidate_states.attempt_count
            + 1,
        last_attempt_at = now();
    END IF;

    UPDATE championship_bracket_preview_private.matches
    SET
      relocation_candidate_cursor =
        candidate_slot_record.candidate_rank,
      relocation_attempt_count =
        relocation_attempt_count + 1
    WHERE job_id = _job_id
      AND id = _pending_match_id
      AND assigned = false;

    pending_match_record.relocation_candidate_cursor :=
      candidate_slot_record.candidate_rank;

    EXIT WHEN clock_timestamp() >=
      effective_deadline;
  END LOOP;

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
    pending_match_record.relocation_candidate_cursor,
    'search_phase',
    current_phase,
    'rest_gap',
    current_rest_gap
  );
END;
$function$;

REVOKE ALL ON FUNCTION championship_bracket_preview_private.try_relocate_for_match_search(
  UUID,
  UUID,
  INTEGER
) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  function_definition TEXT;
  original_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'championship_bracket_preview_private.process_batch(uuid)'::regprocedure
  )
  INTO function_definition;

  original_definition :=
    function_definition;

  IF position(
    'async-exact-v7'
    IN function_definition
  ) = 0 THEN
    function_definition :=
      replace(
        function_definition,
        $old$    'async-exact-v4',
    'async-exact-v5',
    'async-exact-v6'
  )$old$,
        $new$    'async-exact-v4',
    'async-exact-v5',
    'async-exact-v6',
    'async-exact-v7'
  )$new$
      );
  END IF;

  IF function_definition =
    original_definition
    AND position(
      'async-exact-v7'
      IN function_definition
    ) = 0
  THEN
    RAISE EXCEPTION
      'Não foi possível adicionar async-exact-v7 ao process_batch.';
  END IF;

  EXECUTE function_definition;
END;
$$;

ALTER TABLE championship_bracket_preview_private.jobs
ALTER COLUMN algorithm_version
SET DEFAULT 'async-exact-v7';

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
    'async-exact-v6',
    'async-exact-v7'
  );

  SELECT pg_get_functiondef(
    'public.get_championship_bracket_preview_job_status(uuid)'::regprocedure
  )
  INTO function_definition;

  EXECUTE replace(
    function_definition,
    'async-exact-v6',
    'async-exact-v7'
  );

  SELECT pg_get_functiondef(
    'public.create_championship_bracket_from_preview_job(uuid,uuid,jsonb)'::regprocedure
  )
  INTO function_definition;

  EXECUTE replace(
    function_definition,
    'async-exact-v6',
    'async-exact-v7'
  );
END;
$$;

UPDATE championship_bracket_preview_private.jobs
SET
  status = 'CANCELLED',
  stage =
    'Substituída pelo algoritmo async-exact-v7',
  expires_at =
    now() + interval '24 hours',
  heartbeat_at = now(),
  updated_at = now()
WHERE algorithm_version =
    'async-exact-v6'
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
  batch_definition TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema =
      'championship_bracket_preview_private'
      AND table_name = 'matches'
      AND column_name =
        'relocation_search_phase'
  ) THEN
    RAISE EXCEPTION
      'relocation_search_phase não foi criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema =
      'championship_bracket_preview_private'
      AND table_name = 'matches'
      AND column_name =
        'relaxed_rest_gap_applied'
  ) THEN
    RAISE EXCEPTION
      'relaxed_rest_gap_applied não foi criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema =
      'championship_bracket_preview_private'
      AND table_name = 'matches'
      AND column_name =
        'applied_rest_gap'
  ) THEN
    RAISE EXCEPTION
      'applied_rest_gap não foi criada.';
  END IF;

  IF to_regclass(
    'championship_bracket_preview_private.relocation_candidate_states'
  ) IS NULL THEN
    RAISE EXCEPTION
      'relocation_candidate_states não foi criada.';
  END IF;

  IF to_regprocedure(
    'championship_bracket_preview_private.is_match_pair_rest_conflict(uuid,uuid,bigint,uuid,bigint,integer)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'is_match_pair_rest_conflict não foi criada.';
  END IF;

  IF to_regprocedure(
    'championship_bracket_preview_private.is_match_rest_conflict_with_gap(uuid,uuid,bigint,uuid,integer)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'is_match_rest_conflict_with_gap não foi criada.';
  END IF;

  IF to_regprocedure(
    'championship_bracket_preview_private.is_match_slot_eligible_with_rest_gap(uuid,uuid,bigint,integer)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'is_match_slot_eligible_with_rest_gap não foi criada.';
  END IF;

  IF to_regprocedure(
    'championship_bracket_preview_private.resolve_match_slot_blockers_with_rest_gap(uuid,uuid,bigint,integer)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'resolve_match_slot_blockers_with_rest_gap não foi criada.';
  END IF;

  IF to_regprocedure(
    'championship_bracket_preview_private.resolve_match_relocation_candidate_slots_ranked_v7(uuid,uuid,bigint,bigint[],bigint,integer,integer)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'resolve_match_relocation_candidate_slots_ranked_v7 não foi criada.';
  END IF;

  IF to_regprocedure(
    'championship_bracket_preview_private.try_place_match_backtracking_status(uuid,uuid,bigint,uuid[],bigint[],integer,integer,integer,integer,uuid,integer,timestamp with time zone)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'try_place_match_backtracking_status não foi criada.';
  END IF;

  IF to_regprocedure(
    'championship_bracket_preview_private.try_resolve_match_slot_backtracking_status(uuid,uuid,bigint,integer,uuid[],bigint[],integer,integer,integer,integer,integer,uuid,integer,timestamp with time zone)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'try_resolve_match_slot_backtracking_status não foi criada.';
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
      'async-exact-v7'
      IN algorithm_default
    ) = 0
  THEN
    RAISE EXCEPTION
      'O default de algorithm_version não foi atualizado para async-exact-v7.';
  END IF;

  SELECT pg_get_functiondef(
    'championship_bracket_preview_private.process_batch(uuid)'::regprocedure
  )
  INTO batch_definition;

  IF position(
    'async-exact-v7'
    IN batch_definition
  ) = 0 THEN
    RAISE EXCEPTION
      'process_batch não reconhece async-exact-v7.';
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
    'async-exact-v7'
    IN start_definition
  ) = 0 THEN
    RAISE EXCEPTION
      'start_championship_bracket_preview_job não foi atualizada para async-exact-v7.';
  END IF;

  IF position(
    'async-exact-v7'
    IN status_definition
  ) = 0 THEN
    RAISE EXCEPTION
      'get_championship_bracket_preview_job_status não foi atualizada para async-exact-v7.';
  END IF;

  IF position(
    'async-exact-v7'
    IN creation_definition
  ) = 0 THEN
    RAISE EXCEPTION
      'create_championship_bracket_from_preview_job não foi atualizada para async-exact-v7.';
  END IF;
END;
$$;