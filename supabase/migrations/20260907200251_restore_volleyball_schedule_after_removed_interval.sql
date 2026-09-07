DO $$
DECLARE
  updated_match_count INTEGER;
BEGIN
  PERFORM set_config('app.allow_manual_schedule_override_update', 'true', true);
  PERFORM set_config('app.allow_operational_schedule_interval_match_update', 'true', true);
  PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);

  UPDATE public.matches AS matches_table
  SET
    start_time = matches_table.start_time - INTERVAL '40 minutes',
    end_time = CASE
      WHEN matches_table.end_time IS NULL THEN NULL
      ELSE matches_table.end_time - INTERVAL '40 minutes'
    END
  WHERE matches_table.scheduled_date = DATE '2026-09-07'
    AND matches_table.sport_id = '0e5c878e-cdbc-40ca-816a-84120f406261'::UUID
    AND matches_table.location = 'Campus Park'
    AND matches_table.court_name = 'Quadra'
    AND matches_table.start_time BETWEEN '2026-09-07 16:40:00+00'::TIMESTAMPTZ AND '2026-09-07 20:40:00+00'::TIMESTAMPTZ;

  GET DIAGNOSTICS updated_match_count = ROW_COUNT;

  IF updated_match_count <> 5 THEN
    RAISE EXCEPTION 'A correção esperava 5 jogos de vôlei e encontrou %.', updated_match_count;
  END IF;

  PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
  PERFORM set_config('app.allow_operational_schedule_interval_match_update', 'false', true);
  PERFORM set_config('app.allow_manual_schedule_override_update', 'false', true);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
    PERFORM set_config('app.allow_operational_schedule_interval_match_update', 'false', true);
    PERFORM set_config('app.allow_manual_schedule_override_update', 'false', true);
    RAISE;
END;
$$;

NOTIFY pgrst, 'reload schema';
