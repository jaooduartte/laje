DO $migration_apply_schedule_availability_to_bracket_generation$
DECLARE
  function_signature REGPROCEDURE;
  function_definition TEXT;
BEGIN
  function_signature := to_regprocedure('public.generate_championship_bracket_groups(uuid, jsonb)');

  IF function_signature IS NULL THEN
    RAISE EXCEPTION 'Função public.generate_championship_bracket_groups(uuid, jsonb) não encontrada.';
  END IF;

  SELECT pg_get_functiondef(function_signature)
  INTO function_definition;

  function_definition := replace(
    function_definition,
    '  v_day_break_start TIME;
  v_day_break_end TIME;',
    '  v_day_break_start TIME;
  v_day_break_end TIME;
  candidate_schedule_period TEXT;
  current_day_bounded_max_slot_count INTEGER;
  current_day_morning_max_slot_count INTEGER;
  current_schedule_period_enabled BOOLEAN;
  current_competition_period_enabled BOOLEAN;
  current_home_team_period_enabled BOOLEAN;
  current_away_team_period_enabled BOOLEAN;'
  );

  function_definition := replace(
    function_definition,
    '    team_id := (participant_record->>''team_id'')::uuid;

    INSERT INTO public.championship_bracket_team_registrations (',
    '    team_id := (participant_record->>''team_id'')::uuid;

    IF NOT EXISTS (
      SELECT 1
      FROM public.teams AS teams_table
      WHERE teams_table.id = team_id
        AND COALESCE(teams_table.is_active, true) = true
    ) THEN
      RAISE EXCEPTION ''Atlética inválida ou inativa na configuração do campeonato.'';
    END IF;

    INSERT INTO public.championship_bracket_team_registrations ('
  );

  function_definition := replace(
    function_definition,
    '  WHERE d.bracket_edition_id = bracket_edition_id;

  DROP TABLE IF EXISTS temp_assigned_queue_slots;',
    '  WHERE d.bracket_edition_id = bracket_edition_id;

  DROP TABLE IF EXISTS temp_schedule_periods;

  CREATE TEMP TABLE temp_schedule_periods (
    event_date DATE NOT NULL,
    period TEXT NOT NULL,
    enabled BOOLEAN NOT NULL,
    PRIMARY KEY (event_date, period)
  ) ON COMMIT DROP;

  INSERT INTO temp_schedule_periods (event_date, period, enabled)
  SELECT
    d.event_date,
    periods.period,
    COALESCE(
      (
        SELECT (schedule_period_record.value->>''enabled'')::boolean
        FROM jsonb_array_elements(COALESCE(_payload->''schedule_periods'', ''[]''::jsonb)) AS schedule_period_record(value)
        WHERE (schedule_period_record.value->>''date'')::date = d.event_date
          AND schedule_period_record.value->>''period'' = periods.period
        LIMIT 1
      ),
      true
    ) AS enabled
  FROM championship_bracket_days AS d
  CROSS JOIN (VALUES (''MATUTINO''), (''VESPERTINO'')) AS periods(period)
  WHERE d.bracket_edition_id = bracket_edition_id;

  DROP TABLE IF EXISTS temp_competition_keys;

  CREATE TEMP TABLE temp_competition_keys (
    competition_id UUID PRIMARY KEY,
    competition_key TEXT NOT NULL,
    sport_id UUID NOT NULL,
    naipe public.match_naipe NOT NULL,
    division public.team_division NULL
  ) ON COMMIT DROP;

  INSERT INTO temp_competition_keys (
    competition_id,
    competition_key,
    sport_id,
    naipe,
    division
  )
  SELECT
    competitions_table.id,
    competitions_table.sport_id::text
      || ''::''
      || competitions_table.naipe::text
      || ''::''
      || COALESCE(competitions_table.division::text, ''WITHOUT_DIVISION'') AS competition_key,
    competitions_table.sport_id,
    competitions_table.naipe,
    competitions_table.division
  FROM public.championship_bracket_competitions AS competitions_table
  WHERE competitions_table.bracket_edition_id = bracket_edition_id;

  DROP TABLE IF EXISTS temp_competition_period_availability;

  CREATE TEMP TABLE temp_competition_period_availability (
    competition_key TEXT NOT NULL,
    event_date DATE NOT NULL,
    period TEXT NOT NULL,
    enabled BOOLEAN NOT NULL,
    PRIMARY KEY (competition_key, event_date, period)
  ) ON COMMIT DROP;

  INSERT INTO temp_competition_period_availability (
    competition_key,
    event_date,
    period,
    enabled
  )
  SELECT
    competition_keys_table.competition_key,
    schedule_periods_table.event_date,
    schedule_periods_table.period,
    COALESCE(
      (
        SELECT (availability_record.value->>''enabled'')::boolean
        FROM jsonb_array_elements(COALESCE(_payload->''competition_period_availability'', ''[]''::jsonb)) AS availability_record(value)
        WHERE availability_record.value->>''competition_key'' = competition_keys_table.competition_key
          AND (availability_record.value->>''date'')::date = schedule_periods_table.event_date
          AND availability_record.value->>''period'' = schedule_periods_table.period
        LIMIT 1
      ),
      true
    ) AS enabled
  FROM temp_competition_keys AS competition_keys_table
  CROSS JOIN temp_schedule_periods AS schedule_periods_table;

  DROP TABLE IF EXISTS temp_team_competition_availability;

  CREATE TEMP TABLE temp_team_competition_availability (
    team_id UUID NOT NULL,
    competition_key TEXT NOT NULL,
    event_date DATE NOT NULL,
    period TEXT NOT NULL,
    enabled BOOLEAN NOT NULL,
    PRIMARY KEY (team_id, competition_key, event_date, period)
  ) ON COMMIT DROP;

  INSERT INTO temp_team_competition_availability (
    team_id,
    competition_key,
    event_date,
    period,
    enabled
  )
  SELECT
    team_modalities_table.team_id,
    competition_keys_table.competition_key,
    schedule_periods_table.event_date,
    schedule_periods_table.period,
    COALESCE(
      (
        SELECT (availability_record.value->>''enabled'')::boolean
        FROM jsonb_array_elements(COALESCE(_payload->''team_competition_availability'', ''[]''::jsonb)) AS availability_record(value)
        WHERE (availability_record.value->>''team_id'')::uuid = team_modalities_table.team_id
          AND availability_record.value->>''competition_key'' = competition_keys_table.competition_key
          AND (availability_record.value->>''date'')::date = schedule_periods_table.event_date
          AND availability_record.value->>''period'' = schedule_periods_table.period
        LIMIT 1
      ),
      true
    ) AS enabled
  FROM public.championship_bracket_team_modalities AS team_modalities_table
  JOIN temp_competition_keys AS competition_keys_table
    ON competition_keys_table.sport_id = team_modalities_table.sport_id
    AND competition_keys_table.naipe = team_modalities_table.naipe
    AND competition_keys_table.division IS NOT DISTINCT FROM team_modalities_table.division
  CROSS JOIN temp_schedule_periods AS schedule_periods_table
  WHERE team_modalities_table.bracket_edition_id = bracket_edition_id;

  DROP TABLE IF EXISTS temp_day_period_slot_limits;

  CREATE TEMP TABLE temp_day_period_slot_limits (
    event_date DATE PRIMARY KEY,
    bounded_max_slot_count INTEGER NOT NULL,
    morning_max_slot_count INTEGER NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO temp_day_period_slot_limits (
    event_date,
    bounded_max_slot_count,
    morning_max_slot_count
  )
  SELECT
    d.event_date,
    bounded_slots.max_slot_count,
    CASE
      WHEN COALESCE(morning_period.enabled, true) = false
        AND COALESCE(afternoon_period.enabled, true) = true THEN 0
      WHEN COALESCE(morning_period.enabled, true) = true
        AND COALESCE(afternoon_period.enabled, true) = false THEN bounded_slots.max_slot_count
      WHEN COALESCE(morning_period.enabled, true) = false
        AND COALESCE(afternoon_period.enabled, true) = false THEN 0
      ELSE LEAST(
        bounded_slots.max_slot_count,
        GREATEST(
          0,
          FLOOR(
            CASE
              WHEN d.break_start_time IS NOT NULL
                AND d.break_end_time IS NOT NULL
                AND d.break_start_time > d.start_time
              THEN EXTRACT(EPOCH FROM d.break_start_time) / 60.0 - EXTRACT(EPOCH FROM d.start_time) / 60.0
              ELSE bounded_slots.available_minutes / 2.0
            END
            / bounded_slots.min_duration_minutes
          )::INTEGER
        )
      )
    END AS morning_max_slot_count
  FROM championship_bracket_days AS d
  JOIN LATERAL (
    SELECT
      GREATEST(
        1,
        COALESCE(
          (
            SELECT MIN(public.resolve_championship_sport_duration_minutes(_championship_id, cs.sport_id))
            FROM championship_bracket_locations AS l
            JOIN championship_bracket_courts AS c
              ON c.bracket_location_id = l.id
            JOIN championship_bracket_court_sports AS cs
              ON cs.bracket_court_id = c.id
            WHERE l.bracket_day_id = d.id
          ),
          35
        )
      )::numeric AS min_duration_minutes,
      GREATEST(
        0,
        (
          EXTRACT(EPOCH FROM d.end_time) / 60.0
          - EXTRACT(EPOCH FROM d.start_time) / 60.0
          - COALESCE(
              (
                SELECT SUM(
                  EXTRACT(EPOCH FROM b.break_end_time) / 60.0
                  - EXTRACT(EPOCH FROM b.break_start_time) / 60.0
                )
                FROM public.championship_bracket_day_breaks AS b
                WHERE b.bracket_day_id = d.id
              ),
              COALESCE(
                EXTRACT(EPOCH FROM d.break_end_time) / 60.0
                - EXTRACT(EPOCH FROM d.break_start_time) / 60.0,
                0.0
              )
            )
        )
      ) AS available_minutes,
      GREATEST(
        1,
        FLOOR(
          GREATEST(
            0,
            (
              EXTRACT(EPOCH FROM d.end_time) / 60.0
              - EXTRACT(EPOCH FROM d.start_time) / 60.0
              - COALESCE(
                  (
                    SELECT SUM(
                      EXTRACT(EPOCH FROM b.break_end_time) / 60.0
                      - EXTRACT(EPOCH FROM b.break_start_time) / 60.0
                    )
                    FROM public.championship_bracket_day_breaks AS b
                    WHERE b.bracket_day_id = d.id
                  ),
                  COALESCE(
                    EXTRACT(EPOCH FROM d.break_end_time) / 60.0
                    - EXTRACT(EPOCH FROM d.break_start_time) / 60.0,
                    0.0
                  )
                )
            )
          )
          / GREATEST(
              1,
              COALESCE(
                (
                  SELECT MIN(public.resolve_championship_sport_duration_minutes(_championship_id, cs.sport_id))
                  FROM championship_bracket_locations AS l
                  JOIN championship_bracket_courts AS c
                    ON c.bracket_location_id = l.id
                  JOIN championship_bracket_court_sports AS cs
                    ON cs.bracket_court_id = c.id
                  WHERE l.bracket_day_id = d.id
                ),
                35
              )
            )
        )
      )::INTEGER AS max_slot_count
  ) AS bounded_slots ON TRUE
  LEFT JOIN temp_schedule_periods AS morning_period
    ON morning_period.event_date = d.event_date
    AND morning_period.period = ''MATUTINO''
  LEFT JOIN temp_schedule_periods AS afternoon_period
    ON afternoon_period.event_date = d.event_date
    AND afternoon_period.period = ''VESPERTINO''
  WHERE d.bracket_edition_id = bracket_edition_id;

  DROP TABLE IF EXISTS temp_assigned_queue_slots;'
  );

  function_definition := replace(
    function_definition,
    '    competition_id UUID NOT NULL,
    sport_id UUID NOT NULL,',
    '    competition_id UUID NOT NULL,
    competition_key TEXT NOT NULL,
    sport_id UUID NOT NULL,'
  );

  function_definition := replace(
    function_definition,
    '    competition_id,
    sport_id,',
    '    competition_id,
    competition_key,
    sport_id,'
  );

  function_definition := replace(
    function_definition,
    '    pending_matches_table.competition_id,
    pending_matches_table.sport_id,',
    '    pending_matches_table.competition_id,
    pending_matches_table.sport_id::text
      || ''::''
      || pending_matches_table.naipe::text
      || ''::''
      || COALESCE(pending_matches_table.division::text, ''WITHOUT_DIVISION'') AS competition_key,
    pending_matches_table.sport_id,'
  );

  function_definition := replace(
    function_definition,
    '    SELECT max_slot_count
    INTO max_slots_for_day
    FROM temp_day_max_slot_counts
    WHERE event_date = selected_queue_date;

    IF max_slots_for_day IS NULL OR max_slots_for_day < 1 THEN
      max_slots_for_day := 2147483647;
    END IF;',
    '    SELECT max_slot_count
    INTO max_slots_for_day
    FROM temp_day_max_slot_counts
    WHERE event_date = selected_queue_date;

    SELECT
      bounded_max_slot_count,
      morning_max_slot_count
    INTO
      current_day_bounded_max_slot_count,
      current_day_morning_max_slot_count
    FROM temp_day_period_slot_limits
    WHERE event_date = selected_queue_date;

    IF max_slots_for_day IS NULL OR max_slots_for_day < 1 THEN
      max_slots_for_day := COALESCE(current_day_bounded_max_slot_count, 1);
    END IF;

    IF current_day_bounded_max_slot_count IS NULL OR current_day_bounded_max_slot_count < 1 THEN
      current_day_bounded_max_slot_count := max_slots_for_day;
    END IF;

    IF current_day_morning_max_slot_count IS NULL OR current_day_morning_max_slot_count < 0 THEN
      current_day_morning_max_slot_count := GREATEST(
        0,
        FLOOR(current_day_bounded_max_slot_count / 2.0)::INTEGER
      );
    END IF;'
  );

  function_definition := replace(
    function_definition,
    '      IF candidate_queue_position > max_slots_for_day THEN',
    '      IF candidate_queue_position > current_day_bounded_max_slot_count THEN'
  );

  function_definition := replace(
    function_definition,
    '        pending_home_team_identity := pending_group_match_record.home_team_identity;
        pending_away_team_identity := pending_group_match_record.away_team_identity;
        pending_sport_identity := pending_group_match_record.sport_identity;

        SELECT COALESCE(sport_courts_table.court_count, 1)',
    '        pending_home_team_identity := pending_group_match_record.home_team_identity;
        pending_away_team_identity := pending_group_match_record.away_team_identity;
        pending_sport_identity := pending_group_match_record.sport_identity;
        candidate_schedule_period := CASE
          WHEN candidate_queue_position <= current_day_morning_max_slot_count THEN ''MATUTINO''
          ELSE ''VESPERTINO''
        END;

        SELECT schedule_periods_table.enabled
        INTO current_schedule_period_enabled
        FROM temp_schedule_periods AS schedule_periods_table
        WHERE schedule_periods_table.event_date = selected_queue_date
          AND schedule_periods_table.period = candidate_schedule_period;

        IF COALESCE(current_schedule_period_enabled, false) = false THEN
          CONTINUE;
        END IF;

        SELECT competition_availability_table.enabled
        INTO current_competition_period_enabled
        FROM temp_competition_period_availability AS competition_availability_table
        WHERE competition_availability_table.competition_key = pending_group_match_record.competition_key
          AND competition_availability_table.event_date = selected_queue_date
          AND competition_availability_table.period = candidate_schedule_period;

        IF COALESCE(current_competition_period_enabled, true) = false THEN
          CONTINUE;
        END IF;

        SELECT team_availability_table.enabled
        INTO current_home_team_period_enabled
        FROM temp_team_competition_availability AS team_availability_table
        WHERE team_availability_table.team_id = pending_group_match_record.home_team_id
          AND team_availability_table.competition_key = pending_group_match_record.competition_key
          AND team_availability_table.event_date = selected_queue_date
          AND team_availability_table.period = candidate_schedule_period;

        IF COALESCE(current_home_team_period_enabled, true) = false THEN
          CONTINUE;
        END IF;

        SELECT team_availability_table.enabled
        INTO current_away_team_period_enabled
        FROM temp_team_competition_availability AS team_availability_table
        WHERE team_availability_table.team_id = pending_group_match_record.away_team_id
          AND team_availability_table.competition_key = pending_group_match_record.competition_key
          AND team_availability_table.event_date = selected_queue_date
          AND team_availability_table.period = candidate_schedule_period;

        IF COALESCE(current_away_team_period_enabled, true) = false THEN
          CONTINUE;
        END IF;

        SELECT COALESCE(sport_courts_table.court_count, 1)'
  );

  IF position('candidate_schedule_period TEXT;' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível injetar as variáveis de disponibilidade no gerador.';
  END IF;

  IF position('temp_schedule_periods' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível injetar a leitura de períodos da agenda no gerador.';
  END IF;

  IF position('temp_competition_period_availability' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível injetar a disponibilidade por competição no gerador.';
  END IF;

  IF position('temp_team_competition_availability' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível injetar a disponibilidade por atlética no gerador.';
  END IF;

  EXECUTE function_definition;
END;
$migration_apply_schedule_availability_to_bracket_generation$;

NOTIFY pgrst, 'reload schema';
