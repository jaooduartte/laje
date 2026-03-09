DO $migration_group_stage_interleave$
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
    'championship_uses_divisions BOOLEAN;',
    E'championship_uses_divisions BOOLEAN;\n  group_number_value INTEGER;\n  group_match_slot INTEGER;\n  pending_group_match_record RECORD;',
    'g'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$FOR\s+group_id\s+IN\s+SELECT\s+groups_table\.id[\s\S]*?competition_match_slot := competition_match_slot \+ 1;\s*        END LOOP;\s*      END LOOP;\s*    END LOOP;$pattern$,
    $replacement$CREATE TEMP TABLE IF NOT EXISTS temp_pending_group_matches (
      group_number INTEGER NOT NULL,
      group_match_slot INTEGER NOT NULL,
      home_team_id UUID NOT NULL,
      away_team_id UUID NOT NULL
    ) ON COMMIT DROP;

    TRUNCATE temp_pending_group_matches;

    FOR group_id, group_number_value IN
      SELECT
        groups_table.id,
        groups_table.group_number
      FROM public.championship_bracket_groups AS groups_table
      WHERE groups_table.competition_id = competition_id
      ORDER BY groups_table.group_number ASC
    LOOP
      SELECT array_agg(group_teams_table.team_id ORDER BY group_teams_table.position ASC)
      INTO group_team_ids
      FROM public.championship_bracket_group_teams AS group_teams_table
      WHERE group_teams_table.group_id = group_id;

      group_team_count := COALESCE(cardinality(group_team_ids), 0);

      IF group_team_count < 2 THEN
        RAISE EXCEPTION 'Chave inválida: é necessário no mínimo duas atléticas por chave.';
      END IF;

      group_match_slot := 1;

      FOR existing_matches_count IN 1..group_team_count - 1
      LOOP
        FOR qualifiers_per_group_value IN existing_matches_count + 1..group_team_count
        LOOP
          INSERT INTO temp_pending_group_matches (
            group_number,
            group_match_slot,
            home_team_id,
            away_team_id
          ) VALUES (
            group_number_value,
            group_match_slot,
            group_team_ids[existing_matches_count],
            group_team_ids[qualifiers_per_group_value]
          );

          group_match_slot := group_match_slot + 1;
        END LOOP;
      END LOOP;
    END LOOP;

    FOR pending_group_match_record IN
      SELECT
        groups_table.id AS group_id,
        pending_group_matches_table.home_team_id,
        pending_group_matches_table.away_team_id
      FROM temp_pending_group_matches AS pending_group_matches_table
      JOIN public.championship_bracket_groups AS groups_table
        ON groups_table.competition_id = competition_id
        AND groups_table.group_number = pending_group_matches_table.group_number
      ORDER BY
        pending_group_matches_table.group_match_slot ASC,
        pending_group_matches_table.group_number ASC
    LOOP
      group_id := pending_group_match_record.group_id;
      group_team_ids := ARRAY[
        pending_group_match_record.home_team_id,
        pending_group_match_record.away_team_id
      ];
      existing_matches_count := 1;
      qualifiers_per_group_value := 2;

      SELECT
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
      LIMIT 1;

      IF selected_slot_start IS NULL THEN
        RAISE EXCEPTION 'Não há horários disponíveis para concluir o chaveamento sem conflitos.';
      END IF;

      INSERT INTO public.matches (
        championship_id,
        division,
        naipe,
        sport_id,
        home_team_id,
        away_team_id,
        location,
        court_name,
        start_time,
        end_time,
        status
      ) VALUES (
        _championship_id,
        division_value,
        naipe_value,
        sport_id,
        group_team_ids[existing_matches_count],
        group_team_ids[qualifiers_per_group_value],
        selected_slot_location_name,
        selected_slot_court_name,
        selected_slot_start,
        selected_slot_end,
        'SCHEDULED'::public.match_status
      )
      RETURNING id INTO new_match_id;

      INSERT INTO public.championship_bracket_matches (
        bracket_edition_id,
        competition_id,
        group_id,
        phase,
        round_number,
        slot_number,
        match_id,
        home_team_id,
        away_team_id
      ) VALUES (
        bracket_edition_id,
        competition_id,
        group_id,
        'GROUP_STAGE'::public.bracket_phase,
        1,
        competition_match_slot,
        new_match_id,
        group_team_ids[existing_matches_count],
        group_team_ids[qualifiers_per_group_value]
      );

      competition_match_slot := competition_match_slot + 1;
    END LOOP;$replacement$,
    'g'
  );

  IF position('temp_pending_group_matches' IN function_definition) = 0
    OR position('group_match_slot' IN function_definition) = 0
    OR position('pending_group_match_record' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível aplicar a intercalação de jogos por chave na geração automática.';
  END IF;

  EXECUTE function_definition;
END;
$migration_group_stage_interleave$;

NOTIFY pgrst, 'reload schema';
