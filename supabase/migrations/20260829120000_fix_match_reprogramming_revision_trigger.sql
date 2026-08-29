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

  IF TG_OP = 'UPDATE'
    AND TG_TABLE_NAME = 'matches'
    AND trigger_record = previous_record THEN
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
    WHEN 'championship_bracket_court_sports' THEN
      SELECT days_table.bracket_edition_id
      INTO edition_id_value
      FROM public.championship_bracket_courts AS courts_table
      JOIN public.championship_bracket_locations AS locations_table
        ON locations_table.id = courts_table.bracket_location_id
      JOIN public.championship_bracket_days AS days_table
        ON days_table.id = locations_table.bracket_day_id
      WHERE courts_table.id = (trigger_record->>'bracket_court_id')::uuid;
    WHEN 'matches' THEN
      SELECT editions_table.id
      INTO edition_id_value
      FROM public.championship_bracket_editions AS editions_table
      WHERE editions_table.championship_id = (trigger_record->>'championship_id')::uuid
        AND editions_table.season_year = (trigger_record->>'season_year')::integer
      ORDER BY editions_table.updated_at DESC NULLS LAST, editions_table.created_at DESC
      LIMIT 1;
  END CASE;

  IF edition_id_value IS NOT NULL THEN
    UPDATE public.championship_bracket_editions
    SET reprogramming_revision = reprogramming_revision + 1
    WHERE id = edition_id_value;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
