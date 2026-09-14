CREATE OR REPLACE FUNCTION public.preview_operational_knockout_schedule_adjustment(
  _bracket_edition_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  preview_result JSONB;
  blockers JSONB;
  representation_adjustments JSONB;
BEGIN
  preview_result := public.preview_operational_knockout_schedule_adjustment_base(
    _bracket_edition_id,
    _payload
  );

  SELECT COALESCE(jsonb_agg(blocker.value), '[]'::JSONB)
  INTO blockers
  FROM jsonb_array_elements(COALESCE(preview_result->'blockers', '[]'::JSONB)) AS blocker(value)
  WHERE blocker.value #>> '{}' <> 'A sequência planejada cria conflito de representação na mesma quadra.';

  WITH projected_matches AS (
    SELECT
      operational_items.match_id,
      operational_items.bracket_match_id,
      operational_items.home_team_id,
      operational_items.away_team_id,
      operational_items.sport_name,
      operational_items.naipe,
      operational_items.division,
      operational_items.scheduled_date,
      operational_items.location_name,
      operational_items.court_name,
      operational_items.planned_start_at AS start_time,
      operational_items.scheduled_slot,
      operational_items.queue_position,
      operational_items.manual_representation_mode,
      matches_table.created_at
    FROM operational_knockout_schedule_items AS operational_items
    JOIN public.matches AS matches_table
      ON matches_table.id = operational_items.match_id
    WHERE operational_items.match_id IS NOT NULL
  ),
  scoped_matches AS (
    SELECT *
    FROM projected_matches

    UNION ALL

    SELECT
      matches_table.id,
      NULL::UUID,
      matches_table.home_team_id,
      matches_table.away_team_id,
      sports_table.name,
      matches_table.naipe,
      matches_table.division,
      matches_table.scheduled_date,
      matches_table.location,
      matches_table.court_name,
      matches_table.start_time,
      matches_table.scheduled_slot,
      matches_table.queue_position,
      matches_table.manual_representation_mode,
      matches_table.created_at
    FROM public.matches AS matches_table
    JOIN public.sports AS sports_table
      ON sports_table.id = matches_table.sport_id
    WHERE matches_table.championship_id = (
        SELECT editions_table.championship_id
        FROM public.championship_bracket_editions AS editions_table
        WHERE editions_table.id = _bracket_edition_id
      )
      AND matches_table.season_year = (
        SELECT editions_table.season_year
        FROM public.championship_bracket_editions AS editions_table
        WHERE editions_table.id = _bracket_edition_id
      )
      AND matches_table.status = 'SCHEDULED'::public.match_status
      AND EXISTS (
        SELECT 1
        FROM operational_knockout_schedule_items AS operational_items
        WHERE matches_table.scheduled_date = operational_items.scheduled_date
          AND public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(operational_items.location_name)
          AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(operational_items.court_name)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM operational_knockout_schedule_items AS operational_items
        WHERE operational_items.match_id = matches_table.id
      )
  ),
  ordered_matches AS (
    SELECT
      scoped_matches.*,
      lag(scoped_matches.match_id) OVER court_order AS previous_match_id,
      lag(scoped_matches.home_team_id) OVER court_order AS previous_home_team_id,
      lag(scoped_matches.away_team_id) OVER court_order AS previous_away_team_id
    FROM scoped_matches
    WINDOW court_order AS (
      PARTITION BY
        scoped_matches.scheduled_date,
        public.normalize_bracket_entity_name(scoped_matches.location_name),
        public.normalize_bracket_entity_name(scoped_matches.court_name)
      ORDER BY
        CASE WHEN scoped_matches.start_time IS NULL THEN 1 ELSE 0 END,
        scoped_matches.start_time ASC NULLS LAST,
        COALESCE(scoped_matches.scheduled_slot, scoped_matches.queue_position) ASC NULLS LAST,
        COALESCE(scoped_matches.queue_position, scoped_matches.scheduled_slot) ASC NULLS LAST,
        scoped_matches.created_at ASC,
        scoped_matches.match_id ASC
    )
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'match_id', match_id,
      'bracket_match_id', bracket_match_id,
      'previous_match_id', previous_match_id,
      'sport_name', sport_name,
      'naipe', naipe,
      'division', division,
      'scheduled_date', scheduled_date,
      'location', location_name,
      'court_name', court_name,
      'representation_mode', 'CO'
    )
    ORDER BY start_time, queue_position, scheduled_slot, match_id
  ), '[]'::JSONB)
  INTO representation_adjustments
  FROM ordered_matches
  WHERE COALESCE(manual_representation_mode, 'AUTO') <> 'CO'
    AND previous_match_id IS NOT NULL
    AND (
      previous_home_team_id IN (home_team_id, away_team_id)
      OR previous_away_team_id IN (home_team_id, away_team_id)
    );

  IF EXISTS (
    SELECT 1
    FROM operational_knockout_schedule_items AS operational_items
    JOIN public.matches AS matches_table
      ON matches_table.championship_id = (
          SELECT editions_table.championship_id
          FROM public.championship_bracket_editions AS editions_table
          WHERE editions_table.id = _bracket_edition_id
        )
      AND matches_table.season_year = (
          SELECT editions_table.season_year
          FROM public.championship_bracket_editions AS editions_table
          WHERE editions_table.id = _bracket_edition_id
        )
      AND matches_table.status = 'SCHEDULED'::public.match_status
      AND matches_table.scheduled_date = operational_items.scheduled_date
      AND public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(operational_items.location_name)
      AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(operational_items.court_name)
      AND matches_table.id IS DISTINCT FROM operational_items.match_id
      AND NOT EXISTS (
        SELECT 1
        FROM operational_knockout_schedule_items AS projected_items
        WHERE projected_items.match_id = matches_table.id
      )
      AND matches_table.start_time < operational_items.planned_end_at
      AND matches_table.end_time > operational_items.planned_start_at
  ) THEN
    blockers := blockers || jsonb_build_array('A programação planejada sobrepõe outra partida agendada na mesma quadra.');
  END IF;

  preview_result := jsonb_set(preview_result, '{blockers}', blockers);

  RETURN jsonb_set(
    preview_result,
    '{representation_adjustments}',
    representation_adjustments
  );
END;
$$;

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
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_operational_knockout_schedule_adjustment(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_operational_knockout_schedule_adjustment(UUID, JSONB, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_operational_knockout_schedule_adjustment(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_operational_knockout_schedule_adjustment(UUID, JSONB, BIGINT) TO authenticated;

NOTIFY pgrst, 'reload schema';
