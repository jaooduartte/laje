DO $migration_admin_account_prerequisites$
BEGIN
  IF to_regclass('public.admin_user_profiles') IS NULL THEN
    RAISE EXCEPTION 'Tabela public.admin_user_profiles não encontrada.';
  END IF;

  IF to_regclass('public.admin_action_logs') IS NULL THEN
    RAISE EXCEPTION 'Tabela public.admin_action_logs não encontrada.';
  END IF;

  IF to_regclass('public.admin_profiles') IS NULL THEN
    RAISE EXCEPTION 'Tabela public.admin_profiles não encontrada.';
  END IF;

  IF to_regclass('public.admin_profile_permissions') IS NULL THEN
    RAISE EXCEPTION 'Tabela public.admin_profile_permissions não encontrada.';
  END IF;

  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Tabela auth.users não encontrada.';
  END IF;
END;
$migration_admin_account_prerequisites$;

DO $migration_admin_account_enum_prerequisites$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type AS types_table
    WHERE types_table.typnamespace = 'public'::regnamespace
      AND types_table.typname = 'admin_panel_tab'
  ) THEN
    RAISE EXCEPTION 'Enum public.admin_panel_tab não encontrado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type AS types_table
    WHERE types_table.typnamespace = 'public'::regnamespace
      AND types_table.typname = 'admin_action_type'
  ) THEN
    RAISE EXCEPTION 'Enum public.admin_action_type não encontrado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum AS enums_table
    WHERE enums_table.enumtypid = 'public.admin_panel_tab'::regtype
      AND enums_table.enumlabel = 'account'
  ) THEN
    RAISE EXCEPTION 'Enum value public.admin_panel_tab.account não encontrado. Aplique primeiro a migration 20260307192000_add_admin_account_and_login_enum_values.sql.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum AS enums_table
    WHERE enums_table.enumtypid = 'public.admin_action_type'::regtype
      AND enums_table.enumlabel = 'LOGIN'
  ) THEN
    RAISE EXCEPTION 'Enum value public.admin_action_type.LOGIN não encontrado. Aplique primeiro a migration 20260307192000_add_admin_account_and_login_enum_values.sql.';
  END IF;
END;
$migration_admin_account_enum_prerequisites$;

DO $migration_admin_users_name_columns$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS columns_table
    WHERE columns_table.table_schema = 'public'
      AND columns_table.table_name = 'admin_user_profiles'
      AND columns_table.column_name = 'name'
  ) THEN
    ALTER TABLE public.admin_user_profiles
      ADD COLUMN name TEXT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS columns_table
    WHERE columns_table.table_schema = 'public'
      AND columns_table.table_name = 'admin_action_logs'
      AND columns_table.column_name = 'actor_name'
  ) THEN
    ALTER TABLE public.admin_action_logs
      ADD COLUMN actor_name TEXT NULL;
  END IF;
END;
$migration_admin_users_name_columns$;

COMMENT ON COLUMN public.admin_user_profiles.name IS 'Nome exibido do usuário administrativo.';
COMMENT ON COLUMN public.admin_action_logs.actor_name IS 'Nome exibido do usuário que executou a ação administrativa.';

UPDATE public.admin_user_profiles AS admin_user_profiles_table
SET name = COALESCE(
  NULLIF(trim(admin_user_profiles_table.name), ''),
  NULLIF(trim(users_table.raw_user_meta_data ->> 'name'), ''),
  NULLIF(trim(users_table.raw_user_meta_data ->> 'full_name'), ''),
  NULLIF(trim(admin_user_profiles_table.login_identifier), ''),
  NULLIF(trim(users_table.email), '')
)
FROM auth.users AS users_table
WHERE users_table.id = admin_user_profiles_table.user_id
  AND (
    admin_user_profiles_table.name IS NULL
    OR trim(admin_user_profiles_table.name) = ''
  );

UPDATE auth.users AS users_table
SET
  raw_user_meta_data = COALESCE(users_table.raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'name', admin_user_profiles_table.name,
      'login_identifier', admin_user_profiles_table.login_identifier
    ),
  updated_at = now()
FROM public.admin_user_profiles AS admin_user_profiles_table
WHERE admin_user_profiles_table.user_id = users_table.id
  AND admin_user_profiles_table.name IS NOT NULL
  AND trim(admin_user_profiles_table.name) <> '';

