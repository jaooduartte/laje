ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS manual_representation_mode TEXT NOT NULL DEFAULT 'AUTO';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'matches_manual_representation_mode_check'
      AND conrelid = 'public.matches'::regclass
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_manual_representation_mode_check
      CHECK (manual_representation_mode IN ('AUTO', 'CO'));
  END IF;
END
$$;

COMMENT ON COLUMN public.matches.manual_representation_mode
IS 'Override manual da representação do card. AUTO mantém o cálculo por quadra e CO força coordenação.';

CREATE OR REPLACE FUNCTION public.list_editable_match_schedule_slots(
  _match_id UUID,
  _target_date DATE,
  _target_location TEXT,
  _target_court_name TEXT,
  _sport_id UUID DEFAULT NULL,
  _naipe public.match_naipe DEFAULT NULL,
  _home_team_id UUID DEFAULT NULL,
  _away_team_id UUID DEFAULT NULL
)
RETURNS TABLE (
  slot_number INTEGER,
  start_time TIMESTAMPTZ,
  start_time_label TEXT,
  is_current_slot BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_match RECORD;
  latest_bracket_edition_id UUID;
  target_day_id UUID;
  target_court_id UUID;
  target_day_start_time TIME;
  target_day_end_time TIME;
  resolved_sport_id UUID;
  resolved_naipe public.match_naipe;
  resolved_home_team_id UUID;
  resolved_away_team_id UUID;
  duration_minutes INTEGER;
  current_start_minutes INTEGER;
  day_end_minutes INTEGER;
  slot_index INTEGER := 0;
  break_record RECORD;
  break_start_minutes INTEGER;
  break_end_minutes INTEGER;
  changed BOOLEAN;
  candidate_start_time TIMESTAMPTZ;
  candidate_time_label TEXT;
  candidate_conflict_message TEXT;
  candidate_is_current_slot BOOLEAN;
  slot_is_occupied BOOLEAN;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para editar a logística dos jogos.';
  END IF;

  IF _match_id IS NULL THEN
    RAISE EXCEPTION 'Informe o jogo para listar os horários disponíveis.';
  END IF;

  IF _target_date IS NULL THEN
    RAISE EXCEPTION 'Informe o dia desejado para listar os horários disponíveis.';
  END IF;

  IF NULLIF(trim(COALESCE(_target_location, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(_target_court_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Informe local e quadra para listar os horários disponíveis.';
  END IF;

  SELECT
    matches_table.id,
    matches_table.championship_id,
    matches_table.season_year,
    matches_table.sport_id,
    matches_table.naipe,
    matches_table.home_team_id,
    matches_table.away_team_id,
    matches_table.location,
    matches_table.court_name,
    matches_table.scheduled_date,
    matches_table.start_time,
    matches_table.scheduled_slot,
    matches_table.queue_position,
    matches_table.created_at
  INTO source_match
  FROM public.matches AS matches_table
  WHERE matches_table.id = _match_id
  LIMIT 1;

  IF source_match.id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível localizar o jogo selecionado.';
  END IF;

  resolved_sport_id := COALESCE(_sport_id, source_match.sport_id);
  resolved_naipe := COALESCE(_naipe, source_match.naipe);
  resolved_home_team_id := COALESCE(_home_team_id, source_match.home_team_id);
  resolved_away_team_id := COALESCE(_away_team_id, source_match.away_team_id);

  IF resolved_sport_id IS NULL OR resolved_naipe IS NULL OR resolved_home_team_id IS NULL OR resolved_away_team_id IS NULL THEN
    RAISE EXCEPTION 'O jogo precisa ter modalidade, naipe e duas atléticas válidas para listar horários.';
  END IF;

  SELECT editions_table.id
  INTO latest_bracket_edition_id
  FROM public.championship_bracket_editions AS editions_table
  WHERE editions_table.championship_id = source_match.championship_id
    AND editions_table.season_year = source_match.season_year
  ORDER BY editions_table.updated_at DESC NULLS LAST, editions_table.created_at DESC
  LIMIT 1;

  IF latest_bracket_edition_id IS NULL THEN
    RAISE EXCEPTION 'Não há agenda de chaveamento configurada para esta edição.';
  END IF;

  SELECT
    days_table.id,
    days_table.start_time,
    days_table.end_time,
    courts_table.id
  INTO
    target_day_id,
    target_day_start_time,
    target_day_end_time,
    target_court_id
  FROM public.championship_bracket_days AS days_table
  JOIN public.championship_bracket_locations AS locations_table
    ON locations_table.bracket_day_id = days_table.id
  JOIN public.championship_bracket_courts AS courts_table
    ON courts_table.bracket_location_id = locations_table.id
  JOIN public.championship_bracket_court_sports AS court_sports_table
    ON court_sports_table.bracket_court_id = courts_table.id
  WHERE days_table.bracket_edition_id = latest_bracket_edition_id
    AND days_table.event_date = _target_date
    AND court_sports_table.sport_id = resolved_sport_id
    AND public.normalize_bracket_entity_name(locations_table.name) = public.normalize_bracket_entity_name(_target_location)
    AND public.normalize_bracket_entity_name(courts_table.name) = public.normalize_bracket_entity_name(_target_court_name)
  ORDER BY locations_table.position ASC, courts_table.position ASC
  LIMIT 1;

  IF target_day_id IS NULL OR target_court_id IS NULL THEN
    RAISE EXCEPTION 'A quadra selecionada não está disponível para esta modalidade no dia informado.';
  END IF;

  IF target_day_start_time IS NULL OR target_day_end_time IS NULL OR target_day_end_time <= target_day_start_time THEN
    RAISE EXCEPTION 'A grade de horários deste dia está inválida.';
  END IF;

  duration_minutes := GREATEST(
    COALESCE(public.resolve_championship_sport_duration_minutes(source_match.championship_id, resolved_sport_id), 35),
    1
  );

  current_start_minutes := FLOOR(EXTRACT(EPOCH FROM target_day_start_time) / 60.0)::INTEGER;
  day_end_minutes := FLOOR(EXTRACT(EPOCH FROM target_day_end_time) / 60.0)::INTEGER;

  LOOP
    changed := true;

    WHILE changed LOOP
      changed := false;

      FOR break_record IN
        SELECT
          breaks_table.break_start_time,
          breaks_table.break_end_time
        FROM public.championship_bracket_day_breaks AS breaks_table
        WHERE breaks_table.bracket_day_id = target_day_id
          AND (
            breaks_table.scope_type = 'ALL_COURTS'
            OR (breaks_table.scope_type = 'COURT' AND breaks_table.bracket_court_id = target_court_id)
          )
        ORDER BY breaks_table.position ASC, breaks_table.break_start_time ASC
      LOOP
        break_start_minutes := FLOOR(EXTRACT(EPOCH FROM break_record.break_start_time) / 60.0)::INTEGER;
        break_end_minutes := FLOOR(EXTRACT(EPOCH FROM break_record.break_end_time) / 60.0)::INTEGER;

        IF current_start_minutes < break_end_minutes
          AND current_start_minutes + duration_minutes > break_start_minutes THEN
          current_start_minutes := break_end_minutes;
          changed := true;
        END IF;
      END LOOP;
    END LOOP;

    EXIT WHEN current_start_minutes + duration_minutes > day_end_minutes;

    slot_index := slot_index + 1;
    candidate_start_time := make_timestamptz(
      EXTRACT(YEAR FROM _target_date)::INTEGER,
      EXTRACT(MONTH FROM _target_date)::INTEGER,
      EXTRACT(DAY FROM _target_date)::INTEGER,
      FLOOR(current_start_minutes / 60.0)::INTEGER,
      MOD(current_start_minutes, 60),
      0,
      'America/Sao_Paulo'
    );
    candidate_time_label := to_char(timezone('America/Sao_Paulo', candidate_start_time), 'HH24:MI');

    candidate_is_current_slot :=
      source_match.scheduled_date IS NOT DISTINCT FROM _target_date
      AND public.normalize_bracket_entity_name(source_match.location) = public.normalize_bracket_entity_name(_target_location)
      AND public.normalize_bracket_entity_name(source_match.court_name) = public.normalize_bracket_entity_name(_target_court_name)
      AND source_match.start_time IS NOT DISTINCT FROM candidate_start_time
      AND COALESCE(source_match.scheduled_slot, slot_index) = slot_index;

    SELECT EXISTS (
      SELECT 1
      FROM public.matches AS matches_table
      WHERE matches_table.championship_id = source_match.championship_id
        AND matches_table.season_year = source_match.season_year
        AND matches_table.status = 'SCHEDULED'::public.match_status
        AND matches_table.scheduled_date = _target_date
        AND public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(_target_location)
        AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(_target_court_name)
        AND matches_table.id <> source_match.id
        AND (
          matches_table.start_time IS NOT DISTINCT FROM candidate_start_time
          OR COALESCE(matches_table.scheduled_slot, matches_table.queue_position) = slot_index
        )
    )
    INTO slot_is_occupied;

    candidate_conflict_message := public.resolve_scheduled_match_rest_gap_conflict(
      source_match.championship_id,
      source_match.season_year,
      _target_date,
      _target_location,
      _target_court_name,
      candidate_start_time,
      slot_index,
      NULL,
      source_match.created_at,
      source_match.id,
      resolved_sport_id,
      resolved_naipe,
      resolved_home_team_id,
      resolved_away_team_id,
      duration_minutes
    );

    IF (NOT slot_is_occupied OR candidate_is_current_slot) AND candidate_conflict_message IS NULL THEN
      slot_number := slot_index;
      start_time := candidate_start_time;
      start_time_label := candidate_time_label;
      is_current_slot := candidate_is_current_slot;
      RETURN NEXT;
    END IF;

    current_start_minutes := current_start_minutes + duration_minutes;
  END LOOP;

  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_scheduled_match_logistics(
  _match_id UUID,
  _scheduled_date DATE,
  _location TEXT,
  _court_name TEXT,
  _slot_start_time TIMESTAMPTZ,
  _representation_mode TEXT DEFAULT 'AUTO',
  _sport_id UUID DEFAULT NULL,
  _naipe public.match_naipe DEFAULT NULL,
  _home_team_id UUID DEFAULT NULL,
  _away_team_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_match RECORD;
  target_slot RECORD;
  normalized_representation_mode TEXT := upper(trim(COALESCE(_representation_mode, 'AUTO')));
  should_preserve_current_queue_position BOOLEAN := false;
  next_queue_position INTEGER;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para editar a logística dos jogos.';
  END IF;

  IF _match_id IS NULL THEN
    RAISE EXCEPTION 'Informe o jogo para atualizar a logística.';
  END IF;

  IF _scheduled_date IS NULL
    OR NULLIF(trim(COALESCE(_location, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(_court_name, '')), '') IS NULL
    OR _slot_start_time IS NULL THEN
    RAISE EXCEPTION 'Informe dia, local, quadra e horário para atualizar a logística.';
  END IF;

  IF normalized_representation_mode NOT IN ('AUTO', 'CO') THEN
    RAISE EXCEPTION 'Modo de representação inválido.';
  END IF;

  SELECT
    matches_table.id,
    matches_table.championship_id,
    matches_table.season_year,
    matches_table.location,
    matches_table.court_name,
    matches_table.scheduled_date,
    matches_table.start_time,
    matches_table.queue_position,
    matches_table.scheduled_slot
  INTO source_match
  FROM public.matches AS matches_table
  WHERE matches_table.id = _match_id
  LIMIT 1
  FOR UPDATE;

  IF source_match.id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível localizar o jogo para atualizar a logística.';
  END IF;

  SELECT slot_rows.slot_number, slot_rows.start_time
  INTO target_slot
  FROM public.list_editable_match_schedule_slots(
    _match_id,
    _scheduled_date,
    _location,
    _court_name,
    _sport_id,
    _naipe,
    _home_team_id,
    _away_team_id
  ) AS slot_rows
  WHERE slot_rows.start_time = _slot_start_time
  LIMIT 1;

  IF target_slot.slot_number IS NULL THEN
    RAISE EXCEPTION 'O horário selecionado não está mais disponível para esta quadra.';
  END IF;

  should_preserve_current_queue_position :=
    source_match.scheduled_date IS NOT DISTINCT FROM _scheduled_date
    AND public.normalize_bracket_entity_name(source_match.location) = public.normalize_bracket_entity_name(_location)
    AND public.normalize_bracket_entity_name(source_match.court_name) = public.normalize_bracket_entity_name(_court_name)
    AND source_match.start_time IS NOT DISTINCT FROM target_slot.start_time
    AND source_match.scheduled_slot IS NOT DISTINCT FROM target_slot.slot_number;

  IF should_preserve_current_queue_position THEN
    next_queue_position := source_match.queue_position;
  ELSE
    next_queue_position := NULL;
  END IF;

  BEGIN
    PERFORM set_config('app.skip_queue_trigger', 'true', true);

    UPDATE public.matches
    SET
      scheduled_date = _scheduled_date,
      location = trim(_location),
      court_name = trim(_court_name),
      start_time = target_slot.start_time,
      end_time = NULL,
      scheduled_slot = target_slot.slot_number,
      queue_position = next_queue_position,
      manual_representation_mode = normalized_representation_mode
    WHERE id = _match_id;

    PERFORM set_config('app.skip_queue_trigger', 'false', true);
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('app.skip_queue_trigger', 'false', true);
      RAISE;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_editable_match_schedule_slots(UUID, DATE, TEXT, TEXT, UUID, public.match_naipe, UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_scheduled_match_logistics(UUID, DATE, TEXT, TEXT, TIMESTAMPTZ, TEXT, UUID, public.match_naipe, UUID, UUID) TO anon, authenticated;

COMMENT ON FUNCTION public.list_editable_match_schedule_slots(UUID, DATE, TEXT, TEXT, UUID, public.match_naipe, UUID, UUID)
IS 'Lista horários editáveis e livres de uma quadra para um jogo específico, respeitando intervalos, compatibilidade da modalidade e conflitos de descanso.';

COMMENT ON FUNCTION public.update_scheduled_match_logistics(UUID, DATE, TEXT, TEXT, TIMESTAMPTZ, TEXT, UUID, public.match_naipe, UUID, UUID)
IS 'Atualiza com segurança o slot agendado de um jogo e o override manual de representação, sem redistribuir a agenda existente.';

NOTIFY pgrst, 'reload schema';
