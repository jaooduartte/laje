CREATE TABLE IF NOT EXISTS public.championship_walkover_penalty_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  season_year INTEGER NOT NULL CHECK (season_year >= 2024),
  points INTEGER NOT NULL CHECK (points > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (championship_id, season_year)
);

CREATE TABLE IF NOT EXISTS public.championship_walkover_penalty_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  season_year INTEGER NOT NULL CHECK (season_year >= 2024),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  walkover_count INTEGER NOT NULL CHECK (walkover_count > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (championship_id, season_year, team_id)
);

CREATE INDEX IF NOT EXISTS championship_walkover_penalty_counts_championship_year_idx
  ON public.championship_walkover_penalty_counts (championship_id, season_year DESC);

DROP TRIGGER IF EXISTS set_championship_walkover_penalty_settings_updated_at ON public.championship_walkover_penalty_settings;
CREATE TRIGGER set_championship_walkover_penalty_settings_updated_at
  BEFORE UPDATE ON public.championship_walkover_penalty_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_championship_overall_standings_updated_at();

DROP TRIGGER IF EXISTS set_championship_walkover_penalty_counts_updated_at ON public.championship_walkover_penalty_counts;
CREATE TRIGGER set_championship_walkover_penalty_counts_updated_at
  BEFORE UPDATE ON public.championship_walkover_penalty_counts
  FOR EACH ROW EXECUTE FUNCTION public.set_championship_overall_standings_updated_at();

