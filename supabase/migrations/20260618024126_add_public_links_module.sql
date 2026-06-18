DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'admin_panel_tab'
  ) THEN
    RAISE EXCEPTION 'Enum public.admin_panel_tab não encontrado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'public_page_access_settings'
  ) THEN
    RAISE EXCEPTION 'Tabela public.public_page_access_settings não encontrada.';
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
      WHERE typnamespace = 'public'::regnamespace
      AND typname = 'public_link_filter_mode'
  ) THEN
    CREATE TYPE public.public_link_filter_mode AS ENUM ('GLOBAL', 'BY_CHAMPIONSHIP_YEAR');
  END IF;
END
$$;

ALTER TABLE public.public_page_access_settings
  ADD COLUMN IF NOT EXISTS is_links_page_blocked BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.public_page_access_settings
    WHERE is_links_page_blocked IS NULL
  ) THEN
    RAISE EXCEPTION 'Tabela public.public_page_access_settings possui valores inválidos para o bloqueio da página de links.';
  END IF;
END
$$;

ALTER TABLE public.public_page_access_settings
  ALTER COLUMN is_links_page_blocked SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.public_link_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT public_link_sections_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS public.public_link_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES public.public_link_sections(id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  filter_mode public.public_link_filter_mode NOT NULL DEFAULT 'GLOBAL'::public.public_link_filter_mode,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT public_link_items_display_name_not_blank CHECK (length(trim(display_name)) > 0),
  CONSTRAINT public_link_items_url_not_blank CHECK (length(trim(url)) > 0)
);

CREATE TABLE IF NOT EXISTS public.public_link_item_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_link_item_id UUID NOT NULL REFERENCES public.public_link_items(id) ON DELETE CASCADE,
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE RESTRICT,
  season_year INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT public_link_item_filters_season_year_check CHECK (season_year BETWEEN 2000 AND 9999),
  CONSTRAINT public_link_item_filters_unique UNIQUE (public_link_item_id, championship_id, season_year)
);

CREATE INDEX IF NOT EXISTS public_link_sections_sort_order_idx
  ON public.public_link_sections (sort_order ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS public_link_items_section_sort_order_idx
  ON public.public_link_items (section_id ASC, sort_order ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS public_link_items_filter_mode_idx
  ON public.public_link_items (filter_mode);

CREATE INDEX IF NOT EXISTS public_link_item_filters_item_idx
  ON public.public_link_item_filters (public_link_item_id);

CREATE INDEX IF NOT EXISTS public_link_item_filters_championship_year_idx
  ON public.public_link_item_filters (championship_id, season_year);

CREATE OR REPLACE FUNCTION public.set_public_link_sections_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_public_link_items_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_public_link_sections_updated_at_trigger ON public.public_link_sections;

CREATE TRIGGER set_public_link_sections_updated_at_trigger
BEFORE UPDATE ON public.public_link_sections
FOR EACH ROW
EXECUTE FUNCTION public.set_public_link_sections_updated_at();

DROP TRIGGER IF EXISTS set_public_link_items_updated_at_trigger ON public.public_link_items;

CREATE TRIGGER set_public_link_items_updated_at_trigger
BEFORE UPDATE ON public.public_link_items
FOR EACH ROW
EXECUTE FUNCTION public.set_public_link_items_updated_at();

ALTER TABLE public.public_link_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_link_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_link_item_filters ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'public_link_sections'
      AND policyname = 'Public link sections active read'
  ) THEN
    CREATE POLICY "Public link sections active read"
      ON public.public_link_sections
      FOR SELECT
      TO anon, authenticated
      USING (
        is_active
        OR public.has_admin_tab_access('links'::public.admin_panel_tab, false)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'public_link_items'
      AND policyname = 'Public link items active read'
  ) THEN
    CREATE POLICY "Public link items active read"
      ON public.public_link_items
      FOR SELECT
      TO anon, authenticated
      USING (
        (
          is_active
          AND EXISTS (
            SELECT 1
            FROM public.public_link_sections AS public_link_sections_table
            WHERE public_link_sections_table.id = public_link_items.section_id
              AND public_link_sections_table.is_active
          )
        )
        OR public.has_admin_tab_access('links'::public.admin_panel_tab, false)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'public_link_item_filters'
      AND policyname = 'Public link item filters active read'
  ) THEN
    CREATE POLICY "Public link item filters active read"
      ON public.public_link_item_filters
      FOR SELECT
      TO anon, authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.public_link_items AS public_link_items_table
          JOIN public.public_link_sections AS public_link_sections_table
            ON public_link_sections_table.id = public_link_items_table.section_id
          WHERE public_link_items_table.id = public_link_item_filters.public_link_item_id
            AND public_link_items_table.is_active
            AND public_link_sections_table.is_active
        )
        OR public.has_admin_tab_access('links'::public.admin_panel_tab, false)
      );
  END IF;
