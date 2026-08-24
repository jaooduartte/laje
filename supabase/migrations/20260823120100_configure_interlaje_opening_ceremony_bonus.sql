CREATE TABLE IF NOT EXISTS public.championship_opening_ceremony_bonus_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  season_year INTEGER NOT NULL CHECK (season_year >= 2024),
  points INTEGER NOT NULL CHECK (points > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (championship_id, season_year)
);

CREATE INDEX IF NOT EXISTS championship_opening_ceremony_bonus_settings_championship_year_idx
  ON public.championship_opening_ceremony_bonus_settings (championship_id, season_year DESC);

CREATE OR REPLACE FUNCTION public.set_championship_opening_ceremony_bonus_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_championship_opening_ceremony_bonus_settings_updated_at ON public.championship_opening_ceremony_bonus_settings;
CREATE TRIGGER set_championship_opening_ceremony_bonus_settings_updated_at
  BEFORE UPDATE ON public.championship_opening_ceremony_bonus_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_championship_opening_ceremony_bonus_settings_updated_at();

ALTER TABLE public.championship_opening_ceremony_bonus_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS championship_opening_ceremony_bonus_settings_public_select ON public.championship_opening_ceremony_bonus_settings;
CREATE POLICY championship_opening_ceremony_bonus_settings_public_select
  ON public.championship_opening_ceremony_bonus_settings FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS championship_overall_score_adjustments_authenticated_write ON public.championship_overall_score_adjustments;

ALTER TABLE public.championship_overall_score_adjustments
  DROP CONSTRAINT IF EXISTS championship_overall_score_adjustments_points_check;
ALTER TABLE public.championship_overall_score_adjustments
  ADD CONSTRAINT championship_overall_score_adjustments_points_check
  CHECK (points > 0 AND points = trunc(points));

INSERT INTO public.championship_opening_ceremony_bonus_settings (
  championship_id,
  season_year,
  points
)
SELECT
  adjustments_table.championship_id,
  adjustments_table.season_year,
  max(adjustments_table.points)::INTEGER
FROM public.championship_overall_score_adjustments AS adjustments_table
JOIN public.championships AS championships_table
  ON championships_table.id = adjustments_table.championship_id
WHERE adjustments_table.adjustment_type = 'OPENING_CEREMONY'
  AND championships_table.code = 'INTERLAJE'::public.championship_code
GROUP BY adjustments_table.championship_id, adjustments_table.season_year
ON CONFLICT (championship_id, season_year) DO NOTHING;

INSERT INTO public.admin_profile_permissions (
  profile_id,
  admin_tab,
  access_level
)
SELECT
  admin_profiles_table.id,
  'opening_ceremony_bonus'::public.admin_panel_tab,
  CASE
    WHEN admin_profiles_table.system_role = 'admin'::public.app_role
      THEN 'EDIT'::public.admin_panel_permission_level
    ELSE 'NONE'::public.admin_panel_permission_level
  END
FROM public.admin_profiles AS admin_profiles_table
ON CONFLICT (profile_id, admin_tab) DO NOTHING;