UPDATE public.admin_action_logs AS admin_action_logs_table
SET actor_name = COALESCE(
  NULLIF(trim(admin_user_profiles_table.name), ''),
  NULLIF(trim(admin_action_logs_table.actor_email), '')
)
FROM public.admin_user_profiles AS admin_user_profiles_table
WHERE admin_user_profiles_table.user_id = admin_action_logs_table.actor_user_id
  AND (
    admin_action_logs_table.actor_name IS NULL
    OR trim(admin_action_logs_table.actor_name) = ''
  );

UPDATE public.admin_action_logs AS admin_action_logs_table
SET actor_name = NULLIF(trim(admin_action_logs_table.actor_email), '')
WHERE (
    admin_action_logs_table.actor_name IS NULL
    OR trim(admin_action_logs_table.actor_name) = ''
  )
  AND admin_action_logs_table.actor_email IS NOT NULL;

DO $migration_admin_users_name_constraints$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.admin_user_profiles AS admin_user_profiles_table
    WHERE admin_user_profiles_table.name IS NULL
      OR trim(admin_user_profiles_table.name) = ''
  ) THEN
    RAISE EXCEPTION 'Tabela public.admin_user_profiles possui nomes inválidos.';
  END IF;

  ALTER TABLE public.admin_user_profiles
    ALTER COLUMN name SET NOT NULL;
END;
$migration_admin_users_name_constraints$;

INSERT INTO public.admin_profile_permissions (
  profile_id,
  admin_tab,
  access_level
)
SELECT
  admin_profiles_table.id,
  'account'::public.admin_panel_tab,
  'EDIT'::public.admin_panel_permission_level
FROM public.admin_profiles AS admin_profiles_table
ON CONFLICT (profile_id, admin_tab) DO NOTHING;

