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
    FROM information_schema.tables
    WHERE table_schema = 'auth'
      AND table_name = 'identities'
  ) THEN
    RAISE EXCEPTION 'Tabela auth.identities não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'crypt'
      AND pg_function_is_visible(oid)
  ) THEN
    RAISE EXCEPTION 'Função crypt não encontrada. Verifique a extensão pgcrypto.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'admin_action_type'
  ) THEN
    RAISE EXCEPTION 'Enum public.admin_action_type não encontrado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'write_admin_action_log'
      AND pg_function_is_visible(oid)
  ) THEN
    RAISE EXCEPTION 'Função public.write_admin_action_log não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'admin_action_logs'
  ) THEN
    RAISE EXCEPTION 'Tabela public.admin_action_logs não encontrada.';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'admin_panel_tab'
  ) THEN
    CREATE TYPE public.admin_panel_tab AS ENUM (
      'matches',
      'control',
      'teams',
      'sports',
      'events',
      'logs',
      'users'
    );
  END IF;
END
$$;

DO $$
DECLARE
  missing_tabs TEXT;
BEGIN
  SELECT string_agg(expected_tab, ', ' ORDER BY expected_tab)
  INTO missing_tabs
  FROM (
    VALUES
      ('matches'),
      ('control'),
      ('teams'),
      ('sports'),
      ('events'),
      ('logs'),
      ('users')
  ) AS expected_tabs(expected_tab)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.admin_panel_tab'::regtype
      AND enumlabel = expected_tabs.expected_tab
  );

  IF missing_tabs IS NOT NULL THEN
    RAISE EXCEPTION 'Enum public.admin_panel_tab sem valores obrigatórios: %', missing_tabs;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'admin_panel_permission_level'
  ) THEN
    CREATE TYPE public.admin_panel_permission_level AS ENUM (
      'NONE',
      'VIEW',
      'EDIT'
    );
  END IF;
END
$$;

DO $$
DECLARE
  missing_levels TEXT;
BEGIN
  SELECT string_agg(expected_level, ', ' ORDER BY expected_level)
  INTO missing_levels
  FROM (
    VALUES
      ('NONE'),
      ('VIEW'),
      ('EDIT')
  ) AS expected_levels(expected_level)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.admin_panel_permission_level'::regtype
      AND enumlabel = expected_levels.expected_level
  );

  IF missing_levels IS NOT NULL THEN
    RAISE EXCEPTION 'Enum public.admin_panel_permission_level sem valores obrigatórios: %', missing_levels;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.admin_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_profiles
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.admin_profiles
    WHERE name IS NULL
  ) THEN
    RAISE EXCEPTION 'Tabela public.admin_profiles possui registros inválidos com nome nulo.';
  END IF;
END
$$;

ALTER TABLE public.admin_profiles
  ALTER COLUMN name SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS admin_profiles_name_unique_idx
  ON public.admin_profiles (lower(name));

CREATE TABLE IF NOT EXISTS public.admin_profile_permissions (
  profile_id UUID NOT NULL,
  admin_tab public.admin_panel_tab NOT NULL,
  access_level public.admin_panel_permission_level NOT NULL DEFAULT 'NONE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, admin_tab)
);

ALTER TABLE public.admin_profile_permissions
  ADD COLUMN IF NOT EXISTS profile_id UUID,
  ADD COLUMN IF NOT EXISTS admin_tab public.admin_panel_tab,
  ADD COLUMN IF NOT EXISTS access_level public.admin_panel_permission_level NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.admin_profile_permissions
    WHERE profile_id IS NULL
      OR admin_tab IS NULL
      OR access_level IS NULL
  ) THEN
    RAISE EXCEPTION 'Tabela public.admin_profile_permissions possui registros inválidos.';
  END IF;
END
$$;

ALTER TABLE public.admin_profile_permissions
  ALTER COLUMN profile_id SET NOT NULL;

ALTER TABLE public.admin_profile_permissions
  ALTER COLUMN admin_tab SET NOT NULL;

ALTER TABLE public.admin_profile_permissions
  ALTER COLUMN access_level SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'admin_profile_permissions_profile_id_fkey'
      AND conrelid = 'public.admin_profile_permissions'::regclass
  ) THEN
    ALTER TABLE public.admin_profile_permissions
      ADD CONSTRAINT admin_profile_permissions_profile_id_fkey
      FOREIGN KEY (profile_id)
      REFERENCES public.admin_profiles(id)
      ON DELETE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS admin_profile_permissions_admin_tab_idx
  ON public.admin_profile_permissions (admin_tab);

