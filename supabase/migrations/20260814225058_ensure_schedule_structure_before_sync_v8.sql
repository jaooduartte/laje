DO $migration$
BEGIN
  IF to_regprocedure(
    'public.sync_championship_bracket_court_sport_preferences_before_structure_fix_v8(uuid,jsonb)'
  ) IS NULL THEN
    ALTER FUNCTION public.sync_championship_bracket_court_sport_preferences(
      UUID,
      JSONB
    )
    RENAME TO sync_championship_bracket_court_sport_preferences_before_structure_fix_v8;
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.sync_championship_bracket_court_sport_preferences(
  _bracket_edition_id UUID,
  _payload JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  edition_record RECORD;
BEGIN
  SELECT
    editions_table.id
  INTO edition_record
  FROM public.championship_bracket_editions
    AS editions_table
  WHERE editions_table.id =
    _bracket_edition_id
  LIMIT 1;

  IF edition_record.id IS NULL THEN
    RAISE EXCEPTION
      'Edição de chaveamento inválida para sincronizar a estrutura da agenda.';
  END IF;

  INSERT INTO public.championship_bracket_days (
    bracket_edition_id,
    event_date,
    start_time,
    end_time,
    break_start_time,
    break_end_time
  )
  SELECT
    _bracket_edition_id,
    (day_item.value ->> 'date')::date,
    (day_item.value ->> 'start_time')::time,
    (day_item.value ->> 'end_time')::time,
    NULLIF(
      day_item.value ->> 'break_start_time',
      ''
    )::time,
    NULLIF(
      day_item.value ->> 'break_end_time',
      ''
    )::time
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(
        _payload -> 'schedule_days'
      ) = 'array'
        THEN _payload -> 'schedule_days'
      ELSE '[]'::jsonb
    END
  ) AS day_item(value)
  ON CONFLICT ON CONSTRAINT
    championship_bracket_days_upsert_unique
  DO UPDATE SET
    start_time =
      EXCLUDED.start_time,
    end_time =
      EXCLUDED.end_time,
    break_start_time =
      EXCLUDED.break_start_time,
    break_end_time =
      EXCLUDED.break_end_time;

  INSERT INTO public.championship_bracket_locations (
    bracket_day_id,
    name,
    position,
    location_group_id
  )
  SELECT
    days_table.id,
    location_item.value ->> 'name',
    COALESCE(
      (
        location_item.value ->> 'position'
      )::integer,
      location_item.ordinality::integer
    ),
    (
      location_item.value ->> 'location_key'
    )::uuid
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(
        _payload -> 'schedule_days'
      ) = 'array'
        THEN _payload -> 'schedule_days'
      ELSE '[]'::jsonb
    END
  ) AS day_item(value)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(
        day_item.value -> 'locations'
      ) = 'array'
        THEN day_item.value -> 'locations'
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY
    AS location_item(
      value,
      ordinality
    )
  JOIN public.championship_bracket_days
    AS days_table
    ON days_table.bracket_edition_id =
      _bracket_edition_id
    AND days_table.event_date =
      (
        day_item.value ->> 'date'
      )::date
  ON CONFLICT ON CONSTRAINT
    championship_bracket_locations_upsert_unique
  DO UPDATE SET
    position =
      EXCLUDED.position,
    location_group_id =
      EXCLUDED.location_group_id;

  INSERT INTO public.championship_bracket_courts (
    bracket_location_id,
    name,
    position,
    court_group_id
  )
  SELECT
    locations_table.id,
    court_item.value ->> 'name',
    COALESCE(
      (
        court_item.value ->> 'position'
      )::integer,
      court_item.ordinality::integer
    ),
    (
      court_item.value ->> 'court_key'
    )::uuid
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(
        _payload -> 'schedule_days'
      ) = 'array'
        THEN _payload -> 'schedule_days'
      ELSE '[]'::jsonb
    END
  ) AS day_item(value)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(
        day_item.value -> 'locations'
      ) = 'array'
        THEN day_item.value -> 'locations'
      ELSE '[]'::jsonb
    END
  ) AS location_item(value)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(
        location_item.value -> 'courts'
      ) = 'array'
        THEN location_item.value -> 'courts'
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY
    AS court_item(
      value,
      ordinality
    )
  JOIN public.championship_bracket_days
    AS days_table
    ON days_table.bracket_edition_id =
      _bracket_edition_id
    AND days_table.event_date =
      (
        day_item.value ->> 'date'
      )::date
  JOIN public.championship_bracket_locations
    AS locations_table
    ON locations_table.bracket_day_id =
      days_table.id
    AND locations_table.location_group_id =
      (
        location_item.value
          ->> 'location_key'
      )::uuid
  ON CONFLICT ON CONSTRAINT
    championship_bracket_courts_upsert_unique
  DO UPDATE SET
    position =
      EXCLUDED.position,
    court_group_id =
      EXCLUDED.court_group_id;

  PERFORM public.sync_championship_bracket_court_sport_preferences_before_structure_fix_v8(
    _bracket_edition_id,
    _payload
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';