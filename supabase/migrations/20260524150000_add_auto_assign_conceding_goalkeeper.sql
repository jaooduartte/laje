-- Adiciona auto-atribuição do goleiro que sofreu o gol em save_match_score_sheet_awards.
--
-- Comportamento: se o campo conceding_goalkeeper_name for deixado em branco e o time
-- adversário tiver exatamente um goleiro cadastrado na partida, o sistema vincula
-- automaticamente esse goleiro ao gol, sem necessidade de informar o nome.

DROP FUNCTION IF EXISTS public.save_match_score_sheet_awards(UUID, JSONB, JSONB, JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.save_match_score_sheet_awards(
  _match_id UUID,
  _home_goal_scorers JSONB DEFAULT '[]'::jsonb,
  _away_goal_scorers JSONB DEFAULT '[]'::jsonb,
  _home_goalkeepers JSONB DEFAULT '[]'::jsonb,
  _away_goalkeepers JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  match_record RECORD;
  home_goalkeeper_entry JSONB;
  away_goalkeeper_entry JSONB;
  home_goal_scorer_entry JSONB;
  away_goal_scorer_entry JSONB;
  resolved_player_id UUID;
  conceding_gk_name TEXT;
  conceding_gk_player_id UUID;
  home_goal_count INTEGER;
  away_goal_count INTEGER;
  home_goal_order INTEGER := 0;
  away_goal_order INTEGER := 0;
BEGIN
  IF NOT public.has_admin_tab_access('score_sheet_review'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Sem permissão para salvar revisão de súmula.';
  END IF;

  IF _home_goal_scorers IS NULL OR jsonb_typeof(_home_goal_scorers) <> 'array' THEN
    _home_goal_scorers := '[]'::jsonb;
  END IF;

  IF _away_goal_scorers IS NULL OR jsonb_typeof(_away_goal_scorers) <> 'array' THEN
    _away_goal_scorers := '[]'::jsonb;
  END IF;

  IF _home_goalkeepers IS NULL OR jsonb_typeof(_home_goalkeepers) <> 'array' THEN
    _home_goalkeepers := '[]'::jsonb;
  END IF;

  IF _away_goalkeepers IS NULL OR jsonb_typeof(_away_goalkeepers) <> 'array' THEN
    _away_goalkeepers := '[]'::jsonb;
  END IF;

  SELECT
    matches_table.id,
    matches_table.championship_id,
    matches_table.season_year,
    matches_table.sport_id,
    matches_table.naipe,
    matches_table.division,
    matches_table.home_team_id,
    matches_table.away_team_id,
    matches_table.home_score,
    matches_table.away_score,
    matches_table.is_walkover,
    matches_table.status
  INTO match_record
  FROM public.matches AS matches_table
  WHERE matches_table.id = _match_id
  LIMIT 1;

  IF match_record.id IS NULL THEN
    RAISE EXCEPTION 'Jogo não encontrado.';
  END IF;

  IF match_record.status <> 'FINISHED'::public.match_status THEN
    RAISE EXCEPTION 'Só é possível revisar súmulas de jogos encerrados.';
  END IF;

  DELETE FROM public.match_award_goal_scorers WHERE match_id = _match_id;
  DELETE FROM public.match_award_goalkeepers WHERE match_id = _match_id;

  IF COALESCE(match_record.is_walkover, false) = true THEN
    UPDATE public.matches SET is_score_sheet_reviewed = true WHERE id = _match_id;
    RETURN jsonb_build_object('match_id', _match_id, 'is_walkover', true, 'is_score_sheet_reviewed', true);
  END IF;

  home_goal_count := jsonb_array_length(_home_goal_scorers);
  away_goal_count := jsonb_array_length(_away_goal_scorers);

  IF home_goal_count <> COALESCE(match_record.home_score, 0) THEN
    RAISE EXCEPTION 'A soma de gols da casa precisa ser igual ao placar final.';
  END IF;

  IF away_goal_count <> COALESCE(match_record.away_score, 0) THEN
    RAISE EXCEPTION 'A soma de gols do visitante precisa ser igual ao placar final.';
  END IF;

  IF jsonb_array_length(_home_goalkeepers) = 0 THEN
    RAISE EXCEPTION 'Informe pelo menos um goleiro do time da casa.';
  END IF;

  IF jsonb_array_length(_away_goalkeepers) = 0 THEN
    RAISE EXCEPTION 'Informe pelo menos um goleiro do time visitante.';
  END IF;

  -- Insere goleiros da casa
  FOR home_goalkeeper_entry IN SELECT value FROM jsonb_array_elements(_home_goalkeepers) LOOP
    resolved_player_id := public.resolve_or_create_championship_award_player(
      match_record.championship_id,
      match_record.season_year,
      match_record.sport_id,
      match_record.home_team_id,
      match_record.naipe,
      match_record.division,
      home_goalkeeper_entry
    );

    INSERT INTO public.match_award_goalkeepers (match_id, team_id, player_id)
    VALUES (_match_id, match_record.home_team_id, resolved_player_id)
    ON CONFLICT (match_id, team_id, player_id) DO NOTHING;
  END LOOP;

  -- Insere goleiros do visitante
  FOR away_goalkeeper_entry IN SELECT value FROM jsonb_array_elements(_away_goalkeepers) LOOP
    resolved_player_id := public.resolve_or_create_championship_award_player(
      match_record.championship_id,
      match_record.season_year,
      match_record.sport_id,
      match_record.away_team_id,
      match_record.naipe,
      match_record.division,
      away_goalkeeper_entry
    );

    INSERT INTO public.match_award_goalkeepers (match_id, team_id, player_id)
    VALUES (_match_id, match_record.away_team_id, resolved_player_id)
    ON CONFLICT (match_id, team_id, player_id) DO NOTHING;
  END LOOP;

  -- Insere gols da casa; goleiro que sofreu é resolvido pelo nome no time visitante.
  -- Se o nome ficar vazio e o visitante tiver exatamente um goleiro, atribui automaticamente.
  FOR home_goal_scorer_entry IN SELECT value FROM jsonb_array_elements(_home_goal_scorers) LOOP
    home_goal_order := home_goal_order + 1;

    resolved_player_id := public.resolve_or_create_championship_award_player(
      match_record.championship_id,
      match_record.season_year,
      match_record.sport_id,
      match_record.home_team_id,
      match_record.naipe,
      match_record.division,
      home_goal_scorer_entry
    );

    conceding_gk_name := trim(COALESCE(home_goal_scorer_entry->>'conceding_goalkeeper_name', ''));
    conceding_gk_player_id := NULL;

    IF conceding_gk_name <> '' THEN
      SELECT gk.player_id INTO conceding_gk_player_id
      FROM public.match_award_goalkeepers AS gk
      JOIN public.championship_award_players AS ap ON ap.id = gk.player_id
      WHERE gk.match_id = _match_id
        AND gk.team_id = match_record.away_team_id
        AND ap.normalized_name = public.normalize_award_player_name(conceding_gk_name)
      LIMIT 1;

      IF conceding_gk_player_id IS NULL THEN
        RAISE EXCEPTION 'Goleiro "%" não encontrado entre os goleiros registrados do time visitante.', conceding_gk_name;
      END IF;
    ELSE
      -- Campo vazio: se o visitante tiver exatamente um goleiro, atribui automaticamente
      IF (SELECT count(*) FROM public.match_award_goalkeepers WHERE match_id = _match_id AND team_id = match_record.away_team_id) = 1 THEN
        SELECT gk.player_id INTO conceding_gk_player_id
        FROM public.match_award_goalkeepers AS gk
        WHERE gk.match_id = _match_id
          AND gk.team_id = match_record.away_team_id
        LIMIT 1;
      END IF;
    END IF;

    INSERT INTO public.match_award_goal_scorers (match_id, team_id, player_id, goal_order, conceding_goalkeeper_player_id)
    VALUES (_match_id, match_record.home_team_id, resolved_player_id, home_goal_order, conceding_gk_player_id);
  END LOOP;

  -- Insere gols do visitante; goleiro que sofreu é resolvido pelo nome no time da casa.
  -- Se o nome ficar vazio e a casa tiver exatamente um goleiro, atribui automaticamente.
  FOR away_goal_scorer_entry IN SELECT value FROM jsonb_array_elements(_away_goal_scorers) LOOP
    away_goal_order := away_goal_order + 1;

    resolved_player_id := public.resolve_or_create_championship_award_player(
      match_record.championship_id,
      match_record.season_year,
      match_record.sport_id,
      match_record.away_team_id,
      match_record.naipe,
      match_record.division,
      away_goal_scorer_entry
    );

    conceding_gk_name := trim(COALESCE(away_goal_scorer_entry->>'conceding_goalkeeper_name', ''));
    conceding_gk_player_id := NULL;

    IF conceding_gk_name <> '' THEN
      SELECT gk.player_id INTO conceding_gk_player_id
      FROM public.match_award_goalkeepers AS gk
      JOIN public.championship_award_players AS ap ON ap.id = gk.player_id
      WHERE gk.match_id = _match_id
        AND gk.team_id = match_record.home_team_id
        AND ap.normalized_name = public.normalize_award_player_name(conceding_gk_name)
      LIMIT 1;

      IF conceding_gk_player_id IS NULL THEN
        RAISE EXCEPTION 'Goleiro "%" não encontrado entre os goleiros registrados do time da casa.', conceding_gk_name;
      END IF;
    ELSE
      -- Campo vazio: se a casa tiver exatamente um goleiro, atribui automaticamente
      IF (SELECT count(*) FROM public.match_award_goalkeepers WHERE match_id = _match_id AND team_id = match_record.home_team_id) = 1 THEN
        SELECT gk.player_id INTO conceding_gk_player_id
        FROM public.match_award_goalkeepers AS gk
        WHERE gk.match_id = _match_id
          AND gk.team_id = match_record.home_team_id
        LIMIT 1;
      END IF;
    END IF;

    INSERT INTO public.match_award_goal_scorers (match_id, team_id, player_id, goal_order, conceding_goalkeeper_player_id)
    VALUES (_match_id, match_record.away_team_id, resolved_player_id, away_goal_order, conceding_gk_player_id);
  END LOOP;

  UPDATE public.matches SET is_score_sheet_reviewed = true WHERE id = _match_id;

  RETURN jsonb_build_object('match_id', _match_id, 'is_walkover', false, 'is_score_sheet_reviewed', true);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.save_match_score_sheet_awards(UUID, JSONB, JSONB, JSONB, JSONB) TO authenticated;
