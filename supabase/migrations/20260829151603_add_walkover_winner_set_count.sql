ALTER TABLE public.championship_sports
  ADD COLUMN walkover_winner_set_count INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.championship_sports
  ADD CONSTRAINT championship_sports_walkover_winner_set_count_positive
  CHECK (walkover_winner_set_count > 0);

UPDATE public.championship_sports AS championship_sports_table
SET
  walkover_winner_points = 21,
  walkover_winner_set_count = 2
FROM public.championships AS championships_table,
  public.sports AS sports_table
WHERE championships_table.id = championship_sports_table.championship_id
  AND sports_table.id = championship_sports_table.sport_id
  AND championships_table.code = 'INTERLAJE'::public.championship_code
  AND sports_table.name = 'Voleibol';

CREATE OR REPLACE FUNCTION public.disqualify_championship_collective_team_competition(
  _championship_id UUID,
  _season_year INTEGER,
  _sport_id UUID,
  _naipe public.match_naipe,
  _division public.team_division,
  _team_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_variable
DECLARE
  competition_record RECORD;
  disqualification_id UUID;
  affected_match RECORD;
  walkover_winner_points INTEGER;
  walkover_winner_set_count INTEGER;
  is_set_rule BOOLEAN;
  winner_side TEXT;
  resolved_home_score INTEGER;
  resolved_away_score INTEGER;
  updated_matches_count INTEGER := 0;
  actor_user_id UUID := auth.uid();
BEGIN
  IF NOT public.has_admin_tab_access('standings'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para desclassificar atléticas.';
  END IF;

  SELECT
    competitions_table.id,
    competitions_table.sport_id,
    competitions_table.naipe,
    competitions_table.division,
    championship_sports_table.result_rule,
    COALESCE(championship_sports_table.walkover_winner_points, 3) AS walkover_winner_points,
    COALESCE(championship_sports_table.walkover_winner_set_count, 1) AS walkover_winner_set_count
  INTO competition_record
  FROM public.championship_bracket_competitions AS competitions_table
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = competitions_table.bracket_edition_id
  LEFT JOIN public.championship_sports AS championship_sports_table
    ON championship_sports_table.championship_id = editions_table.championship_id
    AND championship_sports_table.sport_id = competitions_table.sport_id
  WHERE editions_table.championship_id = _championship_id
    AND editions_table.season_year = _season_year
    AND competitions_table.sport_id = _sport_id
    AND competitions_table.naipe = _naipe
    AND competitions_table.division IS NOT DISTINCT FROM _division
  LIMIT 1;

  IF competition_record.id IS NULL THEN
    RAISE EXCEPTION 'Competição filtrada não encontrada para a desclassificação.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.championship_bracket_group_teams AS group_teams_table
    JOIN public.championship_bracket_groups AS groups_table
      ON groups_table.id = group_teams_table.group_id
    WHERE groups_table.competition_id = competition_record.id
      AND group_teams_table.team_id = _team_id
  ) THEN
    RAISE EXCEPTION 'A atlética informada não participa desta competição.';
  END IF;

  INSERT INTO public.championship_competition_team_disqualifications (
    championship_id,
    season_year,
    sport_id,
    naipe,
    division,
    team_id,
    created_by
  )
  VALUES (
    _championship_id,
    _season_year,
    _sport_id,
    _naipe,
    _division,
    _team_id,
    actor_user_id
  )
  ON CONFLICT (championship_id, season_year, sport_id, naipe, division, team_id)
  DO UPDATE
  SET
    created_by = EXCLUDED.created_by,
    created_at = now()
  RETURNING id INTO disqualification_id;

  walkover_winner_points := COALESCE(competition_record.walkover_winner_points, 3);
  walkover_winner_set_count := COALESCE(competition_record.walkover_winner_set_count, 1);
  is_set_rule := competition_record.result_rule = 'SETS'::public.championship_sport_result_rule;

  FOR affected_match IN
    SELECT
      matches_table.id,
      matches_table.home_team_id,
      matches_table.away_team_id,
      matches_table.start_time,
      matches_table.status
    FROM public.matches AS matches_table
    JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.match_id = matches_table.id
    WHERE bracket_matches_table.competition_id = competition_record.id
      AND (
        matches_table.home_team_id = _team_id
        OR matches_table.away_team_id = _team_id
      )
  LOOP
    winner_side := CASE WHEN affected_match.home_team_id = _team_id THEN 'away' ELSE 'home' END;
    resolved_home_score := CASE
      WHEN is_set_rule THEN CASE WHEN winner_side = 'home' THEN walkover_winner_set_count ELSE 0 END
      ELSE CASE WHEN winner_side = 'home' THEN walkover_winner_points ELSE 0 END
    END;
    resolved_away_score := CASE
      WHEN is_set_rule THEN CASE WHEN winner_side = 'away' THEN walkover_winner_set_count ELSE 0 END
      ELSE CASE WHEN winner_side = 'away' THEN walkover_winner_points ELSE 0 END
    END;

    UPDATE public.matches AS matches_table
    SET
      home_score = resolved_home_score,
      away_score = resolved_away_score,
      current_set_home_score = NULL,
      current_set_away_score = NULL,
      home_yellow_cards = 0,
      home_red_cards = 0,
      away_yellow_cards = 0,
      away_red_cards = 0,
      start_time = COALESCE(matches_table.start_time, now()),
      end_time = CASE
        WHEN matches_table.start_time IS NOT NULL THEN COALESCE(matches_table.end_time, now())
        ELSE NULL
      END,
      status = 'FINISHED'::public.match_status,
      is_walkover = true,
      is_double_walkover = false,
      walkover_loser_team_id = _team_id,
      is_score_sheet_reviewed = true,
      disqualification_id = disqualification_id
    WHERE matches_table.id = affected_match.id;

    DELETE FROM public.match_sets WHERE match_id = affected_match.id;

    IF is_set_rule THEN
      INSERT INTO public.match_sets (
        match_id,
        set_number,
        home_points,
        away_points
      )
      SELECT
        affected_match.id,
        generated_sets.set_number,
        CASE WHEN winner_side = 'home' THEN walkover_winner_points ELSE 0 END,
        CASE WHEN winner_side = 'away' THEN walkover_winner_points ELSE 0 END
      FROM generate_series(1, walkover_winner_set_count) AS generated_sets(set_number);
    END IF;

    updated_matches_count := updated_matches_count + 1;
  END LOOP;

  DELETE FROM public.championship_award_draw_results AS draw_results_table
  WHERE draw_results_table.championship_id = _championship_id
    AND draw_results_table.season_year = _season_year
    AND draw_results_table.sport_id = _sport_id
    AND draw_results_table.naipe = _naipe
    AND draw_results_table.division IS NOT DISTINCT FROM _division
    AND (
      draw_results_table.winner_team_id = _team_id
      OR EXISTS (
        SELECT 1
        FROM public.championship_award_players AS award_players_table
        WHERE award_players_table.id = draw_results_table.winner_player_id
          AND award_players_table.team_id = _team_id
      )
    );

  PERFORM public.refresh_championship_knockout_competition_after_disqualification(
    _championship_id,
    competition_record.id
  );

  RETURN jsonb_build_object(
    'success', true,
    'disqualification_id', disqualification_id,
    'updated_matches_count', updated_matches_count
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