DROP FUNCTION IF EXISTS public.get_current_user_admin_context();
CREATE OR REPLACE FUNCTION public.get_current_user_admin_context()
RETURNS TABLE (
  role public.app_role,
  profile_id UUID,
  profile_name TEXT,
  matches_permission public.admin_panel_permission_level,
  control_permission public.admin_panel_permission_level,
  teams_permission public.admin_panel_permission_level,
  sports_permission public.admin_panel_permission_level,
  events_permission public.admin_panel_permission_level,
  links_permission public.admin_panel_permission_level,
  logs_permission public.admin_panel_permission_level,
  users_permission public.admin_panel_permission_level,
  account_permission public.admin_panel_permission_level,
  championship_status_permission public.admin_panel_permission_level,
  settings_permission public.admin_panel_permission_level,
  score_sheet_review_permission public.admin_panel_permission_level,
  tie_breaks_permission public.admin_panel_permission_level,
  standings_permission public.admin_panel_permission_level,
  championship_schedule_permission public.admin_panel_permission_level,
  individual_events_permission public.admin_panel_permission_level,
  opening_ceremony_bonus_permission public.admin_panel_permission_level
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
  current_profile_id UUID;
  current_profile_name TEXT;
  current_profile_role public.app_role;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    admin_user_profiles_table.profile_id,
    admin_profiles_table.name,
    admin_profiles_table.system_role
  INTO
    current_profile_id,
    current_profile_name,
    current_profile_role
  FROM public.admin_user_profiles AS admin_user_profiles_table
  JOIN public.admin_profiles AS admin_profiles_table
    ON admin_profiles_table.id = admin_user_profiles_table.profile_id
  WHERE admin_user_profiles_table.user_id = current_user_id
  LIMIT 1;

  RETURN QUERY
  SELECT
    current_profile_role,
    current_profile_id,
    current_profile_name,
    public.resolve_current_user_tab_permission_level('matches'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('control'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('teams'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('sports'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('events'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('links'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('logs'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('users'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('account'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('championship_status'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('settings'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('score_sheet_review'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('tie_breaks'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('standings'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('championship_schedule'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('individual_events'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('opening_ceremony_bonus'::public.admin_panel_tab);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_admin_profiles()
RETURNS TABLE (
  profile_id UUID,
  profile_name TEXT,
  is_system BOOLEAN,
  permissions JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_admin_tab_access('users'::public.admin_panel_tab, false) THEN
    RAISE EXCEPTION 'Sem permissão para listar perfis administrativos.';
  END IF;

  RETURN QUERY
  SELECT
    admin_profiles_table.id,
    admin_profiles_table.name,
    admin_profiles_table.is_system,
    jsonb_object_agg(
      admin_panel_tabs_table.admin_tab::text,
      COALESCE(admin_profile_permissions_table.access_level::text, 'NONE')
    ) AS permissions,
    admin_profiles_table.created_at,
    admin_profiles_table.updated_at
  FROM public.admin_profiles AS admin_profiles_table
  CROSS JOIN unnest(enum_range(NULL::public.admin_panel_tab)) AS admin_panel_tabs_table(admin_tab)
  LEFT JOIN public.admin_profile_permissions AS admin_profile_permissions_table
    ON admin_profile_permissions_table.profile_id = admin_profiles_table.id
    AND admin_profile_permissions_table.admin_tab = admin_panel_tabs_table.admin_tab
  GROUP BY admin_profiles_table.id
  ORDER BY admin_profiles_table.is_system DESC, admin_profiles_table.name ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_interlaje_opening_ceremony_bonus_points(
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
    RAISE EXCEPTION 'Usuário sem permissão para configurar o bônus da abertura.';
  END IF;

  SELECT championships_table.status, championships_table.code
  INTO championship_status_value, championship_code_value
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id;

  IF championship_code_value IS DISTINCT FROM 'INTERLAJE'::public.championship_code THEN
    RAISE EXCEPTION 'O bônus da abertura é exclusivo do INTERLAJE.';
  END IF;

  IF championship_status_value NOT IN (
    'PLANNING'::public.championship_status,
    'UPCOMING'::public.championship_status,
    'REVIEW'::public.championship_status,
    'IN_PROGRESS'::public.championship_status
  ) THEN
    RAISE EXCEPTION 'O bônus da abertura não pode ser configurado com o campeonato encerrado.';
  END IF;

  IF _points IS NULL OR _points <= 0 THEN
    RAISE EXCEPTION 'Informe uma quantidade inteira positiva de pontos.';
  END IF;

  INSERT INTO public.championship_opening_ceremony_bonus_settings (
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

  UPDATE public.championship_overall_score_adjustments
  SET points = _points, updated_at = now()
  WHERE championship_id = _championship_id
    AND season_year = _season_year
    AND adjustment_type = 'OPENING_CEREMONY';
END;
$$;

CREATE OR REPLACE FUNCTION public.save_interlaje_opening_ceremony_bonus(
  _championship_id UUID,
  _season_year INTEGER,
  _team_id UUID,
  _eligible BOOLEAN,
  _justification TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  championship_status_value public.championship_status;
  championship_code_value public.championship_code;
  configured_points INTEGER;
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.has_admin_tab_access('opening_ceremony_bonus'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para registrar o bônus da abertura.';
  END IF;

  SELECT championships_table.status, championships_table.code
  INTO championship_status_value, championship_code_value
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id;

  IF championship_code_value IS DISTINCT FROM 'INTERLAJE'::public.championship_code THEN
    RAISE EXCEPTION 'O bônus da abertura é exclusivo do INTERLAJE.';
  END IF;

  IF championship_status_value NOT IN (
    'REVIEW'::public.championship_status,
    'IN_PROGRESS'::public.championship_status
  ) THEN
    RAISE EXCEPTION 'As atléticas só podem receber o bônus da abertura em revisão ou em andamento.';
  END IF;

  IF _eligible IS NOT TRUE THEN
    DELETE FROM public.championship_overall_score_adjustments
    WHERE championship_id = _championship_id
      AND season_year = _season_year
      AND team_id = _team_id
      AND adjustment_type = 'OPENING_CEREMONY';
    RETURN;
  END IF;

  SELECT settings_table.points
  INTO configured_points
  FROM public.championship_opening_ceremony_bonus_settings AS settings_table
  WHERE settings_table.championship_id = _championship_id
    AND settings_table.season_year = _season_year;

  IF configured_points IS NULL THEN
    RAISE EXCEPTION 'Configure a quantidade de pontos antes de marcar as atléticas.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.teams AS teams_table
    WHERE teams_table.id = _team_id
      AND teams_table.is_active IS DISTINCT FROM false
  ) THEN
    RAISE EXCEPTION 'Atlética ativa não encontrada.';
  END IF;

  INSERT INTO public.championship_overall_score_adjustments (
    championship_id,
    season_year,
    team_id,
    adjustment_type,
    points,
    justification,
    granted_by
  ) VALUES (
    _championship_id,
    _season_year,
    _team_id,
    'OPENING_CEREMONY',
    configured_points,
    'Presença confirmada na abertura.',
    auth.uid()
  )
  ON CONFLICT (championship_id, season_year, team_id, adjustment_type)
  DO UPDATE SET
    points = EXCLUDED.points,
    justification = EXCLUDED.justification,
    granted_by = EXCLUDED.granted_by,
    granted_at = now(),
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_user_admin_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_admin_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_interlaje_opening_ceremony_bonus_points(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_interlaje_opening_ceremony_bonus(UUID, INTEGER, UUID, BOOLEAN, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
