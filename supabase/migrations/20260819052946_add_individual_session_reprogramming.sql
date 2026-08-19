CREATE OR REPLACE FUNCTION public.reprogram_championship_individual_session(
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
  edition_payload JSONB;

  session_id_value UUID;
  session_record public.championship_individual_sessions%ROWTYPE;

  scheduled_date_value DATE;
  start_time_value TIME;
  end_time_value TIME;

  location_group_id_value UUID;
  court_group_id_value UUID;

  bracket_day_id_value UUID;
  bracket_court_id_value UUID;

  day_start_time_value TIME;
  day_end_time_value TIME;

  location_name_value TEXT;
  court_name_value TEXT;

  exclusive_lock_enabled_value BOOLEAN;

  target_start_at TIMESTAMPTZ;
  target_end_at TIMESTAMPTZ;

  before_session JSONB;
  after_session JSONB;
BEGIN
  session_id_value :=
    NULLIF(_payload->>'session_id', '')::uuid;

  scheduled_date_value :=
    NULLIF(_payload->>'scheduled_date', '')::date;

  start_time_value :=
    NULLIF(_payload->>'start_time', '')::time;

  end_time_value :=
    NULLIF(_payload->>'end_time', '')::time;

  location_group_id_value :=
    NULLIF(_payload->>'location_group_id', '')::uuid;

  court_group_id_value :=
    NULLIF(_payload->>'court_group_id', '')::uuid;

  exclusive_lock_enabled_value :=
    COALESCE(
      (_payload->>'exclusive_lock_enabled')::boolean,
      false
    );

  IF session_id_value IS NULL THEN
    RAISE EXCEPTION 'Sessão individual inválida.';
  END IF;

  IF scheduled_date_value IS NULL THEN
    RAISE EXCEPTION 'Informe a data da sessão individual.';
  END IF;

  IF start_time_value IS NULL OR end_time_value IS NULL THEN
    RAISE EXCEPTION 'Informe o horário inicial e final da sessão.';
  END IF;

  IF end_time_value <= start_time_value THEN
    RAISE EXCEPTION 'O horário final deve ser maior que o horário inicial.';
  END IF;

  IF location_group_id_value IS NULL OR court_group_id_value IS NULL THEN
    RAISE EXCEPTION 'Selecione o local e a quadra da sessão.';
  END IF;

  SELECT
    editions_table.championship_id,
    editions_table.season_year,
    editions_table.payload_snapshot
  INTO
    championship_id_value,
    season_year_value,
    edition_payload
  FROM public.championship_bracket_editions AS editions_table
  JOIN public.championships AS championships_table
    ON championships_table.id = editions_table.championship_id
  WHERE editions_table.id = _bracket_edition_id
    AND championships_table.status =
      'REVIEW'::public.championship_status
  FOR UPDATE OF editions_table;

  IF championship_id_value IS NULL THEN
    RAISE EXCEPTION
      'A reprogramação só está disponível com o campeonato em revisão.';
  END IF;

  SELECT sessions_table.*
  INTO session_record
  FROM public.championship_individual_sessions AS sessions_table
  WHERE sessions_table.id = session_id_value
    AND sessions_table.championship_id = championship_id_value
    AND sessions_table.season_year = season_year_value
  FOR UPDATE;

  IF session_record.id IS NULL THEN
    RAISE EXCEPTION
      'Sessão individual não encontrada neste campeonato.';
  END IF;

  IF session_record.status IN (
    'LIVE'::public.championship_individual_session_status,
    'FINISHED'::public.championship_individual_session_status,
    'CANCELLED'::public.championship_individual_session_status
  ) THEN
    RAISE EXCEPTION
      'Esta sessão não pode mais ser reprogramada.';
  END IF;

  before_session := to_jsonb(session_record);

  SELECT
    days_table.id,
    days_table.start_time,
    days_table.end_time,
    locations_table.name,
    courts_table.id,
    courts_table.name
  INTO
    bracket_day_id_value,
    day_start_time_value,
    day_end_time_value,
    location_name_value,
    bracket_court_id_value,
    court_name_value
  FROM public.championship_bracket_days AS days_table
  JOIN public.championship_bracket_locations AS locations_table
    ON locations_table.bracket_day_id = days_table.id
  JOIN public.championship_bracket_courts AS courts_table
    ON courts_table.bracket_location_id = locations_table.id
  WHERE days_table.bracket_edition_id = _bracket_edition_id
    AND days_table.event_date = scheduled_date_value
    AND locations_table.location_group_id = location_group_id_value
    AND courts_table.court_group_id = court_group_id_value
  LIMIT 1;

  IF bracket_day_id_value IS NULL
    OR bracket_court_id_value IS NULL
  THEN
    RAISE EXCEPTION
      'O local ou a quadra selecionada não pertence à data informada.';
  END IF;

  IF start_time_value < day_start_time_value
    OR end_time_value > day_end_time_value
  THEN
    RAISE EXCEPTION
      'O horário da sessão precisa permanecer dentro da agenda do dia.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.championship_bracket_court_sports AS court_sports_table
    WHERE court_sports_table.bracket_court_id = bracket_court_id_value
      AND court_sports_table.sport_id = session_record.sport_id
  ) THEN
    RAISE EXCEPTION
      'A quadra selecionada não está habilitada para esta modalidade.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.championship_bracket_day_breaks AS breaks_table
    WHERE breaks_table.bracket_day_id = bracket_day_id_value
      AND (
        breaks_table.scope_type = 'ALL_COURTS'
        OR (
          breaks_table.scope_type = 'COURT'
          AND breaks_table.bracket_court_id = bracket_court_id_value
        )
      )
      AND start_time_value < breaks_table.break_end_time
      AND end_time_value > breaks_table.break_start_time
  ) THEN
    RAISE EXCEPTION
      'O horário da sessão conflita com um intervalo configurado.';
  END IF;

  target_start_at := make_timestamptz(
    EXTRACT(YEAR FROM scheduled_date_value)::integer,
    EXTRACT(MONTH FROM scheduled_date_value)::integer,
    EXTRACT(DAY FROM scheduled_date_value)::integer,
    EXTRACT(HOUR FROM start_time_value)::integer,
    EXTRACT(MINUTE FROM start_time_value)::integer,
    0,
    'America/Sao_Paulo'
  );

  target_end_at := make_timestamptz(
    EXTRACT(YEAR FROM scheduled_date_value)::integer,
    EXTRACT(MONTH FROM scheduled_date_value)::integer,
    EXTRACT(DAY FROM scheduled_date_value)::integer,
    EXTRACT(HOUR FROM end_time_value)::integer,
    EXTRACT(MINUTE FROM end_time_value)::integer,
    0,
    'America/Sao_Paulo'
  );

  IF exclusive_lock_enabled_value
    AND EXISTS (
      SELECT 1
      FROM public.matches AS matches_table
      WHERE matches_table.championship_id = championship_id_value
        AND matches_table.season_year = season_year_value
        AND matches_table.status =
          'SCHEDULED'::public.match_status
        AND matches_table.scheduled_date = scheduled_date_value
        AND public.normalize_bracket_entity_name(
          matches_table.location
        ) =
        public.normalize_bracket_entity_name(
          location_name_value
        )
        AND public.normalize_bracket_entity_name(
          COALESCE(matches_table.court_name, '')
        ) =
        public.normalize_bracket_entity_name(
          court_name_value
        )
        AND matches_table.start_time < target_end_at
        AND COALESCE(
          matches_table.end_time,
          matches_table.start_time
            + make_interval(
                mins => GREATEST(
                  COALESCE(
                    public.resolve_championship_sport_duration_minutes(
                      matches_table.championship_id,
                      matches_table.sport_id
                    ),
                    35
                  ),
                  1
                )
              )
        ) > target_start_at
    )
  THEN
    RAISE EXCEPTION
      'A reserva exclusiva da sessão conflita com um jogo já programado.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.championship_individual_sessions AS other_session
    WHERE other_session.id <> session_id_value
      AND other_session.championship_id = championship_id_value
      AND other_session.season_year = season_year_value
      AND other_session.status <>
        'CANCELLED'::public.championship_individual_session_status
      AND other_session.scheduled_date = scheduled_date_value
      AND other_session.location_key =
        location_group_id_value::text
      AND other_session.court_key =
        court_group_id_value::text
      AND other_session.start_time IS NOT NULL
      AND other_session.end_time IS NOT NULL
      AND (
        exclusive_lock_enabled_value
        OR other_session.exclusive_lock_enabled
      )
      AND start_time_value < other_session.end_time
      AND end_time_value > other_session.start_time
  ) THEN
    RAISE EXCEPTION
      'A sessão conflita com outra sessão que possui reserva exclusiva do recurso.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      COALESCE(
        edition_payload->'resource_locks',
        '[]'::jsonb
      )
    ) AS lock_record(value)
    WHERE lock_record.value->>'date' =
        scheduled_date_value::text
      AND lock_record.value->>'location_key' =
        location_group_id_value::text
      AND lock_record.value->>'court_key' =
        court_group_id_value::text
      AND COALESCE(
        lock_record.value->>'lock_mode',
        'FLEXIBLE'
      ) = 'HARD'
      AND start_time_value <
        NULLIF(
          lock_record.value->>'end_time',
          ''
        )::time
      AND end_time_value >
        NULLIF(
          lock_record.value->>'start_time',
          ''
        )::time
  ) THEN
    RAISE EXCEPTION
      'A sessão conflita com uma reserva fixa deste recurso.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      COALESCE(
        edition_payload->'individual_session_configs',
        '[]'::jsonb
      )
    ) AS config_record(value)
    WHERE config_record.value->>'sport_id' =
        session_record.sport_id::text
      AND config_record.value->>'naipe' =
        session_record.naipe::text
      AND COALESCE(
        NULLIF(config_record.value->>'division', ''),
        'WITHOUT_DIVISION'
      ) =
      COALESCE(
        session_record.division::text,
        'WITHOUT_DIVISION'
      )
  ) THEN
    RAISE EXCEPTION
      'A configuração original desta sessão não foi encontrada.';
  END IF;

  UPDATE public.championship_individual_sessions
  SET
    scheduled_date = scheduled_date_value,
    period = NULL,
    start_time = start_time_value,
    end_time = end_time_value,
    location_key = location_group_id_value::text,
    court_key = court_group_id_value::text,
    location_name = location_name_value,
    court_name = court_name_value,
    status =
      'SCHEDULED'::public.championship_individual_session_status,
    exclusive_lock_enabled = exclusive_lock_enabled_value,
    updated_at = now()
  WHERE id = session_id_value;

  UPDATE public.championship_individual_events
  SET
    scheduled_date = scheduled_date_value,
    period = NULL,
    location = location_name_value,
    status = CASE
      WHEN status =
        'FINISHED'::public.championship_individual_event_status
      THEN status
      ELSE
        'SCHEDULED'::public.championship_individual_event_status
    END,
    updated_at = now()
  WHERE session_id = session_id_value;

  UPDATE public.championship_bracket_editions AS editions_table
  SET
    payload_snapshot = jsonb_set(
      editions_table.payload_snapshot,
      '{individual_session_configs}',
      (
        SELECT COALESCE(
          jsonb_agg(
            CASE
              WHEN config_record.value->>'sport_id' =
                  session_record.sport_id::text
                AND config_record.value->>'naipe' =
                  session_record.naipe::text
                AND COALESCE(
                  NULLIF(
                    config_record.value->>'division',
                    ''
                  ),
                  'WITHOUT_DIVISION'
                ) =
                COALESCE(
                  session_record.division::text,
                  'WITHOUT_DIVISION'
                )
              THEN
                config_record.value
                || jsonb_build_object(
                  'scheduled_date',
                  scheduled_date_value::text,
                  'period',
                  NULL,
                  'start_time',
                  to_char(start_time_value, 'HH24:MI'),
                  'end_time',
                  to_char(end_time_value, 'HH24:MI'),
                  'location_key',
                  location_group_id_value::text,
                  'court_key',
                  court_group_id_value::text,
                  'location_name',
                  location_name_value,
                  'court_name',
                  court_name_value,
                  'exclusive_lock_enabled',
                  exclusive_lock_enabled_value
                )
              ELSE config_record.value
            END
            ORDER BY config_record.ordinality
          ),
          '[]'::jsonb
        )
        FROM jsonb_array_elements(
          COALESCE(
            editions_table.payload_snapshot
              ->'individual_session_configs',
            '[]'::jsonb
          )
        ) WITH ORDINALITY
          AS config_record(value, ordinality)
      )
    ),
    reprogramming_revision =
      reprogramming_revision + 1,
    updated_at = now(),
    updated_by = auth.uid()
  WHERE editions_table.id = _bracket_edition_id;

  SELECT to_jsonb(sessions_table)
  INTO after_session
  FROM public.championship_individual_sessions AS sessions_table
  WHERE sessions_table.id = session_id_value;

  PERFORM public.write_admin_action_log(
    'UPDATE'::public.admin_action_type,
    'championship_individual_sessions',
    session_id_value::text,
    'Reprogramou uma sessão individual.',
    before_session,
    after_session,
    jsonb_build_object(
      'bracket_edition_id',
      _bracket_edition_id,
      'scheduled_date',
      scheduled_date_value,
      'start_time',
      start_time_value,
      'end_time',
      end_time_value,
      'location_name',
      location_name_value,
      'court_name',
      court_name_value,
      'exclusive_lock_enabled',
      exclusive_lock_enabled_value
    )
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.reprogram_championship_individual_session(UUID, JSONB)
FROM PUBLIC, anon, authenticated;


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
        COALESCE(
          _payload->'schedule_updates',
          '[]'::jsonb
        )
      );

    WHEN 'REVERSE_DAY_COURT_MATCH_ORDER' THEN
      PERFORM public.reverse_championship_bracket_day_court_match_order(
        _bracket_edition_id,
        COALESCE(_payload, '{}'::jsonb)
      );

    WHEN 'INDIVIDUAL_SESSION' THEN
      PERFORM public.reprogram_championship_individual_session(
        _bracket_edition_id,
        COALESCE(_payload, '{}'::jsonb)
      );

    WHEN 'COMPETITION_SETTINGS' THEN
      PERFORM public.update_bracket_competition_settings(
        (_payload->>'competition_id')::uuid,
        (_payload->>'qualifiers_per_group')::integer,
        COALESCE(
          (
            _payload
              ->>'should_complete_knockout_with_best_second_placed_teams'
          )::boolean,
          false
        ),
        COALESCE(
          _payload->>'knockout_pairing_mode',
          'LINEAR'
        )
      );

    WHEN 'LOCATION_SPORT_PRIORITIES' THEN
      PERFORM public.update_bracket_location_sport_priorities(
        _bracket_edition_id,
        COALESCE(
          _payload->'priority_updates',
          '[]'::jsonb
        )
      );

    WHEN 'KNOCKOUT_COURT_PRIORITIES' THEN
      PERFORM public.update_bracket_knockout_court_priorities(
        _bracket_edition_id,
        COALESCE(
          _payload->'priority_updates',
          '[]'::jsonb
        )
      );

    WHEN 'LOCATION_GROUP' THEN
      PERFORM public.update_bracket_generated_location_group(
        _bracket_edition_id,
        _payload
      );

    ELSE
      RAISE EXCEPTION
        'Tipo de reprogramação inválido.';
  END CASE;
END;
$$;

NOTIFY pgrst, 'reload schema';