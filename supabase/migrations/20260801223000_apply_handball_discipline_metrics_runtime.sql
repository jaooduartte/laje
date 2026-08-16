DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.championship_sport_tie_breaker_rule'::regtype
      AND enumlabel = 'HANDEBOL'
  ) THEN
    ALTER TYPE public.championship_sport_tie_breaker_rule ADD VALUE 'HANDEBOL';
  END IF;
END;
$$;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS home_blue_cards INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS away_blue_cards INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS home_two_minute_penalties INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS away_two_minute_penalties INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.standings
  ADD COLUMN IF NOT EXISTS blue_cards INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS two_minute_penalties INTEGER NOT NULL DEFAULT 0;

UPDATE public.matches
SET
  home_blue_cards = GREATEST(0, COALESCE(home_blue_cards, 0)),
  away_blue_cards = GREATEST(0, COALESCE(away_blue_cards, 0)),
  home_two_minute_penalties = GREATEST(0, COALESCE(home_two_minute_penalties, 0)),
  away_two_minute_penalties = GREATEST(0, COALESCE(away_two_minute_penalties, 0));

UPDATE public.standings
SET
  blue_cards = GREATEST(0, COALESCE(blue_cards, 0)),
  two_minute_penalties = GREATEST(0, COALESCE(two_minute_penalties, 0));

CREATE OR REPLACE FUNCTION public.sync_championship_sport_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $func$
DECLARE
  championship_code public.championship_code;
  championship_sport_name TEXT;
  normalized_championship_sport_name TEXT;
BEGIN
  SELECT championships_table.code
  INTO championship_code
  FROM public.championships AS championships_table
  WHERE championships_table.id = NEW.championship_id
  LIMIT 1;

  SELECT sports_table.name
  INTO championship_sport_name
  FROM public.sports AS sports_table
  WHERE sports_table.id = NEW.sport_id
  LIMIT 1;

  IF championship_code IS NULL OR championship_sport_name IS NULL THEN
    RAISE EXCEPTION 'Configuração inválida de modalidade para campeonato.';
  END IF;

  normalized_championship_sport_name := public.normalize_sport_name(championship_sport_name);

  NEW.supports_individual_awards := false;
  NEW.awards_include_knockout_phase := false;

  IF normalized_championship_sport_name = 'beach soccer' THEN
    NEW.supports_cards := true;
    NEW.tie_breaker_rule := 'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule;
    NEW.result_rule := 'POINTS'::public.championship_sport_result_rule;
  ELSIF normalized_championship_sport_name = 'beach tennis' THEN
    NEW.supports_cards := false;
    NEW.tie_breaker_rule := 'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule;
    NEW.result_rule := 'SETS'::public.championship_sport_result_rule;
  ELSIF normalized_championship_sport_name IN ('futevolei', 'volei de praia', 'voleibol') THEN
    NEW.supports_cards := false;
    NEW.tie_breaker_rule := 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule;
    NEW.result_rule := 'SETS'::public.championship_sport_result_rule;
  ELSIF normalized_championship_sport_name IN ('futebol society', 'futsal') THEN
    NEW.supports_cards := true;
    NEW.tie_breaker_rule := 'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule;
    NEW.result_rule := 'POINTS'::public.championship_sport_result_rule;
  ELSIF normalized_championship_sport_name = 'handebol' THEN
    NEW.supports_cards := true;
    NEW.tie_breaker_rule := 'HANDEBOL'::public.championship_sport_tie_breaker_rule;
    NEW.result_rule := 'POINTS'::public.championship_sport_result_rule;
  ELSE
    NEW.supports_cards := false;
    NEW.tie_breaker_rule := 'STANDARD'::public.championship_sport_tie_breaker_rule;
    NEW.result_rule := 'POINTS'::public.championship_sport_result_rule;
  END IF;

  IF championship_code = 'CLV'::public.championship_code THEN
    IF normalized_championship_sport_name = 'beach soccer' THEN
      NEW.naipe_mode := 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode;
      NEW.points_win := 3;
      NEW.points_draw := 1;
      NEW.points_loss := 0;
    ELSIF normalized_championship_sport_name = 'beach tennis' THEN
      NEW.naipe_mode := 'MISTO'::public.championship_sport_naipe_mode;
      NEW.points_win := 3;
      NEW.points_draw := 0;
      NEW.points_loss := 0;
    ELSIF normalized_championship_sport_name IN ('futevolei', 'volei de praia') THEN
      NEW.naipe_mode := 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode;
      NEW.points_win := 3;
      NEW.points_draw := 0;
      NEW.points_loss := 0;
    ELSE
      RAISE EXCEPTION 'No CLV, somente modalidades oficiais do regulamento podem ser vinculadas.';
    END IF;
  ELSIF championship_code = 'SOCIETY'::public.championship_code THEN
    IF normalized_championship_sport_name <> 'futebol society' THEN
      RAISE EXCEPTION 'Na Copa Laje Society, somente Futebol Society pode ser vinculado.';
    END IF;

    NEW.naipe_mode := 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode;
    NEW.points_win := 3;
    NEW.points_draw := 1;
    NEW.points_loss := 0;
    NEW.supports_individual_awards := true;
    NEW.awards_include_knockout_phase := true;
  ELSIF championship_code = 'INTERLAJE'::public.championship_code THEN
    IF normalized_championship_sport_name IN ('basquetebol', 'futsal', 'handebol') THEN
      NEW.naipe_mode := 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode;
      NEW.points_win := 3;
      NEW.points_draw := 1;
      NEW.points_loss := 0;
    ELSIF normalized_championship_sport_name = 'voleibol' THEN
      NEW.naipe_mode := 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode;
      NEW.points_win := 3;
      NEW.points_draw := 0;
      NEW.points_loss := 0;
    ELSIF normalized_championship_sport_name IN ('natacao', 'atletismo') THEN
      NEW.naipe_mode := 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode;
      NEW.points_win := 24;
      NEW.points_draw := 0;
      NEW.points_loss := 0;
    ELSE
      RAISE EXCEPTION 'No Interlaje, somente modalidades oficiais do regulamento podem ser vinculadas.';
    END IF;
  END IF;

  RETURN NEW;
