CREATE TABLE IF NOT EXISTS public.championship_award_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  season_year INTEGER NOT NULL,
  sport_id UUID NOT NULL REFERENCES public.sports(id) ON DELETE RESTRICT,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  naipe public.match_naipe NOT NULL,
  division public.team_division NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT championship_award_players_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS championship_award_players_unique_without_division_idx
  ON public.championship_award_players (
    championship_id,
    season_year,
    sport_id,
    team_id,
    naipe,
    normalized_name
  )
  WHERE division IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS championship_award_players_unique_with_division_idx
  ON public.championship_award_players (
    championship_id,
    season_year,
    sport_id,
    team_id,
    naipe,
    division,
    normalized_name
  )
  WHERE division IS NOT NULL;

CREATE INDEX IF NOT EXISTS championship_award_players_scope_idx
  ON public.championship_award_players (championship_id, season_year, sport_id, naipe, division, team_id);

CREATE TABLE IF NOT EXISTS public.match_award_goal_scorers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  player_id UUID NOT NULL REFERENCES public.championship_award_players(id) ON DELETE RESTRICT,
  goal_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT match_award_goal_scorers_goal_order_positive CHECK (goal_order > 0),
  CONSTRAINT match_award_goal_scorers_unique_goal_slot UNIQUE (match_id, team_id, goal_order)
);

CREATE INDEX IF NOT EXISTS match_award_goal_scorers_match_idx
  ON public.match_award_goal_scorers (match_id);

CREATE TABLE IF NOT EXISTS public.match_award_goalkeepers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  player_id UUID NOT NULL REFERENCES public.championship_award_players(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT match_award_goalkeepers_unique_team_per_match UNIQUE (match_id, team_id)
);

CREATE INDEX IF NOT EXISTS match_award_goalkeepers_match_idx
  ON public.match_award_goalkeepers (match_id);

CREATE OR REPLACE FUNCTION public.touch_championship_award_players_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $func$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS touch_championship_award_players_updated_at_trigger ON public.championship_award_players;

CREATE TRIGGER touch_championship_award_players_updated_at_trigger
BEFORE UPDATE ON public.championship_award_players
FOR EACH ROW
EXECUTE FUNCTION public.touch_championship_award_players_updated_at();

