INSERT INTO public.admin_profile_permissions (
  profile_id,
  admin_tab,
  access_level
)
SELECT
  admin_profiles_table.id,
  'championship_status'::public.admin_panel_tab,
  COALESCE(
    settings_permission_table.access_level,
    'NONE'::public.admin_panel_permission_level
  ) AS access_level
FROM public.admin_profiles AS admin_profiles_table
LEFT JOIN public.admin_profile_permissions AS settings_permission_table
  ON settings_permission_table.profile_id = admin_profiles_table.id
  AND settings_permission_table.admin_tab = 'settings'::public.admin_panel_tab
ON CONFLICT (profile_id, admin_tab) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_access_admin_panel()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_admin_tab_access('matches'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('control'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('teams'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('sports'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('events'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('logs'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('users'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('account'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('championship_status'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('settings'::public.admin_panel_tab, false)
$$;

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
  logs_permission public.admin_panel_permission_level,
  users_permission public.admin_panel_permission_level,
  account_permission public.admin_panel_permission_level,
  championship_status_permission public.admin_panel_permission_level,
  settings_permission public.admin_panel_permission_level
)
LANGUAGE plpgsql
STABLE
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
    public.resolve_current_user_tab_permission_level('settings'::public.admin_panel_tab);
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
    admin_profiles_table.id AS profile_id,
    admin_profiles_table.name AS profile_name,
    admin_profiles_table.is_system,
    jsonb_build_object(
      'matches', COALESCE((
        SELECT admin_profile_permissions_table.access_level::text
        FROM public.admin_profile_permissions AS admin_profile_permissions_table
        WHERE admin_profile_permissions_table.profile_id = admin_profiles_table.id
          AND admin_profile_permissions_table.admin_tab = 'matches'::public.admin_panel_tab
      ), 'NONE'),
      'control', COALESCE((
        SELECT admin_profile_permissions_table.access_level::text
        FROM public.admin_profile_permissions AS admin_profile_permissions_table
        WHERE admin_profile_permissions_table.profile_id = admin_profiles_table.id
          AND admin_profile_permissions_table.admin_tab = 'control'::public.admin_panel_tab
      ), 'NONE'),
      'teams', COALESCE((
        SELECT admin_profile_permissions_table.access_level::text
        FROM public.admin_profile_permissions AS admin_profile_permissions_table
        WHERE admin_profile_permissions_table.profile_id = admin_profiles_table.id
          AND admin_profile_permissions_table.admin_tab = 'teams'::public.admin_panel_tab
      ), 'NONE'),
      'sports', COALESCE((
        SELECT admin_profile_permissions_table.access_level::text
        FROM public.admin_profile_permissions AS admin_profile_permissions_table
        WHERE admin_profile_permissions_table.profile_id = admin_profiles_table.id
          AND admin_profile_permissions_table.admin_tab = 'sports'::public.admin_panel_tab
      ), 'NONE'),
      'events', COALESCE((
        SELECT admin_profile_permissions_table.access_level::text
        FROM public.admin_profile_permissions AS admin_profile_permissions_table
        WHERE admin_profile_permissions_table.profile_id = admin_profiles_table.id
          AND admin_profile_permissions_table.admin_tab = 'events'::public.admin_panel_tab
      ), 'NONE'),
      'logs', COALESCE((
        SELECT admin_profile_permissions_table.access_level::text
        FROM public.admin_profile_permissions AS admin_profile_permissions_table
        WHERE admin_profile_permissions_table.profile_id = admin_profiles_table.id
          AND admin_profile_permissions_table.admin_tab = 'logs'::public.admin_panel_tab
      ), 'NONE'),
      'users', COALESCE((
        SELECT admin_profile_permissions_table.access_level::text
        FROM public.admin_profile_permissions AS admin_profile_permissions_table
        WHERE admin_profile_permissions_table.profile_id = admin_profiles_table.id
          AND admin_profile_permissions_table.admin_tab = 'users'::public.admin_panel_tab
      ), 'NONE'),
      'account', COALESCE((
        SELECT admin_profile_permissions_table.access_level::text
        FROM public.admin_profile_permissions AS admin_profile_permissions_table
        WHERE admin_profile_permissions_table.profile_id = admin_profiles_table.id
          AND admin_profile_permissions_table.admin_tab = 'account'::public.admin_panel_tab
      ), 'NONE'),
      'championship_status', COALESCE((
        SELECT admin_profile_permissions_table.access_level::text
        FROM public.admin_profile_permissions AS admin_profile_permissions_table
        WHERE admin_profile_permissions_table.profile_id = admin_profiles_table.id
          AND admin_profile_permissions_table.admin_tab = 'championship_status'::public.admin_panel_tab
      ), 'NONE'),
      'settings', COALESCE((
        SELECT admin_profile_permissions_table.access_level::text
        FROM public.admin_profile_permissions AS admin_profile_permissions_table
        WHERE admin_profile_permissions_table.profile_id = admin_profiles_table.id
          AND admin_profile_permissions_table.admin_tab = 'settings'::public.admin_panel_tab
      ), 'NONE')
    ) AS permissions,
    admin_profiles_table.created_at,
    admin_profiles_table.updated_at
  FROM public.admin_profiles AS admin_profiles_table
  ORDER BY admin_profiles_table.name ASC;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'championships'
      AND policyname = 'Admin can update championships'
  ) THEN
    ALTER POLICY "Admin can update championships"
      ON public.championships
      USING (
        public.has_admin_tab_access('matches'::public.admin_panel_tab, true)
        OR public.has_admin_tab_access('championship_status'::public.admin_panel_tab, true)
      )
      WITH CHECK (
        public.has_admin_tab_access('matches'::public.admin_panel_tab, true)
        OR public.has_admin_tab_access('championship_status'::public.admin_panel_tab, true)
      );
  END IF;
END
$$;

GRANT EXECUTE ON FUNCTION public.can_access_admin_panel() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_admin_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_admin_profiles() TO authenticated;

NOTIFY pgrst, 'reload schema';
