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
      competitions_table.should_complete_knockout_with_best_second_placed_teams
    FROM public.championship_bracket_competitions AS competitions_table
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
      count(*)::int AS group_size
    FROM group_rankings
    GROUP BY group_rankings.group_id
  ),
  competition_match_span AS (
    SELECT
      GREATEST(
        COALESCE(max(GREATEST(group_sizes.group_size - 1, 1)), 1),
        1
      )::numeric AS max_matches_in_competition
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
      GREATEST(group_sizes.group_size - 1, 1)::numeric AS matches_in_group,
      competition_match_span.max_matches_in_competition
    FROM group_rankings
    JOIN group_sizes
      ON group_sizes.group_id = group_rankings.group_id
    CROSS JOIN competition_context
    CROSS JOIN competition_match_span
    WHERE
      competition_context.qualifiers_per_group = 1
      AND competition_context.should_complete_knockout_with_best_second_placed_teams = true
      AND group_rankings.team_rank = 2
  ),
  candidate_rows_with_correction AS (
    SELECT
      candidate_rows.competition_id,
      candidate_rows.group_id,
      candidate_rows.team_id,
      candidate_rows.team_name,
      candidate_rows.qualification_rank,
      candidate_rows.points_base,
      candidate_rows.wins,
      candidate_rows.goal_diff,
      candidate_rows.goals_for,
      candidate_rows.max_matches_in_competition / candidate_rows.matches_in_group AS correction_factor,
      candidate_rows.points_base::numeric * (
        candidate_rows.max_matches_in_competition / candidate_rows.matches_in_group
      ) AS corrected_points
    FROM candidate_rows
  ),
  pool_metric_tie_sets AS (
    SELECT
      candidate_rows_with_correction.qualification_rank,
      string_agg(candidate_rows_with_correction.team_id::text, '|' ORDER BY candidate_rows_with_correction.team_id::text) AS tied_team_signature,
      array_agg(candidate_rows_with_correction.team_id ORDER BY candidate_rows_with_correction.team_id::text) AS tied_team_ids
    FROM candidate_rows_with_correction
    GROUP BY
      candidate_rows_with_correction.qualification_rank,
      candidate_rows_with_correction.corrected_points,
      candidate_rows_with_correction.wins,
      candidate_rows_with_correction.goal_diff,
      candidate_rows_with_correction.goals_for
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
      candidate_rows_with_correction.competition_id,
      candidate_rows_with_correction.team_id,
      candidate_rows_with_correction.team_name,
      candidate_rows_with_correction.qualification_rank,
      -- Mantém a assinatura BIGINT da função existente preservando casas decimais para o desempate.
      ROUND(candidate_rows_with_correction.corrected_points * 1000000)::bigint AS points,
      candidate_rows_with_correction.wins,
      candidate_rows_with_correction.goal_diff,
      candidate_rows_with_correction.goals_for,
      row_number() OVER (
        ORDER BY
          candidate_rows_with_correction.qualification_rank ASC,
          candidate_rows_with_correction.corrected_points DESC,
          candidate_rows_with_correction.wins DESC,
          candidate_rows_with_correction.goal_diff DESC,
          candidate_rows_with_correction.goals_for DESC,
          COALESCE(pool_tie_resolution_orders.draw_order, 2147483647) ASC,
          candidate_rows_with_correction.team_name ASC
      ) AS pool_rank
    FROM candidate_rows_with_correction
    LEFT JOIN pool_tie_resolution_orders
      ON pool_tie_resolution_orders.qualification_rank = candidate_rows_with_correction.qualification_rank
      AND pool_tie_resolution_orders.team_id = candidate_rows_with_correction.team_id
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

CREATE OR REPLACE FUNCTION public.get_championship_corrected_group_standings(
  _championship_id UUID,
  _season_year INTEGER DEFAULT NULL
)
RETURNS TABLE(
  competition_id UUID,
  sport_id UUID,
  sport_name TEXT,
  naipe public.match_naipe,
  division public.team_division,
  group_id UUID,
  group_number INTEGER,
  group_size INTEGER,
  team_id UUID,
  team_name TEXT,
  wins BIGINT,
  points_base BIGINT,
  correction_factor NUMERIC,
  corrected_points NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  WITH edition_context AS (
    SELECT
      COALESCE(
        (
          SELECT editions_table.id
          FROM public.championship_bracket_editions AS editions_table
          WHERE editions_table.championship_id = _championship_id
            AND (_season_year IS NULL OR editions_table.season_year = _season_year)
          ORDER BY editions_table.created_at DESC
          LIMIT 1
        ),
        (
          SELECT editions_table.id
          FROM public.championship_bracket_editions AS editions_table
          WHERE editions_table.championship_id = _championship_id
          ORDER BY editions_table.created_at DESC
          LIMIT 1
        )
      ) AS bracket_edition_id
  ),
  competition_context AS (
    SELECT
      competitions_table.id AS competition_id,
      competitions_table.sport_id,
      sports_table.name AS sport_name,
      competitions_table.naipe,
      competitions_table.division
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN edition_context
      ON edition_context.bracket_edition_id = competitions_table.bracket_edition_id
    JOIN public.sports AS sports_table
      ON sports_table.id = competitions_table.sport_id
  ),
  group_rankings AS (
    SELECT
      competition_context.competition_id,
      competition_context.sport_id,
      competition_context.sport_name,
      competition_context.naipe,
      competition_context.division,
      rankings_table.group_id,
      rankings_table.group_number,
      rankings_table.team_id,
      rankings_table.team_name,
      rankings_table.wins,
      rankings_table.points
    FROM competition_context
    CROSS JOIN LATERAL public.get_championship_bracket_competition_group_rankings(
      _championship_id,
      competition_context.competition_id
    ) AS rankings_table
  ),
  group_sizes AS (
    SELECT
      group_rankings.competition_id,
      group_rankings.group_id,
      group_rankings.group_number,
      count(*)::int AS group_size
    FROM group_rankings
    GROUP BY group_rankings.competition_id, group_rankings.group_id, group_rankings.group_number
  ),
  competition_match_span AS (
    SELECT
      group_sizes.competition_id,
      GREATEST(
        COALESCE(max(GREATEST(group_sizes.group_size - 1, 1)), 1),
        1
      )::numeric AS max_matches_in_competition
    FROM group_sizes
    GROUP BY group_sizes.competition_id
  )
  SELECT
    group_rankings.competition_id,
    group_rankings.sport_id,
    group_rankings.sport_name,
    group_rankings.naipe,
    group_rankings.division,
    group_rankings.group_id,
    group_rankings.group_number,
    group_sizes.group_size,
    group_rankings.team_id,
    group_rankings.team_name,
    group_rankings.wins,
    group_rankings.points AS points_base,
    competition_match_span.max_matches_in_competition / GREATEST(group_sizes.group_size - 1, 1)::numeric AS correction_factor,
    group_rankings.points::numeric * (
      competition_match_span.max_matches_in_competition / GREATEST(group_sizes.group_size - 1, 1)::numeric
    ) AS corrected_points
  FROM group_rankings
  JOIN group_sizes
    ON group_sizes.competition_id = group_rankings.competition_id
    AND group_sizes.group_id = group_rankings.group_id
  JOIN competition_match_span
    ON competition_match_span.competition_id = group_rankings.competition_id
  ORDER BY
    group_rankings.sport_name ASC,
    group_rankings.naipe ASC,
    group_rankings.division ASC NULLS FIRST,
    group_rankings.group_number ASC,
    corrected_points DESC,
    group_rankings.wins DESC,
    group_rankings.team_name ASC;
$func$;

GRANT EXECUTE ON FUNCTION public.get_championship_corrected_group_standings(UUID, INTEGER) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
