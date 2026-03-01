DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'admin_profiles'
  ) THEN
    RAISE EXCEPTION 'Tabela public.admin_profiles não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'admin_profile_permissions'
  ) THEN
    RAISE EXCEPTION 'Tabela public.admin_profile_permissions não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'admin_profiles'
      AND column_name = 'system_role'
  ) THEN
    RAISE EXCEPTION 'Coluna public.admin_profiles.system_role não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'has_admin_tab_access'
      AND pg_function_is_visible(oid)
  ) THEN
    RAISE EXCEPTION 'Função public.has_admin_tab_access não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'write_admin_action_log'
      AND pg_function_is_visible(oid)
  ) THEN
    RAISE EXCEPTION 'Função public.write_admin_action_log não encontrada.';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.upsert_admin_profile(
  _profile_id UUID DEFAULT NULL,
  _profile_name TEXT DEFAULT NULL,
  _permissions JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_profile_id UUID;
  normalized_profile_name TEXT;
  target_profile_is_system BOOLEAN;
  target_profile_system_role public.app_role;
  admin_tab_value public.admin_panel_tab;
  permission_text TEXT;
  permission_level public.admin_panel_permission_level;
  operation_label TEXT;
BEGIN
  IF NOT public.has_admin_tab_access('users'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Sem permissão para editar perfis administrativos.';
  END IF;

  normalized_profile_name := trim(COALESCE(_profile_name, ''));

  IF char_length(normalized_profile_name) < 3 THEN
    RAISE EXCEPTION 'Informe um nome de perfil com ao menos 3 caracteres.';
  END IF;

  IF _profile_id IS NULL THEN
    INSERT INTO public.admin_profiles (name, is_system)
    VALUES (normalized_profile_name, false)
    RETURNING id INTO resolved_profile_id;

    operation_label := 'Criou perfil administrativo';
  ELSE
    SELECT
      admin_profiles_table.is_system,
      admin_profiles_table.system_role
    INTO
      target_profile_is_system,
      target_profile_system_role
    FROM public.admin_profiles AS admin_profiles_table
    WHERE admin_profiles_table.id = _profile_id
    LIMIT 1;

    IF target_profile_is_system IS NULL THEN
      RAISE EXCEPTION 'Perfil administrativo não encontrado.';
    END IF;

    IF target_profile_is_system
      AND target_profile_system_role = 'admin'::public.app_role THEN
      RAISE EXCEPTION 'Perfil Admin não pode ser alterado.';
    END IF;

    UPDATE public.admin_profiles
    SET
      name = normalized_profile_name,
      updated_at = now()
    WHERE id = _profile_id;

    resolved_profile_id := _profile_id;
    operation_label := 'Atualizou perfil administrativo';
  END IF;

  FOR admin_tab_value IN
    SELECT unnest(enum_range(NULL::public.admin_panel_tab))
  LOOP
    permission_text := upper(COALESCE(_permissions ->> admin_tab_value::text, 'NONE'));

    IF permission_text NOT IN ('NONE', 'VIEW', 'EDIT') THEN
      RAISE EXCEPTION 'Permissão inválida para a aba %: %', admin_tab_value::text, permission_text;
    END IF;

    permission_level := permission_text::public.admin_panel_permission_level;

    INSERT INTO public.admin_profile_permissions (
      profile_id,
      admin_tab,
      access_level
    ) VALUES (
      resolved_profile_id,
      admin_tab_value,
      permission_level
    )
    ON CONFLICT (profile_id, admin_tab) DO UPDATE
    SET
      access_level = EXCLUDED.access_level,
      updated_at = now();
  END LOOP;

  PERFORM public.write_admin_action_log(
    'UPDATE'::public.admin_action_type,
    'public.admin_profiles',
    resolved_profile_id::text,
    format('%s: %s', operation_label, normalized_profile_name),
    NULL,
    jsonb_build_object(
      'profile_name', normalized_profile_name,
      'permissions', COALESCE(_permissions, '{}'::jsonb)
    ),
    jsonb_build_object('profile_id', resolved_profile_id::text)
  );

  RETURN resolved_profile_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe um perfil com este nome.';
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_admin_profile(UUID, TEXT, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
