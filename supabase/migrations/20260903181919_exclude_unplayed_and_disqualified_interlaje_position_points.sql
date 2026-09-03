CREATE OR REPLACE FUNCTION public.get_interlaje_competition_standings(
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
  final_position INTEGER,
  placement_points INTEGER
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH effective_standings AS (
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
      standings_table.points
        + COALESCE(corrected_standings_table.corrected_points - corrected_standings_table.points_base, 0) AS points,
      standings_table.yellow_cards,
      standings_table.red_cards,
      standings_table.blue_cards,
      standings_table.two_minute_penalties,
      championship_sports_table.tie_breaker_rule,
      public.is_championship_competition_team_disqualified(
        _championship_id,
        _season_year,
        _sport_id,
        _naipe,
        standings_table.division,
        standings_table.team_id
      ) AS is_disqualified
    FROM public.get_championship_effective_standings(
      _championship_id,
      _season_year,
      CASE WHEN _division IS NULL THEN 'WITHOUT_DIVISION' ELSE _division::TEXT END,
      _naipe,
      _sport_id
    ) AS standings_table
    LEFT JOIN public.get_championship_corrected_group_standings(
      _championship_id,
      _season_year
    ) AS corrected_standings_table
      ON corrected_standings_table.team_id = standings_table.team_id
      AND corrected_standings_table.sport_id = _sport_id
      AND corrected_standings_table.naipe = _naipe
      AND corrected_standings_table.division IS NOT DISTINCT FROM standings_table.division
    JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = _championship_id
      AND championship_sports_table.sport_id = _sport_id
    WHERE _division IS NULL
      OR standings_table.division IS NOT DISTINCT FROM _division
  ), prepared_standings AS (
    SELECT
      effective_standings.*,
      BOOL_OR(effective_standings.played > 0) OVER (
        PARTITION BY effective_standings.division
      ) AS has_completed_result
    FROM effective_standings
  ), ranked_standings AS (
    SELECT
      prepared_standings.*,
      ROW_NUMBER() OVER (
        PARTITION BY prepared_standings.division
        ORDER BY
          prepared_standings.is_disqualified ASC,
          prepared_standings.points DESC,
          CASE WHEN prepared_standings.tie_breaker_rule = 'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule THEN prepared_standings.wins END DESC,
          CASE WHEN prepared_standings.tie_breaker_rule = 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule
            THEN CASE WHEN prepared_standings.goals_against = 0 AND prepared_standings.goals_for > 0 THEN 1000000000::NUMERIC
              WHEN prepared_standings.goals_against = 0 THEN 0
              ELSE prepared_standings.goals_for::NUMERIC / prepared_standings.goals_against END
          END DESC NULLS LAST,
          prepared_standings.goal_diff DESC,
          CASE WHEN prepared_standings.tie_breaker_rule = 'HANDEBOL'::public.championship_sport_tie_breaker_rule THEN prepared_standings.goals_against END ASC NULLS LAST,
          prepared_standings.goals_for DESC,
          CASE WHEN prepared_standings.tie_breaker_rule IN ('STANDARD'::public.championship_sport_tie_breaker_rule, 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule) THEN prepared_standings.wins END DESC,
          CASE WHEN prepared_standings.tie_breaker_rule IN ('BEACH_SOCCER'::public.championship_sport_tie_breaker_rule, 'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule, 'HANDEBOL'::public.championship_sport_tie_breaker_rule) THEN prepared_standings.yellow_cards END ASC NULLS LAST,
          prepared_standings.red_cards ASC,
          prepared_standings.blue_cards ASC,
          prepared_standings.two_minute_penalties ASC,
          prepared_standings.team_name ASC
      )::INTEGER AS final_position
    FROM prepared_standings
  )
  SELECT
    ranked_standings.team_id,
    ranked_standings.team_name,
    ranked_standings.division,
    ranked_standings.played,
    ranked_standings.wins,
    ranked_standings.draws,
    ranked_standings.losses,
    ranked_standings.goals_for,
    ranked_standings.goals_against,
    ranked_standings.goal_diff,
    ranked_standings.points,
    ranked_standings.yellow_cards,
    ranked_standings.red_cards,
    ranked_standings.blue_cards,
    ranked_standings.two_minute_penalties,
    ranked_standings.final_position,
    CASE
      WHEN ranked_standings.is_disqualified OR NOT ranked_standings.has_completed_result THEN 0
      ELSE COALESCE(settings_table.points, 0)
    END AS placement_points
  FROM ranked_standings
  LEFT JOIN public.championship_overall_position_point_settings AS settings_table
    ON settings_table.championship_id = _championship_id
    AND settings_table.season_year = _season_year
    AND settings_table.final_position = ranked_standings.final_position
  ORDER BY ranked_standings.final_position;
$$;