CREATE TABLE IF NOT EXISTS public.admin_user_profiles (
  user_id UUID PRIMARY KEY,
  profile_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_user_profiles
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS profile_id UUID,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.admin_user_profiles
    WHERE user_id IS NULL
      OR profile_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Tabela public.admin_user_profiles possui registros inválidos.';
  END IF;
END
$$;

ALTER TABLE public.admin_user_profiles
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.admin_user_profiles
  ALTER COLUMN profile_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'admin_user_profiles_user_id_fkey'
      AND conrelid = 'public.admin_user_profiles'::regclass
  ) THEN
    ALTER TABLE public.admin_user_profiles
      ADD CONSTRAINT admin_user_profiles_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES auth.users(id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'admin_user_profiles_profile_id_fkey'
      AND conrelid = 'public.admin_user_profiles'::regclass
  ) THEN
    ALTER TABLE public.admin_user_profiles
      ADD CONSTRAINT admin_user_profiles_profile_id_fkey
      FOREIGN KEY (profile_id)
      REFERENCES public.admin_profiles(id)
      ON DELETE RESTRICT;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS admin_user_profiles_profile_id_idx
  ON public.admin_user_profiles (profile_id);

CREATE OR REPLACE FUNCTION public.set_admin_table_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_admin_profiles_updated_at_trigger ON public.admin_profiles;

CREATE TRIGGER set_admin_profiles_updated_at_trigger
BEFORE UPDATE ON public.admin_profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_admin_table_updated_at();

DROP TRIGGER IF EXISTS set_admin_profile_permissions_updated_at_trigger ON public.admin_profile_permissions;

CREATE TRIGGER set_admin_profile_permissions_updated_at_trigger
BEFORE UPDATE ON public.admin_profile_permissions
FOR EACH ROW
EXECUTE FUNCTION public.set_admin_table_updated_at();

DROP TRIGGER IF EXISTS set_admin_user_profiles_updated_at_trigger ON public.admin_user_profiles;

CREATE TRIGGER set_admin_user_profiles_updated_at_trigger
BEFORE UPDATE ON public.admin_user_profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_admin_table_updated_at();

ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_profile_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_user_profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.resolve_role_tab_permission_level(
  _role public.app_role,
  _tab public.admin_panel_tab
)
RETURNS public.admin_panel_permission_level
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _role::text = 'admin' THEN 'EDIT'::public.admin_panel_permission_level
    WHEN _role::text = 'eventos' THEN
      CASE
        WHEN _tab::text = 'control' THEN 'EDIT'::public.admin_panel_permission_level
        WHEN _tab::text = 'teams' THEN 'VIEW'::public.admin_panel_permission_level
        WHEN _tab::text = 'events' THEN 'EDIT'::public.admin_panel_permission_level
        ELSE 'NONE'::public.admin_panel_permission_level
      END
    WHEN _role::text = 'mesa' THEN
      CASE
        WHEN _tab::text = 'control' THEN 'EDIT'::public.admin_panel_permission_level
        ELSE 'NONE'::public.admin_panel_permission_level
      END
    ELSE 'NONE'::public.admin_panel_permission_level
  END
$$;

