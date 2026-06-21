-- Mata-mata não deve herdar a regra de descanso usada para reordenar e validar
-- jogos de fase de grupos. Ao encerrar uma chave que materializa semifinal ou
-- final, o confronto eliminatório precisa poder entrar na fila mesmo quando a
-- mesma atlética aparece em seguida na mesma quadra.

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
AS $$
DECLARE
  candidate_match_id UUID := COALESCE(_match_id, '00000000-0000-0000-0000-000000000000'::uuid);
  candidate_duration_minutes INTEGER := GREATEST(COALESCE(_duration_minutes, 35), 1);
  conflict_message TEXT;
BEGIN
  IF _championship_id IS NULL
    OR _season_year IS NULL
    OR _scheduled_date IS NULL
    OR _sport_id IS NULL
    OR _naipe IS NULL
    OR NULLIF(trim(COALESCE(_location, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(_court_name, '')), '') IS NULL
    OR _home_team_id IS NULL
    OR _away_team_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT GREATEST(
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
      matches_table.scheduled_date,
      matches_table.location,
      matches_table.court_name,
      matches_table.start_time,
      matches_table.scheduled_slot,
      matches_table.queue_position,
      matches_table.created_at,
      matches_table.naipe,
      matches_table.home_team_id,
      matches_table.away_team_id,
      GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1) AS duration_minutes,
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
      _scheduled_date,
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
      COALESCE(
        (
          SELECT bracket_matches_table.group_id IS NULL
          FROM public.championship_bracket_matches AS bracket_matches_table
          WHERE bracket_matches_table.match_id = candidate_match_id
          LIMIT 1
        ),
        false
      )
  ),
  ordered_court_matches AS (
    SELECT
      simulated_matches.*,
      row_number() OVER court_order AS court_sequence_index
    FROM simulated_matches
    WHERE public.normalize_bracket_entity_name(simulated_matches.location) = public.normalize_bracket_entity_name(_location)
      AND public.normalize_bracket_entity_name(simulated_matches.court_name) = public.normalize_bracket_entity_name(_court_name)
    WINDOW court_order AS (
      ORDER BY
        CASE
          WHEN simulated_matches.start_time IS NULL THEN 1
          ELSE 0
        END,
        simulated_matches.start_time ASC NULLS LAST,
        COALESCE(simulated_matches.scheduled_slot, simulated_matches.queue_position) ASC NULLS LAST,
        COALESCE(simulated_matches.queue_position, simulated_matches.scheduled_slot) ASC NULLS LAST,
        simulated_matches.created_at ASC,
        simulated_matches.id ASC
    )
  ),
  candidate_court_match AS (
    SELECT *
    FROM ordered_court_matches
    WHERE ordered_court_matches.id = candidate_match_id
    LIMIT 1
  ),
  same_court_same_naipe_conflict AS (
    SELECT 1
    FROM candidate_court_match
    JOIN ordered_court_matches AS other_match
      ON other_match.id <> candidate_court_match.id
    WHERE candidate_court_match.is_knockout = false
      AND candidate_court_match.naipe = other_match.naipe
      AND ABS(candidate_court_match.court_sequence_index - other_match.court_sequence_index) < 4
      AND (
        other_match.home_team_id IN (candidate_court_match.home_team_id, candidate_court_match.away_team_id)
        OR other_match.away_team_id IN (candidate_court_match.home_team_id, candidate_court_match.away_team_id)
      )
    LIMIT 1
  ),
  same_court_different_naipe_conflict AS (
    SELECT 1
    FROM candidate_court_match
    JOIN ordered_court_matches AS other_match
      ON other_match.id <> candidate_court_match.id
    WHERE candidate_court_match.is_knockout = false
      AND candidate_court_match.naipe <> other_match.naipe
      AND ABS(candidate_court_match.court_sequence_index - other_match.court_sequence_index) < 2
      AND (
        other_match.home_team_id IN (candidate_court_match.home_team_id, candidate_court_match.away_team_id)
        OR other_match.away_team_id IN (candidate_court_match.home_team_id, candidate_court_match.away_team_id)
      )
    LIMIT 1
  ),
  cross_court_same_naipe_time_conflict AS (
    SELECT 1
    FROM simulated_matches AS candidate_match
    JOIN simulated_matches AS other_match
      ON other_match.id <> candidate_match.id
    WHERE candidate_match.id = candidate_match_id
      AND candidate_match.is_knockout = false
      AND candidate_match.start_time IS NOT NULL
      AND other_match.start_time IS NOT NULL
      AND candidate_match.naipe = other_match.naipe
      AND (
        public.normalize_bracket_entity_name(candidate_match.location) <> public.normalize_bracket_entity_name(other_match.location)
        OR public.normalize_bracket_entity_name(candidate_match.court_name) <> public.normalize_bracket_entity_name(other_match.court_name)
      )
      AND (
        other_match.home_team_id IN (candidate_match.home_team_id, candidate_match.away_team_id)
        OR other_match.away_team_id IN (candidate_match.home_team_id, candidate_match.away_team_id)
      )
      AND ABS(EXTRACT(EPOCH FROM (other_match.start_time - candidate_match.start_time)) / 60.0)
        < GREATEST(candidate_match.duration_minutes, other_match.duration_minutes) * 4
    LIMIT 1
  ),
  cross_court_different_naipe_time_conflict AS (
    SELECT 1
    FROM simulated_matches AS candidate_match
    JOIN simulated_matches AS other_match
      ON other_match.id <> candidate_match.id
    WHERE candidate_match.id = candidate_match_id
      AND candidate_match.is_knockout = false
      AND candidate_match.start_time IS NOT NULL
      AND other_match.start_time IS NOT NULL
      AND candidate_match.naipe <> other_match.naipe
      AND (
        public.normalize_bracket_entity_name(candidate_match.location) <> public.normalize_bracket_entity_name(other_match.location)
        OR public.normalize_bracket_entity_name(candidate_match.court_name) <> public.normalize_bracket_entity_name(other_match.court_name)
      )
      AND (
        other_match.home_team_id IN (candidate_match.home_team_id, candidate_match.away_team_id)
        OR other_match.away_team_id IN (candidate_match.home_team_id, candidate_match.away_team_id)
      )
      AND ABS(EXTRACT(EPOCH FROM (other_match.start_time - candidate_match.start_time)) / 60.0)
        < GREATEST(candidate_match.duration_minutes, other_match.duration_minutes) * 2
    LIMIT 1
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM same_court_same_naipe_conflict) THEN
      'A mesma atlética precisa de pelo menos 4 jogos de descanso na mesma quadra para partidas do mesmo naipe.'
    WHEN EXISTS (SELECT 1 FROM same_court_different_naipe_conflict) THEN
      'A mesma atlética precisa de pelo menos 1 jogo de intervalo entre partidas de naipes diferentes na mesma quadra.'
    WHEN EXISTS (SELECT 1 FROM cross_court_same_naipe_time_conflict) THEN
      'A mesma atlética precisa de pelo menos 4 jogos de descanso entre partidas do mesmo naipe no mesmo dia.'
    WHEN EXISTS (SELECT 1 FROM cross_court_different_naipe_time_conflict) THEN
      'A mesma atlética precisa de pelo menos 1 jogo de intervalo entre partidas de naipes diferentes no mesmo dia.'
    ELSE NULL
  END
  INTO conflict_message;

  RETURN conflict_message;
