-- LAJE-81: faz o agendador assíncrono respeitar as metas por modalidade
-- e preserva o contexto de cada jogo que não encontrou horário.

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_slot_sport_target(
  _payload JSONB,
  _event_date DATE,
  _court_key UUID,
  _sport_id UUID
)
RETURNS TABLE (
  has_sport_targets BOOLEAN,
  planned_match_count INTEGER
)
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $function$
  WITH target_court AS (
    SELECT court_item.value AS court
    FROM jsonb_array_elements(COALESCE(_payload -> 'schedule_days', '[]'::jsonb)) day_item(value)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(day_item.value -> 'locations', '[]'::jsonb)) location_item(value)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(location_item.value -> 'courts', '[]'::jsonb)) court_item(value)
    WHERE day_item.value ->> 'date' = _event_date::text
      AND court_item.value ->> 'court_key' = _court_key::text
    LIMIT 1
  )
  SELECT
    COALESCE(
      (SELECT jsonb_array_length(COALESCE(target_court.court -> 'sport_match_targets', '[]'::jsonb)) > 0 FROM target_court),
      false
    ),
    COALESCE((
      SELECT GREATEST(COALESCE((target_item.value ->> 'planned_match_count')::integer, 0), 0)
      FROM target_court
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(target_court.court -> 'sport_match_targets', '[]'::jsonb)
      ) target_item(value)
      WHERE target_item.value ->> 'sport_id' = _sport_id::text
      LIMIT 1
    ), 0);
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.build_unassigned_match_diagnostics(
  _job_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  WITH unassigned_matches AS (
    SELECT
      matches_table.id AS match_id,
      matches_table.round_number,
      matches_table.slot_number,
      matches_table.home_team_id,
      matches_table.away_team_id,
      competitions_table.sport_id,
      competitions_table.sport_name,
      competitions_table.naipe,
      competitions_table.division,
      competitions_table.competition_key,
      competitions_table.position AS competition_position,
      groups_table.group_number,
      home_teams_table.name AS home_team_name,
      away_teams_table.name AS away_team_name,
      jobs_table.payload
    FROM championship_bracket_preview_private.matches AS matches_table
    JOIN championship_bracket_preview_private.competitions AS competitions_table
      ON competitions_table.id = matches_table.competition_id
    JOIN championship_bracket_preview_private.groups AS groups_table
      ON groups_table.id = matches_table.group_id
    JOIN championship_bracket_preview_private.jobs AS jobs_table
      ON jobs_table.id = matches_table.job_id
    JOIN public.teams AS home_teams_table
      ON home_teams_table.id = matches_table.home_team_id
    JOIN public.teams AS away_teams_table
      ON away_teams_table.id = matches_table.away_team_id
    WHERE matches_table.job_id = _job_id
      AND matches_table.assigned = false
  ), compatible_slots AS (
    SELECT
      unassigned_matches.match_id,
      slots_table.id AS slot_id,
      public.is_championship_bracket_competition_slot_playable(
        unassigned_matches.payload,
        unassigned_matches.competition_key,
        slots_table.event_date,
        slots_table.start_at,
        slots_table.end_at
      ) AS competition_playable,
      public.is_championship_bracket_team_slot_playable(
        unassigned_matches.payload,
        unassigned_matches.home_team_id,
        unassigned_matches.competition_key,
        slots_table.event_date,
        slots_table.start_at,
        slots_table.end_at
      )
      AND public.is_championship_bracket_team_slot_playable(
        unassigned_matches.payload,
        unassigned_matches.away_team_id,
        unassigned_matches.competition_key,
        slots_table.event_date,
        slots_table.start_at,
        slots_table.end_at
      ) AS teams_playable,
      NOT slot_target.has_sport_targets
      OR slot_target.planned_match_count > COALESCE(target_usage.assigned_match_count, 0) AS target_available,
      NOT EXISTS (
        SELECT 1
        FROM championship_bracket_preview_private.assignments AS occupied_assignments
        JOIN championship_bracket_preview_private.slots AS occupied_slots
          ON occupied_slots.id = occupied_assignments.slot_id
        WHERE occupied_assignments.job_id = _job_id
          AND occupied_slots.court_key = slots_table.court_key
          AND occupied_slots.start_at < slots_table.end_at
          AND occupied_slots.end_at > slots_table.start_at
      ) AS physical_slot_available
    FROM unassigned_matches
    JOIN championship_bracket_preview_private.slots AS slots_table
      ON slots_table.job_id = _job_id
      AND slots_table.sport_id = unassigned_matches.sport_id
    CROSS JOIN LATERAL championship_bracket_preview_private.resolve_slot_sport_target(
      unassigned_matches.payload,
      slots_table.event_date,
      slots_table.court_key,
      slots_table.sport_id
    ) AS slot_target
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS assigned_match_count
      FROM championship_bracket_preview_private.assignments AS target_assignments
      JOIN championship_bracket_preview_private.slots AS assigned_slots
        ON assigned_slots.id = target_assignments.slot_id
      WHERE target_assignments.job_id = _job_id
        AND assigned_slots.event_date = slots_table.event_date
        AND assigned_slots.court_key = slots_table.court_key
        AND assigned_slots.sport_id = slots_table.sport_id
    ) AS target_usage ON true
  ), compatibility_by_match AS (
    SELECT
      unassigned_matches.*,
      count(compatible_slots.slot_id) > 0 AS has_sport_slot,
      COALESCE(bool_or(compatible_slots.competition_playable), false) AS has_competition_slot,
      COALESCE(bool_or(
        compatible_slots.competition_playable
        AND compatible_slots.teams_playable
      ), false) AS has_team_slot,
      COALESCE(bool_or(
        compatible_slots.competition_playable
        AND compatible_slots.teams_playable
        AND compatible_slots.target_available
      ), false) AS has_target_slot,
      COALESCE(bool_or(
        compatible_slots.competition_playable
        AND compatible_slots.teams_playable
        AND compatible_slots.target_available
        AND compatible_slots.physical_slot_available
      ), false) AS has_physical_slot
    FROM unassigned_matches
    LEFT JOIN compatible_slots
      ON compatible_slots.match_id = unassigned_matches.match_id
    GROUP BY
      unassigned_matches.match_id,
      unassigned_matches.round_number,
      unassigned_matches.slot_number,
      unassigned_matches.home_team_id,
      unassigned_matches.away_team_id,
      unassigned_matches.sport_id,
      unassigned_matches.sport_name,
      unassigned_matches.naipe,
      unassigned_matches.division,
      unassigned_matches.competition_key,
      unassigned_matches.competition_position,
      unassigned_matches.group_number,
      unassigned_matches.home_team_name,
      unassigned_matches.away_team_name,
      unassigned_matches.payload
  ), classified_diagnostics AS (
    SELECT
      compatibility_by_match.*,
      CASE
        WHEN NOT has_sport_slot THEN 'NO_COURT_FOR_SPORT'
        WHEN NOT has_competition_slot THEN 'COMPETITION_UNAVAILABLE'
        WHEN NOT has_team_slot THEN 'TEAM_UNAVAILABLE'
        WHEN NOT has_target_slot THEN 'SPORT_TARGET_EXHAUSTED'
        WHEN NOT has_physical_slot THEN 'COURT_CAPACITY_EXHAUSTED'
        ELSE 'TEAM_REST_CONSTRAINT'
      END AS reason_code
    FROM compatibility_by_match
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'code', 'UNASSIGNED_MATCH',
        'severity', 'ERROR',
        'message', format(
          '%s × %s — Grupo %s, rodada %s: %s',
          classified_diagnostics.home_team_name,
          classified_diagnostics.away_team_name,
          classified_diagnostics.group_number,
          classified_diagnostics.round_number,
          CASE classified_diagnostics.reason_code
            WHEN 'NO_COURT_FOR_SPORT' THEN format(
              'não há quadra configurada para %s.',
              classified_diagnostics.sport_name
            )
            WHEN 'COMPETITION_UNAVAILABLE' THEN
              'a competição não possui janela disponível nas datas configuradas.'
            WHEN 'TEAM_UNAVAILABLE' THEN
              'as disponibilidades das equipes não oferecem um horário em comum.'
            WHEN 'SPORT_TARGET_EXHAUSTED' THEN format(
              'as metas de %s nas quadras e datas compatíveis foram totalmente utilizadas.',
              classified_diagnostics.sport_name
            )
            WHEN 'COURT_CAPACITY_EXHAUSTED' THEN
              'todos os horários físicos compatíveis com a meta já estavam ocupados.'
            ELSE
              'os horários restantes violam simultaneidade ou intervalo mínimo entre jogos das equipes.'
          END
        ),
        'reason_code', classified_diagnostics.reason_code,
        'match_id', classified_diagnostics.match_id,
        'date', NULL,
        'location_name', NULL,
        'court_name', NULL,
        'sport_id', classified_diagnostics.sport_id,
        'sport_name', classified_diagnostics.sport_name,
        'naipe', classified_diagnostics.naipe,
        'division', classified_diagnostics.division,
        'phase', 'GROUP_STAGE',
        'group_number', classified_diagnostics.group_number,
        'round_number', classified_diagnostics.round_number,
        'home_team_id', classified_diagnostics.home_team_id,
        'home_team_name', classified_diagnostics.home_team_name,
        'away_team_id', classified_diagnostics.away_team_id,
        'away_team_name', classified_diagnostics.away_team_name
      )
      ORDER BY
        classified_diagnostics.competition_position,
        classified_diagnostics.group_number,
        classified_diagnostics.round_number,
        classified_diagnostics.slot_number,
        classified_diagnostics.match_id
    ),
    '[]'::jsonb
  )
  FROM classified_diagnostics;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.process_batch(_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
SET statement_timeout = '15s'
AS $function$
DECLARE
  started_clock TIMESTAMPTZ := clock_timestamp();
  job_record RECORD;
  slot_record RECORD;
  candidate RECORD;
  batch_slots INTEGER := 0;
  candidates INTEGER := 0;
  slot_candidates INTEGER := 0;
  produced INTEGER := 0;
  pending_count INTEGER;
  processed_count INTEGER;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('championship-bracket-preview-global', 0)) THEN
    RETURN jsonb_build_object('continue', true, 'delay', 2);
  END IF;

  SELECT *
  INTO job_record
  FROM championship_bracket_preview_private.jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF job_record.status IN ('COMPLETED', 'FAILED', 'CANCELLED', 'CONSUMED') THEN
    RETURN jsonb_build_object('continue', false);
  END IF;

  IF job_record.status IN ('QUEUED', 'INITIALIZING') THEN
    PERFORM championship_bracket_preview_private.initialize_job(_job_id);

    SELECT *
    INTO job_record
    FROM championship_bracket_preview_private.jobs
    WHERE id = _job_id;
  END IF;

  FOR slot_record IN
    SELECT
      slots_table.*,
      slot_target.has_sport_targets,
      slot_target.planned_match_count,
      GREATEST(
        slot_target.planned_match_count - COALESCE(target_usage.assigned_match_count, 0),
        0
      ) AS remaining_target_count
    FROM championship_bracket_preview_private.slots AS slots_table
    CROSS JOIN LATERAL championship_bracket_preview_private.resolve_slot_sport_target(
      job_record.payload,
      slots_table.event_date,
      slots_table.court_key,
      slots_table.sport_id
    ) AS slot_target
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS assigned_match_count
      FROM championship_bracket_preview_private.assignments AS target_assignments
      JOIN championship_bracket_preview_private.slots AS assigned_slots
        ON assigned_slots.id = target_assignments.slot_id
      WHERE target_assignments.job_id = _job_id
        AND assigned_slots.event_date = slots_table.event_date
        AND assigned_slots.court_key = slots_table.court_key
        AND assigned_slots.sport_id = slots_table.sport_id
    ) AS target_usage ON true
    WHERE slots_table.job_id = _job_id
      AND slots_table.processed = false
      AND slots_table.event_date = (
        SELECT min(next_slot.event_date)
        FROM championship_bracket_preview_private.slots AS next_slot
        WHERE next_slot.job_id = _job_id
          AND next_slot.processed = false
      )
    ORDER BY
      slots_table.event_date,
      slots_table.start_at,
      slots_table.location_position,
      slots_table.court_position,
      CASE
        WHEN NOT slot_target.has_sport_targets
          OR slot_target.planned_match_count > COALESCE(target_usage.assigned_match_count, 0)
        THEN 0
        ELSE 1
      END,
      GREATEST(
        slot_target.planned_match_count - COALESCE(target_usage.assigned_match_count, 0),
        0
      ) DESC,
      CASE WHEN slots_table.preferred_sport THEN 0 ELSE 1 END,
      slots_table.sport_id,
      slots_table.cursor_position
    LIMIT 20
    FOR UPDATE OF slots_table SKIP LOCKED
  LOOP
    EXIT WHEN clock_timestamp() - started_clock >= interval '5 seconds';
    batch_slots := batch_slots + 1;

    SELECT count(*)
    INTO slot_candidates
    FROM championship_bracket_preview_private.matches AS matches_table
    JOIN championship_bracket_preview_private.competitions AS competitions_table
      ON competitions_table.id = matches_table.competition_id
    WHERE matches_table.job_id = _job_id
      AND matches_table.assigned = false
      AND competitions_table.sport_id = slot_record.sport_id;

    candidates := candidates + slot_candidates;

    SELECT
      matches_table.*,
      competitions_table.naipe,
      competitions_table.division,
      competitions_table.competition_key
    INTO candidate
    FROM championship_bracket_preview_private.matches AS matches_table
    JOIN championship_bracket_preview_private.competitions AS competitions_table
      ON competitions_table.id = matches_table.competition_id
    WHERE matches_table.job_id = _job_id
      AND matches_table.assigned = false
      AND competitions_table.sport_id = slot_record.sport_id
      AND (
        NOT slot_record.has_sport_targets
        OR slot_record.planned_match_count > (
          SELECT count(*)
          FROM championship_bracket_preview_private.assignments AS target_assignments
          JOIN championship_bracket_preview_private.slots AS assigned_slots
            ON assigned_slots.id = target_assignments.slot_id
          WHERE target_assignments.job_id = _job_id
            AND assigned_slots.event_date = slot_record.event_date
            AND assigned_slots.court_key = slot_record.court_key
            AND assigned_slots.sport_id = slot_record.sport_id
        )
      )
      AND public.is_championship_bracket_competition_slot_playable(
        job_record.payload,
        competitions_table.competition_key,
        slot_record.event_date,
        slot_record.start_at,
        slot_record.end_at
      )
      AND public.is_championship_bracket_team_slot_playable(
        job_record.payload,
        matches_table.home_team_id,
        competitions_table.competition_key,
        slot_record.event_date,
        slot_record.start_at,
        slot_record.end_at
      )
      AND public.is_championship_bracket_team_slot_playable(
        job_record.payload,
        matches_table.away_team_id,
        competitions_table.competition_key,
        slot_record.event_date,
        slot_record.start_at,
        slot_record.end_at
      )
      AND NOT EXISTS (
        SELECT 1
        FROM championship_bracket_preview_private.assignments AS occupied_assignment
        JOIN championship_bracket_preview_private.slots AS occupied_slot
          ON occupied_slot.id = occupied_assignment.slot_id
        WHERE occupied_assignment.job_id = _job_id
          AND occupied_slot.court_key = slot_record.court_key
          AND occupied_slot.start_at < slot_record.end_at
          AND occupied_slot.end_at > slot_record.start_at
      )
      AND NOT EXISTS (
        SELECT 1
        FROM championship_bracket_preview_private.assignments AS previous_assignment
        JOIN championship_bracket_preview_private.matches AS previous_match
          ON previous_match.id = previous_assignment.match_id
        JOIN championship_bracket_preview_private.slots AS previous_slot
          ON previous_slot.id = previous_assignment.slot_id
        WHERE previous_assignment.job_id = _job_id
          AND previous_slot.event_date = slot_record.event_date
          AND (
            previous_match.home_team_id IN (matches_table.home_team_id, matches_table.away_team_id)
            OR previous_match.away_team_id IN (matches_table.home_team_id, matches_table.away_team_id)
          )
          AND (
            previous_slot.start_at = slot_record.start_at
            OR (
              previous_slot.court_key = slot_record.court_key
              AND competitions_table.naipe = (
                SELECT previous_competition.naipe
                FROM championship_bracket_preview_private.competitions AS previous_competition
                WHERE previous_competition.id = previous_match.competition_id
              )
              AND ABS(EXTRACT(EPOCH FROM (previous_slot.start_at - slot_record.start_at)) / 60)
                < EXTRACT(EPOCH FROM (slot_record.end_at - slot_record.start_at)) / 60 * 4
            )
            OR (
              previous_slot.court_key <> slot_record.court_key
              AND ABS(EXTRACT(EPOCH FROM (previous_slot.start_at - slot_record.start_at)) / 60)
                < EXTRACT(EPOCH FROM (slot_record.end_at - slot_record.start_at)) / 60 * 2
            )
          )
      )
    ORDER BY
      CASE
        WHEN slot_record.preferred_naipe IS NOT NULL
          AND competitions_table.naipe IS DISTINCT FROM slot_record.preferred_naipe
        THEN 1
        ELSE 0
      END,
      CASE
        WHEN slot_record.preferred_division IS NOT NULL
          AND competitions_table.division IS DISTINCT FROM slot_record.preferred_division
        THEN 1
        ELSE 0
      END,
      matches_table.priority_weight DESC,
      matches_table.round_number,
      matches_table.slot_number,
      matches_table.id
    LIMIT 1;

    IF candidate.id IS NOT NULL THEN
      INSERT INTO championship_bracket_preview_private.assignments (job_id, match_id, slot_id)
      VALUES (_job_id, candidate.id, slot_record.id)
      ON CONFLICT DO NOTHING;

      UPDATE championship_bracket_preview_private.matches
      SET assigned = true
      WHERE id = candidate.id;

      produced := produced + 1;
    END IF;

    UPDATE championship_bracket_preview_private.slots
    SET processed = true
    WHERE id = slot_record.id;
  END LOOP;

  SELECT count(*)
  INTO pending_count
  FROM championship_bracket_preview_private.matches
  WHERE job_id = _job_id
    AND assigned = false;

  SELECT count(*)
  INTO processed_count
  FROM championship_bracket_preview_private.slots
  WHERE job_id = _job_id
    AND processed;

  UPDATE championship_bracket_preview_private.jobs
  SET
    processed_slots = processed_count,
    current_processing_date = (
      SELECT max(event_date)
      FROM championship_bracket_preview_private.slots
      WHERE job_id = _job_id
        AND processed
    ),
    progress_percentage = LEAST(
      90,
      5 + (85 * processed_count::numeric / GREATEST(total_slots, 1))
    ),
    heartbeat_at = now(),
    updated_at = now()
  WHERE id = _job_id;

  INSERT INTO championship_bracket_preview_private.stage_metrics (
    job_id,
    stage,
    batch_number,
    duration_ms,
    processed_slots,
    candidates_examined,
    produced_rows
  ) VALUES (
    _job_id,
    'SCHEDULING',
    job_record.attempt_count + 1,
    (EXTRACT(EPOCH FROM (clock_timestamp() - started_clock)) * 1000)::integer,
    batch_slots,
    candidates,
    produced
  );

  IF pending_count = 0 THEN
    UPDATE championship_bracket_preview_private.jobs
    SET
      status = 'FINALIZING',
      stage = 'Montando manifesto final',
      updated_at = now()
    WHERE id = _job_id;

    RETURN jsonb_build_object('continue', true, 'delay', 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.slots
    WHERE job_id = _job_id
      AND processed = false
  ) THEN
    UPDATE championship_bracket_preview_private.jobs
    SET
      status = 'FAILED',
      stage = 'Falha',
      progress_percentage = 100,
      error_message = format(
        'Não foi possível encaixar %s jogo(s) na grade configurada.',
        pending_count
      ),
      diagnostics = championship_bracket_preview_private.build_unassigned_match_diagnostics(_job_id),
      completed_at = now(),
      expires_at = now() + interval '24 hours',
      heartbeat_at = now(),
      updated_at = now()
    WHERE id = _job_id;

    RETURN jsonb_build_object('continue', false);
  END IF;

  RETURN jsonb_build_object('continue', true, 'delay', 0);
END;
$function$;

-- Resultados antigos foram calculados sem considerar as metas da etapa 11.
-- Eles são temporários e precisam ser recalculados antes da criação definitiva.
UPDATE championship_bracket_preview_private.jobs
SET
  status = 'CANCELLED',
  stage = 'Recalcule após a correção das metas por modalidade',
  expires_at = now() + interval '24 hours',
  heartbeat_at = now(),
  updated_at = now()
WHERE status IN ('QUEUED', 'INITIALIZING', 'SCHEDULING', 'FINALIZING', 'COMPLETED');

REVOKE ALL ON FUNCTION championship_bracket_preview_private.resolve_slot_sport_target(JSONB, DATE, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION championship_bracket_preview_private.build_unassigned_match_diagnostics(UUID)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION championship_bracket_preview_private.resolve_slot_sport_target(JSONB, DATE, UUID, UUID)
  IS 'Resolve a meta da modalidade para uma quadra e data do payload da prévia.';
COMMENT ON FUNCTION championship_bracket_preview_private.build_unassigned_match_diagnostics(UUID)
  IS 'Detalha os jogos não alocados e classifica a restrição que impediu cada encaixe.';
