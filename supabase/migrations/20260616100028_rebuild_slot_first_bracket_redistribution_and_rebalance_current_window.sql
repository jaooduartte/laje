-- Replaneja a redistribuição real da agenda para trabalhar por grade de slots,
-- preenchendo primeiro todos os horários válidos de cada quadra e deixando a
-- prioridade de divisão da quadra acima das heurísticas secundárias antigas.
--
-- Também amplia a validação de descanso:
-- - mesmo naipe: mínimo de 4 jogos de distância na mesma quadra;
-- - naipes diferentes: precisa haver pelo menos 1 jogo no meio na mesma quadra;
-- - outra quadra no mesmo dia: o horário também entra na validação.

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
  same_court_same_naipe_conflict AS (
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
  same_court_different_naipe_conflict AS (
    SELECT 1
    FROM candidate_court_match
    JOIN ordered_court_matches AS other_match
      ON other_match.id <> candidate_court_match.id
    WHERE candidate_court_match.naipe <> other_match.naipe
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
  day_court_record RECORD;
  slot_record RECORD;
  pending_match_record RECORD;
  slot_probe_at TIMESTAMPTZ;
  slot_start_at TIMESTAMPTZ;
  slot_end_at TIMESTAMPTZ;
  slot_sequence_index INTEGER;
  slot_last_naipe public.match_naipe;
  slot_last_division public.team_division;
  has_reserved_division_pending BOOLEAN;
  has_reserved_naipe_pending BOOLEAN;
  same_start_time_team_conflict BOOLEAN;
  same_court_same_naipe_rest_conflict BOOLEAN;
  same_court_different_naipe_rest_conflict BOOLEAN;
  cross_court_same_naipe_time_conflict BOOLEAN;
  cross_court_different_naipe_time_conflict BOOLEAN;
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
    duration_minutes INTEGER NOT NULL,
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
    PRIMARY KEY (court_id, sport_id, bracket_day_id)
  ) ON COMMIT DROP;

  INSERT INTO tmp_global_day_courts (
    bracket_day_id,
    event_date,
    sport_id,
    duration_minutes,
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
    GREATEST(championship_sports_table.default_match_duration_minutes, 1),
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
  JOIN public.championship_sports AS championship_sports_table
    ON championship_sports_table.championship_id = bracket_edition_record.championship_id
    AND championship_sports_table.sport_id = court_sports_table.sport_id
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
        COALESCE(matches_table.start_time, public.combine_bracket_schedule_timestamp(matches_table.scheduled_date, time '23:59')) ASC NULLS LAST,
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

  DROP TABLE IF EXISTS tmp_global_court_slots;
  CREATE TEMP TABLE tmp_global_court_slots (
    slot_id BIGSERIAL PRIMARY KEY,
    bracket_day_id UUID NOT NULL,
    event_date DATE NOT NULL,
    sport_id UUID NOT NULL,
    duration_minutes INTEGER NOT NULL,
    location_name TEXT NOT NULL,
    location_group_id UUID NOT NULL,
    location_position INTEGER NOT NULL,
    court_id UUID NOT NULL,
    court_group_id UUID NOT NULL,
    court_name TEXT NOT NULL,
    court_position INTEGER NOT NULL,
    priority_mode public.bracket_court_priority_mode NOT NULL,
    primary_naipe public.match_naipe NULL,
    primary_division public.team_division NULL,
    slot_start_at TIMESTAMPTZ NOT NULL,
    slot_end_at TIMESTAMPTZ NOT NULL,
    court_sequence_index INTEGER NOT NULL
  ) ON COMMIT DROP;

  FOR day_court_record IN
    SELECT *
    FROM tmp_global_day_courts
    ORDER BY event_date ASC, location_position ASC, court_position ASC, court_name ASC
  LOOP
    slot_probe_at := day_court_record.next_available_at;
    slot_sequence_index := 0;

    LOOP
      slot_start_at := public.resolve_bracket_court_next_available_start(
        day_court_record.bracket_day_id,
        day_court_record.court_id,
        slot_probe_at,
        day_court_record.duration_minutes
      );

      EXIT WHEN slot_start_at IS NULL;

      slot_sequence_index := slot_sequence_index + 1;
      slot_end_at := slot_start_at + make_interval(mins => day_court_record.duration_minutes);

      INSERT INTO tmp_global_court_slots (
        bracket_day_id,
        event_date,
        sport_id,
        duration_minutes,
        location_name,
        location_group_id,
        location_position,
        court_id,
        court_group_id,
        court_name,
        court_position,
        priority_mode,
        primary_naipe,
        primary_division,
        slot_start_at,
        slot_end_at,
        court_sequence_index
      )
      VALUES (
        day_court_record.bracket_day_id,
        day_court_record.event_date,
        day_court_record.sport_id,
        day_court_record.duration_minutes,
        day_court_record.location_name,
        day_court_record.location_group_id,
        day_court_record.location_position,
        day_court_record.court_id,
        day_court_record.court_group_id,
        day_court_record.court_name,
        day_court_record.court_position,
        day_court_record.priority_mode,
        day_court_record.primary_naipe,
        day_court_record.primary_division,
        slot_start_at,
        slot_end_at,
        slot_sequence_index
      );

      slot_probe_at := slot_end_at;
    END LOOP;
  END LOOP;

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

  FOR slot_record IN
    SELECT *
    FROM tmp_global_court_slots
    ORDER BY event_date ASC, slot_start_at ASC, location_position ASC, court_position ASC, court_name ASC
  LOOP
    SELECT
      day_courts_table.last_naipe,
      day_courts_table.last_division
    INTO
      slot_last_naipe,
      slot_last_division
    FROM tmp_global_day_courts AS day_courts_table
    WHERE day_courts_table.bracket_day_id = slot_record.bracket_day_id
      AND day_courts_table.court_id = slot_record.court_id
      AND day_courts_table.sport_id = slot_record.sport_id;

    has_reserved_division_pending := false;
    has_reserved_naipe_pending := false;

    IF slot_record.priority_mode = 'DIVISION'::public.bracket_court_priority_mode
      AND slot_record.primary_division IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM tmp_global_pending_matches AS pending_matches_table
        WHERE pending_matches_table.sport_id = slot_record.sport_id
          AND pending_matches_table.division = slot_record.primary_division
          AND (
            pending_matches_table.preferred_knockout_court_group_id IS NULL
            OR pending_matches_table.preferred_knockout_court_group_id = slot_record.court_group_id
          )
      )
      INTO has_reserved_division_pending;
    END IF;

    IF slot_record.priority_mode = 'NAIPE'::public.bracket_court_priority_mode
      AND slot_record.primary_naipe IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM tmp_global_pending_matches AS pending_matches_table
        WHERE pending_matches_table.sport_id = slot_record.sport_id
          AND pending_matches_table.naipe = slot_record.primary_naipe
          AND (
            pending_matches_table.preferred_knockout_court_group_id IS NULL
            OR pending_matches_table.preferred_knockout_court_group_id = slot_record.court_group_id
          )
      )
      INTO has_reserved_naipe_pending;
    END IF;

    FOR pending_match_record IN
      SELECT
        pending_matches_table.*
      FROM tmp_global_pending_matches AS pending_matches_table
      WHERE pending_matches_table.sport_id = slot_record.sport_id
        AND (
          pending_matches_table.preferred_knockout_court_group_id IS NULL
          OR pending_matches_table.preferred_knockout_court_group_id = slot_record.court_group_id
        )
        AND (
          slot_record.priority_mode <> 'DIVISION'::public.bracket_court_priority_mode
          OR slot_record.primary_division IS NULL
          OR (
            slot_record.primary_division = 'DIVISAO_PRINCIPAL'::public.team_division
            AND pending_matches_table.division IS NOT DISTINCT FROM slot_record.primary_division
          )
          OR (
            slot_record.primary_division = 'DIVISAO_ACESSO'::public.team_division
            AND (
              pending_matches_table.division IS NOT DISTINCT FROM slot_record.primary_division
              OR NOT has_reserved_division_pending
            )
          )
        )
        AND (
          NOT has_reserved_naipe_pending
          OR slot_record.priority_mode <> 'NAIPE'::public.bracket_court_priority_mode
          OR pending_matches_table.naipe IS NOT DISTINCT FROM slot_record.primary_naipe
        )
      ORDER BY
        CASE
          WHEN slot_record.priority_mode = 'DIVISION'::public.bracket_court_priority_mode
            AND slot_record.primary_division IS NOT NULL
            AND pending_matches_table.division IS DISTINCT FROM slot_record.primary_division THEN 1
          WHEN slot_record.priority_mode = 'NAIPE'::public.bracket_court_priority_mode
            AND slot_record.primary_naipe IS NOT NULL
            AND pending_matches_table.naipe IS DISTINCT FROM slot_record.primary_naipe THEN 1
          ELSE 0
        END ASC,
        CASE
          WHEN slot_last_naipe IS NULL THEN 1
          WHEN pending_matches_table.naipe IS DISTINCT FROM slot_last_naipe THEN 0
          ELSE 1
        END ASC,
        (
          SELECT count(*)
          FROM tmp_global_pending_matches AS sibling_pending_matches_table
          WHERE sibling_pending_matches_table.match_id <> pending_matches_table.match_id
            AND sibling_pending_matches_table.sport_id = pending_matches_table.sport_id
            AND sibling_pending_matches_table.naipe = pending_matches_table.naipe
            AND (
              sibling_pending_matches_table.home_team_id IN (pending_matches_table.home_team_id, pending_matches_table.away_team_id)
              OR sibling_pending_matches_table.away_team_id IN (pending_matches_table.home_team_id, pending_matches_table.away_team_id)
            )
        ) DESC,
        (
          SELECT count(*)
          FROM tmp_global_pending_matches AS sibling_pending_matches_table
          WHERE sibling_pending_matches_table.match_id <> pending_matches_table.match_id
            AND sibling_pending_matches_table.sport_id = pending_matches_table.sport_id
            AND sibling_pending_matches_table.naipe <> pending_matches_table.naipe
            AND (
              sibling_pending_matches_table.home_team_id IN (pending_matches_table.home_team_id, pending_matches_table.away_team_id)
              OR sibling_pending_matches_table.away_team_id IN (pending_matches_table.home_team_id, pending_matches_table.away_team_id)
            )
        ) DESC,
        pending_matches_table.order_index ASC
    LOOP
      SELECT EXISTS (
        SELECT 1
        FROM tmp_global_assignments AS existing_assignments_table
        WHERE existing_assignments_table.new_scheduled_date = slot_record.event_date
          AND existing_assignments_table.planned_start_at = slot_record.slot_start_at
          AND (
            existing_assignments_table.home_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
            OR existing_assignments_table.away_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
          )
      )
      INTO same_start_time_team_conflict;

      IF same_start_time_team_conflict THEN
        CONTINUE;
      END IF;

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
      INTO same_court_same_naipe_rest_conflict;

      IF same_court_same_naipe_rest_conflict THEN
        CONTINUE;
      END IF;

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
      INTO same_court_different_naipe_rest_conflict;

      IF same_court_different_naipe_rest_conflict THEN
        CONTINUE;
      END IF;

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
      INTO cross_court_same_naipe_time_conflict;

      IF cross_court_same_naipe_time_conflict THEN
        CONTINUE;
      END IF;

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
      INTO cross_court_different_naipe_time_conflict;

      IF cross_court_different_naipe_time_conflict THEN
        CONTINUE;
      END IF;

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
        pending_match_record.match_id,
        pending_match_record.order_index,
        pending_match_record.sport_id,
        pending_match_record.naipe,
        pending_match_record.division,
        pending_match_record.home_team_id,
        pending_match_record.away_team_id,
        pending_match_record.duration_minutes,
        slot_record.court_sequence_index,
        slot_record.event_date,
        slot_record.location_name,
        slot_record.location_position,
        slot_record.court_name,
        slot_record.court_position,
        slot_record.slot_start_at,
        slot_record.slot_end_at
      );

      UPDATE tmp_global_day_courts AS day_courts_table
      SET
        assigned_count = day_courts_table.assigned_count + 1,
        last_naipe = pending_match_record.naipe,
        last_division = pending_match_record.division
      WHERE day_courts_table.bracket_day_id = slot_record.bracket_day_id
        AND day_courts_table.court_id = slot_record.court_id
        AND day_courts_table.sport_id = slot_record.sport_id;

      DELETE FROM tmp_global_pending_matches
      WHERE order_index = pending_match_record.order_index;

      EXIT;
    END LOOP;
  END LOOP;

  IF EXISTS (SELECT 1 FROM tmp_global_pending_matches) THEN
    RAISE EXCEPTION 'Não foi possível encaixar todos os jogos na grade disponível respeitando descanso e prioridade das quadras.';
  END IF;

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
DECLARE
  function_signature REGPROCEDURE := to_regprocedure('public.generate_championship_bracket_groups(uuid, jsonb)');
  function_definition TEXT;
  updated_definition TEXT;
