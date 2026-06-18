DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'public_link_sections'
  ) THEN
    RAISE EXCEPTION 'Tabela public.public_link_sections não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'public_link_items'
  ) THEN
    RAISE EXCEPTION 'Tabela public.public_link_items não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'upsert_public_link_section'
      AND pg_function_is_visible(oid)
  ) THEN
    RAISE EXCEPTION 'Função public.upsert_public_link_section não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'upsert_public_link_item'
      AND pg_function_is_visible(oid)
  ) THEN
    RAISE EXCEPTION 'Função public.upsert_public_link_item não encontrada.';
  END IF;
END
$$;

ALTER TABLE public.public_link_sections
  ALTER COLUMN sort_order SET DEFAULT 1;

ALTER TABLE public.public_link_items
  ALTER COLUMN sort_order SET DEFAULT 1;

WITH ordered_sections AS (
  SELECT
    public_link_sections_table.id,
    row_number() OVER (
      ORDER BY public_link_sections_table.sort_order ASC, public_link_sections_table.created_at ASC, public_link_sections_table.id ASC
    ) AS normalized_sort_order
  FROM public.public_link_sections AS public_link_sections_table
)
UPDATE public.public_link_sections AS public_link_sections_table
SET sort_order = ordered_sections.normalized_sort_order
FROM ordered_sections
WHERE ordered_sections.id = public_link_sections_table.id
  AND ordered_sections.normalized_sort_order <> public_link_sections_table.sort_order;

WITH ordered_items AS (
  SELECT
    public_link_items_table.id,
    row_number() OVER (
      PARTITION BY public_link_items_table.section_id
      ORDER BY public_link_items_table.sort_order ASC, public_link_items_table.created_at ASC, public_link_items_table.id ASC
    ) AS normalized_sort_order
  FROM public.public_link_items AS public_link_items_table
)
UPDATE public.public_link_items AS public_link_items_table
SET sort_order = ordered_items.normalized_sort_order
FROM ordered_items
WHERE ordered_items.id = public_link_items_table.id
  AND ordered_items.normalized_sort_order <> public_link_items_table.sort_order;

CREATE OR REPLACE FUNCTION public.upsert_public_link_section(
  _section_id UUID DEFAULT NULL,
  _name TEXT DEFAULT NULL,
  _description TEXT DEFAULT NULL,
  _sort_order INTEGER DEFAULT 1,
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
  normalized_sort_order INTEGER;
  max_sort_order INTEGER;
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

  normalized_sort_order := GREATEST(_sort_order, 1);

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

  SELECT COALESCE(MAX(public_link_sections_table.sort_order), 0)
  INTO max_sort_order
  FROM public.public_link_sections AS public_link_sections_table
  WHERE _section_id IS NULL
    OR public_link_sections_table.id <> _section_id;

  IF current_section_row.id IS NULL THEN
    normalized_sort_order := LEAST(normalized_sort_order, max_sort_order + 1);

    UPDATE public.public_link_sections
    SET sort_order = sort_order + 1
    WHERE sort_order >= normalized_sort_order;

    INSERT INTO public.public_link_sections (
      name,
      description,
      sort_order,
      is_active
    ) VALUES (
      normalized_name,
      normalized_description,
      normalized_sort_order,
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

  normalized_sort_order := LEAST(normalized_sort_order, GREATEST(max_sort_order + 1, 1));

  IF normalized_sort_order < current_section_row.sort_order THEN
    UPDATE public.public_link_sections
    SET sort_order = sort_order + 1
    WHERE id <> current_section_row.id
      AND sort_order >= normalized_sort_order
      AND sort_order < current_section_row.sort_order;
  ELSIF normalized_sort_order > current_section_row.sort_order THEN
    UPDATE public.public_link_sections
    SET sort_order = sort_order - 1
    WHERE id <> current_section_row.id
      AND sort_order <= normalized_sort_order
      AND sort_order > current_section_row.sort_order;
  END IF;

  UPDATE public.public_link_sections
  SET
    name = normalized_name,
    description = normalized_description,
    sort_order = normalized_sort_order,
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

  UPDATE public.public_link_sections
  SET sort_order = sort_order - 1
  WHERE sort_order > current_section_row.sort_order;

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
  _sort_order INTEGER DEFAULT 1,
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
  normalized_sort_order INTEGER;
  max_sort_order INTEGER;
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

  normalized_sort_order := GREATEST(_sort_order, 1);

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

  SELECT COALESCE(MAX(public_link_items_table.sort_order), 0)
  INTO max_sort_order
  FROM public.public_link_items AS public_link_items_table
  WHERE public_link_items_table.section_id = _section_id
    AND (_item_id IS NULL OR public_link_items_table.id <> _item_id);

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
    normalized_sort_order := LEAST(normalized_sort_order, max_sort_order + 1);

    UPDATE public.public_link_items
    SET sort_order = sort_order + 1
    WHERE section_id = _section_id
      AND sort_order >= normalized_sort_order;

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
      normalized_sort_order,
      COALESCE(_is_active, true),
      COALESCE(_filter_mode, 'GLOBAL'::public.public_link_filter_mode)
    )
    RETURNING *
    INTO saved_item_row;
  ELSE
    normalized_sort_order := LEAST(normalized_sort_order, GREATEST(max_sort_order + 1, 1));

    IF normalized_sort_order < current_item_row.sort_order THEN
      UPDATE public.public_link_items
      SET sort_order = sort_order + 1
      WHERE section_id = _section_id
        AND id <> current_item_row.id
        AND sort_order >= normalized_sort_order
        AND sort_order < current_item_row.sort_order;
    ELSIF normalized_sort_order > current_item_row.sort_order THEN
      UPDATE public.public_link_items
      SET sort_order = sort_order - 1
      WHERE section_id = _section_id
        AND id <> current_item_row.id
        AND sort_order <= normalized_sort_order
        AND sort_order > current_item_row.sort_order;
    END IF;

    UPDATE public.public_link_items
    SET
      section_id = _section_id,
      display_name = normalized_display_name,
      url = normalized_url,
      sort_order = normalized_sort_order,
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

  UPDATE public.public_link_items
  SET sort_order = sort_order - 1
  WHERE section_id = current_item_row.section_id
    AND sort_order > current_item_row.sort_order;

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
      'filters', COALESCE(current_filters_json, '[]'::jsonb)
    ),
    NULL,
    jsonb_build_object('section', 'links')
  );
END;
$$;
