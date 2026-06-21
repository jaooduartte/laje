-- Mantém jogos LIVE/FINISHED como ocupação real da quadra durante a
-- redistribuição do chaveamento.
--
-- Problema observado:
-- - ao fechar um jogo de grupo e gerar/redistribuir o bracket, a função
--   public.redistribute_bracket_scheduled_matches considerava apenas os jogos
--   SCHEDULED pendentes;
-- - com isso, as quadras do dia eram tratadas como vazias desde o horário
--   inicial configurado, e vários jogos voltavam para 20/06 às 08:00;
-- - como a nova sequência passava a começar no primeiro slot visual do dia,
--   a representação também voltava para CO em jogos que deveriam herdar o
--   último confronto da quadra.
--
-- Correção:
-- - levantar os jogos do mesmo bracket que já estão LIVE/FINISHED e possuem
--   local/quadra definidos;
-- - avançar next_available_at de cada quadra até o fim do último jogo já
--   ocupado naquele dia/esporte;
-- - carregar também o último naipe/divisão da quadra para a heurística de
--   distribuição continuar a partir do contexto real.

DO $$
DECLARE
  function_signature REGPROCEDURE := to_regprocedure('public.redistribute_bracket_scheduled_matches(uuid)');
  function_definition TEXT;
  updated_definition TEXT;
  source_block TEXT := $source$
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
$source$;
  target_block TEXT := $target$
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

  DROP TABLE IF EXISTS tmp_global_locked_matches;
  CREATE TEMP TABLE tmp_global_locked_matches (
    match_id UUID PRIMARY KEY,
    event_date DATE NOT NULL,
    sport_id UUID NOT NULL,
    naipe public.match_naipe NOT NULL,
    division public.team_division NULL,
    location_name TEXT NOT NULL,
    court_name TEXT NOT NULL,
    start_time TIMESTAMPTZ NULL,
    end_time TIMESTAMPTZ NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_global_locked_matches (
    match_id,
    event_date,
    sport_id,
    naipe,
    division,
    location_name,
    court_name,
    start_time,
    end_time
  )
  SELECT
    matches_table.id,
    matches_table.scheduled_date,
    matches_table.sport_id,
    matches_table.naipe,
    matches_table.division,
    matches_table.location,
    matches_table.court_name,
    matches_table.start_time,
    matches_table.end_time
  FROM public.matches AS matches_table
  JOIN public.championship_bracket_matches AS bracket_matches_table
    ON bracket_matches_table.match_id = matches_table.id
  WHERE bracket_matches_table.bracket_edition_id = _bracket_edition_id
    AND matches_table.status <> 'SCHEDULED'::public.match_status
    AND matches_table.scheduled_date IS NOT NULL
    AND NULLIF(trim(COALESCE(matches_table.location, '')), '') IS NOT NULL
    AND NULLIF(trim(COALESCE(matches_table.court_name, '')), '') IS NOT NULL;

  WITH locked_match_availability AS (
    SELECT
      day_courts_table.bracket_day_id,
      day_courts_table.sport_id,
      day_courts_table.court_id,
      MAX(
        COALESCE(
          locked_matches_table.end_time,
          CASE
            WHEN locked_matches_table.start_time IS NOT NULL THEN
              locked_matches_table.start_time + make_interval(mins => day_courts_table.duration_minutes)
            ELSE NULL
          END,
          day_courts_table.next_available_at
        )
      ) AS next_available_at
    FROM tmp_global_day_courts AS day_courts_table
    JOIN tmp_global_locked_matches AS locked_matches_table
      ON locked_matches_table.event_date = day_courts_table.event_date
      AND locked_matches_table.sport_id = day_courts_table.sport_id
      AND public.normalize_bracket_entity_name(locked_matches_table.location_name) = public.normalize_bracket_entity_name(day_courts_table.location_name)
      AND public.normalize_bracket_entity_name(locked_matches_table.court_name) = public.normalize_bracket_entity_name(day_courts_table.court_name)
    GROUP BY
      day_courts_table.bracket_day_id,
      day_courts_table.sport_id,
      day_courts_table.court_id
  ),
  locked_match_last_context AS (
    SELECT DISTINCT ON (
      day_courts_table.bracket_day_id,
      day_courts_table.sport_id,
      day_courts_table.court_id
    )
      day_courts_table.bracket_day_id,
      day_courts_table.sport_id,
      day_courts_table.court_id,
      locked_matches_table.naipe,
      locked_matches_table.division
    FROM tmp_global_day_courts AS day_courts_table
    JOIN tmp_global_locked_matches AS locked_matches_table
      ON locked_matches_table.event_date = day_courts_table.event_date
      AND locked_matches_table.sport_id = day_courts_table.sport_id
      AND public.normalize_bracket_entity_name(locked_matches_table.location_name) = public.normalize_bracket_entity_name(day_courts_table.location_name)
      AND public.normalize_bracket_entity_name(locked_matches_table.court_name) = public.normalize_bracket_entity_name(day_courts_table.court_name)
    ORDER BY
      day_courts_table.bracket_day_id,
      day_courts_table.sport_id,
      day_courts_table.court_id,
      COALESCE(
        locked_matches_table.end_time,
        CASE
          WHEN locked_matches_table.start_time IS NOT NULL THEN
            locked_matches_table.start_time + make_interval(mins => day_courts_table.duration_minutes)
          ELSE NULL
        END,
        day_courts_table.next_available_at
      ) DESC,
      COALESCE(locked_matches_table.start_time, locked_matches_table.end_time, day_courts_table.next_available_at) DESC,
      locked_matches_table.match_id DESC
  )
  UPDATE tmp_global_day_courts AS day_courts_table
  SET
    next_available_at = GREATEST(day_courts_table.next_available_at, locked_match_availability.next_available_at),
    last_naipe = locked_match_last_context.naipe,
    last_division = locked_match_last_context.division
  FROM locked_match_availability
  LEFT JOIN locked_match_last_context
    ON locked_match_last_context.bracket_day_id = locked_match_availability.bracket_day_id
    AND locked_match_last_context.sport_id = locked_match_availability.sport_id
    AND locked_match_last_context.court_id = locked_match_availability.court_id
  WHERE day_courts_table.bracket_day_id = locked_match_availability.bracket_day_id
    AND day_courts_table.sport_id = locked_match_availability.sport_id
    AND day_courts_table.court_id = locked_match_availability.court_id;
$target$;
BEGIN
  IF function_signature IS NULL THEN
    RAISE EXCEPTION 'Função public.redistribute_bracket_scheduled_matches(uuid) não encontrada.';
  END IF;

  SELECT pg_get_functiondef(function_signature)
  INTO function_definition;

  updated_definition := replace(function_definition, source_block, target_block);

  IF updated_definition = function_definition THEN
    RAISE EXCEPTION 'Não foi possível injetar o travamento dos jogos ocupados na redistribuição do chaveamento.';
  END IF;

  EXECUTE updated_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