CREATE OR REPLACE FUNCTION public.normalize_admin_user_name(
  _name TEXT,
  _fallback TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT COALESCE(
    NULLIF(trim(COALESCE(_name, '')), ''),
    NULLIF(trim(COALESCE(_fallback, '')), ''),
    'Usuário administrativo'
  );
$$;

CREATE OR REPLACE FUNCTION public.write_admin_action_log(
  _action_type public.admin_action_type,
  _resource_table TEXT,
  _record_id TEXT DEFAULT NULL,
  _description TEXT DEFAULT NULL,
  _old_data JSONB DEFAULT NULL,
  _new_data JSONB DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_user_id UUID;
  actor_role public.app_role;
  actor_email TEXT;
  actor_name TEXT;
BEGIN
  actor_user_id := auth.uid();

  IF actor_user_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.can_access_admin_panel() THEN
    RETURN;
  END IF;

  SELECT
    users_table.email,
    admin_user_profiles_table.name
  INTO
    actor_email,
    actor_name
  FROM auth.users AS users_table
  LEFT JOIN public.admin_user_profiles AS admin_user_profiles_table
    ON admin_user_profiles_table.user_id = users_table.id
  WHERE users_table.id = actor_user_id
  LIMIT 1;

  SELECT user_roles_table.role
  INTO actor_role
  FROM public.user_roles AS user_roles_table
  WHERE user_roles_table.user_id = actor_user_id
  ORDER BY
    CASE user_roles_table.role::text
      WHEN 'admin' THEN 0
      WHEN 'eventos' THEN 1
      WHEN 'mesa' THEN 2
      ELSE 3
    END
  LIMIT 1;

  INSERT INTO public.admin_action_logs (
    actor_user_id,
    actor_email,
    actor_name,
    actor_role,
    action_type,
    resource_table,
    record_id,
    description,
    old_data,
    new_data,
    metadata
  ) VALUES (
    actor_user_id,
    actor_email,
    public.normalize_admin_user_name(actor_name, actor_email),
    actor_role,
    _action_type,
    _resource_table,
    _record_id,
    _description,
    _old_data,
    _new_data,
    COALESCE(_metadata, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_admin_panel()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_admin_tab_access('matches'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('control'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('teams'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('sports'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('events'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('logs'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('users'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('account'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('settings'::public.admin_panel_tab, false)
$$;

DROP FUNCTION IF EXISTS public.get_current_user_admin_context();

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
  users_permission public.admin_panel_permission_level,
  account_permission public.admin_panel_permission_level,
  settings_permission public.admin_panel_permission_level
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
    public.resolve_current_user_tab_permission_level('users'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('account'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('settings'::public.admin_panel_tab);
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
    users_table.last_sign_in_at::TIMESTAMPTZ AS last_sign_in_at
  FROM public.admin_user_profiles AS admin_user_profiles_table
  JOIN auth.users AS users_table
    ON users_table.id = admin_user_profiles_table.user_id
  JOIN public.admin_profiles AS admin_profiles_table
    ON admin_profiles_table.id = admin_user_profiles_table.profile_id
  ORDER BY admin_user_profiles_table.name ASC, admin_user_profiles_table.login_identifier ASC;
END;
$$;

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
        SELECT admin_profile_permissions_table.access_level::text
        FROM public.admin_profile_permissions AS admin_profile_permissions_table
        WHERE admin_profile_permissions_table.profile_id = admin_profiles_table.id
          AND admin_profile_permissions_table.admin_tab = 'matches'::public.admin_panel_tab
      ), 'NONE'),
      'control', COALESCE((
        SELECT admin_profile_permissions_table.access_level::text
        FROM public.admin_profile_permissions AS admin_profile_permissions_table
        WHERE admin_profile_permissions_table.profile_id = admin_profiles_table.id
          AND admin_profile_permissions_table.admin_tab = 'control'::public.admin_panel_tab
      ), 'NONE'),
      'teams', COALESCE((
        SELECT admin_profile_permissions_table.access_level::text
        FROM public.admin_profile_permissions AS admin_profile_permissions_table
        WHERE admin_profile_permissions_table.profile_id = admin_profiles_table.id
          AND admin_profile_permissions_table.admin_tab = 'teams'::public.admin_panel_tab
      ), 'NONE'),
      'sports', COALESCE((
        SELECT admin_profile_permissions_table.access_level::text
        FROM public.admin_profile_permissions AS admin_profile_permissions_table
        WHERE admin_profile_permissions_table.profile_id = admin_profiles_table.id
          AND admin_profile_permissions_table.admin_tab = 'sports'::public.admin_panel_tab
      ), 'NONE'),
      'events', COALESCE((
        SELECT admin_profile_permissions_table.access_level::text
        FROM public.admin_profile_permissions AS admin_profile_permissions_table
        WHERE admin_profile_permissions_table.profile_id = admin_profiles_table.id
          AND admin_profile_permissions_table.admin_tab = 'events'::public.admin_panel_tab
      ), 'NONE'),
      'logs', COALESCE((
        SELECT admin_profile_permissions_table.access_level::text
        FROM public.admin_profile_permissions AS admin_profile_permissions_table
        WHERE admin_profile_permissions_table.profile_id = admin_profiles_table.id
          AND admin_profile_permissions_table.admin_tab = 'logs'::public.admin_panel_tab
      ), 'NONE'),
      'users', COALESCE((
        SELECT admin_profile_permissions_table.access_level::text
        FROM public.admin_profile_permissions AS admin_profile_permissions_table
        WHERE admin_profile_permissions_table.profile_id = admin_profiles_table.id
          AND admin_profile_permissions_table.admin_tab = 'users'::public.admin_panel_tab
      ), 'NONE'),
      'account', COALESCE((
        SELECT admin_profile_permissions_table.access_level::text
        FROM public.admin_profile_permissions AS admin_profile_permissions_table
        WHERE admin_profile_permissions_table.profile_id = admin_profiles_table.id
          AND admin_profile_permissions_table.admin_tab = 'account'::public.admin_panel_tab
      ), 'NONE'),
      'settings', COALESCE((
        SELECT admin_profile_permissions_table.access_level::text
        FROM public.admin_profile_permissions AS admin_profile_permissions_table
        WHERE admin_profile_permissions_table.profile_id = admin_profiles_table.id
          AND admin_profile_permissions_table.admin_tab = 'settings'::public.admin_panel_tab
      ), 'NONE')
    ) AS permissions,
    admin_profiles_table.created_at,
    admin_profiles_table.updated_at
  FROM public.admin_profiles AS admin_profiles_table
  ORDER BY admin_profiles_table.name ASC;
END;
$$;

DROP FUNCTION IF EXISTS public.create_admin_user_with_access(TEXT, TEXT, public.app_role, UUID);
DROP FUNCTION IF EXISTS public.create_admin_user_with_access(TEXT, TEXT, TEXT, public.app_role, UUID);

CREATE OR REPLACE FUNCTION public.create_admin_user_with_access(
  _login_identifier TEXT,
  _name TEXT DEFAULT NULL,
  _password TEXT DEFAULT NULL,
  _role public.app_role DEFAULT NULL,
  _profile_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  normalized_login_identifier TEXT;
  normalized_name TEXT;
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

  normalized_name := public.normalize_admin_user_name(_name, normalized_login_identifier);

  IF char_length(normalized_name) < 3 THEN
    RAISE EXCEPTION 'Informe um nome com ao menos 3 caracteres.';
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
    jsonb_build_object(
      'name', normalized_name,
      'login_identifier', normalized_login_identifier
    ),
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
      'login_identifier', normalized_login_identifier,
      'name', normalized_name
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
    name,
    login_identifier,
    password_status
  ) VALUES (
    created_user_id,
    _profile_id,
    normalized_name,
    normalized_login_identifier,
    'PENDING'::public.admin_user_password_status
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    profile_id = EXCLUDED.profile_id,
    name = EXCLUDED.name,
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
    format('Criou usuário administrativo: %s', normalized_name),
    NULL,
    jsonb_build_object(
      'name', normalized_name,
      'login_identifier', normalized_login_identifier,
      'email', resolved_auth_email,
      'profile_name', target_profile_name,
      'password_status', 'PENDING'
    ),
    jsonb_build_object(
      'target_user_id', created_user_id::text,
      'target_user_name', normalized_name,
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
  target_user_name TEXT;
  target_user_login_identifier TEXT;
  target_profile_name TEXT;
  target_profile_role public.app_role;
  target_user_last_sign_in_at TIMESTAMPTZ;
  target_password_status public.admin_user_password_status;
  previous_profile_id UUID;
  previous_profile_name TEXT;
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
    users_table.last_sign_in_at,
    admin_user_profiles_table.name,
    admin_user_profiles_table.login_identifier,
    admin_user_profiles_table.password_status,
    admin_user_profiles_table.profile_id,
    current_admin_profiles_table.name
  INTO
    target_user_email,
    target_user_last_sign_in_at,
    target_user_name,
    target_user_login_identifier,
    target_password_status,
    previous_profile_id,
    previous_profile_name
  FROM auth.users AS users_table
  LEFT JOIN public.admin_user_profiles AS admin_user_profiles_table
    ON admin_user_profiles_table.user_id = users_table.id
  LEFT JOIN public.admin_profiles AS current_admin_profiles_table
    ON current_admin_profiles_table.id = admin_user_profiles_table.profile_id
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

  target_user_login_identifier := COALESCE(
    NULLIF(public.normalize_admin_login_identifier(target_user_login_identifier), ''),
    NULLIF(public.normalize_admin_login_identifier(target_user_email), '')
  );
  target_user_name := public.normalize_admin_user_name(target_user_name, target_user_login_identifier);

  INSERT INTO public.admin_user_profiles (
    user_id,
    profile_id,
    name,
    login_identifier,
    password_status
  ) VALUES (
    _target_user_id,
    _profile_id,
    target_user_name,
    target_user_login_identifier,
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
    name = EXCLUDED.name,
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
    format('Atualizou perfil de acesso do usuário administrativo: %s', target_user_name),
    jsonb_build_object(
      'name', target_user_name,
      'login_identifier', target_user_login_identifier,
      'email', target_user_email,
      'profile_name', previous_profile_name
    ),
    jsonb_build_object(
      'name', target_user_name,
      'login_identifier', target_user_login_identifier,
      'email', target_user_email,
      'profile_name', target_profile_name
    ),
    jsonb_build_object(
      'target_user_id', _target_user_id::text,
      'target_user_name', target_user_name,
      'target_user_email', target_user_email,
      'target_user_login_identifier', target_user_login_identifier,
      'previous_profile_id', CASE WHEN previous_profile_id IS NULL THEN NULL ELSE previous_profile_id::text END,
      'previous_profile_name', previous_profile_name,
      'profile_id', _profile_id::text,
      'profile_name', target_profile_name,
      'role', CASE WHEN target_profile_role IS NULL THEN NULL ELSE target_profile_role::text END
    )
  );
END;
$$;

DROP FUNCTION IF EXISTS public.admin_update_user_name(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.admin_update_user_name(
  _target_user_id UUID,
  _name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_name TEXT;
  target_user_email TEXT;
  target_user_name TEXT;
  target_user_login_identifier TEXT;
BEGIN
  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário inválido.';
  END IF;

  IF auth.uid() = _target_user_id THEN
    IF NOT public.has_admin_tab_access('account'::public.admin_panel_tab, true)
      AND NOT public.has_admin_tab_access('users'::public.admin_panel_tab, true) THEN
      RAISE EXCEPTION 'Sem permissão para alterar o próprio nome administrativo.';
    END IF;
  ELSIF NOT public.has_admin_tab_access('users'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Sem permissão para alterar nomes de usuários administrativos.';
  END IF;

  SELECT
    users_table.email,
    admin_user_profiles_table.name,
    admin_user_profiles_table.login_identifier
  INTO
    target_user_email,
    target_user_name,
    target_user_login_identifier
  FROM public.admin_user_profiles AS admin_user_profiles_table
  JOIN auth.users AS users_table
    ON users_table.id = admin_user_profiles_table.user_id
  WHERE admin_user_profiles_table.user_id = _target_user_id
  LIMIT 1;

  IF target_user_email IS NULL THEN
    RAISE EXCEPTION 'Usuário administrativo não encontrado.';
  END IF;

  normalized_name := public.normalize_admin_user_name(_name, COALESCE(target_user_login_identifier, target_user_email));

  IF char_length(normalized_name) < 3 THEN
    RAISE EXCEPTION 'Informe um nome com ao menos 3 caracteres.';
  END IF;

  IF target_user_name = normalized_name THEN
    RETURN;
  END IF;

  UPDATE public.admin_user_profiles
  SET
    name = normalized_name,
    updated_at = now()
  WHERE user_id = _target_user_id;

  UPDATE auth.users
  SET
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
      'name', normalized_name,
      'login_identifier', target_user_login_identifier
    ),
    updated_at = now()
  WHERE id = _target_user_id;

  UPDATE auth.identities
  SET
    identity_data = COALESCE(identity_data, '{}'::jsonb) || jsonb_build_object(
      'sub', _target_user_id::text,
      'email', target_user_email,
      'login_identifier', target_user_login_identifier,
      'name', normalized_name
    ),
    updated_at = now()
  WHERE user_id = _target_user_id
    AND provider = 'email';

  PERFORM public.write_admin_action_log(
    'UPDATE'::public.admin_action_type,
    'auth.users',
    _target_user_id::text,
    format('Atualizou nome do usuário administrativo: %s', normalized_name),
    jsonb_build_object(
      'name', target_user_name,
      'login_identifier', target_user_login_identifier,
      'email', target_user_email
    ),
    jsonb_build_object(
      'name', normalized_name,
      'login_identifier', target_user_login_identifier,
      'email', target_user_email
    ),
    jsonb_build_object(
      'target_user_id', _target_user_id::text,
      'target_user_name', normalized_name,
      'target_user_email', target_user_email,
      'target_user_login_identifier', target_user_login_identifier,
      'previous_name', target_user_name,
      'new_name', normalized_name
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user_password(
  _target_user_id UUID,
  _new_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  target_user_email TEXT;
  target_user_name TEXT;
  target_user_login_identifier TEXT;
  target_user_profile_name TEXT;
BEGIN
  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário inválido.';
  END IF;

  IF auth.uid() = _target_user_id THEN
    IF NOT public.has_admin_tab_access('account'::public.admin_panel_tab, true)
      AND NOT public.has_admin_tab_access('users'::public.admin_panel_tab, true) THEN
      RAISE EXCEPTION 'Sem permissão para alterar a própria senha administrativa.';
    END IF;
  ELSIF NOT public.has_admin_tab_access('users'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Sem permissão para alterar senha de usuários administrativos.';
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
    admin_user_profiles_table.login_identifier,
    admin_user_profiles_table.name
  INTO
    target_user_profile_name,
    target_user_login_identifier,
    target_user_name
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
      'name', target_user_name,
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
    format('Senha de usuário administrativo alterada: %s', public.normalize_admin_user_name(target_user_name, COALESCE(target_user_login_identifier, target_user_email))),
    NULL,
    NULL,
    jsonb_build_object(
      'target_user_id', _target_user_id::text,
      'target_user_name', public.normalize_admin_user_name(target_user_name, COALESCE(target_user_login_identifier, target_user_email)),
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
  current_name TEXT;
BEGIN
  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário inválido.';
  END IF;

  IF auth.uid() = _target_user_id THEN
    IF NOT public.has_admin_tab_access('account'::public.admin_panel_tab, true)
      AND NOT public.has_admin_tab_access('users'::public.admin_panel_tab, true) THEN
      RAISE EXCEPTION 'Sem permissão para alterar o próprio login administrativo.';
    END IF;
  ELSIF NOT public.has_admin_tab_access('users'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Sem permissão para editar login de usuários administrativos.';
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
    admin_user_profiles_table.login_identifier,
    admin_user_profiles_table.name
  INTO
    current_auth_email,
    current_login_identifier,
    current_name
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
      'name', current_name,
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
      'login_identifier', normalized_login_identifier,
      'name', current_name
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
    jsonb_build_object(
      'name', current_name,
      'login_identifier', current_login_identifier,
      'email', current_auth_email
    ),
    jsonb_build_object(
      'name', current_name,
      'login_identifier', normalized_login_identifier,
      'email', resolved_auth_email
    ),
    jsonb_build_object(
      'target_user_id', _target_user_id::text,
      'target_user_name', current_name,
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
SET search_path = public, extensions
AS $$
DECLARE
  target_user_id UUID;
  target_user_name TEXT;
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
      admin_user_profiles_table.name,
      admin_user_profiles_table.login_identifier,
      users_table.email
    INTO
      target_user_name,
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
    format('Resetou a senha do usuário administrativo: %s', public.normalize_admin_user_name(target_user_name, COALESCE(target_login_identifier, target_user_email))),
      NULL,
      NULL,
      jsonb_build_object(
        'target_user_id', target_user_id::text,
        'target_user_name', public.normalize_admin_user_name(target_user_name, COALESCE(target_login_identifier, target_user_email)),
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
  target_user_name TEXT;
  target_login_identifier TEXT;
  target_user_email TEXT;
  target_profile_name TEXT;
  target_password_status public.admin_user_password_status;
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
      admin_user_profiles_table.name,
      admin_user_profiles_table.login_identifier,
      admin_user_profiles_table.password_status,
      admin_profiles_table.name,
      users_table.email
    INTO
      target_user_name,
      target_login_identifier,
      target_password_status,
      target_profile_name,
      target_user_email
    FROM public.admin_user_profiles AS admin_user_profiles_table
    JOIN auth.users AS users_table
      ON users_table.id = admin_user_profiles_table.user_id
    LEFT JOIN public.admin_profiles AS admin_profiles_table
      ON admin_profiles_table.id = admin_user_profiles_table.profile_id
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
        format('Removeu usuário administrativo: %s', public.normalize_admin_user_name(target_user_name, COALESCE(target_login_identifier, target_user_email))),
        jsonb_build_object(
          'name', target_user_name,
          'login_identifier', target_login_identifier,
          'email', target_user_email,
          'profile_name', target_profile_name,
          'password_status', target_password_status::text
        ),
        NULL,
        jsonb_build_object(
          'target_user_id', target_user_id::text,
          'target_user_name', public.normalize_admin_user_name(target_user_name, COALESCE(target_login_identifier, target_user_email)),
          'target_user_email', target_user_email,
          'target_user_login_identifier', target_login_identifier,
          'profile_name', target_profile_name
        )
      );
    END IF;
  END LOOP;

  RETURN processed_users_count;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.register_admin_login_action()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
  current_user_name TEXT;
  current_user_login_identifier TEXT;
  current_user_email TEXT;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    admin_user_profiles_table.name,
    admin_user_profiles_table.login_identifier,
    users_table.email
  INTO
    current_user_name,
    current_user_login_identifier,
    current_user_email
  FROM public.admin_user_profiles AS admin_user_profiles_table
  JOIN auth.users AS users_table
    ON users_table.id = admin_user_profiles_table.user_id
  WHERE admin_user_profiles_table.user_id = current_user_id
  LIMIT 1;

  IF current_user_login_identifier IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.write_admin_action_log(
    'LOGIN'::public.admin_action_type,
    'auth.users',
    current_user_id::text,
    format('Usuário administrativo acessou a plataforma: %s', public.normalize_admin_user_name(current_user_name, COALESCE(current_user_login_identifier, current_user_email))),
    NULL,
    jsonb_build_object(
      'name', public.normalize_admin_user_name(current_user_name, COALESCE(current_user_login_identifier, current_user_email)),
      'login_identifier', current_user_login_identifier,
      'email', current_user_email
    ),
    jsonb_build_object(
      'target_user_id', current_user_id::text,
      'target_user_name', public.normalize_admin_user_name(current_user_name, COALESCE(current_user_login_identifier, current_user_email)),
      'target_user_email', current_user_email,
      'target_user_login_identifier', current_user_login_identifier
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_admin_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_admin_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_admin_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_admin_user_with_access(TEXT, TEXT, TEXT, public.app_role, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_access(UUID, public.app_role, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_name(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_login_identifier(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_password(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_users_password_setup(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_users(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_admin_account() TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_admin_login_action() TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_admin_login_state(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_admin_user_password_setup(TEXT, TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
