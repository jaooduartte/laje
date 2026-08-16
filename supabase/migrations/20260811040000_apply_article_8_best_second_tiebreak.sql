-- Adequa a seleção de melhores segundos e terceiros ao Artigo 8º do Regulamento INTERLAJE 2026.
--
-- O Artigo 8º só se aplica quando a chave precisa ser completada por melhores
-- segundos ou terceiros e os grupos possuem quantidades diferentes de equipes. Nesse cenário,
-- a ordem é: pontos proporcionais, saldo de gols, gols marcados, menos amarelos,
-- menos vermelhos e sorteio manual.

CREATE OR REPLACE FUNCTION public.get_championship_bracket_competition_qualification_pool_rankings(
  _championship_id UUID,
  _competition_id UUID
)
RETURNS TABLE(
  competition_id UUID,
  team_id UUID,
  team_name TEXT,
  qualification_rank INTEGER,
  points BIGINT,
  wins BIGINT,
  goal_diff BIGINT,
  goals_for BIGINT,
  pool_rank INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  WITH competition_context AS (
    SELECT
      competitions_table.id,
      competitions_table.qualifiers_per_group,
      competitions_table.should_complete_knockout_with_best_second_placed_teams,
      competitions_table.sport_id,
      competitions_table.naipe,
      competitions_table.division,
      editions_table.season_year,
      COALESCE(championship_sports_table.points_win, 3) AS points_win,
      COALESCE(championship_sports_table.points_draw, 1) AS points_draw,
      COALESCE(championship_sports_table.points_loss, 0) AS points_loss,
      COALESCE(
        championship_sports_table.tie_breaker_rule,
        'STANDARD'::public.championship_sport_tie_breaker_rule
      ) AS tie_breaker_rule
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = competitions_table.bracket_edition_id
    LEFT JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = _championship_id
      AND championship_sports_table.sport_id = competitions_table.sport_id
    WHERE competitions_table.id = _competition_id
    LIMIT 1
  ),
  group_rankings AS (
    SELECT *
    FROM public.get_championship_bracket_competition_group_rankings(_championship_id, _competition_id)
  ),
  group_sizes AS (
    SELECT
      group_rankings.group_id,
      count(*)::integer AS group_size
    FROM group_rankings
    GROUP BY group_rankings.group_id
  ),
  group_size_range AS (
    SELECT
      min(group_sizes.group_size)::integer AS minimum_group_size,
      max(group_sizes.group_size)::integer AS maximum_group_size
    FROM group_sizes
  ),
  candidate_rows AS (
    SELECT
      group_rankings.competition_id,
      group_rankings.group_id,
      group_rankings.team_id,
      group_rankings.team_name,
      group_rankings.team_rank AS qualification_rank,
      group_rankings.points AS points_base,
      group_rankings.wins,
      group_rankings.goal_diff,
      group_rankings.goals_for,
      COALESCE(standings_table.yellow_cards, 0)::bigint AS yellow_cards,
      COALESCE(standings_table.red_cards, 0)::bigint AS red_cards,
      COALESCE(standings_table.blue_cards, 0)::bigint AS blue_cards,
      COALESCE(standings_table.two_minute_penalties, 0)::bigint AS two_minute_penalties,
      group_sizes.group_size,
      GREATEST(
        competition_context.points_win,
        competition_context.points_draw,
        competition_context.points_loss,
        1
      )::numeric AS maximum_points_per_match,
      (
        group_rankings.team_rank = CASE
          WHEN competition_context.qualifiers_per_group = 1 THEN 2
          ELSE 3
        END
        AND group_size_range.minimum_group_size IS DISTINCT FROM group_size_range.maximum_group_size
      ) AS uses_article_8_tiebreak
    FROM group_rankings
    JOIN group_sizes
      ON group_sizes.group_id = group_rankings.group_id
    CROSS JOIN competition_context
    CROSS JOIN group_size_range
    LEFT JOIN public.standings AS standings_table
      ON standings_table.championship_id = _championship_id
      AND standings_table.season_year = competition_context.season_year
      AND standings_table.sport_id = competition_context.sport_id
      AND standings_table.naipe = competition_context.naipe
      AND standings_table.division IS NOT DISTINCT FROM competition_context.division
      AND standings_table.team_id = group_rankings.team_id
    WHERE
      group_rankings.team_rank <= CASE
        WHEN competition_context.qualifiers_per_group = 1 THEN 2
        ELSE 3
      END
  ),
  scored_candidate_rows AS (
    SELECT
      candidate_rows.*,
      CASE
        WHEN candidate_rows.uses_article_8_tiebreak THEN
          candidate_rows.points_base::numeric
          / GREATEST(
            (candidate_rows.group_size - 1)::numeric * candidate_rows.maximum_points_per_match,
            1::numeric
          )
        ELSE NULL::numeric
      END AS proportional_points
    FROM candidate_rows
  ),
  pool_metric_tie_sets AS (
    SELECT
      scored_candidate_rows.qualification_rank,
      string_agg(scored_candidate_rows.team_id::text, '|' ORDER BY scored_candidate_rows.team_id::text) AS tied_team_signature,
      array_agg(scored_candidate_rows.team_id ORDER BY scored_candidate_rows.team_id::text) AS tied_team_ids
    FROM scored_candidate_rows
    CROSS JOIN competition_context
    GROUP BY
      scored_candidate_rows.qualification_rank,
      CASE
        WHEN scored_candidate_rows.uses_article_8_tiebreak
          THEN round(scored_candidate_rows.proportional_points, 12)
        ELSE scored_candidate_rows.points_base::numeric
      END,
      CASE
        WHEN scored_candidate_rows.uses_article_8_tiebreak THEN NULL::bigint
        WHEN competition_context.tie_breaker_rule IN (
          'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
          'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule,
          'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule,
          'STANDARD'::public.championship_sport_tie_breaker_rule
        ) THEN scored_candidate_rows.wins
        ELSE NULL::bigint
      END,
      scored_candidate_rows.goal_diff,
      scored_candidate_rows.goals_for,
      CASE
        WHEN scored_candidate_rows.uses_article_8_tiebreak THEN NULL::bigint
        WHEN competition_context.tie_breaker_rule = 'HANDEBOL'::public.championship_sport_tie_breaker_rule
          THEN scored_candidate_rows.blue_cards
        ELSE NULL::bigint
      END,
      CASE
        WHEN scored_candidate_rows.uses_article_8_tiebreak THEN NULL::bigint
        WHEN competition_context.tie_breaker_rule = 'HANDEBOL'::public.championship_sport_tie_breaker_rule
          THEN scored_candidate_rows.two_minute_penalties
        ELSE NULL::bigint
      END,
      CASE
        WHEN scored_candidate_rows.uses_article_8_tiebreak
          OR competition_context.tie_breaker_rule IN (
            'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
            'STANDARD'::public.championship_sport_tie_breaker_rule,
            'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule
          ) THEN scored_candidate_rows.yellow_cards
        ELSE NULL::bigint
      END,
      CASE
        WHEN scored_candidate_rows.uses_article_8_tiebreak
          OR competition_context.tie_breaker_rule IN (
            'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
            'STANDARD'::public.championship_sport_tie_breaker_rule,
            'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule
          ) THEN scored_candidate_rows.red_cards
        ELSE NULL::bigint
      END
    HAVING count(*) > 1
  ),
  pool_tie_context_members AS (
    SELECT
      pool_metric_tie_sets.qualification_rank,
      unnest(pool_metric_tie_sets.tied_team_ids) AS team_id,
      public.build_championship_bracket_tie_break_context_key(
        'QUALIFICATION_POOL'::public.championship_bracket_tie_break_context_type,
        _competition_id,
        NULL,
        pool_metric_tie_sets.qualification_rank,
        pool_metric_tie_sets.tied_team_signature
      ) AS context_key
    FROM pool_metric_tie_sets
  ),
  pool_tie_resolution_orders AS (
    SELECT
      pool_tie_context_members.qualification_rank,
      pool_tie_context_members.team_id,
      resolution_teams_table.draw_order
    FROM pool_tie_context_members
    LEFT JOIN public.championship_bracket_tie_break_resolutions AS resolutions_table
      ON resolutions_table.context_key = pool_tie_context_members.context_key
    LEFT JOIN public.championship_bracket_tie_break_resolution_teams AS resolution_teams_table
      ON resolution_teams_table.resolution_id = resolutions_table.id
      AND resolution_teams_table.team_id = pool_tie_context_members.team_id
  ),
  ranked_pool AS (
    SELECT
      scored_candidate_rows.competition_id,
      scored_candidate_rows.team_id,
      scored_candidate_rows.team_name,
      scored_candidate_rows.qualification_rank,
      scored_candidate_rows.points_base::bigint AS points,
      scored_candidate_rows.wins,
      scored_candidate_rows.goal_diff,
      scored_candidate_rows.goals_for,
      row_number() OVER (
        ORDER BY
          scored_candidate_rows.qualification_rank ASC,
          CASE
            WHEN scored_candidate_rows.uses_article_8_tiebreak
              THEN scored_candidate_rows.proportional_points
            ELSE scored_candidate_rows.points_base::numeric
          END DESC,
          CASE
            WHEN scored_candidate_rows.uses_article_8_tiebreak THEN NULL::bigint
            WHEN competition_context.tie_breaker_rule IN (
              'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
              'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule,
              'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule,
              'STANDARD'::public.championship_sport_tie_breaker_rule
            ) THEN scored_candidate_rows.wins
            ELSE NULL::bigint
          END DESC NULLS LAST,
          scored_candidate_rows.goal_diff DESC,
          scored_candidate_rows.goals_for DESC,
          CASE
            WHEN scored_candidate_rows.uses_article_8_tiebreak THEN NULL::bigint
            WHEN competition_context.tie_breaker_rule = 'HANDEBOL'::public.championship_sport_tie_breaker_rule
              THEN scored_candidate_rows.blue_cards
            ELSE NULL::bigint
          END ASC NULLS LAST,
          CASE
            WHEN scored_candidate_rows.uses_article_8_tiebreak THEN NULL::bigint
            WHEN competition_context.tie_breaker_rule = 'HANDEBOL'::public.championship_sport_tie_breaker_rule
              THEN scored_candidate_rows.two_minute_penalties
            ELSE NULL::bigint
          END ASC NULLS LAST,
          CASE
            WHEN scored_candidate_rows.uses_article_8_tiebreak
              OR competition_context.tie_breaker_rule IN (
                'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
                'STANDARD'::public.championship_sport_tie_breaker_rule,
                'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule
              ) THEN scored_candidate_rows.yellow_cards
            ELSE NULL::bigint
          END ASC NULLS LAST,
          CASE
            WHEN scored_candidate_rows.uses_article_8_tiebreak
              OR competition_context.tie_breaker_rule IN (
                'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
                'STANDARD'::public.championship_sport_tie_breaker_rule,
                'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule
              ) THEN scored_candidate_rows.red_cards
            ELSE NULL::bigint
          END ASC NULLS LAST,
          COALESCE(pool_tie_resolution_orders.draw_order, 2147483647) ASC,
          scored_candidate_rows.team_name ASC
      ) AS pool_rank
    FROM scored_candidate_rows
    CROSS JOIN competition_context
    LEFT JOIN pool_tie_resolution_orders
      ON pool_tie_resolution_orders.qualification_rank = scored_candidate_rows.qualification_rank
      AND pool_tie_resolution_orders.team_id = scored_candidate_rows.team_id
  )
  SELECT
    ranked_pool.competition_id,
    ranked_pool.team_id,
    ranked_pool.team_name,
    ranked_pool.qualification_rank,
    ranked_pool.points,
    ranked_pool.wins,
    ranked_pool.goal_diff,
    ranked_pool.goals_for,
    ranked_pool.pool_rank
  FROM ranked_pool
  ORDER BY ranked_pool.pool_rank ASC, ranked_pool.team_name ASC;
$func$;

COMMENT ON FUNCTION public.get_championship_bracket_competition_qualification_pool_rankings(UUID, UUID) IS
  'Classifica candidatos entre grupos para o chaveamento. Para melhores segundos ou terceiros de grupos com tamanhos diferentes, aplica o Artigo 8º do Regulamento INTERLAJE 2026: pontos proporcionais, saldo de gols, gols marcados, menos amarelos, menos vermelhos e sorteio.';
