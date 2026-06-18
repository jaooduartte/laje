-- Aposenta a lógica de goleiros na súmula/premiações e passa o prêmio legado
-- BEST_GOALKEEPER a representar a melhor defesa por atlética.

-- Limpeza estrutural de goleiros
ALTER TABLE public.match_award_goal_scorers
  DROP COLUMN IF EXISTS conceding_goalkeeper_player_id;

ALTER TABLE public.championship_award_players
  DROP COLUMN IF EXISTS is_goalkeeper;

DROP TABLE IF EXISTS public.match_award_goalkeepers;

-- Resultado de sorteio: artlheiro continua por jogador; melhor defesa passa a ser por atlética
DELETE FROM public.championship_award_draw_results
WHERE award_type = 'BEST_GOALKEEPER'::public.championship_award_type;

ALTER TABLE public.championship_award_draw_results
  ALTER COLUMN winner_player_id DROP NOT NULL;

ALTER TABLE public.championship_award_draw_results
  ADD COLUMN IF NOT EXISTS winner_team_id UUID NULL
  REFERENCES public.teams(id) ON DELETE CASCADE;

ALTER TABLE public.championship_award_draw_results
  DROP CONSTRAINT IF EXISTS championship_award_draw_results_winner_shape_check;

ALTER TABLE public.championship_award_draw_results
  ADD CONSTRAINT championship_award_draw_results_winner_shape_check
  CHECK (
    (
      award_type = 'TOP_SCORER'::public.championship_award_type
      AND winner_player_id IS NOT NULL
      AND winner_team_id IS NULL
    )
    OR (
      award_type = 'BEST_GOALKEEPER'::public.championship_award_type
      AND winner_player_id IS NULL
      AND winner_team_id IS NOT NULL
    )
  );

COMMENT ON TABLE public.championship_award_draw_results
  IS 'Resultado do sorteio de desempate para prêmios individuais (artilheiro e melhor defesa).';

COMMENT ON COLUMN public.championship_sports.awards_include_knockout_phase
  IS 'Se true, contabiliza artilheiro e melhor defesa também na fase eliminatória. Padrão: somente fase de grupos.';

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

  IF COALESCE(match_record.is_walkover, false) = true THEN
    UPDATE public.matches
    SET is_score_sheet_reviewed = true
    WHERE id = _match_id;

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

    INSERT INTO public.match_award_goal_scorers (match_id, team_id, player_id, goal_order)
    VALUES (_match_id, match_record.home_team_id, resolved_player_id, home_goal_order);
  END LOOP;

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

    INSERT INTO public.match_award_goal_scorers (match_id, team_id, player_id, goal_order)
    VALUES (_match_id, match_record.away_team_id, resolved_player_id, away_goal_order);
  END LOOP;

  UPDATE public.matches
  SET is_score_sheet_reviewed = true
  WHERE id = _match_id;

  RETURN jsonb_build_object('match_id', _match_id, 'is_walkover', false, 'is_score_sheet_reviewed', true);
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
      ap.name AS player_name
    FROM public.match_award_goal_scorers AS gs
    JOIN public.championship_award_players AS ap ON ap.id = gs.player_id
    JOIN match_context
      ON gs.match_id = match_context.id
      AND gs.team_id = match_context.home_team_id
    ORDER BY gs.goal_order ASC
  ),
  away_goals AS (
    SELECT
      gs.goal_order,
      gs.player_id,
      ap.name AS player_name
    FROM public.match_award_goal_scorers AS gs
    JOIN public.championship_award_players AS ap ON ap.id = gs.player_id
    JOIN match_context
      ON gs.match_id = match_context.id
      AND gs.team_id = match_context.away_team_id
    ORDER BY gs.goal_order ASC
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
            'player_name', home_goals.player_name
          ) ORDER BY home_goals.goal_order ASC)
          FROM home_goals
        ), '[]'::jsonb),
        'away_goals', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'player_id', away_goals.player_id,
            'player_name', away_goals.player_name
          ) ORDER BY away_goals.goal_order ASC)
          FROM away_goals
        ), '[]'::jsonb)
      )
      FROM match_context
    ),
    '{}'::jsonb
  );
