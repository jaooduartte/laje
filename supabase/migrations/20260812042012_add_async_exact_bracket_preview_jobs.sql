-- LAJE-81: substitui a prévia exata síncrona por um job durável e retomável.
-- Todo o estado intermediário permanece fora dos schemas expostos pela Data API.

CREATE EXTENSION IF NOT EXISTS pgmq;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE SCHEMA IF NOT EXISTS championship_bracket_preview_private;
REVOKE ALL ON SCHEMA championship_bracket_preview_private FROM PUBLIC, anon, authenticated;

DO $queue$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pgmq.meta WHERE queue_name = 'championship_bracket_preview') THEN
    PERFORM pgmq.create('championship_bracket_preview');
  END IF;
END;
$queue$;

CREATE TABLE championship_bracket_preview_private.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  season_year INTEGER NOT NULL,
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  payload_signature TEXT NOT NULL,
  dependency_signature TEXT NOT NULL,
  algorithm_version TEXT NOT NULL DEFAULT 'async-exact-v1',
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN (
    'QUEUED', 'INITIALIZING', 'SCHEDULING', 'FINALIZING',
    'COMPLETED', 'FAILED', 'CANCELLED', 'CONSUMED'
  )),
  stage TEXT NOT NULL DEFAULT 'QUEUED',
  current_processing_date DATE,
  progress_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  processed_slots INTEGER NOT NULL DEFAULT 0,
  total_slots INTEGER NOT NULL DEFAULT 0,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  heartbeat_at TIMESTAMPTZ,
  error_message TEXT,
  summary JSONB,
  diagnostics JSONB NOT NULL DEFAULT '[]'::jsonb,
  generation_signature TEXT,
  result_edition_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX championship_bracket_preview_one_active_job_idx
  ON championship_bracket_preview_private.jobs (championship_id, season_year)
  WHERE status IN ('QUEUED', 'INITIALIZING', 'SCHEDULING', 'FINALIZING');
CREATE INDEX championship_bracket_preview_jobs_expiration_idx
  ON championship_bracket_preview_private.jobs (expires_at);

CREATE TABLE championship_bracket_preview_private.competitions (
  id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES championship_bracket_preview_private.jobs(id) ON DELETE CASCADE,
  sport_id UUID NOT NULL REFERENCES public.sports(id),
  sport_name TEXT NOT NULL,
  naipe public.match_naipe NOT NULL,
  division public.team_division,
  groups_count INTEGER NOT NULL,
  qualifiers_per_group INTEGER NOT NULL,
  third_place_mode public.bracket_third_place_mode NOT NULL,
  best_second BOOLEAN NOT NULL,
  pairing_mode TEXT NOT NULL,
  competition_key TEXT NOT NULL,
  position INTEGER NOT NULL,
  UNIQUE (job_id, competition_key)
);

CREATE TABLE championship_bracket_preview_private.groups (
  id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES championship_bracket_preview_private.jobs(id) ON DELETE CASCADE,
  competition_id UUID NOT NULL REFERENCES championship_bracket_preview_private.competitions(id) ON DELETE CASCADE,
  group_number INTEGER NOT NULL,
  UNIQUE (job_id, competition_id, group_number)
);

