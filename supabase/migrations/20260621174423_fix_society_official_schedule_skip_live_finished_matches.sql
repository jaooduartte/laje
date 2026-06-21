DO $$
DECLARE
  function_signature REGPROCEDURE := to_regprocedure('public.apply_society_2026_official_schedule(uuid)');
  function_definition TEXT;
  updated_definition TEXT;
  group_stage_clear_source TEXT := $source$
  UPDATE public.matches AS matches_table
  SET
    scheduled_slot = NULL,
    queue_position = NULL
  FROM tmp_society_2026_group_stage_matches AS group_stage_matches_table
  WHERE matches_table.id = group_stage_matches_table.match_id;
$source$;
  group_stage_clear_target TEXT := $target$
  UPDATE public.matches AS matches_table
  SET
    scheduled_slot = NULL,
    queue_position = NULL
  FROM tmp_society_2026_group_stage_matches AS group_stage_matches_table
  WHERE matches_table.id = group_stage_matches_table.match_id
    AND matches_table.status = 'SCHEDULED'::public.match_status;
$target$;
  group_stage_apply_source TEXT := $source$
  UPDATE public.matches AS matches_table
  SET
    scheduled_date = group_stage_matches_table.scheduled_date,
    location = group_stage_matches_table.location,
    court_name = group_stage_matches_table.court_name,
    scheduled_slot = group_stage_matches_table.scheduled_slot,
    queue_position = group_stage_matches_table.queue_position,
    start_time = CASE
      WHEN matches_table.status = 'SCHEDULED'::public.match_status THEN
        public.combine_bracket_schedule_timestamp(
          group_stage_matches_table.scheduled_date,
          group_stage_matches_table.planned_start_time
        )
      ELSE matches_table.start_time
    END,
    end_time = CASE
      WHEN matches_table.status = 'SCHEDULED'::public.match_status THEN
        public.combine_bracket_schedule_timestamp(
          group_stage_matches_table.scheduled_date,
          group_stage_matches_table.planned_start_time
        ) + interval '40 minutes'
      ELSE matches_table.end_time
    END
  FROM tmp_society_2026_group_stage_matches AS group_stage_matches_table
  WHERE matches_table.id = group_stage_matches_table.match_id;
$source$;
  group_stage_apply_target TEXT := $target$
  UPDATE public.matches AS matches_table
  SET
    scheduled_date = group_stage_matches_table.scheduled_date,
    location = group_stage_matches_table.location,
    court_name = group_stage_matches_table.court_name,
    scheduled_slot = group_stage_matches_table.scheduled_slot,
    queue_position = group_stage_matches_table.queue_position,
    start_time = CASE
      WHEN matches_table.status = 'SCHEDULED'::public.match_status THEN
        public.combine_bracket_schedule_timestamp(
          group_stage_matches_table.scheduled_date,
          group_stage_matches_table.planned_start_time
        )
      ELSE matches_table.start_time
    END,
    end_time = CASE
      WHEN matches_table.status = 'SCHEDULED'::public.match_status THEN
        public.combine_bracket_schedule_timestamp(
          group_stage_matches_table.scheduled_date,
          group_stage_matches_table.planned_start_time
        ) + interval '40 minutes'
      ELSE matches_table.end_time
    END
  FROM tmp_society_2026_group_stage_matches AS group_stage_matches_table
  WHERE matches_table.id = group_stage_matches_table.match_id
    AND matches_table.status = 'SCHEDULED'::public.match_status;
$target$;
  knockout_clear_source TEXT := $source$
  UPDATE public.matches AS matches_table
  SET
    scheduled_slot = NULL,
    queue_position = NULL
  FROM tmp_society_2026_knockout_matches AS knockout_matches_table
  WHERE matches_table.id = knockout_matches_table.match_id;
$source$;
  knockout_clear_target TEXT := $target$
  UPDATE public.matches AS matches_table
  SET
    scheduled_slot = NULL,
    queue_position = NULL
  FROM tmp_society_2026_knockout_matches AS knockout_matches_table
  WHERE matches_table.id = knockout_matches_table.match_id
    AND matches_table.status = 'SCHEDULED'::public.match_status;
