-- LAJE-81: alinha a prévia exata ao planejamento estrutural da Etapa 13.
--
-- Corrige quatro divergências do primeiro worker assíncrono:
-- - slots físicos não podem ser multiplicados por modalidade;
-- - a grade deve recomeçar no fim de cada bloqueio fixo;
-- - GROUP_NAIPE precisa reservar blocos equivalentes para os dois naipes;
-- - a cronologia precisa devolver intervalos, reservas, sessões e janelas livres.

ALTER TABLE championship_bracket_preview_private.jobs
  ALTER COLUMN algorithm_version SET DEFAULT 'async-exact-v2';

-- Uma prévia v1 já concluída não pode ser reaproveitada, pois foi calculada
-- sobre slots virtuais por modalidade e não representa a grade física atual.
UPDATE championship_bracket_preview_private.jobs
SET
  status = 'CANCELLED',
  stage = 'Prévia invalidada pela correção da grade física',
  expires_at = now() + interval '24 hours',
  updated_at = now()
WHERE algorithm_version = 'async-exact-v1'
  AND status IN ('QUEUED', 'INITIALIZING', 'SCHEDULING', 'FINALIZING', 'COMPLETED');

CREATE OR REPLACE FUNCTION public.start_championship_bracket_preview_job(
  _championship_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
SET statement_timeout = '15s'
AS $function$
DECLARE
  season INTEGER;
  payload_hash TEXT;
  dependency_hash TEXT;
  existing_job RECORD;
  new_id UUID;
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true)
  THEN
    RAISE EXCEPTION 'Usuário sem permissão para calcular a programação.';
  END IF;

  SELECT championships_table.current_season_year
  INTO season
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id
    AND championships_table.status = 'UPCOMING'::public.championship_status;

  IF season IS NULL THEN
    RAISE EXCEPTION 'Campeonato inválido ou fora do status Configurando campeonato.';
  END IF;

  payload_hash := public.resolve_championship_bracket_preview_payload_signature(
    COALESCE(_payload, '{}'::JSONB)
  );
  dependency_hash := championship_bracket_preview_private.resolve_dependency_signature(
    _championship_id,
    COALESCE(_payload, '{}'::JSONB)
  );

  SELECT *
  INTO existing_job
  FROM championship_bracket_preview_private.jobs
  WHERE championship_id = _championship_id
    AND season_year = season
    AND requested_by = auth.uid()
    AND payload_signature = payload_hash
    AND dependency_signature = dependency_hash
    AND algorithm_version = 'async-exact-v2'
    AND expires_at > now()
    AND status IN ('QUEUED', 'INITIALIZING', 'SCHEDULING', 'FINALIZING', 'COMPLETED')
  ORDER BY created_at DESC
  LIMIT 1;

  IF existing_job.id IS NOT NULL THEN
    RETURN public.get_championship_bracket_preview_job_status(existing_job.id);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.jobs
    WHERE championship_id = _championship_id
      AND season_year = season
      AND requested_by <> auth.uid()
      AND status IN ('QUEUED', 'INITIALIZING', 'SCHEDULING', 'FINALIZING')
  ) THEN
    RAISE EXCEPTION 'Já existe uma programação exata em andamento para este campeonato.';
  END IF;

  UPDATE championship_bracket_preview_private.jobs
  SET
    status = 'CANCELLED',
    stage = 'Substituída por nova configuração',
    expires_at = now() + interval '24 hours',
    updated_at = now()
  WHERE championship_id = _championship_id
    AND season_year = season
    AND status IN ('QUEUED', 'INITIALIZING', 'SCHEDULING', 'FINALIZING');

  INSERT INTO championship_bracket_preview_private.jobs (
    championship_id,
    season_year,
    requested_by,
    payload,
    payload_signature,
    dependency_signature,
    algorithm_version
  ) VALUES (
    _championship_id,
    season,
    auth.uid(),
    COALESCE(_payload, '{}'::JSONB),
    payload_hash,
    dependency_hash,
    'async-exact-v2'
  )
  RETURNING id INTO new_id;

  PERFORM championship_bracket_preview_private.enqueue(new_id, 0);

  RETURN public.get_championship_bracket_preview_job_status(new_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_championship_bracket_preview_job_status(
  _job_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  job_record RECORD;
BEGIN
  SELECT *
  INTO job_record
  FROM championship_bracket_preview_private.jobs
  WHERE id = _job_id;

  IF job_record.id IS NULL
    OR (
      job_record.requested_by <> auth.uid()
      AND NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true)
    )
  THEN
    RAISE EXCEPTION 'Job de prévia não encontrado.';
  END IF;

  RETURN jsonb_build_object(
    'job_id', job_record.id,
    'championship_id', job_record.championship_id,
    'season_year', job_record.season_year,
    'status', job_record.status,
    'stage', job_record.stage,
    'current_date', job_record.current_processing_date,
    'progress_percentage', job_record.progress_percentage,
    'processed_slots', job_record.processed_slots,
    'total_slots', job_record.total_slots,
    'attempt_count', job_record.attempt_count,
    'error_message', job_record.error_message,
    'summary', job_record.summary,
    'diagnostics', job_record.diagnostics,
    'payload_signature', job_record.payload_signature,
    'dependency_signature', job_record.dependency_signature,
    'algorithm_version', job_record.algorithm_version,
    'generation_signature', job_record.generation_signature,
    'created_at', job_record.created_at,
    'completed_at', job_record.completed_at,
    'expires_at', job_record.expires_at,
    'is_valid_for_creation', (
      job_record.status = 'COMPLETED'
      AND job_record.algorithm_version = 'async-exact-v2'
      AND job_record.generation_signature IS NOT NULL
      AND job_record.expires_at > now()
      AND jsonb_array_length(job_record.diagnostics) = 0
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_court_free_intervals(
  _payload JSONB,
  _event_date DATE,
  _location_key UUID,
  _court_key UUID
)
RETURNS TABLE (
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ
)
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $function$
  WITH selected_day AS (
    SELECT day_item.value AS day
    FROM jsonb_array_elements(COALESCE(_payload -> 'schedule_days', '[]'::jsonb)) day_item(value)
    WHERE day_item.value ->> 'date' = _event_date::text
    LIMIT 1
  ), day_bounds AS (
    SELECT
      public.combine_bracket_schedule_timestamp(
        _event_date,
        (selected_day.day ->> 'start_time')::time
      ) AS day_start,
      public.combine_bracket_schedule_timestamp(
        _event_date,
        (selected_day.day ->> 'end_time')::time
      ) AS day_end,
      selected_day.day
    FROM selected_day
  ), blocked_raw AS (
    SELECT
      public.combine_bracket_schedule_timestamp(
        _event_date,
        (day_bounds.day ->> 'break_start_time')::time
      ) AS blocked_start,
      public.combine_bracket_schedule_timestamp(
        _event_date,
        (day_bounds.day ->> 'break_end_time')::time
      ) AS blocked_end
    FROM day_bounds
    WHERE NULLIF(day_bounds.day ->> 'break_start_time', '') IS NOT NULL
      AND NULLIF(day_bounds.day ->> 'break_end_time', '') IS NOT NULL

    UNION ALL

    SELECT
      public.combine_bracket_schedule_timestamp(
        _event_date,
        (lock_item.value ->> 'start_time')::time
      ),
      public.combine_bracket_schedule_timestamp(
        _event_date,
        (lock_item.value ->> 'end_time')::time
      )
    FROM jsonb_array_elements(COALESCE(_payload -> 'resource_locks', '[]'::jsonb)) lock_item(value)
    WHERE lock_item.value ->> 'date' = _event_date::text
      AND lock_item.value ->> 'location_key' = _location_key::text
      AND lock_item.value ->> 'court_key' = _court_key::text
      AND NULLIF(lock_item.value ->> 'start_time', '') IS NOT NULL
      AND NULLIF(lock_item.value ->> 'end_time', '') IS NOT NULL

    UNION ALL

    SELECT
      public.combine_bracket_schedule_timestamp(
        _event_date,
        (session_item.value ->> 'start_time')::time
      ),
      public.combine_bracket_schedule_timestamp(
        _event_date,
        (session_item.value ->> 'end_time')::time
      )
    FROM jsonb_array_elements(COALESCE(_payload -> 'individual_session_configs', '[]'::jsonb)) session_item(value)
    WHERE session_item.value ->> 'scheduled_date' = _event_date::text
      AND session_item.value ->> 'location_key' = _location_key::text
      AND session_item.value ->> 'court_key' = _court_key::text
      AND NULLIF(session_item.value ->> 'start_time', '') IS NOT NULL
      AND NULLIF(session_item.value ->> 'end_time', '') IS NOT NULL

    UNION ALL

    SELECT
      public.combine_bracket_schedule_timestamp(
        _event_date,
        (block_item.value ->> 'start_time')::time
      ),
      public.combine_bracket_schedule_timestamp(
        _event_date,
        (block_item.value ->> 'end_time')::time
      )
    FROM jsonb_array_elements(COALESCE(_payload -> 'knockout_program_blocks', '[]'::jsonb)) block_item(value)
    WHERE block_item.value ->> 'date' = _event_date::text
      AND block_item.value ->> 'location_key' = _location_key::text
      AND block_item.value ->> 'court_key' = _court_key::text
      AND NULLIF(block_item.value ->> 'start_time', '') IS NOT NULL
      AND NULLIF(block_item.value ->> 'end_time', '') IS NOT NULL
  ), clamped_blocks AS (
    SELECT
      GREATEST(blocked_raw.blocked_start, day_bounds.day_start) AS blocked_start,
      LEAST(blocked_raw.blocked_end, day_bounds.day_end) AS blocked_end,
      day_bounds.day_start,
      day_bounds.day_end
    FROM blocked_raw
    CROSS JOIN day_bounds
    WHERE blocked_raw.blocked_end > day_bounds.day_start
      AND blocked_raw.blocked_start < day_bounds.day_end
      AND blocked_raw.blocked_end > blocked_raw.blocked_start
  ), ordered_blocks AS (
    SELECT
      clamped_blocks.*,
      max(clamped_blocks.blocked_end) OVER (
        ORDER BY clamped_blocks.blocked_start, clamped_blocks.blocked_end
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ) AS previous_max_end
    FROM clamped_blocks
  ), grouped_blocks AS (
    SELECT
      ordered_blocks.*,
      sum(
        CASE
          WHEN ordered_blocks.previous_max_end IS NULL
            OR ordered_blocks.blocked_start > ordered_blocks.previous_max_end
          THEN 1
          ELSE 0
        END
      ) OVER (ORDER BY ordered_blocks.blocked_start, ordered_blocks.blocked_end) AS block_group
    FROM ordered_blocks
  ), merged_blocks AS (
    SELECT
      min(grouped_blocks.blocked_start) AS blocked_start,
      max(grouped_blocks.blocked_end) AS blocked_end,
      min(grouped_blocks.day_start) AS day_start,
      max(grouped_blocks.day_end) AS day_end
    FROM grouped_blocks
    GROUP BY grouped_blocks.block_group
  ), free_intervals AS (
    SELECT
      day_bounds.day_start AS free_start,
      COALESCE(
        (SELECT min(merged_blocks.blocked_start) FROM merged_blocks),
        day_bounds.day_end
      ) AS free_end
    FROM day_bounds

    UNION ALL

    SELECT
      merged_blocks.blocked_end,
      lead(
        merged_blocks.blocked_start,
        1,
        merged_blocks.day_end
      ) OVER (ORDER BY merged_blocks.blocked_start, merged_blocks.blocked_end)
    FROM merged_blocks
  )
  SELECT free_intervals.free_start, free_intervals.free_end
  FROM free_intervals
  WHERE free_intervals.free_end > free_intervals.free_start
  ORDER BY free_intervals.free_start;
$function$;

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
    generated_slots.preferred_sport_id = generated_slots.sport_id,
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

COMMENT ON FUNCTION championship_bracket_preview_private.resolve_court_free_intervals(JSONB, DATE, UUID, UUID)
  IS 'Retorna as janelas físicas de uma quadra depois de intervalos, reservas, sessões individuais e finais manuais.';

COMMENT ON FUNCTION championship_bracket_preview_private.rebuild_job_slots(UUID)
  IS 'Reconstrói os slots exatos por intervalo físico e somente para as metas planejadas da quadra.';

DO $patch_process_batch$
DECLARE
  function_definition TEXT;
  initialization_source TEXT := $source$
  END IF;

  FOR slot_record IN
$source$;
  initialization_target TEXT := $target$
  END IF;

  IF job_record.algorithm_version = 'async-exact-v2'
    AND job_record.processed_slots = 0
    AND NOT EXISTS (
      SELECT 1
      FROM championship_bracket_preview_private.assignments
      WHERE job_id = _job_id
    )
  THEN
    PERFORM championship_bracket_preview_private.rebuild_job_slots(_job_id);

    SELECT *
    INTO job_record
    FROM championship_bracket_preview_private.jobs
    WHERE id = _job_id;
  END IF;

  FOR slot_record IN
$target$;
  strict_sequence_source TEXT := $source$
      )
      AND public.is_championship_bracket_competition_slot_playable(
$source$;
  strict_sequence_target TEXT := $target$
      )
      AND (
        slot_record.sequence_mode <> 'GROUP_NAIPE'
        OR slot_record.preferred_naipe IS NULL
        OR competitions_table.naipe = slot_record.preferred_naipe
      )
      AND public.is_championship_bracket_competition_slot_playable(
$target$;
BEGIN
  SELECT pg_get_functiondef(
    'championship_bracket_preview_private.process_batch(uuid)'::regprocedure
  )
  INTO function_definition;

  IF position(initialization_source IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível inserir a reconstrução física em process_batch(uuid).';
  END IF;

  function_definition := replace(
    function_definition,
    initialization_source,
    initialization_target
  );

  IF position(strict_sequence_source IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível restringir GROUP_NAIPE em process_batch(uuid).';
  END IF;

  function_definition := replace(
    function_definition,
    strict_sequence_source,
    strict_sequence_target
  );

  EXECUTE function_definition;
END;
$patch_process_batch$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.assign_job_match_numbers(
  _job_id UUID
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  WITH job_config AS (
    SELECT COALESCE(payload ->> 'match_numbering_mode', 'COURT') AS numbering_mode
    FROM championship_bracket_preview_private.jobs
    WHERE id = _job_id
  ), numbered_assignments AS (
    SELECT
      assignments_table.job_id,
      assignments_table.match_id,
      row_number() OVER (
        PARTITION BY CASE job_config.numbering_mode
          WHEN 'SPORT_NAIPE' THEN concat(
            'SPORT_NAIPE::',
            competitions_table.sport_id,
            '::',
            competitions_table.naipe
          )
          WHEN 'SPORT' THEN concat('SPORT::', competitions_table.sport_id)
          ELSE concat(
            'COURT::',
            slots_table.location_key,
            '::',
            slots_table.court_key
          )
        END
        ORDER BY
          slots_table.event_date,
          slots_table.start_at,
          slots_table.location_position,
          slots_table.court_position,
          competitions_table.position,
          groups_table.group_number,
          matches_table.round_number,
          matches_table.slot_number,
          matches_table.id
      )::integer AS match_number
    FROM championship_bracket_preview_private.assignments AS assignments_table
    JOIN championship_bracket_preview_private.matches AS matches_table
      ON matches_table.id = assignments_table.match_id
    JOIN championship_bracket_preview_private.competitions AS competitions_table
      ON competitions_table.id = matches_table.competition_id
    JOIN championship_bracket_preview_private.groups AS groups_table
      ON groups_table.id = matches_table.group_id
    JOIN championship_bracket_preview_private.slots AS slots_table
      ON slots_table.id = assignments_table.slot_id
    CROSS JOIN job_config
    WHERE assignments_table.job_id = _job_id
  )
  UPDATE championship_bracket_preview_private.assignments AS assignments_table
  SET match_number = numbered_assignments.match_number
  FROM numbered_assignments
  WHERE assignments_table.job_id = numbered_assignments.job_id
    AND assignments_table.match_id = numbered_assignments.match_id;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.finalize_job(
  _job_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
SET statement_timeout = '15s'
AS $function$
DECLARE
  job_record RECORD;
  manifest JSONB;
  total_group INTEGER;
  knockout_estimate INTEGER;
BEGIN
  SELECT *
  INTO job_record
  FROM championship_bracket_preview_private.jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF job_record.status <> 'FINALIZING' THEN
    RETURN;
  END IF;

  PERFORM championship_bracket_preview_private.assign_job_match_numbers(_job_id);

  SELECT count(*)
  INTO total_group
  FROM championship_bracket_preview_private.matches
  WHERE job_id = _job_id;

  SELECT COALESCE(
    sum(
      GREATEST(
        competitions_table.groups_count * competitions_table.qualifiers_per_group - 1,
        0
      ) + CASE
        WHEN competitions_table.third_place_mode <> 'NONE' THEN 1
        ELSE 0
      END
    ),
    0
  )::integer
  INTO knockout_estimate
  FROM championship_bracket_preview_private.competitions AS competitions_table
  WHERE competitions_table.job_id = _job_id;

  SELECT jsonb_build_object(
    'algorithm_version', job_record.algorithm_version,
    'payload_signature', job_record.payload_signature,
    'dependency_signature', job_record.dependency_signature,
    'groups', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'competition', competitions_table.competition_key,
          'group', groups_table.group_number,
          'teams', (
            SELECT jsonb_agg(group_teams_table.team_id ORDER BY group_teams_table.position)
            FROM championship_bracket_preview_private.group_teams AS group_teams_table
            WHERE group_teams_table.group_id = groups_table.id
          )
        )
        ORDER BY competitions_table.position, groups_table.group_number
      )
      FROM championship_bracket_preview_private.groups AS groups_table
      JOIN championship_bracket_preview_private.competitions AS competitions_table
        ON competitions_table.id = groups_table.competition_id
      WHERE groups_table.job_id = _job_id
    ), '[]'::jsonb),
    'matches', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'key', matches_table.logical_key,
          'competition', competitions_table.competition_key,
          'round', matches_table.round_number,
          'slot', matches_table.slot_number,
          'home', matches_table.home_team_id,
          'away', matches_table.away_team_id,
          'date', slots_table.event_date,
          'location', slots_table.location_name,
          'court', slots_table.court_name,
          'start', slots_table.start_at,
          'end', slots_table.end_at
        )
        ORDER BY
          slots_table.event_date,
          slots_table.start_at,
          slots_table.location_position,
          slots_table.court_position,
          matches_table.logical_key
      )
      FROM championship_bracket_preview_private.assignments AS assignments_table
      JOIN championship_bracket_preview_private.matches AS matches_table
        ON matches_table.id = assignments_table.match_id
      JOIN championship_bracket_preview_private.competitions AS competitions_table
        ON competitions_table.id = matches_table.competition_id
      JOIN championship_bracket_preview_private.slots AS slots_table
        ON slots_table.id = assignments_table.slot_id
      WHERE assignments_table.job_id = _job_id
    ), '[]'::jsonb)
  )
  INTO manifest;

  UPDATE championship_bracket_preview_private.jobs
  SET
    status = 'COMPLETED',
    stage = 'Concluída',
    progress_percentage = 100,
    summary = jsonb_build_object(
      'total_matches', total_group + knockout_estimate,
      'group_stage_matches', total_group,
      'knockout_matches', knockout_estimate,
      'scheduled_matches', total_group,
      'occupied_minutes', COALESCE((
        SELECT sum(EXTRACT(EPOCH FROM (slots_table.end_at - slots_table.start_at)) / 60)::integer
        FROM championship_bracket_preview_private.assignments AS assignments_table
        JOIN championship_bracket_preview_private.slots AS slots_table
          ON slots_table.id = assignments_table.slot_id
        WHERE assignments_table.job_id = _job_id
      ), 0),
      'available_minutes', COALESCE((
        SELECT sum(EXTRACT(EPOCH FROM (slots_table.end_at - slots_table.start_at)) / 60)::integer
        FROM championship_bracket_preview_private.slots AS slots_table
        WHERE slots_table.job_id = _job_id
      ), 0),
      'utilization_percentage', round(
        100 * total_group::numeric /
        GREATEST((
          SELECT count(*)
          FROM championship_bracket_preview_private.slots AS slots_table
          WHERE slots_table.job_id = _job_id
        ), 1),
        2
      ),
      'free_windows', (
        SELECT count(*)
        FROM championship_bracket_preview_private.slots AS slots_table
        WHERE slots_table.job_id = _job_id
          AND NOT EXISTS (
            SELECT 1
            FROM championship_bracket_preview_private.assignments AS assignments_table
            WHERE assignments_table.slot_id = slots_table.id
          )
      ),
      'conflict_count', 0,
      'warning_count', 0,
      'games_by_day', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'date', day_count.event_date,
            'matches', day_count.matches
          )
          ORDER BY day_count.event_date
        )
        FROM (
          SELECT
            slots_table.event_date,
            count(*)::integer AS matches
          FROM championship_bracket_preview_private.assignments AS assignments_table
          JOIN championship_bracket_preview_private.slots AS slots_table
            ON slots_table.id = assignments_table.slot_id
          WHERE assignments_table.job_id = _job_id
          GROUP BY slots_table.event_date
        ) AS day_count
      ), '[]'::jsonb)
    ),
    generation_signature = encode(
      extensions.digest(convert_to(manifest::text, 'UTF8'), 'sha256'),
      'hex'
    ),
    completed_at = now(),
    expires_at = now() + interval '7 days',
    heartbeat_at = now(),
    updated_at = now()
  WHERE id = _job_id;
