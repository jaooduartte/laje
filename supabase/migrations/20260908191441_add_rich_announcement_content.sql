ALTER TABLE public.public_page_access_settings
  ADD COLUMN IF NOT EXISTS announcement_content JSONB,
  ADD COLUMN IF NOT EXISTS announcement_type TEXT NOT NULL DEFAULT 'NOTICE',
  ADD CONSTRAINT public_page_access_settings_announcement_type_check
    CHECK (announcement_type IN ('IMPROVEMENT', 'NOTICE', 'PROBLEM'));

UPDATE public.public_page_access_settings
SET announcement_type = 'NOTICE'
WHERE announcement_type IS NULL
   OR announcement_type NOT IN ('IMPROVEMENT', 'NOTICE', 'PROBLEM');

DROP FUNCTION IF EXISTS public.get_public_access_settings();

CREATE FUNCTION public.get_public_access_settings()
RETURNS TABLE (
  is_public_access_blocked BOOLEAN,
  is_live_page_blocked BOOLEAN,
  is_championships_page_blocked BOOLEAN,
  is_schedule_page_blocked BOOLEAN,
  is_league_calendar_page_blocked BOOLEAN,
  is_links_page_blocked BOOLEAN,
  blocked_message TEXT,
  announcement_message TEXT,
  announcement_content JSONB,
  announcement_type TEXT,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT
    settings.is_public_access_blocked,
    settings.is_live_page_blocked,
    settings.is_championships_page_blocked,
    settings.is_schedule_page_blocked,
    settings.is_league_calendar_page_blocked,
    settings.is_links_page_blocked,
    settings.blocked_message,
    settings.announcement_message,
    settings.announcement_content,
    settings.announcement_type,
    settings.updated_at
  FROM public.public_page_access_settings AS settings
  WHERE settings.id = 1
  LIMIT 1
$func$;

DROP FUNCTION IF EXISTS public.set_public_access_settings(BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, TEXT);

CREATE FUNCTION public.set_public_access_settings(
  _is_public_access_blocked BOOLEAN,
  _is_live_page_blocked BOOLEAN DEFAULT false,
  _is_championships_page_blocked BOOLEAN DEFAULT false,
  _is_schedule_page_blocked BOOLEAN DEFAULT false,
  _is_league_calendar_page_blocked BOOLEAN DEFAULT false,
  _is_links_page_blocked BOOLEAN DEFAULT false,
  _blocked_message TEXT DEFAULT NULL,
  _announcement_message TEXT DEFAULT NULL,
  _announcement_content JSONB DEFAULT NULL,
  _announcement_type TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  current_settings_row RECORD;
  normalized_blocked_message TEXT;
  normalized_announcement_message TEXT;
  normalized_announcement_content JSONB;
  normalized_announcement_type TEXT;
BEGIN
  IF NOT public.has_admin_tab_access('settings'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Sem permissão para alterar as configurações públicas.';
  END IF;

  IF _is_public_access_blocked IS NULL THEN
    RAISE EXCEPTION 'Informe se o acesso público deve ficar bloqueado.';
  END IF;

  SELECT
    settings.id,
    settings.is_public_access_blocked,
    settings.is_live_page_blocked,
    settings.is_championships_page_blocked,
    settings.is_schedule_page_blocked,
    settings.is_league_calendar_page_blocked,
    settings.is_links_page_blocked,
    settings.blocked_message,
    settings.announcement_message,
    settings.announcement_content,
    settings.announcement_type
  INTO current_settings_row
  FROM public.public_page_access_settings AS settings
  WHERE settings.id = 1
  LIMIT 1;

  normalized_blocked_message := NULLIF(trim(COALESCE(_blocked_message, '')), '');
  normalized_announcement_type := COALESCE(
    NULLIF(trim(COALESCE(_announcement_type, '')), ''),
    current_settings_row.announcement_type,
    'NOTICE'
  );

  IF normalized_announcement_type NOT IN ('IMPROVEMENT', 'NOTICE', 'PROBLEM') THEN
    RAISE EXCEPTION 'Tipo de aviso inválido.';
  END IF;

  IF _announcement_content IS NULL THEN
    normalized_announcement_message := NULLIF(
      btrim(regexp_replace(COALESCE(_announcement_message, ''), '[[:space:]]+', ' ', 'g')),
      ''
    );
    normalized_announcement_content := CASE
      WHEN normalized_announcement_message IS NULL THEN NULL
      ELSE jsonb_build_object(
        'version', 1,
        'segments', jsonb_build_array(jsonb_build_object('text', normalized_announcement_message))
      )
    END;
  ELSE
    IF jsonb_typeof(_announcement_content) <> 'object'
       OR jsonb_typeof(_announcement_content -> 'version') <> 'number'
       OR _announcement_content ->> 'version' <> '1'
       OR jsonb_typeof(_announcement_content -> 'segments') <> 'array' THEN
      RAISE EXCEPTION 'Conteúdo do aviso inválido.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(_announcement_content -> 'segments') AS segments(segment)
      WHERE jsonb_typeof(segments.segment) <> 'object'
         OR jsonb_typeof(segments.segment -> 'text') <> 'string'
         OR (segments.segment ? 'bold' AND jsonb_typeof(segments.segment -> 'bold') <> 'boolean')
         OR (segments.segment ? 'italic' AND jsonb_typeof(segments.segment -> 'italic') <> 'boolean')
         OR (segments.segment ? 'underline' AND jsonb_typeof(segments.segment -> 'underline') <> 'boolean')
    ) THEN
      RAISE EXCEPTION 'Conteúdo do aviso inválido.';
    END IF;

    SELECT
      NULLIF(btrim(string_agg(regexp_replace(segments.segment ->> 'text', '[[:space:]]+', ' ', 'g'), '')), ''),
      jsonb_build_object(
        'version', 1,
        'segments', COALESCE(
          jsonb_agg(
            jsonb_strip_nulls(jsonb_build_object(
              'text', regexp_replace(segments.segment ->> 'text', '[[:space:]]+', ' ', 'g'),
              'bold', CASE WHEN segments.segment ->> 'bold' = 'true' THEN true END,
              'italic', CASE WHEN segments.segment ->> 'italic' = 'true' THEN true END,
              'underline', CASE WHEN segments.segment ->> 'underline' = 'true' THEN true END
            ))
          ),
          '[]'::jsonb
        )
      )
    INTO normalized_announcement_message, normalized_announcement_content
    FROM jsonb_array_elements(_announcement_content -> 'segments') AS segments(segment);

    IF normalized_announcement_message IS NULL THEN
      normalized_announcement_content := NULL;
    END IF;
  END IF;

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
      announcement_message,
      announcement_content,
      announcement_type,
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
      normalized_announcement_message,
      normalized_announcement_content,
      normalized_announcement_type,
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
      announcement_message = normalized_announcement_message,
      announcement_content = normalized_announcement_content,
      announcement_type = normalized_announcement_type,
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
      'blocked_message', current_settings_row.blocked_message,
      'announcement_message', current_settings_row.announcement_message,
      'announcement_content', current_settings_row.announcement_content,
      'announcement_type', current_settings_row.announcement_type
    ),
    jsonb_build_object(
      'is_public_access_blocked', _is_public_access_blocked,
      'is_live_page_blocked', _is_live_page_blocked,
      'is_championships_page_blocked', _is_championships_page_blocked,
      'is_schedule_page_blocked', _is_schedule_page_blocked,
      'is_league_calendar_page_blocked', _is_league_calendar_page_blocked,
      'is_links_page_blocked', _is_links_page_blocked,
      'blocked_message', normalized_blocked_message,
      'announcement_message', normalized_announcement_message,
      'announcement_content', normalized_announcement_content,
      'announcement_type', normalized_announcement_type
    ),
    jsonb_build_object('section', 'settings')
  );
END;
$func$;

REVOKE ALL ON FUNCTION public.get_public_access_settings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_public_access_settings(BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_access_settings() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_public_access_settings(BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, TEXT, JSONB, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
