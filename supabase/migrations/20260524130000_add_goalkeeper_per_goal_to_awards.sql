-- Feature 2: múltiplos goleiros por time por partida + goleiro por gol na súmula.
--
-- Mudanças no schema:
--   1. match_award_goalkeepers: UNIQUE (match_id, team_id) → UNIQUE (match_id, team_id, player_id)
--   2. match_award_goal_scorers: adiciona conceding_goalkeeper_player_id (qual goleiro adversário sofreu o gol)
--
-- Mudanças nas funções:
--   1. save_match_score_sheet_awards:
--        - _home_goalkeeper / _away_goalkeeper (singular JSONB) → _home_goalkeepers / _away_goalkeepers (array JSONB)
--        - cada item de _home_goal_scorers / _away_goal_scorers pode ter campo
--          "conceding_goalkeeper_name TEXT" — nome do goleiro adversário que sofreu o gol.
--          O DB resolve pelo nome após criar os goleiros.
--   2. get_match_score_sheet_awards_context: retorna arrays de goleiros + goleiro por gol
--   3. get_championship_score_sheet_awards_rankings: ranking de goleiro por gols sofridos individualmente

-- ─── 1. Ajuste de UNIQUE em match_award_goalkeepers ──────────────────────────

ALTER TABLE public.match_award_goalkeepers
  DROP CONSTRAINT IF EXISTS match_award_goalkeepers_unique_team_per_match;

ALTER TABLE public.match_award_goalkeepers
  ADD CONSTRAINT match_award_goalkeepers_unique_player_per_match_team
  UNIQUE (match_id, team_id, player_id);

-- ─── 2. Coluna conceding_goalkeeper_player_id em match_award_goal_scorers ────

