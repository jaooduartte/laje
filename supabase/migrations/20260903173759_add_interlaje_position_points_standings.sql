CREATE TABLE IF NOT EXISTS public.championship_overall_position_point_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  season_year INTEGER NOT NULL CHECK (season_year >= 2024),
  final_position INTEGER NOT NULL CHECK (final_position BETWEEN 1 AND 20),
  points INTEGER NOT NULL CHECK (points >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (championship_id, season_year, final_position)
);

CREATE INDEX IF NOT EXISTS championship_overall_position_point_settings_scope_idx
  ON public.championship_overall_position_point_settings (championship_id, season_year, final_position);

ALTER TABLE public.championship_overall_position_point_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS championship_overall_position_point_settings_public_select ON public.championship_overall_position_point_settings;
CREATE POLICY championship_overall_position_point_settings_public_select
  ON public.championship_overall_position_point_settings
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.set_championship_overall_position_point_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_championship_overall_position_point_settings_updated_at ON public.championship_overall_position_point_settings;
CREATE TRIGGER set_championship_overall_position_point_settings_updated_at
  BEFORE UPDATE ON public.championship_overall_position_point_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_championship_overall_position_point_settings_updated_at();

INSERT INTO public.championship_overall_position_point_settings (
  championship_id,
  season_year,
  final_position,
  points
)
SELECT
  championships_table.id,
  championships_table.current_season_year,
  position_values.final_position,
  position_values.points
