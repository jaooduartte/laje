CREATE TABLE IF NOT EXISTS championship_bracket_preview_private.manifest_daily_solver_state (
  job_id UUID PRIMARY KEY
    REFERENCES championship_bracket_preview_private.jobs(id)
    ON DELETE CASCADE,
  processing_date DATE,
  rest_gap INTEGER NOT NULL DEFAULT 3
    CHECK (rest_gap IN (2, 3)),
  phase TEXT NOT NULL DEFAULT 'SEARCHING_DAY',
  completed_days INTEGER NOT NULL DEFAULT 0,
  decisions_count BIGINT NOT NULL DEFAULT 0,
  total_backtracks BIGINT NOT NULL DEFAULT 0,
  day_backtracks BIGINT NOT NULL DEFAULT 0,
  day_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_forward_diagnostics JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS championship_bracket_preview_private.manifest_daily_solver_frames (
  job_id UUID NOT NULL
    REFERENCES championship_bracket_preview_private.jobs(id)
    ON DELETE CASCADE,
  event_date DATE NOT NULL,
  rest_gap INTEGER NOT NULL
    CHECK (rest_gap IN (2, 3)),
  depth INTEGER NOT NULL,
  slot_id BIGINT NOT NULL
    REFERENCES championship_bracket_preview_private.slots(id)
    ON DELETE CASCADE,
  chosen_match_id UUID
    REFERENCES championship_bracket_preview_private.matches(id)
    ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (
    job_id,
    event_date,
    rest_gap,
    depth
  ),
  UNIQUE (
    job_id,
    event_date,
    rest_gap,
    slot_id
  )
);

CREATE TABLE IF NOT EXISTS championship_bracket_preview_private.manifest_daily_solver_tried_matches (
  job_id UUID NOT NULL
    REFERENCES championship_bracket_preview_private.jobs(id)
    ON DELETE CASCADE,
  event_date DATE NOT NULL,
  rest_gap INTEGER NOT NULL
    CHECK (rest_gap IN (2, 3)),
  depth INTEGER NOT NULL,
  slot_id BIGINT NOT NULL
    REFERENCES championship_bracket_preview_private.slots(id)
    ON DELETE CASCADE,
  match_id UUID NOT NULL
    REFERENCES championship_bracket_preview_private.matches(id)
    ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (
    job_id,
    event_date,
    rest_gap,
    depth,
    match_id
  )
);

CREATE INDEX IF NOT EXISTS manifest_daily_solver_frames_day_idx
ON championship_bracket_preview_private.manifest_daily_solver_frames (
  job_id,
  event_date,
  rest_gap,
  depth DESC
);

CREATE INDEX IF NOT EXISTS manifest_daily_solver_tried_day_idx
ON championship_bracket_preview_private.manifest_daily_solver_tried_matches (
  job_id,
  event_date,
  rest_gap,
  depth,
  slot_id
);

DO $migration$
BEGIN
  IF to_regprocedure(
    'championship_bracket_preview_private.process_manifest_group_batch_cached_csp_v8(uuid)'
  ) IS NULL THEN
    ALTER FUNCTION championship_bracket_preview_private.process_manifest_group_batch(UUID)
    RENAME TO process_manifest_group_batch_cached_csp_v8;
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_manifest_daily_future_diagnostics(
  _job_id UUID,
  _closed_date DATE
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  WITH remaining_matches AS (
    SELECT
      matches_table.id,
      matches_table.logical_key,
      matches_table.competition_id,
      competitions_table.competition_key,
      competitions_table.sport_name,
      competitions_table.naipe,
      competitions_table.division
    FROM championship_bracket_preview_private.matches
      AS matches_table
    JOIN championship_bracket_preview_private.competitions
      AS competitions_table
      ON competitions_table.id =
        matches_table.competition_id
    WHERE matches_table.job_id = _job_id
      AND NOT matches_table.assigned
  ),
  remaining_by_competition AS (
    SELECT
      remaining_matches.competition_id,
      max(remaining_matches.competition_key)
        AS competition_key,
      count(*)::integer
        AS remaining_matches
    FROM remaining_matches
    GROUP BY
      remaining_matches.competition_id
  ),
  future_slots_by_competition AS (
    SELECT
      slots_table.structural_competition_id
        AS competition_id,
      count(*)::integer
        AS future_slots
    FROM championship_bracket_preview_private.slots
      AS slots_table
    WHERE slots_table.job_id = _job_id
      AND slots_table.structural_phase =
        'GROUP_STAGE'
      AND slots_table.event_date >
        _closed_date
      AND NOT EXISTS (
        SELECT 1
        FROM championship_bracket_preview_private.assignments
          AS assignments_table
        WHERE assignments_table.job_id = _job_id
          AND assignments_table.slot_id =
            slots_table.id
      )
    GROUP BY
      slots_table.structural_competition_id
  ),
  diagnostics AS (
    SELECT jsonb_build_object(
      'code',
      'DAILY_FUTURE_MATCH_WITHOUT_SLOT',
      'message',
      format(
        'O confronto %s não possui slot estrutural futuro elegível após %s.',
        remaining_matches.logical_key,
        _closed_date
      ),
      'match_id',
      remaining_matches.id,
      'logical_key',
      remaining_matches.logical_key,
      'competition_key',
      remaining_matches.competition_key,
      'after_date',
      _closed_date
    ) AS diagnostic
    FROM remaining_matches
    WHERE NOT EXISTS (
      SELECT 1
      FROM championship_bracket_preview_private.manifest_solver_candidates
        AS candidate
      JOIN championship_bracket_preview_private.slots
        AS candidate_slot
        ON candidate_slot.id =
          candidate.slot_id
      WHERE candidate.job_id = _job_id
        AND candidate.match_id =
          remaining_matches.id
        AND candidate_slot.event_date >
          _closed_date
        AND candidate_slot.structural_phase =
          'GROUP_STAGE'
        AND NOT EXISTS (
          SELECT 1
          FROM championship_bracket_preview_private.assignments
            AS occupied_assignment
          WHERE occupied_assignment.job_id =
            _job_id
            AND occupied_assignment.slot_id =
              candidate_slot.id
        )
    )

    UNION ALL

    SELECT jsonb_build_object(
      'code',
      'DAILY_FUTURE_COMPETITION_CAPACITY',
      'message',
      format(
        '%s possui %s jogos restantes, mas somente %s slots estruturais futuros após %s.',
        remaining_by_competition.competition_key,
        remaining_by_competition.remaining_matches,
        COALESCE(
          future_slots_by_competition.future_slots,
          0
        ),
        _closed_date
      ),
      'competition_key',
      remaining_by_competition.competition_key,
      'remaining_matches',
      remaining_by_competition.remaining_matches,
      'future_slots',
      COALESCE(
        future_slots_by_competition.future_slots,
        0
      ),
      'after_date',
      _closed_date
    )
    FROM remaining_by_competition
    LEFT JOIN future_slots_by_competition
      ON future_slots_by_competition.competition_id =
        remaining_by_competition.competition_id
    WHERE remaining_by_competition.remaining_matches >
      COALESCE(
        future_slots_by_competition.future_slots,
        0
      )
  )
  SELECT COALESCE(
    jsonb_agg(
      diagnostics.diagnostic
      ORDER BY
        diagnostics.diagnostic ->> 'code',
        diagnostics.diagnostic ->> 'competition_key',
        diagnostics.diagnostic ->> 'logical_key'
    ),
    '[]'::jsonb
  )
  FROM diagnostics;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_manifest_daily_slot_candidate(
  _job_id UUID,
  _event_date DATE,
  _slot_id BIGINT,
  _rest_gap INTEGER
)
RETURNS TABLE (
  match_id UUID,
  round_number INTEGER,
  group_number INTEGER,
  slot_number INTEGER,
  round_group_usage INTEGER,
  group_day_usage INTEGER,
  future_candidate_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  WITH slot_context AS (
    SELECT
      slots_table.id,
      slots_table.structural_competition_id
        AS competition_id
    FROM championship_bracket_preview_private.slots
      AS slots_table
    WHERE slots_table.job_id = _job_id
      AND slots_table.id = _slot_id
      AND slots_table.event_date =
        _event_date
      AND slots_table.structural_phase =
        'GROUP_STAGE'
  ),
  candidate_matches AS (
    SELECT
      matches_table.id AS match_id,
      matches_table.round_number,
      matches_table.slot_number,
      matches_table.group_id,
      groups_table.group_number,
      matches_table.priority_weight
    FROM slot_context
    JOIN championship_bracket_preview_private.manifest_solver_candidates
      AS cached_candidate
      ON cached_candidate.job_id = _job_id
      AND cached_candidate.slot_id =
        slot_context.id
    JOIN championship_bracket_preview_private.matches
      AS matches_table
      ON matches_table.id =
        cached_candidate.match_id
      AND matches_table.job_id = _job_id
      AND matches_table.competition_id =
        slot_context.competition_id
      AND NOT matches_table.assigned
    JOIN championship_bracket_preview_private.groups
      AS groups_table
      ON groups_table.id =
        matches_table.group_id
    WHERE championship_bracket_preview_private.is_manifest_csp_dynamic_candidate_eligible(
      _job_id,
      matches_table.id,
      _slot_id,
      _rest_gap
    )
  ),
  scored_matches AS (
    SELECT
      candidate_matches.*,
      (
        SELECT count(*)::integer
        FROM championship_bracket_preview_private.assignments
          AS assignments_table
        JOIN championship_bracket_preview_private.matches
          AS assigned_match
          ON assigned_match.id =
            assignments_table.match_id
        JOIN championship_bracket_preview_private.slots
          AS assigned_slot
          ON assigned_slot.id =
            assignments_table.slot_id
        WHERE assignments_table.job_id = _job_id
          AND assigned_slot.event_date =
            _event_date
          AND assigned_match.group_id =
            candidate_matches.group_id
          AND assigned_match.round_number =
            candidate_matches.round_number
      ) AS round_group_usage,
      (
        SELECT count(*)::integer
        FROM championship_bracket_preview_private.assignments
          AS assignments_table
        JOIN championship_bracket_preview_private.matches
          AS assigned_match
          ON assigned_match.id =
            assignments_table.match_id
        JOIN championship_bracket_preview_private.slots
          AS assigned_slot
          ON assigned_slot.id =
            assignments_table.slot_id
        WHERE assignments_table.job_id = _job_id
          AND assigned_slot.event_date =
            _event_date
          AND assigned_match.group_id =
            candidate_matches.group_id
      ) AS group_day_usage,
      (
        SELECT count(*)::integer
        FROM championship_bracket_preview_private.manifest_solver_candidates
          AS future_candidate
        JOIN championship_bracket_preview_private.slots
          AS future_slot
          ON future_slot.id =
            future_candidate.slot_id
        WHERE future_candidate.job_id = _job_id
          AND future_candidate.match_id =
            candidate_matches.match_id
          AND future_slot.event_date >=
            _event_date
          AND future_slot.structural_phase =
            'GROUP_STAGE'
          AND NOT EXISTS (
            SELECT 1
            FROM championship_bracket_preview_private.assignments
              AS occupied_assignment
            WHERE occupied_assignment.job_id =
              _job_id
              AND occupied_assignment.slot_id =
                future_slot.id
          )
      ) AS future_candidate_count
    FROM candidate_matches
  )
  SELECT
    scored_matches.match_id,
    scored_matches.round_number,
    scored_matches.group_number,
    scored_matches.slot_number,
    scored_matches.round_group_usage,
    scored_matches.group_day_usage,
    scored_matches.future_candidate_count
  FROM scored_matches
  ORDER BY
    scored_matches.round_number,
    scored_matches.round_group_usage,
    scored_matches.group_day_usage,
    scored_matches.future_candidate_count,
    scored_matches.priority_weight DESC,
    scored_matches.group_number,
    scored_matches.slot_number,
    scored_matches.match_id;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.reset_manifest_daily_day_search(
  _job_id UUID,
  _event_date DATE,
  _rest_gap INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
BEGIN
  UPDATE championship_bracket_preview_private.matches
    AS matches_table
  SET
    assigned = false,
    applied_rest_gap = 3,
    relaxed_rest_gap_applied = false
  WHERE matches_table.job_id = _job_id
    AND matches_table.id IN (
      SELECT assignments_table.match_id
      FROM championship_bracket_preview_private.assignments
        AS assignments_table
      JOIN championship_bracket_preview_private.slots
        AS slots_table
        ON slots_table.id =
          assignments_table.slot_id
      WHERE assignments_table.job_id = _job_id
        AND slots_table.event_date =
          _event_date
        AND slots_table.structural_phase =
          'GROUP_STAGE'
    );

  DELETE FROM championship_bracket_preview_private.assignments
  WHERE job_id = _job_id
    AND slot_id IN (
      SELECT slots_table.id
      FROM championship_bracket_preview_private.slots
        AS slots_table
      WHERE slots_table.job_id = _job_id
        AND slots_table.event_date =
          _event_date
        AND slots_table.structural_phase =
          'GROUP_STAGE'
    );

  DELETE FROM championship_bracket_preview_private.manifest_daily_solver_tried_matches
  WHERE job_id = _job_id
    AND event_date =
      _event_date;

  DELETE FROM championship_bracket_preview_private.manifest_daily_solver_frames
  WHERE job_id = _job_id
    AND event_date =
      _event_date;

  UPDATE championship_bracket_preview_private.slots
  SET processed = false
  WHERE job_id = _job_id
    AND event_date =
      _event_date
    AND structural_phase =
      'GROUP_STAGE';

  UPDATE championship_bracket_preview_private.manifest_daily_solver_state
  SET
    rest_gap = _rest_gap,
    phase =
      CASE
        WHEN _rest_gap = 3
          THEN 'SEARCHING_DAY'
        ELSE 'SEARCHING_DAY_RELAXED'
      END,
    day_backtracks = 0,
    day_started_at = now(),
    last_forward_diagnostics =
      '[]'::jsonb,
    updated_at = now()
  WHERE job_id = _job_id;
END;
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
  started_clock TIMESTAMPTZ :=
    clock_timestamp();
  state_record RECORD;
  open_frame RECORD;
  parent_frame RECORD;
  candidate_record RECORD;
  next_date DATE;
  next_slot_id BIGINT;
  next_depth INTEGER;
  current_day_total INTEGER;
  current_day_assigned INTEGER;
  total_matches INTEGER;
  assigned_matches INTEGER;
  pending_matches INTEGER;
  operations_count INTEGER := 0;
  zero_candidate_diagnostics JSONB;
  forward_diagnostics JSONB;
  failure_diagnostics JSONB;
  should_backtrack BOOLEAN;
  strict_budget_exhausted BOOLEAN;
  relaxed_budget_exhausted BOOLEAN;
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

  IF NOT EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.manifest_daily_solver_state
    WHERE job_id = _job_id
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM championship_bracket_preview_private.assignments
      WHERE job_id = _job_id
    ) THEN
      RAISE EXCEPTION
        'O scheduler diário não pode iniciar sobre atribuições preexistentes.';
    END IF;

    PERFORM championship_bracket_preview_private.prepare_manifest_csp_candidates(
      _job_id
    );

    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'code',
          'STRUCTURAL_MATCH_WITHOUT_STATIC_CANDIDATE',
          'message',
          format(
            'O confronto %s não possui nenhum slot GROUP_STAGE estruturalmente elegível.',
            matches_table.logical_key
          ),
          'logical_key',
          matches_table.logical_key,
          'match_id',
          matches_table.id,
          'competition_key',
          competitions_table.competition_key
        )
        ORDER BY
          matches_table.logical_key
      ),
      '[]'::jsonb
    )
    INTO zero_candidate_diagnostics
    FROM championship_bracket_preview_private.matches
      AS matches_table
    JOIN championship_bracket_preview_private.competitions
      AS competitions_table
      ON competitions_table.id =
        matches_table.competition_id
    WHERE matches_table.job_id = _job_id
      AND NOT EXISTS (
        SELECT 1
        FROM championship_bracket_preview_private.manifest_solver_candidates
          AS candidate
        WHERE candidate.job_id = _job_id
          AND candidate.match_id =
            matches_table.id
      );

    IF jsonb_array_length(
      zero_candidate_diagnostics
    ) > 0 THEN
      UPDATE championship_bracket_preview_private.jobs
      SET
        status = 'FAILED',
        stage = 'Validação dos candidatos estruturais',
        progress_percentage = 100,
        diagnostics =
          zero_candidate_diagnostics,
        error_message =
          zero_candidate_diagnostics -> 0 ->> 'message',
        completed_at = now(),
        expires_at =
          now() + interval '24 hours',
        heartbeat_at = now(),
        updated_at = now()
      WHERE id = _job_id;

      RETURN jsonb_build_object(
        'continue',
        false
      );
    END IF;

    SELECT min(slots_table.event_date)
    INTO next_date
    FROM championship_bracket_preview_private.slots
      AS slots_table
    WHERE slots_table.job_id = _job_id
      AND slots_table.structural_phase =
        'GROUP_STAGE';

    INSERT INTO championship_bracket_preview_private.manifest_daily_solver_state (
      job_id,
      processing_date,
      rest_gap,
      phase,
      completed_days,
      decisions_count,
      total_backtracks,
      day_backtracks,
      day_started_at,
      last_forward_diagnostics
    )
    VALUES (
      _job_id,
      next_date,
      3,
      'SEARCHING_DAY',
      0,
      0,
      0,
      0,
      now(),
      '[]'::jsonb
    );
  END IF;

  LOOP
    EXIT WHEN
      clock_timestamp() - started_clock >=
        interval '5 seconds';

    EXIT WHEN operations_count >= 100;

    SELECT *
    INTO state_record
    FROM championship_bracket_preview_private.manifest_daily_solver_state
    WHERE job_id = _job_id
    FOR UPDATE;

    IF state_record.processing_date IS NULL THEN
      EXIT;
    END IF;

    strict_budget_exhausted :=
      state_record.rest_gap = 3
      AND (
        state_record.day_backtracks >= 120
        OR clock_timestamp()
          - state_record.day_started_at >=
            interval '30 seconds'
      );

    relaxed_budget_exhausted :=
      state_record.rest_gap = 2
      AND (
        state_record.day_backtracks >= 1200
        OR clock_timestamp()
          - state_record.day_started_at >=
            interval '90 seconds'
      );

    IF strict_budget_exhausted THEN
      PERFORM championship_bracket_preview_private.reset_manifest_daily_day_search(
        _job_id,
        state_record.processing_date,
        2
      );

      UPDATE championship_bracket_preview_private.jobs
      SET
        stage = format(
          'Programando %s — descanso adaptativo 2',
          to_char(
            state_record.processing_date,
            'DD/MM/YYYY'
          )
        ),
        heartbeat_at = now(),
        updated_at = now()
      WHERE id = _job_id;

      operations_count :=
        operations_count + 1;

      CONTINUE;
    END IF;

    IF relaxed_budget_exhausted THEN
      failure_diagnostics :=
        CASE
          WHEN jsonb_array_length(
            state_record.last_forward_diagnostics
          ) > 0
          THEN
            jsonb_build_array(
              jsonb_build_object(
                'code',
                'DAILY_STRUCTURAL_SEARCH_LIMIT_REACHED',
                'message',
                format(
                  'O scheduler diário atingiu o limite de busca em %s com descanso adaptativo 2.',
                  to_char(
                    state_record.processing_date,
                    'DD/MM/YYYY'
                  )
                ),
                'date',
                state_record.processing_date,
                'rest_gap',
                state_record.rest_gap,
                'day_backtracks',
                state_record.day_backtracks
              )
            )
            || state_record.last_forward_diagnostics
          ELSE
            jsonb_build_array(
              jsonb_build_object(
                'code',
                'DAILY_STRUCTURAL_SEARCH_LIMIT_REACHED',
                'message',
                format(
                  'O scheduler diário atingiu o limite de busca em %s com descanso adaptativo 2.',
                  to_char(
                    state_record.processing_date,
                    'DD/MM/YYYY'
                  )
                ),
                'date',
                state_record.processing_date,
                'rest_gap',
                state_record.rest_gap,
                'day_backtracks',
                state_record.day_backtracks
              )
            )
        END;

      UPDATE championship_bracket_preview_private.manifest_daily_solver_state
      SET
        phase = 'FAILED',
        updated_at = now()
      WHERE job_id = _job_id;

      UPDATE championship_bracket_preview_private.jobs
      SET
        status = 'FAILED',
        stage = 'Falha na programação diária',
        progress_percentage = 100,
        diagnostics =
          failure_diagnostics,
        error_message =
          failure_diagnostics -> 0 ->> 'message',
        completed_at = now(),
        expires_at =
          now() + interval '24 hours',
        heartbeat_at = now(),
        updated_at = now()
      WHERE id = _job_id;

      RETURN jsonb_build_object(
        'continue',
        false
      );
    END IF;

    SELECT count(*)::integer
    INTO current_day_total
    FROM championship_bracket_preview_private.slots
      AS slots_table
    WHERE slots_table.job_id = _job_id
      AND slots_table.event_date =
        state_record.processing_date
      AND slots_table.structural_phase =
        'GROUP_STAGE';

    SELECT count(*)::integer
    INTO current_day_assigned
    FROM championship_bracket_preview_private.assignments
      AS assignments_table
    JOIN championship_bracket_preview_private.slots
      AS slots_table
      ON slots_table.id =
        assignments_table.slot_id
    WHERE assignments_table.job_id = _job_id
      AND slots_table.event_date =
        state_record.processing_date
      AND slots_table.structural_phase =
        'GROUP_STAGE';

    should_backtrack := false;

    IF current_day_assigned =
      current_day_total
    THEN
      SELECT championship_bracket_preview_private.resolve_manifest_daily_future_diagnostics(
        _job_id,
        state_record.processing_date
      )
      INTO forward_diagnostics;

      IF jsonb_array_length(
        forward_diagnostics
      ) = 0 THEN
        UPDATE championship_bracket_preview_private.slots
        SET processed = true
        WHERE job_id = _job_id
          AND event_date =
            state_record.processing_date
          AND structural_phase =
            'GROUP_STAGE';

        DELETE FROM championship_bracket_preview_private.manifest_daily_solver_tried_matches
        WHERE job_id = _job_id
          AND event_date =
            state_record.processing_date;

        DELETE FROM championship_bracket_preview_private.manifest_daily_solver_frames
        WHERE job_id = _job_id
          AND event_date =
            state_record.processing_date;

        SELECT min(slots_table.event_date)
        INTO next_date
        FROM championship_bracket_preview_private.slots
          AS slots_table
        WHERE slots_table.job_id = _job_id
          AND slots_table.structural_phase =
            'GROUP_STAGE'
          AND NOT slots_table.processed
          AND slots_table.event_date >
            state_record.processing_date;

        IF next_date IS NULL THEN
          UPDATE championship_bracket_preview_private.manifest_daily_solver_state
          SET
            processing_date = NULL,
            phase = 'COMPLETE',
            completed_days =
              completed_days + 1,
            last_forward_diagnostics =
              '[]'::jsonb,
            updated_at = now()
          WHERE job_id = _job_id;

          UPDATE championship_bracket_preview_private.jobs
          SET
            status = 'FINALIZING',
            stage = 'Materializando mata-mata estrutural',
            processed_slots = total_slots,
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

        UPDATE championship_bracket_preview_private.manifest_daily_solver_state
        SET
          processing_date = next_date,
          rest_gap = 3,
          phase = 'SEARCHING_DAY',
          completed_days =
            completed_days + 1,
          day_backtracks = 0,
          day_started_at = now(),
          last_forward_diagnostics =
            '[]'::jsonb,
          updated_at = now()
        WHERE job_id = _job_id;

        UPDATE championship_bracket_preview_private.jobs
        SET
          stage = format(
            'Programando %s — descanso 3',
            to_char(
              next_date,
              'DD/MM/YYYY'
            )
          ),
          current_processing_date =
            next_date,
          heartbeat_at = now(),
          updated_at = now()
        WHERE id = _job_id;

        operations_count :=
          operations_count + 1;

        CONTINUE;
      END IF;

      UPDATE championship_bracket_preview_private.manifest_daily_solver_state
      SET
        last_forward_diagnostics =
          forward_diagnostics,
        updated_at = now()
      WHERE job_id = _job_id;

      should_backtrack := true;
    END IF;

    IF NOT should_backtrack THEN
      SELECT *
      INTO open_frame
      FROM championship_bracket_preview_private.manifest_daily_solver_frames
      WHERE job_id = _job_id
        AND event_date =
          state_record.processing_date
        AND rest_gap =
          state_record.rest_gap
        AND chosen_match_id IS NULL
      ORDER BY depth DESC
      LIMIT 1
      FOR UPDATE;

      IF NOT FOUND THEN
        SELECT slots_table.id
        INTO next_slot_id
        FROM championship_bracket_preview_private.slots
          AS slots_table
        WHERE slots_table.job_id = _job_id
          AND slots_table.event_date =
            state_record.processing_date
          AND slots_table.structural_phase =
            'GROUP_STAGE'
          AND NOT EXISTS (
            SELECT 1
            FROM championship_bracket_preview_private.assignments
              AS occupied_assignment
            WHERE occupied_assignment.job_id =
              _job_id
              AND occupied_assignment.slot_id =
                slots_table.id
          )
        ORDER BY
          slots_table.start_at,
          slots_table.location_position,
          slots_table.court_position,
          slots_table.cursor_position,
          slots_table.id
        LIMIT 1;

        IF next_slot_id IS NOT NULL THEN
          SELECT COALESCE(
            max(frames_table.depth),
            0
          ) + 1
          INTO next_depth
          FROM championship_bracket_preview_private.manifest_daily_solver_frames
            AS frames_table
          WHERE frames_table.job_id = _job_id
            AND frames_table.event_date =
              state_record.processing_date
            AND frames_table.rest_gap =
              state_record.rest_gap;

          INSERT INTO championship_bracket_preview_private.manifest_daily_solver_frames (
            job_id,
            event_date,
            rest_gap,
            depth,
            slot_id,
            chosen_match_id
          )
          VALUES (
            _job_id,
            state_record.processing_date,
            state_record.rest_gap,
            next_depth,
            next_slot_id,
            NULL
          );

          operations_count :=
            operations_count + 1;

          CONTINUE;
        END IF;

        should_backtrack := true;
      ELSE
        SELECT candidate.*
        INTO candidate_record
        FROM championship_bracket_preview_private.resolve_manifest_daily_slot_candidate(
          _job_id,
          state_record.processing_date,
          open_frame.slot_id,
          state_record.rest_gap
        ) AS candidate
        WHERE NOT EXISTS (
          SELECT 1
          FROM championship_bracket_preview_private.manifest_daily_solver_tried_matches
            AS tried_match
          WHERE tried_match.job_id =
              _job_id
            AND tried_match.event_date =
              state_record.processing_date
            AND tried_match.rest_gap =
              state_record.rest_gap
            AND tried_match.depth =
              open_frame.depth
            AND tried_match.slot_id =
              open_frame.slot_id
            AND tried_match.match_id =
              candidate.match_id
        )
        ORDER BY
          candidate.round_number,
          candidate.round_group_usage,
          candidate.group_day_usage,
          candidate.future_candidate_count,
          candidate.group_number,
          candidate.slot_number,
          candidate.match_id
        LIMIT 1;

        IF FOUND THEN
          INSERT INTO championship_bracket_preview_private.manifest_daily_solver_tried_matches (
            job_id,
            event_date,
            rest_gap,
            depth,
            slot_id,
            match_id
          )
          VALUES (
            _job_id,
            state_record.processing_date,
            state_record.rest_gap,
            open_frame.depth,
            open_frame.slot_id,
            candidate_record.match_id
          )
          ON CONFLICT DO NOTHING;

          INSERT INTO championship_bracket_preview_private.assignments (
            job_id,
            match_id,
            slot_id
          )
          VALUES (
            _job_id,
            candidate_record.match_id,
            open_frame.slot_id
          );

          UPDATE championship_bracket_preview_private.matches
          SET
            assigned = true,
            applied_rest_gap =
              state_record.rest_gap,
            relaxed_rest_gap_applied =
              state_record.rest_gap = 2
          WHERE job_id = _job_id
            AND id =
              candidate_record.match_id;

          UPDATE championship_bracket_preview_private.manifest_daily_solver_frames
          SET
            chosen_match_id =
              candidate_record.match_id,
            updated_at = now()
          WHERE job_id = _job_id
            AND event_date =
              state_record.processing_date
            AND rest_gap =
              state_record.rest_gap
            AND depth =
              open_frame.depth;

          UPDATE championship_bracket_preview_private.manifest_daily_solver_state
          SET
            decisions_count =
              decisions_count + 1,
            last_forward_diagnostics =
              '[]'::jsonb,
            updated_at = now()
          WHERE job_id = _job_id;

          operations_count :=
            operations_count + 1;

          CONTINUE;
        END IF;

        DELETE FROM championship_bracket_preview_private.manifest_daily_solver_tried_matches
        WHERE job_id = _job_id
          AND event_date =
            state_record.processing_date
          AND rest_gap =
            state_record.rest_gap
          AND depth =
            open_frame.depth;

        DELETE FROM championship_bracket_preview_private.manifest_daily_solver_frames
        WHERE job_id = _job_id
          AND event_date =
            state_record.processing_date
          AND rest_gap =
            state_record.rest_gap
          AND depth =
            open_frame.depth;

        should_backtrack := true;
      END IF;
    END IF;

    IF should_backtrack THEN
      SELECT *
      INTO parent_frame
      FROM championship_bracket_preview_private.manifest_daily_solver_frames
      WHERE job_id = _job_id
        AND event_date =
          state_record.processing_date
        AND rest_gap =
          state_record.rest_gap
        AND chosen_match_id IS NOT NULL
      ORDER BY depth DESC
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        DELETE FROM championship_bracket_preview_private.assignments
        WHERE job_id = _job_id
          AND match_id =
            parent_frame.chosen_match_id;

        UPDATE championship_bracket_preview_private.matches
        SET
          assigned = false,
          applied_rest_gap = 3,
          relaxed_rest_gap_applied = false
        WHERE job_id = _job_id
          AND id =
            parent_frame.chosen_match_id;

        UPDATE championship_bracket_preview_private.manifest_daily_solver_frames
        SET
          chosen_match_id = NULL,
          updated_at = now()
        WHERE job_id = _job_id
          AND event_date =
            state_record.processing_date
          AND rest_gap =
            state_record.rest_gap
          AND depth =
            parent_frame.depth;

        UPDATE championship_bracket_preview_private.manifest_daily_solver_state
        SET
          total_backtracks =
            total_backtracks + 1,
          day_backtracks =
            day_backtracks + 1,
          updated_at = now()
        WHERE job_id = _job_id;

        operations_count :=
          operations_count + 1;

        CONTINUE;
      END IF;

      IF state_record.rest_gap = 3 THEN
        PERFORM championship_bracket_preview_private.reset_manifest_daily_day_search(
          _job_id,
          state_record.processing_date,
          2
        );

        UPDATE championship_bracket_preview_private.jobs
        SET
          stage = format(
            'Programando %s — descanso adaptativo 2',
            to_char(
              state_record.processing_date,
              'DD/MM/YYYY'
            )
          ),
          heartbeat_at = now(),
          updated_at = now()
        WHERE id = _job_id;

        operations_count :=
          operations_count + 1;

        CONTINUE;
      END IF;

      failure_diagnostics :=
        CASE
          WHEN jsonb_array_length(
            state_record.last_forward_diagnostics
          ) > 0
          THEN
            jsonb_build_array(
              jsonb_build_object(
                'code',
                'DAILY_STRUCTURAL_NO_SOLUTION',
                'message',
                format(
                  'Não foi encontrada distribuição válida para %s mesmo com descanso adaptativo 2.',
                  to_char(
                    state_record.processing_date,
                    'DD/MM/YYYY'
                  )
                ),
                'date',
                state_record.processing_date,
                'rest_gap',
                state_record.rest_gap
              )
            )
            || state_record.last_forward_diagnostics
          ELSE
            jsonb_build_array(
              jsonb_build_object(
                'code',
                'DAILY_STRUCTURAL_NO_SOLUTION',
                'message',
                format(
                  'Não foi encontrada distribuição válida para %s mesmo com descanso adaptativo 2.',
                  to_char(
                    state_record.processing_date,
                    'DD/MM/YYYY'
                  )
                ),
                'date',
                state_record.processing_date,
                'rest_gap',
                state_record.rest_gap
              )
            )
        END;

      UPDATE championship_bracket_preview_private.manifest_daily_solver_state
      SET
        phase = 'FAILED',
        updated_at = now()
      WHERE job_id = _job_id;

      UPDATE championship_bracket_preview_private.jobs
      SET
        status = 'FAILED',
        stage = 'Falha na programação diária',
        progress_percentage = 100,
        diagnostics =
          failure_diagnostics,
        error_message =
          failure_diagnostics -> 0 ->> 'message',
        completed_at = now(),
        expires_at =
          now() + interval '24 hours',
        heartbeat_at = now(),
        updated_at = now()
      WHERE id = _job_id;

      RETURN jsonb_build_object(
        'continue',
        false
      );
    END IF;
  END LOOP;

  SELECT count(*)::integer
  INTO total_matches
  FROM championship_bracket_preview_private.matches
  WHERE job_id = _job_id;

  SELECT count(*)::integer
  INTO assigned_matches
  FROM championship_bracket_preview_private.matches
  WHERE job_id = _job_id
    AND assigned;

  pending_matches :=
    total_matches - assigned_matches;

  SELECT *
  INTO state_record
  FROM championship_bracket_preview_private.manifest_daily_solver_state
  WHERE job_id = _job_id;

  SELECT count(*)::integer
  INTO current_day_total
  FROM championship_bracket_preview_private.slots
  WHERE job_id = _job_id
    AND event_date =
      state_record.processing_date
    AND structural_phase =
      'GROUP_STAGE';

  SELECT count(*)::integer
  INTO current_day_assigned
  FROM championship_bracket_preview_private.assignments
    AS assignments_table
  JOIN championship_bracket_preview_private.slots
    AS slots_table
    ON slots_table.id =
      assignments_table.slot_id
  WHERE assignments_table.job_id = _job_id
    AND slots_table.event_date =
      state_record.processing_date
    AND slots_table.structural_phase =
      'GROUP_STAGE';

  UPDATE championship_bracket_preview_private.jobs
  SET
    processed_slots =
      assigned_matches,
    current_processing_date =
      state_record.processing_date,
    progress_percentage =
      CASE
        WHEN pending_matches = 0
          THEN 95
        ELSE LEAST(
          90,
          5 + (
            85
            * assigned_matches::numeric
            / GREATEST(
              total_matches,
              1
            )
          )
        )
      END,
    stage =
      CASE
        WHEN pending_matches = 0
          THEN 'Materializando mata-mata estrutural'
        ELSE format(
          'Programando %s — %s de %s jogos do dia, %s de %s grupos no total, descanso %s',
          to_char(
            state_record.processing_date,
            'DD/MM/YYYY'
          ),
          current_day_assigned,
          current_day_total,
          assigned_matches,
          total_matches,
          state_record.rest_gap
        )
      END,
    heartbeat_at = now(),
    updated_at = now()
  WHERE id = _job_id;

  RETURN jsonb_build_object(
    'continue',
    true,
    'delay',
    0,
    'date',
    state_record.processing_date,
    'day_assigned',
    current_day_assigned,
    'day_total',
    current_day_total,
    'assigned',
    assigned_matches,
    'pending',
    pending_matches,
    'rest_gap',
    state_record.rest_gap,
    'day_backtracks',
    state_record.day_backtracks,
    'completed_days',
    state_record.completed_days
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';