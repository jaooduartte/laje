DO $migration_days$
BEGIN
  IF to_regclass('public.championship_bracket_days') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS columns_table
    WHERE columns_table.table_schema = 'public'
      AND columns_table.table_name = 'championship_bracket_days'
      AND columns_table.column_name = 'break_start_time'
  ) THEN
    ALTER TABLE public.championship_bracket_days
      ADD COLUMN break_start_time TIME NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS columns_table
    WHERE columns_table.table_schema = 'public'
      AND columns_table.table_name = 'championship_bracket_days'
      AND columns_table.column_name = 'break_end_time'
  ) THEN
    ALTER TABLE public.championship_bracket_days
      ADD COLUMN break_end_time TIME NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraints_table
    WHERE constraints_table.conname = 'championship_bracket_days_break_window_valid'
      AND constraints_table.conrelid = 'public.championship_bracket_days'::regclass
  ) THEN
    ALTER TABLE public.championship_bracket_days
      ADD CONSTRAINT championship_bracket_days_break_window_valid
      CHECK (
        (break_start_time IS NULL AND break_end_time IS NULL)
        OR (
          break_start_time IS NOT NULL
          AND break_end_time IS NOT NULL
          AND break_end_time > break_start_time
          AND break_start_time >= start_time
          AND break_end_time <= end_time
        )
      );
  END IF;
END;
$migration_days$;

COMMENT ON COLUMN public.championship_bracket_days.break_start_time IS 'Horário opcional de início do intervalo de pausa do dia.';
COMMENT ON COLUMN public.championship_bracket_days.break_end_time IS 'Horário opcional de fim do intervalo de pausa do dia.';

