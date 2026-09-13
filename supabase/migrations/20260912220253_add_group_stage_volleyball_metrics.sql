CREATE OR REPLACE FUNCTION public.get_championship_group_stage_standings_display_metrics(
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
  comparison_rank INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH group_stage_standings AS (
    SELECT *
    FROM public.get_championship_group_stage_standings(
      _championship_id,
      _season_year
    )
  ), set_metrics AS (
    SELECT
      bracket_matches_table.competition_id,
      bracket_matches_table.group_id,
      matches_table.home_team_id AS team_id,
      COUNT(*) FILTER (
        WHERE match_sets_table.home_points > match_sets_table.away_points
      )::bigint AS sets_for,
      COUNT(*) FILTER (
        WHERE match_sets_table.home_points < match_sets_table.away_points
      )::bigint AS sets_against,
      COALESCE(SUM(match_sets_table.home_points), 0)::bigint AS rally_points_for,
      COALESCE(SUM(match_sets_table.away_points), 0)::bigint AS rally_points_against
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    JOIN public.match_sets AS match_sets_table
      ON match_sets_table.match_id = matches_table.id
    WHERE bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
      AND matches_table.championship_id = _championship_id
      AND (_season_year IS NULL OR matches_table.season_year = _season_year)
      AND matches_table.status = 'FINISHED'::public.match_status
      AND COALESCE(matches_table.is_double_walkover, false) = false
    GROUP BY
      bracket_matches_table.competition_id,
      bracket_matches_table.group_id,
      matches_table.home_team_id

    UNION ALL

    SELECT
      bracket_matches_table.competition_id,
      bracket_matches_table.group_id,
      matches_table.away_team_id,
      COUNT(*) FILTER (
        WHERE match_sets_table.away_points > match_sets_table.home_points
      )::bigint,
      COUNT(*) FILTER (
        WHERE match_sets_table.away_points < match_sets_table.home_points
      )::bigint,
      COALESCE(SUM(match_sets_table.away_points), 0)::bigint,
      COALESCE(SUM(match_sets_table.home_points), 0)::bigint
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    JOIN public.match_sets AS match_sets_table
      ON match_sets_table.match_id = matches_table.id
    WHERE bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
      AND matches_table.championship_id = _championship_id
      AND (_season_year IS NULL OR matches_table.season_year = _season_year)
      AND matches_table.status = 'FINISHED'::public.match_status
      AND COALESCE(matches_table.is_double_walkover, false) = false
    GROUP BY
      bracket_matches_table.competition_id,
      bracket_matches_table.group_id,
      matches_table.away_team_id
  ), aggregated_set_metrics AS (
    SELECT
      set_metrics.competition_id,
      set_metrics.group_id,
      set_metrics.team_id,
      SUM(set_metrics.sets_for)::bigint AS sets_for,
      SUM(set_metrics.sets_against)::bigint AS sets_against,
      SUM(set_metrics.rally_points_for)::bigint AS rally_points_for,
      SUM(set_metrics.rally_points_against)::bigint AS rally_points_against
    FROM set_metrics
    GROUP BY
      set_metrics.competition_id,
      set_metrics.group_id,
      set_metrics.team_id
  )
  SELECT
    group_stage_standings.competition_id,
    group_stage_standings.sport_id,
    group_stage_standings.sport_name,
    group_stage_standings.naipe,
    group_stage_standings.division,
    group_stage_standings.group_id,
    group_stage_standings.group_number,
    group_stage_standings.team_id,
    group_stage_standings.team_name,
    group_stage_standings.played,
    group_stage_standings.wins,
    group_stage_standings.draws,
    group_stage_standings.losses,
    group_stage_standings.goals_for,
    group_stage_standings.goals_against,
    group_stage_standings.goal_diff,
    group_stage_standings.points,
    group_stage_standings.comparison_points,
    group_stage_standings.yellow_cards,
    group_stage_standings.red_cards,
    group_stage_standings.blue_cards,
    group_stage_standings.two_minute_penalties,
    COALESCE(aggregated_set_metrics.sets_for, 0)::bigint,
    COALESCE(aggregated_set_metrics.sets_against, 0)::bigint,
    COALESCE(aggregated_set_metrics.rally_points_for, 0)::bigint,
    COALESCE(aggregated_set_metrics.rally_points_against, 0)::bigint,
    group_stage_standings.group_rank,
    group_stage_standings.comparison_rank
  FROM group_stage_standings
  LEFT JOIN aggregated_set_metrics
    ON aggregated_set_metrics.competition_id = group_stage_standings.competition_id
    AND aggregated_set_metrics.group_id = group_stage_standings.group_id
    AND aggregated_set_metrics.team_id = group_stage_standings.team_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_championship_group_stage_standings_display_metrics(UUID, INTEGER)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
