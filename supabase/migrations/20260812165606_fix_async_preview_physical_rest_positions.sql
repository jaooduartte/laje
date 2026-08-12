-- LAJE-81: alinha a prévia exata ao descanso, ao round-robin e à ordem
-- cronológica das rodadas usados na agenda definitiva.

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
      candidate_slot.end_at,
      candidate_slot.sequence_index
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
      other_slot.end_at,
      other_slot.sequence_index
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
          WHEN candidate_context.court_key = other_context.court_key
          THEN candidate_context.sequence_index::bigint
          ELSE NULL
        END,
        CASE
          WHEN candidate_context.court_key = other_context.court_key
          THEN other_context.sequence_index::bigint
          ELSE NULL
        END,
        candidate_context.start_at,
        other_context.start_at,
        (
          extract(epoch FROM (
            candidate_context.end_at - candidate_context.start_at
          )) / 60
        )::integer,
        (
          extract(epoch FROM (
            other_context.end_at - other_context.start_at
          )) / 60
        )::integer,
        false
      )
    FROM candidate_context
    CROSS JOIN other_context
  ), false);
$function$;

REVOKE ALL ON FUNCTION championship_bracket_preview_private.is_match_rest_conflict(
  UUID,
  UUID,
  BIGINT,
  UUID
) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION championship_bracket_preview_private.is_match_rest_conflict(
  UUID,
  UUID,
  BIGINT,
  UUID
) IS 'Adapta a regra central de descanso à prévia exata usando sequence_index, a posição física do slot na quadra. Slots vazios entre duas partidas contam como posições disponíveis.';

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.rebuild_job_round_robin_matches(
  _job_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  competition_record RECORD;
  group_record RECORD;
  group_team_ids UUID[];
  group_team_count INTEGER;
  group_even_size INTEGER;
  round_index INTEGER;
  match_index INTEGER;
  home_index INTEGER;
  away_index INTEGER;
  home_position INTEGER;
  away_position INTEGER;
  home_team_id UUID;
  away_team_id UUID;
  competition_slot_number INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.assignments
    WHERE job_id = _job_id
  ) THEN
    RAISE EXCEPTION
      'Os confrontos não podem ser reconstruídos depois do início das atribuições.';
  END IF;

  DELETE FROM championship_bracket_preview_private.matches
  WHERE job_id = _job_id;

  FOR competition_record IN
    SELECT competitions_table.id
    FROM championship_bracket_preview_private.competitions AS competitions_table
    WHERE competitions_table.job_id = _job_id
    ORDER BY competitions_table.position, competitions_table.id
  LOOP
    competition_slot_number := 1;

    FOR group_record IN
      SELECT groups_table.id, groups_table.group_number
      FROM championship_bracket_preview_private.groups AS groups_table
      WHERE groups_table.job_id = _job_id
        AND groups_table.competition_id = competition_record.id
      ORDER BY groups_table.group_number, groups_table.id
    LOOP
      SELECT array_agg(group_teams_table.team_id ORDER BY group_teams_table.position)
      INTO group_team_ids
      FROM championship_bracket_preview_private.group_teams AS group_teams_table
      WHERE group_teams_table.job_id = _job_id
        AND group_teams_table.group_id = group_record.id;

      group_team_count := COALESCE(cardinality(group_team_ids), 0);

      IF group_team_count < 2 THEN
        RAISE EXCEPTION
          'Grupo % inválido: é necessário no mínimo duas atléticas.',
          group_record.group_number;
      END IF;

      group_even_size := group_team_count;
      IF group_even_size % 2 <> 0 THEN
        group_even_size := group_even_size + 1;
      END IF;

      FOR round_index IN 0 .. group_even_size - 2 LOOP
        FOR match_index IN 0 .. (group_even_size / 2) - 1 LOOP
          IF match_index = 0 THEN
            home_index := 0;
          ELSE
            home_index :=
              (round_index + match_index - 1) % (group_even_size - 1) + 1;
          END IF;

          away_index :=
            (group_even_size - 1 - match_index + round_index - 1)
              % (group_even_size - 1) + 1;
          home_position := home_index + 1;
          away_position := away_index + 1;

          IF home_position <= group_team_count
            AND away_position <= group_team_count
          THEN
            home_team_id := group_team_ids[home_position];
            away_team_id := group_team_ids[away_position];

            IF match_index = 0 AND round_index % 2 <> 0 THEN
              home_team_id := group_team_ids[away_position];
              away_team_id := group_team_ids[home_position];
            END IF;

            IF home_team_id IS NOT NULL
              AND away_team_id IS NOT NULL
              AND home_team_id <> away_team_id
            THEN
              INSERT INTO championship_bracket_preview_private.matches (
                id,
                job_id,
                competition_id,
                group_id,
                logical_key,
                round_number,
                slot_number,
                home_team_id,
                away_team_id,
                priority_weight
              ) VALUES (
                gen_random_uuid(),
                _job_id,
                competition_record.id,
                group_record.id,
                format(
                  '%s:%s:%s',
                  group_record.id,
                  least(home_position, away_position),
                  greatest(home_position, away_position)
                ),
                round_index + 1,
                competition_slot_number,
                home_team_id,
                away_team_id,
                (group_team_count * 100)
                  - least(home_position, away_position)
                  - greatest(home_position, away_position)
              );

              competition_slot_number := competition_slot_number + 1;
            END IF;
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.is_match_round_order_eligible(
  _job_id UUID,
  _match_id UUID,
  _slot_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  WITH candidate_context AS (
    SELECT
      candidate_match.id,
      candidate_match.competition_id,
      candidate_match.group_id,
      candidate_match.round_number,
      candidate_slot.start_at,
      candidate_slot.end_at
    FROM championship_bracket_preview_private.matches AS candidate_match
    JOIN championship_bracket_preview_private.slots AS candidate_slot
      ON candidate_slot.job_id = candidate_match.job_id
      AND candidate_slot.id = _slot_id
    WHERE candidate_match.job_id = _job_id
      AND candidate_match.id = _match_id
  )
  SELECT COALESCE((
    SELECT
      NOT EXISTS (
        SELECT 1
        FROM championship_bracket_preview_private.matches AS earlier_match
        WHERE earlier_match.job_id = _job_id
          AND earlier_match.id <> candidate_context.id
          AND earlier_match.competition_id = candidate_context.competition_id
          AND earlier_match.group_id = candidate_context.group_id
          AND earlier_match.round_number < candidate_context.round_number
          AND earlier_match.assigned = false
      )
      AND NOT EXISTS (
        SELECT 1
        FROM championship_bracket_preview_private.assignments AS ordered_assignment
        JOIN championship_bracket_preview_private.matches AS ordered_match
          ON ordered_match.id = ordered_assignment.match_id
        JOIN championship_bracket_preview_private.slots AS ordered_slot
          ON ordered_slot.id = ordered_assignment.slot_id
        WHERE ordered_assignment.job_id = _job_id
          AND ordered_match.id <> candidate_context.id
          AND ordered_match.competition_id = candidate_context.competition_id
          AND ordered_match.group_id = candidate_context.group_id
          AND (
            (
              ordered_match.round_number < candidate_context.round_number
              AND ordered_slot.end_at > candidate_context.start_at
            )
            OR (
              ordered_match.round_number > candidate_context.round_number
              AND candidate_context.end_at > ordered_slot.start_at
            )
          )
      )
    FROM candidate_context
  ), false);
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.is_job_slot_within_day_bounds(
  _job_id UUID,
  _slot_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  SELECT COALESCE(EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.jobs AS jobs_table
    JOIN championship_bracket_preview_private.slots AS slots_table
      ON slots_table.job_id = jobs_table.id
      AND slots_table.id = _slot_id
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(jobs_table.payload -> 'schedule_days', '[]'::jsonb)
    ) AS day_item(value)
    WHERE jobs_table.id = _job_id
      AND day_item.value ->> 'date' = slots_table.event_date::text
      AND slots_table.start_at >= public.combine_bracket_schedule_timestamp(
        slots_table.event_date,
        (day_item.value ->> 'start_time')::time
      )
      AND slots_table.end_at <= public.combine_bracket_schedule_timestamp(
        slots_table.event_date,
        (day_item.value ->> 'end_time')::time
      )
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
      AND championship_bracket_preview_private.is_job_slot_within_day_bounds(
        _job_id,
        _slot_id
      )
      AND championship_bracket_preview_private.is_match_round_order_eligible(
        _job_id,
        _match_id,
        _slot_id
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
        true
      )
    ORDER BY
      slots_table.event_date,
      slots_table.start_at,
      slots_table.location_position,
      slots_table.court_position,
      slots_table.cursor_position
    LIMIT 100
  LOOP
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
  END LOOP;

  FOR blocker_record IN
    SELECT
      blocker_assignment.match_id,
      blocker_assignment.slot_id,
      blocker_assignment.match_number,
      blocker_assignment.assigned_at
    FROM championship_bracket_preview_private.matches AS pending_match
    JOIN championship_bracket_preview_private.matches AS blocker_match
      ON blocker_match.job_id = pending_match.job_id
      AND blocker_match.competition_id = pending_match.competition_id
      AND blocker_match.group_id = pending_match.group_id
      AND blocker_match.round_number > pending_match.round_number
      AND blocker_match.assigned = true
    JOIN championship_bracket_preview_private.assignments AS blocker_assignment
      ON blocker_assignment.job_id = blocker_match.job_id
      AND blocker_assignment.match_id = blocker_match.id
    JOIN championship_bracket_preview_private.slots AS blocker_slot
      ON blocker_slot.id = blocker_assignment.slot_id
    WHERE pending_match.job_id = _job_id
      AND pending_match.id = _pending_match_id
    ORDER BY
      blocker_match.round_number,
      blocker_slot.event_date,
      blocker_slot.start_at,
      blocker_slot.location_position,
      blocker_slot.court_position
  LOOP
    original_slot_id := blocker_record.slot_id;

    DELETE FROM championship_bracket_preview_private.assignments
    WHERE job_id = _job_id
      AND match_id = blocker_record.match_id;

    UPDATE championship_bracket_preview_private.matches
    SET assigned = false
    WHERE id = blocker_record.match_id;

    IF championship_bracket_preview_private.is_match_slot_eligible(
      _job_id,
      _pending_match_id,
      original_slot_id,
      true
    ) THEN
      INSERT INTO championship_bracket_preview_private.assignments (
        job_id,
        match_id,
        slot_id
      ) VALUES (
        _job_id,
        _pending_match_id,
        original_slot_id
      );

      UPDATE championship_bracket_preview_private.matches
      SET assigned = true
      WHERE id = _pending_match_id;

      FOR alternative_slot_record IN
        SELECT slots_table.id
        FROM championship_bracket_preview_private.slots AS slots_table
        WHERE slots_table.job_id = _job_id
          AND slots_table.id <> original_slot_id
          AND championship_bracket_preview_private.is_match_slot_eligible(
            _job_id,
            blocker_record.match_id,
            slots_table.id,
            true
          )
        ORDER BY
          slots_table.event_date,
          slots_table.start_at,
          slots_table.location_position,
          slots_table.court_position,
          slots_table.cursor_position
        LIMIT 100
      LOOP
        attempted_moves := attempted_moves + 1;

        INSERT INTO championship_bracket_preview_private.assignments (
          job_id,
          match_id,
          slot_id,
          match_number
        ) VALUES (
          _job_id,
          blocker_record.match_id,
          alternative_slot_record.id,
          blocker_record.match_number
        );

        UPDATE championship_bracket_preview_private.matches
        SET assigned = true
        WHERE id = blocker_record.match_id;

        RETURN true;
      END LOOP;

      DELETE FROM championship_bracket_preview_private.assignments
      WHERE job_id = _job_id
        AND match_id = _pending_match_id;

      UPDATE championship_bracket_preview_private.matches
      SET assigned = false
      WHERE id = _pending_match_id;
    END IF;

    INSERT INTO championship_bracket_preview_private.assignments (
      job_id,
      match_id,
      slot_id,
      match_number,
      assigned_at
    ) VALUES (
      _job_id,
      blocker_record.match_id,
      original_slot_id,
      blocker_record.match_number,
      blocker_record.assigned_at
    );

    UPDATE championship_bracket_preview_private.matches
    SET assigned = true
    WHERE id = blocker_record.match_id;

    IF attempted_moves >= greatest(COALESCE(_maximum_moves, 100), 1) THEN
      RETURN false;
    END IF;
  END LOOP;

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

REVOKE ALL ON FUNCTION championship_bracket_preview_private.rebuild_job_round_robin_matches(
  UUID
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION championship_bracket_preview_private.is_match_round_order_eligible(
  UUID,
  UUID,
  BIGINT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION championship_bracket_preview_private.is_job_slot_within_day_bounds(
  UUID,
  BIGINT
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

COMMENT ON FUNCTION championship_bracket_preview_private.rebuild_job_round_robin_matches(UUID)
  IS 'Reconstrói os confrontos e as rodadas do job com o mesmo algoritmo round-robin usado na criação definitiva.';
COMMENT ON FUNCTION championship_bracket_preview_private.is_match_round_order_eligible(UUID, UUID, BIGINT)
  IS 'Impede que uma rodada do grupo comece antes de todas as rodadas anteriores terminarem.';
COMMENT ON FUNCTION championship_bracket_preview_private.is_job_slot_within_day_bounds(UUID, BIGINT)
  IS 'Garante que o início e o fim do slot permaneçam dentro dos horários configurados para o dia.';
COMMENT ON FUNCTION championship_bracket_preview_private.try_relocate_for_match(UUID, UUID, INTEGER)
  IS 'Tenta encaixe direto, promove uma rodada pendente antes de rodadas posteriores e, por fim, realoca conflitos de descanso.';

DO $patch_round_robin_initialization$
DECLARE
  function_definition TEXT;
  source_block TEXT := $source$
    PERFORM championship_bracket_preview_private.initialize_job(_job_id);
$source$;
  target_block TEXT := $target$
    PERFORM championship_bracket_preview_private.initialize_job(_job_id);
    PERFORM championship_bracket_preview_private.rebuild_job_round_robin_matches(_job_id);
$target$;
BEGIN
  SELECT pg_get_functiondef(
    'championship_bracket_preview_private.process_batch(uuid)'::regprocedure
  )
  INTO function_definition;

  IF position(target_block IN function_definition) = 0 THEN
    IF position(source_block IN function_definition) = 0 THEN
      RAISE EXCEPTION
        'Não foi possível alinhar o round-robin na inicialização do job.';
    END IF;

    EXECUTE replace(function_definition, source_block, target_block);
  END IF;
END;
$patch_round_robin_initialization$;

DO $patch_round_order_scheduling$
DECLARE
  function_definition TEXT;
  source_block TEXT := $source$
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
$source$;
  target_block TEXT := $target$
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
BEGIN
  SELECT pg_get_functiondef(
    'championship_bracket_preview_private.process_batch(uuid)'::regprocedure
  )
  INTO function_definition;

  IF position(target_block IN function_definition) = 0 THEN
    IF position(source_block IN function_definition) = 0 THEN
      RAISE EXCEPTION
        'Não foi possível aplicar a ordem das rodadas em process_batch(uuid).';
    END IF;

    EXECUTE replace(function_definition, source_block, target_block);
  END IF;
END;
$patch_round_order_scheduling$;

ALTER TABLE championship_bracket_preview_private.jobs
  ALTER COLUMN algorithm_version SET DEFAULT 'async-exact-v4';

DO $upgrade_async_contract$
DECLARE
  function_signature REGPROCEDURE;
  function_definition TEXT;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'championship_bracket_preview_private.process_batch(uuid)'::regprocedure,
    'public.start_championship_bracket_preview_job(uuid,jsonb)'::regprocedure,
    'public.get_championship_bracket_preview_job_status(uuid)'::regprocedure,
    'public.create_championship_bracket_from_preview_job(uuid,uuid,jsonb)'::regprocedure
  ]
  LOOP
    SELECT pg_get_functiondef(function_signature)
    INTO function_definition;

    IF position('async-exact-v3' IN function_definition) = 0 THEN
      RAISE EXCEPTION
        'A função % não contém o contrato async-exact-v3 esperado.',
        function_signature;
    END IF;

    EXECUTE replace(
      function_definition,
      'async-exact-v3',
      'async-exact-v4'
    );
  END LOOP;
END;
$upgrade_async_contract$;

UPDATE championship_bracket_preview_private.jobs
SET
  status = 'CANCELLED',
  stage = 'Recalcule após a correção do descanso e da ordem das rodadas',
  expires_at = now() + interval '24 hours',
  heartbeat_at = now(),
  updated_at = now()
WHERE algorithm_version = 'async-exact-v3'
  AND status IN (
    'QUEUED',
    'INITIALIZING',
    'SCHEDULING',
    'FINALIZING',
    'COMPLETED',
    'FAILED'
  );

DO $validate_physical_position_adapter$
DECLARE
  function_definition TEXT;
  process_batch_definition TEXT;
  round_robin_definition TEXT;
  slot_eligibility_definition TEXT;
  relocation_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'championship_bracket_preview_private.is_match_rest_conflict(uuid,uuid,bigint,uuid)'::regprocedure
  )
  INTO function_definition;

  IF position('candidate_context.sequence_index::bigint' IN function_definition) = 0
    OR position('other_context.sequence_index::bigint' IN function_definition) = 0
  THEN
    RAISE EXCEPTION
      'A prévia exata não está usando as posições físicas dos slots.';
  END IF;

  IF position('SELECT 1 + count(*)' IN function_definition) > 0 THEN
    RAISE EXCEPTION
      'A prévia exata ainda está derivando posição apenas das partidas atribuídas.';
  END IF;

  IF public.is_championship_team_rest_gap_conflict(
    'MASCULINO'::public.match_naipe,
    'MASCULINO'::public.match_naipe,
    true,
    10,
    14,
    now(),
    now() + interval '160 minutes',
    40,
    40,
    false
  ) THEN
    RAISE EXCEPTION
      'A distância entre as posições físicas 10 e 14 deve ser permitida.';
  END IF;

  SELECT pg_get_functiondef(
    'championship_bracket_preview_private.process_batch(uuid)'::regprocedure
  )
  INTO process_batch_definition;

  IF position(
    'rebuild_job_round_robin_matches(_job_id)'
    IN process_batch_definition
  ) = 0 THEN
    RAISE EXCEPTION
      'A inicialização do job não está reconstruindo o round-robin oficial.';
  END IF;

  IF position(
    'is_match_round_order_eligible('
    IN process_batch_definition
  ) = 0 THEN
    RAISE EXCEPTION
      'O processamento guloso não está preservando a ordem das rodadas.';
  END IF;

  IF position(
    'is_job_slot_within_day_bounds('
    IN process_batch_definition
  ) = 0 THEN
    RAISE EXCEPTION
      'O processamento guloso não está validando os limites do dia.';
  END IF;

  SELECT pg_get_functiondef(
    'championship_bracket_preview_private.rebuild_job_round_robin_matches(uuid)'::regprocedure
  )
  INTO round_robin_definition;

  IF position('round_index + 1' IN round_robin_definition) = 0
    OR position('group_even_size / 2' IN round_robin_definition) = 0
  THEN
    RAISE EXCEPTION
      'A reconstrução dos confrontos não contém o round-robin esperado.';
  END IF;

  SELECT pg_get_functiondef(
    'championship_bracket_preview_private.is_match_slot_eligible(uuid,uuid,bigint,boolean)'::regprocedure
  )
  INTO slot_eligibility_definition;

  IF position(
    'is_match_round_order_eligible('
    IN slot_eligibility_definition
  ) = 0 THEN
    RAISE EXCEPTION
      'A elegibilidade de horários não valida a ordem das rodadas.';
  END IF;

  IF position(
    'is_job_slot_within_day_bounds('
    IN slot_eligibility_definition
  ) = 0 THEN
    RAISE EXCEPTION
      'A elegibilidade de horários não valida os limites do dia.';
  END IF;

  SELECT pg_get_functiondef(
    'championship_bracket_preview_private.try_relocate_for_match(uuid,uuid,integer)'::regprocedure
  )
  INTO relocation_definition;

  IF position(
    'blocker_match.round_number > pending_match.round_number'
    IN relocation_definition
  ) = 0 THEN
    RAISE EXCEPTION
      'O backtracking não promove rodadas pendentes antes das posteriores.';
  END IF;
END;
$validate_physical_position_adapter$;

NOTIFY pgrst, 'reload schema';