ALTER TABLE public.championship_walkover_penalty_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.championship_walkover_penalty_counts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.championship_walkover_penalty_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.championship_walkover_penalty_counts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_interlaje_walkover_penalty_adjustments(
  _championship_id UUID,
  _season_year INTEGER
)
RETURNS TABLE(
  points INTEGER,
  team_id UUID,
  walkover_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.has_admin_tab_access('opening_ceremony_bonus'::public.admin_panel_tab, false) THEN
    RAISE EXCEPTION 'Usuário sem permissão para consultar os ajustes da classificação geral.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.championships AS championships_table
    WHERE championships_table.id = _championship_id
      AND championships_table.code = 'INTERLAJE'::public.championship_code
  ) THEN
    RAISE EXCEPTION 'Os ajustes da classificação geral são exclusivos do INTERLAJE.';
  END IF;

  RETURN QUERY
  SELECT
    settings_table.points,
    counts_table.team_id,
    counts_table.walkover_count
  FROM public.championship_walkover_penalty_settings AS settings_table
  LEFT JOIN public.championship_walkover_penalty_counts AS counts_table
    ON counts_table.championship_id = settings_table.championship_id
    AND counts_table.season_year = settings_table.season_year
  WHERE settings_table.championship_id = _championship_id
    AND settings_table.season_year = _season_year;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_interlaje_walkover_penalty_points(
  _championship_id UUID,
  _season_year INTEGER,
  _points INTEGER
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
    RAISE EXCEPTION 'Usuário sem permissão para configurar a penalidade por W.O.';
  END IF;

  SELECT championships_table.status, championships_table.code
  INTO championship_status_value, championship_code_value
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id;

  IF championship_code_value IS DISTINCT FROM 'INTERLAJE'::public.championship_code THEN
    RAISE EXCEPTION 'A penalidade por W.O. é exclusiva do INTERLAJE.';
  END IF;

  IF championship_status_value NOT IN (
    'PLANNING'::public.championship_status,
    'UPCOMING'::public.championship_status,
    'REVIEW'::public.championship_status,
    'IN_PROGRESS'::public.championship_status
  ) THEN
    RAISE EXCEPTION 'A penalidade por W.O. não pode ser configurada com o campeonato encerrado.';
  END IF;

  IF _points IS NULL OR _points <= 0 THEN
    RAISE EXCEPTION 'Informe uma quantidade inteira positiva de pontos por W.O.';
  END IF;

  INSERT INTO public.championship_walkover_penalty_settings (
    championship_id,
    season_year,
    points
  ) VALUES (
    _championship_id,
    _season_year,
    _points
  )
  ON CONFLICT (championship_id, season_year)
  DO UPDATE SET points = EXCLUDED.points, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.save_interlaje_walkover_penalty_counts(
  _championship_id UUID,
  _season_year INTEGER,
  _counts JSONB
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
    RAISE EXCEPTION 'Usuário sem permissão para registrar penalidades por W.O.';
  END IF;

  SELECT championships_table.status, championships_table.code
  INTO championship_status_value, championship_code_value
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id;

  IF championship_code_value IS DISTINCT FROM 'INTERLAJE'::public.championship_code THEN
    RAISE EXCEPTION 'A penalidade por W.O. é exclusiva do INTERLAJE.';
  END IF;

  IF championship_status_value NOT IN (
    'PLANNING'::public.championship_status,
    'UPCOMING'::public.championship_status,
    'REVIEW'::public.championship_status,
    'IN_PROGRESS'::public.championship_status
  ) THEN
    RAISE EXCEPTION 'As penalidades por W.O. não podem ser alteradas com o campeonato encerrado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.championship_walkover_penalty_settings AS settings_table
    WHERE settings_table.championship_id = _championship_id
      AND settings_table.season_year = _season_year
  ) THEN
    RAISE EXCEPTION 'Configure a pontuação da penalidade por W.O. antes de informar as atléticas.';
  END IF;

  IF jsonb_typeof(COALESCE(_counts, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Informe uma lista válida de penalidades por W.O.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(_counts, '[]'::jsonb))
      AS counts_input(team_id UUID, walkover_count INTEGER)
    WHERE counts_input.team_id IS NULL
      OR counts_input.walkover_count IS NULL
      OR counts_input.walkover_count < 0
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(_counts, '[]'::jsonb))
      AS counts_input(team_id UUID, walkover_count INTEGER)
    GROUP BY counts_input.team_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cada atlética deve ter uma quantidade inteira não negativa de W.O.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(_counts, '[]'::jsonb))
      AS counts_input(team_id UUID, walkover_count INTEGER)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.championship_bracket_team_registrations AS registrations_table
      JOIN public.championship_bracket_editions AS editions_table
        ON editions_table.id = registrations_table.bracket_edition_id
      JOIN public.teams AS teams_table
        ON teams_table.id = registrations_table.team_id
      WHERE registrations_table.team_id = counts_input.team_id
        AND editions_table.championship_id = _championship_id
        AND editions_table.season_year = _season_year
        AND teams_table.is_active IS DISTINCT FROM false
    )
  ) THEN
    RAISE EXCEPTION 'Atlética ativa não está inscrita nesta edição do INTERLAJE.';
  END IF;

  DELETE FROM public.championship_walkover_penalty_counts AS counts_table
  USING jsonb_to_recordset(COALESCE(_counts, '[]'::jsonb))
    AS counts_input(team_id UUID, walkover_count INTEGER)
  WHERE counts_table.championship_id = _championship_id
    AND counts_table.season_year = _season_year
    AND counts_table.team_id = counts_input.team_id
    AND counts_input.walkover_count = 0;

  INSERT INTO public.championship_walkover_penalty_counts (
    championship_id,
    season_year,
    team_id,
    walkover_count
  )
  SELECT
    _championship_id,
    _season_year,
    counts_input.team_id,
    counts_input.walkover_count
  FROM jsonb_to_recordset(COALESCE(_counts, '[]'::jsonb))
    AS counts_input(team_id UUID, walkover_count INTEGER)
  WHERE counts_input.walkover_count > 0
  ON CONFLICT (championship_id, season_year, team_id)
  DO UPDATE SET
    walkover_count = EXCLUDED.walkover_count,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.get_interlaje_walkover_penalty_adjustments(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_interlaje_walkover_penalty_points(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_interlaje_walkover_penalty_counts(UUID, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_interlaje_walkover_penalty_adjustments(UUID, INTEGER)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_interlaje_walkover_penalty_points(UUID, INTEGER, INTEGER)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_interlaje_walkover_penalty_counts(UUID, INTEGER, JSONB)
  TO authenticated;

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
SET search_path = public
AS $$
  WITH participating_teams AS (
    SELECT DISTINCT registrations_table.team_id
    FROM public.championship_bracket_team_registrations AS registrations_table
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = registrations_table.bracket_edition_id
    WHERE editions_table.championship_id = _championship_id
      AND editions_table.season_year = _season_year
  ),
  effective_competition_points AS (
    SELECT
      standings_table.team_id,
      COALESCE(SUM(standings_table.points), 0) AS competition_points,
      COUNT(DISTINCT (
        standings_table.sport_id,
        standings_table.naipe,
        standings_table.division
      ))::INTEGER AS competitions_count
    FROM public.get_championship_effective_standings(
      _championship_id,
      _season_year,
      NULL,
      NULL,
      NULL
    ) AS standings_table
    GROUP BY standings_table.team_id
  ),
  corrected_group_adjustments AS (
    SELECT
      corrected_group_standings_table.team_id,
      COALESCE(
        SUM(
          corrected_group_standings_table.corrected_points
          - corrected_group_standings_table.points_base
        ),
        0
      ) AS points_adjustment
    FROM public.get_championship_corrected_group_standings(
      _championship_id,
      _season_year
    ) AS corrected_group_standings_table
    GROUP BY corrected_group_standings_table.team_id
  ),
  live_competition_points AS (
    SELECT
      effective_competition_points.team_id,
      effective_competition_points.competition_points
        + COALESCE(corrected_group_adjustments.points_adjustment, 0)
        AS competition_points,
      effective_competition_points.competitions_count
    FROM effective_competition_points
    LEFT JOIN corrected_group_adjustments
      ON corrected_group_adjustments.team_id = effective_competition_points.team_id
  ),
  opening_totals AS (
    SELECT
      adjustments_table.team_id,
      COALESCE(SUM(adjustments_table.points), 0) AS opening_bonus_points
    FROM public.championship_overall_score_adjustments AS adjustments_table
    WHERE adjustments_table.championship_id = _championship_id
      AND adjustments_table.season_year = _season_year
      AND adjustments_table.adjustment_type = 'OPENING_CEREMONY'
    GROUP BY adjustments_table.team_id
  ),
  walkover_totals AS (
    SELECT
      counts_table.team_id,
      SUM(counts_table.walkover_count)::INTEGER AS walkover_count,
      COALESCE(SUM(counts_table.walkover_count * settings_table.points), 0)
        AS walkover_penalty_points
    FROM public.championship_walkover_penalty_counts AS counts_table
    JOIN public.championship_walkover_penalty_settings AS settings_table
      ON settings_table.championship_id = counts_table.championship_id
      AND settings_table.season_year = counts_table.season_year
    WHERE counts_table.championship_id = _championship_id
      AND counts_table.season_year = _season_year
    GROUP BY counts_table.team_id
  ),
  totals AS (
    SELECT
      teams_table.id AS team_id,
      teams_table.name AS team_name,
      COALESCE(live_competition_points.competition_points, 0) AS placement_points,
      COALESCE(opening_totals.opening_bonus_points, 0) AS opening_bonus_points,
      COALESCE(walkover_totals.walkover_count, 0)::INTEGER AS walkover_count,
      COALESCE(walkover_totals.walkover_penalty_points, 0) AS walkover_penalty_points,
      COALESCE(live_competition_points.competition_points, 0)
        + COALESCE(opening_totals.opening_bonus_points, 0)
        - COALESCE(walkover_totals.walkover_penalty_points, 0) AS overall_points,
      COALESCE(live_competition_points.competitions_count, 0) AS confirmed_competitions_count
    FROM participating_teams
    JOIN public.teams AS teams_table
      ON teams_table.id = participating_teams.team_id
    LEFT JOIN live_competition_points
      ON live_competition_points.team_id = teams_table.id
    LEFT JOIN opening_totals
      ON opening_totals.team_id = teams_table.id
    LEFT JOIN walkover_totals
      ON walkover_totals.team_id = teams_table.id
    WHERE teams_table.is_active IS DISTINCT FROM false
  ),
  tie_groups AS (
    SELECT
      totals_table.overall_points,
      ARRAY_AGG(totals_table.team_id ORDER BY totals_table.team_id::TEXT) AS team_ids
    FROM totals AS totals_table
    WHERE totals_table.overall_points > 0
    GROUP BY totals_table.overall_points
    HAVING COUNT(*) > 1
  ),
  resolved_ties AS (
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
      SELECT 1
      FROM tie_groups
      WHERE tie_groups.overall_points = totals.overall_points
        AND NOT EXISTS (
          SELECT 1
          FROM resolved_ties
          WHERE resolved_ties.points_total = totals.overall_points
            AND resolved_ties.team_id = totals.team_id
        )
    ) AS has_pending_tie_break
  FROM totals
  LEFT JOIN resolved_ties
    ON resolved_ties.team_id = totals.team_id
    AND resolved_ties.points_total = totals.overall_points
  ORDER BY
    totals.overall_points DESC,
    resolved_ties.draw_order ASC NULLS LAST,
    totals.team_name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_interlaje_overall_standings(UUID, INTEGER)
  TO anon, authenticated;
