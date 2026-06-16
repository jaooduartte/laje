-- Amplia a regra de descanso da agenda para exigir pelo menos 4 jogos de
-- intervalo entre partidas da mesma atlética no mesmo naipe. A correção vale
-- para a geração da fase de grupos, para a redistribuição real da agenda e
-- para a agenda já gerada da Copa Laje Society 2026.
--
-- Quando ainda restar conflito de representação entre jogos consecutivos da
-- mesma quadra, a UI passa a exibir CO automaticamente, sem travar a agenda.

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
      GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1) AS duration_minutes
    FROM public.matches AS matches_table
    LEFT JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = matches_table.championship_id
      AND championship_sports_table.sport_id = matches_table.sport_id
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
      candidate_duration_minutes
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
  same_court_rest_conflict AS (
    SELECT 1
    FROM candidate_court_match
    JOIN ordered_court_matches AS other_match
      ON other_match.id <> candidate_court_match.id
    WHERE candidate_court_match.naipe = other_match.naipe
      AND ABS(candidate_court_match.court_sequence_index - other_match.court_sequence_index) < 4
      AND (
        other_match.home_team_id IN (candidate_court_match.home_team_id, candidate_court_match.away_team_id)
        OR other_match.away_team_id IN (candidate_court_match.home_team_id, candidate_court_match.away_team_id)
      )
    LIMIT 1
  ),
  cross_court_time_conflict AS (
    SELECT 1
    FROM simulated_matches AS candidate_match
    JOIN simulated_matches AS other_match
      ON other_match.id <> candidate_match.id
    WHERE candidate_match.id = candidate_match_id
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
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM same_court_rest_conflict) THEN
      'A mesma atlética precisa de pelo menos 4 jogos de descanso na mesma quadra para partidas do mesmo naipe.'
    WHEN EXISTS (SELECT 1 FROM cross_court_time_conflict) THEN
      'A mesma atlética precisa de pelo menos 4 jogos de descanso entre partidas do mesmo naipe no mesmo dia.'
    ELSE NULL
  END
  INTO conflict_message;

  RETURN conflict_message;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_match_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  available_courts_count INTEGER;
  live_matches_count INTEGER;
  latest_bracket_edition_id UUID;
  should_validate_live_capacity BOOLEAN := false;
  rest_gap_conflict_message TEXT;
