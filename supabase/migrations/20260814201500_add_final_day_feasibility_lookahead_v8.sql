CREATE TABLE IF NOT EXISTS championship_bracket_preview_private.manifest_daily_probe_frames (
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

CREATE TABLE IF NOT EXISTS championship_bracket_preview_private.manifest_daily_probe_tried_matches (
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

CREATE INDEX IF NOT EXISTS manifest_daily_probe_frames_search_idx
ON championship_bracket_preview_private.manifest_daily_probe_frames (
  job_id,
  event_date,
  rest_gap,
  depth DESC
);

CREATE INDEX IF NOT EXISTS manifest_daily_probe_tried_search_idx
ON championship_bracket_preview_private.manifest_daily_probe_tried_matches (
  job_id,
  event_date,
  rest_gap,
  depth,
  slot_id
);

DO $migration$
BEGIN
  IF to_regprocedure(
    'championship_bracket_preview_private.resolve_manifest_daily_future_diagnostics_capacity_only_v8(uuid,date)'
  ) IS NULL THEN
    ALTER FUNCTION championship_bracket_preview_private.resolve_manifest_daily_future_diagnostics(
      UUID,
      DATE
    )
    RENAME TO resolve_manifest_daily_future_diagnostics_capacity_only_v8;
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.cleanup_manifest_daily_probe(
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
  DELETE FROM championship_bracket_preview_private.assignments
    AS assignments_table
  USING championship_bracket_preview_private.manifest_daily_probe_frames
    AS frames_table
  WHERE frames_table.job_id = _job_id
    AND frames_table.event_date = _event_date
    AND frames_table.rest_gap = _rest_gap
    AND frames_table.chosen_match_id IS NOT NULL
    AND assignments_table.job_id = _job_id
    AND assignments_table.match_id =
      frames_table.chosen_match_id
    AND assignments_table.slot_id =
      frames_table.slot_id;

  UPDATE championship_bracket_preview_private.matches
    AS matches_table
  SET
    assigned = false,
    applied_rest_gap = 3,
    relaxed_rest_gap_applied = false
  WHERE matches_table.job_id = _job_id
    AND matches_table.id IN (
      SELECT frames_table.chosen_match_id
      FROM championship_bracket_preview_private.manifest_daily_probe_frames
        AS frames_table
      WHERE frames_table.job_id = _job_id
        AND frames_table.event_date = _event_date
        AND frames_table.rest_gap = _rest_gap
        AND frames_table.chosen_match_id IS NOT NULL
    );

  DELETE FROM championship_bracket_preview_private.manifest_daily_probe_tried_matches
  WHERE job_id = _job_id
    AND event_date = _event_date
    AND rest_gap = _rest_gap;

  DELETE FROM championship_bracket_preview_private.manifest_daily_probe_frames
  WHERE job_id = _job_id
    AND event_date = _event_date
    AND rest_gap = _rest_gap;
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.probe_manifest_daily_date_feasibility(
  _job_id UUID,
  _event_date DATE,
  _rest_gap INTEGER DEFAULT 2,
  _max_backtracks INTEGER DEFAULT 800,
  _max_milliseconds INTEGER DEFAULT 6000
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  started_clock TIMESTAMPTZ :=
    clock_timestamp();
  open_frame RECORD;
  parent_frame RECORD;
  candidate_record RECORD;
  next_slot_id BIGINT;
  next_depth INTEGER;
  day_total INTEGER;
  day_assigned INTEGER;
  max_assigned INTEGER := 0;
  backtracks INTEGER := 0;
  decisions INTEGER := 0;
  should_backtrack BOOLEAN;
  result_status TEXT := 'EXHAUSTED';
  elapsed_ms INTEGER;
  result JSONB;
BEGIN
  IF _rest_gap NOT IN (2, 3) THEN
    RAISE EXCEPTION
      'rest_gap inválido para probe diário: %',
      _rest_gap;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.assignments
      AS assignments_table
    JOIN championship_bracket_preview_private.slots
      AS slots_table
      ON slots_table.id =
        assignments_table.slot_id
    WHERE assignments_table.job_id = _job_id
      AND slots_table.event_date = _event_date
      AND slots_table.structural_phase =
        'GROUP_STAGE'
  ) THEN
    RETURN jsonb_build_object(
      'feasible',
      false,
      'status',
      'DATE_NOT_EMPTY',
      'date',
      _event_date
    );
  END IF;

  PERFORM championship_bracket_preview_private.cleanup_manifest_daily_probe(
    _job_id,
    _event_date,
    _rest_gap
  );

  SELECT count(*)::integer
  INTO day_total
  FROM championship_bracket_preview_private.slots
    AS slots_table
  WHERE slots_table.job_id = _job_id
    AND slots_table.event_date = _event_date
    AND slots_table.structural_phase =
      'GROUP_STAGE';

  IF day_total = 0 THEN
    RETURN jsonb_build_object(
      'feasible',
      true,
      'status',
      'NO_GROUP_SLOTS',
      'date',
      _event_date,
      'day_total',
      0
    );
  END IF;

  LOOP
    elapsed_ms :=
      (
        extract(
          epoch FROM (
            clock_timestamp()
              - started_clock
          )
        ) * 1000
      )::integer;

    IF elapsed_ms >= _max_milliseconds THEN
      result_status := 'TIMEOUT';
      EXIT;
    END IF;

    IF backtracks >= _max_backtracks THEN
      result_status := 'BACKTRACK_LIMIT';
      EXIT;
    END IF;

    SELECT count(*)::integer
    INTO day_assigned
    FROM championship_bracket_preview_private.assignments
      AS assignments_table
    JOIN championship_bracket_preview_private.slots
      AS slots_table
      ON slots_table.id =
        assignments_table.slot_id
    WHERE assignments_table.job_id = _job_id
      AND slots_table.event_date = _event_date
      AND slots_table.structural_phase =
        'GROUP_STAGE';

    max_assigned :=
      GREATEST(
        max_assigned,
        day_assigned
      );

    IF day_assigned = day_total THEN
      result_status := 'FEASIBLE';
      EXIT;
    END IF;

    should_backtrack := false;

    SELECT *
    INTO open_frame
    FROM championship_bracket_preview_private.manifest_daily_probe_frames
    WHERE job_id = _job_id
      AND event_date = _event_date
      AND rest_gap = _rest_gap
      AND chosen_match_id IS NULL
    ORDER BY depth DESC
    LIMIT 1;

    IF NOT FOUND THEN
      SELECT slots_table.id
      INTO next_slot_id
      FROM championship_bracket_preview_private.slots
        AS slots_table
      WHERE slots_table.job_id = _job_id
        AND slots_table.event_date = _event_date
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

      IF next_slot_id IS NULL THEN
        should_backtrack := true;
      ELSE
        SELECT COALESCE(
          max(frames_table.depth),
          0
        ) + 1
        INTO next_depth
        FROM championship_bracket_preview_private.manifest_daily_probe_frames
          AS frames_table
        WHERE frames_table.job_id = _job_id
          AND frames_table.event_date =
            _event_date
          AND frames_table.rest_gap =
            _rest_gap;

        INSERT INTO championship_bracket_preview_private.manifest_daily_probe_frames (
          job_id,
          event_date,
          rest_gap,
          depth,
          slot_id,
          chosen_match_id
        )
        VALUES (
          _job_id,
          _event_date,
          _rest_gap,
          next_depth,
          next_slot_id,
          NULL
        );

        CONTINUE;
      END IF;
    ELSE
      SELECT candidate.*
      INTO candidate_record
      FROM championship_bracket_preview_private.resolve_manifest_daily_slot_candidate(
        _job_id,
        _event_date,
        open_frame.slot_id,
        _rest_gap
      ) AS candidate
      WHERE NOT EXISTS (
        SELECT 1
        FROM championship_bracket_preview_private.manifest_daily_probe_tried_matches
          AS tried_match
        WHERE tried_match.job_id = _job_id
          AND tried_match.event_date =
            _event_date
          AND tried_match.rest_gap =
            _rest_gap
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
        INSERT INTO championship_bracket_preview_private.manifest_daily_probe_tried_matches (
          job_id,
          event_date,
          rest_gap,
          depth,
          slot_id,
          match_id
        )
        VALUES (
          _job_id,
          _event_date,
          _rest_gap,
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
          applied_rest_gap = _rest_gap,
          relaxed_rest_gap_applied =
            _rest_gap = 2
        WHERE job_id = _job_id
          AND id =
            candidate_record.match_id;

        UPDATE championship_bracket_preview_private.manifest_daily_probe_frames
        SET
          chosen_match_id =
            candidate_record.match_id,
          updated_at = now()
        WHERE job_id = _job_id
          AND event_date = _event_date
          AND rest_gap = _rest_gap
          AND depth =
            open_frame.depth;

        decisions :=
          decisions + 1;

        CONTINUE;
      END IF;

      DELETE FROM championship_bracket_preview_private.manifest_daily_probe_tried_matches
      WHERE job_id = _job_id
        AND event_date = _event_date
        AND rest_gap = _rest_gap
        AND depth =
          open_frame.depth;

      DELETE FROM championship_bracket_preview_private.manifest_daily_probe_frames
      WHERE job_id = _job_id
        AND event_date = _event_date
        AND rest_gap = _rest_gap
        AND depth =
          open_frame.depth;

      should_backtrack := true;
    END IF;

    IF should_backtrack THEN
      SELECT *
      INTO parent_frame
      FROM championship_bracket_preview_private.manifest_daily_probe_frames
      WHERE job_id = _job_id
        AND event_date = _event_date
        AND rest_gap = _rest_gap
        AND chosen_match_id IS NOT NULL
      ORDER BY depth DESC
      LIMIT 1;

      IF NOT FOUND THEN
        result_status := 'EXHAUSTED';
        EXIT;
      END IF;

      DELETE FROM championship_bracket_preview_private.assignments
      WHERE job_id = _job_id
        AND match_id =
          parent_frame.chosen_match_id
        AND slot_id =
          parent_frame.slot_id;

      UPDATE championship_bracket_preview_private.matches
      SET
        assigned = false,
        applied_rest_gap = 3,
        relaxed_rest_gap_applied = false
      WHERE job_id = _job_id
        AND id =
          parent_frame.chosen_match_id;

      UPDATE championship_bracket_preview_private.manifest_daily_probe_frames
      SET
        chosen_match_id = NULL,
        updated_at = now()
      WHERE job_id = _job_id
        AND event_date = _event_date
        AND rest_gap = _rest_gap
        AND depth =
          parent_frame.depth;

      backtracks :=
        backtracks + 1;
    END IF;
  END LOOP;

  elapsed_ms :=
    (
      extract(
        epoch FROM (
          clock_timestamp()
            - started_clock
        )
      ) * 1000
    )::integer;

  result :=
    jsonb_build_object(
      'feasible',
      result_status = 'FEASIBLE',
      'status',
      result_status,
      'date',
      _event_date,
      'rest_gap',
      _rest_gap,
      'day_total',
      day_total,
      'max_assigned',
      max_assigned,
      'decisions',
      decisions,
      'backtracks',
      backtracks,
      'elapsed_ms',
      elapsed_ms
    );

  PERFORM championship_bracket_preview_private.cleanup_manifest_daily_probe(
    _job_id,
    _event_date,
    _rest_gap
  );

  RETURN result;
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
  WHERE slots_table.job_id = _job_id
    AND slots_table.structural_phase =
      'GROUP_STAGE'
    AND slots_table.event_date >
      _closed_date;

  IF future_group_day_count = 1
    AND final_group_date IS NOT NULL
  THEN
    probe_result :=
      championship_bracket_preview_private.probe_manifest_daily_date_feasibility(
        _job_id,
        final_group_date,
        2,
        800,
        6000
      );

    IF NOT COALESCE(
      (
        probe_result ->> 'feasible'
      )::boolean,
      false
    ) THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'code',
          'DAILY_FINAL_DAY_INFEASIBLE',
          'message',
          format(
            'A distribuição atual até %s deixa o último dia de grupos (%s) sem uma solução conjunta válida.',
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
          probe_result -> 'elapsed_ms'
        )
      );
    END IF;
  END IF;

  RETURN '[]'::jsonb;
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.sync_failed_v8_processed_slots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
BEGIN
  IF NEW.algorithm_version =
      'async-exact-v8'
    AND NEW.status = 'FAILED'
    AND OLD.status IS DISTINCT FROM
      NEW.status
  THEN
    SELECT count(*)::integer
    INTO NEW.processed_slots
    FROM championship_bracket_preview_private.assignments
      AS assignments_table
    WHERE assignments_table.job_id =
      NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_failed_v8_processed_slots_trigger
ON championship_bracket_preview_private.jobs;

CREATE TRIGGER sync_failed_v8_processed_slots_trigger
BEFORE UPDATE OF status
ON championship_bracket_preview_private.jobs
FOR EACH ROW
EXECUTE FUNCTION championship_bracket_preview_private.sync_failed_v8_processed_slots();

NOTIFY pgrst, 'reload schema';