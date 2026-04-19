
-- a soma dos pontos dos sets (ex.: 21+18), não os sets vencidos armazenados em home_score/away_score.

CREATE OR REPLACE FUNCTION public.rebuild_standings_scope(
  _championship_id UUID,
  _season_year INTEGER,
  _sport_id UUID,
  _naipe public.match_naipe,
  _division public.team_division
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.standings AS standings_table
  WHERE standings_table.championship_id = _championship_id
    AND standings_table.season_year = _season_year
    AND standings_table.sport_id = _sport_id
    AND standings_table.naipe = _naipe
    AND standings_table.division IS NOT DISTINCT FROM _division;

  INSERT INTO public.standings (
    championship_id,
    season_year,
    sport_id,
    naipe,
    division,
    team_id,
    played,
    wins,
    draws,
    losses,
    goals_for,
    goals_against,
    goal_diff,
    points,
    yellow_cards,
    red_cards,
    updated_at
  )
  WITH scoped_matches AS (
    SELECT
      matches_table.championship_id,
      matches_table.season_year,
      matches_table.sport_id,
      matches_table.naipe,
      matches_table.division,
      matches_table.home_team_id,
      matches_table.away_team_id,
      GREATEST(0, COALESCE(matches_table.home_score, 0)) AS home_score,
      GREATEST(0, COALESCE(matches_table.away_score, 0)) AS away_score,
      COALESCE(championship_sports_table.result_rule, 'POINTS'::public.championship_sport_result_rule) AS result_rule,
      COALESCE(match_set_totals.home_points_total, 0)::bigint AS home_points_total,
      COALESCE(match_set_totals.away_points_total, 0)::bigint AS away_points_total,
      (COALESCE(match_set_totals.sets_count, 0) > 0) AS has_match_sets,
      GREATEST(0, COALESCE(matches_table.home_yellow_cards, 0)) AS home_yellow_cards,
      GREATEST(0, COALESCE(matches_table.home_red_cards, 0)) AS home_red_cards,
      GREATEST(0, COALESCE(matches_table.away_yellow_cards, 0)) AS away_yellow_cards,
      GREATEST(0, COALESCE(matches_table.away_red_cards, 0)) AS away_red_cards,
      COALESCE(championship_sports_table.points_win, 3) AS points_win,
      COALESCE(championship_sports_table.points_draw, 1) AS points_draw,
      COALESCE(championship_sports_table.points_loss, 0) AS points_loss
    FROM public.matches AS matches_table
    LEFT JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = matches_table.championship_id
      AND championship_sports_table.sport_id = matches_table.sport_id
    LEFT JOIN LATERAL (
      SELECT
        SUM(match_sets_table.home_points)::bigint AS home_points_total,
        SUM(match_sets_table.away_points)::bigint AS away_points_total,
        COUNT(*)::bigint AS sets_count
      FROM public.match_sets AS match_sets_table
      WHERE match_sets_table.match_id = matches_table.id
    ) AS match_set_totals ON TRUE
    WHERE matches_table.status = 'FINISHED'::public.match_status
      AND matches_table.championship_id = _championship_id
      AND matches_table.season_year = _season_year
      AND matches_table.sport_id = _sport_id
      AND matches_table.naipe = _naipe
      AND matches_table.division IS NOT DISTINCT FROM _division
  ),
  scoped_resolved AS (
    SELECT
      scoped_matches.*,
      CASE
        WHEN scoped_matches.result_rule = 'SETS'::public.championship_sport_result_rule
          AND scoped_matches.has_match_sets
        THEN scoped_matches.home_points_total
        ELSE scoped_matches.home_score
      END AS effective_home_goals,
      CASE
        WHEN scoped_matches.result_rule = 'SETS'::public.championship_sport_result_rule
          AND scoped_matches.has_match_sets
        THEN scoped_matches.away_points_total
        ELSE scoped_matches.away_score
      END AS effective_away_goals
    FROM scoped_matches
  ),
  standing_rows AS (
    SELECT
      scoped_resolved.championship_id,
      scoped_resolved.season_year,
      scoped_resolved.sport_id,
      scoped_resolved.naipe,
      scoped_resolved.division,
      scoped_resolved.home_team_id AS team_id,
      scoped_resolved.effective_home_goals AS goals_for,
      scoped_resolved.effective_away_goals AS goals_against,
      CASE WHEN scoped_resolved.home_score > scoped_resolved.away_score THEN 1 ELSE 0 END AS wins,
      CASE WHEN scoped_resolved.home_score = scoped_resolved.away_score THEN 1 ELSE 0 END AS draws,
      CASE WHEN scoped_resolved.home_score < scoped_resolved.away_score THEN 1 ELSE 0 END AS losses,
      CASE
        WHEN scoped_resolved.home_score > scoped_resolved.away_score THEN scoped_resolved.points_win
        WHEN scoped_resolved.home_score = scoped_resolved.away_score THEN scoped_resolved.points_draw
        ELSE scoped_resolved.points_loss
      END AS points,
      scoped_resolved.home_yellow_cards AS yellow_cards,
      scoped_resolved.home_red_cards AS red_cards
    FROM scoped_resolved

    UNION ALL

    SELECT
      scoped_resolved.championship_id,
      scoped_resolved.season_year,
      scoped_resolved.sport_id,
      scoped_resolved.naipe,
      scoped_resolved.division,
      scoped_resolved.away_team_id AS team_id,
      scoped_resolved.effective_away_goals AS goals_for,
      scoped_resolved.effective_home_goals AS goals_against,
      CASE WHEN scoped_resolved.away_score > scoped_resolved.home_score THEN 1 ELSE 0 END AS wins,
      CASE WHEN scoped_resolved.home_score = scoped_resolved.away_score THEN 1 ELSE 0 END AS draws,
      CASE WHEN scoped_resolved.away_score < scoped_resolved.home_score THEN 1 ELSE 0 END AS losses,
      CASE
        WHEN scoped_resolved.away_score > scoped_resolved.home_score THEN scoped_resolved.points_win
        WHEN scoped_resolved.home_score = scoped_resolved.away_score THEN scoped_resolved.points_draw
        ELSE scoped_resolved.points_loss
      END AS points,
      scoped_resolved.away_yellow_cards AS yellow_cards,
      scoped_resolved.away_red_cards AS red_cards
    FROM scoped_resolved
  )
  SELECT
    standing_rows.championship_id,
    standing_rows.season_year,
    standing_rows.sport_id,
    standing_rows.naipe,
    standing_rows.division,
    standing_rows.team_id,
    count(*) AS played,
    sum(standing_rows.wins) AS wins,
    sum(standing_rows.draws) AS draws,
    sum(standing_rows.losses) AS losses,
    sum(standing_rows.goals_for) AS goals_for,
    sum(standing_rows.goals_against) AS goals_against,
    sum(standing_rows.goals_for - standing_rows.goals_against) AS goal_diff,
    sum(standing_rows.points) AS points,
    sum(standing_rows.yellow_cards) AS yellow_cards,
    sum(standing_rows.red_cards) AS red_cards,
    now() AS updated_at
  FROM standing_rows
  GROUP BY
    standing_rows.championship_id,
    standing_rows.season_year,
    standing_rows.sport_id,
    standing_rows.naipe,
    standing_rows.division,
    standing_rows.team_id;
END;
$$;

DELETE FROM public.standings;

INSERT INTO public.standings (
  championship_id,
  season_year,
  sport_id,
  naipe,
  division,
  team_id,
  played,
  wins,
  draws,
  losses,
  goals_for,
  goals_against,
  goal_diff,
  points,
  yellow_cards,
  red_cards,
  updated_at
)
WITH base_matches AS (
  SELECT
    matches_table.championship_id,
    matches_table.season_year,
    matches_table.sport_id,
    matches_table.naipe,
    matches_table.division,
    matches_table.home_team_id,
    matches_table.away_team_id,
    GREATEST(0, COALESCE(matches_table.home_score, 0)) AS home_score,
    GREATEST(0, COALESCE(matches_table.away_score, 0)) AS away_score,
    COALESCE(championship_sports_table.result_rule, 'POINTS'::public.championship_sport_result_rule) AS result_rule,
    COALESCE(match_set_totals.home_points_total, 0)::bigint AS home_points_total,
    COALESCE(match_set_totals.away_points_total, 0)::bigint AS away_points_total,
    (COALESCE(match_set_totals.sets_count, 0) > 0) AS has_match_sets,
    GREATEST(0, COALESCE(matches_table.home_yellow_cards, 0)) AS home_yellow_cards,
    GREATEST(0, COALESCE(matches_table.home_red_cards, 0)) AS home_red_cards,
    GREATEST(0, COALESCE(matches_table.away_yellow_cards, 0)) AS away_yellow_cards,
    GREATEST(0, COALESCE(matches_table.away_red_cards, 0)) AS away_red_cards,
    COALESCE(championship_sports_table.points_win, 3) AS points_win,
    COALESCE(championship_sports_table.points_draw, 1) AS points_draw,
    COALESCE(championship_sports_table.points_loss, 0) AS points_loss
  FROM public.matches AS matches_table
  LEFT JOIN public.championship_sports AS championship_sports_table
    ON championship_sports_table.championship_id = matches_table.championship_id
    AND championship_sports_table.sport_id = matches_table.sport_id
  LEFT JOIN LATERAL (
    SELECT
      SUM(match_sets_table.home_points)::bigint AS home_points_total,
      SUM(match_sets_table.away_points)::bigint AS away_points_total,
      COUNT(*)::bigint AS sets_count
    FROM public.match_sets AS match_sets_table
    WHERE match_sets_table.match_id = matches_table.id
  ) AS match_set_totals ON TRUE
  WHERE matches_table.status = 'FINISHED'::public.match_status
),
base_resolved AS (
  SELECT
    base_matches.*,
    CASE
      WHEN base_matches.result_rule = 'SETS'::public.championship_sport_result_rule
        AND base_matches.has_match_sets
      THEN base_matches.home_points_total
      ELSE base_matches.home_score
    END AS effective_home_goals,
    CASE
      WHEN base_matches.result_rule = 'SETS'::public.championship_sport_result_rule
        AND base_matches.has_match_sets
      THEN base_matches.away_points_total
      ELSE base_matches.away_score
    END AS effective_away_goals
  FROM base_matches
),
standing_rows AS (
  SELECT
    base_resolved.championship_id,
    base_resolved.season_year,
    base_resolved.sport_id,
    base_resolved.naipe,
    base_resolved.division,
    base_resolved.home_team_id AS team_id,
    base_resolved.effective_home_goals AS goals_for,
    base_resolved.effective_away_goals AS goals_against,
    CASE WHEN base_resolved.home_score > base_resolved.away_score THEN 1 ELSE 0 END AS wins,
    CASE WHEN base_resolved.home_score = base_resolved.away_score THEN 1 ELSE 0 END AS draws,
    CASE WHEN base_resolved.home_score < base_resolved.away_score THEN 1 ELSE 0 END AS losses,
    CASE
      WHEN base_resolved.home_score > base_resolved.away_score THEN base_resolved.points_win
      WHEN base_resolved.home_score = base_resolved.away_score THEN base_resolved.points_draw
      ELSE base_resolved.points_loss
    END AS points,
    base_resolved.home_yellow_cards AS yellow_cards,
    base_resolved.home_red_cards AS red_cards
  FROM base_resolved

  UNION ALL

  SELECT
    base_resolved.championship_id,
    base_resolved.season_year,
    base_resolved.sport_id,
    base_resolved.naipe,
    base_resolved.division,
    base_resolved.away_team_id AS team_id,
    base_resolved.effective_away_goals AS goals_for,
    base_resolved.effective_home_goals AS goals_against,
    CASE WHEN base_resolved.away_score > base_resolved.home_score THEN 1 ELSE 0 END AS wins,
    CASE WHEN base_resolved.home_score = base_resolved.away_score THEN 1 ELSE 0 END AS draws,
    CASE WHEN base_resolved.away_score < base_resolved.home_score THEN 1 ELSE 0 END AS losses,
    CASE
      WHEN base_resolved.away_score > base_resolved.home_score THEN base_resolved.points_win
      WHEN base_resolved.home_score = base_resolved.away_score THEN base_resolved.points_draw
      ELSE base_resolved.points_loss
    END AS points,
    base_resolved.away_yellow_cards AS yellow_cards,
    base_resolved.away_red_cards AS red_cards
  FROM base_resolved
)
SELECT
  standing_rows.championship_id,
  standing_rows.season_year,
  standing_rows.sport_id,
  standing_rows.naipe,
  standing_rows.division,
  standing_rows.team_id,
  count(*) AS played,
  sum(standing_rows.wins) AS wins,
  sum(standing_rows.draws) AS draws,
  sum(standing_rows.losses) AS losses,
  sum(standing_rows.goals_for) AS goals_for,
  sum(standing_rows.goals_against) AS goals_against,
  sum(standing_rows.goals_for - standing_rows.goals_against) AS goal_diff,
  sum(standing_rows.points) AS points,
  sum(standing_rows.yellow_cards) AS yellow_cards,
  sum(standing_rows.red_cards) AS red_cards,
  now() AS updated_at
FROM standing_rows
GROUP BY
  standing_rows.championship_id,
  standing_rows.season_year,
  standing_rows.sport_id,
  standing_rows.naipe,
  standing_rows.division,
  standing_rows.team_id;

COMMENT ON FUNCTION public.rebuild_standings_scope(UUID, INTEGER, UUID, public.match_naipe, public.team_division) IS 'Recalcula classificação para um escopo específico de campeonato/temporada/modalidade/naipe/divisão. Em modalidades por sets (SETS), GP/GC usam soma dos pontos dos sets.';

NOTIFY pgrst, 'reload schema';
