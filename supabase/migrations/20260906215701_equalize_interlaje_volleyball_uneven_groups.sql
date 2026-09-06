DO $func$
DECLARE
  function_definition TEXT;
  home_points_case CONSTANT TEXT := $case$
      CASE
        WHEN matches_table.home_score > matches_table.away_score THEN (SELECT points_win FROM competition_context)
        WHEN matches_table.home_score = matches_table.away_score THEN (SELECT points_draw FROM competition_context)
        ELSE (SELECT points_loss FROM competition_context)
      END::bigint AS points,$case$;
  away_points_case CONSTANT TEXT := $case$
      CASE
        WHEN matches_table.away_score > matches_table.home_score THEN (SELECT points_win FROM competition_context)
        WHEN matches_table.away_score = matches_table.home_score THEN (SELECT points_draw FROM competition_context)
        ELSE (SELECT points_loss FROM competition_context)
      END::bigint AS points,$case$;
  interlaje_home_points_case CONSTANT TEXT := $case$
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.championship_bracket_competitions AS competitions_table
          JOIN public.championships AS championships_table
            ON championships_table.id = _championship_id
          JOIN public.sports AS sports_table
            ON sports_table.id = competitions_table.sport_id
          WHERE competitions_table.id = _competition_id
            AND championships_table.code = 'INTERLAJE'::public.championship_code
            AND public.normalize_sport_name(sports_table.name) = 'voleibol'
        ) THEN CASE
          WHEN matches_table.home_score = 2 AND matches_table.away_score = 0 THEN 3
          WHEN matches_table.home_score = 2 AND matches_table.away_score = 1 THEN 2
          WHEN matches_table.home_score = 1 AND matches_table.away_score = 2 THEN 1
          ELSE 0
        END
        WHEN matches_table.home_score > matches_table.away_score THEN (SELECT points_win FROM competition_context)
        WHEN matches_table.home_score = matches_table.away_score THEN (SELECT points_draw FROM competition_context)
        ELSE (SELECT points_loss FROM competition_context)
      END::bigint AS points,$case$;
  interlaje_away_points_case CONSTANT TEXT := $case$
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.championship_bracket_competitions AS competitions_table
          JOIN public.championships AS championships_table
            ON championships_table.id = _championship_id
          JOIN public.sports AS sports_table
            ON sports_table.id = competitions_table.sport_id
          WHERE competitions_table.id = _competition_id
            AND championships_table.code = 'INTERLAJE'::public.championship_code
            AND public.normalize_sport_name(sports_table.name) = 'voleibol'
        ) THEN CASE
          WHEN matches_table.home_score = 0 AND matches_table.away_score = 2 THEN 3
          WHEN matches_table.home_score = 1 AND matches_table.away_score = 2 THEN 2
          WHEN matches_table.home_score = 2 AND matches_table.away_score = 1 THEN 1
          ELSE 0
        END
        WHEN matches_table.away_score > matches_table.home_score THEN (SELECT points_win FROM competition_context)
        WHEN matches_table.away_score = matches_table.home_score THEN (SELECT points_draw FROM competition_context)
        ELSE (SELECT points_loss FROM competition_context)
      END::bigint AS points,$case$;
