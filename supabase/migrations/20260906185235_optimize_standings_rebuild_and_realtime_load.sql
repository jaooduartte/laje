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
SET search_path TO 'public'
AS $func$
BEGIN
  WITH scoped_matches AS (
    SELECT
      matches_table.championship_id,
      matches_table.season_year,
      matches_table.sport_id,
      matches_table.naipe,
      matches_table.division,
      matches_table.home_team_id,
      matches_table.away_team_id,
      matches_table.home_penalty_score,
      matches_table.away_penalty_score,
      matches_table.resolved_tie_break_winner_team_id,
      championships_table.code AS championship_code,
      public.normalize_sport_name(sports_table.name) AS normalized_sport_name,
      EXISTS (
        SELECT 1
        FROM public.championship_bracket_matches AS bracket_matches_table
        WHERE bracket_matches_table.match_id = matches_table.id
          AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      ) AS is_knockout_match,
      GREATEST(0, COALESCE(matches_table.home_score, 0)) AS home_score,
      GREATEST(0, COALESCE(matches_table.away_score, 0)) AS away_score,
      COALESCE(championship_sports_table.result_rule, 'POINTS'::public.championship_sport_result_rule) AS result_rule,
      COALESCE(match_set_totals.home_points_total, 0)::bigint AS home_points_total,
      COALESCE(match_set_totals.away_points_total, 0)::bigint AS away_points_total,
      (COALESCE(match_set_totals.sets_count, 0) > 0) AS has_match_sets,
      GREATEST(0, COALESCE(matches_table.home_yellow_cards, 0)) AS home_yellow_cards,
      GREATEST(0, COALESCE(matches_table.home_red_cards, 0)) AS home_red_cards,
      GREATEST(0, COALESCE(matches_table.home_blue_cards, 0)) AS home_blue_cards,
      GREATEST(0, COALESCE(matches_table.home_two_minute_penalties, 0)) AS home_two_minute_penalties,
      GREATEST(0, COALESCE(matches_table.away_yellow_cards, 0)) AS away_yellow_cards,
      GREATEST(0, COALESCE(matches_table.away_red_cards, 0)) AS away_red_cards,
      GREATEST(0, COALESCE(matches_table.away_blue_cards, 0)) AS away_blue_cards,
      GREATEST(0, COALESCE(matches_table.away_two_minute_penalties, 0)) AS away_two_minute_penalties,
      COALESCE(championship_sports_table.points_win, 3) AS points_win,
      COALESCE(championship_sports_table.points_draw, 1) AS points_draw,
      COALESCE(championship_sports_table.points_loss, 0) AS points_loss
    FROM public.matches AS matches_table
    JOIN public.championships AS championships_table
      ON championships_table.id = matches_table.championship_id
    JOIN public.sports AS sports_table
      ON sports_table.id = matches_table.sport_id
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
      AND matches_table.is_double_walkover = false
      AND matches_table.championship_id = _championship_id
      AND matches_table.season_year = _season_year
      AND matches_table.sport_id = _sport_id
      AND matches_table.naipe = _naipe
      AND matches_table.division IS NOT DISTINCT FROM _division
  ), resolved_matches AS (
    SELECT
      scoped_matches.*,
      CASE
        WHEN result_rule = 'SETS'::public.championship_sport_result_rule AND has_match_sets
          THEN home_points_total
        ELSE home_score
      END AS effective_home_goals,
      CASE
        WHEN result_rule = 'SETS'::public.championship_sport_result_rule AND has_match_sets
          THEN away_points_total
        ELSE away_score
      END AS effective_away_goals,
      CASE
        WHEN home_score > away_score THEN home_team_id
        WHEN away_score > home_score THEN away_team_id
        WHEN championship_code = 'SOCIETY'::public.championship_code
          AND is_knockout_match
          AND home_penalty_score IS NOT NULL
          AND away_penalty_score IS NOT NULL
          AND home_penalty_score != away_penalty_score
        THEN resolved_tie_break_winner_team_id
        ELSE NULL
      END AS official_winner_team_id
    FROM scoped_matches
  ), standing_rows AS (
    SELECT
      championship_id, season_year, sport_id, naipe, division,
      home_team_id AS team_id,
      effective_home_goals AS goals_for,
      effective_away_goals AS goals_against,
      CASE WHEN official_winner_team_id = home_team_id THEN 1 ELSE 0 END AS wins,
      CASE WHEN official_winner_team_id IS NULL AND home_score = away_score THEN 1 ELSE 0 END AS draws,
      CASE WHEN official_winner_team_id = away_team_id THEN 1 ELSE 0 END AS losses,
      CASE
        WHEN championship_code = 'INTERLAJE'::public.championship_code
          AND normalized_sport_name = 'voleibol'
          AND home_score = 2 AND away_score = 0 THEN 3
        WHEN championship_code = 'INTERLAJE'::public.championship_code
          AND normalized_sport_name = 'voleibol'
          AND home_score = 2 AND away_score = 1 THEN 2
        WHEN championship_code = 'INTERLAJE'::public.championship_code
          AND normalized_sport_name = 'voleibol'
          AND home_score = 1 AND away_score = 2 THEN 1
        WHEN championship_code = 'INTERLAJE'::public.championship_code
          AND normalized_sport_name = 'voleibol' THEN 0
        WHEN official_winner_team_id = home_team_id THEN points_win
        WHEN official_winner_team_id = away_team_id THEN points_loss
        ELSE points_draw
      END AS points,
      home_yellow_cards AS yellow_cards,
      home_red_cards AS red_cards,
      home_blue_cards AS blue_cards,
      home_two_minute_penalties AS two_minute_penalties
    FROM resolved_matches
    UNION ALL
    SELECT
      championship_id, season_year, sport_id, naipe, division,
      away_team_id AS team_id,
      effective_away_goals AS goals_for,
      effective_home_goals AS goals_against,
      CASE WHEN official_winner_team_id = away_team_id THEN 1 ELSE 0 END AS wins,
      CASE WHEN official_winner_team_id IS NULL AND home_score = away_score THEN 1 ELSE 0 END AS draws,
      CASE WHEN official_winner_team_id = home_team_id THEN 1 ELSE 0 END AS losses,
      CASE
        WHEN championship_code = 'INTERLAJE'::public.championship_code
          AND normalized_sport_name = 'voleibol'
          AND home_score = 0 AND away_score = 2 THEN 3
        WHEN championship_code = 'INTERLAJE'::public.championship_code
          AND normalized_sport_name = 'voleibol'
          AND home_score = 1 AND away_score = 2 THEN 2
        WHEN championship_code = 'INTERLAJE'::public.championship_code
          AND normalized_sport_name = 'voleibol'
          AND home_score = 2 AND away_score = 1 THEN 1
        WHEN championship_code = 'INTERLAJE'::public.championship_code
          AND normalized_sport_name = 'voleibol' THEN 0
        WHEN official_winner_team_id = away_team_id THEN points_win
        WHEN official_winner_team_id = home_team_id THEN points_loss
        ELSE points_draw
      END AS points,
      away_yellow_cards AS yellow_cards,
      away_red_cards AS red_cards,
      away_blue_cards AS blue_cards,
      away_two_minute_penalties AS two_minute_penalties
    FROM resolved_matches
  ), expected_standings AS MATERIALIZED (
    SELECT
      championship_id,
      season_year,
      sport_id,
      naipe,
      division,
      team_id,
      COUNT(*)::integer AS played,
      SUM(wins)::integer AS wins,
      SUM(draws)::integer AS draws,
      SUM(losses)::integer AS losses,
      SUM(goals_for)::integer AS goals_for,
      SUM(goals_against)::integer AS goals_against,
      SUM(goals_for - goals_against)::integer AS goal_diff,
      SUM(points)::integer AS points,
      SUM(yellow_cards)::integer AS yellow_cards,
      SUM(red_cards)::integer AS red_cards,
      SUM(blue_cards)::integer AS blue_cards,
      SUM(two_minute_penalties)::integer AS two_minute_penalties
    FROM standing_rows
    GROUP BY championship_id, season_year, sport_id, naipe, division, team_id
  ), updated_standings AS (
    UPDATE public.standings AS standings_table
    SET
      played = expected_standings.played,
      wins = expected_standings.wins,
      draws = expected_standings.draws,
      losses = expected_standings.losses,
      goals_for = expected_standings.goals_for,
      goals_against = expected_standings.goals_against,
      goal_diff = expected_standings.goal_diff,
      points = expected_standings.points,
      yellow_cards = expected_standings.yellow_cards,
      red_cards = expected_standings.red_cards,
      blue_cards = expected_standings.blue_cards,
      two_minute_penalties = expected_standings.two_minute_penalties,
      updated_at = now()
    FROM expected_standings
    WHERE standings_table.championship_id = expected_standings.championship_id
      AND standings_table.season_year = expected_standings.season_year
      AND standings_table.sport_id = expected_standings.sport_id
      AND standings_table.naipe = expected_standings.naipe
      AND standings_table.division IS NOT DISTINCT FROM expected_standings.division
      AND standings_table.team_id = expected_standings.team_id
      AND (
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
        standings_table.blue_cards,
        standings_table.two_minute_penalties
      ) IS DISTINCT FROM (
        expected_standings.played,
        expected_standings.wins,
        expected_standings.draws,
        expected_standings.losses,
        expected_standings.goals_for,
        expected_standings.goals_against,
        expected_standings.goal_diff,
        expected_standings.points,
        expected_standings.yellow_cards,
        expected_standings.red_cards,
        expected_standings.blue_cards,
        expected_standings.two_minute_penalties
      )
    RETURNING standings_table.id
  ), inserted_standings AS (
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
      blue_cards,
      two_minute_penalties,
      updated_at
    )
    SELECT
      expected_standings.championship_id,
      expected_standings.season_year,
      expected_standings.sport_id,
      expected_standings.naipe,
      expected_standings.division,
      expected_standings.team_id,
      expected_standings.played,
      expected_standings.wins,
      expected_standings.draws,
      expected_standings.losses,
      expected_standings.goals_for,
      expected_standings.goals_against,
      expected_standings.goal_diff,
      expected_standings.points,
      expected_standings.yellow_cards,
      expected_standings.red_cards,
      expected_standings.blue_cards,
      expected_standings.two_minute_penalties,
      now()
    FROM expected_standings
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.standings AS standings_table
      WHERE standings_table.championship_id = expected_standings.championship_id
        AND standings_table.season_year = expected_standings.season_year
        AND standings_table.sport_id = expected_standings.sport_id
        AND standings_table.naipe = expected_standings.naipe
        AND standings_table.division IS NOT DISTINCT FROM expected_standings.division
        AND standings_table.team_id = expected_standings.team_id
    )
    RETURNING id
  )
  DELETE FROM public.standings AS standings_table
  WHERE standings_table.championship_id = _championship_id
    AND standings_table.season_year = _season_year
    AND standings_table.sport_id = _sport_id
    AND standings_table.naipe = _naipe
    AND standings_table.division IS NOT DISTINCT FROM _division
    AND NOT EXISTS (
      SELECT 1
      FROM expected_standings
      WHERE expected_standings.team_id = standings_table.team_id
    );
