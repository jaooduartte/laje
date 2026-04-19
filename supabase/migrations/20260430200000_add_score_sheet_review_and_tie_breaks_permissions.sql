-- Add independent permission tabs for "Conferência de Súmula" (score_sheet_review)
-- and "Sorteio" (tie_breaks). Previously both inherited the MATCHES permission.
-- After this migration each can be configured independently per admin profile.

-- ─── 1. Extend admin_panel_tab enum ──────────────────────────────────────────

ALTER TYPE public.admin_panel_tab ADD VALUE IF NOT EXISTS 'score_sheet_review';
ALTER TYPE public.admin_panel_tab ADD VALUE IF NOT EXISTS 'tie_breaks';

-- ─── 2. Rebuild get_current_user_admin_context to return the two new fields ──
--
-- Must be recreated (not just altered) because the return type changes.
-- Uses a two-step approach to avoid "cannot drop function" errors when other
-- objects depend on it: drop the old signature first, then recreate.

DROP FUNCTION IF EXISTS public.get_current_user_admin_context();

CREATE OR REPLACE FUNCTION public.get_current_user_admin_context()
RETURNS TABLE (
  role                          public.app_role,
  profile_id                    UUID,
  profile_name                  TEXT,
  matches_permission            public.admin_panel_permission_level,
  control_permission            public.admin_panel_permission_level,
  teams_permission              public.admin_panel_permission_level,
  sports_permission             public.admin_panel_permission_level,
  events_permission             public.admin_panel_permission_level,
  logs_permission               public.admin_panel_permission_level,
  users_permission              public.admin_panel_permission_level,
  account_permission            public.admin_panel_permission_level,
  championship_status_permission public.admin_panel_permission_level,
  settings_permission           public.admin_panel_permission_level,
  score_sheet_review_permission public.admin_panel_permission_level,
  tie_breaks_permission         public.admin_panel_permission_level
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id      UUID;
  current_profile_id   UUID;
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
    public.resolve_current_user_tab_permission_level('tie_breaks'::public.admin_panel_tab);
END;
$$;

NOTIFY pgrst, 'reload schema';
