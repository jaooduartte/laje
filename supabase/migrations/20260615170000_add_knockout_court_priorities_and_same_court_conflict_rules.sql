DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'bracket_knockout_priority_phase'
  ) THEN
    CREATE TYPE public.bracket_knockout_priority_phase AS ENUM ('SEMIFINAL', 'FINAL');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'bracket_knockout_division_scope'
  ) THEN
    CREATE TYPE public.bracket_knockout_division_scope AS ENUM ('DIVISAO_PRINCIPAL', 'DIVISAO_ACESSO', 'ALL');
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.championship_bracket_knockout_court_priorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bracket_edition_id UUID NOT NULL REFERENCES public.championship_bracket_editions(id) ON DELETE CASCADE,
  sport_id UUID NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  phase public.bracket_knockout_priority_phase NOT NULL,
  division_scope public.bracket_knockout_division_scope NOT NULL DEFAULT 'ALL'::public.bracket_knockout_division_scope,
  location_group_id UUID NOT NULL,
  court_group_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bracket_edition_id, sport_id, phase, division_scope)
);

CREATE INDEX IF NOT EXISTS championship_bracket_knockout_court_priorities_lookup_idx
  ON public.championship_bracket_knockout_court_priorities (bracket_edition_id, sport_id, phase, division_scope);

ALTER TABLE public.championship_bracket_knockout_court_priorities ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'championship_bracket_knockout_court_priorities'
      AND policyname = 'Admin can view championship_bracket_knockout_court_priorities'
  ) THEN
    CREATE POLICY "Admin can view championship_bracket_knockout_court_priorities"
      ON public.championship_bracket_knockout_court_priorities
      FOR SELECT
      TO authenticated
      USING (public.has_admin_tab_access('matches'::public.admin_panel_tab, false));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'championship_bracket_knockout_court_priorities'
      AND policyname = 'Admin can manage championship_bracket_knockout_court_priorities'
  ) THEN
    CREATE POLICY "Admin can manage championship_bracket_knockout_court_priorities"
      ON public.championship_bracket_knockout_court_priorities
      FOR ALL
      TO authenticated
      USING (public.has_admin_tab_access('matches'::public.admin_panel_tab, true))
      WITH CHECK (public.has_admin_tab_access('matches'::public.admin_panel_tab, true));
  END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.championship_bracket_knockout_court_priorities TO authenticated;

COMMENT ON TABLE public.championship_bracket_knockout_court_priorities IS
  'Configuração persistida de prioridade de local/quadra para semifinais e finais do mata-mata por modalidade.';

