DO $clone$
DECLARE
  function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.get_championship_bracket_competition_qualification_pool_ranking(uuid,uuid)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL
    OR position(
      'public.get_championship_bracket_competition_qualification_pool_ranking'
      IN function_definition
    ) = 0 THEN
    RAISE EXCEPTION 'A função de classificação do mata-mata não possui a estrutura esperada.';
  END IF;

  function_definition := replace(
    function_definition,
    'public.get_championship_bracket_competition_qualification_pool_ranking',
    'public.get_interlaje_qualification_pool_ranking_legacy'
  );

  EXECUTE function_definition;
END;
$clone$;

CREATE OR REPLACE FUNCTION public.get_interlaje_volleyball_cross_group_ranking(
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
AS $function$
  WITH competition_context AS (
    SELECT
      competitions_table.id,
      competitions_table.sport_id,
      competitions_table.naipe,
      competitions_table.division,
      competitions_table.qualifiers_per_group,
      editions_table.season_year
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = competitions_table.bracket_edition_id
    WHERE competitions_table.id = _competition_id
    LIMIT 1
  ), group_rankings AS (
    SELECT *
    FROM public.get_championship_bracket_competition_group_rankings(
      _championship_id,
      _competition_id
    )
  ), group_sizes AS (
    SELECT
      group_rankings.group_id,
      count(*)::integer AS group_size
    FROM group_rankings
    GROUP BY group_rankings.group_id
  ), maximum_group_matches AS (
    SELECT GREATEST(max(group_sizes.group_size - 1), 1)::numeric AS value
    FROM group_sizes
  ), match_set_totals AS (
    SELECT
      match_sets_table.match_id,
      count(*) FILTER (
        WHERE match_sets_table.home_points > match_sets_table.away_points
      )::bigint AS home_sets_for,
      count(*) FILTER (
        WHERE match_sets_table.home_points < match_sets_table.away_points
      )::bigint AS home_sets_against
    FROM public.match_sets AS match_sets_table
    GROUP BY match_sets_table.match_id
  ), group_set_metrics AS (
    SELECT
      bracket_matches_table.group_id,
      matches_table.home_team_id AS team_id,
      COALESCE(match_set_totals.home_sets_for, 0)::bigint AS sets_for,
      COALESCE(match_set_totals.home_sets_against, 0)::bigint AS sets_against,
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
  ), aggregated_set_metrics AS (
    SELECT
      group_set_metrics.group_id,
      group_set_metrics.team_id,
      sum(group_set_metrics.sets_for)::bigint AS sets_for,
      sum(group_set_metrics.sets_against)::bigint AS sets_against,
      sum(group_set_metrics.red_cards)::bigint AS red_cards,
      sum(group_set_metrics.yellow_cards)::bigint AS yellow_cards
    FROM group_set_metrics
    GROUP BY group_set_metrics.group_id, group_set_metrics.team_id
  ), candidate_rows AS (
    SELECT
      group_rankings.competition_id,
      group_rankings.group_id,
      group_rankings.team_id,
      group_rankings.team_name,
      group_rankings.team_rank AS qualification_rank,
      group_rankings.points::bigint AS points,
      group_rankings.wins::bigint AS wins,
      group_rankings.goal_diff::bigint AS goal_diff,
      group_rankings.goals_for::bigint AS goals_for,
      COALESCE(aggregated_set_metrics.sets_for, 0)::bigint AS sets_for,
      COALESCE(aggregated_set_metrics.sets_against, 0)::bigint AS sets_against,
      COALESCE(aggregated_set_metrics.red_cards, 0)::bigint AS red_cards,
      COALESCE(aggregated_set_metrics.yellow_cards, 0)::bigint AS yellow_cards,
      maximum_group_matches.value
        / GREATEST(group_sizes.group_size - 1, 1)::numeric AS comparison_factor
    FROM group_rankings
    JOIN group_sizes
      ON group_sizes.group_id = group_rankings.group_id
    CROSS JOIN maximum_group_matches
    CROSS JOIN competition_context
    LEFT JOIN aggregated_set_metrics
      ON aggregated_set_metrics.group_id = group_rankings.group_id
      AND aggregated_set_metrics.team_id = group_rankings.team_id
    WHERE group_rankings.team_rank <= GREATEST(
      competition_context.qualifiers_per_group,
      2
    )
      AND NOT public.is_championship_competition_team_disqualified(
        _championship_id,
        competition_context.season_year,
        competition_context.sport_id,
        competition_context.naipe,
        competition_context.division,
        group_rankings.team_id
      )
  ), comparison_rows AS (
    SELECT
      candidate_rows.*,
      candidate_rows.points::numeric * candidate_rows.comparison_factor
        AS comparison_points,
      candidate_rows.goal_diff::numeric * candidate_rows.comparison_factor
        AS comparison_rally_point_difference,
      candidate_rows.goals_for::numeric * candidate_rows.comparison_factor
        AS comparison_rally_points_for,
      GREATEST(
        candidate_rows.goals_for - candidate_rows.goal_diff,
        0
      )::numeric * candidate_rows.comparison_factor
        AS comparison_rally_points_against,
      candidate_rows.sets_for::numeric * candidate_rows.comparison_factor
        AS comparison_sets_for,
      candidate_rows.sets_against::numeric * candidate_rows.comparison_factor
        AS comparison_sets_against,
      candidate_rows.red_cards::numeric * candidate_rows.comparison_factor
        AS comparison_red_cards,
      candidate_rows.yellow_cards::numeric * candidate_rows.comparison_factor
        AS comparison_yellow_cards,
      CASE
        WHEN candidate_rows.sets_against = 0 AND candidate_rows.sets_for > 0
          THEN 1000000000::numeric
        WHEN candidate_rows.sets_against = 0 THEN 0::numeric
        ELSE candidate_rows.sets_for::numeric / candidate_rows.sets_against
      END AS sets_average
    FROM candidate_rows
  ), pool_metric_tie_sets AS (
    SELECT
      comparison_rows.qualification_rank,
      string_agg(comparison_rows.team_id::text, '|' ORDER BY comparison_rows.team_id::text)
        AS tied_team_signature,
      array_agg(comparison_rows.team_id ORDER BY comparison_rows.team_id::text)
        AS tied_team_ids
    FROM comparison_rows
    GROUP BY
      comparison_rows.qualification_rank,
      round(comparison_rows.comparison_points, 12),
      round(comparison_rows.comparison_rally_point_difference, 12),
      round(comparison_rows.comparison_rally_points_for, 12),
      round(comparison_rows.comparison_rally_points_against, 12),
      round(comparison_rows.sets_average, 12),
      round(comparison_rows.comparison_sets_for, 12),
      round(comparison_rows.comparison_sets_against, 12),
      round(comparison_rows.comparison_red_cards, 12),
      round(comparison_rows.comparison_yellow_cards, 12)
    HAVING count(*) > 1
  ), pool_tie_context_members AS (
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
  ), pool_tie_resolution_orders AS (
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
  ), ranked_pool AS (
    SELECT
      comparison_rows.competition_id,
      comparison_rows.team_id,
      comparison_rows.team_name,
      comparison_rows.qualification_rank,
      comparison_rows.points,
      comparison_rows.wins,
      comparison_rows.goal_diff,
      comparison_rows.goals_for,
      row_number() OVER (
        ORDER BY
          comparison_rows.qualification_rank ASC,
          comparison_rows.comparison_points DESC,
          comparison_rows.comparison_rally_point_difference DESC,
          comparison_rows.comparison_rally_points_for DESC,
          comparison_rows.comparison_rally_points_against ASC,
          comparison_rows.sets_average DESC,
          comparison_rows.comparison_sets_for DESC,
          comparison_rows.comparison_sets_against ASC,
          comparison_rows.comparison_red_cards ASC,
          comparison_rows.comparison_yellow_cards ASC,
          COALESCE(pool_tie_resolution_orders.draw_order, 2147483647) ASC,
          comparison_rows.team_name ASC
      )::integer AS pool_rank
    FROM comparison_rows
    LEFT JOIN pool_tie_resolution_orders
      ON pool_tie_resolution_orders.qualification_rank = comparison_rows.qualification_rank
      AND pool_tie_resolution_orders.team_id = comparison_rows.team_id
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
$function$;

CREATE OR REPLACE FUNCTION public.get_championship_bracket_competition_qualification_pool_ranking(
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  is_interlaje_volleyball BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = competitions_table.bracket_edition_id
    JOIN public.championships AS championships_table
      ON championships_table.id = editions_table.championship_id
    JOIN public.sports AS sports_table
      ON sports_table.id = competitions_table.sport_id
    WHERE competitions_table.id = _competition_id
      AND championships_table.id = _championship_id
      AND championships_table.code = 'INTERLAJE'::public.championship_code
      AND public.normalize_sport_name(sports_table.name) = 'voleibol'
  )
  INTO is_interlaje_volleyball;

  IF is_interlaje_volleyball THEN
    RETURN QUERY
    SELECT *
    FROM public.get_interlaje_volleyball_cross_group_ranking(
      _championship_id,
      _competition_id
    );
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.get_interlaje_qualification_pool_ranking_legacy(
    _championship_id,
    _competition_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_interlaje_volleyball_cross_group_ranking(UUID, UUID)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_championship_bracket_competition_qualification_pool_ranking(UUID, UUID)
  TO anon, authenticated;

DO $refresh$
DECLARE
  competition_record RECORD;
BEGIN
  FOR competition_record IN
    SELECT
      championships_table.id AS championship_id,
      competitions_table.id AS competition_id
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = competitions_table.bracket_edition_id
    JOIN public.championships AS championships_table
      ON championships_table.id = editions_table.championship_id
    JOIN public.sports AS sports_table
      ON sports_table.id = competitions_table.sport_id
    WHERE championships_table.code = 'INTERLAJE'::public.championship_code
      AND editions_table.season_year = championships_table.current_season_year
      AND public.normalize_sport_name(sports_table.name) = 'voleibol'
      AND EXISTS (
        SELECT 1
        FROM public.championship_bracket_matches AS bracket_matches_table
        WHERE bracket_matches_table.competition_id = competitions_table.id
          AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.championship_bracket_matches AS bracket_matches_table
        JOIN public.matches AS matches_table
          ON matches_table.id = bracket_matches_table.match_id
        WHERE bracket_matches_table.competition_id = competitions_table.id
          AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
          AND matches_table.status <> 'SCHEDULED'::public.match_status
      )
  LOOP
    PERFORM public.refresh_championship_knockout_competition_after_disqualification(
      competition_record.championship_id,
      competition_record.competition_id
    );
  END LOOP;
END;
$refresh$;

NOTIFY pgrst, 'reload schema';
