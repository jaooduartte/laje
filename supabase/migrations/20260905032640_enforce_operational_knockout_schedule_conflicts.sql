ALTER FUNCTION public.preview_operational_knockout_schedule_adjustment(UUID, JSONB)
RENAME TO preview_operational_knockout_schedule_adjustment_base;

ALTER FUNCTION public.apply_operational_knockout_schedule_adjustment(UUID, JSONB, BIGINT)
RENAME TO apply_operational_knockout_schedule_adjustment_base;

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
BEGIN
  preview_result := public.preview_operational_knockout_schedule_adjustment_base(
    _bracket_edition_id,
    _payload
  );
  blockers := COALESCE(preview_result->'blockers', '[]'::JSONB);

  IF EXISTS (
    WITH projected_matches AS (
      SELECT
        operational_items.match_id AS id,
        operational_items.home_team_id,
        operational_items.away_team_id,
        operational_items.planned_start_at AS start_time,
        operational_items.scheduled_slot,
        operational_items.queue_position,
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
        matches_table.home_team_id,
        matches_table.away_team_id,
        matches_table.start_time,
        matches_table.scheduled_slot,
        matches_table.queue_position,
        matches_table.created_at
      FROM public.matches AS matches_table
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
        AND matches_table.id NOT IN (
          SELECT match_id
          FROM operational_knockout_schedule_items
          WHERE match_id IS NOT NULL
        )
    ),
    ordered_matches AS (
      SELECT
        scoped_matches.*,
        lag(home_team_id) OVER match_order AS previous_home_team_id,
        lag(away_team_id) OVER match_order AS previous_away_team_id,
        lead(home_team_id) OVER match_order AS next_home_team_id,
        lead(away_team_id) OVER match_order AS next_away_team_id
      FROM scoped_matches
      WINDOW match_order AS (
        ORDER BY
          CASE WHEN start_time IS NULL THEN 1 ELSE 0 END,
          start_time ASC NULLS LAST,
          COALESCE(scheduled_slot, queue_position) ASC NULLS LAST,
          COALESCE(queue_position, scheduled_slot) ASC NULLS LAST,
          created_at ASC,
          id ASC
      )
    )
    SELECT 1
    FROM ordered_matches
    WHERE previous_home_team_id IN (home_team_id, away_team_id)
      OR previous_away_team_id IN (home_team_id, away_team_id)
      OR next_home_team_id IN (home_team_id, away_team_id)
      OR next_away_team_id IN (home_team_id, away_team_id)
  ) THEN
    blockers := blockers || jsonb_build_array('A sequência planejada cria conflito de representação na mesma quadra.');
  END IF;

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
      AND matches_table.id NOT IN (
        SELECT match_id
        FROM operational_knockout_schedule_items
        WHERE match_id IS NOT NULL
      )
      AND matches_table.start_time < operational_items.planned_end_at
      AND matches_table.end_time > operational_items.planned_start_at
  ) THEN
    blockers := blockers || jsonb_build_array('A programação planejada sobrepõe outra partida agendada na mesma quadra.');
  END IF;

  RETURN jsonb_set(preview_result, '{blockers}', blockers);
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
  scheduled_match RECORD;
  court_sequence_conflict_message TEXT;
  preview_result JSONB;
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

  FOR scheduled_match IN
    SELECT
      matches_table.id,
      matches_table.championship_id,
      matches_table.season_year,
      matches_table.scheduled_date,
      matches_table.location,
      matches_table.court_name,
      matches_table.start_time,
      matches_table.scheduled_slot,
      matches_table.queue_position,
      matches_table.created_at,
      matches_table.home_team_id,
      matches_table.away_team_id
    FROM public.matches AS matches_table
    WHERE matches_table.championship_id = source_item.championship_id
      AND matches_table.season_year = source_item.season_year
      AND matches_table.status = 'SCHEDULED'::public.match_status
      AND matches_table.scheduled_date = source_item.scheduled_date
      AND public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(source_item.location_name)
      AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(source_item.court_name)
    FOR UPDATE
  LOOP
    court_sequence_conflict_message := public.resolve_scheduled_match_court_sequence_conflict(
      scheduled_match.championship_id,
      scheduled_match.season_year,
      scheduled_match.scheduled_date,
      scheduled_match.location,
      scheduled_match.court_name,
      scheduled_match.start_time,
      scheduled_match.scheduled_slot,
      scheduled_match.queue_position,
      scheduled_match.created_at,
      scheduled_match.id,
      scheduled_match.home_team_id,
      scheduled_match.away_team_id
    );

    IF court_sequence_conflict_message IS NOT NULL THEN
      RAISE EXCEPTION '%', court_sequence_conflict_message;
    END IF;
  END LOOP;

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
END;
$$;

REVOKE ALL ON FUNCTION public.preview_operational_knockout_schedule_adjustment_base(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_operational_knockout_schedule_adjustment_base(UUID, JSONB, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_operational_knockout_schedule_adjustment(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_operational_knockout_schedule_adjustment(UUID, JSONB, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_operational_knockout_schedule_adjustment(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_operational_knockout_schedule_adjustment(UUID, JSONB, BIGINT) TO authenticated;

NOTIFY pgrst, 'reload schema';