END;
$func$;

UPDATE public.championship_sports AS championship_sports_table
SET tie_breaker_rule = 'HANDEBOL'::public.championship_sport_tie_breaker_rule
FROM public.championships AS championships_table,
     public.sports AS sports_table
WHERE championships_table.id = championship_sports_table.championship_id
  AND sports_table.id = championship_sports_table.sport_id
  AND championships_table.code = 'INTERLAJE'::public.championship_code
  AND public.normalize_sport_name(sports_table.name) = 'handebol';

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
    blue_cards,
    two_minute_penalties,
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
      matches_table.home_penalty_score,
      matches_table.away_penalty_score,
      matches_table.resolved_tie_break_winner_team_id,
      championships_table.code AS championship_code,
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
      AND COALESCE(matches_table.is_double_walkover, false) = false
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
      END AS effective_away_goals,
      CASE
        WHEN scoped_matches.home_score > scoped_matches.away_score THEN scoped_matches.home_team_id
        WHEN scoped_matches.away_score > scoped_matches.home_score THEN scoped_matches.away_team_id
        WHEN scoped_matches.championship_code = 'SOCIETY'::public.championship_code
          AND scoped_matches.is_knockout_match = true
          AND scoped_matches.home_penalty_score IS NOT NULL
          AND scoped_matches.away_penalty_score IS NOT NULL
          AND scoped_matches.home_penalty_score != scoped_matches.away_penalty_score
        THEN scoped_matches.resolved_tie_break_winner_team_id
        ELSE NULL
      END AS official_winner_team_id
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
      CASE WHEN scoped_resolved.official_winner_team_id = scoped_resolved.home_team_id THEN 1 ELSE 0 END AS wins,
      CASE WHEN scoped_resolved.official_winner_team_id IS NULL AND scoped_resolved.home_score = scoped_resolved.away_score THEN 1 ELSE 0 END AS draws,
      CASE WHEN scoped_resolved.official_winner_team_id = scoped_resolved.away_team_id THEN 1 ELSE 0 END AS losses,
      CASE
        WHEN scoped_resolved.official_winner_team_id = scoped_resolved.home_team_id THEN scoped_resolved.points_win
        WHEN scoped_resolved.official_winner_team_id = scoped_resolved.away_team_id THEN scoped_resolved.points_loss
        ELSE scoped_resolved.points_draw
      END AS points,
      scoped_resolved.home_yellow_cards AS yellow_cards,
      scoped_resolved.home_red_cards AS red_cards,
      scoped_resolved.home_blue_cards AS blue_cards,
      scoped_resolved.home_two_minute_penalties AS two_minute_penalties
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
      CASE WHEN scoped_resolved.official_winner_team_id = scoped_resolved.away_team_id THEN 1 ELSE 0 END AS wins,
      CASE WHEN scoped_resolved.official_winner_team_id IS NULL AND scoped_resolved.home_score = scoped_resolved.away_score THEN 1 ELSE 0 END AS draws,
      CASE WHEN scoped_resolved.official_winner_team_id = scoped_resolved.home_team_id THEN 1 ELSE 0 END AS losses,
      CASE
        WHEN scoped_resolved.official_winner_team_id = scoped_resolved.away_team_id THEN scoped_resolved.points_win
        WHEN scoped_resolved.official_winner_team_id = scoped_resolved.home_team_id THEN scoped_resolved.points_loss
        ELSE scoped_resolved.points_draw
      END AS points,
      scoped_resolved.away_yellow_cards AS yellow_cards,
      scoped_resolved.away_red_cards AS red_cards,
      scoped_resolved.away_blue_cards AS blue_cards,
      scoped_resolved.away_two_minute_penalties AS two_minute_penalties
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
    sum(standing_rows.blue_cards) AS blue_cards,
    sum(standing_rows.two_minute_penalties) AS two_minute_penalties,
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

CREATE OR REPLACE FUNCTION public.handle_championship_bracket_match_finished()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  bracket_match_record RECORD;
  should_reconcile_group_competition BOOLEAN := false;
  should_propagate_knockout_progress BOOLEAN := false;
