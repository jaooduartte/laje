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
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'admin_user_profiles'
  ) THEN
    RAISE EXCEPTION 'Tabela public.admin_user_profiles não encontrada.';
  END IF;

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
    FROM pg_proc
    WHERE proname = 'has_admin_tab_access'
      AND pg_function_is_visible(oid)
  ) THEN
    RAISE EXCEPTION 'Função public.has_admin_tab_access não encontrada.';
  END IF;
END
$$;

ALTER TABLE public.admin_profiles
  ADD COLUMN IF NOT EXISTS system_role public.app_role;

CREATE UNIQUE INDEX IF NOT EXISTS admin_profiles_system_role_unique_idx
  ON public.admin_profiles (system_role)
  WHERE system_role IS NOT NULL;

DO $$
DECLARE
  admin_profile_id UUID;
  eventos_profile_id UUID;
  mesa_profile_id UUID;
  target_user_record RECORD;
BEGIN
  INSERT INTO public.admin_profiles (
    name,
    is_system,
    system_role
  ) VALUES (
    'Admin',
    true,
    'admin'::public.app_role
  )
  ON CONFLICT (lower(name)) DO UPDATE
  SET
    is_system = true,
    system_role = 'admin'::public.app_role,
    updated_at = now()
  RETURNING id INTO admin_profile_id;

  INSERT INTO public.admin_profiles (
    name,
    is_system,
    system_role
  ) VALUES (
    'Eventos',
    true,
    'eventos'::public.app_role
  )
  ON CONFLICT (lower(name)) DO UPDATE
  SET
    is_system = true,
    system_role = 'eventos'::public.app_role,
    updated_at = now()
  RETURNING id INTO eventos_profile_id;

  INSERT INTO public.admin_profiles (
    name,
    is_system,
    system_role
  ) VALUES (
    'Mesa',
    true,
    'mesa'::public.app_role
  )
  ON CONFLICT (lower(name)) DO UPDATE
  SET
    is_system = true,
    system_role = 'mesa'::public.app_role,
    updated_at = now()
  RETURNING id INTO mesa_profile_id;

  -- Admin
  INSERT INTO public.admin_profile_permissions (profile_id, admin_tab, access_level)
  SELECT admin_profile_id, admin_panel_tab_value, 'EDIT'::public.admin_panel_permission_level
  FROM unnest(enum_range(NULL::public.admin_panel_tab)) AS admin_panel_tab_value
  ON CONFLICT (profile_id, admin_tab) DO UPDATE
  SET
    access_level = EXCLUDED.access_level,
    updated_at = now();

  -- Eventos
  INSERT INTO public.admin_profile_permissions (profile_id, admin_tab, access_level)
  VALUES
    (eventos_profile_id, 'matches'::public.admin_panel_tab, 'NONE'::public.admin_panel_permission_level),
    (eventos_profile_id, 'control'::public.admin_panel_tab, 'EDIT'::public.admin_panel_permission_level),
    (eventos_profile_id, 'teams'::public.admin_panel_tab, 'VIEW'::public.admin_panel_permission_level),
    (eventos_profile_id, 'sports'::public.admin_panel_tab, 'NONE'::public.admin_panel_permission_level),
    (eventos_profile_id, 'events'::public.admin_panel_tab, 'EDIT'::public.admin_panel_permission_level),
    (eventos_profile_id, 'logs'::public.admin_panel_tab, 'NONE'::public.admin_panel_permission_level),
    (eventos_profile_id, 'users'::public.admin_panel_tab, 'NONE'::public.admin_panel_permission_level)
  ON CONFLICT (profile_id, admin_tab) DO UPDATE
  SET
    access_level = EXCLUDED.access_level,
    updated_at = now();

  -- Mesa
  INSERT INTO public.admin_profile_permissions (profile_id, admin_tab, access_level)
  VALUES
    (mesa_profile_id, 'matches'::public.admin_panel_tab, 'NONE'::public.admin_panel_permission_level),
    (mesa_profile_id, 'control'::public.admin_panel_tab, 'EDIT'::public.admin_panel_permission_level),
    (mesa_profile_id, 'teams'::public.admin_panel_tab, 'NONE'::public.admin_panel_permission_level),
    (mesa_profile_id, 'sports'::public.admin_panel_tab, 'NONE'::public.admin_panel_permission_level),
    (mesa_profile_id, 'events'::public.admin_panel_tab, 'NONE'::public.admin_panel_permission_level),
    (mesa_profile_id, 'logs'::public.admin_panel_tab, 'NONE'::public.admin_panel_permission_level),
    (mesa_profile_id, 'users'::public.admin_panel_tab, 'NONE'::public.admin_panel_permission_level)
  ON CONFLICT (profile_id, admin_tab) DO UPDATE
  SET
    access_level = EXCLUDED.access_level,
    updated_at = now();

  -- Migra usuários com role legado para perfil do sistema (somente se ainda não tiver perfil).
  FOR target_user_record IN
    SELECT
      user_roles_table.user_id,
      user_roles_table.role
    FROM (
      SELECT
        user_roles_table_inner.user_id,
        user_roles_table_inner.role,
        ROW_NUMBER() OVER (
          PARTITION BY user_roles_table_inner.user_id
          ORDER BY
            CASE user_roles_table_inner.role::text
              WHEN 'admin' THEN 0
              WHEN 'eventos' THEN 1
              WHEN 'mesa' THEN 2
              ELSE 3
            END
        ) AS role_order
      FROM public.user_roles AS user_roles_table_inner
    ) AS user_roles_table
    WHERE user_roles_table.role_order = 1
  LOOP
    INSERT INTO public.admin_user_profiles (
      user_id,
      profile_id
    ) VALUES (
      target_user_record.user_id,
      CASE target_user_record.role::text
        WHEN 'admin' THEN admin_profile_id
        WHEN 'eventos' THEN eventos_profile_id
        WHEN 'mesa' THEN mesa_profile_id
        ELSE NULL
      END
    )
    ON CONFLICT (user_id) DO NOTHING;
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.resolve_system_role_by_profile_id(_profile_id UUID)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT admin_profiles_table.system_role
  FROM public.admin_profiles AS admin_profiles_table
  WHERE admin_profiles_table.id = _profile_id
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.resolve_current_user_tab_permission_level(
  _tab public.admin_panel_tab
)
RETURNS public.admin_panel_permission_level
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
  profile_permission_level public.admin_panel_permission_level;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RETURN 'NONE'::public.admin_panel_permission_level;
  END IF;

  SELECT admin_profile_permissions_table.access_level
  INTO profile_permission_level
  FROM public.admin_user_profiles AS admin_user_profiles_table
  JOIN public.admin_profile_permissions AS admin_profile_permissions_table
    ON admin_profile_permissions_table.profile_id = admin_user_profiles_table.profile_id
   AND admin_profile_permissions_table.admin_tab = _tab
  WHERE admin_user_profiles_table.user_id = current_user_id
  LIMIT 1;

  RETURN COALESCE(profile_permission_level, 'NONE'::public.admin_panel_permission_level);