BEGIN
  IF function_signature IS NULL THEN
    RAISE EXCEPTION 'Função public.generate_championship_bracket_groups(uuid, jsonb) não encontrada.';
  END IF;

  SELECT pg_get_functiondef(function_signature)
  INTO function_definition;

  IF strpos(function_definition, 'PERFORM public.redistribute_bracket_scheduled_matches(bracket_edition_id);') = 0 THEN
    updated_definition := regexp_replace(
      function_definition,
      E'\\n\\s*UPDATE public\\.championships\\n\\s*SET status = ''UPCOMING''::public\\.championship_status\\n\\s*WHERE id = _championship_id;\\n\\n\\s*RETURN bracket_edition_id;',
      E'\n  UPDATE public.championships\n  SET status = ''UPCOMING''::public.championship_status\n  WHERE id = _championship_id;\n\n  PERFORM public.redistribute_bracket_scheduled_matches(bracket_edition_id);\n\n  RETURN bracket_edition_id;',
      'n'
    );

    IF updated_definition = function_definition THEN
      RAISE EXCEPTION 'Não foi possível acoplar a redistribuição final na função public.generate_championship_bracket_groups(uuid, jsonb).';
    END IF;

    EXECUTE updated_definition;
  END IF;
END
$$;

DO $$
BEGIN
  PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);
  PERFORM public.redistribute_bracket_scheduled_matches(
    'a63df7b3-752e-421a-bf08-dcebeef99643'::uuid
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
