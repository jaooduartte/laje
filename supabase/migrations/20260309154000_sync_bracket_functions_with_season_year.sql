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
  round_duration_minutes INTEGER;
  selected_slot_start TIMESTAMPTZ;
  selected_slot_end TIMESTAMPTZ;
  selected_slot_location_name TEXT;
  selected_slot_court_name TEXT;
  new_match_id UUID;
BEGIN
  SELECT
    bracket_matches_table.id,
    bracket_matches_table.bracket_edition_id,
    bracket_matches_table.match_id,
    bracket_matches_table.home_team_id,
    bracket_matches_table.away_team_id,
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

  round_duration_minutes := public.resolve_championship_sport_duration_minutes(
    _championship_id,
    bracket_match_record.sport_id
  );

  SELECT
    slots_table.slot_start,
    slots_table.slot_start + make_interval(mins => round_duration_minutes),
    slots_table.location_name,
    slots_table.court_name
  INTO
    selected_slot_start,
    selected_slot_end,
    selected_slot_location_name,
    selected_slot_court_name
  FROM (
    SELECT
      slot_start.value AS slot_start,
      ((days_table.event_date::text || ' ' || days_table.end_time::text)::timestamp AT TIME ZONE 'America/Sao_Paulo') AS day_end,
      locations_table.name AS location_name,
      courts_table.name AS court_name,
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
    WHERE days_table.bracket_edition_id = bracket_match_record.bracket_edition_id
  ) AS slots_table
  WHERE slots_table.sport_id = bracket_match_record.sport_id
    AND slots_table.slot_start + make_interval(mins => round_duration_minutes) <= slots_table.day_end
    AND NOT EXISTS (
      SELECT 1
      FROM public.matches AS matches_table
      WHERE matches_table.location = slots_table.location_name
        AND COALESCE(matches_table.court_name, '') = COALESCE(slots_table.court_name, '')
        AND matches_table.start_time < slots_table.slot_start + make_interval(mins => round_duration_minutes)
        AND matches_table.end_time > slots_table.slot_start
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.matches AS matches_table
      WHERE matches_table.championship_id = _championship_id
        AND matches_table.season_year = bracket_match_record.season_year
        AND (
          matches_table.home_team_id IN (bracket_match_record.home_team_id, bracket_match_record.away_team_id)
          OR matches_table.away_team_id IN (bracket_match_record.home_team_id, bracket_match_record.away_team_id)
        )
        AND matches_table.start_time < slots_table.slot_start + make_interval(mins => round_duration_minutes + 15)
        AND matches_table.end_time > slots_table.slot_start - interval '15 minutes'
    )
  ORDER BY slots_table.slot_start ASC
  LIMIT 1;

  IF selected_slot_start IS NULL THEN
    RETURN NULL;
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
    bracket_match_record.division,
    bracket_match_record.naipe,
    bracket_match_record.sport_id,
    bracket_match_record.home_team_id,
    bracket_match_record.away_team_id,
    selected_slot_location_name,
    selected_slot_court_name,
    selected_slot_start,
    selected_slot_end,
    bracket_match_record.season_year,
    'SCHEDULED'::public.match_status
  )
  RETURNING id INTO new_match_id;

  UPDATE public.championship_bracket_matches
  SET match_id = new_match_id
  WHERE id = _bracket_match_id;

  RETURN new_match_id;
END;
$$;