CREATE OR REPLACE FUNCTION public.resolve_highest_admin_permission_level(
  _first_level public.admin_panel_permission_level,
  _second_level public.admin_panel_permission_level
)
RETURNS public.admin_panel_permission_level
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _first_level = 'EDIT'::public.admin_panel_permission_level
      OR _second_level = 'EDIT'::public.admin_panel_permission_level
      THEN 'EDIT'::public.admin_panel_permission_level
    WHEN _first_level = 'VIEW'::public.admin_panel_permission_level
      OR _second_level = 'VIEW'::public.admin_panel_permission_level
      THEN 'VIEW'::public.admin_panel_permission_level
    ELSE 'NONE'::public.admin_panel_permission_level
  END
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
  current_user_role public.app_role;
  role_permission_level public.admin_panel_permission_level;
  profile_permission_level public.admin_panel_permission_level;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RETURN 'NONE'::public.admin_panel_permission_level;
  END IF;

  SELECT user_roles_table.role
  INTO current_user_role
  FROM public.user_roles AS user_roles_table
  WHERE user_roles_table.user_id = current_user_id
  ORDER BY
    CASE user_roles_table.role::text
      WHEN 'admin' THEN 0
      WHEN 'eventos' THEN 1
      WHEN 'mesa' THEN 2
      ELSE 3
    END
  LIMIT 1;

  role_permission_level := public.resolve_role_tab_permission_level(current_user_role, _tab);

  SELECT admin_profile_permissions_table.access_level
  INTO profile_permission_level
  FROM public.admin_user_profiles AS admin_user_profiles_table
  JOIN public.admin_profile_permissions AS admin_profile_permissions_table
    ON admin_profile_permissions_table.profile_id = admin_user_profiles_table.profile_id
   AND admin_profile_permissions_table.admin_tab = _tab
  WHERE admin_user_profiles_table.user_id = current_user_id
  LIMIT 1;

  profile_permission_level := COALESCE(
    profile_permission_level,
    'NONE'::public.admin_panel_permission_level
  );

  RETURN public.resolve_highest_admin_permission_level(role_permission_level, profile_permission_level);
END;
$$;

CREATE OR REPLACE FUNCTION public.has_admin_tab_access(
  _tab public.admin_panel_tab,
  _requires_edit BOOLEAN DEFAULT false
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _requires_edit THEN
      public.resolve_current_user_tab_permission_level(_tab) = 'EDIT'::public.admin_panel_permission_level
    ELSE
      public.resolve_current_user_tab_permission_level(_tab) IN (
        'VIEW'::public.admin_panel_permission_level,
        'EDIT'::public.admin_panel_permission_level
      )
  END
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
    public.has_admin_tab_access('users'::public.admin_panel_tab, false)
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
  current_user_role public.app_role;
  current_profile_id UUID;
  current_profile_name TEXT;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT user_roles_table.role
  INTO current_user_role
  FROM public.user_roles AS user_roles_table
  WHERE user_roles_table.user_id = current_user_id
  ORDER BY
    CASE user_roles_table.role::text
      WHEN 'admin' THEN 0
      WHEN 'eventos' THEN 1
      WHEN 'mesa' THEN 2
      ELSE 3
    END
  LIMIT 1;

  SELECT
    admin_user_profiles_table.profile_id,
    admin_profiles_table.name
  INTO
    current_profile_id,
    current_profile_name
  FROM public.admin_user_profiles AS admin_user_profiles_table
  JOIN public.admin_profiles AS admin_profiles_table
    ON admin_profiles_table.id = admin_user_profiles_table.profile_id
  WHERE admin_user_profiles_table.user_id = current_user_id
  LIMIT 1;

  RETURN QUERY
  SELECT
    current_user_role,
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
      ), 'NONE')
    ) AS permissions,
    admin_profiles_table.created_at,
    admin_profiles_table.updated_at
  FROM public.admin_profiles AS admin_profiles_table
  ORDER BY admin_profiles_table.name ASC;
