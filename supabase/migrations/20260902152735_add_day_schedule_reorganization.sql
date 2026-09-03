CREATE OR REPLACE FUNCTION public.build_day_schedule_reorganization_preview(
  _bracket_edition_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_match_ids UUID[];
  selected_matches_count INTEGER;
  selected_championship_id UUID;
  selected_season_year INTEGER;
  target_date DATE;
  target_location TEXT;
  target_court_name TEXT;
  target_start_time TIME;
  strategy TEXT;
  break_policy TEXT;
  relocation_reason TEXT;
  relocation_notes TEXT;
  day_record RECORD;
  target_location_record RECORD;
  target_court_record RECORD;
  primary_break_record RECORD;
  knockout_anchor_record RECORD;
  item_record RECORD;
  plan_record RECORD;
  current_candidate_start TIMESTAMPTZ;
  candidate_end TIMESTAMPTZ;
  conflicting_end TIMESTAMPTZ;
  rest_conflicting_end TIMESTAMPTZ;
  day_start_at TIMESTAMPTZ;
  day_end_at TIMESTAMPTZ;
  next_day_start_at TIMESTAMPTZ;
  next_day_end_at TIMESTAMPTZ;
  next_break_start_at TIMESTAMPTZ;
  next_break_end_at TIMESTAMPTZ;
  primary_break_duration INTERVAL;
  candidate_court_position INTEGER;
  loop_count INTEGER;
  changes JSONB := '[]'::JSONB;
  timeline JSONB := '[]'::JSONB;
  blockers JSONB := '[]'::JSONB;
  revision_value BIGINT;
  edition_payload JSONB;
  previous_day_start TEXT;
  previous_day_end TEXT;
BEGIN
  SELECT array_agg(value::UUID)
  INTO selected_match_ids
  FROM jsonb_array_elements_text(COALESCE(_payload->'match_ids', '[]'::JSONB)) AS value;

  target_date := NULLIF(_payload->>'target_date', '')::DATE;
  target_location := NULLIF(trim(COALESCE(_payload->>'target_location', '')), '');
  target_court_name := NULLIF(trim(COALESCE(_payload->>'target_court_name', '')), '');
  target_start_time := NULLIF(_payload->>'target_start_time', '')::TIME;
  strategy := upper(trim(COALESCE(_payload->>'strategy', '')));
  break_policy := upper(trim(COALESCE(_payload->>'break_policy', '')));
  relocation_reason := upper(trim(COALESCE(_payload->>'reason', '')));
  relocation_notes := NULLIF(trim(COALESCE(_payload->>'notes', '')), '');

  IF COALESCE(cardinality(selected_match_ids), 0) = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos um jogo aguardando realocação.';
  END IF;

  IF cardinality(selected_match_ids) <> (
    SELECT count(DISTINCT match_id)
    FROM unnest(selected_match_ids) AS match_id
  ) THEN
    RAISE EXCEPTION 'A seleção de jogos contém itens repetidos.';
  END IF;

  IF target_date IS NULL OR target_location IS NULL OR target_court_name IS NULL THEN
    RAISE EXCEPTION 'Informe dia, local e quadra de destino.';
  END IF;

  IF strategy NOT IN ('ANCHOR', 'AUTO') THEN
    RAISE EXCEPTION 'Informe uma estratégia válida para a reorganização.';
  END IF;

  IF break_policy NOT IN ('KEEP_BEFORE_KNOCKOUT', 'REMOVE') THEN
    RAISE EXCEPTION 'Informe uma política válida para o intervalo.';
  END IF;

  IF relocation_reason NOT IN ('WEATHER', 'COURT_UNAVAILABLE', 'OPERATIONAL_DELAY', 'SAFETY', 'OTHER') THEN
    RAISE EXCEPTION 'Informe um motivo válido para a reorganização.';
  END IF;

  SELECT editions_table.championship_id, editions_table.season_year, editions_table.reprogramming_revision, editions_table.payload_snapshot
  INTO selected_championship_id, selected_season_year, revision_value, edition_payload
  FROM public.championship_bracket_editions AS editions_table
  WHERE editions_table.id = _bracket_edition_id;

  IF selected_championship_id IS NULL THEN
    RAISE EXCEPTION 'Edição de chaveamento inválida.';
  END IF;

  SELECT days_table.*
  INTO day_record
  FROM public.championship_bracket_days AS days_table
  WHERE days_table.bracket_edition_id = _bracket_edition_id
    AND days_table.event_date = target_date;

  IF day_record.id IS NULL THEN
    RAISE EXCEPTION 'O dia de destino não está configurado na agenda do campeonato.';
  END IF;

  SELECT locations_table.*
  INTO target_location_record
  FROM public.championship_bracket_locations AS locations_table
  WHERE locations_table.bracket_day_id = day_record.id
    AND public.normalize_bracket_entity_name(locations_table.name) = public.normalize_bracket_entity_name(target_location);

  IF target_location_record.id IS NULL THEN
    RAISE EXCEPTION 'O local de destino não está configurado nesse dia.';
  END IF;

  SELECT courts_table.*
  INTO target_court_record
  FROM public.championship_bracket_courts AS courts_table
  WHERE courts_table.bracket_location_id = target_location_record.id
    AND public.normalize_bracket_entity_name(courts_table.name) = public.normalize_bracket_entity_name(target_court_name);

  IF target_court_record.id IS NULL THEN
    RAISE EXCEPTION 'A quadra de destino não está configurada nesse dia.';
  END IF;

  SELECT count(*)
  INTO selected_matches_count
  FROM public.matches AS matches_table
  JOIN public.championship_bracket_matches AS bracket_matches_table
    ON bracket_matches_table.match_id = matches_table.id
  WHERE bracket_matches_table.bracket_edition_id = _bracket_edition_id
    AND matches_table.id = ANY(selected_match_ids)
    AND matches_table.status = 'SCHEDULED'::public.match_status
    AND COALESCE(matches_table.is_pending_manual_relocation, false);

  IF selected_matches_count <> cardinality(selected_match_ids) THEN
    RAISE EXCEPTION 'Somente jogos aguardando realocação desta edição podem ser reorganizados.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.matches AS matches_table
    WHERE matches_table.id = ANY(selected_match_ids)
      AND NOT EXISTS (
        SELECT 1
        FROM public.championship_bracket_court_sports AS court_sports_table
        WHERE court_sports_table.bracket_court_id = target_court_record.id
          AND court_sports_table.sport_id = matches_table.sport_id
      )
  ) THEN
    RAISE EXCEPTION 'A quadra de destino não atende todas as modalidades selecionadas.';
  END IF;

  CREATE TEMP TABLE day_schedule_reorganization_items (
    item_type TEXT NOT NULL,
    item_id UUID NOT NULL,
    match_id UUID NULL,
    placeholder_id UUID NULL,
    label TEXT NOT NULL,
    is_selected BOOLEAN NOT NULL,
    is_fixed BOOLEAN NOT NULL,
    is_knockout BOOLEAN NOT NULL,
    bracket_court_id UUID NOT NULL,
    court_group_id UUID NOT NULL,
    location_group_id UUID NOT NULL,
    location_name TEXT NOT NULL,
    court_name TEXT NOT NULL,
    court_position INTEGER NOT NULL,
    sport_id UUID NOT NULL,
    naipe public.match_naipe NOT NULL,
    home_team_id UUID NULL,
    away_team_id UUID NULL,
    duration_minutes INTEGER NOT NULL,
    original_start_at TIMESTAMPTZ NULL,
    original_end_at TIMESTAMPTZ NULL,
    original_queue_position INTEGER NULL,
    original_scheduled_slot INTEGER NULL,
    selection_order INTEGER NULL,
    planned_start_at TIMESTAMPTZ NULL,
    planned_end_at TIMESTAMPTZ NULL,
    planned_court_position INTEGER NULL,
    planned_queue_position INTEGER NULL,
    planned_scheduled_slot INTEGER NULL
  ) ON COMMIT DROP;

  INSERT INTO day_schedule_reorganization_items (
    item_type, item_id, match_id, placeholder_id, label, is_selected, is_fixed, is_knockout,
    bracket_court_id, court_group_id, location_group_id, location_name, court_name, court_position,
    sport_id, naipe, home_team_id, away_team_id, duration_minutes, original_start_at,
    original_end_at, original_queue_position, original_scheduled_slot
  )
  SELECT
    'MATCH',
    matches_table.id,
    matches_table.id,
    NULL,
    concat_ws(' x ', home_teams_table.name, away_teams_table.name),
    false,
    matches_table.status <> 'SCHEDULED'::public.match_status
      OR COALESCE(matches_table.is_manual_schedule_override, false),
    bracket_matches_table.phase <> 'GROUP_STAGE'::public.bracket_phase,
    courts_table.id,
    courts_table.court_group_id,
    locations_table.location_group_id,
    locations_table.name,
    courts_table.name,
    courts_table.position,
    matches_table.sport_id,
    matches_table.naipe,
    matches_table.home_team_id,
    matches_table.away_team_id,
    GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1),
    matches_table.start_time,
    COALESCE(matches_table.end_time, matches_table.start_time + make_interval(mins => GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1))),
    matches_table.queue_position,
    matches_table.scheduled_slot
  FROM public.matches AS matches_table
  JOIN public.championship_bracket_matches AS bracket_matches_table
    ON bracket_matches_table.match_id = matches_table.id
    AND bracket_matches_table.bracket_edition_id = _bracket_edition_id
  JOIN public.championship_bracket_locations AS locations_table
    ON locations_table.bracket_day_id = day_record.id
    AND public.normalize_bracket_entity_name(locations_table.name) = public.normalize_bracket_entity_name(matches_table.location)
  JOIN public.championship_bracket_courts AS courts_table
    ON courts_table.bracket_location_id = locations_table.id
    AND public.normalize_bracket_entity_name(courts_table.name) = public.normalize_bracket_entity_name(matches_table.court_name)
  LEFT JOIN public.championship_sports AS championship_sports_table
    ON championship_sports_table.championship_id = matches_table.championship_id
    AND championship_sports_table.sport_id = matches_table.sport_id
  LEFT JOIN public.teams AS home_teams_table ON home_teams_table.id = matches_table.home_team_id
  LEFT JOIN public.teams AS away_teams_table ON away_teams_table.id = matches_table.away_team_id
  WHERE matches_table.championship_id = selected_championship_id
    AND matches_table.season_year = selected_season_year
    AND matches_table.scheduled_date = target_date
    AND locations_table.id = target_location_record.id
    AND COALESCE(matches_table.is_pending_manual_relocation, false) = false;

  INSERT INTO day_schedule_reorganization_items (
    item_type, item_id, match_id, placeholder_id, label, is_selected, is_fixed, is_knockout,
    bracket_court_id, court_group_id, location_group_id, location_name, court_name, court_position,
    sport_id, naipe, home_team_id, away_team_id, duration_minutes, original_start_at,
    original_end_at, original_queue_position, original_scheduled_slot, selection_order
  )
  SELECT
    'MATCH',
    matches_table.id,
    matches_table.id,
    NULL,
    concat_ws(' x ', home_teams_table.name, away_teams_table.name),
    true,
    false,
    bracket_matches_table.phase <> 'GROUP_STAGE'::public.bracket_phase,
    target_court_record.id,
    target_court_record.court_group_id,
    target_location_record.location_group_id,
    target_location_record.name,
    target_court_record.name,
    target_court_record.position,
    matches_table.sport_id,
    matches_table.naipe,
    matches_table.home_team_id,
    matches_table.away_team_id,
    GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1),
    public.combine_bracket_schedule_timestamp(
      target_date,
      COALESCE(
        ((matches_table.pending_manual_relocation_previous_schedule->>'start_time')::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')::TIME,
        target_start_time,
        day_record.start_time
      )
    ),
    NULL,
    NULLIF(matches_table.pending_manual_relocation_previous_schedule->>'queue_position', '')::INTEGER,
    NULLIF(matches_table.pending_manual_relocation_previous_schedule->>'scheduled_slot', '')::INTEGER,
    row_number() OVER (
      ORDER BY
        NULLIF(matches_table.pending_manual_relocation_previous_schedule->>'start_time', '')::TIMESTAMPTZ,
        NULLIF(matches_table.pending_manual_relocation_previous_schedule->>'scheduled_slot', '')::INTEGER,
        NULLIF(matches_table.pending_manual_relocation_previous_schedule->>'queue_position', '')::INTEGER,
        matches_table.id
    )::INTEGER
  FROM public.matches AS matches_table
  JOIN public.championship_bracket_matches AS bracket_matches_table
    ON bracket_matches_table.match_id = matches_table.id
    AND bracket_matches_table.bracket_edition_id = _bracket_edition_id
  LEFT JOIN public.championship_sports AS championship_sports_table
    ON championship_sports_table.championship_id = matches_table.championship_id
    AND championship_sports_table.sport_id = matches_table.sport_id
  LEFT JOIN public.teams AS home_teams_table ON home_teams_table.id = matches_table.home_team_id
  LEFT JOIN public.teams AS away_teams_table ON away_teams_table.id = matches_table.away_team_id
  WHERE matches_table.id = ANY(selected_match_ids);

  INSERT INTO day_schedule_reorganization_items (
    item_type, item_id, match_id, placeholder_id, label, is_selected, is_fixed, is_knockout,
    bracket_court_id, court_group_id, location_group_id, location_name, court_name, court_position,
    sport_id, naipe, home_team_id, away_team_id, duration_minutes, original_start_at,
    original_end_at, original_queue_position, original_scheduled_slot
  )
  SELECT
    'KNOCKOUT_PLACEHOLDER',
    bracket_matches_table.id,
    NULL,
    bracket_matches_table.id,
    format('A definir • %s', COALESCE(sports_table.name, 'Mata-mata')),
    false,
    false,
    true,
    courts_table.id,
    courts_table.court_group_id,
    locations_table.location_group_id,
    locations_table.name,
    courts_table.name,
    courts_table.position,
    competitions_table.sport_id,
    competitions_table.naipe,
    NULL,
    NULL,
    GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1),
    public.combine_bracket_schedule_timestamp(target_date, bracket_matches_table.planned_start_time),
    public.combine_bracket_schedule_timestamp(target_date, COALESCE(bracket_matches_table.planned_end_time, bracket_matches_table.planned_start_time + make_interval(mins => GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1)))),
    bracket_matches_table.planned_queue_position,
    bracket_matches_table.planned_scheduled_slot
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
    ON championship_sports_table.championship_id = selected_championship_id
    AND championship_sports_table.sport_id = competitions_table.sport_id
  LEFT JOIN public.sports AS sports_table ON sports_table.id = competitions_table.sport_id
  WHERE competitions_table.bracket_edition_id = _bracket_edition_id
    AND bracket_matches_table.match_id IS NULL
    AND bracket_matches_table.is_bye = false
    AND bracket_matches_table.planned_scheduled_date = target_date
    AND locations_table.id = target_location_record.id
    AND bracket_matches_table.planned_start_time IS NOT NULL;

  SELECT breaks_table.*
  INTO primary_break_record
  FROM public.championship_bracket_day_breaks AS breaks_table
  WHERE breaks_table.bracket_day_id = day_record.id
    AND breaks_table.scope_type = 'ALL_COURTS'::public.bracket_day_break_scope_type
  ORDER BY breaks_table.position, breaks_table.break_start_time
  LIMIT 1;

  IF primary_break_record.id IS NOT NULL AND break_policy = 'KEEP_BEFORE_KNOCKOUT' THEN
    primary_break_duration := primary_break_record.break_end_time - primary_break_record.break_start_time;

    SELECT *
    INTO knockout_anchor_record
    FROM day_schedule_reorganization_items
    WHERE is_knockout
      AND original_start_at >= public.combine_bracket_schedule_timestamp(target_date, primary_break_record.break_end_time)
    ORDER BY original_start_at, original_scheduled_slot, item_id
    LIMIT 1;

    IF knockout_anchor_record.item_id IS NULL THEN
      blockers := blockers || jsonb_build_array('Não há jogo de mata-mata após o intervalo para preservar sua posição.');
      next_break_start_at := public.combine_bracket_schedule_timestamp(target_date, primary_break_record.break_start_time);
      next_break_end_at := public.combine_bracket_schedule_timestamp(target_date, primary_break_record.break_end_time);
    ELSE
      next_break_end_at := knockout_anchor_record.original_start_at;
      next_break_start_at := next_break_end_at - primary_break_duration;
      UPDATE day_schedule_reorganization_items
      SET is_fixed = true
      WHERE item_id = knockout_anchor_record.item_id;
    END IF;
  ELSE
    next_break_start_at := NULL;
    next_break_end_at := NULL;
  END IF;

  day_start_at := public.combine_bracket_schedule_timestamp(target_date, day_record.start_time);
  day_end_at := public.combine_bracket_schedule_timestamp(target_date, day_record.end_time);
  previous_day_start := to_char(day_start_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI');
  previous_day_end := to_char(day_end_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI');

  UPDATE day_schedule_reorganization_items
  SET
    planned_start_at = original_start_at,
    planned_end_at = original_end_at,
    planned_court_position = fixed_items.court_position
  FROM (
    SELECT
      item_id,
      row_number() OVER (
        PARTITION BY bracket_court_id
        ORDER BY original_start_at, item_id
      )::INTEGER AS court_position
    FROM day_schedule_reorganization_items
    WHERE is_fixed
  ) AS fixed_items
  WHERE fixed_items.item_id = day_schedule_reorganization_items.item_id;

  FOR item_record IN
    SELECT *
    FROM day_schedule_reorganization_items
    WHERE is_fixed = false
    ORDER BY
      CASE WHEN strategy = 'ANCHOR' AND is_selected THEN 0 ELSE 1 END,
      CASE
        WHEN strategy = 'ANCHOR' AND is_selected THEN selection_order
        ELSE NULL
      END NULLS LAST,
      original_start_at,
      original_scheduled_slot,
      original_queue_position,
      item_id
  LOOP
    current_candidate_start := GREATEST(
      day_start_at,
      COALESCE(
        CASE
          WHEN strategy = 'ANCHOR' AND item_record.is_selected THEN
            public.combine_bracket_schedule_timestamp(target_date, COALESCE(target_start_time, day_record.start_time))
              + make_interval(mins => COALESCE((item_record.selection_order - 1) * item_record.duration_minutes, 0))
          ELSE item_record.original_start_at
        END,
        day_start_at
      )
    );
    loop_count := 0;

    LOOP
      loop_count := loop_count + 1;
      IF loop_count > 200 THEN
        blockers := blockers || jsonb_build_array(format('Não foi possível encontrar horário elegível para %s.', item_record.label));
        EXIT;
      END IF;

      candidate_end := current_candidate_start + make_interval(mins => item_record.duration_minutes);

      SELECT max(planned_end_at)
      INTO conflicting_end
      FROM day_schedule_reorganization_items
      WHERE planned_start_at IS NOT NULL
        AND bracket_court_id = item_record.bracket_court_id
        AND current_candidate_start < planned_end_at
        AND candidate_end > planned_start_at;

      IF conflicting_end IS NOT NULL THEN
        current_candidate_start := conflicting_end;
        CONTINUE;
      END IF;

      SELECT max(
        public.combine_bracket_schedule_timestamp(
          target_date,
          (resource_lock.value->>'end_time')::TIME
        )
      )
      INTO conflicting_end
      FROM jsonb_array_elements(COALESCE(edition_payload->'resource_locks', '[]'::JSONB)) AS resource_lock(value)
      WHERE resource_lock.value->>'date' = target_date::TEXT
        AND resource_lock.value->>'location_key' = item_record.location_group_id::TEXT
        AND resource_lock.value->>'court_key' = item_record.court_group_id::TEXT
        AND NULLIF(resource_lock.value->>'start_time', '') IS NOT NULL
        AND NULLIF(resource_lock.value->>'end_time', '') IS NOT NULL
        AND current_candidate_start < public.combine_bracket_schedule_timestamp(target_date, (resource_lock.value->>'end_time')::TIME)
        AND candidate_end > public.combine_bracket_schedule_timestamp(target_date, (resource_lock.value->>'start_time')::TIME);

      IF conflicting_end IS NOT NULL THEN
        current_candidate_start := conflicting_end;
        CONTINUE;
      END IF;

      SELECT max(public.combine_bracket_schedule_timestamp(target_date, breaks_table.break_end_time))
      INTO conflicting_end
      FROM public.championship_bracket_day_breaks AS breaks_table
      WHERE breaks_table.bracket_day_id = day_record.id
        AND (primary_break_record.id IS NULL OR breaks_table.id <> primary_break_record.id)
        AND (
          breaks_table.scope_type = 'ALL_COURTS'::public.bracket_day_break_scope_type
          OR (breaks_table.scope_type = 'COURT'::public.bracket_day_break_scope_type AND breaks_table.bracket_court_id = item_record.bracket_court_id)
        )
        AND current_candidate_start < public.combine_bracket_schedule_timestamp(target_date, breaks_table.break_end_time)
        AND candidate_end > public.combine_bracket_schedule_timestamp(target_date, breaks_table.break_start_time);

      IF conflicting_end IS NOT NULL THEN
        current_candidate_start := conflicting_end;
        CONTINUE;
      END IF;

      IF next_break_start_at IS NOT NULL
        AND current_candidate_start < next_break_end_at
        AND candidate_end > next_break_start_at
      THEN
        current_candidate_start := next_break_end_at;
        CONTINUE;
      END IF;

      SELECT max(
        GREATEST(
          planned_end_at,
          planned_start_at + make_interval(mins => GREATEST(item_record.duration_minutes, duration_minutes) * 4)
        )
      )
      INTO rest_conflicting_end
      FROM day_schedule_reorganization_items
      WHERE planned_start_at IS NOT NULL
        AND item_record.naipe = naipe
        AND item_record.is_knockout = false
        AND (
          item_record.home_team_id = home_team_id
          OR item_record.home_team_id = away_team_id
          OR item_record.away_team_id = home_team_id
          OR item_record.away_team_id = away_team_id
        )
        AND item_record.bracket_court_id <> bracket_court_id
        AND public.is_championship_team_rest_gap_conflict(
          item_record.naipe,
          naipe,
          false,
          NULL,
          NULL,
          current_candidate_start,
          planned_start_at,
          item_record.duration_minutes,
          duration_minutes,
          item_record.is_knockout
        );

      IF rest_conflicting_end IS NOT NULL THEN
        current_candidate_start := rest_conflicting_end;
        CONTINUE;
      END IF;

      EXIT;
    END LOOP;

    SELECT count(*) + 1
    INTO candidate_court_position
    FROM day_schedule_reorganization_items
    WHERE planned_start_at IS NOT NULL
      AND bracket_court_id = item_record.bracket_court_id
      AND planned_start_at <= current_candidate_start;

    IF EXISTS (
      SELECT 1
      FROM day_schedule_reorganization_items
      WHERE planned_start_at IS NOT NULL
        AND bracket_court_id = item_record.bracket_court_id
        AND item_record.naipe = naipe
        AND (
          item_record.home_team_id = home_team_id
          OR item_record.home_team_id = away_team_id
          OR item_record.away_team_id = home_team_id
          OR item_record.away_team_id = away_team_id
        )
        AND public.is_championship_team_rest_gap_conflict(
          item_record.naipe,
          naipe,
          true,
          candidate_court_position,
          planned_court_position,
          current_candidate_start,
          planned_start_at,
          item_record.duration_minutes,
          duration_minutes,
          item_record.is_knockout
        )
    ) THEN
      blockers := blockers || jsonb_build_array(format('A sequência de %s não respeita o descanso mínimo na mesma quadra.', item_record.label));
    END IF;

    UPDATE day_schedule_reorganization_items
    SET
      planned_start_at = current_candidate_start,
      planned_end_at = current_candidate_start + make_interval(mins => item_record.duration_minutes),
      planned_court_position = candidate_court_position
    WHERE item_id = item_record.item_id;
  END LOOP;

  UPDATE day_schedule_reorganization_items AS items_table
  SET planned_queue_position = numbered_items.queue_position,
      planned_scheduled_slot = numbered_items.scheduled_slot
  FROM (
    SELECT
      item_id,
      row_number() OVER (
        PARTITION BY bracket_court_id
        ORDER BY planned_start_at, item_id
      )::INTEGER AS queue_position,
      row_number() OVER (
        ORDER BY planned_start_at, court_position, item_id
      )::INTEGER AS scheduled_slot
    FROM day_schedule_reorganization_items
    WHERE planned_start_at IS NOT NULL
  ) AS numbered_items
  WHERE numbered_items.item_id = items_table.item_id;

  SELECT LEAST(day_start_at, COALESCE(min(planned_start_at), day_start_at)),
    GREATEST(day_end_at, COALESCE(max(planned_end_at), day_end_at), COALESCE(next_break_end_at, day_end_at))
  INTO next_day_start_at, next_day_end_at
  FROM day_schedule_reorganization_items;

  IF (next_day_end_at AT TIME ZONE 'America/Sao_Paulo')::DATE > target_date THEN
    blockers := blockers || jsonb_build_array('A reorganização ultrapassa meia-noite e deve ser dividida em outro dia configurado.');
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'item_type', item_type,
      'item_id', item_id,
      'match_id', match_id,
      'placeholder_id', placeholder_id,
      'label', label,
      'is_selected', is_selected,
      'before', jsonb_build_object(
        'scheduled_date', target_date,
        'location', location_name,
        'court_name', court_name,
        'start_time', original_start_at,
        'end_time', original_end_at,
        'queue_position', original_queue_position,
        'scheduled_slot', original_scheduled_slot
      ),
      'after', jsonb_build_object(
        'scheduled_date', target_date,
        'location', location_name,
        'court_name', court_name,
        'location_group_id', location_group_id,
        'court_group_id', court_group_id,
        'start_time', planned_start_at,
        'end_time', planned_end_at,
        'queue_position', planned_queue_position,
        'scheduled_slot', planned_scheduled_slot
      )
    )
    ORDER BY planned_start_at, court_position, item_id
  ), '[]'::JSONB)
  INTO changes
  FROM day_schedule_reorganization_items
  WHERE is_fixed = false
    AND (
      is_selected
      OR original_start_at IS DISTINCT FROM planned_start_at
      OR original_end_at IS DISTINCT FROM planned_end_at
      OR original_queue_position IS DISTINCT FROM planned_queue_position
      OR original_scheduled_slot IS DISTINCT FROM planned_scheduled_slot
    );

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'item_type', item_type,
      'item_id', item_id,
      'match_id', match_id,
      'placeholder_id', placeholder_id,
      'label', label,
      'status', CASE WHEN item_type = 'KNOCKOUT_PLACEHOLDER' THEN 'PLANNED' ELSE 'SCHEDULED' END,
      'start_time', planned_start_at,
      'end_time', planned_end_at,
      'location', location_name,
      'court_name', court_name,
      'is_relocated', is_selected,
      'is_displaced', is_selected = false AND (
        original_start_at IS DISTINCT FROM planned_start_at
        OR original_end_at IS DISTINCT FROM planned_end_at
        OR original_queue_position IS DISTINCT FROM planned_queue_position
        OR original_scheduled_slot IS DISTINCT FROM planned_scheduled_slot
      )
    )
    ORDER BY planned_start_at, court_position, item_id
  ), '[]'::JSONB)
  INTO timeline
  FROM day_schedule_reorganization_items;

  RETURN jsonb_build_object(
    'revision', revision_value,
    'blockers', blockers,
    'changes', changes,
    'timeline', timeline,
    'previous_day_start', previous_day_start,
    'next_day_start', to_char(next_day_start_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
    'advances_day_start', next_day_start_at < day_start_at,
    'previous_day_end', previous_day_end,
    'next_day_end', to_char(next_day_end_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
    'extends_day_end', next_day_end_at > day_end_at,
    'target_date', target_date,
    'target_location', target_location_record.name,
    'target_court_name', target_court_record.name,
    'insertion_position', 'SLOT',
    'strategy', strategy,
    'reason', relocation_reason,
    'notes', relocation_notes,
    'representation_warning', 'A representação e o descanso entre as duas quadras devem ser conferidos na timeline antes da confirmação.',
    'break', jsonb_build_object(
      'policy', break_policy,
      'before', jsonb_build_object(
        'id', primary_break_record.id,
        'start_time', CASE WHEN primary_break_record.id IS NULL THEN NULL ELSE to_char(primary_break_record.break_start_time, 'HH24:MI') END,
        'end_time', CASE WHEN primary_break_record.id IS NULL THEN NULL ELSE to_char(primary_break_record.break_end_time, 'HH24:MI') END
      ),
      'after', jsonb_build_object(
        'start_time', CASE WHEN next_break_start_at IS NULL THEN NULL ELSE to_char(next_break_start_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') END,
        'end_time', CASE WHEN next_break_end_at IS NULL THEN NULL ELSE to_char(next_break_end_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') END
      )
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_day_schedule_reorganization(
  _bracket_edition_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para reorganizar a programação.';
  END IF;

  RETURN public.build_day_schedule_reorganization_preview(_bracket_edition_id, _payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_day_schedule_reorganization(
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
  current_revision BIGINT;
  target_date DATE;
  next_day_start TIME;
  next_day_end TIME;
  primary_break_id UUID;
  break_policy TEXT;
  next_break_start TIME;
  next_break_end TIME;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para reorganizar a programação.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(format('day-schedule-reorganization:%s', _bracket_edition_id), 0));

  SELECT reprogramming_revision
  INTO current_revision
  FROM public.championship_bracket_editions
  WHERE id = _bracket_edition_id
  FOR UPDATE;

  IF current_revision IS NULL THEN
    RAISE EXCEPTION 'Edição de chaveamento inválida.';
  END IF;

  IF current_revision <> _expected_revision THEN
    RAISE EXCEPTION 'A prévia está desatualizada. Calcule novamente antes de confirmar.';
  END IF;

  preview := public.build_day_schedule_reorganization_preview(_bracket_edition_id, _payload);

  IF jsonb_array_length(COALESCE(preview->'blockers', '[]'::JSONB)) > 0 THEN
    RAISE EXCEPTION 'A reorganização possui conflitos e não pode ser aplicada.';
  END IF;

  PERFORM set_config('app.allow_manual_schedule_override_update', 'true', true);
  PERFORM set_config('app.allow_pending_manual_relocation_update', 'true', true);
  PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);

  UPDATE public.matches AS matches_table
  SET
    scheduled_date = changes_table.scheduled_date,
    location = changes_table.location,
    court_name = changes_table.court_name,
    start_time = changes_table.start_time,
    end_time = changes_table.end_time,
    queue_position = changes_table.queue_position,
    scheduled_slot = changes_table.scheduled_slot,
    is_manual_schedule_override = CASE WHEN changes_json.is_selected THEN true ELSE matches_table.is_manual_schedule_override END,
    manual_schedule_override_reason = CASE WHEN changes_json.is_selected THEN preview->>'reason' ELSE matches_table.manual_schedule_override_reason END,
    manual_schedule_override_notes = CASE WHEN changes_json.is_selected THEN NULLIF(preview->>'notes', '') ELSE matches_table.manual_schedule_override_notes END,
    is_pending_manual_relocation = CASE WHEN changes_json.is_selected THEN false ELSE matches_table.is_pending_manual_relocation END,
    pending_manual_relocation_reason = CASE WHEN changes_json.is_selected THEN NULL ELSE matches_table.pending_manual_relocation_reason END,
    pending_manual_relocation_notes = CASE WHEN changes_json.is_selected THEN NULL ELSE matches_table.pending_manual_relocation_notes END,
    pending_manual_relocation_previous_schedule = CASE WHEN changes_json.is_selected THEN NULL ELSE matches_table.pending_manual_relocation_previous_schedule END,
    pending_manual_relocation_previous_label = CASE WHEN changes_json.is_selected THEN NULL ELSE matches_table.pending_manual_relocation_previous_label END,
    pending_manual_relocation_created_by = CASE WHEN changes_json.is_selected THEN NULL ELSE matches_table.pending_manual_relocation_created_by END,
    pending_manual_relocation_at = CASE WHEN changes_json.is_selected THEN NULL ELSE matches_table.pending_manual_relocation_at END
  FROM jsonb_to_recordset(preview->'changes') AS changes_json(item_type TEXT, match_id UUID, is_selected BOOLEAN, after JSONB)
  CROSS JOIN LATERAL jsonb_to_record(changes_json.after) AS changes_table(scheduled_date DATE, location TEXT, court_name TEXT, start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, queue_position INTEGER, scheduled_slot INTEGER)
  WHERE changes_json.item_type = 'MATCH'
    AND matches_table.id = changes_json.match_id;

  UPDATE public.championship_bracket_matches AS bracket_matches_table
  SET
    planned_scheduled_date = changes_table.scheduled_date,
    planned_location_group_id = changes_table.location_group_id,
    planned_court_group_id = changes_table.court_group_id,
    planned_location_name = changes_table.location,
    planned_court_name = changes_table.court_name,
    planned_start_time = (changes_table.start_time AT TIME ZONE 'America/Sao_Paulo')::TIME,
    planned_end_time = (changes_table.end_time AT TIME ZONE 'America/Sao_Paulo')::TIME,
    planned_queue_position = changes_table.queue_position,
    planned_scheduled_slot = changes_table.scheduled_slot
  FROM jsonb_to_recordset(preview->'changes') AS changes_json(item_type TEXT, placeholder_id UUID, after JSONB)
  CROSS JOIN LATERAL jsonb_to_record(changes_json.after) AS changes_table(scheduled_date DATE, location TEXT, court_name TEXT, location_group_id UUID, court_group_id UUID, start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, queue_position INTEGER, scheduled_slot INTEGER)
  WHERE changes_json.item_type = 'KNOCKOUT_PLACEHOLDER'
    AND bracket_matches_table.id = changes_json.placeholder_id
    AND bracket_matches_table.match_id IS NULL;

  target_date := (preview->>'target_date')::DATE;
  next_day_start := (preview->>'next_day_start')::TIME;
  next_day_end := (preview->>'next_day_end')::TIME;
  primary_break_id := NULLIF(preview->'break'->'before'->>'id', '')::UUID;
  break_policy := preview->'break'->>'policy';
  next_break_start := NULLIF(preview->'break'->'after'->>'start_time', '')::TIME;
  next_break_end := NULLIF(preview->'break'->'after'->>'end_time', '')::TIME;

  UPDATE public.championship_bracket_days
  SET
    start_time = LEAST(start_time, next_day_start),
    end_time = GREATEST(end_time, next_day_end)
  WHERE bracket_edition_id = _bracket_edition_id
    AND event_date = target_date;

  IF primary_break_id IS NOT NULL AND break_policy = 'REMOVE' THEN
    DELETE FROM public.championship_bracket_day_breaks
    WHERE id = primary_break_id;
  ELSIF primary_break_id IS NOT NULL AND next_break_start IS NOT NULL AND next_break_end IS NOT NULL THEN
    UPDATE public.championship_bracket_day_breaks
    SET break_start_time = next_break_start,
        break_end_time = next_break_end
    WHERE id = primary_break_id;
  END IF;

  UPDATE public.championship_bracket_days AS days_table
  SET
    break_start_time = (
      SELECT breaks_table.break_start_time
      FROM public.championship_bracket_day_breaks AS breaks_table
      WHERE breaks_table.bracket_day_id = days_table.id
      ORDER BY breaks_table.position, breaks_table.break_start_time
      LIMIT 1
    ),
    break_end_time = (
      SELECT breaks_table.break_end_time
      FROM public.championship_bracket_day_breaks AS breaks_table
      WHERE breaks_table.bracket_day_id = days_table.id
      ORDER BY breaks_table.position, breaks_table.break_start_time
      LIMIT 1
    )
  WHERE days_table.bracket_edition_id = _bracket_edition_id
    AND days_table.event_date = target_date;

  UPDATE public.championship_bracket_editions
  SET reprogramming_revision = reprogramming_revision + 1
  WHERE id = _bracket_edition_id;

  PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
  PERFORM set_config('app.allow_pending_manual_relocation_update', 'false', true);
  PERFORM set_config('app.allow_manual_schedule_override_update', 'false', true);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
    PERFORM set_config('app.allow_pending_manual_relocation_update', 'false', true);
    PERFORM set_config('app.allow_manual_schedule_override_update', 'false', true);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.build_day_schedule_reorganization_preview(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_day_schedule_reorganization(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_day_schedule_reorganization(UUID, JSONB, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_day_schedule_reorganization(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_day_schedule_reorganization(UUID, JSONB, BIGINT) TO authenticated;

NOTIFY pgrst, 'reload schema';
