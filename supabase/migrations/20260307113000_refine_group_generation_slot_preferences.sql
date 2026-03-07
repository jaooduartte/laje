DO $migration_groups_slot_preferences$
DECLARE
  function_signature REGPROCEDURE;
  function_definition TEXT;
BEGIN
  function_signature := to_regprocedure('public.generate_championship_bracket_groups(uuid, jsonb)');

  IF function_signature IS NULL THEN
    RAISE EXCEPTION 'Função public.generate_championship_bracket_groups(uuid, jsonb) não encontrada.';
  END IF;

  SELECT pg_get_functiondef(function_signature)
  INTO function_definition;

  function_definition := regexp_replace(
    function_definition,
    $pattern$SELECT\s+slots_table\.slot_start,\s+slots_table\.slot_start \+ make_interval\(mins => duration_minutes\),\s+slots_table\.location_name,\s+slots_table\.court_name\s+INTO\s+selected_slot_start,\s+selected_slot_end,\s+selected_slot_location_name,\s+selected_slot_court_name\s+FROM temp_bracket_slots AS slots_table[\s\S]*?LIMIT 1;$pattern$,
    $replacement$SELECT
            slots_table.slot_start,
            slots_table.slot_start + make_interval(mins => duration_minutes),
            slots_table.location_name,
            slots_table.court_name
          INTO
            selected_slot_start,
            selected_slot_end,
            selected_slot_location_name,
            selected_slot_court_name
          FROM temp_bracket_slots AS slots_table
          WHERE slots_table.sport_id = sport_id
            AND slots_table.slot_start + make_interval(mins => duration_minutes) <= slots_table.day_end
            AND (
              slots_table.break_start IS NULL
              OR slots_table.break_end IS NULL
              OR slots_table.slot_start >= slots_table.break_end
              OR slots_table.slot_start + make_interval(mins => duration_minutes) <= slots_table.break_start
            )
            AND NOT EXISTS (
              SELECT 1
              FROM public.matches AS matches_table
              WHERE matches_table.location = slots_table.location_name
                AND COALESCE(matches_table.court_name, '') = COALESCE(slots_table.court_name, '')
                AND matches_table.start_time < slots_table.slot_start + make_interval(mins => duration_minutes)
                AND matches_table.end_time > slots_table.slot_start
            )
            AND NOT EXISTS (
              SELECT 1
              FROM public.matches AS matches_table
              WHERE matches_table.championship_id = _championship_id
                AND (
                  matches_table.home_team_id IN (group_team_ids[existing_matches_count], group_team_ids[qualifiers_per_group_value])
                  OR matches_table.away_team_id IN (group_team_ids[existing_matches_count], group_team_ids[qualifiers_per_group_value])
                )
                AND matches_table.start_time < slots_table.slot_start + make_interval(mins => duration_minutes)
                AND matches_table.end_time > slots_table.slot_start
            )
          ORDER BY
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM public.matches AS previous_team_match_table
                WHERE previous_team_match_table.championship_id = _championship_id
                  AND previous_team_match_table.sport_id = sport_id
                  AND previous_team_match_table.naipe = naipe_value
                  AND (
                    previous_team_match_table.home_team_id IN (group_team_ids[existing_matches_count], group_team_ids[qualifiers_per_group_value])
                    OR previous_team_match_table.away_team_id IN (group_team_ids[existing_matches_count], group_team_ids[qualifiers_per_group_value])
                  )
                  AND previous_team_match_table.end_time <= slots_table.slot_start
                  AND NOT EXISTS (
                    SELECT 1
                    FROM public.matches AS intermediary_match_table
                    WHERE intermediary_match_table.championship_id = _championship_id
                      AND intermediary_match_table.sport_id = sport_id
                      AND intermediary_match_table.naipe = naipe_value
                      AND intermediary_match_table.end_time <= slots_table.slot_start
                      AND intermediary_match_table.end_time > previous_team_match_table.end_time
                  )
              ) THEN 1
              ELSE 0
            END ASC,
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM public.matches AS same_naipe_match_table
                WHERE same_naipe_match_table.championship_id = _championship_id
                  AND same_naipe_match_table.sport_id = sport_id
                  AND same_naipe_match_table.naipe = naipe_value
                  AND (
                    same_naipe_match_table.location <> slots_table.location_name
                    OR COALESCE(same_naipe_match_table.court_name, '') <> COALESCE(slots_table.court_name, '')
                  )
                  AND same_naipe_match_table.start_time < slots_table.slot_start + make_interval(mins => duration_minutes)
                  AND same_naipe_match_table.end_time > slots_table.slot_start
              ) THEN 1
              ELSE 0
            END ASC,
            slots_table.slot_start ASC
          LIMIT 1;$replacement$,
    'g'
  );

  IF position('slots_table.break_start' IN function_definition) = 0
    OR position('slots_table.break_end' IN function_definition) = 0
    OR position('previous_team_match_table' IN function_definition) = 0
    OR position('same_naipe_match_table' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível aplicar as preferências de encaixe da função de grupos.';
  END IF;

  EXECUTE function_definition;
END;
$migration_groups_slot_preferences$;

NOTIFY pgrst, 'reload schema';
