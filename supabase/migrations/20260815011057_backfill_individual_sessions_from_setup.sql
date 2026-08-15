DO $$
DECLARE
  championship_season_record RECORD;
BEGIN
  FOR championship_season_record IN
    SELECT DISTINCT
      bracket_editions_table.championship_id,
      bracket_editions_table.season_year
    FROM public.championship_bracket_editions AS bracket_editions_table
    WHERE jsonb_array_length(
      COALESCE(
        bracket_editions_table.payload_snapshot->'individual_session_configs',
        '[]'::jsonb
      )
    ) > 0
  LOOP
    PERFORM public.sync_championship_individual_events_from_setup(
      championship_season_record.championship_id,
      championship_season_record.season_year
    );
    PERFORM public.sync_championship_individual_sessions_from_setup(
      championship_season_record.championship_id,
      championship_season_record.season_year
    );
  END LOOP;
END;
$$;