BEGIN
  IF current_setting('app.skip_match_conflict_trigger', TRUE) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.home_team_id = NEW.away_team_id THEN
    RAISE EXCEPTION 'Os times da partida devem ser diferentes.';
  END IF;

  IF NEW.status = 'SCHEDULED'::public.match_status THEN
    IF NEW.scheduled_date IS NULL THEN
      RAISE EXCEPTION 'Informe o dia da fila para partidas agendadas.';
    END IF;
  END IF;

  IF NEW.status = 'LIVE'::public.match_status AND NEW.scheduled_date IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      should_validate_live_capacity := true;
    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
      should_validate_live_capacity := true;
    END IF;
  END IF;

  IF should_validate_live_capacity THEN
    SELECT editions_table.id
    INTO latest_bracket_edition_id
    FROM public.championship_bracket_editions AS editions_table
    WHERE editions_table.championship_id = NEW.championship_id
      AND editions_table.season_year = NEW.season_year
    ORDER BY editions_table.created_at DESC
    LIMIT 1;

    IF latest_bracket_edition_id IS NOT NULL THEN
      SELECT count(*)
      INTO available_courts_count
      FROM public.championship_bracket_days AS days_table
      JOIN public.championship_bracket_locations AS locations_table
        ON locations_table.bracket_day_id = days_table.id
      JOIN public.championship_bracket_courts AS courts_table
        ON courts_table.bracket_location_id = locations_table.id
      JOIN public.championship_bracket_court_sports AS court_sports_table
        ON court_sports_table.bracket_court_id = courts_table.id
      WHERE days_table.bracket_edition_id = latest_bracket_edition_id
        AND days_table.event_date = NEW.scheduled_date
        AND court_sports_table.sport_id = NEW.sport_id;

      IF COALESCE(available_courts_count, 0) > 0 THEN
        SELECT count(*)
        INTO live_matches_count
        FROM public.matches AS matches_table
        WHERE matches_table.championship_id = NEW.championship_id
          AND matches_table.season_year = NEW.season_year
          AND matches_table.sport_id = NEW.sport_id
          AND matches_table.status = 'LIVE'::public.match_status
          AND matches_table.scheduled_date IS NOT DISTINCT FROM NEW.scheduled_date
          AND matches_table.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

        IF live_matches_count >= available_courts_count THEN
          RAISE EXCEPTION 'Todas as quadras compatíveis desta modalidade já estão ocupadas neste dia.';
        END IF;
      END IF;
    END IF;
  END IF;

  IF NEW.status = 'SCHEDULED'::public.match_status
    AND NEW.court_name IS NOT NULL
    AND NULLIF(trim(COALESCE(NEW.location, '')), '') IS NOT NULL
    AND NULLIF(trim(COALESCE(NEW.court_name, '')), '') IS NOT NULL THEN
    rest_gap_conflict_message := public.resolve_scheduled_match_rest_gap_conflict(
      NEW.championship_id,
      NEW.season_year,
      NEW.scheduled_date,
      NEW.location,
      NEW.court_name,
      NEW.start_time,
      NEW.scheduled_slot,
      NEW.queue_position,
      NEW.created_at,
      NEW.id,
      NEW.sport_id,
      NEW.naipe,
      NEW.home_team_id,
      NEW.away_team_id
    );

    IF rest_gap_conflict_message IS NOT NULL THEN
      RAISE EXCEPTION '%', rest_gap_conflict_message;
    END IF;
  END IF;

  IF NEW.end_time IS NOT NULL AND NEW.start_time IS NULL THEN
    RAISE EXCEPTION 'A partida não pode ter horário final sem horário inicial.';
  END IF;

  IF NEW.start_time IS NOT NULL
    AND NEW.end_time IS NOT NULL
    AND NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'Horário final da partida deve ser maior que o horário inicial.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.redistribute_bracket_scheduled_matches(
  _bracket_edition_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bracket_edition_record RECORD;
  pending_match_record RECORD;
  candidate_court_record RECORD;
  candidate_probe_at TIMESTAMPTZ;
  candidate_start_at TIMESTAMPTZ;
  candidate_end_at TIMESTAMPTZ;
  candidate_primary_rank INTEGER;
  candidate_secondary_rank INTEGER;
  best_candidate_found BOOLEAN;
  best_match_id UUID;
  best_order_index BIGINT;
  best_sport_id UUID;
  best_naipe public.match_naipe;
  best_division public.team_division;
  best_home_team_id UUID;
  best_away_team_id UUID;
  best_duration_minutes INTEGER;
  best_day_id UUID;
  best_court_id UUID;
  best_event_date DATE;
  best_location_name TEXT;
  best_location_group_id UUID;
  best_location_position INTEGER;
  best_court_name TEXT;
  best_court_group_id UUID;
  best_court_position INTEGER;
  best_start_at TIMESTAMPTZ;
  best_end_at TIMESTAMPTZ;
  best_primary_rank INTEGER;
  best_secondary_rank INTEGER;
  best_assigned_count INTEGER;
  best_related_same_naipe_history_count INTEGER;
  same_team_conflict BOOLEAN;
  same_naipe_court_rest_conflict BOOLEAN;
  cross_court_same_naipe_time_conflict BOOLEAN;
  preferred_division_pending_exists BOOLEAN;
  preferred_naipe_pending_exists BOOLEAN;
  candidate_related_same_naipe_history_count INTEGER;
  latest_court_assignment_end_at TIMESTAMPTZ;
