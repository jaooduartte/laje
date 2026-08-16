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
  source_location_name TEXT;
  source_court_position INTEGER;
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

  SELECT locations_table.name
  INTO source_location_name
  FROM public.championship_bracket_locations AS locations_table
  JOIN public.championship_bracket_days AS days_table
    ON days_table.id = locations_table.bracket_day_id
  WHERE days_table.bracket_edition_id = _bracket_edition_id
    AND locations_table.location_group_id = (_payload->>'location_group_id')::uuid
  ORDER BY days_table.event_date ASC, locations_table.position ASC, locations_table.id ASC
  LIMIT 1;

  IF source_location_name IS NULL THEN
    RAISE EXCEPTION 'Local informado não pertence a esta edição do chaveamento.';
  END IF;

  FOR court_record IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'courts', '[]'::jsonb)) LOOP
    SELECT courts_table.position
    INTO source_court_position
    FROM public.championship_bracket_courts AS courts_table
    JOIN public.championship_bracket_locations AS locations_table
      ON locations_table.id = courts_table.bracket_location_id
    JOIN public.championship_bracket_days AS days_table
      ON days_table.id = locations_table.bracket_day_id
    WHERE days_table.bracket_edition_id = _bracket_edition_id
      AND locations_table.location_group_id = (_payload->>'location_group_id')::uuid
      AND courts_table.court_group_id = (court_record->>'court_group_id')::uuid
    ORDER BY days_table.event_date ASC, courts_table.position ASC, courts_table.id ASC
    LIMIT 1;

    IF source_court_position IS NULL THEN
      RAISE EXCEPTION 'Quadra informada não pertence ao local desta edição do chaveamento.';
    END IF;

    UPDATE public.championship_bracket_courts AS courts_table
    SET name = trim(court_record->>'court_name')
    FROM public.championship_bracket_locations AS locations_table
    JOIN public.championship_bracket_days AS days_table
      ON days_table.id = locations_table.bracket_day_id
    WHERE locations_table.id = courts_table.bracket_location_id
      AND days_table.bracket_edition_id = _bracket_edition_id
      AND public.normalize_bracket_entity_name(locations_table.name) = public.normalize_bracket_entity_name(source_location_name)
      AND courts_table.position = source_court_position
      AND courts_table.name IS DISTINCT FROM trim(court_record->>'court_name');
  END LOOP;

  UPDATE public.championship_bracket_locations AS locations_table
  SET name = trim(_payload->>'location_name')
  FROM public.championship_bracket_days AS days_table
  WHERE days_table.id = locations_table.bracket_day_id
    AND days_table.bracket_edition_id = _bracket_edition_id
    AND public.normalize_bracket_entity_name(locations_table.name) = public.normalize_bracket_entity_name(source_location_name)
    AND locations_table.name IS DISTINCT FROM trim(_payload->>'location_name');
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_bracket_generated_location_group(UUID, JSONB) TO authenticated;