CREATE OR REPLACE FUNCTION public.normalize_award_player_name(_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $func$
  SELECT lower(trim(COALESCE(_name, '')));
$func$;

CREATE OR REPLACE FUNCTION public.resolve_or_create_championship_award_player(
  _championship_id UUID,
  _season_year INTEGER,
  _sport_id UUID,
  _team_id UUID,
  _naipe public.match_naipe,
  _division public.team_division,
  _payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  payload_player_id UUID;
  payload_player_name TEXT;
  payload_player_name_normalized TEXT;
  resolved_player_id UUID;
BEGIN
  payload_player_id := NULLIF(COALESCE(_payload->>'player_id', ''), '')::UUID;
  payload_player_name := trim(COALESCE(_payload->>'player_name', ''));
  payload_player_name_normalized := public.normalize_award_player_name(payload_player_name);

  IF payload_player_id IS NOT NULL THEN
    SELECT award_players_table.id
    INTO resolved_player_id
    FROM public.championship_award_players AS award_players_table
    WHERE award_players_table.id = payload_player_id
      AND award_players_table.championship_id = _championship_id
      AND award_players_table.season_year = _season_year
      AND award_players_table.sport_id = _sport_id
      AND award_players_table.team_id = _team_id
      AND award_players_table.naipe = _naipe
      AND award_players_table.division IS NOT DISTINCT FROM _division
    LIMIT 1;

    IF resolved_player_id IS NULL THEN
      RAISE EXCEPTION 'Jogador inválido para este jogo.';
    END IF;

    RETURN resolved_player_id;
  END IF;

  IF payload_player_name_normalized = '' THEN
    RAISE EXCEPTION 'Informe um jogador válido.';
  END IF;

  SELECT award_players_table.id
  INTO resolved_player_id
  FROM public.championship_award_players AS award_players_table
  WHERE award_players_table.championship_id = _championship_id
    AND award_players_table.season_year = _season_year
    AND award_players_table.sport_id = _sport_id
    AND award_players_table.team_id = _team_id
    AND award_players_table.naipe = _naipe
    AND award_players_table.division IS NOT DISTINCT FROM _division
    AND award_players_table.normalized_name = payload_player_name_normalized
  LIMIT 1;

  IF resolved_player_id IS NOT NULL THEN
    RETURN resolved_player_id;
  END IF;

  INSERT INTO public.championship_award_players (
    championship_id,
    season_year,
    sport_id,
    team_id,
    naipe,
    division,
    name,
    normalized_name
  )
  VALUES (
    _championship_id,
    _season_year,
    _sport_id,
    _team_id,
    _naipe,
    _division,
    payload_player_name,
    payload_player_name_normalized
  )
  RETURNING id INTO resolved_player_id;

  RETURN resolved_player_id;
END;
$func$;

CREATE OR REPLACE FUNCTION public.save_match_score_sheet_awards(
  _match_id UUID,
  _home_goal_scorers JSONB DEFAULT '[]'::jsonb,
  _away_goal_scorers JSONB DEFAULT '[]'::jsonb,
  _home_goalkeeper JSONB DEFAULT NULL,
  _away_goalkeeper JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  match_record RECORD;
  home_goalkeeper_player_id UUID;
  away_goalkeeper_player_id UUID;
  home_goal_scorer_entry JSONB;
  away_goal_scorer_entry JSONB;
  resolved_player_id UUID;
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

  DELETE FROM public.match_award_goal_scorers
  WHERE match_id = _match_id;

  DELETE FROM public.match_award_goalkeepers
  WHERE match_id = _match_id;

  IF COALESCE(match_record.is_walkover, false) = true THEN
    UPDATE public.matches
    SET is_score_sheet_reviewed = true
    WHERE id = _match_id;

    RETURN jsonb_build_object(
      'match_id', _match_id,
      'is_walkover', true,
      'is_score_sheet_reviewed', true
    );
  END IF;

  home_goal_count := jsonb_array_length(_home_goal_scorers);
  away_goal_count := jsonb_array_length(_away_goal_scorers);

  IF home_goal_count <> COALESCE(match_record.home_score, 0) THEN
    RAISE EXCEPTION 'A soma de gols da casa precisa ser igual ao placar final.';
  END IF;

  IF away_goal_count <> COALESCE(match_record.away_score, 0) THEN
    RAISE EXCEPTION 'A soma de gols do visitante precisa ser igual ao placar final.';
  END IF;

  IF _home_goalkeeper IS NULL THEN
    RAISE EXCEPTION 'Informe o goleiro do time da casa.';
  END IF;

  IF _away_goalkeeper IS NULL THEN
    RAISE EXCEPTION 'Informe o goleiro do time visitante.';
  END IF;

  home_goalkeeper_player_id := public.resolve_or_create_championship_award_player(
    match_record.championship_id,
    match_record.season_year,
    match_record.sport_id,
    match_record.home_team_id,
    match_record.naipe,
    match_record.division,
    _home_goalkeeper
  );

  away_goalkeeper_player_id := public.resolve_or_create_championship_award_player(
    match_record.championship_id,
    match_record.season_year,
    match_record.sport_id,
    match_record.away_team_id,
    match_record.naipe,
    match_record.division,
    _away_goalkeeper
  );

  FOR home_goal_scorer_entry IN
    SELECT value
    FROM jsonb_array_elements(_home_goal_scorers)
  LOOP
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

    INSERT INTO public.match_award_goal_scorers (
      match_id,
      team_id,
      player_id,
      goal_order
    )
    VALUES (
      _match_id,
      match_record.home_team_id,
      resolved_player_id,
      home_goal_order
    );
  END LOOP;

  FOR away_goal_scorer_entry IN
    SELECT value
    FROM jsonb_array_elements(_away_goal_scorers)
  LOOP
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

    INSERT INTO public.match_award_goal_scorers (
      match_id,
      team_id,
      player_id,
      goal_order
    )
    VALUES (
      _match_id,
      match_record.away_team_id,
      resolved_player_id,
      away_goal_order
    );
  END LOOP;

  INSERT INTO public.match_award_goalkeepers (
    match_id,
    team_id,
    player_id
  )
  VALUES
    (_match_id, match_record.home_team_id, home_goalkeeper_player_id),
    (_match_id, match_record.away_team_id, away_goalkeeper_player_id);

  UPDATE public.matches
  SET is_score_sheet_reviewed = true
  WHERE id = _match_id;

  RETURN jsonb_build_object(
    'match_id', _match_id,
    'is_walkover', false,
    'is_score_sheet_reviewed', true
  );
END;
$func$;

CREATE OR REPLACE FUNCTION public.get_match_score_sheet_awards_context(
  _match_id UUID
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  WITH match_context AS (
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
      matches_table.is_walkover
    FROM public.matches AS matches_table
    WHERE matches_table.id = _match_id
    LIMIT 1
  ),
  home_players AS (
    SELECT
      award_players_table.id,
      award_players_table.name
    FROM match_context
    JOIN public.championship_award_players AS award_players_table
      ON award_players_table.championship_id = match_context.championship_id
      AND award_players_table.season_year = match_context.season_year
      AND award_players_table.sport_id = match_context.sport_id
      AND award_players_table.naipe = match_context.naipe
      AND award_players_table.division IS NOT DISTINCT FROM match_context.division
      AND award_players_table.team_id = match_context.home_team_id
    ORDER BY award_players_table.name ASC
  ),
  away_players AS (
    SELECT
      award_players_table.id,
      award_players_table.name
    FROM match_context
    JOIN public.championship_award_players AS award_players_table
      ON award_players_table.championship_id = match_context.championship_id
      AND award_players_table.season_year = match_context.season_year
      AND award_players_table.sport_id = match_context.sport_id
      AND award_players_table.naipe = match_context.naipe
      AND award_players_table.division IS NOT DISTINCT FROM match_context.division
      AND award_players_table.team_id = match_context.away_team_id
    ORDER BY award_players_table.name ASC
  ),
  home_goals AS (
    SELECT
      goal_scorers_table.goal_order,
      goal_scorers_table.player_id,
      award_players_table.name AS player_name
    FROM public.match_award_goal_scorers AS goal_scorers_table
    JOIN public.championship_award_players AS award_players_table
      ON award_players_table.id = goal_scorers_table.player_id
    JOIN match_context
      ON goal_scorers_table.match_id = match_context.id
      AND goal_scorers_table.team_id = match_context.home_team_id
    ORDER BY goal_scorers_table.goal_order ASC
  ),
  away_goals AS (
    SELECT
      goal_scorers_table.goal_order,
      goal_scorers_table.player_id,
      award_players_table.name AS player_name
    FROM public.match_award_goal_scorers AS goal_scorers_table
    JOIN public.championship_award_players AS award_players_table
      ON award_players_table.id = goal_scorers_table.player_id
    JOIN match_context
      ON goal_scorers_table.match_id = match_context.id
      AND goal_scorers_table.team_id = match_context.away_team_id
    ORDER BY goal_scorers_table.goal_order ASC
  ),
  home_goalkeeper AS (
    SELECT
      goalkeepers_table.player_id,
      award_players_table.name AS player_name
    FROM public.match_award_goalkeepers AS goalkeepers_table
    JOIN public.championship_award_players AS award_players_table
      ON award_players_table.id = goalkeepers_table.player_id
    JOIN match_context
      ON goalkeepers_table.match_id = match_context.id
      AND goalkeepers_table.team_id = match_context.home_team_id
    LIMIT 1
  ),
  away_goalkeeper AS (
    SELECT
      goalkeepers_table.player_id,
      award_players_table.name AS player_name
    FROM public.match_award_goalkeepers AS goalkeepers_table
    JOIN public.championship_award_players AS award_players_table
      ON award_players_table.id = goalkeepers_table.player_id
    JOIN match_context
      ON goalkeepers_table.match_id = match_context.id
      AND goalkeepers_table.team_id = match_context.away_team_id
    LIMIT 1
  )
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'match_id', match_context.id,
        'home_team_id', match_context.home_team_id,
        'away_team_id', match_context.away_team_id,
        'required_home_goals', COALESCE(match_context.home_score, 0),
        'required_away_goals', COALESCE(match_context.away_score, 0),
        'is_walkover', COALESCE(match_context.is_walkover, false),
        'home_players', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', home_players.id, 'name', home_players.name)) FROM home_players), '[]'::jsonb),
        'away_players', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', away_players.id, 'name', away_players.name)) FROM away_players), '[]'::jsonb),
        'home_goals', COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id', home_goals.player_id, 'player_name', home_goals.player_name) ORDER BY home_goals.goal_order ASC) FROM home_goals), '[]'::jsonb),
        'away_goals', COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id', away_goals.player_id, 'player_name', away_goals.player_name) ORDER BY away_goals.goal_order ASC) FROM away_goals), '[]'::jsonb),
        'home_goalkeeper', COALESCE((SELECT jsonb_build_object('player_id', home_goalkeeper.player_id, 'player_name', home_goalkeeper.player_name) FROM home_goalkeeper), 'null'::jsonb),
        'away_goalkeeper', COALESCE((SELECT jsonb_build_object('player_id', away_goalkeeper.player_id, 'player_name', away_goalkeeper.player_name) FROM away_goalkeeper), 'null'::jsonb)
      )
      FROM match_context
    ),
    '{}'::jsonb
  );
$func$;

CREATE OR REPLACE FUNCTION public.get_championship_score_sheet_awards_rankings(
  _championship_id UUID,
  _season_year INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  WITH resolved_season AS (
    SELECT COALESCE(
      _season_year,
      championships_table.current_season_year
    ) AS season_year
    FROM public.championships AS championships_table
    WHERE championships_table.id = _championship_id
    LIMIT 1
  ),
  scorer_rows AS (
    SELECT
      award_players_table.id AS player_id,
      award_players_table.name AS player_name,
      teams_table.name AS team_name,
      award_players_table.naipe,
      award_players_table.division,
      count(*)::int AS goals
    FROM public.match_award_goal_scorers AS goal_scorers_table
    JOIN public.championship_award_players AS award_players_table
      ON award_players_table.id = goal_scorers_table.player_id
    JOIN public.matches AS matches_table
      ON matches_table.id = goal_scorers_table.match_id
    JOIN resolved_season
      ON award_players_table.season_year = resolved_season.season_year
    JOIN public.teams AS teams_table
      ON teams_table.id = award_players_table.team_id
    WHERE award_players_table.championship_id = _championship_id
      AND matches_table.status = 'FINISHED'::public.match_status
      AND COALESCE(matches_table.is_walkover, false) = false
    GROUP BY
      award_players_table.id,
      award_players_table.name,
      teams_table.name,
      award_players_table.naipe,
      award_players_table.division
  ),
  competition_knockout_rounds AS (
    SELECT
      bracket_matches_table.competition_id,
      max(bracket_matches_table.round_number) AS max_round
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.championship_bracket_competitions AS competitions_table
      ON competitions_table.id = bracket_matches_table.competition_id
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = competitions_table.bracket_edition_id
    JOIN resolved_season
      ON editions_table.season_year = resolved_season.season_year
    WHERE editions_table.championship_id = _championship_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    GROUP BY bracket_matches_table.competition_id
  ),
  eligible_goalkeeper_matches AS (
    SELECT
      matches_table.id AS match_id,
      matches_table.home_team_id,
      matches_table.away_team_id,
      matches_table.home_score,
      matches_table.away_score,
      matches_table.naipe,
      matches_table.division,
      bracket_matches_table.round_number,
      competition_knockout_rounds.max_round
    FROM public.matches AS matches_table
    JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.match_id = matches_table.id
    JOIN public.championship_bracket_competitions AS competitions_table
      ON competitions_table.id = bracket_matches_table.competition_id
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = competitions_table.bracket_edition_id
    JOIN resolved_season
      ON editions_table.season_year = resolved_season.season_year
    JOIN competition_knockout_rounds
      ON competition_knockout_rounds.competition_id = bracket_matches_table.competition_id
    WHERE editions_table.championship_id = _championship_id
      AND matches_table.status = 'FINISHED'::public.match_status
      AND COALESCE(matches_table.is_walkover, false) = false
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND (
        bracket_matches_table.is_third_place = true
        OR bracket_matches_table.round_number >= GREATEST(competition_knockout_rounds.max_round - 1, 1)
      )
  ),
  eligible_team_defense_rows AS (
    SELECT
      eligible_goalkeeper_matches.naipe,
      eligible_goalkeeper_matches.division,
      eligible_goalkeeper_matches.home_team_id AS team_id,
      eligible_goalkeeper_matches.away_score::int AS goals_against,
      eligible_goalkeeper_matches.round_number
    FROM eligible_goalkeeper_matches

    UNION ALL

    SELECT
      eligible_goalkeeper_matches.naipe,
      eligible_goalkeeper_matches.division,
      eligible_goalkeeper_matches.away_team_id AS team_id,
      eligible_goalkeeper_matches.home_score::int AS goals_against,
      eligible_goalkeeper_matches.round_number
    FROM eligible_goalkeeper_matches
  ),
  eligible_defenses AS (
    SELECT
      eligible_team_defense_rows.naipe,
      eligible_team_defense_rows.division,
      eligible_team_defense_rows.team_id,
      sum(eligible_team_defense_rows.goals_against)::int AS goals_against,
      max(eligible_team_defense_rows.round_number)::int AS highest_round
    FROM eligible_team_defense_rows
    GROUP BY
      eligible_team_defense_rows.naipe,
      eligible_team_defense_rows.division,
      eligible_team_defense_rows.team_id
  ),
  defense_winners AS (
    SELECT DISTINCT ON (eligible_defenses.naipe, eligible_defenses.division)
      eligible_defenses.naipe,
      eligible_defenses.division,
      eligible_defenses.team_id,
      eligible_defenses.goals_against,
      eligible_defenses.highest_round
    FROM eligible_defenses
    JOIN public.teams AS teams_table
      ON teams_table.id = eligible_defenses.team_id
    ORDER BY
      eligible_defenses.naipe,
      eligible_defenses.division NULLS FIRST,
      eligible_defenses.goals_against ASC,
      eligible_defenses.highest_round DESC,
      teams_table.name ASC
  ),
  goalkeeper_rows AS (
    SELECT
      defense_winners.naipe,
      defense_winners.division,
      defense_winners.team_id,
      defense_winners.goals_against,
      defense_winners.highest_round,
      goalkeepers_table.player_id,
      award_players_table.name AS player_name,
      teams_table.name AS team_name,
      count(*)::int AS matches_count
    FROM defense_winners
    JOIN public.match_award_goalkeepers AS goalkeepers_table
      ON goalkeepers_table.team_id = defense_winners.team_id
    JOIN public.matches AS matches_table
      ON matches_table.id = goalkeepers_table.match_id
    JOIN public.championship_award_players AS award_players_table
      ON award_players_table.id = goalkeepers_table.player_id
      AND award_players_table.championship_id = _championship_id
    JOIN public.teams AS teams_table
      ON teams_table.id = defense_winners.team_id
    JOIN resolved_season
      ON award_players_table.season_year = resolved_season.season_year
    WHERE matches_table.status = 'FINISHED'::public.match_status
      AND COALESCE(matches_table.is_walkover, false) = false
      AND matches_table.naipe = defense_winners.naipe
      AND matches_table.division IS NOT DISTINCT FROM defense_winners.division
    GROUP BY
      defense_winners.naipe,
      defense_winners.division,
      defense_winners.team_id,
      defense_winners.goals_against,
      defense_winners.highest_round,
      goalkeepers_table.player_id,
      award_players_table.name,
      teams_table.name
  ),
  goalkeeper_winners AS (
    SELECT DISTINCT ON (goalkeeper_rows.naipe, goalkeeper_rows.division)
      goalkeeper_rows.naipe,
      goalkeeper_rows.division,
      goalkeeper_rows.team_id,
      goalkeeper_rows.player_id,
      goalkeeper_rows.player_name,
      goalkeeper_rows.team_name,
      goalkeeper_rows.matches_count,
      goalkeeper_rows.goals_against,
      goalkeeper_rows.highest_round
    FROM goalkeeper_rows
    ORDER BY
      goalkeeper_rows.naipe,
      goalkeeper_rows.division NULLS FIRST,
      goalkeeper_rows.matches_count DESC,
      goalkeeper_rows.highest_round DESC,
      goalkeeper_rows.player_name ASC
  ),
  pending_matches AS (
    SELECT count(*)::int AS total
    FROM public.matches AS matches_table
    JOIN resolved_season
      ON matches_table.season_year = resolved_season.season_year
    WHERE matches_table.championship_id = _championship_id
      AND matches_table.status = 'FINISHED'::public.match_status
      AND COALESCE(matches_table.is_walkover, false) = false
      AND COALESCE(matches_table.is_score_sheet_reviewed, false) = false
  )
  SELECT jsonb_build_object(
    'season_year', (SELECT resolved_season.season_year FROM resolved_season),
    'pending_matches_count', COALESCE((SELECT pending_matches.total FROM pending_matches), 0),
    'top_scorers',
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'player_id', scorer_rows.player_id,
              'player_name', scorer_rows.player_name,
              'team_name', scorer_rows.team_name,
              'naipe', scorer_rows.naipe,
              'division', scorer_rows.division,
              'goals', scorer_rows.goals
            )
            ORDER BY
              scorer_rows.naipe ASC,
              scorer_rows.division ASC NULLS FIRST,
              scorer_rows.goals DESC,
              scorer_rows.player_name ASC
          )
          FROM scorer_rows
        ),
        '[]'::jsonb
      ),
    'best_goalkeepers',
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'player_id', goalkeeper_winners.player_id,
              'player_name', goalkeeper_winners.player_name,
              'team_id', goalkeeper_winners.team_id,
              'team_name', goalkeeper_winners.team_name,
              'naipe', goalkeeper_winners.naipe,
              'division', goalkeeper_winners.division,
              'matches_count', goalkeeper_winners.matches_count,
              'goals_against', goalkeeper_winners.goals_against,
              'highest_round', goalkeeper_winners.highest_round
            )
            ORDER BY
              goalkeeper_winners.naipe ASC,
              goalkeeper_winners.division ASC NULLS FIRST,
              goalkeeper_winners.player_name ASC
          )
          FROM goalkeeper_winners
        ),
        '[]'::jsonb
      )
  );
