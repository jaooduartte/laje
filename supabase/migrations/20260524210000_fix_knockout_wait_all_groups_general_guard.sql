-- Complementa 20260524180000: amplia o guard de geração do mata-mata para cobrir
-- qualquer configuração de qualifiers_per_group, não só qualifiers_per_group = 1.
--
-- 20260524180000 adicionou:
--   IF should_include_best_second_placed_teams AND NOT all_groups_finished → RETURN
-- Esse guard não cobre qualifiers_per_group > 1 (ex: 2 classificados por grupo),
-- onde should_include_best_second_placed_teams = false mas o mesmo BYE prematuro
-- poderia ocorrer se o trigger disparar antes de todos os grupos terminarem.
--
-- Fix: substitui o guard específico por um guard geral — nunca gera o mata-mata
-- antes de TODOS os grupos da competição estarem finalizados.

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
  semifinal_match_ids UUID[];
  source_home_bracket_match_id UUID;
  source_away_bracket_match_id UUID;
  source_home_winner_team_id UUID;
  source_away_winner_team_id UUID;
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
    competitions_table.third_place_mode
  INTO competition_record
  FROM public.championship_bracket_competitions AS competitions_table
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

  -- Guard geral: nunca gera o mata-mata antes de todos os grupos terminarem,
  -- independente de qualifiers_per_group ou should_complete_knockout_with_best_second_placed_teams.
  -- Garante que todos os classificados (1ºs e 2ºs) estejam determinados antes
  -- de montar a chave, evitando BYEs prematuros.
  IF NOT all_groups_finished THEN
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

  -- all_groups_finished garantido pelo guard acima
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

  IF existing_knockout_count = 0 THEN
    round_match_ids := ARRAY[]::UUID[];
    semifinal_match_ids := ARRAY[]::UUID[];

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

    IF total_rounds > 1 THEN
      FOR current_round IN 2..total_rounds
      LOOP
        IF current_round = total_rounds THEN
          semifinal_match_ids := round_match_ids;
        END IF;

        next_round_match_ids := ARRAY[]::UUID[];

        FOR slot_index IN 1..(COALESCE(cardinality(round_match_ids), 0) / 2)
        LOOP
          source_home_bracket_match_id := round_match_ids[(slot_index * 2) - 1];
          source_away_bracket_match_id := round_match_ids[(slot_index * 2)];

          SELECT bracket_matches_table.winner_team_id
          INTO source_home_winner_team_id
          FROM public.championship_bracket_matches AS bracket_matches_table
          WHERE bracket_matches_table.id = source_home_bracket_match_id
          LIMIT 1;

          SELECT bracket_matches_table.winner_team_id
          INTO source_away_winner_team_id
          FROM public.championship_bracket_matches AS bracket_matches_table
          WHERE bracket_matches_table.id = source_away_bracket_match_id
          LIMIT 1;

          home_team_id := source_home_winner_team_id;
          away_team_id := source_away_winner_team_id;

          INSERT INTO public.championship_bracket_matches (
            bracket_edition_id,
            competition_id,
            phase,
            round_number,
            slot_number,
            home_team_id,
            away_team_id,
            winner_team_id,
            source_home_bracket_match_id,
            source_away_bracket_match_id
          ) VALUES (
            bracket_edition_id,
            _competition_id,
            'KNOCKOUT'::public.bracket_phase,
            current_round,
            slot_index,
            home_team_id,
            away_team_id,
            CASE
              WHEN home_team_id IS NULL AND away_team_id IS NOT NULL THEN away_team_id
              WHEN away_team_id IS NULL AND home_team_id IS NOT NULL THEN home_team_id
              ELSE NULL
            END,
            source_home_bracket_match_id,
            source_away_bracket_match_id
          )
          RETURNING id INTO bracket_match_id;

          IF home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN
            PERFORM public.create_championship_knockout_match_schedule(_championship_id, bracket_match_id);
          END IF;

          next_round_match_ids := array_append(next_round_match_ids, bracket_match_id);
        END LOOP;

        round_match_ids := next_round_match_ids;
      END LOOP;
    END IF;

    IF third_place_mode_value = 'MATCH'::public.bracket_third_place_mode
      AND cardinality(semifinal_match_ids) = 2 THEN
      INSERT INTO public.championship_bracket_matches (
        bracket_edition_id,
        competition_id,
        phase,
        round_number,
        slot_number,
        home_team_id,
        away_team_id,
        winner_team_id,
        source_home_bracket_match_id,
        source_away_bracket_match_id,
        is_third_place
      ) VALUES (
        bracket_edition_id,
        _competition_id,
        'KNOCKOUT'::public.bracket_phase,
        total_rounds,
        2,
        NULL,
        NULL,
        NULL,
        semifinal_match_ids[1],
        semifinal_match_ids[2],
        true
      );
    END IF;
  END IF;

  RETURN _competition_id;
END;
$func$;

COMMENT ON FUNCTION public.generate_championship_knockout_for_competition(UUID, UUID, UUID) IS
  'Gera o mata-mata por competição com seeding LINEAR: slot k = seed_k × seed_(N+1-k). '
  'Guard geral: aguarda TODOS os grupos terminarem antes de gerar, independente de '
  'qualifiers_per_group ou should_complete_knockout_with_best_second_placed_teams. '
  'Para qualifiers_per_group=1 com should_complete=true: expande para a próxima chave '
  'e completa com melhores 2ºs. Chama create_championship_knockout_match_schedule para '
  'rounds > 1 quando ambos os times já são conhecidos na geração.';

NOTIFY pgrst, 'reload schema';
