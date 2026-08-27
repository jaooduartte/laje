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

CREATE OR REPLACE FUNCTION public.recalculate_championship_individual_athlete_limits(
  _championship_id UUID,
  _season_year INTEGER,
  _sport_id UUID,
  _naipe public.match_naipe,
  _division public.team_division
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.championship_individual_event_entries AS entries_table
  SET status = 'CONFIRMED'::public.championship_individual_entry_status
  FROM public.championship_individual_events AS events_table
  WHERE events_table.id = entries_table.event_id
    AND entries_table.status = 'DSQ_OVER_LIMIT'::public.championship_individual_entry_status
    AND events_table.championship_id = _championship_id
    AND events_table.season_year = _season_year
    AND events_table.sport_id = _sport_id
    AND events_table.naipe = _naipe
    AND events_table.division IS NOT DISTINCT FROM _division;

  WITH participations AS (
    SELECT entries_table.athlete_id, entries_table.id AS entry_id
    FROM public.championship_individual_event_entries AS entries_table
    JOIN public.championship_individual_events AS events_table
      ON events_table.id = entries_table.event_id
    WHERE entries_table.athlete_id IS NOT NULL
      AND entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status
      AND events_table.championship_id = _championship_id
      AND events_table.season_year = _season_year
      AND events_table.sport_id = _sport_id
      AND events_table.naipe = _naipe
      AND events_table.division IS NOT DISTINCT FROM _division

    UNION

    SELECT members_table.athlete_id, entries_table.id AS entry_id
    FROM public.championship_individual_event_entry_members AS members_table
    JOIN public.championship_individual_event_entries AS entries_table
      ON entries_table.id = members_table.entry_id
    JOIN public.championship_individual_events AS events_table
      ON events_table.id = entries_table.event_id
    WHERE members_table.athlete_id IS NOT NULL
      AND members_table.is_starter = true
      AND entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status
      AND events_table.championship_id = _championship_id
      AND events_table.season_year = _season_year
      AND events_table.sport_id = _sport_id
      AND events_table.naipe = _naipe
      AND events_table.division IS NOT DISTINCT FROM _division
  ), excess_athletes AS (
    SELECT athlete_id
    FROM participations
    GROUP BY athlete_id
    HAVING COUNT(DISTINCT entry_id) > 4
  ), disqualified_entries AS (
    SELECT DISTINCT participations.entry_id
    FROM participations
    JOIN excess_athletes
      ON excess_athletes.athlete_id = participations.athlete_id
  )
  UPDATE public.championship_individual_event_entries AS entries_table
  SET
    status = 'DSQ_OVER_LIMIT'::public.championship_individual_entry_status,
    final_position = NULL
  FROM disqualified_entries
  WHERE entries_table.id = disqualified_entries.entry_id;

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
          CASE WHEN events_table.event_code IN ('ATHLETICS_SHOT_PUT', 'ATHLETICS_LONG_JUMP') THEN entries_table.result_mark_centimeters END DESC NULLS LAST,
          CASE WHEN events_table.event_code NOT IN ('ATHLETICS_SHOT_PUT', 'ATHLETICS_LONG_JUMP') THEN entries_table.result_time_milliseconds END ASC NULLS LAST,
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

CREATE OR REPLACE FUNCTION public.save_championship_individual_event_live_results(
  _event_id UUID,
  _entries JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  current_event public.championship_individual_events%ROWTYPE;
  is_measurement_event BOOLEAN;
  normalized_sport_name TEXT;
  confirmed_team_count INTEGER;
  entry_record RECORD;
  saved_entry_id UUID;
  athlete_record public.championship_award_players%ROWTYPE;
  starter_athlete_id UUID;
BEGIN
  SELECT events_table.*
  INTO current_event
  FROM public.championship_individual_events AS events_table
  JOIN public.championship_individual_sessions AS sessions_table
    ON sessions_table.id = events_table.session_id
  JOIN public.championships AS championships_table
    ON championships_table.id = events_table.championship_id
  WHERE events_table.id = _event_id
    AND sessions_table.status = 'LIVE'::public.championship_individual_session_status
    AND championships_table.status = 'IN_PROGRESS'::public.championship_status
  LIMIT 1;

  IF current_event.id IS NULL THEN
    RAISE EXCEPTION 'Resultados só podem ser registrados em sessão ao vivo com o campeonato em andamento.';
  END IF;

  SELECT public.resolve_normalized_sport_name(sports_table.name)
  INTO normalized_sport_name
  FROM public.sports AS sports_table
  WHERE sports_table.id = current_event.sport_id;

  is_measurement_event := current_event.event_code IN ('ATHLETICS_SHOT_PUT', 'ATHLETICS_LONG_JUMP');

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(_entries, '[]'::jsonb)) AS entry_row(
      entry_id UUID,
      team_id UUID,
      athlete_id UUID,
      starter_athlete_ids UUID[],
      lane_number INTEGER,
      status public.championship_individual_entry_status,
      result_time_milliseconds INTEGER,
      attempt_one_centimeters INTEGER,
      attempt_two_centimeters INTEGER,
      attempt_three_centimeters INTEGER
    )
    WHERE entry_row.team_id IS NULL
      OR entry_row.lane_number IS NULL
      OR entry_row.lane_number < 1
      OR (
        current_event.kind = 'INDIVIDUAL'::public.championship_individual_event_kind
        AND entry_row.athlete_id IS NULL
      )
      OR (
        current_event.kind = 'RELAY'::public.championship_individual_event_kind
        AND (
          COALESCE(cardinality(entry_row.starter_athlete_ids), 0) != 4
          OR COALESCE(cardinality(ARRAY(SELECT DISTINCT unnest(entry_row.starter_athlete_ids))), 0) != 4
        )
      )
      OR (
        entry_row.status = 'CONFIRMED'::public.championship_individual_entry_status
        AND (
          (is_measurement_event AND (
            entry_row.attempt_one_centimeters IS NULL
            OR entry_row.attempt_two_centimeters IS NULL
            OR entry_row.attempt_three_centimeters IS NULL
            OR entry_row.result_time_milliseconds IS NOT NULL
          ))
          OR (NOT is_measurement_event AND (
            entry_row.result_time_milliseconds IS NULL
            OR entry_row.attempt_one_centimeters IS NOT NULL
            OR entry_row.attempt_two_centimeters IS NOT NULL
            OR entry_row.attempt_three_centimeters IS NOT NULL
          ))
        )
      )
  ) THEN
    RAISE EXCEPTION 'Informe atlética, atleta ou titulares, raia e resultado completo para cada registro.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(_entries, '[]'::jsonb)) AS entry_row(
      entry_id UUID,
      team_id UUID,
      athlete_id UUID,
      starter_athlete_ids UUID[],
      lane_number INTEGER,
      status public.championship_individual_entry_status,
      result_time_milliseconds INTEGER,
      attempt_one_centimeters INTEGER,
      attempt_two_centimeters INTEGER,
      attempt_three_centimeters INTEGER
    )
    GROUP BY entry_row.team_id, entry_row.lane_number
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cada atlética pode ocupar uma raia apenas uma vez por prova.';
  END IF;

  IF current_event.kind = 'INDIVIDUAL'::public.championship_individual_event_kind
    AND EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(COALESCE(_entries, '[]'::jsonb)) AS entry_row(
        entry_id UUID,
        team_id UUID,
        athlete_id UUID,
        starter_athlete_ids UUID[],
        lane_number INTEGER,
        status public.championship_individual_entry_status,
        result_time_milliseconds INTEGER,
        attempt_one_centimeters INTEGER,
        attempt_two_centimeters INTEGER,
        attempt_three_centimeters INTEGER
      )
      GROUP BY entry_row.athlete_id
      HAVING COUNT(*) > 1
    ) THEN
    RAISE EXCEPTION 'Um atleta pode ocupar somente uma raia por prova.';
  END IF;

  IF current_event.kind = 'RELAY'::public.championship_individual_event_kind
    AND EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(COALESCE(_entries, '[]'::jsonb)) AS entry_row(
        entry_id UUID,
        team_id UUID,
        athlete_id UUID,
        starter_athlete_ids UUID[],
        lane_number INTEGER,
        status public.championship_individual_entry_status,
        result_time_milliseconds INTEGER,
        attempt_one_centimeters INTEGER,
        attempt_two_centimeters INTEGER,
        attempt_three_centimeters INTEGER
      )
      GROUP BY entry_row.team_id
      HAVING COUNT(*) > 1
    ) THEN
    RAISE EXCEPTION 'Cada atlética pode ter somente um registro em prova de revezamento.';
  END IF;

  IF normalized_sport_name = 'natacao'
    AND current_event.kind = 'INDIVIDUAL'::public.championship_individual_event_kind
    AND EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(COALESCE(_entries, '[]'::jsonb)) AS entry_row(
        entry_id UUID,
        team_id UUID,
        athlete_id UUID,
        starter_athlete_ids UUID[],
        lane_number INTEGER,
        status public.championship_individual_entry_status,
        result_time_milliseconds INTEGER,
        attempt_one_centimeters INTEGER,
        attempt_two_centimeters INTEGER,
        attempt_three_centimeters INTEGER
      )
      GROUP BY entry_row.team_id
      HAVING COUNT(*) > 3
    ) THEN
    RAISE EXCEPTION 'Cada atlética pode registrar no máximo 3 atletas por prova individual de Natação.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(_entries, '[]'::jsonb)) AS entry_row(
      entry_id UUID,
      team_id UUID,
      athlete_id UUID,
      starter_athlete_ids UUID[],
      lane_number INTEGER,
      status public.championship_individual_entry_status,
      result_time_milliseconds INTEGER,
      attempt_one_centimeters INTEGER,
      attempt_two_centimeters INTEGER,
      attempt_three_centimeters INTEGER
    )
    WHERE entry_row.status = 'CONFIRMED'::public.championship_individual_entry_status
    GROUP BY CASE
      WHEN is_measurement_event THEN GREATEST(entry_row.attempt_one_centimeters, entry_row.attempt_two_centimeters, entry_row.attempt_three_centimeters)
      ELSE entry_row.result_time_milliseconds
    END
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Empates devem ser resolvidos pela arbitragem antes da confirmação.';
  END IF;

  UPDATE public.championship_individual_event_entries AS entries_table
  SET
    status = 'PENDING'::public.championship_individual_entry_status,
    result_time_milliseconds = NULL,
    result_mark_centimeters = NULL,
    attempt_one_centimeters = NULL,
    attempt_two_centimeters = NULL,
    attempt_three_centimeters = NULL,
    final_position = NULL,
    updated_at = now()
  WHERE entries_table.event_id = _event_id
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(COALESCE(_entries, '[]'::jsonb)) AS entry_row(
        entry_id UUID,
        team_id UUID,
        athlete_id UUID,
        starter_athlete_ids UUID[],
        lane_number INTEGER,
        status public.championship_individual_entry_status,
        result_time_milliseconds INTEGER,
        attempt_one_centimeters INTEGER,
        attempt_two_centimeters INTEGER,
        attempt_three_centimeters INTEGER
      )
      WHERE entry_row.entry_id = entries_table.id
    );

  FOR entry_record IN
    SELECT *
    FROM jsonb_to_recordset(COALESCE(_entries, '[]'::jsonb)) AS entry_row(
      entry_id UUID,
      team_id UUID,
      athlete_id UUID,
      starter_athlete_ids UUID[],
      lane_number INTEGER,
      status public.championship_individual_entry_status,
      result_time_milliseconds INTEGER,
      attempt_one_centimeters INTEGER,
      attempt_two_centimeters INTEGER,
      attempt_three_centimeters INTEGER
    )
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.teams AS teams_table
      WHERE teams_table.id = entry_record.team_id
        AND COALESCE(teams_table.is_active, true) = true
    ) THEN
      RAISE EXCEPTION 'Selecione uma atlética ativa para cada registro.';
    END IF;

    IF current_event.kind = 'INDIVIDUAL'::public.championship_individual_event_kind THEN
      SELECT * INTO athlete_record
      FROM public.championship_award_players AS athletes_table
      WHERE athletes_table.id = entry_record.athlete_id
        AND athletes_table.championship_id = current_event.championship_id
        AND athletes_table.season_year = current_event.season_year
        AND athletes_table.sport_id = current_event.sport_id
        AND athletes_table.team_id = entry_record.team_id
        AND athletes_table.naipe = current_event.naipe
        AND athletes_table.division IS NOT DISTINCT FROM current_event.division;

      IF athlete_record.id IS NULL THEN
        RAISE EXCEPTION 'Atleta inválido para o contexto da prova.';
      END IF;
    ELSE
      FOREACH starter_athlete_id IN ARRAY entry_record.starter_athlete_ids
      LOOP
        IF NOT EXISTS (
          SELECT 1
          FROM public.championship_award_players AS athletes_table
          WHERE athletes_table.id = starter_athlete_id
            AND athletes_table.championship_id = current_event.championship_id
            AND athletes_table.season_year = current_event.season_year
            AND athletes_table.sport_id = current_event.sport_id
            AND athletes_table.team_id = entry_record.team_id
            AND athletes_table.naipe = current_event.naipe
            AND athletes_table.division IS NOT DISTINCT FROM current_event.division
        ) THEN
          RAISE EXCEPTION 'Há atleta inválido entre os titulares do revezamento.';
        END IF;
      END LOOP;
    END IF;

    IF entry_record.entry_id IS NOT NULL THEN
      SELECT entries_table.id INTO saved_entry_id
      FROM public.championship_individual_event_entries AS entries_table
      WHERE entries_table.id = entry_record.entry_id
        AND entries_table.event_id = _event_id;
    ELSE
      saved_entry_id := NULL;
    END IF;

    IF saved_entry_id IS NULL AND current_event.kind = 'INDIVIDUAL'::public.championship_individual_event_kind THEN
      SELECT entries_table.id INTO saved_entry_id
      FROM public.championship_individual_event_entries AS entries_table
      WHERE entries_table.event_id = _event_id
        AND entries_table.athlete_id = entry_record.athlete_id;
    ELSIF saved_entry_id IS NULL THEN
      SELECT entries_table.id INTO saved_entry_id
      FROM public.championship_individual_event_entries AS entries_table
      WHERE entries_table.event_id = _event_id
        AND entries_table.team_id = entry_record.team_id
        AND entries_table.entry_type = 'RELAY'::public.championship_individual_event_kind;
    END IF;

    IF saved_entry_id IS NULL THEN
      INSERT INTO public.championship_individual_event_entries (
        event_id,
        team_id,
        athlete_id,
        athlete_name,
        entry_type,
        lane_number
      ) VALUES (
        _event_id,
        entry_record.team_id,
        CASE WHEN current_event.kind = 'INDIVIDUAL'::public.championship_individual_event_kind THEN entry_record.athlete_id ELSE NULL END,
        CASE WHEN current_event.kind = 'INDIVIDUAL'::public.championship_individual_event_kind THEN athlete_record.name ELSE NULL END,
        current_event.kind,
        entry_record.lane_number
      )
      RETURNING id INTO saved_entry_id;
    END IF;

    UPDATE public.championship_individual_event_entries
    SET
      team_id = entry_record.team_id,
      athlete_id = CASE WHEN current_event.kind = 'INDIVIDUAL'::public.championship_individual_event_kind THEN entry_record.athlete_id ELSE NULL END,
      athlete_name = CASE WHEN current_event.kind = 'INDIVIDUAL'::public.championship_individual_event_kind THEN athlete_record.name ELSE NULL END,
      lane_number = entry_record.lane_number,
      status = entry_record.status,
      result_time_milliseconds = CASE WHEN entry_record.status = 'CONFIRMED'::public.championship_individual_entry_status AND NOT is_measurement_event THEN entry_record.result_time_milliseconds ELSE NULL END,
      attempt_one_centimeters = CASE WHEN entry_record.status = 'CONFIRMED'::public.championship_individual_entry_status AND is_measurement_event THEN entry_record.attempt_one_centimeters ELSE NULL END,
      attempt_two_centimeters = CASE WHEN entry_record.status = 'CONFIRMED'::public.championship_individual_entry_status AND is_measurement_event THEN entry_record.attempt_two_centimeters ELSE NULL END,
      attempt_three_centimeters = CASE WHEN entry_record.status = 'CONFIRMED'::public.championship_individual_entry_status AND is_measurement_event THEN entry_record.attempt_three_centimeters ELSE NULL END,
      result_mark_centimeters = CASE WHEN entry_record.status = 'CONFIRMED'::public.championship_individual_entry_status AND is_measurement_event THEN GREATEST(entry_record.attempt_one_centimeters, entry_record.attempt_two_centimeters, entry_record.attempt_three_centimeters) ELSE NULL END,
      final_position = NULL,
      updated_at = now()
    WHERE id = saved_entry_id;

    IF current_event.kind = 'RELAY'::public.championship_individual_event_kind THEN
      DELETE FROM public.championship_individual_event_entry_members
      WHERE entry_id = saved_entry_id;

      FOREACH starter_athlete_id IN ARRAY entry_record.starter_athlete_ids
      LOOP
        SELECT * INTO athlete_record
        FROM public.championship_award_players
        WHERE id = starter_athlete_id;

        INSERT INTO public.championship_individual_event_entry_members (
          entry_id,
          athlete_id,
          athlete_name,
          is_starter,
          position
        ) VALUES (
          saved_entry_id,
          athlete_record.id,
          athlete_record.name,
          true,
          array_position(entry_record.starter_athlete_ids, starter_athlete_id)
        );
      END LOOP;
    END IF;
  END LOOP;

  IF normalized_sport_name = 'atletismo'
    AND current_event.kind = 'INDIVIDUAL'::public.championship_individual_event_kind THEN
    SELECT COUNT(DISTINCT entries_table.team_id) INTO confirmed_team_count
    FROM public.championship_individual_event_entries AS entries_table
    WHERE entries_table.event_id = _event_id
      AND entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status;

    IF confirmed_team_count < 2 THEN
      RAISE EXCEPTION 'Provas individuais do Atletismo precisam ter ao menos 2 atléticas diferentes confirmadas.';
    END IF;
  END IF;

  PERFORM public.recalculate_championship_individual_athlete_limits(
    current_event.championship_id,
    current_event.season_year,
    current_event.sport_id,
    current_event.naipe,
    current_event.division
  );

  UPDATE public.championship_individual_events AS events_table
  SET
    status = CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.championship_individual_event_entries AS entries_table
        WHERE entries_table.event_id = events_table.id
          AND entries_table.status IN (
            'CONFIRMED'::public.championship_individual_entry_status,
            'WALKOVER'::public.championship_individual_entry_status,
            'DSQ'::public.championship_individual_entry_status,
            'DSQ_OVER_LIMIT'::public.championship_individual_entry_status
          )
      ) THEN 'FINISHED'::public.championship_individual_event_status
      ELSE 'SCHEDULED'::public.championship_individual_event_status
    END,
    updated_at = now()
  WHERE events_table.championship_id = current_event.championship_id
    AND events_table.season_year = current_event.season_year
    AND events_table.sport_id = current_event.sport_id
    AND events_table.naipe = current_event.naipe
    AND events_table.division IS NOT DISTINCT FROM current_event.division;

  PERFORM public.recalculate_championship_individual_standings(
    current_event.championship_id,
    current_event.season_year
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_championship_individual_standings(
  _championship_id UUID,
  _season_year INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  payload_snapshot JSONB;
BEGIN
  payload_snapshot := public.get_championship_setup_payload_snapshot(
    _championship_id,
    _season_year
  );

  UPDATE public.championship_individual_event_entries AS entries_table
  SET
    points_awarded = CASE
      WHEN entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status
        AND entries_table.final_position >= 1
      THEN public.resolve_individual_event_position_points_by_payload(
        payload_snapshot,
        events_table.sport_id,
        entries_table.final_position
      ) * CASE
        WHEN events_table.kind = 'RELAY'::public.championship_individual_event_kind
        THEN COALESCE(events_table.relay_multiplier, 2)
        ELSE 1
      END
      ELSE 0
    END
  FROM public.championship_individual_events AS events_table
  WHERE events_table.id = entries_table.event_id
    AND events_table.championship_id = _championship_id
    AND events_table.season_year = _season_year;

  DELETE FROM public.championship_individual_team_standings
  WHERE championship_id = _championship_id
    AND season_year = _season_year;

  INSERT INTO public.championship_individual_team_standings (
    championship_id,
    season_year,
    sport_id,
    naipe,
    division,
    team_id,
    total_points,
    scored_events_count,
    first_places,
    second_places,
    third_places,
    fourth_places,
    fifth_places,
    sixth_places,
    seventh_places,
    eighth_places,
    ninth_places,
    tenth_places,
    eleventh_places,
    twelfth_places,
    thirteenth_places,
    fourteenth_places,
    fifteenth_places,
    sixteenth_places,
    seventeenth_places,
    eighteenth_places,
    nineteenth_places,
    twentieth_places,
    relay_points_total
  )
  SELECT
    events_table.championship_id,
    events_table.season_year,
    events_table.sport_id,
    events_table.naipe,
    events_table.division,
    entries_table.team_id,
    COALESCE(SUM(entries_table.points_awarded), 0),
    COUNT(*) FILTER (
      WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status
        AND entries_table.final_position IS NOT NULL
    ),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 1),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 2),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 3),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 4),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 5),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 6),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 7),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 8),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 9),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 10),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 11),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 12),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 13),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 14),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 15),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 16),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 17),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 18),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 19),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 20),
    COALESCE(SUM(entries_table.points_awarded) FILTER (
      WHERE events_table.kind = 'RELAY'::public.championship_individual_event_kind
    ), 0)
  FROM public.championship_individual_event_entries AS entries_table
  JOIN public.championship_individual_events AS events_table
    ON events_table.id = entries_table.event_id
  JOIN public.championship_individual_sessions AS sessions_table
    ON sessions_table.championship_id = events_table.championship_id
    AND sessions_table.season_year = events_table.season_year
    AND sessions_table.sport_id = events_table.sport_id
    AND sessions_table.naipe = events_table.naipe
    AND sessions_table.division IS NOT DISTINCT FROM events_table.division
  WHERE events_table.championship_id = _championship_id
    AND events_table.season_year = _season_year
    AND sessions_table.status IN (
      'LIVE'::public.championship_individual_session_status,
      'FINISHED'::public.championship_individual_session_status
    )
    AND entries_table.status != 'CANCELLED'::public.championship_individual_entry_status
  GROUP BY
    events_table.championship_id,
    events_table.season_year,
    events_table.sport_id,
    events_table.naipe,
    events_table.division,
    entries_table.team_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_championship_athlete(UUID, INTEGER, UUID, UUID, public.match_naipe, public.team_division, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_championship_individual_athlete_limits(UUID, INTEGER, UUID, public.match_naipe, public.team_division) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_championship_individual_event_live_results(UUID, JSONB) TO authenticated;
