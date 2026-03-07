DO $migration_fix_get_current_admin_account_prerequisites$
BEGIN
  IF to_regclass('public.admin_user_profiles') IS NULL THEN
    RAISE EXCEPTION 'Tabela public.admin_user_profiles não encontrada.';
  END IF;

  IF to_regclass('public.admin_profiles') IS NULL THEN
    RAISE EXCEPTION 'Tabela public.admin_profiles não encontrada.';
  END IF;

  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Tabela auth.users não encontrada.';
  END IF;
END;
$migration_fix_get_current_admin_account_prerequisites$;

CREATE OR REPLACE FUNCTION public.get_current_admin_account()
RETURNS TABLE (
  user_id UUID,
  name TEXT,
  email TEXT,
  login_identifier TEXT,
  password_status public.admin_user_password_status,
  profile_id UUID,
  profile_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_admin_tab_access('account'::public.admin_panel_tab, false)
    AND NOT public.has_admin_tab_access('users'::public.admin_panel_tab, false) THEN
    RAISE EXCEPTION 'Sem permissão para visualizar a própria conta administrativa.';
  END IF;

  RETURN QUERY
  SELECT
    admin_user_profiles_table.user_id::UUID,
    admin_user_profiles_table.name::TEXT,
    users_table.email::TEXT,
    admin_user_profiles_table.login_identifier::TEXT,
    admin_user_profiles_table.password_status::public.admin_user_password_status,
    admin_user_profiles_table.profile_id::UUID,
    admin_profiles_table.name::TEXT
  FROM public.admin_user_profiles AS admin_user_profiles_table
  JOIN auth.users AS users_table
    ON users_table.id = admin_user_profiles_table.user_id
  JOIN public.admin_profiles AS admin_profiles_table
    ON admin_profiles_table.id = admin_user_profiles_table.profile_id
  WHERE admin_user_profiles_table.user_id = auth.uid()
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_admin_account() TO authenticated;

NOTIFY pgrst, 'reload schema';