DO $migration_group_generation_with_season_year$
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
    'championship_uses_divisions BOOLEAN;',
    E'championship_uses_divisions BOOLEAN;\n  championship_current_season_year INTEGER;',
    'g'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$SELECT championships_table\.uses_divisions\s+INTO championship_uses_divisions\s+FROM public\.championships AS championships_table\s+WHERE championships_table\.id = _championship_id\s+AND championships_table\.status = 'PLANNING'::public\.championship_status\s+LIMIT 1;$pattern$,
    $replacement$SELECT
    championships_table.uses_divisions,
    championships_table.current_season_year
  INTO
    championship_uses_divisions,
    championship_current_season_year
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id
    AND championships_table.status = 'PLANNING'::public.championship_status
  LIMIT 1;$replacement$,
    'g'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$SELECT count\(\*\)\s+INTO existing_matches_count\s+FROM public\.matches AS matches_table\s+WHERE matches_table\.championship_id = _championship_id;$pattern$,
    $replacement$SELECT count(*)
  INTO existing_matches_count
  FROM public.matches AS matches_table
  WHERE matches_table.championship_id = _championship_id
    AND matches_table.season_year = championship_current_season_year;$replacement$,
    'g'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$INSERT INTO public\.championship_bracket_editions \(\s*championship_id,\s*status,\s*payload_snapshot,\s*created_by\s*\)\s*VALUES \(\s*_championship_id,\s*'DRAFT'::public\.bracket_edition_status,\s*COALESCE\(_payload, '\{\}'::jsonb\),\s*auth\.uid\(\)\s*\)$pattern$,
    $replacement$INSERT INTO public.championship_bracket_editions (
    championship_id,
    season_year,
    status,
    payload_snapshot,
    created_by
  ) VALUES (
    _championship_id,
    championship_current_season_year,
    'DRAFT'::public.bracket_edition_status,
    COALESCE(_payload, '{}'::jsonb),
    auth.uid()
  )$replacement$,
    'g'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$INSERT INTO public\.matches \(\s*championship_id,\s*division,\s*naipe,\s*sport_id,\s*home_team_id,\s*away_team_id,\s*location,\s*court_name,\s*start_time,\s*end_time,\s*status\s*\)\s*VALUES \(\s*_championship_id,\s*division_value,\s*naipe_value,\s*sport_id,\s*group_team_ids\[existing_matches_count\],\s*group_team_ids\[qualifiers_per_group_value\],\s*selected_slot_location_name,\s*selected_slot_court_name,\s*selected_slot_start,\s*selected_slot_end,\s*'SCHEDULED'::public\.match_status\s*\)$pattern$,
    $replacement$INSERT INTO public.matches (
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
      )$replacement$,
    'g'
  );

  IF position('championship_current_season_year INTEGER;' IN function_definition) = 0
    OR position('championships_table.current_season_year' IN function_definition) = 0
    OR position('matches_table.season_year = championship_current_season_year' IN function_definition) = 0
    OR position('season_year,' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível sincronizar a geração de grupos com o recorte por temporada.';
  END IF;

  EXECUTE function_definition;
END;
$migration_group_generation_with_season_year$;

DROP FUNCTION IF EXISTS public.get_championship_bracket_view(UUID);

CREATE OR REPLACE FUNCTION public.get_championship_bracket_view(
  _championship_id UUID,
  _season_year INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  response JSONB;
  resolved_season_year INTEGER;
BEGIN
  SELECT COALESCE(
    _season_year,
    championships_table.current_season_year,
    date_part('year', timezone('America/Sao_Paulo', now()))::integer
  )
  INTO resolved_season_year
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id
  LIMIT 1;

  IF resolved_season_year IS NULL THEN
    resolved_season_year := date_part('year', timezone('America/Sao_Paulo', now()))::integer;
  END IF;

  WITH latest_edition AS (
    SELECT editions_table.id
    FROM public.championship_bracket_editions AS editions_table
    WHERE editions_table.championship_id = _championship_id
      AND editions_table.season_year = resolved_season_year
    ORDER BY editions_table.created_at DESC
    LIMIT 1
  ),
  competitions AS (
    SELECT
      competitions_table.id,
      competitions_table.sport_id,
      competitions_table.naipe,
      competitions_table.division,
      competitions_table.groups_count,
      competitions_table.qualifiers_per_group,
      competitions_table.third_place_mode,
      sports_table.name AS sport_name
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN latest_edition
      ON latest_edition.id = competitions_table.bracket_edition_id
    JOIN public.sports AS sports_table
      ON sports_table.id = competitions_table.sport_id
  ),
  groups AS (
    SELECT
      groups_table.id,
      groups_table.competition_id,
      groups_table.group_number,
      jsonb_agg(
        jsonb_build_object(
          'team_id', teams_table.id,
          'team_name', teams_table.name,
          'team_city', teams_table.city,
          'position', group_teams_table.position
        )
        ORDER BY group_teams_table.position ASC
      ) AS teams
    FROM public.championship_bracket_groups AS groups_table
    JOIN public.championship_bracket_group_teams AS group_teams_table
      ON group_teams_table.group_id = groups_table.id
    JOIN public.teams AS teams_table
      ON teams_table.id = group_teams_table.team_id
    WHERE groups_table.competition_id IN (SELECT competitions.id FROM competitions)
    GROUP BY groups_table.id, groups_table.competition_id, groups_table.group_number
  ),
  bracket_matches AS (
    SELECT
      bracket_matches_table.id,
      bracket_matches_table.competition_id,
      bracket_matches_table.group_id,
      bracket_matches_table.phase,
      bracket_matches_table.round_number,
      bracket_matches_table.slot_number,
      bracket_matches_table.match_id,
      bracket_matches_table.home_team_id,
      bracket_matches_table.away_team_id,
      bracket_matches_table.winner_team_id,
      bracket_matches_table.is_bye,
      bracket_matches_table.is_third_place,
      matches_table.status,
      matches_table.start_time,
      matches_table.end_time,
      matches_table.location,
      matches_table.court_name,
      home_teams_table.name AS home_team_name,
      away_teams_table.name AS away_team_name,
      winner_teams_table.name AS winner_team_name
    FROM public.championship_bracket_matches AS bracket_matches_table
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    LEFT JOIN public.teams AS home_teams_table
      ON home_teams_table.id = bracket_matches_table.home_team_id
    LEFT JOIN public.teams AS away_teams_table
      ON away_teams_table.id = bracket_matches_table.away_team_id
    LEFT JOIN public.teams AS winner_teams_table
      ON winner_teams_table.id = bracket_matches_table.winner_team_id
    WHERE bracket_matches_table.bracket_edition_id IN (SELECT latest_edition.id FROM latest_edition)
  )
  SELECT jsonb_build_object(
    'edition', (
      SELECT to_jsonb(editions_table)
      FROM public.championship_bracket_editions AS editions_table
      WHERE editions_table.id IN (SELECT latest_edition.id FROM latest_edition)
      LIMIT 1
    ),
    'competitions', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', competitions.id,
            'sport_id', competitions.sport_id,
            'sport_name', competitions.sport_name,
            'naipe', competitions.naipe,
            'division', competitions.division,
            'groups_count', competitions.groups_count,
            'qualifiers_per_group', competitions.qualifiers_per_group,
            'third_place_mode', competitions.third_place_mode,
            'groups', COALESCE(
              (
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'id', groups.id,
                    'group_number', groups.group_number,
                    'teams', groups.teams,
                    'matches', COALESCE(
                      (
                        SELECT jsonb_agg(
                          jsonb_build_object(
                            'id', bracket_matches.id,
                            'match_id', bracket_matches.match_id,
                            'status', bracket_matches.status,
                            'start_time', bracket_matches.start_time,
                            'end_time', bracket_matches.end_time,
                            'location', bracket_matches.location,
                            'court_name', bracket_matches.court_name,
                            'home_team_id', bracket_matches.home_team_id,
                            'away_team_id', bracket_matches.away_team_id,
                            'home_team_name', bracket_matches.home_team_name,
                            'away_team_name', bracket_matches.away_team_name,
                            'winner_team_id', bracket_matches.winner_team_id,
                            'winner_team_name', bracket_matches.winner_team_name
                          )
                          ORDER BY bracket_matches.round_number ASC, bracket_matches.slot_number ASC
                        )
                        FROM bracket_matches
                        WHERE bracket_matches.group_id = groups.id
                          AND bracket_matches.phase = 'GROUP_STAGE'::public.bracket_phase
                      ),
                      '[]'::jsonb
                    )
                  )
                  ORDER BY groups.group_number ASC
                )
                FROM groups
                WHERE groups.competition_id = competitions.id
              ),
              '[]'::jsonb
            ),
            'knockout_matches', COALESCE(
              (
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'id', bracket_matches.id,
                    'round_number', bracket_matches.round_number,
                    'slot_number', bracket_matches.slot_number,
                    'match_id', bracket_matches.match_id,
                    'status', bracket_matches.status,
                    'start_time', bracket_matches.start_time,
                    'end_time', bracket_matches.end_time,
                    'location', bracket_matches.location,
                    'court_name', bracket_matches.court_name,
                    'home_team_id', bracket_matches.home_team_id,
                    'away_team_id', bracket_matches.away_team_id,
                    'home_team_name', bracket_matches.home_team_name,
                    'away_team_name', bracket_matches.away_team_name,
                    'winner_team_id', bracket_matches.winner_team_id,
                    'winner_team_name', bracket_matches.winner_team_name,
                    'is_bye', bracket_matches.is_bye,
                    'is_third_place', bracket_matches.is_third_place
                  )
                  ORDER BY bracket_matches.round_number ASC, bracket_matches.slot_number ASC
                )
                FROM bracket_matches
                WHERE bracket_matches.competition_id = competitions.id
                  AND bracket_matches.phase = 'KNOCKOUT'::public.bracket_phase
              ),
              '[]'::jsonb
            )
          )
          ORDER BY competitions.sport_name ASC, competitions.naipe ASC, competitions.division ASC NULLS FIRST
        )
        FROM competitions
      ),
      '[]'::jsonb
    )
  )
  INTO response;

  RETURN COALESCE(
    response,
    jsonb_build_object(
      'edition', NULL,
      'competitions', '[]'::jsonb
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_championship_bracket_view(UUID, INTEGER) TO anon, authenticated;

COMMENT ON FUNCTION public.create_championship_knockout_match_schedule(UUID, UUID) IS 'Cria o jogo real do mata-mata quando o confronto já tem os dois lados definidos e há horário disponível, respeitando a temporada da edição.';
COMMENT ON FUNCTION public.generate_championship_bracket_groups(UUID, JSONB) IS 'Cria edição de chaveamento por temporada, gera fase de grupos automaticamente, agenda partidas sem conflito e altera campeonato para Configurando campeonato (UPCOMING).';
COMMENT ON FUNCTION public.get_championship_bracket_view(UUID, INTEGER) IS 'Retorna a visão consolidada do chaveamento para uma temporada específica do campeonato.';

NOTIFY pgrst, 'reload schema';
