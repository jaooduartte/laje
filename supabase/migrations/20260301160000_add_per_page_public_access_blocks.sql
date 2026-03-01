DO $$
BEGIN
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

ALTER TABLE public.public_page_access_settings
  ADD COLUMN IF NOT EXISTS is_live_page_blocked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_championships_page_blocked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_schedule_page_blocked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_league_calendar_page_blocked BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.public_page_access_settings
    WHERE is_live_page_blocked IS NULL
      OR is_championships_page_blocked IS NULL
      OR is_schedule_page_blocked IS NULL
      OR is_league_calendar_page_blocked IS NULL
  ) THEN
    RAISE EXCEPTION 'Tabela public.public_page_access_settings possui valores inválidos para bloqueio por página.';
  END IF;
END
$$;

ALTER TABLE public.public_page_access_settings
  ALTER COLUMN is_live_page_blocked SET NOT NULL;

ALTER TABLE public.public_page_access_settings
  ALTER COLUMN is_championships_page_blocked SET NOT NULL;

ALTER TABLE public.public_page_access_settings
  ALTER COLUMN is_schedule_page_blocked SET NOT NULL;

ALTER TABLE public.public_page_access_settings
  ALTER COLUMN is_league_calendar_page_blocked SET NOT NULL;

DROP FUNCTION IF EXISTS public.get_public_access_settings();

CREATE OR REPLACE FUNCTION public.get_public_access_settings()
RETURNS TABLE (
  is_public_access_blocked BOOLEAN,
  is_live_page_blocked BOOLEAN,
  is_championships_page_blocked BOOLEAN,
  is_schedule_page_blocked BOOLEAN,
  is_league_calendar_page_blocked BOOLEAN,
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
    public_page_access_settings_table.blocked_message,
    public_page_access_settings_table.updated_at
  FROM public.public_page_access_settings AS public_page_access_settings_table
  WHERE public_page_access_settings_table.id = 1
  LIMIT 1
$$;

DROP FUNCTION IF EXISTS public.set_public_access_settings(BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION public.set_public_access_settings(
  _is_public_access_blocked BOOLEAN,
  _is_live_page_blocked BOOLEAN DEFAULT false,
  _is_championships_page_blocked BOOLEAN DEFAULT false,
  _is_schedule_page_blocked BOOLEAN DEFAULT false,
  _is_league_calendar_page_blocked BOOLEAN DEFAULT false,
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
      blocked_message,
      updated_by
    ) VALUES (
      1,
      _is_public_access_blocked,
      _is_live_page_blocked,
      _is_championships_page_blocked,
      _is_schedule_page_blocked,
      _is_league_calendar_page_blocked,
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
      'blocked_message', current_settings_row.blocked_message
    ),
    jsonb_build_object(
      'is_public_access_blocked', _is_public_access_blocked,
      'is_live_page_blocked', _is_live_page_blocked,
      'is_championships_page_blocked', _is_championships_page_blocked,
      'is_schedule_page_blocked', _is_schedule_page_blocked,
      'is_league_calendar_page_blocked', _is_league_calendar_page_blocked,
      'blocked_message', normalized_blocked_message
    ),
    jsonb_build_object('section', 'settings')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_access_settings() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_public_access_settings(BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