END;
$function$;

COMMENT ON FUNCTION championship_bracket_preview_private.assign_job_match_numbers(UUID)
  IS 'Numera a prévia na ordem cronológica conforme COURT, SPORT_NAIPE ou SPORT.';

DO $patch_create_from_preview$
DECLARE
  function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.create_championship_bracket_from_preview_job(uuid,uuid,jsonb)'::regprocedure
  )
  INTO function_definition;

  IF position('async-exact-v1' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível atualizar a versão aceita na criação do campeonato.';
  END IF;

  EXECUTE replace(function_definition, 'async-exact-v1', 'async-exact-v2');
END;
$patch_create_from_preview$;

CREATE OR REPLACE FUNCTION public.get_championship_bracket_preview_job_day(
  _job_id UUID,
  _date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  job_record RECORD;
  result JSONB;
BEGIN
  SELECT *
  INTO job_record
  FROM championship_bracket_preview_private.jobs
  WHERE id = _job_id;

  IF job_record.id IS NULL
    OR (
      job_record.requested_by <> auth.uid()
      AND NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true)
    )
  THEN
    RAISE EXCEPTION 'Job de prévia não encontrado.';
  END IF;

  WITH day_config AS (
    SELECT day_item.value AS day
    FROM jsonb_array_elements(COALESCE(job_record.payload -> 'schedule_days', '[]'::jsonb)) day_item(value)
    WHERE day_item.value ->> 'date' = _date::text
    LIMIT 1
  ), court_config AS (
    SELECT
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
      day_config.day
    FROM day_config
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(day_config.day -> 'locations', '[]'::jsonb)) WITH ORDINALITY location_item(value, ordinality)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(location_item.value -> 'courts', '[]'::jsonb)) WITH ORDINALITY court_item(value, ordinality)
  ), match_entries AS (
    SELECT
      slots_table.location_key,
      slots_table.court_key,
      slots_table.start_at,
      slots_table.end_at,
      20 AS entry_order,
      jsonb_build_object(
        'type', 'MATCH',
        'start_time', to_char(slots_table.start_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
        'end_time', to_char(slots_table.end_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
        'duration_minutes', (EXTRACT(EPOCH FROM (slots_table.end_at - slots_table.start_at)) / 60)::integer,
        'match_kind', 'GROUP_STAGE',
        'match_number', assignments_table.match_number,
        'sport_id', competitions_table.sport_id,
        'sport_name', competitions_table.sport_name,
        'naipe', competitions_table.naipe,
        'division', competitions_table.division,
        'phase', 'GROUP_STAGE',
        'phase_label', 'Grupos',
        'group_number', groups_table.group_number,
        'round_number', matches_table.round_number,
        'reason_code', NULL,
        'projected', false,
        'manual_final', false,
        'reason', NULL
      ) AS entry
    FROM championship_bracket_preview_private.assignments AS assignments_table
    JOIN championship_bracket_preview_private.slots AS slots_table
      ON slots_table.id = assignments_table.slot_id
    JOIN championship_bracket_preview_private.matches AS matches_table
      ON matches_table.id = assignments_table.match_id
    JOIN championship_bracket_preview_private.competitions AS competitions_table
      ON competitions_table.id = matches_table.competition_id
    JOIN championship_bracket_preview_private.groups AS groups_table
      ON groups_table.id = matches_table.group_id
    WHERE assignments_table.job_id = _job_id
      AND slots_table.event_date = _date
  ), break_entries AS (
    SELECT
      court_config.location_key,
      court_config.court_key,
      public.combine_bracket_schedule_timestamp(
        _date,
        (court_config.day ->> 'break_start_time')::time
      ) AS start_at,
      public.combine_bracket_schedule_timestamp(
        _date,
        (court_config.day ->> 'break_end_time')::time
      ) AS end_at,
      10 AS entry_order,
      jsonb_build_object(
        'type', 'BREAK',
        'start_time', court_config.day ->> 'break_start_time',
        'end_time', court_config.day ->> 'break_end_time',
        'duration_minutes', (
          EXTRACT(EPOCH FROM (
            public.combine_bracket_schedule_timestamp(
              _date,
              (court_config.day ->> 'break_end_time')::time
            ) - public.combine_bracket_schedule_timestamp(
              _date,
              (court_config.day ->> 'break_start_time')::time
            )
          )) / 60
        )::integer,
        'match_kind', NULL,
        'match_number', NULL,
        'sport_id', NULL,
        'sport_name', NULL,
        'naipe', NULL,
        'division', NULL,
        'phase', NULL,
        'phase_label', NULL,
        'group_number', NULL,
        'round_number', NULL,
        'reason_code', 'SCHEDULE_BREAK',
        'projected', false,
        'manual_final', false,
        'reason', 'Intervalo da programação'
      ) AS entry
    FROM court_config
    WHERE NULLIF(court_config.day ->> 'break_start_time', '') IS NOT NULL
      AND NULLIF(court_config.day ->> 'break_end_time', '') IS NOT NULL
  ), resource_lock_entries AS (
    SELECT
      court_config.location_key,
      court_config.court_key,
      public.combine_bracket_schedule_timestamp(
        _date,
        (lock_item.value ->> 'start_time')::time
      ) AS start_at,
      public.combine_bracket_schedule_timestamp(
        _date,
        (lock_item.value ->> 'end_time')::time
      ) AS end_at,
      10 AS entry_order,
      jsonb_build_object(
        'type', 'RESERVATION',
        'start_time', lock_item.value ->> 'start_time',
        'end_time', lock_item.value ->> 'end_time',
        'duration_minutes', (
          EXTRACT(EPOCH FROM (
            public.combine_bracket_schedule_timestamp(
              _date,
              (lock_item.value ->> 'end_time')::time
            ) - public.combine_bracket_schedule_timestamp(
              _date,
              (lock_item.value ->> 'start_time')::time
            )
          )) / 60
        )::integer,
        'match_kind', NULL,
        'match_number', NULL,
        'sport_id', NULLIF(lock_item.value ->> 'sport_id', '')::uuid,
        'sport_name', sports_table.name,
        'naipe', NULLIF(lock_item.value ->> 'naipe', '')::public.match_naipe,
        'division', NULLIF(lock_item.value ->> 'division', '')::public.team_division,
        'phase', NULL,
        'phase_label', NULL,
        'group_number', NULL,
        'round_number', NULL,
        'reason_code', COALESCE(lock_item.value ->> 'lock_mode', 'RESOURCE_LOCK'),
        'projected', false,
        'manual_final', false,
        'reason', 'Reserva fixa'
      ) AS entry
    FROM court_config
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(job_record.payload -> 'resource_locks', '[]'::jsonb)) lock_item(value)
    LEFT JOIN public.sports AS sports_table
      ON sports_table.id = NULLIF(lock_item.value ->> 'sport_id', '')::uuid
    WHERE lock_item.value ->> 'date' = _date::text
      AND lock_item.value ->> 'location_key' = court_config.location_key::text
      AND lock_item.value ->> 'court_key' = court_config.court_key::text
      AND NULLIF(lock_item.value ->> 'start_time', '') IS NOT NULL
      AND NULLIF(lock_item.value ->> 'end_time', '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(job_record.payload -> 'individual_session_configs', '[]'::jsonb)) session_item(value)
        WHERE session_item.value ->> 'scheduled_date' = _date::text
          AND session_item.value ->> 'location_key' = court_config.location_key::text
          AND session_item.value ->> 'court_key' = court_config.court_key::text
          AND session_item.value ->> 'start_time' = lock_item.value ->> 'start_time'
          AND session_item.value ->> 'end_time' = lock_item.value ->> 'end_time'
          AND COALESCE(session_item.value ->> 'sport_id', '') = COALESCE(lock_item.value ->> 'sport_id', '')
      )
  ), individual_session_entries AS (
    SELECT
      court_config.location_key,
      court_config.court_key,
      public.combine_bracket_schedule_timestamp(
        _date,
        (session_item.value ->> 'start_time')::time
      ) AS start_at,
      public.combine_bracket_schedule_timestamp(
        _date,
        (session_item.value ->> 'end_time')::time
      ) AS end_at,
      10 AS entry_order,
      jsonb_build_object(
        'type', 'INDIVIDUAL_SESSION',
        'start_time', session_item.value ->> 'start_time',
        'end_time', session_item.value ->> 'end_time',
        'duration_minutes', (
          EXTRACT(EPOCH FROM (
            public.combine_bracket_schedule_timestamp(
              _date,
              (session_item.value ->> 'end_time')::time
            ) - public.combine_bracket_schedule_timestamp(
              _date,
              (session_item.value ->> 'start_time')::time
            )
          )) / 60
        )::integer,
        'match_kind', NULL,
        'match_number', NULL,
        'sport_id', NULLIF(session_item.value ->> 'sport_id', '')::uuid,
        'sport_name', sports_table.name,
        'naipe', NULLIF(session_item.value ->> 'naipe', '')::public.match_naipe,
        'division', NULLIF(session_item.value ->> 'division', '')::public.team_division,
        'phase', NULL,
        'phase_label', NULL,
        'group_number', NULL,
        'round_number', NULL,
        'reason_code', 'INDIVIDUAL_SESSION',
        'projected', false,
        'manual_final', false,
        'reason', 'Sessão de modalidade individual'
      ) AS entry
    FROM court_config
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(job_record.payload -> 'individual_session_configs', '[]'::jsonb)) session_item(value)
    LEFT JOIN public.sports AS sports_table
      ON sports_table.id = NULLIF(session_item.value ->> 'sport_id', '')::uuid
    WHERE session_item.value ->> 'scheduled_date' = _date::text
      AND session_item.value ->> 'location_key' = court_config.location_key::text
      AND session_item.value ->> 'court_key' = court_config.court_key::text
      AND NULLIF(session_item.value ->> 'start_time', '') IS NOT NULL
      AND NULLIF(session_item.value ->> 'end_time', '') IS NOT NULL
  ), manual_final_entries AS (
    SELECT
      court_config.location_key,
      court_config.court_key,
      public.combine_bracket_schedule_timestamp(
        _date,
        (block_item.value ->> 'start_time')::time
      ) AS start_at,
      public.combine_bracket_schedule_timestamp(
        _date,
        (block_item.value ->> 'end_time')::time
      ) AS end_at,
      10 AS entry_order,
      jsonb_build_object(
        'type', 'RESERVATION',
        'start_time', block_item.value ->> 'start_time',
        'end_time', block_item.value ->> 'end_time',
        'duration_minutes', (
          EXTRACT(EPOCH FROM (
            public.combine_bracket_schedule_timestamp(
              _date,
              (block_item.value ->> 'end_time')::time
            ) - public.combine_bracket_schedule_timestamp(
              _date,
              (block_item.value ->> 'start_time')::time
            )
          )) / 60
        )::integer,
        'match_kind', 'MANUAL_FINAL',
        'match_number', NULL,
        'sport_id', NULLIF(block_item.value ->> 'sport_id', '')::uuid,
        'sport_name', sports_table.name,
        'naipe', NULL,
        'division', NULL,
        'phase', COALESCE(block_item.value ->> 'phase', 'FINAL'),
        'phase_label', 'Final',
        'group_number', NULL,
        'round_number', NULL,
        'reason_code', 'MANUAL_FINAL_BLOCK',
        'projected', false,
        'manual_final', true,
        'reason', 'Final programada manualmente'
      ) AS entry
    FROM court_config
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(job_record.payload -> 'knockout_program_blocks', '[]'::jsonb)) block_item(value)
    LEFT JOIN public.sports AS sports_table
      ON sports_table.id = NULLIF(block_item.value ->> 'sport_id', '')::uuid
    WHERE block_item.value ->> 'date' = _date::text
      AND block_item.value ->> 'location_key' = court_config.location_key::text
      AND block_item.value ->> 'court_key' = court_config.court_key::text
      AND NULLIF(block_item.value ->> 'start_time', '') IS NOT NULL
      AND NULLIF(block_item.value ->> 'end_time', '') IS NOT NULL
  ), fixed_entries AS (
    SELECT * FROM break_entries
    UNION ALL
    SELECT * FROM resource_lock_entries
    UNION ALL
    SELECT * FROM individual_session_entries
    UNION ALL
    SELECT * FROM manual_final_entries
  ), base_free_intervals AS (
    SELECT
      court_config.location_key,
      court_config.court_key,
      free_interval.start_at,
      free_interval.end_at,
      row_number() OVER (
        PARTITION BY court_config.location_key, court_config.court_key
        ORDER BY free_interval.start_at
      ) AS interval_index
    FROM court_config
    CROSS JOIN LATERAL championship_bracket_preview_private.resolve_court_free_intervals(
      job_record.payload,
      _date,
      court_config.location_key,
      court_config.court_key
    ) free_interval
  ), interval_matches AS (
    SELECT
      base_free_intervals.location_key,
      base_free_intervals.court_key,
      base_free_intervals.interval_index,
      base_free_intervals.start_at AS interval_start,
      base_free_intervals.end_at AS interval_end,
      match_entries.start_at,
      match_entries.end_at
    FROM base_free_intervals
    LEFT JOIN match_entries
      ON match_entries.location_key = base_free_intervals.location_key
      AND match_entries.court_key = base_free_intervals.court_key
      AND match_entries.start_at >= base_free_intervals.start_at
      AND match_entries.end_at <= base_free_intervals.end_at
  ), free_window_ranges AS (
    SELECT
      interval_matches.location_key,
      interval_matches.court_key,
      interval_matches.interval_start AS start_at,
      COALESCE(min(interval_matches.start_at), interval_matches.interval_end) AS end_at
    FROM interval_matches
    GROUP BY
      interval_matches.location_key,
      interval_matches.court_key,
      interval_matches.interval_index,
      interval_matches.interval_start,
      interval_matches.interval_end

    UNION ALL

    SELECT
      interval_matches.location_key,
      interval_matches.court_key,
      interval_matches.end_at,
      lead(
        interval_matches.start_at,
        1,
        interval_matches.interval_end
      ) OVER (
        PARTITION BY
          interval_matches.location_key,
          interval_matches.court_key,
          interval_matches.interval_index
        ORDER BY interval_matches.start_at
      )
    FROM interval_matches
    WHERE interval_matches.start_at IS NOT NULL
  ), free_window_entries AS (
    SELECT
      free_window_ranges.location_key,
      free_window_ranges.court_key,
      free_window_ranges.start_at,
      free_window_ranges.end_at,
      30 AS entry_order,
      jsonb_build_object(
        'type', 'EMPTY',
        'start_time', to_char(free_window_ranges.start_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
        'end_time', to_char(free_window_ranges.end_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
        'duration_minutes', (EXTRACT(EPOCH FROM (free_window_ranges.end_at - free_window_ranges.start_at)) / 60)::integer,
        'match_kind', NULL,
        'match_number', NULL,
        'sport_id', NULL,
        'sport_name', NULL,
        'naipe', NULL,
        'division', NULL,
        'phase', NULL,
        'phase_label', NULL,
        'group_number', NULL,
        'round_number', NULL,
        'reason_code', 'FREE_WINDOW',
        'projected', false,
        'manual_final', false,
        'reason', NULL
      ) AS entry
    FROM free_window_ranges
    WHERE free_window_ranges.end_at > free_window_ranges.start_at
  ), all_entries AS (
    SELECT * FROM match_entries
    UNION ALL
    SELECT * FROM fixed_entries
    UNION ALL
    SELECT * FROM free_window_entries
  ), court_metrics AS (
    SELECT
      court_config.location_key,
      court_config.location_name,
      court_config.location_position,
      court_config.court_key,
      court_config.court_name,
      court_config.court_position,
      COALESCE((
        SELECT sum(EXTRACT(EPOCH FROM (base_free_intervals.end_at - base_free_intervals.start_at)) / 60)::integer
        FROM base_free_intervals
        WHERE base_free_intervals.location_key = court_config.location_key
          AND base_free_intervals.court_key = court_config.court_key
      ), 0) AS available_minutes,
      COALESCE((
        SELECT sum(EXTRACT(EPOCH FROM (match_entries.end_at - match_entries.start_at)) / 60)::integer
        FROM match_entries
        WHERE match_entries.location_key = court_config.location_key
          AND match_entries.court_key = court_config.court_key
      ), 0) AS occupied_minutes,
      COALESCE((
        SELECT count(*)::integer
        FROM free_window_entries
        WHERE free_window_entries.location_key = court_config.location_key
          AND free_window_entries.court_key = court_config.court_key
      ), 0) AS free_windows,
      COALESCE((
        SELECT jsonb_agg(
          all_entries.entry
          ORDER BY all_entries.start_at, all_entries.entry_order, all_entries.end_at
        )
        FROM all_entries
        WHERE all_entries.location_key = court_config.location_key
          AND all_entries.court_key = court_config.court_key
      ), '[]'::jsonb) AS entries
    FROM court_config
  ), location_rows AS (
    SELECT
      court_metrics.location_key,
      court_metrics.location_name,
      court_metrics.location_position,
      jsonb_agg(
        jsonb_build_object(
          'court_key', court_metrics.court_key,
          'court_name', court_metrics.court_name,
          'occupied_minutes', court_metrics.occupied_minutes,
          'available_minutes', court_metrics.available_minutes,
          'utilization_percentage', round(
            100 * court_metrics.occupied_minutes::numeric /
            GREATEST(court_metrics.available_minutes, 1),
            2
          ),
          'free_windows', court_metrics.free_windows,
          'entries', court_metrics.entries
        )
        ORDER BY court_metrics.court_position
      ) AS courts
    FROM court_metrics
    GROUP BY
      court_metrics.location_key,
      court_metrics.location_name,
      court_metrics.location_position
  )
  SELECT jsonb_build_object(
    'date', _date,
    'start_time', day_config.day ->> 'start_time',
    'end_time', day_config.day ->> 'end_time',
    'breaks', '[]'::jsonb,
    'occupied_minutes', COALESCE((SELECT sum(court_metrics.occupied_minutes) FROM court_metrics), 0),
    'available_minutes', COALESCE((SELECT sum(court_metrics.available_minutes) FROM court_metrics), 0),
    'free_windows', COALESCE((SELECT sum(court_metrics.free_windows) FROM court_metrics), 0),
    'utilization_percentage', round(
      100 * COALESCE((SELECT sum(court_metrics.occupied_minutes) FROM court_metrics), 0)::numeric /
      GREATEST(COALESCE((SELECT sum(court_metrics.available_minutes) FROM court_metrics), 0), 1),
      2
    ),
    'locations', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'location_key', location_rows.location_key,
          'location_name', location_rows.location_name,
          'courts', location_rows.courts
        )
        ORDER BY location_rows.location_position
      )
      FROM location_rows
    ), '[]'::jsonb)
  )
  INTO result
  FROM day_config;

  RETURN COALESCE(
    result,
    jsonb_build_object(
      'date', _date,
      'start_time', NULL,
      'end_time', NULL,
      'breaks', '[]'::jsonb,
      'occupied_minutes', 0,
      'available_minutes', 0,
      'free_windows', 0,
      'utilization_percentage', 0,
      'locations', '[]'::jsonb
    )
  );
END;
$function$;

COMMENT ON FUNCTION public.get_championship_bracket_preview_job_day(UUID, DATE)
  IS 'Retorna a cronologia física completa do dia, com jogos, intervalos, reservas, sessões e janelas livres.';

NOTIFY pgrst, 'reload schema';