END
$$;

GRANT SELECT ON TABLE public.public_link_sections TO anon, authenticated;
GRANT SELECT ON TABLE public.public_link_items TO anon, authenticated;
GRANT SELECT ON TABLE public.public_link_item_filters TO anon, authenticated;

INSERT INTO public.admin_profile_permissions (profile_id, admin_tab, access_level)
SELECT
  admin_profiles_table.id,
  'links'::public.admin_panel_tab,
  CASE
    WHEN admin_profiles_table.system_role = 'admin'::public.app_role
      THEN 'EDIT'::public.admin_panel_permission_level
    ELSE 'NONE'::public.admin_panel_permission_level
  END
FROM public.admin_profiles AS admin_profiles_table
ON CONFLICT (profile_id, admin_tab) DO NOTHING;

DROP FUNCTION IF EXISTS public.get_public_access_settings();

CREATE OR REPLACE FUNCTION public.get_public_access_settings()
RETURNS TABLE (
  is_public_access_blocked BOOLEAN,
  is_live_page_blocked BOOLEAN,
  is_championships_page_blocked BOOLEAN,
  is_schedule_page_blocked BOOLEAN,
  is_league_calendar_page_blocked BOOLEAN,
  is_links_page_blocked BOOLEAN,
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
    public_page_access_settings_table.is_live_page_blocked,
    public_page_access_settings_table.is_championships_page_blocked,
    public_page_access_settings_table.is_schedule_page_blocked,
    public_page_access_settings_table.is_league_calendar_page_blocked,
    public_page_access_settings_table.is_links_page_blocked,
    public_page_access_settings_table.blocked_message,
    public_page_access_settings_table.updated_at
  FROM public.public_page_access_settings AS public_page_access_settings_table
  WHERE public_page_access_settings_table.id = 1
  LIMIT 1
$$;

DROP FUNCTION IF EXISTS public.set_public_access_settings(BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION public.set_public_access_settings(
  _is_public_access_blocked BOOLEAN,
  _is_live_page_blocked BOOLEAN DEFAULT false,
  _is_championships_page_blocked BOOLEAN DEFAULT false,
  _is_schedule_page_blocked BOOLEAN DEFAULT false,
  _is_league_calendar_page_blocked BOOLEAN DEFAULT false,
  _is_links_page_blocked BOOLEAN DEFAULT false,
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
    public_page_access_settings_table.is_live_page_blocked,
    public_page_access_settings_table.is_championships_page_blocked,
    public_page_access_settings_table.is_schedule_page_blocked,
    public_page_access_settings_table.is_league_calendar_page_blocked,
    public_page_access_settings_table.is_links_page_blocked,
    public_page_access_settings_table.blocked_message
  INTO current_settings_row
  FROM public.public_page_access_settings AS public_page_access_settings_table
  WHERE public_page_access_settings_table.id = 1
  LIMIT 1;

  IF current_settings_row.id IS NULL THEN
    INSERT INTO public.public_page_access_settings (
      id,
      is_public_access_blocked,
      is_live_page_blocked,
      is_championships_page_blocked,
      is_schedule_page_blocked,
      is_league_calendar_page_blocked,
      is_links_page_blocked,
      blocked_message,
      updated_by
    ) VALUES (
      1,
      _is_public_access_blocked,
      _is_live_page_blocked,
      _is_championships_page_blocked,
      _is_schedule_page_blocked,
      _is_league_calendar_page_blocked,
      _is_links_page_blocked,
      normalized_blocked_message,
      auth.uid()
    );
  ELSE
    UPDATE public.public_page_access_settings
    SET
      is_public_access_blocked = _is_public_access_blocked,
      is_live_page_blocked = _is_live_page_blocked,
      is_championships_page_blocked = _is_championships_page_blocked,
      is_schedule_page_blocked = _is_schedule_page_blocked,
      is_league_calendar_page_blocked = _is_league_calendar_page_blocked,
      is_links_page_blocked = _is_links_page_blocked,
      blocked_message = normalized_blocked_message,
      updated_by = auth.uid()
    WHERE id = 1;
  END IF;

  PERFORM public.write_admin_action_log(
    'UPDATE'::public.admin_action_type,
    'public.public_page_access_settings',
    '1',
    CASE
      WHEN _is_public_access_blocked THEN 'Bloqueou acesso geral às telas públicas'
      ELSE 'Atualizou bloqueio por telas públicas'
    END,
    jsonb_build_object(
      'is_public_access_blocked', COALESCE(current_settings_row.is_public_access_blocked, false),
      'is_live_page_blocked', COALESCE(current_settings_row.is_live_page_blocked, false),
      'is_championships_page_blocked', COALESCE(current_settings_row.is_championships_page_blocked, false),
      'is_schedule_page_blocked', COALESCE(current_settings_row.is_schedule_page_blocked, false),
      'is_league_calendar_page_blocked', COALESCE(current_settings_row.is_league_calendar_page_blocked, false),
      'is_links_page_blocked', COALESCE(current_settings_row.is_links_page_blocked, false),
      'blocked_message', current_settings_row.blocked_message
    ),
    jsonb_build_object(
      'is_public_access_blocked', _is_public_access_blocked,
      'is_live_page_blocked', _is_live_page_blocked,
      'is_championships_page_blocked', _is_championships_page_blocked,
      'is_schedule_page_blocked', _is_schedule_page_blocked,
      'is_league_calendar_page_blocked', _is_league_calendar_page_blocked,
      'is_links_page_blocked', _is_links_page_blocked,
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
    public.has_admin_tab_access('links'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('logs'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('users'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('account'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('championship_status'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('championship_schedule'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('score_sheet_review'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('tie_breaks'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('standings'::public.admin_panel_tab, false) OR
    public.has_admin_tab_access('settings'::public.admin_panel_tab, false)
$$;

DROP FUNCTION IF EXISTS public.get_current_user_admin_context();

CREATE OR REPLACE FUNCTION public.get_current_user_admin_context()
RETURNS TABLE (
  role                             public.app_role,
  profile_id                       UUID,
  profile_name                     TEXT,
  matches_permission               public.admin_panel_permission_level,
  control_permission               public.admin_panel_permission_level,
  teams_permission                 public.admin_panel_permission_level,
  sports_permission                public.admin_panel_permission_level,
  events_permission                public.admin_panel_permission_level,
  links_permission                 public.admin_panel_permission_level,
  logs_permission                  public.admin_panel_permission_level,
  users_permission                 public.admin_panel_permission_level,
  account_permission               public.admin_panel_permission_level,
  championship_status_permission   public.admin_panel_permission_level,
  settings_permission              public.admin_panel_permission_level,
  score_sheet_review_permission    public.admin_panel_permission_level,
  tie_breaks_permission            public.admin_panel_permission_level,
  standings_permission             public.admin_panel_permission_level,
  championship_schedule_permission public.admin_panel_permission_level
)
LANGUAGE plpgsql
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
    public.resolve_current_user_tab_permission_level('links'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('logs'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('users'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('account'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('championship_status'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('settings'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('score_sheet_review'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('tie_breaks'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('standings'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('championship_schedule'::public.admin_panel_tab);
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
      'matches', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'matches'::public.admin_panel_tab), 'NONE'),
      'score_sheet_review', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'score_sheet_review'::public.admin_panel_tab), 'NONE'),
      'tie_breaks', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'tie_breaks'::public.admin_panel_tab), 'NONE'),
      'control', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'control'::public.admin_panel_tab), 'NONE'),
      'standings', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'standings'::public.admin_panel_tab), 'NONE'),
      'teams', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'teams'::public.admin_panel_tab), 'NONE'),
      'sports', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'sports'::public.admin_panel_tab), 'NONE'),
      'events', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'events'::public.admin_panel_tab), 'NONE'),
      'links', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'links'::public.admin_panel_tab), 'NONE'),
      'logs', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'logs'::public.admin_panel_tab), 'NONE'),
      'users', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'users'::public.admin_panel_tab), 'NONE'),
      'account', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'account'::public.admin_panel_tab), 'NONE'),
      'championship_status', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'championship_status'::public.admin_panel_tab), 'NONE'),
      'championship_schedule', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'championship_schedule'::public.admin_panel_tab), 'NONE'),
      'settings', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'settings'::public.admin_panel_tab), 'NONE')
    ) AS permissions,
    admin_profiles_table.created_at,
    admin_profiles_table.updated_at
  FROM public.admin_profiles AS admin_profiles_table
  ORDER BY admin_profiles_table.name ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_public_link_section(
  _section_id UUID DEFAULT NULL,
  _name TEXT DEFAULT NULL,
  _description TEXT DEFAULT NULL,
  _sort_order INTEGER DEFAULT 0,
  _is_active BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_section_row public.public_link_sections%ROWTYPE;
  saved_section_row public.public_link_sections%ROWTYPE;
  normalized_name TEXT;
  normalized_description TEXT;
BEGIN
  IF NOT public.has_admin_tab_access('links'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Sem permissão para salvar seções de links.';
  END IF;

  normalized_name := NULLIF(trim(COALESCE(_name, '')), '');
  normalized_description := NULLIF(trim(COALESCE(_description, '')), '');

  IF normalized_name IS NULL THEN
    RAISE EXCEPTION 'Informe o nome da seção.';
  END IF;

  IF _sort_order IS NULL THEN
    RAISE EXCEPTION 'Informe a ordem da seção.';
  END IF;

  IF _section_id IS NOT NULL THEN
    SELECT *
    INTO current_section_row
    FROM public.public_link_sections AS public_link_sections_table
    WHERE public_link_sections_table.id = _section_id
    LIMIT 1;

    IF current_section_row.id IS NULL THEN
      RAISE EXCEPTION 'Seção de links não encontrada.';
    END IF;
  END IF;

  IF current_section_row.id IS NULL THEN
    INSERT INTO public.public_link_sections (
      name,
      description,
      sort_order,
      is_active
    ) VALUES (
      normalized_name,
      normalized_description,
      _sort_order,
      COALESCE(_is_active, true)
    )
    RETURNING *
    INTO saved_section_row;

    PERFORM public.write_admin_action_log(
      'INSERT'::public.admin_action_type,
      'public.public_link_sections',
      saved_section_row.id::text,
      'Criou uma seção de links públicos',
      NULL,
      jsonb_build_object(
        'name', saved_section_row.name,
        'description', saved_section_row.description,
        'sort_order', saved_section_row.sort_order,
        'is_active', saved_section_row.is_active
      ),
      jsonb_build_object('section', 'links')
    );

    RETURN saved_section_row.id;
  END IF;
  UPDATE public.public_link_sections
  SET
    name = normalized_name,
    description = normalized_description,
    sort_order = _sort_order,
    is_active = COALESCE(_is_active, true)
  WHERE id = current_section_row.id
  RETURNING *
  INTO saved_section_row;

  PERFORM public.write_admin_action_log(
    'UPDATE'::public.admin_action_type,
    'public.public_link_sections',
    saved_section_row.id::text,
    'Atualizou uma seção de links públicos',
    jsonb_build_object(
      'name', current_section_row.name,
      'description', current_section_row.description,
      'sort_order', current_section_row.sort_order,
      'is_active', current_section_row.is_active
    ),
    jsonb_build_object(
      'name', saved_section_row.name,
      'description', saved_section_row.description,
      'sort_order', saved_section_row.sort_order,
      'is_active', saved_section_row.is_active
    ),
    jsonb_build_object('section', 'links')
  );

  RETURN saved_section_row.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_public_link_section(
  _section_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_section_row public.public_link_sections%ROWTYPE;
BEGIN
  IF NOT public.has_admin_tab_access('links'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Sem permissão para excluir seções de links.';
  END IF;

  SELECT *
  INTO current_section_row
  FROM public.public_link_sections AS public_link_sections_table
  WHERE public_link_sections_table.id = _section_id
  LIMIT 1;

  IF current_section_row.id IS NULL THEN
    RAISE EXCEPTION 'Seção de links não encontrada.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.public_link_items AS public_link_items_table
    WHERE public_link_items_table.section_id = current_section_row.id
  ) THEN
    RAISE EXCEPTION 'Remova os links da seção antes de excluí-la.';
  END IF;

  DELETE FROM public.public_link_sections
  WHERE id = current_section_row.id;

  PERFORM public.write_admin_action_log(
    'DELETE'::public.admin_action_type,
    'public.public_link_sections',
    current_section_row.id::text,
    'Excluiu uma seção de links públicos',
    jsonb_build_object(
      'name', current_section_row.name,
      'description', current_section_row.description,
      'sort_order', current_section_row.sort_order,
      'is_active', current_section_row.is_active
    ),
    NULL,
    jsonb_build_object('section', 'links')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_public_link_item(
  _item_id UUID DEFAULT NULL,
  _section_id UUID DEFAULT NULL,
  _display_name TEXT DEFAULT NULL,
  _url TEXT DEFAULT NULL,
  _sort_order INTEGER DEFAULT 0,
  _is_active BOOLEAN DEFAULT true,
  _filter_mode public.public_link_filter_mode DEFAULT 'GLOBAL'::public.public_link_filter_mode,
  _filters JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_item_row public.public_link_items%ROWTYPE;
  current_section_row public.public_link_sections%ROWTYPE;
  saved_item_row public.public_link_items%ROWTYPE;
  filter_entry JSONB;
  filter_championship_id UUID;
  filter_season_year INTEGER;
  normalized_display_name TEXT;
  normalized_url TEXT;
  old_filters_json JSONB;
  new_filters_json JSONB := '[]'::jsonb;
BEGIN
  IF NOT public.has_admin_tab_access('links'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Sem permissão para salvar links públicos.';
  END IF;

  normalized_display_name := NULLIF(trim(COALESCE(_display_name, '')), '');
  normalized_url := NULLIF(trim(COALESCE(_url, '')), '');

  IF _section_id IS NULL THEN
    RAISE EXCEPTION 'Informe a seção do link.';
  END IF;

  IF normalized_display_name IS NULL THEN
    RAISE EXCEPTION 'Informe o nome de exibição do link.';
  END IF;

  IF normalized_url IS NULL THEN
    RAISE EXCEPTION 'Informe a URL do link.';
  END IF;

  IF normalized_url !~* '^https?://.+' THEN
    RAISE EXCEPTION 'Informe uma URL absoluta começando com http:// ou https://.';
  END IF;

  IF _sort_order IS NULL THEN
    RAISE EXCEPTION 'Informe a ordem do link.';
  END IF;

  SELECT *
  INTO current_section_row
  FROM public.public_link_sections AS public_link_sections_table
  WHERE public_link_sections_table.id = _section_id
  LIMIT 1;

  IF current_section_row.id IS NULL THEN
    RAISE EXCEPTION 'Seção de links não encontrada.';
  END IF;

  IF _item_id IS NOT NULL THEN
    SELECT *
    INTO current_item_row
    FROM public.public_link_items AS public_link_items_table
    WHERE public_link_items_table.id = _item_id
    LIMIT 1;

    IF current_item_row.id IS NULL THEN
      RAISE EXCEPTION 'Link público não encontrado.';
    END IF;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'championship_id', public_link_item_filters_table.championship_id,
        'season_year', public_link_item_filters_table.season_year
      )
      ORDER BY public_link_item_filters_table.season_year ASC, public_link_item_filters_table.championship_id ASC
    ),
    '[]'::jsonb
  )
  INTO old_filters_json
  FROM public.public_link_item_filters AS public_link_item_filters_table
  WHERE public_link_item_filters_table.public_link_item_id = COALESCE(current_item_row.id, _item_id);

  IF current_item_row.id IS NULL THEN
    INSERT INTO public.public_link_items (
      section_id,
      display_name,
      url,
      sort_order,
      is_active,
      filter_mode
    ) VALUES (
      _section_id,
      normalized_display_name,
      normalized_url,
      _sort_order,
      COALESCE(_is_active, true),
      COALESCE(_filter_mode, 'GLOBAL'::public.public_link_filter_mode)
    )
    RETURNING *
    INTO saved_item_row;
  ELSE
    UPDATE public.public_link_items
    SET
      section_id = _section_id,
      display_name = normalized_display_name,
      url = normalized_url,
      sort_order = _sort_order,
      is_active = COALESCE(_is_active, true),
      filter_mode = COALESCE(_filter_mode, 'GLOBAL'::public.public_link_filter_mode)
    WHERE id = current_item_row.id
    RETURNING *
    INTO saved_item_row;
  END IF;

  DELETE FROM public.public_link_item_filters
  WHERE public_link_item_id = saved_item_row.id;

  IF saved_item_row.filter_mode = 'BY_CHAMPIONSHIP_YEAR'::public.public_link_filter_mode THEN
    FOR filter_entry IN
      SELECT value
      FROM jsonb_array_elements(COALESCE(_filters, '[]'::jsonb))
    LOOP
      filter_championship_id := NULLIF(trim(COALESCE(filter_entry ->> 'championship_id', '')), '')::uuid;
      filter_season_year := NULLIF(trim(COALESCE(filter_entry ->> 'season_year', '')), '')::integer;

      IF filter_championship_id IS NULL OR filter_season_year IS NULL THEN
        RAISE EXCEPTION 'Informe campeonato e ano em todos os filtros do link.';
      END IF;

      IF filter_season_year < 2000 OR filter_season_year > 9999 THEN
        RAISE EXCEPTION 'Informe um ano válido para o filtro do link.';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM public.championships AS championships_table
        WHERE championships_table.id = filter_championship_id
      ) THEN
        RAISE EXCEPTION 'Campeonato informado no filtro do link não foi encontrado.';
      END IF;

      INSERT INTO public.public_link_item_filters (
        public_link_item_id,
        championship_id,
        season_year
      ) VALUES (
        saved_item_row.id,
        filter_championship_id,
        filter_season_year
      )
      ON CONFLICT (public_link_item_id, championship_id, season_year) DO NOTHING;
    END LOOP;

    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'championship_id', public_link_item_filters_table.championship_id,
          'season_year', public_link_item_filters_table.season_year
        )
        ORDER BY public_link_item_filters_table.season_year ASC, public_link_item_filters_table.championship_id ASC
      ),
      '[]'::jsonb
    )
    INTO new_filters_json
    FROM public.public_link_item_filters AS public_link_item_filters_table
    WHERE public_link_item_filters_table.public_link_item_id = saved_item_row.id;

    IF jsonb_array_length(new_filters_json) = 0 THEN
      RAISE EXCEPTION 'Adicione ao menos um filtro de campeonato e ano para esse link.';
    END IF;
  END IF;

  IF current_item_row.id IS NULL THEN
    PERFORM public.write_admin_action_log(
      'INSERT'::public.admin_action_type,
      'public.public_link_items',
      saved_item_row.id::text,
      'Criou um link público',
      NULL,
      jsonb_build_object(
        'section_id', saved_item_row.section_id,
        'display_name', saved_item_row.display_name,
        'url', saved_item_row.url,
        'sort_order', saved_item_row.sort_order,
        'is_active', saved_item_row.is_active,
        'filter_mode', saved_item_row.filter_mode,
        'filters', new_filters_json
      ),
      jsonb_build_object('section', 'links')
    );
  ELSE
    PERFORM public.write_admin_action_log(
      'UPDATE'::public.admin_action_type,
      'public.public_link_items',
      saved_item_row.id::text,
      'Atualizou um link público',
      jsonb_build_object(
        'section_id', current_item_row.section_id,
        'display_name', current_item_row.display_name,
        'url', current_item_row.url,
        'sort_order', current_item_row.sort_order,
        'is_active', current_item_row.is_active,
        'filter_mode', current_item_row.filter_mode,
        'filters', COALESCE(old_filters_json, '[]'::jsonb)
      ),
      jsonb_build_object(
        'section_id', saved_item_row.section_id,
        'display_name', saved_item_row.display_name,
        'url', saved_item_row.url,
        'sort_order', saved_item_row.sort_order,
        'is_active', saved_item_row.is_active,
        'filter_mode', saved_item_row.filter_mode,
        'filters', new_filters_json
      ),
      jsonb_build_object('section', 'links')
    );
  END IF;

  RETURN saved_item_row.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_public_link_item(
  _item_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_item_row public.public_link_items%ROWTYPE;
  current_filters_json JSONB;
BEGIN
  IF NOT public.has_admin_tab_access('links'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Sem permissão para excluir links públicos.';
  END IF;

  SELECT *
  INTO current_item_row
  FROM public.public_link_items AS public_link_items_table
  WHERE public_link_items_table.id = _item_id
  LIMIT 1;

  IF current_item_row.id IS NULL THEN
    RAISE EXCEPTION 'Link público não encontrado.';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'championship_id', public_link_item_filters_table.championship_id,
        'season_year', public_link_item_filters_table.season_year
      )
      ORDER BY public_link_item_filters_table.season_year ASC, public_link_item_filters_table.championship_id ASC
    ),
    '[]'::jsonb
  )
  INTO current_filters_json
  FROM public.public_link_item_filters AS public_link_item_filters_table
  WHERE public_link_item_filters_table.public_link_item_id = current_item_row.id;

  DELETE FROM public.public_link_items
  WHERE id = current_item_row.id;

  PERFORM public.write_admin_action_log(
    'DELETE'::public.admin_action_type,
    'public.public_link_items',
    current_item_row.id::text,
    'Excluiu um link público',
    jsonb_build_object(
      'section_id', current_item_row.section_id,
      'display_name', current_item_row.display_name,
      'url', current_item_row.url,
      'sort_order', current_item_row.sort_order,
      'is_active', current_item_row.is_active,
      'filter_mode', current_item_row.filter_mode,
      'filters', current_filters_json
    ),
    NULL,
    jsonb_build_object('section', 'links')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_access_admin_panel() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_admin_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_admin_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_access_settings() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_public_access_settings(BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_public_link_section(UUID, TEXT, TEXT, INTEGER, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_public_link_section(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_public_link_item(UUID, UUID, TEXT, TEXT, INTEGER, BOOLEAN, public.public_link_filter_mode, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_public_link_item(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
