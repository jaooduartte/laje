ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS is_manual_schedule_override BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_schedule_override_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS manual_schedule_override_notes TEXT NULL;

ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_manual_schedule_override_reason_check;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_manual_schedule_override_reason_check CHECK (
    (
      is_manual_schedule_override = false
      AND manual_schedule_override_reason IS NULL
      AND manual_schedule_override_notes IS NULL
    )
    OR (
      is_manual_schedule_override = true
      AND manual_schedule_override_reason IN (
        'WEATHER',
        'COURT_UNAVAILABLE',
        'OPERATIONAL_DELAY',
        'SAFETY',
        'OTHER'
      )
    )
  );

CREATE OR REPLACE FUNCTION public.build_manual_match_relocation_preview(
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
  insertion_position TEXT;
  relocation_reason TEXT;
  relocation_notes TEXT;
  bracket_edition_record RECORD;
  target_day_record RECORD;
  target_court_id UUID;
  target_day_end_at TIMESTAMPTZ;
  current_cursor_at TIMESTAMPTZ;
  planned_end_at TIMESTAMPTZ;
  break_end_at TIMESTAMPTZ;
  plan_record RECORD;
  blockers JSONB := '[]'::JSONB;
  changes JSONB := '[]'::JSONB;
  timeline JSONB := '[]'::JSONB;
  revision_value BIGINT;
  previous_day_end TEXT;
  next_day_end TEXT;
  has_rest_conflict BOOLEAN := false;
BEGIN
  SELECT array_agg(value::UUID)
  INTO selected_match_ids
  FROM jsonb_array_elements_text(COALESCE(_payload->'match_ids', '[]'::JSONB)) AS value;

  target_date := NULLIF(_payload->>'target_date', '')::DATE;
  target_location := NULLIF(trim(COALESCE(_payload->>'target_location', '')), '');
  target_court_name := NULLIF(trim(COALESCE(_payload->>'target_court_name', '')), '');
  insertion_position := upper(trim(COALESCE(_payload->>'insertion_position', '')));
  relocation_reason := upper(trim(COALESCE(_payload->>'reason', '')));
  relocation_notes := NULLIF(trim(COALESCE(_payload->>'notes', '')), '');

  IF COALESCE(cardinality(selected_match_ids), 0) = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos um jogo agendado para realocar.';
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

  IF insertion_position NOT IN ('START', 'END') THEN
    RAISE EXCEPTION 'A posição da fila deve ser início ou fim.';
  END IF;

  IF relocation_reason NOT IN ('WEATHER', 'COURT_UNAVAILABLE', 'OPERATIONAL_DELAY', 'SAFETY', 'OTHER') THEN
    RAISE EXCEPTION 'Informe um motivo válido para a realocação.';
  END IF;

  SELECT championship_id, season_year, reprogramming_revision
  INTO bracket_edition_record
  FROM public.championship_bracket_editions
  WHERE id = _bracket_edition_id
  LIMIT 1;

  IF bracket_edition_record.championship_id IS NULL THEN
    RAISE EXCEPTION 'Edição de chaveamento inválida.';
  END IF;

  SELECT count(*), min(championship_id), min(season_year)
  INTO selected_matches_count, selected_championship_id, selected_season_year
  FROM public.matches
  WHERE id = ANY(selected_match_ids)
    AND status = 'SCHEDULED'::public.match_status;

  IF selected_matches_count <> cardinality(selected_match_ids) THEN
    RAISE EXCEPTION 'Somente jogos agendados podem ser realocados.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.matches
    WHERE id = ANY(selected_match_ids)
      AND (championship_id <> selected_championship_id OR season_year <> selected_season_year)
  ) OR selected_championship_id IS DISTINCT FROM bracket_edition_record.championship_id
    OR selected_season_year IS DISTINCT FROM bracket_edition_record.season_year THEN
    RAISE EXCEPTION 'Todos os jogos precisam pertencer à edição selecionada.';
  END IF;

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

  IF EXISTS (
    SELECT 1
    FROM public.matches AS selected_matches_table
    WHERE selected_matches_table.id = ANY(selected_match_ids)
      AND NOT EXISTS (
        SELECT 1
        FROM public.championship_bracket_court_sports AS court_sports_table
        WHERE court_sports_table.bracket_court_id = target_court_id
          AND court_sports_table.sport_id = selected_matches_table.sport_id
      )
  ) THEN
    RAISE EXCEPTION 'A quadra de destino não está configurada para todas as modalidades selecionadas.';
  END IF;

  DROP TABLE IF EXISTS pg_temp.manual_match_relocation_plan;
  CREATE TEMP TABLE manual_match_relocation_plan (
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

  INSERT INTO manual_match_relocation_plan (
    match_id, is_selected, source_order, championship_id, season_year, sport_id, naipe,
    home_team_id, away_team_id, duration_minutes, old_scheduled_date, old_location,
    old_court_name, old_start_time, old_end_time, old_queue_position, old_scheduled_slot
  )
  SELECT
    matches_table.id,
    true,
    row_number() OVER (
      ORDER BY matches_table.scheduled_date, matches_table.start_time,
        COALESCE(matches_table.scheduled_slot, matches_table.queue_position), matches_table.created_at, matches_table.id
    ),
    matches_table.championship_id,
    matches_table.season_year,
    matches_table.sport_id,
    matches_table.naipe,
    matches_table.home_team_id,
    matches_table.away_team_id,
    GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1),
    matches_table.scheduled_date,
    matches_table.location,
    matches_table.court_name,
    matches_table.start_time,
    matches_table.end_time,
    matches_table.queue_position,
    matches_table.scheduled_slot
  FROM public.matches AS matches_table
  LEFT JOIN public.championship_sports AS championship_sports_table
    ON championship_sports_table.championship_id = matches_table.championship_id
    AND championship_sports_table.sport_id = matches_table.sport_id
  WHERE matches_table.id = ANY(selected_match_ids);

  IF insertion_position = 'START' THEN
    INSERT INTO manual_match_relocation_plan (
      match_id, is_selected, source_order, championship_id, season_year, sport_id, naipe,
      home_team_id, away_team_id, duration_minutes, old_scheduled_date, old_location,
      old_court_name, old_start_time, old_end_time, old_queue_position, old_scheduled_slot
    )
    SELECT
      matches_table.id,
      false,
      100000 + row_number() OVER (
        ORDER BY matches_table.start_time, COALESCE(matches_table.scheduled_slot, matches_table.queue_position), matches_table.created_at, matches_table.id
      ),
      matches_table.championship_id,
      matches_table.season_year,
      matches_table.sport_id,
      matches_table.naipe,
      matches_table.home_team_id,
      matches_table.away_team_id,
      GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1),
      matches_table.scheduled_date,
      matches_table.location,
      matches_table.court_name,
      matches_table.start_time,
      matches_table.end_time,
      matches_table.queue_position,
      matches_table.scheduled_slot
    FROM public.matches AS matches_table
    LEFT JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = matches_table.championship_id
      AND championship_sports_table.sport_id = matches_table.sport_id
    WHERE matches_table.championship_id = selected_championship_id
      AND matches_table.season_year = selected_season_year
      AND matches_table.status = 'SCHEDULED'::public.match_status
      AND matches_table.id <> ALL(selected_match_ids)
      AND COALESCE(matches_table.is_manual_schedule_override, false) = false
      AND matches_table.scheduled_date = target_date
      AND public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(target_location)
      AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(target_court_name);
  END IF;

  IF insertion_position = 'END' THEN
    SELECT GREATEST(
      public.combine_bracket_schedule_timestamp(target_date, target_day_record.start_time),
      COALESCE(max(COALESCE(matches_table.end_time, matches_table.start_time + make_interval(mins => GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1)))), public.combine_bracket_schedule_timestamp(target_date, target_day_record.start_time))
    )
    INTO current_cursor_at
    FROM public.matches AS matches_table
    LEFT JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = matches_table.championship_id
      AND championship_sports_table.sport_id = matches_table.sport_id
    WHERE matches_table.championship_id = selected_championship_id
      AND matches_table.season_year = selected_season_year
      AND matches_table.id <> ALL(selected_match_ids)
      AND matches_table.scheduled_date = target_date
      AND public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(target_location)
      AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(target_court_name);
  ELSE
    SELECT GREATEST(
      public.combine_bracket_schedule_timestamp(target_date, target_day_record.start_time),
      COALESCE(max(COALESCE(matches_table.end_time, matches_table.start_time + make_interval(mins => GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1)))), public.combine_bracket_schedule_timestamp(target_date, target_day_record.start_time))
    )
    INTO current_cursor_at
    FROM public.matches AS matches_table
    LEFT JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = matches_table.championship_id
      AND championship_sports_table.sport_id = matches_table.sport_id
    WHERE matches_table.championship_id = selected_championship_id
      AND matches_table.season_year = selected_season_year
      AND matches_table.id <> ALL(selected_match_ids)
      AND (
        matches_table.status <> 'SCHEDULED'::public.match_status
        OR COALESCE(matches_table.is_manual_schedule_override, false)
      )
      AND matches_table.scheduled_date = target_date
      AND public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(target_location)
      AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(target_court_name);
  END IF;

  FOR plan_record IN
    SELECT *
    FROM manual_match_relocation_plan
    WHERE insertion_position = 'START' OR is_selected = true
    ORDER BY source_order
  LOOP
    LOOP
      SELECT public.combine_bracket_schedule_timestamp(target_date, breaks_table.break_end_time)
      INTO break_end_at
      FROM public.championship_bracket_day_breaks AS breaks_table
      WHERE breaks_table.bracket_day_id = target_day_record.id
        AND (
          breaks_table.scope_type = 'ALL_COURTS'
          OR (breaks_table.scope_type = 'COURT' AND breaks_table.bracket_court_id = target_court_id)
        )
        AND current_cursor_at < public.combine_bracket_schedule_timestamp(target_date, breaks_table.break_end_time)
        AND current_cursor_at + make_interval(mins => plan_record.duration_minutes) > public.combine_bracket_schedule_timestamp(target_date, breaks_table.break_start_time)
      ORDER BY breaks_table.position, breaks_table.break_start_time
      LIMIT 1;

      EXIT WHEN break_end_at IS NULL;
      current_cursor_at := break_end_at;
      break_end_at := NULL;
    END LOOP;

    planned_end_at := current_cursor_at + make_interval(mins => plan_record.duration_minutes);

    UPDATE manual_match_relocation_plan
    SET new_start_time = current_cursor_at,
        new_end_time = planned_end_at
    WHERE match_id = plan_record.match_id;

    current_cursor_at := planned_end_at;
  END LOOP;

  UPDATE manual_match_relocation_plan AS plan_table
  SET new_queue_position = numbered_matches.position,
      new_scheduled_slot = numbered_matches.slot
  FROM (
    SELECT
      match_id,
      (
        CASE
          WHEN insertion_position = 'END' THEN COALESCE((
            SELECT max(matches_table.queue_position)
            FROM public.matches AS matches_table
            WHERE matches_table.championship_id = selected_championship_id
              AND matches_table.season_year = selected_season_year
              AND matches_table.scheduled_date = target_date
              AND matches_table.id <> ALL(selected_match_ids)
              AND public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(target_location)
              AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(target_court_name)
          ), 0)
          ELSE 0
        END
        + row_number() OVER (ORDER BY new_start_time, source_order)::INTEGER
      )::INTEGER AS position,
      (
        COALESCE((
          SELECT max(matches_table.scheduled_slot)
          FROM public.matches AS matches_table
          WHERE matches_table.championship_id = selected_championship_id
            AND matches_table.season_year = selected_season_year
            AND matches_table.scheduled_date = target_date
            AND matches_table.id <> ALL(selected_match_ids)
        ), 0)
        + row_number() OVER (ORDER BY new_start_time, source_order)::INTEGER
      )::INTEGER AS slot
    FROM manual_match_relocation_plan
    WHERE new_start_time IS NOT NULL
  ) AS numbered_matches
  WHERE numbered_matches.match_id = plan_table.match_id;

  SELECT EXISTS (
    SELECT 1
    FROM manual_match_relocation_plan AS first_plan
    JOIN manual_match_relocation_plan AS second_plan
      ON first_plan.match_id < second_plan.match_id
    WHERE (
      first_plan.home_team_id IN (second_plan.home_team_id, second_plan.away_team_id)
      OR first_plan.away_team_id IN (second_plan.home_team_id, second_plan.away_team_id)
    )
      AND public.is_championship_team_rest_gap_conflict(
        first_plan.naipe,
        second_plan.naipe,
        true,
        first_plan.new_queue_position,
        second_plan.new_queue_position,
        first_plan.new_start_time,
        second_plan.new_start_time,
        first_plan.duration_minutes,
        second_plan.duration_minutes,
        false
      )
  ) INTO has_rest_conflict;

  IF has_rest_conflict THEN
    blockers := blockers || jsonb_build_array('A realocação não preserva o descanso mínimo entre atléticas na quadra de destino.');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM manual_match_relocation_plan AS plan_table
    LEFT JOIN public.championship_bracket_matches AS plan_bracket_matches_table
      ON plan_bracket_matches_table.match_id = plan_table.match_id
    JOIN public.matches AS other_matches_table
      ON other_matches_table.championship_id = plan_table.championship_id
      AND other_matches_table.season_year = plan_table.season_year
      AND other_matches_table.scheduled_date = target_date
      AND other_matches_table.status = 'SCHEDULED'::public.match_status
      AND other_matches_table.id NOT IN (SELECT match_id FROM manual_match_relocation_plan)
      AND public.normalize_bracket_entity_name(other_matches_table.location) = public.normalize_bracket_entity_name(target_location)
      AND public.normalize_bracket_entity_name(other_matches_table.court_name) = public.normalize_bracket_entity_name(target_court_name)
      AND (
        other_matches_table.home_team_id IN (plan_table.home_team_id, plan_table.away_team_id)
        OR other_matches_table.away_team_id IN (plan_table.home_team_id, plan_table.away_team_id)
      )
    LEFT JOIN public.championship_sports AS other_championship_sports_table
      ON other_championship_sports_table.championship_id = other_matches_table.championship_id
      AND other_championship_sports_table.sport_id = other_matches_table.sport_id
    LEFT JOIN public.championship_bracket_matches AS other_bracket_matches_table
      ON other_bracket_matches_table.match_id = other_matches_table.id
    WHERE public.is_championship_team_rest_gap_conflict(
      plan_table.naipe,
      other_matches_table.naipe,
      true,
      plan_table.new_queue_position,
      other_matches_table.queue_position,
      plan_table.new_start_time,
      other_matches_table.start_time,
      plan_table.duration_minutes,
      GREATEST(COALESCE(other_championship_sports_table.default_match_duration_minutes, 35), 1),
      COALESCE(plan_bracket_matches_table.group_id IS NULL, false)
        OR COALESCE(other_bracket_matches_table.group_id IS NULL, false)
    )
  ) INTO has_rest_conflict;

  IF has_rest_conflict THEN
    blockers := blockers || jsonb_build_array('A realocação não preserva o descanso mínimo em relação a uma reserva manual já existente na quadra de destino.');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM manual_match_relocation_plan AS plan_table
    LEFT JOIN public.championship_bracket_matches AS plan_bracket_matches_table
      ON plan_bracket_matches_table.match_id = plan_table.match_id
    JOIN public.matches AS other_matches_table
      ON other_matches_table.championship_id = plan_table.championship_id
      AND other_matches_table.season_year = plan_table.season_year
      AND other_matches_table.scheduled_date = target_date
      AND other_matches_table.status = 'SCHEDULED'::public.match_status
      AND other_matches_table.id NOT IN (SELECT match_id FROM manual_match_relocation_plan)
      AND (
        public.normalize_bracket_entity_name(other_matches_table.location) <> public.normalize_bracket_entity_name(target_location)
        OR public.normalize_bracket_entity_name(other_matches_table.court_name) <> public.normalize_bracket_entity_name(target_court_name)
      )
      AND (
        other_matches_table.home_team_id IN (plan_table.home_team_id, plan_table.away_team_id)
        OR other_matches_table.away_team_id IN (plan_table.home_team_id, plan_table.away_team_id)
      )
    LEFT JOIN public.championship_sports AS other_championship_sports_table
      ON other_championship_sports_table.championship_id = other_matches_table.championship_id
      AND other_championship_sports_table.sport_id = other_matches_table.sport_id
    LEFT JOIN public.championship_bracket_matches AS other_bracket_matches_table
      ON other_bracket_matches_table.match_id = other_matches_table.id
    WHERE public.is_championship_team_rest_gap_conflict(
      plan_table.naipe,
      other_matches_table.naipe,
      false,
      NULL,
      NULL,
      plan_table.new_start_time,
      other_matches_table.start_time,
      plan_table.duration_minutes,
      GREATEST(COALESCE(other_championship_sports_table.default_match_duration_minutes, 35), 1),
      COALESCE(plan_bracket_matches_table.group_id IS NULL, false)
        OR COALESCE(other_bracket_matches_table.group_id IS NULL, false)
    )
  ) INTO has_rest_conflict;

  IF has_rest_conflict THEN
    blockers := blockers || jsonb_build_array('A realocação não preserva o descanso mínimo em relação a jogos de outra quadra.');
  END IF;

  SELECT to_char(public.combine_bracket_schedule_timestamp(target_date, target_day_record.end_time) AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI')
  INTO previous_day_end;

  SELECT to_char(GREATEST(
    public.combine_bracket_schedule_timestamp(target_date, target_day_record.end_time),
    COALESCE(max(new_end_time), public.combine_bracket_schedule_timestamp(target_date, target_day_record.end_time))
  ) AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI')
  INTO next_day_end
  FROM manual_match_relocation_plan;

  IF EXISTS (
    SELECT 1
    FROM manual_match_relocation_plan
    WHERE (new_end_time AT TIME ZONE 'America/Sao_Paulo')::DATE > target_date
  ) THEN
    blockers := blockers || jsonb_build_array('A realocação ultrapassa meia-noite e deve ser dividida em outro dia configurado.');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'match_id', plan_table.match_id,
    'is_selected', plan_table.is_selected,
    'before', jsonb_build_object(
      'scheduled_date', plan_table.old_scheduled_date,
      'location', plan_table.old_location,
      'court_name', plan_table.old_court_name,
      'start_time', plan_table.old_start_time,
      'end_time', plan_table.old_end_time,
      'queue_position', plan_table.old_queue_position,
      'scheduled_slot', plan_table.old_scheduled_slot
    ),
    'after', jsonb_build_object(
      'scheduled_date', target_date,
      'location', target_location,
      'court_name', target_court_name,
      'start_time', plan_table.new_start_time,
      'end_time', plan_table.new_end_time,
      'queue_position', plan_table.new_queue_position,
      'scheduled_slot', plan_table.new_scheduled_slot
    )
  ) ORDER BY plan_table.new_start_time, plan_table.source_order), '[]'::JSONB)
  INTO changes
  FROM manual_match_relocation_plan AS plan_table
  WHERE plan_table.new_start_time IS NOT NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'match_id', matches_table.id,
    'status', matches_table.status,
    'start_time', COALESCE(plan_table.new_start_time, matches_table.start_time),
    'end_time', COALESCE(plan_table.new_end_time, matches_table.end_time),
    'location', CASE WHEN plan_table.new_start_time IS NOT NULL THEN target_location ELSE matches_table.location END,
    'court_name', CASE WHEN plan_table.new_start_time IS NOT NULL THEN target_court_name ELSE matches_table.court_name END,
    'is_relocated', COALESCE(plan_table.is_selected, false),
    'is_displaced', COALESCE(plan_table.is_selected, false) = false AND plan_table.match_id IS NOT NULL
  ) ORDER BY COALESCE(plan_table.new_start_time, matches_table.start_time), matches_table.id), '[]'::JSONB)
  INTO timeline
  FROM (
    SELECT
      matches_table.id,
      matches_table.status,
      matches_table.start_time,
      matches_table.end_time,
      matches_table.location,
      matches_table.court_name,
      plan_table.new_start_time,
      plan_table.new_end_time,
      plan_table.is_selected,
      plan_table.match_id AS planned_match_id
    FROM public.matches AS matches_table
    LEFT JOIN manual_match_relocation_plan AS plan_table
      ON plan_table.match_id = matches_table.id
    WHERE matches_table.championship_id = selected_championship_id
      AND matches_table.season_year = selected_season_year
      AND matches_table.scheduled_date = target_date
      AND public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(target_location)
      AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(target_court_name)

    UNION ALL

    SELECT
      plan_table.match_id,
      'SCHEDULED'::public.match_status,
      NULL,
      NULL,
      target_location,
      target_court_name,
      plan_table.new_start_time,
      plan_table.new_end_time,
      plan_table.is_selected,
      plan_table.match_id
    FROM manual_match_relocation_plan AS plan_table
    WHERE plan_table.is_selected
      AND NOT EXISTS (
        SELECT 1
        FROM public.matches AS matches_table
        WHERE matches_table.id = plan_table.match_id
          AND matches_table.scheduled_date = target_date
          AND public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(target_location)
          AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(target_court_name)
      )
  ) AS matches_table
  LEFT JOIN manual_match_relocation_plan AS plan_table
    ON plan_table.match_id = matches_table.id;

  revision_value := COALESCE(bracket_edition_record.reprogramming_revision, 0);

  RETURN jsonb_build_object(
    'revision', revision_value,
    'blockers', blockers,
    'changes', changes,
    'timeline', timeline,
    'previous_day_end', previous_day_end,
    'next_day_end', next_day_end,
    'extends_day_end', next_day_end > previous_day_end,
    'target_date', target_date,
    'target_location', target_location,
    'target_court_name', target_court_name,
    'insertion_position', insertion_position,
    'reason', relocation_reason,
    'notes', relocation_notes,
    'representation_warning', 'A representação dos jogos realocados deve ser conferida na timeline antes da confirmação.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_manual_match_relocation(
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

  RETURN public.build_manual_match_relocation_preview(_bracket_edition_id, _payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_manual_match_relocation(
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

  PERFORM pg_advisory_xact_lock(hashtextextended(format('manual-match-relocation:%s', _bracket_edition_id), 0));

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

  preview := public.build_manual_match_relocation_preview(_bracket_edition_id, _payload);

  IF jsonb_array_length(COALESCE(preview->'blockers', '[]'::JSONB)) > 0 THEN
    RAISE EXCEPTION 'A realocação possui conflitos e não pode ser aplicada.';
  END IF;

  PERFORM set_config('app.allow_manual_schedule_override_update', 'true', true);
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
    is_manual_schedule_override = CASE WHEN changes_table.is_selected THEN true ELSE matches_table.is_manual_schedule_override END,
    manual_schedule_override_reason = CASE WHEN changes_table.is_selected THEN preview->>'reason' ELSE matches_table.manual_schedule_override_reason END,
    manual_schedule_override_notes = CASE WHEN changes_table.is_selected THEN NULLIF(preview->>'notes', '') ELSE matches_table.manual_schedule_override_notes END
  FROM jsonb_to_recordset(preview->'changes') AS changes_json(
    match_id UUID,
    is_selected BOOLEAN,
    after JSONB
  )
  CROSS JOIN LATERAL jsonb_to_record(changes_json.after) AS changes_table(
    scheduled_date DATE,
    location TEXT,
    court_name TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    queue_position INTEGER,
    scheduled_slot INTEGER
  )
  WHERE matches_table.id = changes_json.match_id;

  target_date := (preview->>'target_date')::DATE;
  SELECT end_time
  INTO target_day_end
  FROM public.championship_bracket_days
  WHERE bracket_edition_id = _bracket_edition_id
    AND event_date = target_date
  FOR UPDATE;

  calculated_day_end := (preview->>'next_day_end')::TIME;

  IF calculated_day_end > target_day_end THEN
    UPDATE public.championship_bracket_days
    SET end_time = calculated_day_end
    WHERE bracket_edition_id = _bracket_edition_id
      AND event_date = target_date;
  END IF;

  PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
  PERFORM set_config('app.allow_manual_schedule_override_update', 'false', true);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
    PERFORM set_config('app.allow_manual_schedule_override_update', 'false', true);
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_manual_schedule_override_rewrite()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.is_manual_schedule_override
    AND COALESCE(current_setting('app.allow_manual_schedule_override_update', true), 'false') <> 'true'
    AND (
      NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
      OR NEW.location IS DISTINCT FROM OLD.location
      OR NEW.court_name IS DISTINCT FROM OLD.court_name
      OR NEW.start_time IS DISTINCT FROM OLD.start_time
      OR NEW.end_time IS DISTINCT FROM OLD.end_time
      OR NEW.queue_position IS DISTINCT FROM OLD.queue_position
      OR NEW.scheduled_slot IS DISTINCT FROM OLD.scheduled_slot
    ) THEN
    RAISE EXCEPTION 'A agenda deste jogo é uma realocação manual protegida.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_manual_schedule_override_rewrite ON public.matches;
CREATE TRIGGER prevent_manual_schedule_override_rewrite
BEFORE UPDATE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.prevent_manual_schedule_override_rewrite();

REVOKE ALL ON FUNCTION public.build_manual_match_relocation_preview(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_manual_match_relocation(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_manual_match_relocation(UUID, JSONB, BIGINT) TO authenticated;
