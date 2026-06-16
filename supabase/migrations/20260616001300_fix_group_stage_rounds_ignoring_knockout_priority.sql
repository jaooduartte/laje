-- Corrige a redistribuição para não tratar jogos da fase de grupos como
-- semifinal/final apenas porque o round_number da competição chegou em 2/3.
-- Quando championship_bracket_matches.group_id está preenchido, o jogo ainda
-- pertence à fase de grupos e não deve herdar prioridade de quadra do
-- mata-mata.

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
  same_team_conflict BOOLEAN;
  previous_court_assignment_conflict BOOLEAN;
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
            FROM (
              SELECT
                existing_assignments_table.home_team_id,
                existing_assignments_table.away_team_id
              FROM tmp_global_assignments AS existing_assignments_table
              WHERE existing_assignments_table.new_scheduled_date = candidate_court_record.event_date
                AND existing_assignments_table.location_name = candidate_court_record.location_name
                AND existing_assignments_table.court_name = candidate_court_record.court_name
                AND existing_assignments_table.planned_end_at <= candidate_start_at
              ORDER BY
                existing_assignments_table.planned_end_at DESC,
                existing_assignments_table.planned_start_at DESC,
                existing_assignments_table.order_index DESC
              LIMIT 1
            ) AS previous_court_match
            WHERE previous_court_match.home_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
              OR previous_court_match.away_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
          )
          INTO previous_court_assignment_conflict;

          EXIT WHEN NOT previous_court_assignment_conflict;

          candidate_probe_at := candidate_start_at + make_interval(mins => pending_match_record.duration_minutes);
        END LOOP;

        IF candidate_start_at IS NULL THEN
          CONTINUE;
        END IF;

        candidate_end_at := candidate_start_at + make_interval(mins => pending_match_record.duration_minutes);

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
            AND pending_match_record.order_index < best_order_index
          )
          OR (
            candidate_start_at = best_start_at
            AND candidate_primary_rank = best_primary_rank
            AND candidate_secondary_rank = best_secondary_rank
            AND pending_match_record.order_index = best_order_index
            AND candidate_court_record.assigned_count < best_assigned_count
          )
          OR (
            candidate_start_at = best_start_at
            AND candidate_primary_rank = best_primary_rank
            AND candidate_secondary_rank = best_secondary_rank
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
DECLARE
  affected_bracket_edition_id UUID;
BEGIN
  FOR affected_bracket_edition_id IN
    SELECT DISTINCT bracket_editions_table.id
    FROM public.championship_bracket_editions AS bracket_editions_table
    JOIN public.championships AS championships_table
      ON championships_table.id = bracket_editions_table.championship_id
    WHERE championships_table.status = 'UPCOMING'::public.championship_status
  LOOP
    BEGIN
      PERFORM set_config('app.skip_queue_trigger', 'true', true);
      PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);
      PERFORM public.redistribute_bracket_scheduled_matches(affected_bracket_edition_id);
      PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
      PERFORM set_config('app.skip_queue_trigger', 'false', true);
    EXCEPTION
      WHEN OTHERS THEN
        PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
        PERFORM set_config('app.skip_queue_trigger', 'false', true);
        RAISE;
    END;
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