$func$;

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

  IF normalized_championship_sport_name = 'beach soccer' THEN
    NEW.supports_cards := true;
    NEW.tie_breaker_rule := 'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule;
  ELSIF normalized_championship_sport_name = 'beach tennis' THEN
    NEW.supports_cards := false;
    NEW.tie_breaker_rule := 'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule;
  ELSIF normalized_championship_sport_name IN ('futevolei', 'volei de praia') THEN
    NEW.supports_cards := false;
    NEW.tie_breaker_rule := 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule;
  ELSIF normalized_championship_sport_name = 'futebol society' THEN
    NEW.supports_cards := true;
    NEW.tie_breaker_rule := 'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule;
  ELSE
    NEW.supports_cards := false;
    NEW.tie_breaker_rule := 'STANDARD'::public.championship_sport_tie_breaker_rule;
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
    ELSIF normalized_championship_sport_name = 'futevolei' THEN
      NEW.naipe_mode := 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode;
      NEW.points_win := 3;
      NEW.points_draw := 0;
      NEW.points_loss := 0;
    ELSIF normalized_championship_sport_name = 'volei de praia' THEN
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
  END IF;

  RETURN NEW;
END;
$func$;

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
      GREATEST(0, COALESCE(matches_table.home_red_cards, 0))::bigint AS red_cards
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
      GREATEST(0, COALESCE(matches_table.away_red_cards, 0))::bigint AS red_cards
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
      COALESCE(sum(group_scores.red_cards), 0)::bigint AS red_cards
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
        'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule
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
              'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule
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
      COALESCE(standings_table.red_cards, 0)::bigint AS red_cards
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

