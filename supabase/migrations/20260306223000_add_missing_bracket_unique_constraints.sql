DO $migration$
BEGIN
  IF to_regclass('public.championship_bracket_team_registrations') IS NOT NULL THEN
    DELETE FROM public.championship_bracket_team_registrations AS registrations_table
    USING (
      SELECT
        id,
        row_number() OVER (
          PARTITION BY bracket_edition_id, team_id
          ORDER BY created_at ASC, id ASC
        ) AS row_number
      FROM public.championship_bracket_team_registrations
    ) AS duplicated_rows
    WHERE registrations_table.id = duplicated_rows.id
      AND duplicated_rows.row_number > 1;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.championship_bracket_team_registrations'::regclass
        AND contype = 'u'
        AND pg_get_constraintdef(oid) LIKE 'UNIQUE (bracket_edition_id, team_id)%'
    ) THEN
      ALTER TABLE public.championship_bracket_team_registrations
        ADD CONSTRAINT championship_bracket_team_registrations_upsert_unique
        UNIQUE (bracket_edition_id, team_id);
    END IF;
  END IF;

  IF to_regclass('public.championship_bracket_team_modalities') IS NOT NULL THEN
    DELETE FROM public.championship_bracket_team_modalities AS modalities_table
    USING (
      SELECT
        id,
        row_number() OVER (
          PARTITION BY bracket_edition_id, team_id, sport_id, naipe, division
          ORDER BY created_at ASC, id ASC
        ) AS row_number
      FROM public.championship_bracket_team_modalities
    ) AS duplicated_rows
    WHERE modalities_table.id = duplicated_rows.id
      AND duplicated_rows.row_number > 1;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.championship_bracket_team_modalities'::regclass
        AND contype = 'u'
        AND pg_get_constraintdef(oid) LIKE 'UNIQUE (bracket_edition_id, team_id, sport_id, naipe, division)%'
    ) THEN
      ALTER TABLE public.championship_bracket_team_modalities
        ADD CONSTRAINT championship_bracket_team_modalities_upsert_unique
        UNIQUE (bracket_edition_id, team_id, sport_id, naipe, division);
    END IF;
  END IF;

  IF to_regclass('public.championship_bracket_competitions') IS NOT NULL THEN
    DELETE FROM public.championship_bracket_competitions AS competitions_table
    USING (
      SELECT
        id,
        row_number() OVER (
          PARTITION BY bracket_edition_id, sport_id, naipe, division
          ORDER BY created_at ASC, id ASC
        ) AS row_number
      FROM public.championship_bracket_competitions
    ) AS duplicated_rows
    WHERE competitions_table.id = duplicated_rows.id
      AND duplicated_rows.row_number > 1;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.championship_bracket_competitions'::regclass
        AND contype = 'u'
        AND pg_get_constraintdef(oid) LIKE 'UNIQUE (bracket_edition_id, sport_id, naipe, division)%'
    ) THEN
      ALTER TABLE public.championship_bracket_competitions
        ADD CONSTRAINT championship_bracket_competitions_upsert_unique
        UNIQUE (bracket_edition_id, sport_id, naipe, division);
    END IF;
  END IF;

  IF to_regclass('public.championship_bracket_groups') IS NOT NULL THEN
    DELETE FROM public.championship_bracket_groups AS groups_table
    USING (
      SELECT
        id,
        row_number() OVER (
          PARTITION BY competition_id, group_number
          ORDER BY created_at ASC, id ASC
        ) AS row_number
      FROM public.championship_bracket_groups
    ) AS duplicated_rows
    WHERE groups_table.id = duplicated_rows.id
      AND duplicated_rows.row_number > 1;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.championship_bracket_groups'::regclass
        AND contype = 'u'
        AND pg_get_constraintdef(oid) LIKE 'UNIQUE (competition_id, group_number)%'
    ) THEN
      ALTER TABLE public.championship_bracket_groups
        ADD CONSTRAINT championship_bracket_groups_upsert_unique
        UNIQUE (competition_id, group_number);
    END IF;
  END IF;

  IF to_regclass('public.championship_bracket_group_teams') IS NOT NULL THEN
    DELETE FROM public.championship_bracket_group_teams AS group_teams_table
    USING (
      SELECT
        id,
        row_number() OVER (
          PARTITION BY group_id, team_id
          ORDER BY created_at ASC, id ASC
        ) AS row_number
      FROM public.championship_bracket_group_teams
    ) AS duplicated_rows
    WHERE group_teams_table.id = duplicated_rows.id
      AND duplicated_rows.row_number > 1;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.championship_bracket_group_teams'::regclass
        AND contype = 'u'
        AND pg_get_constraintdef(oid) LIKE 'UNIQUE (group_id, team_id)%'
    ) THEN
      ALTER TABLE public.championship_bracket_group_teams
        ADD CONSTRAINT championship_bracket_group_teams_upsert_unique
        UNIQUE (group_id, team_id);
    END IF;
  END IF;

  IF to_regclass('public.championship_bracket_days') IS NOT NULL THEN
    DELETE FROM public.championship_bracket_days AS days_table
    USING (
      SELECT
        id,
        row_number() OVER (
          PARTITION BY bracket_edition_id, event_date
          ORDER BY created_at ASC, id ASC
        ) AS row_number
      FROM public.championship_bracket_days
    ) AS duplicated_rows
    WHERE days_table.id = duplicated_rows.id
      AND duplicated_rows.row_number > 1;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.championship_bracket_days'::regclass
        AND contype = 'u'
        AND pg_get_constraintdef(oid) LIKE 'UNIQUE (bracket_edition_id, event_date)%'
    ) THEN
      ALTER TABLE public.championship_bracket_days
        ADD CONSTRAINT championship_bracket_days_upsert_unique
        UNIQUE (bracket_edition_id, event_date);
    END IF;
  END IF;

  IF to_regclass('public.championship_bracket_locations') IS NOT NULL THEN
    DELETE FROM public.championship_bracket_locations AS locations_table
    USING (
      SELECT
        id,
        row_number() OVER (
          PARTITION BY bracket_day_id, name
          ORDER BY created_at ASC, id ASC
        ) AS row_number
      FROM public.championship_bracket_locations
    ) AS duplicated_rows
    WHERE locations_table.id = duplicated_rows.id
      AND duplicated_rows.row_number > 1;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.championship_bracket_locations'::regclass
        AND contype = 'u'
        AND pg_get_constraintdef(oid) LIKE 'UNIQUE (bracket_day_id, name)%'
    ) THEN
      ALTER TABLE public.championship_bracket_locations
        ADD CONSTRAINT championship_bracket_locations_upsert_unique
        UNIQUE (bracket_day_id, name);
    END IF;
  END IF;

  IF to_regclass('public.championship_bracket_courts') IS NOT NULL THEN
    DELETE FROM public.championship_bracket_courts AS courts_table
    USING (
      SELECT
        id,
        row_number() OVER (
          PARTITION BY bracket_location_id, name
          ORDER BY created_at ASC, id ASC
        ) AS row_number
      FROM public.championship_bracket_courts
    ) AS duplicated_rows
    WHERE courts_table.id = duplicated_rows.id
      AND duplicated_rows.row_number > 1;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.championship_bracket_courts'::regclass
        AND contype = 'u'
        AND pg_get_constraintdef(oid) LIKE 'UNIQUE (bracket_location_id, name)%'
    ) THEN
      ALTER TABLE public.championship_bracket_courts
        ADD CONSTRAINT championship_bracket_courts_upsert_unique
        UNIQUE (bracket_location_id, name);
    END IF;
  END IF;

  IF to_regclass('public.championship_bracket_court_sports') IS NOT NULL THEN
    DELETE FROM public.championship_bracket_court_sports AS court_sports_table
    USING (
      SELECT
        id,
        row_number() OVER (
          PARTITION BY bracket_court_id, sport_id
          ORDER BY created_at ASC, id ASC
        ) AS row_number
      FROM public.championship_bracket_court_sports
    ) AS duplicated_rows
    WHERE court_sports_table.id = duplicated_rows.id
      AND duplicated_rows.row_number > 1;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.championship_bracket_court_sports'::regclass
        AND contype = 'u'
        AND pg_get_constraintdef(oid) LIKE 'UNIQUE (bracket_court_id, sport_id)%'
    ) THEN
      ALTER TABLE public.championship_bracket_court_sports
        ADD CONSTRAINT championship_bracket_court_sports_upsert_unique
        UNIQUE (bracket_court_id, sport_id);
    END IF;
  END IF;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
