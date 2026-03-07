DO $migration$
DECLARE
  existing_constraint_name TEXT;
BEGIN
  IF to_regclass('public.championship_bracket_team_registrations') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraints_table
      WHERE constraints_table.conrelid = 'public.championship_bracket_team_registrations'::regclass
        AND constraints_table.contype = 'u'
        AND constraints_table.conname = 'championship_bracket_team_registrations_upsert_unique'
    ) THEN
      SELECT constraints_table.conname
      INTO existing_constraint_name
      FROM pg_constraint AS constraints_table
      WHERE constraints_table.conrelid = 'public.championship_bracket_team_registrations'::regclass
        AND constraints_table.contype = 'u'
        AND constraints_table.conkey = ARRAY[
          (SELECT attributes_table.attnum FROM pg_attribute AS attributes_table WHERE attributes_table.attrelid = 'public.championship_bracket_team_registrations'::regclass AND attributes_table.attname = 'bracket_edition_id' AND NOT attributes_table.attisdropped),
          (SELECT attributes_table.attnum FROM pg_attribute AS attributes_table WHERE attributes_table.attrelid = 'public.championship_bracket_team_registrations'::regclass AND attributes_table.attname = 'team_id' AND NOT attributes_table.attisdropped)
        ]::int2[]
      LIMIT 1;

      IF existing_constraint_name IS NOT NULL THEN
        EXECUTE format(
          'ALTER TABLE public.championship_bracket_team_registrations RENAME CONSTRAINT %I TO championship_bracket_team_registrations_upsert_unique',
          existing_constraint_name
        );
      ELSE
        ALTER TABLE public.championship_bracket_team_registrations
          ADD CONSTRAINT championship_bracket_team_registrations_upsert_unique
          UNIQUE (bracket_edition_id, team_id);
      END IF;
    END IF;
  END IF;

  IF to_regclass('public.championship_bracket_team_modalities') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraints_table
      WHERE constraints_table.conrelid = 'public.championship_bracket_team_modalities'::regclass
        AND constraints_table.contype = 'u'
        AND constraints_table.conname = 'championship_bracket_team_modalities_upsert_unique'
    ) THEN
      SELECT constraints_table.conname
      INTO existing_constraint_name
      FROM pg_constraint AS constraints_table
      WHERE constraints_table.conrelid = 'public.championship_bracket_team_modalities'::regclass
        AND constraints_table.contype = 'u'
        AND constraints_table.conkey = ARRAY[
          (SELECT attributes_table.attnum FROM pg_attribute AS attributes_table WHERE attributes_table.attrelid = 'public.championship_bracket_team_modalities'::regclass AND attributes_table.attname = 'bracket_edition_id' AND NOT attributes_table.attisdropped),
          (SELECT attributes_table.attnum FROM pg_attribute AS attributes_table WHERE attributes_table.attrelid = 'public.championship_bracket_team_modalities'::regclass AND attributes_table.attname = 'team_id' AND NOT attributes_table.attisdropped),
          (SELECT attributes_table.attnum FROM pg_attribute AS attributes_table WHERE attributes_table.attrelid = 'public.championship_bracket_team_modalities'::regclass AND attributes_table.attname = 'sport_id' AND NOT attributes_table.attisdropped),
          (SELECT attributes_table.attnum FROM pg_attribute AS attributes_table WHERE attributes_table.attrelid = 'public.championship_bracket_team_modalities'::regclass AND attributes_table.attname = 'naipe' AND NOT attributes_table.attisdropped),
          (SELECT attributes_table.attnum FROM pg_attribute AS attributes_table WHERE attributes_table.attrelid = 'public.championship_bracket_team_modalities'::regclass AND attributes_table.attname = 'division' AND NOT attributes_table.attisdropped)
        ]::int2[]
      LIMIT 1;

      IF existing_constraint_name IS NOT NULL THEN
        EXECUTE format(
          'ALTER TABLE public.championship_bracket_team_modalities RENAME CONSTRAINT %I TO championship_bracket_team_modalities_upsert_unique',
          existing_constraint_name
        );
      ELSE
        ALTER TABLE public.championship_bracket_team_modalities
          ADD CONSTRAINT championship_bracket_team_modalities_upsert_unique
          UNIQUE (bracket_edition_id, team_id, sport_id, naipe, division);
      END IF;
    END IF;
  END IF;

  IF to_regclass('public.championship_bracket_competitions') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraints_table
      WHERE constraints_table.conrelid = 'public.championship_bracket_competitions'::regclass
        AND constraints_table.contype = 'u'
        AND constraints_table.conname = 'championship_bracket_competitions_upsert_unique'
    ) THEN
      SELECT constraints_table.conname
      INTO existing_constraint_name
      FROM pg_constraint AS constraints_table
      WHERE constraints_table.conrelid = 'public.championship_bracket_competitions'::regclass
        AND constraints_table.contype = 'u'
        AND constraints_table.conkey = ARRAY[
          (SELECT attributes_table.attnum FROM pg_attribute AS attributes_table WHERE attributes_table.attrelid = 'public.championship_bracket_competitions'::regclass AND attributes_table.attname = 'bracket_edition_id' AND NOT attributes_table.attisdropped),
          (SELECT attributes_table.attnum FROM pg_attribute AS attributes_table WHERE attributes_table.attrelid = 'public.championship_bracket_competitions'::regclass AND attributes_table.attname = 'sport_id' AND NOT attributes_table.attisdropped),
          (SELECT attributes_table.attnum FROM pg_attribute AS attributes_table WHERE attributes_table.attrelid = 'public.championship_bracket_competitions'::regclass AND attributes_table.attname = 'naipe' AND NOT attributes_table.attisdropped),
          (SELECT attributes_table.attnum FROM pg_attribute AS attributes_table WHERE attributes_table.attrelid = 'public.championship_bracket_competitions'::regclass AND attributes_table.attname = 'division' AND NOT attributes_table.attisdropped)
        ]::int2[]
      LIMIT 1;

      IF existing_constraint_name IS NOT NULL THEN
        EXECUTE format(
          'ALTER TABLE public.championship_bracket_competitions RENAME CONSTRAINT %I TO championship_bracket_competitions_upsert_unique',
          existing_constraint_name
        );
      ELSE
        ALTER TABLE public.championship_bracket_competitions
          ADD CONSTRAINT championship_bracket_competitions_upsert_unique
          UNIQUE (bracket_edition_id, sport_id, naipe, division);
      END IF;
    END IF;
  END IF;

  IF to_regclass('public.championship_bracket_groups') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraints_table
      WHERE constraints_table.conrelid = 'public.championship_bracket_groups'::regclass
        AND constraints_table.contype = 'u'
        AND constraints_table.conname = 'championship_bracket_groups_upsert_unique'
    ) THEN
      SELECT constraints_table.conname
      INTO existing_constraint_name
      FROM pg_constraint AS constraints_table
      WHERE constraints_table.conrelid = 'public.championship_bracket_groups'::regclass
        AND constraints_table.contype = 'u'
        AND constraints_table.conkey = ARRAY[
          (SELECT attributes_table.attnum FROM pg_attribute AS attributes_table WHERE attributes_table.attrelid = 'public.championship_bracket_groups'::regclass AND attributes_table.attname = 'competition_id' AND NOT attributes_table.attisdropped),
          (SELECT attributes_table.attnum FROM pg_attribute AS attributes_table WHERE attributes_table.attrelid = 'public.championship_bracket_groups'::regclass AND attributes_table.attname = 'group_number' AND NOT attributes_table.attisdropped)
        ]::int2[]
      LIMIT 1;

      IF existing_constraint_name IS NOT NULL THEN
        EXECUTE format(
          'ALTER TABLE public.championship_bracket_groups RENAME CONSTRAINT %I TO championship_bracket_groups_upsert_unique',
          existing_constraint_name
        );
      ELSE
        ALTER TABLE public.championship_bracket_groups
          ADD CONSTRAINT championship_bracket_groups_upsert_unique
          UNIQUE (competition_id, group_number);
      END IF;
    END IF;
  END IF;

  IF to_regclass('public.championship_bracket_group_teams') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraints_table
      WHERE constraints_table.conrelid = 'public.championship_bracket_group_teams'::regclass
        AND constraints_table.contype = 'u'
        AND constraints_table.conname = 'championship_bracket_group_teams_upsert_unique'
    ) THEN
      SELECT constraints_table.conname
      INTO existing_constraint_name
      FROM pg_constraint AS constraints_table
      WHERE constraints_table.conrelid = 'public.championship_bracket_group_teams'::regclass
        AND constraints_table.contype = 'u'
        AND constraints_table.conkey = ARRAY[
          (SELECT attributes_table.attnum FROM pg_attribute AS attributes_table WHERE attributes_table.attrelid = 'public.championship_bracket_group_teams'::regclass AND attributes_table.attname = 'group_id' AND NOT attributes_table.attisdropped),
          (SELECT attributes_table.attnum FROM pg_attribute AS attributes_table WHERE attributes_table.attrelid = 'public.championship_bracket_group_teams'::regclass AND attributes_table.attname = 'team_id' AND NOT attributes_table.attisdropped)
        ]::int2[]
      LIMIT 1;

      IF existing_constraint_name IS NOT NULL THEN
        EXECUTE format(
          'ALTER TABLE public.championship_bracket_group_teams RENAME CONSTRAINT %I TO championship_bracket_group_teams_upsert_unique',
          existing_constraint_name
        );
      ELSE
        ALTER TABLE public.championship_bracket_group_teams
          ADD CONSTRAINT championship_bracket_group_teams_upsert_unique
          UNIQUE (group_id, team_id);
      END IF;
    END IF;
  END IF;

  IF to_regclass('public.championship_bracket_days') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraints_table
      WHERE constraints_table.conrelid = 'public.championship_bracket_days'::regclass
        AND constraints_table.contype = 'u'
        AND constraints_table.conname = 'championship_bracket_days_upsert_unique'
    ) THEN
      SELECT constraints_table.conname
      INTO existing_constraint_name
      FROM pg_constraint AS constraints_table
      WHERE constraints_table.conrelid = 'public.championship_bracket_days'::regclass
        AND constraints_table.contype = 'u'
        AND constraints_table.conkey = ARRAY[
          (SELECT attributes_table.attnum FROM pg_attribute AS attributes_table WHERE attributes_table.attrelid = 'public.championship_bracket_days'::regclass AND attributes_table.attname = 'bracket_edition_id' AND NOT attributes_table.attisdropped),
          (SELECT attributes_table.attnum FROM pg_attribute AS attributes_table WHERE attributes_table.attrelid = 'public.championship_bracket_days'::regclass AND attributes_table.attname = 'event_date' AND NOT attributes_table.attisdropped)
        ]::int2[]
      LIMIT 1;

      IF existing_constraint_name IS NOT NULL THEN
        EXECUTE format(
          'ALTER TABLE public.championship_bracket_days RENAME CONSTRAINT %I TO championship_bracket_days_upsert_unique',
          existing_constraint_name
        );
      ELSE
        ALTER TABLE public.championship_bracket_days
          ADD CONSTRAINT championship_bracket_days_upsert_unique
          UNIQUE (bracket_edition_id, event_date);
      END IF;
    END IF;
  END IF;

  IF to_regclass('public.championship_bracket_locations') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraints_table
      WHERE constraints_table.conrelid = 'public.championship_bracket_locations'::regclass
        AND constraints_table.contype = 'u'
        AND constraints_table.conname = 'championship_bracket_locations_upsert_unique'
    ) THEN
      SELECT constraints_table.conname
      INTO existing_constraint_name
      FROM pg_constraint AS constraints_table
      WHERE constraints_table.conrelid = 'public.championship_bracket_locations'::regclass
        AND constraints_table.contype = 'u'
        AND constraints_table.conkey = ARRAY[
          (SELECT attributes_table.attnum FROM pg_attribute AS attributes_table WHERE attributes_table.attrelid = 'public.championship_bracket_locations'::regclass AND attributes_table.attname = 'bracket_day_id' AND NOT attributes_table.attisdropped),
          (SELECT attributes_table.attnum FROM pg_attribute AS attributes_table WHERE attributes_table.attrelid = 'public.championship_bracket_locations'::regclass AND attributes_table.attname = 'name' AND NOT attributes_table.attisdropped)
        ]::int2[]
      LIMIT 1;

      IF existing_constraint_name IS NOT NULL THEN
        EXECUTE format(
          'ALTER TABLE public.championship_bracket_locations RENAME CONSTRAINT %I TO championship_bracket_locations_upsert_unique',
          existing_constraint_name
        );
      ELSE
        ALTER TABLE public.championship_bracket_locations
          ADD CONSTRAINT championship_bracket_locations_upsert_unique
          UNIQUE (bracket_day_id, name);
      END IF;
    END IF;
  END IF;

  IF to_regclass('public.championship_bracket_courts') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraints_table
      WHERE constraints_table.conrelid = 'public.championship_bracket_courts'::regclass
        AND constraints_table.contype = 'u'
        AND constraints_table.conname = 'championship_bracket_courts_upsert_unique'
    ) THEN
      SELECT constraints_table.conname
      INTO existing_constraint_name
      FROM pg_constraint AS constraints_table
      WHERE constraints_table.conrelid = 'public.championship_bracket_courts'::regclass
        AND constraints_table.contype = 'u'
        AND constraints_table.conkey = ARRAY[
          (SELECT attributes_table.attnum FROM pg_attribute AS attributes_table WHERE attributes_table.attrelid = 'public.championship_bracket_courts'::regclass AND attributes_table.attname = 'bracket_location_id' AND NOT attributes_table.attisdropped),
          (SELECT attributes_table.attnum FROM pg_attribute AS attributes_table WHERE attributes_table.attrelid = 'public.championship_bracket_courts'::regclass AND attributes_table.attname = 'name' AND NOT attributes_table.attisdropped)
        ]::int2[]
      LIMIT 1;

      IF existing_constraint_name IS NOT NULL THEN
        EXECUTE format(
          'ALTER TABLE public.championship_bracket_courts RENAME CONSTRAINT %I TO championship_bracket_courts_upsert_unique',
          existing_constraint_name
        );
      ELSE
        ALTER TABLE public.championship_bracket_courts
          ADD CONSTRAINT championship_bracket_courts_upsert_unique
          UNIQUE (bracket_location_id, name);
      END IF;
    END IF;
  END IF;

  IF to_regclass('public.championship_bracket_court_sports') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraints_table
      WHERE constraints_table.conrelid = 'public.championship_bracket_court_sports'::regclass
        AND constraints_table.contype = 'u'
        AND constraints_table.conname = 'championship_bracket_court_sports_upsert_unique'
    ) THEN
      SELECT constraints_table.conname
      INTO existing_constraint_name
      FROM pg_constraint AS constraints_table
      WHERE constraints_table.conrelid = 'public.championship_bracket_court_sports'::regclass
        AND constraints_table.contype = 'u'
        AND constraints_table.conkey = ARRAY[
          (SELECT attributes_table.attnum FROM pg_attribute AS attributes_table WHERE attributes_table.attrelid = 'public.championship_bracket_court_sports'::regclass AND attributes_table.attname = 'bracket_court_id' AND NOT attributes_table.attisdropped),
          (SELECT attributes_table.attnum FROM pg_attribute AS attributes_table WHERE attributes_table.attrelid = 'public.championship_bracket_court_sports'::regclass AND attributes_table.attname = 'sport_id' AND NOT attributes_table.attisdropped)
        ]::int2[]
      LIMIT 1;

      IF existing_constraint_name IS NOT NULL THEN
        EXECUTE format(
          'ALTER TABLE public.championship_bracket_court_sports RENAME CONSTRAINT %I TO championship_bracket_court_sports_upsert_unique',
          existing_constraint_name
        );
      ELSE
        ALTER TABLE public.championship_bracket_court_sports
          ADD CONSTRAINT championship_bracket_court_sports_upsert_unique
          UNIQUE (bracket_court_id, sport_id);
      END IF;
    END IF;
  END IF;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
