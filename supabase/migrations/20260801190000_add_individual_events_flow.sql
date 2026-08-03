DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'championship_schedule_period'
  ) THEN
    CREATE TYPE public.championship_schedule_period AS ENUM ('MATUTINO', 'VESPERTINO');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'championship_individual_event_kind'
  ) THEN
    CREATE TYPE public.championship_individual_event_kind AS ENUM ('INDIVIDUAL', 'RELAY');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'championship_individual_event_status'
  ) THEN
    CREATE TYPE public.championship_individual_event_status AS ENUM ('DRAFT', 'SCHEDULED', 'FINISHED', 'CANCELLED');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'championship_individual_entry_status'
  ) THEN
    CREATE TYPE public.championship_individual_entry_status AS ENUM (
      'PENDING',
      'CONFIRMED',
      'DNS',
      'DSQ',
      'CANCELLED',
      'DSQ_OVER_LIMIT'
    );
  END IF;
END;
$$;

ALTER TYPE public.admin_panel_tab ADD VALUE IF NOT EXISTS 'individual_events';

CREATE TABLE IF NOT EXISTS public.championship_individual_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  season_year INTEGER NOT NULL,
  sport_id UUID NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  naipe public.match_naipe NOT NULL,
  division public.team_division NULL,
  event_code TEXT NOT NULL,
  name TEXT NOT NULL,
  kind public.championship_individual_event_kind NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 1,
  scheduled_date DATE NULL,
  period public.championship_schedule_period NULL,
  location TEXT NULL,
  status public.championship_individual_event_status NOT NULL DEFAULT 'DRAFT',
  relay_multiplier NUMERIC(10,2) NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT championship_individual_events_unique_context UNIQUE (
    championship_id,
    season_year,
    sport_id,
    naipe,
    division,
    event_code
  )
);

CREATE TABLE IF NOT EXISTS public.championship_individual_event_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.championship_individual_events(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  athlete_id UUID NULL REFERENCES public.championship_award_players(id) ON DELETE SET NULL,
  athlete_name TEXT NULL,
  entry_type public.championship_individual_event_kind NOT NULL,
  final_position INTEGER NULL CHECK (final_position IS NULL OR final_position >= 1),
  status public.championship_individual_entry_status NOT NULL DEFAULT 'PENDING',
  points_awarded NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS championship_individual_event_entries_unique_athlete_idx
  ON public.championship_individual_event_entries (event_id, athlete_id)
  WHERE athlete_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS championship_individual_event_entries_unique_relay_idx
  ON public.championship_individual_event_entries (event_id, team_id)
  WHERE athlete_id IS NULL;

CREATE TABLE IF NOT EXISTS public.championship_individual_event_entry_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.championship_individual_event_entries(id) ON DELETE CASCADE,
  athlete_id UUID NULL REFERENCES public.championship_award_players(id) ON DELETE SET NULL,
  athlete_name TEXT NOT NULL,
  is_starter BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS championship_individual_event_entry_members_unique_athlete_idx
  ON public.championship_individual_event_entry_members (entry_id, athlete_id)
  WHERE athlete_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.championship_individual_team_standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  season_year INTEGER NOT NULL,
  sport_id UUID NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  naipe public.match_naipe NOT NULL,
  division public.team_division NULL,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  total_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  scored_events_count INTEGER NOT NULL DEFAULT 0,
  first_places INTEGER NOT NULL DEFAULT 0,
  second_places INTEGER NOT NULL DEFAULT 0,
  third_places INTEGER NOT NULL DEFAULT 0,
  fourth_places INTEGER NOT NULL DEFAULT 0,
  fifth_places INTEGER NOT NULL DEFAULT 0,
  sixth_places INTEGER NOT NULL DEFAULT 0,
  seventh_places INTEGER NOT NULL DEFAULT 0,
  eighth_places INTEGER NOT NULL DEFAULT 0,
  ninth_places INTEGER NOT NULL DEFAULT 0,
  tenth_places INTEGER NOT NULL DEFAULT 0,
  eleventh_places INTEGER NOT NULL DEFAULT 0,
  twelfth_places INTEGER NOT NULL DEFAULT 0,
  thirteenth_places INTEGER NOT NULL DEFAULT 0,
  fourteenth_places INTEGER NOT NULL DEFAULT 0,
  fifteenth_places INTEGER NOT NULL DEFAULT 0,
  sixteenth_places INTEGER NOT NULL DEFAULT 0,
  seventeenth_places INTEGER NOT NULL DEFAULT 0,
  eighteenth_places INTEGER NOT NULL DEFAULT 0,
  nineteenth_places INTEGER NOT NULL DEFAULT 0,
  twentieth_places INTEGER NOT NULL DEFAULT 0,
  relay_points_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT championship_individual_team_standings_unique_context UNIQUE (
    championship_id,
    season_year,
    sport_id,
    naipe,
    division,
    team_id
  )
);

CREATE INDEX IF NOT EXISTS championship_individual_events_lookup_idx
  ON public.championship_individual_events (championship_id, season_year, sport_id, naipe, division, status, scheduled_date);

CREATE INDEX IF NOT EXISTS championship_individual_entries_event_idx
  ON public.championship_individual_event_entries (event_id, team_id, status, final_position);

CREATE INDEX IF NOT EXISTS championship_individual_members_entry_idx
  ON public.championship_individual_event_entry_members (entry_id, is_starter, position);

CREATE INDEX IF NOT EXISTS championship_individual_team_standings_lookup_idx
  ON public.championship_individual_team_standings (championship_id, season_year, sport_id, naipe, division, total_points DESC);

