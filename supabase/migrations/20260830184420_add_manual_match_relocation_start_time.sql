DO $patch_manual_relocation_preview$
DECLARE
  function_definition TEXT;
  updated_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.build_manual_match_relocation_preview(uuid,jsonb)'::regprocedure
  )
  INTO function_definition;

  IF position('SELECT count(*), min(championship_id), min(season_year)' IN function_definition) = 0
    OR position('  IF insertion_position = ''START'' THEN' IN function_definition) = 0
    OR position('  IF insertion_position = ''END'' THEN' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'A versão esperada da prévia de realocação manual não foi encontrada.';
  END IF;

  updated_definition := replace(
    function_definition,
    '  relocation_notes TEXT;',
    '  relocation_notes TEXT;
  target_start_time TIME;
  effective_start_time TIME;
  previous_day_start TEXT;
  next_day_start TEXT;'
  );

  updated_definition := replace(
    updated_definition,
    '  relocation_notes := NULLIF(trim(COALESCE(_payload->>''notes'', '''')), '''');',
    '  relocation_notes := NULLIF(trim(COALESCE(_payload->>''notes'', '''')), '''');
  target_start_time := NULLIF(trim(COALESCE(_payload->>''target_start_time'', '''')), '''')::TIME;'
  );

  updated_definition := replace(
    updated_definition,
    'SELECT count(*), min(championship_id), min(season_year)',
    'SELECT count(*), (array_agg(championship_id))[1], min(season_year)'
  );

  updated_definition := replace(
    updated_definition,
    '  IF target_day_record.id IS NULL THEN
    RAISE EXCEPTION ''O dia de destino não está configurado na agenda do campeonato.'';
  END IF;

  SELECT courts_table.id',
    '  IF target_day_record.id IS NULL THEN
    RAISE EXCEPTION ''O dia de destino não está configurado na agenda do campeonato.'';
  END IF;

  effective_start_time := COALESCE(target_start_time, target_day_record.start_time);

  IF target_start_time IS NOT NULL AND target_start_time >= target_day_record.start_time THEN
    RAISE EXCEPTION ''O novo horário de início deve antecipar o início atual do dia.'';
  END IF;

  SELECT courts_table.id'
  );

  updated_definition := replace(
    updated_definition,
    '    true,
    row_number() OVER (
      ORDER BY matches_table.scheduled_date, matches_table.start_time,
        COALESCE(matches_table.scheduled_slot, matches_table.queue_position), matches_table.created_at, matches_table.id
    ),',
    '    true,
    CASE
      WHEN insertion_position = ''END'' AND target_start_time IS NOT NULL THEN 100000 + row_number() OVER (
        ORDER BY matches_table.scheduled_date, matches_table.start_time,
          COALESCE(matches_table.scheduled_slot, matches_table.queue_position), matches_table.created_at, matches_table.id
      )
      ELSE row_number() OVER (
        ORDER BY matches_table.scheduled_date, matches_table.start_time,
          COALESCE(matches_table.scheduled_slot, matches_table.queue_position), matches_table.created_at, matches_table.id
      )
    END,'
  );

  updated_definition := replace(
    updated_definition,
    '  IF insertion_position = ''START'' THEN',
    '  IF insertion_position = ''START'' OR target_start_time IS NOT NULL THEN'
  );

  updated_definition := replace(
    updated_definition,
    '      false,
      100000 + row_number() OVER (
        ORDER BY matches_table.start_time, COALESCE(matches_table.scheduled_slot, matches_table.queue_position), matches_table.created_at, matches_table.id
      ),',
    '      false,
      CASE
        WHEN insertion_position = ''END'' THEN row_number() OVER (
          ORDER BY matches_table.start_time, COALESCE(matches_table.scheduled_slot, matches_table.queue_position), matches_table.created_at, matches_table.id
        )
        ELSE 100000 + row_number() OVER (
          ORDER BY matches_table.start_time, COALESCE(matches_table.scheduled_slot, matches_table.queue_position), matches_table.created_at, matches_table.id
        )
      END,'
  );

  updated_definition := replace(
    updated_definition,
    '  IF insertion_position = ''END'' THEN',
    '  IF insertion_position = ''END'' AND target_start_time IS NULL THEN'
  );

  updated_definition := replace(
    updated_definition,
    'public.combine_bracket_schedule_timestamp(target_date, target_day_record.start_time)',
    'public.combine_bracket_schedule_timestamp(target_date, effective_start_time)'
  );

  updated_definition := replace(
    updated_definition,
    '    WHERE insertion_position = ''START'' OR is_selected = true',
    '    WHERE insertion_position = ''START'' OR is_selected = true OR target_start_time IS NOT NULL'
  );

  updated_definition := replace(
    updated_definition,
    '          WHEN insertion_position = ''END'' THEN COALESCE((',
    '          WHEN insertion_position = ''END'' AND target_start_time IS NULL THEN COALESCE(('
  );

  updated_definition := replace(
    updated_definition,
    '  SELECT to_char(public.combine_bracket_schedule_timestamp(target_date, target_day_record.end_time) AT TIME ZONE ''America/Sao_Paulo'', ''HH24:MI'')',
    '  SELECT to_char(public.combine_bracket_schedule_timestamp(target_date, target_day_record.start_time) AT TIME ZONE ''America/Sao_Paulo'', ''HH24:MI'')
  INTO previous_day_start;

  SELECT to_char(public.combine_bracket_schedule_timestamp(target_date, effective_start_time) AT TIME ZONE ''America/Sao_Paulo'', ''HH24:MI'')
  INTO next_day_start;

  SELECT to_char(public.combine_bracket_schedule_timestamp(target_date, target_day_record.end_time) AT TIME ZONE ''America/Sao_Paulo'', ''HH24:MI'')'
  );

  updated_definition := replace(
    updated_definition,
    '    ''previous_day_end'', previous_day_end,',
    '    ''previous_day_start'', previous_day_start,
    ''next_day_start'', next_day_start,
    ''advances_day_start'', effective_start_time < target_day_record.start_time,
    ''previous_day_end'', previous_day_end,'
  );

  IF updated_definition = function_definition THEN
    RAISE EXCEPTION 'Não foi possível atualizar a prévia de realocação manual.';
  END IF;

  EXECUTE updated_definition;
END;
$patch_manual_relocation_preview$;

DO $patch_manual_relocation_apply$
DECLARE
  function_definition TEXT;
  updated_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.apply_manual_match_relocation(uuid,jsonb,bigint)'::regprocedure
  )
  INTO function_definition;

  IF position('  target_day_end TIME;' IN function_definition) = 0
    OR position('  calculated_day_end := (preview->>''next_day_end'')::TIME;' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'A versão esperada da aplicação de realocação manual não foi encontrada.';
  END IF;

  updated_definition := replace(
    function_definition,
    '  target_day_end TIME;
  calculated_day_end TIME;',
    '  target_day_start TIME;
  target_day_end TIME;
  calculated_day_start TIME;
  calculated_day_end TIME;'
  );

  updated_definition := replace(
    updated_definition,
    '  SELECT end_time
  INTO target_day_end',
    '  SELECT start_time, end_time
  INTO target_day_start, target_day_end'
  );

  updated_definition := replace(
    updated_definition,
    '  calculated_day_end := (preview->>''next_day_end'')::TIME;

  IF calculated_day_end > target_day_end THEN
    UPDATE public.championship_bracket_days
    SET end_time = calculated_day_end
    WHERE bracket_edition_id = _bracket_edition_id
      AND event_date = target_date;
  END IF;',
    '  calculated_day_start := (preview->>''next_day_start'')::TIME;
  calculated_day_end := (preview->>''next_day_end'')::TIME;

  IF calculated_day_start < target_day_start OR calculated_day_end > target_day_end THEN
    UPDATE public.championship_bracket_days
    SET
      start_time = LEAST(start_time, calculated_day_start),
      end_time = GREATEST(end_time, calculated_day_end)
    WHERE bracket_edition_id = _bracket_edition_id
      AND event_date = target_date;
  END IF;'
  );

  IF updated_definition = function_definition THEN
    RAISE EXCEPTION 'Não foi possível atualizar a aplicação de realocação manual.';
  END IF;

  EXECUTE updated_definition;
END;
$patch_manual_relocation_apply$;
