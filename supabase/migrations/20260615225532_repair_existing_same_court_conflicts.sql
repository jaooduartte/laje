DO $$
DECLARE
  affected_bracket_edition_id UUID;
  remaining_conflicts_count INTEGER := 0;
  redistribution_pass INTEGER := 0;
  max_redistribution_passes CONSTANT INTEGER := 5;
BEGIN
  BEGIN
    ALTER TABLE public.matches DISABLE TRIGGER check_match_conflict;

    LOOP
      redistribution_pass := redistribution_pass + 1;
      EXIT WHEN redistribution_pass > max_redistribution_passes;

      FOR affected_bracket_edition_id IN
        WITH ordered_matches AS (
          SELECT
            bracket_matches_table.bracket_edition_id,
            matches_table.id,
            matches_table.home_team_id,
            matches_table.away_team_id,
            lag(matches_table.home_team_id) OVER court_sequence AS previous_home_team_id,
            lag(matches_table.away_team_id) OVER court_sequence AS previous_away_team_id
          FROM public.matches AS matches_table
          JOIN public.championship_bracket_matches AS bracket_matches_table
            ON bracket_matches_table.match_id = matches_table.id
          JOIN public.championship_bracket_editions AS bracket_editions_table
            ON bracket_editions_table.id = bracket_matches_table.bracket_edition_id
          JOIN public.championships AS championships_table
            ON championships_table.id = bracket_editions_table.championship_id
          WHERE matches_table.status = 'SCHEDULED'::public.match_status
            AND championships_table.status = 'UPCOMING'::public.championship_status
            AND matches_table.scheduled_date IS NOT NULL
            AND NULLIF(trim(COALESCE(matches_table.location, '')), '') IS NOT NULL
            AND NULLIF(trim(COALESCE(matches_table.court_name, '')), '') IS NOT NULL
          WINDOW court_sequence AS (
            PARTITION BY
              bracket_matches_table.bracket_edition_id,
              matches_table.scheduled_date,
              public.normalize_bracket_entity_name(matches_table.location),
              public.normalize_bracket_entity_name(matches_table.court_name)
            ORDER BY
              CASE
                WHEN matches_table.start_time IS NULL THEN 1
                ELSE 0
              END,
              matches_table.start_time ASC NULLS LAST,
              COALESCE(matches_table.scheduled_slot, matches_table.queue_position) ASC NULLS LAST,
              COALESCE(matches_table.queue_position, matches_table.scheduled_slot) ASC NULLS LAST,
              matches_table.created_at ASC,
              matches_table.id ASC
          )
        )
        SELECT DISTINCT ordered_matches.bracket_edition_id
        FROM ordered_matches
        WHERE ordered_matches.previous_home_team_id IN (ordered_matches.home_team_id, ordered_matches.away_team_id)
          OR ordered_matches.previous_away_team_id IN (ordered_matches.home_team_id, ordered_matches.away_team_id)
      LOOP
        PERFORM public.redistribute_bracket_scheduled_matches(affected_bracket_edition_id);
      END LOOP;

      WITH remaining_conflicts AS (
        SELECT 1
        FROM (
          SELECT
            bracket_matches_table.bracket_edition_id,
            matches_table.id,
            matches_table.home_team_id,
            matches_table.away_team_id,
            lag(matches_table.home_team_id) OVER court_sequence AS previous_home_team_id,
            lag(matches_table.away_team_id) OVER court_sequence AS previous_away_team_id
          FROM public.matches AS matches_table
          JOIN public.championship_bracket_matches AS bracket_matches_table
            ON bracket_matches_table.match_id = matches_table.id
          JOIN public.championship_bracket_editions AS bracket_editions_table
            ON bracket_editions_table.id = bracket_matches_table.bracket_edition_id
          JOIN public.championships AS championships_table
            ON championships_table.id = bracket_editions_table.championship_id
          WHERE matches_table.status = 'SCHEDULED'::public.match_status
            AND championships_table.status = 'UPCOMING'::public.championship_status
            AND matches_table.scheduled_date IS NOT NULL
            AND NULLIF(trim(COALESCE(matches_table.location, '')), '') IS NOT NULL
            AND NULLIF(trim(COALESCE(matches_table.court_name, '')), '') IS NOT NULL
          WINDOW court_sequence AS (
            PARTITION BY
              bracket_matches_table.bracket_edition_id,
              matches_table.scheduled_date,
              public.normalize_bracket_entity_name(matches_table.location),
              public.normalize_bracket_entity_name(matches_table.court_name)
            ORDER BY
              CASE
                WHEN matches_table.start_time IS NULL THEN 1
                ELSE 0
              END,
              matches_table.start_time ASC NULLS LAST,
              COALESCE(matches_table.scheduled_slot, matches_table.queue_position) ASC NULLS LAST,
              COALESCE(matches_table.queue_position, matches_table.scheduled_slot) ASC NULLS LAST,
              matches_table.created_at ASC,
              matches_table.id ASC
          )
        ) AS ordered_matches
        WHERE ordered_matches.previous_home_team_id IN (ordered_matches.home_team_id, ordered_matches.away_team_id)
          OR ordered_matches.previous_away_team_id IN (ordered_matches.home_team_id, ordered_matches.away_team_id)
      )
      SELECT count(*)
      INTO remaining_conflicts_count
      FROM remaining_conflicts;

      EXIT WHEN remaining_conflicts_count = 0;
    END LOOP;

    ALTER TABLE public.matches ENABLE TRIGGER check_match_conflict;
  EXCEPTION
    WHEN OTHERS THEN
      ALTER TABLE public.matches ENABLE TRIGGER check_match_conflict;
      RAISE;
  END;

  IF remaining_conflicts_count > 0 THEN
    RAISE EXCEPTION
      'Ainda restam % conflito(s) consecutivos na mesma quadra após % tentativas de redistribuição.',
      remaining_conflicts_count,
      max_redistribution_passes;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