$target$;
  knockout_apply_source TEXT := $source$
  UPDATE public.matches AS matches_table
  SET
    scheduled_date = knockout_matches_table.scheduled_date,
    location = knockout_matches_table.location,
    court_name = knockout_matches_table.court_name,
    scheduled_slot = knockout_matches_table.scheduled_slot,
    queue_position = knockout_matches_table.queue_position,
    start_time = CASE
      WHEN matches_table.status = 'SCHEDULED'::public.match_status THEN
        public.combine_bracket_schedule_timestamp(
          knockout_matches_table.scheduled_date,
          knockout_matches_table.planned_start_time
        )
      ELSE matches_table.start_time
    END,
    end_time = CASE
      WHEN matches_table.status = 'SCHEDULED'::public.match_status THEN
        public.combine_bracket_schedule_timestamp(
          knockout_matches_table.scheduled_date,
          knockout_matches_table.planned_start_time
        ) + interval '40 minutes'
      ELSE matches_table.end_time
    END
  FROM tmp_society_2026_knockout_matches AS knockout_matches_table
  WHERE matches_table.id = knockout_matches_table.match_id;
$source$;
  knockout_apply_target TEXT := $target$
  UPDATE public.matches AS matches_table
  SET
    scheduled_date = knockout_matches_table.scheduled_date,
    location = knockout_matches_table.location,
    court_name = knockout_matches_table.court_name,
    scheduled_slot = knockout_matches_table.scheduled_slot,
    queue_position = knockout_matches_table.queue_position,
    start_time = CASE
      WHEN matches_table.status = 'SCHEDULED'::public.match_status THEN
        public.combine_bracket_schedule_timestamp(
          knockout_matches_table.scheduled_date,
          knockout_matches_table.planned_start_time
        )
      ELSE matches_table.start_time
    END,
    end_time = CASE
      WHEN matches_table.status = 'SCHEDULED'::public.match_status THEN
        public.combine_bracket_schedule_timestamp(
          knockout_matches_table.scheduled_date,
          knockout_matches_table.planned_start_time
        ) + interval '40 minutes'
      ELSE matches_table.end_time
    END
  FROM tmp_society_2026_knockout_matches AS knockout_matches_table
  WHERE matches_table.id = knockout_matches_table.match_id
    AND matches_table.status = 'SCHEDULED'::public.match_status;
$target$;
BEGIN
  IF function_signature IS NULL THEN
    RAISE EXCEPTION 'Função public.apply_society_2026_official_schedule(uuid) não encontrada.';
  END IF;

  SELECT pg_get_functiondef(function_signature)
  INTO function_definition;

  updated_definition := replace(function_definition, group_stage_clear_source, group_stage_clear_target);
  updated_definition := replace(updated_definition, group_stage_apply_source, group_stage_apply_target);
  updated_definition := replace(updated_definition, knockout_clear_source, knockout_clear_target);
  updated_definition := replace(updated_definition, knockout_apply_source, knockout_apply_target);

  IF updated_definition = function_definition
    OR strpos(updated_definition, group_stage_clear_source) > 0
    OR strpos(updated_definition, group_stage_apply_source) > 0
    OR strpos(updated_definition, knockout_clear_source) > 0
    OR strpos(updated_definition, knockout_apply_source) > 0 THEN
    RAISE EXCEPTION 'Não foi possível limitar a agenda oficial do Society 2026 aos jogos SCHEDULED.';
  END IF;

  EXECUTE updated_definition;
END;
$$;

COMMENT ON FUNCTION public.apply_society_2026_official_schedule(UUID) IS
  'Reaplica a agenda oficial do Society 2026 apenas em jogos SCHEDULED, preservando logística e horários reais de partidas LIVE/FINISHED.';

NOTIFY pgrst, 'reload schema';
