ALTER TABLE public.championship_season_settings
  ADD COLUMN IF NOT EXISTS yellow_card_reset_phase TEXT NOT NULL DEFAULT 'NONE'
  CHECK (yellow_card_reset_phase IN ('NONE', 'QUARTERFINAL', 'SEMIFINAL'));

CREATE TABLE IF NOT EXISTS public.match_yellow_card_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  player_id UUID NOT NULL REFERENCES public.championship_award_players(id) ON DELETE RESTRICT,
  card_order INTEGER NOT NULL CHECK (card_order > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT match_yellow_card_players_unique_card_slot UNIQUE (match_id, team_id, card_order)
);

CREATE INDEX IF NOT EXISTS match_yellow_card_players_match_idx
  ON public.match_yellow_card_players (match_id);

CREATE INDEX IF NOT EXISTS match_yellow_card_players_player_idx
  ON public.match_yellow_card_players (player_id);

ALTER TABLE public.match_yellow_card_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public yellow card records are readable"
  ON public.match_yellow_card_players;

CREATE POLICY "Public yellow card records are readable"
  ON public.match_yellow_card_players
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.match_yellow_card_players TO anon, authenticated;

DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'match_yellow_card_players'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.match_yellow_card_players;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'championship_season_settings'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.championship_season_settings;
    END IF;
  END IF;
END;
$block$;

DROP FUNCTION IF EXISTS public.save_match_score_sheet_awards(UUID, JSONB, JSONB, JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.save_match_score_sheet_awards(
  _match_id UUID,
  _home_goal_scorers JSONB DEFAULT '[]'::jsonb,
  _away_goal_scorers JSONB DEFAULT '[]'::jsonb,
  _home_goalkeepers JSONB DEFAULT '[]'::jsonb,
  _away_goalkeepers JSONB DEFAULT '[]'::jsonb,
  _home_yellow_card_players JSONB DEFAULT '[]'::jsonb,
  _away_yellow_card_players JSONB DEFAULT '[]'::jsonb
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
  resolved_player_id UUID;
  home_goal_count INTEGER;
  away_goal_count INTEGER;
  home_yellow_card_count INTEGER;
  away_yellow_card_count INTEGER;
  home_goal_order INTEGER := 0;
  away_goal_order INTEGER := 0;
  home_yellow_card_order INTEGER := 0;
  away_yellow_card_order INTEGER := 0;
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

  IF (home_yellow_card_count > 0 OR away_yellow_card_count > 0) AND NOT COALESCE(match_record.supports_cards, false) THEN
    RAISE EXCEPTION 'Esta modalidade não utiliza cartões.';
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
    SELECT matches_table.id, matches_table.championship_id, matches_table.season_year, matches_table.sport_id, matches_table.naipe, matches_table.division, matches_table.home_team_id, matches_table.away_team_id, matches_table.home_score, matches_table.away_score, matches_table.home_yellow_cards, matches_table.away_yellow_cards, matches_table.supports_cards, matches_table.is_walkover
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
      'supports_cards', COALESCE(match_context.supports_cards, false),
      'is_walkover', COALESCE(match_context.is_walkover, false),
      'home_players', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', players.id, 'name', players.name) ORDER BY players.name) FROM players WHERE players.team_id = match_context.home_team_id), '[]'::jsonb),
      'away_players', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', players.id, 'name', players.name) ORDER BY players.name) FROM players WHERE players.team_id = match_context.away_team_id), '[]'::jsonb),
      'home_goals', COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id', home_goals.player_id, 'player_name', home_goals.player_name) ORDER BY home_goals.goal_order) FROM home_goals), '[]'::jsonb),
      'away_goals', COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id', away_goals.player_id, 'player_name', away_goals.player_name) ORDER BY away_goals.goal_order) FROM away_goals), '[]'::jsonb),
      'home_yellow_cards', COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id', home_yellow_cards.player_id, 'player_name', home_yellow_cards.player_name) ORDER BY home_yellow_cards.card_order) FROM home_yellow_cards), '[]'::jsonb),
      'away_yellow_cards', COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id', away_yellow_cards.player_id, 'player_name', away_yellow_cards.player_name) ORDER BY away_yellow_cards.card_order) FROM away_yellow_cards), '[]'::jsonb)
    )
    FROM match_context
  ), '{}'::jsonb);