ALTER TABLE public.championship_individual_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.championship_individual_event_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.championship_individual_event_entry_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.championship_individual_team_standings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS championship_individual_events_public_select ON public.championship_individual_events;
CREATE POLICY championship_individual_events_public_select
  ON public.championship_individual_events
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS championship_individual_events_authenticated_write ON public.championship_individual_events;
CREATE POLICY championship_individual_events_authenticated_write
  ON public.championship_individual_events
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS championship_individual_event_entries_public_select ON public.championship_individual_event_entries;
CREATE POLICY championship_individual_event_entries_public_select
  ON public.championship_individual_event_entries
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS championship_individual_event_entries_authenticated_write ON public.championship_individual_event_entries;
CREATE POLICY championship_individual_event_entries_authenticated_write
  ON public.championship_individual_event_entries
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS championship_individual_event_entry_members_public_select ON public.championship_individual_event_entry_members;
CREATE POLICY championship_individual_event_entry_members_public_select
  ON public.championship_individual_event_entry_members
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS championship_individual_event_entry_members_authenticated_write ON public.championship_individual_event_entry_members;
CREATE POLICY championship_individual_event_entry_members_authenticated_write
  ON public.championship_individual_event_entry_members
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS championship_individual_team_standings_public_select ON public.championship_individual_team_standings;
CREATE POLICY championship_individual_team_standings_public_select
  ON public.championship_individual_team_standings
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS championship_individual_team_standings_authenticated_write ON public.championship_individual_team_standings;
CREATE POLICY championship_individual_team_standings_authenticated_write
  ON public.championship_individual_team_standings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_timestamp_on_championship_individual_events ON public.championship_individual_events;
CREATE TRIGGER set_updated_at_timestamp_on_championship_individual_events
  BEFORE UPDATE ON public.championship_individual_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS set_updated_at_timestamp_on_championship_individual_event_entries ON public.championship_individual_event_entries;
CREATE TRIGGER set_updated_at_timestamp_on_championship_individual_event_entries
  BEFORE UPDATE ON public.championship_individual_event_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS set_updated_at_timestamp_on_championship_individual_team_standings ON public.championship_individual_team_standings;
