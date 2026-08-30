CREATE OR REPLACE FUNCTION public.build_manual_match_relocation_slot_preview(
  _bracket_edition_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_match_id UUID;
  selected_match_record RECORD;
  target_date DATE;
  target_location TEXT;
  target_court_name TEXT;
  target_slot_id TEXT;
  target_slot_descriptor TEXT;
  target_anchor_match_id UUID;
  target_anchor_record RECORD;
  target_day_record RECORD;
  target_court_id UUID;
  target_start_at TIMESTAMPTZ;
  current_cursor_at TIMESTAMPTZ;
  planned_end_at TIMESTAMPTZ;
  break_end_at TIMESTAMPTZ;
  plan_record RECORD;
  selected_duration_minutes INTEGER;
  relocation_reason TEXT;
  relocation_notes TEXT;
  revision_value BIGINT;
  slots JSONB := '[]'::JSONB;
  blockers JSONB := '[]'::JSONB;
  changes JSONB := '[]'::JSONB;
  timeline JSONB := '[]'::JSONB;
  previous_day_end TEXT;
  next_day_end TEXT;
  has_rest_conflict BOOLEAN := false;
BEGIN
  SELECT value::UUID
  INTO selected_match_id
  FROM jsonb_array_elements_text(COALESCE(_payload->'match_ids', '[]'::JSONB)) AS value
  LIMIT 1;

  IF jsonb_array_length(COALESCE(_payload->'match_ids', '[]'::JSONB)) <> 1 THEN
    RAISE EXCEPTION 'O encaixe em horário livre aceita somente um jogo agendado.';
  END IF;

  target_date := NULLIF(_payload->>'target_date', '')::DATE;
  target_location := NULLIF(trim(COALESCE(_payload->>'target_location', '')), '');
  target_court_name := NULLIF(trim(COALESCE(_payload->>'target_court_name', '')), '');
  target_slot_id := NULLIF(trim(COALESCE(_payload->>'target_slot_id', '')), '');
  relocation_reason := upper(trim(COALESCE(_payload->>'reason', '')));
  relocation_notes := NULLIF(trim(COALESCE(_payload->>'notes', '')), '');

  IF target_date IS NULL OR target_location IS NULL OR target_court_name IS NULL THEN
    RAISE EXCEPTION 'Informe dia, local e quadra de destino.';
  END IF;

  IF upper(trim(COALESCE(_payload->>'insertion_position', ''))) <> 'SLOT' THEN
    RAISE EXCEPTION 'A posição do encaixe deve ser um horário livre.';
  END IF;

  IF relocation_reason NOT IN ('WEATHER', 'COURT_UNAVAILABLE', 'OPERATIONAL_DELAY', 'SAFETY', 'OTHER') THEN
    RAISE EXCEPTION 'Informe um motivo válido para a realocação.';
  END IF;

  SELECT
    matches_table.*,
    GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1) AS duration_minutes,
    editions_table.reprogramming_revision
  INTO selected_match_record
  FROM public.matches AS matches_table
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = _bracket_edition_id
    AND editions_table.championship_id = matches_table.championship_id
    AND editions_table.season_year = matches_table.season_year
  LEFT JOIN public.championship_sports AS championship_sports_table
    ON championship_sports_table.championship_id = matches_table.championship_id
    AND championship_sports_table.sport_id = matches_table.sport_id
  WHERE matches_table.id = selected_match_id
    AND matches_table.status = 'SCHEDULED'::public.match_status;

  IF selected_match_record.id IS NULL THEN
    RAISE EXCEPTION 'Somente jogos agendados da edição selecionada podem ser encaixados.';
  END IF;

  selected_duration_minutes := selected_match_record.duration_minutes;
  revision_value := selected_match_record.reprogramming_revision;

  SELECT days_table.id, days_table.start_time, days_table.end_time
  INTO target_day_record
  FROM public.championship_bracket_days AS days_table
  WHERE days_table.bracket_edition_id = _bracket_edition_id
    AND days_table.event_date = target_date
  LIMIT 1;

  IF target_day_record.id IS NULL THEN
    RAISE EXCEPTION 'O dia de destino não está configurado na agenda do campeonato.';
  END IF;

  SELECT courts_table.id
  INTO target_court_id
  FROM public.championship_bracket_locations AS locations_table
  JOIN public.championship_bracket_courts AS courts_table
    ON courts_table.bracket_location_id = locations_table.id
  WHERE locations_table.bracket_day_id = target_day_record.id
    AND public.normalize_bracket_entity_name(locations_table.name) = public.normalize_bracket_entity_name(target_location)
    AND public.normalize_bracket_entity_name(courts_table.name) = public.normalize_bracket_entity_name(target_court_name)
  LIMIT 1;

  IF target_court_id IS NULL THEN
    RAISE EXCEPTION 'A quadra de destino não está configurada nesse dia.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.championship_bracket_court_sports AS court_sports_table
    WHERE court_sports_table.bracket_court_id = target_court_id
      AND court_sports_table.sport_id = selected_match_record.sport_id
  ) THEN
    RAISE EXCEPTION 'A quadra de destino não está configurada para esta modalidade.';
  END IF;

  IF target_slot_id IS NULL THEN
    SELECT COALESCE(jsonb_agg(slot_data.value ORDER BY slot_data.start_at, slot_data.position), '[]'::JSONB)
    INTO slots
    FROM (
      SELECT
        candidate_matches_table.start_time AS start_at,
        1 AS position,
        jsonb_build_object(
          'id', encode(convert_to(format('BEFORE:%s', candidate_matches_table.id), 'UTF8'), 'base64'),
          'start_time', GREATEST(
            public.combine_bracket_schedule_timestamp(target_date, target_day_record.start_time),
            COALESCE((
              SELECT max(COALESCE(previous_matches_table.end_time, previous_matches_table.start_time + make_interval(mins => GREATEST(COALESCE(previous_sports_table.default_match_duration_minutes, 35), 1))))
              FROM public.matches AS previous_matches_table
              LEFT JOIN public.championship_sports AS previous_sports_table
                ON previous_sports_table.championship_id = previous_matches_table.championship_id
                AND previous_sports_table.sport_id = previous_matches_table.sport_id
              WHERE previous_matches_table.championship_id = selected_match_record.championship_id
                AND previous_matches_table.season_year = selected_match_record.season_year
                AND previous_matches_table.id <> selected_match_id
                AND previous_matches_table.scheduled_date = target_date
                AND public.normalize_bracket_entity_name(previous_matches_table.location) = public.normalize_bracket_entity_name(target_location)
                AND public.normalize_bracket_entity_name(previous_matches_table.court_name) = public.normalize_bracket_entity_name(target_court_name)
                AND previous_matches_table.start_time < candidate_matches_table.start_time
            ), public.combine_bracket_schedule_timestamp(target_date, target_day_record.start_time))
          ),
          'end_time', GREATEST(
            public.combine_bracket_schedule_timestamp(target_date, target_day_record.start_time),
            COALESCE((
              SELECT max(COALESCE(previous_matches_table.end_time, previous_matches_table.start_time + make_interval(mins => GREATEST(COALESCE(previous_sports_table.default_match_duration_minutes, 35), 1))))
              FROM public.matches AS previous_matches_table
              LEFT JOIN public.championship_sports AS previous_sports_table
                ON previous_sports_table.championship_id = previous_matches_table.championship_id
                AND previous_sports_table.sport_id = previous_matches_table.sport_id
              WHERE previous_matches_table.championship_id = selected_match_record.championship_id
                AND previous_matches_table.season_year = selected_match_record.season_year
                AND previous_matches_table.id <> selected_match_id
                AND previous_matches_table.scheduled_date = target_date
                AND public.normalize_bracket_entity_name(previous_matches_table.location) = public.normalize_bracket_entity_name(target_location)
                AND public.normalize_bracket_entity_name(previous_matches_table.court_name) = public.normalize_bracket_entity_name(target_court_name)
                AND previous_matches_table.start_time < candidate_matches_table.start_time
            ), public.combine_bracket_schedule_timestamp(target_date, target_day_record.start_time))
          ) + make_interval(mins => selected_duration_minutes),
          'next_match_id', candidate_matches_table.id,
          'next_match_label', concat_ws(' x ', home_teams_table.name, away_teams_table.name),
          'displaced_matches_count', (
            SELECT count(*)
            FROM public.matches AS displaced_matches_table
            WHERE displaced_matches_table.championship_id = selected_match_record.championship_id
              AND displaced_matches_table.season_year = selected_match_record.season_year
              AND displaced_matches_table.status = 'SCHEDULED'::public.match_status
              AND displaced_matches_table.id <> selected_match_id
              AND COALESCE(displaced_matches_table.is_manual_schedule_override, false) = false
              AND COALESCE(displaced_matches_table.is_pending_manual_relocation, false) = false
              AND displaced_matches_table.scheduled_date = target_date
              AND public.normalize_bracket_entity_name(displaced_matches_table.location) = public.normalize_bracket_entity_name(target_location)
              AND public.normalize_bracket_entity_name(displaced_matches_table.court_name) = public.normalize_bracket_entity_name(target_court_name)
              AND displaced_matches_table.start_time >= candidate_matches_table.start_time
          ),
          'is_free_gap', candidate_matches_table.start_time >= GREATEST(
            public.combine_bracket_schedule_timestamp(target_date, target_day_record.start_time),
            COALESCE((
              SELECT max(COALESCE(previous_matches_table.end_time, previous_matches_table.start_time + make_interval(mins => GREATEST(COALESCE(previous_sports_table.default_match_duration_minutes, 35), 1))))
              FROM public.matches AS previous_matches_table
              LEFT JOIN public.championship_sports AS previous_sports_table
                ON previous_sports_table.championship_id = previous_matches_table.championship_id
                AND previous_sports_table.sport_id = previous_matches_table.sport_id
              WHERE previous_matches_table.championship_id = selected_match_record.championship_id
                AND previous_matches_table.season_year = selected_match_record.season_year
                AND previous_matches_table.id <> selected_match_id
                AND previous_matches_table.scheduled_date = target_date
                AND public.normalize_bracket_entity_name(previous_matches_table.location) = public.normalize_bracket_entity_name(target_location)
                AND public.normalize_bracket_entity_name(previous_matches_table.court_name) = public.normalize_bracket_entity_name(target_court_name)
                AND previous_matches_table.start_time < candidate_matches_table.start_time
            ), public.combine_bracket_schedule_timestamp(target_date, target_day_record.start_time))
          ) + make_interval(mins => selected_duration_minutes),
          'is_projected_from_live_match', EXISTS (
            SELECT 1
            FROM public.matches AS live_matches_table
            WHERE live_matches_table.championship_id = selected_match_record.championship_id
              AND live_matches_table.season_year = selected_match_record.season_year
              AND live_matches_table.status = 'LIVE'::public.match_status
              AND live_matches_table.scheduled_date = target_date
              AND public.normalize_bracket_entity_name(live_matches_table.location) = public.normalize_bracket_entity_name(target_location)
              AND public.normalize_bracket_entity_name(live_matches_table.court_name) = public.normalize_bracket_entity_name(target_court_name)
              AND live_matches_table.start_time < candidate_matches_table.start_time
          )
        ) AS value
      FROM public.matches AS candidate_matches_table
      LEFT JOIN public.teams AS home_teams_table ON home_teams_table.id = candidate_matches_table.home_team_id
      LEFT JOIN public.teams AS away_teams_table ON away_teams_table.id = candidate_matches_table.away_team_id
      WHERE candidate_matches_table.championship_id = selected_match_record.championship_id
        AND candidate_matches_table.season_year = selected_match_record.season_year
        AND candidate_matches_table.status = 'SCHEDULED'::public.match_status
        AND candidate_matches_table.id <> selected_match_id
        AND COALESCE(candidate_matches_table.is_manual_schedule_override, false) = false
        AND COALESCE(candidate_matches_table.is_pending_manual_relocation, false) = false
        AND candidate_matches_table.scheduled_date = target_date
        AND public.normalize_bracket_entity_name(candidate_matches_table.location) = public.normalize_bracket_entity_name(target_location)
        AND public.normalize_bracket_entity_name(candidate_matches_table.court_name) = public.normalize_bracket_entity_name(target_court_name)

      UNION ALL

      SELECT
        COALESCE(max(COALESCE(existing_matches_table.end_time, existing_matches_table.start_time + make_interval(mins => GREATEST(COALESCE(existing_sports_table.default_match_duration_minutes, 35), 1)))), public.combine_bracket_schedule_timestamp(target_date, target_day_record.start_time)),
        2,
        jsonb_build_object(
          'id', encode(convert_to('END', 'UTF8'), 'base64'),
          'start_time', COALESCE(max(COALESCE(existing_matches_table.end_time, existing_matches_table.start_time + make_interval(mins => GREATEST(COALESCE(existing_sports_table.default_match_duration_minutes, 35), 1)))), public.combine_bracket_schedule_timestamp(target_date, target_day_record.start_time)),
          'end_time', COALESCE(max(COALESCE(existing_matches_table.end_time, existing_matches_table.start_time + make_interval(mins => GREATEST(COALESCE(existing_sports_table.default_match_duration_minutes, 35), 1)))), public.combine_bracket_schedule_timestamp(target_date, target_day_record.start_time)) + make_interval(mins => selected_duration_minutes),
          'next_match_id', NULL,
          'next_match_label', NULL,
          'displaced_matches_count', 0,
          'is_free_gap', true,
          'is_projected_from_live_match', EXISTS (
            SELECT 1 FROM public.matches AS live_matches_table
            WHERE live_matches_table.championship_id = selected_match_record.championship_id
              AND live_matches_table.season_year = selected_match_record.season_year
              AND live_matches_table.status = 'LIVE'::public.match_status
              AND live_matches_table.scheduled_date = target_date
              AND public.normalize_bracket_entity_name(live_matches_table.location) = public.normalize_bracket_entity_name(target_location)
              AND public.normalize_bracket_entity_name(live_matches_table.court_name) = public.normalize_bracket_entity_name(target_court_name)
          )
        )
      FROM public.matches AS existing_matches_table
      LEFT JOIN public.championship_sports AS existing_sports_table
        ON existing_sports_table.championship_id = existing_matches_table.championship_id
        AND existing_sports_table.sport_id = existing_matches_table.sport_id
      WHERE existing_matches_table.championship_id = selected_match_record.championship_id
        AND existing_matches_table.season_year = selected_match_record.season_year
        AND existing_matches_table.id <> selected_match_id
        AND existing_matches_table.scheduled_date = target_date
        AND public.normalize_bracket_entity_name(existing_matches_table.location) = public.normalize_bracket_entity_name(target_location)
        AND public.normalize_bracket_entity_name(existing_matches_table.court_name) = public.normalize_bracket_entity_name(target_court_name)
    ) AS slot_data;

    RETURN jsonb_build_object(
      'revision', revision_value,
      'blockers', '[]'::JSONB,
      'changes', '[]'::JSONB,
      'timeline', '[]'::JSONB,
      'slots', slots,
      'previous_day_start', to_char(public.combine_bracket_schedule_timestamp(target_date, target_day_record.start_time) AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
      'next_day_start', to_char(public.combine_bracket_schedule_timestamp(target_date, target_day_record.start_time) AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
      'advances_day_start', false,
      'previous_day_end', to_char(public.combine_bracket_schedule_timestamp(target_date, target_day_record.end_time) AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
      'next_day_end', to_char(public.combine_bracket_schedule_timestamp(target_date, target_day_record.end_time) AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
      'extends_day_end', false,
      'target_date', target_date,
      'target_location', target_location,
      'target_court_name', target_court_name,
      'insertion_position', 'SLOT',
      'reason', relocation_reason,
      'notes', relocation_notes,
      'representation_warning', NULL
    );
  END IF;

  target_slot_descriptor := convert_from(decode(target_slot_id, 'base64'), 'UTF8');

  IF target_slot_descriptor = 'END' THEN
    SELECT GREATEST(
      public.combine_bracket_schedule_timestamp(target_date, target_day_record.start_time),
      COALESCE(max(COALESCE(matches_table.end_time, matches_table.start_time + make_interval(mins => GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1)))), public.combine_bracket_schedule_timestamp(target_date, target_day_record.start_time))
    )
    INTO current_cursor_at
    FROM public.matches AS matches_table
    LEFT JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = matches_table.championship_id
      AND championship_sports_table.sport_id = matches_table.sport_id
    WHERE matches_table.championship_id = selected_match_record.championship_id
      AND matches_table.season_year = selected_match_record.season_year
      AND matches_table.id <> selected_match_id
      AND matches_table.scheduled_date = target_date
      AND public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(target_location)
      AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(target_court_name);
  ELSE
    target_anchor_match_id := NULLIF(split_part(target_slot_descriptor, ':', 2), '')::UUID;

    SELECT matches_table.*
    INTO target_anchor_record
    FROM public.matches AS matches_table
    WHERE matches_table.id = target_anchor_match_id
      AND matches_table.championship_id = selected_match_record.championship_id
      AND matches_table.season_year = selected_match_record.season_year
      AND matches_table.status = 'SCHEDULED'::public.match_status
      AND COALESCE(matches_table.is_manual_schedule_override, false) = false
      AND COALESCE(matches_table.is_pending_manual_relocation, false) = false
      AND matches_table.scheduled_date = target_date
      AND public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(target_location)
      AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(target_court_name);

    IF target_anchor_record.id IS NULL OR target_slot_descriptor NOT LIKE 'BEFORE:%' THEN
      RAISE EXCEPTION 'O horário livre selecionado não está mais disponível. Busque os horários novamente.';
    END IF;

    target_start_at := target_anchor_record.start_time;

    SELECT GREATEST(
      public.combine_bracket_schedule_timestamp(target_date, target_day_record.start_time),
      COALESCE(max(COALESCE(matches_table.end_time, matches_table.start_time + make_interval(mins => GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1)))), public.combine_bracket_schedule_timestamp(target_date, target_day_record.start_time))
    )
    INTO current_cursor_at
    FROM public.matches AS matches_table
    LEFT JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = matches_table.championship_id
      AND championship_sports_table.sport_id = matches_table.sport_id
    WHERE matches_table.championship_id = selected_match_record.championship_id
      AND matches_table.season_year = selected_match_record.season_year
      AND matches_table.id <> selected_match_id
      AND matches_table.scheduled_date = target_date
      AND public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(target_location)
      AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(target_court_name)
      AND matches_table.start_time < target_start_at;
  END IF;

  CREATE TEMP TABLE manual_match_relocation_slot_plan (
    match_id UUID PRIMARY KEY,
    is_selected BOOLEAN NOT NULL,
    source_order INTEGER NOT NULL,
    championship_id UUID NOT NULL,
    season_year INTEGER NOT NULL,
    sport_id UUID NOT NULL,
    naipe public.match_naipe NOT NULL,
    home_team_id UUID NOT NULL,
    away_team_id UUID NOT NULL,
    duration_minutes INTEGER NOT NULL,
    old_scheduled_date DATE NULL,
    old_location TEXT NULL,
    old_court_name TEXT NULL,
    old_start_time TIMESTAMPTZ NULL,
    old_end_time TIMESTAMPTZ NULL,
    old_queue_position INTEGER NULL,
    old_scheduled_slot INTEGER NULL,
    new_start_time TIMESTAMPTZ NULL,
    new_end_time TIMESTAMPTZ NULL,
    new_queue_position INTEGER NULL,
    new_scheduled_slot INTEGER NULL
  ) ON COMMIT DROP;

  INSERT INTO manual_match_relocation_slot_plan (
    match_id, is_selected, source_order, championship_id, season_year, sport_id, naipe,
    home_team_id, away_team_id, duration_minutes, old_scheduled_date, old_location,
    old_court_name, old_start_time, old_end_time, old_queue_position, old_scheduled_slot
  ) VALUES (
    selected_match_record.id, true, 0, selected_match_record.championship_id,
    selected_match_record.season_year, selected_match_record.sport_id, selected_match_record.naipe,
    selected_match_record.home_team_id, selected_match_record.away_team_id, selected_duration_minutes,
    selected_match_record.scheduled_date, selected_match_record.location, selected_match_record.court_name,
    selected_match_record.start_time, selected_match_record.end_time, selected_match_record.queue_position,
    selected_match_record.scheduled_slot
  );

  IF target_slot_descriptor <> 'END' THEN
    INSERT INTO manual_match_relocation_slot_plan (
      match_id, is_selected, source_order, championship_id, season_year, sport_id, naipe,
      home_team_id, away_team_id, duration_minutes, old_scheduled_date, old_location,
      old_court_name, old_start_time, old_end_time, old_queue_position, old_scheduled_slot
    )
    SELECT
      matches_table.id, false,
      row_number() OVER (ORDER BY matches_table.start_time, COALESCE(matches_table.scheduled_slot, matches_table.queue_position), matches_table.created_at, matches_table.id),
      matches_table.championship_id, matches_table.season_year, matches_table.sport_id, matches_table.naipe,
      matches_table.home_team_id, matches_table.away_team_id,
      GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1),
      matches_table.scheduled_date, matches_table.location, matches_table.court_name, matches_table.start_time,
      matches_table.end_time, matches_table.queue_position, matches_table.scheduled_slot
    FROM public.matches AS matches_table
    LEFT JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = matches_table.championship_id
      AND championship_sports_table.sport_id = matches_table.sport_id
    WHERE matches_table.championship_id = selected_match_record.championship_id
      AND matches_table.season_year = selected_match_record.season_year
      AND matches_table.status = 'SCHEDULED'::public.match_status
      AND matches_table.id <> selected_match_id
      AND COALESCE(matches_table.is_manual_schedule_override, false) = false
      AND COALESCE(matches_table.is_pending_manual_relocation, false) = false
      AND matches_table.scheduled_date = target_date
      AND public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(target_location)
      AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(target_court_name)
      AND matches_table.start_time >= target_start_at;
  END IF;

  FOR plan_record IN
    SELECT * FROM manual_match_relocation_slot_plan ORDER BY source_order
  LOOP
    IF NOT plan_record.is_selected THEN
      current_cursor_at := GREATEST(current_cursor_at, plan_record.old_start_time);
    END IF;

    LOOP
      SELECT public.combine_bracket_schedule_timestamp(target_date, breaks_table.break_end_time)
      INTO break_end_at
      FROM public.championship_bracket_day_breaks AS breaks_table
      WHERE breaks_table.bracket_day_id = target_day_record.id
        AND (breaks_table.scope_type = 'ALL_COURTS' OR (breaks_table.scope_type = 'COURT' AND breaks_table.bracket_court_id = target_court_id))
        AND current_cursor_at < public.combine_bracket_schedule_timestamp(target_date, breaks_table.break_end_time)
        AND current_cursor_at + make_interval(mins => plan_record.duration_minutes) > public.combine_bracket_schedule_timestamp(target_date, breaks_table.break_start_time)
      ORDER BY breaks_table.position, breaks_table.break_start_time
      LIMIT 1;

      EXIT WHEN break_end_at IS NULL;
      current_cursor_at := break_end_at;
      break_end_at := NULL;
    END LOOP;

    planned_end_at := current_cursor_at + make_interval(mins => plan_record.duration_minutes);
    UPDATE manual_match_relocation_slot_plan
    SET new_start_time = current_cursor_at, new_end_time = planned_end_at
    WHERE match_id = plan_record.match_id;
    current_cursor_at := planned_end_at;
  END LOOP;

  UPDATE manual_match_relocation_slot_plan AS plan_table
  SET new_queue_position = numbered_matches.position,
      new_scheduled_slot = numbered_matches.slot
  FROM (
    SELECT
      plan_table.match_id,
      (
        COALESCE((
          SELECT count(*)
          FROM public.matches AS previous_matches_table
          WHERE previous_matches_table.championship_id = selected_match_record.championship_id
            AND previous_matches_table.season_year = selected_match_record.season_year
            AND previous_matches_table.scheduled_date = target_date
            AND public.normalize_bracket_entity_name(previous_matches_table.location) = public.normalize_bracket_entity_name(target_location)
            AND public.normalize_bracket_entity_name(previous_matches_table.court_name) = public.normalize_bracket_entity_name(target_court_name)
            AND previous_matches_table.id NOT IN (SELECT match_id FROM manual_match_relocation_slot_plan)
            AND previous_matches_table.start_time < plan_table.new_start_time
        ), 0) + row_number() OVER (ORDER BY plan_table.new_start_time, plan_table.source_order)
      )::INTEGER AS position,
      (
        COALESCE((
          SELECT max(previous_matches_table.scheduled_slot)
          FROM public.matches AS previous_matches_table
          WHERE previous_matches_table.championship_id = selected_match_record.championship_id
            AND previous_matches_table.season_year = selected_match_record.season_year
            AND previous_matches_table.scheduled_date = target_date
            AND previous_matches_table.id NOT IN (SELECT match_id FROM manual_match_relocation_slot_plan)
        ), 0) + row_number() OVER (ORDER BY plan_table.new_start_time, plan_table.source_order)
      )::INTEGER AS slot
    FROM manual_match_relocation_slot_plan AS plan_table
  ) AS numbered_matches
  WHERE plan_table.match_id = numbered_matches.match_id;

  IF EXISTS (
    SELECT 1
    FROM manual_match_relocation_slot_plan AS plan_table
    JOIN public.matches AS other_matches_table
      ON other_matches_table.championship_id = plan_table.championship_id
      AND other_matches_table.season_year = plan_table.season_year
      AND other_matches_table.scheduled_date = target_date
      AND other_matches_table.id NOT IN (SELECT match_id FROM manual_match_relocation_slot_plan)
      AND public.normalize_bracket_entity_name(other_matches_table.location) = public.normalize_bracket_entity_name(target_location)
      AND public.normalize_bracket_entity_name(other_matches_table.court_name) = public.normalize_bracket_entity_name(target_court_name)
      AND other_matches_table.start_time < plan_table.new_end_time
      AND COALESCE(
        other_matches_table.end_time,
        other_matches_table.start_time + interval '35 minutes'
      ) > plan_table.new_start_time
  ) THEN
    blockers := blockers || jsonb_build_array('O encaixe cria sobreposição física com uma ocupação fixa da quadra.');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM manual_match_relocation_slot_plan AS first_plan
    JOIN manual_match_relocation_slot_plan AS second_plan
      ON first_plan.match_id < second_plan.match_id
    WHERE (first_plan.home_team_id IN (second_plan.home_team_id, second_plan.away_team_id) OR first_plan.away_team_id IN (second_plan.home_team_id, second_plan.away_team_id))
      AND public.is_championship_team_rest_gap_conflict(first_plan.naipe, second_plan.naipe, true, first_plan.new_queue_position, second_plan.new_queue_position, first_plan.new_start_time, second_plan.new_start_time, first_plan.duration_minutes, second_plan.duration_minutes, false)
  ) INTO has_rest_conflict;

  IF has_rest_conflict THEN
    blockers := blockers || jsonb_build_array('O encaixe não preserva o descanso mínimo entre atléticas na quadra de destino.');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM manual_match_relocation_slot_plan AS plan_table
    JOIN public.matches AS other_matches_table
      ON other_matches_table.championship_id = plan_table.championship_id
      AND other_matches_table.season_year = plan_table.season_year
      AND other_matches_table.scheduled_date = target_date
      AND other_matches_table.id NOT IN (SELECT match_id FROM manual_match_relocation_slot_plan)
      AND (other_matches_table.home_team_id IN (plan_table.home_team_id, plan_table.away_team_id) OR other_matches_table.away_team_id IN (plan_table.home_team_id, plan_table.away_team_id))
    LEFT JOIN public.championship_sports AS other_sports_table
      ON other_sports_table.championship_id = other_matches_table.championship_id
      AND other_sports_table.sport_id = other_matches_table.sport_id
    WHERE public.is_championship_team_rest_gap_conflict(
      plan_table.naipe, other_matches_table.naipe,
      public.normalize_bracket_entity_name(other_matches_table.location) = public.normalize_bracket_entity_name(target_location)
        AND public.normalize_bracket_entity_name(other_matches_table.court_name) = public.normalize_bracket_entity_name(target_court_name),
      plan_table.new_queue_position, other_matches_table.queue_position,
      plan_table.new_start_time, other_matches_table.start_time,
      plan_table.duration_minutes, GREATEST(COALESCE(other_sports_table.default_match_duration_minutes, 35), 1), false
    )
  ) INTO has_rest_conflict;

  IF has_rest_conflict THEN
    blockers := blockers || jsonb_build_array('O encaixe não preserva o descanso mínimo em relação aos demais jogos.');
  END IF;

  SELECT to_char(public.combine_bracket_schedule_timestamp(target_date, target_day_record.end_time) AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') INTO previous_day_end;
  SELECT to_char(GREATEST(public.combine_bracket_schedule_timestamp(target_date, target_day_record.end_time), COALESCE(max(new_end_time), public.combine_bracket_schedule_timestamp(target_date, target_day_record.end_time))) AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') INTO next_day_end FROM manual_match_relocation_slot_plan;

  IF EXISTS (SELECT 1 FROM manual_match_relocation_slot_plan WHERE (new_end_time AT TIME ZONE 'America/Sao_Paulo')::DATE > target_date) THEN
    blockers := blockers || jsonb_build_array('O encaixe ultrapassa meia-noite e deve ser dividido em outro dia configurado.');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'match_id', plan_table.match_id,
    'is_selected', plan_table.is_selected,
    'before', jsonb_build_object('scheduled_date', plan_table.old_scheduled_date, 'location', plan_table.old_location, 'court_name', plan_table.old_court_name, 'start_time', plan_table.old_start_time, 'end_time', plan_table.old_end_time, 'queue_position', plan_table.old_queue_position, 'scheduled_slot', plan_table.old_scheduled_slot),
    'after', jsonb_build_object('scheduled_date', target_date, 'location', target_location, 'court_name', target_court_name, 'start_time', plan_table.new_start_time, 'end_time', plan_table.new_end_time, 'queue_position', plan_table.new_queue_position, 'scheduled_slot', plan_table.new_scheduled_slot)
  ) ORDER BY plan_table.new_start_time, plan_table.source_order), '[]'::JSONB)
  INTO changes
  FROM manual_match_relocation_slot_plan AS plan_table;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'match_id', matches_table.id,
    'status', matches_table.status,
    'start_time', COALESCE(plan_table.new_start_time, matches_table.start_time),
    'end_time', COALESCE(plan_table.new_end_time, matches_table.end_time),
    'location', COALESCE(CASE WHEN plan_table.match_id IS NOT NULL THEN target_location END, matches_table.location),
    'court_name', COALESCE(CASE WHEN plan_table.match_id IS NOT NULL THEN target_court_name END, matches_table.court_name),
    'is_relocated', COALESCE(plan_table.is_selected, false),
    'is_displaced', COALESCE(plan_table.is_selected, false) = false AND plan_table.match_id IS NOT NULL
  ) ORDER BY COALESCE(plan_table.new_start_time, matches_table.start_time), matches_table.id), '[]'::JSONB)
  INTO timeline
  FROM public.matches AS matches_table
  LEFT JOIN manual_match_relocation_slot_plan AS plan_table ON plan_table.match_id = matches_table.id
  WHERE matches_table.championship_id = selected_match_record.championship_id
    AND matches_table.season_year = selected_match_record.season_year
    AND matches_table.scheduled_date = target_date
    AND public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(target_location)
    AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(target_court_name);

  IF NOT EXISTS (SELECT 1 FROM public.matches WHERE id = selected_match_id AND scheduled_date = target_date AND public.normalize_bracket_entity_name(location) = public.normalize_bracket_entity_name(target_location) AND public.normalize_bracket_entity_name(court_name) = public.normalize_bracket_entity_name(target_court_name)) THEN
    timeline := timeline || jsonb_build_array(jsonb_build_object('match_id', selected_match_id, 'status', 'SCHEDULED', 'start_time', (SELECT new_start_time FROM manual_match_relocation_slot_plan WHERE is_selected), 'end_time', (SELECT new_end_time FROM manual_match_relocation_slot_plan WHERE is_selected), 'location', target_location, 'court_name', target_court_name, 'is_relocated', true, 'is_displaced', false));
  END IF;

  RETURN jsonb_build_object(
    'revision', revision_value,
    'blockers', blockers,
    'changes', changes,
    'timeline', timeline,
    'slots', slots,
    'previous_day_start', to_char(public.combine_bracket_schedule_timestamp(target_date, target_day_record.start_time) AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
    'next_day_start', to_char(public.combine_bracket_schedule_timestamp(target_date, target_day_record.start_time) AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
    'advances_day_start', false,
    'previous_day_end', previous_day_end,
    'next_day_end', next_day_end,
    'extends_day_end', next_day_end > previous_day_end,
    'target_date', target_date,
    'target_location', target_location,
    'target_court_name', target_court_name,
    'insertion_position', 'SLOT',
    'reason', relocation_reason,
    'notes', relocation_notes,
    'representation_warning', 'A representação dos jogos encaixados e reposicionados deve ser conferida na timeline antes da confirmação.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_manual_match_relocation_slot(
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
    RAISE EXCEPTION 'Usuário sem permissão para realocar jogos.';
  END IF;

  RETURN public.build_manual_match_relocation_slot_preview(_bracket_edition_id, _payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_manual_match_relocation_slot(
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
  target_day_end TIME;
  calculated_day_end TIME;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para realocar jogos.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(format('manual-match-relocation-slot:%s', _bracket_edition_id), 0));

  SELECT reprogramming_revision INTO current_revision
  FROM public.championship_bracket_editions
  WHERE id = _bracket_edition_id
  FOR UPDATE;

  IF current_revision IS NULL THEN
    RAISE EXCEPTION 'Edição de chaveamento inválida.';
  END IF;

  IF current_revision <> _expected_revision THEN
    RAISE EXCEPTION 'A prévia está desatualizada. Calcule novamente antes de confirmar.';
  END IF;

  preview := public.build_manual_match_relocation_slot_preview(_bracket_edition_id, _payload);

  IF jsonb_array_length(COALESCE(preview->'blockers', '[]'::JSONB)) > 0 THEN
    RAISE EXCEPTION 'O encaixe possui conflitos e não pode ser aplicado.';
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
  FROM jsonb_to_recordset(preview->'changes') AS changes_json(match_id UUID, is_selected BOOLEAN, after JSONB)
  CROSS JOIN LATERAL jsonb_to_record(changes_json.after) AS changes_table(scheduled_date DATE, location TEXT, court_name TEXT, start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, queue_position INTEGER, scheduled_slot INTEGER)
  WHERE matches_table.id = changes_json.match_id;

  target_date := (preview->>'target_date')::DATE;
  SELECT end_time INTO target_day_end
  FROM public.championship_bracket_days
  WHERE bracket_edition_id = _bracket_edition_id AND event_date = target_date
  FOR UPDATE;

  calculated_day_end := (preview->>'next_day_end')::TIME;
  IF calculated_day_end > target_day_end THEN
    UPDATE public.championship_bracket_days
    SET end_time = calculated_day_end
    WHERE bracket_edition_id = _bracket_edition_id AND event_date = target_date;
  END IF;

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

REVOKE ALL ON FUNCTION public.build_manual_match_relocation_slot_preview(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_manual_match_relocation_slot(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_manual_match_relocation_slot(UUID, JSONB, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_manual_match_relocation_slot(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_manual_match_relocation_slot(UUID, JSONB, BIGINT) TO authenticated;

NOTIFY pgrst, 'reload schema';