CREATE TABLE championship_bracket_preview_private.group_teams (
  job_id UUID NOT NULL REFERENCES championship_bracket_preview_private.jobs(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES championship_bracket_preview_private.groups(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (job_id, group_id, team_id),
  UNIQUE (job_id, group_id, position)
);

CREATE TABLE championship_bracket_preview_private.matches (
  id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES championship_bracket_preview_private.jobs(id) ON DELETE CASCADE,
  competition_id UUID NOT NULL REFERENCES championship_bracket_preview_private.competitions(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES championship_bracket_preview_private.groups(id) ON DELETE CASCADE,
  logical_key TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  slot_number INTEGER NOT NULL,
  home_team_id UUID NOT NULL REFERENCES public.teams(id),
  away_team_id UUID NOT NULL REFERENCES public.teams(id),
  priority_weight INTEGER NOT NULL DEFAULT 0,
  assigned BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (job_id, logical_key)
);
CREATE INDEX championship_bracket_preview_pending_match_idx
  ON championship_bracket_preview_private.matches (job_id, assigned, competition_id, priority_weight DESC, slot_number);
CREATE INDEX championship_bracket_preview_match_team_idx
  ON championship_bracket_preview_private.matches (job_id, home_team_id, away_team_id);

CREATE TABLE championship_bracket_preview_private.slots (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES championship_bracket_preview_private.jobs(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  location_key UUID NOT NULL,
  location_name TEXT NOT NULL,
  location_position INTEGER NOT NULL,
  court_key UUID NOT NULL,
  court_name TEXT NOT NULL,
  court_position INTEGER NOT NULL,
  sport_id UUID NOT NULL REFERENCES public.sports(id),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  sequence_index INTEGER NOT NULL,
  preferred_sport BOOLEAN NOT NULL DEFAULT false,
  preferred_naipe public.match_naipe,
  preferred_division public.team_division,
  sequence_mode TEXT NOT NULL DEFAULT 'FLEXIBLE',
  cursor_position BIGINT NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (job_id, event_date, court_key, sport_id, start_at)
);
CREATE INDEX championship_bracket_preview_slot_cursor_idx
  ON championship_bracket_preview_private.slots (job_id, processed, cursor_position);

CREATE TABLE championship_bracket_preview_private.assignments (
  job_id UUID NOT NULL REFERENCES championship_bracket_preview_private.jobs(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES championship_bracket_preview_private.matches(id) ON DELETE CASCADE,
  slot_id BIGINT NOT NULL REFERENCES championship_bracket_preview_private.slots(id) ON DELETE CASCADE,
  match_number INTEGER,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, match_id),
  UNIQUE (job_id, slot_id)
);
CREATE INDEX championship_bracket_preview_assignment_team_time_idx
  ON championship_bracket_preview_private.assignments (job_id, slot_id, match_id);

CREATE TABLE championship_bracket_preview_private.stage_metrics (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES championship_bracket_preview_private.jobs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  batch_number INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  processed_slots INTEGER NOT NULL,
  candidates_examined INTEGER NOT NULL,
  produced_rows INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE championship_bracket_preview_private.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE championship_bracket_preview_private.competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE championship_bracket_preview_private.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE championship_bracket_preview_private.group_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE championship_bracket_preview_private.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE championship_bracket_preview_private.slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE championship_bracket_preview_private.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE championship_bracket_preview_private.stage_metrics ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_dependency_signature(
  _championship_id UUID,
  _payload JSONB
) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  SELECT encode(extensions.digest(convert_to(jsonb_build_object(
    'championship', (SELECT to_jsonb(c.*) - 'created_at' - 'updated_at' FROM public.championships c WHERE c.id = _championship_id),
    'sports', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'sport_id', cs.sport_id, 'duration', cs.default_match_duration_minutes,
      'result_rule', cs.result_rule, 'points_win', cs.points_win,
      'points_draw', cs.points_draw, 'points_loss', cs.points_loss,
      'tie_break', cs.tie_breaker_rule
    ) ORDER BY cs.sport_id) FROM public.championship_sports cs WHERE cs.championship_id = _championship_id), '[]'::jsonb),
    'teams', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'active', t.is_active) ORDER BY t.id)
      FROM public.teams t WHERE t.id IN (
        SELECT NULLIF(participant.value ->> 'team_id', '')::uuid
        FROM jsonb_array_elements(COALESCE(_payload -> 'participants', '[]'::jsonb)) participant(value)
      )), '[]'::jsonb)
  )::text, 'UTF8'), 'sha256'), 'hex');
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.enqueue(_job_id UUID, _delay INTEGER DEFAULT 0)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pgmq, championship_bracket_preview_private
AS $function$
BEGIN
  PERFORM pgmq.send('championship_bracket_preview', jsonb_build_object('job_id', _job_id), GREATEST(_delay, 0));
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.initialize_job(_job_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
SET statement_timeout = '15s'
AS $function$
DECLARE
  job_record RECORD;
BEGIN
  SELECT * INTO job_record FROM championship_bracket_preview_private.jobs WHERE id = _job_id FOR UPDATE;
  IF job_record.status NOT IN ('QUEUED', 'INITIALIZING') THEN RETURN; END IF;

  UPDATE championship_bracket_preview_private.jobs SET
    status = 'INITIALIZING', stage = 'Normalizando configuração', started_at = COALESCE(started_at, now()),
    heartbeat_at = now(), updated_at = now()
  WHERE id = _job_id;

  INSERT INTO championship_bracket_preview_private.competitions (
    id, job_id, sport_id, sport_name, naipe, division, groups_count,
    qualifiers_per_group, third_place_mode, best_second, pairing_mode,
    competition_key, position
  )
  SELECT gen_random_uuid(), _job_id, (competition.value ->> 'sport_id')::uuid,
    COALESCE(s.name, competition.value ->> 'sport_id'),
    (competition.value ->> 'naipe')::public.match_naipe,
    NULLIF(competition.value ->> 'division', '')::public.team_division,
    GREATEST((competition.value ->> 'groups_count')::integer, 1),
    GREATEST((competition.value ->> 'qualifiers_per_group')::integer, 1),
    COALESCE(NULLIF(competition.value ->> 'third_place_mode', '')::public.bracket_third_place_mode, 'NONE'),
    COALESCE((competition.value ->> 'should_complete_knockout_with_best_second_placed_teams')::boolean, false),
    COALESCE(NULLIF(competition.value ->> 'knockout_pairing_mode', ''), 'LINEAR'),
    (competition.value ->> 'sport_id') || '::' || (competition.value ->> 'naipe') || '::' || COALESCE(NULLIF(competition.value ->> 'division', ''), 'WITHOUT_DIVISION'),
    competition.ordinality::integer
  FROM jsonb_array_elements(COALESCE(job_record.payload -> 'competitions', '[]'::jsonb)) WITH ORDINALITY competition(value, ordinality)
  LEFT JOIN public.sports s ON s.id = (competition.value ->> 'sport_id')::uuid
  ON CONFLICT (job_id, competition_key) DO NOTHING;

  INSERT INTO championship_bracket_preview_private.groups (id, job_id, competition_id, group_number)
  SELECT gen_random_uuid(), _job_id, c.id, (group_item.value ->> 'group_number')::integer
  FROM jsonb_array_elements(COALESCE(job_record.payload -> 'competitions', '[]'::jsonb)) competition(value)
  JOIN championship_bracket_preview_private.competitions c ON c.job_id = _job_id
    AND c.competition_key = (competition.value ->> 'sport_id') || '::' || (competition.value ->> 'naipe') || '::' || COALESCE(NULLIF(competition.value ->> 'division', ''), 'WITHOUT_DIVISION')
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(competition.value -> 'groups', '[]'::jsonb)) group_item(value)
  ON CONFLICT (job_id, competition_id, group_number) DO NOTHING;

  INSERT INTO championship_bracket_preview_private.group_teams (job_id, group_id, team_id, position)
  SELECT _job_id, g.id, trim(both '"' from team_item.value::text)::uuid, team_item.ordinality::integer
  FROM jsonb_array_elements(COALESCE(job_record.payload -> 'competitions', '[]'::jsonb)) competition(value)
  JOIN championship_bracket_preview_private.competitions c ON c.job_id = _job_id
    AND c.competition_key = (competition.value ->> 'sport_id') || '::' || (competition.value ->> 'naipe') || '::' || COALESCE(NULLIF(competition.value ->> 'division', ''), 'WITHOUT_DIVISION')
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(competition.value -> 'groups', '[]'::jsonb)) group_item(value)
  JOIN championship_bracket_preview_private.groups g ON g.job_id = _job_id AND g.competition_id = c.id
    AND g.group_number = (group_item.value ->> 'group_number')::integer
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(group_item.value -> 'team_ids', '[]'::jsonb)) WITH ORDINALITY team_item(value, ordinality)
  ON CONFLICT DO NOTHING;

  INSERT INTO championship_bracket_preview_private.matches (
    id, job_id, competition_id, group_id, logical_key, round_number, slot_number,
    home_team_id, away_team_id, priority_weight
  )
  SELECT gen_random_uuid(), _job_id, g.competition_id, g.id,
    format('%s:%s:%s', g.id, home.position, away.position),
    ((row_number() OVER (PARTITION BY g.id ORDER BY home.position, away.position) - 1)
      / GREATEST((team_count.count_value / 2), 1) + 1)::integer,
    row_number() OVER (PARTITION BY g.competition_id ORDER BY g.group_number, home.position, away.position)::integer,
    home.team_id, away.team_id,
    (team_count.count_value * 100) - home.position - away.position
  FROM championship_bracket_preview_private.groups g
  JOIN championship_bracket_preview_private.group_teams home ON home.job_id = _job_id AND home.group_id = g.id
  JOIN championship_bracket_preview_private.group_teams away ON away.job_id = _job_id AND away.group_id = g.id AND away.position > home.position
  JOIN LATERAL (SELECT count(*)::integer count_value FROM championship_bracket_preview_private.group_teams gt WHERE gt.job_id = _job_id AND gt.group_id = g.id) team_count ON true
  WHERE g.job_id = _job_id
  ON CONFLICT (job_id, logical_key) DO NOTHING;

  INSERT INTO championship_bracket_preview_private.slots (
    job_id, event_date, location_key, location_name, location_position,
    court_key, court_name, court_position, sport_id, start_at, end_at,
    sequence_index, preferred_sport, preferred_naipe, preferred_division,
    sequence_mode, cursor_position
  )
  SELECT _job_id, (day_item.value ->> 'date')::date,
    (location_item.value ->> 'location_key')::uuid, location_item.value ->> 'name',
    COALESCE((location_item.value ->> 'position')::integer, location_item.ordinality::integer),
    (court_item.value ->> 'court_key')::uuid, court_item.value ->> 'name',
    COALESCE((court_item.value ->> 'position')::integer, court_item.ordinality::integer),
    trim(both '"' from sport_item.value::text)::uuid,
    slot_start, slot_start + make_interval(mins => duration.duration_minutes),
    row_number() OVER (PARTITION BY day_item.value ->> 'date', court_item.value ->> 'court_key', sport_item.value::text ORDER BY slot_start)::integer,
    COALESCE(court_item.value -> 'sport_preference' ->> 'preferred_sport_id', '') = trim(both '"' from sport_item.value::text),
    NULLIF(court_item.value -> 'sport_preference' ->> 'preferred_naipe', '')::public.match_naipe,
    NULLIF(court_item.value -> 'sport_preference' ->> 'preferred_division', '')::public.team_division,
    COALESCE(court_item.value -> 'sport_preference' ->> 'sequence_mode', 'FLEXIBLE'),
    row_number() OVER (ORDER BY (day_item.value ->> 'date')::date, slot_start,
      COALESCE((location_item.value ->> 'position')::integer, location_item.ordinality::integer),
      COALESCE((court_item.value ->> 'position')::integer, court_item.ordinality::integer), sport_item.value::text)
  FROM jsonb_array_elements(COALESCE(job_record.payload -> 'schedule_days', '[]'::jsonb)) WITH ORDINALITY day_item(value, ordinality)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(day_item.value -> 'locations', '[]'::jsonb)) WITH ORDINALITY location_item(value, ordinality)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(location_item.value -> 'courts', '[]'::jsonb)) WITH ORDINALITY court_item(value, ordinality)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(court_item.value -> 'sport_ids', '[]'::jsonb)) sport_item(value)
  JOIN LATERAL (SELECT GREATEST(COALESCE(cs.default_match_duration_minutes, 35), 1)::integer duration_minutes
    FROM public.championship_sports cs WHERE cs.championship_id = job_record.championship_id
      AND cs.sport_id = trim(both '"' from sport_item.value::text)::uuid LIMIT 1) duration ON true
  CROSS JOIN LATERAL generate_series(
    public.combine_bracket_schedule_timestamp((day_item.value ->> 'date')::date, (day_item.value ->> 'start_time')::time),
    public.combine_bracket_schedule_timestamp((day_item.value ->> 'date')::date, (day_item.value ->> 'end_time')::time) - make_interval(mins => duration.duration_minutes),
    make_interval(mins => duration.duration_minutes)
  ) slot_start
  WHERE NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(job_record.payload -> 'resource_locks', '[]'::jsonb)) lock_item(value)
    WHERE lock_item.value ->> 'lock_mode' = 'HARD'
      AND lock_item.value ->> 'date' = day_item.value ->> 'date'
      AND lock_item.value ->> 'court_key' = court_item.value ->> 'court_key'
      AND slot_start < public.combine_bracket_schedule_timestamp((day_item.value ->> 'date')::date, (lock_item.value ->> 'end_time')::time)
      AND slot_start + make_interval(mins => duration.duration_minutes) > public.combine_bracket_schedule_timestamp((day_item.value ->> 'date')::date, (lock_item.value ->> 'start_time')::time)
  )
  AND NOT (
    NULLIF(day_item.value ->> 'break_start_time', '') IS NOT NULL
    AND NULLIF(day_item.value ->> 'break_end_time', '') IS NOT NULL
    AND slot_start < public.combine_bracket_schedule_timestamp(
      (day_item.value ->> 'date')::date,
      (day_item.value ->> 'break_end_time')::time
    )
    AND slot_start + make_interval(mins => duration.duration_minutes) >
      public.combine_bracket_schedule_timestamp(
        (day_item.value ->> 'date')::date,
        (day_item.value ->> 'break_start_time')::time
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(job_record.payload -> 'knockout_program_blocks', '[]'::jsonb)) block_item(value)
    WHERE block_item.value ->> 'date' = day_item.value ->> 'date'
      AND block_item.value ->> 'court_key' = court_item.value ->> 'court_key'
      AND slot_start < public.combine_bracket_schedule_timestamp(
        (day_item.value ->> 'date')::date,
        (block_item.value ->> 'end_time')::time
      )
      AND slot_start + make_interval(mins => duration.duration_minutes) >
        public.combine_bracket_schedule_timestamp(
          (day_item.value ->> 'date')::date,
          (block_item.value ->> 'start_time')::time
        )
  )
  ON CONFLICT DO NOTHING;

  UPDATE championship_bracket_preview_private.jobs SET
    status = 'SCHEDULING', stage = 'Distribuindo jogos por dia',
    total_slots = (SELECT count(*) FROM championship_bracket_preview_private.slots WHERE job_id = _job_id),
    progress_percentage = 5, heartbeat_at = now(), updated_at = now()
  WHERE id = _job_id;
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.process_batch(_job_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
SET statement_timeout = '15s'
AS $function$
DECLARE
  started_clock TIMESTAMPTZ := clock_timestamp();
  job_record RECORD; slot_record RECORD; candidate RECORD;
  batch_slots INTEGER := 0; candidates INTEGER := 0; slot_candidates INTEGER := 0; produced INTEGER := 0;
  pending_count INTEGER; processed_count INTEGER;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('championship-bracket-preview-global', 0)) THEN
    RETURN jsonb_build_object('continue', true, 'delay', 2);
  END IF;
  SELECT * INTO job_record FROM championship_bracket_preview_private.jobs WHERE id = _job_id FOR UPDATE;
  IF job_record.status IN ('COMPLETED', 'FAILED', 'CANCELLED', 'CONSUMED') THEN
    RETURN jsonb_build_object('continue', false);
  END IF;
  IF job_record.status IN ('QUEUED', 'INITIALIZING') THEN
    PERFORM championship_bracket_preview_private.initialize_job(_job_id);
    SELECT * INTO job_record FROM championship_bracket_preview_private.jobs WHERE id = _job_id;
  END IF;

  FOR slot_record IN
    SELECT * FROM championship_bracket_preview_private.slots
    WHERE job_id = _job_id AND processed = false
      AND event_date = (
        SELECT min(next_slot.event_date)
        FROM championship_bracket_preview_private.slots next_slot
        WHERE next_slot.job_id = _job_id AND next_slot.processed = false
      )
    ORDER BY cursor_position LIMIT 20 FOR UPDATE SKIP LOCKED
  LOOP
    EXIT WHEN clock_timestamp() - started_clock >= interval '5 seconds';
    batch_slots := batch_slots + 1;
    SELECT count(*) INTO slot_candidates FROM championship_bracket_preview_private.matches m
      JOIN championship_bracket_preview_private.competitions c ON c.id = m.competition_id
      WHERE m.job_id = _job_id AND m.assigned = false AND c.sport_id = slot_record.sport_id;
    candidates := candidates + slot_candidates;

    SELECT m.*, c.naipe, c.division, c.competition_key
    INTO candidate
    FROM championship_bracket_preview_private.matches m
    JOIN championship_bracket_preview_private.competitions c ON c.id = m.competition_id
    WHERE m.job_id = _job_id AND m.assigned = false AND c.sport_id = slot_record.sport_id
      AND public.is_championship_bracket_competition_slot_playable(job_record.payload, c.competition_key, slot_record.event_date, slot_record.start_at, slot_record.end_at)
      AND public.is_championship_bracket_team_slot_playable(job_record.payload, m.home_team_id, c.competition_key, slot_record.event_date, slot_record.start_at, slot_record.end_at)
      AND public.is_championship_bracket_team_slot_playable(job_record.payload, m.away_team_id, c.competition_key, slot_record.event_date, slot_record.start_at, slot_record.end_at)
      AND NOT EXISTS (
        SELECT 1
        FROM championship_bracket_preview_private.assignments occupied_assignment
        JOIN championship_bracket_preview_private.slots occupied_slot
          ON occupied_slot.id = occupied_assignment.slot_id
        WHERE occupied_assignment.job_id = _job_id
          AND occupied_slot.court_key = slot_record.court_key
          AND occupied_slot.start_at < slot_record.end_at
          AND occupied_slot.end_at > slot_record.start_at
      )
      AND NOT EXISTS (
        SELECT 1 FROM championship_bracket_preview_private.assignments a
        JOIN championship_bracket_preview_private.matches previous_match ON previous_match.id = a.match_id
        JOIN championship_bracket_preview_private.slots previous_slot ON previous_slot.id = a.slot_id
        WHERE a.job_id = _job_id AND previous_slot.event_date = slot_record.event_date
          AND (previous_match.home_team_id IN (m.home_team_id, m.away_team_id) OR previous_match.away_team_id IN (m.home_team_id, m.away_team_id))
          AND (
            previous_slot.start_at = slot_record.start_at
            OR (previous_slot.court_key = slot_record.court_key AND c.naipe = (SELECT pc.naipe FROM championship_bracket_preview_private.competitions pc WHERE pc.id = previous_match.competition_id)
              AND ABS(EXTRACT(EPOCH FROM (previous_slot.start_at - slot_record.start_at))/60) < EXTRACT(EPOCH FROM (slot_record.end_at-slot_record.start_at))/60 * 4)
            OR (previous_slot.court_key <> slot_record.court_key
              AND ABS(EXTRACT(EPOCH FROM (previous_slot.start_at - slot_record.start_at))/60) < EXTRACT(EPOCH FROM (slot_record.end_at-slot_record.start_at))/60 * 2)
          )
      )
    ORDER BY
      CASE WHEN slot_record.preferred_naipe IS NOT NULL AND c.naipe IS DISTINCT FROM slot_record.preferred_naipe THEN 1 ELSE 0 END,
      CASE WHEN slot_record.preferred_division IS NOT NULL AND c.division IS DISTINCT FROM slot_record.preferred_division THEN 1 ELSE 0 END,
      m.priority_weight DESC, m.round_number, m.slot_number, m.id
    LIMIT 1;

    IF candidate.id IS NOT NULL THEN
      INSERT INTO championship_bracket_preview_private.assignments (job_id, match_id, slot_id)
      VALUES (_job_id, candidate.id, slot_record.id) ON CONFLICT DO NOTHING;
      UPDATE championship_bracket_preview_private.matches SET assigned = true WHERE id = candidate.id;
      produced := produced + 1;
    END IF;
    UPDATE championship_bracket_preview_private.slots SET processed = true WHERE id = slot_record.id;
  END LOOP;

  SELECT count(*) INTO pending_count FROM championship_bracket_preview_private.matches WHERE job_id = _job_id AND assigned = false;
  SELECT count(*) INTO processed_count FROM championship_bracket_preview_private.slots WHERE job_id = _job_id AND processed;
  UPDATE championship_bracket_preview_private.jobs SET
    processed_slots = processed_count,
    current_processing_date = (SELECT max(event_date) FROM championship_bracket_preview_private.slots WHERE job_id = _job_id AND processed),
    progress_percentage = LEAST(90, 5 + (85 * processed_count::numeric / GREATEST(total_slots, 1))),
    heartbeat_at = now(), updated_at = now()
  WHERE id = _job_id;

  INSERT INTO championship_bracket_preview_private.stage_metrics
    (job_id, stage, batch_number, duration_ms, processed_slots, candidates_examined, produced_rows)
  VALUES (_job_id, 'SCHEDULING', job_record.attempt_count + 1,
    (EXTRACT(EPOCH FROM (clock_timestamp() - started_clock))*1000)::integer,
    batch_slots, candidates, produced);

  IF pending_count = 0 THEN
    UPDATE championship_bracket_preview_private.jobs SET status = 'FINALIZING', stage = 'Montando manifesto final', updated_at = now() WHERE id = _job_id;
    RETURN jsonb_build_object('continue', true, 'delay', 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM championship_bracket_preview_private.slots WHERE job_id = _job_id AND processed = false) THEN
    UPDATE championship_bracket_preview_private.jobs SET status = 'FAILED', stage = 'Falha',
      error_message = format('Não foi possível encaixar %s jogo(s) na grade configurada.', pending_count),
      diagnostics = jsonb_build_array(jsonb_build_object('code','UNASSIGNED_MATCHES','severity','ERROR','message',format('%s jogo(s) não encontraram horário compatível.',pending_count))),
      expires_at = now() + interval '24 hours', updated_at = now()
    WHERE id = _job_id;
    RETURN jsonb_build_object('continue', false);
  END IF;
  RETURN jsonb_build_object('continue', true, 'delay', 0);
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.finalize_job(_job_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
SET statement_timeout = '15s'
AS $function$
DECLARE
  job_record RECORD; manifest JSONB; total_group INTEGER; knockout_estimate INTEGER;
BEGIN
  SELECT * INTO job_record FROM championship_bracket_preview_private.jobs WHERE id = _job_id FOR UPDATE;
  IF job_record.status <> 'FINALIZING' THEN RETURN; END IF;
  SELECT count(*) INTO total_group FROM championship_bracket_preview_private.matches WHERE job_id = _job_id;
  SELECT COALESCE(sum(GREATEST(c.groups_count * c.qualifiers_per_group - 1, 0)
    + CASE WHEN c.third_place_mode <> 'NONE' THEN 1 ELSE 0 END),0)::integer
  INTO knockout_estimate FROM championship_bracket_preview_private.competitions c WHERE c.job_id = _job_id;

  SELECT jsonb_build_object(
    'algorithm_version', job_record.algorithm_version,
    'payload_signature', job_record.payload_signature,
    'dependency_signature', job_record.dependency_signature,
    'groups', COALESCE((SELECT jsonb_agg(jsonb_build_object('competition', c.competition_key, 'group', g.group_number,
      'teams', (SELECT jsonb_agg(gt.team_id ORDER BY gt.position) FROM championship_bracket_preview_private.group_teams gt WHERE gt.group_id=g.id))
      ORDER BY c.position,g.group_number) FROM championship_bracket_preview_private.groups g JOIN championship_bracket_preview_private.competitions c ON c.id=g.competition_id WHERE g.job_id=_job_id),'[]'::jsonb),
    'matches', COALESCE((SELECT jsonb_agg(jsonb_build_object('key',m.logical_key,'competition',c.competition_key,'round',m.round_number,'slot',m.slot_number,
      'home',m.home_team_id,'away',m.away_team_id,'date',s.event_date,'location',s.location_name,'court',s.court_name,'start',s.start_at,'end',s.end_at)
      ORDER BY s.event_date,s.start_at,s.location_position,s.court_position,m.logical_key)
      FROM championship_bracket_preview_private.assignments a JOIN championship_bracket_preview_private.matches m ON m.id=a.match_id
      JOIN championship_bracket_preview_private.competitions c ON c.id=m.competition_id JOIN championship_bracket_preview_private.slots s ON s.id=a.slot_id
      WHERE a.job_id=_job_id),'[]'::jsonb)
  ) INTO manifest;

  UPDATE championship_bracket_preview_private.jobs SET
    status='COMPLETED', stage='Concluída', progress_percentage=100,
    summary=jsonb_build_object('total_matches',total_group+knockout_estimate,'group_stage_matches',total_group,
      'knockout_matches',knockout_estimate,'scheduled_matches',total_group,'occupied_minutes',
      COALESCE((SELECT sum(EXTRACT(EPOCH FROM (s.end_at-s.start_at))/60)::integer FROM championship_bracket_preview_private.assignments a JOIN championship_bracket_preview_private.slots s ON s.id=a.slot_id WHERE a.job_id=_job_id),0),
      'available_minutes',COALESCE((SELECT sum(EXTRACT(EPOCH FROM (end_at-start_at))/60)::integer FROM championship_bracket_preview_private.slots WHERE job_id=_job_id),0),
      'utilization_percentage',round(100*total_group::numeric/GREATEST((SELECT count(*) FROM championship_bracket_preview_private.slots WHERE job_id=_job_id),1),2),
      'free_windows',(SELECT count(*) FROM championship_bracket_preview_private.slots s WHERE s.job_id=_job_id AND NOT EXISTS(SELECT 1 FROM championship_bracket_preview_private.assignments a WHERE a.slot_id=s.id)),
      'conflict_count',0,'warning_count',0,
      'games_by_day',COALESCE((SELECT jsonb_agg(jsonb_build_object('date',day_count.event_date,'matches',day_count.matches) ORDER BY day_count.event_date)
        FROM (SELECT s.event_date,count(*)::integer matches FROM championship_bracket_preview_private.assignments a JOIN championship_bracket_preview_private.slots s ON s.id=a.slot_id WHERE a.job_id=_job_id GROUP BY s.event_date) day_count),'[]'::jsonb)),
    generation_signature=encode(extensions.digest(convert_to(manifest::text,'UTF8'),'sha256'),'hex'),
    completed_at=now(), expires_at=now()+interval '7 days', heartbeat_at=now(), updated_at=now()
  WHERE id=_job_id;
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.process_job(_job_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
SET statement_timeout = '15s'
AS $function$
DECLARE result JSONB; current_status TEXT;
BEGIN
  SELECT status INTO current_status FROM championship_bracket_preview_private.jobs WHERE id=_job_id;
  IF current_status='FINALIZING' THEN
    PERFORM championship_bracket_preview_private.finalize_job(_job_id);
    RETURN jsonb_build_object('continue',false);
  END IF;
  result := championship_bracket_preview_private.process_batch(_job_id);
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  UPDATE championship_bracket_preview_private.jobs SET attempt_count=attempt_count+1, heartbeat_at=now(), updated_at=now(),
    error_message=SQLERRM, status=CASE WHEN attempt_count+1>=5 THEN 'FAILED' ELSE status END,
    stage=CASE WHEN attempt_count+1>=5 THEN 'Falha após cinco tentativas' ELSE stage END,
    expires_at=CASE WHEN attempt_count+1>=5 THEN now()+interval '24 hours' ELSE expires_at END
  WHERE id=_job_id;
  RETURN jsonb_build_object('continue',(SELECT attempt_count<5 FROM championship_bracket_preview_private.jobs WHERE id=_job_id),
    'delay',LEAST(60,power(2,(SELECT attempt_count FROM championship_bracket_preview_private.jobs WHERE id=_job_id))::integer));
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.consume_queue(_max_batches INTEGER DEFAULT 3)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pgmq, championship_bracket_preview_private
AS $function$
DECLARE message_record RECORD; job_id UUID; result JSONB; iteration INTEGER; processed_count INTEGER:=0;
BEGIN
  FOR iteration IN 1..GREATEST(LEAST(_max_batches,5),1) LOOP
    SELECT * INTO message_record FROM pgmq.read('championship_bracket_preview',30,1) LIMIT 1;
    EXIT WHEN message_record.msg_id IS NULL;
    job_id := NULLIF(message_record.message ->> 'job_id','')::uuid;
    result := championship_bracket_preview_private.process_job(job_id);
    PERFORM pgmq.delete('championship_bracket_preview',message_record.msg_id);
    IF COALESCE((result ->> 'continue')::boolean,false) THEN
      PERFORM championship_bracket_preview_private.enqueue(job_id,COALESCE((result ->> 'delay')::integer,0));
    END IF;
    processed_count := processed_count + 1;
  END LOOP;
  RETURN jsonb_build_object('processed_batches',processed_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_championship_bracket_preview_job(_championship_id UUID,_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
SET statement_timeout='15s'
AS $function$
DECLARE season INTEGER; payload_hash TEXT; dependency_hash TEXT; existing_job RECORD; new_id UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_admin_tab_access('matches'::public.admin_panel_tab,true) THEN RAISE EXCEPTION 'Usuário sem permissão para calcular a programação.'; END IF;
  SELECT current_season_year INTO season FROM public.championships WHERE id=_championship_id AND status='PLANNING';
  IF season IS NULL THEN RAISE EXCEPTION 'Campeonato inválido ou fora do status de configuração.'; END IF;
  payload_hash:=public.resolve_championship_bracket_preview_payload_signature(COALESCE(_payload,'{}'));
  dependency_hash:=championship_bracket_preview_private.resolve_dependency_signature(_championship_id,COALESCE(_payload,'{}'));
  SELECT * INTO existing_job FROM championship_bracket_preview_private.jobs
    WHERE championship_id=_championship_id AND season_year=season AND requested_by=auth.uid()
      AND payload_signature=payload_hash AND dependency_signature=dependency_hash AND expires_at>now()
      AND status IN ('QUEUED','INITIALIZING','SCHEDULING','FINALIZING','COMPLETED')
    ORDER BY created_at DESC LIMIT 1;
  IF existing_job.id IS NOT NULL THEN RETURN public.get_championship_bracket_preview_job_status(existing_job.id); END IF;
  IF EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.jobs
    WHERE championship_id = _championship_id
      AND season_year = season
      AND requested_by <> auth.uid()
      AND status IN ('QUEUED','INITIALIZING','SCHEDULING','FINALIZING')
  ) THEN
    RAISE EXCEPTION 'Já existe uma programação exata em andamento para este campeonato.';
  END IF;
  UPDATE championship_bracket_preview_private.jobs SET status='CANCELLED',stage='Substituída por nova configuração',expires_at=now()+interval '24 hours',updated_at=now()
    WHERE championship_id=_championship_id AND season_year=season AND status IN ('QUEUED','INITIALIZING','SCHEDULING','FINALIZING');
  INSERT INTO championship_bracket_preview_private.jobs(championship_id,season_year,requested_by,payload,payload_signature,dependency_signature)
    VALUES(_championship_id,season,auth.uid(),COALESCE(_payload,'{}'),payload_hash,dependency_hash) RETURNING id INTO new_id;
  PERFORM championship_bracket_preview_private.enqueue(new_id,0);
  RETURN public.get_championship_bracket_preview_job_status(new_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_championship_bracket_preview_job_status(_job_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE j RECORD;
BEGIN
  SELECT * INTO j FROM championship_bracket_preview_private.jobs WHERE id=_job_id;
  IF j.id IS NULL OR (j.requested_by<>auth.uid() AND NOT public.has_admin_tab_access('matches'::public.admin_panel_tab,true)) THEN RAISE EXCEPTION 'Job de prévia não encontrado.'; END IF;
  RETURN jsonb_build_object('job_id',j.id,'championship_id',j.championship_id,'season_year',j.season_year,'status',j.status,'stage',j.stage,
    'current_date',j.current_processing_date,'progress_percentage',j.progress_percentage,'processed_slots',j.processed_slots,'total_slots',j.total_slots,
    'attempt_count',j.attempt_count,'error_message',j.error_message,'summary',j.summary,'diagnostics',j.diagnostics,
    'payload_signature',j.payload_signature,'dependency_signature',j.dependency_signature,'algorithm_version',j.algorithm_version,
    'generation_signature',j.generation_signature,'created_at',j.created_at,'completed_at',j.completed_at,'expires_at',j.expires_at,
    'is_valid_for_creation',(j.status='COMPLETED' AND j.generation_signature IS NOT NULL AND j.expires_at>now() AND jsonb_array_length(j.diagnostics)=0));
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_championship_bracket_preview_job_day(_job_id UUID,_date DATE)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE j RECORD; result JSONB;
BEGIN
  SELECT * INTO j FROM championship_bracket_preview_private.jobs WHERE id=_job_id;
  IF j.id IS NULL OR (j.requested_by<>auth.uid() AND NOT public.has_admin_tab_access('matches'::public.admin_panel_tab,true)) THEN RAISE EXCEPTION 'Job de prévia não encontrado.'; END IF;
  WITH slot_entries AS (
    SELECT s.*,
      CASE WHEN a.match_id IS NULL THEN NULL ELSE jsonb_build_object(
        'type','MATCH','start_time',to_char(s.start_at AT TIME ZONE 'America/Sao_Paulo','HH24:MI'),
        'end_time',to_char(s.end_at AT TIME ZONE 'America/Sao_Paulo','HH24:MI'),
        'duration_minutes',(EXTRACT(EPOCH FROM (s.end_at-s.start_at))/60)::integer,
        'match_kind','GROUP_STAGE','match_number',m.slot_number,'sport_id',c.sport_id,
        'sport_name',c.sport_name,'naipe',c.naipe,'division',c.division,
        'phase','GROUP_STAGE','phase_label',NULL,'group_number',g.group_number,
        'round_number',m.round_number,'reason_code',NULL,
        'projected',false,'manual_final',false,'reason',NULL
      ) END entry
    FROM championship_bracket_preview_private.slots s
    LEFT JOIN championship_bracket_preview_private.assignments a ON a.slot_id=s.id
    LEFT JOIN championship_bracket_preview_private.matches m ON m.id=a.match_id
    LEFT JOIN championship_bracket_preview_private.competitions c ON c.id=m.competition_id
    LEFT JOIN championship_bracket_preview_private.groups g ON g.id=m.group_id
    WHERE s.job_id=_job_id AND s.event_date=_date
  ), court_rows AS (
    SELECT location_key,location_name,location_position,court_key,court_name,court_position,
      count(*)::integer slot_count,count(entry)::integer match_count,
      sum(EXTRACT(EPOCH FROM (end_at-start_at))/60)::integer available_minutes,
      sum(CASE WHEN entry IS NULL THEN 0 ELSE EXTRACT(EPOCH FROM (end_at-start_at))/60 END)::integer occupied_minutes,
      COALESCE(jsonb_agg(entry ORDER BY start_at) FILTER(WHERE entry IS NOT NULL),'[]'::jsonb) entries
    FROM slot_entries GROUP BY location_key,location_name,location_position,court_key,court_name,court_position
  ), location_rows AS (
    SELECT location_key,location_name,location_position,
      jsonb_agg(jsonb_build_object('court_key',court_key,'court_name',court_name,
        'occupied_minutes',occupied_minutes,'available_minutes',available_minutes,
        'utilization_percentage',round(100*match_count::numeric/GREATEST(slot_count,1),2),
        'free_windows',slot_count-match_count,'entries',entries) ORDER BY court_position) courts
    FROM court_rows GROUP BY location_key,location_name,location_position
  )
  SELECT jsonb_build_object('date',_date,
    'start_time',to_char(min(start_at) AT TIME ZONE 'America/Sao_Paulo','HH24:MI'),
    'end_time',to_char(max(end_at) AT TIME ZONE 'America/Sao_Paulo','HH24:MI'),
    'breaks',COALESCE((
      SELECT CASE
        WHEN NULLIF(day_item.value ->> 'break_start_time','') IS NULL
          OR NULLIF(day_item.value ->> 'break_end_time','') IS NULL
        THEN '[]'::jsonb
        ELSE jsonb_build_array(jsonb_build_object(
          'start_time',day_item.value ->> 'break_start_time',
          'end_time',day_item.value ->> 'break_end_time'
        ))
      END
      FROM jsonb_array_elements(COALESCE(j.payload -> 'schedule_days','[]'::jsonb)) day_item(value)
      WHERE day_item.value ->> 'date' = _date::text
      LIMIT 1
    ),'[]'::jsonb),
    'occupied_minutes',COALESCE(sum(CASE WHEN entry IS NULL THEN 0 ELSE EXTRACT(EPOCH FROM (end_at-start_at))/60 END),0)::integer,
    'available_minutes',COALESCE(sum(EXTRACT(EPOCH FROM (end_at-start_at))/60),0)::integer,
    'free_windows',count(*)-count(entry),
    'utilization_percentage',round(100*count(entry)::numeric/GREATEST(count(*),1),2),
    'locations',COALESCE((SELECT jsonb_agg(jsonb_build_object('location_key',location_key,
      'location_name',location_name,'courts',courts) ORDER BY location_position) FROM location_rows),'[]'::jsonb))
  INTO result
  FROM slot_entries;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_championship_bracket_preview_job(_job_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,championship_bracket_preview_private AS $function$
BEGIN
  UPDATE championship_bracket_preview_private.jobs SET status='CANCELLED',stage='Cancelada',expires_at=now()+interval '24 hours',updated_at=now()
  WHERE id=_job_id AND requested_by=auth.uid() AND status IN('QUEUED','INITIALIZING','SCHEDULING','FINALIZING');
  RETURN public.get_championship_bracket_preview_job_status(_job_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_championship_bracket_preview_queue(_max_batches INTEGER DEFAULT 3)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,championship_bracket_preview_private AS $function$
BEGIN
  IF COALESCE(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'Operação restrita ao worker.'; END IF;
  RETURN championship_bracket_preview_private.consume_queue(_max_batches);
END;
$function$;

-- A criação é idempotente e materializa as chaves e os horários já aprovados.
CREATE OR REPLACE FUNCTION public.create_championship_bracket_from_preview_job(_job_id UUID,_championship_id UUID,_payload JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,championship_bracket_preview_private SET statement_timeout='15s' AS $function$
DECLARE j RECORD; actual_dependency TEXT; edition_id UUID:=gen_random_uuid(); actual_manifest JSONB; actual_signature TEXT; knockout_result JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_admin_tab_access('matches'::public.admin_panel_tab,true) THEN RAISE EXCEPTION 'Usuário sem permissão para criar o campeonato.'; END IF;
  SELECT * INTO j FROM championship_bracket_preview_private.jobs WHERE id=_job_id FOR UPDATE;
  IF j.status='CONSUMED' AND j.result_edition_id IS NOT NULL THEN RETURN j.result_edition_id; END IF;
  IF j.status<>'COMPLETED' OR j.championship_id<>_championship_id OR j.requested_by<>auth.uid() OR j.expires_at<=now() THEN RAISE EXCEPTION 'A prévia exata não está concluída, pertence a outra configuração ou expirou.'; END IF;
  IF j.algorithm_version <> 'async-exact-v1' THEN RAISE EXCEPTION 'A versão do algoritmo da prévia não é mais aceita. Calcule novamente.'; END IF;
  IF public.resolve_championship_bracket_preview_payload_signature(COALESCE(_payload,'{}'))<>j.payload_signature THEN RAISE EXCEPTION 'A configuração foi alterada desde a prévia. Calcule novamente.'; END IF;
  actual_dependency:=championship_bracket_preview_private.resolve_dependency_signature(_championship_id,_payload);
  IF actual_dependency<>j.dependency_signature THEN RAISE EXCEPTION 'Dados externos usados no cálculo foram alterados. Calcule novamente.'; END IF;
  IF EXISTS(SELECT 1 FROM public.matches WHERE championship_id=_championship_id AND season_year=j.season_year) THEN RAISE EXCEPTION 'Este campeonato já possui jogos cadastrados.'; END IF;

  PERFORM set_config('app.skip_queue_trigger','true',true); PERFORM set_config('app.skip_match_conflict_trigger','true',true);
  INSERT INTO public.championship_bracket_editions(id,championship_id,season_year,status,payload_snapshot,created_by,updated_by)
    VALUES(edition_id,_championship_id,j.season_year,'GROUPS_GENERATED',_payload,auth.uid(),auth.uid());
  INSERT INTO public.championship_bracket_team_registrations(bracket_edition_id,team_id)
    SELECT DISTINCT edition_id,gt.team_id FROM championship_bracket_preview_private.group_teams gt WHERE gt.job_id=_job_id;
  INSERT INTO public.championship_bracket_team_modalities(bracket_edition_id,team_id,sport_id,naipe,division)
    SELECT DISTINCT edition_id,gt.team_id,c.sport_id,c.naipe,c.division FROM championship_bracket_preview_private.group_teams gt
    JOIN championship_bracket_preview_private.groups g ON g.id=gt.group_id JOIN championship_bracket_preview_private.competitions c ON c.id=g.competition_id WHERE gt.job_id=_job_id;
  INSERT INTO public.championship_bracket_competitions(id,bracket_edition_id,sport_id,naipe,division,groups_count,qualifiers_per_group,third_place_mode,should_complete_knockout_with_best_second_placed_teams,knockout_pairing_mode)
    SELECT id,edition_id,sport_id,naipe,division,groups_count,qualifiers_per_group,third_place_mode,best_second,pairing_mode FROM championship_bracket_preview_private.competitions WHERE job_id=_job_id;
  INSERT INTO public.championship_bracket_groups(id,competition_id,group_number) SELECT id,competition_id,group_number FROM championship_bracket_preview_private.groups WHERE job_id=_job_id;
  INSERT INTO public.championship_bracket_group_teams(group_id,team_id,position) SELECT group_id,team_id,position FROM championship_bracket_preview_private.group_teams WHERE job_id=_job_id;

  WITH inserted_days AS (INSERT INTO public.championship_bracket_days(bracket_edition_id,event_date,start_time,end_time,break_start_time,break_end_time)
    SELECT edition_id,(d.value->>'date')::date,(d.value->>'start_time')::time,(d.value->>'end_time')::time,NULLIF(d.value->>'break_start_time','')::time,NULLIF(d.value->>'break_end_time','')::time
    FROM jsonb_array_elements(_payload->'schedule_days') d(value) RETURNING id,event_date),
  inserted_locations AS (INSERT INTO public.championship_bracket_locations(bracket_day_id,name,position,location_group_id)
    SELECT id,l.value->>'name',COALESCE((l.value->>'position')::integer,l.ordinality::integer),(l.value->>'location_key')::uuid
    FROM inserted_days d JOIN LATERAL jsonb_array_elements((SELECT value->'locations' FROM jsonb_array_elements(_payload->'schedule_days') x(value) WHERE (value->>'date')::date=d.event_date)) WITH ORDINALITY l(value,ordinality) ON true RETURNING id,bracket_day_id,name,location_group_id),
  inserted_courts AS (INSERT INTO public.championship_bracket_courts(bracket_location_id,name,position,court_group_id)
    SELECT l.id,c.value->>'name',COALESCE((c.value->>'position')::integer,c.ordinality::integer),(c.value->>'court_key')::uuid
    FROM inserted_locations l JOIN public.championship_bracket_days d ON d.id=l.bracket_day_id
    JOIN LATERAL jsonb_array_elements((SELECT location.value->'courts' FROM jsonb_array_elements(_payload->'schedule_days') day(value)
      CROSS JOIN LATERAL jsonb_array_elements(day.value->'locations') location(value) WHERE (day.value->>'date')::date=d.event_date AND location.value->>'location_key'=l.location_group_id::text)) WITH ORDINALITY c(value,ordinality) ON true RETURNING id,bracket_location_id,name,court_group_id)
  INSERT INTO public.championship_bracket_court_sports(bracket_court_id,sport_id)
    SELECT DISTINCT c.id,s.sport_id FROM inserted_courts c JOIN championship_bracket_preview_private.slots s ON s.job_id=_job_id AND s.court_key=c.court_group_id ON CONFLICT DO NOTHING;
  PERFORM public.sync_championship_bracket_court_sport_preferences(edition_id,_payload);

  INSERT INTO public.matches(id,championship_id,division,naipe,sport_id,home_team_id,away_team_id,location,court_name,scheduled_date,scheduled_slot,queue_position,global_queue_order,start_time,end_time,season_year,status)
    SELECT m.id,_championship_id,c.division,c.naipe,c.sport_id,m.home_team_id,m.away_team_id,s.location_name,s.court_name,s.event_date,
      dense_rank() OVER(PARTITION BY s.event_date ORDER BY s.start_at),row_number() OVER(PARTITION BY s.event_date,c.sport_id,c.naipe,c.division ORDER BY s.start_at,s.location_position,s.court_position),
      row_number() OVER(ORDER BY s.event_date,s.start_at,s.location_position,s.court_position),s.start_at,s.end_at,j.season_year,'SCHEDULED'
    FROM championship_bracket_preview_private.assignments a JOIN championship_bracket_preview_private.matches m ON m.id=a.match_id
    JOIN championship_bracket_preview_private.competitions c ON c.id=m.competition_id JOIN championship_bracket_preview_private.slots s ON s.id=a.slot_id WHERE a.job_id=_job_id;
  INSERT INTO public.championship_bracket_matches(bracket_edition_id,competition_id,group_id,phase,round_number,slot_number,match_id,home_team_id,away_team_id)
    SELECT edition_id,competition_id,group_id,'GROUP_STAGE',round_number,slot_number,id,home_team_id,away_team_id FROM championship_bracket_preview_private.matches WHERE job_id=_job_id;

  knockout_result := public.rebuild_championship_knockout_schedule_reservations(
    edition_id,
    false
  );
  IF COALESCE(NULLIF(knockout_result ->> 'conflict_count','')::integer,0) > 0 THEN
    RAISE EXCEPTION 'As reservas do mata-mata divergiram da prévia; nenhuma alteração foi confirmada.';
  END IF;

  SELECT jsonb_build_object('algorithm_version',j.algorithm_version,'payload_signature',j.payload_signature,'dependency_signature',j.dependency_signature,
    'groups',COALESCE((SELECT jsonb_agg(jsonb_build_object('competition',c.competition_key,'group',g.group_number,'teams',(SELECT jsonb_agg(gt.team_id ORDER BY gt.position) FROM public.championship_bracket_group_teams gt WHERE gt.group_id=g.id)) ORDER BY c.position,g.group_number)
      FROM public.championship_bracket_groups g JOIN championship_bracket_preview_private.competitions c ON c.id=g.competition_id WHERE c.job_id=_job_id),'[]'::jsonb),
    'matches',COALESCE((SELECT jsonb_agg(jsonb_build_object('key',m.logical_key,'competition',c.competition_key,'round',m.round_number,'slot',m.slot_number,'home',pm.home_team_id,'away',pm.away_team_id,'date',pm.scheduled_date,'location',pm.location,'court',pm.court_name,'start',pm.start_time,'end',pm.end_time) ORDER BY pm.scheduled_date,pm.start_time,s.location_position,s.court_position,m.logical_key)
      FROM championship_bracket_preview_private.matches m JOIN championship_bracket_preview_private.competitions c ON c.id=m.competition_id JOIN public.matches pm ON pm.id=m.id JOIN championship_bracket_preview_private.assignments a ON a.match_id=m.id JOIN championship_bracket_preview_private.slots s ON s.id=a.slot_id WHERE m.job_id=_job_id),'[]'::jsonb)) INTO actual_manifest;
  actual_signature:=encode(extensions.digest(convert_to(actual_manifest::text,'UTF8'),'sha256'),'hex');
  IF actual_signature<>j.generation_signature THEN RAISE EXCEPTION 'A programação inserida divergiu da prévia; nenhuma alteração foi confirmada.'; END IF;
  UPDATE public.championships SET status='UPCOMING' WHERE id=_championship_id;
  UPDATE championship_bracket_preview_private.jobs SET status='CONSUMED',stage='Campeonato criado',result_edition_id=edition_id,consumed_at=now(),updated_at=now() WHERE id=_job_id;
  RETURN edition_id;
END;
$function$;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.recover_and_cleanup()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=championship_bracket_preview_private,pgmq AS $function$
DECLARE stale_job UUID;
BEGIN
  FOR stale_job IN SELECT id FROM championship_bracket_preview_private.jobs WHERE status IN('QUEUED','INITIALIZING','SCHEDULING','FINALIZING') AND (heartbeat_at IS NULL OR heartbeat_at<now()-interval '90 seconds') LOOP
    PERFORM championship_bracket_preview_private.enqueue(stale_job,0);
  END LOOP;
  DELETE FROM championship_bracket_preview_private.jobs WHERE expires_at<now() AND status IN('COMPLETED','FAILED','CANCELLED','CONSUMED');
  PERFORM championship_bracket_preview_private.consume_queue(1);
END;
$function$;

DO $cron$
DECLARE existing_job_id BIGINT;
BEGIN
  SELECT jobid INTO existing_job_id FROM cron.job WHERE jobname='process-championship-bracket-preview-jobs';
  IF existing_job_id IS NOT NULL THEN PERFORM cron.unschedule(existing_job_id); END IF;
  PERFORM cron.schedule('process-championship-bracket-preview-jobs','10 seconds','SELECT championship_bracket_preview_private.recover_and_cleanup();');
END;
$cron$;

REVOKE ALL ON ALL TABLES IN SCHEMA championship_bracket_preview_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA championship_bracket_preview_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.start_championship_bracket_preview_job(UUID,JSONB) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_championship_bracket_preview_job_status(UUID) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_championship_bracket_preview_job_day(UUID,DATE) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cancel_championship_bracket_preview_job(UUID) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.create_championship_bracket_from_preview_job(UUID,UUID,JSONB) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.process_championship_bracket_preview_queue(INTEGER) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_championship_bracket_preview_job(UUID,JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_championship_bracket_preview_job_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_championship_bracket_preview_job_day(UUID,DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_championship_bracket_preview_job(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_championship_bracket_from_preview_job(UUID,UUID,JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_championship_bracket_preview_queue(INTEGER) TO service_role;

COMMENT ON FUNCTION public.start_championship_bracket_preview_job(UUID,JSONB) IS 'Inicia ou reutiliza uma prévia exata assíncrona e durável.';
COMMENT ON FUNCTION public.create_championship_bracket_from_preview_job(UUID,UUID,JSONB) IS 'Materializa em conjunto a programação armazenada no job, sem executar novamente o redistribuidor pesado.';
NOTIFY pgrst,'reload schema';
