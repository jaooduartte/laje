ALTER TABLE championship_bracket_preview_private.manifest_daily_solver_state
ADD COLUMN IF NOT EXISTS interday_repairs_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE championship_bracket_preview_private.manifest_daily_solver_state
ADD COLUMN IF NOT EXISTS last_interday_repair JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS championship_bracket_preview_private.manifest_daily_interday_repairs (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL
    REFERENCES championship_bracket_preview_private.jobs(id)
    ON DELETE CASCADE,
  closed_date DATE NOT NULL,
  final_date DATE NOT NULL,
  inbound_match_id UUID NOT NULL
    REFERENCES championship_bracket_preview_private.matches(id)
    ON DELETE CASCADE,
  outbound_match_id UUID NOT NULL
    REFERENCES championship_bracket_preview_private.matches(id)
    ON DELETE CASCADE,
  earlier_slot_id BIGINT NOT NULL
    REFERENCES championship_bracket_preview_private.slots(id)
    ON DELETE CASCADE,
  final_candidate_slot_id BIGINT
    REFERENCES championship_bracket_preview_private.slots(id)
    ON DELETE SET NULL,
  success BOOLEAN NOT NULL,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (
    job_id,
    final_date,
    inbound_match_id,
    outbound_match_id,
    earlier_slot_id
  )
);

CREATE INDEX IF NOT EXISTS manifest_daily_interday_repairs_job_idx
ON championship_bracket_preview_private.manifest_daily_interday_repairs (
  job_id,
  final_date,
  success,
  created_at
);

