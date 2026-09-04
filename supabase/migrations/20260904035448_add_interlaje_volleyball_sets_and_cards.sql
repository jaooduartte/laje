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
  ELSIF normalized_championship_sport_name IN ('futevolei', 'volei de praia') THEN
    NEW.supports_cards := false;
    NEW.tie_breaker_rule := 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule;
    NEW.result_rule := 'SETS'::public.championship_sport_result_rule;
  ELSIF normalized_championship_sport_name = 'voleibol' THEN
    NEW.supports_cards := true;
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
      NEW.walkover_winner_set_count := 2;
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
SET
  supports_cards = true,
  result_rule = 'SETS'::public.championship_sport_result_rule,
  tie_breaker_rule = 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule,
  points_win = 3,
  points_draw = 0,
  points_loss = 0,
  walkover_winner_set_count = 2
FROM public.championships AS championships_table,
     public.sports AS sports_table
WHERE championships_table.id = championship_sports_table.championship_id
  AND sports_table.id = championship_sports_table.sport_id
  AND championships_table.code = 'INTERLAJE'::public.championship_code
  AND public.normalize_sport_name(sports_table.name) = 'voleibol';

SELECT set_config('app.skip_match_conflict_trigger', 'true', true);

UPDATE public.matches AS matches_table
SET supports_cards = true
FROM public.championships AS championships_table,
     public.sports AS sports_table
WHERE championships_table.id = matches_table.championship_id
  AND sports_table.id = matches_table.sport_id
  AND championships_table.code = 'INTERLAJE'::public.championship_code
  AND public.normalize_sport_name(sports_table.name) = 'voleibol'
  AND matches_table.supports_cards IS DISTINCT FROM true;

SELECT set_config('app.skip_match_conflict_trigger', 'false', true);

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
  DELETE FROM public.standings AS standings_table
  WHERE standings_table.championship_id = _championship_id
    AND standings_table.season_year = _season_year
    AND standings_table.sport_id = _sport_id
    AND standings_table.naipe = _naipe
    AND standings_table.division IS NOT DISTINCT FROM _division;

  INSERT INTO public.standings (
    championship_id, season_year, sport_id, naipe, division, team_id,
    played, wins, draws, losses, goals_for, goals_against, goal_diff, points,
    yellow_cards, red_cards, blue_cards, two_minute_penalties, updated_at
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
      AND COALESCE(matches_table.is_double_walkover, false) = false
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
  )
  SELECT
    championship_id, season_year, sport_id, naipe, division, team_id,
    count(*), sum(wins), sum(draws), sum(losses),
    sum(goals_for), sum(goals_against), sum(goals_for - goals_against),
    sum(points), sum(yellow_cards), sum(red_cards), sum(blue_cards),
    sum(two_minute_penalties), now()
  FROM standing_rows
  GROUP BY championship_id, season_year, sport_id, naipe, division, team_id;
END;
$func$;