BEGIN
  SELECT
    bracket_matches_table.id,
    bracket_matches_table.bracket_edition_id,
    bracket_matches_table.competition_id,
    bracket_matches_table.phase
  INTO bracket_match_record
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.match_id = NEW.id
  LIMIT 1;

  IF bracket_match_record.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF bracket_match_record.phase = 'GROUP_STAGE'::public.bracket_phase THEN
    should_reconcile_group_competition := (
      (
        OLD.status IS DISTINCT FROM NEW.status
        AND (
          OLD.status = 'FINISHED'::public.match_status
          OR NEW.status = 'FINISHED'::public.match_status
        )
      )
      OR (
        OLD.status = 'FINISHED'::public.match_status
        AND NEW.status = 'FINISHED'::public.match_status
        AND (
          NEW.home_score IS DISTINCT FROM OLD.home_score
          OR NEW.away_score IS DISTINCT FROM OLD.away_score
          OR NEW.home_yellow_cards IS DISTINCT FROM OLD.home_yellow_cards
          OR NEW.away_yellow_cards IS DISTINCT FROM OLD.away_yellow_cards
          OR NEW.home_red_cards IS DISTINCT FROM OLD.home_red_cards
          OR NEW.away_red_cards IS DISTINCT FROM OLD.away_red_cards
          OR NEW.home_blue_cards IS DISTINCT FROM OLD.home_blue_cards
          OR NEW.away_blue_cards IS DISTINCT FROM OLD.away_blue_cards
          OR NEW.home_two_minute_penalties IS DISTINCT FROM OLD.home_two_minute_penalties
          OR NEW.away_two_minute_penalties IS DISTINCT FROM OLD.away_two_minute_penalties
          OR NEW.resolved_tie_breaker_rule IS DISTINCT FROM OLD.resolved_tie_breaker_rule
          OR NEW.resolved_tie_break_winner_team_id IS DISTINCT FROM OLD.resolved_tie_break_winner_team_id
          OR NEW.is_walkover IS DISTINCT FROM OLD.is_walkover
          OR NEW.is_double_walkover IS DISTINCT FROM OLD.is_double_walkover
          OR NEW.walkover_loser_team_id IS DISTINCT FROM OLD.walkover_loser_team_id
        )
      )
    );

    IF should_reconcile_group_competition THEN
      PERFORM public.generate_championship_knockout_for_competition(
        NEW.championship_id,
        bracket_match_record.competition_id,
        bracket_match_record.bracket_edition_id
      );
    END IF;

    PERFORM public.sync_championship_bracket_edition_status(bracket_match_record.bracket_edition_id);
    RETURN NEW;
  END IF;

  should_propagate_knockout_progress := (
    bracket_match_record.phase = 'KNOCKOUT'::public.bracket_phase
    AND NEW.status = 'FINISHED'::public.match_status
    AND (
      OLD.status != 'FINISHED'::public.match_status
      OR NEW.home_score IS DISTINCT FROM OLD.home_score
      OR NEW.away_score IS DISTINCT FROM OLD.away_score
      OR NEW.home_penalty_score IS DISTINCT FROM OLD.home_penalty_score
      OR NEW.away_penalty_score IS DISTINCT FROM OLD.away_penalty_score
      OR NEW.resolved_tie_breaker_rule IS DISTINCT FROM OLD.resolved_tie_breaker_rule
      OR NEW.resolved_tie_break_winner_team_id IS DISTINCT FROM OLD.resolved_tie_break_winner_team_id
    )
  );

  IF should_propagate_knockout_progress THEN
    PERFORM public.generate_championship_knockout_for_competition(
      NEW.championship_id,
      bracket_match_record.competition_id,
      bracket_match_record.bracket_edition_id
    );
    PERFORM public.sync_championship_bracket_edition_status(bracket_match_record.bracket_edition_id);
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_championship_bracket_competition_group_rankings(
  _championship_id UUID,
  _competition_id UUID
)
RETURNS TABLE(
  competition_id UUID,
  group_id UUID,
  group_number INTEGER,
  team_id UUID,
  team_name TEXT,
  points BIGINT,
  wins BIGINT,
  goal_diff BIGINT,
  goals_for BIGINT,
  team_rank INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  WITH competition_context AS (
    SELECT
      competitions_table.id,
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
  group_scores AS (
    SELECT
      bracket_matches_table.group_id,
      matches_table.home_team_id AS team_id,
      matches_table.home_score::bigint AS goals_for,
      matches_table.away_score::bigint AS goals_against,
      CASE
        WHEN matches_table.home_score > matches_table.away_score THEN (SELECT points_win FROM competition_context)
        WHEN matches_table.home_score = matches_table.away_score THEN (SELECT points_draw FROM competition_context)
        ELSE (SELECT points_loss FROM competition_context)
      END::bigint AS points,
      CASE WHEN matches_table.home_score > matches_table.away_score THEN 1 ELSE 0 END::bigint AS wins,
      GREATEST(0, COALESCE(matches_table.home_yellow_cards, 0))::bigint AS yellow_cards,
      GREATEST(0, COALESCE(matches_table.home_red_cards, 0))::bigint AS red_cards,
      GREATEST(0, COALESCE(matches_table.home_blue_cards, 0))::bigint AS blue_cards,
      GREATEST(0, COALESCE(matches_table.home_two_minute_penalties, 0))::bigint AS two_minute_penalties
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
      AND matches_table.status = 'FINISHED'::public.match_status

    UNION ALL

    SELECT
      bracket_matches_table.group_id,
      matches_table.away_team_id AS team_id,
      matches_table.away_score::bigint AS goals_for,
      matches_table.home_score::bigint AS goals_against,
      CASE
        WHEN matches_table.away_score > matches_table.home_score THEN (SELECT points_win FROM competition_context)
        WHEN matches_table.away_score = matches_table.home_score THEN (SELECT points_draw FROM competition_context)
        ELSE (SELECT points_loss FROM competition_context)
      END::bigint AS points,
      CASE WHEN matches_table.away_score > matches_table.home_score THEN 1 ELSE 0 END::bigint AS wins,
      GREATEST(0, COALESCE(matches_table.away_yellow_cards, 0))::bigint AS yellow_cards,
      GREATEST(0, COALESCE(matches_table.away_red_cards, 0))::bigint AS red_cards,
      GREATEST(0, COALESCE(matches_table.away_blue_cards, 0))::bigint AS blue_cards,
      GREATEST(0, COALESCE(matches_table.away_two_minute_penalties, 0))::bigint AS two_minute_penalties
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
      AND matches_table.status = 'FINISHED'::public.match_status
  ),
  raw_group_rows AS (
    SELECT
      groups_table.id AS group_id,
      groups_table.group_number,
      group_teams_table.team_id,
      COALESCE(sum(group_scores.points), 0)::bigint AS points,
      COALESCE(sum(group_scores.wins), 0)::bigint AS wins,
      COALESCE(sum(group_scores.goals_for - group_scores.goals_against), 0)::bigint AS goal_diff,
      COALESCE(sum(group_scores.goals_for), 0)::bigint AS goals_for,
      COALESCE(sum(group_scores.goals_against), 0)::bigint AS goals_against,
      COALESCE(sum(group_scores.yellow_cards), 0)::bigint AS yellow_cards,
      COALESCE(sum(group_scores.red_cards), 0)::bigint AS red_cards,
      COALESCE(sum(group_scores.blue_cards), 0)::bigint AS blue_cards,
      COALESCE(sum(group_scores.two_minute_penalties), 0)::bigint AS two_minute_penalties
    FROM public.championship_bracket_groups AS groups_table
    JOIN public.championship_bracket_group_teams AS group_teams_table
      ON group_teams_table.group_id = groups_table.id
    LEFT JOIN group_scores
      ON group_scores.group_id = groups_table.id
      AND group_scores.team_id = group_teams_table.team_id
    WHERE groups_table.competition_id = _competition_id
    GROUP BY groups_table.id, groups_table.group_number, group_teams_table.team_id
  ),
  group_rows AS (
    SELECT
      raw_group_rows.group_id,
      raw_group_rows.group_number,
      raw_group_rows.team_id,
      raw_group_rows.points,
      raw_group_rows.wins,
      COALESCE(standings_table.goal_diff, raw_group_rows.goal_diff)::bigint AS goal_diff,
      COALESCE(standings_table.goals_for, raw_group_rows.goals_for)::bigint AS goals_for,
      COALESCE(standings_table.goals_against, GREATEST(raw_group_rows.goals_for - COALESCE(standings_table.goal_diff, raw_group_rows.goal_diff), 0))::bigint AS goals_against,
      COALESCE(standings_table.yellow_cards, raw_group_rows.yellow_cards)::bigint AS yellow_cards,
      COALESCE(standings_table.red_cards, raw_group_rows.red_cards)::bigint AS red_cards,
      COALESCE(standings_table.blue_cards, raw_group_rows.blue_cards)::bigint AS blue_cards,
      COALESCE(standings_table.two_minute_penalties, raw_group_rows.two_minute_penalties)::bigint AS two_minute_penalties,
      CASE
        WHEN COALESCE(standings_table.goals_against, GREATEST(raw_group_rows.goals_for - COALESCE(standings_table.goal_diff, raw_group_rows.goal_diff), 0)) = 0 THEN
          CASE
            WHEN COALESCE(standings_table.goals_for, raw_group_rows.goals_for) = 0 THEN 0::numeric
            ELSE 1000000000::numeric
          END
        ELSE COALESCE(standings_table.goals_for, raw_group_rows.goals_for)::numeric / COALESCE(standings_table.goals_against, GREATEST(raw_group_rows.goals_for - COALESCE(standings_table.goal_diff, raw_group_rows.goal_diff), 0))::numeric
      END AS points_average
    FROM raw_group_rows
    CROSS JOIN competition_context
    LEFT JOIN public.standings AS standings_table
      ON standings_table.championship_id = _championship_id
      AND standings_table.season_year = competition_context.season_year
      AND standings_table.sport_id = competition_context.sport_id
      AND standings_table.naipe = competition_context.naipe
      AND standings_table.division IS NOT DISTINCT FROM competition_context.division
      AND standings_table.team_id = raw_group_rows.team_id
  ),
  unresolved_metric_tie_sets AS (
    SELECT
      group_rows.group_id,
      string_agg(group_rows.team_id::text, '|' ORDER BY group_rows.team_id::text) AS tied_team_signature,
      array_agg(group_rows.team_id ORDER BY group_rows.team_id::text) AS tied_team_ids
    FROM group_rows
    CROSS JOIN competition_context
    GROUP BY
      group_rows.group_id,
      group_rows.points,
      CASE
        WHEN competition_context.tie_breaker_rule IN (
          'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
          'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule,
          'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule,
          'STANDARD'::public.championship_sport_tie_breaker_rule
        ) THEN group_rows.wins
        ELSE NULL::bigint
      END,
      group_rows.goal_diff,
      group_rows.goals_for,
      CASE
        WHEN competition_context.tie_breaker_rule = 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule
          THEN group_rows.points_average
        ELSE NULL::numeric
      END,
      CASE
        WHEN competition_context.tie_breaker_rule = 'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule
          THEN group_rows.goals_against
        ELSE NULL::bigint
      END,
      CASE
        WHEN competition_context.tie_breaker_rule = 'HANDEBOL'::public.championship_sport_tie_breaker_rule
          THEN group_rows.blue_cards
        ELSE NULL::bigint
      END,
      CASE
        WHEN competition_context.tie_breaker_rule = 'HANDEBOL'::public.championship_sport_tie_breaker_rule
          THEN group_rows.two_minute_penalties
        ELSE NULL::bigint
      END,
      CASE
        WHEN competition_context.tie_breaker_rule IN (
          'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
          'STANDARD'::public.championship_sport_tie_breaker_rule,
          'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule
        ) THEN group_rows.yellow_cards
        ELSE NULL::bigint
      END,
      CASE
        WHEN competition_context.tie_breaker_rule IN (
          'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
          'STANDARD'::public.championship_sport_tie_breaker_rule,
          'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule
        ) THEN group_rows.red_cards
        ELSE NULL::bigint
      END,
      competition_context.tie_breaker_rule
    HAVING count(*) > 1
  ),
  unresolved_tie_context_members AS (
    SELECT
      unresolved_metric_tie_sets.group_id,
      unnest(unresolved_metric_tie_sets.tied_team_ids) AS team_id,
      public.build_championship_bracket_tie_break_context_key(
        'GROUP'::public.championship_bracket_tie_break_context_type,
        _competition_id,
        unresolved_metric_tie_sets.group_id,
        NULL,
        unresolved_metric_tie_sets.tied_team_signature
      ) AS context_key
    FROM unresolved_metric_tie_sets
  ),
  unresolved_tie_resolution_orders AS (
    SELECT
      unresolved_tie_context_members.group_id,
      unresolved_tie_context_members.team_id,
      resolution_teams_table.draw_order
    FROM unresolved_tie_context_members
    LEFT JOIN public.championship_bracket_tie_break_resolutions AS resolutions_table
      ON resolutions_table.context_key = unresolved_tie_context_members.context_key
    LEFT JOIN public.championship_bracket_tie_break_resolution_teams AS resolution_teams_table
      ON resolution_teams_table.resolution_id = resolutions_table.id
      AND resolution_teams_table.team_id = unresolved_tie_context_members.team_id
  ),
  direct_confrontation_pair_candidates AS (
    SELECT
      group_rows.group_id,
      array_agg(group_rows.team_id ORDER BY group_rows.team_id::text) AS team_ids
    FROM group_rows
    CROSS JOIN competition_context
    GROUP BY
      group_rows.group_id,
      group_rows.points,
      CASE
        WHEN competition_context.tie_breaker_rule = 'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule
          THEN group_rows.wins
        ELSE NULL::bigint
      END,
      competition_context.tie_breaker_rule
    HAVING count(*) = 2
      AND competition_context.tie_breaker_rule IN (
        'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
        'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule,
        'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule,
        'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule,
        'HANDEBOL'::public.championship_sport_tie_breaker_rule
      )
  ),
  direct_confrontation_pair_stats AS (
    SELECT
      direct_confrontation_pair_candidates.group_id,
      direct_confrontation_pair_candidates.team_ids[1] AS first_team_id,
      direct_confrontation_pair_candidates.team_ids[2] AS second_team_id,
      COALESCE(sum(
        CASE
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.home_score > matches_table.away_score THEN 3
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.home_score = matches_table.away_score THEN 1
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.away_score > matches_table.home_score THEN 3
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.away_score = matches_table.home_score THEN 1
          ELSE 0
        END
      ), 0)::int AS first_team_points,
      COALESCE(sum(
        CASE
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.home_score > matches_table.away_score THEN 3
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.home_score = matches_table.away_score THEN 1
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.away_score > matches_table.home_score THEN 3
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.away_score = matches_table.home_score THEN 1
          ELSE 0
        END
      ), 0)::int AS second_team_points,
      COALESCE(sum(
        CASE
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[2] THEN matches_table.home_score
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[1] THEN matches_table.away_score
          ELSE 0
        END
      ), 0)::int AS first_team_goals,
      COALESCE(sum(
        CASE
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[1] THEN matches_table.home_score
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[2] THEN matches_table.away_score
          ELSE 0
        END
      ), 0)::int AS second_team_goals
    FROM direct_confrontation_pair_candidates
    LEFT JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.group_id = direct_confrontation_pair_candidates.group_id
      AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
      AND matches_table.status = 'FINISHED'::public.match_status
      AND (
        (
          matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[1]
          AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[2]
        )
        OR
        (
          matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[2]
          AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[1]
        )
      )
    GROUP BY direct_confrontation_pair_candidates.group_id, direct_confrontation_pair_candidates.team_ids
  ),
  direct_confrontation_orders AS (
    SELECT
      direct_confrontation_pair_stats.group_id,
      direct_confrontation_pair_stats.first_team_id AS team_id,
      CASE
        WHEN
          direct_confrontation_pair_stats.first_team_points > direct_confrontation_pair_stats.second_team_points
          OR (
            direct_confrontation_pair_stats.first_team_points = direct_confrontation_pair_stats.second_team_points
            AND direct_confrontation_pair_stats.first_team_goals > direct_confrontation_pair_stats.second_team_goals
          ) THEN 0
        WHEN
          direct_confrontation_pair_stats.second_team_points > direct_confrontation_pair_stats.first_team_points
          OR (
            direct_confrontation_pair_stats.second_team_points = direct_confrontation_pair_stats.first_team_points
            AND direct_confrontation_pair_stats.second_team_goals > direct_confrontation_pair_stats.first_team_goals
          ) THEN 1
        ELSE NULL::int
      END AS direct_order
    FROM direct_confrontation_pair_stats

    UNION ALL

    SELECT
      direct_confrontation_pair_stats.group_id,
      direct_confrontation_pair_stats.second_team_id AS team_id,
      CASE
        WHEN
          direct_confrontation_pair_stats.second_team_points > direct_confrontation_pair_stats.first_team_points
          OR (
            direct_confrontation_pair_stats.second_team_points = direct_confrontation_pair_stats.first_team_points
            AND direct_confrontation_pair_stats.second_team_goals > direct_confrontation_pair_stats.first_team_goals
          ) THEN 0
        WHEN
          direct_confrontation_pair_stats.first_team_points > direct_confrontation_pair_stats.second_team_points
          OR (
            direct_confrontation_pair_stats.first_team_points = direct_confrontation_pair_stats.second_team_points
            AND direct_confrontation_pair_stats.first_team_goals > direct_confrontation_pair_stats.second_team_goals
          ) THEN 1
        ELSE NULL::int
      END AS direct_order
    FROM direct_confrontation_pair_stats
  ),
  ranked AS (
    SELECT
      _competition_id AS competition_id,
      group_rows.group_id,
      group_rows.group_number,
      group_rows.team_id,
      teams_table.name AS team_name,
      group_rows.points,
      group_rows.wins,
      group_rows.goal_diff,
      group_rows.goals_for,
      row_number() OVER (
        PARTITION BY group_rows.group_id
        ORDER BY
          group_rows.points DESC,
          CASE
            WHEN competition_context.tie_breaker_rule IN (
              'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
              'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule,
              'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule,
              'HANDEBOL'::public.championship_sport_tie_breaker_rule
            ) THEN direct_confrontation_orders.direct_order
            ELSE NULL::int
          END ASC NULLS LAST,
          CASE
            WHEN competition_context.tie_breaker_rule IN (
              'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
              'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule
            ) THEN group_rows.wins
            ELSE NULL::bigint
          END DESC NULLS LAST,
          CASE
            WHEN competition_context.tie_breaker_rule = 'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule
              THEN direct_confrontation_orders.direct_order
            ELSE NULL::int
          END ASC NULLS LAST,
          CASE
            WHEN competition_context.tie_breaker_rule = 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule
              THEN group_rows.points_average
            ELSE NULL::numeric
          END DESC NULLS LAST,
          group_rows.goal_diff DESC,
          group_rows.goals_for DESC,
          CASE
            WHEN competition_context.tie_breaker_rule = 'HANDEBOL'::public.championship_sport_tie_breaker_rule
              THEN group_rows.blue_cards
            ELSE NULL::bigint
          END ASC NULLS LAST,
          CASE
            WHEN competition_context.tie_breaker_rule = 'HANDEBOL'::public.championship_sport_tie_breaker_rule
              THEN group_rows.two_minute_penalties
            ELSE NULL::bigint
          END ASC NULLS LAST,
          CASE
            WHEN competition_context.tie_breaker_rule IN (
              'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule,
              'STANDARD'::public.championship_sport_tie_breaker_rule
            ) THEN group_rows.wins
            ELSE NULL::bigint
          END DESC NULLS LAST,
          CASE
            WHEN competition_context.tie_breaker_rule = 'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule
              THEN group_rows.goals_against
            ELSE NULL::bigint
          END ASC NULLS LAST,
          CASE
            WHEN competition_context.tie_breaker_rule IN (
              'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
              'STANDARD'::public.championship_sport_tie_breaker_rule,
              'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule
            ) THEN group_rows.yellow_cards
            ELSE NULL::bigint
          END ASC NULLS LAST,
          CASE
            WHEN competition_context.tie_breaker_rule IN (
              'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
              'STANDARD'::public.championship_sport_tie_breaker_rule,
              'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule
            ) THEN group_rows.red_cards
            ELSE NULL::bigint
          END ASC NULLS LAST,
          COALESCE(unresolved_tie_resolution_orders.draw_order, 2147483647) ASC,
          teams_table.name ASC
      ) AS team_rank
    FROM group_rows
    JOIN public.teams AS teams_table
      ON teams_table.id = group_rows.team_id
    CROSS JOIN competition_context
    LEFT JOIN unresolved_tie_resolution_orders
      ON unresolved_tie_resolution_orders.group_id = group_rows.group_id
      AND unresolved_tie_resolution_orders.team_id = group_rows.team_id
    LEFT JOIN direct_confrontation_orders
      ON direct_confrontation_orders.group_id = group_rows.group_id
      AND direct_confrontation_orders.team_id = group_rows.team_id
  )
  SELECT
    ranked.competition_id,
    ranked.group_id,
    ranked.group_number,
    ranked.team_id,
    ranked.team_name,
    ranked.points,
    ranked.wins,
    ranked.goal_diff,
    ranked.goals_for,
    ranked.team_rank
  FROM ranked
  ORDER BY ranked.group_number ASC, ranked.team_rank ASC, ranked.team_name ASC;
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
      COALESCE(standings_table.two_minute_penalties, 0)::bigint AS two_minute_penalties
    FROM group_rankings
    CROSS JOIN competition_context
    LEFT JOIN public.standings AS standings_table
      ON standings_table.championship_id = _championship_id
      AND standings_table.season_year = competition_context.season_year
      AND standings_table.sport_id = competition_context.sport_id
      AND standings_table.naipe = competition_context.naipe
      AND standings_table.division IS NOT DISTINCT FROM competition_context.division
      AND standings_table.team_id = group_rankings.team_id
    WHERE
      group_rankings.team_rank <= GREATEST(competition_context.qualifiers_per_group, 2)
      OR (
        competition_context.should_complete_knockout_with_best_second_placed_teams = true
        AND group_rankings.team_rank = 2
      )
  ),
  pool_metric_tie_sets AS (
    SELECT
      candidate_rows.qualification_rank,
      string_agg(candidate_rows.team_id::text, '|' ORDER BY candidate_rows.team_id::text) AS tied_team_signature,
      array_agg(candidate_rows.team_id ORDER BY candidate_rows.team_id::text) AS tied_team_ids
    FROM candidate_rows
    CROSS JOIN competition_context
    GROUP BY
      candidate_rows.qualification_rank,
      candidate_rows.points_base,
      CASE
        WHEN competition_context.tie_breaker_rule IN (
          'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
          'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule,
          'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule,
          'STANDARD'::public.championship_sport_tie_breaker_rule
        ) THEN candidate_rows.wins
        ELSE NULL::bigint
      END,
      candidate_rows.goal_diff,
      candidate_rows.goals_for,
      CASE
        WHEN competition_context.tie_breaker_rule = 'HANDEBOL'::public.championship_sport_tie_breaker_rule
          THEN candidate_rows.blue_cards
        ELSE NULL::bigint
      END,
      CASE
        WHEN competition_context.tie_breaker_rule = 'HANDEBOL'::public.championship_sport_tie_breaker_rule
          THEN candidate_rows.two_minute_penalties
        ELSE NULL::bigint
      END,
      CASE
        WHEN competition_context.tie_breaker_rule IN (
          'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
          'STANDARD'::public.championship_sport_tie_breaker_rule,
          'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule
        ) THEN candidate_rows.yellow_cards
        ELSE NULL::bigint
      END,
      CASE
        WHEN competition_context.tie_breaker_rule IN (
          'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
          'STANDARD'::public.championship_sport_tie_breaker_rule,
          'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule
        ) THEN candidate_rows.red_cards
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
      candidate_rows.competition_id,
      candidate_rows.team_id,
      candidate_rows.team_name,
      candidate_rows.qualification_rank,
      candidate_rows.points_base::bigint AS points,
      candidate_rows.wins,
      candidate_rows.goal_diff,
      candidate_rows.goals_for,
      row_number() OVER (
        ORDER BY
          candidate_rows.qualification_rank ASC,
          candidate_rows.points_base DESC,
          CASE
            WHEN competition_context.tie_breaker_rule IN (
              'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
              'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule,
              'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule,
              'STANDARD'::public.championship_sport_tie_breaker_rule
            ) THEN candidate_rows.wins
            ELSE NULL::bigint
          END DESC NULLS LAST,
          candidate_rows.goal_diff DESC,
          candidate_rows.goals_for DESC,
          CASE
            WHEN competition_context.tie_breaker_rule = 'HANDEBOL'::public.championship_sport_tie_breaker_rule
              THEN candidate_rows.blue_cards
            ELSE NULL::bigint
          END ASC NULLS LAST,
          CASE
            WHEN competition_context.tie_breaker_rule = 'HANDEBOL'::public.championship_sport_tie_breaker_rule
              THEN candidate_rows.two_minute_penalties
            ELSE NULL::bigint
          END ASC NULLS LAST,
          CASE
            WHEN competition_context.tie_breaker_rule IN (
              'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
              'STANDARD'::public.championship_sport_tie_breaker_rule,
              'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule
            ) THEN candidate_rows.yellow_cards
            ELSE NULL::bigint
          END ASC NULLS LAST,
          CASE
            WHEN competition_context.tie_breaker_rule IN (
              'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
              'STANDARD'::public.championship_sport_tie_breaker_rule,
              'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule
            ) THEN candidate_rows.red_cards
            ELSE NULL::bigint
          END ASC NULLS LAST,
          COALESCE(pool_tie_resolution_orders.draw_order, 2147483647) ASC,
          candidate_rows.team_name ASC
      ) AS pool_rank
    FROM candidate_rows
    CROSS JOIN competition_context
    LEFT JOIN pool_tie_resolution_orders
      ON pool_tie_resolution_orders.qualification_rank = candidate_rows.qualification_rank
      AND pool_tie_resolution_orders.team_id = candidate_rows.team_id
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

DROP FUNCTION IF EXISTS public.get_championship_corrected_group_standings(UUID, INTEGER);

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
  corrected_points NUMERIC,
  goals_for BIGINT,
  goals_against BIGINT,
  goal_diff BIGINT,
  yellow_cards BIGINT,
  red_cards BIGINT,
  blue_cards BIGINT,
  two_minute_penalties BIGINT,
  points_average NUMERIC
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
      ) AS bracket_edition_id,
      COALESCE(
        _season_year,
        (
          SELECT editions_table.season_year
          FROM public.championship_bracket_editions AS editions_table
          WHERE editions_table.championship_id = _championship_id
          ORDER BY editions_table.created_at DESC
          LIMIT 1
        )
      ) AS season_year
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
      rankings_table.points,
      rankings_table.goal_diff,
      rankings_table.goals_for
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
    ) AS corrected_points,
    standings_metrics.goals_for,
    standings_metrics.goals_against,
    standings_metrics.goal_diff,
    standings_metrics.yellow_cards,
    standings_metrics.red_cards,
    standings_metrics.blue_cards,
    standings_metrics.two_minute_penalties,
    CASE
      WHEN standings_metrics.goals_against = 0 THEN
        CASE
          WHEN standings_metrics.goals_for = 0 THEN 0::numeric
          ELSE 1000000000::numeric
        END
      ELSE standings_metrics.goals_for::numeric / standings_metrics.goals_against::numeric
    END AS points_average
  FROM group_rankings
  JOIN group_sizes
    ON group_sizes.competition_id = group_rankings.competition_id
    AND group_sizes.group_id = group_rankings.group_id
  JOIN competition_match_span
    ON competition_match_span.competition_id = group_rankings.competition_id
  CROSS JOIN edition_context
  LEFT JOIN public.standings AS standings_table
    ON standings_table.championship_id = _championship_id
    AND standings_table.season_year = edition_context.season_year
    AND standings_table.sport_id = group_rankings.sport_id
    AND standings_table.naipe = group_rankings.naipe
    AND standings_table.division IS NOT DISTINCT FROM group_rankings.division
    AND standings_table.team_id = group_rankings.team_id
  CROSS JOIN LATERAL (
    SELECT
      COALESCE(standings_table.goals_for, group_rankings.goals_for)::bigint AS goals_for,
      COALESCE(
        standings_table.goals_against,
        GREATEST(group_rankings.goals_for - group_rankings.goal_diff, 0)
      )::bigint AS goals_against,
      COALESCE(standings_table.goal_diff, group_rankings.goal_diff)::bigint AS goal_diff,
      COALESCE(standings_table.yellow_cards, 0)::bigint AS yellow_cards,
      COALESCE(standings_table.red_cards, 0)::bigint AS red_cards,
      COALESCE(standings_table.blue_cards, 0)::bigint AS blue_cards,
      COALESCE(standings_table.two_minute_penalties, 0)::bigint AS two_minute_penalties
  ) AS standings_metrics
  ORDER BY
    group_rankings.sport_name ASC,
    group_rankings.naipe ASC,
    group_rankings.division ASC NULLS FIRST,
    group_rankings.group_number ASC,
    corrected_points DESC,
    points_average DESC,
    standings_metrics.goal_diff DESC,
    standings_metrics.goals_for DESC,
    standings_metrics.blue_cards ASC,
    standings_metrics.two_minute_penalties ASC,
    standings_metrics.yellow_cards ASC,
    standings_metrics.red_cards ASC,
    group_rankings.team_name ASC;
