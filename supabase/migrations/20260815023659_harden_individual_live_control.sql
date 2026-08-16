CREATE OR REPLACE FUNCTION public.get_championship_individual_session_participants(
  _session_id UUID
)
RETURNS TABLE (
  team_id UUID,
  teams public.teams
)
LANGUAGE sql
STABLE
AS $$
  WITH current_session AS (
    SELECT *
    FROM public.championship_individual_sessions
    WHERE id = _session_id
  ),
  payload_snapshot AS (
    SELECT public.get_championship_setup_payload_snapshot(
      current_session.championship_id,
      current_session.season_year
    ) AS payload
    FROM current_session
  ),
  configured_participants AS (
    SELECT DISTINCT (participant_record.value->>'team_id')::uuid AS team_id
    FROM current_session
    CROSS JOIN payload_snapshot
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(payload_snapshot.payload->'participants', '[]'::jsonb)) AS participant_record(value)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(participant_record.value->'modalities', '[]'::jsonb)) AS modality_record(value)
    WHERE (modality_record.value->>'sport_id')::uuid = current_session.sport_id
      AND (modality_record.value->>'naipe')::public.match_naipe = current_session.naipe
      AND (
        CASE
          WHEN NULLIF(modality_record.value->>'division', '') IS NULL THEN NULL
          ELSE (modality_record.value->>'division')::public.team_division
        END
      ) IS NOT DISTINCT FROM current_session.division
  )
  SELECT configured_participants.team_id, teams_table
  FROM configured_participants
  JOIN public.teams AS teams_table
    ON teams_table.id = configured_participants.team_id
  ORDER BY teams_table.name;
$$;

