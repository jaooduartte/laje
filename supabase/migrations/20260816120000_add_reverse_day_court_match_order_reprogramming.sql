CREATE OR REPLACE FUNCTION public.reverse_championship_bracket_day_court_match_order(
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
  season_year_value INTEGER;
  scheduled_date_value DATE;
  setup_payload JSONB;
  requested_court_count INTEGER;
  selected_court_count INTEGER;
  affected_match_count INTEGER;
  before_matches JSONB;
  after_matches JSONB;
BEGIN
  scheduled_date_value := NULLIF(_payload->>'scheduled_date', '')::date;

  IF scheduled_date_value IS NULL THEN
    RAISE EXCEPTION 'Informe a data para inverter a ordem dos jogos.';
  END IF;

  SELECT editions_table.championship_id, editions_table.season_year
  INTO championship_id_value, season_year_value
  FROM public.championship_bracket_editions AS editions_table
  WHERE editions_table.id = _bracket_edition_id
  FOR UPDATE;

  IF championship_id_value IS NULL THEN
    RAISE EXCEPTION 'Edição do chaveamento não encontrada.';
  END IF;

  CREATE TEMPORARY TABLE reverse_day_court_match_order_courts ON COMMIT DROP AS
  WITH requested_courts AS (
    SELECT DISTINCT value::uuid AS bracket_court_id
    FROM jsonb_array_elements_text(COALESCE(_payload->'bracket_court_ids', '[]'::jsonb))
  )
  SELECT
    courts_table.id AS bracket_court_id,
    locations_table.name AS location_name,
    courts_table.name AS court_name
  FROM requested_courts
  JOIN public.championship_bracket_courts AS courts_table
    ON courts_table.id = requested_courts.bracket_court_id
  JOIN public.championship_bracket_locations AS locations_table
    ON locations_table.id = courts_table.bracket_location_id
  JOIN public.championship_bracket_days AS days_table
    ON days_table.id = locations_table.bracket_day_id
  WHERE days_table.bracket_edition_id = _bracket_edition_id
    AND days_table.event_date = scheduled_date_value;

  SELECT count(*) INTO requested_court_count
  FROM (
    SELECT DISTINCT value
    FROM jsonb_array_elements_text(COALESCE(_payload->'bracket_court_ids', '[]'::jsonb))
  ) AS requested_courts;

  SELECT count(*) INTO selected_court_count
  FROM reverse_day_court_match_order_courts;

  IF requested_court_count = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos uma quadra para inverter a ordem dos jogos.';
  END IF;

  IF selected_court_count <> requested_court_count THEN
    RAISE EXCEPTION 'Uma ou mais quadras não pertencem à data selecionada da agenda.';
  END IF;

  PERFORM 1
  FROM public.matches AS matches_table
  WHERE matches_table.championship_id = championship_id_value
    AND matches_table.season_year = season_year_value
    AND matches_table.scheduled_date = scheduled_date_value
  FOR UPDATE;

  CREATE TEMPORARY TABLE reverse_day_court_match_order_slots ON COMMIT DROP AS
  WITH ordered_matches AS (
    SELECT
      matches_table.id,
      courts_table.bracket_court_id,
      matches_table.scheduled_date,
      matches_table.start_time,
      matches_table.end_time,
      matches_table.queue_position,
      matches_table.scheduled_slot,
      matches_table.global_queue_order,
      row_number() OVER (
        PARTITION BY courts_table.bracket_court_id
        ORDER BY
          matches_table.start_time ASC NULLS LAST,
          COALESCE(matches_table.scheduled_slot, matches_table.queue_position) ASC NULLS LAST,
          matches_table.global_queue_order ASC NULLS LAST,
          matches_table.created_at ASC,
          matches_table.id ASC
      ) AS sequence_position,
      count(*) OVER (PARTITION BY courts_table.bracket_court_id) AS sequence_length
    FROM public.matches AS matches_table
    JOIN reverse_day_court_match_order_courts AS courts_table
      ON public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(courts_table.location_name)
      AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(courts_table.court_name)
    WHERE matches_table.championship_id = championship_id_value
      AND matches_table.season_year = season_year_value
      AND matches_table.scheduled_date = scheduled_date_value
      AND matches_table.status = 'SCHEDULED'::public.match_status
  )
  SELECT
    source_match.id AS source_match_id,
    target_match.id AS target_match_id,
    target_match.start_time AS target_start_time,
    target_match.end_time AS target_end_time,
    target_match.queue_position AS target_queue_position,
    target_match.scheduled_slot AS target_scheduled_slot,
    target_match.global_queue_order AS target_global_queue_order
  FROM ordered_matches AS source_match
  JOIN ordered_matches AS target_match
    ON target_match.bracket_court_id = source_match.bracket_court_id
    AND target_match.sequence_position = source_match.sequence_length - source_match.sequence_position + 1
  WHERE source_match.id <> target_match.id;

  SELECT count(*) INTO affected_match_count
  FROM reverse_day_court_match_order_slots;

  IF affected_match_count = 0 THEN
    RAISE EXCEPTION 'Não há ao menos dois jogos agendados nas quadras selecionadas para inverter.';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'match_id', matches_table.id,
    'scheduled_date', matches_table.scheduled_date,
    'start_time', matches_table.start_time,
    'end_time', matches_table.end_time,
    'queue_position', matches_table.queue_position,
    'scheduled_slot', matches_table.scheduled_slot,
    'global_queue_order', matches_table.global_queue_order
  ) ORDER BY matches_table.id), '[]'::jsonb)
  INTO before_matches
  FROM public.matches AS matches_table
  JOIN reverse_day_court_match_order_slots AS slots_table
    ON slots_table.source_match_id = matches_table.id;

  PERFORM set_config('app.skip_queue_trigger', 'true', true);
  PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);

  BEGIN
    UPDATE public.matches AS matches_table
    SET
      start_time = matches_table.start_time + make_interval(days => 3650),
      end_time = CASE
        WHEN matches_table.end_time IS NULL THEN NULL
        ELSE matches_table.end_time + make_interval(days => 3650)
      END,
      queue_position = CASE
        WHEN matches_table.queue_position IS NULL THEN NULL
        ELSE matches_table.queue_position + 1000000
      END,
      scheduled_slot = CASE
        WHEN matches_table.scheduled_slot IS NULL THEN NULL
        ELSE matches_table.scheduled_slot + 1000000
      END,
      global_queue_order = CASE
        WHEN matches_table.global_queue_order IS NULL THEN NULL
        ELSE matches_table.global_queue_order + 1000000
      END
    FROM reverse_day_court_match_order_slots AS slots_table
    WHERE matches_table.id = slots_table.source_match_id;

    UPDATE public.matches AS matches_table
    SET
      start_time = slots_table.target_start_time,
      end_time = slots_table.target_end_time,
      queue_position = slots_table.target_queue_position,
      scheduled_slot = slots_table.target_scheduled_slot,
      global_queue_order = slots_table.target_global_queue_order
    FROM reverse_day_court_match_order_slots AS slots_table
    WHERE matches_table.id = slots_table.source_match_id;

    PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
    PERFORM set_config('app.skip_queue_trigger', 'false', true);

    IF EXISTS (
      SELECT 1
      FROM public.matches AS matches_table
      JOIN reverse_day_court_match_order_slots AS slots_table
        ON slots_table.source_match_id = matches_table.id
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.championship_bracket_days AS days_table
        JOIN public.championship_bracket_locations AS locations_table
          ON locations_table.bracket_day_id = days_table.id
        JOIN public.championship_bracket_courts AS courts_table
          ON courts_table.bracket_location_id = locations_table.id
        JOIN public.championship_bracket_court_sports AS court_sports_table
          ON court_sports_table.bracket_court_id = courts_table.id
        WHERE days_table.bracket_edition_id = _bracket_edition_id
          AND days_table.event_date = matches_table.scheduled_date
          AND court_sports_table.sport_id = matches_table.sport_id
          AND public.normalize_bracket_entity_name(locations_table.name) = public.normalize_bracket_entity_name(matches_table.location)
          AND public.normalize_bracket_entity_name(courts_table.name) = public.normalize_bracket_entity_name(matches_table.court_name)
          AND matches_table.start_time >= make_timestamptz(
            EXTRACT(YEAR FROM days_table.event_date)::integer,
            EXTRACT(MONTH FROM days_table.event_date)::integer,
            EXTRACT(DAY FROM days_table.event_date)::integer,
            EXTRACT(HOUR FROM days_table.start_time)::integer,
            EXTRACT(MINUTE FROM days_table.start_time)::integer,
            0,
            'America/Sao_Paulo'
          )
          AND COALESCE(
            matches_table.end_time,
            matches_table.start_time + make_interval(mins => GREATEST(COALESCE(public.resolve_championship_sport_duration_minutes(matches_table.championship_id, matches_table.sport_id), 35), 1))
          ) <= make_timestamptz(
            EXTRACT(YEAR FROM days_table.event_date)::integer,
            EXTRACT(MONTH FROM days_table.event_date)::integer,
            EXTRACT(DAY FROM days_table.event_date)::integer,
            EXTRACT(HOUR FROM days_table.end_time)::integer,
            EXTRACT(MINUTE FROM days_table.end_time)::integer,
            0,
            'America/Sao_Paulo'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.championship_bracket_day_breaks AS breaks_table
            WHERE breaks_table.bracket_day_id = days_table.id
              AND (
                breaks_table.scope_type = 'ALL_COURTS'
                OR (breaks_table.scope_type = 'COURT' AND breaks_table.bracket_court_id = courts_table.id)
              )
              AND matches_table.start_time < make_timestamptz(
                EXTRACT(YEAR FROM days_table.event_date)::integer,
                EXTRACT(MONTH FROM days_table.event_date)::integer,
                EXTRACT(DAY FROM days_table.event_date)::integer,
                EXTRACT(HOUR FROM breaks_table.break_end_time)::integer,
                EXTRACT(MINUTE FROM breaks_table.break_end_time)::integer,
                0,
                'America/Sao_Paulo'
              )
              AND COALESCE(
                matches_table.end_time,
                matches_table.start_time + make_interval(mins => GREATEST(COALESCE(public.resolve_championship_sport_duration_minutes(matches_table.championship_id, matches_table.sport_id), 35), 1))
              ) > make_timestamptz(
                EXTRACT(YEAR FROM days_table.event_date)::integer,
                EXTRACT(MONTH FROM days_table.event_date)::integer,
                EXTRACT(DAY FROM days_table.event_date)::integer,
                EXTRACT(HOUR FROM breaks_table.break_start_time)::integer,
                EXTRACT(MINUTE FROM breaks_table.break_start_time)::integer,
                0,
                'America/Sao_Paulo'
              )
          )
      )
    ) THEN
      RAISE EXCEPTION 'A inversão não respeita a agenda configurada para modalidade, quadra ou intervalo.';
    END IF;

    setup_payload := public.get_championship_setup_payload_snapshot(championship_id_value, season_year_value);

    IF setup_payload IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.matches AS matches_table
      JOIN reverse_day_court_match_order_slots AS slots_table
        ON slots_table.source_match_id = matches_table.id
      CROSS JOIN LATERAL (
        SELECT format(
          '%s::%s::%s',
          matches_table.sport_id,
          matches_table.naipe,
          COALESCE(matches_table.division::text, 'WITHOUT_DIVISION')
        ) AS competition_key
      ) AS competition_table
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.resolve_championship_bracket_competition_schedule_windows(
          setup_payload,
          competition_table.competition_key,
          matches_table.scheduled_date
        ) AS windows_table
        WHERE matches_table.start_time >= windows_table.window_start_at
          AND COALESCE(
            matches_table.end_time,
            matches_table.start_time + make_interval(mins => GREATEST(COALESCE(public.resolve_championship_sport_duration_minutes(matches_table.championship_id, matches_table.sport_id), 35), 1))
          ) <= windows_table.window_end_at
      )
      OR NOT EXISTS (
        SELECT 1
        FROM public.resolve_championship_bracket_team_schedule_windows(
          setup_payload,
          matches_table.home_team_id,
          competition_table.competition_key,
          matches_table.scheduled_date
        ) AS windows_table
        WHERE matches_table.start_time >= windows_table.window_start_at
          AND COALESCE(
            matches_table.end_time,
            matches_table.start_time + make_interval(mins => GREATEST(COALESCE(public.resolve_championship_sport_duration_minutes(matches_table.championship_id, matches_table.sport_id), 35), 1))
          ) <= windows_table.window_end_at
      )
      OR NOT EXISTS (
        SELECT 1
        FROM public.resolve_championship_bracket_team_schedule_windows(
          setup_payload,
          matches_table.away_team_id,
          competition_table.competition_key,
          matches_table.scheduled_date
        ) AS windows_table
        WHERE matches_table.start_time >= windows_table.window_start_at
          AND COALESCE(
            matches_table.end_time,
            matches_table.start_time + make_interval(mins => GREATEST(COALESCE(public.resolve_championship_sport_duration_minutes(matches_table.championship_id, matches_table.sport_id), 35), 1))
          ) <= windows_table.window_end_at
      )
    ) THEN
      RAISE EXCEPTION 'A inversão não respeita a disponibilidade configurada da modalidade ou das atléticas.';
    END IF;

    IF EXISTS (
      WITH ordered_matches AS (
        SELECT
          matches_table.id,
          matches_table.scheduled_date,
          matches_table.location,
          matches_table.court_name,
          matches_table.sport_id,
          matches_table.naipe,
          matches_table.home_team_id,
          matches_table.away_team_id,
          matches_table.start_time,
          COALESCE(
            matches_table.end_time,
            matches_table.start_time + make_interval(mins => GREATEST(COALESCE(public.resolve_championship_sport_duration_minutes(matches_table.championship_id, matches_table.sport_id), 35), 1))
          ) AS end_time,
          row_number() OVER (
            PARTITION BY matches_table.scheduled_date, public.normalize_bracket_entity_name(matches_table.location), public.normalize_bracket_entity_name(matches_table.court_name)
            ORDER BY matches_table.start_time ASC NULLS LAST, COALESCE(matches_table.scheduled_slot, matches_table.queue_position) ASC NULLS LAST, matches_table.created_at ASC, matches_table.id ASC
          ) AS court_position,
          EXISTS (
            SELECT 1
            FROM public.championship_bracket_matches AS bracket_matches_table
            WHERE bracket_matches_table.match_id = matches_table.id
              AND bracket_matches_table.group_id IS NULL
          ) AS is_knockout
        FROM public.matches AS matches_table
        WHERE matches_table.championship_id = championship_id_value
          AND matches_table.season_year = season_year_value
          AND matches_table.status = 'SCHEDULED'::public.match_status
          AND matches_table.scheduled_date = scheduled_date_value
      )
      SELECT 1
      FROM ordered_matches AS first_match
      JOIN reverse_day_court_match_order_courts AS courts_table
        ON public.normalize_bracket_entity_name(first_match.location) = public.normalize_bracket_entity_name(courts_table.location_name)
        AND public.normalize_bracket_entity_name(first_match.court_name) = public.normalize_bracket_entity_name(courts_table.court_name)
      JOIN ordered_matches AS second_match
        ON second_match.id <> first_match.id
        AND second_match.scheduled_date = first_match.scheduled_date
        AND second_match.naipe = first_match.naipe
        AND (
          second_match.home_team_id IN (first_match.home_team_id, first_match.away_team_id)
          OR second_match.away_team_id IN (first_match.home_team_id, first_match.away_team_id)
        )
      WHERE NOT first_match.is_knockout
        AND (
          CASE
            WHEN public.normalize_bracket_entity_name(first_match.location) = public.normalize_bracket_entity_name(second_match.location)
              AND public.normalize_bracket_entity_name(first_match.court_name) = public.normalize_bracket_entity_name(second_match.court_name)
            THEN abs(first_match.court_position - second_match.court_position) < CASE WHEN first_match.sport_id = second_match.sport_id THEN 3 ELSE 2 END
            ELSE abs(EXTRACT(EPOCH FROM (second_match.start_time - first_match.start_time)) / 60.0)
              < GREATEST(
                EXTRACT(EPOCH FROM (first_match.end_time - first_match.start_time)) / 60.0,
                EXTRACT(EPOCH FROM (second_match.end_time - second_match.start_time)) / 60.0,
                1
              ) * CASE WHEN first_match.sport_id = second_match.sport_id THEN 3 ELSE 2 END
          END
        )
    ) THEN
      RAISE EXCEPTION 'A inversão não preserva o descanso exigido entre as atléticas envolvidas.';
    END IF;

    IF EXISTS (
      WITH ordered_matches AS (
        SELECT
          matches_table.id,
          matches_table.scheduled_date,
          matches_table.location,
          matches_table.court_name,
          matches_table.home_team_id,
          matches_table.away_team_id,
          matches_table.manual_representation_mode,
          row_number() OVER (
            PARTITION BY matches_table.scheduled_date, public.normalize_bracket_entity_name(matches_table.location), public.normalize_bracket_entity_name(matches_table.court_name)
            ORDER BY matches_table.start_time ASC NULLS LAST, COALESCE(matches_table.scheduled_slot, matches_table.queue_position) ASC NULLS LAST, matches_table.created_at ASC, matches_table.id ASC
          ) AS court_position
        FROM public.matches AS matches_table
        WHERE matches_table.championship_id = championship_id_value
          AND matches_table.season_year = season_year_value
          AND matches_table.status = 'SCHEDULED'::public.match_status
          AND matches_table.scheduled_date = scheduled_date_value
      )
      SELECT 1
      FROM ordered_matches AS current_match
      JOIN reverse_day_court_match_order_courts AS courts_table
        ON public.normalize_bracket_entity_name(current_match.location) = public.normalize_bracket_entity_name(courts_table.location_name)
        AND public.normalize_bracket_entity_name(current_match.court_name) = public.normalize_bracket_entity_name(courts_table.court_name)
      JOIN ordered_matches AS previous_match
        ON previous_match.scheduled_date = current_match.scheduled_date
        AND public.normalize_bracket_entity_name(previous_match.location) = public.normalize_bracket_entity_name(current_match.location)
        AND public.normalize_bracket_entity_name(previous_match.court_name) = public.normalize_bracket_entity_name(current_match.court_name)
        AND previous_match.court_position = current_match.court_position - 1
      WHERE COALESCE(current_match.manual_representation_mode, 'AUTO') != 'CO'
        AND (
          previous_match.home_team_id IN (current_match.home_team_id, current_match.away_team_id)
          OR previous_match.away_team_id IN (current_match.home_team_id, current_match.away_team_id)
        )
    ) THEN
      RAISE EXCEPTION 'A inversão cria conflito de representação na mesma quadra.';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
    PERFORM set_config('app.skip_queue_trigger', 'false', true);
    RAISE;
  END;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'match_id', matches_table.id,
    'scheduled_date', matches_table.scheduled_date,
    'start_time', matches_table.start_time,
    'end_time', matches_table.end_time,
    'queue_position', matches_table.queue_position,
    'scheduled_slot', matches_table.scheduled_slot,
    'global_queue_order', matches_table.global_queue_order
  ) ORDER BY matches_table.id), '[]'::jsonb)
  INTO after_matches
  FROM public.matches AS matches_table
  JOIN reverse_day_court_match_order_slots AS slots_table
    ON slots_table.source_match_id = matches_table.id;

  PERFORM public.write_admin_action_log(
    'UPDATE'::public.admin_action_type,
    'matches',
    _bracket_edition_id::text,
    'Inverteu a ordem dos jogos agendados por quadra.',
    before_matches,
    after_matches,
    jsonb_build_object(
      'scheduled_date', scheduled_date_value,
      'bracket_court_ids', COALESCE(_payload->'bracket_court_ids', '[]'::jsonb),
      'affected_match_count', affected_match_count
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_championship_bracket_reconfiguration(
  _bracket_edition_id UUID,
  _action TEXT,
  _payload JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  CASE _action
    WHEN 'DAY_SCHEDULE' THEN
      PERFORM public.update_bracket_day_schedule(
        _bracket_edition_id,
        COALESCE(_payload->'schedule_updates', '[]'::jsonb)
      );
    WHEN 'REVERSE_DAY_COURT_MATCH_ORDER' THEN
      PERFORM public.reverse_championship_bracket_day_court_match_order(
        _bracket_edition_id,
        COALESCE(_payload, '{}'::jsonb)
      );
    WHEN 'COMPETITION_SETTINGS' THEN
      PERFORM public.update_bracket_competition_settings(
        (_payload->>'competition_id')::uuid,
        (_payload->>'qualifiers_per_group')::integer,
        COALESCE((_payload->>'should_complete_knockout_with_best_second_placed_teams')::boolean, false),
        COALESCE(_payload->>'knockout_pairing_mode', 'LINEAR')
      );
    WHEN 'LOCATION_SPORT_PRIORITIES' THEN
      PERFORM public.update_bracket_location_sport_priorities(
        _bracket_edition_id,
        COALESCE(_payload->'priority_updates', '[]'::jsonb)
      );
    WHEN 'KNOCKOUT_COURT_PRIORITIES' THEN
      PERFORM public.update_bracket_knockout_court_priorities(
        _bracket_edition_id,
        COALESCE(_payload->'priority_updates', '[]'::jsonb)
      );
    WHEN 'LOCATION_GROUP' THEN
      PERFORM public.update_bracket_generated_location_group(_bracket_edition_id, _payload);
    ELSE
      RAISE EXCEPTION 'Tipo de reprogramação inválido.';
  END CASE;
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

DROP TRIGGER IF EXISTS matches_bump_championship_bracket_reprogramming_revision ON public.matches;
CREATE TRIGGER matches_bump_championship_bracket_reprogramming_revision
AFTER UPDATE OF scheduled_date, start_time, end_time, location, court_name, queue_position, global_queue_order, scheduled_slot ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.bump_championship_bracket_reprogramming_revision();

REVOKE ALL ON FUNCTION public.reverse_championship_bracket_day_court_match_order(UUID, JSONB) FROM PUBLIC, anon, authenticated;
