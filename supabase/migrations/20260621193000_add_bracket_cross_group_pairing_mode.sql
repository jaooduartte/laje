ALTER TABLE public.championship_bracket_competitions
  DROP CONSTRAINT IF EXISTS championship_bracket_competitions_knockout_pairing_mode_check;

ALTER TABLE public.championship_bracket_competitions
  ADD CONSTRAINT championship_bracket_competitions_knockout_pairing_mode_check
  CHECK (
    knockout_pairing_mode IN (
      'LINEAR',
      'FUTEVOLEI_FEM_INVERTED',
      'BEACH_SOCCER_FEM_DIRECT_SEMI',
      'FUTEBOL_SOCIETY_FEM_ACCESS_CROSS_GROUPS'
    )
  );

DO $$
DECLARE
  v_func_def TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_func_def
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'generate_championship_bracket_groups';

  IF v_func_def IS NULL THEN
    RAISE EXCEPTION 'Função generate_championship_bracket_groups não encontrada.';
  END IF;

  v_func_def := replace(
    v_func_def,
    '  should_complete_knockout_with_best_second_placed_teams_value BOOLEAN;',
    '  should_complete_knockout_with_best_second_placed_teams_value BOOLEAN;' || chr(10) ||
    '  knockout_pairing_mode_value TEXT;'
  );

  v_func_def := replace(
    v_func_def,
    '    should_complete_knockout_with_best_second_placed_teams_value := COALESCE(' || chr(10) ||
    '      (competition_record->>''should_complete_knockout_with_best_second_placed_teams'')::boolean,' || chr(10) ||
    '      false' || chr(10) ||
    '    );',
    '    should_complete_knockout_with_best_second_placed_teams_value := COALESCE(' || chr(10) ||
    '      (competition_record->>''should_complete_knockout_with_best_second_placed_teams'')::boolean,' || chr(10) ||
    '      false' || chr(10) ||
    '    );' || chr(10) ||
    '    knockout_pairing_mode_value := NULLIF(trim(COALESCE(competition_record->>''knockout_pairing_mode'', '''')), '''');'
  );

  v_func_def := replace(
    v_func_def,
    '      third_place_mode,' || chr(10) ||
    '      should_complete_knockout_with_best_second_placed_teams',
    '      third_place_mode,' || chr(10) ||
    '      should_complete_knockout_with_best_second_placed_teams,' || chr(10) ||
    '      knockout_pairing_mode'
  );

  v_func_def := replace(
    v_func_def,
    '      third_place_mode_value,' || chr(10) ||
    '      should_complete_knockout_with_best_second_placed_teams_value',
    '      third_place_mode_value,' || chr(10) ||
    '      should_complete_knockout_with_best_second_placed_teams_value,' || chr(10) ||
    '      COALESCE(knockout_pairing_mode_value, ''LINEAR'')'
  );

  v_func_def := replace(
    v_func_def,
    '      third_place_mode = EXCLUDED.third_place_mode,' || chr(10) ||
    '      should_complete_knockout_with_best_second_placed_teams = EXCLUDED.should_complete_knockout_with_best_second_placed_teams',
    '      third_place_mode = EXCLUDED.third_place_mode,' || chr(10) ||
    '      should_complete_knockout_with_best_second_placed_teams = EXCLUDED.should_complete_knockout_with_best_second_placed_teams,' || chr(10) ||
    '      knockout_pairing_mode = COALESCE(knockout_pairing_mode_value, public.championship_bracket_competitions.knockout_pairing_mode)'
  );

  EXECUTE v_func_def;
END;
$$;

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
      competitions_table.should_complete_knockout_with_best_second_placed_teams,
      competitions_table.knockout_pairing_mode,
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
      matches_table.scheduled_date,
      matches_table.queue_position,
      matches_table.scheduled_slot,
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
            'should_complete_knockout_with_best_second_placed_teams', competitions.should_complete_knockout_with_best_second_placed_teams,
            'knockout_pairing_mode', competitions.knockout_pairing_mode,
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
                            'scheduled_date', bracket_matches.scheduled_date,
                            'queue_position', bracket_matches.queue_position,
                            'scheduled_slot', bracket_matches.scheduled_slot,
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
                    'scheduled_date', bracket_matches.scheduled_date,
                    'queue_position', bracket_matches.queue_position,
                    'scheduled_slot', bracket_matches.scheduled_slot,
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