BEGIN
  SELECT pg_get_functiondef(functions_table.oid)
  INTO function_definition
  FROM pg_proc AS functions_table
  JOIN pg_namespace AS namespaces_table
    ON namespaces_table.oid = functions_table.pronamespace
  WHERE namespaces_table.nspname = 'public'
    AND functions_table.proname = 'get_championship_bracket_competition_group_rankings'
    AND pg_get_function_identity_arguments(functions_table.oid) =
      '_championship_id uuid, _competition_id uuid';

  IF function_definition IS NULL
    OR position(home_points_case IN function_definition) = 0
    OR position(away_points_case IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Função de classificação por grupo não possui os cálculos esperados.';
  END IF;

  EXECUTE replace(
    replace(function_definition, home_points_case, interlaje_home_points_case),
    away_points_case,
    interlaje_away_points_case
  );
END;
$func$;

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
      championships_table.code AS championship_code,
      public.normalize_sport_name(sports_table.name) AS normalized_sport_name,
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
    JOIN public.championships AS championships_table
      ON championships_table.id = _championship_id
    JOIN public.sports AS sports_table
      ON sports_table.id = competitions_table.sport_id
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
    SELECT group_rankings.group_id, count(*)::integer AS group_size
    FROM group_rankings
    GROUP BY group_rankings.group_id
  ),
  group_size_range AS (
    SELECT
      min(group_sizes.group_size)::integer AS minimum_group_size,
      max(group_sizes.group_size)::integer AS maximum_group_size
    FROM group_sizes
  ),
  match_set_totals AS (
    SELECT
      match_sets_table.match_id,
      COUNT(*) FILTER (WHERE match_sets_table.home_points > match_sets_table.away_points)::bigint AS home_sets_for,
      COUNT(*) FILTER (WHERE match_sets_table.home_points < match_sets_table.away_points)::bigint AS home_sets_against,
      COALESCE(SUM(match_sets_table.home_points), 0)::bigint AS home_rally_points_for,
      COALESCE(SUM(match_sets_table.away_points), 0)::bigint AS home_rally_points_against
    FROM public.match_sets AS match_sets_table
    GROUP BY match_sets_table.match_id
  ),
  group_match_metrics AS (
    SELECT
      bracket_matches_table.group_id,
      matches_table.home_team_id AS team_id,
      COALESCE(match_set_totals.home_sets_for, 0)::bigint AS sets_for,
      COALESCE(match_set_totals.home_sets_against, 0)::bigint AS sets_against,
      COALESCE(match_set_totals.home_rally_points_for, 0)::bigint AS rally_points_for,
      COALESCE(match_set_totals.home_rally_points_against, 0)::bigint AS rally_points_against,
      GREATEST(0, COALESCE(matches_table.home_red_cards, 0))::bigint AS red_cards,
      GREATEST(0, COALESCE(matches_table.home_yellow_cards, 0))::bigint AS yellow_cards
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    LEFT JOIN match_set_totals
      ON match_set_totals.match_id = matches_table.id
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
      AND matches_table.status = 'FINISHED'::public.match_status
      AND COALESCE(matches_table.is_double_walkover, false) = false
    UNION ALL
    SELECT
      bracket_matches_table.group_id,
      matches_table.away_team_id,
      COALESCE(match_set_totals.home_sets_against, 0)::bigint,
      COALESCE(match_set_totals.home_sets_for, 0)::bigint,
      COALESCE(match_set_totals.home_rally_points_against, 0)::bigint,
      COALESCE(match_set_totals.home_rally_points_for, 0)::bigint,
      GREATEST(0, COALESCE(matches_table.away_red_cards, 0))::bigint,
      GREATEST(0, COALESCE(matches_table.away_yellow_cards, 0))::bigint
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    LEFT JOIN match_set_totals
      ON match_set_totals.match_id = matches_table.id
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
      AND matches_table.status = 'FINISHED'::public.match_status
      AND COALESCE(matches_table.is_double_walkover, false) = false
  ),
  group_team_metrics AS (
    SELECT
      group_match_metrics.group_id,
      group_match_metrics.team_id,
      COALESCE(SUM(group_match_metrics.sets_for), 0)::bigint AS sets_for,
      COALESCE(SUM(group_match_metrics.sets_against), 0)::bigint AS sets_against,
      COALESCE(SUM(group_match_metrics.rally_points_for), 0)::bigint AS rally_points_for,
      COALESCE(SUM(group_match_metrics.rally_points_against), 0)::bigint AS rally_points_against,
      COALESCE(SUM(group_match_metrics.red_cards), 0)::bigint AS red_cards,
      COALESCE(SUM(group_match_metrics.yellow_cards), 0)::bigint AS yellow_cards
    FROM group_match_metrics
    GROUP BY group_match_metrics.group_id, group_match_metrics.team_id
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
      CASE
        WHEN competition_context.championship_code = 'INTERLAJE'::public.championship_code
          AND competition_context.normalized_sport_name = 'voleibol'
        THEN COALESCE(group_team_metrics.yellow_cards, 0)::bigint
        ELSE COALESCE(standings_table.yellow_cards, 0)::bigint
      END AS yellow_cards,
      CASE
        WHEN competition_context.championship_code = 'INTERLAJE'::public.championship_code
          AND competition_context.normalized_sport_name = 'voleibol'
        THEN COALESCE(group_team_metrics.red_cards, 0)::bigint
        ELSE COALESCE(standings_table.red_cards, 0)::bigint
      END AS red_cards,
      COALESCE(standings_table.blue_cards, 0)::bigint AS blue_cards,
      COALESCE(standings_table.two_minute_penalties, 0)::bigint AS two_minute_penalties,
      COALESCE(group_team_metrics.sets_for, 0)::bigint AS sets_for,
      COALESCE(group_team_metrics.sets_against, 0)::bigint AS sets_against,
      COALESCE(group_team_metrics.rally_points_for, 0)::bigint AS rally_points_for,
      COALESCE(group_team_metrics.rally_points_against, 0)::bigint AS rally_points_against,
      group_sizes.group_size,
      GREATEST(
        competition_context.points_win,
        competition_context.points_draw,
        competition_context.points_loss,
        1
      )::numeric AS maximum_points_per_match,
      competition_context.championship_code = 'INTERLAJE'::public.championship_code
        AND competition_context.normalized_sport_name = 'voleibol' AS is_interlaje_volleyball,
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
    LEFT JOIN group_team_metrics
      ON group_team_metrics.group_id = group_rankings.group_id
      AND group_team_metrics.team_id = group_rankings.team_id
    LEFT JOIN public.standings AS standings_table
      ON standings_table.championship_id = _championship_id
      AND standings_table.season_year = competition_context.season_year
      AND standings_table.sport_id = competition_context.sport_id
      AND standings_table.naipe = competition_context.naipe
      AND standings_table.division IS NOT DISTINCT FROM competition_context.division
      AND standings_table.team_id = group_rankings.team_id
    WHERE group_rankings.team_rank <= CASE
      WHEN competition_context.qualifiers_per_group = 1 THEN 2
      ELSE 3
    END
  ),
  scored_candidate_rows AS (
    SELECT
      candidate_rows.*,
      CASE
        WHEN candidate_rows.uses_article_8_tiebreak THEN candidate_rows.points_base::numeric
          / GREATEST(
            (candidate_rows.group_size - 1)::numeric * candidate_rows.maximum_points_per_match,
            1::numeric
          )
        ELSE NULL::numeric
      END AS proportional_points,
      CASE
        WHEN candidate_rows.is_interlaje_volleyball
          AND candidate_rows.uses_article_8_tiebreak
          AND candidate_rows.sets_against = 0
          AND candidate_rows.sets_for > 0 THEN 1000000000::numeric
        WHEN candidate_rows.is_interlaje_volleyball
          AND candidate_rows.uses_article_8_tiebreak
          AND candidate_rows.sets_against = 0 THEN 0::numeric
        WHEN candidate_rows.is_interlaje_volleyball
          AND candidate_rows.uses_article_8_tiebreak
          THEN candidate_rows.sets_for::numeric / candidate_rows.sets_against
        ELSE NULL::numeric
      END AS sets_average,
      candidate_rows.sets_for::numeric / GREATEST((candidate_rows.group_size - 1)::numeric, 1::numeric) AS sets_for_per_match,
      candidate_rows.sets_against::numeric / GREATEST((candidate_rows.group_size - 1)::numeric, 1::numeric) AS sets_against_per_match,
      candidate_rows.rally_points_for::numeric / GREATEST((candidate_rows.group_size - 1)::numeric, 1::numeric) AS rally_points_for_per_match,
      candidate_rows.rally_points_against::numeric / GREATEST((candidate_rows.group_size - 1)::numeric, 1::numeric) AS rally_points_against_per_match,
      candidate_rows.red_cards::numeric / GREATEST((candidate_rows.group_size - 1)::numeric, 1::numeric) AS red_cards_per_match,
      candidate_rows.yellow_cards::numeric / GREATEST((candidate_rows.group_size - 1)::numeric, 1::numeric) AS yellow_cards_per_match
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
      CASE WHEN scored_candidate_rows.uses_article_8_tiebreak THEN round(scored_candidate_rows.proportional_points, 12) ELSE scored_candidate_rows.points_base::numeric END,
      CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN round(scored_candidate_rows.sets_average, 12) ELSE NULL::numeric END,
      CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN round(scored_candidate_rows.sets_for_per_match, 12) ELSE NULL::numeric END,
      CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN round(scored_candidate_rows.rally_points_for_per_match, 12) ELSE NULL::numeric END,
      CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN round(scored_candidate_rows.sets_against_per_match, 12) ELSE NULL::numeric END,
      CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN round(scored_candidate_rows.rally_points_against_per_match, 12) ELSE NULL::numeric END,
      CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN round(scored_candidate_rows.red_cards_per_match, 12) ELSE NULL::numeric END,
      CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN round(scored_candidate_rows.yellow_cards_per_match, 12) ELSE NULL::numeric END,
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
      CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN NULL::bigint ELSE scored_candidate_rows.goal_diff END,
      CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN NULL::bigint ELSE scored_candidate_rows.goals_for END,
      CASE WHEN scored_candidate_rows.uses_article_8_tiebreak THEN NULL::bigint WHEN competition_context.tie_breaker_rule = 'HANDEBOL'::public.championship_sport_tie_breaker_rule THEN scored_candidate_rows.blue_cards ELSE NULL::bigint END,
      CASE WHEN scored_candidate_rows.uses_article_8_tiebreak THEN NULL::bigint WHEN competition_context.tie_breaker_rule = 'HANDEBOL'::public.championship_sport_tie_breaker_rule THEN scored_candidate_rows.two_minute_penalties ELSE NULL::bigint END,
      CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN NULL::bigint WHEN scored_candidate_rows.uses_article_8_tiebreak OR competition_context.tie_breaker_rule IN ('BEACH_SOCCER'::public.championship_sport_tie_breaker_rule, 'STANDARD'::public.championship_sport_tie_breaker_rule, 'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule) THEN scored_candidate_rows.yellow_cards ELSE NULL::bigint END,
      CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN NULL::bigint WHEN scored_candidate_rows.uses_article_8_tiebreak OR competition_context.tie_breaker_rule IN ('BEACH_SOCCER'::public.championship_sport_tie_breaker_rule, 'STANDARD'::public.championship_sport_tie_breaker_rule, 'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule) THEN scored_candidate_rows.red_cards ELSE NULL::bigint END
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
          CASE WHEN scored_candidate_rows.uses_article_8_tiebreak THEN scored_candidate_rows.proportional_points ELSE scored_candidate_rows.points_base::numeric END DESC,
          CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN scored_candidate_rows.sets_average ELSE NULL::numeric END DESC NULLS LAST,
          CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN scored_candidate_rows.sets_for_per_match ELSE NULL::numeric END DESC NULLS LAST,
          CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN scored_candidate_rows.rally_points_for_per_match ELSE NULL::numeric END DESC NULLS LAST,
          CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN scored_candidate_rows.sets_against_per_match ELSE NULL::numeric END ASC NULLS LAST,
          CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN scored_candidate_rows.rally_points_against_per_match ELSE NULL::numeric END ASC NULLS LAST,
          CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN scored_candidate_rows.red_cards_per_match ELSE NULL::numeric END ASC NULLS LAST,
          CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN scored_candidate_rows.yellow_cards_per_match ELSE NULL::numeric END ASC NULLS LAST,
          CASE WHEN scored_candidate_rows.uses_article_8_tiebreak THEN NULL::bigint WHEN competition_context.tie_breaker_rule IN ('BEACH_SOCCER'::public.championship_sport_tie_breaker_rule, 'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule, 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule, 'STANDARD'::public.championship_sport_tie_breaker_rule) THEN scored_candidate_rows.wins ELSE NULL::bigint END DESC NULLS LAST,
          CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN NULL::bigint ELSE scored_candidate_rows.goal_diff END DESC,
          CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN NULL::bigint ELSE scored_candidate_rows.goals_for END DESC,
          CASE WHEN scored_candidate_rows.uses_article_8_tiebreak THEN NULL::bigint WHEN competition_context.tie_breaker_rule = 'HANDEBOL'::public.championship_sport_tie_breaker_rule THEN scored_candidate_rows.blue_cards ELSE NULL::bigint END ASC NULLS LAST,
          CASE WHEN scored_candidate_rows.uses_article_8_tiebreak THEN NULL::bigint WHEN competition_context.tie_breaker_rule = 'HANDEBOL'::public.championship_sport_tie_breaker_rule THEN scored_candidate_rows.two_minute_penalties ELSE NULL::bigint END ASC NULLS LAST,
          CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN NULL::bigint WHEN scored_candidate_rows.uses_article_8_tiebreak OR competition_context.tie_breaker_rule IN ('BEACH_SOCCER'::public.championship_sport_tie_breaker_rule, 'STANDARD'::public.championship_sport_tie_breaker_rule, 'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule) THEN scored_candidate_rows.yellow_cards ELSE NULL::bigint END ASC NULLS LAST,
          CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN NULL::bigint WHEN scored_candidate_rows.uses_article_8_tiebreak OR competition_context.tie_breaker_rule IN ('BEACH_SOCCER'::public.championship_sport_tie_breaker_rule, 'STANDARD'::public.championship_sport_tie_breaker_rule, 'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule) THEN scored_candidate_rows.red_cards ELSE NULL::bigint END ASC NULLS LAST,
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

CREATE OR REPLACE FUNCTION public.get_interlaje_collective_ranking(
  _championship_id UUID,
  _season_year INTEGER,
  _sport_id UUID,
  _naipe public.match_naipe,
  _division public.team_division DEFAULT NULL
)
RETURNS TABLE(
  team_id UUID,
  team_name TEXT,
  division public.team_division,
  played INTEGER,
  wins INTEGER,
  draws INTEGER,
  losses INTEGER,
  goals_for INTEGER,
  goals_against INTEGER,
  goal_diff INTEGER,
  points NUMERIC,
  yellow_cards INTEGER,
  red_cards INTEGER,
  blue_cards INTEGER,
  two_minute_penalties INTEGER,
  sets_for INTEGER,
  sets_against INTEGER,
  rally_points_for INTEGER,
  rally_points_against INTEGER,
  classification_rank INTEGER,
  has_pending_tie_break BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  WITH policy AS (
    SELECT public.get_interlaje_classification_policy(_championship_id, _sport_id) AS value
  ), group_sizes AS (
    SELECT
      groups_table.id AS group_id,
      count(*)::integer AS group_size
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = competitions_table.bracket_edition_id
    JOIN public.championship_bracket_groups AS groups_table
      ON groups_table.competition_id = competitions_table.id
    JOIN public.championship_bracket_group_teams AS group_teams_table
      ON group_teams_table.group_id = groups_table.id
    WHERE editions_table.championship_id = _championship_id
      AND editions_table.season_year = _season_year
      AND competitions_table.sport_id = _sport_id
      AND competitions_table.naipe = _naipe
      AND competitions_table.division IS NOT DISTINCT FROM _division
    GROUP BY groups_table.id
  ), group_size_range AS (
    SELECT
      min(group_sizes.group_size)::integer AS minimum_group_size,
      max(group_sizes.group_size)::integer AS maximum_group_size
    FROM group_sizes
  ), group_context AS (
    SELECT
      group_teams_table.team_id,
      groups_table.id AS group_id,
      GREATEST(group_sizes.group_size - 1, 1)::numeric AS expected_matches,
      group_size_range.minimum_group_size IS DISTINCT FROM group_size_range.maximum_group_size AS has_uneven_groups
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = competitions_table.bracket_edition_id
    JOIN public.championship_bracket_groups AS groups_table
      ON groups_table.competition_id = competitions_table.id
    JOIN public.championship_bracket_group_teams AS group_teams_table
      ON group_teams_table.group_id = groups_table.id
    JOIN group_sizes
      ON group_sizes.group_id = groups_table.id
    CROSS JOIN group_size_range
    WHERE editions_table.championship_id = _championship_id
      AND editions_table.season_year = _season_year
      AND competitions_table.sport_id = _sport_id
      AND competitions_table.naipe = _naipe
      AND competitions_table.division IS NOT DISTINCT FROM _division
  ), effective AS (
    SELECT
      standings_table.team_id,
      standings_table.team_name,
      standings_table.division,
      standings_table.played,
      standings_table.wins,
      standings_table.draws,
      standings_table.losses,
      standings_table.goals_for,
      standings_table.goals_against,
      standings_table.goal_diff,
      standings_table.points,
      standings_table.yellow_cards,
      standings_table.red_cards,
      COALESCE(source_standings.blue_cards, 0) AS blue_cards,
      COALESCE(source_standings.two_minute_penalties, 0) AS two_minute_penalties
    FROM public.get_championship_effective_standings(
      _championship_id,
      _season_year,
      _division::text,
      _naipe,
      _sport_id
    ) AS standings_table
    LEFT JOIN public.standings AS source_standings
      ON source_standings.championship_id = _championship_id
      AND source_standings.season_year = _season_year
      AND source_standings.sport_id = _sport_id
      AND source_standings.naipe = _naipe
      AND source_standings.division IS NOT DISTINCT FROM standings_table.division
      AND source_standings.team_id = standings_table.team_id
  ), volleyball_metrics AS (
    SELECT
      participant.team_id,
      COALESCE(SUM(participant.sets_for), 0)::integer AS sets_for,
      COALESCE(SUM(participant.sets_against), 0)::integer AS sets_against,
      COALESCE(SUM(participant.rally_points_for), 0)::integer AS rally_points_for,
      COALESCE(SUM(participant.rally_points_against), 0)::integer AS rally_points_against
    FROM (
      SELECT
        matches_table.home_team_id AS team_id,
        COUNT(*) FILTER (WHERE match_sets_table.home_points > match_sets_table.away_points)::integer AS sets_for,
        COUNT(*) FILTER (WHERE match_sets_table.home_points < match_sets_table.away_points)::integer AS sets_against,
        COALESCE(SUM(match_sets_table.home_points), 0)::integer AS rally_points_for,
        COALESCE(SUM(match_sets_table.away_points), 0)::integer AS rally_points_against
      FROM public.matches AS matches_table
      LEFT JOIN public.match_sets AS match_sets_table ON match_sets_table.match_id = matches_table.id
      WHERE matches_table.championship_id = _championship_id
        AND matches_table.season_year = _season_year
        AND matches_table.sport_id = _sport_id
        AND matches_table.naipe = _naipe
        AND matches_table.division IS NOT DISTINCT FROM _division
        AND matches_table.status = 'FINISHED'::public.match_status
        AND COALESCE(matches_table.is_double_walkover, false) = false
      GROUP BY matches_table.home_team_id
      UNION ALL
      SELECT
        matches_table.away_team_id,
        COUNT(*) FILTER (WHERE match_sets_table.away_points > match_sets_table.home_points)::integer,
        COUNT(*) FILTER (WHERE match_sets_table.away_points < match_sets_table.home_points)::integer,
        COALESCE(SUM(match_sets_table.away_points), 0)::integer,
        COALESCE(SUM(match_sets_table.home_points), 0)::integer
      FROM public.matches AS matches_table
      LEFT JOIN public.match_sets AS match_sets_table ON match_sets_table.match_id = matches_table.id
      WHERE matches_table.championship_id = _championship_id
        AND matches_table.season_year = _season_year
        AND matches_table.sport_id = _sport_id
        AND matches_table.naipe = _naipe
        AND matches_table.division IS NOT DISTINCT FROM _division
        AND matches_table.status = 'FINISHED'::public.match_status
        AND COALESCE(matches_table.is_double_walkover, false) = false
      GROUP BY matches_table.away_team_id
    ) AS participant
    GROUP BY participant.team_id
  ), metrics AS (
    SELECT
      effective.*,
      COALESCE(volleyball_metrics.sets_for, 0) AS sets_for,
      COALESCE(volleyball_metrics.sets_against, 0) AS sets_against,
      COALESCE(volleyball_metrics.rally_points_for, 0) AS rally_points_for,
      COALESCE(volleyball_metrics.rally_points_against, 0) AS rally_points_against,
      CASE
        WHEN effective.goals_against = 0 AND effective.goals_for > 0 THEN 1000000000::numeric
        WHEN effective.goals_against = 0 THEN 0::numeric
        ELSE effective.goals_for::numeric / effective.goals_against
      END AS points_average
    FROM effective
    LEFT JOIN volleyball_metrics ON volleyball_metrics.team_id = effective.team_id
  ), prepared AS (
    SELECT
      metrics.*,
      group_context.group_id,
      COALESCE(group_context.expected_matches, 1::numeric) AS expected_matches,
      COALESCE(group_context.has_uneven_groups, false) AS has_uneven_groups,
      CASE
        WHEN metrics.sets_against = 0 AND metrics.sets_for > 0 THEN 1000000000::numeric
        WHEN metrics.sets_against = 0 THEN 0::numeric
        ELSE metrics.sets_for::numeric / metrics.sets_against
      END AS sets_average,
      public.normalize_sport_name(sports_table.name) AS sport_name
    FROM metrics
    JOIN public.sports AS sports_table ON sports_table.id = _sport_id
    LEFT JOIN group_context ON group_context.team_id = metrics.team_id
  ), comparison_metrics AS (
    SELECT
      prepared.*,
      CASE
        WHEN prepared.sport_name = 'voleibol' AND prepared.has_uneven_groups
          THEN prepared.points / (prepared.expected_matches * 3::numeric)
        ELSE prepared.points
      END AS comparison_points,
      prepared.sets_for::numeric / prepared.expected_matches AS sets_for_per_match,
      prepared.sets_against::numeric / prepared.expected_matches AS sets_against_per_match,
      prepared.rally_points_for::numeric / prepared.expected_matches AS rally_points_for_per_match,
      prepared.rally_points_against::numeric / prepared.expected_matches AS rally_points_against_per_match,
      prepared.red_cards::numeric / prepared.expected_matches AS red_cards_per_match,
      prepared.yellow_cards::numeric / prepared.expected_matches AS yellow_cards_per_match
    FROM prepared
  ), h2h_scope AS (
    SELECT
      comparison_metrics.*,
      COUNT(*) OVER (
        PARTITION BY
          CASE WHEN comparison_metrics.sport_name = 'voleibol' AND comparison_metrics.has_uneven_groups THEN comparison_metrics.group_id END,
          comparison_metrics.comparison_points,
          CASE WHEN comparison_metrics.sport_name = 'basquetebol' THEN comparison_metrics.points_average WHEN comparison_metrics.sport_name = 'voleibol' THEN comparison_metrics.sets_average ELSE 0 END
      ) AS h2h_candidate_count
    FROM comparison_metrics
  ), h2h AS (
    SELECT
      h2h_scope.*,
      COALESCE((
        SELECT SUM(CASE
          WHEN matches_table.home_team_id = h2h_scope.team_id AND matches_table.home_score > matches_table.away_score THEN 3
          WHEN matches_table.away_team_id = h2h_scope.team_id AND matches_table.away_score > matches_table.home_score THEN 3
          WHEN matches_table.home_score = matches_table.away_score THEN 1
          ELSE 0
        END)
        FROM public.matches AS matches_table
        WHERE matches_table.championship_id = _championship_id
          AND matches_table.season_year = _season_year
          AND matches_table.sport_id = _sport_id
          AND matches_table.naipe = _naipe
          AND matches_table.division IS NOT DISTINCT FROM _division
          AND matches_table.status = 'FINISHED'::public.match_status
          AND COALESCE(matches_table.is_double_walkover, false) = false
          AND (matches_table.home_team_id = h2h_scope.team_id OR matches_table.away_team_id = h2h_scope.team_id)
          AND (matches_table.home_team_id = counterpart.team_id OR matches_table.away_team_id = counterpart.team_id)
      ), 0)::numeric AS head_to_head_points
    FROM h2h_scope
    LEFT JOIN h2h_scope AS counterpart
      ON counterpart.team_id <> h2h_scope.team_id
      AND counterpart.comparison_points = h2h_scope.comparison_points
      AND (
        (h2h_scope.sport_name = 'basquetebol' AND counterpart.points_average = h2h_scope.points_average)
        OR (h2h_scope.sport_name = 'voleibol' AND counterpart.sets_average = h2h_scope.sets_average)
        OR (h2h_scope.sport_name NOT IN ('basquetebol', 'voleibol'))
      )
      AND (
        h2h_scope.sport_name <> 'voleibol'
        OR NOT h2h_scope.has_uneven_groups
        OR counterpart.group_id IS NOT DISTINCT FROM h2h_scope.group_id
      )
      AND h2h_scope.h2h_candidate_count = 2
  ), ordered AS (
    SELECT
      h2h.*,
      COALESCE(resolutions_table.draw_order, 2147483647) AS draw_order,
      ROW_NUMBER() OVER (
        ORDER BY
          h2h.comparison_points DESC,
          CASE WHEN h2h.sport_name = 'basquetebol' THEN h2h.points_average END DESC NULLS LAST,
          CASE WHEN h2h.sport_name = 'voleibol' THEN h2h.sets_average END DESC NULLS LAST,
          CASE WHEN h2h.h2h_candidate_count = 2 THEN h2h.head_to_head_points END DESC NULLS LAST,
          CASE WHEN h2h.sport_name IN ('futsal', 'handebol') THEN h2h.goal_diff WHEN h2h.sport_name = 'basquetebol' THEN h2h.goal_diff END DESC NULLS LAST,
          CASE WHEN h2h.sport_name = 'futsal' THEN h2h.goals_for WHEN h2h.sport_name = 'basquetebol' THEN h2h.goals_for END DESC NULLS LAST,
          CASE WHEN h2h.sport_name = 'handebol' THEN h2h.goals_against WHEN h2h.sport_name = 'basquetebol' THEN h2h.goals_against END ASC NULLS LAST,
          CASE WHEN h2h.sport_name = 'handebol' THEN h2h.blue_cards END ASC NULLS LAST,
          CASE WHEN h2h.sport_name = 'voleibol' AND h2h.has_uneven_groups THEN h2h.sets_for_per_match WHEN h2h.sport_name = 'voleibol' THEN h2h.sets_for END DESC NULLS LAST,
          CASE WHEN h2h.sport_name = 'voleibol' AND h2h.has_uneven_groups THEN h2h.rally_points_for_per_match WHEN h2h.sport_name = 'voleibol' THEN h2h.rally_points_for END DESC NULLS LAST,
          CASE WHEN h2h.sport_name = 'voleibol' AND h2h.has_uneven_groups THEN h2h.sets_against_per_match WHEN h2h.sport_name = 'voleibol' THEN h2h.sets_against END ASC NULLS LAST,
          CASE WHEN h2h.sport_name = 'voleibol' AND h2h.has_uneven_groups THEN h2h.rally_points_against_per_match WHEN h2h.sport_name = 'voleibol' THEN h2h.rally_points_against END ASC NULLS LAST,
          CASE WHEN h2h.sport_name = 'voleibol' AND h2h.has_uneven_groups THEN h2h.red_cards_per_match WHEN h2h.sport_name IN ('basquetebol', 'futsal', 'handebol', 'voleibol') THEN h2h.red_cards END ASC NULLS LAST,
          CASE WHEN h2h.sport_name = 'voleibol' AND h2h.has_uneven_groups THEN h2h.yellow_cards_per_match WHEN h2h.sport_name IN ('futsal', 'handebol', 'voleibol') THEN h2h.yellow_cards END ASC NULLS LAST,
          CASE WHEN h2h.sport_name = 'handebol' THEN h2h.two_minute_penalties END ASC NULLS LAST,
          COALESCE(resolutions_table.draw_order, 2147483647) ASC,
          h2h.team_id ASC
      )::integer AS classification_rank,
      COUNT(*) OVER (
        PARTITION BY
          h2h.comparison_points,
          CASE WHEN h2h.sport_name = 'basquetebol' THEN h2h.points_average END,
          CASE WHEN h2h.sport_name = 'voleibol' THEN h2h.sets_average END,
          CASE WHEN h2h.h2h_candidate_count = 2 THEN h2h.head_to_head_points END,
          CASE WHEN h2h.sport_name IN ('futsal', 'handebol', 'basquetebol') THEN h2h.goal_diff END,
          CASE WHEN h2h.sport_name IN ('futsal', 'basquetebol') THEN h2h.goals_for END,
          CASE WHEN h2h.sport_name IN ('handebol', 'basquetebol') THEN h2h.goals_against END,
          CASE WHEN h2h.sport_name = 'handebol' THEN h2h.blue_cards END,
          CASE WHEN h2h.sport_name = 'voleibol' AND h2h.has_uneven_groups THEN h2h.sets_for_per_match WHEN h2h.sport_name = 'voleibol' THEN h2h.sets_for END,
          CASE WHEN h2h.sport_name = 'voleibol' AND h2h.has_uneven_groups THEN h2h.rally_points_for_per_match WHEN h2h.sport_name = 'voleibol' THEN h2h.rally_points_for END,
          CASE WHEN h2h.sport_name = 'voleibol' AND h2h.has_uneven_groups THEN h2h.sets_against_per_match WHEN h2h.sport_name = 'voleibol' THEN h2h.sets_against END,
          CASE WHEN h2h.sport_name = 'voleibol' AND h2h.has_uneven_groups THEN h2h.rally_points_against_per_match WHEN h2h.sport_name = 'voleibol' THEN h2h.rally_points_against END,
          CASE WHEN h2h.sport_name = 'voleibol' AND h2h.has_uneven_groups THEN h2h.red_cards_per_match WHEN h2h.sport_name IN ('basquetebol', 'futsal', 'handebol', 'voleibol') THEN h2h.red_cards END,
          CASE WHEN h2h.sport_name = 'voleibol' AND h2h.has_uneven_groups THEN h2h.yellow_cards_per_match WHEN h2h.sport_name IN ('futsal', 'handebol', 'voleibol') THEN h2h.yellow_cards END,
          CASE WHEN h2h.sport_name = 'handebol' THEN h2h.two_minute_penalties END
      ) AS unresolved_count
    FROM h2h
    LEFT JOIN public.championship_interlaje_tie_break_resolutions AS resolutions_table
      ON resolutions_table.championship_id = _championship_id
      AND resolutions_table.season_year = _season_year
      AND resolutions_table.sport_id = _sport_id
      AND resolutions_table.naipe = _naipe
      AND resolutions_table.division IS NOT DISTINCT FROM _division
      AND resolutions_table.group_id IS NULL
      AND resolutions_table.team_id = h2h.team_id
  )
  SELECT
    ordered.team_id, ordered.team_name, ordered.division, ordered.played, ordered.wins,
    ordered.draws, ordered.losses, ordered.goals_for, ordered.goals_against,
    ordered.goal_diff, ordered.points, ordered.yellow_cards, ordered.red_cards,
    ordered.blue_cards, ordered.two_minute_penalties, ordered.sets_for,
    ordered.sets_against, ordered.rally_points_for, ordered.rally_points_against,
    ordered.classification_rank,
    ordered.unresolved_count > 1 AND ordered.draw_order = 2147483647
  FROM ordered
  ORDER BY ordered.classification_rank;
$func$;

GRANT EXECUTE ON FUNCTION public.get_championship_bracket_competition_qualification_pool_rankings(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_interlaje_collective_ranking(UUID, INTEGER, UUID, public.match_naipe, public.team_division) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
