CREATE OR REPLACE FUNCTION public.update_bracket_generated_location_group(
  _bracket_edition_id UUID,
  _payload JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  championship_id_value UUID;
  court_record JSONB;
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.has_admin_tab_access('championship_schedule'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para editar locais e quadras da agenda.';
  END IF;

  SELECT bracket_editions_table.championship_id
  INTO championship_id_value
  FROM public.championship_bracket_editions AS bracket_editions_table
  JOIN public.championships AS championships_table
    ON championships_table.id = bracket_editions_table.championship_id
  WHERE bracket_editions_table.id = _bracket_edition_id
    AND championships_table.status = 'REVIEW'::public.championship_status
  LIMIT 1;

  IF championship_id_value IS NULL THEN
    RAISE EXCEPTION 'Edição inválida ou campeonato fora do status Em revisão.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.championship_bracket_locations AS locations_table
    JOIN public.championship_bracket_days AS days_table
      ON days_table.id = locations_table.bracket_day_id
    WHERE days_table.bracket_edition_id = _bracket_edition_id
      AND locations_table.location_group_id = (_payload->>'location_group_id')::uuid
  ) THEN
    RAISE EXCEPTION 'Local informado não pertence a esta edição do chaveamento.';
  END IF;

  UPDATE public.championship_bracket_locations AS locations_table
  SET name = trim(_payload->>'location_name')
  FROM public.championship_bracket_days AS days_table
  WHERE days_table.id = locations_table.bracket_day_id
    AND days_table.bracket_edition_id = _bracket_edition_id
    AND locations_table.location_group_id = (_payload->>'location_group_id')::uuid
    AND locations_table.name IS DISTINCT FROM trim(_payload->>'location_name');

  FOR court_record IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'courts', '[]'::jsonb)) LOOP
    UPDATE public.championship_bracket_courts AS courts_table
    SET name = trim(court_record->>'court_name')
    FROM public.championship_bracket_locations AS locations_table
    JOIN public.championship_bracket_days AS days_table
      ON days_table.id = locations_table.bracket_day_id
    WHERE locations_table.id = courts_table.bracket_location_id
      AND days_table.bracket_edition_id = _bracket_edition_id
      AND locations_table.location_group_id = (_payload->>'location_group_id')::uuid
      AND courts_table.court_group_id = (court_record->>'court_group_id')::uuid
      AND courts_table.name IS DISTINCT FROM trim(court_record->>'court_name');
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.bump_championship_bracket_reprogramming_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  edition_id_value UUID;
  trigger_record JSONB;
  previous_record JSONB;
BEGIN
  trigger_record := CASE TG_OP
    WHEN 'DELETE' THEN to_jsonb(OLD)
    ELSE to_jsonb(NEW)
  END;
  previous_record := CASE TG_OP
    WHEN 'INSERT' THEN NULL
    ELSE to_jsonb(OLD)
  END;

  IF TG_OP = 'UPDATE'
    AND TG_TABLE_NAME IN ('championship_bracket_locations', 'championship_bracket_courts')
    AND (trigger_record - 'name') = (previous_record - 'name') THEN
    RETURN NEW;
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'championship_bracket_competitions',
         'championship_bracket_location_sport_priorities',
         'championship_bracket_knockout_court_priorities',
         'championship_bracket_days' THEN
      edition_id_value := (trigger_record->>'bracket_edition_id')::uuid;
    WHEN 'championship_bracket_day_breaks' THEN
      SELECT days_table.bracket_edition_id
      INTO edition_id_value
      FROM public.championship_bracket_days AS days_table
      WHERE days_table.id = (trigger_record->>'bracket_day_id')::uuid;
    WHEN 'championship_bracket_locations' THEN
      SELECT days_table.bracket_edition_id
      INTO edition_id_value
      FROM public.championship_bracket_days AS days_table
      WHERE days_table.id = (trigger_record->>'bracket_day_id')::uuid;
    WHEN 'championship_bracket_courts' THEN
      SELECT days_table.bracket_edition_id
      INTO edition_id_value
      FROM public.championship_bracket_locations AS locations_table
      JOIN public.championship_bracket_days AS days_table
        ON days_table.id = locations_table.bracket_day_id
      WHERE locations_table.id = (trigger_record->>'bracket_location_id')::uuid;
  END CASE;

  IF edition_id_value IS NOT NULL THEN
    UPDATE public.championship_bracket_editions
    SET reprogramming_revision = reprogramming_revision + 1
    WHERE id = edition_id_value;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_bracket_generated_location_group(UUID, JSONB) TO authenticated;