BEGIN
  SELECT
    championship_id,
    season_year
  INTO bracket_edition_record
  FROM public.championship_bracket_editions
  WHERE id = _bracket_edition_id
  LIMIT 1;

  IF bracket_edition_record.championship_id IS NULL THEN
    RAISE EXCEPTION 'Edição de chaveamento inválida.';
  END IF;

  DROP TABLE IF EXISTS tmp_global_day_courts;
  CREATE TEMP TABLE tmp_global_day_courts (
    bracket_day_id UUID NOT NULL,
    event_date DATE NOT NULL,
    sport_id UUID NOT NULL,
    location_id UUID NOT NULL,
    location_group_id UUID NOT NULL,
    location_name TEXT NOT NULL,
    location_position INTEGER NOT NULL,
    court_id UUID NOT NULL,
    court_group_id UUID NOT NULL,
    court_name TEXT NOT NULL,
    court_position INTEGER NOT NULL,
    priority_mode public.bracket_court_priority_mode NOT NULL,
    primary_naipe public.match_naipe NULL,
    primary_division public.team_division NULL,
    next_available_at TIMESTAMPTZ NOT NULL,
    assigned_count INTEGER NOT NULL DEFAULT 0,
    last_naipe public.match_naipe NULL,
    last_division public.team_division NULL,
    PRIMARY KEY (court_id, sport_id)
  ) ON COMMIT DROP;

  INSERT INTO tmp_global_day_courts (
    bracket_day_id,
    event_date,
    sport_id,
    location_id,
    location_group_id,
    location_name,
    location_position,
    court_id,
    court_group_id,
    court_name,
    court_position,
    priority_mode,
    primary_naipe,
    primary_division,
    next_available_at
  )
  SELECT
    days_table.id,
    days_table.event_date,
    court_sports_table.sport_id,
    locations_table.id,
    locations_table.location_group_id,
    locations_table.name,
    locations_table.position,
    courts_table.id,
    courts_table.court_group_id,
    courts_table.name,
    courts_table.position,
    COALESCE(location_priorities_table.priority_mode, 'NONE'::public.bracket_court_priority_mode),
    court_sports_table.preferred_naipe,
    court_sports_table.preferred_division,
    public.combine_bracket_schedule_timestamp(days_table.event_date, days_table.start_time)
  FROM public.championship_bracket_days AS days_table
  JOIN public.championship_bracket_locations AS locations_table
    ON locations_table.bracket_day_id = days_table.id
  JOIN public.championship_bracket_courts AS courts_table
    ON courts_table.bracket_location_id = locations_table.id
  JOIN public.championship_bracket_court_sports AS court_sports_table
    ON court_sports_table.bracket_court_id = courts_table.id
  LEFT JOIN public.championship_bracket_location_sport_priorities AS location_priorities_table
    ON location_priorities_table.bracket_edition_id = days_table.bracket_edition_id
    AND location_priorities_table.location_group_id = locations_table.location_group_id
    AND location_priorities_table.sport_id = court_sports_table.sport_id
  WHERE days_table.bracket_edition_id = _bracket_edition_id;

  DROP TABLE IF EXISTS tmp_global_pending_matches;
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
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY
        matches_table.scheduled_date ASC NULLS FIRST,
        COALESCE(matches_table.scheduled_slot, matches_table.queue_position) ASC NULLS LAST,
        COALESCE(matches_table.queue_position, matches_table.scheduled_slot) ASC NULLS LAST,
        matches_table.created_at ASC,
        matches_table.id ASC
    ) AS order_index,
    matches_table.id,
    matches_table.scheduled_date,
    matches_table.sport_id,
    matches_table.naipe,
    matches_table.division,
    matches_table.home_team_id,
    matches_table.away_team_id,
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
  FROM public.matches AS matches_table
  JOIN public.championship_bracket_matches AS bracket_matches_table
    ON bracket_matches_table.match_id = matches_table.id
  JOIN public.championship_sports AS championship_sports_table
    ON championship_sports_table.championship_id = matches_table.championship_id
    AND championship_sports_table.sport_id = matches_table.sport_id
  LEFT JOIN (
    SELECT
      competition_id,
      MAX(round_number) FILTER (WHERE is_third_place = false) AS total_round_number
    FROM public.championship_bracket_matches
    WHERE bracket_edition_id = _bracket_edition_id
    GROUP BY competition_id
  ) AS competition_rounds_table
    ON competition_rounds_table.competition_id = bracket_matches_table.competition_id
  WHERE bracket_matches_table.bracket_edition_id = _bracket_edition_id
    AND matches_table.status = 'SCHEDULED'::public.match_status;

  DROP TABLE IF EXISTS tmp_global_assignments;
  CREATE TEMP TABLE tmp_global_assignments (
    match_id UUID PRIMARY KEY,
    order_index BIGINT NOT NULL,
    sport_id UUID NOT NULL,
    naipe public.match_naipe NOT NULL,
    division public.team_division NULL,
    home_team_id UUID NOT NULL,
    away_team_id UUID NOT NULL,
    duration_minutes INTEGER NOT NULL,
    court_sequence_index INTEGER NOT NULL,
    new_scheduled_date DATE NOT NULL,
    location_name TEXT NOT NULL,
    location_position INTEGER NOT NULL,
    court_name TEXT NOT NULL,
    court_position INTEGER NOT NULL,
    planned_start_at TIMESTAMPTZ NOT NULL,
    planned_end_at TIMESTAMPTZ NOT NULL
  ) ON COMMIT DROP;

  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM tmp_global_pending_matches
    );

    best_candidate_found := false;
    best_match_id := NULL;
    best_order_index := NULL;
    best_sport_id := NULL;
    best_naipe := NULL;
    best_division := NULL;
    best_home_team_id := NULL;
    best_away_team_id := NULL;
    best_duration_minutes := NULL;
    best_day_id := NULL;
    best_court_id := NULL;
    best_event_date := NULL;
    best_location_name := NULL;
    best_location_group_id := NULL;
    best_location_position := NULL;
    best_court_name := NULL;
    best_court_group_id := NULL;
    best_court_position := NULL;
    best_start_at := NULL;
    best_end_at := NULL;
    best_primary_rank := NULL;
    best_secondary_rank := NULL;
    best_assigned_count := NULL;
    best_related_same_naipe_history_count := NULL;

    FOR pending_match_record IN
      SELECT *
      FROM tmp_global_pending_matches
      ORDER BY order_index ASC
    LOOP
      FOR candidate_court_record IN
        SELECT *
        FROM tmp_global_day_courts
        WHERE sport_id = pending_match_record.sport_id
        ORDER BY event_date ASC, next_available_at ASC, location_position ASC, court_position ASC, court_name ASC
      LOOP
        IF pending_match_record.preferred_knockout_court_group_id IS NOT NULL
          AND candidate_court_record.court_group_id <> pending_match_record.preferred_knockout_court_group_id THEN
          CONTINUE;
        END IF;

        IF candidate_court_record.priority_mode = 'DIVISION'::public.bracket_court_priority_mode
          AND candidate_court_record.primary_division IS NOT NULL
          AND pending_match_record.division IS DISTINCT FROM candidate_court_record.primary_division THEN
          SELECT EXISTS (
            SELECT 1
            FROM tmp_global_pending_matches AS pending_matches_table
            WHERE pending_matches_table.match_id <> pending_match_record.match_id
              AND pending_matches_table.sport_id = pending_match_record.sport_id
              AND pending_matches_table.original_scheduled_date = candidate_court_record.event_date
              AND pending_matches_table.division = candidate_court_record.primary_division
              AND (
                pending_matches_table.preferred_knockout_court_group_id IS NULL
                OR pending_matches_table.preferred_knockout_court_group_id = candidate_court_record.court_group_id
              )
          )
          INTO preferred_division_pending_exists;

          IF preferred_division_pending_exists THEN
            CONTINUE;
          END IF;
        END IF;

        IF candidate_court_record.priority_mode = 'NAIPE'::public.bracket_court_priority_mode
          AND candidate_court_record.primary_naipe IS NOT NULL
          AND pending_match_record.naipe IS DISTINCT FROM candidate_court_record.primary_naipe THEN
          SELECT EXISTS (
            SELECT 1
            FROM tmp_global_pending_matches AS pending_matches_table
            WHERE pending_matches_table.match_id <> pending_match_record.match_id
              AND pending_matches_table.sport_id = pending_match_record.sport_id
              AND pending_matches_table.original_scheduled_date = candidate_court_record.event_date
              AND pending_matches_table.naipe = candidate_court_record.primary_naipe
              AND (
                pending_matches_table.preferred_knockout_court_group_id IS NULL
                OR pending_matches_table.preferred_knockout_court_group_id = candidate_court_record.court_group_id
              )
          )
          INTO preferred_naipe_pending_exists;

          IF preferred_naipe_pending_exists THEN
            CONTINUE;
          END IF;
        END IF;

        candidate_probe_at := candidate_court_record.next_available_at;

        SELECT MAX(existing_assignments_table.planned_end_at)
        INTO latest_court_assignment_end_at
        FROM tmp_global_assignments AS existing_assignments_table
        WHERE existing_assignments_table.new_scheduled_date = candidate_court_record.event_date
          AND existing_assignments_table.location_name = candidate_court_record.location_name
          AND existing_assignments_table.court_name = candidate_court_record.court_name;

        IF latest_court_assignment_end_at IS NOT NULL
          AND latest_court_assignment_end_at > candidate_probe_at THEN
          candidate_probe_at := latest_court_assignment_end_at;
        END IF;

        LOOP
          candidate_start_at := public.resolve_bracket_court_next_available_start(
            candidate_court_record.bracket_day_id,
            candidate_court_record.court_id,
            candidate_probe_at,
            pending_match_record.duration_minutes
          );

          IF candidate_start_at IS NULL THEN
            EXIT;
          END IF;

          SELECT EXISTS (
            SELECT 1
            FROM tmp_global_assignments AS existing_assignments_table
            WHERE existing_assignments_table.new_scheduled_date = candidate_court_record.event_date
              AND existing_assignments_table.planned_start_at = candidate_start_at
              AND (
                existing_assignments_table.home_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
                OR existing_assignments_table.away_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
              )
          )
          INTO same_team_conflict;

          IF same_team_conflict THEN
            candidate_probe_at := candidate_start_at + make_interval(mins => pending_match_record.duration_minutes);
            CONTINUE;
          END IF;

          SELECT EXISTS (
            SELECT 1
            FROM tmp_global_assignments AS existing_assignments_table
            WHERE existing_assignments_table.new_scheduled_date = candidate_court_record.event_date
              AND existing_assignments_table.location_name = candidate_court_record.location_name
              AND existing_assignments_table.court_name = candidate_court_record.court_name
              AND existing_assignments_table.naipe = pending_match_record.naipe
              AND existing_assignments_table.court_sequence_index > 0
              AND ((candidate_court_record.assigned_count + 1) - existing_assignments_table.court_sequence_index) < 4
              AND (
                existing_assignments_table.home_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
                OR existing_assignments_table.away_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
              )
          )
          INTO same_naipe_court_rest_conflict;

          IF same_naipe_court_rest_conflict THEN
            candidate_probe_at := candidate_start_at + make_interval(mins => pending_match_record.duration_minutes);
            CONTINUE;
          END IF;

          SELECT EXISTS (
            SELECT 1
            FROM tmp_global_assignments AS existing_assignments_table
            WHERE existing_assignments_table.new_scheduled_date = candidate_court_record.event_date
              AND existing_assignments_table.naipe = pending_match_record.naipe
              AND (
                existing_assignments_table.location_name <> candidate_court_record.location_name
                OR existing_assignments_table.court_name <> candidate_court_record.court_name
              )
              AND (
                existing_assignments_table.home_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
                OR existing_assignments_table.away_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
              )
              AND ABS(EXTRACT(EPOCH FROM (existing_assignments_table.planned_start_at - candidate_start_at)) / 60.0)
                < GREATEST(existing_assignments_table.duration_minutes, pending_match_record.duration_minutes) * 4
          )
          INTO cross_court_same_naipe_time_conflict;

          IF cross_court_same_naipe_time_conflict THEN
            candidate_probe_at := candidate_start_at + make_interval(mins => pending_match_record.duration_minutes);
            CONTINUE;
          END IF;

          EXIT;
        END LOOP;

        IF candidate_start_at IS NULL THEN
          CONTINUE;
        END IF;

        candidate_end_at := candidate_start_at + make_interval(mins => pending_match_record.duration_minutes);

        SELECT count(*)
        INTO candidate_related_same_naipe_history_count
        FROM tmp_global_assignments AS existing_assignments_table
        WHERE existing_assignments_table.new_scheduled_date = candidate_court_record.event_date
          AND existing_assignments_table.naipe = pending_match_record.naipe
          AND (
            existing_assignments_table.home_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
            OR existing_assignments_table.away_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
          );

        candidate_primary_rank := CASE
          WHEN candidate_court_record.priority_mode = 'NAIPE'::public.bracket_court_priority_mode THEN
            CASE
              WHEN candidate_court_record.primary_naipe IS NULL OR candidate_court_record.primary_naipe = pending_match_record.naipe THEN 0
              ELSE 1
            END
          WHEN candidate_court_record.priority_mode = 'DIVISION'::public.bracket_court_priority_mode THEN
            CASE
              WHEN candidate_court_record.primary_division IS NULL OR candidate_court_record.primary_division = pending_match_record.division THEN 0
              ELSE 1
            END
          ELSE 0
        END;

        candidate_secondary_rank := CASE
          WHEN candidate_court_record.priority_mode = 'NAIPE'::public.bracket_court_priority_mode THEN
            CASE
              WHEN pending_match_record.division IS NULL OR candidate_court_record.last_division IS NULL THEN 1
              WHEN pending_match_record.division <> candidate_court_record.last_division THEN 0
              ELSE 1
            END
          WHEN candidate_court_record.priority_mode = 'DIVISION'::public.bracket_court_priority_mode THEN
            CASE
              WHEN candidate_court_record.last_naipe IS NULL THEN 1
              WHEN pending_match_record.naipe <> candidate_court_record.last_naipe THEN 0
              ELSE 1
            END
          ELSE 1
        END;

        IF NOT best_candidate_found
          OR candidate_start_at < best_start_at
          OR (
            candidate_start_at = best_start_at
            AND candidate_primary_rank < best_primary_rank
          )
          OR (
            candidate_start_at = best_start_at
            AND candidate_primary_rank = best_primary_rank
            AND candidate_secondary_rank < best_secondary_rank
          )
          OR (
            candidate_start_at = best_start_at
            AND candidate_primary_rank = best_primary_rank
            AND candidate_secondary_rank = best_secondary_rank
            AND candidate_related_same_naipe_history_count > best_related_same_naipe_history_count
          )
          OR (
            candidate_start_at = best_start_at
            AND candidate_primary_rank = best_primary_rank
            AND candidate_secondary_rank = best_secondary_rank
            AND candidate_related_same_naipe_history_count = best_related_same_naipe_history_count
            AND pending_match_record.order_index < best_order_index
          )
          OR (
            candidate_start_at = best_start_at
            AND candidate_primary_rank = best_primary_rank
            AND candidate_secondary_rank = best_secondary_rank
            AND candidate_related_same_naipe_history_count = best_related_same_naipe_history_count
            AND pending_match_record.order_index = best_order_index
            AND candidate_court_record.assigned_count < best_assigned_count
          )
          OR (
            candidate_start_at = best_start_at
            AND candidate_primary_rank = best_primary_rank
            AND candidate_secondary_rank = best_secondary_rank
            AND candidate_related_same_naipe_history_count = best_related_same_naipe_history_count
            AND pending_match_record.order_index = best_order_index
            AND candidate_court_record.assigned_count = best_assigned_count
            AND (
              candidate_court_record.location_position < best_location_position
              OR (
                candidate_court_record.location_position = best_location_position
                AND candidate_court_record.court_position < best_court_position
              )
            )
          )
        THEN
          best_candidate_found := true;
          best_match_id := pending_match_record.match_id;
          best_order_index := pending_match_record.order_index;
          best_sport_id := pending_match_record.sport_id;
          best_naipe := pending_match_record.naipe;
          best_division := pending_match_record.division;
          best_home_team_id := pending_match_record.home_team_id;
          best_away_team_id := pending_match_record.away_team_id;
          best_duration_minutes := pending_match_record.duration_minutes;
          best_day_id := candidate_court_record.bracket_day_id;
          best_court_id := candidate_court_record.court_id;
          best_event_date := candidate_court_record.event_date;
          best_location_name := candidate_court_record.location_name;
          best_location_group_id := candidate_court_record.location_group_id;
          best_location_position := candidate_court_record.location_position;
          best_court_name := candidate_court_record.court_name;
          best_court_group_id := candidate_court_record.court_group_id;
          best_court_position := candidate_court_record.court_position;
          best_start_at := candidate_start_at;
          best_end_at := candidate_end_at;
          best_primary_rank := candidate_primary_rank;
          best_secondary_rank := candidate_secondary_rank;
          best_assigned_count := candidate_court_record.assigned_count;
          best_related_same_naipe_history_count := candidate_related_same_naipe_history_count;
        END IF;
      END LOOP;
    END LOOP;

    EXIT WHEN NOT best_candidate_found;

    INSERT INTO tmp_global_assignments (
      match_id,
      order_index,
      sport_id,
      naipe,
      division,
      home_team_id,
      away_team_id,
      duration_minutes,
      court_sequence_index,
      new_scheduled_date,
      location_name,
      location_position,
      court_name,
      court_position,
      planned_start_at,
      planned_end_at
    )
    VALUES (
      best_match_id,
      best_order_index,
      best_sport_id,
      best_naipe,
      best_division,
      best_home_team_id,
      best_away_team_id,
      best_duration_minutes,
      best_assigned_count + 1,
      best_event_date,
      best_location_name,
      best_location_position,
      best_court_name,
      best_court_position,
      best_start_at,
      best_end_at
    );

    UPDATE tmp_global_day_courts
    SET
      next_available_at = best_end_at,
      assigned_count = assigned_count + 1,
      last_naipe = best_naipe,
      last_division = best_division
    WHERE court_id = best_court_id
      AND sport_id = best_sport_id
      AND bracket_day_id = best_day_id;

    DELETE FROM tmp_global_pending_matches
    WHERE order_index = best_order_index;
  END LOOP;

  DROP TABLE IF EXISTS tmp_global_assignment_queue_positions;
  CREATE TEMP TABLE tmp_global_assignment_queue_positions AS
  SELECT
    assignments_table.match_id,
    DENSE_RANK() OVER (
      PARTITION BY assignments_table.new_scheduled_date
      ORDER BY assignments_table.planned_start_at ASC
    ) AS new_scheduled_slot,
    ROW_NUMBER() OVER (
      PARTITION BY
        assignments_table.new_scheduled_date,
        assignments_table.sport_id,
        assignments_table.naipe,
        public.coerce_division_for_index(assignments_table.division)
      ORDER BY
        assignments_table.planned_start_at ASC,
        assignments_table.location_position ASC,
        assignments_table.court_position ASC,
        assignments_table.order_index ASC
    ) AS new_queue_position,
    assignments_table.new_scheduled_date,
    assignments_table.location_name,
    assignments_table.court_name,
    assignments_table.planned_start_at,
    assignments_table.planned_end_at
  FROM tmp_global_assignments AS assignments_table;

  UPDATE public.matches AS matches_table
  SET queue_position = NULL
  FROM tmp_global_assignment_queue_positions AS assignment_queue_positions_table
  WHERE assignment_queue_positions_table.match_id = matches_table.id;

  UPDATE public.matches AS matches_table
  SET
    scheduled_date = assignment_queue_positions_table.new_scheduled_date,
    scheduled_slot = assignment_queue_positions_table.new_scheduled_slot,
    queue_position = assignment_queue_positions_table.new_queue_position,
    location = assignment_queue_positions_table.location_name,
    court_name = assignment_queue_positions_table.court_name,
    start_time = assignment_queue_positions_table.planned_start_at,
    end_time = assignment_queue_positions_table.planned_end_at
  FROM tmp_global_assignment_queue_positions AS assignment_queue_positions_table
  WHERE assignment_queue_positions_table.match_id = matches_table.id;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.generate_championship_bracket_groups(uuid, jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Função public.generate_championship_bracket_groups(uuid, jsonb) não encontrada.';
  END IF;
END
$$;

DO $$
DECLARE
  affected_bracket_edition_id UUID;
  same_court_conflicts_count INTEGER := 0;
  cross_court_conflicts_count INTEGER := 0;
  redistribution_pass INTEGER := 0;
  max_redistribution_passes CONSTANT INTEGER := 5;
BEGIN
  SELECT DISTINCT bracket_matches_table.bracket_edition_id
  INTO affected_bracket_edition_id
  FROM public.matches AS matches_table
  JOIN public.championship_bracket_matches AS bracket_matches_table
    ON bracket_matches_table.match_id = matches_table.id
  WHERE matches_table.championship_id = '17b92cf5-dd92-44eb-9295-b28000372e4b'::uuid
    AND matches_table.season_year = 2026
    AND matches_table.status = 'SCHEDULED'::public.match_status
    AND matches_table.scheduled_date BETWEEN '2026-06-20'::date AND '2026-06-21'::date
  LIMIT 1;

  IF affected_bracket_edition_id IS NOT NULL THEN
    BEGIN
      ALTER TABLE public.matches DISABLE TRIGGER check_match_conflict;

      LOOP
        redistribution_pass := redistribution_pass + 1;
        EXIT WHEN redistribution_pass > max_redistribution_passes;

        PERFORM public.redistribute_bracket_scheduled_matches(affected_bracket_edition_id);

      WITH scoped_matches AS (
        SELECT
          matches_table.id,
          matches_table.scheduled_date,
          matches_table.location,
          matches_table.court_name,
          matches_table.start_time,
          matches_table.naipe,
          matches_table.home_team_id,
          matches_table.away_team_id,
          GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1) AS duration_minutes
        FROM public.matches AS matches_table
        JOIN public.championship_bracket_matches AS bracket_matches_table
          ON bracket_matches_table.match_id = matches_table.id
        LEFT JOIN public.championship_sports AS championship_sports_table
          ON championship_sports_table.championship_id = matches_table.championship_id
          AND championship_sports_table.sport_id = matches_table.sport_id
        WHERE bracket_matches_table.bracket_edition_id = affected_bracket_edition_id
          AND matches_table.status = 'SCHEDULED'::public.match_status
          AND matches_table.scheduled_date BETWEEN '2026-06-20'::date AND '2026-06-21'::date
          AND NULLIF(trim(COALESCE(matches_table.location, '')), '') IS NOT NULL
          AND NULLIF(trim(COALESCE(matches_table.court_name, '')), '') IS NOT NULL
      ),
      ordered_matches AS (
        SELECT
          scoped_matches.*,
          row_number() OVER (
            PARTITION BY
              scoped_matches.scheduled_date,
              public.normalize_bracket_entity_name(scoped_matches.location),
              public.normalize_bracket_entity_name(scoped_matches.court_name)
            ORDER BY
              CASE
                WHEN scoped_matches.start_time IS NULL THEN 1
                ELSE 0
              END,
              scoped_matches.start_time ASC NULLS LAST,
              scoped_matches.id ASC
          ) AS court_sequence_index
        FROM scoped_matches
      ),
      same_court_conflicts AS (
        SELECT 1
        FROM ordered_matches AS first_match
        JOIN ordered_matches AS second_match
          ON second_match.id <> first_match.id
        WHERE first_match.naipe = second_match.naipe
          AND first_match.scheduled_date = second_match.scheduled_date
          AND public.normalize_bracket_entity_name(first_match.location) = public.normalize_bracket_entity_name(second_match.location)
          AND public.normalize_bracket_entity_name(first_match.court_name) = public.normalize_bracket_entity_name(second_match.court_name)
          AND ABS(first_match.court_sequence_index - second_match.court_sequence_index) < 4
          AND (
            second_match.home_team_id IN (first_match.home_team_id, first_match.away_team_id)
            OR second_match.away_team_id IN (first_match.home_team_id, first_match.away_team_id)
          )
        LIMIT 1
      ),
      cross_court_conflicts AS (
        SELECT 1
        FROM scoped_matches AS first_match
        JOIN scoped_matches AS second_match
          ON second_match.id <> first_match.id
        WHERE first_match.naipe = second_match.naipe
          AND first_match.scheduled_date = second_match.scheduled_date
          AND (
            public.normalize_bracket_entity_name(first_match.location) <> public.normalize_bracket_entity_name(second_match.location)
            OR public.normalize_bracket_entity_name(first_match.court_name) <> public.normalize_bracket_entity_name(second_match.court_name)
          )
          AND (
            second_match.home_team_id IN (first_match.home_team_id, first_match.away_team_id)
            OR second_match.away_team_id IN (first_match.home_team_id, first_match.away_team_id)
          )
          AND first_match.start_time IS NOT NULL
          AND second_match.start_time IS NOT NULL
          AND ABS(EXTRACT(EPOCH FROM (second_match.start_time - first_match.start_time)) / 60.0)
            < GREATEST(first_match.duration_minutes, second_match.duration_minutes) * 4
        LIMIT 1
      )
      SELECT
        CASE WHEN EXISTS (SELECT 1 FROM same_court_conflicts) THEN 1 ELSE 0 END,
        CASE WHEN EXISTS (SELECT 1 FROM cross_court_conflicts) THEN 1 ELSE 0 END
      INTO same_court_conflicts_count, cross_court_conflicts_count;

        EXIT WHEN same_court_conflicts_count = 0 AND cross_court_conflicts_count = 0;
      END LOOP;

      ALTER TABLE public.matches ENABLE TRIGGER check_match_conflict;
    EXCEPTION
      WHEN OTHERS THEN
        ALTER TABLE public.matches ENABLE TRIGGER check_match_conflict;
        RAISE;
    END;

    IF same_court_conflicts_count > 0 OR cross_court_conflicts_count > 0 THEN
      RAISE EXCEPTION
        'Ainda restam conflitos de descanso após % tentativa(s): % na mesma quadra e % entre quadras no mesmo dia.',
        max_redistribution_passes,
        same_court_conflicts_count,
        cross_court_conflicts_count;
    END IF;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
