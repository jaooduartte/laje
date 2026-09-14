SELECT set_config('app.skip_queue_trigger', 'true', true);
SELECT set_config('app.skip_match_conflict_trigger', 'true', true);

UPDATE public.matches AS matches_table
SET scheduled_start_time = reservations_table.start_at
FROM public.championship_bracket_matches AS bracket_matches_table
JOIN public.championship_bracket_knockout_schedule_reservations AS reservations_table
  ON reservations_table.bracket_edition_id = bracket_matches_table.bracket_edition_id
  AND reservations_table.competition_id = bracket_matches_table.competition_id
  AND reservations_table.round_number = bracket_matches_table.round_number
  AND reservations_table.slot_number = bracket_matches_table.slot_number
  AND reservations_table.is_third_place = bracket_matches_table.is_third_place
WHERE bracket_matches_table.match_id = matches_table.id
  AND matches_table.status = 'SCHEDULED'::public.match_status
  AND matches_table.scheduled_date >= timezone('America/Sao_Paulo', now())::DATE
  AND matches_table.start_time > now()
  AND matches_table.start_time IS NOT DISTINCT FROM reservations_table.start_at
  AND matches_table.scheduled_start_time IS DISTINCT FROM reservations_table.start_at;

SELECT set_config('app.skip_match_conflict_trigger', 'false', true);
SELECT set_config('app.skip_queue_trigger', 'false', true);

