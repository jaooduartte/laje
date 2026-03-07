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

    CREATE UNIQUE INDEX IF NOT EXISTS championship_bracket_team_registrations_upsert_uidx
      ON public.championship_bracket_team_registrations (bracket_edition_id, team_id);
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

    CREATE UNIQUE INDEX IF NOT EXISTS championship_bracket_team_modalities_upsert_uidx
      ON public.championship_bracket_team_modalities (bracket_edition_id, team_id, sport_id, naipe, division);
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

    CREATE UNIQUE INDEX IF NOT EXISTS championship_bracket_competitions_upsert_uidx
      ON public.championship_bracket_competitions (bracket_edition_id, sport_id, naipe, division);
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

    CREATE UNIQUE INDEX IF NOT EXISTS championship_bracket_groups_upsert_uidx
      ON public.championship_bracket_groups (competition_id, group_number);
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

    CREATE UNIQUE INDEX IF NOT EXISTS championship_bracket_group_teams_upsert_uidx
      ON public.championship_bracket_group_teams (group_id, team_id);
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

    CREATE UNIQUE INDEX IF NOT EXISTS championship_bracket_days_upsert_uidx
      ON public.championship_bracket_days (bracket_edition_id, event_date);
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

    CREATE UNIQUE INDEX IF NOT EXISTS championship_bracket_locations_upsert_uidx
      ON public.championship_bracket_locations (bracket_day_id, name);
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

    CREATE UNIQUE INDEX IF NOT EXISTS championship_bracket_courts_upsert_uidx
      ON public.championship_bracket_courts (bracket_location_id, name);
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

    CREATE UNIQUE INDEX IF NOT EXISTS championship_bracket_court_sports_upsert_uidx
      ON public.championship_bracket_court_sports (bracket_court_id, sport_id);
  END IF;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
