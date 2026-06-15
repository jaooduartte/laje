DO $migration_add_admin_user_theme_preference_prerequisites$
BEGIN
  IF to_regclass('public.admin_user_profiles') IS NULL THEN
    RAISE EXCEPTION 'Tabela public.admin_user_profiles não encontrada.';
  END IF;
END;
$migration_add_admin_user_theme_preference_prerequisites$;

DO $migration_add_admin_user_theme_preference_enum$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'theme_mode_preference'
  ) THEN
    CREATE TYPE public.theme_mode_preference AS ENUM ('auto', 'light', 'dark');
  END IF;
END;
$migration_add_admin_user_theme_preference_enum$;

ALTER TABLE public.admin_user_profiles
ADD COLUMN IF NOT EXISTS theme_mode_preference public.theme_mode_preference
NOT NULL
DEFAULT 'auto'::public.theme_mode_preference;

COMMENT ON COLUMN public.admin_user_profiles.theme_mode_preference IS
  'Preferência manual de tema do usuário administrativo.';

CREATE OR REPLACE FUNCTION public.get_current_user_theme_mode_preference()
RETURNS public.theme_mode_preference
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_theme_mode_preference public.theme_mode_preference;
BEGIN
  SELECT admin_user_profiles_table.theme_mode_preference
  INTO current_theme_mode_preference
  FROM public.admin_user_profiles AS admin_user_profiles_table
  WHERE admin_user_profiles_table.user_id = auth.uid()
  LIMIT 1;

  RETURN COALESCE(current_theme_mode_preference, 'auto'::public.theme_mode_preference);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_current_user_theme_mode_preference(
  _theme_mode_preference TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_theme_mode_preference public.theme_mode_preference;
  current_theme_mode_preference public.theme_mode_preference;
  current_user_name TEXT;
  current_user_login_identifier TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  IF NOT public.has_admin_tab_access('account'::public.admin_panel_tab, true)
    AND NOT public.has_admin_tab_access('users'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Sem permissão para alterar o tema da própria conta administrativa.';
  END IF;

  IF _theme_mode_preference IS NULL THEN
    RAISE EXCEPTION 'Tema inválido.';
  END IF;

  normalized_theme_mode_preference := CASE lower(trim(_theme_mode_preference))
    WHEN 'auto' THEN 'auto'::public.theme_mode_preference
    WHEN 'light' THEN 'light'::public.theme_mode_preference
    WHEN 'dark' THEN 'dark'::public.theme_mode_preference
    ELSE NULL
  END;

  IF normalized_theme_mode_preference IS NULL THEN
    RAISE EXCEPTION 'Tema inválido.';
  END IF;

  SELECT
    admin_user_profiles_table.theme_mode_preference,
    admin_user_profiles_table.name,
    admin_user_profiles_table.login_identifier
  INTO
    current_theme_mode_preference,
    current_user_name,
    current_user_login_identifier
  FROM public.admin_user_profiles AS admin_user_profiles_table
  WHERE admin_user_profiles_table.user_id = auth.uid()
  LIMIT 1;

  IF current_user_login_identifier IS NULL THEN
    RAISE EXCEPTION 'Usuário administrativo não encontrado.';
  END IF;

  IF current_theme_mode_preference = normalized_theme_mode_preference THEN
    RETURN;
  END IF;

  UPDATE public.admin_user_profiles
  SET
    theme_mode_preference = normalized_theme_mode_preference,
    updated_at = now()
  WHERE user_id = auth.uid();

  PERFORM public.write_admin_action_log(
    'UPDATE'::public.admin_action_type,
    'public.admin_user_profiles',
    auth.uid()::text,
    format('Atualizou preferência de tema da conta administrativa: %s', current_user_name),
    jsonb_build_object(
      'theme_mode_preference', current_theme_mode_preference
    ),
    jsonb_build_object(
      'theme_mode_preference', normalized_theme_mode_preference
    ),
    jsonb_build_object(
      'target_user_id', auth.uid()::text,
      'target_user_name', current_user_name,
      'target_user_login_identifier', current_user_login_identifier,
      'previous_theme_mode_preference', current_theme_mode_preference,
      'new_theme_mode_preference', normalized_theme_mode_preference
    )
  );
END;
$$;

DROP FUNCTION IF EXISTS public.get_current_admin_account();

CREATE OR REPLACE FUNCTION public.get_current_admin_account()
RETURNS TABLE (
  user_id UUID,
  name TEXT,
  email TEXT,
  login_identifier TEXT,
  password_status public.admin_user_password_status,
  profile_id UUID,
  profile_name TEXT,
  theme_mode_preference public.theme_mode_preference
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
    admin_profiles_table.name::TEXT,
    admin_user_profiles_table.theme_mode_preference
  FROM public.admin_user_profiles AS admin_user_profiles_table
  JOIN auth.users AS users_table
    ON users_table.id = admin_user_profiles_table.user_id
  JOIN public.admin_profiles AS admin_profiles_table
    ON admin_profiles_table.id = admin_user_profiles_table.profile_id
  WHERE admin_user_profiles_table.user_id = auth.uid()
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_user_theme_mode_preference() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_current_user_theme_mode_preference(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_admin_account() TO authenticated;

NOTIFY pgrst, 'reload schema';
