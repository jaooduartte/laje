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

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.admin_panel_tab'::regtype
      AND enumlabel = 'settings'
  ) THEN
    RAISE EXCEPTION 'Valor settings não encontrado em public.admin_panel_tab. Rode a migration 20260301154000 primeiro.';
  END IF;
END
$$;

INSERT INTO public.admin_profile_permissions (
  profile_id,
  admin_tab,
  access_level
)
SELECT
  admin_profiles_table.id,
  'settings'::public.admin_panel_tab,
  CASE
    WHEN admin_profiles_table.system_role = 'admin'::public.app_role
      THEN 'EDIT'::public.admin_panel_permission_level
    ELSE 'NONE'::public.admin_panel_permission_level
  END
FROM public.admin_profiles AS admin_profiles_table
ON CONFLICT (profile_id, admin_tab) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.public_page_access_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  is_public_access_blocked BOOLEAN NOT NULL DEFAULT false,
  blocked_message TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT public_page_access_settings_single_row_check CHECK (id = 1)
);

ALTER TABLE public.public_page_access_settings
  ADD COLUMN IF NOT EXISTS id SMALLINT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_public_access_blocked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_message TEXT,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.public_page_access_settings
    WHERE is_public_access_blocked IS NULL
  ) THEN
    RAISE EXCEPTION 'Tabela public.public_page_access_settings possui valores inválidos.';
  END IF;
END
$$;

ALTER TABLE public.public_page_access_settings
  ALTER COLUMN id SET DEFAULT 1;

ALTER TABLE public.public_page_access_settings
  ALTER COLUMN is_public_access_blocked SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'public_page_access_settings_updated_by_fkey'
      AND conrelid = 'public.public_page_access_settings'::regclass
  ) THEN
    ALTER TABLE public.public_page_access_settings
      ADD CONSTRAINT public_page_access_settings_updated_by_fkey
      FOREIGN KEY (updated_by)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

INSERT INTO public.public_page_access_settings (id, is_public_access_blocked)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_public_page_access_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_public_page_access_settings_updated_at_trigger ON public.public_page_access_settings;

CREATE TRIGGER set_public_page_access_settings_updated_at_trigger
BEFORE UPDATE ON public.public_page_access_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_public_page_access_settings_updated_at();

CREATE OR REPLACE FUNCTION public.get_public_access_settings()
RETURNS TABLE (
  is_public_access_blocked BOOLEAN,
  blocked_message TEXT,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public_page_access_settings_table.is_public_access_blocked,
    public_page_access_settings_table.blocked_message,
    public_page_access_settings_table.updated_at
  FROM public.public_page_access_settings AS public_page_access_settings_table
  WHERE public_page_access_settings_table.id = 1
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_public_access_blocked()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT public_page_access_settings_table.is_public_access_blocked
    FROM public.public_page_access_settings AS public_page_access_settings_table
    WHERE public_page_access_settings_table.id = 1
    LIMIT 1
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.set_public_access_settings(
  _is_public_access_blocked BOOLEAN,
  _blocked_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_settings_row RECORD;
  normalized_blocked_message TEXT;
BEGIN
  IF NOT public.has_admin_tab_access('settings'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Sem permissão para alterar as configurações públicas.';
  END IF;

  IF _is_public_access_blocked IS NULL THEN
    RAISE EXCEPTION 'Informe se o acesso público deve ficar bloqueado.';
  END IF;

  normalized_blocked_message := NULLIF(trim(COALESCE(_blocked_message, '')), '');

  SELECT
    public_page_access_settings_table.id,
    public_page_access_settings_table.is_public_access_blocked,
    public_page_access_settings_table.blocked_message
  INTO current_settings_row
  FROM public.public_page_access_settings AS public_page_access_settings_table
  WHERE public_page_access_settings_table.id = 1
  LIMIT 1;

  IF current_settings_row.id IS NULL THEN
    INSERT INTO public.public_page_access_settings (
      id,
      is_public_access_blocked,
      blocked_message,
      updated_by
    ) VALUES (
      1,
      _is_public_access_blocked,
      normalized_blocked_message,
      auth.uid()
    );
  ELSE
    UPDATE public.public_page_access_settings
    SET
      is_public_access_blocked = _is_public_access_blocked,
      blocked_message = normalized_blocked_message,
      updated_by = auth.uid()
    WHERE id = 1;
  END IF;

  PERFORM public.write_admin_action_log(
    'UPDATE'::public.admin_action_type,
    'public.public_page_access_settings',
    '1',
    CASE
      WHEN _is_public_access_blocked THEN 'Bloqueou acesso às telas públicas'
      ELSE 'Liberou acesso às telas públicas'
    END,
    jsonb_build_object(
      'is_public_access_blocked', COALESCE(current_settings_row.is_public_access_blocked, false),
      'blocked_message', current_settings_row.blocked_message
    ),
    jsonb_build_object(
      'is_public_access_blocked', _is_public_access_blocked,
      'blocked_message', normalized_blocked_message
    ),
    jsonb_build_object('section', 'settings')
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
    public.resolve_current_user_tab_permission_level('settings'::public.admin_panel_tab);
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

GRANT EXECUTE ON FUNCTION public.can_access_admin_panel() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_admin_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_admin_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_access_settings() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_public_access_blocked() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_public_access_settings(BOOLEAN, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