DO $migration$
BEGIN
  IF to_regprocedure(
    'championship_bracket_preview_private.resolve_manifest_daily_future_diagnostics_final_probe_v8(uuid,date)'
  ) IS NULL THEN
    ALTER FUNCTION championship_bracket_preview_private.resolve_manifest_daily_future_diagnostics(
      UUID,
      DATE
    )
    RENAME TO resolve_manifest_daily_future_diagnostics_final_probe_v8;
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.try_manifest_daily_interday_repair(
  _job_id UUID,
  _closed_date DATE,
  _final_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  inbound_record RECORD;
  outbound_record RECORD;
  final_slot_record RECORD;
  attempted_count INTEGER;
  outbound_gap INTEGER;
  repaired BOOLEAN := false;
  repair_result JSONB;
BEGIN
  SELECT count(*)::integer
  INTO attempted_count
  FROM championship_bracket_preview_private.manifest_daily_interday_repairs
  WHERE job_id = _job_id
    AND final_date = _final_date;

  IF attempted_count >= 60 THEN
    RETURN jsonb_build_object(
      'repaired',
      false,
      'status',
      'REPAIR_LIMIT_REACHED',
      'attempts',
      attempted_count
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.assignments
      AS assignments_table
    JOIN championship_bracket_preview_private.slots
      AS slots_table
      ON slots_table.id =
        assignments_table.slot_id
    WHERE assignments_table.job_id =
        _job_id
      AND slots_table.event_date =
        _final_date
      AND slots_table.structural_phase =
        'GROUP_STAGE'
  ) THEN
    RETURN jsonb_build_object(
      'repaired',
      false,
      'status',
      'FINAL_DATE_NOT_EMPTY'
    );
  END IF;

  FOR inbound_record IN
    SELECT
      matches_table.id AS match_id,
      matches_table.competition_id,
      matches_table.home_team_id,
      matches_table.away_team_id,
      matches_table.round_number,
      matches_table.slot_number,
      groups_table.group_number,
      competitions_table.naipe,
      competitions_table.sport_name,
      competitions_table.competition_key,
      (
        SELECT count(*)::integer
        FROM championship_bracket_preview_private.manifest_solver_candidates
          AS final_candidate
        JOIN championship_bracket_preview_private.slots
          AS final_slot
          ON final_slot.id =
            final_candidate.slot_id
        WHERE final_candidate.job_id =
            _job_id
          AND final_candidate.match_id =
            matches_table.id
          AND final_slot.event_date =
            _final_date
          AND final_slot.structural_phase =
            'GROUP_STAGE'
      ) AS final_candidate_count,
      (
        SELECT count(*)::integer
        FROM championship_bracket_preview_private.matches
          AS pressure_match
        JOIN championship_bracket_preview_private.competitions
          AS pressure_competition
          ON pressure_competition.id =
            pressure_match.competition_id
        WHERE pressure_match.job_id =
            _job_id
          AND NOT pressure_match.assigned
          AND pressure_competition.naipe =
            competitions_table.naipe
          AND (
            pressure_match.home_team_id IN (
              matches_table.home_team_id,
              matches_table.away_team_id
            )
            OR pressure_match.away_team_id IN (
              matches_table.home_team_id,
              matches_table.away_team_id
            )
          )
          AND EXISTS (
            SELECT 1
            FROM championship_bracket_preview_private.manifest_solver_candidates
              AS pressure_candidate
            JOIN championship_bracket_preview_private.slots
              AS pressure_slot
              ON pressure_slot.id =
                pressure_candidate.slot_id
            WHERE pressure_candidate.job_id =
                _job_id
              AND pressure_candidate.match_id =
                pressure_match.id
              AND pressure_slot.event_date =
                _final_date
              AND pressure_slot.structural_phase =
                'GROUP_STAGE'
          )
      ) AS team_pressure
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
    WHERE matches_table.job_id =
        _job_id
      AND NOT matches_table.assigned
      AND EXISTS (
        SELECT 1
        FROM championship_bracket_preview_private.manifest_solver_candidates
          AS final_candidate
        JOIN championship_bracket_preview_private.slots
          AS final_slot
          ON final_slot.id =
            final_candidate.slot_id
        WHERE final_candidate.job_id =
            _job_id
          AND final_candidate.match_id =
            matches_table.id
          AND final_slot.event_date =
            _final_date
          AND final_slot.structural_phase =
            'GROUP_STAGE'
      )
    ORDER BY
      team_pressure DESC,
      final_candidate_count,
      matches_table.round_number,
      groups_table.group_number,
      matches_table.slot_number,
      matches_table.id
  LOOP
    FOR outbound_record IN
      SELECT
        assignments_table.match_id,
        assignments_table.slot_id,
        slots_table.event_date,
        slots_table.start_at,
        slots_table.end_at,
        outbound_match.home_team_id,
        outbound_match.away_team_id,
        outbound_match.round_number,
        outbound_match.slot_number,
        outbound_match.applied_rest_gap,
        outbound_match.relaxed_rest_gap_applied,
        outbound_group.group_number
      FROM championship_bracket_preview_private.assignments
        AS assignments_table
      JOIN championship_bracket_preview_private.slots
        AS slots_table
        ON slots_table.id =
          assignments_table.slot_id
      JOIN championship_bracket_preview_private.matches
        AS outbound_match
        ON outbound_match.id =
          assignments_table.match_id
      JOIN championship_bracket_preview_private.groups
        AS outbound_group
        ON outbound_group.id =
          outbound_match.group_id
      WHERE assignments_table.job_id =
          _job_id
        AND outbound_match.competition_id =
          inbound_record.competition_id
        AND slots_table.event_date <=
          _closed_date
        AND slots_table.event_date <
          _final_date
        AND slots_table.structural_phase =
          'GROUP_STAGE'
        AND EXISTS (
          SELECT 1
          FROM championship_bracket_preview_private.manifest_solver_candidates
            AS inbound_candidate
          WHERE inbound_candidate.job_id =
              _job_id
            AND inbound_candidate.match_id =
              inbound_record.match_id
            AND inbound_candidate.slot_id =
              assignments_table.slot_id
        )
        AND EXISTS (
          SELECT 1
          FROM championship_bracket_preview_private.manifest_solver_candidates
            AS outbound_final_candidate
          JOIN championship_bracket_preview_private.slots
            AS outbound_final_slot
            ON outbound_final_slot.id =
              outbound_final_candidate.slot_id
          WHERE outbound_final_candidate.job_id =
              _job_id
            AND outbound_final_candidate.match_id =
              outbound_match.id
            AND outbound_final_slot.event_date =
              _final_date
            AND outbound_final_slot.structural_phase =
              'GROUP_STAGE'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM championship_bracket_preview_private.manifest_daily_interday_repairs
            AS previous_attempt
          WHERE previous_attempt.job_id =
              _job_id
            AND previous_attempt.final_date =
              _final_date
            AND previous_attempt.inbound_match_id =
              inbound_record.match_id
            AND previous_attempt.outbound_match_id =
              outbound_match.id
            AND previous_attempt.earlier_slot_id =
              assignments_table.slot_id
        )
      ORDER BY
        slots_table.event_date DESC,
        outbound_match.round_number DESC,
        outbound_group.group_number,
        outbound_match.slot_number,
        assignments_table.slot_id
    LOOP
      SELECT
        final_slot.id
      INTO final_slot_record
      FROM championship_bracket_preview_private.manifest_solver_candidates
        AS final_candidate
      JOIN championship_bracket_preview_private.slots
        AS final_slot
        ON final_slot.id =
          final_candidate.slot_id
      WHERE final_candidate.job_id =
          _job_id
        AND final_candidate.match_id =
          outbound_record.match_id
        AND final_slot.event_date =
          _final_date
        AND final_slot.structural_phase =
          'GROUP_STAGE'
        AND championship_bracket_preview_private.is_manifest_csp_dynamic_candidate_eligible(
          _job_id,
          outbound_record.match_id,
          final_slot.id,
          2
        )
      ORDER BY
        final_slot.start_at,
        final_slot.location_position,
        final_slot.court_position,
        final_slot.cursor_position,
        final_slot.id
      LIMIT 1;

      IF final_slot_record.id IS NULL THEN
        INSERT INTO championship_bracket_preview_private.manifest_daily_interday_repairs (
          job_id,
          closed_date,
          final_date,
          inbound_match_id,
          outbound_match_id,
          earlier_slot_id,
          final_candidate_slot_id,
          success,
          failure_reason
        )
        VALUES (
          _job_id,
          _closed_date,
          _final_date,
          inbound_record.match_id,
          outbound_record.match_id,
          outbound_record.slot_id,
          NULL,
          false,
          'OUTBOUND_WITHOUT_DYNAMIC_FINAL_SLOT'
        )
        ON CONFLICT DO NOTHING;

        CONTINUE;
      END IF;

      outbound_gap :=
        LEAST(
          3,
          GREATEST(
            COALESCE(
              outbound_record.applied_rest_gap,
              3
            ),
            2
          )
        );

      DELETE FROM championship_bracket_preview_private.assignments
      WHERE job_id = _job_id
        AND match_id =
          outbound_record.match_id
        AND slot_id =
          outbound_record.slot_id;

      UPDATE championship_bracket_preview_private.matches
      SET
        assigned = false
      WHERE job_id = _job_id
        AND id =
          outbound_record.match_id;

      IF championship_bracket_preview_private.is_manifest_csp_dynamic_candidate_eligible(
        _job_id,
        inbound_record.match_id,
        outbound_record.slot_id,
        outbound_gap
      ) THEN
        INSERT INTO championship_bracket_preview_private.assignments (
          job_id,
          match_id,
          slot_id
        )
        VALUES (
          _job_id,
          inbound_record.match_id,
          outbound_record.slot_id
        );

        UPDATE championship_bracket_preview_private.matches
        SET
          assigned = true,
          applied_rest_gap =
            outbound_gap,
          relaxed_rest_gap_applied =
            outbound_gap = 2
        WHERE job_id = _job_id
          AND id =
            inbound_record.match_id;

        INSERT INTO championship_bracket_preview_private.manifest_daily_interday_repairs (
          job_id,
          closed_date,
          final_date,
          inbound_match_id,
          outbound_match_id,
          earlier_slot_id,
          final_candidate_slot_id,
          success,
          failure_reason
        )
        VALUES (
          _job_id,
          _closed_date,
          _final_date,
          inbound_record.match_id,
          outbound_record.match_id,
          outbound_record.slot_id,
          final_slot_record.id,
          true,
          NULL
        )
        ON CONFLICT DO NOTHING;

        repair_result :=
          jsonb_build_object(
            'repaired',
            true,
            'status',
            'SWAPPED_TO_EARLIER_DAY',
            'closed_date',
            _closed_date,
            'final_date',
            _final_date,
            'earlier_date',
            outbound_record.event_date,
            'earlier_slot_id',
            outbound_record.slot_id,
            'inbound_match_id',
            inbound_record.match_id,
            'outbound_match_id',
            outbound_record.match_id,
            'outbound_final_candidate_slot_id',
            final_slot_record.id,
            'competition_key',
            inbound_record.competition_key,
            'sport_name',
            inbound_record.sport_name,
            'naipe',
            inbound_record.naipe
          );

        UPDATE championship_bracket_preview_private.manifest_daily_solver_state
        SET
          interday_repairs_count =
            interday_repairs_count + 1,
          last_interday_repair =
            repair_result,
          updated_at = now()
        WHERE job_id = _job_id;

        repaired := true;

        RETURN repair_result;
      END IF;

      INSERT INTO championship_bracket_preview_private.assignments (
        job_id,
        match_id,
        slot_id
      )
      VALUES (
        _job_id,
        outbound_record.match_id,
        outbound_record.slot_id
      );

      UPDATE championship_bracket_preview_private.matches
      SET
        assigned = true,
        applied_rest_gap =
          outbound_record.applied_rest_gap,
        relaxed_rest_gap_applied =
          outbound_record.relaxed_rest_gap_applied
      WHERE job_id = _job_id
        AND id =
          outbound_record.match_id;

      INSERT INTO championship_bracket_preview_private.manifest_daily_interday_repairs (
        job_id,
        closed_date,
        final_date,
        inbound_match_id,
        outbound_match_id,
        earlier_slot_id,
        final_candidate_slot_id,
        success,
        failure_reason
      )
      VALUES (
        _job_id,
        _closed_date,
        _final_date,
        inbound_record.match_id,
        outbound_record.match_id,
        outbound_record.slot_id,
        final_slot_record.id,
        false,
        'INBOUND_NOT_ELIGIBLE_IN_EARLIER_SLOT'
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'repaired',
    repaired,
    'status',
    'NO_VALID_INTERDAY_REPAIR'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_manifest_daily_future_diagnostics(
  _job_id UUID,
  _closed_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  diagnostics JSONB;
  future_group_day_count INTEGER;
  final_group_date DATE;
  probe_result JSONB;
  repair_result JSONB;
  repair_round INTEGER := 0;
  successful_repairs INTEGER := 0;
BEGIN
  diagnostics :=
    championship_bracket_preview_private.resolve_manifest_daily_future_diagnostics_capacity_only_v8(
      _job_id,
      _closed_date
    );

  IF jsonb_array_length(
    diagnostics
  ) > 0 THEN
    RETURN diagnostics;
  END IF;

  SELECT
    count(
      DISTINCT slots_table.event_date
    )::integer,
    min(slots_table.event_date)
  INTO
    future_group_day_count,
    final_group_date
  FROM championship_bracket_preview_private.slots
    AS slots_table
  WHERE slots_table.job_id =
      _job_id
    AND slots_table.structural_phase =
      'GROUP_STAGE'
    AND slots_table.event_date >
      _closed_date;

  IF future_group_day_count <> 1
    OR final_group_date IS NULL
  THEN
    RETURN '[]'::jsonb;
  END IF;

  probe_result :=
    championship_bracket_preview_private.probe_manifest_daily_date_feasibility(
      _job_id,
      final_group_date,
      2,
      500,
      3500
    );

  IF COALESCE(
    (
      probe_result ->> 'feasible'
    )::boolean,
    false
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  WHILE repair_round < 2
  LOOP
    repair_round :=
      repair_round + 1;

    repair_result :=
      championship_bracket_preview_private.try_manifest_daily_interday_repair(
        _job_id,
        _closed_date,
        final_group_date
      );

    IF NOT COALESCE(
      (
        repair_result ->> 'repaired'
      )::boolean,
      false
    ) THEN
      EXIT;
    END IF;

    successful_repairs :=
      successful_repairs + 1;

    probe_result :=
      championship_bracket_preview_private.probe_manifest_daily_date_feasibility(
        _job_id,
        final_group_date,
        2,
        500,
        3500
      );

    IF COALESCE(
      (
        probe_result ->> 'feasible'
      )::boolean,
      false
    ) THEN
      RETURN '[]'::jsonb;
    END IF;
  END LOOP;

  IF probe_result ->> 'status' =
      'EXHAUSTED'
  THEN
    RETURN jsonb_build_array(
      jsonb_build_object(
        'code',
        'DAILY_FINAL_DAY_INFEASIBLE',
        'message',
        format(
          'A composição atual até %s deixa o último dia de grupos (%s) comprovadamente sem distribuição válida.',
          to_char(
            _closed_date,
            'DD/MM/YYYY'
          ),
          to_char(
            final_group_date,
            'DD/MM/YYYY'
          )
        ),
        'closed_date',
        _closed_date,
        'final_group_date',
        final_group_date,
        'probe_status',
        probe_result ->> 'status',
        'probe_rest_gap',
        probe_result -> 'rest_gap',
        'probe_day_total',
        probe_result -> 'day_total',
        'probe_max_assigned',
        probe_result -> 'max_assigned',
        'probe_decisions',
        probe_result -> 'decisions',
        'probe_backtracks',
        probe_result -> 'backtracks',
        'probe_elapsed_ms',
        probe_result -> 'elapsed_ms',
        'successful_interday_repairs',
        successful_repairs,
        'last_interday_repair',
        repair_result
      )
    );
  END IF;

  RETURN jsonb_build_array(
    jsonb_build_object(
      'code',
      'DAILY_FINAL_DAY_UNRESOLVED',
      'message',
      format(
        'A composição atual até %s ainda não permitiu confirmar uma solução conjunta para o último dia de grupos (%s); o probe atingiu o limite de busca e o scheduler deve tentar outra composição.',
        to_char(
          _closed_date,
          'DD/MM/YYYY'
        ),
        to_char(
          final_group_date,
          'DD/MM/YYYY'
        )
      ),
      'closed_date',
      _closed_date,
      'final_group_date',
      final_group_date,
      'probe_status',
      probe_result ->> 'status',
      'probe_rest_gap',
      probe_result -> 'rest_gap',
      'probe_day_total',
      probe_result -> 'day_total',
      'probe_max_assigned',
      probe_result -> 'max_assigned',
      'probe_decisions',
      probe_result -> 'decisions',
      'probe_backtracks',
      probe_result -> 'backtracks',
      'probe_elapsed_ms',
      probe_result -> 'elapsed_ms',
      'successful_interday_repairs',
      successful_repairs,
      'last_interday_repair',
      repair_result
    )
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';