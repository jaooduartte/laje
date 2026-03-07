DO $migration_admin_users_login$
BEGIN
  IF to_regclass('public.admin_user_profiles') IS NULL THEN
    RETURN;
  END IF;

  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Tabela auth.users não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type AS types_table
    JOIN pg_namespace AS namespaces_table
      ON namespaces_table.oid = types_table.typnamespace
    WHERE namespaces_table.nspname = 'public'
      AND types_table.typname = 'admin_user_password_status'
  ) THEN
    CREATE TYPE public.admin_user_password_status AS ENUM ('PENDING', 'ACTIVE');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS columns_table
    WHERE columns_table.table_schema = 'public'
      AND columns_table.table_name = 'admin_user_profiles'
      AND columns_table.column_name = 'login_identifier'
  ) THEN
    ALTER TABLE public.admin_user_profiles
      ADD COLUMN login_identifier TEXT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS columns_table
    WHERE columns_table.table_schema = 'public'
      AND columns_table.table_name = 'admin_user_profiles'
      AND columns_table.column_name = 'password_status'
  ) THEN
    ALTER TABLE public.admin_user_profiles
      ADD COLUMN password_status public.admin_user_password_status NULL;
  END IF;
END;
$migration_admin_users_login$;

COMMENT ON COLUMN public.admin_user_profiles.login_identifier IS 'Identificador usado no login administrativo, sem necessidade de e-mail real.';
COMMENT ON COLUMN public.admin_user_profiles.password_status IS 'Status de criação da senha administrativa.';

UPDATE public.admin_user_profiles AS admin_user_profiles_table
SET login_identifier = lower(trim(COALESCE(users_table.email, '')))
FROM auth.users AS users_table
WHERE users_table.id = admin_user_profiles_table.user_id
  AND (
    admin_user_profiles_table.login_identifier IS NULL
    OR trim(admin_user_profiles_table.login_identifier) = ''
  );

UPDATE public.admin_user_profiles AS admin_user_profiles_table
SET password_status = CASE
  WHEN users_table.last_sign_in_at IS NULL THEN 'PENDING'::public.admin_user_password_status
  ELSE 'ACTIVE'::public.admin_user_password_status
END
FROM auth.users AS users_table
WHERE users_table.id = admin_user_profiles_table.user_id
  AND admin_user_profiles_table.password_status IS NULL;

DO $migration_admin_users_login_constraints$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.admin_user_profiles AS admin_user_profiles_table
    WHERE admin_user_profiles_table.login_identifier IS NULL
      OR trim(admin_user_profiles_table.login_identifier) = ''
      OR admin_user_profiles_table.password_status IS NULL
  ) THEN
    RAISE EXCEPTION 'Tabela public.admin_user_profiles possui identificadores de login ou status de senha inválidos.';
  END IF;

  ALTER TABLE public.admin_user_profiles
    ALTER COLUMN login_identifier SET NOT NULL;

  ALTER TABLE public.admin_user_profiles
    ALTER COLUMN password_status SET NOT NULL;

  ALTER TABLE public.admin_user_profiles
    ALTER COLUMN password_status SET DEFAULT 'PENDING'::public.admin_user_password_status;
END;
$migration_admin_users_login_constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS admin_user_profiles_login_identifier_uidx
  ON public.admin_user_profiles (lower(login_identifier));

CREATE OR REPLACE FUNCTION public.normalize_admin_login_identifier(
  _login_identifier TEXT
)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT lower(trim(COALESCE(_login_identifier, '')));
$$;

CREATE OR REPLACE FUNCTION public.resolve_admin_user_auth_email(
  _login_identifier TEXT
)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE
    WHEN position('@' IN normalized_login_identifier) > 0 THEN normalized_login_identifier
    ELSE normalized_login_identifier || '@ligadasatleticas.com'
  END
  FROM (
    SELECT public.normalize_admin_login_identifier(_login_identifier) AS normalized_login_identifier
  ) AS normalized_value;
$$;

UPDATE auth.users AS users_table
SET
  email = public.resolve_admin_user_auth_email(admin_user_profiles_table.login_identifier),
  raw_user_meta_data = COALESCE(users_table.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
    'login_identifier',
    admin_user_profiles_table.login_identifier
  ),
  updated_at = now()
FROM public.admin_user_profiles AS admin_user_profiles_table
WHERE admin_user_profiles_table.user_id = users_table.id
  AND position('@' IN admin_user_profiles_table.login_identifier) = 0
  AND lower(users_table.email) <> lower(public.resolve_admin_user_auth_email(admin_user_profiles_table.login_identifier));