CREATE OR REPLACE FUNCTION public.start_championship_individual_session(
  _session_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  current_session public.championship_individual_sessions%ROWTYPE;
BEGIN
  SELECT sessions_table.*
  INTO current_session
  FROM public.championship_individual_sessions AS sessions_table
  JOIN public.championships AS championships_table
    ON championships_table.id = sessions_table.championship_id
  WHERE sessions_table.id = _session_id
    AND championships_table.status = 'IN_PROGRESS'::public.championship_status
  LIMIT 1;

  IF current_session.id IS NULL THEN
    RAISE EXCEPTION 'A sessão só pode ser iniciada com o campeonato em andamento.';
  END IF;

  IF current_session.status != 'SCHEDULED'::public.championship_individual_session_status THEN
    RAISE EXCEPTION 'A sessão precisa estar agendada para ser iniciada.';
  END IF;

  UPDATE public.championship_individual_sessions
  SET status = 'LIVE'::public.championship_individual_session_status,
      updated_at = now()
  WHERE id = _session_id;

  RETURN _session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.return_championship_individual_session_to_scheduled(
  _session_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  current_session public.championship_individual_sessions%ROWTYPE;
BEGIN
  SELECT sessions_table.*
  INTO current_session
  FROM public.championship_individual_sessions AS sessions_table
  JOIN public.championships AS championships_table
    ON championships_table.id = sessions_table.championship_id
  WHERE sessions_table.id = _session_id
    AND championships_table.status = 'IN_PROGRESS'::public.championship_status
  LIMIT 1;

  IF current_session.id IS NULL THEN
    RAISE EXCEPTION 'A sessão só pode ser alterada com o campeonato em andamento.';
  END IF;

  IF current_session.status != 'LIVE'::public.championship_individual_session_status THEN
    RAISE EXCEPTION 'Somente uma sessão ao vivo pode voltar para agendada.';
  END IF;

  IF current_session.scheduled_date IS NULL
    OR current_session.period IS NULL
    OR current_session.location_key IS NULL
    OR current_session.court_key IS NULL THEN
    RAISE EXCEPTION 'A sessão não possui agendamento completo.';
  END IF;

  UPDATE public.championship_individual_sessions
  SET status = 'SCHEDULED'::public.championship_individual_session_status,
      updated_at = now()
  WHERE id = _session_id;

  RETURN _session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_championship_individual_session(
  _session_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  current_session public.championship_individual_sessions%ROWTYPE;
BEGIN
  SELECT sessions_table.*
  INTO current_session
  FROM public.championship_individual_sessions AS sessions_table
  JOIN public.championships AS championships_table
    ON championships_table.id = sessions_table.championship_id
  WHERE sessions_table.id = _session_id
    AND championships_table.status = 'IN_PROGRESS'::public.championship_status
  LIMIT 1;

  IF current_session.id IS NULL OR current_session.status != 'LIVE'::public.championship_individual_session_status THEN
    RAISE EXCEPTION 'Somente uma sessão ao vivo pode ser encerrada com o campeonato em andamento.';
  END IF;

  UPDATE public.championship_individual_sessions
  SET status = 'FINISHED'::public.championship_individual_session_status,
      updated_at = now()
  WHERE id = _session_id;

  PERFORM public.recalculate_championship_individual_standings(
    current_session.championship_id,
    current_session.season_year
  );

  RETURN _session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_championship_individual_session(
  _session_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  current_session public.championship_individual_sessions%ROWTYPE;
BEGIN
  SELECT sessions_table.*
  INTO current_session
  FROM public.championship_individual_sessions AS sessions_table
  JOIN public.championships AS championships_table
    ON championships_table.id = sessions_table.championship_id
  WHERE sessions_table.id = _session_id
    AND championships_table.status = 'IN_PROGRESS'::public.championship_status
  LIMIT 1;

  IF current_session.id IS NULL OR current_session.status != 'FINISHED'::public.championship_individual_session_status THEN
    RAISE EXCEPTION 'Somente uma sessão encerrada pode ser reaberta com o campeonato em andamento.';
  END IF;

  UPDATE public.championship_individual_sessions
  SET status = 'LIVE'::public.championship_individual_session_status,
      updated_at = now()
  WHERE id = _session_id;

  RETURN _session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_championship_individual_event_results(
  _event_id UUID,
  _results JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  current_event public.championship_individual_events%ROWTYPE;
  is_measurement_event BOOLEAN;
  confirmed_team_count INTEGER;
BEGIN
  SELECT events_table.*
  INTO current_event
  FROM public.championship_individual_events AS events_table
  JOIN public.championship_individual_sessions AS sessions_table
    ON sessions_table.id = events_table.session_id
  JOIN public.championships AS championships_table
    ON championships_table.id = events_table.championship_id
  WHERE events_table.id = _event_id
    AND sessions_table.status = 'LIVE'::public.championship_individual_session_status
    AND championships_table.status = 'IN_PROGRESS'::public.championship_status
  LIMIT 1;

  IF current_event.id IS NULL THEN
    RAISE EXCEPTION 'Resultados só podem ser registrados em sessão ao vivo com o campeonato em andamento.';
  END IF;

  is_measurement_event := current_event.event_code IN ('ATHLETICS_SHOT_PUT', 'ATHLETICS_LONG_JUMP');

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(_results, '[]'::jsonb)) AS result_row(
      entry_id UUID,
      status public.championship_individual_entry_status,
      result_time_milliseconds INTEGER,
      result_mark_centimeters INTEGER
    )
    LEFT JOIN public.championship_individual_event_entries AS entries_table
      ON entries_table.id = result_row.entry_id
    WHERE entries_table.event_id IS DISTINCT FROM _event_id
  ) THEN
    RAISE EXCEPTION 'Há inscrição inválida para esta prova.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(_results, '[]'::jsonb)) AS result_row(
      entry_id UUID,
      status public.championship_individual_entry_status,
      result_time_milliseconds INTEGER,
      result_mark_centimeters INTEGER
    )
    WHERE result_row.status = 'CONFIRMED'::public.championship_individual_entry_status
      AND (
        (is_measurement_event AND (result_row.result_mark_centimeters IS NULL OR result_row.result_time_milliseconds IS NOT NULL))
        OR (NOT is_measurement_event AND (result_row.result_time_milliseconds IS NULL OR result_row.result_mark_centimeters IS NOT NULL))
      )
  ) THEN
    RAISE EXCEPTION 'Informe uma única métrica válida para cada resultado confirmado.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(_results, '[]'::jsonb)) AS result_row(
      entry_id UUID,
      status public.championship_individual_entry_status,
      result_time_milliseconds INTEGER,
      result_mark_centimeters INTEGER
    )
    WHERE result_row.status = 'CONFIRMED'::public.championship_individual_entry_status
    GROUP BY CASE WHEN is_measurement_event THEN result_row.result_mark_centimeters ELSE result_row.result_time_milliseconds END
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Empates devem ser resolvidos pela arbitragem antes da confirmação.';
  END IF;

  IF current_event.kind = 'RELAY'::public.championship_individual_event_kind AND EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(_results, '[]'::jsonb)) AS result_row(
      entry_id UUID,
      status public.championship_individual_entry_status,
      result_time_milliseconds INTEGER,
      result_mark_centimeters INTEGER
    )
    JOIN public.championship_individual_event_entries AS entries_table
      ON entries_table.id = result_row.entry_id
    WHERE result_row.status = 'CONFIRMED'::public.championship_individual_entry_status
      AND (
        SELECT COUNT(*)
        FROM public.championship_individual_event_entry_members AS members_table
        WHERE members_table.entry_id = entries_table.id
          AND members_table.is_starter = true
      ) != 4
  ) THEN
    RAISE EXCEPTION 'Todo revezamento confirmado precisa ter exatamente 4 titulares.';
  END IF;

  UPDATE public.championship_individual_event_entries AS entries_table
  SET
    final_position = NULL,
    result_time_milliseconds = NULL,
    result_mark_centimeters = NULL,
    status = CASE
      WHEN entries_table.status IN (
        'DSQ_OVER_LIMIT'::public.championship_individual_entry_status,
        'WALKOVER'::public.championship_individual_entry_status
      ) THEN entries_table.status
      ELSE 'PENDING'::public.championship_individual_entry_status
    END
  WHERE entries_table.event_id = _event_id;

  UPDATE public.championship_individual_event_entries AS entries_table
  SET
    status = CASE
      WHEN entries_table.status IN (
        'DSQ_OVER_LIMIT'::public.championship_individual_entry_status,
        'WALKOVER'::public.championship_individual_entry_status
      ) THEN entries_table.status
      ELSE result_row.status
    END,
    result_time_milliseconds = CASE
      WHEN entries_table.status IN (
        'DSQ_OVER_LIMIT'::public.championship_individual_entry_status,
        'WALKOVER'::public.championship_individual_entry_status
      ) THEN NULL
      WHEN result_row.status = 'CONFIRMED'::public.championship_individual_entry_status THEN result_row.result_time_milliseconds
      ELSE NULL
    END,
    result_mark_centimeters = CASE
      WHEN entries_table.status IN (
        'DSQ_OVER_LIMIT'::public.championship_individual_entry_status,
        'WALKOVER'::public.championship_individual_entry_status
      ) THEN NULL
      WHEN result_row.status = 'CONFIRMED'::public.championship_individual_entry_status THEN result_row.result_mark_centimeters
      ELSE NULL
    END
  FROM jsonb_to_recordset(COALESCE(_results, '[]'::jsonb)) AS result_row(
    entry_id UUID,
    status public.championship_individual_entry_status,
    result_time_milliseconds INTEGER,
    result_mark_centimeters INTEGER
  )
  WHERE entries_table.id = result_row.entry_id
    AND entries_table.event_id = _event_id;

  WITH ranked_entries AS (
    SELECT
      entries_table.id,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE WHEN is_measurement_event THEN entries_table.result_mark_centimeters END DESC NULLS LAST,
          CASE WHEN NOT is_measurement_event THEN entries_table.result_time_milliseconds END ASC NULLS LAST,
          entries_table.id
      ) AS final_position
    FROM public.championship_individual_event_entries AS entries_table
    WHERE entries_table.event_id = _event_id
      AND entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status
  )
  UPDATE public.championship_individual_event_entries AS entries_table
  SET final_position = ranked_entries.final_position
  FROM ranked_entries
  WHERE entries_table.id = ranked_entries.id;

  IF current_event.kind = 'INDIVIDUAL'::public.championship_individual_event_kind
    AND public.resolve_normalized_sport_name((
      SELECT sports_table.name FROM public.sports AS sports_table WHERE sports_table.id = current_event.sport_id
    )) = 'atletismo' THEN
    SELECT COUNT(DISTINCT entries_table.team_id)
    INTO confirmed_team_count
    FROM public.championship_individual_event_entries AS entries_table
    WHERE entries_table.event_id = _event_id
      AND entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status;

    IF confirmed_team_count < 2 THEN
      RAISE EXCEPTION 'Provas individuais do atletismo precisam ter ao menos 2 atléticas diferentes confirmadas.';
    END IF;
  END IF;

  UPDATE public.championship_individual_events AS events_table
  SET status = CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.championship_individual_event_entries AS entries_table
      WHERE entries_table.event_id = _event_id
        AND entries_table.status = 'PENDING'::public.championship_individual_entry_status
    ) THEN 'FINISHED'::public.championship_individual_event_status
    ELSE 'SCHEDULED'::public.championship_individual_event_status
  END,
  updated_at = now()
  WHERE events_table.id = _event_id;

  PERFORM public.recalculate_championship_individual_standings(current_event.championship_id, current_event.season_year);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_championship_individual_event_team_walkover(
  _event_id UUID,
  _team_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  current_event public.championship_individual_events%ROWTYPE;
BEGIN
  SELECT events_table.*
  INTO current_event
  FROM public.championship_individual_events AS events_table
  JOIN public.championship_individual_sessions AS sessions_table ON sessions_table.id = events_table.session_id
  JOIN public.championships AS championships_table ON championships_table.id = events_table.championship_id
  WHERE events_table.id = _event_id
    AND sessions_table.status = 'LIVE'::public.championship_individual_session_status
    AND championships_table.status = 'IN_PROGRESS'::public.championship_status
  LIMIT 1;

  IF current_event.id IS NULL THEN
    RAISE EXCEPTION 'W.O. só pode ser registrado em sessão ao vivo com o campeonato em andamento.';
  END IF;

  UPDATE public.championship_individual_event_entries
  SET
    status = 'WALKOVER'::public.championship_individual_entry_status,
    final_position = NULL,
    result_time_milliseconds = NULL,
    result_mark_centimeters = NULL,
    points_awarded = 0,
    updated_at = now()
  WHERE event_id = _event_id
    AND team_id = _team_id;

  UPDATE public.championship_individual_events AS events_table
  SET status = CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM public.championship_individual_event_entries AS entries_table
      WHERE entries_table.event_id = _event_id
        AND entries_table.status = 'PENDING'::public.championship_individual_entry_status
    ) THEN 'FINISHED'::public.championship_individual_event_status
    ELSE 'SCHEDULED'::public.championship_individual_event_status
  END,
  updated_at = now()
  WHERE events_table.id = _event_id;

  PERFORM public.recalculate_championship_individual_standings(current_event.championship_id, current_event.season_year);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_championship_individual_session_participants(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_championship_individual_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_championship_individual_session_to_scheduled(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_championship_individual_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_championship_individual_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_championship_individual_event_results(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_championship_individual_event_team_walkover(UUID, UUID) TO authenticated;
