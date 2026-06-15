DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'bracket_court_priority_mode'
  ) THEN
    CREATE TYPE public.bracket_court_priority_mode AS ENUM ('NONE', 'NAIPE', 'DIVISION');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'bracket_day_break_scope_type'
  ) THEN
    CREATE TYPE public.bracket_day_break_scope_type AS ENUM ('ALL_COURTS', 'COURT');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_bracket_entity_name(_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(regexp_replace(COALESCE(_value, ''), '\s+', ' ', 'g')));
$$;

CREATE OR REPLACE FUNCTION public.combine_bracket_schedule_timestamp(
  _event_date DATE,
  _event_time TIME
)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT make_timestamptz(
    EXTRACT(YEAR FROM _event_date)::integer,
    EXTRACT(MONTH FROM _event_date)::integer,
    EXTRACT(DAY FROM _event_date)::integer,
    EXTRACT(HOUR FROM _event_time)::integer,
    EXTRACT(MINUTE FROM _event_time)::integer,
    FLOOR(EXTRACT(SECOND FROM _event_time))::integer,
    'America/Sao_Paulo'
  );
$$;

ALTER TABLE public.championship_bracket_locations
ADD COLUMN IF NOT EXISTS location_group_id UUID;

ALTER TABLE public.championship_bracket_courts
ADD COLUMN IF NOT EXISTS court_group_id UUID;

ALTER TABLE public.championship_bracket_day_breaks
ADD COLUMN IF NOT EXISTS scope_type public.bracket_day_break_scope_type
NOT NULL
DEFAULT 'ALL_COURTS'::public.bracket_day_break_scope_type;

ALTER TABLE public.championship_bracket_day_breaks
ADD COLUMN IF NOT EXISTS bracket_court_id UUID NULL REFERENCES public.championship_bracket_courts(id) ON DELETE CASCADE;

UPDATE public.championship_bracket_day_breaks
SET scope_type = 'ALL_COURTS'::public.bracket_day_break_scope_type
WHERE scope_type IS NULL;

CREATE TABLE IF NOT EXISTS public.championship_bracket_location_sport_priorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bracket_edition_id UUID NOT NULL REFERENCES public.championship_bracket_editions(id) ON DELETE CASCADE,
  location_group_id UUID NOT NULL,
  sport_id UUID NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  priority_mode public.bracket_court_priority_mode NOT NULL DEFAULT 'NONE'::public.bracket_court_priority_mode,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bracket_edition_id, location_group_id, sport_id)
);

CREATE INDEX IF NOT EXISTS championship_bracket_locations_location_group_idx
  ON public.championship_bracket_locations (location_group_id);

CREATE INDEX IF NOT EXISTS championship_bracket_courts_court_group_idx
  ON public.championship_bracket_courts (court_group_id);

CREATE INDEX IF NOT EXISTS championship_bracket_day_breaks_scope_idx
  ON public.championship_bracket_day_breaks (bracket_day_id, scope_type, bracket_court_id, position);

CREATE INDEX IF NOT EXISTS championship_bracket_location_sport_priorities_lookup_idx
  ON public.championship_bracket_location_sport_priorities (bracket_edition_id, location_group_id, sport_id);

WITH grouped_locations AS (
  SELECT
    locations_table.id,
    FIRST_VALUE(locations_table.id) OVER (
      PARTITION BY days_table.bracket_edition_id, public.normalize_bracket_entity_name(locations_table.name)
      ORDER BY locations_table.position ASC, locations_table.id ASC
    ) AS anchor_location_id
  FROM public.championship_bracket_locations AS locations_table
  JOIN public.championship_bracket_days AS days_table
    ON days_table.id = locations_table.bracket_day_id
),
anchor_location_groups AS (
  SELECT DISTINCT
    grouped_locations.anchor_location_id,
    gen_random_uuid() AS location_group_id
  FROM grouped_locations
)
UPDATE public.championship_bracket_locations AS locations_table
SET location_group_id = anchor_location_groups.location_group_id
FROM grouped_locations
JOIN anchor_location_groups
  ON anchor_location_groups.anchor_location_id = grouped_locations.anchor_location_id
