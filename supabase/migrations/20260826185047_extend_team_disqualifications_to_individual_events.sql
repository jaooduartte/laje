ALTER FUNCTION public.disqualify_championship_team_competition(
  UUID,
  INTEGER,
  UUID,
  public.match_naipe,
  public.team_division,
  UUID
) RENAME TO disqualify_championship_collective_team_competition;

ALTER FUNCTION public.get_championship_effective_standings(
  UUID,
  INTEGER,
  TEXT,
  public.match_naipe,
  UUID
) RENAME TO get_championship_effective_standings_base;

CREATE OR REPLACE FUNCTION public.recalculate_championship_individual_event_positions(
  _championship_id UUID,
  _season_year INTEGER,
  _sport_id UUID,
  _naipe public.match_naipe,
  _division public.team_division
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.championship_individual_event_entries AS entries_table
  SET final_position = NULL
  FROM public.championship_individual_events AS events_table
  WHERE events_table.id = entries_table.event_id
    AND events_table.championship_id = _championship_id
    AND events_table.season_year = _season_year
    AND events_table.sport_id = _sport_id
    AND events_table.naipe = _naipe
    AND events_table.division IS NOT DISTINCT FROM _division;

  WITH ranked_entries AS (
    SELECT
      entries_table.id,
      ROW_NUMBER() OVER (
        PARTITION BY entries_table.event_id
        ORDER BY
          CASE
            WHEN events_table.event_code IN ('ATHLETICS_SHOT_PUT', 'ATHLETICS_LONG_JUMP')
            THEN entries_table.result_mark_centimeters
          END DESC NULLS LAST,
          CASE
            WHEN events_table.event_code NOT IN ('ATHLETICS_SHOT_PUT', 'ATHLETICS_LONG_JUMP')
            THEN entries_table.result_time_milliseconds
          END ASC NULLS LAST,
          entries_table.id
      ) AS final_position
    FROM public.championship_individual_event_entries AS entries_table
    JOIN public.championship_individual_events AS events_table
      ON events_table.id = entries_table.event_id
    WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status
      AND events_table.championship_id = _championship_id
      AND events_table.season_year = _season_year
      AND events_table.sport_id = _sport_id
      AND events_table.naipe = _naipe
      AND events_table.division IS NOT DISTINCT FROM _division
  )
  UPDATE public.championship_individual_event_entries AS entries_table
  SET final_position = ranked_entries.final_position
  FROM ranked_entries
  WHERE entries_table.id = ranked_entries.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_disqualified_individual_entry_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_record public.championship_individual_events%ROWTYPE;
BEGIN
  SELECT *
  INTO event_record
  FROM public.championship_individual_events
  WHERE id = NEW.event_id;

  IF event_record.id IS NULL OR NOT public.is_championship_competition_team_disqualified(
    event_record.championship_id,
    event_record.season_year,
    event_record.sport_id,
    event_record.naipe,
    event_record.division,
    NEW.team_id
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'A atlética está desclassificada desta modalidade e naipe.';
  END IF;

  NEW.status := 'DSQ'::public.championship_individual_entry_status;
  NEW.result_time_milliseconds := NULL;
  NEW.result_mark_centimeters := NULL;
  NEW.attempt_one_centimeters := NULL;
  NEW.attempt_two_centimeters := NULL;
  NEW.attempt_three_centimeters := NULL;
  NEW.final_position := NULL;
  NEW.points_awarded := 0;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS championship_individual_entries_prevent_disqualified_team_write
  ON public.championship_individual_event_entries;

CREATE TRIGGER championship_individual_entries_prevent_disqualified_team_write
BEFORE INSERT OR UPDATE ON public.championship_individual_event_entries
FOR EACH ROW
EXECUTE FUNCTION public.prevent_disqualified_individual_entry_write();

CREATE OR REPLACE FUNCTION public.save_championship_athlete(
  _championship_id UUID,
  _season_year INTEGER,
  _sport_id UUID,
  _team_id UUID,
  _naipe public.match_naipe,
  _division public.team_division,
  _name TEXT,
  _athlete_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  normalized_name TEXT;
  saved_athlete_id UUID;
BEGIN
  IF public.is_championship_competition_team_disqualified(
    _championship_id,
    _season_year,
    _sport_id,
    _naipe,
    _division,
    _team_id
  ) THEN
    RAISE EXCEPTION 'A atlética está desclassificada desta modalidade e naipe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.teams AS teams_table
    WHERE teams_table.id = _team_id
      AND COALESCE(teams_table.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'Atlética inválida ou inativa.';
  END IF;

  normalized_name := NULLIF(trim(COALESCE(_name, '')), '');

  IF normalized_name IS NULL THEN
    RAISE EXCEPTION 'Informe o nome do atleta.';
  END IF;

  IF _athlete_id IS NULL THEN
    IF (
      SELECT COUNT(*)
      FROM public.championship_award_players AS athletes_table
      WHERE athletes_table.championship_id = _championship_id
        AND athletes_table.season_year = _season_year
        AND athletes_table.sport_id = _sport_id
        AND athletes_table.team_id = _team_id
        AND athletes_table.naipe = _naipe
        AND athletes_table.division IS NOT DISTINCT FROM _division
    ) >= 18 THEN
      RAISE EXCEPTION 'Cada atlética pode cadastrar no máximo 18 atletas por modalidade e naipe.';
    END IF;

    INSERT INTO public.championship_award_players (
      championship_id,
      season_year,
      sport_id,
      team_id,
      naipe,
      division,
      name,
      normalized_name
    ) VALUES (
      _championship_id,
      _season_year,
      _sport_id,
      _team_id,
      _naipe,
      _division,
      normalized_name,
      lower(normalized_name)
    )
    RETURNING id INTO saved_athlete_id;

    RETURN saved_athlete_id;
  END IF;

  UPDATE public.championship_award_players
  SET
    sport_id = _sport_id,
    team_id = _team_id,
    naipe = _naipe,
    division = _division,
    name = normalized_name,
    normalized_name = lower(normalized_name)
  WHERE id = _athlete_id
    AND championship_id = _championship_id
    AND season_year = _season_year
  RETURNING id INTO saved_athlete_id;

  IF saved_athlete_id IS NULL THEN
    RAISE EXCEPTION 'Atleta não encontrado.';
  END IF;

  RETURN saved_athlete_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_championship_individual_session_participants(
  _session_id UUID
)
RETURNS TABLE (
  team_id UUID,
  teams public.teams
)
LANGUAGE sql
STABLE
AS $$
  WITH current_session AS (
    SELECT *
    FROM public.championship_individual_sessions
    WHERE id = _session_id
  ),
  payload_snapshot AS (
    SELECT public.get_championship_setup_payload_snapshot(
      current_session.championship_id,
      current_session.season_year
    ) AS payload
    FROM current_session
  ),
  configured_participants AS (
    SELECT DISTINCT (participant_record.value->>'team_id')::uuid AS team_id
    FROM current_session
    CROSS JOIN payload_snapshot
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(payload_snapshot.payload->'participants', '[]'::jsonb)) AS participant_record(value)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(participant_record.value->'modalities', '[]'::jsonb)) AS modality_record(value)
    WHERE (modality_record.value->>'sport_id')::uuid = current_session.sport_id
      AND (modality_record.value->>'naipe')::public.match_naipe = current_session.naipe
      AND (
        CASE
          WHEN NULLIF(modality_record.value->>'division', '') IS NULL THEN NULL
          ELSE (modality_record.value->>'division')::public.team_division
        END
      ) IS NOT DISTINCT FROM current_session.division
  )
  SELECT configured_participants.team_id, teams_table
  FROM configured_participants
  CROSS JOIN current_session
  JOIN public.teams AS teams_table
    ON teams_table.id = configured_participants.team_id
  WHERE NOT public.is_championship_competition_team_disqualified(
    current_session.championship_id,
    current_session.season_year,
    current_session.sport_id,
    current_session.naipe,
    current_session.division,
    configured_participants.team_id
  )
  ORDER BY teams_table.name;
$$;

CREATE OR REPLACE FUNCTION public.disqualify_championship_individual_team_competition(
  _championship_id UUID,
  _season_year INTEGER,
  _sport_id UUID,
  _naipe public.match_naipe,
  _division public.team_division,
  _team_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  disqualification_id UUID;
  updated_entries_count INTEGER := 0;
BEGIN
  INSERT INTO public.championship_competition_team_disqualifications (
    championship_id,
    season_year,
    sport_id,
    naipe,
    division,
    team_id,
    created_by
  ) VALUES (
    _championship_id,
    _season_year,
    _sport_id,
    _naipe,
    _division,
    _team_id,
    auth.uid()
  )
  ON CONFLICT (championship_id, season_year, sport_id, naipe, division, team_id)
  DO UPDATE
  SET
    created_by = EXCLUDED.created_by,
    created_at = now()
  RETURNING id INTO disqualification_id;

  UPDATE public.championship_individual_event_entries AS entries_table
  SET
    status = 'DSQ'::public.championship_individual_entry_status,
    result_time_milliseconds = NULL,
    result_mark_centimeters = NULL,
    attempt_one_centimeters = NULL,
    attempt_two_centimeters = NULL,
    attempt_three_centimeters = NULL,
    final_position = NULL,
    points_awarded = 0,
    updated_at = now()
  FROM public.championship_individual_events AS events_table
  WHERE events_table.id = entries_table.event_id
    AND events_table.championship_id = _championship_id
    AND events_table.season_year = _season_year
    AND events_table.sport_id = _sport_id
    AND events_table.naipe = _naipe
    AND events_table.division IS NOT DISTINCT FROM _division
    AND entries_table.team_id = _team_id
    AND entries_table.status != 'CANCELLED'::public.championship_individual_entry_status;

  GET DIAGNOSTICS updated_entries_count = ROW_COUNT;

  DELETE FROM public.championship_overall_competition_placements
  WHERE championship_id = _championship_id
    AND season_year = _season_year
    AND sport_id = _sport_id
    AND naipe = _naipe
    AND division IS NOT DISTINCT FROM _division
    AND team_id = _team_id;

  PERFORM public.recalculate_championship_individual_event_positions(
    _championship_id,
    _season_year,
    _sport_id,
    _naipe,
    _division
  );

  PERFORM public.recalculate_championship_individual_standings(
    _championship_id,
    _season_year
  );

  RETURN jsonb_build_object(
    'success', true,
    'disqualification_id', disqualification_id,
    'updated_entries_count', updated_entries_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.disqualify_championship_team_competition(
  _championship_id UUID,
  _season_year INTEGER,
  _sport_id UUID,
  _naipe public.match_naipe,
  _division public.team_division,
  _team_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  championship_status_value public.championship_status;
BEGIN
  IF NOT public.has_admin_tab_access('standings'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para desclassificar atléticas.';
  END IF;

  SELECT status
  INTO championship_status_value
  FROM public.championships
  WHERE id = _championship_id;

  IF championship_status_value NOT IN (
    'REVIEW'::public.championship_status,
    'IN_PROGRESS'::public.championship_status,
    'FINISHED'::public.championship_status
  ) THEN
    RAISE EXCEPTION 'A desclassificação só está disponível em revisão, em andamento ou encerrado.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = competitions_table.bracket_edition_id
    WHERE editions_table.championship_id = _championship_id
      AND editions_table.season_year = _season_year
      AND competitions_table.sport_id = _sport_id
      AND competitions_table.naipe = _naipe
      AND competitions_table.division IS NOT DISTINCT FROM _division
  ) THEN
    RETURN public.disqualify_championship_collective_team_competition(
      _championship_id,
      _season_year,
      _sport_id,
      _naipe,
      _division,
      _team_id
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.championship_individual_sessions AS sessions_table
    WHERE sessions_table.championship_id = _championship_id
      AND sessions_table.season_year = _season_year
      AND sessions_table.sport_id = _sport_id
      AND sessions_table.naipe = _naipe
      AND sessions_table.division IS NOT DISTINCT FROM _division
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.championship_individual_sessions AS sessions_table
      CROSS JOIN LATERAL public.get_championship_individual_session_participants(
        sessions_table.id
      ) AS participants_table
      WHERE sessions_table.championship_id = _championship_id
        AND sessions_table.season_year = _season_year
        AND sessions_table.sport_id = _sport_id
        AND sessions_table.naipe = _naipe
        AND sessions_table.division IS NOT DISTINCT FROM _division
        AND participants_table.team_id = _team_id
    ) THEN
      RAISE EXCEPTION 'A atlética informada não participa desta competição.';
    END IF;

    RETURN public.disqualify_championship_individual_team_competition(
      _championship_id,
      _season_year,
      _sport_id,
      _naipe,
      _division,
      _team_id
    );
  END IF;

  RAISE EXCEPTION 'Competição filtrada não encontrada para a desclassificação.';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_championship_effective_standings(
  _championship_id UUID DEFAULT NULL,
  _season_year INTEGER DEFAULT NULL,
  _division_filter TEXT DEFAULT NULL,
  _naipe public.match_naipe DEFAULT NULL,
  _sport_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  championship_id UUID,
  season_year INTEGER,
  division public.team_division,
  naipe public.match_naipe,
  sport_id UUID,
  team_id UUID,
  played INTEGER,
  wins INTEGER,
  draws INTEGER,
  losses INTEGER,
  goals_for INTEGER,
  goals_against INTEGER,
  goal_diff INTEGER,
  points NUMERIC,
  yellow_cards INTEGER,
  red_cards INTEGER,
  blue_cards INTEGER,
  two_minute_penalties INTEGER,
  updated_at TIMESTAMPTZ,
  is_individual_sport BOOLEAN,
  scored_events_count INTEGER,
  first_places INTEGER,
  second_places INTEGER,
  third_places INTEGER,
  fourth_places INTEGER,
  fifth_places INTEGER,
  sixth_places INTEGER,
  seventh_places INTEGER,
  eighth_places INTEGER,
  ninth_places INTEGER,
  tenth_places INTEGER,
  eleventh_places INTEGER,
  twelfth_places INTEGER,
  thirteenth_places INTEGER,
  fourteenth_places INTEGER,
  fifteenth_places INTEGER,
  sixteenth_places INTEGER,
  seventeenth_places INTEGER,
  eighteenth_places INTEGER,
  nineteenth_places INTEGER,
  twentieth_places INTEGER,
  relay_points_total NUMERIC,
  team_name TEXT,
  team_city TEXT,
  sport_name TEXT
)
LANGUAGE sql
STABLE
AS $$
  WITH base_standings AS (
    SELECT *
    FROM public.get_championship_effective_standings_base(
      _championship_id,
      _season_year,
      _division_filter,
      _naipe,
      _sport_id
    )
  ), individual_disqualifications AS (
    SELECT disqualifications_table.*
    FROM public.championship_competition_team_disqualifications AS disqualifications_table
    WHERE (_championship_id IS NULL OR disqualifications_table.championship_id = _championship_id)
      AND (_season_year IS NULL OR disqualifications_table.season_year = _season_year)
      AND (_sport_id IS NULL OR disqualifications_table.sport_id = _sport_id)
      AND (_naipe IS NULL OR disqualifications_table.naipe = _naipe)
      AND (
        _division_filter IS NULL
        OR (_division_filter = 'WITHOUT_DIVISION' AND disqualifications_table.division IS NULL)
        OR (_division_filter <> 'WITHOUT_DIVISION' AND disqualifications_table.division::text = _division_filter)
      )
      AND EXISTS (
        SELECT 1
        FROM public.championship_individual_sessions AS sessions_table
        WHERE sessions_table.championship_id = disqualifications_table.championship_id
          AND sessions_table.season_year = disqualifications_table.season_year
          AND sessions_table.sport_id = disqualifications_table.sport_id
          AND sessions_table.naipe = disqualifications_table.naipe
          AND sessions_table.division IS NOT DISTINCT FROM disqualifications_table.division
      )
  )
  SELECT * FROM base_standings

  UNION ALL

  SELECT
    individual_disqualifications.id,
    individual_disqualifications.championship_id,
    individual_disqualifications.season_year,
    individual_disqualifications.division,
    individual_disqualifications.naipe,
    individual_disqualifications.sport_id,
    individual_disqualifications.team_id,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0::numeric,
    0,
    0,
    0,
    0,
    individual_disqualifications.created_at,
    true,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0::numeric,
    teams_table.name,
    teams_table.city,
    sports_table.name
  FROM individual_disqualifications
  JOIN public.teams AS teams_table
    ON teams_table.id = individual_disqualifications.team_id
  JOIN public.sports AS sports_table
    ON sports_table.id = individual_disqualifications.sport_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM base_standings
    WHERE base_standings.championship_id = individual_disqualifications.championship_id
      AND base_standings.season_year = individual_disqualifications.season_year
      AND base_standings.sport_id = individual_disqualifications.sport_id
      AND base_standings.naipe = individual_disqualifications.naipe
      AND base_standings.division IS NOT DISTINCT FROM individual_disqualifications.division
      AND base_standings.team_id = individual_disqualifications.team_id
  );
$$;

REVOKE ALL ON FUNCTION public.disqualify_championship_individual_team_competition(UUID, INTEGER, UUID, public.match_naipe, public.team_division, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalculate_championship_individual_event_positions(UUID, INTEGER, UUID, public.match_naipe, public.team_division) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_disqualified_individual_entry_write() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.disqualify_championship_team_competition(UUID, INTEGER, UUID, public.match_naipe, public.team_division, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_championship_effective_standings(UUID, INTEGER, TEXT, public.match_naipe, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_championship_individual_session_participants(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_championship_athlete(UUID, INTEGER, UUID, UUID, public.match_naipe, public.team_division, TEXT, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
