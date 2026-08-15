ALTER TABLE championship_bracket_preview_private.manifest_solver_state
ADD COLUMN IF NOT EXISTS phase_started_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE championship_bracket_preview_private.manifest_solver_state
ADD COLUMN IF NOT EXISTS phase_backtracks BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS championship_bracket_preview_private.manifest_solver_candidates (
  job_id UUID NOT NULL
    REFERENCES championship_bracket_preview_private.jobs(id)
    ON DELETE CASCADE,
  match_id UUID NOT NULL
    REFERENCES championship_bracket_preview_private.matches(id)
    ON DELETE CASCADE,
  slot_id BIGINT NOT NULL
    REFERENCES championship_bracket_preview_private.slots(id)
    ON DELETE CASCADE,
  base_rank INTEGER NOT NULL,
  PRIMARY KEY (
    job_id,
    match_id,
    slot_id
  )
);

CREATE INDEX IF NOT EXISTS manifest_solver_candidates_match_idx
ON championship_bracket_preview_private.manifest_solver_candidates (
  job_id,
  match_id,
  base_rank
);

CREATE INDEX IF NOT EXISTS manifest_solver_candidates_slot_idx
ON championship_bracket_preview_private.manifest_solver_candidates (
  job_id,
  slot_id
);

CREATE TABLE IF NOT EXISTS championship_bracket_preview_private.manifest_solver_frames (
  job_id UUID NOT NULL
    REFERENCES championship_bracket_preview_private.jobs(id)
    ON DELETE CASCADE,
  naipe public.match_naipe NOT NULL,
  rest_gap INTEGER NOT NULL
    CHECK (rest_gap IN (2, 3)),
  depth INTEGER NOT NULL,
  match_id UUID NOT NULL
    REFERENCES championship_bracket_preview_private.matches(id)
    ON DELETE CASCADE,
  chosen_slot_id BIGINT
    REFERENCES championship_bracket_preview_private.slots(id)
    ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (
    job_id,
    naipe,
    rest_gap,
    depth
  ),
  UNIQUE (
    job_id,
    match_id
  )
);

CREATE TABLE IF NOT EXISTS championship_bracket_preview_private.manifest_solver_tried_slots (
  job_id UUID NOT NULL
    REFERENCES championship_bracket_preview_private.jobs(id)
    ON DELETE CASCADE,
  naipe public.match_naipe NOT NULL,
  rest_gap INTEGER NOT NULL
    CHECK (rest_gap IN (2, 3)),
  depth INTEGER NOT NULL,
  match_id UUID NOT NULL
    REFERENCES championship_bracket_preview_private.matches(id)
    ON DELETE CASCADE,
  slot_id BIGINT NOT NULL
    REFERENCES championship_bracket_preview_private.slots(id)
    ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (
    job_id,
    naipe,
    rest_gap,
    depth,
    slot_id
  )
);

CREATE INDEX IF NOT EXISTS manifest_solver_tried_slots_frame_idx
ON championship_bracket_preview_private.manifest_solver_tried_slots (
  job_id,
  naipe,
  rest_gap,
  depth,
  match_id
);