WHERE grouped_locations.id = locations_table.id
  AND locations_table.location_group_id IS NULL;

WITH grouped_courts AS (
  SELECT
    courts_table.id,
    FIRST_VALUE(courts_table.id) OVER (
      PARTITION BY locations_table.location_group_id, public.normalize_bracket_entity_name(courts_table.name)
      ORDER BY courts_table.position ASC, courts_table.id ASC
    ) AS anchor_court_id
  FROM public.championship_bracket_courts AS courts_table
  JOIN public.championship_bracket_locations AS locations_table
    ON locations_table.id = courts_table.bracket_location_id
  WHERE locations_table.location_group_id IS NOT NULL
),
anchor_court_groups AS (
  SELECT DISTINCT
    grouped_courts.anchor_court_id,
    gen_random_uuid() AS court_group_id
  FROM grouped_courts
)
UPDATE public.championship_bracket_courts AS courts_table
SET court_group_id = anchor_court_groups.court_group_id
FROM grouped_courts
JOIN anchor_court_groups
  ON anchor_court_groups.anchor_court_id = grouped_courts.anchor_court_id
WHERE grouped_courts.id = courts_table.id
  AND courts_table.court_group_id IS NULL;

ALTER TABLE public.championship_bracket_locations
ALTER COLUMN location_group_id SET NOT NULL;

ALTER TABLE public.championship_bracket_courts
ALTER COLUMN court_group_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_bracket_location_group_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent_bracket_edition_id UUID;
BEGIN
  IF NEW.location_group_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT bracket_days_table.bracket_edition_id
  INTO parent_bracket_edition_id
  FROM public.championship_bracket_days AS bracket_days_table
  WHERE bracket_days_table.id = NEW.bracket_day_id
  LIMIT 1;

  IF parent_bracket_edition_id IS NULL THEN
    NEW.location_group_id := gen_random_uuid();
    RETURN NEW;
  END IF;

  SELECT existing_locations_table.location_group_id
  INTO NEW.location_group_id
  FROM public.championship_bracket_locations AS existing_locations_table
  JOIN public.championship_bracket_days AS existing_days_table
    ON existing_days_table.id = existing_locations_table.bracket_day_id
  WHERE existing_days_table.bracket_edition_id = parent_bracket_edition_id
    AND public.normalize_bracket_entity_name(existing_locations_table.name) = public.normalize_bracket_entity_name(NEW.name)
    AND existing_locations_table.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ORDER BY existing_locations_table.position ASC, existing_locations_table.id ASC
  LIMIT 1;

  NEW.location_group_id := COALESCE(NEW.location_group_id, gen_random_uuid());
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_bracket_court_group_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent_location_group_id UUID;
BEGIN
  IF NEW.court_group_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT bracket_locations_table.location_group_id
  INTO parent_location_group_id
  FROM public.championship_bracket_locations AS bracket_locations_table
  WHERE bracket_locations_table.id = NEW.bracket_location_id
  LIMIT 1;

  IF parent_location_group_id IS NULL THEN
    NEW.court_group_id := gen_random_uuid();
    RETURN NEW;
  END IF;

  SELECT existing_courts_table.court_group_id
  INTO NEW.court_group_id
  FROM public.championship_bracket_courts AS existing_courts_table
  JOIN public.championship_bracket_locations AS existing_locations_table
    ON existing_locations_table.id = existing_courts_table.bracket_location_id
  WHERE existing_locations_table.location_group_id = parent_location_group_id
    AND public.normalize_bracket_entity_name(existing_courts_table.name) = public.normalize_bracket_entity_name(NEW.name)
    AND existing_courts_table.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ORDER BY existing_courts_table.position ASC, existing_courts_table.id ASC
  LIMIT 1;

  NEW.court_group_id := COALESCE(NEW.court_group_id, gen_random_uuid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_bracket_location_group_id_trigger ON public.championship_bracket_locations;
CREATE TRIGGER assign_bracket_location_group_id_trigger
BEFORE INSERT OR UPDATE OF bracket_day_id, name, location_group_id
ON public.championship_bracket_locations
FOR EACH ROW
EXECUTE FUNCTION public.assign_bracket_location_group_id();

DROP TRIGGER IF EXISTS assign_bracket_court_group_id_trigger ON public.championship_bracket_courts;
CREATE TRIGGER assign_bracket_court_group_id_trigger
BEFORE INSERT OR UPDATE OF bracket_location_id, name, court_group_id
ON public.championship_bracket_courts
FOR EACH ROW
EXECUTE FUNCTION public.assign_bracket_court_group_id();

ALTER TABLE public.championship_bracket_location_sport_priorities ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'championship_bracket_location_sport_priorities'
      AND policyname = 'Admin can view championship_bracket_location_sport_priorities'
  ) THEN
    CREATE POLICY "Admin can view championship_bracket_location_sport_priorities"
      ON public.championship_bracket_location_sport_priorities
      FOR SELECT
      USING (public.has_admin_tab_access('matches'::public.admin_panel_tab, false));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'championship_bracket_location_sport_priorities'
      AND policyname = 'Admin can manage championship_bracket_location_sport_priorities'
  ) THEN
    CREATE POLICY "Admin can manage championship_bracket_location_sport_priorities"
      ON public.championship_bracket_location_sport_priorities
      FOR ALL
      USING (public.has_admin_tab_access('matches'::public.admin_panel_tab, true))
      WITH CHECK (public.has_admin_tab_access('matches'::public.admin_panel_tab, true));
  END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.championship_bracket_location_sport_priorities TO authenticated;