END;
$$;

DO $$
DECLARE
  function_signature REGPROCEDURE := to_regprocedure('public.redistribute_bracket_scheduled_matches(uuid)');
  function_definition TEXT;
  updated_definition TEXT;
  replace_cursor TEXT;
  source_pending_table_block TEXT := $source$
  CREATE TEMP TABLE tmp_global_pending_matches (
    order_index BIGINT PRIMARY KEY,
    match_id UUID NOT NULL,
    original_scheduled_date DATE NULL,
    sport_id UUID NOT NULL,
    naipe public.match_naipe NOT NULL,
    division public.team_division NULL,
    home_team_id UUID NOT NULL,
    away_team_id UUID NOT NULL,
    duration_minutes INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    preferred_knockout_court_group_id UUID NULL
  ) ON COMMIT DROP;
$source$;
  target_pending_table_block TEXT := $target$
  CREATE TEMP TABLE tmp_global_pending_matches (
    order_index BIGINT PRIMARY KEY,
    match_id UUID NOT NULL,
    original_scheduled_date DATE NULL,
    sport_id UUID NOT NULL,
    naipe public.match_naipe NOT NULL,
    division public.team_division NULL,
    home_team_id UUID NOT NULL,
    away_team_id UUID NOT NULL,
    duration_minutes INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    is_knockout BOOLEAN NOT NULL,
    preferred_knockout_court_group_id UUID NULL
  ) ON COMMIT DROP;
