-- LAJE-81: a Etapa 13 passa a representar a programação estrutural completa.
--
-- A v7 continua sendo usada exclusivamente para a busca já validada da fase de
-- grupos. A camada abaixo materializa os nós eliminatórios no próprio job,
-- valida targets antes da busca extensa e torna o resultado consumido um
-- contrato imutável da criação do campeonato.

ALTER TABLE championship_bracket_preview_private.jobs
  ALTER COLUMN algorithm_version SET DEFAULT 'async-exact-v8';

CREATE TABLE IF NOT EXISTS championship_bracket_preview_private.knockout_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES championship_bracket_preview_private.jobs(id) ON DELETE CASCADE,
  competition_id UUID NOT NULL REFERENCES championship_bracket_preview_private.competitions(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  slot_number INTEGER NOT NULL,
  logical_key TEXT NOT NULL,
  home_source_type TEXT NOT NULL,
  home_source_reference TEXT NOT NULL,
  away_source_type TEXT NOT NULL,
  away_source_reference TEXT NOT NULL,
  predecessor_match_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  scheduled_slot_id BIGINT NULL REFERENCES championship_bracket_preview_private.slots(id) ON DELETE SET NULL,
  scheduled_date DATE NULL,
  location_key UUID NULL,
  location_name TEXT NULL,
  court_key UUID NULL,
  court_name TEXT NULL,
  start_at TIMESTAMPTZ NULL,
  end_at TIMESTAMPTZ NULL,
  duration_minutes INTEGER NOT NULL,
  projected BOOLEAN NOT NULL DEFAULT true,
  manual_final BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, logical_key)
);

CREATE INDEX IF NOT EXISTS championship_bracket_preview_knockout_matches_schedule_idx
  ON championship_bracket_preview_private.knockout_matches (job_id, scheduled_date, start_at, location_key, court_key);
CREATE INDEX IF NOT EXISTS championship_bracket_preview_knockout_matches_competition_idx
  ON championship_bracket_preview_private.knockout_matches (job_id, competition_id, round_number, slot_number);