COMMENT ON COLUMN public.championship_bracket_locations.location_group_id IS
  'Identificador estável do local físico ao longo de todos os dias de uma mesma edição de chaveamento.';

COMMENT ON COLUMN public.championship_bracket_courts.court_group_id IS
  'Identificador estável da quadra física ao longo de todos os dias de uma mesma edição de chaveamento.';

COMMENT ON COLUMN public.championship_bracket_day_breaks.scope_type IS
  'Escopo do intervalo: todas as quadras do dia ou uma quadra específica.';

COMMENT ON COLUMN public.championship_bracket_day_breaks.bracket_court_id IS
  'Quadra alvo quando o intervalo é específico por quadra.';

COMMENT ON TABLE public.championship_bracket_location_sport_priorities IS
  'Prioridade global por edição + local físico + modalidade para revezamento automático das quadras.';

COMMENT ON COLUMN public.matches.court_name IS
  'Nome planejado da quadra do agendamento. Pode ser atualizado pela operação ao vivo quando necessário.';

CREATE OR REPLACE FUNCTION public.resolve_bracket_court_next_available_start(
  _bracket_day_id UUID,
  _bracket_court_id UUID,
  _candidate_start TIMESTAMPTZ,
  _duration_minutes INTEGER
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  bracket_day_record RECORD;
  break_record RECORD;
  current_start TIMESTAMPTZ;
  current_end TIMESTAMPTZ;
  has_conflicting_break BOOLEAN;
BEGIN
  IF _duration_minutes IS NULL OR _duration_minutes <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT
    event_date,
    start_time,
    end_time
  INTO bracket_day_record
  FROM public.championship_bracket_days
  WHERE id = _bracket_day_id
  LIMIT 1;

  IF bracket_day_record.event_date IS NULL THEN
    RETURN NULL;
  END IF;

  current_start := GREATEST(
    _candidate_start,
    public.combine_bracket_schedule_timestamp(bracket_day_record.event_date, bracket_day_record.start_time)
  );

  LOOP
    current_end := current_start + make_interval(mins => _duration_minutes);

    IF current_end > public.combine_bracket_schedule_timestamp(bracket_day_record.event_date, bracket_day_record.end_time) THEN
      RETURN NULL;
    END IF;

    has_conflicting_break := false;

    FOR break_record IN
      SELECT
        public.combine_bracket_schedule_timestamp(bracket_day_record.event_date, bracket_day_breaks_table.break_start_time) AS break_start_at,
        public.combine_bracket_schedule_timestamp(bracket_day_record.event_date, bracket_day_breaks_table.break_end_time) AS break_end_at
      FROM public.championship_bracket_day_breaks AS bracket_day_breaks_table
      WHERE bracket_day_breaks_table.bracket_day_id = _bracket_day_id
        AND (
          bracket_day_breaks_table.scope_type = 'ALL_COURTS'::public.bracket_day_break_scope_type
          OR (
            bracket_day_breaks_table.scope_type = 'COURT'::public.bracket_day_break_scope_type
            AND bracket_day_breaks_table.bracket_court_id = _bracket_court_id
          )
        )
      ORDER BY bracket_day_breaks_table.break_start_time ASC, bracket_day_breaks_table.position ASC
    LOOP
      IF current_start < break_record.break_end_at AND current_end > break_record.break_start_at THEN
        current_start := break_record.break_end_at;
        has_conflicting_break := true;
        EXIT;
      END IF;
    END LOOP;

    EXIT WHEN NOT has_conflicting_break;
  END LOOP;

  RETURN current_start;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_bracket_global_court_preferences(
  _bracket_edition_id UUID,
  _location_group_id UUID,
  _sport_id UUID,
  _priority_mode public.bracket_court_priority_mode
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  naipe_options public.match_naipe[];
  division_options public.team_division[];
  naipe_option_count INTEGER;
  division_option_count INTEGER;
BEGIN
  SELECT COALESCE(array_agg(ordered_naipes_table.naipe), ARRAY[]::public.match_naipe[])
  INTO naipe_options
  FROM (
    SELECT
      matches_table.naipe,
      MIN(
        CASE matches_table.naipe
          WHEN 'FEMININO'::public.match_naipe THEN 1
          WHEN 'MASCULINO'::public.match_naipe THEN 2
          ELSE 3
        END
      ) AS sort_order
    FROM public.matches AS matches_table
    JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.match_id = matches_table.id
    WHERE bracket_matches_table.bracket_edition_id = _bracket_edition_id
      AND matches_table.sport_id = _sport_id
    GROUP BY matches_table.naipe
    ORDER BY sort_order, matches_table.naipe
  ) AS ordered_naipes_table;

  SELECT COALESCE(array_agg(ordered_divisions_table.division), ARRAY[]::public.team_division[])
  INTO division_options
  FROM (
    SELECT
      matches_table.division,
      MIN(
        CASE matches_table.division
          WHEN 'DIVISAO_PRINCIPAL'::public.team_division THEN 1
          WHEN 'DIVISAO_ACESSO'::public.team_division THEN 2
          ELSE 99
        END
      ) AS sort_order
    FROM public.matches AS matches_table
    JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.match_id = matches_table.id
    WHERE bracket_matches_table.bracket_edition_id = _bracket_edition_id
      AND matches_table.sport_id = _sport_id
      AND matches_table.division IS NOT NULL
    GROUP BY matches_table.division
    ORDER BY sort_order, matches_table.division
  ) AS ordered_divisions_table;

  naipe_option_count := COALESCE(array_length(naipe_options, 1), 0);
  division_option_count := COALESCE(array_length(division_options, 1), 0);

  WITH ordered_courts AS (
    SELECT
      courts_table.id AS court_id,
      ROW_NUMBER() OVER (
        PARTITION BY days_table.id
        ORDER BY courts_table.position ASC, courts_table.name ASC, courts_table.id ASC
      ) AS day_court_order
    FROM public.championship_bracket_days AS days_table
    JOIN public.championship_bracket_locations AS locations_table
      ON locations_table.bracket_day_id = days_table.id
    JOIN public.championship_bracket_courts AS courts_table
      ON courts_table.bracket_location_id = locations_table.id
    JOIN public.championship_bracket_court_sports AS court_sports_table
      ON court_sports_table.bracket_court_id = courts_table.id
    WHERE days_table.bracket_edition_id = _bracket_edition_id
      AND locations_table.location_group_id = _location_group_id
      AND court_sports_table.sport_id = _sport_id
  )
  UPDATE public.championship_bracket_court_sports AS court_sports_table
  SET
    preferred_naipe = CASE
      WHEN _priority_mode = 'NAIPE'::public.bracket_court_priority_mode AND naipe_option_count > 0
        THEN naipe_options[((ordered_courts.day_court_order - 1) % naipe_option_count) + 1]
      ELSE NULL
    END,
    preferred_division = CASE
      WHEN _priority_mode = 'DIVISION'::public.bracket_court_priority_mode AND division_option_count > 0
        THEN division_options[((ordered_courts.day_court_order - 1) % division_option_count) + 1]
      ELSE NULL
    END
  FROM ordered_courts
  WHERE ordered_courts.court_id = court_sports_table.bracket_court_id
    AND court_sports_table.sport_id = _sport_id;
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
    created_at TIMESTAMPTZ NOT NULL
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
    created_at
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
    matches_table.created_at
  FROM public.matches AS matches_table
  JOIN public.championship_bracket_matches AS bracket_matches_table
    ON bracket_matches_table.match_id = matches_table.id
  JOIN public.championship_sports AS championship_sports_table
    ON championship_sports_table.championship_id = matches_table.championship_id
    AND championship_sports_table.sport_id = matches_table.sport_id
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

  FOR pending_match_record IN
    SELECT *
    FROM tmp_global_pending_matches
    ORDER BY order_index ASC
  LOOP
    best_candidate_found := false;
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

    FOR candidate_court_record IN
      SELECT *
      FROM tmp_global_day_courts
      WHERE sport_id = pending_match_record.sport_id
      ORDER BY event_date ASC, next_available_at ASC, location_position ASC, court_position ASC, court_name ASC
    LOOP
      candidate_probe_at := candidate_court_record.next_available_at;

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

        EXIT WHEN NOT same_team_conflict;

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
          AND candidate_court_record.assigned_count < best_assigned_count
        )
        OR (
          candidate_start_at = best_start_at
          AND candidate_primary_rank = best_primary_rank
          AND candidate_secondary_rank = best_secondary_rank
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

    IF NOT best_candidate_found THEN
      CONTINUE;
    END IF;

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
      pending_match_record.match_id,
      pending_match_record.order_index,
      pending_match_record.sport_id,
      pending_match_record.naipe,
      pending_match_record.division,
      pending_match_record.home_team_id,
      pending_match_record.away_team_id,
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
      last_naipe = pending_match_record.naipe,
      last_division = pending_match_record.division
    WHERE court_id = best_court_id
      AND sport_id = pending_match_record.sport_id
      AND bracket_day_id = best_day_id;
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

CREATE OR REPLACE FUNCTION public.update_bracket_day_schedule(
  _bracket_edition_id UUID,
  _schedule_updates JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  championship_id_value UUID;
  schedule_update_record JSONB;
  break_record JSONB;
  bracket_day_id_value UUID;
  first_general_break_start TIME;
  first_general_break_end TIME;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para atualizar agenda do chaveamento.';
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
    RAISE EXCEPTION 'Edição de chaveamento inválida ou campeonato fora do status Configurando campeonato.';
  END IF;

  FOR schedule_update_record IN SELECT * FROM jsonb_array_elements(_schedule_updates) LOOP
    SELECT id
    INTO bracket_day_id_value
    FROM public.championship_bracket_days
    WHERE bracket_edition_id = _bracket_edition_id
      AND event_date = (schedule_update_record->>'date')::date
    LIMIT 1;

    IF bracket_day_id_value IS NULL THEN
      RAISE EXCEPTION 'Dia % não encontrado na edição do chaveamento.', schedule_update_record->>'date';
    END IF;

    IF (schedule_update_record->>'end_time')::time <= (schedule_update_record->>'start_time')::time THEN
      RAISE EXCEPTION 'Horário de fim deve ser maior que o horário de início para o dia %.', schedule_update_record->>'date';
    END IF;

    first_general_break_start := NULL;
    first_general_break_end := NULL;

    DELETE FROM public.championship_bracket_day_breaks
    WHERE bracket_day_id = bracket_day_id_value;

    FOR break_record IN SELECT * FROM jsonb_array_elements(COALESCE(schedule_update_record->'breaks', '[]'::jsonb)) LOOP
      IF NULLIF(trim(COALESCE(break_record->>'break_start_time', '')), '') IS NULL
        OR NULLIF(trim(COALESCE(break_record->>'break_end_time', '')), '') IS NULL THEN
        RAISE EXCEPTION 'Preencha início e fim de todos os intervalos.';
      END IF;

      IF (break_record->>'break_end_time')::time <= (break_record->>'break_start_time')::time THEN
        RAISE EXCEPTION 'Fim do intervalo deve ser maior que o início.';
      END IF;

      IF (break_record->>'break_start_time')::time < (schedule_update_record->>'start_time')::time
        OR (break_record->>'break_end_time')::time > (schedule_update_record->>'end_time')::time THEN
        RAISE EXCEPTION 'Intervalos devem estar dentro da janela do dia.';
      END IF;

      IF COALESCE(break_record->>'scope_type', 'ALL_COURTS') = 'COURT'
        AND (break_record->>'bracket_court_id') IS NULL THEN
        RAISE EXCEPTION 'Selecione a quadra do intervalo específico.';
      END IF;

      IF COALESCE(break_record->>'scope_type', 'ALL_COURTS') = 'COURT'
        AND NOT EXISTS (
          SELECT 1
          FROM public.championship_bracket_courts AS courts_table
          JOIN public.championship_bracket_locations AS locations_table
            ON locations_table.id = courts_table.bracket_location_id
          WHERE courts_table.id = (break_record->>'bracket_court_id')::uuid
            AND locations_table.bracket_day_id = bracket_day_id_value
        ) THEN
        RAISE EXCEPTION 'A quadra do intervalo não pertence a este dia da agenda.';
      END IF;

      INSERT INTO public.championship_bracket_day_breaks (
        bracket_day_id,
        break_start_time,
        break_end_time,
        position,
        scope_type,
        bracket_court_id
      )
      VALUES (
        bracket_day_id_value,
        (break_record->>'break_start_time')::time,
        (break_record->>'break_end_time')::time,
        COALESCE((break_record->>'position')::integer, 1),
        COALESCE((break_record->>'scope_type')::public.bracket_day_break_scope_type, 'ALL_COURTS'::public.bracket_day_break_scope_type),
        CASE
          WHEN COALESCE(break_record->>'scope_type', 'ALL_COURTS') = 'COURT'
            THEN (break_record->>'bracket_court_id')::uuid
          ELSE NULL
        END
      );

      IF first_general_break_start IS NULL
        AND COALESCE(break_record->>'scope_type', 'ALL_COURTS') = 'ALL_COURTS' THEN
        first_general_break_start := (break_record->>'break_start_time')::time;
        first_general_break_end := (break_record->>'break_end_time')::time;
      END IF;
    END LOOP;

    UPDATE public.championship_bracket_days
    SET
      start_time = (schedule_update_record->>'start_time')::time,
      end_time = (schedule_update_record->>'end_time')::time,
      break_start_time = first_general_break_start,
      break_end_time = first_general_break_end
    WHERE id = bracket_day_id_value;
  END LOOP;

  PERFORM public.redistribute_bracket_scheduled_matches(_bracket_edition_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_bracket_location_sport_priorities(
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
  normalized_priority_mode public.bracket_court_priority_mode;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para editar prioridades globais de quadras.';
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
    normalized_priority_mode := COALESCE(
      NULLIF(trim(COALESCE(priority_update_record->>'priority_mode', '')), '')::public.bracket_court_priority_mode,
      'NONE'::public.bracket_court_priority_mode
    );

    IF NOT EXISTS (
      SELECT 1
      FROM public.championship_bracket_locations AS locations_table
      JOIN public.championship_bracket_days AS days_table
        ON days_table.id = locations_table.bracket_day_id
      WHERE days_table.bracket_edition_id = _bracket_edition_id
        AND locations_table.location_group_id = (priority_update_record->>'location_group_id')::uuid
    ) THEN
      RAISE EXCEPTION 'Local informado não pertence a esta edição do chaveamento.';
    END IF;

    INSERT INTO public.championship_bracket_location_sport_priorities (
      bracket_edition_id,
      location_group_id,
      sport_id,
      priority_mode
    )
    VALUES (
      _bracket_edition_id,
      (priority_update_record->>'location_group_id')::uuid,
      (priority_update_record->>'sport_id')::uuid,
      normalized_priority_mode
    )
    ON CONFLICT (bracket_edition_id, location_group_id, sport_id)
    DO UPDATE SET
      priority_mode = EXCLUDED.priority_mode,
      updated_at = now();

    PERFORM public.sync_bracket_global_court_preferences(
      _bracket_edition_id,
      (priority_update_record->>'location_group_id')::uuid,
      (priority_update_record->>'sport_id')::uuid,
      normalized_priority_mode
    );
  END LOOP;

  PERFORM public.redistribute_bracket_scheduled_matches(_bracket_edition_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_bracket_generated_location_group(
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
  court_record JSONB;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para editar locais e quadras da agenda.';
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.championship_bracket_locations AS locations_table
    JOIN public.championship_bracket_days AS days_table
      ON days_table.id = locations_table.bracket_day_id
    WHERE days_table.bracket_edition_id = _bracket_edition_id
      AND locations_table.location_group_id = (_payload->>'location_group_id')::uuid
  ) THEN
    RAISE EXCEPTION 'Local informado não pertence a esta edição do chaveamento.';
  END IF;

  UPDATE public.championship_bracket_locations AS locations_table
  SET name = trim(_payload->>'location_name')
  FROM public.championship_bracket_days AS days_table
  WHERE days_table.id = locations_table.bracket_day_id
    AND days_table.bracket_edition_id = _bracket_edition_id
    AND locations_table.location_group_id = (_payload->>'location_group_id')::uuid;

  FOR court_record IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'courts', '[]'::jsonb)) LOOP
    UPDATE public.championship_bracket_courts AS courts_table
    SET name = trim(court_record->>'court_name')
    FROM public.championship_bracket_locations AS locations_table
    JOIN public.championship_bracket_days AS days_table
      ON days_table.id = locations_table.bracket_day_id
    WHERE locations_table.id = courts_table.bracket_location_id
      AND days_table.bracket_edition_id = _bracket_edition_id
      AND locations_table.location_group_id = (_payload->>'location_group_id')::uuid
      AND courts_table.court_group_id = (court_record->>'court_group_id')::uuid;
  END LOOP;

  PERFORM public.redistribute_bracket_scheduled_matches(_bracket_edition_id);
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

REVOKE EXECUTE ON FUNCTION public.redistribute_bracket_scheduled_matches(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.redistribute_bracket_scheduled_matches(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.redistribute_bracket_scheduled_matches(uuid) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.update_bracket_day_schedule(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_bracket_location_sport_priorities(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_bracket_generated_location_group(uuid, jsonb) TO authenticated;