END;
$$;

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
  users_permission public.admin_panel_permission_level
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
    public.resolve_current_user_tab_permission_level('users'::public.admin_panel_tab);
END;
$$;

DROP FUNCTION IF EXISTS public.list_admin_users();

CREATE OR REPLACE FUNCTION public.list_admin_users()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
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
    users_table.email::TEXT AS email,
    admin_profiles_table.system_role::public.app_role AS role,
    admin_user_profiles_table.profile_id::UUID AS profile_id,
    admin_profiles_table.name::TEXT AS profile_name,
    users_table.created_at::TIMESTAMPTZ AS created_at,
    users_table.last_sign_in_at::TIMESTAMPTZ AS last_sign_in_at
  FROM auth.users AS users_table
  JOIN public.admin_user_profiles AS admin_user_profiles_table
    ON admin_user_profiles_table.user_id = users_table.id
  JOIN public.admin_profiles AS admin_profiles_table
    ON admin_profiles_table.id = admin_user_profiles_table.profile_id
  ORDER BY users_table.email ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_access(
  _target_user_id UUID,
  _role public.app_role DEFAULT NULL,
  _profile_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_email TEXT;
  target_profile_name TEXT;
  target_profile_role public.app_role;
BEGIN
  IF NOT public.has_admin_tab_access('users'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Sem permissão para editar usuários administrativos.';
  END IF;

  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário inválido.';
  END IF;

  IF _profile_id IS NULL THEN
    RAISE EXCEPTION 'Selecione um perfil administrativo.';
  END IF;

  SELECT users_table.email
  INTO target_user_email
  FROM auth.users AS users_table
  WHERE users_table.id = _target_user_id
  LIMIT 1;

  IF target_user_email IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado.';
  END IF;

  SELECT
    admin_profiles_table.name,
    admin_profiles_table.system_role
  INTO
    target_profile_name,
    target_profile_role
  FROM public.admin_profiles AS admin_profiles_table
  WHERE admin_profiles_table.id = _profile_id
  LIMIT 1;

  IF target_profile_name IS NULL THEN
    RAISE EXCEPTION 'Perfil administrativo não encontrado.';
  END IF;

  INSERT INTO public.admin_user_profiles (
    user_id,
    profile_id
  ) VALUES (
    _target_user_id,
    _profile_id
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    profile_id = EXCLUDED.profile_id,
    updated_at = now();

  DELETE FROM public.user_roles
  WHERE user_id = _target_user_id;

  IF target_profile_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_target_user_id, target_profile_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  PERFORM public.write_admin_action_log(
    'UPDATE'::public.admin_action_type,
    'auth.users',
    _target_user_id::text,
    format('Atualizou acesso administrativo de %s', COALESCE(target_user_email, _target_user_id::text)),
    NULL,
    NULL,
    jsonb_build_object(
      'target_user_id', _target_user_id::text,
      'target_user_email', target_user_email,
      'profile_id', _profile_id::text,
      'profile_name', target_profile_name,
      'role', CASE WHEN target_profile_role IS NULL THEN NULL ELSE target_profile_role::text END
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_admin_user_with_access(
  _email TEXT,
  _password TEXT,
  _role public.app_role DEFAULT NULL,
  _profile_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_email TEXT;
  created_user_id UUID;
  target_profile_name TEXT;
  target_profile_role public.app_role;
BEGIN
  IF NOT public.has_admin_tab_access('users'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Sem permissão para criar usuários administrativos.';
  END IF;

  normalized_email := lower(trim(COALESCE(_email, '')));

  IF normalized_email = '' OR position('@' IN normalized_email) = 0 THEN
    RAISE EXCEPTION 'Informe um e-mail válido.';
  END IF;

  IF _password IS NULL OR char_length(trim(_password)) < 8 THEN
    RAISE EXCEPTION 'A senha deve ter ao menos 8 caracteres.';
  END IF;

  IF _profile_id IS NULL THEN
    RAISE EXCEPTION 'Selecione um perfil administrativo para o usuário.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM auth.users AS users_table
    WHERE lower(users_table.email) = normalized_email
  ) THEN
    RAISE EXCEPTION 'Já existe um usuário com este e-mail.';
  END IF;

  SELECT
    admin_profiles_table.name,
    admin_profiles_table.system_role
  INTO
    target_profile_name,
    target_profile_role
  FROM public.admin_profiles AS admin_profiles_table
  WHERE admin_profiles_table.id = _profile_id
  LIMIT 1;

  IF target_profile_name IS NULL THEN
    RAISE EXCEPTION 'Perfil administrativo não encontrado.';
  END IF;

  created_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    created_user_id,
    'authenticated',
    'authenticated',
    normalized_email,
    crypt(_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    created_user_id,
    jsonb_build_object('sub', created_user_id::text, 'email', normalized_email),
    'email',
    normalized_email,
    now(),
    now(),
    now()
  );

  INSERT INTO public.admin_user_profiles (
    user_id,
    profile_id
  ) VALUES (
    created_user_id,
    _profile_id
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    profile_id = EXCLUDED.profile_id,
    updated_at = now();

  IF target_profile_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (created_user_id, target_profile_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  PERFORM public.write_admin_action_log(
    'INSERT'::public.admin_action_type,
    'auth.users',
    created_user_id::text,
    format('Criou usuário administrativo %s', normalized_email),
    NULL,
    NULL,
    jsonb_build_object(
      'target_user_id', created_user_id::text,
      'target_user_email', normalized_email,
      'profile_id', _profile_id::text,
      'profile_name', target_profile_name,
      'role', CASE WHEN target_profile_role IS NULL THEN NULL ELSE target_profile_role::text END
    )
  );

  RETURN created_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user_password(
  _target_user_id UUID,
  _new_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_email TEXT;
  target_user_profile_name TEXT;
BEGIN
  IF NOT public.has_admin_tab_access('users'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Sem permissão para alterar senha de usuários administrativos.';
  END IF;

  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário inválido.';
  END IF;

  IF _new_password IS NULL OR char_length(trim(_new_password)) < 8 THEN
    RAISE EXCEPTION 'A senha deve ter ao menos 8 caracteres.';
  END IF;

  SELECT users_table.email
  INTO target_user_email
  FROM auth.users AS users_table
  WHERE users_table.id = _target_user_id
  LIMIT 1;

  IF target_user_email IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado.';
  END IF;

  SELECT admin_profiles_table.name
  INTO target_user_profile_name
  FROM public.admin_user_profiles AS admin_user_profiles_table
  JOIN public.admin_profiles AS admin_profiles_table
    ON admin_profiles_table.id = admin_user_profiles_table.profile_id
  WHERE admin_user_profiles_table.user_id = _target_user_id
  LIMIT 1;

  IF target_user_profile_name IS NULL THEN
    RAISE EXCEPTION 'Usuário informado não possui perfil administrativo.';
  END IF;

  UPDATE auth.users
  SET
    encrypted_password = crypt(_new_password, gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
  WHERE id = _target_user_id;

  PERFORM public.write_admin_action_log(
    'PASSWORD_CHANGED'::public.admin_action_type,
    'auth.users',
    _target_user_id::text,
    format('Senha atualizada para o usuário administrativo %s', COALESCE(target_user_email, _target_user_id::text)),
    NULL,
    NULL,
    jsonb_build_object(
      'target_user_id', _target_user_id::text,
      'target_user_email', target_user_email,
      'target_user_profile_name', target_user_profile_name
    )
  );
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'championships'
      AND policyname = 'Admin can insert championships'
  ) THEN
    ALTER POLICY "Admin can insert championships"
      ON public.championships
      WITH CHECK (public.has_admin_tab_access('matches'::public.admin_panel_tab, true));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'championships'
      AND policyname = 'Admin can update championships'
  ) THEN
    ALTER POLICY "Admin can update championships"
      ON public.championships
      USING (public.has_admin_tab_access('matches'::public.admin_panel_tab, true))
      WITH CHECK (public.has_admin_tab_access('matches'::public.admin_panel_tab, true));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'championships'
      AND policyname = 'Admin can delete championships'
  ) THEN
    ALTER POLICY "Admin can delete championships"
      ON public.championships
      USING (public.has_admin_tab_access('matches'::public.admin_panel_tab, true));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sports'
      AND policyname = 'Admin can insert sports'
  ) THEN
    ALTER POLICY "Admin can insert sports"
      ON public.sports
      WITH CHECK (public.has_admin_tab_access('sports'::public.admin_panel_tab, true));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sports'
      AND policyname = 'Admin can update sports'
  ) THEN
    ALTER POLICY "Admin can update sports"
      ON public.sports
      USING (public.has_admin_tab_access('sports'::public.admin_panel_tab, true))
      WITH CHECK (public.has_admin_tab_access('sports'::public.admin_panel_tab, true));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sports'
      AND policyname = 'Admin can delete sports'
  ) THEN
    ALTER POLICY "Admin can delete sports"
      ON public.sports
      USING (public.has_admin_tab_access('sports'::public.admin_panel_tab, true));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'championship_sports'
      AND policyname = 'Admin can insert championship sports'
  ) THEN
    ALTER POLICY "Admin can insert championship sports"
      ON public.championship_sports
      WITH CHECK (public.has_admin_tab_access('sports'::public.admin_panel_tab, true));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'championship_sports'
      AND policyname = 'Admin can update championship sports'
  ) THEN
    ALTER POLICY "Admin can update championship sports"
      ON public.championship_sports
      USING (public.has_admin_tab_access('sports'::public.admin_panel_tab, true))
      WITH CHECK (public.has_admin_tab_access('sports'::public.admin_panel_tab, true));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'championship_sports'
      AND policyname = 'Admin can delete championship sports'
  ) THEN
    ALTER POLICY "Admin can delete championship sports"
      ON public.championship_sports
      USING (public.has_admin_tab_access('sports'::public.admin_panel_tab, true));
  END IF;
END
$$;

GRANT EXECUTE ON FUNCTION public.resolve_system_role_by_profile_id(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