$func$;

CREATE OR REPLACE FUNCTION public.get_championship_award_pending_draws(
  _championship_id UUID,
  _season_year INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_season_year INTEGER;
  v_result             JSONB := '[]'::JSONB;
  v_sport              RECORD;
  v_group              RECORD;
  v_pending_count      INTEGER;
  v_tied_participants  JSONB;
  v_signature          TEXT;
  v_existing_draw_id   UUID;
  v_naipe_label        TEXT;
  v_division_suffix    TEXT;
BEGIN
  SELECT COALESCE(_season_year, c.current_season_year)
  INTO resolved_season_year
  FROM public.championships c
  WHERE c.id = _championship_id
  LIMIT 1;

  IF resolved_season_year IS NULL THEN
    RETURN '[]'::JSONB;
  END IF;

  FOR v_sport IN
    SELECT cs.sport_id, cs.awards_include_knockout_phase, s.name AS sport_name
    FROM public.championship_sports cs
    JOIN public.sports s ON s.id = cs.sport_id
    WHERE cs.championship_id = _championship_id
      AND cs.supports_individual_awards = true
    ORDER BY s.name
  LOOP
    FOR v_group IN
      SELECT DISTINCT m.naipe, m.division
      FROM public.matches m
      JOIN public.championship_bracket_matches bm ON bm.match_id = m.id
      WHERE m.championship_id = _championship_id
        AND m.sport_id = v_sport.sport_id
        AND m.season_year = resolved_season_year
        AND m.status = 'FINISHED'::public.match_status
        AND COALESCE(m.is_walkover, false) = false
        AND (
          bm.phase = 'GROUP_STAGE'::public.bracket_phase
          OR (v_sport.awards_include_knockout_phase = true AND bm.phase = 'KNOCKOUT'::public.bracket_phase)
        )
      ORDER BY m.naipe, m.division
    LOOP
      SELECT COUNT(*)::int INTO v_pending_count
      FROM public.matches m
      JOIN public.championship_bracket_matches bm ON bm.match_id = m.id
      WHERE m.championship_id = _championship_id
        AND m.sport_id = v_sport.sport_id
        AND m.season_year = resolved_season_year
        AND m.naipe = v_group.naipe
        AND m.division IS NOT DISTINCT FROM v_group.division
        AND m.status = 'FINISHED'::public.match_status
        AND COALESCE(m.is_walkover, false) = false
        AND COALESCE(m.is_score_sheet_reviewed, false) = false
        AND (
          bm.phase = 'GROUP_STAGE'::public.bracket_phase
          OR (v_sport.awards_include_knockout_phase = true AND bm.phase = 'KNOCKOUT'::public.bracket_phase)
        );

      CONTINUE WHEN v_pending_count > 0;

      v_naipe_label := CASE v_group.naipe
        WHEN 'MASCULINO' THEN 'Masculino'
        WHEN 'FEMININO'  THEN 'Feminino'
        ELSE v_group.naipe::text
      END;
      v_division_suffix := CASE
        WHEN v_group.division IS NULL THEN ''
        WHEN v_group.division::text = 'PRINCIPAL' THEN ' • Divisão Principal'
        WHEN v_group.division::text = 'ACESSO'    THEN ' • Divisão de Acesso'
        ELSE ' • ' || v_group.division::text
      END;

      v_tied_participants := NULL;
      v_signature := NULL;

      SELECT
        jsonb_agg(
          jsonb_build_object(
            'participant_id', sub.player_id,
            'participant_name', sub.player_name,
            'team_name', sub.team_name,
            'metric_value', sub.goals
          ) ORDER BY sub.player_name ASC
        ),
        string_agg(sub.player_id::text, ':' ORDER BY sub.player_id)
      INTO v_tied_participants, v_signature
      FROM (
        SELECT
          cap.id AS player_id,
          cap.name AS player_name,
          t.name AS team_name,
          COUNT(*)::int AS goals,
          RANK() OVER (ORDER BY COUNT(*) DESC) AS rnk
        FROM public.match_award_goal_scorers mags
        JOIN public.championship_award_players cap ON cap.id = mags.player_id
        JOIN public.matches m ON m.id = mags.match_id
        JOIN public.championship_bracket_matches bm ON bm.match_id = m.id
        JOIN public.teams t ON t.id = cap.team_id
        WHERE cap.championship_id = _championship_id
          AND cap.sport_id = v_sport.sport_id
          AND cap.naipe = v_group.naipe
          AND cap.division IS NOT DISTINCT FROM v_group.division
          AND cap.season_year = resolved_season_year
          AND m.status = 'FINISHED'::public.match_status
          AND COALESCE(m.is_walkover, false) = false
          AND (
            bm.phase = 'GROUP_STAGE'::public.bracket_phase
            OR (v_sport.awards_include_knockout_phase = true AND bm.phase = 'KNOCKOUT'::public.bracket_phase)
          )
        GROUP BY cap.id, cap.name, t.name
      ) sub
      WHERE sub.rnk = 1;

      IF v_tied_participants IS NOT NULL AND jsonb_array_length(v_tied_participants) >= 2 THEN
        SELECT id INTO v_existing_draw_id
        FROM public.championship_award_draw_results
        WHERE championship_id = _championship_id
          AND season_year = resolved_season_year
          AND sport_id = v_sport.sport_id
          AND naipe = v_group.naipe
          AND division IS NOT DISTINCT FROM v_group.division
          AND award_type = 'TOP_SCORER'::public.championship_award_type
          AND tied_player_ids_signature = v_signature
        LIMIT 1;

        IF v_existing_draw_id IS NULL THEN
          v_result := v_result || jsonb_build_array(jsonb_build_object(
            'context_key',               'AWARD_SCORER:' || _championship_id::text || ':' || resolved_season_year::text || ':' || v_sport.sport_id::text || ':' || v_group.naipe::text || ':' || COALESCE(v_group.division::text, 'NULL'),
            'sport_id',                  v_sport.sport_id,
            'sport_name',                v_sport.sport_name,
            'naipe',                     v_group.naipe,
            'division',                  v_group.division,
            'award_type',                'TOP_SCORER',
            'tied_participants',         v_tied_participants,
            'tied_player_ids_signature', v_signature,
            'title',                     'Empate no artilheiro — ' || v_naipe_label || v_division_suffix,
            'description',               jsonb_array_length(v_tied_participants)::text || ' jogadores empatados no 1º lugar. Realize o sorteio para definir o vencedor do prêmio de artilheiro.'
          ));
        END IF;
      END IF;

      v_tied_participants := NULL;
      v_signature := NULL;

      SELECT
        jsonb_agg(
          jsonb_build_object(
            'participant_id', sub.team_id,
            'participant_name', sub.team_name,
            'team_name', sub.team_name,
            'metric_value', sub.goals_against_average
          ) ORDER BY sub.team_name ASC
        ),
        string_agg(sub.team_id::text, ':' ORDER BY sub.team_id)
      INTO v_tied_participants, v_signature
      FROM (
        SELECT
          defense_rows.team_id,
          teams_table.name AS team_name,
          defense_rows.matches_count,
          defense_rows.goals_against,
          defense_rows.goals_against_average,
          RANK() OVER (
            ORDER BY
              defense_rows.goals_against_average ASC,
              defense_rows.goals_against ASC,
              defense_rows.matches_count DESC
          ) AS rnk
        FROM (
          SELECT
            team_matches.team_id,
            COUNT(*)::int AS matches_count,
            SUM(team_matches.goals_against)::int AS goals_against,
            (SUM(team_matches.goals_against)::numeric / COUNT(*)::numeric) AS goals_against_average
          FROM (
            SELECT
              m.home_team_id AS team_id,
              m.away_score::int AS goals_against
            FROM public.matches m
            JOIN public.championship_bracket_matches bm ON bm.match_id = m.id
            WHERE m.championship_id = _championship_id
              AND m.sport_id = v_sport.sport_id
              AND m.season_year = resolved_season_year
              AND m.naipe = v_group.naipe
              AND m.division IS NOT DISTINCT FROM v_group.division
              AND m.status = 'FINISHED'::public.match_status
              AND COALESCE(m.is_walkover, false) = false
              AND (
                bm.phase = 'GROUP_STAGE'::public.bracket_phase
                OR (v_sport.awards_include_knockout_phase = true AND bm.phase = 'KNOCKOUT'::public.bracket_phase)
              )

            UNION ALL

            SELECT
              m.away_team_id AS team_id,
              m.home_score::int AS goals_against
            FROM public.matches m
            JOIN public.championship_bracket_matches bm ON bm.match_id = m.id
            WHERE m.championship_id = _championship_id
              AND m.sport_id = v_sport.sport_id
              AND m.season_year = resolved_season_year
              AND m.naipe = v_group.naipe
              AND m.division IS NOT DISTINCT FROM v_group.division
              AND m.status = 'FINISHED'::public.match_status
              AND COALESCE(m.is_walkover, false) = false
              AND (
                bm.phase = 'GROUP_STAGE'::public.bracket_phase
                OR (v_sport.awards_include_knockout_phase = true AND bm.phase = 'KNOCKOUT'::public.bracket_phase)
              )
          ) AS team_matches
          GROUP BY team_matches.team_id
        ) AS defense_rows
        JOIN public.teams AS teams_table ON teams_table.id = defense_rows.team_id
      ) sub
      WHERE sub.rnk = 1;

      IF v_tied_participants IS NOT NULL AND jsonb_array_length(v_tied_participants) >= 2 THEN
        SELECT id INTO v_existing_draw_id
        FROM public.championship_award_draw_results
        WHERE championship_id = _championship_id
          AND season_year = resolved_season_year
          AND sport_id = v_sport.sport_id
          AND naipe = v_group.naipe
          AND division IS NOT DISTINCT FROM v_group.division
          AND award_type = 'BEST_GOALKEEPER'::public.championship_award_type
          AND tied_player_ids_signature = v_signature
        LIMIT 1;

        IF v_existing_draw_id IS NULL THEN
          v_result := v_result || jsonb_build_array(jsonb_build_object(
            'context_key',               'AWARD_DEFENSE:' || _championship_id::text || ':' || resolved_season_year::text || ':' || v_sport.sport_id::text || ':' || v_group.naipe::text || ':' || COALESCE(v_group.division::text, 'NULL'),
            'sport_id',                  v_sport.sport_id,
            'sport_name',                v_sport.sport_name,
            'naipe',                     v_group.naipe,
            'division',                  v_group.division,
            'award_type',                'BEST_GOALKEEPER',
            'tied_participants',         v_tied_participants,
            'tied_player_ids_signature', v_signature,
            'title',                     'Empate na melhor defesa — ' || v_naipe_label || v_division_suffix,
            'description',               jsonb_array_length(v_tied_participants)::text || ' atléticas empatadas no 1º lugar. Realize o sorteio para definir a atlética vencedora do prêmio.'
          ));
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_result;
END;
$$;

DROP FUNCTION IF EXISTS public.save_championship_award_draw_result(UUID, INTEGER, UUID, public.match_naipe, public.team_division, public.championship_award_type, UUID, TEXT);
DROP FUNCTION IF EXISTS public.save_championship_award_draw_result(UUID, INTEGER, UUID, public.match_naipe, public.team_division, public.championship_award_type, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.save_championship_award_draw_result(
  _championship_id           UUID,
  _season_year               INTEGER,
  _sport_id                  UUID,
  _naipe                     public.match_naipe,
  _division                  public.team_division,
  _award_type                public.championship_award_type,
  _winner_player_id          UUID DEFAULT NULL,
  _winner_team_id            UUID DEFAULT NULL,
  _tied_player_ids_signature TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF _award_type = 'TOP_SCORER'::public.championship_award_type THEN
    IF _winner_player_id IS NULL OR _winner_team_id IS NOT NULL THEN
      RAISE EXCEPTION 'Resultado inválido para sorteio de artilheiro.';
    END IF;
  ELSIF _award_type = 'BEST_GOALKEEPER'::public.championship_award_type THEN
    IF _winner_team_id IS NULL OR _winner_player_id IS NOT NULL THEN
      RAISE EXCEPTION 'Resultado inválido para sorteio de melhor defesa.';
    END IF;
  END IF;

  SELECT id INTO v_id
  FROM public.championship_award_draw_results
  WHERE championship_id = _championship_id
    AND season_year     = _season_year
    AND sport_id        = _sport_id
    AND naipe           = _naipe
    AND division        IS NOT DISTINCT FROM _division
    AND award_type      = _award_type
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.championship_award_draw_results
    SET
      winner_player_id          = _winner_player_id,
      winner_team_id            = _winner_team_id,
      tied_player_ids_signature = COALESCE(_tied_player_ids_signature, tied_player_ids_signature),
      updated_at                = now()
    WHERE id = v_id;
  ELSE
    INSERT INTO public.championship_award_draw_results (
      championship_id, season_year, sport_id, naipe, division,
      award_type, winner_player_id, winner_team_id, tied_player_ids_signature
    )
    VALUES (
      _championship_id, _season_year, _sport_id, _naipe, _division,
      _award_type, _winner_player_id, _winner_team_id, COALESCE(_tied_player_ids_signature, '')
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'draw_result_id', v_id);
END;
$$;

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
    JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.match_id = matches_table.id
    JOIN public.championship_sports AS cs_table
      ON cs_table.championship_id = _championship_id
      AND cs_table.sport_id = matches_table.sport_id
    JOIN resolved_season
      ON award_players_table.season_year = resolved_season.season_year
    JOIN public.teams AS teams_table
      ON teams_table.id = award_players_table.team_id
    WHERE award_players_table.championship_id = _championship_id
      AND cs_table.supports_individual_awards = true
      AND matches_table.status = 'FINISHED'::public.match_status
      AND COALESCE(matches_table.is_walkover, false) = false
      AND (
        bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
        OR (
          cs_table.awards_include_knockout_phase = true
          AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
        )
      )
    GROUP BY
      award_players_table.id,
      award_players_table.name,
      teams_table.name,
      award_players_table.naipe,
      award_players_table.division
  ),
  eligible_matches AS (
    SELECT
      matches_table.id AS match_id,
      matches_table.home_team_id,
      matches_table.away_team_id,
      matches_table.home_score,
      matches_table.away_score,
      matches_table.naipe,
      matches_table.division
    FROM public.matches AS matches_table
    JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.match_id = matches_table.id
    JOIN public.championship_bracket_competitions AS competitions_table
      ON competitions_table.id = bracket_matches_table.competition_id
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = competitions_table.bracket_edition_id
    JOIN public.championship_sports AS cs_table
      ON cs_table.championship_id = _championship_id
      AND cs_table.sport_id = matches_table.sport_id
    JOIN resolved_season
      ON editions_table.season_year = resolved_season.season_year
    WHERE editions_table.championship_id = _championship_id
      AND cs_table.supports_individual_awards = true
      AND matches_table.status = 'FINISHED'::public.match_status
      AND COALESCE(matches_table.is_walkover, false) = false
      AND (
        bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
        OR (
          cs_table.awards_include_knockout_phase = true
          AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
        )
      )
  ),
  defense_rows AS (
    SELECT
      team_matches.team_id,
      teams_table.name AS team_name,
      team_matches.naipe,
      team_matches.division,
      COUNT(*)::int AS matches_count,
      SUM(team_matches.goals_against)::int AS goals_against,
      (SUM(team_matches.goals_against)::numeric / COUNT(*)::numeric) AS goals_against_average
    FROM (
      SELECT
        eligible_matches.home_team_id AS team_id,
        eligible_matches.naipe,
        eligible_matches.division,
        eligible_matches.away_score::int AS goals_against
      FROM eligible_matches

      UNION ALL

      SELECT
        eligible_matches.away_team_id AS team_id,
        eligible_matches.naipe,
        eligible_matches.division,
        eligible_matches.home_score::int AS goals_against
      FROM eligible_matches
    ) AS team_matches
    JOIN public.teams AS teams_table
      ON teams_table.id = team_matches.team_id
    GROUP BY
      team_matches.team_id,
      teams_table.name,
      team_matches.naipe,
      team_matches.division
  ),
  pending_matches AS (
    SELECT count(*)::int AS total
    FROM public.matches AS matches_table
    JOIN public.championship_bracket_matches AS bm
      ON bm.match_id = matches_table.id
    JOIN public.championship_sports AS cs_table
      ON cs_table.championship_id = _championship_id
      AND cs_table.sport_id = matches_table.sport_id
    JOIN resolved_season
      ON matches_table.season_year = resolved_season.season_year
    WHERE matches_table.championship_id = _championship_id
      AND cs_table.supports_individual_awards = true
      AND matches_table.status = 'FINISHED'::public.match_status
      AND COALESCE(matches_table.is_walkover, false) = false
      AND COALESCE(matches_table.is_score_sheet_reviewed, false) = false
      AND (
        bm.phase = 'GROUP_STAGE'::public.bracket_phase
        OR (
          cs_table.awards_include_knockout_phase = true
          AND bm.phase = 'KNOCKOUT'::public.bracket_phase
        )
      )
  ),
  draw_results AS (
    SELECT
      dr.award_type,
      dr.naipe,
      dr.division,
      dr.winner_player_id,
      dr.winner_team_id
    FROM public.championship_award_draw_results dr
    JOIN resolved_season ON dr.season_year = resolved_season.season_year
    WHERE dr.championship_id = _championship_id
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
              scorer_rows.goals DESC,
              scorer_rows.naipe ASC,
              scorer_rows.division ASC NULLS FIRST,
              scorer_rows.player_name ASC
          )
          FROM scorer_rows
        ),
        '[]'::jsonb
      ),
    'best_defenses',
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'team_id', defense_rows.team_id,
              'team_name', defense_rows.team_name,
              'naipe', defense_rows.naipe,
              'division', defense_rows.division,
              'matches_count', defense_rows.matches_count,
              'goals_against', defense_rows.goals_against,
              'goals_against_average', defense_rows.goals_against_average
            )
            ORDER BY
              defense_rows.goals_against_average ASC,
              defense_rows.goals_against ASC,
              defense_rows.matches_count DESC,
              defense_rows.naipe ASC,
              defense_rows.division ASC NULLS FIRST,
              defense_rows.team_name ASC
          )
          FROM defense_rows
        ),
        '[]'::jsonb
      ),
    'award_draw_results',
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'award_type',       draw_results.award_type,
              'naipe',            draw_results.naipe,
              'division',         draw_results.division,
              'winner_player_id', draw_results.winner_player_id,
              'winner_team_id',   draw_results.winner_team_id
            )
          )
          FROM draw_results
        ),
        '[]'::jsonb
      )
  );
$func$;

GRANT EXECUTE ON FUNCTION public.save_match_score_sheet_awards(UUID, JSONB, JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_match_score_sheet_awards_context(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_championship_award_pending_draws(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_championship_award_draw_result(UUID, INTEGER, UUID, public.match_naipe, public.team_division, public.championship_award_type, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_championship_score_sheet_awards_rankings(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_championship_award_pending_draws(UUID, INTEGER)
  IS 'Retorna contextos de sorteio de premiação pendentes (empates no artilheiro ou na melhor defesa) quando todas as súmulas da fase configurada estão revisadas.';

COMMENT ON FUNCTION public.save_championship_award_draw_result(UUID, INTEGER, UUID, public.match_naipe, public.team_division, public.championship_award_type, UUID, UUID, TEXT)
  IS 'Persiste o resultado do sorteio de desempate de premiação. TOP_SCORER salva winner_player_id; BEST_GOALKEEPER salva winner_team_id.';