CREATE TABLE IF NOT EXISTS championship_bracket_preview_private.relocation_attempt_metrics (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES championship_bracket_preview_private.jobs(id) ON DELETE CASCADE,
  match_id UUID NULL REFERENCES championship_bracket_preview_private.matches(id) ON DELETE SET NULL,
  phase TEXT NOT NULL,
  rest_gap INTEGER NOT NULL,
  search_tier TEXT NOT NULL,
  candidate_rank INTEGER NULL,
  candidate_slot_id BIGINT NULL REFERENCES championship_bracket_preview_private.slots(id) ON DELETE SET NULL,
  max_depth INTEGER NOT NULL,
  candidate_limit INTEGER NOT NULL,
  relocation_limit INTEGER NOT NULL,
  result_status TEXT NOT NULL,
  timeout_count INTEGER NOT NULL DEFAULT 0,
  relocations_used INTEGER NOT NULL DEFAULT 0,
  branches_examined INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS championship_bracket_preview_relocation_attempt_metrics_job_idx
  ON championship_bracket_preview_private.relocation_attempt_metrics (job_id, created_at DESC);

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_v8_target_preflight(
  _job_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  WITH targets AS (
    SELECT
      (target_item.value ->> 'sport_id')::uuid AS sport_id,
      sum(GREATEST(COALESCE((target_item.value ->> 'planned_match_count')::integer, 0), 0))::integer AS target_count
    FROM championship_bracket_preview_private.jobs jobs_table
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(jobs_table.payload -> 'schedule_days', '[]'::jsonb)) day_item(value)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(day_item.value -> 'locations', '[]'::jsonb)) location_item(value)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(location_item.value -> 'courts', '[]'::jsonb)) court_item(value)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(court_item.value -> 'sport_match_targets', '[]'::jsonb)) target_item(value)
    WHERE jobs_table.id = _job_id
    GROUP BY (target_item.value ->> 'sport_id')::uuid
  ), group_matches AS (
    SELECT competitions_table.sport_id, count(*)::integer AS match_count
    FROM championship_bracket_preview_private.matches matches_table
    JOIN championship_bracket_preview_private.competitions competitions_table
      ON competitions_table.id = matches_table.competition_id
    WHERE matches_table.job_id = _job_id
    GROUP BY competitions_table.sport_id
  ), invalid_targets AS (
    SELECT jsonb_build_object(
      'code', 'SPORT_MATCH_TARGET_TOTAL_MISMATCH',
      'message', format(
        'A modalidade %s possui %s partidas de grupos, mas os targets configurados somam %s.',
        COALESCE(sports_table.name, targets.sport_id::text),
        COALESCE(group_matches.match_count, 0),
        targets.target_count
      ),
      'sport_id', targets.sport_id
    ) AS diagnostic
    FROM targets
    LEFT JOIN group_matches ON group_matches.sport_id = targets.sport_id
    LEFT JOIN public.sports sports_table ON sports_table.id = targets.sport_id
    WHERE targets.target_count <> COALESCE(group_matches.match_count, 0)
  ), invalid_capacity AS (
    SELECT jsonb_build_object(
      'code', 'SPORT_MATCH_TARGET_CAPACITY_EXCEEDED',
      'message', format(
        '%s em %s possui capacidade de %s slots após os bloqueios, mas foram solicitados %s.',
        COALESCE(slots_table.court_name, 'Quadra'),
        slots_table.event_date::text,
        count(*),
        target_item.target_count
      ),
      'sport_id', slots_table.sport_id,
      'date', slots_table.event_date,
      'court_key', slots_table.court_key
    ) AS diagnostic
    FROM championship_bracket_preview_private.slots slots_table
    JOIN LATERAL championship_bracket_preview_private.resolve_slot_sport_target(
      (SELECT payload FROM championship_bracket_preview_private.jobs WHERE id = _job_id),
      slots_table.event_date,
      slots_table.court_key,
      slots_table.sport_id
    ) target_item ON target_item.has_sport_targets
    WHERE slots_table.job_id = _job_id
    GROUP BY slots_table.event_date, slots_table.court_key, slots_table.court_name, slots_table.sport_id, target_item.target_count
    HAVING count(*) < target_item.target_count
  )
  SELECT COALESCE(jsonb_agg(diagnostic), '[]'::jsonb)
  FROM (
    SELECT diagnostic FROM invalid_targets
    UNION ALL
    SELECT diagnostic FROM invalid_capacity
  ) diagnostics;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.create_v8_knockout_matches(
  _job_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  competition_record RECORD;
  qualifier_count INTEGER;
  lower_power INTEGER;
  phase_round INTEGER;
  phase_match_count INTEGER;
  phase_name TEXT;
  phase_match INTEGER;
  previous_matches UUID[];
BEGIN
  DELETE FROM championship_bracket_preview_private.knockout_matches
  WHERE job_id = _job_id;

  FOR competition_record IN
    SELECT *
    FROM championship_bracket_preview_private.competitions
    WHERE job_id = _job_id
    ORDER BY position, competition_key
  LOOP
    qualifier_count := competition_record.groups_count * competition_record.qualifiers_per_group;
    IF qualifier_count < 2 THEN
      CONTINUE;
    END IF;

    lower_power := 1;
    WHILE lower_power * 2 <= qualifier_count LOOP
      lower_power := lower_power * 2;
    END LOOP;

    phase_round := 1;
    phase_match_count := CASE
      WHEN qualifier_count = lower_power THEN lower_power / 2
      ELSE qualifier_count - lower_power
    END;

    WHILE phase_match_count > 0 LOOP
      phase_name := CASE phase_match_count
        WHEN 1 THEN 'FINAL'
        WHEN 2 THEN 'SEMIFINAL'
        WHEN 4 THEN 'QUARTERFINAL'
        WHEN 8 THEN 'ROUND_OF_16'
        ELSE 'KNOCKOUT'
      END;

      FOR phase_match IN 1..phase_match_count LOOP
        SELECT COALESCE(array_agg(previous_phase.id ORDER BY previous_phase.slot_number), ARRAY[]::uuid[])
        INTO previous_matches
        FROM championship_bracket_preview_private.knockout_matches previous_phase
        WHERE previous_phase.job_id = _job_id
          AND previous_phase.competition_id = competition_record.id
          AND previous_phase.round_number = phase_round - 1
          AND previous_phase.slot_number IN ((phase_match * 2) - 1, phase_match * 2);

        INSERT INTO championship_bracket_preview_private.knockout_matches (
          job_id, competition_id, phase, round_number, slot_number, logical_key,
          home_source_type, home_source_reference, away_source_type, away_source_reference,
          predecessor_match_ids, duration_minutes
        ) VALUES (
          _job_id, competition_record.id, phase_name, phase_round, phase_match,
          format('%s::%s::%s', competition_record.competition_key, phase_name, phase_match),
          CASE WHEN phase_round = 1 THEN 'GROUP_POSITION' ELSE 'WINNER_OF_MATCH' END,
          CASE WHEN phase_round = 1 THEN format('QUALIFIER_%s', (phase_match * 2) - 1) ELSE format('WINNER_%s', COALESCE(previous_matches[1]::text, 'UNKNOWN')) END,
          CASE WHEN phase_round = 1 THEN 'GROUP_POSITION' ELSE 'WINNER_OF_MATCH' END,
          CASE WHEN phase_round = 1 THEN format('QUALIFIER_%s', phase_match * 2) ELSE format('WINNER_%s', COALESCE(previous_matches[2]::text, 'UNKNOWN')) END,
          previous_matches,
          COALESCE((
            SELECT championship_sports.default_match_duration_minutes
            FROM public.championship_sports
            WHERE championship_sports.championship_id = (SELECT championship_id FROM championship_bracket_preview_private.jobs WHERE id = _job_id)
              AND championship_sports.sport_id = competition_record.sport_id
          ), 35)
        );
      END LOOP;

      IF phase_match_count = 1 THEN
        EXIT;
      END IF;
      phase_round := phase_round + 1;
      phase_match_count := CASE WHEN phase_round = 2 AND qualifier_count > lower_power THEN lower_power / 2 ELSE phase_match_count / 2 END;
    END LOOP;

    IF competition_record.third_place_mode <> 'NONE' THEN
      INSERT INTO championship_bracket_preview_private.knockout_matches (
        job_id, competition_id, phase, round_number, slot_number, logical_key,
        home_source_type, home_source_reference, away_source_type, away_source_reference,
        duration_minutes
      ) VALUES (
        _job_id, competition_record.id, 'THIRD_PLACE', phase_round, 2,
        format('%s::THIRD_PLACE::1', competition_record.competition_key),
        'LOSER_OF_MATCH', 'LOSER_SEMIFINAL_1', 'LOSER_OF_MATCH', 'LOSER_SEMIFINAL_2',
        COALESCE((SELECT default_match_duration_minutes FROM public.championship_sports WHERE championship_id = (SELECT championship_id FROM championship_bracket_preview_private.jobs WHERE id = _job_id) AND sport_id = competition_record.sport_id), 35)
      );
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.schedule_v8_knockout_matches(
  _job_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  knockout_record RECORD;
  manual_block RECORD;
  candidate_slot RECORD;
  naipe_position INTEGER;
  diagnostic_items JSONB := '[]'::jsonb;
BEGIN
  -- Finais manuais são destinos autoritativos; a sequência de naipes ocupa o bloco em ordem.
  FOR knockout_record IN
    SELECT knockout_matches.*, competitions.sport_id, competitions.naipe, competitions.division
    FROM championship_bracket_preview_private.knockout_matches knockout_matches
    JOIN championship_bracket_preview_private.competitions competitions ON competitions.id = knockout_matches.competition_id
    WHERE knockout_matches.job_id = _job_id
      AND knockout_matches.phase = 'FINAL'
    ORDER BY knockout_matches.round_number, knockout_matches.slot_number, knockout_matches.logical_key
  LOOP
    SELECT block_item.value AS block
    INTO manual_block
    FROM championship_bracket_preview_private.jobs jobs_table
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(jobs_table.payload -> 'knockout_program_blocks', '[]'::jsonb)) block_item(value)
    WHERE jobs_table.id = _job_id
      AND block_item.value ->> 'sport_id' = knockout_record.sport_id::text
      AND COALESCE(block_item.value ->> 'phase', 'FINAL') = 'FINAL'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(COALESCE(block_item.value -> 'naipe_sequence', '[]'::jsonb)) sequence_item(value)
        WHERE sequence_item.value = knockout_record.naipe::text
      )
    ORDER BY COALESCE((block_item.value ->> 'display_order')::integer, 0)
    LIMIT 1;

    IF manual_block.block IS NOT NULL THEN
      SELECT sequence_item.ordinality::integer
      INTO naipe_position
      FROM jsonb_array_elements_text(COALESCE(manual_block.block -> 'naipe_sequence', '[]'::jsonb)) WITH ORDINALITY sequence_item(value, ordinality)
      WHERE sequence_item.value = knockout_record.naipe::text
      LIMIT 1;

      UPDATE championship_bracket_preview_private.knockout_matches
      SET
        scheduled_date = (manual_block.block ->> 'date')::date,
        location_key = (manual_block.block ->> 'location_key')::uuid,
        court_key = (manual_block.block ->> 'court_key')::uuid,
        location_name = (manual_block.block ->> 'location_name'),
        court_name = (manual_block.block ->> 'court_name'),
        start_at = public.combine_bracket_schedule_timestamp((manual_block.block ->> 'date')::date, (manual_block.block ->> 'start_time')::time) + make_interval(mins => (naipe_position - 1) * COALESCE((manual_block.block ->> 'match_duration_minutes_override')::integer, knockout_record.duration_minutes)),
        end_at = public.combine_bracket_schedule_timestamp((manual_block.block ->> 'date')::date, (manual_block.block ->> 'start_time')::time) + make_interval(mins => naipe_position * COALESCE((manual_block.block ->> 'match_duration_minutes_override')::integer, knockout_record.duration_minutes)),
        duration_minutes = COALESCE((manual_block.block ->> 'match_duration_minutes_override')::integer, knockout_record.duration_minutes),
        manual_final = true
      WHERE id = knockout_record.id;
      CONTINUE;
    END IF;

    SELECT slots_table.*
    INTO candidate_slot
    FROM championship_bracket_preview_private.slots slots_table
    WHERE slots_table.job_id = _job_id
      AND slots_table.sport_id = knockout_record.sport_id
      AND NOT EXISTS (SELECT 1 FROM championship_bracket_preview_private.assignments assignments_table WHERE assignments_table.slot_id = slots_table.id)
      AND NOT EXISTS (SELECT 1 FROM championship_bracket_preview_private.knockout_matches scheduled_knockout WHERE scheduled_knockout.scheduled_slot_id = slots_table.id)
      AND NOT EXISTS (
        SELECT 1 FROM championship_bracket_preview_private.knockout_matches predecessor
        WHERE predecessor.id = ANY(knockout_record.predecessor_match_ids)
          AND predecessor.end_at IS NOT NULL
          AND predecessor.end_at > slots_table.start_at
      )
    ORDER BY slots_table.event_date, slots_table.start_at, slots_table.location_position, slots_table.court_position
    LIMIT 1;

    IF candidate_slot.id IS NULL THEN
      diagnostic_items := diagnostic_items || jsonb_build_array(jsonb_build_object(
        'code', 'KNOCKOUT_SLOT_UNAVAILABLE',
        'message', format('Não existe janela compatível para %s da competição %s.', knockout_record.phase, knockout_record.logical_key),
        'logical_key', knockout_record.logical_key
      ));
    ELSE
      UPDATE championship_bracket_preview_private.knockout_matches
      SET scheduled_slot_id = candidate_slot.id, scheduled_date = candidate_slot.event_date,
          location_key = candidate_slot.location_key, location_name = candidate_slot.location_name,
          court_key = candidate_slot.court_key, court_name = candidate_slot.court_name,
          start_at = candidate_slot.start_at, end_at = candidate_slot.end_at
      WHERE id = knockout_record.id;
    END IF;
  END LOOP;
  RETURN diagnostic_items;