COMMENT ON FUNCTION public.get_championship_bracket_view(UUID, INTEGER)
IS 'Retorna a visão consolidada do chaveamento com fila diária, horário real, local planejado e knockout_pairing_mode por temporada.';

CREATE OR REPLACE FUNCTION public.update_bracket_competition_settings(
  _competition_id UUID,
  _qualifiers_per_group INTEGER,
  _should_complete_knockout_with_best_second_placed_teams BOOLEAN,
  _knockout_pairing_mode TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edition_id UUID;
  v_sport_id UUID;
  v_naipe public.match_naipe;
  v_division public.team_division;
  v_sport_name TEXT;
  v_flag BOOLEAN;
  v_knockout_pairing_mode TEXT;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para editar a classificação.';
  END IF;

  IF _qualifiers_per_group NOT IN (1, 2) THEN
    RAISE EXCEPTION 'Classificados por grupo deve ser 1 ou 2.';
  END IF;

  v_knockout_pairing_mode := COALESCE(NULLIF(trim(_knockout_pairing_mode), ''), 'LINEAR');

  IF v_knockout_pairing_mode NOT IN (
    'LINEAR',
    'FUTEVOLEI_FEM_INVERTED',
    'BEACH_SOCCER_FEM_DIRECT_SEMI',
    'FUTEBOL_SOCIETY_FEM_ACCESS_CROSS_GROUPS'
  ) THEN
    RAISE EXCEPTION 'Tipo de cruzamento inválido.';
  END IF;

  v_flag := CASE
    WHEN _qualifiers_per_group = 2 THEN false
    ELSE COALESCE(_should_complete_knockout_with_best_second_placed_teams, false)
  END;

  SELECT
    comp.bracket_edition_id,
    comp.sport_id,
    comp.naipe,
    comp.division,
    sports_table.name
  INTO
    v_edition_id,
    v_sport_id,
    v_naipe,
    v_division,
    v_sport_name
  FROM public.championship_bracket_competitions AS comp
  JOIN public.championship_bracket_editions AS cbe ON cbe.id = comp.bracket_edition_id
  JOIN public.championships AS c ON c.id = cbe.championship_id
  JOIN public.sports AS sports_table ON sports_table.id = comp.sport_id
  WHERE comp.id = _competition_id
    AND c.status = 'UPCOMING'::public.championship_status
  LIMIT 1;

  IF v_edition_id IS NULL THEN
    RAISE EXCEPTION 'Competição inválida ou campeonato fora do status Configurando campeonato.';
  END IF;

  IF v_knockout_pairing_mode = 'FUTEBOL_SOCIETY_FEM_ACCESS_CROSS_GROUPS'
    AND NOT (
      v_sport_name = 'Futebol Society'
      AND v_naipe = 'FEMININO'::public.match_naipe
      AND v_division = 'DIVISAO_ACESSO'::public.team_division
    ) THEN
    RAISE EXCEPTION 'Esse tipo de cruzamento só está disponível para Futebol Society Feminino Divisão de Acesso.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches
    WHERE bracket_matches.competition_id = _competition_id
      AND bracket_matches.phase = 'KNOCKOUT'::public.bracket_phase
  ) THEN
    RAISE EXCEPTION 'O mata-mata desta competição já foi gerado. Não é possível alterar a classificação.';
  END IF;

  UPDATE public.championship_bracket_competitions
  SET
    qualifiers_per_group = _qualifiers_per_group,
    should_complete_knockout_with_best_second_placed_teams = v_flag,
    knockout_pairing_mode = v_knockout_pairing_mode
  WHERE id = _competition_id;

  UPDATE public.championship_bracket_editions AS cbe
  SET
    payload_snapshot = jsonb_set(
      cbe.payload_snapshot,
      '{competitions}',
      (
        SELECT COALESCE(jsonb_agg(
          CASE
            WHEN (elem->>'sport_id') = v_sport_id::text
              AND (elem->>'naipe') = v_naipe::text
              AND NULLIF(trim(COALESCE(elem->>'division', '')), '') IS NOT DISTINCT FROM v_division::text
            THEN elem || jsonb_build_object(
              'qualifiers_per_group', _qualifiers_per_group,
              'should_complete_knockout_with_best_second_placed_teams', v_flag,
              'knockout_pairing_mode', v_knockout_pairing_mode
            )
            ELSE elem
          END
        ), '[]'::jsonb)
        FROM jsonb_array_elements(cbe.payload_snapshot->'competitions') AS elem
      )
    ),
    updated_at = now(),
    updated_by = auth.uid()
  WHERE cbe.id = v_edition_id
    AND jsonb_typeof(cbe.payload_snapshot->'competitions') = 'array';
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_bracket_competition_settings(uuid, integer, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_championship_knockout_for_competition(
  _championship_id UUID,
  _competition_id UUID,
  _bracket_edition_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
#variable_conflict use_variable
DECLARE
  bracket_edition_id UUID;
  competition_record RECORD;
  ranking_record RECORD;
  qualified_team_ids UUID[] := ARRAY[]::UUID[];
  qualified_team_count INTEGER;
  group_count_value INTEGER;
  direct_qualified_team_count INTEGER;
  should_expand_with_best_second_placed_teams BOOLEAN;
  should_include_best_second_placed_teams BOOLEAN;
  should_use_cross_groups_pairing BOOLEAN;
  all_groups_finished BOOLEAN := false;
  target_bracket_size INTEGER;
  bracket_size INTEGER;
  total_rounds INTEGER;
  current_round INTEGER;
  slot_index INTEGER;
  home_seed_index INTEGER;
  away_seed_index INTEGER;
  home_team_id UUID;
  away_team_id UUID;
  round_match_ids UUID[];
  next_round_match_ids UUID[];
  bracket_match_id UUID;
  third_place_mode_value public.bracket_third_place_mode;
  existing_knockout_count INTEGER;
  pending_tie_breaks_count INTEGER;
  standard_seed_order INTEGER[];
  seed_iter INTEGER;
BEGIN
  SELECT
    competitions_table.id,
    competitions_table.bracket_edition_id,
    competitions_table.sport_id,
    competitions_table.naipe,
    competitions_table.division,
    competitions_table.qualifiers_per_group,
    competitions_table.should_complete_knockout_with_best_second_placed_teams,
    competitions_table.third_place_mode,
    COALESCE(competitions_table.knockout_pairing_mode, 'LINEAR') AS knockout_pairing_mode,
    COALESCE(sports_table.code, '') AS sport_code
  INTO competition_record
  FROM public.championship_bracket_competitions AS competitions_table
  LEFT JOIN public.sports AS sports_table
    ON sports_table.id = competitions_table.sport_id
  WHERE competitions_table.id = _competition_id
    AND (_bracket_edition_id IS NULL OR competitions_table.bracket_edition_id = _bracket_edition_id)
  LIMIT 1;

  IF competition_record.id IS NULL THEN
    RETURN NULL;
  END IF;

  bracket_edition_id := competition_record.bracket_edition_id;
  third_place_mode_value := competition_record.third_place_mode;

  SELECT count(*)
  INTO pending_tie_breaks_count
  FROM jsonb_array_elements(public.get_championship_bracket_pending_tie_breaks(_championship_id, bracket_edition_id)) AS tb
  WHERE (tb->>'competition_id')::uuid = _competition_id;

  IF pending_tie_breaks_count > 0 THEN
    RETURN _competition_id;
  END IF;

  SELECT
    count(*)::int,
    bool_and(group_statuses.is_group_finished)
  INTO
    group_count_value,
    all_groups_finished
  FROM (
    SELECT
      groups_table.id,
      (
        count(bracket_matches_table.match_id) > 0
        AND count(*) FILTER (
          WHERE matches_table.status = 'FINISHED'::public.match_status
        ) = count(bracket_matches_table.match_id)
      ) AS is_group_finished
    FROM public.championship_bracket_groups AS groups_table
    LEFT JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.group_id = groups_table.id
      AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE groups_table.competition_id = _competition_id
    GROUP BY groups_table.id
  ) AS group_statuses;

  IF group_count_value < 1 THEN
    RETURN _competition_id;
  END IF;

  IF all_groups_finished IS NOT TRUE THEN
    RETURN _competition_id;
  END IF;

  direct_qualified_team_count := group_count_value * competition_record.qualifiers_per_group;
  should_expand_with_best_second_placed_teams :=
    competition_record.qualifiers_per_group = 1
    AND competition_record.should_complete_knockout_with_best_second_placed_teams = true;

  target_bracket_size := 1;
  IF should_expand_with_best_second_placed_teams THEN
    WHILE target_bracket_size <= direct_qualified_team_count LOOP
      target_bracket_size := target_bracket_size * 2;
    END LOOP;
  ELSE
    WHILE target_bracket_size < direct_qualified_team_count LOOP
      target_bracket_size := target_bracket_size * 2;
    END LOOP;
  END IF;

  IF target_bracket_size < 2 THEN
    RETURN _competition_id;
  END IF;

  should_include_best_second_placed_teams :=
    competition_record.qualifiers_per_group = 1
    AND target_bracket_size > direct_qualified_team_count;

  should_use_cross_groups_pairing :=
    competition_record.knockout_pairing_mode = 'FUTEBOL_SOCIETY_FEM_ACCESS_CROSS_GROUPS'
    AND competition_record.sport_code = 'FUTEBOL_SOCIETY'
    AND competition_record.naipe = 'FEMININO'::public.match_naipe
    AND competition_record.division = 'DIVISAO_ACESSO'::public.team_division
    AND group_count_value = 2
    AND competition_record.qualifiers_per_group = 1
    AND should_include_best_second_placed_teams
    AND target_bracket_size = 4;

  IF should_include_best_second_placed_teams AND NOT all_groups_finished THEN
    RETURN _competition_id;
  END IF;

  IF should_use_cross_groups_pairing THEN
    FOR ranking_record IN
      WITH ordered_groups AS (
        SELECT
          groups_table.id AS group_id,
          groups_table.group_number
        FROM public.championship_bracket_groups AS groups_table
        WHERE groups_table.competition_id = _competition_id
      )
      SELECT rankings_table.team_id
      FROM ordered_groups
      CROSS JOIN generate_series(1, 2) AS qualifiers(rank_number)
      LEFT JOIN public.get_championship_bracket_competition_group_rankings(
        _championship_id,
        _competition_id
      ) AS rankings_table
        ON rankings_table.group_id = ordered_groups.group_id
        AND rankings_table.team_rank = qualifiers.rank_number
      ORDER BY ordered_groups.group_number ASC, qualifiers.rank_number ASC
    LOOP
      qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
    END LOOP;
  ELSE
    FOR ranking_record IN
      WITH ordered_groups AS (
        SELECT
          groups_table.id AS group_id,
          groups_table.group_number,
          (
            count(bracket_matches_table.match_id) > 0
            AND count(*) FILTER (
              WHERE matches_table.status = 'FINISHED'::public.match_status
            ) = count(bracket_matches_table.match_id)
          ) AS is_group_finished
        FROM public.championship_bracket_groups AS groups_table
        LEFT JOIN public.championship_bracket_matches AS bracket_matches_table
          ON bracket_matches_table.group_id = groups_table.id
          AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
        LEFT JOIN public.matches AS matches_table
          ON matches_table.id = bracket_matches_table.match_id
        WHERE groups_table.competition_id = _competition_id
        GROUP BY groups_table.id, groups_table.group_number
      )
      SELECT
        qualifiers.rank_number,
        rankings_table.team_id
      FROM ordered_groups
      CROSS JOIN generate_series(1, competition_record.qualifiers_per_group) AS qualifiers(rank_number)
      LEFT JOIN public.get_championship_bracket_competition_group_rankings(
        _championship_id,
        _competition_id
      ) AS rankings_table
        ON rankings_table.group_id = ordered_groups.group_id
        AND rankings_table.team_rank = qualifiers.rank_number
      LEFT JOIN public.get_championship_bracket_competition_qualification_pool_rankings(
        _championship_id,
        _competition_id
      ) AS pool_rankings
        ON pool_rankings.team_id = rankings_table.team_id
        AND pool_rankings.qualification_rank = qualifiers.rank_number
      ORDER BY
        qualifiers.rank_number ASC,
        CASE
          WHEN should_include_best_second_placed_teams
          THEN COALESCE(pool_rankings.pool_rank, ordered_groups.group_number + 1000)
          ELSE ordered_groups.group_number
        END ASC
    LOOP
      qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
    END LOOP;

    IF should_include_best_second_placed_teams THEN
      FOR ranking_record IN
        SELECT qualification_pool_rankings.team_id
        FROM public.get_championship_bracket_competition_qualification_pool_rankings(
          _championship_id,
          _competition_id
        ) AS qualification_pool_rankings
        ORDER BY qualification_pool_rankings.pool_rank ASC
      LOOP
        EXIT WHEN COALESCE(cardinality(qualified_team_ids), 0) >= target_bracket_size;

        IF ranking_record.team_id IS NOT NULL
          AND NOT ranking_record.team_id = ANY(qualified_team_ids) THEN
          qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
        END IF;
      END LOOP;
    END IF;
  END IF;

  WHILE COALESCE(cardinality(qualified_team_ids), 0) < target_bracket_size LOOP
    qualified_team_ids := array_append(qualified_team_ids, NULL);
  END LOOP;

  IF COALESCE(cardinality(qualified_team_ids), 0) > target_bracket_size THEN
    qualified_team_ids := qualified_team_ids[1:target_bracket_size];
  END IF;

  qualified_team_count := COALESCE(cardinality(qualified_team_ids), 0);

  IF qualified_team_count < 2 THEN
    RETURN _competition_id;
  END IF;

  bracket_size := 1;
  WHILE bracket_size < qualified_team_count LOOP
    bracket_size := bracket_size * 2;
  END LOOP;

  WHILE cardinality(qualified_team_ids) < bracket_size LOOP
    qualified_team_ids := array_append(qualified_team_ids, NULL);
  END LOOP;

  total_rounds := 1;
  WHILE power(2, total_rounds) < bracket_size LOOP
    total_rounds := total_rounds + 1;
  END LOOP;

  standard_seed_order := ARRAY[]::INTEGER[];
  FOR seed_iter IN 1..(bracket_size / 2) LOOP
    standard_seed_order := array_append(standard_seed_order, seed_iter);
    standard_seed_order := array_append(standard_seed_order, bracket_size + 1 - seed_iter);
  END LOOP;

  SELECT count(*)
  INTO existing_knockout_count
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase;

  IF existing_knockout_count > 0 THEN
    RETURN _competition_id;
  END IF;

  round_match_ids := ARRAY[]::UUID[];

  FOR slot_index IN 1..(bracket_size / 2)
  LOOP
    home_seed_index := standard_seed_order[((slot_index - 1) * 2) + 1];
    away_seed_index := standard_seed_order[((slot_index - 1) * 2) + 2];
    home_team_id := qualified_team_ids[home_seed_index];
    away_team_id := qualified_team_ids[away_seed_index];

    INSERT INTO public.championship_bracket_matches (
      bracket_edition_id,
      competition_id,
      phase,
      round_number,
      slot_number,
      home_team_id,
      away_team_id,
      winner_team_id,
      is_bye
    ) VALUES (
      bracket_edition_id,
      _competition_id,
      'KNOCKOUT'::public.bracket_phase,
      1,
      slot_index,
      home_team_id,
      away_team_id,
      CASE
        WHEN home_team_id IS NULL AND away_team_id IS NOT NULL THEN away_team_id
        WHEN away_team_id IS NULL AND home_team_id IS NOT NULL THEN home_team_id
        ELSE NULL
      END,
      CASE
        WHEN home_team_id IS NULL AND away_team_id IS NULL THEN false
        WHEN home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN false
        ELSE true
      END
    )
    RETURNING id INTO bracket_match_id;

    IF home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN
      PERFORM public.create_championship_knockout_match_schedule(_championship_id, bracket_match_id);
    END IF;

    round_match_ids := array_append(round_match_ids, bracket_match_id);
  END LOOP;

  current_round := 1;

  LOOP
    next_round_match_ids := ARRAY[]::UUID[];

    EXIT WHEN COALESCE(cardinality(round_match_ids), 0) < 2;

    FOR slot_index IN 1..(COALESCE(cardinality(round_match_ids), 0) / 2)
    LOOP
      bracket_match_id := public.ensure_championship_knockout_next_round_match(
        _championship_id,
        _competition_id,
        current_round,
        slot_index
      );

      IF bracket_match_id IS NOT NULL THEN
        next_round_match_ids := array_append(next_round_match_ids, bracket_match_id);
      END IF;
    END LOOP;

    EXIT WHEN COALESCE(cardinality(next_round_match_ids), 0) = 0;

    IF third_place_mode_value = 'MATCH'::public.bracket_third_place_mode
      AND COALESCE(cardinality(round_match_ids), 0) = 2 THEN
      PERFORM public.ensure_championship_knockout_third_place_match(
        _championship_id,
        _competition_id,
        current_round
      );
    END IF;

    round_match_ids := next_round_match_ids;
    current_round := current_round + 1;
  END LOOP;

  PERFORM public.sync_championship_bracket_edition_status(bracket_edition_id);

  RETURN _competition_id;
END;
$func$;

COMMENT ON FUNCTION public.generate_championship_knockout_for_competition(UUID, UUID, UUID) IS
  'Gera apenas a primeira rodada jogável do mata-mata e cria as rodadas seguintes sob demanda. Suporta modo especial de cruzamento entre 2 chaves para Futebol Society Feminino Divisão de Acesso.';

NOTIFY pgrst, 'reload schema';