$func$;

DROP FUNCTION IF EXISTS public.get_championship_effective_standings(UUID, INTEGER, TEXT, public.match_naipe, UUID);

CREATE OR REPLACE FUNCTION public.get_championship_effective_standings(
  _championship_id UUID DEFAULT NULL,
  _season_year INTEGER DEFAULT NULL,
  _division_filter TEXT DEFAULT NULL,
  _naipe public.match_naipe DEFAULT NULL,
  _sport_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  championship_id UUID,
  season_year INTEGER,
  division public.team_division,
  naipe public.match_naipe,
  sport_id UUID,
  team_id UUID,
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
  updated_at TIMESTAMPTZ,
  is_individual_sport BOOLEAN,
  scored_events_count INTEGER,
  first_places INTEGER,
  second_places INTEGER,
  third_places INTEGER,
  fourth_places INTEGER,
  fifth_places INTEGER,
  sixth_places INTEGER,
  seventh_places INTEGER,
  eighth_places INTEGER,
  ninth_places INTEGER,
  tenth_places INTEGER,
  eleventh_places INTEGER,
  twelfth_places INTEGER,
  thirteenth_places INTEGER,
  fourteenth_places INTEGER,
  fifteenth_places INTEGER,
  sixteenth_places INTEGER,
  seventeenth_places INTEGER,
  eighteenth_places INTEGER,
  nineteenth_places INTEGER,
  twentieth_places INTEGER,
  relay_points_total NUMERIC,
  team_name TEXT,
  team_city TEXT,
  sport_name TEXT
)
LANGUAGE sql
STABLE
AS $$
  WITH collective_standings AS (
    SELECT
      standings_table.id,
      standings_table.championship_id,
      standings_table.season_year,
      standings_table.division,
      standings_table.naipe,
      standings_table.sport_id,
      standings_table.team_id,
      standings_table.played,
      standings_table.wins,
      standings_table.draws,
      standings_table.losses,
      standings_table.goals_for,
      standings_table.goals_against,
      standings_table.goal_diff,
      standings_table.points::numeric AS points,
      standings_table.yellow_cards,
      standings_table.red_cards,
      standings_table.blue_cards,
      standings_table.two_minute_penalties,
      standings_table.updated_at,
      false AS is_individual_sport,
      0 AS scored_events_count,
      0 AS first_places,
      0 AS second_places,
      0 AS third_places,
      0 AS fourth_places,
      0 AS fifth_places,
      0 AS sixth_places,
      0 AS seventh_places,
      0 AS eighth_places,
      0 AS ninth_places,
      0 AS tenth_places,
      0 AS eleventh_places,
      0 AS twelfth_places,
      0 AS thirteenth_places,
      0 AS fourteenth_places,
      0 AS fifteenth_places,
      0 AS sixteenth_places,
      0 AS seventeenth_places,
      0 AS eighteenth_places,
      0 AS nineteenth_places,
      0 AS twentieth_places,
      0::numeric AS relay_points_total
    FROM public.standings AS standings_table
    WHERE (_championship_id IS NULL OR standings_table.championship_id = _championship_id)
      AND (_season_year IS NULL OR standings_table.season_year = _season_year)
      AND (_sport_id IS NULL OR standings_table.sport_id = _sport_id)
      AND (_naipe IS NULL OR standings_table.naipe = _naipe)
      AND (
        _division_filter IS NULL
        OR (_division_filter = 'WITHOUT_DIVISION' AND standings_table.division IS NULL)
        OR (_division_filter NOT IN ('WITHOUT_DIVISION') AND standings_table.division::text = _division_filter)
      )
  ),
  individual_standings AS (
    SELECT
      standings_table.id,
      standings_table.championship_id,
      standings_table.season_year,
      standings_table.division,
      standings_table.naipe,
      standings_table.sport_id,
      standings_table.team_id,
      standings_table.scored_events_count AS played,
      standings_table.first_places AS wins,
      standings_table.second_places AS draws,
      0 AS losses,
      0 AS goals_for,
      0 AS goals_against,
      0 AS goal_diff,
      standings_table.total_points AS points,
      0 AS yellow_cards,
      0 AS red_cards,
      0 AS blue_cards,
      0 AS two_minute_penalties,
      standings_table.updated_at,
      true AS is_individual_sport,
      standings_table.scored_events_count,
      standings_table.first_places,
      standings_table.second_places,
      standings_table.third_places,
      standings_table.fourth_places,
      standings_table.fifth_places,
      standings_table.sixth_places,
      standings_table.seventh_places,
      standings_table.eighth_places,
      standings_table.ninth_places,
      standings_table.tenth_places,
      standings_table.eleventh_places,
      standings_table.twelfth_places,
      standings_table.thirteenth_places,
      standings_table.fourteenth_places,
      standings_table.fifteenth_places,
      standings_table.sixteenth_places,
      standings_table.seventeenth_places,
      standings_table.eighteenth_places,
      standings_table.nineteenth_places,
      standings_table.twentieth_places,
      standings_table.relay_points_total
    FROM public.championship_individual_team_standings AS standings_table
    WHERE (_championship_id IS NULL OR standings_table.championship_id = _championship_id)
      AND (_season_year IS NULL OR standings_table.season_year = _season_year)
      AND (_sport_id IS NULL OR standings_table.sport_id = _sport_id)
      AND (_naipe IS NULL OR standings_table.naipe = _naipe)
      AND (
        _division_filter IS NULL
        OR (_division_filter = 'WITHOUT_DIVISION' AND standings_table.division IS NULL)
        OR (_division_filter NOT IN ('WITHOUT_DIVISION') AND standings_table.division::text = _division_filter)
      )
  ),
  effective_standings AS (
    SELECT * FROM collective_standings
    UNION ALL
    SELECT * FROM individual_standings
  )
  SELECT
    effective_standings.id,
    effective_standings.championship_id,
    effective_standings.season_year,
    effective_standings.division,
    effective_standings.naipe,
    effective_standings.sport_id,
    effective_standings.team_id,
    effective_standings.played,
    effective_standings.wins,
    effective_standings.draws,
    effective_standings.losses,
    effective_standings.goals_for,
    effective_standings.goals_against,
    effective_standings.goal_diff,
    effective_standings.points,
    effective_standings.yellow_cards,
    effective_standings.red_cards,
    effective_standings.blue_cards,
    effective_standings.two_minute_penalties,
    effective_standings.updated_at,
    effective_standings.is_individual_sport,
    effective_standings.scored_events_count,
    effective_standings.first_places,
    effective_standings.second_places,
    effective_standings.third_places,
    effective_standings.fourth_places,
    effective_standings.fifth_places,
    effective_standings.sixth_places,
    effective_standings.seventh_places,
    effective_standings.eighth_places,
    effective_standings.ninth_places,
    effective_standings.tenth_places,
    effective_standings.eleventh_places,
    effective_standings.twelfth_places,
    effective_standings.thirteenth_places,
    effective_standings.fourteenth_places,
    effective_standings.fifteenth_places,
    effective_standings.sixteenth_places,
    effective_standings.seventeenth_places,
    effective_standings.eighteenth_places,
    effective_standings.nineteenth_places,
    effective_standings.twentieth_places,
    effective_standings.relay_points_total,
    teams_table.name AS team_name,
    teams_table.city AS team_city,
    sports_table.name AS sport_name
  FROM effective_standings
  JOIN public.teams AS teams_table
    ON teams_table.id = effective_standings.team_id
  JOIN public.sports AS sports_table
    ON sports_table.id = effective_standings.sport_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_championship_corrected_group_standings(UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_championship_effective_standings(UUID, INTEGER, TEXT, public.match_naipe, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_championship_bracket_competition_group_rankings(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_championship_bracket_competition_qualification_pool_rankings(UUID, UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