END;
$function$;

ALTER FUNCTION championship_bracket_preview_private.process_batch(UUID) RENAME TO process_batch_v7;
ALTER FUNCTION championship_bracket_preview_private.finalize_job(UUID) RENAME TO finalize_job_v7;
ALTER FUNCTION public.get_championship_bracket_preview_job_day(UUID, DATE) RENAME TO get_championship_bracket_preview_job_day_v7;
ALTER FUNCTION public.start_championship_bracket_preview_job(UUID, JSONB) RENAME TO start_championship_bracket_preview_job_v7;
ALTER FUNCTION public.get_championship_bracket_preview_job_status(UUID) RENAME TO get_championship_bracket_preview_job_status_v7;

-- O corpo v7 continua sendo chamado como uma função privada. Ele precisa
-- reconhecer a nova versão para manter a mesma construção de slots físicos.
DO $allow_v8_in_group_solver$
DECLARE function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef('championship_bracket_preview_private.process_batch_v7(uuid)'::regprocedure)
  INTO function_definition;
  EXECUTE replace(function_definition, '''async-exact-v7''', '''async-exact-v7'', ''async-exact-v8''');
END;
$allow_v8_in_group_solver$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.process_batch(_job_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE result JSONB; diagnostics JSONB;
BEGIN
  result := championship_bracket_preview_private.process_batch_v7(_job_id);
  SELECT championship_bracket_preview_private.resolve_v8_target_preflight(_job_id) INTO diagnostics;
  IF COALESCE(jsonb_array_length(diagnostics), 0) > 0 THEN
    UPDATE championship_bracket_preview_private.jobs
    SET status = 'FAILED', stage = 'Validação estrutural', diagnostics = diagnostics,
        error_message = diagnostics -> 0 ->> 'message', completed_at = now(), updated_at = now()
    WHERE id = _job_id AND status NOT IN ('COMPLETED', 'CONSUMED');
    RETURN jsonb_build_object('continue', false);
  END IF;
  IF EXISTS (
    SELECT 1 FROM championship_bracket_preview_private.jobs
    WHERE id = _job_id AND algorithm_version = 'async-exact-v8' AND status = 'COMPLETED'
  ) THEN
    -- O corpo histórico resolve a chamada pelo OID original; finalizamos a
    -- camada v8 explicitamente depois do último lote de grupos.
    PERFORM championship_bracket_preview_private.finalize_job(_job_id);
  END IF;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.finalize_job(_job_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE job_record RECORD; schedule_diagnostics JSONB; manifest JSONB;
BEGIN
  PERFORM championship_bracket_preview_private.finalize_job_v7(_job_id);
  SELECT * INTO job_record FROM championship_bracket_preview_private.jobs WHERE id = _job_id FOR UPDATE;
  IF job_record.status <> 'COMPLETED' OR job_record.algorithm_version <> 'async-exact-v8' THEN RETURN; END IF;
  PERFORM championship_bracket_preview_private.create_v8_knockout_matches(_job_id);
  SELECT championship_bracket_preview_private.schedule_v8_knockout_matches(_job_id) INTO schedule_diagnostics;
  IF jsonb_array_length(schedule_diagnostics) > 0 THEN
    UPDATE championship_bracket_preview_private.jobs
    SET status = 'FAILED', stage = 'Programação eliminatória', diagnostics = schedule_diagnostics,
        error_message = schedule_diagnostics -> 0 ->> 'message', updated_at = now()
    WHERE id = _job_id;
    RETURN;
  END IF;
  SELECT jsonb_build_object(
    'algorithm_version', job_record.algorithm_version,
    'groups', COALESCE((SELECT jsonb_agg(jsonb_build_object('competition', competitions.competition_key, 'group', groups.group_number, 'teams', (SELECT jsonb_agg(group_teams.team_id ORDER BY group_teams.position) FROM championship_bracket_preview_private.group_teams group_teams WHERE group_teams.group_id = groups.id)) ORDER BY competitions.position, groups.group_number) FROM championship_bracket_preview_private.groups groups JOIN championship_bracket_preview_private.competitions competitions ON competitions.id = groups.competition_id WHERE groups.job_id = _job_id), '[]'::jsonb),
    'group_matches', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', matches.logical_key, 'slot', assignments.slot_id) ORDER BY matches.logical_key) FROM championship_bracket_preview_private.assignments assignments JOIN championship_bracket_preview_private.matches matches ON matches.id = assignments.match_id WHERE assignments.job_id = _job_id), '[]'::jsonb),
    'knockout_matches', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', knockout_matches.logical_key, 'phase', knockout_matches.phase, 'home', knockout_matches.home_source_reference, 'away', knockout_matches.away_source_reference, 'date', knockout_matches.scheduled_date, 'court', knockout_matches.court_name, 'start', knockout_matches.start_at, 'end', knockout_matches.end_at, 'manual_final', knockout_matches.manual_final) ORDER BY knockout_matches.scheduled_date, knockout_matches.start_at, knockout_matches.logical_key) FROM championship_bracket_preview_private.knockout_matches knockout_matches WHERE knockout_matches.job_id = _job_id), '[]'::jsonb)
  ) INTO manifest;
  UPDATE championship_bracket_preview_private.jobs
  SET summary = summary || jsonb_build_object(
        'scheduled_matches', (SELECT count(*) FROM championship_bracket_preview_private.assignments WHERE job_id = _job_id) + (SELECT count(*) FROM championship_bracket_preview_private.knockout_matches WHERE job_id = _job_id),
        'knockout_matches', (SELECT count(*) FROM championship_bracket_preview_private.knockout_matches WHERE job_id = _job_id),
        'total_matches', (SELECT count(*) FROM championship_bracket_preview_private.assignments WHERE job_id = _job_id) + (SELECT count(*) FROM championship_bracket_preview_private.knockout_matches WHERE job_id = _job_id),
        'games_by_day', COALESCE((SELECT jsonb_agg(jsonb_build_object('date', event_date, 'matches', matches) ORDER BY event_date) FROM (SELECT event_date, count(*)::integer matches FROM (SELECT slots.event_date FROM championship_bracket_preview_private.assignments assignments JOIN championship_bracket_preview_private.slots slots ON slots.id = assignments.slot_id WHERE assignments.job_id = _job_id UNION ALL SELECT scheduled_date FROM championship_bracket_preview_private.knockout_matches WHERE job_id = _job_id) all_matches GROUP BY event_date) day_counts), '[]'::jsonb)
      ),
      generation_signature = encode(extensions.digest(convert_to(manifest::text, 'UTF8'), 'sha256'), 'hex'), updated_at = now()
  WHERE id = _job_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_championship_bracket_preview_job(_championship_id UUID, _payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE response JSONB; job_id UUID;
BEGIN
  response := public.start_championship_bracket_preview_job_v7(_championship_id, _payload);
  job_id := (response ->> 'job_id')::uuid;
  UPDATE championship_bracket_preview_private.jobs
  SET algorithm_version = 'async-exact-v8', updated_at = now()
  WHERE id = job_id AND algorithm_version = 'async-exact-v7' AND status IN ('QUEUED', 'INITIALIZING');
  RETURN public.get_championship_bracket_preview_job_status(job_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_championship_bracket_preview_job_status(_job_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE response JSONB;
BEGIN
  response := public.get_championship_bracket_preview_job_status_v7(_job_id);
  RETURN jsonb_set(response, '{is_valid_for_creation}', to_jsonb(
    COALESCE((response ->> 'status') = 'COMPLETED' AND (response ->> 'algorithm_version') = 'async-exact-v8' AND (response ->> 'generation_signature') IS NOT NULL AND (response ->> 'diagnostics') = '[]', false)
  ));
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_championship_bracket_preview_job_day(_job_id UUID, _date DATE)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE result JSONB; knockout_record RECORD; location_index INTEGER; court_index INTEGER; sorted_entries JSONB;
BEGIN
  result := public.get_championship_bracket_preview_job_day_v7(_job_id, _date);
  FOR knockout_record IN
    SELECT knockout_matches.*, competitions.sport_id, competitions.sport_name, competitions.naipe, competitions.division
    FROM championship_bracket_preview_private.knockout_matches knockout_matches
    JOIN championship_bracket_preview_private.competitions competitions ON competitions.id = knockout_matches.competition_id
    WHERE knockout_matches.job_id = _job_id AND knockout_matches.scheduled_date = _date
    ORDER BY knockout_matches.start_at, knockout_matches.logical_key
  LOOP
    SELECT location_item.ordinality::integer - 1, court_item.ordinality::integer - 1
    INTO location_index, court_index
    FROM jsonb_array_elements(COALESCE(result -> 'locations', '[]'::jsonb)) WITH ORDINALITY location_item(value, ordinality)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(location_item.value -> 'courts', '[]'::jsonb)) WITH ORDINALITY court_item(value, ordinality)
    WHERE location_item.value ->> 'location_key' = knockout_record.location_key::text
      AND court_item.value ->> 'court_key' = knockout_record.court_key::text LIMIT 1;
    IF location_index IS NULL THEN CONTINUE; END IF;
    SELECT COALESCE(jsonb_agg(entry_item.value ORDER BY entry_item.value ->> 'start_time', entry_item.value ->> 'end_time'), '[]'::jsonb)
    INTO sorted_entries
    FROM jsonb_array_elements(COALESCE(result #> ARRAY['locations', location_index::text, 'courts', court_index::text, 'entries'], '[]'::jsonb)) entry_item(value)
    WHERE COALESCE(entry_item.value ->> 'reason_code', '') <> 'MANUAL_FINAL_BLOCK';
    sorted_entries := sorted_entries || jsonb_build_array(jsonb_build_object(
      'type', 'MATCH', 'start_time', to_char(knockout_record.start_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'), 'end_time', to_char(knockout_record.end_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'), 'duration_minutes', knockout_record.duration_minutes,
      'match_kind', 'KNOCKOUT', 'match_number', NULL, 'sport_id', knockout_record.sport_id, 'sport_name', knockout_record.sport_name, 'naipe', knockout_record.naipe, 'division', knockout_record.division,
      'phase', knockout_record.phase, 'phase_label', knockout_record.phase, 'group_number', NULL, 'round_number', knockout_record.round_number, 'reason_code', NULL, 'reason', format('%s × %s', knockout_record.home_source_reference, knockout_record.away_source_reference), 'projected', true, 'manual_final', knockout_record.manual_final
    ));
    SELECT jsonb_agg(entry_item.value ORDER BY entry_item.value ->> 'start_time', entry_item.value ->> 'end_time') INTO sorted_entries FROM jsonb_array_elements(sorted_entries) entry_item(value);
    result := jsonb_set(result, ARRAY['locations', location_index::text, 'courts', court_index::text, 'entries'], sorted_entries);
  END LOOP;
  RETURN result;
END;
$function$;

ALTER FUNCTION public.create_championship_bracket_from_preview_job(UUID, UUID, JSONB) RENAME TO create_championship_bracket_from_preview_job_v7;

DO $allow_v8_creation$
DECLARE function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef('public.create_championship_bracket_from_preview_job_v7(uuid,uuid,jsonb)'::regprocedure)
  INTO function_definition;
  EXECUTE replace(function_definition, '''async-exact-v7''', '''async-exact-v7'', ''async-exact-v8''');
END;
$allow_v8_creation$;

CREATE OR REPLACE FUNCTION public.create_championship_bracket_from_preview_job(
  _job_id UUID,
  _championship_id UUID,
  _payload JSONB
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  v8_signature TEXT;
  legacy_manifest JSONB;
  legacy_signature TEXT;
  edition_id UUID;
BEGIN
  SELECT generation_signature INTO v8_signature
  FROM championship_bracket_preview_private.jobs
  WHERE id = _job_id FOR UPDATE;

  IF v8_signature IS NULL THEN
    RAISE EXCEPTION 'A prévia exata não possui assinatura estrutural.';
  END IF;

  -- A função histórica valida somente a agenda de grupos. Mantemos essa
  -- checagem transacional e restauramos a assinatura integral imediatamente
  -- após sua materialização.
  SELECT jsonb_build_object(
    'algorithm_version', jobs_table.algorithm_version,
    'payload_signature', jobs_table.payload_signature,
    'dependency_signature', jobs_table.dependency_signature,
    'groups', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'competition', competitions.competition_key, 'group', groups.group_number,
        'teams', (SELECT jsonb_agg(group_teams.team_id ORDER BY group_teams.position) FROM championship_bracket_preview_private.group_teams group_teams WHERE group_teams.group_id = groups.id)
      ) ORDER BY competitions.position, groups.group_number)
      FROM championship_bracket_preview_private.groups groups
      JOIN championship_bracket_preview_private.competitions competitions ON competitions.id = groups.competition_id
      WHERE groups.job_id = _job_id
    ), '[]'::jsonb),
    'matches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'key', matches.logical_key, 'competition', competitions.competition_key,
        'round', matches.round_number, 'slot', matches.slot_number,
        'home', matches.home_team_id, 'away', matches.away_team_id,
        'date', slots.event_date, 'location', slots.location_name, 'court', slots.court_name,
        'start', slots.start_at, 'end', slots.end_at
      ) ORDER BY slots.event_date, slots.start_at, slots.location_position, slots.court_position, matches.logical_key)
      FROM championship_bracket_preview_private.assignments assignments
      JOIN championship_bracket_preview_private.matches matches ON matches.id = assignments.match_id
      JOIN championship_bracket_preview_private.competitions competitions ON competitions.id = matches.competition_id
      JOIN championship_bracket_preview_private.slots slots ON slots.id = assignments.slot_id
      WHERE assignments.job_id = _job_id
    ), '[]'::jsonb)
  ) INTO legacy_manifest
  FROM championship_bracket_preview_private.jobs jobs_table WHERE jobs_table.id = _job_id;
  legacy_signature := encode(extensions.digest(convert_to(legacy_manifest::text, 'UTF8'), 'sha256'), 'hex');
  UPDATE championship_bracket_preview_private.jobs SET generation_signature = legacy_signature WHERE id = _job_id;

  edition_id := public.create_championship_bracket_from_preview_job_v7(_job_id, _championship_id, _payload);

  DELETE FROM public.championship_bracket_knockout_schedule_reservations
  WHERE bracket_edition_id = edition_id;

  INSERT INTO public.championship_bracket_knockout_schedule_reservations (
    id, bracket_edition_id, competition_id, round_number, slot_number, is_third_place,
    scheduled_date, schedule_period, location_name, court_name,
    location_group_id, court_group_id, bracket_day_id, bracket_court_id,
    scheduled_slot, queue_position, start_at, end_at, duration_minutes, is_manual_final
  )
  SELECT
    gen_random_uuid(), edition_id, knockout_matches.competition_id, knockout_matches.round_number, knockout_matches.slot_number,
    knockout_matches.phase = 'THIRD_PLACE', knockout_matches.scheduled_date,
    CASE WHEN (knockout_matches.start_at AT TIME ZONE 'America/Sao_Paulo')::time < time '12:00' THEN 'MATUTINO'::public.championship_schedule_period ELSE 'VESPERTINO'::public.championship_schedule_period END,
    knockout_matches.location_name, knockout_matches.court_name,
    locations.location_group_id, courts.court_group_id, days.id, courts.id,
    row_number() OVER (PARTITION BY knockout_matches.scheduled_date, knockout_matches.court_key ORDER BY knockout_matches.start_at),
    row_number() OVER (PARTITION BY knockout_matches.scheduled_date, knockout_matches.court_key ORDER BY knockout_matches.start_at),
    knockout_matches.start_at, knockout_matches.end_at, knockout_matches.duration_minutes, knockout_matches.manual_final
  FROM championship_bracket_preview_private.knockout_matches knockout_matches
  JOIN public.championship_bracket_days days ON days.bracket_edition_id = edition_id AND days.event_date = knockout_matches.scheduled_date
  JOIN public.championship_bracket_locations locations ON locations.bracket_day_id = days.id AND locations.name = knockout_matches.location_name
  JOIN public.championship_bracket_courts courts ON courts.bracket_location_id = locations.id AND courts.name = knockout_matches.court_name
  WHERE knockout_matches.job_id = _job_id;

  IF (SELECT count(*) FROM championship_bracket_preview_private.knockout_matches WHERE job_id = _job_id)
     <> (SELECT count(*) FROM public.championship_bracket_knockout_schedule_reservations WHERE bracket_edition_id = edition_id) THEN
    RAISE EXCEPTION 'A materialização das reservas eliminatórias divergiu da prévia; nenhuma alteração foi confirmada.';
  END IF;

  UPDATE championship_bracket_preview_private.jobs
  SET generation_signature = v8_signature, updated_at = now()
  WHERE id = _job_id;
  RETURN edition_id;
END;
$function$;

REVOKE ALL ON championship_bracket_preview_private.knockout_matches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON championship_bracket_preview_private.relocation_attempt_metrics FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION championship_bracket_preview_private.process_batch(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION championship_bracket_preview_private.finalize_job(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_championship_bracket_preview_job(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_championship_bracket_preview_job_status(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_championship_bracket_preview_job_day(UUID, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_championship_bracket_from_preview_job(UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_championship_bracket_preview_job(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_championship_bracket_preview_job_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_championship_bracket_preview_job_day(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_championship_bracket_from_preview_job(UUID, UUID, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