CREATE TRIGGER set_updated_at_timestamp_on_championship_individual_team_standings
  BEFORE UPDATE ON public.championship_individual_team_standings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE OR REPLACE FUNCTION public.resolve_individual_event_position_points(_final_position INTEGER)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _final_position
    WHEN 1 THEN 24
    WHEN 2 THEN 22
    WHEN 3 THEN 20
    WHEN 4 THEN 18
    WHEN 5 THEN 16
    WHEN 6 THEN 15
    WHEN 7 THEN 14
    WHEN 8 THEN 13
    WHEN 9 THEN 12
    WHEN 10 THEN 11
    WHEN 11 THEN 10
    WHEN 12 THEN 9
    WHEN 13 THEN 8
    WHEN 14 THEN 7
    WHEN 15 THEN 6
    WHEN 16 THEN 5
    WHEN 17 THEN 4
    WHEN 18 THEN 3
    WHEN 19 THEN 2
    WHEN 20 THEN 1
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_normalized_sport_name(_sport_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(translate(COALESCE(_sport_name, ''), 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc')));
$$;

CREATE OR REPLACE FUNCTION public.resolve_championship_individual_competition_key(
  _sport_id UUID,
  _naipe public.match_naipe,
  _division public.team_division
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    _sport_id::text
    || '::'
    || _naipe::text
    || '::'
    || COALESCE(_division::text, 'WITHOUT_DIVISION');
$$;

CREATE OR REPLACE FUNCTION public.get_championship_setup_payload_snapshot(
  _championship_id UUID,
  _season_year INTEGER
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(bracket_editions_table.payload_snapshot, '{}'::jsonb)
  FROM public.championship_bracket_editions AS bracket_editions_table
  WHERE bracket_editions_table.championship_id = _championship_id
    AND bracket_editions_table.season_year = _season_year
  ORDER BY bracket_editions_table.created_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_schedule_period_enabled_by_payload(
  _payload JSONB,
  _event_date DATE,
  _period public.championship_schedule_period
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT (item.value->>'enabled')::boolean
      FROM jsonb_array_elements(COALESCE(_payload->'schedule_periods', '[]'::jsonb)) AS item(value)
      WHERE (item.value->>'date')::date = _event_date
        AND item.value->>'period' = _period::text
      LIMIT 1
    ),
    true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_competition_period_enabled_by_payload(
  _payload JSONB,
  _competition_key TEXT,
  _event_date DATE,
  _period public.championship_schedule_period
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT (item.value->>'enabled')::boolean
      FROM jsonb_array_elements(COALESCE(_payload->'competition_period_availability', '[]'::jsonb)) AS item(value)
      WHERE item.value->>'competition_key' = _competition_key
        AND (item.value->>'date')::date = _event_date
        AND item.value->>'period' = _period::text
      LIMIT 1
    ),
    true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_team_competition_period_enabled_by_payload(
  _payload JSONB,
  _team_id UUID,
  _competition_key TEXT,
  _event_date DATE,
  _period public.championship_schedule_period
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT (item.value->>'enabled')::boolean
      FROM jsonb_array_elements(COALESCE(_payload->'team_competition_availability', '[]'::jsonb)) AS item(value)
      WHERE (item.value->>'team_id')::uuid = _team_id
        AND item.value->>'competition_key' = _competition_key
        AND (item.value->>'date')::date = _event_date
        AND item.value->>'period' = _period::text
      LIMIT 1
    ),
    true
  );
$$;

CREATE OR REPLACE FUNCTION public.recalculate_championship_individual_standings(
  _championship_id UUID,
  _season_year INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  WITH ranked_entries AS (
    SELECT
      entries_table.id,
      ROW_NUMBER() OVER (
        PARTITION BY events_table.championship_id, events_table.season_year, events_table.sport_id, events_table.naipe, entries_table.athlete_id
        ORDER BY entries_table.created_at ASC, entries_table.id ASC
      ) AS athlete_event_rank
    FROM public.championship_individual_event_entries AS entries_table
    JOIN public.championship_individual_events AS events_table
      ON events_table.id = entries_table.event_id
    WHERE events_table.championship_id = _championship_id
      AND events_table.season_year = _season_year
      AND entries_table.athlete_id IS NOT NULL
      AND entries_table.status != 'CANCELLED'::public.championship_individual_entry_status
  )
  UPDATE public.championship_individual_event_entries AS entries_table
  SET status = CASE
    WHEN ranked_entries.athlete_event_rank > 4 THEN 'DSQ_OVER_LIMIT'::public.championship_individual_entry_status
    WHEN ranked_entries.athlete_event_rank <= 4
      AND entries_table.status = 'DSQ_OVER_LIMIT'::public.championship_individual_entry_status
    THEN 'PENDING'::public.championship_individual_entry_status
    ELSE entries_table.status
  END
  FROM ranked_entries
  WHERE ranked_entries.id = entries_table.id;

  UPDATE public.championship_individual_event_entries AS entries_table
  SET
    points_awarded = CASE
      WHEN entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status
        AND entries_table.final_position BETWEEN 1 AND 20
      THEN public.resolve_individual_event_position_points(entries_table.final_position)
        * CASE
            WHEN events_table.kind = 'RELAY'::public.championship_individual_event_kind
            THEN COALESCE(events_table.relay_multiplier, 2)
            ELSE 1
          END
      ELSE 0
    END
  FROM public.championship_individual_events AS events_table
  WHERE events_table.id = entries_table.event_id
    AND events_table.championship_id = _championship_id
    AND events_table.season_year = _season_year;

  DELETE FROM public.championship_individual_team_standings
  WHERE championship_id = _championship_id
    AND season_year = _season_year;

  INSERT INTO public.championship_individual_team_standings (
    championship_id,
    season_year,
    sport_id,
    naipe,
    division,
    team_id,
    total_points,
    scored_events_count,
    first_places,
    second_places,
    third_places,
    fourth_places,
    fifth_places,
    sixth_places,
    seventh_places,
    eighth_places,
    ninth_places,
    tenth_places,
    eleventh_places,
    twelfth_places,
    thirteenth_places,
    fourteenth_places,
    fifteenth_places,
    sixteenth_places,
    seventeenth_places,
    eighteenth_places,
    nineteenth_places,
    twentieth_places,
    relay_points_total
  )
  SELECT
    events_table.championship_id,
    events_table.season_year,
    events_table.sport_id,
    events_table.naipe,
    events_table.division,
    entries_table.team_id,
    COALESCE(SUM(entries_table.points_awarded), 0),
    COUNT(*) FILTER (
      WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status
        AND entries_table.final_position IS NOT NULL
    ),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 1),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 2),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 3),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 4),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 5),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 6),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 7),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 8),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 9),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 10),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 11),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 12),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 13),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 14),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 15),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 16),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 17),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 18),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 19),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 20),
    COALESCE(SUM(entries_table.points_awarded) FILTER (
      WHERE events_table.kind = 'RELAY'::public.championship_individual_event_kind
    ), 0)
  FROM public.championship_individual_event_entries AS entries_table
  JOIN public.championship_individual_events AS events_table
    ON events_table.id = entries_table.event_id
  WHERE events_table.championship_id = _championship_id
    AND events_table.season_year = _season_year
    AND entries_table.status != 'CANCELLED'::public.championship_individual_entry_status
  GROUP BY
    events_table.championship_id,
    events_table.season_year,
    events_table.sport_id,
    events_table.naipe,
    events_table.division,
    entries_table.team_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_championship_individual_events_from_setup(
  _championship_id UUID,
  _season_year INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  payload_snapshot JSONB;
  upserted_events_count INTEGER := 0;
BEGIN
  payload_snapshot := public.get_championship_setup_payload_snapshot(_championship_id, _season_year);

  WITH selected_modalities AS (
    SELECT DISTINCT
      (modality_record.value->>'sport_id')::uuid AS sport_id,
      (modality_record.value->>'naipe')::public.match_naipe AS naipe,
      CASE
        WHEN NULLIF(modality_record.value->>'division', '') IS NULL THEN NULL
        ELSE (modality_record.value->>'division')::public.team_division
      END AS division
    FROM jsonb_array_elements(COALESCE(payload_snapshot->'participants', '[]'::jsonb)) AS participant_record(value)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(participant_record.value->'modalities', '[]'::jsonb)) AS modality_record(value)
  ),
  configured_individual_sports AS (
    SELECT
      selected_modalities.sport_id,
      selected_modalities.naipe,
      selected_modalities.division,
      sports_table.name AS sport_name,
      COALESCE(
        (
          SELECT (config_record.value->>'relay_multiplier')::numeric
          FROM jsonb_array_elements(COALESCE(payload_snapshot->'individual_event_configs', '[]'::jsonb)) AS config_record(value)
          WHERE (config_record.value->>'sport_id')::uuid = selected_modalities.sport_id
          LIMIT 1
        ),
        2
      ) AS relay_multiplier
    FROM selected_modalities
    JOIN public.sports AS sports_table
      ON sports_table.id = selected_modalities.sport_id
    WHERE public.resolve_normalized_sport_name(sports_table.name) IN ('atletismo', 'natacao')
  ),
  official_events AS (
    SELECT * FROM (
      VALUES
        ('atletismo', 'ATHLETICS_100M', '100m', 'INDIVIDUAL', 1),
        ('atletismo', 'ATHLETICS_400M', '400m', 'INDIVIDUAL', 2),
        ('atletismo', 'ATHLETICS_4X100', '4x100', 'RELAY', 3),
        ('atletismo', 'ATHLETICS_SHOT_PUT', 'Arremesso de peso', 'INDIVIDUAL', 4),
        ('atletismo', 'ATHLETICS_LONG_JUMP', 'Salto em distância', 'INDIVIDUAL', 5),
        ('natacao', 'SWIMMING_50_FREE', '50m livre', 'INDIVIDUAL', 1),
        ('natacao', 'SWIMMING_50_BACK', '50m costas', 'INDIVIDUAL', 2),
        ('natacao', 'SWIMMING_50_FLY', '50m borboleta', 'INDIVIDUAL', 3),
        ('natacao', 'SWIMMING_50_BREAST', '50m peito', 'INDIVIDUAL', 4),
        ('natacao', 'SWIMMING_4X50_FREE', '4x50 livre', 'RELAY', 5)
    ) AS rows(normalized_sport_name, event_code, event_name, event_kind, display_order)
  ),
  upserted_events AS (
    INSERT INTO public.championship_individual_events (
      championship_id,
      season_year,
      sport_id,
      naipe,
      division,
      event_code,
      name,
      kind,
      display_order,
      relay_multiplier
    )
    SELECT
      _championship_id,
      _season_year,
      configured_individual_sports.sport_id,
      configured_individual_sports.naipe,
      configured_individual_sports.division,
      official_events.event_code,
      official_events.event_name,
      official_events.event_kind::public.championship_individual_event_kind,
      official_events.display_order,
      CASE
        WHEN official_events.event_kind = 'RELAY' THEN configured_individual_sports.relay_multiplier
        ELSE 1
      END
    FROM configured_individual_sports
    JOIN official_events
      ON official_events.normalized_sport_name = public.resolve_normalized_sport_name(configured_individual_sports.sport_name)
    ON CONFLICT (
      championship_id,
      season_year,
      sport_id,
      naipe,
      division,
      event_code
    ) DO UPDATE
    SET
      name = EXCLUDED.name,
      kind = EXCLUDED.kind,
      display_order = EXCLUDED.display_order,
      relay_multiplier = EXCLUDED.relay_multiplier,
      updated_at = now()
    RETURNING id
  )
  SELECT COUNT(*)
  INTO upserted_events_count
  FROM upserted_events;

  PERFORM public.recalculate_championship_individual_standings(_championship_id, _season_year);

  RETURN upserted_events_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_championship_athlete(
  _championship_id UUID,
  _season_year INTEGER,
  _sport_id UUID,
  _team_id UUID,
  _naipe public.match_naipe,
  _division public.team_division,
  _name TEXT,
  _athlete_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  normalized_name TEXT;
  saved_athlete_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.teams AS teams_table
    WHERE teams_table.id = _team_id
      AND COALESCE(teams_table.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'Atlética inválida ou inativa.';
  END IF;

  normalized_name := NULLIF(trim(COALESCE(_name, '')), '');

  IF normalized_name IS NULL THEN
    RAISE EXCEPTION 'Informe o nome do atleta.';
  END IF;

  IF _athlete_id IS NULL THEN
    INSERT INTO public.championship_award_players (
      championship_id,
      season_year,
      sport_id,
      team_id,
      naipe,
      division,
      name,
      normalized_name
    ) VALUES (
      _championship_id,
      _season_year,
      _sport_id,
      _team_id,
      _naipe,
      _division,
      normalized_name,
      lower(normalized_name)
    )
    RETURNING id
    INTO saved_athlete_id;

    RETURN saved_athlete_id;
  END IF;

  UPDATE public.championship_award_players
  SET
    sport_id = _sport_id,
    team_id = _team_id,
    naipe = _naipe,
    division = _division,
    name = normalized_name,
    normalized_name = lower(normalized_name)
  WHERE id = _athlete_id
    AND championship_id = _championship_id
    AND season_year = _season_year
  RETURNING id
  INTO saved_athlete_id;

  IF saved_athlete_id IS NULL THEN
    RAISE EXCEPTION 'Atleta não encontrado.';
  END IF;

  RETURN saved_athlete_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_championship_athlete(
  _athlete_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.championship_individual_event_entries AS entries_table
    WHERE entries_table.athlete_id = _athlete_id
      AND entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status
  ) OR EXISTS (
    SELECT 1
    FROM public.championship_individual_event_entry_members AS members_table
    JOIN public.championship_individual_event_entries AS entries_table
      ON entries_table.id = members_table.entry_id
    WHERE members_table.athlete_id = _athlete_id
      AND entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status
  ) THEN
    RAISE EXCEPTION 'Este atleta possui resultado confirmado e não pode ser removido.';
  END IF;

  DELETE FROM public.championship_award_players
  WHERE id = _athlete_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_championship_individual_event(
  _event_id UUID,
  _scheduled_date DATE,
  _period public.championship_schedule_period,
  _location TEXT,
  _status public.championship_individual_event_status
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  current_event public.championship_individual_events%ROWTYPE;
  payload_snapshot JSONB;
  competition_key TEXT;
BEGIN
  SELECT *
  INTO current_event
  FROM public.championship_individual_events AS events_table
  WHERE events_table.id = _event_id
  LIMIT 1;

  IF current_event.id IS NULL THEN
    RAISE EXCEPTION 'Prova individual não encontrada.';
  END IF;

  IF _scheduled_date IS NOT NULL AND _period IS NOT NULL THEN
    payload_snapshot := public.get_championship_setup_payload_snapshot(current_event.championship_id, current_event.season_year);
    competition_key := public.resolve_championship_individual_competition_key(
      current_event.sport_id,
      current_event.naipe,
      current_event.division
    );

    IF NOT public.is_schedule_period_enabled_by_payload(payload_snapshot, _scheduled_date, _period) THEN
      RAISE EXCEPTION 'O período global selecionado não está habilitado na agenda do campeonato.';
    END IF;

    IF NOT public.is_competition_period_enabled_by_payload(payload_snapshot, competition_key, _scheduled_date, _period) THEN
      RAISE EXCEPTION 'A modalidade não está disponível para o dia/período selecionado.';
    END IF;
  END IF;

  UPDATE public.championship_individual_events
  SET
    scheduled_date = _scheduled_date,
    period = _period,
    location = NULLIF(trim(COALESCE(_location, '')), ''),
    status = COALESCE(_status, status)
  WHERE id = _event_id;

  RETURN _event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_championship_individual_event_entry(
  _event_id UUID,
  _team_id UUID,
  _athlete_id UUID DEFAULT NULL,
  _member_athlete_ids UUID[] DEFAULT ARRAY[]::UUID[],
  _starter_athlete_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  current_event public.championship_individual_events%ROWTYPE;
  payload_snapshot JSONB;
  competition_key TEXT;
  saved_entry_id UUID;
  current_athlete public.championship_award_players%ROWTYPE;
  current_member public.championship_award_players%ROWTYPE;
  member_athlete_id UUID;
BEGIN
  SELECT *
  INTO current_event
  FROM public.championship_individual_events AS events_table
  WHERE events_table.id = _event_id
  LIMIT 1;

  IF current_event.id IS NULL THEN
    RAISE EXCEPTION 'Prova individual não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.teams AS teams_table
    WHERE teams_table.id = _team_id
      AND COALESCE(teams_table.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'Atlética inválida ou inativa.';
  END IF;

  IF current_event.scheduled_date IS NOT NULL AND current_event.period IS NOT NULL THEN
    payload_snapshot := public.get_championship_setup_payload_snapshot(current_event.championship_id, current_event.season_year);
    competition_key := public.resolve_championship_individual_competition_key(
      current_event.sport_id,
      current_event.naipe,
      current_event.division
    );

    IF NOT public.is_team_competition_period_enabled_by_payload(
      payload_snapshot,
      _team_id,
      competition_key,
      current_event.scheduled_date,
      current_event.period
    ) THEN
      RAISE EXCEPTION 'A atlética não possui disponibilidade para jogar nesta prova no dia/período informado.';
    END IF;
  END IF;

  IF current_event.kind = 'INDIVIDUAL'::public.championship_individual_event_kind THEN
    IF _athlete_id IS NULL THEN
      RAISE EXCEPTION 'Selecione um atleta para a prova individual.';
    END IF;

    SELECT *
    INTO current_athlete
    FROM public.championship_award_players AS athletes_table
    WHERE athletes_table.id = _athlete_id
      AND athletes_table.championship_id = current_event.championship_id
      AND athletes_table.season_year = current_event.season_year
      AND athletes_table.sport_id = current_event.sport_id
      AND athletes_table.team_id = _team_id
      AND athletes_table.naipe = current_event.naipe
      AND athletes_table.division IS NOT DISTINCT FROM current_event.division
    LIMIT 1;

    IF current_athlete.id IS NULL THEN
      RAISE EXCEPTION 'Atleta inválido para o contexto da prova.';
    END IF;

    IF (
      SELECT COUNT(*)
      FROM public.championship_individual_event_entries AS entries_table
      WHERE entries_table.event_id = _event_id
        AND entries_table.team_id = _team_id
        AND entries_table.athlete_id IS NOT NULL
        AND entries_table.athlete_id != _athlete_id
        AND entries_table.status != 'CANCELLED'::public.championship_individual_entry_status
    ) >= 3 THEN
      RAISE EXCEPTION 'Cada atlética pode inscrever no máximo 3 atletas por prova individual.';
    END IF;

    INSERT INTO public.championship_individual_event_entries (
      event_id,
      team_id,
      athlete_id,
      athlete_name,
      entry_type,
      status
    ) VALUES (
      _event_id,
      _team_id,
      _athlete_id,
      current_athlete.name,
      'INDIVIDUAL'::public.championship_individual_event_kind,
      'PENDING'::public.championship_individual_entry_status
    )
    ON CONFLICT (event_id, athlete_id) DO UPDATE
    SET
      team_id = EXCLUDED.team_id,
      athlete_name = EXCLUDED.athlete_name,
      updated_at = now()
    RETURNING id
    INTO saved_entry_id;

    PERFORM public.recalculate_championship_individual_standings(current_event.championship_id, current_event.season_year);
    RETURN saved_entry_id;
  END IF;

  IF cardinality(_member_athlete_ids) > 6 THEN
    RAISE EXCEPTION 'O revezamento permite no máximo 6 atletas inscritos.';
  END IF;

  IF cardinality(_starter_athlete_ids) > 4 THEN
    RAISE EXCEPTION 'O revezamento permite no máximo 4 titulares.';
  END IF;

  INSERT INTO public.championship_individual_event_entries (
    event_id,
    team_id,
    athlete_id,
    athlete_name,
    entry_type,
    status
  ) VALUES (
    _event_id,
    _team_id,
    NULL,
    NULL,
    'RELAY'::public.championship_individual_event_kind,
    'PENDING'::public.championship_individual_entry_status
  )
  ON CONFLICT (event_id, team_id) WHERE athlete_id IS NULL DO UPDATE
  SET updated_at = now()
  RETURNING id
  INTO saved_entry_id;

  DELETE FROM public.championship_individual_event_entry_members
  WHERE entry_id = saved_entry_id;

  FOREACH member_athlete_id IN ARRAY COALESCE(_member_athlete_ids, ARRAY[]::UUID[])
  LOOP
    SELECT *
    INTO current_member
    FROM public.championship_award_players AS athletes_table
    WHERE athletes_table.id = member_athlete_id
      AND athletes_table.championship_id = current_event.championship_id
      AND athletes_table.season_year = current_event.season_year
      AND athletes_table.sport_id = current_event.sport_id
      AND athletes_table.team_id = _team_id
      AND athletes_table.naipe = current_event.naipe
      AND athletes_table.division IS NOT DISTINCT FROM current_event.division
    LIMIT 1;

    IF current_member.id IS NULL THEN
      RAISE EXCEPTION 'Há atleta inválido na inscrição do revezamento.';
    END IF;

    INSERT INTO public.championship_individual_event_entry_members (
      entry_id,
      athlete_id,
      athlete_name,
      is_starter,
      position
    ) VALUES (
      saved_entry_id,
      current_member.id,
      current_member.name,
      current_member.id = ANY(COALESCE(_starter_athlete_ids, ARRAY[]::UUID[])),
      COALESCE(
        array_position(COALESCE(_member_athlete_ids, ARRAY[]::UUID[]), current_member.id),
        1
      )
    );
  END LOOP;

  PERFORM public.recalculate_championship_individual_standings(current_event.championship_id, current_event.season_year);
  RETURN saved_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_championship_individual_event_entry(
  _entry_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  current_event public.championship_individual_events%ROWTYPE;
BEGIN
  SELECT events_table.*
  INTO current_event
  FROM public.championship_individual_event_entries AS entries_table
  JOIN public.championship_individual_events AS events_table
    ON events_table.id = entries_table.event_id
  WHERE entries_table.id = _entry_id
  LIMIT 1;

  DELETE FROM public.championship_individual_event_entries
  WHERE id = _entry_id;

  IF current_event.id IS NOT NULL THEN
    PERFORM public.recalculate_championship_individual_standings(current_event.championship_id, current_event.season_year);
  END IF;
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
  confirmed_team_count INTEGER;
BEGIN
  SELECT *
  INTO current_event
  FROM public.championship_individual_events AS events_table
  WHERE events_table.id = _event_id
  LIMIT 1;

  IF current_event.id IS NULL THEN
    RAISE EXCEPTION 'Prova individual não encontrada.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(_results, '[]'::jsonb)) AS result_row(
      entry_id UUID,
      status public.championship_individual_entry_status,
      final_position INTEGER
    )
    GROUP BY result_row.final_position
    HAVING result_row.final_position IS NOT NULL AND COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cada colocação pode ser usada apenas uma vez por prova.';
  END IF;

  IF current_event.kind = 'RELAY'::public.championship_individual_event_kind AND EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(_results, '[]'::jsonb)) AS result_row(
      entry_id UUID,
      status public.championship_individual_entry_status,
      final_position INTEGER
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

  UPDATE public.championship_individual_event_entries
  SET
    final_position = NULL,
    status = CASE
      WHEN status = 'DSQ_OVER_LIMIT'::public.championship_individual_entry_status THEN status
      ELSE 'PENDING'::public.championship_individual_entry_status
    END
  WHERE event_id = _event_id;

  UPDATE public.championship_individual_event_entries AS entries_table
  SET
    final_position = CASE
      WHEN entries_table.status = 'DSQ_OVER_LIMIT'::public.championship_individual_entry_status THEN NULL
      ELSE result_row.final_position
    END,
    status = CASE
      WHEN entries_table.status = 'DSQ_OVER_LIMIT'::public.championship_individual_entry_status THEN entries_table.status
      ELSE result_row.status
    END
  FROM jsonb_to_recordset(COALESCE(_results, '[]'::jsonb)) AS result_row(
    entry_id UUID,
    status public.championship_individual_entry_status,
    final_position INTEGER
  )
  WHERE entries_table.id = result_row.entry_id
    AND entries_table.event_id = _event_id;

  IF current_event.kind = 'INDIVIDUAL'::public.championship_individual_event_kind
    AND public.resolve_normalized_sport_name((
      SELECT sports_table.name
      FROM public.sports AS sports_table
      WHERE sports_table.id = current_event.sport_id
      LIMIT 1
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

  UPDATE public.championship_individual_events
  SET status = CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.championship_individual_event_entries AS entries_table
      WHERE entries_table.event_id = _event_id
        AND entries_table.status IN (
          'CONFIRMED'::public.championship_individual_entry_status,
          'DNS'::public.championship_individual_entry_status,
          'DSQ'::public.championship_individual_entry_status,
          'DSQ_OVER_LIMIT'::public.championship_individual_entry_status
        )
    ) THEN 'FINISHED'::public.championship_individual_event_status
    ELSE status
  END
  WHERE id = _event_id;

  PERFORM public.recalculate_championship_individual_standings(current_event.championship_id, current_event.season_year);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_championship_effective_standings(
  _championship_id UUID DEFAULT NULL,
  _season_year INTEGER DEFAULT NULL,
  _division_filter TEXT DEFAULT NULL,
  _naipe public.match_naipe DEFAULT NULL,
  _sport_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  championship_id UUID,
  season_year INTEGER,
  division public.team_division,
  naipe public.match_naipe,
  sport_id UUID,
  team_id UUID,
  played INTEGER,
  wins INTEGER,
  draws INTEGER,
  losses INTEGER,
  goals_for INTEGER,
  goals_against INTEGER,
  goal_diff INTEGER,
  points NUMERIC,
  yellow_cards INTEGER,
  red_cards INTEGER,
  updated_at TIMESTAMPTZ,
  is_individual_sport BOOLEAN,
  scored_events_count INTEGER,
  first_places INTEGER,
  second_places INTEGER,
  third_places INTEGER,
  fourth_places INTEGER,
  fifth_places INTEGER,
  sixth_places INTEGER,
  seventh_places INTEGER,
  eighth_places INTEGER,
  ninth_places INTEGER,
  tenth_places INTEGER,
  eleventh_places INTEGER,
  twelfth_places INTEGER,
  thirteenth_places INTEGER,
  fourteenth_places INTEGER,
  fifteenth_places INTEGER,
  sixteenth_places INTEGER,
  seventeenth_places INTEGER,
  eighteenth_places INTEGER,
  nineteenth_places INTEGER,
  twentieth_places INTEGER,
  relay_points_total NUMERIC,
  team_name TEXT,
  team_city TEXT,
  sport_name TEXT
)
LANGUAGE sql
STABLE
AS $$
  WITH collective_standings AS (
    SELECT
      standings_table.id,
      standings_table.championship_id,
      standings_table.season_year,
      standings_table.division,
      standings_table.naipe,
      standings_table.sport_id,
      standings_table.team_id,
      standings_table.played,
      standings_table.wins,
      standings_table.draws,
      standings_table.losses,
      standings_table.goals_for,
      standings_table.goals_against,
      standings_table.goal_diff,
      standings_table.points::numeric AS points,
      standings_table.yellow_cards,
      standings_table.red_cards,
      standings_table.updated_at,
      false AS is_individual_sport,
      0 AS scored_events_count,
      0 AS first_places,
      0 AS second_places,
      0 AS third_places,
      0 AS fourth_places,
      0 AS fifth_places,
      0 AS sixth_places,
      0 AS seventh_places,
      0 AS eighth_places,
      0 AS ninth_places,
      0 AS tenth_places,
      0 AS eleventh_places,
      0 AS twelfth_places,
      0 AS thirteenth_places,
      0 AS fourteenth_places,
      0 AS fifteenth_places,
      0 AS sixteenth_places,
      0 AS seventeenth_places,
      0 AS eighteenth_places,
      0 AS nineteenth_places,
      0 AS twentieth_places,
      0::numeric AS relay_points_total
    FROM public.standings AS standings_table
    WHERE (_championship_id IS NULL OR standings_table.championship_id = _championship_id)
      AND (_season_year IS NULL OR standings_table.season_year = _season_year)
      AND (_sport_id IS NULL OR standings_table.sport_id = _sport_id)
      AND (_naipe IS NULL OR standings_table.naipe = _naipe)
      AND (
        _division_filter IS NULL
        OR (_division_filter = 'WITHOUT_DIVISION' AND standings_table.division IS NULL)
        OR (_division_filter NOT IN ('WITHOUT_DIVISION') AND standings_table.division::text = _division_filter)
      )
  ),
  individual_standings AS (
    SELECT
      standings_table.id,
      standings_table.championship_id,
      standings_table.season_year,
      standings_table.division,
      standings_table.naipe,
      standings_table.sport_id,
      standings_table.team_id,
      standings_table.scored_events_count AS played,
      standings_table.first_places AS wins,
      standings_table.second_places AS draws,
      0 AS losses,
      0 AS goals_for,
      0 AS goals_against,
      0 AS goal_diff,
      standings_table.total_points AS points,
      0 AS yellow_cards,
      0 AS red_cards,
      standings_table.updated_at,
      true AS is_individual_sport,
      standings_table.scored_events_count,
      standings_table.first_places,
      standings_table.second_places,
      standings_table.third_places,
      standings_table.fourth_places,
      standings_table.fifth_places,
      standings_table.sixth_places,
      standings_table.seventh_places,
      standings_table.eighth_places,
      standings_table.ninth_places,
      standings_table.tenth_places,
      standings_table.eleventh_places,
      standings_table.twelfth_places,
      standings_table.thirteenth_places,
      standings_table.fourteenth_places,
      standings_table.fifteenth_places,
      standings_table.sixteenth_places,
      standings_table.seventeenth_places,
      standings_table.eighteenth_places,
      standings_table.nineteenth_places,
      standings_table.twentieth_places,
      standings_table.relay_points_total
    FROM public.championship_individual_team_standings AS standings_table
    WHERE (_championship_id IS NULL OR standings_table.championship_id = _championship_id)
      AND (_season_year IS NULL OR standings_table.season_year = _season_year)
      AND (_sport_id IS NULL OR standings_table.sport_id = _sport_id)
      AND (_naipe IS NULL OR standings_table.naipe = _naipe)
      AND (
        _division_filter IS NULL
        OR (_division_filter = 'WITHOUT_DIVISION' AND standings_table.division IS NULL)
        OR (_division_filter NOT IN ('WITHOUT_DIVISION') AND standings_table.division::text = _division_filter)
      )
  ),
  effective_standings AS (
    SELECT * FROM collective_standings
    UNION ALL
    SELECT * FROM individual_standings
  )
  SELECT
    effective_standings.id,
    effective_standings.championship_id,
    effective_standings.season_year,
    effective_standings.division,
    effective_standings.naipe,
    effective_standings.sport_id,
    effective_standings.team_id,
    effective_standings.played,
    effective_standings.wins,
    effective_standings.draws,
    effective_standings.losses,
    effective_standings.goals_for,
    effective_standings.goals_against,
    effective_standings.goal_diff,
    effective_standings.points,
    effective_standings.yellow_cards,
    effective_standings.red_cards,
    effective_standings.updated_at,
    effective_standings.is_individual_sport,
    effective_standings.scored_events_count,
    effective_standings.first_places,
    effective_standings.second_places,
    effective_standings.third_places,
    effective_standings.fourth_places,
    effective_standings.fifth_places,
    effective_standings.sixth_places,
    effective_standings.seventh_places,
    effective_standings.eighth_places,
    effective_standings.ninth_places,
    effective_standings.tenth_places,
    effective_standings.eleventh_places,
    effective_standings.twelfth_places,
    effective_standings.thirteenth_places,
    effective_standings.fourteenth_places,
    effective_standings.fifteenth_places,
    effective_standings.sixteenth_places,
    effective_standings.seventeenth_places,
    effective_standings.eighteenth_places,
    effective_standings.nineteenth_places,
    effective_standings.twentieth_places,
    effective_standings.relay_points_total,
    teams_table.name AS team_name,
    teams_table.city AS team_city,
    sports_table.name AS sport_name
  FROM effective_standings
  JOIN public.teams AS teams_table
    ON teams_table.id = effective_standings.team_id
  JOIN public.sports AS sports_table
    ON sports_table.id = effective_standings.sport_id
  ORDER BY
    effective_standings.points DESC,
    effective_standings.first_places DESC,
    effective_standings.second_places DESC,
    effective_standings.third_places DESC,
    effective_standings.fourth_places DESC,
    effective_standings.fifth_places DESC,
    effective_standings.sixth_places DESC,
    effective_standings.seventh_places DESC,
    effective_standings.eighth_places DESC,
    effective_standings.ninth_places DESC,
    effective_standings.tenth_places DESC,
    effective_standings.goal_diff DESC,
    effective_standings.goals_for DESC,
    teams_table.name ASC;
$$;

DROP FUNCTION IF EXISTS public.get_current_user_admin_context();
CREATE OR REPLACE FUNCTION public.get_current_user_admin_context()
RETURNS TABLE (
  role                             public.app_role,
  profile_id                       UUID,
  profile_name                     TEXT,
  matches_permission               public.admin_panel_permission_level,
  control_permission               public.admin_panel_permission_level,
  teams_permission                 public.admin_panel_permission_level,
  sports_permission                public.admin_panel_permission_level,
  events_permission                public.admin_panel_permission_level,
  links_permission                 public.admin_panel_permission_level,
  logs_permission                  public.admin_panel_permission_level,
  users_permission                 public.admin_panel_permission_level,
  account_permission               public.admin_panel_permission_level,
  championship_status_permission   public.admin_panel_permission_level,
  settings_permission              public.admin_panel_permission_level,
  score_sheet_review_permission    public.admin_panel_permission_level,
  tie_breaks_permission            public.admin_panel_permission_level,
  standings_permission             public.admin_panel_permission_level,
  championship_schedule_permission public.admin_panel_permission_level,
  individual_events_permission     public.admin_panel_permission_level
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
  current_profile_id UUID;
  current_profile_name TEXT;
  current_profile_role public.app_role;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    admin_user_profiles_table.profile_id,
    admin_profiles_table.name,
    admin_profiles_table.system_role
  INTO
    current_profile_id,
    current_profile_name,
    current_profile_role
  FROM public.admin_user_profiles AS admin_user_profiles_table
  JOIN public.admin_profiles AS admin_profiles_table
    ON admin_profiles_table.id = admin_user_profiles_table.profile_id
  WHERE admin_user_profiles_table.user_id = current_user_id
  LIMIT 1;

  RETURN QUERY
  SELECT
    current_profile_role,
    current_profile_id,
    current_profile_name,
    public.resolve_current_user_tab_permission_level('matches'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('control'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('teams'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('sports'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('events'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('links'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('logs'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('users'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('account'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('championship_status'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('settings'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('score_sheet_review'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('tie_breaks'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('standings'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('championship_schedule'::public.admin_panel_tab),
    public.resolve_current_user_tab_permission_level('individual_events'::public.admin_panel_tab);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_admin_profiles()
RETURNS TABLE (
  profile_id UUID,
  profile_name TEXT,
  is_system BOOLEAN,
  permissions JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_admin_tab_access('users'::public.admin_panel_tab, false) THEN
    RAISE EXCEPTION 'Sem permissão para listar perfis administrativos.';
  END IF;

  RETURN QUERY
  SELECT
    admin_profiles_table.id AS profile_id,
    admin_profiles_table.name AS profile_name,
    admin_profiles_table.is_system,
    jsonb_build_object(
      'matches', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'matches'::public.admin_panel_tab), 'NONE'),
      'score_sheet_review', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'score_sheet_review'::public.admin_panel_tab), 'NONE'),
      'tie_breaks', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'tie_breaks'::public.admin_panel_tab), 'NONE'),
      'control', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'control'::public.admin_panel_tab), 'NONE'),
      'standings', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'standings'::public.admin_panel_tab), 'NONE'),
      'teams', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'teams'::public.admin_panel_tab), 'NONE'),
      'sports', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'sports'::public.admin_panel_tab), 'NONE'),
      'events', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'events'::public.admin_panel_tab), 'NONE'),
      'individual_events', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'individual_events'::public.admin_panel_tab), 'NONE'),
      'links', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'links'::public.admin_panel_tab), 'NONE'),
      'logs', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'logs'::public.admin_panel_tab), 'NONE'),
      'users', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'users'::public.admin_panel_tab), 'NONE'),
      'account', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'account'::public.admin_panel_tab), 'NONE'),
      'championship_status', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'championship_status'::public.admin_panel_tab), 'NONE'),
      'championship_schedule', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'championship_schedule'::public.admin_panel_tab), 'NONE'),
      'settings', COALESCE((SELECT p.access_level::text FROM public.admin_profile_permissions AS p WHERE p.profile_id = admin_profiles_table.id AND p.admin_tab = 'settings'::public.admin_panel_tab), 'NONE')
    ) AS permissions,
    admin_profiles_table.created_at,
    admin_profiles_table.updated_at
  FROM public.admin_profiles AS admin_profiles_table
  ORDER BY admin_profiles_table.is_system DESC, admin_profiles_table.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_championship_individual_events_from_setup(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_championship_athlete(UUID, INTEGER, UUID, UUID, public.match_naipe, public.team_division, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_championship_athlete(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_championship_individual_event(UUID, DATE, public.championship_schedule_period, TEXT, public.championship_individual_event_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_championship_individual_event_entry(UUID, UUID, UUID, UUID[], UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_championship_individual_event_entry(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_championship_individual_event_results(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_championship_effective_standings(UUID, INTEGER, TEXT, public.match_naipe, UUID) TO anon, authenticated;
