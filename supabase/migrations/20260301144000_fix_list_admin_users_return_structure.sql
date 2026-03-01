DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user_roles'
  ) THEN
    RAISE EXCEPTION 'Tabela public.user_roles não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'auth'
      AND table_name = 'users'
  ) THEN
    RAISE EXCEPTION 'Tabela auth.users não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'is_admin'
      AND pg_function_is_visible(oid)
  ) THEN
    RAISE EXCEPTION 'Função public.is_admin não encontrada.';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.list_admin_users()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  role public.app_role,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem listar usuários administrativos.';
  END IF;

  RETURN QUERY
  SELECT
    users_table.id::UUID AS user_id,
    users_table.email::TEXT AS email,
    user_role_by_priority.role::public.app_role AS role,
    users_table.created_at::TIMESTAMPTZ AS created_at,
    users_table.last_sign_in_at::TIMESTAMPTZ AS last_sign_in_at
  FROM auth.users AS users_table
  JOIN LATERAL (
    SELECT user_roles_table.role
    FROM public.user_roles AS user_roles_table
    WHERE user_roles_table.user_id = users_table.id
    ORDER BY
      CASE user_roles_table.role::text
        WHEN 'admin' THEN 0
        WHEN 'eventos' THEN 1
        WHEN 'mesa' THEN 2
        ELSE 3
      END
    LIMIT 1
  ) AS user_role_by_priority ON true
  ORDER BY users_table.email ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_admin_users() TO authenticated;

NOTIFY pgrst, 'reload schema';