$target$;
  source_pending_insert_block TEXT := $source$
  INSERT INTO tmp_global_pending_matches (
    order_index,
    match_id,
    original_scheduled_date,
    sport_id,
    naipe,
    division,
    home_team_id,
    away_team_id,
    duration_minutes,
    created_at,
    preferred_knockout_court_group_id
  )
$source$;
  target_pending_insert_block TEXT := $target$
  INSERT INTO tmp_global_pending_matches (
    order_index,
    match_id,
    original_scheduled_date,
    sport_id,
    naipe,
    division,
    home_team_id,
    away_team_id,
    duration_minutes,
    created_at,
    is_knockout,
    preferred_knockout_court_group_id
  )
$target$;
  source_pending_select_block TEXT := $source$
    GREATEST(championship_sports_table.default_match_duration_minutes, 1),
    matches_table.created_at,
    CASE
      WHEN bracket_matches_table.id IS NULL
        OR bracket_matches_table.group_id IS NOT NULL THEN NULL
      ELSE public.resolve_bracket_knockout_priority_court_group_id(
        _bracket_edition_id,
        matches_table.sport_id,
        public.resolve_bracket_knockout_match_phase(
          bracket_matches_table.round_number,
          COALESCE(competition_rounds_table.total_round_number, bracket_matches_table.round_number),
          bracket_matches_table.is_third_place
        ),
        public.resolve_bracket_knockout_division_scope(matches_table.division)
      )
    END AS preferred_knockout_court_group_id
$source$;
  target_pending_select_block TEXT := $target$
    GREATEST(championship_sports_table.default_match_duration_minutes, 1),
    matches_table.created_at,
    (
      bracket_matches_table.id IS NOT NULL
      AND bracket_matches_table.group_id IS NULL
    ) AS is_knockout,
    CASE
      WHEN bracket_matches_table.id IS NULL
        OR bracket_matches_table.group_id IS NOT NULL THEN NULL
      ELSE public.resolve_bracket_knockout_priority_court_group_id(
        _bracket_edition_id,
        matches_table.sport_id,
        public.resolve_bracket_knockout_match_phase(
          bracket_matches_table.round_number,
          COALESCE(competition_rounds_table.total_round_number, bracket_matches_table.round_number),
          bracket_matches_table.is_third_place
        ),
        public.resolve_bracket_knockout_division_scope(matches_table.division)
      )
    END AS preferred_knockout_court_group_id
