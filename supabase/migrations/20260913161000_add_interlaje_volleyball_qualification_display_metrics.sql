CREATE OR REPLACE FUNCTION public.get_championship_group_stage_qualification_display_metrics(
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
  team_id UUID,
  team_name TEXT,
  played BIGINT,
  wins BIGINT,
  draws BIGINT,
  losses BIGINT,
  goals_for BIGINT,
  goals_against BIGINT,
  goal_diff BIGINT,
  points BIGINT,
  comparison_points NUMERIC,
  yellow_cards BIGINT,
  red_cards BIGINT,
  blue_cards BIGINT,
  two_minute_penalties BIGINT,
  sets_for BIGINT,
  sets_against BIGINT,
  rally_points_for BIGINT,
  rally_points_against BIGINT,
  group_rank INTEGER,
  comparison_rank INTEGER,
  comparison_goals_for NUMERIC,
  comparison_goals_against NUMERIC,
  comparison_goal_diff NUMERIC,
  comparison_yellow_cards NUMERIC,
  comparison_red_cards NUMERIC,
  comparison_blue_cards NUMERIC,
  comparison_two_minute_penalties NUMERIC,
  comparison_sets_for NUMERIC,
  comparison_sets_against NUMERIC,
  comparison_rally_points_for NUMERIC,
  comparison_rally_points_against NUMERIC,
  qualification_rank INTEGER,
  qualification_pool_rank INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH display_metrics AS (
    SELECT *
    FROM public.get_championship_group_stage_standings_display_metrics(
      _championship_id,
      _season_year
    )
  ), competition_context AS (
    SELECT DISTINCT
      display_metrics.competition_id,
      championships_table.code = 'INTERLAJE'::public.championship_code
        AND public.normalize_sport_name(sports_table.name) = 'voleibol'
        AS is_interlaje_volleyball
    FROM display_metrics
    JOIN public.championship_bracket_competitions AS competitions_table
      ON competitions_table.id = display_metrics.competition_id
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = competitions_table.bracket_edition_id
    JOIN public.championships AS championships_table
      ON championships_table.id = editions_table.championship_id
    JOIN public.sports AS sports_table
      ON sports_table.id = competitions_table.sport_id
  ), group_sizes AS (
    SELECT
      display_metrics.competition_id,
      display_metrics.group_id,
      count(*)::numeric AS group_size
    FROM display_metrics
    GROUP BY display_metrics.competition_id, display_metrics.group_id
  ), maximum_group_matches AS (
    SELECT
      group_sizes.competition_id,
      GREATEST(MAX(group_sizes.group_size - 1), 1)::numeric AS value
    FROM group_sizes
    GROUP BY group_sizes.competition_id
  ), qualification_pool AS (
    SELECT
      competition_context.competition_id,
      qualification_ranking.team_id,
      qualification_ranking.qualification_rank,
      qualification_ranking.pool_rank
    FROM competition_context
    CROSS JOIN LATERAL public.get_championship_bracket_competition_qualification_pool_ranking(
      _championship_id,
      competition_context.competition_id
    ) AS qualification_ranking
    WHERE competition_context.is_interlaje_volleyball
  ), normalized_metrics AS (
    SELECT
      display_metrics.*,
      competition_context.is_interlaje_volleyball,
      qualification_pool.pool_rank AS qualification_pool_rank,
      qualification_pool.qualification_rank,
      maximum_group_matches.value
        / GREATEST(group_sizes.group_size - 1, 1) AS comparison_factor
    FROM display_metrics
    JOIN competition_context
      ON competition_context.competition_id = display_metrics.competition_id
    JOIN group_sizes
      ON group_sizes.competition_id = display_metrics.competition_id
      AND group_sizes.group_id = display_metrics.group_id
    JOIN maximum_group_matches
      ON maximum_group_matches.competition_id = display_metrics.competition_id
    LEFT JOIN qualification_pool
      ON qualification_pool.competition_id = display_metrics.competition_id
      AND qualification_pool.team_id = display_metrics.team_id
  )
  SELECT
    normalized_metrics.competition_id,
    normalized_metrics.sport_id,
    normalized_metrics.sport_name,
    normalized_metrics.naipe,
    normalized_metrics.division,
    normalized_metrics.group_id,
    normalized_metrics.group_number,
    normalized_metrics.team_id,
    normalized_metrics.team_name,
    normalized_metrics.played,
    normalized_metrics.wins,
    normalized_metrics.draws,
    normalized_metrics.losses,
    normalized_metrics.goals_for,
    normalized_metrics.goals_against,
    normalized_metrics.goal_diff,
    normalized_metrics.points,
    normalized_metrics.comparison_points,
    normalized_metrics.yellow_cards,
    normalized_metrics.red_cards,
    normalized_metrics.blue_cards,
    normalized_metrics.two_minute_penalties,
    normalized_metrics.sets_for,
    normalized_metrics.sets_against,
    normalized_metrics.rally_points_for,
    normalized_metrics.rally_points_against,
    normalized_metrics.group_rank,
    normalized_metrics.comparison_rank,
    CASE
      WHEN normalized_metrics.is_interlaje_volleyball
        AND normalized_metrics.qualification_pool_rank IS NOT NULL
        THEN normalized_metrics.goals_for::numeric * normalized_metrics.comparison_factor
      ELSE normalized_metrics.goals_for::numeric
    END,
    CASE
      WHEN normalized_metrics.is_interlaje_volleyball
        AND normalized_metrics.qualification_pool_rank IS NOT NULL
        THEN normalized_metrics.goals_against::numeric * normalized_metrics.comparison_factor
      ELSE normalized_metrics.goals_against::numeric
    END,
    CASE
      WHEN normalized_metrics.is_interlaje_volleyball
        AND normalized_metrics.qualification_pool_rank IS NOT NULL
        THEN normalized_metrics.goal_diff::numeric * normalized_metrics.comparison_factor
      ELSE normalized_metrics.goal_diff::numeric
    END,
    CASE
      WHEN normalized_metrics.is_interlaje_volleyball
        AND normalized_metrics.qualification_pool_rank IS NOT NULL
        THEN normalized_metrics.yellow_cards::numeric * normalized_metrics.comparison_factor
      ELSE normalized_metrics.yellow_cards::numeric
    END,
    CASE
      WHEN normalized_metrics.is_interlaje_volleyball
        AND normalized_metrics.qualification_pool_rank IS NOT NULL
        THEN normalized_metrics.red_cards::numeric * normalized_metrics.comparison_factor
      ELSE normalized_metrics.red_cards::numeric
    END,
    CASE
      WHEN normalized_metrics.is_interlaje_volleyball
        AND normalized_metrics.qualification_pool_rank IS NOT NULL
        THEN normalized_metrics.blue_cards::numeric * normalized_metrics.comparison_factor
      ELSE normalized_metrics.blue_cards::numeric
    END,
    CASE
      WHEN normalized_metrics.is_interlaje_volleyball
        AND normalized_metrics.qualification_pool_rank IS NOT NULL
        THEN normalized_metrics.two_minute_penalties::numeric * normalized_metrics.comparison_factor
      ELSE normalized_metrics.two_minute_penalties::numeric
    END,
    CASE
      WHEN normalized_metrics.is_interlaje_volleyball
        AND normalized_metrics.qualification_pool_rank IS NOT NULL
        THEN normalized_metrics.sets_for::numeric * normalized_metrics.comparison_factor
      ELSE normalized_metrics.sets_for::numeric
    END,
    CASE
      WHEN normalized_metrics.is_interlaje_volleyball
        AND normalized_metrics.qualification_pool_rank IS NOT NULL
        THEN normalized_metrics.sets_against::numeric * normalized_metrics.comparison_factor
      ELSE normalized_metrics.sets_against::numeric
    END,
    CASE
      WHEN normalized_metrics.is_interlaje_volleyball
        AND normalized_metrics.qualification_pool_rank IS NOT NULL
        THEN normalized_metrics.rally_points_for::numeric * normalized_metrics.comparison_factor
      ELSE normalized_metrics.rally_points_for::numeric
    END,
    CASE
      WHEN normalized_metrics.is_interlaje_volleyball
        AND normalized_metrics.qualification_pool_rank IS NOT NULL
        THEN normalized_metrics.rally_points_against::numeric * normalized_metrics.comparison_factor
      ELSE normalized_metrics.rally_points_against::numeric
    END,
    normalized_metrics.qualification_rank,
    normalized_metrics.qualification_pool_rank
  FROM normalized_metrics;
$function$;

GRANT EXECUTE ON FUNCTION public.get_championship_group_stage_qualification_display_metrics(UUID, INTEGER)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