CREATE OR REPLACE FUNCTION public.get_championship_bracket_pending_tie_breaks(
  _championship_id UUID,
  _bracket_edition_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  WITH pending_contexts AS (
    SELECT contexts_table.*
    FROM public.get_championship_bracket_tie_break_contexts(
      _championship_id,
      NULL,
      _bracket_edition_id
    ) AS contexts_table
    WHERE contexts_table.is_resolved = false
      AND COALESCE(cardinality(contexts_table.team_ids), 0) >= 2
  ),
  competition_rules AS (
    SELECT
      competitions_table.id AS competition_id,
      COALESCE(
        championship_sports_table.tie_breaker_rule,
        'STANDARD'::public.championship_sport_tie_breaker_rule
      ) AS tie_breaker_rule
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN (
      SELECT DISTINCT pending_contexts.competition_id
      FROM pending_contexts
    ) AS pending_competitions
      ON pending_competitions.competition_id = competitions_table.id
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = competitions_table.bracket_edition_id
    LEFT JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = editions_table.championship_id
      AND championship_sports_table.sport_id = competitions_table.sport_id
  ),
  group_rankings AS (
    SELECT
      competition_scope.competition_id,
      ranking_rows.group_id,
      ranking_rows.team_id,
      ranking_rows.points::numeric AS points,
      ranking_rows.wins::numeric AS wins,
      ranking_rows.goal_diff::numeric AS goal_diff,
      ranking_rows.goals_for::numeric AS goals_for,
      CASE
        WHEN (ranking_rows.goals_for - ranking_rows.goal_diff) = 0 THEN
          CASE
            WHEN ranking_rows.goals_for = 0 THEN 0::numeric
            ELSE 1000000000::numeric
          END
        ELSE ranking_rows.goals_for::numeric / (ranking_rows.goals_for - ranking_rows.goal_diff)::numeric
      END AS points_average
    FROM (
      SELECT DISTINCT pending_contexts.competition_id
      FROM pending_contexts
      WHERE pending_contexts.context_type = 'GROUP'::public.championship_bracket_tie_break_context_type
    ) AS competition_scope
    CROSS JOIN LATERAL public.get_championship_bracket_competition_group_rankings(
      _championship_id,
      competition_scope.competition_id
    ) AS ranking_rows
  ),
  qualification_pool_rankings AS (
    SELECT
      competition_scope.competition_id,
      ranking_rows.qualification_rank,
      ranking_rows.team_id,
      (ranking_rows.points::numeric / 1000000::numeric) AS points,
      ranking_rows.wins::numeric AS wins,
      ranking_rows.goal_diff::numeric AS goal_diff,
      ranking_rows.goals_for::numeric AS goals_for
    FROM (
      SELECT DISTINCT pending_contexts.competition_id
      FROM pending_contexts
      WHERE pending_contexts.context_type = 'QUALIFICATION_POOL'::public.championship_bracket_tie_break_context_type
    ) AS competition_scope
    CROSS JOIN LATERAL public.get_championship_bracket_competition_qualification_pool_rankings(
      _championship_id,
      competition_scope.competition_id
    ) AS ranking_rows
  ),
  validated_pending_contexts AS (
    SELECT current_context.*
    FROM pending_contexts AS current_context
    JOIN competition_rules
      ON competition_rules.competition_id = current_context.competition_id
    WHERE (
      current_context.context_type = 'GROUP'::public.championship_bracket_tie_break_context_type
      AND EXISTS (
        SELECT 1
        FROM (
          SELECT
            count(DISTINCT group_rankings.team_id) AS tied_teams_count,
            min(group_rankings.points) AS min_points,
            max(group_rankings.points) AS max_points,
            min(group_rankings.wins) AS min_wins,
            max(group_rankings.wins) AS max_wins,
            min(group_rankings.goal_diff) AS min_goal_diff,
            max(group_rankings.goal_diff) AS max_goal_diff,
            min(group_rankings.goals_for) AS min_goals_for,
            max(group_rankings.goals_for) AS max_goals_for,
            min(group_rankings.points_average) AS min_points_average,
            max(group_rankings.points_average) AS max_points_average
          FROM group_rankings
          WHERE group_rankings.competition_id = current_context.competition_id
            AND group_rankings.group_id = current_context.group_id
            AND group_rankings.team_id = ANY(current_context.team_ids)
        ) AS grouped_metrics
        WHERE grouped_metrics.tied_teams_count = cardinality(current_context.team_ids)
          AND grouped_metrics.min_points = grouped_metrics.max_points
          AND grouped_metrics.min_goal_diff = grouped_metrics.max_goal_diff
          AND grouped_metrics.min_goals_for = grouped_metrics.max_goals_for
          AND (
            competition_rules.tie_breaker_rule <> 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule
            OR grouped_metrics.min_points_average = grouped_metrics.max_points_average
          )
          AND (
            competition_rules.tie_breaker_rule NOT IN (
              'STANDARD'::public.championship_sport_tie_breaker_rule,
              'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
              'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule
            )
            OR grouped_metrics.min_wins = grouped_metrics.max_wins
          )
      )
    ) OR (
      current_context.context_type = 'QUALIFICATION_POOL'::public.championship_bracket_tie_break_context_type
      AND EXISTS (
        SELECT 1
        FROM (
          SELECT
            count(DISTINCT qualification_pool_rankings.team_id) AS tied_teams_count,
            min(qualification_pool_rankings.points) AS min_points,
            max(qualification_pool_rankings.points) AS max_points,
            min(qualification_pool_rankings.wins) AS min_wins,
            max(qualification_pool_rankings.wins) AS max_wins,
            min(qualification_pool_rankings.goal_diff) AS min_goal_diff,
            max(qualification_pool_rankings.goal_diff) AS max_goal_diff,
            min(qualification_pool_rankings.goals_for) AS min_goals_for,
            max(qualification_pool_rankings.goals_for) AS max_goals_for
          FROM qualification_pool_rankings
          WHERE qualification_pool_rankings.competition_id = current_context.competition_id
            AND qualification_pool_rankings.qualification_rank = current_context.qualification_rank
            AND qualification_pool_rankings.team_id = ANY(current_context.team_ids)
        ) AS qualification_metrics
        WHERE qualification_metrics.tied_teams_count = cardinality(current_context.team_ids)
          AND qualification_metrics.min_points = qualification_metrics.max_points
          AND qualification_metrics.min_goal_diff = qualification_metrics.max_goal_diff
          AND qualification_metrics.min_goals_for = qualification_metrics.max_goals_for
          AND (
            competition_rules.tie_breaker_rule NOT IN (
              'STANDARD'::public.championship_sport_tie_breaker_rule,
              'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
              'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule
            )
            OR qualification_metrics.min_wins = qualification_metrics.max_wins
          )
      )
    )
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'context_key', contexts_table.context_key,
        'competition_id', contexts_table.competition_id,
        'sport_name', contexts_table.sport_name,
        'naipe', contexts_table.naipe,
        'division', contexts_table.division,
        'context_type', contexts_table.context_type,
        'group_id', contexts_table.group_id,
        'group_number', contexts_table.group_number,
        'qualification_rank', contexts_table.qualification_rank,
        'title', contexts_table.title,
        'description', contexts_table.description,
        'teams',
        (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'team_id', team_rows.team_id,
                'team_name', team_rows.team_name
              )
              ORDER BY team_rows.team_name ASC
            ),
            '[]'::jsonb
          )
          FROM unnest(contexts_table.team_ids, contexts_table.team_names) AS team_rows(team_id, team_name)
        )
      )
      ORDER BY
        CASE contexts_table.context_type
          WHEN 'GROUP'::public.championship_bracket_tie_break_context_type THEN 1
          ELSE 2
        END,
        contexts_table.sport_name ASC,
        contexts_table.naipe ASC,
        contexts_table.group_number ASC NULLS FIRST,
        contexts_table.qualification_rank ASC NULLS FIRST
    ),
    '[]'::jsonb
  )
  FROM validated_pending_contexts AS contexts_table;
$func$;

GRANT EXECUTE ON FUNCTION public.save_match_score_sheet_awards(UUID, JSONB, JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_match_score_sheet_awards_context(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_championship_score_sheet_awards_rankings(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_championship_bracket_competition_group_rankings(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_championship_bracket_competition_qualification_pool_rankings(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_championship_bracket_pending_tie_breaks(UUID, UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