CREATE OR REPLACE FUNCTION public.apply_operational_knockout_schedule_adjustment(
  _bracket_edition_id UUID,
  _payload JSONB,
  _expected_revision BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_item RECORD;
  preview_result JSONB;
  representation_adjustments JSONB;
  representation_adjustments_count INTEGER;
  updated_representation_count INTEGER;
BEGIN
  preview_result := public.preview_operational_knockout_schedule_adjustment(
    _bracket_edition_id,
    _payload
  );

  IF jsonb_array_length(COALESCE(preview_result->'blockers', '[]'::JSONB)) > 0 THEN
    RAISE EXCEPTION 'A prévia contém conflitos e não pode ser confirmada.';
  END IF;

  PERFORM public.apply_operational_knockout_schedule_adjustment_base(
    _bracket_edition_id,
    _payload,
    _expected_revision
  );

  PERFORM set_config('app.skip_queue_trigger', 'true', true);
  PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);

  UPDATE public.matches AS matches_table
  SET scheduled_start_time = (timeline_item.value->>'start_time')::TIMESTAMPTZ
  FROM jsonb_array_elements(COALESCE(preview_result->'timeline', '[]'::JSONB)) AS timeline_item(value)
  WHERE matches_table.id = NULLIF(timeline_item.value->>'match_id', '')::UUID
    AND matches_table.status = 'SCHEDULED'::public.match_status
    AND matches_table.scheduled_start_time IS DISTINCT FROM (timeline_item.value->>'start_time')::TIMESTAMPTZ;

  PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
  PERFORM set_config('app.skip_queue_trigger', 'false', true);

  preview_result := public.preview_operational_knockout_schedule_adjustment(
    _bracket_edition_id,
    _payload
  );
  representation_adjustments := COALESCE(
    preview_result->'representation_adjustments',
    '[]'::JSONB
  );

  SELECT count(*)::INTEGER
  INTO representation_adjustments_count
  FROM jsonb_array_elements(representation_adjustments);

  PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);

  UPDATE public.matches AS matches_table
  SET manual_representation_mode = 'CO'
  FROM (
    SELECT DISTINCT (adjustment.value->>'match_id')::UUID AS match_id
    FROM jsonb_array_elements(representation_adjustments) AS adjustment(value)
  ) AS adjustments
  WHERE matches_table.id = adjustments.match_id
    AND matches_table.status = 'SCHEDULED'::public.match_status
    AND COALESCE(matches_table.manual_representation_mode, 'AUTO') <> 'CO';

  GET DIAGNOSTICS updated_representation_count = ROW_COUNT;

  PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);

  IF updated_representation_count <> representation_adjustments_count THEN
    RAISE EXCEPTION 'Não foi possível forçar a representação da CO para todos os jogos planejados.';
  END IF;

  SELECT
    editions_table.championship_id,
    editions_table.season_year,
    reservations_table.scheduled_date,
    reservations_table.location_name,
    reservations_table.court_name
  INTO source_item
  FROM public.championship_bracket_editions AS editions_table
  JOIN public.championship_bracket_matches AS bracket_matches_table
    ON bracket_matches_table.bracket_edition_id = editions_table.id
  JOIN public.championship_bracket_knockout_schedule_reservations AS reservations_table
    ON reservations_table.bracket_edition_id = bracket_matches_table.bracket_edition_id
    AND reservations_table.competition_id = bracket_matches_table.competition_id
    AND reservations_table.round_number = bracket_matches_table.round_number
    AND reservations_table.slot_number = bracket_matches_table.slot_number
    AND reservations_table.is_third_place = bracket_matches_table.is_third_place
  WHERE editions_table.id = _bracket_edition_id
    AND bracket_matches_table.id = ((_payload->'bracket_match_ids'->>0)::UUID);

  IF source_item.championship_id IS NULL THEN
    RAISE EXCEPTION 'O item inicial não foi localizado após o ajuste operacional.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.championship_bracket_knockout_schedule_reservations AS reservations_table
      ON reservations_table.bracket_edition_id = bracket_matches_table.bracket_edition_id
      AND reservations_table.competition_id = bracket_matches_table.competition_id
      AND reservations_table.round_number = bracket_matches_table.round_number
      AND reservations_table.slot_number = bracket_matches_table.slot_number
      AND reservations_table.is_third_place = bracket_matches_table.is_third_place
    JOIN public.matches AS matches_table
      ON matches_table.championship_id = source_item.championship_id
      AND matches_table.season_year = source_item.season_year
      AND matches_table.status = 'SCHEDULED'::public.match_status
      AND matches_table.scheduled_date = reservations_table.scheduled_date
      AND public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(reservations_table.location_name)
      AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(reservations_table.court_name)
      AND matches_table.id IS DISTINCT FROM bracket_matches_table.match_id
      AND matches_table.start_time < reservations_table.end_at
      AND matches_table.end_time > reservations_table.start_at
    WHERE bracket_matches_table.bracket_edition_id = _bracket_edition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_bye IS NOT TRUE
      AND reservations_table.scheduled_date = source_item.scheduled_date
      AND public.normalize_bracket_entity_name(reservations_table.location_name) = public.normalize_bracket_entity_name(source_item.location_name)
      AND public.normalize_bracket_entity_name(reservations_table.court_name) = public.normalize_bracket_entity_name(source_item.court_name)
      AND reservations_table.start_at > now()
  ) THEN
    RAISE EXCEPTION 'A programação ajustada sobrepõe outra partida agendada na mesma quadra.';
  END IF;

  IF representation_adjustments_count > 0 THEN
    PERFORM public.write_admin_action_log(
      'UPDATE'::public.admin_action_type,
      'public.matches',
      _bracket_edition_id::TEXT,
      'Forçou a representação da CO para conflitos consecutivos na mesma quadra.',
      jsonb_build_object('representation_adjustments', representation_adjustments),
      jsonb_build_object('representation_adjustments', representation_adjustments),
      jsonb_build_object(
        'championship_id', source_item.championship_id,
        'season_year', source_item.season_year,
        'reprogramming_revision', _expected_revision
      )
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
    PERFORM set_config('app.skip_queue_trigger', 'false', true);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_operational_knockout_schedule_adjustment(UUID, JSONB, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_operational_knockout_schedule_adjustment(UUID, JSONB, BIGINT) TO authenticated;

NOTIFY pgrst, 'reload schema';
