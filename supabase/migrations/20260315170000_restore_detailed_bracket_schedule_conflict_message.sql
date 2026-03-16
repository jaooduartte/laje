DO $migration_restore_detailed_bracket_schedule_conflict_message$
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

  IF position('Adicione cerca de' IN function_definition) > 0 THEN
    RETURN;
  END IF;

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
                GREATEST(formatted_metrics.total_days::int, 1)
              )
              WHEN formatted_metrics.missing_team_window_minutes > 0 THEN format(
                'Não há horários disponíveis para concluir o chaveamento sem conflitos. Conflito de encaixe na modalidade %s para a atlética %s. Adicione cerca de %s por dia em %s dia(s) para abrir folga de agenda.',
                formatted_metrics.modality_label,
                formatted_metrics.team_name,
                formatted_metrics.missing_team_minutes_per_day_label,
                GREATEST(formatted_metrics.total_days::int, 1)
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

  EXECUTE function_definition;

  SELECT pg_get_functiondef(function_signature)
  INTO function_definition;

  IF position('Adicione cerca de' IN function_definition) = 0
    OR position('Tempo total necessário para este esporte' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível restaurar a mensagem detalhada de falta de horários na função public.generate_championship_bracket_groups(uuid, jsonb).';
  END IF;
END;
$migration_restore_detailed_bracket_schedule_conflict_message$;