$target$;
  source_same_court_same_naipe_block TEXT := $source$
      SELECT EXISTS (
        SELECT 1
        FROM tmp_global_assignments AS existing_assignments_table
        WHERE existing_assignments_table.new_scheduled_date = slot_record.event_date
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
  target_same_court_same_naipe_block TEXT := $target$
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
$target$;
  source_same_court_different_naipe_block TEXT := $source$
      SELECT EXISTS (
        SELECT 1
        FROM tmp_global_assignments AS existing_assignments_table
        WHERE existing_assignments_table.new_scheduled_date = slot_record.event_date
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
  target_same_court_different_naipe_block TEXT := $target$
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
$target$;
  source_cross_court_same_naipe_block TEXT := $source$
      SELECT EXISTS (
        SELECT 1
        FROM tmp_global_assignments AS existing_assignments_table
        WHERE existing_assignments_table.new_scheduled_date = slot_record.event_date
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
  target_cross_court_same_naipe_block TEXT := $target$
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
$target$;
  source_cross_court_different_naipe_block TEXT := $source$
      SELECT EXISTS (
        SELECT 1
        FROM tmp_global_assignments AS existing_assignments_table
        WHERE existing_assignments_table.new_scheduled_date = slot_record.event_date
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
  target_cross_court_different_naipe_block TEXT := $target$
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
$target$;
BEGIN
  IF function_signature IS NULL THEN
    RAISE EXCEPTION 'Função public.redistribute_bracket_scheduled_matches(uuid) não encontrada.';
  END IF;

  SELECT pg_get_functiondef(function_signature)
  INTO function_definition;

  updated_definition := function_definition;

  replace_cursor := updated_definition;
  updated_definition := replace(updated_definition, source_pending_table_block, target_pending_table_block);
  IF updated_definition = replace_cursor THEN
    RAISE EXCEPTION 'Não foi possível adicionar is_knockout em tmp_global_pending_matches.';
  END IF;

  replace_cursor := updated_definition;
  updated_definition := replace(updated_definition, source_pending_insert_block, target_pending_insert_block);
  IF updated_definition = replace_cursor THEN
    RAISE EXCEPTION 'Não foi possível incluir is_knockout no INSERT de tmp_global_pending_matches.';
  END IF;

  replace_cursor := updated_definition;
  updated_definition := replace(updated_definition, source_pending_select_block, target_pending_select_block);
  IF updated_definition = replace_cursor THEN
    RAISE EXCEPTION 'Não foi possível marcar pendências de mata-mata na redistribuição.';
  END IF;

  replace_cursor := updated_definition;
  updated_definition := replace(updated_definition, source_same_court_same_naipe_block, target_same_court_same_naipe_block);
  IF updated_definition = replace_cursor THEN
    RAISE EXCEPTION 'Não foi possível ignorar descanso de mesmo naipe na mesma quadra para mata-mata.';
  END IF;

  replace_cursor := updated_definition;
  updated_definition := replace(updated_definition, source_same_court_different_naipe_block, target_same_court_different_naipe_block);
  IF updated_definition = replace_cursor THEN
    RAISE EXCEPTION 'Não foi possível ignorar descanso entre naipes diferentes na mesma quadra para mata-mata.';
  END IF;

  replace_cursor := updated_definition;
  updated_definition := replace(updated_definition, source_cross_court_same_naipe_block, target_cross_court_same_naipe_block);
  IF updated_definition = replace_cursor THEN
    RAISE EXCEPTION 'Não foi possível ignorar descanso de mesmo naipe em quadras diferentes para mata-mata.';
  END IF;

  replace_cursor := updated_definition;
  updated_definition := replace(updated_definition, source_cross_court_different_naipe_block, target_cross_court_different_naipe_block);
  IF updated_definition = replace_cursor THEN
    RAISE EXCEPTION 'Não foi possível ignorar descanso entre naipes diferentes em quadras diferentes para mata-mata.';
  END IF;

  IF updated_definition = function_definition THEN
    RAISE EXCEPTION 'Não foi possível adaptar public.redistribute_bracket_scheduled_matches(uuid) para ignorar descanso no mata-mata.';
  END IF;

  EXECUTE updated_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
