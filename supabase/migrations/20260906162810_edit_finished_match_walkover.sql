CREATE OR REPLACE FUNCTION public.save_finished_match_walkover(
  _match_id UUID,
  _walkover_mode TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  match_record RECORD;
  normalized_walkover_mode TEXT;
  walkover_loser_team_id UUID;
  winner_side TEXT;
  winner_points INTEGER;
  winner_set_count INTEGER;
  is_set_match BOOLEAN;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Sem permissão para editar jogos.';
  END IF;

  normalized_walkover_mode := upper(trim(COALESCE(_walkover_mode, '')));

  IF normalized_walkover_mode NOT IN ('NONE', 'HOME_LOST', 'AWAY_LOST', 'DOUBLE') THEN
    RAISE EXCEPTION 'Modo de W.O. inválido.';
  END IF;

  SELECT
    matches_table.*,
    championship_sports_table.result_rule,
    championship_sports_table.walkover_winner_points,
    championship_sports_table.walkover_winner_set_count,
    EXISTS (
      SELECT 1
      FROM public.championship_bracket_matches AS bracket_matches_table
      WHERE bracket_matches_table.match_id = matches_table.id
        AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    ) AS is_knockout_match
  INTO match_record
  FROM public.matches AS matches_table
  JOIN public.championship_sports AS championship_sports_table
    ON championship_sports_table.championship_id = matches_table.championship_id
    AND championship_sports_table.sport_id = matches_table.sport_id
  WHERE matches_table.id = _match_id
  LIMIT 1;

  IF match_record.id IS NULL THEN
    RAISE EXCEPTION 'Jogo não encontrado.';
  END IF;

  IF match_record.status <> 'FINISHED'::public.match_status THEN
    RAISE EXCEPTION 'Só é possível editar o W.O. de jogos encerrados.';
  END IF;

  IF normalized_walkover_mode = 'DOUBLE' AND match_record.is_knockout_match THEN
    RAISE EXCEPTION 'Não é possível aplicar W.O. duplo em jogos do mata-mata.';
  END IF;

  IF normalized_walkover_mode = 'NONE' AND match_record.is_knockout_match THEN
    RAISE EXCEPTION 'Não é possível remover o W.O. de um jogo de mata-mata encerrado sem definir um resultado válido.';
  END IF;

  DELETE FROM public.match_sets WHERE match_id = _match_id;
  DELETE FROM public.match_award_goal_scorers WHERE match_id = _match_id;
  DELETE FROM public.match_yellow_card_players WHERE match_id = _match_id;
  DELETE FROM public.match_red_card_players WHERE match_id = _match_id;
  DELETE FROM public.match_blue_card_players WHERE match_id = _match_id;

  IF normalized_walkover_mode = 'NONE' OR normalized_walkover_mode = 'DOUBLE' THEN
    UPDATE public.matches
    SET
      home_score = 0,
      away_score = 0,
      current_set_home_score = NULL,
      current_set_away_score = NULL,
      home_yellow_cards = 0,
      home_red_cards = 0,
      home_blue_cards = 0,
      home_two_minute_penalties = 0,
      away_yellow_cards = 0,
      away_red_cards = 0,
      away_blue_cards = 0,
      away_two_minute_penalties = 0,
      home_penalty_score = NULL,
      away_penalty_score = NULL,
      resolved_tie_breaker_rule = NULL,
      resolved_tie_break_winner_team_id = NULL,
      is_walkover = normalized_walkover_mode = 'DOUBLE',
      is_double_walkover = normalized_walkover_mode = 'DOUBLE',
      walkover_loser_team_id = NULL,
      is_score_sheet_reviewed = false
    WHERE id = _match_id;
  ELSE
    walkover_loser_team_id := CASE normalized_walkover_mode
      WHEN 'HOME_LOST' THEN match_record.home_team_id
      WHEN 'AWAY_LOST' THEN match_record.away_team_id
    END;
    winner_side := CASE
      WHEN walkover_loser_team_id = match_record.home_team_id THEN 'away'
      ELSE 'home'
    END;
    winner_points := match_record.walkover_winner_points;
    is_set_match := match_record.result_rule = 'SETS'::public.championship_sport_result_rule;
    winner_set_count := GREATEST(1, COALESCE(match_record.walkover_winner_set_count, 1));

    IF winner_points IS NULL THEN
      RAISE EXCEPTION 'Modalidade sem configuração de W.O. para pontuação máxima.';
    END IF;

    IF is_set_match THEN
      INSERT INTO public.match_sets (match_id, set_number, home_points, away_points)
      SELECT
        _match_id,
        generated_sets.set_number,
        CASE WHEN winner_side = 'home' THEN winner_points ELSE 0 END,
        CASE WHEN winner_side = 'away' THEN winner_points ELSE 0 END
      FROM generate_series(1, winner_set_count) AS generated_sets(set_number);
    END IF;

    UPDATE public.matches
    SET
      home_score = CASE
        WHEN is_set_match THEN CASE WHEN winner_side = 'home' THEN winner_set_count ELSE 0 END
        WHEN winner_side = 'home' THEN winner_points
        ELSE 0
      END,
      away_score = CASE
        WHEN is_set_match THEN CASE WHEN winner_side = 'away' THEN winner_set_count ELSE 0 END
        WHEN winner_side = 'away' THEN winner_points
        ELSE 0
      END,
      current_set_home_score = NULL,
      current_set_away_score = NULL,
      home_yellow_cards = 0,
      home_red_cards = 0,
      home_blue_cards = 0,
      home_two_minute_penalties = 0,
      away_yellow_cards = 0,
      away_red_cards = 0,
      away_blue_cards = 0,
      away_two_minute_penalties = 0,
      home_penalty_score = NULL,
      away_penalty_score = NULL,
      resolved_tie_breaker_rule = NULL,
      resolved_tie_break_winner_team_id = NULL,
      is_walkover = true,
      is_double_walkover = false,
      walkover_loser_team_id = walkover_loser_team_id,
      is_score_sheet_reviewed = false
    WHERE id = _match_id;
  END IF;

  RETURN jsonb_build_object(
    'match_id', _match_id,
    'walkover_mode', normalized_walkover_mode
  );
END;
$func$;

REVOKE ALL ON FUNCTION public.save_finished_match_walkover(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_finished_match_walkover(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
