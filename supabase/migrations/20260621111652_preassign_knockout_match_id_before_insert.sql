CREATE OR REPLACE FUNCTION public.create_championship_knockout_match_schedule(
  _championship_id UUID,
  _bracket_match_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bracket_match_record RECORD;
  competition_total_rounds INTEGER;
  selected_queue_date DATE;
  selected_location_name TEXT;
  selected_preferred_court_group_id UUID;
  new_match_id UUID;
BEGIN
  SELECT
    bracket_matches_table.id,
    bracket_matches_table.bracket_edition_id,
    bracket_matches_table.match_id,
    bracket_matches_table.home_team_id,
    bracket_matches_table.away_team_id,
    bracket_matches_table.round_number,
    bracket_matches_table.is_third_place,
    competitions_table.division,
    competitions_table.naipe,
    competitions_table.sport_id,
    editions_table.season_year
  INTO bracket_match_record
  FROM public.championship_bracket_matches AS bracket_matches_table
  JOIN public.championship_bracket_competitions AS competitions_table
    ON competitions_table.id = bracket_matches_table.competition_id
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = bracket_matches_table.bracket_edition_id
  WHERE bracket_matches_table.id = _bracket_match_id
  LIMIT 1;

  IF bracket_match_record.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF bracket_match_record.match_id IS NOT NULL THEN
    RETURN bracket_match_record.match_id;
  END IF;

  IF bracket_match_record.home_team_id IS NULL OR bracket_match_record.away_team_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT MAX(bracket_matches_table.round_number) FILTER (WHERE bracket_matches_table.is_third_place = false)
  INTO competition_total_rounds
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.bracket_edition_id = bracket_match_record.bracket_edition_id
    AND bracket_matches_table.competition_id = (
      SELECT competition_id
      FROM public.championship_bracket_matches
      WHERE id = _bracket_match_id
      LIMIT 1
    );

  SELECT COALESCE(
    (
      SELECT MAX(matches_table.scheduled_date)
      FROM public.matches AS matches_table
      WHERE matches_table.championship_id = _championship_id
        AND matches_table.season_year = bracket_match_record.season_year
        AND matches_table.scheduled_date IS NOT NULL
    ),
    (
      SELECT MIN(days_table.event_date)
      FROM public.championship_bracket_days AS days_table
      WHERE days_table.bracket_edition_id = bracket_match_record.bracket_edition_id
    )
  )
  INTO selected_queue_date;

  selected_preferred_court_group_id := public.resolve_bracket_knockout_priority_court_group_id(
    bracket_match_record.bracket_edition_id,
    bracket_match_record.sport_id,
    public.resolve_bracket_knockout_match_phase(
      bracket_match_record.round_number,
      competition_total_rounds,
      bracket_match_record.is_third_place
    ),
    public.resolve_bracket_knockout_division_scope(bracket_match_record.division)
  );

  SELECT schedule_candidates.location_name
  INTO selected_location_name
  FROM (
    SELECT DISTINCT
      locations_table.position,
      locations_table.name AS location_name,
      courts_table.court_group_id
    FROM public.championship_bracket_days AS days_table
    JOIN public.championship_bracket_locations AS locations_table
      ON locations_table.bracket_day_id = days_table.id
    JOIN public.championship_bracket_courts AS courts_table
      ON courts_table.bracket_location_id = locations_table.id
    JOIN public.championship_bracket_court_sports AS court_sports_table
      ON court_sports_table.bracket_court_id = courts_table.id
    WHERE days_table.bracket_edition_id = bracket_match_record.bracket_edition_id
      AND court_sports_table.sport_id = bracket_match_record.sport_id
      AND days_table.event_date = selected_queue_date
  ) AS schedule_candidates
  WHERE selected_preferred_court_group_id IS NULL
    OR schedule_candidates.court_group_id = selected_preferred_court_group_id
  ORDER BY
    schedule_candidates.position ASC,
    schedule_candidates.location_name ASC
  LIMIT 1;

  IF selected_location_name IS NULL THEN
    SELECT schedule_candidates.location_name
    INTO selected_location_name
    FROM (
      SELECT DISTINCT
        locations_table.position,
        locations_table.name AS location_name
      FROM public.championship_bracket_days AS days_table
      JOIN public.championship_bracket_locations AS locations_table
        ON locations_table.bracket_day_id = days_table.id
      JOIN public.championship_bracket_courts AS courts_table
        ON courts_table.bracket_location_id = locations_table.id
      JOIN public.championship_bracket_court_sports AS court_sports_table
        ON court_sports_table.bracket_court_id = courts_table.id
      WHERE days_table.bracket_edition_id = bracket_match_record.bracket_edition_id
        AND court_sports_table.sport_id = bracket_match_record.sport_id
        AND days_table.event_date = selected_queue_date
    ) AS schedule_candidates
    ORDER BY
      schedule_candidates.position ASC,
      schedule_candidates.location_name ASC
    LIMIT 1;
  END IF;

  IF selected_queue_date IS NULL OR selected_location_name IS NULL THEN
    RAISE EXCEPTION 'Não há local compatível configurado para gerar a fila do mata-mata nesta modalidade.';
  END IF;

  new_match_id := gen_random_uuid();

  UPDATE public.championship_bracket_matches AS bracket_matches_table
  SET match_id = new_match_id
  WHERE bracket_matches_table.id = _bracket_match_id
    AND bracket_matches_table.match_id IS NULL;

  IF NOT FOUND THEN
    SELECT bracket_matches_table.match_id
    INTO new_match_id
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.id = _bracket_match_id
    LIMIT 1;

    RETURN new_match_id;
  END IF;

  INSERT INTO public.matches (
    id,
    championship_id,
    division,
    naipe,
    sport_id,
    home_team_id,
    away_team_id,
    location,
    court_name,
    scheduled_date,
    queue_position,
    start_time,
    end_time,
    season_year,
    status
  ) VALUES (
    new_match_id,
    _championship_id,
    bracket_match_record.division,
    bracket_match_record.naipe,
    bracket_match_record.sport_id,
    bracket_match_record.home_team_id,
    bracket_match_record.away_team_id,
    selected_location_name,
    NULL,
    selected_queue_date,
    NULL,
    NULL,
    NULL,
    bracket_match_record.season_year,
    'SCHEDULED'::public.match_status
  );

  PERFORM public.redistribute_bracket_scheduled_matches(bracket_match_record.bracket_edition_id);

  RETURN new_match_id;
END;
$$;

COMMENT ON FUNCTION public.create_championship_knockout_match_schedule(UUID, UUID) IS
  'Pré-vincula o match_id do mata-mata antes do INSERT em matches para que os triggers reconheçam o confronto como eliminatório.';

NOTIFY pgrst, 'reload schema';
