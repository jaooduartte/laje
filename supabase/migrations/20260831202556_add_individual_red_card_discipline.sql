CREATE TABLE IF NOT EXISTS public.match_red_card_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  player_id UUID NOT NULL REFERENCES public.championship_award_players(id) ON DELETE RESTRICT,
  card_order INTEGER NOT NULL CHECK (card_order > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT match_red_card_players_unique_card_slot UNIQUE (match_id, team_id, card_order),
  CONSTRAINT match_red_card_players_unique_player UNIQUE (match_id, team_id, player_id)
);

CREATE INDEX IF NOT EXISTS match_red_card_players_match_idx
  ON public.match_red_card_players (match_id);

CREATE INDEX IF NOT EXISTS match_red_card_players_player_idx
  ON public.match_red_card_players (player_id);

ALTER TABLE public.match_red_card_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public red card records are readable"
  ON public.match_red_card_players;

CREATE POLICY "Public red card records are readable"
  ON public.match_red_card_players
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.match_red_card_players TO anon, authenticated;

DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'match_red_card_players'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.match_red_card_players;
  END IF;
END;
$block$;

DROP FUNCTION IF EXISTS public.save_match_score_sheet_awards(UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB);

CREATE FUNCTION public.save_match_score_sheet_awards(
  _match_id UUID,
  _home_goal_scorers JSONB DEFAULT '[]'::jsonb,
  _away_goal_scorers JSONB DEFAULT '[]'::jsonb,
  _home_goalkeepers JSONB DEFAULT '[]'::jsonb,
  _away_goalkeepers JSONB DEFAULT '[]'::jsonb,
  _home_yellow_card_players JSONB DEFAULT '[]'::jsonb,
  _away_yellow_card_players JSONB DEFAULT '[]'::jsonb,
  _home_red_card_players JSONB DEFAULT '[]'::jsonb,
  _away_red_card_players JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  match_record RECORD;
  home_goal_scorer_entry JSONB;
  away_goal_scorer_entry JSONB;
  home_yellow_card_player_entry JSONB;
  away_yellow_card_player_entry JSONB;
  home_red_card_player_entry JSONB;
  away_red_card_player_entry JSONB;
  resolved_player_id UUID;
  home_red_card_player_ids UUID[] := ARRAY[]::UUID[];
  away_red_card_player_ids UUID[] := ARRAY[]::UUID[];
  home_goal_count INTEGER;
  away_goal_count INTEGER;
  home_yellow_card_count INTEGER;
  away_yellow_card_count INTEGER;
  home_red_card_count INTEGER;
  away_red_card_count INTEGER;
  home_goal_order INTEGER := 0;
  away_goal_order INTEGER := 0;
  home_yellow_card_order INTEGER := 0;
  away_yellow_card_order INTEGER := 0;
  home_red_card_order INTEGER := 0;
  away_red_card_order INTEGER := 0;
  requires_goal_scorers BOOLEAN := false;
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

  IF _home_yellow_card_players IS NULL OR jsonb_typeof(_home_yellow_card_players) <> 'array' THEN
    _home_yellow_card_players := '[]'::jsonb;
  END IF;

  IF _away_yellow_card_players IS NULL OR jsonb_typeof(_away_yellow_card_players) <> 'array' THEN
    _away_yellow_card_players := '[]'::jsonb;
  END IF;

  IF _home_red_card_players IS NULL OR jsonb_typeof(_home_red_card_players) <> 'array' THEN
    _home_red_card_players := '[]'::jsonb;
  END IF;

  IF _away_red_card_players IS NULL OR jsonb_typeof(_away_red_card_players) <> 'array' THEN
    _away_red_card_players := '[]'::jsonb;
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
    matches_table.home_yellow_cards,
    matches_table.away_yellow_cards,
    matches_table.home_red_cards,
    matches_table.away_red_cards,
    matches_table.supports_cards,
    matches_table.is_walkover,
    matches_table.status,
    championships_table.code AS championship_code,
    championship_sports_table.supports_individual_awards,
    public.normalize_sport_name(sports_table.name) AS normalized_sport_name
  INTO match_record
  FROM public.matches AS matches_table
  JOIN public.championships AS championships_table
    ON championships_table.id = matches_table.championship_id
  JOIN public.championship_sports AS championship_sports_table
    ON championship_sports_table.championship_id = matches_table.championship_id
    AND championship_sports_table.sport_id = matches_table.sport_id
  JOIN public.sports AS sports_table
    ON sports_table.id = matches_table.sport_id
  WHERE matches_table.id = _match_id
  LIMIT 1;

  IF match_record.id IS NULL THEN
    RAISE EXCEPTION 'Jogo não encontrado.';
  END IF;

  IF match_record.status <> 'FINISHED'::public.match_status THEN
    RAISE EXCEPTION 'Só é possível revisar súmulas de jogos encerrados.';
  END IF;

  requires_goal_scorers := match_record.championship_code = 'SOCIETY'::public.championship_code
    AND COALESCE(match_record.supports_individual_awards, false)
    AND match_record.normalized_sport_name = 'futebol society';

  DELETE FROM public.match_award_goal_scorers
  WHERE match_id = _match_id;

  DELETE FROM public.match_yellow_card_players
  WHERE match_id = _match_id;

  DELETE FROM public.match_red_card_players
  WHERE match_id = _match_id;

  IF COALESCE(match_record.is_walkover, false) = true THEN
    UPDATE public.matches
    SET is_score_sheet_reviewed = true
    WHERE id = _match_id;

    RETURN jsonb_build_object('match_id', _match_id, 'is_walkover', true, 'is_score_sheet_reviewed', true);
  END IF;

  home_goal_count := jsonb_array_length(_home_goal_scorers);
  away_goal_count := jsonb_array_length(_away_goal_scorers);
  home_yellow_card_count := jsonb_array_length(_home_yellow_card_players);
  away_yellow_card_count := jsonb_array_length(_away_yellow_card_players);
  home_red_card_count := jsonb_array_length(_home_red_card_players);
  away_red_card_count := jsonb_array_length(_away_red_card_players);

  IF requires_goal_scorers AND home_goal_count <> COALESCE(match_record.home_score, 0) THEN
    RAISE EXCEPTION 'A soma de gols da casa precisa ser igual ao placar final.';
  END IF;

  IF requires_goal_scorers AND away_goal_count <> COALESCE(match_record.away_score, 0) THEN
    RAISE EXCEPTION 'A soma de gols do visitante precisa ser igual ao placar final.';
  END IF;

  IF home_yellow_card_count > COALESCE(match_record.home_yellow_cards, 0) THEN
    RAISE EXCEPTION 'A quantidade de atletas da casa não pode ultrapassar os cartões amarelos do jogo.';
  END IF;

  IF away_yellow_card_count > COALESCE(match_record.away_yellow_cards, 0) THEN
    RAISE EXCEPTION 'A quantidade de atletas visitantes não pode ultrapassar os cartões amarelos do jogo.';
  END IF;

  IF (home_yellow_card_count > 0 OR away_yellow_card_count > 0 OR home_red_card_count > 0 OR away_red_card_count > 0) AND NOT COALESCE(match_record.supports_cards, false) THEN
    RAISE EXCEPTION 'Esta modalidade não utiliza cartões.';
  END IF;

  IF COALESCE(match_record.supports_cards, false) AND home_red_card_count <> COALESCE(match_record.home_red_cards, 0) THEN
    RAISE EXCEPTION 'Informe um atleta para cada cartão vermelho da equipe da casa.';
  END IF;

  IF COALESCE(match_record.supports_cards, false) AND away_red_card_count <> COALESCE(match_record.away_red_cards, 0) THEN
    RAISE EXCEPTION 'Informe um atleta para cada cartão vermelho da equipe visitante.';
  END IF;

  IF requires_goal_scorers THEN
    FOR home_goal_scorer_entry IN SELECT value FROM jsonb_array_elements(_home_goal_scorers) LOOP
      home_goal_order := home_goal_order + 1;
      resolved_player_id := public.resolve_or_create_championship_award_player(match_record.championship_id, match_record.season_year, match_record.sport_id, match_record.home_team_id, match_record.naipe, match_record.division, home_goal_scorer_entry);
      INSERT INTO public.match_award_goal_scorers (match_id, team_id, player_id, goal_order)
      VALUES (_match_id, match_record.home_team_id, resolved_player_id, home_goal_order);
    END LOOP;

    FOR away_goal_scorer_entry IN SELECT value FROM jsonb_array_elements(_away_goal_scorers) LOOP
      away_goal_order := away_goal_order + 1;
      resolved_player_id := public.resolve_or_create_championship_award_player(match_record.championship_id, match_record.season_year, match_record.sport_id, match_record.away_team_id, match_record.naipe, match_record.division, away_goal_scorer_entry);
      INSERT INTO public.match_award_goal_scorers (match_id, team_id, player_id, goal_order)
      VALUES (_match_id, match_record.away_team_id, resolved_player_id, away_goal_order);
    END LOOP;
  END IF;

  FOR home_yellow_card_player_entry IN SELECT value FROM jsonb_array_elements(_home_yellow_card_players) LOOP
    home_yellow_card_order := home_yellow_card_order + 1;
    resolved_player_id := public.resolve_or_create_championship_award_player(match_record.championship_id, match_record.season_year, match_record.sport_id, match_record.home_team_id, match_record.naipe, match_record.division, home_yellow_card_player_entry);
    INSERT INTO public.match_yellow_card_players (match_id, team_id, player_id, card_order)
    VALUES (_match_id, match_record.home_team_id, resolved_player_id, home_yellow_card_order);
  END LOOP;

  FOR away_yellow_card_player_entry IN SELECT value FROM jsonb_array_elements(_away_yellow_card_players) LOOP
    away_yellow_card_order := away_yellow_card_order + 1;
    resolved_player_id := public.resolve_or_create_championship_award_player(match_record.championship_id, match_record.season_year, match_record.sport_id, match_record.away_team_id, match_record.naipe, match_record.division, away_yellow_card_player_entry);
    INSERT INTO public.match_yellow_card_players (match_id, team_id, player_id, card_order)
    VALUES (_match_id, match_record.away_team_id, resolved_player_id, away_yellow_card_order);
  END LOOP;

  FOR home_red_card_player_entry IN SELECT value FROM jsonb_array_elements(_home_red_card_players) LOOP
    home_red_card_order := home_red_card_order + 1;
    resolved_player_id := public.resolve_or_create_championship_award_player(match_record.championship_id, match_record.season_year, match_record.sport_id, match_record.home_team_id, match_record.naipe, match_record.division, home_red_card_player_entry);
    IF resolved_player_id = ANY(home_red_card_player_ids) THEN
      RAISE EXCEPTION 'O mesmo atleta não pode receber dois cartões vermelhos diretos na mesma partida.';
    END IF;
    home_red_card_player_ids := array_append(home_red_card_player_ids, resolved_player_id);
    INSERT INTO public.match_red_card_players (match_id, team_id, player_id, card_order)
    VALUES (_match_id, match_record.home_team_id, resolved_player_id, home_red_card_order);
  END LOOP;

  FOR away_red_card_player_entry IN SELECT value FROM jsonb_array_elements(_away_red_card_players) LOOP
    away_red_card_order := away_red_card_order + 1;
    resolved_player_id := public.resolve_or_create_championship_award_player(match_record.championship_id, match_record.season_year, match_record.sport_id, match_record.away_team_id, match_record.naipe, match_record.division, away_red_card_player_entry);
    IF resolved_player_id = ANY(away_red_card_player_ids) THEN
      RAISE EXCEPTION 'O mesmo atleta não pode receber dois cartões vermelhos diretos na mesma partida.';
    END IF;
    away_red_card_player_ids := array_append(away_red_card_player_ids, resolved_player_id);
    INSERT INTO public.match_red_card_players (match_id, team_id, player_id, card_order)
    VALUES (_match_id, match_record.away_team_id, resolved_player_id, away_red_card_order);
  END LOOP;

  UPDATE public.matches
  SET is_score_sheet_reviewed = true
  WHERE id = _match_id;

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
    SELECT matches_table.id, matches_table.championship_id, matches_table.season_year, matches_table.sport_id, matches_table.naipe, matches_table.division, matches_table.home_team_id, matches_table.away_team_id, matches_table.home_score, matches_table.away_score, matches_table.home_yellow_cards, matches_table.away_yellow_cards, matches_table.home_red_cards, matches_table.away_red_cards, matches_table.supports_cards, matches_table.is_walkover
    FROM public.matches AS matches_table
    WHERE matches_table.id = _match_id
    LIMIT 1
  ),
  players AS (
    SELECT award_players_table.id, award_players_table.name, award_players_table.team_id
    FROM match_context
    JOIN public.championship_award_players AS award_players_table
      ON award_players_table.championship_id = match_context.championship_id
      AND award_players_table.season_year = match_context.season_year
      AND award_players_table.sport_id = match_context.sport_id
      AND award_players_table.naipe = match_context.naipe
      AND award_players_table.division IS NOT DISTINCT FROM match_context.division
      AND award_players_table.team_id IN (match_context.home_team_id, match_context.away_team_id)
  ),
  home_goals AS (
    SELECT goal_scorers_table.goal_order, goal_scorers_table.player_id, award_players_table.name AS player_name
    FROM public.match_award_goal_scorers AS goal_scorers_table
    JOIN public.championship_award_players AS award_players_table ON award_players_table.id = goal_scorers_table.player_id
    JOIN match_context ON goal_scorers_table.match_id = match_context.id AND goal_scorers_table.team_id = match_context.home_team_id
  ),
  away_goals AS (
    SELECT goal_scorers_table.goal_order, goal_scorers_table.player_id, award_players_table.name AS player_name
    FROM public.match_award_goal_scorers AS goal_scorers_table
    JOIN public.championship_award_players AS award_players_table ON award_players_table.id = goal_scorers_table.player_id
    JOIN match_context ON goal_scorers_table.match_id = match_context.id AND goal_scorers_table.team_id = match_context.away_team_id
  ),
  home_yellow_cards AS (
    SELECT yellow_cards_table.card_order, yellow_cards_table.player_id, award_players_table.name AS player_name
    FROM public.match_yellow_card_players AS yellow_cards_table
    JOIN public.championship_award_players AS award_players_table ON award_players_table.id = yellow_cards_table.player_id
    JOIN match_context ON yellow_cards_table.match_id = match_context.id AND yellow_cards_table.team_id = match_context.home_team_id
  ),
  away_yellow_cards AS (
    SELECT yellow_cards_table.card_order, yellow_cards_table.player_id, award_players_table.name AS player_name
    FROM public.match_yellow_card_players AS yellow_cards_table
    JOIN public.championship_award_players AS award_players_table ON award_players_table.id = yellow_cards_table.player_id
    JOIN match_context ON yellow_cards_table.match_id = match_context.id AND yellow_cards_table.team_id = match_context.away_team_id
  ),
  home_red_cards AS (
    SELECT red_cards_table.card_order, red_cards_table.player_id, award_players_table.name AS player_name
    FROM public.match_red_card_players AS red_cards_table
    JOIN public.championship_award_players AS award_players_table ON award_players_table.id = red_cards_table.player_id
    JOIN match_context ON red_cards_table.match_id = match_context.id AND red_cards_table.team_id = match_context.home_team_id
  ),
  away_red_cards AS (
    SELECT red_cards_table.card_order, red_cards_table.player_id, award_players_table.name AS player_name
    FROM public.match_red_card_players AS red_cards_table
    JOIN public.championship_award_players AS award_players_table ON award_players_table.id = red_cards_table.player_id
    JOIN match_context ON red_cards_table.match_id = match_context.id AND red_cards_table.team_id = match_context.away_team_id
  )
  SELECT COALESCE((
    SELECT jsonb_build_object(
      'match_id', match_context.id,
      'home_team_id', match_context.home_team_id,
      'away_team_id', match_context.away_team_id,
      'required_home_goals', COALESCE(match_context.home_score, 0),
      'required_away_goals', COALESCE(match_context.away_score, 0),
      'required_home_yellow_cards', CASE WHEN match_context.supports_cards THEN COALESCE(match_context.home_yellow_cards, 0) ELSE 0 END,
      'required_away_yellow_cards', CASE WHEN match_context.supports_cards THEN COALESCE(match_context.away_yellow_cards, 0) ELSE 0 END,
      'required_home_red_cards', CASE WHEN match_context.supports_cards THEN COALESCE(match_context.home_red_cards, 0) ELSE 0 END,
      'required_away_red_cards', CASE WHEN match_context.supports_cards THEN COALESCE(match_context.away_red_cards, 0) ELSE 0 END,
      'supports_cards', COALESCE(match_context.supports_cards, false),
      'is_walkover', COALESCE(match_context.is_walkover, false),
      'home_players', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', players.id, 'name', players.name) ORDER BY players.name) FROM players WHERE players.team_id = match_context.home_team_id), '[]'::jsonb),
      'away_players', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', players.id, 'name', players.name) ORDER BY players.name) FROM players WHERE players.team_id = match_context.away_team_id), '[]'::jsonb),
      'home_goals', COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id', home_goals.player_id, 'player_name', home_goals.player_name) ORDER BY home_goals.goal_order) FROM home_goals), '[]'::jsonb),
      'away_goals', COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id', away_goals.player_id, 'player_name', away_goals.player_name) ORDER BY away_goals.goal_order) FROM away_goals), '[]'::jsonb),
      'home_yellow_cards', COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id', home_yellow_cards.player_id, 'player_name', home_yellow_cards.player_name) ORDER BY home_yellow_cards.card_order) FROM home_yellow_cards), '[]'::jsonb),
      'away_yellow_cards', COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id', away_yellow_cards.player_id, 'player_name', away_yellow_cards.player_name) ORDER BY away_yellow_cards.card_order) FROM away_yellow_cards), '[]'::jsonb),
      'home_red_cards', COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id', home_red_cards.player_id, 'player_name', home_red_cards.player_name) ORDER BY home_red_cards.card_order) FROM home_red_cards), '[]'::jsonb),
      'away_red_cards', COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id', away_red_cards.player_id, 'player_name', away_red_cards.player_name) ORDER BY away_red_cards.card_order) FROM away_red_cards), '[]'::jsonb)
    )
    FROM match_context
  ), '{}'::jsonb);