CREATE OR REPLACE FUNCTION public.resolve_bracket_knockout_match_phase(
  _round_number INTEGER,
  _competition_total_rounds INTEGER,
  _is_third_place BOOLEAN
)
RETURNS public.bracket_knockout_priority_phase
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF _is_third_place IS TRUE
    OR _round_number IS NULL
    OR _competition_total_rounds IS NULL
    OR _round_number < 1
    OR _competition_total_rounds < 1 THEN
    RETURN NULL;
  END IF;

  IF _round_number = _competition_total_rounds THEN
    RETURN 'FINAL'::public.bracket_knockout_priority_phase;
  END IF;

  IF _competition_total_rounds > 1
    AND _round_number = (_competition_total_rounds - 1) THEN
    RETURN 'SEMIFINAL'::public.bracket_knockout_priority_phase;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_bracket_knockout_division_scope(
  _division public.team_division
)
RETURNS public.bracket_knockout_division_scope
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _division = 'DIVISAO_PRINCIPAL'::public.team_division THEN 'DIVISAO_PRINCIPAL'::public.bracket_knockout_division_scope
    WHEN _division = 'DIVISAO_ACESSO'::public.team_division THEN 'DIVISAO_ACESSO'::public.bracket_knockout_division_scope
    ELSE 'ALL'::public.bracket_knockout_division_scope
  END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_bracket_knockout_priority_court_group_id(
  _bracket_edition_id UUID,
  _sport_id UUID,
  _phase public.bracket_knockout_priority_phase,
  _division_scope public.bracket_knockout_division_scope
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  resolved_court_group_id UUID;
BEGIN
  IF _bracket_edition_id IS NULL
    OR _sport_id IS NULL
    OR _phase IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT priorities_table.court_group_id
  INTO resolved_court_group_id
  FROM public.championship_bracket_knockout_court_priorities AS priorities_table
  WHERE priorities_table.bracket_edition_id = _bracket_edition_id
    AND priorities_table.sport_id = _sport_id
    AND priorities_table.phase = _phase
    AND priorities_table.division_scope = COALESCE(_division_scope, 'ALL'::public.bracket_knockout_division_scope)
  LIMIT 1;

  IF resolved_court_group_id IS NULL
    AND COALESCE(_division_scope, 'ALL'::public.bracket_knockout_division_scope) <> 'ALL'::public.bracket_knockout_division_scope THEN
    SELECT priorities_table.court_group_id
    INTO resolved_court_group_id
    FROM public.championship_bracket_knockout_court_priorities AS priorities_table
    WHERE priorities_table.bracket_edition_id = _bracket_edition_id
      AND priorities_table.sport_id = _sport_id
      AND priorities_table.phase = _phase
      AND priorities_table.division_scope = 'ALL'::public.bracket_knockout_division_scope
    LIMIT 1;
  END IF;

  IF resolved_court_group_id IS NOT NULL THEN
    RETURN resolved_court_group_id;
  END IF;

  WITH compatible_courts AS (
    SELECT DISTINCT
      locations_table.location_group_id,
      locations_table.position AS location_position,
      locations_table.name AS location_name,
      courts_table.court_group_id,
      courts_table.position AS court_position,
      courts_table.name AS court_name
    FROM public.championship_bracket_days AS days_table
    JOIN public.championship_bracket_locations AS locations_table
      ON locations_table.bracket_day_id = days_table.id
    JOIN public.championship_bracket_courts AS courts_table
      ON courts_table.bracket_location_id = locations_table.id
    JOIN public.championship_bracket_court_sports AS court_sports_table
      ON court_sports_table.bracket_court_id = courts_table.id
    WHERE days_table.bracket_edition_id = _bracket_edition_id
      AND court_sports_table.sport_id = _sport_id
  ),
  ordered_courts AS (
    SELECT
      compatible_courts.*,
      ROW_NUMBER() OVER (
        ORDER BY
          compatible_courts.location_position ASC,
          compatible_courts.court_position ASC,
          compatible_courts.location_name ASC,
          compatible_courts.court_name ASC,
          compatible_courts.court_group_id ASC
      ) AS overall_order
    FROM compatible_courts
  )
  SELECT ordered_courts.court_group_id
  INTO resolved_court_group_id
  FROM ordered_courts
  WHERE ordered_courts.overall_order = CASE
    WHEN _phase = 'SEMIFINAL'::public.bracket_knockout_priority_phase
      AND COALESCE(_division_scope, 'ALL'::public.bracket_knockout_division_scope) = 'DIVISAO_ACESSO'::public.bracket_knockout_division_scope
      AND EXISTS (SELECT 1 FROM ordered_courts WHERE overall_order = 2)
      THEN 2
    ELSE 1
  END
  LIMIT 1;

  RETURN resolved_court_group_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_scheduled_match_court_sequence_conflict(
  _championship_id UUID,
  _season_year INTEGER,
  _scheduled_date DATE,
  _location TEXT,
  _court_name TEXT,
  _start_time TIMESTAMPTZ,
  _scheduled_slot INTEGER,
  _queue_position INTEGER,
  _created_at TIMESTAMPTZ,
  _match_id UUID,
  _home_team_id UUID,
  _away_team_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  candidate_match_id UUID := COALESCE(_match_id, '00000000-0000-0000-0000-000000000000'::uuid);
  conflict_message TEXT;
BEGIN
  IF _championship_id IS NULL
    OR _season_year IS NULL
    OR _scheduled_date IS NULL
    OR NULLIF(trim(COALESCE(_location, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(_court_name, '')), '') IS NULL
    OR _home_team_id IS NULL
    OR _away_team_id IS NULL THEN
    RETURN NULL;
  END IF;

  WITH scoped_matches AS (
    SELECT
      matches_table.id,
      matches_table.home_team_id,
      matches_table.away_team_id,
      matches_table.start_time,
      matches_table.scheduled_slot,
      matches_table.queue_position,
      matches_table.created_at
    FROM public.matches AS matches_table
    WHERE matches_table.championship_id = _championship_id
      AND matches_table.season_year = _season_year
      AND matches_table.status = 'SCHEDULED'::public.match_status
      AND matches_table.scheduled_date = _scheduled_date
      AND public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(_location)
      AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(_court_name)
      AND matches_table.id <> candidate_match_id

    UNION ALL

    SELECT
      candidate_match_id,
      _home_team_id,
      _away_team_id,
      _start_time,
      _scheduled_slot,
      _queue_position,
      COALESCE(_created_at, now())
  ),
  ordered_matches AS (
    SELECT
      scoped_matches.*,
      lag(scoped_matches.home_team_id) OVER match_order AS previous_home_team_id,
      lag(scoped_matches.away_team_id) OVER match_order AS previous_away_team_id,
      lead(scoped_matches.home_team_id) OVER match_order AS next_home_team_id,
      lead(scoped_matches.away_team_id) OVER match_order AS next_away_team_id
    FROM scoped_matches
    WINDOW match_order AS (
      ORDER BY
        CASE
          WHEN scoped_matches.start_time IS NULL THEN 1
          ELSE 0
        END,
        scoped_matches.start_time ASC NULLS LAST,
        COALESCE(scoped_matches.scheduled_slot, scoped_matches.queue_position) ASC NULLS LAST,
        COALESCE(scoped_matches.queue_position, scoped_matches.scheduled_slot) ASC NULLS LAST,
        scoped_matches.created_at ASC,
        scoped_matches.id ASC
    )
  )
  SELECT CASE
    WHEN (
      ordered_matches.previous_home_team_id IN (_home_team_id, _away_team_id)
      OR ordered_matches.previous_away_team_id IN (_home_team_id, _away_team_id)
      OR ordered_matches.next_home_team_id IN (_home_team_id, _away_team_id)
      OR ordered_matches.next_away_team_id IN (_home_team_id, _away_team_id)
    ) THEN 'A mesma atlética não pode jogar ou representar jogos consecutivos na mesma quadra.'
    ELSE NULL
  END
  INTO conflict_message
  FROM ordered_matches
  WHERE ordered_matches.id = candidate_match_id
  LIMIT 1;

  RETURN conflict_message;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_bracket_knockout_court_priorities(
  _bracket_edition_id UUID,
  _priority_updates JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  championship_id_value UUID;
  priority_update_record JSONB;
  normalized_phase public.bracket_knockout_priority_phase;
  normalized_division_scope public.bracket_knockout_division_scope;
  resolved_location_group_id UUID;
  resolved_court_group_id UUID;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para editar prioridades do mata-mata.';
  END IF;

  SELECT bracket_editions_table.championship_id
  INTO championship_id_value
  FROM public.championship_bracket_editions AS bracket_editions_table
  JOIN public.championships AS championships_table
    ON championships_table.id = bracket_editions_table.championship_id
  WHERE bracket_editions_table.id = _bracket_edition_id
    AND championships_table.status = 'UPCOMING'::public.championship_status
  LIMIT 1;

  IF championship_id_value IS NULL THEN
    RAISE EXCEPTION 'Edição inválida ou campeonato fora do status Configurando campeonato.';
  END IF;

  FOR priority_update_record IN SELECT * FROM jsonb_array_elements(COALESCE(_priority_updates, '[]'::jsonb)) LOOP
    normalized_phase := NULLIF(trim(COALESCE(priority_update_record->>'phase', '')), '')::public.bracket_knockout_priority_phase;
    normalized_division_scope := COALESCE(
      NULLIF(trim(COALESCE(priority_update_record->>'division_scope', '')), '')::public.bracket_knockout_division_scope,
      'ALL'::public.bracket_knockout_division_scope
    );
    resolved_location_group_id := NULLIF(trim(COALESCE(priority_update_record->>'location_group_id', '')), '')::uuid;
    resolved_court_group_id := NULLIF(trim(COALESCE(priority_update_record->>'court_group_id', '')), '')::uuid;

    IF normalized_phase IS NULL THEN
      RAISE EXCEPTION 'Informe a fase do mata-mata para salvar a prioridade.';
    END IF;

    IF resolved_location_group_id IS NULL OR resolved_court_group_id IS NULL THEN
      DELETE FROM public.championship_bracket_knockout_court_priorities AS priorities_table
      WHERE priorities_table.bracket_edition_id = _bracket_edition_id
        AND priorities_table.sport_id = (priority_update_record->>'sport_id')::uuid
        AND priorities_table.phase = normalized_phase
        AND priorities_table.division_scope = normalized_division_scope;

      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.championship_bracket_days AS days_table
      JOIN public.championship_bracket_locations AS locations_table
        ON locations_table.bracket_day_id = days_table.id
      JOIN public.championship_bracket_courts AS courts_table
        ON courts_table.bracket_location_id = locations_table.id
      JOIN public.championship_bracket_court_sports AS court_sports_table
        ON court_sports_table.bracket_court_id = courts_table.id
      WHERE days_table.bracket_edition_id = _bracket_edition_id
        AND locations_table.location_group_id = resolved_location_group_id
        AND courts_table.court_group_id = resolved_court_group_id
        AND court_sports_table.sport_id = (priority_update_record->>'sport_id')::uuid
    ) THEN
      RAISE EXCEPTION 'A quadra informada não pertence a esta modalidade na edição atual.';
    END IF;

    INSERT INTO public.championship_bracket_knockout_court_priorities (
      bracket_edition_id,
      sport_id,
      phase,
      division_scope,
      location_group_id,
      court_group_id
    )
    VALUES (
      _bracket_edition_id,
      (priority_update_record->>'sport_id')::uuid,
      normalized_phase,
      normalized_division_scope,
      resolved_location_group_id,
      resolved_court_group_id
    )
    ON CONFLICT (bracket_edition_id, sport_id, phase, division_scope)
    DO UPDATE SET
      location_group_id = EXCLUDED.location_group_id,
      court_group_id = EXCLUDED.court_group_id,
      updated_at = now();
  END LOOP;

  PERFORM public.redistribute_bracket_scheduled_matches(_bracket_edition_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.redistribute_bracket_scheduled_matches(
  _bracket_edition_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bracket_edition_record RECORD;
  pending_match_record RECORD;
  candidate_court_record RECORD;
  candidate_probe_at TIMESTAMPTZ;
  candidate_start_at TIMESTAMPTZ;
  candidate_end_at TIMESTAMPTZ;
  candidate_primary_rank INTEGER;
  candidate_secondary_rank INTEGER;
  best_candidate_found BOOLEAN;
  best_match_id UUID;
  best_order_index BIGINT;
  best_sport_id UUID;
  best_naipe public.match_naipe;
  best_division public.team_division;
  best_home_team_id UUID;
  best_away_team_id UUID;
  best_duration_minutes INTEGER;
  best_day_id UUID;
  best_court_id UUID;
  best_event_date DATE;
  best_location_name TEXT;
  best_location_group_id UUID;
  best_location_position INTEGER;
  best_court_name TEXT;
  best_court_group_id UUID;
  best_court_position INTEGER;
  best_start_at TIMESTAMPTZ;
  best_end_at TIMESTAMPTZ;
  best_primary_rank INTEGER;
  best_secondary_rank INTEGER;
  best_assigned_count INTEGER;
  same_team_conflict BOOLEAN;
  previous_court_assignment_conflict BOOLEAN;
  latest_court_assignment_end_at TIMESTAMPTZ;
BEGIN
  SELECT
    championship_id,
    season_year
  INTO bracket_edition_record
  FROM public.championship_bracket_editions
  WHERE id = _bracket_edition_id
  LIMIT 1;

  IF bracket_edition_record.championship_id IS NULL THEN
    RAISE EXCEPTION 'Edição de chaveamento inválida.';
  END IF;

  DROP TABLE IF EXISTS tmp_global_day_courts;
  CREATE TEMP TABLE tmp_global_day_courts (
    bracket_day_id UUID NOT NULL,
    event_date DATE NOT NULL,
    sport_id UUID NOT NULL,
    location_id UUID NOT NULL,
    location_group_id UUID NOT NULL,
    location_name TEXT NOT NULL,
    location_position INTEGER NOT NULL,
    court_id UUID NOT NULL,
    court_group_id UUID NOT NULL,
    court_name TEXT NOT NULL,
    court_position INTEGER NOT NULL,
    priority_mode public.bracket_court_priority_mode NOT NULL,
    primary_naipe public.match_naipe NULL,
    primary_division public.team_division NULL,
    next_available_at TIMESTAMPTZ NOT NULL,
    assigned_count INTEGER NOT NULL DEFAULT 0,
    last_naipe public.match_naipe NULL,
    last_division public.team_division NULL,
    PRIMARY KEY (court_id, sport_id)
  ) ON COMMIT DROP;

  INSERT INTO tmp_global_day_courts (
    bracket_day_id,
    event_date,
    sport_id,
    location_id,
    location_group_id,
    location_name,
    location_position,
    court_id,
    court_group_id,
    court_name,
    court_position,
    priority_mode,
    primary_naipe,
    primary_division,
    next_available_at
  )
  SELECT
    days_table.id,
    days_table.event_date,
    court_sports_table.sport_id,
    locations_table.id,
    locations_table.location_group_id,
    locations_table.name,
    locations_table.position,
    courts_table.id,
    courts_table.court_group_id,
    courts_table.name,
    courts_table.position,
    COALESCE(location_priorities_table.priority_mode, 'NONE'::public.bracket_court_priority_mode),
    court_sports_table.preferred_naipe,
    court_sports_table.preferred_division,
    public.combine_bracket_schedule_timestamp(days_table.event_date, days_table.start_time)
  FROM public.championship_bracket_days AS days_table
  JOIN public.championship_bracket_locations AS locations_table
    ON locations_table.bracket_day_id = days_table.id
  JOIN public.championship_bracket_courts AS courts_table
    ON courts_table.bracket_location_id = locations_table.id
  JOIN public.championship_bracket_court_sports AS court_sports_table
    ON court_sports_table.bracket_court_id = courts_table.id
  LEFT JOIN public.championship_bracket_location_sport_priorities AS location_priorities_table
    ON location_priorities_table.bracket_edition_id = days_table.bracket_edition_id
    AND location_priorities_table.location_group_id = locations_table.location_group_id
    AND location_priorities_table.sport_id = court_sports_table.sport_id
  WHERE days_table.bracket_edition_id = _bracket_edition_id;

  DROP TABLE IF EXISTS tmp_global_pending_matches;
  CREATE TEMP TABLE tmp_global_pending_matches (
    order_index BIGINT PRIMARY KEY,
    match_id UUID NOT NULL,
    sport_id UUID NOT NULL,
    naipe public.match_naipe NOT NULL,
    division public.team_division NULL,
    home_team_id UUID NOT NULL,
    away_team_id UUID NOT NULL,
    duration_minutes INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    preferred_knockout_court_group_id UUID NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_global_pending_matches (
    order_index,
    match_id,
    sport_id,
    naipe,
    division,
    home_team_id,
    away_team_id,
    duration_minutes,
    created_at,
    preferred_knockout_court_group_id
  )
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY
        matches_table.scheduled_date ASC NULLS FIRST,
        COALESCE(matches_table.scheduled_slot, matches_table.queue_position) ASC NULLS LAST,
        COALESCE(matches_table.queue_position, matches_table.scheduled_slot) ASC NULLS LAST,
        matches_table.created_at ASC,
        matches_table.id ASC
    ) AS order_index,
    matches_table.id,
    matches_table.sport_id,
    matches_table.naipe,
    matches_table.division,
    matches_table.home_team_id,
    matches_table.away_team_id,
    GREATEST(championship_sports_table.default_match_duration_minutes, 1),
    matches_table.created_at,
    CASE
      WHEN bracket_matches_table.id IS NULL THEN NULL
      ELSE public.resolve_bracket_knockout_priority_court_group_id(
        _bracket_edition_id,
        matches_table.sport_id,
        public.resolve_bracket_knockout_match_phase(
          bracket_matches_table.round_number,
          COALESCE(competition_rounds_table.total_round_number, bracket_matches_table.round_number),
          bracket_matches_table.is_third_place
        ),
        public.resolve_bracket_knockout_division_scope(matches_table.division)
      )
    END AS preferred_knockout_court_group_id
  FROM public.matches AS matches_table
  JOIN public.championship_bracket_matches AS bracket_matches_table
    ON bracket_matches_table.match_id = matches_table.id
  JOIN public.championship_sports AS championship_sports_table
    ON championship_sports_table.championship_id = matches_table.championship_id
    AND championship_sports_table.sport_id = matches_table.sport_id
  LEFT JOIN (
    SELECT
      competition_id,
      MAX(round_number) FILTER (WHERE is_third_place = false) AS total_round_number
    FROM public.championship_bracket_matches
    WHERE bracket_edition_id = _bracket_edition_id
    GROUP BY competition_id
  ) AS competition_rounds_table
    ON competition_rounds_table.competition_id = bracket_matches_table.competition_id
  WHERE bracket_matches_table.bracket_edition_id = _bracket_edition_id
    AND matches_table.status = 'SCHEDULED'::public.match_status;

  DROP TABLE IF EXISTS tmp_global_assignments;
  CREATE TEMP TABLE tmp_global_assignments (
    match_id UUID PRIMARY KEY,
    order_index BIGINT NOT NULL,
    sport_id UUID NOT NULL,
    naipe public.match_naipe NOT NULL,
    division public.team_division NULL,
    home_team_id UUID NOT NULL,
    away_team_id UUID NOT NULL,
    new_scheduled_date DATE NOT NULL,
    location_name TEXT NOT NULL,
    location_position INTEGER NOT NULL,
    court_name TEXT NOT NULL,
    court_position INTEGER NOT NULL,
    planned_start_at TIMESTAMPTZ NOT NULL,
    planned_end_at TIMESTAMPTZ NOT NULL
  ) ON COMMIT DROP;

  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM tmp_global_pending_matches
    );

    best_candidate_found := false;
    best_match_id := NULL;
    best_order_index := NULL;
    best_sport_id := NULL;
    best_naipe := NULL;
    best_division := NULL;
    best_home_team_id := NULL;
    best_away_team_id := NULL;
    best_duration_minutes := NULL;
    best_day_id := NULL;
    best_court_id := NULL;
    best_event_date := NULL;
    best_location_name := NULL;
    best_location_group_id := NULL;
    best_location_position := NULL;
    best_court_name := NULL;
    best_court_group_id := NULL;
    best_court_position := NULL;
    best_start_at := NULL;
    best_end_at := NULL;
    best_primary_rank := NULL;
    best_secondary_rank := NULL;
    best_assigned_count := NULL;

    FOR pending_match_record IN
      SELECT *
      FROM tmp_global_pending_matches
      ORDER BY order_index ASC
    LOOP
      FOR candidate_court_record IN
        SELECT *
        FROM tmp_global_day_courts
        WHERE sport_id = pending_match_record.sport_id
        ORDER BY event_date ASC, next_available_at ASC, location_position ASC, court_position ASC, court_name ASC
      LOOP
        IF pending_match_record.preferred_knockout_court_group_id IS NOT NULL
          AND candidate_court_record.court_group_id <> pending_match_record.preferred_knockout_court_group_id THEN
          CONTINUE;
        END IF;

        candidate_probe_at := candidate_court_record.next_available_at;

        SELECT MAX(existing_assignments_table.planned_end_at)
        INTO latest_court_assignment_end_at
        FROM tmp_global_assignments AS existing_assignments_table
        WHERE existing_assignments_table.new_scheduled_date = candidate_court_record.event_date
          AND existing_assignments_table.location_name = candidate_court_record.location_name
          AND existing_assignments_table.court_name = candidate_court_record.court_name;

        IF latest_court_assignment_end_at IS NOT NULL
          AND latest_court_assignment_end_at > candidate_probe_at THEN
          candidate_probe_at := latest_court_assignment_end_at;
        END IF;

        LOOP
          candidate_start_at := public.resolve_bracket_court_next_available_start(
            candidate_court_record.bracket_day_id,
            candidate_court_record.court_id,
            candidate_probe_at,
            pending_match_record.duration_minutes
          );

          IF candidate_start_at IS NULL THEN
            EXIT;
          END IF;

          SELECT EXISTS (
            SELECT 1
            FROM tmp_global_assignments AS existing_assignments_table
            WHERE existing_assignments_table.new_scheduled_date = candidate_court_record.event_date
              AND existing_assignments_table.planned_start_at = candidate_start_at
              AND (
                existing_assignments_table.home_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
                OR existing_assignments_table.away_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
              )
          )
          INTO same_team_conflict;

          IF same_team_conflict THEN
            candidate_probe_at := candidate_start_at + make_interval(mins => pending_match_record.duration_minutes);
            CONTINUE;
          END IF;

          SELECT EXISTS (
            SELECT 1
            FROM (
              SELECT
                existing_assignments_table.home_team_id,
                existing_assignments_table.away_team_id
              FROM tmp_global_assignments AS existing_assignments_table
              WHERE existing_assignments_table.new_scheduled_date = candidate_court_record.event_date
                AND existing_assignments_table.location_name = candidate_court_record.location_name
                AND existing_assignments_table.court_name = candidate_court_record.court_name
                AND existing_assignments_table.planned_end_at <= candidate_start_at
              ORDER BY
                existing_assignments_table.planned_end_at DESC,
                existing_assignments_table.planned_start_at DESC,
                existing_assignments_table.order_index DESC
              LIMIT 1
            ) AS previous_court_match
            WHERE previous_court_match.home_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
              OR previous_court_match.away_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
          )
          INTO previous_court_assignment_conflict;

          EXIT WHEN NOT previous_court_assignment_conflict;

          candidate_probe_at := candidate_start_at + make_interval(mins => pending_match_record.duration_minutes);
        END LOOP;

        IF candidate_start_at IS NULL THEN
          CONTINUE;
        END IF;

        candidate_end_at := candidate_start_at + make_interval(mins => pending_match_record.duration_minutes);

        candidate_primary_rank := CASE
          WHEN candidate_court_record.priority_mode = 'NAIPE'::public.bracket_court_priority_mode THEN
            CASE
              WHEN candidate_court_record.primary_naipe IS NULL OR candidate_court_record.primary_naipe = pending_match_record.naipe THEN 0
              ELSE 1
            END
          WHEN candidate_court_record.priority_mode = 'DIVISION'::public.bracket_court_priority_mode THEN
            CASE
              WHEN candidate_court_record.primary_division IS NULL OR candidate_court_record.primary_division = pending_match_record.division THEN 0
              ELSE 1
            END
          ELSE 0
        END;

        candidate_secondary_rank := CASE
          WHEN candidate_court_record.priority_mode = 'NAIPE'::public.bracket_court_priority_mode THEN
            CASE
              WHEN pending_match_record.division IS NULL OR candidate_court_record.last_division IS NULL THEN 1
              WHEN pending_match_record.division <> candidate_court_record.last_division THEN 0
              ELSE 1
            END
          WHEN candidate_court_record.priority_mode = 'DIVISION'::public.bracket_court_priority_mode THEN
            CASE
              WHEN candidate_court_record.last_naipe IS NULL THEN 1
              WHEN pending_match_record.naipe <> candidate_court_record.last_naipe THEN 0
              ELSE 1
            END
          ELSE 1
        END;

        IF NOT best_candidate_found
          OR candidate_start_at < best_start_at
          OR (
            candidate_start_at = best_start_at
            AND candidate_primary_rank < best_primary_rank
          )
          OR (
            candidate_start_at = best_start_at
            AND candidate_primary_rank = best_primary_rank
            AND candidate_secondary_rank < best_secondary_rank
          )
          OR (
            candidate_start_at = best_start_at
            AND candidate_primary_rank = best_primary_rank
            AND candidate_secondary_rank = best_secondary_rank
            AND pending_match_record.order_index < best_order_index
          )
          OR (
            candidate_start_at = best_start_at
            AND candidate_primary_rank = best_primary_rank
            AND candidate_secondary_rank = best_secondary_rank
            AND pending_match_record.order_index = best_order_index
            AND candidate_court_record.assigned_count < best_assigned_count
          )
          OR (
            candidate_start_at = best_start_at
            AND candidate_primary_rank = best_primary_rank
            AND candidate_secondary_rank = best_secondary_rank
            AND pending_match_record.order_index = best_order_index
            AND candidate_court_record.assigned_count = best_assigned_count
            AND (
              candidate_court_record.location_position < best_location_position
              OR (
                candidate_court_record.location_position = best_location_position
                AND candidate_court_record.court_position < best_court_position
              )
            )
          )
        THEN
          best_candidate_found := true;
          best_match_id := pending_match_record.match_id;
          best_order_index := pending_match_record.order_index;
          best_sport_id := pending_match_record.sport_id;
          best_naipe := pending_match_record.naipe;
          best_division := pending_match_record.division;
          best_home_team_id := pending_match_record.home_team_id;
          best_away_team_id := pending_match_record.away_team_id;
          best_duration_minutes := pending_match_record.duration_minutes;
          best_day_id := candidate_court_record.bracket_day_id;
          best_court_id := candidate_court_record.court_id;
          best_event_date := candidate_court_record.event_date;
          best_location_name := candidate_court_record.location_name;
          best_location_group_id := candidate_court_record.location_group_id;
          best_location_position := candidate_court_record.location_position;
          best_court_name := candidate_court_record.court_name;
          best_court_group_id := candidate_court_record.court_group_id;
          best_court_position := candidate_court_record.court_position;
          best_start_at := candidate_start_at;
          best_end_at := candidate_end_at;
          best_primary_rank := candidate_primary_rank;
          best_secondary_rank := candidate_secondary_rank;
          best_assigned_count := candidate_court_record.assigned_count;
        END IF;
      END LOOP;
    END LOOP;

    EXIT WHEN NOT best_candidate_found;

    INSERT INTO tmp_global_assignments (
      match_id,
      order_index,
      sport_id,
      naipe,
      division,
      home_team_id,
      away_team_id,
      new_scheduled_date,
      location_name,
      location_position,
      court_name,
      court_position,
      planned_start_at,
      planned_end_at
    )
    VALUES (
      best_match_id,
      best_order_index,
      best_sport_id,
      best_naipe,
      best_division,
      best_home_team_id,
      best_away_team_id,
      best_event_date,
      best_location_name,
      best_location_position,
      best_court_name,
      best_court_position,
      best_start_at,
      best_end_at
    );

    UPDATE tmp_global_day_courts
    SET
      next_available_at = best_end_at,
      assigned_count = assigned_count + 1,
      last_naipe = best_naipe,
      last_division = best_division
    WHERE court_id = best_court_id
      AND sport_id = best_sport_id
      AND bracket_day_id = best_day_id;

    DELETE FROM tmp_global_pending_matches
    WHERE order_index = best_order_index;
  END LOOP;

  DROP TABLE IF EXISTS tmp_global_assignment_queue_positions;
  CREATE TEMP TABLE tmp_global_assignment_queue_positions AS
  SELECT
    assignments_table.match_id,
    DENSE_RANK() OVER (
      PARTITION BY assignments_table.new_scheduled_date
      ORDER BY assignments_table.planned_start_at ASC
    ) AS new_scheduled_slot,
    ROW_NUMBER() OVER (
      PARTITION BY
        assignments_table.new_scheduled_date,
        assignments_table.sport_id,
        assignments_table.naipe,
        public.coerce_division_for_index(assignments_table.division)
      ORDER BY
        assignments_table.planned_start_at ASC,
        assignments_table.location_position ASC,
        assignments_table.court_position ASC,
        assignments_table.order_index ASC
    ) AS new_queue_position,
    assignments_table.new_scheduled_date,
    assignments_table.location_name,
    assignments_table.court_name,
    assignments_table.planned_start_at,
    assignments_table.planned_end_at
  FROM tmp_global_assignments AS assignments_table;

  UPDATE public.matches AS matches_table
  SET queue_position = NULL
  FROM tmp_global_assignment_queue_positions AS assignment_queue_positions_table
  WHERE assignment_queue_positions_table.match_id = matches_table.id;

  UPDATE public.matches AS matches_table
  SET
    scheduled_date = assignment_queue_positions_table.new_scheduled_date,
    scheduled_slot = assignment_queue_positions_table.new_scheduled_slot,
    queue_position = assignment_queue_positions_table.new_queue_position,
    location = assignment_queue_positions_table.location_name,
    court_name = assignment_queue_positions_table.court_name,
    start_time = assignment_queue_positions_table.planned_start_at,
    end_time = assignment_queue_positions_table.planned_end_at
  FROM tmp_global_assignment_queue_positions AS assignment_queue_positions_table
  WHERE assignment_queue_positions_table.match_id = matches_table.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_championship_knockout_match_schedule(
  _championship_id UUID,
  _bracket_match_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bracket_match_record RECORD;
  competition_total_rounds INTEGER;
  selected_queue_date DATE;
  selected_location_name TEXT;
  selected_preferred_court_group_id UUID;
  new_match_id UUID;
BEGIN
  SELECT
    bracket_matches_table.id,
    bracket_matches_table.bracket_edition_id,
    bracket_matches_table.match_id,
    bracket_matches_table.home_team_id,
    bracket_matches_table.away_team_id,
    bracket_matches_table.round_number,
    bracket_matches_table.is_third_place,
    competitions_table.division,
    competitions_table.naipe,
    competitions_table.sport_id,
    editions_table.season_year
  INTO bracket_match_record
  FROM public.championship_bracket_matches AS bracket_matches_table
  JOIN public.championship_bracket_competitions AS competitions_table
    ON competitions_table.id = bracket_matches_table.competition_id
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = bracket_matches_table.bracket_edition_id
  WHERE bracket_matches_table.id = _bracket_match_id
  LIMIT 1;

  IF bracket_match_record.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF bracket_match_record.match_id IS NOT NULL THEN
    RETURN bracket_match_record.match_id;
  END IF;

  IF bracket_match_record.home_team_id IS NULL OR bracket_match_record.away_team_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT MAX(bracket_matches_table.round_number) FILTER (WHERE bracket_matches_table.is_third_place = false)
  INTO competition_total_rounds
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.bracket_edition_id = bracket_match_record.bracket_edition_id
    AND bracket_matches_table.competition_id = (
      SELECT competition_id
      FROM public.championship_bracket_matches
      WHERE id = _bracket_match_id
      LIMIT 1
    );

  SELECT COALESCE(
    (
      SELECT MAX(matches_table.scheduled_date)
      FROM public.matches AS matches_table
      WHERE matches_table.championship_id = _championship_id
        AND matches_table.season_year = bracket_match_record.season_year
        AND matches_table.scheduled_date IS NOT NULL
    ),
    (
      SELECT MIN(days_table.event_date)
      FROM public.championship_bracket_days AS days_table
      WHERE days_table.bracket_edition_id = bracket_match_record.bracket_edition_id
    )
  )
  INTO selected_queue_date;

  selected_preferred_court_group_id := public.resolve_bracket_knockout_priority_court_group_id(
    bracket_match_record.bracket_edition_id,
    bracket_match_record.sport_id,
    public.resolve_bracket_knockout_match_phase(
      bracket_match_record.round_number,
      competition_total_rounds,
      bracket_match_record.is_third_place
    ),
    public.resolve_bracket_knockout_division_scope(bracket_match_record.division)
  );

  SELECT schedule_candidates.location_name
  INTO selected_location_name
  FROM (
    SELECT DISTINCT
      locations_table.position,
      locations_table.name AS location_name,
      courts_table.court_group_id
    FROM public.championship_bracket_days AS days_table
    JOIN public.championship_bracket_locations AS locations_table
      ON locations_table.bracket_day_id = days_table.id
    JOIN public.championship_bracket_courts AS courts_table
      ON courts_table.bracket_location_id = locations_table.id
    JOIN public.championship_bracket_court_sports AS court_sports_table
      ON court_sports_table.bracket_court_id = courts_table.id
    WHERE days_table.bracket_edition_id = bracket_match_record.bracket_edition_id
      AND court_sports_table.sport_id = bracket_match_record.sport_id
      AND days_table.event_date = selected_queue_date
  ) AS schedule_candidates
  WHERE selected_preferred_court_group_id IS NULL
    OR schedule_candidates.court_group_id = selected_preferred_court_group_id
  ORDER BY
    schedule_candidates.position ASC,
    schedule_candidates.location_name ASC
  LIMIT 1;

  IF selected_location_name IS NULL THEN
    SELECT schedule_candidates.location_name
    INTO selected_location_name
    FROM (
      SELECT DISTINCT
        locations_table.position,
        locations_table.name AS location_name
      FROM public.championship_bracket_days AS days_table
      JOIN public.championship_bracket_locations AS locations_table
        ON locations_table.bracket_day_id = days_table.id
      JOIN public.championship_bracket_courts AS courts_table
        ON courts_table.bracket_location_id = locations_table.id
      JOIN public.championship_bracket_court_sports AS court_sports_table
        ON court_sports_table.bracket_court_id = courts_table.id
      WHERE days_table.bracket_edition_id = bracket_match_record.bracket_edition_id
        AND court_sports_table.sport_id = bracket_match_record.sport_id
        AND days_table.event_date = selected_queue_date
    ) AS schedule_candidates
    ORDER BY
      schedule_candidates.position ASC,
      schedule_candidates.location_name ASC
    LIMIT 1;
  END IF;

  IF selected_queue_date IS NULL OR selected_location_name IS NULL THEN
    RAISE EXCEPTION 'Não há local compatível configurado para gerar a fila do mata-mata nesta modalidade.';
  END IF;

  INSERT INTO public.matches (
    championship_id,
    division,
    naipe,
    sport_id,
    home_team_id,
    away_team_id,
    location,
    court_name,
    scheduled_date,
    queue_position,
    start_time,
    end_time,
    season_year,
    status
  ) VALUES (
    _championship_id,
    bracket_match_record.division,
    bracket_match_record.naipe,
    bracket_match_record.sport_id,
    bracket_match_record.home_team_id,
    bracket_match_record.away_team_id,
    selected_location_name,
    NULL,
    selected_queue_date,
    NULL,
    NULL,
    NULL,
    bracket_match_record.season_year,
    'SCHEDULED'::public.match_status
  )
  RETURNING id INTO new_match_id;

  UPDATE public.championship_bracket_matches
  SET match_id = new_match_id
  WHERE id = _bracket_match_id;

  PERFORM public.redistribute_bracket_scheduled_matches(bracket_match_record.bracket_edition_id);

  RETURN new_match_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_match_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  available_courts_count INTEGER;
  live_matches_count INTEGER;
  latest_bracket_edition_id UUID;
  should_validate_live_capacity BOOLEAN := false;
  court_sequence_conflict_message TEXT;
BEGIN
  IF NEW.home_team_id = NEW.away_team_id THEN
    RAISE EXCEPTION 'Os times da partida devem ser diferentes.';
  END IF;

  IF NEW.status = 'SCHEDULED'::public.match_status THEN
    IF NEW.scheduled_date IS NULL THEN
      RAISE EXCEPTION 'Informe o dia da fila para partidas agendadas.';
    END IF;
  END IF;

  IF NEW.status = 'LIVE'::public.match_status AND NEW.scheduled_date IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      should_validate_live_capacity := true;
    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
      should_validate_live_capacity := true;
    END IF;
  END IF;

  IF should_validate_live_capacity THEN
    SELECT editions_table.id
    INTO latest_bracket_edition_id
    FROM public.championship_bracket_editions AS editions_table
    WHERE editions_table.championship_id = NEW.championship_id
      AND editions_table.season_year = NEW.season_year
    ORDER BY editions_table.created_at DESC
    LIMIT 1;

    IF latest_bracket_edition_id IS NOT NULL THEN
      SELECT count(*)
      INTO available_courts_count
      FROM public.championship_bracket_days AS days_table
      JOIN public.championship_bracket_locations AS locations_table
        ON locations_table.bracket_day_id = days_table.id
      JOIN public.championship_bracket_courts AS courts_table
        ON courts_table.bracket_location_id = locations_table.id
      JOIN public.championship_bracket_court_sports AS court_sports_table
        ON court_sports_table.bracket_court_id = courts_table.id
      WHERE days_table.bracket_edition_id = latest_bracket_edition_id
        AND days_table.event_date = NEW.scheduled_date
        AND court_sports_table.sport_id = NEW.sport_id;

      IF COALESCE(available_courts_count, 0) > 0 THEN
        SELECT count(*)
        INTO live_matches_count
        FROM public.matches AS matches_table
        WHERE matches_table.championship_id = NEW.championship_id
          AND matches_table.season_year = NEW.season_year
          AND matches_table.sport_id = NEW.sport_id
          AND matches_table.status = 'LIVE'::public.match_status
          AND matches_table.scheduled_date IS NOT DISTINCT FROM NEW.scheduled_date
          AND matches_table.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

        IF live_matches_count >= available_courts_count THEN
          RAISE EXCEPTION 'Todas as quadras compatíveis desta modalidade já estão ocupadas neste dia.';
        END IF;
      END IF;
    END IF;
  END IF;

  IF NEW.status = 'SCHEDULED'::public.match_status
    AND NEW.court_name IS NOT NULL
    AND NULLIF(trim(COALESCE(NEW.location, '')), '') IS NOT NULL
    AND NULLIF(trim(COALESCE(NEW.court_name, '')), '') IS NOT NULL THEN
    court_sequence_conflict_message := public.resolve_scheduled_match_court_sequence_conflict(
      NEW.championship_id,
      NEW.season_year,
      NEW.scheduled_date,
      NEW.location,
      NEW.court_name,
      NEW.start_time,
      NEW.scheduled_slot,
      NEW.queue_position,
      NEW.created_at,
      NEW.id,
      NEW.home_team_id,
      NEW.away_team_id
    );

    IF court_sequence_conflict_message IS NOT NULL THEN
      RAISE EXCEPTION '%', court_sequence_conflict_message;
    END IF;
  END IF;

  IF NEW.end_time IS NOT NULL AND NEW.start_time IS NULL THEN
    RAISE EXCEPTION 'A partida não pode ter horário final sem horário inicial.';
  END IF;

  IF NEW.start_time IS NOT NULL
    AND NEW.end_time IS NOT NULL
    AND NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'Horário final da partida deve ser maior que o horário inicial.';
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_bracket_knockout_court_priorities(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