END;
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
    SELECT admin_profiles_table.is_system
    INTO target_profile_is_system
    FROM public.admin_profiles AS admin_profiles_table
    WHERE admin_profiles_table.id = _profile_id
    LIMIT 1;

    IF target_profile_is_system IS NULL THEN
      RAISE EXCEPTION 'Perfil administrativo não encontrado.';
    END IF;

    IF target_profile_is_system THEN
      RAISE EXCEPTION 'Perfis de sistema não podem ser alterados.';
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
    jsonb_build_object('profile_name', normalized_profile_name, 'permissions', COALESCE(_permissions, '{}'::jsonb)),
    jsonb_build_object('profile_id', resolved_profile_id::text)
  );

  RETURN resolved_profile_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe um perfil com este nome.';
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
BEGIN
  IF NOT public.has_admin_tab_access('users'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Sem permissão para editar usuários administrativos.';
  END IF;

  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário inválido.';
  END IF;

  IF (_role IS NULL AND _profile_id IS NULL) OR (_role IS NOT NULL AND _profile_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Informe um perfil padrão OU um perfil personalizado.';
  END IF;

  IF _role IS NOT NULL AND _role::text NOT IN ('admin', 'eventos', 'mesa') THEN
    RAISE EXCEPTION 'Perfil padrão inválido para o admin.';
  END IF;

  SELECT users_table.email
  INTO target_user_email
  FROM auth.users AS users_table
  WHERE users_table.id = _target_user_id
  LIMIT 1;

  IF target_user_email IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado.';
  END IF;

  IF _profile_id IS NOT NULL THEN
    SELECT admin_profiles_table.name
    INTO target_profile_name
    FROM public.admin_profiles AS admin_profiles_table
    WHERE admin_profiles_table.id = _profile_id
    LIMIT 1;

    IF target_profile_name IS NULL THEN
      RAISE EXCEPTION 'Perfil personalizado não encontrado.';
    END IF;
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = _target_user_id;

  DELETE FROM public.admin_user_profiles
  WHERE user_id = _target_user_id;

  IF _role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_target_user_id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  IF _profile_id IS NOT NULL THEN
    INSERT INTO public.admin_user_profiles (user_id, profile_id)
    VALUES (_target_user_id, _profile_id)
    ON CONFLICT (user_id) DO UPDATE
    SET
      profile_id = EXCLUDED.profile_id,
      updated_at = now();
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
      'role', CASE WHEN _role IS NULL THEN NULL ELSE _role::text END,
      'profile_id', CASE WHEN _profile_id IS NULL THEN NULL ELSE _profile_id::text END,
      'profile_name', target_profile_name
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

  IF (_role IS NULL AND _profile_id IS NULL) OR (_role IS NOT NULL AND _profile_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Informe um perfil padrão OU um perfil personalizado.';
  END IF;

  IF _role IS NOT NULL AND _role::text NOT IN ('admin', 'eventos', 'mesa') THEN
    RAISE EXCEPTION 'Perfil padrão inválido para o admin.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM auth.users AS users_table
    WHERE lower(users_table.email) = normalized_email
  ) THEN
    RAISE EXCEPTION 'Já existe um usuário com este e-mail.';
  END IF;

  IF _profile_id IS NOT NULL THEN
    SELECT admin_profiles_table.name
    INTO target_profile_name
    FROM public.admin_profiles AS admin_profiles_table
    WHERE admin_profiles_table.id = _profile_id
    LIMIT 1;

    IF target_profile_name IS NULL THEN
      RAISE EXCEPTION 'Perfil personalizado não encontrado.';
    END IF;
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

  IF _role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (created_user_id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  IF _profile_id IS NOT NULL THEN
    INSERT INTO public.admin_user_profiles (user_id, profile_id)
    VALUES (created_user_id, _profile_id)
    ON CONFLICT (user_id) DO UPDATE
    SET
      profile_id = EXCLUDED.profile_id,
      updated_at = now();
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
      'role', CASE WHEN _role IS NULL THEN NULL ELSE _role::text END,
      'profile_id', CASE WHEN _profile_id IS NULL THEN NULL ELSE _profile_id::text END,
      'profile_name', target_profile_name
    )
  );

  RETURN created_user_id;
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
    user_role_by_priority.role::public.app_role AS role,
    user_profile_data.profile_id::UUID AS profile_id,
    user_profile_data.profile_name::TEXT AS profile_name,
    users_table.created_at::TIMESTAMPTZ AS created_at,
    users_table.last_sign_in_at::TIMESTAMPTZ AS last_sign_in_at
  FROM auth.users AS users_table
  LEFT JOIN LATERAL (
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
  LEFT JOIN LATERAL (
    SELECT
      admin_user_profiles_table.profile_id,
      admin_profiles_table.name AS profile_name
    FROM public.admin_user_profiles AS admin_user_profiles_table
    JOIN public.admin_profiles AS admin_profiles_table
      ON admin_profiles_table.id = admin_user_profiles_table.profile_id
    WHERE admin_user_profiles_table.user_id = users_table.id
    LIMIT 1
  ) AS user_profile_data ON true
  WHERE user_role_by_priority.role IS NOT NULL
     OR user_profile_data.profile_id IS NOT NULL
  ORDER BY users_table.email ASC;
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
  target_user_role public.app_role;
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

  SELECT user_roles_table.role
  INTO target_user_role
  FROM public.user_roles AS user_roles_table
  WHERE user_roles_table.user_id = _target_user_id
  ORDER BY
    CASE user_roles_table.role::text
      WHEN 'admin' THEN 0
      WHEN 'eventos' THEN 1
      WHEN 'mesa' THEN 2
      ELSE 3
    END
  LIMIT 1;

  SELECT admin_profiles_table.name
  INTO target_user_profile_name
  FROM public.admin_user_profiles AS admin_user_profiles_table
  JOIN public.admin_profiles AS admin_profiles_table
    ON admin_profiles_table.id = admin_user_profiles_table.profile_id
  WHERE admin_user_profiles_table.user_id = _target_user_id
  LIMIT 1;

  IF target_user_role IS NULL AND target_user_profile_name IS NULL THEN
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
      'target_user_role', CASE WHEN target_user_role IS NULL THEN NULL ELSE target_user_role::text END,
      'target_user_profile_name', target_user_profile_name
    )
  );
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_profiles'
      AND policyname = 'Admin users tab can view profiles'
  ) THEN
    CREATE POLICY "Admin users tab can view profiles"
      ON public.admin_profiles
      FOR SELECT
      TO authenticated
      USING (public.has_admin_tab_access('users'::public.admin_panel_tab, false));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_profiles'
      AND policyname = 'Admin users tab can manage profiles'
  ) THEN
    CREATE POLICY "Admin users tab can manage profiles"
      ON public.admin_profiles
      FOR ALL
      TO authenticated
      USING (public.has_admin_tab_access('users'::public.admin_panel_tab, true))
      WITH CHECK (public.has_admin_tab_access('users'::public.admin_panel_tab, true));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_profile_permissions'
      AND policyname = 'Admin users tab can view profile permissions'
  ) THEN
    CREATE POLICY "Admin users tab can view profile permissions"
      ON public.admin_profile_permissions
      FOR SELECT
      TO authenticated
      USING (public.has_admin_tab_access('users'::public.admin_panel_tab, false));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_profile_permissions'
      AND policyname = 'Admin users tab can manage profile permissions'
  ) THEN
    CREATE POLICY "Admin users tab can manage profile permissions"
      ON public.admin_profile_permissions
      FOR ALL
      TO authenticated
      USING (public.has_admin_tab_access('users'::public.admin_panel_tab, true))
      WITH CHECK (public.has_admin_tab_access('users'::public.admin_panel_tab, true));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_user_profiles'
      AND policyname = 'Admin users tab can view user profiles'
  ) THEN
    CREATE POLICY "Admin users tab can view user profiles"
      ON public.admin_user_profiles
      FOR SELECT
      TO authenticated
      USING (public.has_admin_tab_access('users'::public.admin_panel_tab, false));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_user_profiles'
      AND policyname = 'Admin users tab can manage user profiles'
  ) THEN
    CREATE POLICY "Admin users tab can manage user profiles"
      ON public.admin_user_profiles
      FOR ALL
      TO authenticated
      USING (public.has_admin_tab_access('users'::public.admin_panel_tab, true))
      WITH CHECK (public.has_admin_tab_access('users'::public.admin_panel_tab, true));
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_profile_permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_user_profiles TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.admin_profiles TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.admin_profile_permissions TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.admin_user_profiles TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'teams'
      AND policyname = 'Admin can insert teams'
  ) THEN
    ALTER POLICY "Admin can insert teams"
      ON public.teams
      WITH CHECK (public.has_admin_tab_access('teams'::public.admin_panel_tab, true));
  ELSE
    CREATE POLICY "Admin can insert teams"
      ON public.teams
      FOR INSERT
      TO authenticated
      WITH CHECK (public.has_admin_tab_access('teams'::public.admin_panel_tab, true));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'teams'
      AND policyname = 'Admin can update teams'
  ) THEN
    ALTER POLICY "Admin can update teams"
      ON public.teams
      USING (public.has_admin_tab_access('teams'::public.admin_panel_tab, true))
      WITH CHECK (public.has_admin_tab_access('teams'::public.admin_panel_tab, true));
  ELSE
    CREATE POLICY "Admin can update teams"
      ON public.teams
      FOR UPDATE
      TO authenticated
      USING (public.has_admin_tab_access('teams'::public.admin_panel_tab, true))
      WITH CHECK (public.has_admin_tab_access('teams'::public.admin_panel_tab, true));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'teams'
      AND policyname = 'Admin can delete teams'
  ) THEN
    ALTER POLICY "Admin can delete teams"
      ON public.teams
      USING (public.has_admin_tab_access('teams'::public.admin_panel_tab, true));
  ELSE
    CREATE POLICY "Admin can delete teams"
      ON public.teams
      FOR DELETE
      TO authenticated
      USING (public.has_admin_tab_access('teams'::public.admin_panel_tab, true));
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'matches'
      AND policyname = 'Admin can insert matches'
  ) THEN
    ALTER POLICY "Admin can insert matches"
      ON public.matches
      WITH CHECK (public.has_admin_tab_access('matches'::public.admin_panel_tab, true));
  ELSE
    CREATE POLICY "Admin can insert matches"
      ON public.matches
      FOR INSERT
      TO authenticated
      WITH CHECK (public.has_admin_tab_access('matches'::public.admin_panel_tab, true));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'matches'
      AND policyname = 'Admin can update matches'
  ) THEN
    ALTER POLICY "Admin can update matches"
      ON public.matches
      USING (public.has_admin_tab_access('matches'::public.admin_panel_tab, true))
      WITH CHECK (public.has_admin_tab_access('matches'::public.admin_panel_tab, true));
  ELSE
    CREATE POLICY "Admin can update matches"
      ON public.matches
      FOR UPDATE
      TO authenticated
      USING (public.has_admin_tab_access('matches'::public.admin_panel_tab, true))
      WITH CHECK (public.has_admin_tab_access('matches'::public.admin_panel_tab, true));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'matches'
      AND policyname = 'Admin can delete matches'
  ) THEN
    ALTER POLICY "Admin can delete matches"
      ON public.matches
      USING (public.has_admin_tab_access('matches'::public.admin_panel_tab, true));
  ELSE
    CREATE POLICY "Admin can delete matches"
      ON public.matches
      FOR DELETE
      TO authenticated
      USING (public.has_admin_tab_access('matches'::public.admin_panel_tab, true));
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'matches'
      AND policyname = 'Mesa pode atualizar placar e status'
  ) THEN
    ALTER POLICY "Mesa pode atualizar placar e status"
      ON public.matches
      USING (public.has_admin_tab_access('control'::public.admin_panel_tab, true))
      WITH CHECK (public.has_admin_tab_access('control'::public.admin_panel_tab, true));
  ELSE
    CREATE POLICY "Mesa pode atualizar placar e status"
      ON public.matches
      FOR UPDATE
      TO authenticated
      USING (public.has_admin_tab_access('control'::public.admin_panel_tab, true))
      WITH CHECK (public.has_admin_tab_access('control'::public.admin_panel_tab, true));
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.validate_mesa_match_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.home_score < 0
    OR NEW.away_score < 0
    OR NEW.home_yellow_cards < 0
    OR NEW.away_yellow_cards < 0
    OR NEW.home_red_cards < 0
    OR NEW.away_red_cards < 0 THEN
    RAISE EXCEPTION 'Placar e cartões não podem ser negativos.';
  END IF;

  IF public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RETURN NEW;
  END IF;

  IF NOT public.has_admin_tab_access('control'::public.admin_panel_tab, true) THEN
    RETURN NEW;
  END IF;

  IF NEW.championship_id != OLD.championship_id
    OR NEW.sport_id != OLD.sport_id
    OR NEW.home_team_id != OLD.home_team_id
    OR NEW.away_team_id != OLD.away_team_id
    OR NEW.location IS DISTINCT FROM OLD.location
    OR NEW.start_time IS DISTINCT FROM OLD.start_time
    OR NEW.end_time IS DISTINCT FROM OLD.end_time
    OR NEW.division IS DISTINCT FROM OLD.division
    OR NEW.naipe IS DISTINCT FROM OLD.naipe
    OR NEW.supports_cards IS DISTINCT FROM OLD.supports_cards
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Perfil com acesso ao Controle ao Vivo pode alterar apenas placar, cartões e status da partida.';
  END IF;

  IF OLD.status = 'FINISHED'::public.match_status
    AND NEW.status != 'FINISHED'::public.match_status THEN
    RAISE EXCEPTION 'Partida encerrada não pode voltar para outro status.';
  END IF;

  IF OLD.status = 'SCHEDULED'::public.match_status
    AND NEW.status = 'FINISHED'::public.match_status THEN
    RAISE EXCEPTION 'A partida precisa iniciar antes de ser encerrada.';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_events'
      AND policyname = 'Admin can insert league events'
  ) THEN
    ALTER POLICY "Admin can insert league events"
      ON public.league_events
      WITH CHECK (public.has_admin_tab_access('events'::public.admin_panel_tab, true));
  ELSE
    CREATE POLICY "Admin can insert league events"
      ON public.league_events
      FOR INSERT
      TO authenticated
      WITH CHECK (public.has_admin_tab_access('events'::public.admin_panel_tab, true));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_events'
      AND policyname = 'Admin can update league events'
  ) THEN
    ALTER POLICY "Admin can update league events"
      ON public.league_events
      USING (public.has_admin_tab_access('events'::public.admin_panel_tab, true))
      WITH CHECK (public.has_admin_tab_access('events'::public.admin_panel_tab, true));
  ELSE
    CREATE POLICY "Admin can update league events"
      ON public.league_events
      FOR UPDATE
      TO authenticated
      USING (public.has_admin_tab_access('events'::public.admin_panel_tab, true))
      WITH CHECK (public.has_admin_tab_access('events'::public.admin_panel_tab, true));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_events'
      AND policyname = 'Admin can delete league events'
  ) THEN
    ALTER POLICY "Admin can delete league events"
      ON public.league_events
      USING (public.has_admin_tab_access('events'::public.admin_panel_tab, true));
  ELSE
    CREATE POLICY "Admin can delete league events"
      ON public.league_events
      FOR DELETE
      TO authenticated
      USING (public.has_admin_tab_access('events'::public.admin_panel_tab, true));
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_event_organizer_teams'
      AND policyname = 'Admin can insert league event organizers'
  ) THEN
    ALTER POLICY "Admin can insert league event organizers"
      ON public.league_event_organizer_teams
      WITH CHECK (public.has_admin_tab_access('events'::public.admin_panel_tab, true));
  ELSE
    CREATE POLICY "Admin can insert league event organizers"
      ON public.league_event_organizer_teams
      FOR INSERT
      TO authenticated
      WITH CHECK (public.has_admin_tab_access('events'::public.admin_panel_tab, true));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_event_organizer_teams'
      AND policyname = 'Admin can update league event organizers'
  ) THEN
    ALTER POLICY "Admin can update league event organizers"
      ON public.league_event_organizer_teams
      USING (public.has_admin_tab_access('events'::public.admin_panel_tab, true))
      WITH CHECK (public.has_admin_tab_access('events'::public.admin_panel_tab, true));
  ELSE
    CREATE POLICY "Admin can update league event organizers"
      ON public.league_event_organizer_teams
      FOR UPDATE
      TO authenticated
      USING (public.has_admin_tab_access('events'::public.admin_panel_tab, true))
      WITH CHECK (public.has_admin_tab_access('events'::public.admin_panel_tab, true));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_event_organizer_teams'
      AND policyname = 'Admin can delete league event organizers'
  ) THEN
    ALTER POLICY "Admin can delete league event organizers"
      ON public.league_event_organizer_teams
      USING (public.has_admin_tab_access('events'::public.admin_panel_tab, true));
  ELSE
    CREATE POLICY "Admin can delete league event organizers"
      ON public.league_event_organizer_teams
      FOR DELETE
      TO authenticated
      USING (public.has_admin_tab_access('events'::public.admin_panel_tab, true));
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_action_logs'
      AND policyname = 'Admin can view admin action logs'
  ) THEN
    ALTER POLICY "Admin can view admin action logs"
      ON public.admin_action_logs
      USING (public.has_admin_tab_access('logs'::public.admin_panel_tab, false));
  ELSE
    CREATE POLICY "Admin can view admin action logs"
      ON public.admin_action_logs
      FOR SELECT
      TO authenticated
      USING (public.has_admin_tab_access('logs'::public.admin_panel_tab, false));
  END IF;
END
$$;

GRANT EXECUTE ON FUNCTION public.has_admin_tab_access(public.admin_panel_tab, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_admin_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_admin_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_admin_profile(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_access(UUID, public.app_role, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_admin_user_with_access(TEXT, TEXT, public.app_role, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_admin_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_password(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