UPDATE auth.identities AS identities_table
SET
  provider_id = public.resolve_admin_user_auth_email(admin_user_profiles_table.login_identifier),
  identity_data = COALESCE(identities_table.identity_data, '{}'::jsonb) || jsonb_build_object(
    'sub',
    admin_user_profiles_table.user_id::text,
    'email',
    public.resolve_admin_user_auth_email(admin_user_profiles_table.login_identifier),
    'login_identifier',
    admin_user_profiles_table.login_identifier
  ),
  updated_at = now()
FROM public.admin_user_profiles AS admin_user_profiles_table
WHERE admin_user_profiles_table.user_id = identities_table.user_id
  AND identities_table.provider = 'email'
  AND position('@' IN admin_user_profiles_table.login_identifier) = 0
  AND lower(identities_table.provider_id) <> lower(public.resolve_admin_user_auth_email(admin_user_profiles_table.login_identifier));

DROP FUNCTION IF EXISTS public.list_admin_users();

CREATE OR REPLACE FUNCTION public.list_admin_users()
RETURNS TABLE (
  user_id UUID,
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
    users_table.email::TEXT AS email,
    admin_user_profiles_table.login_identifier::TEXT AS login_identifier,
    admin_user_profiles_table.password_status::public.admin_user_password_status AS password_status,
    admin_profiles_table.system_role::public.app_role AS role,
    admin_user_profiles_table.profile_id::UUID AS profile_id,
    admin_profiles_table.name::TEXT AS profile_name,
    users_table.created_at::TIMESTAMPTZ AS created_at,
    users_table.last_sign_in_at::TIMESTAMPTZ AS last_sign_in_at
  FROM public.admin_user_profiles AS admin_user_profiles_table
  JOIN auth.users AS users_table
    ON users_table.id = admin_user_profiles_table.user_id
  JOIN public.admin_profiles AS admin_profiles_table
    ON admin_profiles_table.id = admin_user_profiles_table.profile_id
  ORDER BY admin_user_profiles_table.login_identifier ASC;
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
  target_user_last_sign_in_at TIMESTAMPTZ;
  target_login_identifier TEXT;
  target_password_status public.admin_user_password_status;
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

  SELECT
    users_table.email,
    users_table.last_sign_in_at
  INTO
    target_user_email,
    target_user_last_sign_in_at
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

  SELECT
    admin_user_profiles_table.login_identifier,
    admin_user_profiles_table.password_status
  INTO
    target_login_identifier,
    target_password_status
  FROM public.admin_user_profiles AS admin_user_profiles_table
  WHERE admin_user_profiles_table.user_id = _target_user_id
  LIMIT 1;

  INSERT INTO public.admin_user_profiles (
    user_id,
    profile_id,
    login_identifier,
    password_status
  ) VALUES (
    _target_user_id,
    _profile_id,
    COALESCE(
      public.normalize_admin_login_identifier(target_login_identifier),
      public.normalize_admin_login_identifier(target_user_email)
    ),
    COALESCE(
      target_password_status,
      CASE
        WHEN target_user_last_sign_in_at IS NULL THEN 'PENDING'::public.admin_user_password_status
        ELSE 'ACTIVE'::public.admin_user_password_status
      END
    )
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
    format('Atualizou acesso administrativo de %s', COALESCE(target_login_identifier, target_user_email, _target_user_id::text)),
    NULL,
    NULL,
    jsonb_build_object(
      'target_user_id', _target_user_id::text,
      'target_user_email', target_user_email,
      'target_user_login_identifier', COALESCE(target_login_identifier, target_user_email),
      'profile_id', _profile_id::text,
      'profile_name', target_profile_name,
      'role', CASE WHEN target_profile_role IS NULL THEN NULL ELSE target_profile_role::text END
    )
  );
END;
$$;

DROP FUNCTION IF EXISTS public.create_admin_user_with_access(TEXT, TEXT, public.app_role, UUID);

CREATE OR REPLACE FUNCTION public.create_admin_user_with_access(
  _login_identifier TEXT,
  _password TEXT DEFAULT NULL,
  _role public.app_role DEFAULT NULL,
  _profile_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_login_identifier TEXT;
  resolved_auth_email TEXT;
  created_user_id UUID;
  target_profile_name TEXT;
  target_profile_role public.app_role;
  generated_password_placeholder TEXT;
BEGIN
  IF NOT public.has_admin_tab_access('users'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Sem permissão para criar usuários administrativos.';
  END IF;

  normalized_login_identifier := public.normalize_admin_login_identifier(_login_identifier);

  IF normalized_login_identifier = '' THEN
    RAISE EXCEPTION 'Informe um login válido.';
  END IF;

  IF position(' ' IN normalized_login_identifier) > 0 THEN
    RAISE EXCEPTION 'O login não pode conter espaços.';
  END IF;

  IF _profile_id IS NULL THEN
    RAISE EXCEPTION 'Selecione um perfil administrativo para o usuário.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.admin_user_profiles AS admin_user_profiles_table
    WHERE lower(admin_user_profiles_table.login_identifier) = normalized_login_identifier
  ) THEN
    RAISE EXCEPTION 'Já existe um usuário com este login.';
  END IF;

  resolved_auth_email := public.resolve_admin_user_auth_email(normalized_login_identifier);

  IF EXISTS (
    SELECT 1
    FROM auth.users AS users_table
    WHERE lower(users_table.email) = lower(resolved_auth_email)
  ) THEN
    RAISE EXCEPTION 'Já existe um usuário com este login.';
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

  generated_password_placeholder := gen_random_uuid()::text || gen_random_uuid()::text;
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
    resolved_auth_email,
    crypt(generated_password_placeholder, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('login_identifier', normalized_login_identifier),
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
    jsonb_build_object(
      'sub', created_user_id::text,
      'email', resolved_auth_email,
      'login_identifier', normalized_login_identifier
    ),
    'email',
    resolved_auth_email,
    now(),
    now(),
    now()
  );

  INSERT INTO public.admin_user_profiles (
    user_id,
    profile_id,
    login_identifier,
    password_status
  ) VALUES (
    created_user_id,
    _profile_id,
    normalized_login_identifier,
    'PENDING'::public.admin_user_password_status
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    profile_id = EXCLUDED.profile_id,
    login_identifier = EXCLUDED.login_identifier,
    password_status = EXCLUDED.password_status,
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
    format('Criou usuário administrativo %s', normalized_login_identifier),
    NULL,
    NULL,
    jsonb_build_object(
      'target_user_id', created_user_id::text,
      'target_user_email', resolved_auth_email,
      'target_user_login_identifier', normalized_login_identifier,
      'profile_id', _profile_id::text,
      'profile_name', target_profile_name,
      'password_status', 'PENDING',
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
  target_user_login_identifier TEXT;
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

  SELECT
    admin_profiles_table.name,
    admin_user_profiles_table.login_identifier
  INTO
    target_user_profile_name,
    target_user_login_identifier
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
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
      'login_identifier', COALESCE(target_user_login_identifier, target_user_email)
    ),
    updated_at = now()
  WHERE id = _target_user_id;

  UPDATE public.admin_user_profiles
  SET
    password_status = 'ACTIVE'::public.admin_user_password_status,
    updated_at = now()
  WHERE user_id = _target_user_id;

  PERFORM public.write_admin_action_log(
    'PASSWORD_CHANGED'::public.admin_action_type,
    'auth.users',
    _target_user_id::text,
    format('Senha atualizada para o usuário administrativo %s', COALESCE(target_user_login_identifier, target_user_email, _target_user_id::text)),
    NULL,
    NULL,
    jsonb_build_object(
      'target_user_id', _target_user_id::text,
      'target_user_email', target_user_email,
      'target_user_login_identifier', COALESCE(target_user_login_identifier, target_user_email),
      'target_user_profile_name', target_user_profile_name,
      'password_status', 'ACTIVE'
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user_login_identifier(
  _target_user_id UUID,
  _login_identifier TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_login_identifier TEXT;
  resolved_auth_email TEXT;
  current_auth_email TEXT;
  current_login_identifier TEXT;
BEGIN
  IF NOT public.has_admin_tab_access('users'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Sem permissão para editar login de usuários administrativos.';
  END IF;

  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário inválido.';
  END IF;

  normalized_login_identifier := public.normalize_admin_login_identifier(_login_identifier);

  IF normalized_login_identifier = '' THEN
    RAISE EXCEPTION 'Informe um login válido.';
  END IF;

  IF position(' ' IN normalized_login_identifier) > 0 THEN
    RAISE EXCEPTION 'O login não pode conter espaços.';
  END IF;

  SELECT
    users_table.email,
    admin_user_profiles_table.login_identifier
  INTO
    current_auth_email,
    current_login_identifier
  FROM public.admin_user_profiles AS admin_user_profiles_table
  JOIN auth.users AS users_table
    ON users_table.id = admin_user_profiles_table.user_id
  WHERE admin_user_profiles_table.user_id = _target_user_id
  LIMIT 1;

  IF current_auth_email IS NULL THEN
    RAISE EXCEPTION 'Usuário administrativo não encontrado.';
  END IF;

  IF lower(current_login_identifier) = normalized_login_identifier THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.admin_user_profiles AS admin_user_profiles_table
    WHERE admin_user_profiles_table.user_id <> _target_user_id
      AND lower(admin_user_profiles_table.login_identifier) = normalized_login_identifier
  ) THEN
    RAISE EXCEPTION 'Já existe um usuário com este login.';
  END IF;

  resolved_auth_email := public.resolve_admin_user_auth_email(normalized_login_identifier);

  IF EXISTS (
    SELECT 1
    FROM auth.users AS users_table
    WHERE users_table.id <> _target_user_id
      AND lower(users_table.email) = lower(resolved_auth_email)
  ) THEN
    RAISE EXCEPTION 'Já existe um usuário com este login.';
  END IF;

  UPDATE auth.users
  SET
    email = resolved_auth_email,
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
      'login_identifier', normalized_login_identifier
    ),
    updated_at = now()
  WHERE id = _target_user_id;

  UPDATE auth.identities
  SET
    provider_id = resolved_auth_email,
    identity_data = COALESCE(identity_data, '{}'::jsonb) || jsonb_build_object(
      'sub', _target_user_id::text,
      'email', resolved_auth_email,
      'login_identifier', normalized_login_identifier
    ),
    updated_at = now()
  WHERE user_id = _target_user_id
    AND provider = 'email';

  UPDATE public.admin_user_profiles
  SET
    login_identifier = normalized_login_identifier,
    updated_at = now()
  WHERE user_id = _target_user_id;

  PERFORM public.write_admin_action_log(
    'UPDATE'::public.admin_action_type,
    'auth.users',
    _target_user_id::text,
    format('Atualizou login administrativo de %s para %s', current_login_identifier, normalized_login_identifier),
    NULL,
    NULL,
    jsonb_build_object(
      'target_user_id', _target_user_id::text,
      'previous_login_identifier', current_login_identifier,
      'new_login_identifier', normalized_login_identifier,
      'previous_auth_email', current_auth_email,
      'new_auth_email', resolved_auth_email
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_users_password_setup(
  _target_user_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id UUID;
  target_login_identifier TEXT;
  target_user_email TEXT;
  generated_password_placeholder TEXT;
  processed_users_count INTEGER := 0;
BEGIN
  IF NOT public.has_admin_tab_access('users'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Sem permissão para resetar senhas de usuários administrativos.';
  END IF;

  FOREACH target_user_id IN ARRAY COALESCE(_target_user_ids, ARRAY[]::UUID[])
  LOOP
    IF target_user_id IS NULL OR target_user_id = auth.uid() THEN
      CONTINUE;
    END IF;

    SELECT
      admin_user_profiles_table.login_identifier,
      users_table.email
    INTO
      target_login_identifier,
      target_user_email
    FROM public.admin_user_profiles AS admin_user_profiles_table
    JOIN auth.users AS users_table
      ON users_table.id = admin_user_profiles_table.user_id
    WHERE admin_user_profiles_table.user_id = target_user_id
    LIMIT 1;

    IF target_login_identifier IS NULL THEN
      CONTINUE;
    END IF;

    generated_password_placeholder := gen_random_uuid()::text || gen_random_uuid()::text;

    UPDATE auth.users
    SET
      encrypted_password = crypt(generated_password_placeholder, gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
    WHERE id = target_user_id;

    UPDATE public.admin_user_profiles
    SET
      password_status = 'PENDING'::public.admin_user_password_status,
      updated_at = now()
    WHERE user_id = target_user_id;

    processed_users_count := processed_users_count + 1;

    PERFORM public.write_admin_action_log(
      'PASSWORD_CHANGED'::public.admin_action_type,
      'auth.users',
      target_user_id::text,
      format('Resetou a senha do usuário administrativo %s', target_login_identifier),
      NULL,
      NULL,
      jsonb_build_object(
        'target_user_id', target_user_id::text,
        'target_user_email', target_user_email,
        'target_user_login_identifier', target_login_identifier,
        'password_status', 'PENDING'
      )
    );
  END LOOP;

  RETURN processed_users_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_users(
  _target_user_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id UUID;
  target_login_identifier TEXT;
  target_user_email TEXT;
  processed_users_count INTEGER := 0;
BEGIN
  IF NOT public.has_admin_tab_access('users'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Sem permissão para excluir usuários administrativos.';
  END IF;

  FOREACH target_user_id IN ARRAY COALESCE(_target_user_ids, ARRAY[]::UUID[])
  LOOP
    IF target_user_id IS NULL OR target_user_id = auth.uid() THEN
      CONTINUE;
    END IF;

    SELECT
      admin_user_profiles_table.login_identifier,
      users_table.email
    INTO
      target_login_identifier,
      target_user_email
    FROM public.admin_user_profiles AS admin_user_profiles_table
    JOIN auth.users AS users_table
      ON users_table.id = admin_user_profiles_table.user_id
    WHERE admin_user_profiles_table.user_id = target_user_id
    LIMIT 1;

    IF target_login_identifier IS NULL THEN
      CONTINUE;
    END IF;

    DELETE FROM auth.users
    WHERE id = target_user_id;

    IF FOUND THEN
      processed_users_count := processed_users_count + 1;

      PERFORM public.write_admin_action_log(
        'DELETE'::public.admin_action_type,
        'auth.users',
        target_user_id::text,
        format('Removeu o usuário administrativo %s', target_login_identifier),
        NULL,
        NULL,
        jsonb_build_object(
          'target_user_id', target_user_id::text,
          'target_user_email', target_user_email,
          'target_user_login_identifier', target_login_identifier
        )
      );
    END IF;
  END LOOP;

  RETURN processed_users_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_admin_login_state(
  _login_identifier TEXT
)
RETURNS TABLE (
  auth_email TEXT,
  login_identifier TEXT,
  password_status public.admin_user_password_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_login_identifier TEXT;
BEGIN
  normalized_login_identifier := public.normalize_admin_login_identifier(_login_identifier);

  IF normalized_login_identifier = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    users_table.email::TEXT AS auth_email,
    admin_user_profiles_table.login_identifier::TEXT AS login_identifier,
    admin_user_profiles_table.password_status::public.admin_user_password_status AS password_status
  FROM public.admin_user_profiles AS admin_user_profiles_table
  JOIN auth.users AS users_table
    ON users_table.id = admin_user_profiles_table.user_id
  WHERE admin_user_profiles_table.login_identifier = normalized_login_identifier
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_admin_user_password_setup(
  _login_identifier TEXT,
  _new_password TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_login_identifier TEXT;
  target_user_id UUID;
  target_auth_email TEXT;
BEGIN
  normalized_login_identifier := public.normalize_admin_login_identifier(_login_identifier);

  IF normalized_login_identifier = '' THEN
    RAISE EXCEPTION 'Informe um login válido.';
  END IF;

  IF _new_password IS NULL OR char_length(trim(_new_password)) < 8 THEN
    RAISE EXCEPTION 'A senha deve ter ao menos 8 caracteres.';
  END IF;

  SELECT
    admin_user_profiles_table.user_id,
    users_table.email
  INTO
    target_user_id,
    target_auth_email
  FROM public.admin_user_profiles AS admin_user_profiles_table
  JOIN auth.users AS users_table
    ON users_table.id = admin_user_profiles_table.user_id
  WHERE admin_user_profiles_table.login_identifier = normalized_login_identifier
    AND admin_user_profiles_table.password_status = 'PENDING'::public.admin_user_password_status
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário inválido ou já ativo.';
  END IF;

  UPDATE auth.users
  SET
    encrypted_password = crypt(_new_password, gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
      'login_identifier', normalized_login_identifier
    ),
    updated_at = now()
  WHERE id = target_user_id;

  UPDATE public.admin_user_profiles
  SET
    password_status = 'ACTIVE'::public.admin_user_password_status,
    updated_at = now()
  WHERE user_id = target_user_id;

  RETURN target_auth_email;
END;
$$;

DO $migration_admin_users_password_hash_search_path$
DECLARE
  has_extensions_schema BOOLEAN;
BEGIN
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

    ALTER FUNCTION public.admin_reset_users_password_setup(UUID[])
      SET search_path = public, extensions;

    ALTER FUNCTION public.complete_admin_user_password_setup(TEXT, TEXT)
      SET search_path = public, extensions;
  ELSE
    ALTER FUNCTION public.create_admin_user_with_access(TEXT, TEXT, public.app_role, UUID)
      SET search_path = public;

    ALTER FUNCTION public.admin_update_user_password(UUID, TEXT)
      SET search_path = public;

    ALTER FUNCTION public.admin_reset_users_password_setup(UUID[])
      SET search_path = public;

    ALTER FUNCTION public.complete_admin_user_password_setup(TEXT, TEXT)
      SET search_path = public;
  END IF;
END
$migration_admin_users_password_hash_search_path$;

GRANT EXECUTE ON FUNCTION public.list_admin_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_access(UUID, public.app_role, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_admin_user_with_access(TEXT, TEXT, public.app_role, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_password(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_login_identifier(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_users_password_setup(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_users(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_admin_login_state(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_admin_user_password_setup(TEXT, TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
