CREATE TABLE IF NOT EXISTS championship_bracket_preview_private.manifest_solver_state (
  job_id UUID PRIMARY KEY
    REFERENCES championship_bracket_preview_private.jobs(id)
    ON DELETE CASCADE,
  current_naipe public.match_naipe,
  rest_gap INTEGER NOT NULL DEFAULT 3
    CHECK (rest_gap IN (2, 3)),
  decisions_count BIGINT NOT NULL DEFAULT 0,
  backtracks_count BIGINT NOT NULL DEFAULT 0,
  phase TEXT NOT NULL DEFAULT 'SEARCHING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS championship_bracket_preview_private.manifest_solver_decisions (
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
  candidate_rank INTEGER NOT NULL,
  pressure BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (
    job_id,
    naipe,
    depth
  ),
  UNIQUE (
    job_id,
    match_id
  ),
  UNIQUE (
    job_id,
    slot_id
  )
);

CREATE INDEX IF NOT EXISTS manifest_solver_decisions_search_idx
ON championship_bracket_preview_private.manifest_solver_decisions (
  job_id,
  naipe,
  rest_gap,
  depth DESC
);

DO $migration$
BEGIN
  IF to_regprocedure(
    'championship_bracket_preview_private.process_manifest_group_batch_greedy_v8(uuid)'
  ) IS NULL THEN
    ALTER FUNCTION championship_bracket_preview_private.process_manifest_group_batch(UUID)
    RENAME TO process_manifest_group_batch_greedy_v8;
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_manifest_csp_candidate_slots(
  _job_id UUID,
  _match_id UUID,
  _rest_gap INTEGER
)
RETURNS TABLE (
  slot_id BIGINT,
  candidate_rank INTEGER,
  pressure BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  WITH match_context AS (
    SELECT
      matches_table.id AS match_id,
      matches_table.competition_id,
      matches_table.home_team_id,
      matches_table.away_team_id,
      competitions_table.naipe
    FROM championship_bracket_preview_private.matches
      AS matches_table
    JOIN championship_bracket_preview_private.competitions
      AS competitions_table
      ON competitions_table.id =
        matches_table.competition_id
    WHERE matches_table.job_id = _job_id
      AND matches_table.id = _match_id
  ),
  eligible_slots AS (
    SELECT
      slots_table.id AS slot_id,
      slots_table.event_date,
      slots_table.start_at,
      slots_table.end_at,
      slots_table.location_position,
      slots_table.court_position,
      slots_table.cursor_position
    FROM match_context
    JOIN championship_bracket_preview_private.slots
      AS slots_table
      ON slots_table.job_id = _job_id
      AND slots_table.structural_phase =
        'GROUP_STAGE'
      AND slots_table.structural_competition_id =
        match_context.competition_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM championship_bracket_preview_private.assignments
        AS occupied_assignment
      WHERE occupied_assignment.job_id = _job_id
        AND occupied_assignment.slot_id =
          slots_table.id
    )
      AND championship_bracket_preview_private.is_match_slot_eligible_with_rest_gap(
        _job_id,
        _match_id,
        slots_table.id,
        _rest_gap
      )
  ),
  scored_slots AS (
    SELECT
      eligible_slots.*,
      (
        SELECT count(*)::bigint
        FROM match_context
        JOIN championship_bracket_preview_private.matches
          AS other_match
          ON other_match.job_id = _job_id
          AND other_match.id <> _match_id
          AND NOT other_match.assigned
        JOIN championship_bracket_preview_private.competitions
          AS other_competition
          ON other_competition.id =
            other_match.competition_id
          AND other_competition.naipe =
            match_context.naipe
        JOIN championship_bracket_preview_private.slots
          AS other_slot
          ON other_slot.job_id = _job_id
          AND other_slot.structural_phase =
            'GROUP_STAGE'
          AND other_slot.structural_competition_id =
            other_match.competition_id
        WHERE (
          other_match.home_team_id IN (
            match_context.home_team_id,
            match_context.away_team_id
          )
          OR other_match.away_team_id IN (
            match_context.home_team_id,
            match_context.away_team_id
          )
          OR other_slot.id =
            eligible_slots.slot_id
        )
          AND NOT EXISTS (
            SELECT 1
            FROM championship_bracket_preview_private.assignments
              AS other_occupied
            WHERE other_occupied.job_id = _job_id
              AND other_occupied.slot_id =
                other_slot.id
          )
          AND championship_bracket_preview_private.is_match_slot_static_eligible(
            _job_id,
            other_match.id,
            other_slot.id
          )
          AND (
            other_slot.id =
              eligible_slots.slot_id
            OR championship_bracket_preview_private.is_match_pair_rest_conflict(
              _job_id,
              _match_id,
              eligible_slots.slot_id,
              other_match.id,
              other_slot.id,
              _rest_gap
            )
          )
      ) AS pressure
    FROM eligible_slots
  ),
  ranked_slots AS (
    SELECT
      scored_slots.slot_id,
      row_number() OVER (
        ORDER BY
          scored_slots.pressure,
          scored_slots.event_date,
          scored_slots.start_at,
          scored_slots.location_position,
          scored_slots.court_position,
          scored_slots.cursor_position,
          scored_slots.slot_id
      )::integer AS candidate_rank,
      scored_slots.pressure
    FROM scored_slots
  )
  SELECT
    ranked_slots.slot_id,
    ranked_slots.candidate_rank,
    ranked_slots.pressure
  FROM ranked_slots
  ORDER BY ranked_slots.candidate_rank;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_manifest_csp_next_match(
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
      matches_table.competition_id,
      matches_table.group_id,
      matches_table.round_number,
      matches_table.slot_number,
      matches_table.priority_weight,
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
        FROM championship_bracket_preview_private.slots
          AS candidate_slot
        WHERE candidate_slot.job_id = _job_id
          AND candidate_slot.structural_phase =
            'GROUP_STAGE'
          AND candidate_slot.structural_competition_id =
            ready_matches.competition_id
          AND NOT EXISTS (
            SELECT 1
            FROM championship_bracket_preview_private.assignments
              AS occupied_assignment
            WHERE occupied_assignment.job_id = _job_id
              AND occupied_assignment.slot_id =
                candidate_slot.id
          )
          AND championship_bracket_preview_private.is_match_slot_eligible_with_rest_gap(
            _job_id,
            ready_matches.id,
            candidate_slot.id,
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
    evaluated_matches.round_number DESC,
    evaluated_matches.competition_position,
    evaluated_matches.group_number,
    evaluated_matches.slot_number,
    evaluated_matches.id
  LIMIT 1;
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
  next_match_record RECORD;
  candidate_record RECORD;
  decision_record RECORD;
  next_naipe public.match_naipe;
  current_depth INTEGER;
  assigned_count INTEGER;
  total_count INTEGER;
  pending_count INTEGER;
  operations_count INTEGER := 0;
  did_backtrack BOOLEAN;
  search_exhausted BOOLEAN;
  failure_diagnostics JSONB;
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
        'O solver estrutural CSP não pode ser inicializado sobre atribuições preexistentes.';
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
      competitions_table.naipe::text
    LIMIT 1;

    INSERT INTO championship_bracket_preview_private.manifest_solver_state (
      job_id,
      current_naipe,
      rest_gap,
      decisions_count,
      backtracks_count,
      phase
    )
    VALUES (
      _job_id,
      next_naipe,
      3,
      0,
      0,
      'SEARCHING'
    );
  END IF;

  LOOP
    EXIT WHEN
      clock_timestamp() - started_clock >=
        interval '5 seconds';

    EXIT WHEN operations_count >= 100;

    SELECT *
    INTO state_record
    FROM championship_bracket_preview_private.manifest_solver_state
    WHERE job_id = _job_id
    FOR UPDATE;

    IF state_record.current_naipe IS NULL THEN
      EXIT;
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
        updated_at = now()
      WHERE job_id = _job_id;

      UPDATE championship_bracket_preview_private.jobs
      SET
        stage = format(
          'Otimizando grade estrutural: %s, descanso 3',
          next_naipe
        ),
        heartbeat_at = now(),
        updated_at = now()
      WHERE id = _job_id;

      operations_count :=
        operations_count + 1;

      CONTINUE;
    END IF;

    SELECT *
    INTO next_match_record
    FROM championship_bracket_preview_private.resolve_manifest_csp_next_match(
      _job_id,
      state_record.current_naipe,
      state_record.rest_gap
    );

    IF FOUND
      AND next_match_record.option_count > 0
    THEN
      SELECT *
      INTO candidate_record
      FROM championship_bracket_preview_private.resolve_manifest_csp_candidate_slots(
        _job_id,
        next_match_record.match_id,
        state_record.rest_gap
      )
      ORDER BY candidate_rank
      LIMIT 1;

      IF candidate_record.slot_id IS NOT NULL THEN
        SELECT COALESCE(
          max(decisions_table.depth),
          0
        ) + 1
        INTO current_depth
        FROM championship_bracket_preview_private.manifest_solver_decisions
          AS decisions_table
        WHERE decisions_table.job_id = _job_id
          AND decisions_table.naipe =
            state_record.current_naipe
          AND decisions_table.rest_gap =
            state_record.rest_gap;

        INSERT INTO championship_bracket_preview_private.assignments (
          job_id,
          match_id,
          slot_id
        )
        VALUES (
          _job_id,
          next_match_record.match_id,
          candidate_record.slot_id
        );

        UPDATE championship_bracket_preview_private.matches
        SET
          assigned = true
        WHERE job_id = _job_id
          AND id =
            next_match_record.match_id;

        INSERT INTO championship_bracket_preview_private.manifest_solver_decisions (
          job_id,
          naipe,
          rest_gap,
          depth,
          match_id,
          slot_id,
          candidate_rank,
          pressure
        )
        VALUES (
          _job_id,
          state_record.current_naipe,
          state_record.rest_gap,
          current_depth,
          next_match_record.match_id,
          candidate_record.slot_id,
          candidate_record.candidate_rank,
          candidate_record.pressure
        );

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
    END IF;

    did_backtrack := false;
    search_exhausted := false;

    LOOP
      SELECT *
      INTO decision_record
      FROM championship_bracket_preview_private.manifest_solver_decisions
      WHERE job_id = _job_id
        AND naipe =
          state_record.current_naipe
        AND rest_gap =
          state_record.rest_gap
      ORDER BY depth DESC
      LIMIT 1
      FOR UPDATE;

      IF NOT FOUND THEN
        search_exhausted := true;
        EXIT;
      END IF;

      DELETE FROM championship_bracket_preview_private.assignments
      WHERE job_id = _job_id
        AND match_id =
          decision_record.match_id;

      UPDATE championship_bracket_preview_private.matches
      SET
        assigned = false
      WHERE job_id = _job_id
        AND id =
          decision_record.match_id;

      DELETE FROM championship_bracket_preview_private.manifest_solver_decisions
      WHERE job_id = _job_id
        AND naipe =
          decision_record.naipe
        AND depth =
          decision_record.depth;

      UPDATE championship_bracket_preview_private.manifest_solver_state
      SET
        backtracks_count =
          backtracks_count + 1,
        updated_at = now()
      WHERE job_id = _job_id;

      SELECT *
      INTO candidate_record
      FROM championship_bracket_preview_private.resolve_manifest_csp_candidate_slots(
        _job_id,
        decision_record.match_id,
        state_record.rest_gap
      )
      WHERE candidate_rank >
        decision_record.candidate_rank
      ORDER BY candidate_rank
      LIMIT 1;

      IF FOUND THEN
        INSERT INTO championship_bracket_preview_private.assignments (
          job_id,
          match_id,
          slot_id
        )
        VALUES (
          _job_id,
          decision_record.match_id,
          candidate_record.slot_id
        );

        UPDATE championship_bracket_preview_private.matches
        SET
          assigned = true
        WHERE job_id = _job_id
          AND id =
            decision_record.match_id;

        INSERT INTO championship_bracket_preview_private.manifest_solver_decisions (
          job_id,
          naipe,
          rest_gap,
          depth,
          match_id,
          slot_id,
          candidate_rank,
          pressure
        )
        VALUES (
          _job_id,
          state_record.current_naipe,
          state_record.rest_gap,
          decision_record.depth,
          decision_record.match_id,
          candidate_record.slot_id,
          candidate_record.candidate_rank,
          candidate_record.pressure
        );

        UPDATE championship_bracket_preview_private.manifest_solver_state
        SET
          decisions_count =
            decisions_count + 1,
          updated_at = now()
        WHERE job_id = _job_id;

        did_backtrack := true;
        operations_count :=
          operations_count + 1;

        EXIT;
      END IF;

      operations_count :=
        operations_count + 1;

      EXIT WHEN
        clock_timestamp() - started_clock >=
          interval '5 seconds';

      EXIT WHEN operations_count >= 100;
    END LOOP;

    IF did_backtrack THEN
      CONTINUE;
    END IF;

    IF search_exhausted THEN
      IF state_record.rest_gap = 3 THEN
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
            state_record.current_naipe;

        UPDATE championship_bracket_preview_private.matches
          AS matches_table
        SET
          assigned = false
        FROM championship_bracket_preview_private.competitions
          AS competitions_table
        WHERE matches_table.job_id = _job_id
          AND competitions_table.id =
            matches_table.competition_id
          AND competitions_table.naipe =
            state_record.current_naipe;

        DELETE FROM championship_bracket_preview_private.manifest_solver_decisions
        WHERE job_id = _job_id
          AND naipe =
            state_record.current_naipe;

        UPDATE championship_bracket_preview_private.manifest_solver_state
        SET
          rest_gap = 2,
          phase = 'SEARCHING_RELAXED',
          updated_at = now()
        WHERE job_id = _job_id;

        UPDATE championship_bracket_preview_private.jobs
        SET
          stage = format(
            'Otimizando grade estrutural: %s, descanso adaptativo 2',
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
            'STRUCTURAL_CSP_NO_SOLUTION',
            'message',
            format(
              'Não existe distribuição válida dos slots estruturais para o naipe %s nem com descanso adaptativo 2 entre modalidades diferentes.',
              state_record.current_naipe
            ),
            'naipe',
            state_record.current_naipe,
            'rest_gap',
            state_record.rest_gap
          )
        )
        || championship_bracket_preview_private.build_unassigned_match_diagnostics(
          _job_id
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

    EXIT;
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

  SELECT count(*)
  INTO pending_count
  FROM championship_bracket_preview_private.matches
  WHERE job_id = _job_id
    AND NOT assigned;

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

  RETURN jsonb_build_object(
    'continue',
    true,
    'delay',
    0
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';