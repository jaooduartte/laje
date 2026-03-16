CREATE TABLE IF NOT EXISTS public.championship_bracket_location_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS championship_bracket_location_templates_normalized_name_uidx
  ON public.championship_bracket_location_templates (normalized_name);

CREATE TABLE IF NOT EXISTS public.championship_bracket_location_template_courts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_template_id UUID NOT NULL REFERENCES public.championship_bracket_location_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS championship_bracket_location_template_courts_template_name_uidx
  ON public.championship_bracket_location_template_courts (location_template_id, name);

CREATE TABLE IF NOT EXISTS public.championship_bracket_location_template_court_sports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_template_court_id UUID NOT NULL REFERENCES public.championship_bracket_location_template_courts(id) ON DELETE CASCADE,
  sport_id UUID NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS championship_bracket_location_template_court_sports_court_sport_uidx
  ON public.championship_bracket_location_template_court_sports (location_template_court_id, sport_id);

CREATE OR REPLACE FUNCTION public.set_championship_bracket_location_template_tables_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_championship_bracket_location_templates_updated_at_trigger
ON public.championship_bracket_location_templates;

CREATE TRIGGER set_championship_bracket_location_templates_updated_at_trigger
BEFORE UPDATE ON public.championship_bracket_location_templates
FOR EACH ROW
EXECUTE FUNCTION public.set_championship_bracket_location_template_tables_updated_at();

DROP TRIGGER IF EXISTS set_championship_bracket_location_template_courts_updated_at_trigger
ON public.championship_bracket_location_template_courts;

CREATE TRIGGER set_championship_bracket_location_template_courts_updated_at_trigger
BEFORE UPDATE ON public.championship_bracket_location_template_courts
FOR EACH ROW
EXECUTE FUNCTION public.set_championship_bracket_location_template_tables_updated_at();

DROP TRIGGER IF EXISTS set_championship_bracket_location_template_court_sports_updated_at_trigger
ON public.championship_bracket_location_template_court_sports;

CREATE TRIGGER set_championship_bracket_location_template_court_sports_updated_at_trigger
BEFORE UPDATE ON public.championship_bracket_location_template_court_sports
FOR EACH ROW
EXECUTE FUNCTION public.set_championship_bracket_location_template_tables_updated_at();

DO $$
DECLARE
  table_name TEXT;
  tables_to_secure TEXT[] := ARRAY[
    'championship_bracket_location_templates',
    'championship_bracket_location_template_courts',
    'championship_bracket_location_template_court_sports'
  ];
BEGIN
  FOREACH table_name IN ARRAY tables_to_secure
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = format('Public can view %s', table_name)
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT USING (true)',
        format('Public can view %s', table_name),
        table_name
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = format('Admin can insert %s', table_name)
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_admin_tab_access(''matches''::public.admin_panel_tab, true))',
        format('Admin can insert %s', table_name),
        table_name
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = format('Admin can update %s', table_name)
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.has_admin_tab_access(''matches''::public.admin_panel_tab, true)) WITH CHECK (public.has_admin_tab_access(''matches''::public.admin_panel_tab, true))',
        format('Admin can update %s', table_name),
        table_name
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = format('Admin can delete %s', table_name)
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.has_admin_tab_access(''matches''::public.admin_panel_tab, true))',
        format('Admin can delete %s', table_name),
        table_name
      );
    END IF;
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.save_championship_bracket_location_template(
  _payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  template_id_value UUID;
  existing_template_id UUID;
  location_name_value TEXT;
  normalized_name_value TEXT;
  court_record JSONB;
  sport_record JSONB;
  court_name_value TEXT;
  location_template_court_id_value UUID;
  template_court_count INTEGER := 0;
  court_sport_count INTEGER;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para salvar local do catálogo.';
  END IF;

  location_name_value := trim(COALESCE(_payload->>'name', ''));

  IF location_name_value = '' THEN
    RAISE EXCEPTION 'Nome do local é obrigatório.';
  END IF;

  normalized_name_value := regexp_replace(lower(location_name_value), '\s+', ' ', 'g');

  IF normalized_name_value = '' THEN
    RAISE EXCEPTION 'Nome do local é obrigatório.';
  END IF;

  template_id_value := NULLIF(trim(COALESCE(_payload->>'id', '')), '')::uuid;

  SELECT location_templates_table.id
  INTO existing_template_id
  FROM public.championship_bracket_location_templates AS location_templates_table
  WHERE location_templates_table.normalized_name = normalized_name_value
  LIMIT 1;

  IF template_id_value IS NOT NULL THEN
    IF existing_template_id IS NOT NULL AND existing_template_id <> template_id_value THEN
      DELETE FROM public.championship_bracket_location_templates AS location_templates_table
      WHERE location_templates_table.id = template_id_value;

      template_id_value := existing_template_id;
    ELSE
      UPDATE public.championship_bracket_location_templates AS location_templates_table
      SET
        name = location_name_value,
        normalized_name = normalized_name_value,
        updated_at = now()
      WHERE location_templates_table.id = template_id_value;

      IF NOT FOUND THEN
        template_id_value := NULL;
      END IF;
    END IF;
  END IF;

  IF template_id_value IS NULL THEN
    IF existing_template_id IS NOT NULL THEN
      template_id_value := existing_template_id;

      UPDATE public.championship_bracket_location_templates AS location_templates_table
      SET
        name = location_name_value,
        normalized_name = normalized_name_value,
        updated_at = now()
      WHERE location_templates_table.id = template_id_value;
    ELSE
      INSERT INTO public.championship_bracket_location_templates (
        name,
        normalized_name
      ) VALUES (
        location_name_value,
        normalized_name_value
      )
      RETURNING id INTO template_id_value;
    END IF;
  END IF;

  DELETE FROM public.championship_bracket_location_template_courts AS location_template_courts_table
  WHERE location_template_courts_table.location_template_id = template_id_value;

  FOR court_record IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(_payload->'courts', '[]'::jsonb))
  LOOP
    court_name_value := trim(COALESCE(court_record->>'name', ''));

    IF court_name_value = '' THEN
      RAISE EXCEPTION 'Nome da quadra é obrigatório.';
    END IF;

    template_court_count := template_court_count + 1;

    INSERT INTO public.championship_bracket_location_template_courts (
      location_template_id,
      name,
      position
    ) VALUES (
      template_id_value,
      court_name_value,
      template_court_count
    )
    RETURNING id INTO location_template_court_id_value;

    FOR sport_record IN
      SELECT value
      FROM jsonb_array_elements(COALESCE(court_record->'sport_ids', '[]'::jsonb))
    LOOP
      INSERT INTO public.championship_bracket_location_template_court_sports (
        location_template_court_id,
        sport_id
      ) VALUES (
        location_template_court_id_value,
        trim(both '"' from sport_record::text)::uuid
      )
      ON CONFLICT DO NOTHING;
    END LOOP;

    SELECT count(*)
    INTO court_sport_count
    FROM public.championship_bracket_location_template_court_sports AS court_sports_table
    WHERE court_sports_table.location_template_court_id = location_template_court_id_value;

    IF court_sport_count = 0 THEN
      RAISE EXCEPTION 'Toda quadra precisa ter ao menos uma modalidade vinculada.';
    END IF;
  END LOOP;

  IF template_court_count = 0 THEN
    RAISE EXCEPTION 'O local precisa ter ao menos uma quadra.';
  END IF;

  RETURN template_id_value;
END;
$$;
