DROP TABLE IF EXISTS public.match_two_minute_penalty_players;

CREATE OR REPLACE FUNCTION public.save_match_score_sheet_awards(
  _match_id UUID,
  _home_goal_scorers JSONB DEFAULT '[]'::jsonb,
  _away_goal_scorers JSONB DEFAULT '[]'::jsonb,
  _home_goalkeepers JSONB DEFAULT '[]'::jsonb,
  _away_goalkeepers JSONB DEFAULT '[]'::jsonb,
  _home_yellow_card_players JSONB DEFAULT '[]'::jsonb,
  _away_yellow_card_players JSONB DEFAULT '[]'::jsonb,
  _home_red_card_players JSONB DEFAULT '[]'::jsonb,
  _away_red_card_players JSONB DEFAULT '[]'::jsonb,
  _home_blue_card_players JSONB DEFAULT '[]'::jsonb,
  _away_blue_card_players JSONB DEFAULT '[]'::jsonb,
  _home_two_minute_penalty_players JSONB DEFAULT '[]'::jsonb,
  _away_two_minute_penalty_players JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  match_record RECORD;
  selection_entry JSONB;
  resolved_player_id UUID;
  home_goal_count INTEGER;
  away_goal_count INTEGER;
  home_yellow_card_count INTEGER;
  away_yellow_card_count INTEGER;
  home_red_card_count INTEGER;
  away_red_card_count INTEGER;
  home_blue_card_count INTEGER;
  away_blue_card_count INTEGER;
  selection_order INTEGER;
  requires_goal_scorers BOOLEAN := false;
  supports_cards BOOLEAN := false;
BEGIN
  IF NOT public.has_admin_tab_access('score_sheet_review'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Sem permissão para salvar revisão de súmula.';
  END IF;

  IF _home_goal_scorers IS NULL OR jsonb_typeof(_home_goal_scorers) <> 'array' THEN _home_goal_scorers := '[]'::jsonb; END IF;
  IF _away_goal_scorers IS NULL OR jsonb_typeof(_away_goal_scorers) <> 'array' THEN _away_goal_scorers := '[]'::jsonb; END IF;
  IF _home_yellow_card_players IS NULL OR jsonb_typeof(_home_yellow_card_players) <> 'array' THEN _home_yellow_card_players := '[]'::jsonb; END IF;
  IF _away_yellow_card_players IS NULL OR jsonb_typeof(_away_yellow_card_players) <> 'array' THEN _away_yellow_card_players := '[]'::jsonb; END IF;
  IF _home_red_card_players IS NULL OR jsonb_typeof(_home_red_card_players) <> 'array' THEN _home_red_card_players := '[]'::jsonb; END IF;
  IF _away_red_card_players IS NULL OR jsonb_typeof(_away_red_card_players) <> 'array' THEN _away_red_card_players := '[]'::jsonb; END IF;
  IF _home_blue_card_players IS NULL OR jsonb_typeof(_home_blue_card_players) <> 'array' THEN _home_blue_card_players := '[]'::jsonb; END IF;
  IF _away_blue_card_players IS NULL OR jsonb_typeof(_away_blue_card_players) <> 'array' THEN _away_blue_card_players := '[]'::jsonb; END IF;

  SELECT
    matches_table.*,
    championships_table.code AS championship_code,
    championship_sports_table.supports_cards AS championship_sport_supports_cards,
    championship_sports_table.supports_individual_awards,
    public.normalize_sport_name(sports_table.name) AS normalized_sport_name
  INTO match_record
  FROM public.matches AS matches_table
  JOIN public.championships AS championships_table ON championships_table.id = matches_table.championship_id
  JOIN public.championship_sports AS championship_sports_table ON championship_sports_table.championship_id = matches_table.championship_id AND championship_sports_table.sport_id = matches_table.sport_id
  JOIN public.sports AS sports_table ON sports_table.id = matches_table.sport_id
  WHERE matches_table.id = _match_id
  LIMIT 1;

  IF match_record.id IS NULL THEN RAISE EXCEPTION 'Jogo não encontrado.'; END IF;
  IF match_record.status <> 'FINISHED'::public.match_status THEN RAISE EXCEPTION 'Só é possível revisar súmulas de jogos encerrados.'; END IF;

  requires_goal_scorers := match_record.championship_code = 'SOCIETY'::public.championship_code
    AND COALESCE(match_record.supports_individual_awards, false)
    AND match_record.normalized_sport_name = 'futebol society';
  supports_cards := COALESCE(match_record.supports_cards, false)
    OR COALESCE(match_record.championship_sport_supports_cards, false);

  home_goal_count := jsonb_array_length(_home_goal_scorers);
  away_goal_count := jsonb_array_length(_away_goal_scorers);
  home_yellow_card_count := jsonb_array_length(_home_yellow_card_players);
  away_yellow_card_count := jsonb_array_length(_away_yellow_card_players);
  home_red_card_count := jsonb_array_length(_home_red_card_players);
  away_red_card_count := jsonb_array_length(_away_red_card_players);
  home_blue_card_count := jsonb_array_length(_home_blue_card_players);
  away_blue_card_count := jsonb_array_length(_away_blue_card_players);

  IF COALESCE(match_record.is_walkover, false) THEN
    IF requires_goal_scorers THEN DELETE FROM public.match_award_goal_scorers WHERE match_id = _match_id; END IF;
    DELETE FROM public.match_yellow_card_players WHERE match_id = _match_id;
    DELETE FROM public.match_red_card_players WHERE match_id = _match_id;
    DELETE FROM public.match_blue_card_players WHERE match_id = _match_id;
    UPDATE public.matches SET is_score_sheet_reviewed = true WHERE id = _match_id;
    RETURN jsonb_build_object('match_id', _match_id, 'is_walkover', true, 'is_score_sheet_reviewed', true);
  END IF;

  IF requires_goal_scorers AND home_goal_count <> COALESCE(match_record.home_score, 0) THEN RAISE EXCEPTION 'A soma de gols da casa precisa ser igual ao placar final.'; END IF;
  IF requires_goal_scorers AND away_goal_count <> COALESCE(match_record.away_score, 0) THEN RAISE EXCEPTION 'A soma de gols do visitante precisa ser igual ao placar final.'; END IF;

  IF (home_yellow_card_count > 0 OR away_yellow_card_count > 0 OR home_red_card_count > 0 OR away_red_card_count > 0 OR home_blue_card_count > 0 OR away_blue_card_count > 0) AND NOT supports_cards THEN
    RAISE EXCEPTION 'Esta modalidade não utiliza cartões.';
  END IF;

  IF supports_cards AND home_yellow_card_count <> COALESCE(match_record.home_yellow_cards, 0) THEN RAISE EXCEPTION 'Informe um atleta para cada cartão amarelo da equipe da casa.'; END IF;
  IF supports_cards AND away_yellow_card_count <> COALESCE(match_record.away_yellow_cards, 0) THEN RAISE EXCEPTION 'Informe um atleta para cada cartão amarelo da equipe visitante.'; END IF;
  IF supports_cards AND home_red_card_count <> COALESCE(match_record.home_red_cards, 0) THEN RAISE EXCEPTION 'Informe um atleta para cada cartão vermelho da equipe da casa.'; END IF;
  IF supports_cards AND away_red_card_count <> COALESCE(match_record.away_red_cards, 0) THEN RAISE EXCEPTION 'Informe um atleta para cada cartão vermelho da equipe visitante.'; END IF;
  IF supports_cards AND home_blue_card_count <> COALESCE(match_record.home_blue_cards, 0) THEN RAISE EXCEPTION 'Informe um atleta para cada cartão azul da equipe da casa.'; END IF;
  IF supports_cards AND away_blue_card_count <> COALESCE(match_record.away_blue_cards, 0) THEN RAISE EXCEPTION 'Informe um atleta para cada cartão azul da equipe visitante.'; END IF;

  IF requires_goal_scorers THEN DELETE FROM public.match_award_goal_scorers WHERE match_id = _match_id; END IF;
  DELETE FROM public.match_yellow_card_players WHERE match_id = _match_id;
  DELETE FROM public.match_red_card_players WHERE match_id = _match_id;
  DELETE FROM public.match_blue_card_players WHERE match_id = _match_id;

  IF requires_goal_scorers THEN
    selection_order := 0;
    FOR selection_entry IN SELECT value FROM jsonb_array_elements(_home_goal_scorers) LOOP
      selection_order := selection_order + 1;
      resolved_player_id := public.resolve_or_create_championship_award_player(match_record.championship_id, match_record.season_year, match_record.sport_id, match_record.home_team_id, match_record.naipe, match_record.division, selection_entry);
      INSERT INTO public.match_award_goal_scorers (match_id, team_id, player_id, goal_order) VALUES (_match_id, match_record.home_team_id, resolved_player_id, selection_order);
    END LOOP;
    selection_order := 0;
    FOR selection_entry IN SELECT value FROM jsonb_array_elements(_away_goal_scorers) LOOP
      selection_order := selection_order + 1;
      resolved_player_id := public.resolve_or_create_championship_award_player(match_record.championship_id, match_record.season_year, match_record.sport_id, match_record.away_team_id, match_record.naipe, match_record.division, selection_entry);
      INSERT INTO public.match_award_goal_scorers (match_id, team_id, player_id, goal_order) VALUES (_match_id, match_record.away_team_id, resolved_player_id, selection_order);
    END LOOP;
  END IF;

  selection_order := 0;
  FOR selection_entry IN SELECT value FROM jsonb_array_elements(_home_yellow_card_players) LOOP
    selection_order := selection_order + 1;
    resolved_player_id := public.resolve_or_create_championship_award_player(match_record.championship_id, match_record.season_year, match_record.sport_id, match_record.home_team_id, match_record.naipe, match_record.division, selection_entry);
    INSERT INTO public.match_yellow_card_players (match_id, team_id, player_id, card_order) VALUES (_match_id, match_record.home_team_id, resolved_player_id, selection_order);
  END LOOP;
  selection_order := 0;
  FOR selection_entry IN SELECT value FROM jsonb_array_elements(_away_yellow_card_players) LOOP
    selection_order := selection_order + 1;
    resolved_player_id := public.resolve_or_create_championship_award_player(match_record.championship_id, match_record.season_year, match_record.sport_id, match_record.away_team_id, match_record.naipe, match_record.division, selection_entry);
    INSERT INTO public.match_yellow_card_players (match_id, team_id, player_id, card_order) VALUES (_match_id, match_record.away_team_id, resolved_player_id, selection_order);
  END LOOP;
  selection_order := 0;
  FOR selection_entry IN SELECT value FROM jsonb_array_elements(_home_red_card_players) LOOP
    selection_order := selection_order + 1;
    resolved_player_id := public.resolve_or_create_championship_award_player(match_record.championship_id, match_record.season_year, match_record.sport_id, match_record.home_team_id, match_record.naipe, match_record.division, selection_entry);
    INSERT INTO public.match_red_card_players (match_id, team_id, player_id, card_order) VALUES (_match_id, match_record.home_team_id, resolved_player_id, selection_order);
  END LOOP;
  selection_order := 0;
  FOR selection_entry IN SELECT value FROM jsonb_array_elements(_away_red_card_players) LOOP
    selection_order := selection_order + 1;
    resolved_player_id := public.resolve_or_create_championship_award_player(match_record.championship_id, match_record.season_year, match_record.sport_id, match_record.away_team_id, match_record.naipe, match_record.division, selection_entry);
    INSERT INTO public.match_red_card_players (match_id, team_id, player_id, card_order) VALUES (_match_id, match_record.away_team_id, resolved_player_id, selection_order);
  END LOOP;
  selection_order := 0;
  FOR selection_entry IN SELECT value FROM jsonb_array_elements(_home_blue_card_players) LOOP
    selection_order := selection_order + 1;
    resolved_player_id := public.resolve_or_create_championship_award_player(match_record.championship_id, match_record.season_year, match_record.sport_id, match_record.home_team_id, match_record.naipe, match_record.division, selection_entry);
    INSERT INTO public.match_blue_card_players (match_id, team_id, player_id, card_order) VALUES (_match_id, match_record.home_team_id, resolved_player_id, selection_order);
  END LOOP;
  selection_order := 0;
  FOR selection_entry IN SELECT value FROM jsonb_array_elements(_away_blue_card_players) LOOP
    selection_order := selection_order + 1;
    resolved_player_id := public.resolve_or_create_championship_award_player(match_record.championship_id, match_record.season_year, match_record.sport_id, match_record.away_team_id, match_record.naipe, match_record.division, selection_entry);
    INSERT INTO public.match_blue_card_players (match_id, team_id, player_id, card_order) VALUES (_match_id, match_record.away_team_id, resolved_player_id, selection_order);
  END LOOP;

  UPDATE public.matches SET is_score_sheet_reviewed = true WHERE id = _match_id;
  RETURN jsonb_build_object('match_id', _match_id, 'is_walkover', false, 'is_score_sheet_reviewed', true);
END;
$func$;

CREATE OR REPLACE FUNCTION public.get_match_score_sheet_awards_context(_match_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  WITH match_context AS (
    SELECT matches_table.*, CASE WHEN championships_table.code = 'SOCIETY'::public.championship_code AND COALESCE(championship_sports_table.supports_individual_awards, false) AND public.normalize_sport_name(sports_table.name) = 'futebol society' THEN true ELSE false END AS requires_goal_scorers, COALESCE(matches_table.supports_cards, false) OR COALESCE(championship_sports_table.supports_cards, false) AS discipline_supports_cards
    FROM public.matches AS matches_table
    JOIN public.championships AS championships_table ON championships_table.id = matches_table.championship_id
    JOIN public.championship_sports AS championship_sports_table ON championship_sports_table.championship_id = matches_table.championship_id AND championship_sports_table.sport_id = matches_table.sport_id
    JOIN public.sports AS sports_table ON sports_table.id = matches_table.sport_id
    WHERE matches_table.id = _match_id
    LIMIT 1
  ),
  players AS (
    SELECT award_players_table.id, award_players_table.name, award_players_table.team_id
    FROM match_context
    JOIN public.championship_award_players AS award_players_table ON award_players_table.championship_id = match_context.championship_id AND award_players_table.season_year = match_context.season_year AND award_players_table.sport_id = match_context.sport_id AND award_players_table.naipe = match_context.naipe AND award_players_table.division IS NOT DISTINCT FROM match_context.division AND award_players_table.team_id IN (match_context.home_team_id, match_context.away_team_id)
  ),
  home_goals AS (SELECT records.goal_order, records.player_id, players.name AS player_name FROM public.match_award_goal_scorers AS records JOIN public.championship_award_players AS players ON players.id = records.player_id JOIN match_context ON records.match_id = match_context.id AND records.team_id = match_context.home_team_id),
  away_goals AS (SELECT records.goal_order, records.player_id, players.name AS player_name FROM public.match_award_goal_scorers AS records JOIN public.championship_award_players AS players ON players.id = records.player_id JOIN match_context ON records.match_id = match_context.id AND records.team_id = match_context.away_team_id),
  home_yellow_cards AS (SELECT records.card_order, records.player_id, players.name AS player_name FROM public.match_yellow_card_players AS records JOIN public.championship_award_players AS players ON players.id = records.player_id JOIN match_context ON records.match_id = match_context.id AND records.team_id = match_context.home_team_id),
  away_yellow_cards AS (SELECT records.card_order, records.player_id, players.name AS player_name FROM public.match_yellow_card_players AS records JOIN public.championship_award_players AS players ON players.id = records.player_id JOIN match_context ON records.match_id = match_context.id AND records.team_id = match_context.away_team_id),
  home_red_cards AS (SELECT records.card_order, records.player_id, players.name AS player_name FROM public.match_red_card_players AS records JOIN public.championship_award_players AS players ON players.id = records.player_id JOIN match_context ON records.match_id = match_context.id AND records.team_id = match_context.home_team_id),
  away_red_cards AS (SELECT records.card_order, records.player_id, players.name AS player_name FROM public.match_red_card_players AS records JOIN public.championship_award_players AS players ON players.id = records.player_id JOIN match_context ON records.match_id = match_context.id AND records.team_id = match_context.away_team_id),
  home_blue_cards AS (SELECT records.card_order, records.player_id, players.name AS player_name FROM public.match_blue_card_players AS records JOIN public.championship_award_players AS players ON players.id = records.player_id JOIN match_context ON records.match_id = match_context.id AND records.team_id = match_context.home_team_id),
  away_blue_cards AS (SELECT records.card_order, records.player_id, players.name AS player_name FROM public.match_blue_card_players AS records JOIN public.championship_award_players AS players ON players.id = records.player_id JOIN match_context ON records.match_id = match_context.id AND records.team_id = match_context.away_team_id)
  SELECT COALESCE((
    SELECT jsonb_build_object(
      'match_id', match_context.id,
      'home_team_id', match_context.home_team_id,
      'away_team_id', match_context.away_team_id,
      'requires_goal_scorers', match_context.requires_goal_scorers,
      'required_home_goals', CASE WHEN match_context.requires_goal_scorers THEN COALESCE(match_context.home_score, 0) ELSE 0 END,
      'required_away_goals', CASE WHEN match_context.requires_goal_scorers THEN COALESCE(match_context.away_score, 0) ELSE 0 END,
      'required_home_yellow_cards', CASE WHEN match_context.discipline_supports_cards THEN COALESCE(match_context.home_yellow_cards, 0) ELSE 0 END,
      'required_away_yellow_cards', CASE WHEN match_context.discipline_supports_cards THEN COALESCE(match_context.away_yellow_cards, 0) ELSE 0 END,
      'required_home_red_cards', CASE WHEN match_context.discipline_supports_cards THEN COALESCE(match_context.home_red_cards, 0) ELSE 0 END,
      'required_away_red_cards', CASE WHEN match_context.discipline_supports_cards THEN COALESCE(match_context.away_red_cards, 0) ELSE 0 END,
      'required_home_blue_cards', CASE WHEN match_context.discipline_supports_cards THEN COALESCE(match_context.home_blue_cards, 0) ELSE 0 END,
      'required_away_blue_cards', CASE WHEN match_context.discipline_supports_cards THEN COALESCE(match_context.away_blue_cards, 0) ELSE 0 END,
      'supports_cards', match_context.discipline_supports_cards,
      'is_walkover', COALESCE(match_context.is_walkover, false),
      'home_players', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', players.id, 'name', players.name) ORDER BY players.name) FROM players WHERE players.team_id = match_context.home_team_id), '[]'::jsonb),
      'away_players', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', players.id, 'name', players.name) ORDER BY players.name) FROM players WHERE players.team_id = match_context.away_team_id), '[]'::jsonb),
      'home_goals', CASE WHEN match_context.requires_goal_scorers THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id', home_goals.player_id, 'player_name', home_goals.player_name) ORDER BY home_goals.goal_order) FROM home_goals), '[]'::jsonb) ELSE '[]'::jsonb END,
      'away_goals', CASE WHEN match_context.requires_goal_scorers THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id', away_goals.player_id, 'player_name', away_goals.player_name) ORDER BY away_goals.goal_order) FROM away_goals), '[]'::jsonb) ELSE '[]'::jsonb END,
      'home_yellow_cards', COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id', home_yellow_cards.player_id, 'player_name', home_yellow_cards.player_name) ORDER BY home_yellow_cards.card_order) FROM home_yellow_cards), '[]'::jsonb),
      'away_yellow_cards', COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id', away_yellow_cards.player_id, 'player_name', away_yellow_cards.player_name) ORDER BY away_yellow_cards.card_order) FROM away_yellow_cards), '[]'::jsonb),
      'home_red_cards', COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id', home_red_cards.player_id, 'player_name', home_red_cards.player_name) ORDER BY home_red_cards.card_order) FROM home_red_cards), '[]'::jsonb),
      'away_red_cards', COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id', away_red_cards.player_id, 'player_name', away_red_cards.player_name) ORDER BY away_red_cards.card_order) FROM away_red_cards), '[]'::jsonb),
      'home_blue_cards', COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id', home_blue_cards.player_id, 'player_name', home_blue_cards.player_name) ORDER BY home_blue_cards.card_order) FROM home_blue_cards), '[]'::jsonb),
      'away_blue_cards', COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id', away_blue_cards.player_id, 'player_name', away_blue_cards.player_name) ORDER BY away_blue_cards.card_order) FROM away_blue_cards), '[]'::jsonb)
    )
    FROM match_context
  ), '{}'::jsonb);
$func$;

REVOKE ALL ON FUNCTION public.save_match_score_sheet_awards(UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_match_score_sheet_awards(UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB) TO authenticated;
