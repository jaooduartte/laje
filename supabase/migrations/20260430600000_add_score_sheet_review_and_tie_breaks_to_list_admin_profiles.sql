-- Recria list_admin_profiles incluindo score_sheet_review e tie_breaks no JSON de permissões.
-- A versão anterior usava jsonb_build_object com tabs hardcodadas e não incluía os novos tabs.

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
        SELECT p.access_level::text FROM public.admin_profile_permissions p
        WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'matches'::public.admin_panel_tab
      ), 'NONE'),
      'score_sheet_review', COALESCE((
        SELECT p.access_level::text FROM public.admin_profile_permissions p
        WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'score_sheet_review'::public.admin_panel_tab
      ), 'NONE'),
      'tie_breaks', COALESCE((
        SELECT p.access_level::text FROM public.admin_profile_permissions p
        WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'tie_breaks'::public.admin_panel_tab
      ), 'NONE'),
      'control', COALESCE((
        SELECT p.access_level::text FROM public.admin_profile_permissions p
        WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'control'::public.admin_panel_tab
      ), 'NONE'),
      'teams', COALESCE((
        SELECT p.access_level::text FROM public.admin_profile_permissions p
        WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'teams'::public.admin_panel_tab
      ), 'NONE'),
      'sports', COALESCE((
        SELECT p.access_level::text FROM public.admin_profile_permissions p
        WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'sports'::public.admin_panel_tab
      ), 'NONE'),
      'events', COALESCE((
        SELECT p.access_level::text FROM public.admin_profile_permissions p
        WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'events'::public.admin_panel_tab
      ), 'NONE'),
      'logs', COALESCE((
        SELECT p.access_level::text FROM public.admin_profile_permissions p
        WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'logs'::public.admin_panel_tab
      ), 'NONE'),
      'users', COALESCE((
        SELECT p.access_level::text FROM public.admin_profile_permissions p
        WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'users'::public.admin_panel_tab
      ), 'NONE'),
      'account', COALESCE((
        SELECT p.access_level::text FROM public.admin_profile_permissions p
        WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'account'::public.admin_panel_tab
      ), 'NONE'),
      'championship_status', COALESCE((
        SELECT p.access_level::text FROM public.admin_profile_permissions p
        WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'championship_status'::public.admin_panel_tab
      ), 'NONE'),
      'settings', COALESCE((
        SELECT p.access_level::text FROM public.admin_profile_permissions p
        WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'settings'::public.admin_panel_tab
      ), 'NONE')
    ) AS permissions,
    admin_profiles_table.created_at,
    admin_profiles_table.updated_at
  FROM public.admin_profiles AS admin_profiles_table
  ORDER BY admin_profiles_table.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_admin_profiles() TO authenticated;

NOTIFY pgrst, 'reload schema';