DO $migration$
BEGIN
  IF to_regprocedure(
    'championship_bracket_preview_private.process_manifest_group_batch_unbounded_csp_v8(uuid)'
  ) IS NULL THEN
    ALTER FUNCTION championship_bracket_preview_private.process_manifest_group_batch(UUID)
    RENAME TO process_manifest_group_batch_unbounded_csp_v8;
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.prepare_manifest_csp_candidates(
  _job_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
BEGIN
  DELETE FROM championship_bracket_preview_private.manifest_solver_candidates
  WHERE job_id = _job_id;

  INSERT INTO championship_bracket_preview_private.manifest_solver_candidates (
    job_id,
    match_id,
    slot_id,
    base_rank
  )
  SELECT
    _job_id,
    ranked.match_id,
    ranked.slot_id,
    ranked.base_rank
  FROM (
    SELECT
      matches_table.id AS match_id,
      slots_table.id AS slot_id,
      row_number() OVER (
        PARTITION BY matches_table.id
        ORDER BY
          slots_table.event_date,
          slots_table.start_at,
          slots_table.location_position,
          slots_table.court_position,
          slots_table.structural_phase_slot_number,
          slots_table.id
      )::integer AS base_rank
    FROM championship_bracket_preview_private.matches
      AS matches_table
    JOIN championship_bracket_preview_private.slots
      AS slots_table
      ON slots_table.job_id = _job_id
      AND slots_table.structural_phase = 'GROUP_STAGE'
      AND slots_table.structural_competition_id =
        matches_table.competition_id
    WHERE matches_table.job_id = _job_id
      AND championship_bracket_preview_private.is_match_slot_static_eligible(
        _job_id,
        matches_table.id,
        slots_table.id
      )
  ) AS ranked;
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.is_manifest_csp_dynamic_candidate_eligible(
  _job_id UUID,
  _match_id UUID,
  _slot_id BIGINT,
  _rest_gap INTEGER
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  WITH candidate_context AS (
    SELECT
      matches_table.id AS match_id,
      matches_table.competition_id,
      matches_table.group_id,
      matches_table.round_number,
      matches_table.home_team_id,
      matches_table.away_team_id,
      competitions_table.sport_id,
      competitions_table.naipe,
      slots_table.id AS slot_id,
      slots_table.event_date,
      slots_table.court_key,
      slots_table.start_at,
      slots_table.end_at,
      slots_table.sequence_index
    FROM championship_bracket_preview_private.manifest_solver_candidates
      AS candidate
    JOIN championship_bracket_preview_private.matches
      AS matches_table
      ON matches_table.id = candidate.match_id
    JOIN championship_bracket_preview_private.competitions
      AS competitions_table
      ON competitions_table.id =
        matches_table.competition_id
    JOIN championship_bracket_preview_private.slots
      AS slots_table
      ON slots_table.id = candidate.slot_id
    WHERE candidate.job_id = _job_id
      AND candidate.match_id = _match_id
      AND candidate.slot_id = _slot_id
  )
  SELECT COALESCE(
    (
      SELECT
        NOT EXISTS (
          SELECT 1
          FROM championship_bracket_preview_private.assignments
            AS occupied_assignment
          WHERE occupied_assignment.job_id = _job_id
            AND occupied_assignment.slot_id =
              candidate_context.slot_id
            AND occupied_assignment.match_id <>
              candidate_context.match_id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM championship_bracket_preview_private.matches
            AS earlier_match
          WHERE earlier_match.job_id = _job_id
            AND earlier_match.id <>
              candidate_context.match_id
            AND earlier_match.competition_id =
              candidate_context.competition_id
            AND earlier_match.group_id =
              candidate_context.group_id
            AND earlier_match.round_number <
              candidate_context.round_number
            AND NOT earlier_match.assigned
        )
        AND NOT EXISTS (
          SELECT 1
          FROM championship_bracket_preview_private.assignments
            AS earlier_assignment
          JOIN championship_bracket_preview_private.matches
            AS earlier_match
            ON earlier_match.id =
              earlier_assignment.match_id
          JOIN championship_bracket_preview_private.slots
            AS earlier_slot
            ON earlier_slot.id =
              earlier_assignment.slot_id
          WHERE earlier_assignment.job_id = _job_id
            AND earlier_match.competition_id =
              candidate_context.competition_id
            AND earlier_match.group_id =
              candidate_context.group_id
            AND earlier_match.round_number <
              candidate_context.round_number
            AND earlier_slot.end_at >
              candidate_context.start_at
        )
        AND NOT EXISTS (
          SELECT 1
          FROM championship_bracket_preview_private.assignments
            AS later_assignment
          JOIN championship_bracket_preview_private.matches
            AS later_match
            ON later_match.id =
              later_assignment.match_id
          JOIN championship_bracket_preview_private.slots
            AS later_slot
            ON later_slot.id =
              later_assignment.slot_id
          WHERE later_assignment.job_id = _job_id
            AND later_match.competition_id =
              candidate_context.competition_id
            AND later_match.group_id =
              candidate_context.group_id
            AND later_match.round_number >
              candidate_context.round_number
            AND candidate_context.end_at >
              later_slot.start_at
        )
        AND NOT EXISTS (
          SELECT 1
          FROM championship_bracket_preview_private.assignments
            AS other_assignment
          JOIN championship_bracket_preview_private.matches
            AS other_match
            ON other_match.id =
              other_assignment.match_id
          JOIN championship_bracket_preview_private.competitions
            AS other_competition
            ON other_competition.id =
              other_match.competition_id
          JOIN championship_bracket_preview_private.slots
            AS other_slot
            ON other_slot.id =
              other_assignment.slot_id
          WHERE other_assignment.job_id = _job_id
            AND other_assignment.match_id <>
              candidate_context.match_id
            AND other_competition.naipe =
              candidate_context.naipe
            AND other_slot.event_date =
              candidate_context.event_date
            AND (
              other_match.home_team_id IN (
                candidate_context.home_team_id,
                candidate_context.away_team_id
              )
              OR other_match.away_team_id IN (
                candidate_context.home_team_id,
                candidate_context.away_team_id
              )
            )
            AND (
              CASE
                WHEN other_slot.court_key =
                  candidate_context.court_key
                THEN
                  candidate_context.sequence_index
                    IS NOT NULL
                  AND other_slot.sequence_index
                    IS NOT NULL
                  AND abs(
                    candidate_context.sequence_index
                      - other_slot.sequence_index
                  ) <
                  CASE
                    WHEN other_competition.sport_id =
                      candidate_context.sport_id
                    THEN 3
                    ELSE LEAST(
                      3,
                      GREATEST(
                        COALESCE(_rest_gap, 3),
                        2
                      )
                    )
                  END
                ELSE
                  abs(
                    extract(
                      epoch FROM (
                        other_slot.start_at
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
                          other_slot.end_at
                            - other_slot.start_at
                        )
                      ) / 60
                    )::integer,
                    1
                  )
                  *
                  CASE
                    WHEN other_competition.sport_id =
                      candidate_context.sport_id
                    THEN 3
                    ELSE LEAST(
                      3,
                      GREATEST(
                        COALESCE(_rest_gap, 3),
                        2
                      )
                    )
                  END
              END
            )
        )
      FROM candidate_context
    ),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_manifest_csp_cached_next_match(
  _job_id UUID,
  _naipe public.match_naipe,
  _rest_gap INTEGER
)
RETURNS TABLE (
  match_id UUID,
  option_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  WITH ready_matches AS (
    SELECT
      matches_table.id,
      matches_table.priority_weight,
      matches_table.round_number,
      matches_table.slot_number,
      competitions_table.position
        AS competition_position,
      groups_table.group_number
    FROM championship_bracket_preview_private.matches
      AS matches_table
    JOIN championship_bracket_preview_private.competitions
      AS competitions_table
      ON competitions_table.id =
        matches_table.competition_id
    JOIN championship_bracket_preview_private.groups
      AS groups_table
      ON groups_table.id =
        matches_table.group_id
    WHERE matches_table.job_id = _job_id
      AND NOT matches_table.assigned
      AND competitions_table.naipe = _naipe
      AND NOT EXISTS (
        SELECT 1
        FROM championship_bracket_preview_private.matches
          AS earlier_match
        WHERE earlier_match.job_id = _job_id
          AND earlier_match.competition_id =
            matches_table.competition_id
          AND earlier_match.group_id =
            matches_table.group_id
          AND earlier_match.round_number <
            matches_table.round_number
          AND NOT earlier_match.assigned
      )
  ),
  evaluated_matches AS (
    SELECT
      ready_matches.*,
      (
        SELECT count(*)::integer
        FROM championship_bracket_preview_private.manifest_solver_candidates
          AS candidate
        WHERE candidate.job_id = _job_id
          AND candidate.match_id =
            ready_matches.id
          AND championship_bracket_preview_private.is_manifest_csp_dynamic_candidate_eligible(
            _job_id,
            ready_matches.id,
            candidate.slot_id,
            _rest_gap
          )
      ) AS option_count
    FROM ready_matches
  )
  SELECT
    evaluated_matches.id,
    evaluated_matches.option_count
  FROM evaluated_matches
  ORDER BY
    evaluated_matches.option_count,
    evaluated_matches.priority_weight DESC,
    evaluated_matches.round_number,
    evaluated_matches.competition_position,
    evaluated_matches.group_number,
    evaluated_matches.slot_number,
    evaluated_matches.id
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.reset_manifest_csp_naipe_search(
  _job_id UUID,
  _naipe public.match_naipe,
  _rest_gap INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
BEGIN
  DELETE FROM championship_bracket_preview_private.assignments
    AS assignments_table
  USING championship_bracket_preview_private.matches
    AS matches_table,
    championship_bracket_preview_private.competitions
    AS competitions_table
  WHERE assignments_table.job_id = _job_id
    AND matches_table.id =
      assignments_table.match_id
    AND competitions_table.id =
      matches_table.competition_id
    AND competitions_table.naipe =
      _naipe;

  UPDATE championship_bracket_preview_private.matches
    AS matches_table
  SET assigned = false
  FROM championship_bracket_preview_private.competitions
    AS competitions_table
  WHERE matches_table.job_id = _job_id
    AND competitions_table.id =
      matches_table.competition_id
    AND competitions_table.naipe =
      _naipe;

  DELETE FROM championship_bracket_preview_private.manifest_solver_tried_slots
  WHERE job_id = _job_id
    AND naipe = _naipe;

  DELETE FROM championship_bracket_preview_private.manifest_solver_frames
  WHERE job_id = _job_id
    AND naipe = _naipe;

  UPDATE championship_bracket_preview_private.manifest_solver_state
  SET
    rest_gap = _rest_gap,
    phase =
      CASE
        WHEN _rest_gap = 3
          THEN 'SEARCHING'
        ELSE 'SEARCHING_RELAXED'
      END,
    phase_started_at = now(),
    phase_backtracks = 0,
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
  next_match_record RECORD;
  next_naipe public.match_naipe;
  next_depth INTEGER;
  pending_count INTEGER;
  assigned_count INTEGER;
  total_count INTEGER;
  candidate_count INTEGER;
  operations_count INTEGER := 0;
  zero_candidate_diagnostics JSONB;
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
    FROM championship_bracket_preview_private.manifest_solver_state
    WHERE job_id = _job_id
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM championship_bracket_preview_private.assignments
      WHERE job_id = _job_id
    ) THEN
      RAISE EXCEPTION
        'O CSP estrutural não pode iniciar sobre atribuições preexistentes.';
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
        ORDER BY matches_table.logical_key
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
        diagnostics = zero_candidate_diagnostics,
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

    SELECT competitions_table.naipe
    INTO next_naipe
    FROM championship_bracket_preview_private.matches
      AS matches_table
    JOIN championship_bracket_preview_private.competitions
      AS competitions_table
      ON competitions_table.id =
        matches_table.competition_id
    WHERE matches_table.job_id = _job_id
    ORDER BY
      CASE competitions_table.naipe
        WHEN 'FEMININO'::public.match_naipe THEN 1
        WHEN 'MASCULINO'::public.match_naipe THEN 2
        ELSE 3
      END,
      competitions_table.naipe::text
    LIMIT 1;

    INSERT INTO championship_bracket_preview_private.manifest_solver_state (
      job_id,
      current_naipe,
      rest_gap,
      decisions_count,
      backtracks_count,
      phase,
      phase_started_at,
      phase_backtracks
    )
    VALUES (
      _job_id,
      next_naipe,
      3,
      0,
      0,
      'SEARCHING',
      now(),
      0
    );
  END IF;

  LOOP
    EXIT WHEN
      clock_timestamp() - started_clock >=
        interval '5 seconds';

    EXIT WHEN operations_count >= 80;

    SELECT *
    INTO state_record
    FROM championship_bracket_preview_private.manifest_solver_state
    WHERE job_id = _job_id
    FOR UPDATE;

    IF state_record.current_naipe IS NULL THEN
      EXIT;
    END IF;

    strict_budget_exhausted :=
      state_record.rest_gap = 3
      AND (
        state_record.phase_backtracks >= 200
        OR clock_timestamp()
          - state_record.phase_started_at
          >= interval '60 seconds'
      );

    relaxed_budget_exhausted :=
      state_record.rest_gap = 2
      AND (
        state_record.phase_backtracks >= 5000
        OR clock_timestamp()
          - state_record.phase_started_at
          >= interval '5 minutes'
      );

    IF strict_budget_exhausted THEN
      PERFORM championship_bracket_preview_private.reset_manifest_csp_naipe_search(
        _job_id,
        state_record.current_naipe,
        2
      );

      UPDATE championship_bracket_preview_private.jobs
      SET
        stage = format(
          'Otimizando grade estrutural: %s — descanso adaptativo 2',
          state_record.current_naipe
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
        jsonb_build_array(
          jsonb_build_object(
            'code',
            'STRUCTURAL_CSP_SEARCH_LIMIT_REACHED',
            'message',
            format(
              'O solver atingiu o limite de busca para o naipe %s mesmo com descanso adaptativo 2 entre modalidades diferentes.',
              state_record.current_naipe
            ),
            'naipe',
            state_record.current_naipe,
            'rest_gap',
            state_record.rest_gap,
            'phase_backtracks',
            state_record.phase_backtracks,
            'elapsed_seconds',
            extract(
              epoch FROM (
                clock_timestamp()
                  - state_record.phase_started_at
              )
            )::integer
          )
        );

      UPDATE championship_bracket_preview_private.manifest_solver_state
      SET
        phase = 'FAILED',
        updated_at = now()
      WHERE job_id = _job_id;

      UPDATE championship_bracket_preview_private.jobs
      SET
        status = 'FAILED',
        stage = 'Limite da otimização estrutural',
        progress_percentage = 100,
        diagnostics = failure_diagnostics,
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

    SELECT count(*)
    INTO pending_count
    FROM championship_bracket_preview_private.matches
      AS matches_table
    JOIN championship_bracket_preview_private.competitions
      AS competitions_table
      ON competitions_table.id =
        matches_table.competition_id
    WHERE matches_table.job_id = _job_id
      AND NOT matches_table.assigned
      AND competitions_table.naipe =
        state_record.current_naipe;

    IF pending_count = 0 THEN
      DELETE FROM championship_bracket_preview_private.manifest_solver_tried_slots
      WHERE job_id = _job_id
        AND naipe =
          state_record.current_naipe;

      DELETE FROM championship_bracket_preview_private.manifest_solver_frames
      WHERE job_id = _job_id
        AND naipe =
          state_record.current_naipe;

      SELECT competitions_table.naipe
      INTO next_naipe
      FROM championship_bracket_preview_private.matches
        AS matches_table
      JOIN championship_bracket_preview_private.competitions
        AS competitions_table
        ON competitions_table.id =
          matches_table.competition_id
      WHERE matches_table.job_id = _job_id
        AND NOT matches_table.assigned
      ORDER BY
        CASE competitions_table.naipe
          WHEN 'FEMININO'::public.match_naipe THEN 1
          WHEN 'MASCULINO'::public.match_naipe THEN 2
          ELSE 3
        END,
        competitions_table.naipe::text
      LIMIT 1;

      IF next_naipe IS NULL THEN
        UPDATE championship_bracket_preview_private.manifest_solver_state
        SET
          current_naipe = NULL,
          phase = 'COMPLETE',
          updated_at = now()
        WHERE job_id = _job_id;

        EXIT;
      END IF;

      UPDATE championship_bracket_preview_private.manifest_solver_state
      SET
        current_naipe = next_naipe,
        rest_gap = 3,
        phase = 'SEARCHING',
        phase_started_at = now(),
        phase_backtracks = 0,
        updated_at = now()
      WHERE job_id = _job_id;

      UPDATE championship_bracket_preview_private.jobs
      SET
        stage = format(
          'Otimizando grade estrutural: %s — descanso 3',
          next_naipe
        ),
        heartbeat_at = now(),
        updated_at = now()
      WHERE id = _job_id;

      operations_count :=
        operations_count + 1;

      CONTINUE;
    END IF;

    should_backtrack := false;

    SELECT *
    INTO open_frame
    FROM championship_bracket_preview_private.manifest_solver_frames
    WHERE job_id = _job_id
      AND naipe =
        state_record.current_naipe
      AND rest_gap =
        state_record.rest_gap
      AND chosen_slot_id IS NULL
    ORDER BY depth DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      SELECT *
      INTO next_match_record
      FROM championship_bracket_preview_private.resolve_manifest_csp_cached_next_match(
        _job_id,
        state_record.current_naipe,
        state_record.rest_gap
      );

      IF FOUND THEN
        SELECT COALESCE(
          max(depth),
          0
        ) + 1
        INTO next_depth
        FROM championship_bracket_preview_private.manifest_solver_frames
        WHERE job_id = _job_id
          AND naipe =
            state_record.current_naipe
          AND rest_gap =
            state_record.rest_gap;

        INSERT INTO championship_bracket_preview_private.manifest_solver_frames (
          job_id,
          naipe,
          rest_gap,
          depth,
          match_id,
          chosen_slot_id
        )
        VALUES (
          _job_id,
          state_record.current_naipe,
          state_record.rest_gap,
          next_depth,
          next_match_record.match_id,
          NULL
        );

        operations_count :=
          operations_count + 1;

        CONTINUE;
      END IF;

      should_backtrack := true;
    ELSE
      SELECT
        candidate.slot_id,
        candidate.base_rank
      INTO candidate_record
      FROM championship_bracket_preview_private.manifest_solver_candidates
        AS candidate
      WHERE candidate.job_id = _job_id
        AND candidate.match_id =
          open_frame.match_id
        AND NOT EXISTS (
          SELECT 1
          FROM championship_bracket_preview_private.manifest_solver_tried_slots
            AS tried
          WHERE tried.job_id = _job_id
            AND tried.naipe =
              state_record.current_naipe
            AND tried.rest_gap =
              state_record.rest_gap
            AND tried.depth =
              open_frame.depth
            AND tried.match_id =
              open_frame.match_id
            AND tried.slot_id =
              candidate.slot_id
        )
        AND championship_bracket_preview_private.is_manifest_csp_dynamic_candidate_eligible(
          _job_id,
          open_frame.match_id,
          candidate.slot_id,
          state_record.rest_gap
        )
      ORDER BY
        candidate.base_rank,
        candidate.slot_id
      LIMIT 1;

      IF FOUND THEN
        INSERT INTO championship_bracket_preview_private.manifest_solver_tried_slots (
          job_id,
          naipe,
          rest_gap,
          depth,
          match_id,
          slot_id
        )
        VALUES (
          _job_id,
          state_record.current_naipe,
          state_record.rest_gap,
          open_frame.depth,
          open_frame.match_id,
          candidate_record.slot_id
        )
        ON CONFLICT DO NOTHING;

        INSERT INTO championship_bracket_preview_private.assignments (
          job_id,
          match_id,
          slot_id
        )
        VALUES (
          _job_id,
          open_frame.match_id,
          candidate_record.slot_id
        );

        UPDATE championship_bracket_preview_private.matches
        SET assigned = true
        WHERE job_id = _job_id
          AND id =
            open_frame.match_id;

        UPDATE championship_bracket_preview_private.manifest_solver_frames
        SET
          chosen_slot_id =
            candidate_record.slot_id,
          updated_at = now()
        WHERE job_id = _job_id
          AND naipe =
            state_record.current_naipe
          AND rest_gap =
            state_record.rest_gap
          AND depth =
            open_frame.depth;

        UPDATE championship_bracket_preview_private.manifest_solver_state
        SET
          decisions_count =
            decisions_count + 1,
          updated_at = now()
        WHERE job_id = _job_id;

        operations_count :=
          operations_count + 1;

        CONTINUE;
      END IF;

      should_backtrack := true;

      DELETE FROM championship_bracket_preview_private.manifest_solver_tried_slots
      WHERE job_id = _job_id
        AND naipe =
          state_record.current_naipe
        AND rest_gap =
          state_record.rest_gap
        AND depth =
          open_frame.depth;

      DELETE FROM championship_bracket_preview_private.manifest_solver_frames
      WHERE job_id = _job_id
        AND naipe =
          state_record.current_naipe
        AND rest_gap =
          state_record.rest_gap
        AND depth =
          open_frame.depth;
    END IF;

    IF should_backtrack THEN
      SELECT *
      INTO parent_frame
      FROM championship_bracket_preview_private.manifest_solver_frames
      WHERE job_id = _job_id
        AND naipe =
          state_record.current_naipe
        AND rest_gap =
          state_record.rest_gap
        AND chosen_slot_id IS NOT NULL
      ORDER BY depth DESC
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        DELETE FROM championship_bracket_preview_private.assignments
        WHERE job_id = _job_id
          AND match_id =
            parent_frame.match_id;

        UPDATE championship_bracket_preview_private.matches
        SET assigned = false
        WHERE job_id = _job_id
          AND id =
            parent_frame.match_id;

        UPDATE championship_bracket_preview_private.manifest_solver_frames
        SET
          chosen_slot_id = NULL,
          updated_at = now()
        WHERE job_id = _job_id
          AND naipe =
            state_record.current_naipe
          AND rest_gap =
            state_record.rest_gap
          AND depth =
            parent_frame.depth;

        UPDATE championship_bracket_preview_private.manifest_solver_state
        SET
          backtracks_count =
            backtracks_count + 1,
          phase_backtracks =
            phase_backtracks + 1,
          updated_at = now()
        WHERE job_id = _job_id;

        operations_count :=
          operations_count + 1;

        CONTINUE;
      END IF;

      IF state_record.rest_gap = 3 THEN
        PERFORM championship_bracket_preview_private.reset_manifest_csp_naipe_search(
          _job_id,
          state_record.current_naipe,
          2
        );

        UPDATE championship_bracket_preview_private.jobs
        SET
          stage = format(
            'Otimizando grade estrutural: %s — descanso adaptativo 2',
            state_record.current_naipe
          ),
          heartbeat_at = now(),
          updated_at = now()
        WHERE id = _job_id;

        operations_count :=
          operations_count + 1;

        CONTINUE;
      END IF;

      failure_diagnostics :=
        jsonb_build_array(
          jsonb_build_object(
            'code',
            'STRUCTURAL_CSP_NO_BRANCH_AVAILABLE',
            'message',
            format(
              'O solver esgotou os ramos disponíveis para o naipe %s com descanso adaptativo 2.',
              state_record.current_naipe
            ),
            'naipe',
            state_record.current_naipe,
            'rest_gap',
            state_record.rest_gap
          )
        );

      UPDATE championship_bracket_preview_private.manifest_solver_state
      SET
        phase = 'FAILED',
        updated_at = now()
      WHERE job_id = _job_id;

      UPDATE championship_bracket_preview_private.jobs
      SET
        status = 'FAILED',
        stage = 'Falha na otimização estrutural',
        progress_percentage = 100,
        diagnostics = failure_diagnostics,
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

  SELECT count(*)
  INTO assigned_count
  FROM championship_bracket_preview_private.matches
  WHERE job_id = _job_id
    AND assigned;

  SELECT count(*)
  INTO total_count
  FROM championship_bracket_preview_private.matches
  WHERE job_id = _job_id;

  pending_count :=
    total_count - assigned_count;

  SELECT *
  INTO state_record
  FROM championship_bracket_preview_private.manifest_solver_state
  WHERE job_id = _job_id;

  UPDATE championship_bracket_preview_private.jobs
  SET
    processed_slots = assigned_count,
    progress_percentage =
      CASE
        WHEN pending_count = 0
          THEN 95
        ELSE LEAST(
          90,
          5 + (
            85
            * assigned_count::numeric
            / GREATEST(
              total_count,
              1
            )
          )
        )
      END,
    stage =
      CASE
        WHEN pending_count = 0
          THEN 'Materializando mata-mata estrutural'
        ELSE format(
          'Otimizando grade estrutural: %s — %s de %s jogos, descanso %s',
          state_record.current_naipe,
          assigned_count,
          total_count,
          state_record.rest_gap
        )
      END,
    heartbeat_at = now(),
    updated_at = now()
  WHERE id = _job_id;

  IF pending_count = 0 THEN
    UPDATE championship_bracket_preview_private.slots
    SET processed = true
    WHERE job_id = _job_id
      AND structural_phase =
        'GROUP_STAGE';

    UPDATE championship_bracket_preview_private.manifest_solver_state
    SET
      current_naipe = NULL,
      phase = 'COMPLETE',
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

  SELECT count(*)
  INTO candidate_count
  FROM championship_bracket_preview_private.manifest_solver_candidates
  WHERE job_id = _job_id;

  RETURN jsonb_build_object(
    'continue',
    true,
    'delay',
    0,
    'assigned',
    assigned_count,
    'pending',
    pending_count,
    'cached_candidates',
    candidate_count,
    'rest_gap',
    state_record.rest_gap,
    'phase_backtracks',
    state_record.phase_backtracks
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';