ALTER TABLE public.match_award_goal_scorers
  ADD COLUMN IF NOT EXISTS conceding_goalkeeper_player_id UUID NULL
  REFERENCES public.championship_award_players(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.match_award_goal_scorers.conceding_goalkeeper_player_id
  IS 'Goleiro adversário que sofreu este gol. NULL = não informado.';

CREATE INDEX IF NOT EXISTS match_award_goal_scorers_conceding_gk_idx
  ON public.match_award_goal_scorers (conceding_goalkeeper_player_id)
  WHERE conceding_goalkeeper_player_id IS NOT NULL;

-- ─── 3. Reescreve save_match_score_sheet_awards ───────────────────────────────
-- DROP necessário porque PostgreSQL não permite renomear parâmetros com CREATE OR REPLACE.
-- Os parâmetros _home_goalkeeper/_away_goalkeeper passam a _home_goalkeepers/_away_goalkeepers.
DROP FUNCTION IF EXISTS public.save_match_score_sheet_awards(UUID, JSONB, JSONB, JSONB, JSONB);
-- Cada item de _home_goal_scorers / _away_goal_scorers pode conter:
--   "conceding_goalkeeper_name": nome do goleiro adversário que sofreu o gol.
-- O DB resolve pelo nome após registrar os goleiros, usando normalize_award_player_name.

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

  -- Insere gols da casa; goleiro que sofreu é resolvido pelo nome no time visitante
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
    END IF;

    INSERT INTO public.match_award_goal_scorers (match_id, team_id, player_id, goal_order, conceding_goalkeeper_player_id)
    VALUES (_match_id, match_record.home_team_id, resolved_player_id, home_goal_order, conceding_gk_player_id);
  END LOOP;

  -- Insere gols do visitante; goleiro que sofreu é resolvido pelo nome no time da casa
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
    END IF;

    INSERT INTO public.match_award_goal_scorers (match_id, team_id, player_id, goal_order, conceding_goalkeeper_player_id)
    VALUES (_match_id, match_record.away_team_id, resolved_player_id, away_goal_order, conceding_gk_player_id);
  END LOOP;

  UPDATE public.matches SET is_score_sheet_reviewed = true WHERE id = _match_id;

  RETURN jsonb_build_object('match_id', _match_id, 'is_walkover', false, 'is_score_sheet_reviewed', true);
END;
$func$;

-- ─── 4. Reescreve get_match_score_sheet_awards_context ───────────────────────
-- home_goalkeeper / away_goalkeeper (singular) → home_goalkeepers / away_goalkeepers (array)
-- Cada gol agora inclui conceding_goalkeeper_player_id e conceding_goalkeeper_name

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
    SELECT award_players_table.id, award_players_table.name
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
    SELECT award_players_table.id, award_players_table.name
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
      gs.goal_order,
      gs.player_id,
      ap.name AS player_name,
      gs.conceding_goalkeeper_player_id,
      gk_ap.name AS conceding_goalkeeper_name
    FROM public.match_award_goal_scorers AS gs
    JOIN public.championship_award_players AS ap ON ap.id = gs.player_id
    LEFT JOIN public.championship_award_players AS gk_ap
      ON gk_ap.id = gs.conceding_goalkeeper_player_id
    JOIN match_context
      ON gs.match_id = match_context.id
      AND gs.team_id = match_context.home_team_id
    ORDER BY gs.goal_order ASC
  ),
  away_goals AS (
    SELECT
      gs.goal_order,
      gs.player_id,
      ap.name AS player_name,
      gs.conceding_goalkeeper_player_id,
      gk_ap.name AS conceding_goalkeeper_name
    FROM public.match_award_goal_scorers AS gs
    JOIN public.championship_award_players AS ap ON ap.id = gs.player_id
    LEFT JOIN public.championship_award_players AS gk_ap
      ON gk_ap.id = gs.conceding_goalkeeper_player_id
    JOIN match_context
      ON gs.match_id = match_context.id
      AND gs.team_id = match_context.away_team_id
    ORDER BY gs.goal_order ASC
  ),
  home_goalkeepers AS (
    SELECT gk.player_id, ap.name AS player_name
    FROM public.match_award_goalkeepers AS gk
    JOIN public.championship_award_players AS ap ON ap.id = gk.player_id
    JOIN match_context ON gk.match_id = match_context.id AND gk.team_id = match_context.home_team_id
    ORDER BY ap.name ASC
  ),
  away_goalkeepers AS (
    SELECT gk.player_id, ap.name AS player_name
    FROM public.match_award_goalkeepers AS gk
    JOIN public.championship_award_players AS ap ON ap.id = gk.player_id
    JOIN match_context ON gk.match_id = match_context.id AND gk.team_id = match_context.away_team_id
    ORDER BY ap.name ASC
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
        'home_players', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('id', home_players.id, 'name', home_players.name))
          FROM home_players
        ), '[]'::jsonb),
        'away_players', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('id', away_players.id, 'name', away_players.name))
          FROM away_players
        ), '[]'::jsonb),
        'home_goals', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'player_id', home_goals.player_id,
            'player_name', home_goals.player_name,
            'conceding_goalkeeper_player_id', home_goals.conceding_goalkeeper_player_id,
            'conceding_goalkeeper_name', home_goals.conceding_goalkeeper_name
          ) ORDER BY home_goals.goal_order ASC)
          FROM home_goals
        ), '[]'::jsonb),
        'away_goals', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'player_id', away_goals.player_id,
            'player_name', away_goals.player_name,
            'conceding_goalkeeper_player_id', away_goals.conceding_goalkeeper_player_id,
            'conceding_goalkeeper_name', away_goals.conceding_goalkeeper_name
          ) ORDER BY away_goals.goal_order ASC)
          FROM away_goals
        ), '[]'::jsonb),
        'home_goalkeepers', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('player_id', home_goalkeepers.player_id, 'player_name', home_goalkeepers.player_name))
          FROM home_goalkeepers
        ), '[]'::jsonb),
        'away_goalkeepers', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('player_id', away_goalkeepers.player_id, 'player_name', away_goalkeepers.player_name))
          FROM away_goalkeepers
        ), '[]'::jsonb)
      )
      FROM match_context
    ),
    '{}'::jsonb
  );
$func$;

-- Nota: get_championship_score_sheet_awards_rankings é reescrita na migration
-- 20260524140000 com suporte a awards_include_knockout_phase (Feature 3) e
-- ranking por gols sofridos individualmente (Feature 2). Não reescrever aqui
-- pois a coluna awards_include_knockout_phase ainda não existe neste ponto.

GRANT EXECUTE ON FUNCTION public.save_match_score_sheet_awards(UUID, JSONB, JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_match_score_sheet_awards_context(UUID) TO authenticated;