$func$;

CREATE OR REPLACE FUNCTION public.get_championship_yellow_card_discipline(
  _championship_id UUID,
  _season_year INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  WITH resolved_season AS (
    SELECT COALESCE(_season_year, championships_table.current_season_year) AS season_year
    FROM public.championships AS championships_table
    WHERE championships_table.id = _championship_id
    LIMIT 1
  ),
  reset_settings AS (
    SELECT COALESCE(settings_table.yellow_card_reset_phase, 'NONE') AS reset_phase
    FROM resolved_season
    LEFT JOIN public.championship_season_settings AS settings_table
      ON settings_table.championship_id = _championship_id
      AND settings_table.season_year = resolved_season.season_year
  ),
  competition_phases AS (
    SELECT matches_table.sport_id, matches_table.naipe, matches_table.division,
      bool_or(bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase AND bracket_matches_table.round_number = public.resolve_championship_competition_expected_knockout_rounds(bracket_matches_table.competition_id) - 2) AS has_quarterfinal,
      bool_or(bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase AND bracket_matches_table.round_number = public.resolve_championship_competition_expected_knockout_rounds(bracket_matches_table.competition_id) - 1) AS has_semifinal,
      bool_or(bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase AND bracket_matches_table.round_number = public.resolve_championship_competition_expected_knockout_rounds(bracket_matches_table.competition_id)) AS has_final
    FROM public.matches AS matches_table
    JOIN public.championship_bracket_matches AS bracket_matches_table ON bracket_matches_table.match_id = matches_table.id
    JOIN resolved_season ON resolved_season.season_year = matches_table.season_year
    WHERE matches_table.championship_id = _championship_id
    GROUP BY matches_table.sport_id, matches_table.naipe, matches_table.division
  ),
  effective_resets AS (
    SELECT competition_phases.*, CASE reset_settings.reset_phase
      WHEN 'QUARTERFINAL' THEN CASE WHEN has_quarterfinal THEN 'QUARTERFINAL' WHEN has_semifinal THEN 'SEMIFINAL' WHEN has_final THEN 'FINAL' ELSE 'NONE' END
      WHEN 'SEMIFINAL' THEN CASE WHEN has_semifinal THEN 'SEMIFINAL' WHEN has_final THEN 'FINAL' ELSE 'NONE' END
      ELSE 'NONE'
    END AS effective_reset_phase
    FROM competition_phases
    CROSS JOIN reset_settings
  ),
  match_base AS (
    SELECT matches_table.id AS match_id, matches_table.championship_id, matches_table.season_year, matches_table.sport_id, matches_table.naipe, matches_table.division, matches_table.home_team_id, matches_table.away_team_id, matches_table.status, matches_table.scheduled_date, matches_table.start_time, matches_table.queue_position,
      CASE
        WHEN bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase AND bracket_matches_table.is_third_place THEN 'THIRD_PLACE'
        WHEN bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase AND bracket_matches_table.round_number = public.resolve_championship_competition_expected_knockout_rounds(bracket_matches_table.competition_id) THEN 'FINAL'
        WHEN bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase AND bracket_matches_table.round_number = public.resolve_championship_competition_expected_knockout_rounds(bracket_matches_table.competition_id) - 1 THEN 'SEMIFINAL'
        WHEN bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase AND bracket_matches_table.round_number = public.resolve_championship_competition_expected_knockout_rounds(bracket_matches_table.competition_id) - 2 THEN 'QUARTERFINAL'
        ELSE 'GROUP_STAGE'
      END AS phase,
      COALESCE(effective_resets.effective_reset_phase, 'NONE') AS effective_reset_phase
    FROM public.matches AS matches_table
    JOIN resolved_season ON resolved_season.season_year = matches_table.season_year
    LEFT JOIN public.championship_bracket_matches AS bracket_matches_table ON bracket_matches_table.match_id = matches_table.id
    LEFT JOIN effective_resets ON effective_resets.sport_id = matches_table.sport_id AND effective_resets.naipe = matches_table.naipe AND effective_resets.division IS NOT DISTINCT FROM matches_table.division
    WHERE matches_table.championship_id = _championship_id
  ),
  team_match_sequence AS (
    SELECT match_base.*, match_base.home_team_id AS team_id,
      row_number() OVER (PARTITION BY match_base.sport_id, match_base.naipe, match_base.division, match_base.home_team_id ORDER BY match_base.scheduled_date NULLS LAST, match_base.start_time NULLS LAST, match_base.queue_position NULLS LAST, match_base.match_id) AS match_sequence
    FROM match_base
    UNION ALL
    SELECT match_base.*, match_base.away_team_id AS team_id,
      row_number() OVER (PARTITION BY match_base.sport_id, match_base.naipe, match_base.division, match_base.away_team_id ORDER BY match_base.scheduled_date NULLS LAST, match_base.start_time NULLS LAST, match_base.queue_position NULLS LAST, match_base.match_id) AS match_sequence
    FROM match_base
  ),
  yellow_events AS (
    SELECT yellow_cards_table.player_id, yellow_cards_table.card_order, team_match_sequence.*, award_players_table.name AS player_name, teams_table.name AS team_name, sports_table.name AS sport_name,
      CASE WHEN team_match_sequence.effective_reset_phase = 'NONE' THEN 0 WHEN team_match_sequence.effective_reset_phase = 'QUARTERFINAL' AND team_match_sequence.phase IN ('QUARTERFINAL', 'SEMIFINAL', 'FINAL', 'THIRD_PLACE') THEN 1 WHEN team_match_sequence.effective_reset_phase = 'SEMIFINAL' AND team_match_sequence.phase IN ('SEMIFINAL', 'FINAL', 'THIRD_PLACE') THEN 1 WHEN team_match_sequence.effective_reset_phase = 'FINAL' AND team_match_sequence.phase IN ('FINAL', 'THIRD_PLACE') THEN 1 ELSE 0 END AS yellow_period
    FROM public.match_yellow_card_players AS yellow_cards_table
    JOIN team_match_sequence ON team_match_sequence.match_id = yellow_cards_table.match_id AND team_match_sequence.team_id = yellow_cards_table.team_id
    JOIN public.championship_award_players AS award_players_table ON award_players_table.id = yellow_cards_table.player_id
    JOIN public.teams AS teams_table ON teams_table.id = yellow_cards_table.team_id
    JOIN public.sports AS sports_table ON sports_table.id = team_match_sequence.sport_id
    WHERE team_match_sequence.status = 'FINISHED'::public.match_status
  ),
  ordered_yellow_events AS (
    SELECT yellow_events.*, row_number() OVER (PARTITION BY player_id, team_id, sport_id, naipe, division, yellow_period ORDER BY match_sequence, card_order) AS yellow_sequence
    FROM yellow_events
  ),
  yellow_pair_events AS (
    SELECT ordered_yellow_events.*, ((yellow_sequence + 1) / 2)::integer AS yellow_pair_number
    FROM ordered_yellow_events
    WHERE yellow_sequence % 2 = 0
  ),
  direct_red_events AS (
    SELECT red_cards_table.player_id, red_cards_table.team_id, team_match_sequence.match_id, team_match_sequence.sport_id, team_match_sequence.naipe, team_match_sequence.division, team_match_sequence.match_sequence,
      1 AS red_cards_direct, 0 AS red_cards_derived
    FROM public.match_red_card_players AS red_cards_table
    JOIN team_match_sequence ON team_match_sequence.match_id = red_cards_table.match_id AND team_match_sequence.team_id = red_cards_table.team_id
    WHERE team_match_sequence.status = 'FINISHED'::public.match_status
  ),
  derived_red_events AS (
    SELECT yellow_pair_events.player_id, yellow_pair_events.team_id, yellow_pair_events.match_id, yellow_pair_events.sport_id, yellow_pair_events.naipe, yellow_pair_events.division, yellow_pair_events.match_sequence,
      0 AS red_cards_direct, 1 AS red_cards_derived
    FROM yellow_pair_events
  ),
  suspension_events AS (
    SELECT player_id, team_id, match_id, sport_id, naipe, division, match_sequence, sum(red_cards_direct)::integer AS red_cards_direct, sum(red_cards_derived)::integer AS red_cards_derived
    FROM (
      SELECT * FROM direct_red_events
      UNION ALL
      SELECT * FROM derived_red_events
    ) AS events
    GROUP BY player_id, team_id, match_id, sport_id, naipe, division, match_sequence
  ),
  suspension_event_status AS (
    SELECT suspension_events.*, next_match.match_id AS next_match_id, next_match.scheduled_date AS next_match_scheduled_date, next_match.start_time AS next_match_start_time, next_match.status AS next_match_status, next_match.opponent_name,
      COALESCE(next_match.status = 'FINISHED'::public.match_status, false) AS is_served
    FROM suspension_events
    LEFT JOIN LATERAL (
      SELECT following_matches.match_id, following_matches.scheduled_date, following_matches.start_time, following_matches.status,
        CASE WHEN following_matches.home_team_id = suspension_events.team_id THEN away_teams_table.name ELSE home_teams_table.name END AS opponent_name
      FROM team_match_sequence AS following_matches
      LEFT JOIN public.teams AS home_teams_table ON home_teams_table.id = following_matches.home_team_id
      LEFT JOIN public.teams AS away_teams_table ON away_teams_table.id = following_matches.away_team_id
      WHERE following_matches.team_id = suspension_events.team_id
        AND following_matches.sport_id = suspension_events.sport_id
        AND following_matches.naipe = suspension_events.naipe
        AND following_matches.division IS NOT DISTINCT FROM suspension_events.division
        AND following_matches.match_sequence > suspension_events.match_sequence
      ORDER BY following_matches.match_sequence
      LIMIT 1
    ) AS next_match ON true
  ),
  yellow_pair_status AS (
    SELECT yellow_pair_events.player_id, yellow_pair_events.team_id, yellow_pair_events.sport_id, yellow_pair_events.naipe, yellow_pair_events.division, yellow_pair_events.yellow_period, yellow_pair_events.yellow_pair_number,
      COALESCE(suspension_event_status.is_served, false) AS is_served
    FROM yellow_pair_events
    LEFT JOIN suspension_event_status ON suspension_event_status.player_id = yellow_pair_events.player_id
      AND suspension_event_status.team_id = yellow_pair_events.team_id
      AND suspension_event_status.match_id = yellow_pair_events.match_id
      AND suspension_event_status.sport_id = yellow_pair_events.sport_id
      AND suspension_event_status.naipe = yellow_pair_events.naipe
      AND suspension_event_status.division IS NOT DISTINCT FROM yellow_pair_events.division
  ),
  yellow_active_counts AS (
    SELECT ordered_yellow_events.player_id, ordered_yellow_events.team_id, ordered_yellow_events.sport_id, ordered_yellow_events.naipe, ordered_yellow_events.division,
      sum(CASE WHEN ordered_yellow_events.yellow_sequence % 2 = 1 AND NOT EXISTS (SELECT 1 FROM ordered_yellow_events AS next_yellow_event WHERE next_yellow_event.player_id = ordered_yellow_events.player_id AND next_yellow_event.team_id = ordered_yellow_events.team_id AND next_yellow_event.sport_id = ordered_yellow_events.sport_id AND next_yellow_event.naipe = ordered_yellow_events.naipe AND next_yellow_event.division IS NOT DISTINCT FROM ordered_yellow_events.division AND next_yellow_event.yellow_period = ordered_yellow_events.yellow_period AND next_yellow_event.yellow_sequence = ordered_yellow_events.yellow_sequence + 1) THEN 1 WHEN ordered_yellow_events.yellow_sequence % 2 = 0 AND NOT COALESCE((SELECT yellow_pair_status.is_served FROM yellow_pair_status WHERE yellow_pair_status.player_id = ordered_yellow_events.player_id AND yellow_pair_status.team_id = ordered_yellow_events.team_id AND yellow_pair_status.sport_id = ordered_yellow_events.sport_id AND yellow_pair_status.naipe = ordered_yellow_events.naipe AND yellow_pair_status.division IS NOT DISTINCT FROM ordered_yellow_events.division AND yellow_pair_status.yellow_period = ordered_yellow_events.yellow_period AND yellow_pair_status.yellow_pair_number = ((ordered_yellow_events.yellow_sequence + 1) / 2)::integer), false) THEN 2 ELSE 0 END)::integer AS yellow_cards_active
    FROM ordered_yellow_events
    WHERE ordered_yellow_events.yellow_period = CASE WHEN ordered_yellow_events.effective_reset_phase = 'NONE' THEN 0 ELSE 1 END
    GROUP BY ordered_yellow_events.player_id, ordered_yellow_events.team_id, ordered_yellow_events.sport_id, ordered_yellow_events.naipe, ordered_yellow_events.division
  ),
  athlete_contexts AS (
    SELECT player_id, team_id, sport_id, naipe, division, max(player_name) AS player_name, max(team_name) AS team_name, max(sport_name) AS sport_name, max(effective_reset_phase) AS effective_reset_phase,
      count(*)::integer AS yellow_cards_total, 0::integer AS red_cards_direct_total
    FROM yellow_events
    GROUP BY player_id, team_id, sport_id, naipe, division
    UNION ALL
    SELECT red_cards_table.player_id, red_cards_table.team_id, team_match_sequence.sport_id, team_match_sequence.naipe, team_match_sequence.division, max(award_players_table.name) AS player_name, max(teams_table.name) AS team_name, max(sports_table.name) AS sport_name, max(team_match_sequence.effective_reset_phase) AS effective_reset_phase,
      0::integer AS yellow_cards_total, count(*)::integer AS red_cards_direct_total
    FROM public.match_red_card_players AS red_cards_table
    JOIN team_match_sequence ON team_match_sequence.match_id = red_cards_table.match_id AND team_match_sequence.team_id = red_cards_table.team_id
    JOIN public.championship_award_players AS award_players_table ON award_players_table.id = red_cards_table.player_id
    JOIN public.teams AS teams_table ON teams_table.id = red_cards_table.team_id
    JOIN public.sports AS sports_table ON sports_table.id = team_match_sequence.sport_id
    WHERE team_match_sequence.status = 'FINISHED'::public.match_status
    GROUP BY red_cards_table.player_id, red_cards_table.team_id, team_match_sequence.sport_id, team_match_sequence.naipe, team_match_sequence.division
  ),
  athletes AS (
    SELECT athlete_contexts.player_id, athlete_contexts.team_id, athlete_contexts.sport_id, athlete_contexts.naipe, athlete_contexts.division, max(athlete_contexts.player_name) AS player_name, max(athlete_contexts.team_name) AS team_name, max(athlete_contexts.sport_name) AS sport_name, max(athlete_contexts.effective_reset_phase) AS effective_reset_phase,
      sum(athlete_contexts.yellow_cards_total)::integer AS yellow_cards_total, sum(athlete_contexts.red_cards_direct_total)::integer AS red_cards_direct_total
    FROM athlete_contexts
    GROUP BY athlete_contexts.player_id, athlete_contexts.team_id, athlete_contexts.sport_id, athlete_contexts.naipe, athlete_contexts.division
  ),
  card_history_events AS (
    SELECT player_id, team_id, match_id, sport_id, naipe, division, 1::integer AS yellow_cards, 0::integer AS red_cards_direct, 0::integer AS red_cards_derived
    FROM yellow_events
    UNION ALL
    SELECT player_id, team_id, match_id, sport_id, naipe, division, 0::integer, 1::integer, 0::integer
    FROM direct_red_events
    UNION ALL
    SELECT player_id, team_id, match_id, sport_id, naipe, division, 0::integer, 0::integer, 1::integer
    FROM derived_red_events
  ),
  card_history AS (
    SELECT card_history_events.player_id, card_history_events.team_id, card_history_events.sport_id, card_history_events.naipe, card_history_events.division, card_history_events.match_id, max(team_match_sequence.scheduled_date) AS scheduled_date, max(team_match_sequence.start_time) AS start_time, max(team_match_sequence.phase) AS phase,
      sum(card_history_events.yellow_cards)::integer AS yellow_cards, sum(card_history_events.red_cards_direct)::integer AS red_cards_direct, sum(card_history_events.red_cards_derived)::integer AS red_cards_derived
    FROM card_history_events
    JOIN team_match_sequence ON team_match_sequence.match_id = card_history_events.match_id AND team_match_sequence.team_id = card_history_events.team_id
    GROUP BY card_history_events.player_id, card_history_events.team_id, card_history_events.sport_id, card_history_events.naipe, card_history_events.division, card_history_events.match_id
  )
  SELECT jsonb_build_object(
    'season_year', (SELECT season_year FROM resolved_season),
    'athletes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'player_id', athletes.player_id,
        'player_name', athletes.player_name,
        'team_id', athletes.team_id,
        'team_name', athletes.team_name,
        'sport_id', athletes.sport_id,
        'sport_name', athletes.sport_name,
        'naipe', athletes.naipe,
        'division', athletes.division,
        'yellow_cards_total', athletes.yellow_cards_total,
        'yellow_cards_active', COALESCE(yellow_active_counts.yellow_cards_active, 0),
        'red_cards_direct_total', athletes.red_cards_direct_total,
        'red_cards_derived_total', COALESCE((SELECT sum(suspension_events.red_cards_derived)::integer FROM suspension_events WHERE suspension_events.player_id = athletes.player_id AND suspension_events.team_id = athletes.team_id AND suspension_events.sport_id = athletes.sport_id AND suspension_events.naipe = athletes.naipe AND suspension_events.division IS NOT DISTINCT FROM athletes.division), 0),
        'is_suspended', EXISTS (SELECT 1 FROM suspension_event_status WHERE suspension_event_status.player_id = athletes.player_id AND suspension_event_status.team_id = athletes.team_id AND suspension_event_status.sport_id = athletes.sport_id AND suspension_event_status.naipe = athletes.naipe AND suspension_event_status.division IS NOT DISTINCT FROM athletes.division AND NOT suspension_event_status.is_served),
        'suspension_causes', COALESCE((SELECT jsonb_agg(jsonb_build_object('match_id', suspension_event_status.match_id, 'direct_red', suspension_event_status.red_cards_direct > 0, 'yellow_accumulation', suspension_event_status.red_cards_derived > 0) ORDER BY suspension_event_status.match_sequence) FROM suspension_event_status WHERE suspension_event_status.player_id = athletes.player_id AND suspension_event_status.team_id = athletes.team_id AND suspension_event_status.sport_id = athletes.sport_id AND suspension_event_status.naipe = athletes.naipe AND suspension_event_status.division IS NOT DISTINCT FROM athletes.division AND NOT suspension_event_status.is_served), '[]'::jsonb),
        'effective_reset_phase', athletes.effective_reset_phase,
        'next_match', COALESCE((SELECT jsonb_build_object('match_id', suspension_event_status.next_match_id, 'scheduled_date', suspension_event_status.next_match_scheduled_date, 'start_time', suspension_event_status.next_match_start_time, 'opponent_name', suspension_event_status.opponent_name) FROM suspension_event_status WHERE suspension_event_status.player_id = athletes.player_id AND suspension_event_status.team_id = athletes.team_id AND suspension_event_status.sport_id = athletes.sport_id AND suspension_event_status.naipe = athletes.naipe AND suspension_event_status.division IS NOT DISTINCT FROM athletes.division AND NOT suspension_event_status.is_served ORDER BY suspension_event_status.match_sequence LIMIT 1), 'null'::jsonb),
        'matches', COALESCE((SELECT jsonb_agg(jsonb_build_object('match_id', card_history.match_id, 'scheduled_date', card_history.scheduled_date, 'start_time', card_history.start_time, 'phase', card_history.phase, 'yellow_cards', card_history.yellow_cards, 'red_cards_direct', card_history.red_cards_direct, 'red_cards_derived', card_history.red_cards_derived) ORDER BY card_history.scheduled_date NULLS LAST, card_history.start_time NULLS LAST, card_history.match_id) FROM card_history WHERE card_history.player_id = athletes.player_id AND card_history.team_id = athletes.team_id AND card_history.sport_id = athletes.sport_id AND card_history.naipe = athletes.naipe AND card_history.division IS NOT DISTINCT FROM athletes.division), '[]'::jsonb)
      ) ORDER BY EXISTS (SELECT 1 FROM suspension_event_status WHERE suspension_event_status.player_id = athletes.player_id AND suspension_event_status.team_id = athletes.team_id AND suspension_event_status.sport_id = athletes.sport_id AND suspension_event_status.naipe = athletes.naipe AND suspension_event_status.division IS NOT DISTINCT FROM athletes.division AND NOT suspension_event_status.is_served) DESC, athletes.red_cards_direct_total DESC, athletes.yellow_cards_total DESC, athletes.player_name, athletes.team_name)
      FROM athletes
      LEFT JOIN yellow_active_counts ON yellow_active_counts.player_id = athletes.player_id AND yellow_active_counts.team_id = athletes.team_id AND yellow_active_counts.sport_id = athletes.sport_id AND yellow_active_counts.naipe = athletes.naipe AND yellow_active_counts.division IS NOT DISTINCT FROM athletes.division
    ), '[]'::jsonb)
  );
$func$;

REVOKE ALL ON FUNCTION public.save_match_score_sheet_awards(UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_match_score_sheet_awards(UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB) TO authenticated;
