-- Add independent permission tabs for "Classificação" (standings)
-- and "Agenda" (championship_schedule). Until now both inherited MATCHES.

INSERT INTO public.admin_profile_permissions (profile_id, admin_tab, access_level)
SELECT
  matches_permissions.profile_id,
  'standings'::public.admin_panel_tab,
  matches_permissions.access_level
FROM public.admin_profile_permissions AS matches_permissions
LEFT JOIN public.admin_profile_permissions AS standings_permissions
  ON standings_permissions.profile_id = matches_permissions.profile_id
 AND standings_permissions.admin_tab = 'standings'::public.admin_panel_tab
WHERE matches_permissions.admin_tab = 'matches'::public.admin_panel_tab
  AND standings_permissions.profile_id IS NULL;

INSERT INTO public.admin_profile_permissions (profile_id, admin_tab, access_level)
SELECT
  matches_permissions.profile_id,
  'championship_schedule'::public.admin_panel_tab,
  matches_permissions.access_level
FROM public.admin_profile_permissions AS matches_permissions
LEFT JOIN public.admin_profile_permissions AS schedule_permissions
  ON schedule_permissions.profile_id = matches_permissions.profile_id
 AND schedule_permissions.admin_tab = 'championship_schedule'::public.admin_panel_tab
WHERE matches_permissions.admin_tab = 'matches'::public.admin_panel_tab
  AND schedule_permissions.profile_id IS NULL;

DROP FUNCTION IF EXISTS public.get_current_user_admin_context();

CREATE OR REPLACE FUNCTION public.get_current_user_admin_context()
RETURNS TABLE (
  role                             public.app_role,
  profile_id                       UUID,
  profile_name                     TEXT,
  matches_permission               public.admin_panel_permission_level,
  control_permission               public.admin_panel_permission_level,
  teams_permission                 public.admin_panel_permission_level,
  sports_permission                public.admin_panel_permission_level,
  events_permission                public.admin_panel_permission_level,
  logs_permission                  public.admin_panel_permission_level,
  users_permission                 public.admin_panel_permission_level,
  account_permission               public.admin_panel_permission_level,
  championship_status_permission   public.admin_panel_permission_level,
  settings_permission              public.admin_panel_permission_level,
  score_sheet_review_permission    public.admin_panel_permission_level,
  tie_breaks_permission            public.admin_panel_permission_level,
  standings_permission             public.admin_panel_permission_level,
  championship_schedule_permission public.admin_panel_permission_level
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
    public.resolve_current_user_tab_permission_level('logs'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('users'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('account'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('championship_status'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('settings'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('score_sheet_review'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('tie_breaks'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('standings'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('championship_schedule'::public.admin_panel_tab);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_user_admin_context() TO authenticated;

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
    admin_profiles_table.id AS profile_id,
    admin_profiles_table.name AS profile_name,
    admin_profiles_table.is_system,
    jsonb_build_object(
      'matches', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'matches'::public.admin_panel_tab), 'NONE'),
      'score_sheet_review', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'score_sheet_review'::public.admin_panel_tab), 'NONE'),
      'tie_breaks', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'tie_breaks'::public.admin_panel_tab), 'NONE'),
      'control', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'control'::public.admin_panel_tab), 'NONE'),
      'standings', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'standings'::public.admin_panel_tab), 'NONE'),
      'teams', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'teams'::public.admin_panel_tab), 'NONE'),
      'sports', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'sports'::public.admin_panel_tab), 'NONE'),
      'events', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'events'::public.admin_panel_tab), 'NONE'),
      'logs', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'logs'::public.admin_panel_tab), 'NONE'),
      'users', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'users'::public.admin_panel_tab), 'NONE'),
      'account', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'account'::public.admin_panel_tab), 'NONE'),
      'championship_status', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'championship_status'::public.admin_panel_tab), 'NONE'),
      'championship_schedule', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'championship_schedule'::public.admin_panel_tab), 'NONE'),
      'settings', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'settings'::public.admin_panel_tab), 'NONE')
    ) AS permissions,
    admin_profiles_table.created_at,
    admin_profiles_table.updated_at
  FROM public.admin_profiles AS admin_profiles_table
  ORDER BY admin_profiles_table.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_admin_profiles() TO authenticated;

NOTIFY pgrst, 'reload schema';