DO $migration_groups_function$
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
    $pattern$IF\s+selected_slot_start\s+IS\s+NULL\s+THEN[\s\S]*?END\s+IF;$pattern$,
    $replacement$IF selected_slot_start IS NULL THEN
            RAISE EXCEPTION USING MESSAGE = (
              WITH day_capacity AS (
                SELECT
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
                  AND court_sports_table.sport_id = sport_id
                GROUP BY
                  days_table.id,
                  days_table.start_time,
                  days_table.end_time,
                  days_table.break_start_time,
                  days_table.break_end_time
              ),
              match_demand AS (
                SELECT
                  COALESCE(sum((group_sizes.team_count * (group_sizes.team_count - 1)) / 2), 0)::numeric AS required_matches
                FROM (
                  SELECT count(*)::integer AS team_count
                  FROM public.championship_bracket_group_teams AS group_teams_table
                  JOIN public.championship_bracket_groups AS groups_table
                    ON groups_table.id = group_teams_table.group_id
                  WHERE groups_table.competition_id = competition_id
                  GROUP BY group_teams_table.group_id
                ) AS group_sizes
              ),
              sport_match_demand AS (
                SELECT
                  COALESCE(sum((group_sizes.team_count * (group_sizes.team_count - 1)) / 2), 0)::numeric AS required_matches
                FROM (
                  SELECT count(*)::integer AS team_count
                  FROM public.championship_bracket_group_teams AS group_teams_table
                  JOIN public.championship_bracket_groups AS groups_table
                    ON groups_table.id = group_teams_table.group_id
                  JOIN public.championship_bracket_competitions AS competitions_table
                    ON competitions_table.id = groups_table.competition_id
                  WHERE competitions_table.bracket_edition_id = bracket_edition_id
                    AND competitions_table.sport_id = sport_id
                  GROUP BY group_teams_table.group_id
                ) AS group_sizes
              ),
              competition_context AS (
                SELECT
                  COALESCE(
                    (
                      SELECT sports_table.name
                      FROM public.sports AS sports_table
                      WHERE sports_table.id = sport_id
                    ),
                    sport_id::text
                  ) AS sport_name,
                  initcap(lower(naipe_value::text)) AS naipe_name
              ),
              pending_match_context AS (
                SELECT
                  group_team_ids[existing_matches_count] AS home_team_id,
                  group_team_ids[qualifiers_per_group_value] AS away_team_id,
                  COALESCE(
                    (
                      SELECT teams_table.name
                      FROM public.teams AS teams_table
                      WHERE teams_table.id = group_team_ids[existing_matches_count]
                    ),
                    group_team_ids[existing_matches_count]::text
                  ) AS home_team_name,
                  COALESCE(
                    (
                      SELECT teams_table.name
                      FROM public.teams AS teams_table
                      WHERE teams_table.id = group_team_ids[qualifiers_per_group_value]
                    ),
                    group_team_ids[qualifiers_per_group_value]::text
                  ) AS away_team_name
              ),
              championship_day_window AS (
                SELECT
                  count(*)::numeric AS total_days,
                  COALESCE(sum(
                    GREATEST(
                      (EXTRACT(EPOCH FROM (days_table.end_time - days_table.start_time)) / 60.0)
                      - COALESCE(EXTRACT(EPOCH FROM (days_table.break_end_time - days_table.break_start_time)) / 60.0, 0),
                      0
                    )
                  ), 0)::numeric AS configured_team_window_minutes
                FROM public.championship_bracket_days AS days_table
                WHERE days_table.bracket_edition_id = bracket_edition_id
              ),
              group_sizes_by_group AS (
                SELECT
                  group_teams_table.group_id,
                  count(*)::numeric AS team_count
                FROM public.championship_bracket_group_teams AS group_teams_table
                GROUP BY group_teams_table.group_id
              ),
              team_load AS (
                SELECT
                  group_teams_table.team_id,
                  sum(group_sizes_by_group.team_count - 1)::numeric AS total_matches,
                  sum(
                    (group_sizes_by_group.team_count - 1)
                    * public.resolve_championship_sport_duration_minutes(
                      _championship_id,
                      competitions_table.sport_id
                    )::numeric
                  ) AS play_minutes
                FROM public.championship_bracket_group_teams AS group_teams_table
                JOIN public.championship_bracket_groups AS groups_table
                  ON groups_table.id = group_teams_table.group_id
                JOIN public.championship_bracket_competitions AS competitions_table
                  ON competitions_table.id = groups_table.competition_id
                JOIN group_sizes_by_group
                  ON group_sizes_by_group.group_id = group_teams_table.group_id
                WHERE competitions_table.bracket_edition_id = bracket_edition_id
                GROUP BY group_teams_table.team_id
              ),
              worst_team_window AS (
                SELECT
                  COALESCE(teams_table.name, team_load.team_id::text) AS team_name,
                  team_load.total_matches,
                  team_load.play_minutes,
                  team_load.play_minutes::numeric AS required_window_minutes
                FROM team_load
                LEFT JOIN public.teams AS teams_table
                  ON teams_table.id = team_load.team_id
                ORDER BY required_window_minutes DESC, team_load.total_matches DESC
                LIMIT 1
              ),
              fit_extension_estimate AS (
                SELECT
                  pending_match_context.home_team_name,
                  pending_match_context.away_team_name,
                  COALESCE(fit_candidate.required_extension_minutes, 0)::numeric AS required_extension_minutes
                FROM pending_match_context
                LEFT JOIN LATERAL (
                  SELECT
                    ceil(
                      GREATEST(
                        EXTRACT(
                          EPOCH FROM (
                            (
                              slot_candidate.slot_start
                              + make_interval(mins => duration_minutes)
                            )
                            - slot_candidate.day_end
                          )
                        ) / 60.0,
                        0
                      )
                    )::numeric AS required_extension_minutes
                  FROM (
                    SELECT
                      slot_start.value AS slot_start,
                      ((days_table.event_date::text || ' ' || days_table.end_time::text)::timestamp AT TIME ZONE 'America/Sao_Paulo') AS day_end,
                      CASE
                        WHEN days_table.break_start_time IS NULL THEN NULL
                        ELSE ((days_table.event_date::text || ' ' || days_table.break_start_time::text)::timestamp AT TIME ZONE 'America/Sao_Paulo')
                      END AS break_start,
                      CASE
                        WHEN days_table.break_end_time IS NULL THEN NULL
                        ELSE ((days_table.event_date::text || ' ' || days_table.break_end_time::text)::timestamp AT TIME ZONE 'America/Sao_Paulo')
                      END AS break_end,
                      locations_table.name AS location_name,
                      courts_table.name AS court_name
                    FROM public.championship_bracket_days AS days_table
                    JOIN public.championship_bracket_locations AS locations_table
                      ON locations_table.bracket_day_id = days_table.id
                    JOIN public.championship_bracket_courts AS courts_table
                      ON courts_table.bracket_location_id = locations_table.id
                    JOIN public.championship_bracket_court_sports AS court_sports_table
                      ON court_sports_table.bracket_court_id = courts_table.id
                    CROSS JOIN LATERAL generate_series(
                      ((days_table.event_date::text || ' ' || days_table.start_time::text)::timestamp AT TIME ZONE 'America/Sao_Paulo'),
                      ((days_table.event_date::text || ' ' || days_table.end_time::text)::timestamp AT TIME ZONE 'America/Sao_Paulo') + interval '12 hours',
                      interval '5 minutes'
                    ) AS slot_start(value)
                    WHERE days_table.bracket_edition_id = bracket_edition_id
                      AND court_sports_table.sport_id = sport_id
                  ) AS slot_candidate
                  WHERE slot_candidate.slot_start + make_interval(mins => duration_minutes) <= slot_candidate.day_end + interval '12 hours'
                    AND (
                      slot_candidate.break_start IS NULL
                      OR slot_candidate.break_end IS NULL
                      OR slot_candidate.slot_start >= slot_candidate.break_end
                      OR slot_candidate.slot_start + make_interval(mins => duration_minutes) <= slot_candidate.break_start
                    )
                    AND NOT EXISTS (
                      SELECT 1
                      FROM public.matches AS matches_table
                      WHERE matches_table.location = slot_candidate.location_name
                        AND COALESCE(matches_table.court_name, '') = COALESCE(slot_candidate.court_name, '')
                        AND matches_table.start_time < slot_candidate.slot_start + make_interval(mins => duration_minutes)
                        AND matches_table.end_time > slot_candidate.slot_start
                    )
                    AND NOT EXISTS (
                      SELECT 1
                      FROM public.matches AS matches_table
                      WHERE matches_table.championship_id = _championship_id
                        AND (
                          matches_table.home_team_id IN (pending_match_context.home_team_id, pending_match_context.away_team_id)
                          OR matches_table.away_team_id IN (pending_match_context.home_team_id, pending_match_context.away_team_id)
                        )
                        AND matches_table.start_time < slot_candidate.slot_start + make_interval(mins => duration_minutes)
                        AND matches_table.end_time > slot_candidate.slot_start
                    )
                  ORDER BY required_extension_minutes ASC, slot_candidate.slot_start ASC
                  LIMIT 1
                ) AS fit_candidate
                  ON true
              ),
              metrics AS (
                SELECT
                  (match_demand.required_matches * duration_minutes::numeric) AS required_court_minutes,
                  (sport_match_demand.required_matches * duration_minutes::numeric) AS sport_required_court_minutes,
                  COALESCE(sum(day_capacity.available_minutes_per_court * day_capacity.court_count), 0)::numeric AS available_court_minutes,
                  competition_context.sport_name,
                  competition_context.naipe_name,
                  championship_day_window.total_days,
                  championship_day_window.configured_team_window_minutes,
                  COALESCE(worst_team_window.team_name, 'Atlética não identificada') AS team_name,
                  COALESCE(fit_extension_estimate.home_team_name, 'Atlética não identificada') AS pending_home_team_name,
                  COALESCE(fit_extension_estimate.away_team_name, 'Atlética não identificada') AS pending_away_team_name,
                  COALESCE(fit_extension_estimate.required_extension_minutes, 0)::numeric AS fit_extension_minutes,
                  COALESCE(worst_team_window.total_matches, 0)::numeric AS worst_team_matches,
                  COALESCE(worst_team_window.play_minutes, 0)::numeric AS worst_team_play_minutes,
                  COALESCE(worst_team_window.required_window_minutes, 0)::numeric AS worst_team_required_window_minutes
                FROM match_demand
                CROSS JOIN sport_match_demand
                LEFT JOIN day_capacity
                  ON true
                CROSS JOIN competition_context
                CROSS JOIN championship_day_window
                LEFT JOIN worst_team_window
                  ON true
                LEFT JOIN fit_extension_estimate
                  ON true
                GROUP BY
                  match_demand.required_matches,
                  sport_match_demand.required_matches,
                  competition_context.sport_name,
                  competition_context.naipe_name,
                  championship_day_window.total_days,
                  championship_day_window.configured_team_window_minutes,
                  fit_extension_estimate.home_team_name,
                  fit_extension_estimate.away_team_name,
                  fit_extension_estimate.required_extension_minutes,
                  worst_team_window.team_name,
                  worst_team_window.total_matches,
                  worst_team_window.play_minutes,
                  worst_team_window.required_window_minutes
              ),
              final_metrics AS (
                SELECT
                  required_court_minutes,
                  sport_required_court_minutes,
                  available_court_minutes,
                  GREATEST(required_court_minutes - available_court_minutes, 0)::numeric AS missing_court_minutes,
                  GREATEST(sport_required_court_minutes - available_court_minutes, 0)::numeric AS missing_sport_court_minutes,
                  sport_name,
                  naipe_name,
                  total_days,
                  configured_team_window_minutes,
                  team_name,
                  pending_home_team_name,
                  pending_away_team_name,
                  fit_extension_minutes,
                  worst_team_matches,
                  worst_team_play_minutes,
                  worst_team_required_window_minutes,
                  GREATEST(worst_team_required_window_minutes - configured_team_window_minutes, 0)::numeric AS missing_team_window_minutes,
                  CASE
                    WHEN total_days > 0
                      THEN ceil(GREATEST(required_court_minutes - available_court_minutes, 0) / total_days)
                    ELSE 0
                  END::numeric AS missing_court_minutes_per_day,
                  CASE
                    WHEN total_days > 0
                      THEN ceil(GREATEST(sport_required_court_minutes - available_court_minutes, 0) / total_days)
                    ELSE 0
                  END::numeric AS missing_sport_court_minutes_per_day,
                  CASE
                    WHEN total_days > 0
                      THEN ceil(GREATEST(worst_team_required_window_minutes - configured_team_window_minutes, 0) / total_days)
                    ELSE 0
                  END::numeric AS missing_team_minutes_per_day
                FROM metrics
              ),
              formatted_metrics AS (
                SELECT
                  final_metrics.*,
                  final_metrics.sport_name || ' - ' || final_metrics.naipe_name AS modality_label,
                  (floor(final_metrics.required_court_minutes / 60)::int)::text
                    || 'h'
                    || lpad((floor(mod(final_metrics.required_court_minutes, 60))::int)::text, 2, '0')
                    || 'm' AS required_court_minutes_label,
                  (floor(final_metrics.sport_required_court_minutes / 60)::int)::text
                    || 'h'
                    || lpad((floor(mod(final_metrics.sport_required_court_minutes, 60))::int)::text, 2, '0')
                    || 'm' AS sport_required_court_minutes_label,
                  (floor(final_metrics.available_court_minutes / 60)::int)::text
                    || 'h'
                    || lpad((floor(mod(final_metrics.available_court_minutes, 60))::int)::text, 2, '0')
                    || 'm' AS available_court_minutes_label,
                  (floor(final_metrics.configured_team_window_minutes / 60)::int)::text
                    || 'h'
                    || lpad((floor(mod(final_metrics.configured_team_window_minutes, 60))::int)::text, 2, '0')
                    || 'm' AS configured_team_window_label,
                  (floor(final_metrics.worst_team_play_minutes / 60)::int)::text
                    || 'h'
                    || lpad((floor(mod(final_metrics.worst_team_play_minutes, 60))::int)::text, 2, '0')
                    || 'm' AS worst_team_play_minutes_label,
                  (floor(final_metrics.worst_team_required_window_minutes / 60)::int)::text
                    || 'h'
                    || lpad((floor(mod(final_metrics.worst_team_required_window_minutes, 60))::int)::text, 2, '0')
                    || 'm' AS worst_team_required_window_label,
                  (floor(final_metrics.missing_team_window_minutes / 60)::int)::text
                    || 'h'
                    || lpad((floor(mod(final_metrics.missing_team_window_minutes, 60))::int)::text, 2, '0')
                    || 'm' AS missing_team_window_label,
                  (floor(final_metrics.missing_court_minutes_per_day / 60)::int)::text
                    || 'h'
                    || lpad((floor(mod(final_metrics.missing_court_minutes_per_day, 60))::int)::text, 2, '0')
                    || 'm' AS missing_court_minutes_per_day_label,
                  (floor(final_metrics.missing_sport_court_minutes_per_day / 60)::int)::text
                    || 'h'
                    || lpad((floor(mod(final_metrics.missing_sport_court_minutes_per_day, 60))::int)::text, 2, '0')
                    || 'm' AS missing_sport_court_minutes_per_day_label,
                  (floor(final_metrics.missing_team_minutes_per_day / 60)::int)::text
                    || 'h'
                    || lpad((floor(mod(final_metrics.missing_team_minutes_per_day, 60))::int)::text, 2, '0')
                    || 'm' AS missing_team_minutes_per_day_label,
                  (floor(final_metrics.fit_extension_minutes / 60)::int)::text
                    || 'h'
                    || lpad((floor(mod(final_metrics.fit_extension_minutes, 60))::int)::text, 2, '0')
                    || 'm' AS fit_extension_minutes_label
                FROM final_metrics
              )
              SELECT
                CASE
                  WHEN formatted_metrics.missing_sport_court_minutes > 0 THEN format(
                    'Não há horários disponíveis para concluir o chaveamento sem conflitos. Modalidade: %s. Tempo total necessário para este esporte, somando todos os naipes: %s. Tempo disponível na agenda deste esporte: %s. Adicione cerca de %s por dia em %s dia(s).',
                    formatted_metrics.modality_label,
                    formatted_metrics.sport_required_court_minutes_label,
                    formatted_metrics.available_court_minutes_label,
                    formatted_metrics.missing_sport_court_minutes_per_day_label,
                    GREATEST(formatted_metrics.total_days::int, 1),
                    formatted_metrics.missing_sport_court_minutes_per_day_label
                  )
                  WHEN formatted_metrics.missing_team_window_minutes > 0 THEN format(
                    'Não há horários disponíveis para concluir o chaveamento sem conflitos. Conflito de encaixe na modalidade %s para a atlética %s. Adicione cerca de %s por dia em %s dia(s) para abrir folga de agenda.',
                    formatted_metrics.modality_label,
                    formatted_metrics.team_name,
                    formatted_metrics.missing_team_minutes_per_day_label,
                    GREATEST(formatted_metrics.total_days::int, 1),
                    formatted_metrics.missing_team_minutes_per_day_label
                  )
                  WHEN formatted_metrics.fit_extension_minutes > 0 THEN format(
                    'Não há horários disponíveis para concluir o chaveamento sem conflitos. Conflito de encaixe na modalidade %s. O jogo pendente entre %s e %s precisa de cerca de %s de folga adicional ao fim de um dos dias da agenda.',
                    formatted_metrics.modality_label,
                    formatted_metrics.pending_home_team_name,
                    formatted_metrics.pending_away_team_name,
                    formatted_metrics.fit_extension_minutes_label
                  )
                  ELSE format(
                    'Não há horários disponíveis para concluir o chaveamento sem conflitos. Conflito de encaixe na modalidade %s. O jogo pendente entre %s e %s não encontrou janela válida com a configuração atual.',
                    formatted_metrics.modality_label,
                    formatted_metrics.pending_home_team_name,
                    formatted_metrics.pending_away_team_name
                  )
                END
              FROM formatted_metrics
            );
          END IF;$replacement$,
    'g'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$ORDER BY competitions_table\.created_at ASC$pattern$,
    $replacement$ORDER BY md5(bracket_edition_id::text || competitions_table.id::text)$replacement$,
    'g'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$ORDER BY groups_table\.group_number ASC$pattern$,
    $replacement$ORDER BY md5(bracket_edition_id::text || competition_id::text || groups_table.id::text)$replacement$,
    'g'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$array_agg\(group_teams_table\.team_id ORDER BY group_teams_table\.position ASC\)$pattern$,
    $replacement$array_agg(
        group_teams_table.team_id
        ORDER BY md5(bracket_edition_id::text || group_id::text || group_teams_table.team_id::text)
      )$replacement$,
    'g'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$INSERT INTO public\.championship_bracket_days\s*\(\s*bracket_edition_id,\s*event_date,\s*start_time,\s*end_time\s*\)\s*VALUES\s*\(\s*bracket_edition_id,\s*\(schedule_day_record->>'date'\)::date,\s*\(schedule_day_record->>'start_time'\)::time,\s*\(schedule_day_record->>'end_time'\)::time\s*\)\s*ON CONFLICT[\s\S]*?RETURNING id INTO bracket_day_id;$pattern$,
    $replacement$INSERT INTO public.championship_bracket_days (
      bracket_edition_id,
      event_date,
      start_time,
      end_time,
      break_start_time,
      break_end_time
    ) VALUES (
      bracket_edition_id,
      (schedule_day_record->>'date')::date,
      (schedule_day_record->>'start_time')::time,
      (schedule_day_record->>'end_time')::time,
      CASE
        WHEN trim(COALESCE(schedule_day_record->>'break_start_time', '')) = '' THEN NULL
        ELSE (schedule_day_record->>'break_start_time')::time
      END,
      CASE
        WHEN trim(COALESCE(schedule_day_record->>'break_end_time', '')) = '' THEN NULL
        ELSE (schedule_day_record->>'break_end_time')::time
      END
    )
    ON CONFLICT ON CONSTRAINT championship_bracket_days_upsert_unique
    DO UPDATE SET
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      break_start_time = EXCLUDED.break_start_time,
      break_end_time = EXCLUDED.break_end_time
    RETURNING id INTO bracket_day_id;$replacement$,
    'g'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$CREATE TEMP TABLE temp_bracket_slots \(\s*slot_start TIMESTAMPTZ NOT NULL,\s*day_end TIMESTAMPTZ NOT NULL,\s*location_name TEXT NOT NULL,\s*court_name TEXT NOT NULL,\s*sport_id UUID NOT NULL\s*\) ON COMMIT DROP;$pattern$,
    $replacement$CREATE TEMP TABLE temp_bracket_slots (
    slot_start TIMESTAMPTZ NOT NULL,
    day_end TIMESTAMPTZ NOT NULL,
    break_start TIMESTAMPTZ NULL,
    break_end TIMESTAMPTZ NULL,
    location_name TEXT NOT NULL,
    court_name TEXT NOT NULL,
    sport_id UUID NOT NULL
  ) ON COMMIT DROP;$replacement$,
    'g'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$INSERT INTO temp_bracket_slots \(\s*slot_start,\s*day_end,\s*location_name,\s*court_name,\s*sport_id\s*\)\s*SELECT\s*slot_start\.value,\s*\(\(days_table\.event_date::text \|\| ' ' \|\| days_table\.end_time::text\)::timestamp AT TIME ZONE 'America/Sao_Paulo'\) AS day_end,\s*locations_table\.name,\s*courts_table\.name,\s*court_sports_table\.sport_id\s*FROM public\.championship_bracket_days AS days_table[\s\S]*?WHERE days_table\.bracket_edition_id = bracket_edition_id;$pattern$,
    $replacement$INSERT INTO temp_bracket_slots (
    slot_start,
    day_end,
    break_start,
    break_end,
    location_name,
    court_name,
    sport_id
  )
  SELECT
    slot_start.value,
    ((days_table.event_date::text || ' ' || days_table.end_time::text)::timestamp AT TIME ZONE 'America/Sao_Paulo') AS day_end,
    CASE
      WHEN days_table.break_start_time IS NULL THEN NULL
      ELSE ((days_table.event_date::text || ' ' || days_table.break_start_time::text)::timestamp AT TIME ZONE 'America/Sao_Paulo')
    END AS break_start,
    CASE
      WHEN days_table.break_end_time IS NULL THEN NULL
      ELSE ((days_table.event_date::text || ' ' || days_table.break_end_time::text)::timestamp AT TIME ZONE 'America/Sao_Paulo')
    END AS break_end,
    locations_table.name,
    courts_table.name,
    court_sports_table.sport_id
  FROM public.championship_bracket_days AS days_table
  JOIN public.championship_bracket_locations AS locations_table
    ON locations_table.bracket_day_id = days_table.id
  JOIN public.championship_bracket_courts AS courts_table
    ON courts_table.bracket_location_id = locations_table.id
  JOIN public.championship_bracket_court_sports AS court_sports_table
    ON court_sports_table.bracket_court_id = courts_table.id
  CROSS JOIN LATERAL generate_series(
    ((days_table.event_date::text || ' ' || days_table.start_time::text)::timestamp AT TIME ZONE 'America/Sao_Paulo'),
    ((days_table.event_date::text || ' ' || days_table.end_time::text)::timestamp AT TIME ZONE 'America/Sao_Paulo'),
    interval '5 minutes'
  ) AS slot_start(value)
  WHERE days_table.bracket_edition_id = bracket_edition_id;$replacement$,
    'g'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$AND matches_table\.start_time < slots_table\.slot_start \+ make_interval\(mins => duration_minutes \+ 15\)\s+AND matches_table\.end_time > slots_table\.slot_start - interval '15 minutes'$pattern$,
    $replacement$AND matches_table.start_time < slots_table.slot_start + make_interval(mins => duration_minutes)
                AND matches_table.end_time > slots_table.slot_start$replacement$,
    'g'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$AND slots_table\.slot_start \+ make_interval\(mins => duration_minutes\) <= slots_table\.day_end$pattern$,
    $replacement$AND slots_table.slot_start + make_interval(mins => duration_minutes) <= slots_table.day_end
            AND (
              slots_table.break_start IS NULL
              OR slots_table.break_end IS NULL
              OR slots_table.slot_start >= slots_table.break_end
              OR slots_table.slot_start + make_interval(mins => duration_minutes) <= slots_table.break_start
            )$replacement$,
    'g'
  );

  IF position('break_start_time' IN function_definition) = 0
    OR position('break_end_time' IN function_definition) = 0
    OR position('temp_bracket_slots' IN function_definition) = 0
    OR position('slots_table.break_start' IN function_definition) = 0
    OR position('Tempo total necessário para este esporte' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível aplicar todas as atualizações de pausa e mensagem na função de grupos.';
  END IF;

  EXECUTE function_definition;
END;
$migration_groups_function$;

NOTIFY pgrst, 'reload schema';