$func$;

CREATE FUNCTION public.get_championship_yellow_card_discipline(
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
      bool_or(
        bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
        AND bracket_matches_table.round_number = public.resolve_championship_competition_expected_knockout_rounds(bracket_matches_table.competition_id) - 2
      ) AS has_quarterfinal,
      bool_or(
        bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
        AND bracket_matches_table.round_number = public.resolve_championship_competition_expected_knockout_rounds(bracket_matches_table.competition_id) - 1
      ) AS has_semifinal,
      bool_or(
        bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
        AND bracket_matches_table.round_number = public.resolve_championship_competition_expected_knockout_rounds(bracket_matches_table.competition_id)
      ) AS has_final
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
  card_rows AS (
    SELECT yellow_cards_table.player_id, yellow_cards_table.team_id, matches_table.id AS match_id, matches_table.sport_id, matches_table.naipe, matches_table.division,
      matches_table.scheduled_date, matches_table.start_time, sports_table.name AS sport_name, teams_table.name AS team_name,
      CASE
        WHEN bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
          AND bracket_matches_table.is_third_place THEN 'THIRD_PLACE'
        WHEN bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
          AND bracket_matches_table.round_number = public.resolve_championship_competition_expected_knockout_rounds(bracket_matches_table.competition_id) THEN 'FINAL'
        WHEN bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
          AND bracket_matches_table.round_number = public.resolve_championship_competition_expected_knockout_rounds(bracket_matches_table.competition_id) - 1 THEN 'SEMIFINAL'
        WHEN bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
          AND bracket_matches_table.round_number = public.resolve_championship_competition_expected_knockout_rounds(bracket_matches_table.competition_id) - 2 THEN 'QUARTERFINAL'
        ELSE 'GROUP_STAGE'
      END AS phase,
      COALESCE(effective_resets.effective_reset_phase, 'NONE') AS effective_reset_phase
    FROM public.match_yellow_card_players AS yellow_cards_table
    JOIN public.matches AS matches_table ON matches_table.id = yellow_cards_table.match_id
    JOIN resolved_season ON resolved_season.season_year = matches_table.season_year
    JOIN public.championship_award_players AS award_players_table ON award_players_table.id = yellow_cards_table.player_id
    JOIN public.sports AS sports_table ON sports_table.id = matches_table.sport_id
    JOIN public.teams AS teams_table ON teams_table.id = yellow_cards_table.team_id
    LEFT JOIN public.championship_bracket_matches AS bracket_matches_table ON bracket_matches_table.match_id = matches_table.id
    LEFT JOIN effective_resets ON effective_resets.sport_id = matches_table.sport_id AND effective_resets.naipe = matches_table.naipe AND effective_resets.division IS NOT DISTINCT FROM matches_table.division
    WHERE matches_table.championship_id = _championship_id
      AND matches_table.status = 'FINISHED'::public.match_status
      AND COALESCE(matches_table.is_walkover, false) = false
  ),
  aggregated_rows AS (
    SELECT card_rows.player_id, card_rows.team_id, card_rows.sport_id, card_rows.naipe, card_rows.division,
      max(award_players_table.name) AS player_name, max(card_rows.team_name) AS team_name, max(card_rows.sport_name) AS sport_name,
      count(*)::int AS yellow_cards_total,
      count(*) FILTER (WHERE card_rows.effective_reset_phase = 'NONE' OR (card_rows.effective_reset_phase = 'QUARTERFINAL' AND card_rows.phase IN ('QUARTERFINAL', 'SEMIFINAL', 'FINAL', 'THIRD_PLACE')) OR (card_rows.effective_reset_phase = 'SEMIFINAL' AND card_rows.phase IN ('SEMIFINAL', 'FINAL', 'THIRD_PLACE')) OR (card_rows.effective_reset_phase = 'FINAL' AND card_rows.phase IN ('FINAL', 'THIRD_PLACE')))::int AS yellow_cards_active,
      max(card_rows.effective_reset_phase) AS effective_reset_phase,
      jsonb_agg(jsonb_build_object('match_id', card_rows.match_id, 'scheduled_date', card_rows.scheduled_date, 'start_time', card_rows.start_time, 'phase', card_rows.phase) ORDER BY card_rows.scheduled_date NULLS LAST, card_rows.start_time NULLS LAST, card_rows.match_id) AS matches
    FROM card_rows
    JOIN public.championship_award_players AS award_players_table ON award_players_table.id = card_rows.player_id
    GROUP BY card_rows.player_id, card_rows.team_id, card_rows.sport_id, card_rows.naipe, card_rows.division
  )
  SELECT jsonb_build_object(
    'season_year', (SELECT season_year FROM resolved_season),
    'athletes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'player_id', aggregated_rows.player_id,
        'player_name', aggregated_rows.player_name,
        'team_id', aggregated_rows.team_id,
        'team_name', aggregated_rows.team_name,
        'sport_id', aggregated_rows.sport_id,
        'sport_name', aggregated_rows.sport_name,
        'naipe', aggregated_rows.naipe,
        'division', aggregated_rows.division,
        'yellow_cards_total', aggregated_rows.yellow_cards_total,
        'yellow_cards_active', aggregated_rows.yellow_cards_active,
        'is_suspended', aggregated_rows.yellow_cards_active >= 2,
        'effective_reset_phase', aggregated_rows.effective_reset_phase,
        'next_match', COALESCE(next_match.next_match, 'null'::jsonb),
        'matches', aggregated_rows.matches
      ) ORDER BY aggregated_rows.yellow_cards_active DESC, aggregated_rows.yellow_cards_total DESC, aggregated_rows.player_name, aggregated_rows.team_name)
      FROM aggregated_rows
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('match_id', matches_table.id, 'scheduled_date', matches_table.scheduled_date, 'start_time', matches_table.start_time, 'opponent_name', CASE WHEN matches_table.home_team_id = aggregated_rows.team_id THEN away_teams_table.name ELSE home_teams_table.name END) AS next_match
        FROM public.matches AS matches_table
        LEFT JOIN public.teams AS home_teams_table ON home_teams_table.id = matches_table.home_team_id
        LEFT JOIN public.teams AS away_teams_table ON away_teams_table.id = matches_table.away_team_id
        WHERE matches_table.championship_id = _championship_id
          AND matches_table.season_year = (SELECT season_year FROM resolved_season)
          AND matches_table.sport_id = aggregated_rows.sport_id
          AND matches_table.naipe = aggregated_rows.naipe
          AND matches_table.division IS NOT DISTINCT FROM aggregated_rows.division
          AND aggregated_rows.team_id IN (matches_table.home_team_id, matches_table.away_team_id)
          AND matches_table.status IN ('SCHEDULED'::public.match_status, 'LIVE'::public.match_status)
        ORDER BY matches_table.scheduled_date NULLS LAST, matches_table.start_time NULLS LAST, matches_table.queue_position NULLS LAST
        LIMIT 1
      ) AS next_match ON true
    ), '[]'::jsonb)
  );
$func$;

REVOKE ALL ON FUNCTION public.get_championship_yellow_card_discipline(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_championship_yellow_card_discipline(UUID, INTEGER) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.save_match_score_sheet_awards(UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_match_score_sheet_awards(UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB) TO authenticated;