CREATE OR REPLACE FUNCTION public.save_match_sets(
  _match_id UUID,
  _sets JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  set_record JSONB;
  resolved_result_rule public.championship_sport_result_rule;
  resolved_match RECORD;
  home_sets INTEGER := 0;
  away_sets INTEGER := 0;
BEGIN
  IF NOT public.has_admin_tab_access('control'::public.admin_panel_tab, true)
    AND NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para atualizar sets.';
  END IF;

  SELECT
    matches_table.id,
    matches_table.championship_id,
    matches_table.sport_id,
    championships_table.code AS championship_code,
    public.normalize_sport_name(sports_table.name) AS normalized_sport_name
  INTO resolved_match
  FROM public.matches AS matches_table
  JOIN public.championships AS championships_table
    ON championships_table.id = matches_table.championship_id
  JOIN public.sports AS sports_table
    ON sports_table.id = matches_table.sport_id
  WHERE matches_table.id = _match_id
  LIMIT 1;

  IF resolved_match.id IS NULL THEN
    RAISE EXCEPTION 'Partida não encontrada para registro de sets.';
  END IF;

  resolved_result_rule := public.resolve_championship_sport_result_rule(
    resolved_match.championship_id,
    resolved_match.sport_id
  );

  DELETE FROM public.match_sets WHERE match_id = _match_id;

  FOR set_record IN SELECT value FROM jsonb_array_elements(COALESCE(_sets, '[]'::jsonb))
  LOOP
    INSERT INTO public.match_sets (match_id, set_number, home_points, away_points)
    VALUES (
      _match_id,
      GREATEST(1, COALESCE((set_record->>'set_number')::integer, 1)),
      GREATEST(0, COALESCE((set_record->>'home_points')::integer, 0)),
      GREATEST(0, COALESCE((set_record->>'away_points')::integer, 0))
    );

    IF COALESCE((set_record->>'home_points')::integer, 0) > COALESCE((set_record->>'away_points')::integer, 0) THEN
      home_sets := home_sets + 1;
    ELSIF COALESCE((set_record->>'away_points')::integer, 0) > COALESCE((set_record->>'home_points')::integer, 0) THEN
      away_sets := away_sets + 1;
    END IF;
  END LOOP;

  IF resolved_match.championship_code = 'INTERLAJE'::public.championship_code
    AND resolved_match.normalized_sport_name = 'voleibol'
    AND (home_sets > 2 OR away_sets > 2 OR (home_sets = 2 AND away_sets > 1) OR (away_sets = 2 AND home_sets > 1)) THEN
    RAISE EXCEPTION 'No Voleibol do INTERLAJE, uma partida possui no máximo três sets e termina em 2 × 0 ou 2 × 1.';
  END IF;

  IF resolved_result_rule = 'SETS'::public.championship_sport_result_rule THEN
    UPDATE public.matches
    SET home_score = home_sets, away_score = away_sets
    WHERE id = _match_id;
  END IF;
END;
$func$;

CREATE OR REPLACE FUNCTION public.validate_interlaje_volleyball_match_finish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  championship_code public.championship_code;
  normalized_sport_name TEXT;
BEGIN
  IF NEW.status <> 'FINISHED'::public.match_status
    OR OLD.status = 'FINISHED'::public.match_status THEN
    RETURN NEW;
  END IF;

  SELECT
    championships_table.code,
    public.normalize_sport_name(sports_table.name)
  INTO championship_code, normalized_sport_name
  FROM public.championships AS championships_table
  JOIN public.sports AS sports_table ON sports_table.id = NEW.sport_id
  WHERE championships_table.id = NEW.championship_id
  LIMIT 1;

  IF championship_code = 'INTERLAJE'::public.championship_code
    AND normalized_sport_name = 'voleibol'
    AND NOT (
      (NEW.home_score = 2 AND NEW.away_score IN (0, 1))
      OR (NEW.away_score = 2 AND NEW.home_score IN (0, 1))
    ) THEN
    RAISE EXCEPTION 'No Voleibol do INTERLAJE, a partida deve terminar em 2 × 0 ou 2 × 1.';
  END IF;

  RETURN NEW;
END;
$func$;

REVOKE ALL ON FUNCTION public.validate_interlaje_volleyball_match_finish() FROM PUBLIC;

DROP TRIGGER IF EXISTS validate_interlaje_volleyball_match_finish_trigger ON public.matches;
CREATE TRIGGER validate_interlaje_volleyball_match_finish_trigger
BEFORE UPDATE OF status ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.validate_interlaje_volleyball_match_finish();

DO $block$
DECLARE
  standing_scope RECORD;
BEGIN
  FOR standing_scope IN
    SELECT DISTINCT
      matches_table.championship_id,
      matches_table.season_year,
      matches_table.sport_id,
      matches_table.naipe,
      matches_table.division
    FROM public.matches AS matches_table
    JOIN public.championships AS championships_table
      ON championships_table.id = matches_table.championship_id
    JOIN public.sports AS sports_table
      ON sports_table.id = matches_table.sport_id
    WHERE championships_table.code = 'INTERLAJE'::public.championship_code
      AND public.normalize_sport_name(sports_table.name) = 'voleibol'
  LOOP
    PERFORM public.rebuild_standings_scope(
      standing_scope.championship_id,
      standing_scope.season_year,
      standing_scope.sport_id,
      standing_scope.naipe,
      standing_scope.division
    );
  END LOOP;
END;
$block$;
