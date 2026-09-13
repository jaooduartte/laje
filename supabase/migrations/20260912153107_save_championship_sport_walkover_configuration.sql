CREATE OR REPLACE FUNCTION public.save_championship_sport_walkover_configuration(
  _championship_sport_id UUID,
  _season_year INTEGER,
  _walkover_winner_points INTEGER,
  _walkover_winner_set_count INTEGER,
  _update_finished_walkovers BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  championship_sport_record public.championship_sports%ROWTYPE;
  championship_current_season_year INTEGER;
  affected_match public.matches%ROWTYPE;
  resolved_winner_side TEXT;
  updated_matches_count INTEGER := 0;
BEGIN
  IF NOT public.has_admin_tab_access('sports'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para atualizar a configuração de W.O.';
  END IF;

  IF _walkover_winner_points IS NOT NULL
    AND _walkover_winner_points <= 0 THEN
    RAISE EXCEPTION 'A pontuação do W.O. precisa ser um número inteiro positivo.';
  END IF;

  IF _walkover_winner_set_count IS NOT NULL
    AND _walkover_winner_set_count <= 0 THEN
    RAISE EXCEPTION 'A quantidade de sets do W.O. precisa ser um número inteiro positivo.';
  END IF;

  SELECT championships_table.current_season_year
  INTO championship_current_season_year
  FROM public.championship_sports AS championship_sports_table
  JOIN public.championships AS championships_table
    ON championships_table.id = championship_sports_table.championship_id
  WHERE championship_sports_table.id = _championship_sport_id
  FOR UPDATE OF championship_sports_table;

  IF championship_current_season_year IS NULL THEN
    RAISE EXCEPTION 'Modalidade do campeonato não encontrada.';
  END IF;

  IF championship_current_season_year <> _season_year THEN
    RAISE EXCEPTION 'A atualização de W.O. só pode ser aplicada à temporada atual.';
  END IF;

  UPDATE public.championship_sports AS championship_sports_table
  SET
    walkover_winner_points = _walkover_winner_points,
    walkover_winner_set_count = CASE
      WHEN championship_sports_table.result_rule = 'SETS'::public.championship_sport_result_rule
        THEN COALESCE(_walkover_winner_set_count, championship_sports_table.walkover_winner_set_count)
      ELSE championship_sports_table.walkover_winner_set_count
    END
  WHERE championship_sports_table.id = _championship_sport_id
  RETURNING championship_sports_table.* INTO championship_sport_record;

  IF NOT _update_finished_walkovers THEN
    RETURN jsonb_build_object('updated_matches_count', 0);
  END IF;

  IF championship_sport_record.walkover_winner_points IS NULL THEN
    RAISE EXCEPTION 'Defina a pontuação do W.O. antes de atualizar jogos já encerrados.';
  END IF;

  FOR affected_match IN
    SELECT matches_table.*
    FROM public.matches AS matches_table
    WHERE matches_table.championship_id = championship_sport_record.championship_id
      AND matches_table.sport_id = championship_sport_record.sport_id
      AND matches_table.season_year = _season_year
      AND matches_table.status = 'FINISHED'::public.match_status
      AND matches_table.is_walkover = true
      AND matches_table.is_double_walkover = false
      AND matches_table.walkover_loser_team_id IN (
        matches_table.home_team_id,
        matches_table.away_team_id
      )
  LOOP
    resolved_winner_side := CASE
      WHEN affected_match.walkover_loser_team_id = affected_match.home_team_id THEN 'away'
      ELSE 'home'
    END;

    IF championship_sport_record.result_rule = 'SETS'::public.championship_sport_result_rule THEN
      DELETE FROM public.match_sets AS match_sets_table
      WHERE match_sets_table.match_id = affected_match.id;

      INSERT INTO public.match_sets (
        match_id,
        set_number,
        home_points,
        away_points
      )
      SELECT
        affected_match.id,
        generated_sets.set_number,
        CASE
          WHEN resolved_winner_side = 'home' THEN championship_sport_record.walkover_winner_points
          ELSE 0
        END,
        CASE
          WHEN resolved_winner_side = 'away' THEN championship_sport_record.walkover_winner_points
          ELSE 0
        END
      FROM generate_series(1, championship_sport_record.walkover_winner_set_count)
        AS generated_sets(set_number);
    END IF;

    UPDATE public.matches AS matches_table
    SET
      home_score = CASE
        WHEN championship_sport_record.result_rule = 'SETS'::public.championship_sport_result_rule
          THEN CASE WHEN resolved_winner_side = 'home' THEN championship_sport_record.walkover_winner_set_count ELSE 0 END
        WHEN resolved_winner_side = 'home' THEN championship_sport_record.walkover_winner_points
        ELSE 0
      END,
      away_score = CASE
        WHEN championship_sport_record.result_rule = 'SETS'::public.championship_sport_result_rule
          THEN CASE WHEN resolved_winner_side = 'away' THEN championship_sport_record.walkover_winner_set_count ELSE 0 END
        WHEN resolved_winner_side = 'away' THEN championship_sport_record.walkover_winner_points
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
      resolved_tie_break_winner_team_id = NULL
    WHERE matches_table.id = affected_match.id;

    updated_matches_count := updated_matches_count + 1;
  END LOOP;

  RETURN jsonb_build_object('updated_matches_count', updated_matches_count);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_championship_sport_walkover_configuration(UUID, INTEGER, INTEGER, INTEGER, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_championship_sport_walkover_configuration(UUID, INTEGER, INTEGER, INTEGER, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_championship_sport_walkover_configuration(UUID, INTEGER, INTEGER, INTEGER, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
