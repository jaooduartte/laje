DO $migration$
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
    $pattern$RAISE\s+EXCEPTION\s+'Não há horários disponíveis para concluir o chaveamento sem conflitos\.';$pattern$,
    $replacement$RAISE EXCEPTION USING MESSAGE = format(
              'Não há horários disponíveis para concluir o chaveamento sem conflitos. Modalidade: %s • %s. Jogos necessários: %s. Jogos já alocados: %s. Duração por jogo: %s min. Horas mínimas estimadas: %s h. Capacidade teórica para a modalidade: %s h (%s quadras em %s dias). Observação: a capacidade real pode ser menor por causa do intervalo de 15 min entre jogos da mesma atlética.',
              COALESCE((
                SELECT sports_table.name
                FROM public.sports AS sports_table
                WHERE sports_table.id = sport_id
                LIMIT 1
              ), sport_id::text),
              naipe_value::text,
              COALESCE((
                SELECT sum((group_sizes.team_count * (group_sizes.team_count - 1)) / 2)
                FROM (
                  SELECT count(*)::integer AS team_count
                  FROM public.championship_bracket_group_teams AS group_teams_table
                  JOIN public.championship_bracket_groups AS groups_table
                    ON groups_table.id = group_teams_table.group_id
                  WHERE groups_table.competition_id = competition_id
                  GROUP BY group_teams_table.group_id
                ) AS group_sizes
              ), 0),
              GREATEST(competition_match_slot - 1, 0),
              duration_minutes,
              round((
                COALESCE((
                  SELECT sum((group_sizes.team_count * (group_sizes.team_count - 1)) / 2)
                  FROM (
                    SELECT count(*)::integer AS team_count
                    FROM public.championship_bracket_group_teams AS group_teams_table
                    JOIN public.championship_bracket_groups AS groups_table
                      ON groups_table.id = group_teams_table.group_id
                    WHERE groups_table.competition_id = competition_id
                    GROUP BY group_teams_table.group_id
                  ) AS group_sizes
                ), 0)::numeric * duration_minutes::numeric
              ) / 60.0, 2),
              round(COALESCE((
                SELECT sum(EXTRACT(EPOCH FROM (days_table.end_time - days_table.start_time)) / 3600.0)
                FROM public.championship_bracket_days AS days_table
                JOIN public.championship_bracket_locations AS locations_table
                  ON locations_table.bracket_day_id = days_table.id
                JOIN public.championship_bracket_courts AS courts_table
                  ON courts_table.bracket_location_id = locations_table.id
                JOIN public.championship_bracket_court_sports AS court_sports_table
                  ON court_sports_table.bracket_court_id = courts_table.id
                WHERE days_table.bracket_edition_id = bracket_edition_id
                  AND court_sports_table.sport_id = sport_id
              ), 0)::numeric, 2),
              COALESCE((
                SELECT count(DISTINCT courts_table.id)
                FROM public.championship_bracket_days AS days_table
                JOIN public.championship_bracket_locations AS locations_table
                  ON locations_table.bracket_day_id = days_table.id
                JOIN public.championship_bracket_courts AS courts_table
                  ON courts_table.bracket_location_id = locations_table.id
                JOIN public.championship_bracket_court_sports AS court_sports_table
                  ON court_sports_table.bracket_court_id = courts_table.id
                WHERE days_table.bracket_edition_id = bracket_edition_id
                  AND court_sports_table.sport_id = sport_id
              ), 0),
              COALESCE((
                SELECT count(DISTINCT days_table.id)
                FROM public.championship_bracket_days AS days_table
                JOIN public.championship_bracket_locations AS locations_table
                  ON locations_table.bracket_day_id = days_table.id
                JOIN public.championship_bracket_courts AS courts_table
                  ON courts_table.bracket_location_id = locations_table.id
                JOIN public.championship_bracket_court_sports AS court_sports_table
                  ON court_sports_table.bracket_court_id = courts_table.id
                WHERE days_table.bracket_edition_id = bracket_edition_id
                  AND court_sports_table.sport_id = sport_id
              ), 0)
            );$replacement$,
    'g'
  );

  IF position('Jogos necessários:' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível atualizar a mensagem detalhada de conflito de horários.';
  END IF;

  EXECUTE function_definition;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
