CREATE OR REPLACE FUNCTION public.build_operational_schedule_interval_preview(
  _bracket_edition_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  edition_record RECORD;
  day_record RECORD;
  interval_action TEXT;
  interval_id_value TEXT;
  scope_type_value public.bracket_day_break_scope_type;
  start_time_value TIME;
  end_time_value TIME;
  anchor_time_value TIME;
  requested_court_ids UUID[];
  target_court_ids UUID[];
  interval_record RECORD;
  item_record RECORD;
  break_record RECORD;
  cursor_at TIMESTAMPTZ;
  candidate_start_at TIMESTAMPTZ;
  candidate_end_at TIMESTAMPTZ;
  proposed_day_end_at TIMESTAMPTZ;
  blockers JSONB := '[]'::JSONB;
  timeline JSONB := '[]'::JSONB;
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.has_admin_tab_access('championship_schedule'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para ajustar os intervalos da agenda.';
  END IF;

  interval_action := upper(trim(COALESCE(_payload->>'action', '')));
  interval_id_value := NULLIF(trim(COALESCE(_payload->>'interval_id', '')), '');
  scope_type_value := CASE upper(trim(COALESCE(_payload->>'scope_type', 'ALL_COURTS')))
    WHEN 'COURT' THEN 'COURT'::public.bracket_day_break_scope_type
    ELSE 'ALL_COURTS'::public.bracket_day_break_scope_type
  END;
  start_time_value := NULLIF(trim(COALESCE(_payload->>'start_time', '')), '')::TIME;
  end_time_value := NULLIF(trim(COALESCE(_payload->>'end_time', '')), '')::TIME;

  IF interval_action NOT IN ('UPSERT', 'REMOVE') THEN
    RAISE EXCEPTION 'Informe uma ação válida para o intervalo.';
  END IF;

  IF interval_action = 'UPSERT' AND (
    start_time_value IS NULL
    OR end_time_value IS NULL
    OR end_time_value <= start_time_value
  ) THEN
    RAISE EXCEPTION 'Informe início e fim válidos para o intervalo.';
  END IF;

  SELECT
    editions_table.id,
    editions_table.championship_id,
    editions_table.season_year,
    editions_table.reprogramming_revision,
    editions_table.payload_snapshot,
    championships_table.status
  INTO edition_record
  FROM public.championship_bracket_editions AS editions_table
  JOIN public.championships AS championships_table
    ON championships_table.id = editions_table.championship_id
  WHERE editions_table.id = _bracket_edition_id;

  IF edition_record.id IS NULL
    OR edition_record.status NOT IN (
      'REVIEW'::public.championship_status,
      'IN_PROGRESS'::public.championship_status
    ) THEN
    RAISE EXCEPTION 'Os intervalos operacionais só podem ser ajustados em revisão ou durante o campeonato.';
  END IF;

  SELECT * INTO day_record
  FROM public.championship_bracket_days
  WHERE bracket_edition_id = _bracket_edition_id
    AND event_date = NULLIF(trim(COALESCE(_payload->>'event_date', '')), '')::DATE;

  IF day_record.id IS NULL THEN
    RAISE EXCEPTION 'Selecione um dia configurado da agenda.';
  END IF;

  SELECT COALESCE(array_agg(value::UUID), ARRAY[]::UUID[])
  INTO requested_court_ids
  FROM jsonb_array_elements_text(COALESCE(_payload->'court_ids', '[]'::JSONB)) AS value;

  DROP TABLE IF EXISTS operational_schedule_interval_breaks;
  CREATE TEMP TABLE operational_schedule_interval_breaks (
    id TEXT PRIMARY KEY,
    scope_type public.bracket_day_break_scope_type NOT NULL,
    bracket_court_id UUID NULL,
    break_start_time TIME NOT NULL,
    break_end_time TIME NOT NULL,
    is_legacy BOOLEAN NOT NULL DEFAULT false
  ) ON COMMIT DROP;

  INSERT INTO operational_schedule_interval_breaks (
    id,
    scope_type,
    bracket_court_id,
    break_start_time,
    break_end_time
  )
  SELECT
    breaks_table.id::TEXT,
    breaks_table.scope_type,
    breaks_table.bracket_court_id,
    breaks_table.break_start_time,
    breaks_table.break_end_time
  FROM public.championship_bracket_day_breaks AS breaks_table
  WHERE breaks_table.bracket_day_id = day_record.id;

  IF day_record.break_start_time IS NOT NULL
    AND day_record.break_end_time IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM operational_schedule_interval_breaks
      WHERE scope_type = 'ALL_COURTS'::public.bracket_day_break_scope_type
    ) THEN
    INSERT INTO operational_schedule_interval_breaks (
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

  SELECT * INTO interval_record
  FROM operational_schedule_interval_breaks
  WHERE id = interval_id_value;

  IF interval_action = 'REMOVE' AND interval_record.id IS NULL THEN
    RAISE EXCEPTION 'Selecione um intervalo existente para remover.';
  END IF;

  IF interval_id_value IS NOT NULL AND interval_record.id IS NULL THEN
    RAISE EXCEPTION 'O intervalo selecionado não pertence a este dia.';
  END IF;

  IF interval_record.id IS NOT NULL THEN
    scope_type_value := interval_record.scope_type;
    IF interval_action = 'REMOVE' THEN
      anchor_time_value := interval_record.break_start_time;
      DELETE FROM operational_schedule_interval_breaks WHERE id = interval_record.id;
    ELSE
      anchor_time_value := LEAST(interval_record.break_start_time, start_time_value);
      DELETE FROM operational_schedule_interval_breaks WHERE id = interval_record.id;
    END IF;
  ELSE
    anchor_time_value := start_time_value;
  END IF;

  IF scope_type_value = 'ALL_COURTS'::public.bracket_day_break_scope_type THEN
    SELECT COALESCE(array_agg(courts_table.id ORDER BY locations_table.position, courts_table.position), ARRAY[]::UUID[])
    INTO target_court_ids
    FROM public.championship_bracket_courts AS courts_table
    JOIN public.championship_bracket_locations AS locations_table
      ON locations_table.id = courts_table.bracket_location_id
    WHERE locations_table.bracket_day_id = day_record.id;
  ELSIF interval_record.id IS NOT NULL THEN
    target_court_ids := ARRAY[interval_record.bracket_court_id];
  ELSE
    target_court_ids := requested_court_ids;
  END IF;

  IF cardinality(target_court_ids) = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos uma quadra para o intervalo específico.';
  END IF;

  IF cardinality(target_court_ids) <> (
    SELECT count(*)
    FROM public.championship_bracket_courts AS courts_table
    JOIN public.championship_bracket_locations AS locations_table
      ON locations_table.id = courts_table.bracket_location_id
    WHERE locations_table.bracket_day_id = day_record.id
      AND courts_table.id = ANY(target_court_ids)
  ) THEN
    RAISE EXCEPTION 'Uma das quadras selecionadas não pertence ao dia informado.';
  END IF;

  IF interval_action = 'UPSERT' THEN
    IF start_time_value < day_record.start_time THEN
      RAISE EXCEPTION 'O intervalo não pode começar antes do início do dia.';
    END IF;

    INSERT INTO operational_schedule_interval_breaks (
      id,
      scope_type,
      bracket_court_id,
      break_start_time,
      break_end_time
    )
    SELECT
      concat('new-', court_id),
      scope_type_value,
      CASE WHEN scope_type_value = 'COURT'::public.bracket_day_break_scope_type THEN court_id ELSE NULL END,
      start_time_value,
      end_time_value
    FROM unnest(
      CASE
        WHEN scope_type_value = 'ALL_COURTS'::public.bracket_day_break_scope_type THEN ARRAY[target_court_ids[1]]
        ELSE target_court_ids
      END
    ) AS court_id;
  END IF;

  DROP TABLE IF EXISTS operational_schedule_interval_items;
  CREATE TEMP TABLE operational_schedule_interval_items (
    item_id UUID PRIMARY KEY,
    match_id UUID NULL,
    bracket_match_id UUID NULL,
    item_type TEXT NOT NULL,
    match_status TEXT NULL,
    sport_id UUID NULL,
    naipe public.match_naipe NULL,
    home_team_id UUID NULL,
    away_team_id UUID NULL,
    manual_representation_mode TEXT NULL,
    bracket_court_id UUID NOT NULL,
    location_name TEXT NOT NULL,
    court_name TEXT NOT NULL,
    label TEXT NOT NULL,
    original_start_at TIMESTAMPTZ NOT NULL,
    original_end_at TIMESTAMPTZ NOT NULL,
    planned_start_at TIMESTAMPTZ NULL,
    planned_end_at TIMESTAMPTZ NULL,
    planned_queue_position INTEGER NULL,
    planned_scheduled_slot INTEGER NULL
  ) ON COMMIT DROP;

  INSERT INTO operational_schedule_interval_items (
    item_id,
    match_id,
    bracket_match_id,
    item_type,
    match_status,
    sport_id,
    naipe,
    home_team_id,
    away_team_id,
    manual_representation_mode,
    bracket_court_id,
    location_name,
    court_name,
    label,
    original_start_at,
    original_end_at
  )
  SELECT
    matches_table.id,
    matches_table.id,
    bracket_matches_table.id,
    'MATCH',
    matches_table.status::TEXT,
    matches_table.sport_id,
    matches_table.naipe,
    matches_table.home_team_id,
    matches_table.away_team_id,
    matches_table.manual_representation_mode,
    courts_table.id,
    locations_table.name,
    courts_table.name,
    concat_ws(' × ', home_teams_table.name, away_teams_table.name),
    matches_table.start_time,
    COALESCE(
      matches_table.end_time,
      matches_table.start_time + make_interval(mins => GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1))
    )
  FROM public.matches AS matches_table
  JOIN public.championship_bracket_locations AS locations_table
    ON locations_table.bracket_day_id = day_record.id
    AND public.normalize_bracket_entity_name(locations_table.name) = public.normalize_bracket_entity_name(matches_table.location)
  JOIN public.championship_bracket_courts AS courts_table
    ON courts_table.bracket_location_id = locations_table.id
    AND public.normalize_bracket_entity_name(courts_table.name) = public.normalize_bracket_entity_name(matches_table.court_name)
  LEFT JOIN public.championship_bracket_matches AS bracket_matches_table
    ON bracket_matches_table.match_id = matches_table.id
    AND bracket_matches_table.bracket_edition_id = _bracket_edition_id
  LEFT JOIN public.championship_sports AS championship_sports_table
    ON championship_sports_table.championship_id = matches_table.championship_id
    AND championship_sports_table.sport_id = matches_table.sport_id
  LEFT JOIN public.teams AS home_teams_table ON home_teams_table.id = matches_table.home_team_id
  LEFT JOIN public.teams AS away_teams_table ON away_teams_table.id = matches_table.away_team_id
  WHERE matches_table.championship_id = edition_record.championship_id
    AND matches_table.season_year = edition_record.season_year
    AND matches_table.scheduled_date = day_record.event_date
    AND matches_table.start_time IS NOT NULL
    AND courts_table.id = ANY(target_court_ids)
    AND COALESCE(matches_table.is_pending_manual_relocation, false) = false;

  INSERT INTO operational_schedule_interval_items (
    item_id,
    match_id,
    bracket_match_id,
    item_type,
    match_status,
    sport_id,
    naipe,
    home_team_id,
    away_team_id,
    manual_representation_mode,
    bracket_court_id,
    location_name,
    court_name,
    label,
    original_start_at,
    original_end_at
  )
  SELECT
    bracket_matches_table.id,
    NULL,
    bracket_matches_table.id,
    'KNOCKOUT_PLACEHOLDER',
    NULL,
    competitions_table.sport_id,
    competitions_table.naipe,
    NULL,
    NULL,
    NULL,
    courts_table.id,
    locations_table.name,
    courts_table.name,
    concat('A definir • ', COALESCE(sports_table.name, 'Mata-mata')),
    public.combine_bracket_schedule_timestamp(day_record.event_date, bracket_matches_table.planned_start_time),
    public.combine_bracket_schedule_timestamp(
      day_record.event_date,
      COALESCE(
        bracket_matches_table.planned_end_time,
        bracket_matches_table.planned_start_time + make_interval(mins => GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1))
      )
    )
  FROM public.championship_bracket_matches AS bracket_matches_table
  JOIN public.championship_bracket_competitions AS competitions_table
    ON competitions_table.id = bracket_matches_table.competition_id
  JOIN public.championship_bracket_locations AS locations_table
    ON locations_table.bracket_day_id = day_record.id
    AND public.normalize_bracket_entity_name(locations_table.name) = public.normalize_bracket_entity_name(bracket_matches_table.planned_location_name)
  JOIN public.championship_bracket_courts AS courts_table
    ON courts_table.bracket_location_id = locations_table.id
    AND public.normalize_bracket_entity_name(courts_table.name) = public.normalize_bracket_entity_name(bracket_matches_table.planned_court_name)
  LEFT JOIN public.championship_sports AS championship_sports_table
    ON championship_sports_table.championship_id = edition_record.championship_id
    AND championship_sports_table.sport_id = competitions_table.sport_id
  LEFT JOIN public.sports AS sports_table ON sports_table.id = competitions_table.sport_id
  WHERE bracket_matches_table.bracket_edition_id = _bracket_edition_id
    AND bracket_matches_table.match_id IS NULL
    AND bracket_matches_table.is_bye IS NOT TRUE
    AND bracket_matches_table.planned_scheduled_date = day_record.event_date
    AND bracket_matches_table.planned_start_time IS NOT NULL
    AND courts_table.id = ANY(target_court_ids);

  FOR item_record IN
    SELECT *
    FROM operational_schedule_interval_items
    ORDER BY bracket_court_id, original_start_at, item_id
  LOOP
    IF item_record.original_end_at <= public.combine_bracket_schedule_timestamp(day_record.event_date, anchor_time_value) THEN
      UPDATE operational_schedule_interval_items
      SET planned_start_at = item_record.original_start_at,
          planned_end_at = item_record.original_end_at
      WHERE item_id = item_record.item_id;
      CONTINUE;
    END IF;

    SELECT COALESCE(max(planned_end_at), public.combine_bracket_schedule_timestamp(day_record.event_date, anchor_time_value))
    INTO cursor_at
    FROM operational_schedule_interval_items
    WHERE bracket_court_id = item_record.bracket_court_id
      AND planned_end_at IS NOT NULL;

    candidate_start_at := GREATEST(cursor_at, public.combine_bracket_schedule_timestamp(day_record.event_date, anchor_time_value));
    candidate_end_at := candidate_start_at + (item_record.original_end_at - item_record.original_start_at);

    FOR break_record IN
      SELECT *
      FROM operational_schedule_interval_breaks
      WHERE scope_type = 'ALL_COURTS'::public.bracket_day_break_scope_type
        OR bracket_court_id = item_record.bracket_court_id
      ORDER BY break_start_time, break_end_time
    LOOP
      IF candidate_start_at < public.combine_bracket_schedule_timestamp(day_record.event_date, break_record.break_end_time)
        AND candidate_end_at > public.combine_bracket_schedule_timestamp(day_record.event_date, break_record.break_start_time) THEN
        candidate_start_at := public.combine_bracket_schedule_timestamp(day_record.event_date, break_record.break_end_time);
        candidate_end_at := candidate_start_at + (item_record.original_end_at - item_record.original_start_at);
      END IF;
    END LOOP;

    UPDATE operational_schedule_interval_items
    SET planned_start_at = candidate_start_at,
        planned_end_at = candidate_end_at
    WHERE item_id = item_record.item_id;
  END LOOP;

  UPDATE operational_schedule_interval_items AS items_table
  SET planned_queue_position = numbered_items.queue_position,
      planned_scheduled_slot = numbered_items.scheduled_slot
  FROM (
    SELECT
      item_id,
      row_number() OVER (
        PARTITION BY bracket_court_id
        ORDER BY planned_start_at, item_id
      )::INTEGER AS queue_position,
      dense_rank() OVER (
        ORDER BY planned_start_at
      )::INTEGER AS scheduled_slot
    FROM operational_schedule_interval_items
  ) AS numbered_items
  WHERE numbered_items.item_id = items_table.item_id;

  SELECT GREATEST(
    public.combine_bracket_schedule_timestamp(day_record.event_date, day_record.end_time),
    COALESCE(max(planned_end_at), public.combine_bracket_schedule_timestamp(day_record.event_date, day_record.end_time))
  )
  INTO proposed_day_end_at
  FROM operational_schedule_interval_items;

  IF (proposed_day_end_at AT TIME ZONE 'America/Sao_Paulo')::DATE <> day_record.event_date THEN
    blockers := blockers || jsonb_build_array('A reorganização ultrapassa a data selecionada.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM operational_schedule_interval_items AS items_table
    JOIN public.championship_individual_sessions AS sessions_table
      ON sessions_table.championship_id = edition_record.championship_id
      AND sessions_table.season_year = edition_record.season_year
      AND sessions_table.scheduled_date = day_record.event_date
      AND public.normalize_bracket_entity_name(sessions_table.location_name) = public.normalize_bracket_entity_name(items_table.location_name)
      AND public.normalize_bracket_entity_name(sessions_table.court_name) = public.normalize_bracket_entity_name(items_table.court_name)
      AND sessions_table.status <> 'CANCELLED'::public.championship_individual_session_status
      AND sessions_table.start_time < items_table.planned_end_at
      AND sessions_table.end_time > items_table.planned_start_at
  ) THEN
    blockers := blockers || jsonb_build_array('A reorganização conflita com uma sessão individual da quadra.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM operational_schedule_interval_items AS items_table
    JOIN jsonb_array_elements(
      COALESCE(edition_record.payload_snapshot->'resource_locks', '[]'::JSONB)
    ) AS lock_record(value)
      ON lock_record.value->>'date' = day_record.event_date::TEXT
      AND COALESCE(lock_record.value->>'lock_mode', 'FLEXIBLE') = 'HARD'
      AND public.normalize_bracket_entity_name(COALESCE(lock_record.value->>'location_name', '')) = public.normalize_bracket_entity_name(items_table.location_name)
      AND public.normalize_bracket_entity_name(COALESCE(lock_record.value->>'court_name', '')) = public.normalize_bracket_entity_name(items_table.court_name)
      AND NULLIF(lock_record.value->>'start_time', '')::TIME < (items_table.planned_end_at AT TIME ZONE 'America/Sao_Paulo')::TIME
      AND NULLIF(lock_record.value->>'end_time', '')::TIME > (items_table.planned_start_at AT TIME ZONE 'America/Sao_Paulo')::TIME
  ) THEN
    blockers := blockers || jsonb_build_array('A reorganização conflita com uma reserva fixa da quadra.');
  END IF;

  FOR item_record IN
    SELECT *
    FROM operational_schedule_interval_items
    WHERE match_id IS NOT NULL
      AND sport_id IS NOT NULL
      AND naipe IS NOT NULL
      AND home_team_id IS NOT NULL
      AND away_team_id IS NOT NULL
  LOOP
    IF public.resolve_scheduled_match_rest_gap_conflict(
      edition_record.championship_id,
      edition_record.season_year,
      day_record.event_date,
      item_record.location_name,
      item_record.court_name,
      item_record.planned_start_at,
      item_record.planned_scheduled_slot,
      item_record.planned_queue_position,
      (SELECT created_at FROM public.matches WHERE id = item_record.match_id),
      item_record.match_id,
      item_record.sport_id,
      item_record.naipe,
      item_record.home_team_id,
      item_record.away_team_id,
      EXTRACT(EPOCH FROM (item_record.original_end_at - item_record.original_start_at))::INTEGER / 60
    ) IS NOT NULL THEN
      blockers := blockers || jsonb_build_array('A reorganização viola o descanso mínimo entre jogos.');
    END IF;
  END LOOP;

  IF EXISTS (
    WITH ordered_items AS (
      SELECT
        items_table.*,
        lag(home_team_id) OVER item_order AS previous_home_team_id,
        lag(away_team_id) OVER item_order AS previous_away_team_id,
        lead(home_team_id) OVER item_order AS next_home_team_id,
        lead(away_team_id) OVER item_order AS next_away_team_id
      FROM operational_schedule_interval_items AS items_table
      WHERE match_id IS NOT NULL
      WINDOW item_order AS (
        PARTITION BY bracket_court_id
        ORDER BY planned_start_at, planned_queue_position, item_id
      )
    )
    SELECT 1
    FROM ordered_items
    WHERE COALESCE(manual_representation_mode, 'AUTO') <> 'CO'
      AND (
        previous_home_team_id IN (home_team_id, away_team_id)
        OR previous_away_team_id IN (home_team_id, away_team_id)
        OR next_home_team_id IN (home_team_id, away_team_id)
        OR next_away_team_id IN (home_team_id, away_team_id)
      )
  ) THEN
    blockers := blockers || jsonb_build_array('A sequência planejada cria conflito de representação na mesma quadra.');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'item_id', item_id,
    'item_type', item_type,
    'match_status', match_status,
    'location_name', location_name,
    'court_name', court_name,
    'label', label,
    'original_start_time', original_start_at,
    'original_end_time', original_end_at,
    'start_time', planned_start_at,
    'end_time', planned_end_at,
    'queue_position', planned_queue_position,
    'scheduled_slot', planned_scheduled_slot,
    'is_displaced', original_start_at IS DISTINCT FROM planned_start_at OR original_end_at IS DISTINCT FROM planned_end_at
  ) ORDER BY planned_start_at, item_id), '[]'::JSONB)
  INTO timeline
  FROM operational_schedule_interval_items;

  RETURN jsonb_build_object(
    'revision', edition_record.reprogramming_revision,
    'blockers', blockers,
    'timeline', timeline,
    'breaks_before', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'bracket_day_id', day_record.id,
        'break_start_time', break_start_time,
        'break_end_time', break_end_time,
        'position', position,
        'scope_type', scope_type,
        'bracket_court_id', bracket_court_id
      ) ORDER BY break_start_time, id)
      FROM (
        SELECT id, break_start_time, break_end_time, position, scope_type, bracket_court_id
        FROM public.championship_bracket_day_breaks
        WHERE bracket_day_id = day_record.id
      ) AS before_breaks
    ), '[]'::JSONB),
    'breaks_after', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'bracket_day_id', day_record.id,
        'break_start_time', break_start_time,
        'break_end_time', break_end_time,
        'position', position,
        'scope_type', scope_type,
        'bracket_court_id', bracket_court_id
      ) ORDER BY break_start_time, id)
      FROM (
        SELECT
          id,
          break_start_time,
          break_end_time,
          row_number() OVER (ORDER BY break_start_time, id)::INTEGER AS position,
          scope_type,
          bracket_court_id
        FROM operational_schedule_interval_breaks
      ) AS after_breaks
    ), '[]'::JSONB),
    'day_end_before', public.combine_bracket_schedule_timestamp(day_record.event_date, day_record.end_time),
    'day_end_after', proposed_day_end_at,
    'extends_day_end', proposed_day_end_at > public.combine_bracket_schedule_timestamp(day_record.event_date, day_record.end_time)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_operational_schedule_interval(
  _bracket_edition_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.build_operational_schedule_interval_preview(_bracket_edition_id, _payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_operational_schedule_interval(
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
  preview JSONB;
  edition_record RECORD;
  day_record RECORD;
  interval_action TEXT;
  interval_id_value TEXT;
  scope_type_value public.bracket_day_break_scope_type;
  target_court_ids UUID[];
  start_time_value TIME;
  end_time_value TIME;
  first_general_break RECORD;
  timeline_item JSONB;
  original_timeline JSONB;
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.has_admin_tab_access('championship_schedule'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para ajustar os intervalos da agenda.';
  END IF;

  SELECT editions_table.id, editions_table.championship_id, editions_table.season_year, editions_table.reprogramming_revision
  INTO edition_record
  FROM public.championship_bracket_editions AS editions_table
  JOIN public.championships AS championships_table ON championships_table.id = editions_table.championship_id
  WHERE editions_table.id = _bracket_edition_id
    AND championships_table.status IN ('REVIEW'::public.championship_status, 'IN_PROGRESS'::public.championship_status)
  FOR UPDATE OF editions_table;

  IF edition_record.id IS NULL THEN
    RAISE EXCEPTION 'A programação operacional não está disponível para este campeonato.';
  END IF;

  IF edition_record.reprogramming_revision <> _expected_revision THEN
    RAISE EXCEPTION 'A agenda foi alterada desde a prévia. Revise o impacto novamente.';
  END IF;

  preview := public.build_operational_schedule_interval_preview(_bracket_edition_id, _payload);

  IF jsonb_array_length(COALESCE(preview->'blockers', '[]'::JSONB)) > 0 THEN
    RAISE EXCEPTION 'A reorganização possui bloqueios e não pode ser confirmada.';
  END IF;

  IF COALESCE((preview->>'extends_day_end')::BOOLEAN, false)
    AND COALESCE((_payload->>'accept_day_end_extension')::BOOLEAN, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Confirme a ampliação do fim do dia antes de aplicar.';
  END IF;

  SELECT * INTO day_record
  FROM public.championship_bracket_days
  WHERE bracket_edition_id = _bracket_edition_id
    AND event_date = (_payload->>'event_date')::DATE
  FOR UPDATE;

  interval_action := upper(trim(COALESCE(_payload->>'action', '')));
  interval_id_value := NULLIF(trim(COALESCE(_payload->>'interval_id', '')), '');
  scope_type_value := CASE upper(trim(COALESCE(_payload->>'scope_type', 'ALL_COURTS')))
    WHEN 'COURT' THEN 'COURT'::public.bracket_day_break_scope_type
    ELSE 'ALL_COURTS'::public.bracket_day_break_scope_type
  END;
  start_time_value := NULLIF(trim(COALESCE(_payload->>'start_time', '')), '')::TIME;
  end_time_value := NULLIF(trim(COALESCE(_payload->>'end_time', '')), '')::TIME;

  SELECT COALESCE(array_agg(value::UUID), ARRAY[]::UUID[])
  INTO target_court_ids
  FROM jsonb_array_elements_text(COALESCE(_payload->'court_ids', '[]'::JSONB)) AS value;

  IF interval_action = 'REMOVE' THEN
    IF interval_id_value LIKE 'legacy:%' THEN
      UPDATE public.championship_bracket_days
      SET break_start_time = NULL, break_end_time = NULL
      WHERE id = day_record.id;

      INSERT INTO public.championship_bracket_day_breaks (
        bracket_day_id,
        break_start_time,
        break_end_time,
        position,
        scope_type,
        bracket_court_id
      ) VALUES (
        day_record.id,
        start_time_value,
        end_time_value,
        COALESCE((SELECT max(position) + 1 FROM public.championship_bracket_day_breaks WHERE bracket_day_id = day_record.id), 1),
        'ALL_COURTS'::public.bracket_day_break_scope_type,
        NULL
      );
    ELSE
      DELETE FROM public.championship_bracket_day_breaks
      WHERE id = interval_id_value::UUID
        AND bracket_day_id = day_record.id;
    END IF;
  ELSE
    IF interval_id_value LIKE 'legacy:%' THEN
      UPDATE public.championship_bracket_days
      SET break_start_time = NULL, break_end_time = NULL
      WHERE id = day_record.id;
    ELSIF interval_id_value IS NOT NULL THEN
      UPDATE public.championship_bracket_day_breaks
      SET break_start_time = start_time_value,
          break_end_time = end_time_value
      WHERE id = interval_id_value::UUID
        AND bracket_day_id = day_record.id;
    ELSIF scope_type_value = 'ALL_COURTS'::public.bracket_day_break_scope_type THEN
      INSERT INTO public.championship_bracket_day_breaks (
        bracket_day_id,
        break_start_time,
        break_end_time,
        position,
        scope_type,
        bracket_court_id
      ) VALUES (
        day_record.id,
        start_time_value,
        end_time_value,
        COALESCE((SELECT max(position) + 1 FROM public.championship_bracket_day_breaks WHERE bracket_day_id = day_record.id), 1),
        'ALL_COURTS'::public.bracket_day_break_scope_type,
        NULL
      );
    ELSE
      INSERT INTO public.championship_bracket_day_breaks (
        bracket_day_id,
        break_start_time,
        break_end_time,
        position,
        scope_type,
        bracket_court_id
      )
      SELECT
        day_record.id,
        start_time_value,
        end_time_value,
        COALESCE((SELECT max(position) FROM public.championship_bracket_day_breaks WHERE bracket_day_id = day_record.id), 0) + row_number() OVER (),
        'COURT'::public.bracket_day_break_scope_type,
        court_id
      FROM unnest(target_court_ids) AS court_id;
    END IF;
  END IF;

  PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);
  PERFORM set_config('app.skip_queue_trigger', 'true', true);

  FOR timeline_item IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(preview->'timeline', '[]'::JSONB))
  LOOP
    IF timeline_item->>'item_type' = 'MATCH' THEN
      UPDATE public.matches
      SET start_time = (timeline_item->>'start_time')::TIMESTAMPTZ,
          end_time = (timeline_item->>'end_time')::TIMESTAMPTZ,
          queue_position = (timeline_item->>'queue_position')::INTEGER,
          scheduled_slot = (timeline_item->>'scheduled_slot')::INTEGER
      WHERE id = (timeline_item->>'item_id')::UUID;
    END IF;

    UPDATE public.championship_bracket_matches
    SET planned_start_time = ((timeline_item->>'start_time')::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')::TIME,
        planned_end_time = ((timeline_item->>'end_time')::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')::TIME,
        planned_queue_position = (timeline_item->>'queue_position')::INTEGER,
        planned_scheduled_slot = (timeline_item->>'scheduled_slot')::INTEGER
    WHERE id = (timeline_item->>'item_id')::UUID
      OR match_id = (timeline_item->>'item_id')::UUID;
  END LOOP;

  UPDATE public.championship_bracket_knockout_schedule_reservations AS reservations_table
  SET start_at = public.combine_bracket_schedule_timestamp(day_record.event_date, bracket_matches_table.planned_start_time),
      end_at = public.combine_bracket_schedule_timestamp(day_record.event_date, bracket_matches_table.planned_end_time)
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.bracket_edition_id = _bracket_edition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.planned_scheduled_date = day_record.event_date
    AND reservations_table.bracket_edition_id = bracket_matches_table.bracket_edition_id
    AND reservations_table.competition_id = bracket_matches_table.competition_id
    AND reservations_table.round_number = bracket_matches_table.round_number
    AND reservations_table.slot_number = bracket_matches_table.slot_number
    AND reservations_table.is_third_place = bracket_matches_table.is_third_place;

  PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
  PERFORM set_config('app.skip_queue_trigger', 'false', true);

  UPDATE public.championship_bracket_editions
  SET reprogramming_revision = reprogramming_revision + 1
  WHERE id = _bracket_edition_id;

  SELECT * INTO first_general_break
  FROM public.championship_bracket_day_breaks
  WHERE bracket_day_id = day_record.id
    AND scope_type = 'ALL_COURTS'::public.bracket_day_break_scope_type
  ORDER BY position, break_start_time
  LIMIT 1;

  UPDATE public.championship_bracket_days
  SET break_start_time = first_general_break.break_start_time,
      break_end_time = first_general_break.break_end_time,
      end_time = GREATEST(
        end_time,
        ((preview->>'day_end_after')::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')::TIME
      )
  WHERE id = day_record.id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'item_id', value->>'item_id',
    'start_time', value->>'original_start_time',
    'end_time', value->>'original_end_time',
    'queue_position', value->>'queue_position',
    'scheduled_slot', value->>'scheduled_slot'
  )), '[]'::JSONB)
  INTO original_timeline
  FROM jsonb_array_elements(COALESCE(preview->'timeline', '[]'::JSONB));

  PERFORM public.write_admin_action_log(
    'UPDATE'::public.admin_action_type,
    'public.championship_bracket_day_breaks',
    day_record.id::TEXT,
    'Ajustou intervalos operacionais da agenda.',
    jsonb_build_object('timeline', original_timeline, 'breaks', preview->'breaks_before', 'day_end', preview->'day_end_before'),
    jsonb_build_object('timeline', preview->'timeline', 'breaks', preview->'breaks_after', 'day_end', preview->'day_end_after'),
    jsonb_build_object('championship_id', edition_record.championship_id, 'season_year', edition_record.season_year, 'reprogramming_revision', _expected_revision)
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
    PERFORM set_config('app.skip_queue_trigger', 'false', true);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.build_operational_schedule_interval_preview(UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_operational_schedule_interval(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_operational_schedule_interval(UUID, JSONB, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_operational_schedule_interval(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_operational_schedule_interval(UUID, JSONB, BIGINT) TO authenticated;

NOTIFY pgrst, 'reload schema';
