CREATE OR REPLACE FUNCTION public.list_operational_knockout_schedule_adjustment_candidates(
  _source_bracket_match_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_item RECORD;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para ajustar a programação.';
  END IF;

  SELECT
    bracket_matches_table.id,
    bracket_matches_table.bracket_edition_id,
    reservations_table.bracket_day_id,
    reservations_table.location_group_id,
    reservations_table.court_group_id,
    reservations_table.bracket_court_id,
    reservations_table.scheduled_date,
    reservations_table.start_at,
    reservations_table.location_name,
    reservations_table.court_name,
    championships_table.status,
    editions_table.reprogramming_revision
  INTO source_item
  FROM public.championship_bracket_matches AS bracket_matches_table
  JOIN public.championship_bracket_knockout_schedule_reservations AS reservations_table
    ON reservations_table.bracket_edition_id = bracket_matches_table.bracket_edition_id
    AND reservations_table.competition_id = bracket_matches_table.competition_id
    AND reservations_table.round_number = bracket_matches_table.round_number
    AND reservations_table.slot_number = bracket_matches_table.slot_number
    AND reservations_table.is_third_place = bracket_matches_table.is_third_place
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = bracket_matches_table.bracket_edition_id
  JOIN public.championships AS championships_table
    ON championships_table.id = editions_table.championship_id
  LEFT JOIN public.matches AS matches_table
    ON matches_table.id = bracket_matches_table.match_id
  WHERE bracket_matches_table.id = _source_bracket_match_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_bye IS NOT TRUE
    AND reservations_table.start_at > now()
    AND (
      bracket_matches_table.match_id IS NULL
      OR matches_table.status = 'SCHEDULED'::public.match_status
    );

  IF source_item.id IS NULL THEN
    RAISE EXCEPTION 'O jogo selecionado não está disponível para ajuste operacional.';
  END IF;

  IF source_item.status NOT IN (
    'REVIEW'::public.championship_status,
    'IN_PROGRESS'::public.championship_status
  ) THEN
    RAISE EXCEPTION 'A programação só pode ser ajustada em revisão ou durante o campeonato.';
  END IF;

  RETURN jsonb_build_object(
    'revision', source_item.reprogramming_revision,
    'items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'bracket_match_id', candidate_bracket_matches.id,
          'match_id', candidate_bracket_matches.match_id,
          'is_placeholder', candidate_bracket_matches.match_id IS NULL,
          'sport_name', sports_table.name,
          'naipe', competitions_table.naipe,
          'division', competitions_table.division,
          'round_number', candidate_bracket_matches.round_number,
          'slot_number', candidate_bracket_matches.slot_number,
          'is_third_place', candidate_bracket_matches.is_third_place,
          'scheduled_date', candidate_reservations.scheduled_date,
          'bracket_court_id', candidate_reservations.bracket_court_id,
          'location', candidate_reservations.location_name,
          'court_name', candidate_reservations.court_name,
          'start_time', candidate_reservations.start_at,
          'end_time', candidate_reservations.end_at,
          'duration_minutes', candidate_reservations.duration_minutes,
          'queue_position', candidate_reservations.queue_position,
          'scheduled_slot', candidate_reservations.scheduled_slot,
          'home_team_name', home_teams_table.name,
          'away_team_name', away_teams_table.name
        )
        ORDER BY candidate_reservations.start_at, candidate_reservations.queue_position
      )
      FROM public.championship_bracket_matches AS candidate_bracket_matches
      JOIN public.championship_bracket_knockout_schedule_reservations AS candidate_reservations
        ON candidate_reservations.bracket_edition_id = candidate_bracket_matches.bracket_edition_id
        AND candidate_reservations.competition_id = candidate_bracket_matches.competition_id
        AND candidate_reservations.round_number = candidate_bracket_matches.round_number
        AND candidate_reservations.slot_number = candidate_bracket_matches.slot_number
        AND candidate_reservations.is_third_place = candidate_bracket_matches.is_third_place
      JOIN public.championship_bracket_competitions AS competitions_table
        ON competitions_table.id = candidate_bracket_matches.competition_id
      JOIN public.sports AS sports_table
        ON sports_table.id = competitions_table.sport_id
      LEFT JOIN public.matches AS candidate_matches_table
        ON candidate_matches_table.id = candidate_bracket_matches.match_id
      LEFT JOIN public.teams AS home_teams_table
        ON home_teams_table.id = candidate_matches_table.home_team_id
      LEFT JOIN public.teams AS away_teams_table
        ON away_teams_table.id = candidate_matches_table.away_team_id
      WHERE candidate_bracket_matches.bracket_edition_id = source_item.bracket_edition_id
        AND candidate_bracket_matches.phase = 'KNOCKOUT'::public.bracket_phase
        AND candidate_bracket_matches.is_bye IS NOT TRUE
        AND candidate_reservations.bracket_day_id = source_item.bracket_day_id
        AND candidate_reservations.scheduled_date = source_item.scheduled_date
        AND candidate_reservations.start_at > now()
        AND (
          candidate_reservations.location_group_id = source_item.location_group_id
          OR (
            candidate_reservations.location_group_id IS NULL
            AND source_item.location_group_id IS NULL
            AND public.normalize_bracket_entity_name(candidate_reservations.location_name) = public.normalize_bracket_entity_name(source_item.location_name)
          )
        )
        AND (
          candidate_reservations.court_group_id = source_item.court_group_id
          OR (
            candidate_reservations.court_group_id IS NULL
            AND source_item.court_group_id IS NULL
            AND public.normalize_bracket_entity_name(candidate_reservations.court_name) = public.normalize_bracket_entity_name(source_item.court_name)
          )
        )
        AND (
          candidate_bracket_matches.match_id IS NULL
          OR candidate_matches_table.status = 'SCHEDULED'::public.match_status
        )
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_operational_knockout_schedule_adjustment(
  _bracket_edition_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_bracket_match_ids UUID[];
  source_item RECORD;
  day_record RECORD;
  edition_record RECORD;
  break_action TEXT;
  break_id_value TEXT;
  break_scope_type public.bracket_day_break_scope_type;
  break_start_time_value TIME;
  break_end_time_value TIME;
  duration_minutes_value INTEGER;
  cursor_at TIMESTAMPTZ;
  candidate_start_at TIMESTAMPTZ;
  candidate_end_at TIMESTAMPTZ;
  item_record RECORD;
  break_record RECORD;
  blockers JSONB := '[]'::jsonb;
  timeline JSONB := '[]'::jsonb;
  break_preview JSONB;
  proposed_day_end_at TIMESTAMPTZ;
  current_day_end_at TIMESTAMPTZ;
  rest_conflict_message TEXT;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para ajustar a programação.';
  END IF;

  SELECT COALESCE(array_agg(value::UUID), ARRAY[]::UUID[])
  INTO selected_bracket_match_ids
  FROM jsonb_array_elements_text(COALESCE(_payload->'bracket_match_ids', '[]'::jsonb)) AS value;

  duration_minutes_value := NULLIF(_payload->>'duration_minutes', '')::INTEGER;
  break_action := upper(trim(COALESCE(_payload->'break'->>'action', 'KEEP')));
  break_id_value := NULLIF(trim(COALESCE(_payload->'break'->>'id', '')), '');
  break_scope_type := CASE upper(trim(COALESCE(_payload->'break'->>'scope_type', 'ALL_COURTS')))
    WHEN 'COURT' THEN 'COURT'::public.bracket_day_break_scope_type
    ELSE 'ALL_COURTS'::public.bracket_day_break_scope_type
  END;
  break_start_time_value := NULLIF(_payload->'break'->>'start_time', '')::TIME;
  break_end_time_value := NULLIF(_payload->'break'->>'end_time', '')::TIME;

  IF cardinality(selected_bracket_match_ids) = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos um slot ou jogo eliminatório.';
  END IF;

  IF cardinality(selected_bracket_match_ids) <> (
    SELECT count(DISTINCT bracket_match_id)
    FROM unnest(selected_bracket_match_ids) AS bracket_match_id
  ) THEN
    RAISE EXCEPTION 'A seleção de programação contém itens repetidos.';
  END IF;

  IF duration_minutes_value IS NULL OR duration_minutes_value < 1 THEN
    RAISE EXCEPTION 'Informe uma duração válida em minutos.';
  END IF;

  IF break_action NOT IN ('KEEP', 'REMOVE', 'UPSERT') THEN
    RAISE EXCEPTION 'Informe uma ação válida para o intervalo.';
  END IF;

  IF break_action = 'UPSERT' AND (
    break_start_time_value IS NULL
    OR break_end_time_value IS NULL
    OR break_end_time_value <= break_start_time_value
  ) THEN
    RAISE EXCEPTION 'Informe início e fim válidos para o intervalo.';
  END IF;

  SELECT
    editions_table.id,
    editions_table.championship_id,
    editions_table.season_year,
    editions_table.reprogramming_revision,
    championships_table.status
  INTO edition_record
  FROM public.championship_bracket_editions AS editions_table
  JOIN public.championships AS championships_table
    ON championships_table.id = editions_table.championship_id
  WHERE editions_table.id = _bracket_edition_id;

  IF edition_record.id IS NULL THEN
    RAISE EXCEPTION 'Edição de chaveamento inválida.';
  END IF;

  IF edition_record.status NOT IN (
    'REVIEW'::public.championship_status,
    'IN_PROGRESS'::public.championship_status
  ) THEN
    RAISE EXCEPTION 'A programação só pode ser ajustada em revisão ou durante o campeonato.';
  END IF;

  SELECT
    bracket_matches_table.id,
    reservations_table.bracket_day_id,
    reservations_table.location_group_id,
    reservations_table.court_group_id,
    reservations_table.bracket_court_id,
    reservations_table.scheduled_date,
    reservations_table.location_name,
    reservations_table.court_name
  INTO source_item
  FROM public.championship_bracket_matches AS bracket_matches_table
  JOIN public.championship_bracket_knockout_schedule_reservations AS reservations_table
    ON reservations_table.bracket_edition_id = bracket_matches_table.bracket_edition_id
    AND reservations_table.competition_id = bracket_matches_table.competition_id
    AND reservations_table.round_number = bracket_matches_table.round_number
    AND reservations_table.slot_number = bracket_matches_table.slot_number
    AND reservations_table.is_third_place = bracket_matches_table.is_third_place
  LEFT JOIN public.matches AS matches_table
    ON matches_table.id = bracket_matches_table.match_id
  WHERE bracket_matches_table.id = selected_bracket_match_ids[1]
    AND bracket_matches_table.bracket_edition_id = _bracket_edition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_bye IS NOT TRUE
    AND reservations_table.start_at > now()
    AND (
      bracket_matches_table.match_id IS NULL
      OR matches_table.status = 'SCHEDULED'::public.match_status
    );

  IF source_item.id IS NULL THEN
    RAISE EXCEPTION 'O item inicial não está disponível para ajuste operacional.';
  END IF;

  IF (
    SELECT count(*)
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.championship_bracket_knockout_schedule_reservations AS reservations_table
      ON reservations_table.bracket_edition_id = bracket_matches_table.bracket_edition_id
      AND reservations_table.competition_id = bracket_matches_table.competition_id
      AND reservations_table.round_number = bracket_matches_table.round_number
      AND reservations_table.slot_number = bracket_matches_table.slot_number
      AND reservations_table.is_third_place = bracket_matches_table.is_third_place
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.id = ANY(selected_bracket_match_ids)
      AND bracket_matches_table.bracket_edition_id = _bracket_edition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_bye IS NOT TRUE
      AND reservations_table.bracket_day_id = source_item.bracket_day_id
      AND reservations_table.scheduled_date = source_item.scheduled_date
      AND (
        reservations_table.location_group_id = source_item.location_group_id
        OR (
          reservations_table.location_group_id IS NULL
          AND source_item.location_group_id IS NULL
          AND public.normalize_bracket_entity_name(reservations_table.location_name) = public.normalize_bracket_entity_name(source_item.location_name)
        )
      )
      AND (
        reservations_table.court_group_id = source_item.court_group_id
        OR (
          reservations_table.court_group_id IS NULL
          AND source_item.court_group_id IS NULL
          AND public.normalize_bracket_entity_name(reservations_table.court_name) = public.normalize_bracket_entity_name(source_item.court_name)
        )
      )
      AND reservations_table.start_at > now()
      AND (
        bracket_matches_table.match_id IS NULL
        OR matches_table.status = 'SCHEDULED'::public.match_status
      )
  ) <> cardinality(selected_bracket_match_ids) THEN
    RAISE EXCEPTION 'Todos os itens devem ser eliminatórios, futuros e da mesma data e quadra.';
  END IF;

  SELECT * INTO day_record
  FROM public.championship_bracket_days
  WHERE id = source_item.bracket_day_id
    AND bracket_edition_id = _bracket_edition_id;

  IF day_record.id IS NULL THEN
    RAISE EXCEPTION 'O dia programado não foi localizado.';
  END IF;

  CREATE TEMP TABLE operational_knockout_schedule_breaks (
    id TEXT PRIMARY KEY,
    scope_type public.bracket_day_break_scope_type NOT NULL,
    bracket_court_id UUID NULL,
    break_start_time TIME NOT NULL,
    break_end_time TIME NOT NULL,
    is_legacy BOOLEAN NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO operational_knockout_schedule_breaks (
    id,
    scope_type,
    bracket_court_id,
    break_start_time,
    break_end_time,
    is_legacy
  )
  SELECT
    day_breaks_table.id::TEXT,
    day_breaks_table.scope_type,
    day_breaks_table.bracket_court_id,
    day_breaks_table.break_start_time,
    day_breaks_table.break_end_time,
    false
  FROM public.championship_bracket_day_breaks AS day_breaks_table
  WHERE day_breaks_table.bracket_day_id = day_record.id;

  IF day_record.break_start_time IS NOT NULL
    AND day_record.break_end_time IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM operational_knockout_schedule_breaks
      WHERE scope_type = 'ALL_COURTS'::public.bracket_day_break_scope_type
    )
  THEN
    INSERT INTO operational_knockout_schedule_breaks (
      id,
      scope_type,
      bracket_court_id,
      break_start_time,
      break_end_time,
      is_legacy
    ) VALUES (
      concat('legacy:', day_record.id),
      'ALL_COURTS'::public.bracket_day_break_scope_type,
      NULL,
      day_record.break_start_time,
      day_record.break_end_time,
      true
    );
  END IF;

  IF break_action = 'REMOVE' THEN
    DELETE FROM operational_knockout_schedule_breaks
    WHERE id = break_id_value;
  ELSIF break_action = 'UPSERT' THEN
    DELETE FROM operational_knockout_schedule_breaks
    WHERE id = break_id_value;

    INSERT INTO operational_knockout_schedule_breaks (
      id,
      scope_type,
      bracket_court_id,
      break_start_time,
      break_end_time,
      is_legacy
    ) VALUES (
      COALESCE(break_id_value, 'new-break'),
      break_scope_type,
      CASE WHEN break_scope_type = 'COURT' THEN source_item.bracket_court_id ELSE NULL END,
      break_start_time_value,
      break_end_time_value,
      false
    );
  END IF;

  CREATE TEMP TABLE operational_knockout_schedule_items (
    bracket_match_id UUID PRIMARY KEY,
    reservation_id UUID NOT NULL,
    match_id UUID NULL,
    home_team_id UUID NULL,
    away_team_id UUID NULL,
    naipe public.match_naipe NOT NULL,
    sport_id UUID NOT NULL,
    scheduled_date DATE NOT NULL,
    location_name TEXT NOT NULL,
    court_name TEXT NOT NULL,
    location_group_id UUID NULL,
    court_group_id UUID NULL,
    queue_position INTEGER NOT NULL,
    scheduled_slot INTEGER NOT NULL,
    original_start_at TIMESTAMPTZ NOT NULL,
    original_end_at TIMESTAMPTZ NOT NULL,
    original_duration_minutes INTEGER NOT NULL,
    duration_minutes INTEGER NOT NULL,
    planned_start_at TIMESTAMPTZ NULL,
    planned_end_at TIMESTAMPTZ NULL,
    is_selected BOOLEAN NOT NULL,
    is_placeholder BOOLEAN NOT NULL,
    manual_representation_mode TEXT NULL
  ) ON COMMIT DROP;

  INSERT INTO operational_knockout_schedule_items (
    bracket_match_id,
    reservation_id,
    match_id,
    home_team_id,
    away_team_id,
    naipe,
    sport_id,
    scheduled_date,
    location_name,
    court_name,
    location_group_id,
    court_group_id,
    queue_position,
    scheduled_slot,
    original_start_at,
    original_end_at,
    original_duration_minutes,
    duration_minutes,
    is_selected,
    is_placeholder,
    manual_representation_mode
  )
  SELECT
    bracket_matches_table.id,
    reservations_table.id,
    bracket_matches_table.match_id,
    matches_table.home_team_id,
    matches_table.away_team_id,
    competitions_table.naipe,
    competitions_table.sport_id,
    reservations_table.scheduled_date,
    reservations_table.location_name,
    reservations_table.court_name,
    reservations_table.location_group_id,
    reservations_table.court_group_id,
    reservations_table.queue_position,
    reservations_table.scheduled_slot,
    reservations_table.start_at,
    reservations_table.end_at,
    reservations_table.duration_minutes,
    reservations_table.duration_minutes,
    bracket_matches_table.id = ANY(selected_bracket_match_ids),
    bracket_matches_table.match_id IS NULL,
    matches_table.manual_representation_mode
  FROM public.championship_bracket_matches AS bracket_matches_table
  JOIN public.championship_bracket_knockout_schedule_reservations AS reservations_table
    ON reservations_table.bracket_edition_id = bracket_matches_table.bracket_edition_id
    AND reservations_table.competition_id = bracket_matches_table.competition_id
    AND reservations_table.round_number = bracket_matches_table.round_number
    AND reservations_table.slot_number = bracket_matches_table.slot_number
    AND reservations_table.is_third_place = bracket_matches_table.is_third_place
  JOIN public.championship_bracket_competitions AS competitions_table
    ON competitions_table.id = bracket_matches_table.competition_id
  LEFT JOIN public.matches AS matches_table
    ON matches_table.id = bracket_matches_table.match_id
  WHERE bracket_matches_table.bracket_edition_id = _bracket_edition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_bye IS NOT TRUE
    AND reservations_table.bracket_day_id = source_item.bracket_day_id
    AND reservations_table.scheduled_date = source_item.scheduled_date
    AND (
      reservations_table.location_group_id = source_item.location_group_id
      OR (
        reservations_table.location_group_id IS NULL
        AND source_item.location_group_id IS NULL
        AND public.normalize_bracket_entity_name(reservations_table.location_name) = public.normalize_bracket_entity_name(source_item.location_name)
      )
    )
    AND (
      reservations_table.court_group_id = source_item.court_group_id
      OR (
        reservations_table.court_group_id IS NULL
        AND source_item.court_group_id IS NULL
        AND public.normalize_bracket_entity_name(reservations_table.court_name) = public.normalize_bracket_entity_name(source_item.court_name)
      )
    )
    AND reservations_table.start_at > now()
    AND (
      bracket_matches_table.match_id IS NULL
      OR matches_table.status = 'SCHEDULED'::public.match_status
    );

  UPDATE operational_knockout_schedule_items
  SET duration_minutes = duration_minutes_value
  WHERE is_selected;

  cursor_at := public.combine_bracket_schedule_timestamp(
    day_record.event_date,
    day_record.start_time
  );

  FOR item_record IN
    SELECT *
    FROM operational_knockout_schedule_items
    ORDER BY original_start_at, queue_position, scheduled_slot, bracket_match_id
  LOOP
    candidate_start_at := cursor_at;

    FOR break_record IN
      SELECT *
      FROM operational_knockout_schedule_breaks
      WHERE scope_type = 'ALL_COURTS'::public.bracket_day_break_scope_type
        OR bracket_court_id = source_item.bracket_court_id
      ORDER BY break_start_time
    LOOP
      IF candidate_start_at < public.combine_bracket_schedule_timestamp(day_record.event_date, break_record.break_end_time)
        AND candidate_start_at + make_interval(mins => item_record.duration_minutes) > public.combine_bracket_schedule_timestamp(day_record.event_date, break_record.break_start_time)
      THEN
        candidate_start_at := public.combine_bracket_schedule_timestamp(
          day_record.event_date,
          break_record.break_end_time
        );
      END IF;
    END LOOP;

    candidate_end_at := candidate_start_at + make_interval(mins => item_record.duration_minutes);

    UPDATE operational_knockout_schedule_items
    SET
      planned_start_at = candidate_start_at,
      planned_end_at = candidate_end_at
    WHERE bracket_match_id = item_record.bracket_match_id;

    cursor_at := candidate_end_at;
  END LOOP;

  SELECT public.combine_bracket_schedule_timestamp(day_record.event_date, day_record.end_time)
  INTO current_day_end_at;

  SELECT max(planned_end_at)
  INTO proposed_day_end_at
  FROM operational_knockout_schedule_items;

  FOR item_record IN
    SELECT *
    FROM operational_knockout_schedule_items
    WHERE match_id IS NOT NULL
  LOOP
    rest_conflict_message := public.resolve_scheduled_match_rest_gap_conflict(
      edition_record.championship_id,
      edition_record.season_year,
      item_record.scheduled_date,
      item_record.location_name,
      item_record.court_name,
      item_record.planned_start_at,
      item_record.scheduled_slot,
      item_record.queue_position,
      (SELECT created_at FROM public.matches WHERE id = item_record.match_id),
      item_record.match_id,
      item_record.sport_id,
      item_record.naipe,
      item_record.home_team_id,
      item_record.away_team_id,
      item_record.duration_minutes
    );

    IF rest_conflict_message IS NOT NULL THEN
      blockers := blockers || jsonb_build_array(rest_conflict_message);
    END IF;
  END LOOP;

  IF EXISTS (
    WITH ordered_items AS (
      SELECT
        operational_items.*,
        lag(home_team_id) OVER item_order AS previous_home_team_id,
        lag(away_team_id) OVER item_order AS previous_away_team_id,
        lead(home_team_id) OVER item_order AS next_home_team_id,
        lead(away_team_id) OVER item_order AS next_away_team_id
      FROM operational_knockout_schedule_items AS operational_items
      WHERE match_id IS NOT NULL
      WINDOW item_order AS (
        ORDER BY planned_start_at, queue_position, scheduled_slot, bracket_match_id
      )
    )
    SELECT 1
    FROM ordered_items
    WHERE COALESCE(manual_representation_mode, 'AUTO') != 'CO'
      AND (
        previous_home_team_id IN (home_team_id, away_team_id)
        OR previous_away_team_id IN (home_team_id, away_team_id)
        OR next_home_team_id IN (home_team_id, away_team_id)
        OR next_away_team_id IN (home_team_id, away_team_id)
      )
  ) THEN
    blockers := blockers || jsonb_build_array('A sequência planejada cria conflito de representação na mesma quadra.');
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'bracket_match_id', bracket_match_id,
      'match_id', match_id,
      'is_placeholder', is_placeholder,
      'is_selected', is_selected,
      'scheduled_date', scheduled_date,
      'location', location_name,
      'court_name', court_name,
      'queue_position', queue_position,
      'scheduled_slot', scheduled_slot,
      'original_start_time', original_start_at,
      'original_end_time', original_end_at,
      'original_duration_minutes', original_duration_minutes,
      'start_time', planned_start_at,
      'end_time', planned_end_at,
      'duration_minutes', duration_minutes,
      'is_displaced', original_start_at IS DISTINCT FROM planned_start_at
        OR original_end_at IS DISTINCT FROM planned_end_at
    )
    ORDER BY planned_start_at, queue_position, scheduled_slot, bracket_match_id
  ), '[]'::jsonb)
  INTO timeline
  FROM operational_knockout_schedule_items;

  SELECT jsonb_build_object(
    'action', break_action,
    'before', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'scope_type', scope_type,
        'start_time', break_start_time,
        'end_time', break_end_time,
        'is_legacy', is_legacy
      ) ORDER BY break_start_time)
      FROM (
        SELECT
          day_breaks_table.id::TEXT AS id,
          day_breaks_table.scope_type,
          day_breaks_table.break_start_time,
          day_breaks_table.break_end_time,
          false AS is_legacy
        FROM public.championship_bracket_day_breaks AS day_breaks_table
        WHERE day_breaks_table.bracket_day_id = day_record.id
        UNION ALL
        SELECT
          concat('legacy:', day_record.id),
          'ALL_COURTS'::public.bracket_day_break_scope_type,
          day_record.break_start_time,
          day_record.break_end_time,
          true
        WHERE day_record.break_start_time IS NOT NULL
          AND day_record.break_end_time IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM public.championship_bracket_day_breaks AS day_breaks_table
            WHERE day_breaks_table.bracket_day_id = day_record.id
              AND day_breaks_table.scope_type = 'ALL_COURTS'::public.bracket_day_break_scope_type
          )
      ) AS original_breaks
    ), '[]'::jsonb),
    'after', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'scope_type', scope_type,
        'start_time', break_start_time,
        'end_time', break_end_time,
        'is_legacy', is_legacy
      ) ORDER BY break_start_time)
      FROM operational_knockout_schedule_breaks
    ), '[]'::jsonb)
  ) INTO break_preview;

  RETURN jsonb_build_object(
    'revision', edition_record.reprogramming_revision,
    'timeline', timeline,
    'blockers', blockers,
    'break', break_preview,
    'day_end_before', current_day_end_at,
    'day_end_after', GREATEST(current_day_end_at, proposed_day_end_at),
    'extends_day_end', proposed_day_end_at > current_day_end_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_operational_knockout_schedule_adjustment(
  _bracket_edition_id UUID,
  _payload JSONB,
  _expected_revision BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  edition_record RECORD;
  preview JSONB;
  timeline_item JSONB;
  break_action TEXT;
  break_id_value TEXT;
  break_scope_type public.bracket_day_break_scope_type;
  break_start_time_value TIME;
  break_end_time_value TIME;
  day_record RECORD;
  target_court_id UUID;
  original_timeline JSONB;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para ajustar a programação.';
  END IF;

  SELECT * INTO edition_record
  FROM public.championship_bracket_editions
  WHERE id = _bracket_edition_id
  FOR UPDATE;

  IF edition_record.id IS NULL THEN
    RAISE EXCEPTION 'Edição de chaveamento inválida.';
  END IF;

  IF edition_record.reprogramming_revision <> _expected_revision THEN
    RAISE EXCEPTION 'A programação foi alterada por outro usuário. Gere uma nova prévia.';
  END IF;

  PERFORM 1
  FROM public.championship_bracket_matches AS bracket_matches_table
  JOIN public.championship_bracket_knockout_schedule_reservations AS reservations_table
    ON reservations_table.bracket_edition_id = bracket_matches_table.bracket_edition_id
    AND reservations_table.competition_id = bracket_matches_table.competition_id
    AND reservations_table.round_number = bracket_matches_table.round_number
    AND reservations_table.slot_number = bracket_matches_table.slot_number
    AND reservations_table.is_third_place = bracket_matches_table.is_third_place
  WHERE bracket_matches_table.id IN (
    SELECT value::UUID
    FROM jsonb_array_elements_text(COALESCE(_payload->'bracket_match_ids', '[]'::jsonb)) AS value
  )
  FOR UPDATE OF bracket_matches_table, reservations_table;

  preview := public.preview_operational_knockout_schedule_adjustment(
    _bracket_edition_id,
    _payload
  );

  IF jsonb_array_length(COALESCE(preview->'blockers', '[]'::jsonb)) > 0 THEN
    RAISE EXCEPTION 'A prévia contém conflitos e não pode ser confirmada.';
  END IF;

  IF COALESCE((preview->>'extends_day_end')::BOOLEAN, false)
    AND COALESCE((_payload->>'accept_day_end_extension')::BOOLEAN, false) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Confirme a ampliação do horário final do dia para salvar a programação.';
  END IF;

  SELECT * INTO day_record
  FROM public.championship_bracket_days
  WHERE bracket_edition_id = _bracket_edition_id
    AND event_date = ((preview->'timeline'->0->>'scheduled_date')::DATE)
  FOR UPDATE;

  SELECT reservations_table.bracket_court_id
  INTO target_court_id
  FROM public.championship_bracket_matches AS bracket_matches_table
  JOIN public.championship_bracket_knockout_schedule_reservations AS reservations_table
    ON reservations_table.bracket_edition_id = bracket_matches_table.bracket_edition_id
    AND reservations_table.competition_id = bracket_matches_table.competition_id
    AND reservations_table.round_number = bracket_matches_table.round_number
    AND reservations_table.slot_number = bracket_matches_table.slot_number
    AND reservations_table.is_third_place = bracket_matches_table.is_third_place
  WHERE bracket_matches_table.id = ((_payload->'bracket_match_ids'->>0)::UUID);

  FOR timeline_item IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(preview->'timeline', '[]'::jsonb))
  LOOP
    PERFORM 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.championship_bracket_knockout_schedule_reservations AS reservations_table
      ON reservations_table.bracket_edition_id = bracket_matches_table.bracket_edition_id
      AND reservations_table.competition_id = bracket_matches_table.competition_id
      AND reservations_table.round_number = bracket_matches_table.round_number
      AND reservations_table.slot_number = bracket_matches_table.slot_number
      AND reservations_table.is_third_place = bracket_matches_table.is_third_place
    WHERE bracket_matches_table.id = (timeline_item->>'bracket_match_id')::UUID
    FOR UPDATE OF bracket_matches_table, reservations_table;
  END LOOP;

  preview := public.preview_operational_knockout_schedule_adjustment(
    _bracket_edition_id,
    _payload
  );

  IF jsonb_array_length(COALESCE(preview->'blockers', '[]'::jsonb)) > 0 THEN
    RAISE EXCEPTION 'A programação mudou durante a validação e agora possui conflitos.';
  END IF;

  PERFORM set_config('app.skip_queue_trigger', 'true', true);
  PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);

  FOR timeline_item IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(preview->'timeline', '[]'::jsonb))
  LOOP
    UPDATE public.championship_bracket_knockout_schedule_reservations AS reservations_table
    SET
      start_at = (timeline_item->>'start_time')::TIMESTAMPTZ,
      end_at = (timeline_item->>'end_time')::TIMESTAMPTZ,
      duration_minutes = (timeline_item->>'duration_minutes')::INTEGER,
      queue_position = (timeline_item->>'queue_position')::INTEGER,
      scheduled_slot = (timeline_item->>'scheduled_slot')::INTEGER
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.id = (timeline_item->>'bracket_match_id')::UUID
      AND reservations_table.bracket_edition_id = bracket_matches_table.bracket_edition_id
      AND reservations_table.competition_id = bracket_matches_table.competition_id
      AND reservations_table.round_number = bracket_matches_table.round_number
      AND reservations_table.slot_number = bracket_matches_table.slot_number
      AND reservations_table.is_third_place = bracket_matches_table.is_third_place;

    UPDATE public.championship_bracket_matches AS target_bracket_matches
    SET
      planned_scheduled_date = (timeline_item->>'scheduled_date')::DATE,
      planned_start_time = ((timeline_item->>'start_time')::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')::TIME,
      planned_end_time = ((timeline_item->>'end_time')::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')::TIME,
      planned_queue_position = (timeline_item->>'queue_position')::INTEGER,
      planned_scheduled_slot = (timeline_item->>'scheduled_slot')::INTEGER,
      planned_location_group_id = reservations_table.location_group_id,
      planned_court_group_id = reservations_table.court_group_id,
      planned_location_name = reservations_table.location_name,
      planned_court_name = reservations_table.court_name
    FROM public.championship_bracket_knockout_schedule_reservations AS reservations_table
    JOIN public.championship_bracket_matches AS reservation_bracket_matches_table
      ON reservation_bracket_matches_table.bracket_edition_id = reservations_table.bracket_edition_id
      AND reservation_bracket_matches_table.competition_id = reservations_table.competition_id
      AND reservation_bracket_matches_table.round_number = reservations_table.round_number
      AND reservation_bracket_matches_table.slot_number = reservations_table.slot_number
      AND reservation_bracket_matches_table.is_third_place = reservations_table.is_third_place
    WHERE target_bracket_matches.id = (timeline_item->>'bracket_match_id')::UUID
      AND reservation_bracket_matches_table.id = target_bracket_matches.id;

    UPDATE public.matches
    SET
      scheduled_date = (timeline_item->>'scheduled_date')::DATE,
      start_time = (timeline_item->>'start_time')::TIMESTAMPTZ,
      end_time = (timeline_item->>'end_time')::TIMESTAMPTZ,
      queue_position = (timeline_item->>'queue_position')::INTEGER,
      scheduled_slot = (timeline_item->>'scheduled_slot')::INTEGER
    WHERE id = NULLIF(timeline_item->>'match_id', '')::UUID
      AND status = 'SCHEDULED'::public.match_status;
  END LOOP;

  break_action := upper(trim(COALESCE(_payload->'break'->>'action', 'KEEP')));
  break_id_value := NULLIF(trim(COALESCE(_payload->'break'->>'id', '')), '');
  break_scope_type := CASE upper(trim(COALESCE(_payload->'break'->>'scope_type', 'ALL_COURTS')))
    WHEN 'COURT' THEN 'COURT'::public.bracket_day_break_scope_type
    ELSE 'ALL_COURTS'::public.bracket_day_break_scope_type
  END;
  break_start_time_value := NULLIF(_payload->'break'->>'start_time', '')::TIME;
  break_end_time_value := NULLIF(_payload->'break'->>'end_time', '')::TIME;

  IF break_action IN ('REMOVE', 'UPSERT') AND break_id_value LIKE 'legacy:%' THEN
    UPDATE public.championship_bracket_days
    SET break_start_time = NULL, break_end_time = NULL
    WHERE id = day_record.id;
  END IF;

  IF break_action = 'REMOVE' AND break_id_value IS NOT NULL AND break_id_value NOT LIKE 'legacy:%' THEN
    DELETE FROM public.championship_bracket_day_breaks
    WHERE id = break_id_value::UUID
      AND bracket_day_id = day_record.id;
  ELSIF break_action = 'UPSERT' THEN
    IF break_id_value IS NOT NULL AND break_id_value NOT LIKE 'legacy:%' THEN
      UPDATE public.championship_bracket_day_breaks
      SET
        scope_type = break_scope_type,
        break_start_time = break_start_time_value,
        break_end_time = break_end_time_value,
        bracket_court_id = CASE WHEN break_scope_type = 'COURT' THEN target_court_id ELSE NULL END
      WHERE id = break_id_value::UUID
        AND bracket_day_id = day_record.id;
    ELSE
      INSERT INTO public.championship_bracket_day_breaks (
        bracket_day_id,
        scope_type,
        break_start_time,
        break_end_time,
        position,
        bracket_court_id
      ) VALUES (
        day_record.id,
        break_scope_type,
        break_start_time_value,
        break_end_time_value,
        COALESCE((
          SELECT max(position) + 1
          FROM public.championship_bracket_day_breaks
          WHERE bracket_day_id = day_record.id
        ), 1),
        CASE WHEN break_scope_type = 'COURT' THEN target_court_id ELSE NULL END
      );
    END IF;
  END IF;

  IF (preview->>'extends_day_end')::BOOLEAN THEN
    UPDATE public.championship_bracket_days
    SET end_time = ((preview->>'day_end_after')::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')::TIME
    WHERE id = day_record.id;
  END IF;

  PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
  PERFORM set_config('app.skip_queue_trigger', 'false', true);

  UPDATE public.championship_bracket_editions
  SET reprogramming_revision = reprogramming_revision + 1
  WHERE id = _bracket_edition_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'bracket_match_id', timeline_json.value->>'bracket_match_id',
      'match_id', timeline_json.value->>'match_id',
      'start_time', timeline_json.value->>'original_start_time',
      'end_time', timeline_json.value->>'original_end_time',
      'duration_minutes', timeline_json.value->>'original_duration_minutes',
      'queue_position', timeline_json.value->>'queue_position',
      'scheduled_slot', timeline_json.value->>'scheduled_slot'
    )
  ), '[]'::JSONB)
  INTO original_timeline
  FROM jsonb_array_elements(COALESCE(preview->'timeline', '[]'::JSONB)) AS timeline_json;

  PERFORM public.write_admin_action_log(
    'UPDATE'::public.admin_action_type,
    'public.championship_bracket_knockout_schedule_reservations',
    _bracket_edition_id::TEXT,
    'Ajustou a programação operacional futura do mata-mata.',
    jsonb_build_object(
      'timeline', original_timeline,
      'break', preview->'break',
      'day_end_before', preview->'day_end_before'
    ),
    jsonb_build_object(
      'timeline', preview->'timeline',
      'break', preview->'break',
      'day_end_after', preview->'day_end_after'
    ),
    jsonb_build_object(
      'championship_id', edition_record.championship_id,
      'season_year', edition_record.season_year,
      'reprogramming_revision', _expected_revision
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
    PERFORM set_config('app.skip_queue_trigger', 'false', true);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.list_operational_knockout_schedule_adjustment_candidates(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_operational_knockout_schedule_adjustment(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_operational_knockout_schedule_adjustment(UUID, JSONB, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_operational_knockout_schedule_adjustment_candidates(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_operational_knockout_schedule_adjustment(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_operational_knockout_schedule_adjustment(UUID, JSONB, BIGINT) TO authenticated;

NOTIFY pgrst, 'reload schema';
