CREATE OR REPLACE FUNCTION public.sync_championship_individual_events_from_setup(
  _championship_id UUID,
  _season_year INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  payload_snapshot JSONB;
  upserted_events_count INTEGER := 0;
BEGIN
  payload_snapshot := public.get_championship_setup_payload_snapshot(_championship_id, _season_year);

  WITH enabled_sports AS (
    SELECT DISTINCT (value)::uuid AS sport_id
    FROM jsonb_array_elements_text(COALESCE(payload_snapshot->'enabled_sport_ids', '[]'::jsonb))
  ),
  selected_modalities AS (
    SELECT DISTINCT
      (modality_record.value->>'sport_id')::uuid AS sport_id,
      (modality_record.value->>'naipe')::public.match_naipe AS naipe,
      CASE
        WHEN NULLIF(modality_record.value->>'division', '') IS NULL THEN NULL
        ELSE (modality_record.value->>'division')::public.team_division
      END AS division
    FROM jsonb_array_elements(COALESCE(payload_snapshot->'participants', '[]'::jsonb)) AS participant_record(value)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(participant_record.value->'modalities', '[]'::jsonb)) AS modality_record(value)
  ),
  configured_individual_sports AS (
    SELECT
      selected_modalities.sport_id,
      selected_modalities.naipe,
      selected_modalities.division,
      sports_table.name AS sport_name,
      COALESCE(
        (
          SELECT (config_record.value->>'relay_multiplier')::numeric
          FROM jsonb_array_elements(COALESCE(payload_snapshot->'individual_event_configs', '[]'::jsonb)) AS config_record(value)
          WHERE (config_record.value->>'sport_id')::uuid = selected_modalities.sport_id
          LIMIT 1
        ),
        2
      ) AS relay_multiplier
    FROM selected_modalities
    JOIN enabled_sports
      ON enabled_sports.sport_id = selected_modalities.sport_id
    JOIN public.sports AS sports_table
      ON sports_table.id = selected_modalities.sport_id
    WHERE public.resolve_normalized_sport_name(sports_table.name) IN ('atletismo', 'natacao')
  ),
  official_events AS (
    SELECT * FROM (
      VALUES
        ('atletismo', 'ATHLETICS_100M', '100m', 'INDIVIDUAL', 1),
        ('atletismo', 'ATHLETICS_400M', '400m', 'INDIVIDUAL', 2),
        ('atletismo', 'ATHLETICS_4X100', '4x100', 'RELAY', 3),
        ('atletismo', 'ATHLETICS_SHOT_PUT', 'Arremesso de peso', 'INDIVIDUAL', 4),
        ('atletismo', 'ATHLETICS_LONG_JUMP', 'Salto em distância', 'INDIVIDUAL', 5),
        ('natacao', 'SWIMMING_50_FREE', '50m crawl', 'INDIVIDUAL', 1),
        ('natacao', 'SWIMMING_50_BACK', '50m costas', 'INDIVIDUAL', 2),
        ('natacao', 'SWIMMING_50_FLY', '50m borboleta', 'INDIVIDUAL', 3),
        ('natacao', 'SWIMMING_50_BREAST', '50m peito', 'INDIVIDUAL', 4),
        ('natacao', 'SWIMMING_4X50_FREE', '50m revezamento', 'RELAY', 5)
    ) AS rows(normalized_sport_name, event_code, event_name, event_kind, display_order)
  ),
  upserted_events AS (
    INSERT INTO public.championship_individual_events (
      championship_id,
      season_year,
      sport_id,
      naipe,
      division,
      event_code,
      name,
      kind,
      display_order,
      relay_multiplier
    )
    SELECT
      _championship_id,
      _season_year,
      configured_individual_sports.sport_id,
      configured_individual_sports.naipe,
      configured_individual_sports.division,
      official_events.event_code,
      official_events.event_name,
      official_events.event_kind::public.championship_individual_event_kind,
      official_events.display_order,
      CASE
        WHEN official_events.event_kind = 'RELAY' THEN configured_individual_sports.relay_multiplier
        ELSE 1
      END
    FROM configured_individual_sports
    JOIN official_events
      ON official_events.normalized_sport_name = public.resolve_normalized_sport_name(configured_individual_sports.sport_name)
    ON CONFLICT (
      championship_id,
      season_year,
      sport_id,
      naipe,
      division,
      event_code
    ) DO UPDATE
    SET
      name = EXCLUDED.name,
      kind = EXCLUDED.kind,
      display_order = EXCLUDED.display_order,
      relay_multiplier = EXCLUDED.relay_multiplier,
      updated_at = now()
    RETURNING id
  )
  SELECT COUNT(*)
  INTO upserted_events_count
  FROM upserted_events;

  PERFORM public.sync_championship_individual_sessions_from_setup(_championship_id, _season_year);
  PERFORM public.recalculate_championship_individual_standings(_championship_id, _season_year);

  RETURN upserted_events_count;
END;
$$;

UPDATE public.championship_individual_events
SET
  name = CASE event_code
    WHEN 'SWIMMING_50_FREE' THEN '50m crawl'
    WHEN 'SWIMMING_4X50_FREE' THEN '50m revezamento'
  END,
  updated_at = now()
WHERE event_code IN ('SWIMMING_50_FREE', 'SWIMMING_4X50_FREE')
  AND name IS DISTINCT FROM CASE event_code
    WHEN 'SWIMMING_50_FREE' THEN '50m crawl'
    WHEN 'SWIMMING_4X50_FREE' THEN '50m revezamento'
  END;