FROM public.championships AS championships_table
CROSS JOIN (
  VALUES
    (1, 24), (2, 22), (3, 20), (4, 18), (5, 16),
    (6, 15), (7, 14), (8, 13), (9, 12), (10, 11),
    (11, 10), (12, 9), (13, 8), (14, 7), (15, 6),
    (16, 5), (17, 4), (18, 3), (19, 2), (20, 1)
) AS position_values(final_position, points)
WHERE championships_table.code = 'INTERLAJE'::public.championship_code
ON CONFLICT (championship_id, season_year, final_position) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_interlaje_position_point_settings(
  _championship_id UUID,
  _season_year INTEGER
)
RETURNS TABLE(
  final_position INTEGER,
  points INTEGER
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT settings_table.final_position, settings_table.points
  FROM public.championship_overall_position_point_settings AS settings_table
  WHERE settings_table.championship_id = _championship_id
    AND settings_table.season_year = _season_year
  ORDER BY settings_table.final_position;
$$;

CREATE OR REPLACE FUNCTION public.save_interlaje_position_point_settings(
  _championship_id UUID,
  _season_year INTEGER,
  _settings JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  championship_status_value public.championship_status;
  championship_code_value public.championship_code;
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.has_admin_tab_access('opening_ceremony_bonus'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para configurar a pontuação por colocação.';
  END IF;

  SELECT championships_table.status, championships_table.code
  INTO championship_status_value, championship_code_value
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id;

  IF championship_code_value IS DISTINCT FROM 'INTERLAJE'::public.championship_code THEN
    RAISE EXCEPTION 'A pontuação por colocação é exclusiva do INTERLAJE.';
  END IF;

  IF championship_status_value = 'FINISHED'::public.championship_status THEN
    RAISE EXCEPTION 'A pontuação por colocação não pode ser alterada com o campeonato encerrado.';
  END IF;

  IF jsonb_typeof(COALESCE(_settings, '[]'::jsonb)) <> 'array'
    OR jsonb_array_length(COALESCE(_settings, '[]'::jsonb)) <> 20
    OR EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(COALESCE(_settings, '[]'::jsonb))
        AS settings_input(final_position INTEGER, points INTEGER)
      WHERE settings_input.final_position NOT BETWEEN 1 AND 20
        OR settings_input.points IS NULL
        OR settings_input.points < 0
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(COALESCE(_settings, '[]'::jsonb))
        AS settings_input(final_position INTEGER, points INTEGER)
      GROUP BY settings_input.final_position
      HAVING COUNT(*) > 1
    ) THEN
    RAISE EXCEPTION 'Informe os pontos inteiros não negativos para cada posição do 1º ao 20º lugar.';
  END IF;

  DELETE FROM public.championship_overall_position_point_settings
  WHERE championship_id = _championship_id
    AND season_year = _season_year;

  INSERT INTO public.championship_overall_position_point_settings (
    championship_id,
    season_year,
    final_position,
    points
  )
  SELECT
    _championship_id,
    _season_year,
    settings_input.final_position,
    settings_input.points
  FROM jsonb_to_recordset(COALESCE(_settings, '[]'::jsonb))
    AS settings_input(final_position INTEGER, points INTEGER);

  PERFORM public.write_admin_action_log(
    'UPDATE'::public.admin_action_type,
    'public.championship_overall_position_point_settings',
    format('%s:%s', _championship_id, _season_year),
    'Atualizou a pontuação por colocação da classificação geral.',
    NULL,
    _settings,
    jsonb_build_object('championship_id', _championship_id, 'season_year', _season_year)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_interlaje_competition_standings(
  _championship_id UUID,
  _season_year INTEGER,
  _sport_id UUID,
  _naipe public.match_naipe,
  _division public.team_division DEFAULT NULL
)
RETURNS TABLE(
  team_id UUID,
  team_name TEXT,
  division public.team_division,
  played INTEGER,
  wins INTEGER,
  draws INTEGER,
  losses INTEGER,
  goals_for INTEGER,
  goals_against INTEGER,
  goal_diff INTEGER,
  points NUMERIC,
  yellow_cards INTEGER,
  red_cards INTEGER,
  blue_cards INTEGER,
  two_minute_penalties INTEGER,
  final_position INTEGER,
  placement_points INTEGER
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH effective_standings AS (
    SELECT
      standings_table.team_id,
      standings_table.team_name,
      standings_table.division,
      standings_table.played,
      standings_table.wins,
      standings_table.draws,
      standings_table.losses,
      standings_table.goals_for,
      standings_table.goals_against,
      standings_table.goal_diff,
      standings_table.points
        + COALESCE(corrected_standings_table.corrected_points - corrected_standings_table.points_base, 0) AS points,
      standings_table.yellow_cards,
      standings_table.red_cards,
      standings_table.blue_cards,
      standings_table.two_minute_penalties,
      championship_sports_table.tie_breaker_rule
    FROM public.get_championship_effective_standings(
      _championship_id,
      _season_year,
      CASE WHEN _division IS NULL THEN 'WITHOUT_DIVISION' ELSE _division::TEXT END,
      _naipe,
      _sport_id
    ) AS standings_table
    LEFT JOIN public.get_championship_corrected_group_standings(
      _championship_id,
      _season_year
    ) AS corrected_standings_table
      ON corrected_standings_table.team_id = standings_table.team_id
      AND corrected_standings_table.sport_id = _sport_id
      AND corrected_standings_table.naipe = _naipe
      AND corrected_standings_table.division IS NOT DISTINCT FROM standings_table.division
    JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = _championship_id
      AND championship_sports_table.sport_id = _sport_id
    WHERE _division IS NULL
      OR standings_table.division IS NOT DISTINCT FROM _division
  ), ranked_standings AS (
    SELECT
      effective_standings.*,
      ROW_NUMBER() OVER (
        PARTITION BY effective_standings.division
        ORDER BY
          effective_standings.points DESC,
          CASE WHEN effective_standings.tie_breaker_rule = 'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule THEN effective_standings.wins END DESC,
          CASE WHEN effective_standings.tie_breaker_rule = 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule
            THEN CASE WHEN effective_standings.goals_against = 0 AND effective_standings.goals_for > 0 THEN 1000000000::NUMERIC
              WHEN effective_standings.goals_against = 0 THEN 0
              ELSE effective_standings.goals_for::NUMERIC / effective_standings.goals_against END
          END DESC NULLS LAST,
          effective_standings.goal_diff DESC,
          CASE WHEN effective_standings.tie_breaker_rule = 'HANDEBOL'::public.championship_sport_tie_breaker_rule THEN effective_standings.goals_against END ASC NULLS LAST,
          effective_standings.goals_for DESC,
          CASE WHEN effective_standings.tie_breaker_rule IN ('STANDARD'::public.championship_sport_tie_breaker_rule, 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule) THEN effective_standings.wins END DESC,
          CASE WHEN effective_standings.tie_breaker_rule IN ('BEACH_SOCCER'::public.championship_sport_tie_breaker_rule, 'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule, 'HANDEBOL'::public.championship_sport_tie_breaker_rule) THEN effective_standings.yellow_cards END ASC NULLS LAST,
          effective_standings.red_cards ASC,
          effective_standings.blue_cards ASC,
          effective_standings.two_minute_penalties ASC,
          effective_standings.team_name ASC
      )::INTEGER AS final_position
    FROM effective_standings
  )
  SELECT
    ranked_standings.team_id,
    ranked_standings.team_name,
    ranked_standings.division,
    ranked_standings.played,
    ranked_standings.wins,
    ranked_standings.draws,
    ranked_standings.losses,
    ranked_standings.goals_for,
    ranked_standings.goals_against,
    ranked_standings.goal_diff,
    ranked_standings.points,
    ranked_standings.yellow_cards,
    ranked_standings.red_cards,
    ranked_standings.blue_cards,
    ranked_standings.two_minute_penalties,
    ranked_standings.final_position,
    COALESCE(settings_table.points, 0) AS placement_points
  FROM ranked_standings
  LEFT JOIN public.championship_overall_position_point_settings AS settings_table
    ON settings_table.championship_id = _championship_id
    AND settings_table.season_year = _season_year
    AND settings_table.final_position = ranked_standings.final_position
  ORDER BY ranked_standings.final_position;
$$;

DROP FUNCTION IF EXISTS public.get_interlaje_overall_standings(UUID, INTEGER);
CREATE OR REPLACE FUNCTION public.get_interlaje_overall_standings(
  _championship_id UUID,
  _season_year INTEGER
)
RETURNS TABLE(
  team_id UUID,
  team_name TEXT,
  placement_points NUMERIC,
  opening_bonus_points NUMERIC,
  walkover_count INTEGER,
  walkover_penalty_points NUMERIC,
  overall_points NUMERIC,
  confirmed_competitions_count INTEGER,
  has_pending_tie_break BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH participating_teams AS (
    SELECT DISTINCT registrations_table.team_id
    FROM public.championship_bracket_team_registrations AS registrations_table
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = registrations_table.bracket_edition_id
    WHERE editions_table.championship_id = _championship_id
      AND editions_table.season_year = _season_year
  ), competition_contexts AS (
    SELECT DISTINCT standings_table.sport_id, standings_table.naipe, standings_table.division
    FROM public.get_championship_effective_standings(
      _championship_id,
      _season_year,
      NULL,
      NULL,
      NULL
    ) AS standings_table
  ), competition_points AS (
    SELECT standings_table.team_id, standings_table.placement_points
    FROM competition_contexts
    CROSS JOIN LATERAL public.get_interlaje_competition_standings(
      _championship_id,
      _season_year,
      competition_contexts.sport_id,
      competition_contexts.naipe,
      competition_contexts.division
    ) AS standings_table
  ), placement_totals AS (
    SELECT
      competition_points.team_id,
      COALESCE(SUM(competition_points.placement_points), 0) AS placement_points,
      COUNT(*)::INTEGER AS confirmed_competitions_count
    FROM competition_points
    GROUP BY competition_points.team_id
  ), opening_totals AS (
    SELECT
      adjustments_table.team_id,
      COALESCE(SUM(adjustments_table.points), 0) AS opening_bonus_points
    FROM public.championship_overall_score_adjustments AS adjustments_table
    WHERE adjustments_table.championship_id = _championship_id
      AND adjustments_table.season_year = _season_year
      AND adjustments_table.adjustment_type = 'OPENING_CEREMONY'
    GROUP BY adjustments_table.team_id
  ), walkover_totals AS (
    SELECT
      counts_table.team_id,
      SUM(counts_table.walkover_count)::INTEGER AS walkover_count,
      COALESCE(SUM(counts_table.walkover_count * settings_table.points), 0) AS walkover_penalty_points
    FROM public.championship_walkover_penalty_counts AS counts_table
    JOIN public.championship_walkover_penalty_settings AS settings_table
      ON settings_table.championship_id = counts_table.championship_id
      AND settings_table.season_year = counts_table.season_year
    WHERE counts_table.championship_id = _championship_id
      AND counts_table.season_year = _season_year
    GROUP BY counts_table.team_id
  ), totals AS (
    SELECT
      teams_table.id AS team_id,
      teams_table.name AS team_name,
      COALESCE(placement_totals.placement_points, 0) AS placement_points,
      COALESCE(opening_totals.opening_bonus_points, 0) AS opening_bonus_points,
      COALESCE(walkover_totals.walkover_count, 0)::INTEGER AS walkover_count,
      COALESCE(walkover_totals.walkover_penalty_points, 0) AS walkover_penalty_points,
      COALESCE(placement_totals.placement_points, 0)
        + COALESCE(opening_totals.opening_bonus_points, 0)
        - COALESCE(walkover_totals.walkover_penalty_points, 0) AS overall_points,
      COALESCE(placement_totals.confirmed_competitions_count, 0) AS confirmed_competitions_count
    FROM participating_teams
    JOIN public.teams AS teams_table ON teams_table.id = participating_teams.team_id
    LEFT JOIN placement_totals ON placement_totals.team_id = teams_table.id
    LEFT JOIN opening_totals ON opening_totals.team_id = teams_table.id
    LEFT JOIN walkover_totals ON walkover_totals.team_id = teams_table.id
    WHERE teams_table.is_active IS DISTINCT FROM false
  ), tie_groups AS (
    SELECT totals_table.overall_points
    FROM totals AS totals_table
    WHERE totals_table.overall_points > 0
    GROUP BY totals_table.overall_points
    HAVING COUNT(*) > 1
  ), resolved_ties AS (
    SELECT
      resolutions_table.points_total,
      resolution_teams_table.team_id,
      resolution_teams_table.draw_order
    FROM public.championship_overall_tie_break_resolutions AS resolutions_table
    JOIN public.championship_overall_tie_break_resolution_teams AS resolution_teams_table
      ON resolution_teams_table.resolution_id = resolutions_table.id
    WHERE resolutions_table.championship_id = _championship_id
      AND resolutions_table.season_year = _season_year
  )
  SELECT
    totals.team_id,
    totals.team_name,
    totals.placement_points,
    totals.opening_bonus_points,
    totals.walkover_count,
    totals.walkover_penalty_points,
    totals.overall_points,
    totals.confirmed_competitions_count,
    EXISTS (
      SELECT 1 FROM tie_groups
      WHERE tie_groups.overall_points = totals.overall_points
        AND NOT EXISTS (
          SELECT 1 FROM resolved_ties
          WHERE resolved_ties.points_total = totals.overall_points
            AND resolved_ties.team_id = totals.team_id
        )
    ) AS has_pending_tie_break
  FROM totals
  LEFT JOIN resolved_ties
    ON resolved_ties.team_id = totals.team_id
    AND resolved_ties.points_total = totals.overall_points
  ORDER BY totals.overall_points DESC, resolved_ties.draw_order ASC NULLS LAST, totals.team_name ASC;
$$;

CREATE OR REPLACE FUNCTION public.advance_championship_season(
  _championship_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  championship_record public.championships%ROWTYPE;
  next_season_year_value INTEGER;
BEGIN
  IF NOT public.has_admin_tab_access('championship_status'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Apenas administradores com acesso ao status do campeonato podem virar a temporada.';
  END IF;

  SELECT *
  INTO championship_record
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campeonato não encontrado.';
  END IF;

  IF championship_record.status != 'FINISHED'::public.championship_status THEN
    RAISE EXCEPTION 'Somente campeonatos encerrados podem abrir uma nova temporada.';
  END IF;

  next_season_year_value := championship_record.current_season_year + 1;

  IF EXISTS (
    SELECT 1 FROM public.matches AS matches_table
    WHERE matches_table.championship_id = championship_record.id
      AND matches_table.season_year = next_season_year_value
  ) OR EXISTS (
    SELECT 1 FROM public.standings AS standings_table
    WHERE standings_table.championship_id = championship_record.id
      AND standings_table.season_year = next_season_year_value
  ) OR EXISTS (
    SELECT 1 FROM public.championship_bracket_editions AS bracket_editions_table
    WHERE bracket_editions_table.championship_id = championship_record.id
      AND bracket_editions_table.season_year = next_season_year_value
  ) THEN
    RAISE EXCEPTION 'A próxima temporada já possui dados cadastrados.';
  END IF;

  UPDATE public.championships
  SET current_season_year = next_season_year_value, status = 'PLANNING'::public.championship_status
  WHERE id = championship_record.id;

  IF championship_record.code = 'INTERLAJE'::public.championship_code THEN
    INSERT INTO public.championship_overall_position_point_settings (
      championship_id,
      season_year,
      final_position,
      points
    )
    SELECT
      championship_record.id,
      next_season_year_value,
      settings_table.final_position,
      settings_table.points
    FROM public.championship_overall_position_point_settings AS settings_table
    WHERE settings_table.championship_id = championship_record.id
      AND settings_table.season_year = championship_record.current_season_year;
  END IF;

  RETURN json_build_object(
    'championship_id', championship_record.id,
    'previous_season_year', championship_record.current_season_year,
    'current_season_year', next_season_year_value,
    'status', 'PLANNING'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_interlaje_position_point_settings(UUID, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_interlaje_competition_standings(UUID, INTEGER, UUID, public.match_naipe, public.team_division) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_interlaje_overall_standings(UUID, INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_interlaje_position_point_settings(UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_interlaje_position_point_settings(UUID, INTEGER, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_interlaje_competition_standings(UUID, INTEGER, UUID, public.match_naipe, public.team_division) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_interlaje_overall_standings(UUID, INTEGER) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
