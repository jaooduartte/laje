-- LAJE-81: quadras sem modalidade preferencial devem gravar false,
-- nunca NULL, na coluna obrigatória slots.preferred_sport.

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.rebuild_job_slots(
  _job_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  job_record RECORD;
BEGIN
  SELECT *
  INTO job_record
  FROM championship_bracket_preview_private.jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF job_record.id IS NULL THEN
    RAISE EXCEPTION 'Job de prévia não encontrado para reconstruir os horários.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.assignments
    WHERE job_id = _job_id
  ) THEN
    RAISE EXCEPTION 'Os horários não podem ser reconstruídos depois do início das atribuições.';
  END IF;

  DELETE FROM championship_bracket_preview_private.slots
  WHERE job_id = _job_id;

  INSERT INTO championship_bracket_preview_private.slots (
    job_id,
    event_date,
    location_key,
    location_name,
    location_position,
    court_key,
    court_name,
    court_position,
    sport_id,
    start_at,
    end_at,
    sequence_index,
    preferred_sport,
    preferred_naipe,
    preferred_division,
    sequence_mode,
    cursor_position
  )
  WITH court_sports AS (
    SELECT
      (day_item.value ->> 'date')::date AS event_date,
      (location_item.value ->> 'location_key')::uuid AS location_key,
      location_item.value ->> 'name' AS location_name,
      COALESCE(
        (location_item.value ->> 'position')::integer,
        location_item.ordinality::integer
      ) AS location_position,
      (court_item.value ->> 'court_key')::uuid AS court_key,
      court_item.value ->> 'name' AS court_name,
      COALESCE(
        (court_item.value ->> 'position')::integer,
        court_item.ordinality::integer
      ) AS court_position,
      CASE
        WHEN jsonb_array_length(COALESCE(court_item.value -> 'sport_match_targets', '[]'::jsonb)) > 0
        THEN sport_item.value ->> 'sport_id'
        ELSE trim(both '"' from sport_item.value::text)
      END::uuid AS sport_id,
      CASE
        WHEN jsonb_array_length(COALESCE(court_item.value -> 'sport_match_targets', '[]'::jsonb)) > 0
        THEN GREATEST(COALESCE((sport_item.value ->> 'planned_match_count')::integer, 0), 0)
        ELSE NULL
      END AS planned_match_count,
      NULLIF(court_item.value -> 'sport_preference' ->> 'preferred_sport_id', '')::uuid AS preferred_sport_id,
      NULLIF(court_item.value -> 'sport_preference' ->> 'preferred_naipe', '')::public.match_naipe AS configured_preferred_naipe,
      NULLIF(court_item.value -> 'sport_preference' ->> 'preferred_division', '')::public.team_division AS preferred_division,
      COALESCE(court_item.value -> 'sport_preference' ->> 'sequence_mode', 'FLEXIBLE') AS sequence_mode
    FROM jsonb_array_elements(COALESCE(job_record.payload -> 'schedule_days', '[]'::jsonb)) WITH ORDINALITY day_item(value, ordinality)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(day_item.value -> 'locations', '[]'::jsonb)) WITH ORDINALITY location_item(value, ordinality)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(location_item.value -> 'courts', '[]'::jsonb)) WITH ORDINALITY court_item(value, ordinality)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_array_length(COALESCE(court_item.value -> 'sport_match_targets', '[]'::jsonb)) > 0
        THEN court_item.value -> 'sport_match_targets'
        ELSE COALESCE(court_item.value -> 'sport_ids', '[]'::jsonb)
      END
    ) sport_item(value)
  ), generated_slots AS (
    SELECT
      court_sports.*,
      free_interval.start_at,
      slot_start,
      duration.duration_minutes,
      row_number() OVER (
        PARTITION BY court_sports.event_date, court_sports.court_key, court_sports.sport_id
        ORDER BY slot_start
      )::integer AS sequence_index
    FROM court_sports
    JOIN LATERAL (
      SELECT GREATEST(COALESCE(championship_sports.default_match_duration_minutes, 35), 1)::integer AS duration_minutes
      FROM public.championship_sports AS championship_sports
      WHERE championship_sports.championship_id = job_record.championship_id
        AND championship_sports.sport_id = court_sports.sport_id
      LIMIT 1
    ) duration ON true
    CROSS JOIN LATERAL championship_bracket_preview_private.resolve_court_free_intervals(
      job_record.payload,
      court_sports.event_date,
      court_sports.location_key,
      court_sports.court_key
    ) free_interval
    CROSS JOIN LATERAL generate_series(
      free_interval.start_at,
      free_interval.end_at - make_interval(mins => duration.duration_minutes),
      make_interval(mins => duration.duration_minutes)
    ) slot_start
  )
  SELECT
    _job_id,
    generated_slots.event_date,
    generated_slots.location_key,
    generated_slots.location_name,
    generated_slots.location_position,
    generated_slots.court_key,
    generated_slots.court_name,
    generated_slots.court_position,
    generated_slots.sport_id,
    generated_slots.slot_start,
    generated_slots.slot_start + make_interval(mins => generated_slots.duration_minutes),
    generated_slots.sequence_index,
    COALESCE(
      generated_slots.preferred_sport_id = generated_slots.sport_id,
      false
    ),
    CASE
      WHEN generated_slots.sequence_mode = 'GROUP_NAIPE'
        AND generated_slots.configured_preferred_naipe IS NOT NULL
        AND generated_slots.planned_match_count IS NOT NULL
        AND generated_slots.sequence_index > ceil(generated_slots.planned_match_count::numeric / 2)::integer
        AND generated_slots.sequence_index <= generated_slots.planned_match_count
      THEN CASE generated_slots.configured_preferred_naipe
        WHEN 'FEMININO'::public.match_naipe THEN 'MASCULINO'::public.match_naipe
        ELSE 'FEMININO'::public.match_naipe
      END
      ELSE generated_slots.configured_preferred_naipe
    END,
    generated_slots.preferred_division,
    generated_slots.sequence_mode,
    row_number() OVER (
      ORDER BY
        generated_slots.event_date,
        generated_slots.slot_start,
        generated_slots.location_position,
        generated_slots.court_position,
        CASE WHEN generated_slots.preferred_sport_id = generated_slots.sport_id THEN 0 ELSE 1 END,
        generated_slots.sport_id
    )
  FROM generated_slots
  WHERE generated_slots.planned_match_count IS NULL
    OR generated_slots.sequence_index <= generated_slots.planned_match_count
  ON CONFLICT DO NOTHING;

  UPDATE championship_bracket_preview_private.jobs
  SET
    total_slots = (
      SELECT count(*)
      FROM championship_bracket_preview_private.slots
      WHERE job_id = _job_id
    ),
    processed_slots = 0,
    updated_at = now()
  WHERE id = _job_id;
END;
$function$;

COMMENT ON FUNCTION championship_bracket_preview_private.rebuild_job_slots(UUID)
  IS 'Reconstrói os slots exatos por intervalo físico, usando false quando não existe modalidade preferencial.';
