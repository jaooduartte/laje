DO $migration_reorder_group_schedule_and_reserve_knockout_capacity$
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

  function_definition := regexp_replace(
    function_definition,
    $pattern$FOR\s+competition_id,\s*sport_id,\s*naipe_value,\s*division_value\s+IN[\s\S]*?\n  UPDATE public\.championship_bracket_editions$pattern$,
    $replacement$CREATE TEMP TABLE IF NOT EXISTS temp_pending_group_matches (
    competition_id UUID NOT NULL,
    group_id UUID NOT NULL,
    group_number INTEGER NOT NULL,
    naipe public.match_naipe NOT NULL,
    naipe_priority INTEGER NOT NULL,
    group_match_slot INTEGER NOT NULL,
    competition_slot_number INTEGER NOT NULL,
    home_team_id UUID NOT NULL,
    away_team_id UUID NOT NULL
  ) ON COMMIT DROP;

  FOR pending_group_match_record IN
    WITH sport_day_capacity AS (
      SELECT
        court_sports_table.sport_id,
        days_table.id AS day_id,
        count(DISTINCT courts_table.id)::numeric AS court_count,
        GREATEST(
          (EXTRACT(EPOCH FROM (days_table.end_time - days_table.start_time)) / 60.0)
          - COALESCE(EXTRACT(EPOCH FROM (days_table.break_end_time - days_table.break_start_time)) / 60.0, 0),
          0
        )::numeric AS available_minutes_per_court
      FROM public.championship_bracket_days AS days_table
      JOIN public.championship_bracket_locations AS locations_table
        ON locations_table.bracket_day_id = days_table.id
      JOIN public.championship_bracket_courts AS courts_table
        ON courts_table.bracket_location_id = locations_table.id
      JOIN public.championship_bracket_court_sports AS court_sports_table
        ON court_sports_table.bracket_court_id = courts_table.id
      WHERE days_table.bracket_edition_id = bracket_edition_id
      GROUP BY
        court_sports_table.sport_id,
        days_table.id,
        days_table.start_time,
        days_table.end_time,
        days_table.break_start_time,
        days_table.break_end_time
    ),
    sport_capacity AS (
      SELECT
        sport_day_capacity.sport_id,
        count(DISTINCT sport_day_capacity.day_id)::int AS total_days,
        COALESCE(sum(sport_day_capacity.court_count * sport_day_capacity.available_minutes_per_court), 0)::numeric AS available_court_minutes
      FROM sport_day_capacity
      GROUP BY sport_day_capacity.sport_id
    ),
    group_sizes AS (
      SELECT
        groups_table.competition_id,
        competitions_table.sport_id,
        count(group_teams_table.team_id)::int AS team_count
      FROM public.championship_bracket_groups AS groups_table
      JOIN public.championship_bracket_competitions AS competitions_table
        ON competitions_table.id = groups_table.competition_id
      JOIN public.championship_bracket_group_teams AS group_teams_table
        ON group_teams_table.group_id = groups_table.id
      WHERE competitions_table.bracket_edition_id = bracket_edition_id
      GROUP BY
        groups_table.id,
        groups_table.competition_id,
        competitions_table.sport_id
    ),
    sport_group_demand AS (
      SELECT
        group_sizes.sport_id,
        COALESCE(sum(((group_sizes.team_count * (group_sizes.team_count - 1)) / 2)::numeric), 0)::numeric AS required_group_matches
      FROM group_sizes
      GROUP BY group_sizes.sport_id
    ),
    competition_knockout_demand AS (
      SELECT
        competitions_table.sport_id,
        CASE
          WHEN qualified_team_count < 2 THEN 0::numeric
          ELSE (
            (bracket_size - 1)
            + CASE
                WHEN competitions_table.third_place_mode = 'MATCH'::public.bracket_third_place_mode AND bracket_size >= 4 THEN 1
                ELSE 0
              END
          )::numeric
        END AS estimated_knockout_matches
      FROM (
        SELECT
          competitions_table.id,
          competitions_table.sport_id,
          competitions_table.third_place_mode,
          GREATEST(competitions_table.groups_count * competitions_table.qualifiers_per_group, 0) AS qualified_team_count,
          CASE
            WHEN competitions_table.groups_count * competitions_table.qualifiers_per_group < 2 THEN 0
            ELSE power(
              2,
              ceil(log(2, (competitions_table.groups_count * competitions_table.qualifiers_per_group)::numeric))
            )::int
          END AS bracket_size
        FROM public.championship_bracket_competitions AS competitions_table
        WHERE competitions_table.bracket_edition_id = bracket_edition_id
      ) AS competitions_table
    ),
    sport_knockout_demand AS (
      SELECT
        competition_knockout_demand.sport_id,
        COALESCE(sum(competition_knockout_demand.estimated_knockout_matches), 0)::numeric AS estimated_knockout_matches
      FROM competition_knockout_demand
      GROUP BY competition_knockout_demand.sport_id
    ),
    sport_duration AS (
      SELECT
        competitions_table.sport_id,
        public.resolve_championship_sport_duration_minutes(_championship_id, competitions_table.sport_id)::numeric AS duration_minutes
      FROM public.championship_bracket_competitions AS competitions_table
      WHERE competitions_table.bracket_edition_id = bracket_edition_id
      GROUP BY competitions_table.sport_id
    ),
    sport_schedule_metrics AS (
      SELECT
        sport_duration.sport_id,
        COALESCE(
          (
            SELECT sports_table.name
            FROM public.sports AS sports_table
            WHERE sports_table.id = sport_duration.sport_id
            LIMIT 1
          ),
          sport_duration.sport_id::text
        ) AS sport_name,
        COALESCE(sport_capacity.total_days, 0) AS total_days,
        COALESCE(sport_capacity.available_court_minutes, 0)::numeric AS available_court_minutes,
        (COALESCE(sport_group_demand.required_group_matches, 0)::numeric * sport_duration.duration_minutes) AS required_group_minutes,
        (COALESCE(sport_knockout_demand.estimated_knockout_matches, 0)::numeric * sport_duration.duration_minutes) AS estimated_knockout_minutes,
        (
          (COALESCE(sport_group_demand.required_group_matches, 0)::numeric * sport_duration.duration_minutes)
          + (COALESCE(sport_knockout_demand.estimated_knockout_matches, 0)::numeric * sport_duration.duration_minutes)
        ) AS required_total_minutes
      FROM sport_duration
      LEFT JOIN sport_capacity
        ON sport_capacity.sport_id = sport_duration.sport_id
      LEFT JOIN sport_group_demand
        ON sport_group_demand.sport_id = sport_duration.sport_id
      LEFT JOIN sport_knockout_demand
        ON sport_knockout_demand.sport_id = sport_duration.sport_id
    ),
    formatted_metrics AS (
      SELECT
        sport_schedule_metrics.*,
        GREATEST(sport_schedule_metrics.required_total_minutes - sport_schedule_metrics.available_court_minutes, 0)::numeric AS missing_total_minutes,
        CASE
          WHEN sport_schedule_metrics.total_days > 0
            THEN ceil(
              GREATEST(sport_schedule_metrics.required_total_minutes - sport_schedule_metrics.available_court_minutes, 0)
              / sport_schedule_metrics.total_days
            )
          ELSE ceil(GREATEST(sport_schedule_metrics.required_total_minutes - sport_schedule_metrics.available_court_minutes, 0))
        END::numeric AS missing_minutes_per_day,
        (floor(sport_schedule_metrics.available_court_minutes / 60)::int)::text
          || 'h'
          || lpad((floor(mod(sport_schedule_metrics.available_court_minutes, 60))::int)::text, 2, '0')
          || 'm' AS available_court_minutes_label,
        (floor(sport_schedule_metrics.required_group_minutes / 60)::int)::text
          || 'h'
          || lpad((floor(mod(sport_schedule_metrics.required_group_minutes, 60))::int)::text, 2, '0')
          || 'm' AS required_group_minutes_label,
        (floor(sport_schedule_metrics.required_total_minutes / 60)::int)::text
          || 'h'
          || lpad((floor(mod(sport_schedule_metrics.required_total_minutes, 60))::int)::text, 2, '0')
          || 'm' AS required_total_minutes_label,
        (floor(sport_schedule_metrics.estimated_knockout_minutes / 60)::int)::text
          || 'h'
          || lpad((floor(mod(sport_schedule_metrics.estimated_knockout_minutes, 60))::int)::text, 2, '0')
          || 'm' AS estimated_knockout_minutes_label,
        (floor(
          CASE
            WHEN sport_schedule_metrics.total_days > 0
              THEN ceil(
                GREATEST(sport_schedule_metrics.required_total_minutes - sport_schedule_metrics.available_court_minutes, 0)
                / sport_schedule_metrics.total_days
              )
            ELSE ceil(GREATEST(sport_schedule_metrics.required_total_minutes - sport_schedule_metrics.available_court_minutes, 0))
          END / 60
        )::int)::text
          || 'h'
          || lpad((
            floor(
              mod(
                CASE
                  WHEN sport_schedule_metrics.total_days > 0
                    THEN ceil(
                      GREATEST(sport_schedule_metrics.required_total_minutes - sport_schedule_metrics.available_court_minutes, 0)
                      / sport_schedule_metrics.total_days
                    )
                  ELSE ceil(GREATEST(sport_schedule_metrics.required_total_minutes - sport_schedule_metrics.available_court_minutes, 0))
                END,
                60
              )
            )::int
          )::text, 2, '0')
          || 'm' AS missing_minutes_per_day_label
      FROM sport_schedule_metrics
    )
    SELECT format(
      'Não há horários disponíveis para concluir o chaveamento sem conflitos. Modalidade: %s. Tempo total necessário para este esporte, somando fase de grupos e reserva estimada para o mata-mata: %s. Tempo disponível na agenda deste esporte: %s. Tempo necessário para a fase de grupos: %s. Reserva estimada para o mata-mata: %s. Adicione cerca de %s por dia em %s dia(s).',
      formatted_metrics.sport_name,
      formatted_metrics.required_total_minutes_label,
      formatted_metrics.available_court_minutes_label,
      formatted_metrics.required_group_minutes_label,
      formatted_metrics.estimated_knockout_minutes_label,
      formatted_metrics.missing_minutes_per_day_label,
      GREATEST(formatted_metrics.total_days, 1)
    ) AS error_message
    FROM formatted_metrics
    WHERE formatted_metrics.missing_total_minutes > 0
    ORDER BY formatted_metrics.missing_total_minutes DESC, formatted_metrics.sport_name ASC
    LIMIT 1
  LOOP
    RAISE EXCEPTION USING MESSAGE = pending_group_match_record.error_message;
  END LOOP;

  FOR sport_id, division_value IN
    SELECT
      competitions_table.sport_id,
      competitions_table.division
    FROM public.championship_bracket_competitions AS competitions_table
    WHERE competitions_table.bracket_edition_id = bracket_edition_id
    GROUP BY competitions_table.sport_id, competitions_table.division
    ORDER BY min(competitions_table.created_at) ASC, competitions_table.sport_id ASC, competitions_table.division ASC NULLS FIRST
  LOOP
    duration_minutes := public.resolve_championship_sport_duration_minutes(_championship_id, sport_id);

    TRUNCATE temp_pending_group_matches;

    FOR competition_id, naipe_value IN
      SELECT
        competitions_table.id,
        competitions_table.naipe
      FROM public.championship_bracket_competitions AS competitions_table
      WHERE competitions_table.bracket_edition_id = bracket_edition_id
        AND competitions_table.sport_id = sport_id
        AND competitions_table.division IS NOT DISTINCT FROM division_value
      ORDER BY
        CASE competitions_table.naipe
          WHEN 'MASCULINO'::public.match_naipe THEN 1
          WHEN 'FEMININO'::public.match_naipe THEN 2
          WHEN 'MISTO'::public.match_naipe THEN 3
          ELSE 4
        END ASC,
        competitions_table.created_at ASC,
        competitions_table.id ASC
    LOOP
      competition_match_slot := 1;

      FOR group_id, group_number_value IN
        SELECT
          groups_table.id,
          groups_table.group_number
        FROM public.championship_bracket_groups AS groups_table
        WHERE groups_table.competition_id = competition_id
        ORDER BY groups_table.group_number ASC
      LOOP
        SELECT array_agg(group_teams_table.team_id ORDER BY group_teams_table.position ASC)
        INTO group_team_ids
        FROM public.championship_bracket_group_teams AS group_teams_table
        WHERE group_teams_table.group_id = group_id;

        group_team_count := COALESCE(cardinality(group_team_ids), 0);

        IF group_team_count < 2 THEN
          RAISE EXCEPTION 'Grupo inválido: é necessário no mínimo duas atléticas por grupo.';
        END IF;

        group_match_slot := 1;

        FOR existing_matches_count IN 1..group_team_count - 1
        LOOP
          FOR qualifiers_per_group_value IN existing_matches_count + 1..group_team_count
          LOOP
            INSERT INTO temp_pending_group_matches (
              competition_id,
              group_id,
              group_number,
              naipe,
              naipe_priority,
              group_match_slot,
              competition_slot_number,
              home_team_id,
              away_team_id
            ) VALUES (
              competition_id,
              group_id,
              group_number_value,
              naipe_value,
              CASE naipe_value
                WHEN 'MASCULINO'::public.match_naipe THEN 1
                WHEN 'FEMININO'::public.match_naipe THEN 2
                WHEN 'MISTO'::public.match_naipe THEN 3
                ELSE 4
              END,
              group_match_slot,
              competition_match_slot,
              group_team_ids[existing_matches_count],
              group_team_ids[qualifiers_per_group_value]
            );

            group_match_slot := group_match_slot + 1;
            competition_match_slot := competition_match_slot + 1;
          END LOOP;
        END LOOP;
      END LOOP;
    END LOOP;

    FOR pending_group_match_record IN
      SELECT
        pending_group_matches_table.competition_id,
        pending_group_matches_table.group_id,
        pending_group_matches_table.group_number,
        pending_group_matches_table.naipe,
        pending_group_matches_table.competition_slot_number,
        pending_group_matches_table.home_team_id,
        pending_group_matches_table.away_team_id
      FROM temp_pending_group_matches AS pending_group_matches_table
      ORDER BY
        pending_group_matches_table.group_match_slot ASC,
        pending_group_matches_table.group_number ASC,
        pending_group_matches_table.naipe_priority ASC,
        pending_group_matches_table.competition_slot_number ASC
    LOOP
      competition_id := pending_group_match_record.competition_id;
      group_id := pending_group_match_record.group_id;
      naipe_value := pending_group_match_record.naipe;
      competition_match_slot := pending_group_match_record.competition_slot_number;
      group_team_ids := ARRAY[
        pending_group_match_record.home_team_id,
        pending_group_match_record.away_team_id
      ];
      existing_matches_count := 1;
      qualifiers_per_group_value := 2;

      SELECT
        slots_table.slot_start,
        slots_table.slot_start + make_interval(mins => duration_minutes),
        slots_table.location_name,
        slots_table.court_name
      INTO
        selected_slot_start,
        selected_slot_end,
        selected_slot_location_name,
        selected_slot_court_name
      FROM temp_bracket_slots AS slots_table
      WHERE slots_table.sport_id = sport_id
        AND slots_table.slot_start + make_interval(mins => duration_minutes) <= slots_table.day_end
        AND (
          slots_table.break_start IS NULL
          OR slots_table.break_end IS NULL
          OR slots_table.slot_start >= slots_table.break_end
          OR slots_table.slot_start + make_interval(mins => duration_minutes) <= slots_table.break_start
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.matches AS matches_table
          WHERE matches_table.location = slots_table.location_name
            AND COALESCE(matches_table.court_name, '') = COALESCE(slots_table.court_name, '')
            AND matches_table.start_time < slots_table.slot_start + make_interval(mins => duration_minutes)
            AND matches_table.end_time > slots_table.slot_start
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.matches AS matches_table
          WHERE matches_table.championship_id = _championship_id
            AND matches_table.season_year = championship_current_season_year
            AND (
              matches_table.home_team_id IN (group_team_ids[existing_matches_count], group_team_ids[qualifiers_per_group_value])
              OR matches_table.away_team_id IN (group_team_ids[existing_matches_count], group_team_ids[qualifiers_per_group_value])
            )
            AND matches_table.start_time < slots_table.slot_start + make_interval(mins => duration_minutes)
            AND matches_table.end_time > slots_table.slot_start
        )
      ORDER BY
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM public.matches AS previous_team_match_table
            WHERE previous_team_match_table.championship_id = _championship_id
              AND previous_team_match_table.season_year = championship_current_season_year
              AND previous_team_match_table.sport_id = sport_id
              AND previous_team_match_table.naipe = naipe_value
              AND (
                previous_team_match_table.home_team_id IN (group_team_ids[existing_matches_count], group_team_ids[qualifiers_per_group_value])
                OR previous_team_match_table.away_team_id IN (group_team_ids[existing_matches_count], group_team_ids[qualifiers_per_group_value])
              )
              AND previous_team_match_table.end_time <= slots_table.slot_start
              AND NOT EXISTS (
                SELECT 1
                FROM public.matches AS intermediary_match_table
                WHERE intermediary_match_table.championship_id = _championship_id
                  AND intermediary_match_table.season_year = championship_current_season_year
                  AND intermediary_match_table.sport_id = sport_id
                  AND intermediary_match_table.naipe = naipe_value
                  AND intermediary_match_table.end_time <= slots_table.slot_start
                  AND intermediary_match_table.end_time > previous_team_match_table.end_time
              )
          ) THEN 1
          ELSE 0
        END ASC,
        slots_table.slot_start ASC,
        slots_table.location_name ASC,
        slots_table.court_name ASC
      LIMIT 1;

      IF selected_slot_start IS NULL THEN
        RAISE EXCEPTION 'Não há horários disponíveis para concluir o chaveamento sem conflitos.';
      END IF;

      INSERT INTO public.matches (
        championship_id,
        division,
        naipe,
        sport_id,
        home_team_id,
        away_team_id,
        location,
        court_name,
        start_time,
        end_time,
        season_year,
        status
      ) VALUES (
        _championship_id,
        division_value,
        naipe_value,
        sport_id,
        group_team_ids[existing_matches_count],
        group_team_ids[qualifiers_per_group_value],
        selected_slot_location_name,
        selected_slot_court_name,
        selected_slot_start,
        selected_slot_end,
        championship_current_season_year,
        'SCHEDULED'::public.match_status
      )
      RETURNING id INTO new_match_id;

      INSERT INTO public.championship_bracket_matches (
        bracket_edition_id,
        competition_id,
        group_id,
        phase,
        round_number,
        slot_number,
        match_id,
        home_team_id,
        away_team_id
      ) VALUES (
        bracket_edition_id,
        competition_id,
        group_id,
        'GROUP_STAGE'::public.bracket_phase,
        1,
        competition_match_slot,
        new_match_id,
        group_team_ids[existing_matches_count],
        group_team_ids[qualifiers_per_group_value]
      );
    END LOOP;
  END LOOP;

  UPDATE public.championship_bracket_editions$replacement$,
    'g'
  );

  IF position('competition_slot_number INTEGER NOT NULL' IN function_definition) = 0
    OR position('Reserva estimada para o mata-mata' IN function_definition) = 0
    OR position('Tempo total necessário para este esporte' IN function_definition) = 0
    OR position('pending_group_matches_table.naipe_priority ASC' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível aplicar a nova ordenação de grupos/naipes e a reserva estimada de mata-mata na função public.generate_championship_bracket_groups(uuid, jsonb).';
  END IF;

  EXECUTE function_definition;

  SELECT pg_get_functiondef(function_signature)
  INTO function_definition;

  IF position('competition_slot_number INTEGER NOT NULL' IN function_definition) = 0
    OR position('Reserva estimada para o mata-mata' IN function_definition) = 0
    OR position('Tempo total necessário para este esporte' IN function_definition) = 0
    OR position('pending_group_matches_table.naipe_priority ASC' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'A função public.generate_championship_bracket_groups(uuid, jsonb) não foi recompilada com a ordenação de agenda esperada.';
  END IF;
END;
$migration_reorder_group_schedule_and_reserve_knockout_capacity$;
