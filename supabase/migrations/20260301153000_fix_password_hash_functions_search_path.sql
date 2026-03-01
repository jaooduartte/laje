DO $$
DECLARE
  has_extensions_schema BOOLEAN;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'create_admin_user_with_access'
      AND pg_function_is_visible(oid)
  ) THEN
    RAISE EXCEPTION 'Função public.create_admin_user_with_access não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'admin_update_user_password'
      AND pg_function_is_visible(oid)
  ) THEN
    RAISE EXCEPTION 'Função public.admin_update_user_password não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'gen_salt'
  ) THEN
    RAISE EXCEPTION 'Função gen_salt não encontrada. Verifique a extensão pgcrypto.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_namespace
    WHERE nspname = 'extensions'
  )
  INTO has_extensions_schema;

  IF has_extensions_schema THEN
    ALTER FUNCTION public.create_admin_user_with_access(TEXT, TEXT, public.app_role, UUID)
      SET search_path = public, extensions;

    ALTER FUNCTION public.admin_update_user_password(UUID, TEXT)
      SET search_path = public, extensions;
  ELSE
    ALTER FUNCTION public.create_admin_user_with_access(TEXT, TEXT, public.app_role, UUID)
      SET search_path = public;

    ALTER FUNCTION public.admin_update_user_password(UUID, TEXT)
      SET search_path = public;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
