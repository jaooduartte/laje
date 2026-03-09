DO $$
BEGIN
  IF to_regclass('public.admin_user_profiles') IS NULL THEN
    RAISE EXCEPTION 'Tabela public.admin_user_profiles não encontrada.';
  END IF;

  IF to_regclass('public.admin_action_logs') IS NULL THEN
    RAISE EXCEPTION 'Tabela public.admin_action_logs não encontrada.';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.list_admin_users();

CREATE OR REPLACE FUNCTION public.list_admin_users()
RETURNS TABLE (
  user_id UUID,
  name TEXT,
  email TEXT,
  login_identifier TEXT,
  password_status public.admin_user_password_status,
  role public.app_role,
  profile_id UUID,
  profile_name TEXT,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_admin_tab_access('users'::public.admin_panel_tab, false) THEN
    RAISE EXCEPTION 'Sem permissão para listar usuários administrativos.';
  END IF;

  RETURN QUERY
  SELECT
    users_table.id::UUID AS user_id,
    admin_user_profiles_table.name::TEXT AS name,
    users_table.email::TEXT AS email,
    admin_user_profiles_table.login_identifier::TEXT AS login_identifier,
    admin_user_profiles_table.password_status::public.admin_user_password_status AS password_status,
    admin_profiles_table.system_role::public.app_role AS role,
    admin_user_profiles_table.profile_id::UUID AS profile_id,
    admin_profiles_table.name::TEXT AS profile_name,
    users_table.created_at::TIMESTAMPTZ AS created_at,
    CASE
      WHEN users_table.last_sign_in_at IS NULL THEN admin_user_last_activity_table.last_activity_at
      WHEN admin_user_last_activity_table.last_activity_at IS NULL THEN users_table.last_sign_in_at::TIMESTAMPTZ
      ELSE GREATEST(users_table.last_sign_in_at::TIMESTAMPTZ, admin_user_last_activity_table.last_activity_at)
    END::TIMESTAMPTZ AS last_sign_in_at
  FROM public.admin_user_profiles AS admin_user_profiles_table
  JOIN auth.users AS users_table
    ON users_table.id = admin_user_profiles_table.user_id
  JOIN public.admin_profiles AS admin_profiles_table
    ON admin_profiles_table.id = admin_user_profiles_table.profile_id
  LEFT JOIN LATERAL (
    SELECT
      MAX(admin_action_logs_table.created_at)::TIMESTAMPTZ AS last_activity_at
    FROM public.admin_action_logs AS admin_action_logs_table
    WHERE admin_action_logs_table.actor_user_id = users_table.id
  ) AS admin_user_last_activity_table ON true
  ORDER BY admin_user_profiles_table.name ASC, admin_user_profiles_table.login_identifier ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_admin_users() TO authenticated;
