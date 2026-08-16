-- LAJE-81: centraliza a regra de descanso das atléticas e permite que a
-- prévia exata tente uma realocação determinística antes de falhar.

CREATE OR REPLACE FUNCTION public.is_championship_team_rest_gap_conflict(
  _candidate_naipe public.match_naipe,
  _other_naipe public.match_naipe,
  _same_court BOOLEAN,
  _candidate_court_position BIGINT,
  _other_court_position BIGINT,
  _candidate_start_at TIMESTAMPTZ,
  _other_start_at TIMESTAMPTZ,
  _candidate_duration_minutes INTEGER,
  _other_duration_minutes INTEGER,
  _candidate_is_knockout BOOLEAN DEFAULT false
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $function$
  SELECT CASE
    WHEN COALESCE(_candidate_is_knockout, false) THEN false
    WHEN _candidate_naipe IS NULL
      OR _other_naipe IS NULL
      OR _candidate_naipe IS DISTINCT FROM _other_naipe
    THEN false
    WHEN COALESCE(_same_court, false) THEN
      _candidate_court_position IS NOT NULL
      AND _other_court_position IS NOT NULL
      AND abs(_candidate_court_position - _other_court_position) < 4
    ELSE
      _candidate_start_at IS NOT NULL
      AND _other_start_at IS NOT NULL
      AND abs(extract(epoch FROM (_other_start_at - _candidate_start_at)) / 60.0)
        < greatest(
          greatest(COALESCE(_candidate_duration_minutes, 35), 1),
          greatest(COALESCE(_other_duration_minutes, 35), 1)
        ) * 4
  END;
$function$;

COMMENT ON FUNCTION public.is_championship_team_rest_gap_conflict(
  public.match_naipe,
  public.match_naipe,
  BOOLEAN,
  BIGINT,
  BIGINT,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  INTEGER,
  INTEGER,
  BOOLEAN
) IS 'Regra única de descanso: no mesmo naipe, uma atlética que jogou na posição 1 da quadra só pode voltar na posição 5; entre quadras, preserva o equivalente a quatro durações. Naipes diferentes e mata-mata não recebem descanso mínimo.';

CREATE OR REPLACE FUNCTION public.resolve_scheduled_match_rest_gap_conflict(
  _championship_id UUID,
  _season_year INTEGER,
  _scheduled_date DATE,
  _location TEXT,
  _court_name TEXT,
  _start_time TIMESTAMPTZ,
  _scheduled_slot INTEGER,
  _queue_position INTEGER,
  _created_at TIMESTAMPTZ,
  _match_id UUID,
  _sport_id UUID,
  _naipe public.match_naipe,
  _home_team_id UUID,
  _away_team_id UUID,
  _duration_minutes INTEGER DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $function$
DECLARE
  candidate_match_id UUID := COALESCE(
    _match_id,
    '00000000-0000-0000-0000-000000000000'::uuid
  );
  candidate_duration_minutes INTEGER;
  conflict_same_court BOOLEAN := false;
  conflict_cross_court BOOLEAN := false;
BEGIN
  IF _championship_id IS NULL
    OR _season_year IS NULL
    OR _scheduled_date IS NULL
    OR _sport_id IS NULL
    OR _naipe IS NULL
    OR NULLIF(trim(COALESCE(_location, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(_court_name, '')), '') IS NULL
    OR _home_team_id IS NULL
    OR _away_team_id IS NULL
  THEN
    RETURN NULL;
  END IF;

  SELECT greatest(
    COALESCE(
      _duration_minutes,
      (
        SELECT championship_sports_table.default_match_duration_minutes
        FROM public.championship_sports AS championship_sports_table
        WHERE championship_sports_table.championship_id = _championship_id
          AND championship_sports_table.sport_id = _sport_id
        LIMIT 1
      ),
      35
    ),
    1
  )
  INTO candidate_duration_minutes;

  WITH simulated_matches AS (
    SELECT
      matches_table.id,
      matches_table.location,
      matches_table.court_name,
      matches_table.start_time,
      matches_table.scheduled_slot,
      matches_table.queue_position,
      matches_table.created_at,
      matches_table.naipe,
      matches_table.home_team_id,
      matches_table.away_team_id,
      greatest(
        COALESCE(championship_sports_table.default_match_duration_minutes, 35),
        1
      ) AS duration_minutes,
      COALESCE(bracket_matches_table.group_id IS NULL, false) AS is_knockout
    FROM public.matches AS matches_table
    LEFT JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = matches_table.championship_id
      AND championship_sports_table.sport_id = matches_table.sport_id
    LEFT JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.match_id = matches_table.id
    WHERE matches_table.championship_id = _championship_id
      AND matches_table.season_year = _season_year
      AND matches_table.status = 'SCHEDULED'::public.match_status
      AND matches_table.scheduled_date = _scheduled_date
      AND matches_table.id <> candidate_match_id

    UNION ALL

    SELECT
      candidate_match_id,
      _location,
      _court_name,
      _start_time,
      _scheduled_slot,
      _queue_position,
      COALESCE(_created_at, now()),
      _naipe,
      _home_team_id,
      _away_team_id,
      candidate_duration_minutes,
      COALESCE((
        SELECT bracket_matches_table.group_id IS NULL
        FROM public.championship_bracket_matches AS bracket_matches_table
        WHERE bracket_matches_table.match_id = candidate_match_id
        LIMIT 1
      ), false)
  ), ordered_court_matches AS (
    SELECT
      simulated_matches.*,
      row_number() OVER (
        ORDER BY
          CASE WHEN simulated_matches.start_time IS NULL THEN 1 ELSE 0 END,
          simulated_matches.start_time ASC NULLS LAST,
          COALESCE(simulated_matches.scheduled_slot, simulated_matches.queue_position) ASC NULLS LAST,
          COALESCE(simulated_matches.queue_position, simulated_matches.scheduled_slot) ASC NULLS LAST,
          simulated_matches.created_at ASC,
          simulated_matches.id ASC
      ) AS court_sequence_index
    FROM simulated_matches
    WHERE public.normalize_bracket_entity_name(simulated_matches.location) =
      public.normalize_bracket_entity_name(_location)
      AND public.normalize_bracket_entity_name(simulated_matches.court_name) =
        public.normalize_bracket_entity_name(_court_name)
  ), candidate_match AS (
    SELECT simulated_matches.*
    FROM simulated_matches
    WHERE simulated_matches.id = candidate_match_id
    LIMIT 1
  ), candidate_court_match AS (
    SELECT ordered_court_matches.*
    FROM ordered_court_matches
    WHERE ordered_court_matches.id = candidate_match_id
    LIMIT 1
  )
  SELECT
    EXISTS (
      SELECT 1
      FROM candidate_court_match
      JOIN ordered_court_matches AS other_match
        ON other_match.id <> candidate_court_match.id
      WHERE (
        other_match.home_team_id IN (
          candidate_court_match.home_team_id,
          candidate_court_match.away_team_id
        )
        OR other_match.away_team_id IN (
          candidate_court_match.home_team_id,
          candidate_court_match.away_team_id
        )
      )
      AND public.is_championship_team_rest_gap_conflict(
        candidate_court_match.naipe,
        other_match.naipe,
        true,
        candidate_court_match.court_sequence_index,
        other_match.court_sequence_index,
        candidate_court_match.start_time,
        other_match.start_time,
        candidate_court_match.duration_minutes,
        other_match.duration_minutes,
        candidate_court_match.is_knockout
      )
    ),
    EXISTS (
      SELECT 1
      FROM candidate_match
      JOIN simulated_matches AS other_match
        ON other_match.id <> candidate_match.id
      WHERE (
        public.normalize_bracket_entity_name(candidate_match.location) <>
          public.normalize_bracket_entity_name(other_match.location)
        OR public.normalize_bracket_entity_name(candidate_match.court_name) <>
          public.normalize_bracket_entity_name(other_match.court_name)
      )
      AND (
        other_match.home_team_id IN (
          candidate_match.home_team_id,
          candidate_match.away_team_id
        )
        OR other_match.away_team_id IN (
          candidate_match.home_team_id,
          candidate_match.away_team_id
        )
      )
      AND public.is_championship_team_rest_gap_conflict(
        candidate_match.naipe,
        other_match.naipe,
        false,
        NULL,
        NULL,
        candidate_match.start_time,
        other_match.start_time,
        candidate_match.duration_minutes,
        other_match.duration_minutes,
        candidate_match.is_knockout
      )
    )
  INTO conflict_same_court, conflict_cross_court;

  IF conflict_same_court THEN
    RETURN 'A mesma atlética só pode voltar a jogar no mesmo naipe a partir da quarta posição seguinte da quadra (ex.: jogo 1 → jogo 5).';
  END IF;

  IF conflict_cross_court THEN
    RETURN 'A mesma atlética precisa do intervalo equivalente a quatro jogos antes de voltar a jogar no mesmo naipe em outra quadra.';
  END IF;

  RETURN NULL;
END;
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
  WITH candidate_context AS (
    SELECT
      candidate_match.home_team_id,
      candidate_match.away_team_id,
      candidate_competition.naipe,
      candidate_slot.event_date,
      candidate_slot.court_key,
      candidate_slot.start_at,
      candidate_slot.end_at
    FROM championship_bracket_preview_private.matches AS candidate_match
    JOIN championship_bracket_preview_private.competitions AS candidate_competition
      ON candidate_competition.id = candidate_match.competition_id
    JOIN championship_bracket_preview_private.slots AS candidate_slot
      ON candidate_slot.id = _candidate_slot_id
    WHERE candidate_match.job_id = _job_id
      AND candidate_match.id = _candidate_match_id
      AND candidate_slot.job_id = _job_id
  ), other_context AS (
    SELECT
      other_match.home_team_id,
      other_match.away_team_id,
      other_competition.naipe,
      other_slot.event_date,
      other_slot.court_key,
      other_slot.start_at,
      other_slot.end_at
    FROM championship_bracket_preview_private.assignments AS other_assignment
    JOIN championship_bracket_preview_private.matches AS other_match
      ON other_match.id = other_assignment.match_id
    JOIN championship_bracket_preview_private.competitions AS other_competition
      ON other_competition.id = other_match.competition_id
    JOIN championship_bracket_preview_private.slots AS other_slot
      ON other_slot.id = other_assignment.slot_id
    WHERE other_assignment.job_id = _job_id
      AND other_assignment.match_id = _other_match_id
  )
  SELECT COALESCE((
    SELECT
      candidate_context.event_date = other_context.event_date
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
      AND public.is_championship_team_rest_gap_conflict(
        candidate_context.naipe,
        other_context.naipe,
        candidate_context.court_key = other_context.court_key,
        CASE
          WHEN candidate_context.court_key = other_context.court_key THEN (
            SELECT 1 + count(*)
            FROM championship_bracket_preview_private.assignments AS between_assignment
            JOIN championship_bracket_preview_private.slots AS between_slot
              ON between_slot.id = between_assignment.slot_id
            WHERE between_assignment.job_id = _job_id
              AND between_assignment.match_id NOT IN (
                _candidate_match_id,
                _other_match_id
              )
              AND between_slot.event_date = candidate_context.event_date
              AND between_slot.court_key = candidate_context.court_key
              AND between_slot.start_at > least(
                candidate_context.start_at,
                other_context.start_at
              )
              AND between_slot.start_at < greatest(
                candidate_context.start_at,
                other_context.start_at
              )
          )
          ELSE NULL
        END,
        CASE WHEN candidate_context.court_key = other_context.court_key THEN 0 ELSE NULL END,
        candidate_context.start_at,
        other_context.start_at,
        (extract(epoch FROM (candidate_context.end_at - candidate_context.start_at)) / 60)::integer,
        (extract(epoch FROM (other_context.end_at - other_context.start_at)) / 60)::integer,
        false
      )
    FROM candidate_context
    CROSS JOIN other_context
  ), false);
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.is_match_slot_eligible(
  _job_id UUID,
  _match_id UUID,
  _slot_id BIGINT,
  _check_rest BOOLEAN DEFAULT true
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  WITH context AS (
    SELECT
      jobs_table.payload,
      matches_table.id AS match_id,
      matches_table.home_team_id,
      matches_table.away_team_id,
      competitions_table.sport_id,
      competitions_table.naipe,
      competitions_table.division,
      competitions_table.competition_key,
      slots_table.id AS slot_id,
      slots_table.event_date,
      slots_table.court_key,
      slots_table.start_at,
      slots_table.end_at,
      slots_table.preferred_naipe,
      slots_table.preferred_division,
      slots_table.sequence_mode,
      slot_target.has_sport_targets,
      slot_target.planned_match_count
    FROM championship_bracket_preview_private.jobs AS jobs_table
    JOIN championship_bracket_preview_private.matches AS matches_table
      ON matches_table.job_id = jobs_table.id
      AND matches_table.id = _match_id
    JOIN championship_bracket_preview_private.competitions AS competitions_table
      ON competitions_table.id = matches_table.competition_id
    JOIN championship_bracket_preview_private.slots AS slots_table
      ON slots_table.job_id = jobs_table.id
      AND slots_table.id = _slot_id
      AND slots_table.sport_id = competitions_table.sport_id
    CROSS JOIN LATERAL championship_bracket_preview_private.resolve_slot_sport_target(
      jobs_table.payload,
      slots_table.event_date,
      slots_table.court_key,
      slots_table.sport_id
    ) AS slot_target
    WHERE jobs_table.id = _job_id
  )
  SELECT COALESCE((
    SELECT
      (
        context.sequence_mode <> 'GROUP_NAIPE'
        OR context.preferred_naipe IS NULL
        OR context.preferred_naipe = context.naipe
      )
      AND (
        context.preferred_division IS NULL
        OR context.preferred_division IS NOT DISTINCT FROM context.division
        OR context.sequence_mode <> 'GROUP_DIVISION'
      )
      AND public.is_championship_bracket_competition_slot_playable(
        context.payload,
        context.competition_key,
        context.event_date,
        context.start_at,
        context.end_at
      )
      AND public.is_championship_bracket_team_slot_playable(
        context.payload,
        context.home_team_id,
        context.competition_key,
        context.event_date,
        context.start_at,
        context.end_at
      )
      AND public.is_championship_bracket_team_slot_playable(
        context.payload,
        context.away_team_id,
        context.competition_key,
        context.event_date,
        context.start_at,
        context.end_at
      )
      AND (
        NOT context.has_sport_targets
        OR context.planned_match_count > (
          SELECT count(*)
          FROM championship_bracket_preview_private.assignments AS target_assignment
          JOIN championship_bracket_preview_private.slots AS target_slot
            ON target_slot.id = target_assignment.slot_id
          WHERE target_assignment.job_id = _job_id
            AND target_assignment.match_id <> _match_id
            AND target_slot.event_date = context.event_date
            AND target_slot.court_key = context.court_key
            AND target_slot.sport_id = context.sport_id
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM championship_bracket_preview_private.assignments AS occupied_assignment
        JOIN championship_bracket_preview_private.slots AS occupied_slot
          ON occupied_slot.id = occupied_assignment.slot_id
        WHERE occupied_assignment.job_id = _job_id
          AND occupied_assignment.match_id <> _match_id
          AND occupied_slot.court_key = context.court_key
          AND occupied_slot.start_at < context.end_at
          AND occupied_slot.end_at > context.start_at
      )
      AND (
        NOT COALESCE(_check_rest, true)
        OR NOT EXISTS (
          SELECT 1
          FROM championship_bracket_preview_private.assignments AS previous_assignment
          WHERE previous_assignment.job_id = _job_id
            AND previous_assignment.match_id <> _match_id
            AND championship_bracket_preview_private.is_match_rest_conflict(
              _job_id,
              _match_id,
              _slot_id,
              previous_assignment.match_id
            )
        )
      )
    FROM context
  ), false);
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.try_relocate_for_match(
  _job_id UUID,
  _pending_match_id UUID,
  _maximum_moves INTEGER DEFAULT 100
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  pending_slot_record RECORD;
  blocker_record RECORD;
  alternative_slot_record RECORD;
  original_slot_id BIGINT;
  attempted_moves INTEGER := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.matches AS pending_match
    WHERE pending_match.job_id = _job_id
      AND pending_match.id = _pending_match_id
      AND pending_match.assigned = false
  ) THEN
    RETURN false;
  END IF;

  FOR pending_slot_record IN
    SELECT slots_table.id
    FROM championship_bracket_preview_private.slots AS slots_table
    WHERE slots_table.job_id = _job_id
      AND championship_bracket_preview_private.is_match_slot_eligible(
        _job_id,
        _pending_match_id,
        slots_table.id,
        false
      )
    ORDER BY
      slots_table.event_date,
      slots_table.start_at,
      slots_table.location_position,
      slots_table.court_position,
      slots_table.cursor_position
    LIMIT 100
  LOOP
    IF championship_bracket_preview_private.is_match_slot_eligible(
      _job_id,
      _pending_match_id,
      pending_slot_record.id,
      true
    ) THEN
      INSERT INTO championship_bracket_preview_private.assignments (
        job_id,
        match_id,
        slot_id
      ) VALUES (
        _job_id,
        _pending_match_id,
        pending_slot_record.id
      );

      UPDATE championship_bracket_preview_private.matches
      SET assigned = true
      WHERE id = _pending_match_id;

      RETURN true;
    END IF;

    FOR blocker_record IN
      SELECT previous_assignment.match_id, previous_assignment.slot_id
      FROM championship_bracket_preview_private.assignments AS previous_assignment
      WHERE previous_assignment.job_id = _job_id
        AND championship_bracket_preview_private.is_match_rest_conflict(
          _job_id,
          _pending_match_id,
          pending_slot_record.id,
          previous_assignment.match_id
        )
      ORDER BY previous_assignment.assigned_at DESC, previous_assignment.match_id
    LOOP
      original_slot_id := blocker_record.slot_id;

      FOR alternative_slot_record IN
        SELECT slots_table.id
        FROM championship_bracket_preview_private.slots AS slots_table
        WHERE slots_table.job_id = _job_id
          AND slots_table.id <> pending_slot_record.id
          AND slots_table.id <> original_slot_id
          AND championship_bracket_preview_private.is_match_slot_eligible(
            _job_id,
            blocker_record.match_id,
            slots_table.id,
            true
          )
        ORDER BY
          abs(
            extract(epoch FROM (
              slots_table.start_at - (
                SELECT original_slot.start_at
                FROM championship_bracket_preview_private.slots AS original_slot
                WHERE original_slot.id = original_slot_id
              )
            ))
          ),
          slots_table.event_date,
          slots_table.start_at,
          slots_table.location_position,
          slots_table.court_position,
          slots_table.cursor_position
        LIMIT 100
      LOOP
        attempted_moves := attempted_moves + 1;

        UPDATE championship_bracket_preview_private.assignments
        SET slot_id = alternative_slot_record.id,
            assigned_at = now()
        WHERE job_id = _job_id
          AND match_id = blocker_record.match_id;

        IF championship_bracket_preview_private.is_match_slot_eligible(
          _job_id,
          _pending_match_id,
          pending_slot_record.id,
          true
        ) THEN
          INSERT INTO championship_bracket_preview_private.assignments (
            job_id,
            match_id,
            slot_id
          ) VALUES (
            _job_id,
            _pending_match_id,
            pending_slot_record.id
          );

          UPDATE championship_bracket_preview_private.matches
          SET assigned = true
          WHERE id = _pending_match_id;

          RETURN true;
        END IF;

        UPDATE championship_bracket_preview_private.assignments
        SET slot_id = original_slot_id,
            assigned_at = now()
        WHERE job_id = _job_id
          AND match_id = blocker_record.match_id;

        IF attempted_moves >= greatest(COALESCE(_maximum_moves, 100), 1) THEN
          RETURN false;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION championship_bracket_preview_private.is_match_rest_conflict(
  UUID,
  UUID,
  BIGINT,
  UUID
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION championship_bracket_preview_private.is_match_slot_eligible(
  UUID,
  UUID,
  BIGINT,
  BOOLEAN
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION championship_bracket_preview_private.try_relocate_for_match(
  UUID,
  UUID,
  INTEGER
) FROM PUBLIC, anon, authenticated;

DO $patch_redistributor$
DECLARE
  function_definition TEXT;
  updated_definition TEXT;
  source_same_court_same_naipe TEXT := $source$
      SELECT EXISTS (
        SELECT 1
        FROM tmp_global_assignments AS existing_assignments_table
        WHERE pending_match_record.is_knockout = false
          AND existing_assignments_table.new_scheduled_date = slot_record.event_date
          AND existing_assignments_table.location_name = slot_record.location_name
          AND existing_assignments_table.court_name = slot_record.court_name
          AND existing_assignments_table.naipe = pending_match_record.naipe
          AND ABS(slot_record.court_sequence_index - existing_assignments_table.court_sequence_index) < 4
          AND (
            existing_assignments_table.home_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
            OR existing_assignments_table.away_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
          )
      )
$source$;
  target_same_court_same_naipe TEXT := $target$
      SELECT EXISTS (
        SELECT 1
        FROM tmp_global_assignments AS existing_assignments_table
        WHERE existing_assignments_table.new_scheduled_date = slot_record.event_date
          AND existing_assignments_table.location_name = slot_record.location_name
          AND existing_assignments_table.court_name = slot_record.court_name
          AND (
            existing_assignments_table.home_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
            OR existing_assignments_table.away_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
          )
          AND public.is_championship_team_rest_gap_conflict(
            pending_match_record.naipe,
            existing_assignments_table.naipe,
            true,
            slot_record.court_sequence_index,
            existing_assignments_table.court_sequence_index,
            slot_record.slot_start_at,
            existing_assignments_table.planned_start_at,
            pending_match_record.duration_minutes,
            existing_assignments_table.duration_minutes,
            pending_match_record.is_knockout
          )
      )
$target$;
  source_same_court_different_naipe TEXT := $source$
      SELECT EXISTS (
        SELECT 1
        FROM tmp_global_assignments AS existing_assignments_table
        WHERE pending_match_record.is_knockout = false
          AND existing_assignments_table.new_scheduled_date = slot_record.event_date
          AND existing_assignments_table.location_name = slot_record.location_name
          AND existing_assignments_table.court_name = slot_record.court_name
          AND existing_assignments_table.naipe <> pending_match_record.naipe
          AND ABS(slot_record.court_sequence_index - existing_assignments_table.court_sequence_index) < 2
          AND (
            existing_assignments_table.home_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
            OR existing_assignments_table.away_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
          )
      )
$source$;
  target_same_court_different_naipe TEXT := $target$
      SELECT false
$target$;
  source_cross_court_same_naipe TEXT := $source$
      SELECT EXISTS (
        SELECT 1
        FROM tmp_global_assignments AS existing_assignments_table
        WHERE pending_match_record.is_knockout = false
          AND existing_assignments_table.new_scheduled_date = slot_record.event_date
          AND (
            existing_assignments_table.location_name <> slot_record.location_name
            OR existing_assignments_table.court_name <> slot_record.court_name
          )
          AND existing_assignments_table.naipe = pending_match_record.naipe
          AND (
            existing_assignments_table.home_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
            OR existing_assignments_table.away_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
          )
          AND ABS(EXTRACT(EPOCH FROM (existing_assignments_table.planned_start_at - slot_record.slot_start_at)) / 60.0)
            < GREATEST(existing_assignments_table.duration_minutes, pending_match_record.duration_minutes) * 4
      )
$source$;
  target_cross_court_same_naipe TEXT := $target$
      SELECT EXISTS (
        SELECT 1
        FROM tmp_global_assignments AS existing_assignments_table
        WHERE existing_assignments_table.new_scheduled_date = slot_record.event_date
          AND (
            existing_assignments_table.location_name <> slot_record.location_name
            OR existing_assignments_table.court_name <> slot_record.court_name
          )
          AND (
            existing_assignments_table.home_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
            OR existing_assignments_table.away_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
          )
          AND public.is_championship_team_rest_gap_conflict(
            pending_match_record.naipe,
            existing_assignments_table.naipe,
            false,
            NULL,
            NULL,
            slot_record.slot_start_at,
            existing_assignments_table.planned_start_at,
            pending_match_record.duration_minutes,
            existing_assignments_table.duration_minutes,
            pending_match_record.is_knockout
          )
      )
$target$;
  source_cross_court_different_naipe TEXT := $source$
      SELECT EXISTS (
        SELECT 1
        FROM tmp_global_assignments AS existing_assignments_table
        WHERE pending_match_record.is_knockout = false
          AND existing_assignments_table.new_scheduled_date = slot_record.event_date
          AND (
            existing_assignments_table.location_name <> slot_record.location_name
            OR existing_assignments_table.court_name <> slot_record.court_name
          )
          AND existing_assignments_table.naipe <> pending_match_record.naipe
          AND (
            existing_assignments_table.home_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
            OR existing_assignments_table.away_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
          )
          AND ABS(EXTRACT(EPOCH FROM (existing_assignments_table.planned_start_at - slot_record.slot_start_at)) / 60.0)
            < GREATEST(existing_assignments_table.duration_minutes, pending_match_record.duration_minutes) * 2
      )
$source$;
  target_cross_court_different_naipe TEXT := $target$
      SELECT false
$target$;
BEGIN
  SELECT pg_get_functiondef(
    'public.redistribute_bracket_scheduled_matches(uuid)'::regprocedure
  )
  INTO function_definition;

  updated_definition := replace(
    function_definition,
    source_same_court_same_naipe,
    target_same_court_same_naipe
  );

  IF updated_definition = function_definition THEN
    RAISE EXCEPTION 'Não foi possível unificar o descanso de mesmo naipe na mesma quadra.';
  END IF;

  function_definition := updated_definition;
  updated_definition := replace(
    function_definition,
    source_same_court_different_naipe,
    target_same_court_different_naipe
  );

  IF updated_definition = function_definition THEN
    RAISE EXCEPTION 'Não foi possível remover o descanso entre naipes na mesma quadra.';
  END IF;

  function_definition := updated_definition;
  updated_definition := replace(
    function_definition,
    source_cross_court_same_naipe,
    target_cross_court_same_naipe
  );

  IF updated_definition = function_definition THEN
    RAISE EXCEPTION 'Não foi possível unificar o descanso de mesmo naipe entre quadras.';
  END IF;

  function_definition := updated_definition;
  updated_definition := replace(
    function_definition,
    source_cross_court_different_naipe,
    target_cross_court_different_naipe
  );

  IF updated_definition = function_definition THEN
    RAISE EXCEPTION 'Não foi possível remover o descanso entre naipes em quadras diferentes.';
  END IF;

  EXECUTE updated_definition;
END;
$patch_redistributor$;

DO $patch_async_worker$
DECLARE
  function_definition TEXT;
  rest_source TEXT := $source$
      AND NOT EXISTS (
        SELECT 1
        FROM championship_bracket_preview_private.assignments AS previous_assignment
        JOIN championship_bracket_preview_private.matches AS previous_match
          ON previous_match.id = previous_assignment.match_id
        JOIN championship_bracket_preview_private.slots AS previous_slot
          ON previous_slot.id = previous_assignment.slot_id
        WHERE previous_assignment.job_id = _job_id
          AND previous_slot.event_date = slot_record.event_date
          AND (
            previous_match.home_team_id IN (matches_table.home_team_id, matches_table.away_team_id)
            OR previous_match.away_team_id IN (matches_table.home_team_id, matches_table.away_team_id)
          )
          AND (
            previous_slot.start_at = slot_record.start_at
            OR (
              previous_slot.court_key = slot_record.court_key
              AND competitions_table.naipe = (
                SELECT previous_competition.naipe
                FROM championship_bracket_preview_private.competitions AS previous_competition
                WHERE previous_competition.id = previous_match.competition_id
              )
              AND ABS(EXTRACT(EPOCH FROM (previous_slot.start_at - slot_record.start_at)) / 60)
                < EXTRACT(EPOCH FROM (slot_record.end_at - slot_record.start_at)) / 60 * 4
            )
            OR (
              previous_slot.court_key <> slot_record.court_key
              AND ABS(EXTRACT(EPOCH FROM (previous_slot.start_at - slot_record.start_at)) / 60)
                < EXTRACT(EPOCH FROM (slot_record.end_at - slot_record.start_at)) / 60 * 2
            )
          )
      )
$source$;
  rest_target TEXT := $target$
      AND NOT EXISTS (
        SELECT 1
        FROM championship_bracket_preview_private.assignments AS previous_assignment
        WHERE previous_assignment.job_id = _job_id
          AND championship_bracket_preview_private.is_match_rest_conflict(
            _job_id,
            matches_table.id,
            slot_record.id,
            previous_assignment.match_id
          )
      )
$target$;
  terminal_source TEXT := $source$
  IF NOT EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.slots
    WHERE job_id = _job_id
      AND processed = false
  ) THEN
    UPDATE championship_bracket_preview_private.jobs
$source$;
  terminal_target TEXT := $target$
  IF NOT EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.slots
    WHERE job_id = _job_id
      AND processed = false
  ) THEN
    FOR candidate IN
      SELECT pending_match.*
      FROM championship_bracket_preview_private.matches AS pending_match
      WHERE pending_match.job_id = _job_id
        AND pending_match.assigned = false
      ORDER BY
        pending_match.priority_weight DESC,
        pending_match.round_number,
        pending_match.slot_number,
        pending_match.id
    LOOP
      IF clock_timestamp() - started_clock >= interval '12 seconds' THEN
        UPDATE championship_bracket_preview_private.jobs
        SET
          stage = 'Tentando realocar partidas pendentes',
          heartbeat_at = now(),
          updated_at = now()
        WHERE id = _job_id;

        RETURN jsonb_build_object('continue', true, 'delay', 0);
      END IF;

      IF championship_bracket_preview_private.try_relocate_for_match(
        _job_id,
        candidate.id,
        100
      ) THEN
        produced := produced + 1;
      END IF;
    END LOOP;

    SELECT count(*)
    INTO pending_count
    FROM championship_bracket_preview_private.matches
    WHERE job_id = _job_id
      AND assigned = false;

    IF pending_count = 0 THEN
      UPDATE championship_bracket_preview_private.jobs
      SET
        status = 'FINALIZING',
        stage = 'Montando manifesto final após realocação',
        progress_percentage = 90,
        heartbeat_at = now(),
        updated_at = now()
      WHERE id = _job_id;

      RETURN jsonb_build_object('continue', true, 'delay', 0);
    END IF;

    UPDATE championship_bracket_preview_private.jobs
$target$;
BEGIN
  SELECT pg_get_functiondef(
    'championship_bracket_preview_private.process_batch(uuid)'::regprocedure
  )
  INTO function_definition;

  IF position(rest_source IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível centralizar o descanso em process_batch(uuid).';
  END IF;

  function_definition := replace(function_definition, rest_source, rest_target);

  IF position(terminal_source IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível inserir a realocação terminal em process_batch(uuid).';
  END IF;

  function_definition := replace(
    function_definition,
    terminal_source,
    terminal_target
  );

  function_definition := replace(
    function_definition,
    'async-exact-v2',
    'async-exact-v3'
  );

  EXECUTE function_definition;
END;
$patch_async_worker$;

ALTER TABLE championship_bracket_preview_private.jobs
  ALTER COLUMN algorithm_version SET DEFAULT 'async-exact-v3';

DO $upgrade_async_contract$
DECLARE
  function_signature REGPROCEDURE;
  function_definition TEXT;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.start_championship_bracket_preview_job(uuid,jsonb)'::regprocedure,
    'public.get_championship_bracket_preview_job_status(uuid)'::regprocedure,
    'public.create_championship_bracket_from_preview_job(uuid,uuid,jsonb)'::regprocedure
  ]
  LOOP
    SELECT pg_get_functiondef(function_signature)
    INTO function_definition;

    IF position('async-exact-v2' IN function_definition) = 0 THEN
      RAISE EXCEPTION 'A função % não contém o contrato async-exact-v2 esperado.', function_signature;
    END IF;

    EXECUTE replace(
      function_definition,
      'async-exact-v2',
      'async-exact-v3'
    );
  END LOOP;
END;
$upgrade_async_contract$;

UPDATE championship_bracket_preview_private.jobs
SET
  status = 'CANCELLED',
  stage = 'Recalcule após a unificação das regras de descanso',
  expires_at = now() + interval '24 hours',
  heartbeat_at = now(),
  updated_at = now()
WHERE algorithm_version IN ('async-exact-v1', 'async-exact-v2')
  AND status IN (
    'QUEUED',
    'INITIALIZING',
    'SCHEDULING',
    'FINALIZING',
    'COMPLETED',
    'FAILED'
  );

COMMENT ON FUNCTION championship_bracket_preview_private.try_relocate_for_match(
  UUID,
  UUID,
  INTEGER
) IS 'Tenta encaixar uma partida pendente diretamente ou movendo uma única atribuição bloqueadora para outro slot compatível, com busca determinística e limitada.';

DO $validate_unified_rest_rule$
BEGIN
  IF NOT public.is_championship_team_rest_gap_conflict(
    'FEMININO'::public.match_naipe,
    'FEMININO'::public.match_naipe,
    true,
    1,
    4,
    now(),
    now() + interval '135 minutes',
    45,
    45,
    false
  ) THEN
    RAISE EXCEPTION 'A regra deve bloquear o mesmo naipe antes da posição 5.';
  END IF;

  IF public.is_championship_team_rest_gap_conflict(
    'FEMININO'::public.match_naipe,
    'FEMININO'::public.match_naipe,
    true,
    1,
    5,
    now(),
    now() + interval '180 minutes',
    45,
    45,
    false
  ) THEN
    RAISE EXCEPTION 'A regra deve liberar o mesmo naipe na posição 5.';
  END IF;

  IF public.is_championship_team_rest_gap_conflict(
    'FEMININO'::public.match_naipe,
    'MASCULINO'::public.match_naipe,
    true,
    1,
    2,
    now(),
    now() + interval '45 minutes',
    45,
    45,
    false
  ) OR public.is_championship_team_rest_gap_conflict(
    'FEMININO'::public.match_naipe,
    'MASCULINO'::public.match_naipe,
    false,
    NULL,
    NULL,
    now(),
    now(),
    45,
    60,
    false
  ) THEN
    RAISE EXCEPTION 'Naipes diferentes não devem gerar descanso mínimo.';
  END IF;

  IF public.is_championship_team_rest_gap_conflict(
    'FEMININO'::public.match_naipe,
    'FEMININO'::public.match_naipe,
    false,
    NULL,
    NULL,
    now(),
    now() + interval '179 minutes',
    45,
    40,
    false
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'O mesmo naipe entre quadras deve respeitar quatro vezes a maior duração.';
  END IF;

  IF public.is_championship_team_rest_gap_conflict(
    'FEMININO'::public.match_naipe,
    'FEMININO'::public.match_naipe,
    true,
    1,
    2,
    now(),
    now() + interval '45 minutes',
    45,
    45,
    true
  ) THEN
    RAISE EXCEPTION 'O mata-mata não deve receber descanso mínimo.';
  END IF;
END;
$validate_unified_rest_rule$;

NOTIFY pgrst, 'reload schema';