END;
$func$;

CREATE OR REPLACE FUNCTION public.update_standings_on_finish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  scope_changed BOOLEAN;
  classification_changed BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'FINISHED'::public.match_status THEN
      PERFORM public.rebuild_standings_scope(
        OLD.championship_id,
        OLD.season_year,
        OLD.sport_id,
        OLD.naipe,
        OLD.division
      );
    END IF;

    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'FINISHED'::public.match_status THEN
      PERFORM public.rebuild_standings_scope(
        NEW.championship_id,
        NEW.season_year,
        NEW.sport_id,
        NEW.naipe,
        NEW.division
      );
    END IF;

    RETURN NEW;
  END IF;

  scope_changed :=
    OLD.championship_id IS DISTINCT FROM NEW.championship_id
    OR OLD.season_year IS DISTINCT FROM NEW.season_year
    OR OLD.sport_id IS DISTINCT FROM NEW.sport_id
    OR OLD.naipe IS DISTINCT FROM NEW.naipe
    OR OLD.division IS DISTINCT FROM NEW.division;

  classification_changed :=
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.home_team_id IS DISTINCT FROM NEW.home_team_id
    OR OLD.away_team_id IS DISTINCT FROM NEW.away_team_id
    OR OLD.home_score IS DISTINCT FROM NEW.home_score
    OR OLD.away_score IS DISTINCT FROM NEW.away_score
    OR OLD.home_penalty_score IS DISTINCT FROM NEW.home_penalty_score
    OR OLD.away_penalty_score IS DISTINCT FROM NEW.away_penalty_score
    OR OLD.resolved_tie_breaker_rule IS DISTINCT FROM NEW.resolved_tie_breaker_rule
    OR OLD.resolved_tie_break_winner_team_id IS DISTINCT FROM NEW.resolved_tie_break_winner_team_id
    OR OLD.is_walkover IS DISTINCT FROM NEW.is_walkover
    OR OLD.is_double_walkover IS DISTINCT FROM NEW.is_double_walkover
    OR OLD.walkover_loser_team_id IS DISTINCT FROM NEW.walkover_loser_team_id
    OR OLD.home_yellow_cards IS DISTINCT FROM NEW.home_yellow_cards
    OR OLD.away_yellow_cards IS DISTINCT FROM NEW.away_yellow_cards
    OR OLD.home_red_cards IS DISTINCT FROM NEW.home_red_cards
    OR OLD.away_red_cards IS DISTINCT FROM NEW.away_red_cards
    OR OLD.home_blue_cards IS DISTINCT FROM NEW.home_blue_cards
    OR OLD.away_blue_cards IS DISTINCT FROM NEW.away_blue_cards
    OR OLD.home_two_minute_penalties IS DISTINCT FROM NEW.home_two_minute_penalties
    OR OLD.away_two_minute_penalties IS DISTINCT FROM NEW.away_two_minute_penalties;

  IF OLD.status = 'FINISHED'::public.match_status
    AND NEW.status = 'FINISHED'::public.match_status THEN
    IF NOT scope_changed AND NOT classification_changed THEN
      RETURN NEW;
    END IF;

    PERFORM public.rebuild_standings_scope(
      OLD.championship_id,
      OLD.season_year,
      OLD.sport_id,
      OLD.naipe,
      OLD.division
    );

    IF scope_changed THEN
      PERFORM public.rebuild_standings_scope(
        NEW.championship_id,
        NEW.season_year,
        NEW.sport_id,
        NEW.naipe,
        NEW.division
      );
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.status = 'FINISHED'::public.match_status THEN
    PERFORM public.rebuild_standings_scope(
      OLD.championship_id,
      OLD.season_year,
      OLD.sport_id,
      OLD.naipe,
      OLD.division
    );
  END IF;

  IF NEW.status = 'FINISHED'::public.match_status THEN
    PERFORM public.rebuild_standings_scope(
      NEW.championship_id,
      NEW.season_year,
      NEW.sport_id,
      NEW.naipe,
      NEW.division
    );
  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS update_standings_trigger ON public.matches;

CREATE TRIGGER update_standings_trigger
AFTER INSERT OR DELETE OR UPDATE OF
  championship_id,
  season_year,
  sport_id,
  naipe,
  division,
  status,
  home_team_id,
  away_team_id,
  home_score,
  away_score,
  home_penalty_score,
  away_penalty_score,
  resolved_tie_breaker_rule,
  resolved_tie_break_winner_team_id,
  is_walkover,
  is_double_walkover,
  walkover_loser_team_id,
  home_yellow_cards,
  away_yellow_cards,
  home_red_cards,
  away_red_cards,
  home_blue_cards,
  away_blue_cards,
  home_two_minute_penalties,
  away_two_minute_penalties
ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.update_standings_on_finish();

NOTIFY pgrst, 'reload schema';
