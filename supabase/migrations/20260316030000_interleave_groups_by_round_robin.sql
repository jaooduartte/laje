CREATE OR REPLACE FUNCTION public.generate_championship_bracket_groups(
  _championship_id UUID,
  _payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_variable
DECLARE
  bracket_edition_id UUID;
  participant_record JSONB;
  modality_record JSONB;
  competition_record JSONB;
  group_record JSONB;
  schedule_day_record JSONB;
  location_record JSONB;
  court_record JSONB;
  court_sport_record JSONB;
  competition_generation_record RECORD;
  competition_id UUID;
  group_id UUID;
  bracket_day_id UUID;
  bracket_location_id UUID;
  bracket_court_id UUID;
  team_id UUID;
  sport_id UUID;
  naipe_value public.match_naipe;
  division_value public.team_division;
  groups_count_value INTEGER;
  qualifiers_per_group_value INTEGER;
  third_place_mode_value public.bracket_third_place_mode;
  normalized_location_name TEXT;
  normalized_court_name TEXT;
  new_match_id UUID;
  group_team_ids UUID[];
  group_team_count INTEGER;
  min_group_size INTEGER;
  max_group_size INTEGER;
  current_group_size INTEGER;
  competition_match_slot INTEGER;
  competition_priority_value INTEGER;
  existing_matches_count INTEGER;
  championship_uses_divisions BOOLEAN;
  championship_current_season_year INTEGER;
  group_number_value INTEGER;
  group_match_slot INTEGER;
  pending_group_match_record RECORD;
  selected_queue_date DATE;
  selected_location_name TEXT;
  sport_name TEXT;
  -- Variaveis do Round-Robin
  current_group_even_size INTEGER;
  round_idx INTEGER;
  match_idx INTEGER;
  home_idx INTEGER;
  away_idx INTEGER;
  home_team_id_val UUID;
  away_team_id_val UUID;
  round_match_index_val INTEGER;
  selected_day_courts_count INTEGER;
  candidate_queue_position INTEGER;
  current_slot_match_count INTEGER;
  same_team_same_slot_conflict_exists BOOLEAN;
  same_team_same_naipe_recent_conflict_exists BOOLEAN;
  pending_home_team_name TEXT;
  pending_away_team_name TEXT;
  pending_home_team_key TEXT;
  pending_away_team_key TEXT;
  current_queue_assigned_count INTEGER;
  current_sport_slot_count INTEGER;
  pending_home_team_identity TEXT;
  pending_away_team_identity TEXT;
  pending_sport_identity TEXT;
  current_sport_slot_match_count INTEGER;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para gerar chaveamento.';
  END IF;

  SELECT
    championships_table.uses_divisions,
    championships_table.current_season_year
  INTO
    championship_uses_divisions,
    championship_current_season_year
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id
    AND championships_table.status = 'PLANNING'::public.championship_status
  LIMIT 1;

  IF championship_uses_divisions IS NULL THEN
    RAISE EXCEPTION 'Campeonato inválido ou fora do status Em breve.';
  END IF;

  SELECT count(*)
  INTO existing_matches_count
  FROM public.matches AS matches_table
  WHERE matches_table.championship_id = _championship_id
    AND matches_table.season_year = championship_current_season_year;

  IF existing_matches_count > 0 THEN
    RAISE EXCEPTION 'Este campeonato já possui jogos cadastrados. A geração automática exige campeonato sem jogos.';
  END IF;

  IF jsonb_typeof(COALESCE(_payload->'participants', '[]'::jsonb)) != 'array'
    OR jsonb_array_length(COALESCE(_payload->'participants', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Nenhuma atlética participante informada.';
  END IF;

  IF jsonb_typeof(COALESCE(_payload->'competitions', '[]'::jsonb)) != 'array'
    OR jsonb_array_length(COALESCE(_payload->'competitions', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Nenhuma configuração de competição informada.';
  END IF;

  IF jsonb_typeof(COALESCE(_payload->'schedule_days', '[]'::jsonb)) != 'array'
    OR jsonb_array_length(COALESCE(_payload->'schedule_days', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Nenhuma janela de agenda informada.';
  END IF;

  INSERT INTO public.championship_bracket_editions (
    championship_id,
    season_year,
    status,
    payload_snapshot,
    created_by
  ) VALUES (
    _championship_id,
    championship_current_season_year,
    'DRAFT'::public.bracket_edition_status,
    COALESCE(_payload, '{}'::jsonb),
    auth.uid()
  )
  RETURNING id INTO bracket_edition_id;

  FOR participant_record IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(_payload->'participants', '[]'::jsonb))
  LOOP
    team_id := (participant_record->>'team_id')::uuid;

    INSERT INTO public.championship_bracket_team_registrations (
      bracket_edition_id,
      team_id
    ) VALUES (
      bracket_edition_id,
      team_id
    )
    ON CONFLICT ON CONSTRAINT championship_bracket_team_registrations_upsert_unique
    DO NOTHING;

    FOR modality_record IN
      SELECT value
      FROM jsonb_array_elements(COALESCE(participant_record->'modalities', '[]'::jsonb))
    LOOP
      sport_id := (modality_record->>'sport_id')::uuid;
      naipe_value := (modality_record->>'naipe')::public.match_naipe;
      division_value := CASE
        WHEN trim(COALESCE(modality_record->>'division', '')) = '' THEN NULL
        ELSE (modality_record->>'division')::public.team_division
      END;

      IF championship_uses_divisions AND division_value IS NULL THEN
        RAISE EXCEPTION 'Divisão é obrigatória para campeonatos que usam divisões.';
      END IF;

      IF NOT championship_uses_divisions THEN
        division_value := NULL;
      END IF;

      INSERT INTO public.championship_bracket_team_modalities (
        bracket_edition_id,
        team_id,
        sport_id,
        naipe,
        division
      ) VALUES (
        bracket_edition_id,
        team_id,
        sport_id,
        naipe_value,
        division_value
      )
      ON CONFLICT ON CONSTRAINT championship_bracket_team_modalities_upsert_unique
      DO NOTHING;
    END LOOP;
  END LOOP;

  FOR competition_record IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(_payload->'competitions', '[]'::jsonb))
  LOOP
    sport_id := (competition_record->>'sport_id')::uuid;
    naipe_value := (competition_record->>'naipe')::public.match_naipe;
    division_value := CASE
      WHEN trim(COALESCE(competition_record->>'division', '')) = '' THEN NULL
      ELSE (competition_record->>'division')::public.team_division
    END;
    groups_count_value := GREATEST(1, COALESCE((competition_record->>'groups_count')::integer, 1));
    qualifiers_per_group_value := GREATEST(1, COALESCE((competition_record->>'qualifiers_per_group')::integer, 1));
    third_place_mode_value := COALESCE(
      (competition_record->>'third_place_mode')::public.bracket_third_place_mode,
      'NONE'::public.bracket_third_place_mode
    );

    IF championship_uses_divisions AND division_value IS NULL THEN
      RAISE EXCEPTION 'Divisão é obrigatória para configuração da competição.';
    END IF;

    IF NOT championship_uses_divisions THEN
      division_value := NULL;
    END IF;

    INSERT INTO public.championship_bracket_competitions (
      bracket_edition_id,
      sport_id,
      naipe,
      division,
      groups_count,
      qualifiers_per_group,
      third_place_mode
    ) VALUES (
      bracket_edition_id,
      sport_id,
      naipe_value,
      division_value,
      groups_count_value,
      qualifiers_per_group_value,
      third_place_mode_value
    )
    ON CONFLICT ON CONSTRAINT championship_bracket_competitions_upsert_unique
    DO UPDATE SET
      groups_count = EXCLUDED.groups_count,
      qualifiers_per_group = EXCLUDED.qualifiers_per_group,
      third_place_mode = EXCLUDED.third_place_mode
    RETURNING id INTO competition_id;

    min_group_size := 2147483647;
    max_group_size := 0;

    FOR group_record IN
      SELECT value
      FROM jsonb_array_elements(COALESCE(competition_record->'groups', '[]'::jsonb))
    LOOP
      INSERT INTO public.championship_bracket_groups (
        competition_id,
        group_number
      ) VALUES (
        competition_id,
        GREATEST(1, COALESCE((group_record->>'group_number')::integer, 1))
      )
      ON CONFLICT ON CONSTRAINT championship_bracket_groups_upsert_unique
      DO UPDATE SET group_number = EXCLUDED.group_number
      RETURNING id INTO group_id;

      current_group_size := 0;

      FOR modality_record IN
        SELECT value
        FROM jsonb_array_elements(COALESCE(group_record->'team_ids', '[]'::jsonb))
      LOOP
        team_id := trim(both '"' from modality_record::text)::uuid;

        INSERT INTO public.championship_bracket_group_teams (
          group_id,
          team_id,
          position
        ) VALUES (
          group_id,
          team_id,
          current_group_size + 1
        )
        ON CONFLICT ON CONSTRAINT championship_bracket_group_teams_upsert_unique
        DO UPDATE SET position = EXCLUDED.position;

        current_group_size := current_group_size + 1;
      END LOOP;

      IF current_group_size < 2 THEN
        RAISE EXCEPTION 'Cada chave precisa ter no mínimo 2 atléticas.';
      END IF;

      min_group_size := LEAST(min_group_size, current_group_size);
      max_group_size := GREATEST(max_group_size, current_group_size);
    END LOOP;

    IF min_group_size = 2147483647 THEN
      RAISE EXCEPTION 'Nenhuma chave configurada para a competição.';
    END IF;

    IF max_group_size - min_group_size > 1 THEN
      RAISE EXCEPTION 'Distribuição inválida: diferença entre chaves não pode ser maior que 1.';
    END IF;
  END LOOP;

  FOR schedule_day_record IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(_payload->'schedule_days', '[]'::jsonb))
  LOOP
    INSERT INTO public.championship_bracket_days (
      bracket_edition_id,
      event_date,
      start_time,
      end_time,
      break_start_time,
      break_end_time
    ) VALUES (
      bracket_edition_id,
      (schedule_day_record->>'date')::date,
      (schedule_day_record->>'start_time')::time,
      (schedule_day_record->>'end_time')::time,
      CASE
        WHEN trim(COALESCE(schedule_day_record->>'break_start_time', '')) = '' THEN NULL
        ELSE (schedule_day_record->>'break_start_time')::time
      END,
      CASE
        WHEN trim(COALESCE(schedule_day_record->>'break_end_time', '')) = '' THEN NULL
        ELSE (schedule_day_record->>'break_end_time')::time
      END
    )
    ON CONFLICT ON CONSTRAINT championship_bracket_days_upsert_unique
    DO UPDATE SET
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      break_start_time = EXCLUDED.break_start_time,
      break_end_time = EXCLUDED.break_end_time
    RETURNING id INTO bracket_day_id;

    FOR location_record IN
      SELECT value
      FROM jsonb_array_elements(COALESCE(schedule_day_record->'locations', '[]'::jsonb))
    LOOP
      normalized_location_name := trim(COALESCE(location_record->>'name', ''));

      IF normalized_location_name = '' THEN
        RAISE EXCEPTION 'Local inválido na configuração de agenda.';
      END IF;

      INSERT INTO public.championship_bracket_locations (
        bracket_day_id,
        name,
        position
      ) VALUES (
        bracket_day_id,
        normalized_location_name,
        GREATEST(1, COALESCE((location_record->>'position')::integer, 1))
      )
      ON CONFLICT ON CONSTRAINT championship_bracket_locations_upsert_unique
      DO UPDATE SET position = EXCLUDED.position
      RETURNING id INTO bracket_location_id;

      FOR court_record IN
        SELECT value
        FROM jsonb_array_elements(COALESCE(location_record->'courts', '[]'::jsonb))
      LOOP
        normalized_court_name := trim(COALESCE(court_record->>'name', ''));

        IF normalized_court_name = '' THEN
          RAISE EXCEPTION 'Quadra inválida na configuração de agenda.';
        END IF;

        INSERT INTO public.championship_bracket_courts (
          bracket_location_id,
          name,
          position
        ) VALUES (
          bracket_location_id,
          normalized_court_name,
          GREATEST(1, COALESCE((court_record->>'position')::integer, 1))
        )
        ON CONFLICT ON CONSTRAINT championship_bracket_courts_upsert_unique
        DO UPDATE SET position = EXCLUDED.position
        RETURNING id INTO bracket_court_id;

        FOR court_sport_record IN
          SELECT value
          FROM jsonb_array_elements(COALESCE(court_record->'sport_ids', '[]'::jsonb))
        LOOP
          INSERT INTO public.championship_bracket_court_sports (
            bracket_court_id,
            sport_id
          ) VALUES (
            bracket_court_id,
            trim(both '"' from court_sport_record::text)::uuid
          )
          ON CONFLICT ON CONSTRAINT championship_bracket_court_sports_upsert_unique
          DO NOTHING;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;

  DROP TABLE IF EXISTS temp_day_sport_court_counts;

  CREATE TEMP TABLE temp_day_sport_court_counts (
    event_date DATE NOT NULL,
    sport_identity TEXT NOT NULL,
    court_count INTEGER NOT NULL,
    PRIMARY KEY (event_date, sport_identity)
  ) ON COMMIT DROP;

  DROP TABLE IF EXISTS temp_day_court_counts;

  CREATE TEMP TABLE temp_day_court_counts (
    event_date DATE PRIMARY KEY,
    court_count INTEGER NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO temp_day_sport_court_counts (event_date, sport_identity, court_count)
  SELECT
    days_table.event_date,
    regexp_replace(lower(trim(COALESCE(sports_table.name, court_sports_table.sport_id::text))), '[^a-z0-9]+', '', 'g') AS sport_identity,
    COUNT(DISTINCT courts_table.id)::integer AS court_count
  FROM public.championship_bracket_days AS days_table
  JOIN public.championship_bracket_locations AS locations_table
    ON locations_table.bracket_day_id = days_table.id
  JOIN public.championship_bracket_courts AS courts_table
    ON courts_table.bracket_location_id = locations_table.id
  JOIN public.championship_bracket_court_sports AS court_sports_table
    ON court_sports_table.bracket_court_id = courts_table.id
  LEFT JOIN public.sports AS sports_table
    ON sports_table.id = court_sports_table.sport_id
  WHERE days_table.bracket_edition_id = bracket_edition_id
  GROUP BY
    days_table.event_date,
    regexp_replace(lower(trim(COALESCE(sports_table.name, court_sports_table.sport_id::text))), '[^a-z0-9]+', '', 'g');

  INSERT INTO temp_day_court_counts (event_date, court_count)
  SELECT
    days_table.event_date,
    COUNT(DISTINCT courts_table.id)::integer AS court_count
  FROM public.championship_bracket_days AS days_table
  JOIN public.championship_bracket_locations AS locations_table
    ON locations_table.bracket_day_id = days_table.id
  JOIN public.championship_bracket_courts AS courts_table
    ON courts_table.bracket_location_id = locations_table.id
  WHERE days_table.bracket_edition_id = bracket_edition_id
  GROUP BY days_table.event_date;

  DROP TABLE IF EXISTS temp_assigned_queue_slots;

  CREATE TEMP TABLE temp_assigned_queue_slots (
    scheduled_date DATE NOT NULL,
    scheduled_slot INTEGER NOT NULL,
    sport_id UUID NOT NULL,
    sport_identity TEXT NOT NULL,
    naipe public.match_naipe NOT NULL,
    home_team_id UUID NOT NULL,
    away_team_id UUID NOT NULL,
    home_team_identity TEXT NOT NULL,
    away_team_identity TEXT NOT NULL,
    PRIMARY KEY (scheduled_date, scheduled_slot, sport_id, home_team_id, away_team_id)
  ) ON COMMIT DROP;


  CREATE TEMP TABLE IF NOT EXISTS temp_pending_group_matches (
    competition_id UUID NOT NULL,
    competition_priority INTEGER NOT NULL,
    sport_id UUID NOT NULL,
    division public.team_division NULL,
    group_id UUID NOT NULL,
    group_number INTEGER NOT NULL,
    naipe public.match_naipe NOT NULL,
    round_number INTEGER NOT NULL,
    round_match_index INTEGER NOT NULL,
    group_match_slot INTEGER NOT NULL,
    competition_slot_number INTEGER NOT NULL,
    home_team_id UUID NOT NULL,
    away_team_id UUID NOT NULL
  ) ON COMMIT DROP;

  TRUNCATE temp_pending_group_matches;

  FOR competition_generation_record IN
    SELECT
      competitions_table.id,
      competitions_table.sport_id,
      competitions_table.division,
      competitions_table.naipe,
      row_number() OVER (
        ORDER BY competitions_table.created_at ASC, competitions_table.id ASC
      ) AS competition_priority
    FROM public.championship_bracket_competitions AS competitions_table
    WHERE competitions_table.bracket_edition_id = bracket_edition_id
    ORDER BY competition_priority ASC
  LOOP
    competition_id := competition_generation_record.id;
    sport_id := competition_generation_record.sport_id;
    division_value := competition_generation_record.division;
    naipe_value := competition_generation_record.naipe;
    competition_priority_value := competition_generation_record.competition_priority;
    competition_match_slot := 1;

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
        RAISE EXCEPTION 'Grupo inválido: é necessário no mínimo duas atléticas por grupo.';
      END IF;

      current_group_even_size := group_team_count;
      IF current_group_even_size % 2 != 0 THEN
        current_group_even_size := current_group_even_size + 1;
      END IF;

      group_match_slot := 1;

      FOR round_idx IN 0 .. current_group_even_size - 2 LOOP
        round_match_index_val := 1;

        FOR match_idx IN 0 .. (current_group_even_size / 2) - 1 LOOP
          IF match_idx = 0 THEN
            home_idx := 0;
          ELSE
            home_idx := (round_idx + match_idx - 1) % (current_group_even_size - 1) + 1;
          END IF;

          away_idx := (current_group_even_size - 1 - match_idx + round_idx - 1) % (current_group_even_size - 1) + 1;

          home_idx := home_idx + 1;
          away_idx := away_idx + 1;

          IF home_idx <= group_team_count AND away_idx <= group_team_count THEN
            home_team_id_val := group_team_ids[home_idx];
            away_team_id_val := group_team_ids[away_idx];

            IF home_team_id_val IS NOT NULL AND away_team_id_val IS NOT NULL AND home_team_id_val != away_team_id_val THEN
              IF match_idx = 0 AND round_idx % 2 != 0 THEN
                home_team_id_val := group_team_ids[away_idx];
                away_team_id_val := group_team_ids[home_idx];
              END IF;

              INSERT INTO temp_pending_group_matches (
                competition_id,
                competition_priority,
                sport_id,
                division,
                group_id,
                group_number,
                naipe,
                round_number,
                round_match_index,
                group_match_slot,
                competition_slot_number,
                home_team_id,
                away_team_id
              ) VALUES (
                competition_id,
                competition_priority_value,
                sport_id,
                division_value,
                group_id,
                group_number_value,
                naipe_value,
                round_idx + 1,
                round_match_index_val,
                group_match_slot,
                competition_match_slot,
                home_team_id_val,
                away_team_id_val
              );

              round_match_index_val := round_match_index_val + 1;
              group_match_slot := group_match_slot + 1;
              competition_match_slot := competition_match_slot + 1;
            END IF;
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;

  DROP TABLE IF EXISTS temp_ordered_group_matches;

  CREATE TEMP TABLE temp_ordered_group_matches (
    row_id BIGSERIAL PRIMARY KEY,
    competition_id UUID NOT NULL,
    sport_id UUID NOT NULL,
    sport_identity TEXT NOT NULL,
    division public.team_division NULL,
    group_id UUID NOT NULL,
    group_number INTEGER NOT NULL,
    naipe public.match_naipe NOT NULL,
    round_number INTEGER NOT NULL,
    round_match_index INTEGER NOT NULL,
    competition_slot_number INTEGER NOT NULL,
    home_team_id UUID NOT NULL,
    away_team_id UUID NOT NULL,
    home_team_identity TEXT NOT NULL,
    away_team_identity TEXT NOT NULL,
    scheduled_date DATE NOT NULL,
    location_name TEXT NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO temp_ordered_group_matches (
    competition_id,
    sport_id,
    sport_identity,
    division,
    group_id,
    group_number,
    naipe,
    round_number,
    round_match_index,
    competition_slot_number,
    home_team_id,
    away_team_id,
    home_team_identity,
    away_team_identity,
    scheduled_date,
    location_name
  )
  WITH sport_priorities AS (
    SELECT
      sport_id,
      MIN(competition_priority) AS sport_priority
    FROM temp_pending_group_matches
    GROUP BY sport_id
  )
  SELECT
    pending_matches_table.competition_id,
    pending_matches_table.sport_id,
    regexp_replace(lower(trim(COALESCE(sports_table.name, pending_matches_table.sport_id::text))), '[^a-z0-9]+', '', 'g') AS sport_identity,
    pending_matches_table.division,
    pending_matches_table.group_id,
    pending_matches_table.group_number,
    pending_matches_table.naipe,
    pending_matches_table.round_number,
    pending_matches_table.round_match_index,
    pending_matches_table.competition_slot_number,
    pending_matches_table.home_team_id,
    pending_matches_table.away_team_id,
    regexp_replace(lower(trim(COALESCE(home_teams_table.name, pending_matches_table.home_team_id::text))), '[^a-z0-9]+', '', 'g') AS home_team_identity,
    regexp_replace(lower(trim(COALESCE(away_teams_table.name, pending_matches_table.away_team_id::text))), '[^a-z0-9]+', '', 'g') AS away_team_identity,
    schedule_candidates.event_date,
    schedule_candidates.location_name
  FROM temp_pending_group_matches AS pending_matches_table
  LEFT JOIN sport_priorities AS priorities_table
    ON priorities_table.sport_id = pending_matches_table.sport_id
  JOIN public.teams AS home_teams_table
    ON home_teams_table.id = pending_matches_table.home_team_id
  JOIN public.teams AS away_teams_table
    ON away_teams_table.id = pending_matches_table.away_team_id
  LEFT JOIN public.sports AS sports_table
    ON sports_table.id = pending_matches_table.sport_id
  JOIN LATERAL (
    SELECT DISTINCT
      days_table.event_date,
      locations_table.name AS location_name,
      days_table.start_time,
      locations_table.position
    FROM public.championship_bracket_days AS days_table
    JOIN public.championship_bracket_locations AS locations_table
      ON locations_table.bracket_day_id = days_table.id
    JOIN public.championship_bracket_courts AS courts_table
      ON courts_table.bracket_location_id = locations_table.id
    JOIN public.championship_bracket_court_sports AS court_sports_table
      ON court_sports_table.bracket_court_id = courts_table.id
    WHERE days_table.bracket_edition_id = bracket_edition_id
      AND court_sports_table.sport_id = pending_matches_table.sport_id
    ORDER BY
      days_table.event_date ASC,
      days_table.start_time ASC,
      locations_table.position ASC,
      locations_table.name ASC
    LIMIT 1
  ) AS schedule_candidates ON TRUE
  ORDER BY
    pending_matches_table.round_number ASC,
    pending_matches_table.round_match_index ASC,
    CASE pending_matches_table.naipe
      WHEN 'MASCULINO' THEN 1
      WHEN 'FEMININO' THEN 2
      WHEN 'MISTO' THEN 3
      ELSE 4
    END ASC,
    priorities_table.sport_priority ASC,
    md5(
      pending_matches_table.group_id::text
      || pending_matches_table.home_team_id::text
      || pending_matches_table.away_team_id::text
    ) ASC,
    pending_matches_table.group_number ASC,
    pending_matches_table.competition_priority ASC,
    pending_matches_table.group_match_slot ASC;

  WHILE EXISTS (SELECT 1 FROM temp_ordered_group_matches) LOOP
    SELECT scheduled_date
    INTO selected_queue_date
    FROM temp_ordered_group_matches
    ORDER BY scheduled_date ASC, row_id ASC
    LIMIT 1;

    SELECT court_count
    INTO selected_day_courts_count
    FROM temp_day_court_counts
    WHERE event_date = selected_queue_date;

    IF selected_day_courts_count IS NULL OR selected_day_courts_count < 1 THEN
      selected_day_courts_count := 1;
    END IF;

    candidate_queue_position := COALESCE((
      SELECT MAX(assigned_slots_table.scheduled_slot)
      FROM temp_assigned_queue_slots AS assigned_slots_table
      WHERE assigned_slots_table.scheduled_date = selected_queue_date
    ), 0) + 1;

    LOOP
      current_slot_match_count := 0;

      FOR pending_group_match_record IN
        SELECT *
        FROM temp_ordered_group_matches
        WHERE scheduled_date = selected_queue_date
        ORDER BY row_id ASC
      LOOP
        EXIT WHEN current_slot_match_count >= selected_day_courts_count;
        pending_home_team_identity := pending_group_match_record.home_team_identity;
        pending_away_team_identity := pending_group_match_record.away_team_identity;
        pending_sport_identity := pending_group_match_record.sport_identity;

        SELECT COALESCE(sport_courts_table.court_count, 1)
        INTO current_sport_slot_count
        FROM temp_day_sport_court_counts AS sport_courts_table
        WHERE sport_courts_table.event_date = selected_queue_date
          AND sport_courts_table.sport_identity = pending_sport_identity;

        IF current_sport_slot_count IS NULL OR current_sport_slot_count < 1 THEN
          current_sport_slot_count := 1;
        END IF;

        SELECT COUNT(*)
        INTO current_sport_slot_match_count
        FROM temp_assigned_queue_slots AS assigned_slots_table
        WHERE assigned_slots_table.scheduled_date = selected_queue_date
          AND assigned_slots_table.scheduled_slot = candidate_queue_position
          AND assigned_slots_table.sport_identity = pending_sport_identity;

        IF current_sport_slot_match_count >= current_sport_slot_count THEN
          CONTINUE;
        END IF;

        same_team_same_slot_conflict_exists := EXISTS (
          SELECT 1
          FROM temp_assigned_queue_slots AS assigned_slots_table
          WHERE assigned_slots_table.scheduled_date = selected_queue_date
            AND assigned_slots_table.scheduled_slot = candidate_queue_position
            AND (
              assigned_slots_table.home_team_identity IN (pending_home_team_identity, pending_away_team_identity)
              OR assigned_slots_table.away_team_identity IN (pending_home_team_identity, pending_away_team_identity)
            )
        );

        same_team_same_naipe_recent_conflict_exists := EXISTS (
          SELECT 1
          FROM temp_assigned_queue_slots AS assigned_slots_table
          WHERE assigned_slots_table.scheduled_date = selected_queue_date
            AND assigned_slots_table.naipe = pending_group_match_record.naipe
            AND assigned_slots_table.scheduled_slot IN (candidate_queue_position, candidate_queue_position - 1)
            AND (
              assigned_slots_table.home_team_identity IN (pending_home_team_identity, pending_away_team_identity)
              OR assigned_slots_table.away_team_identity IN (pending_home_team_identity, pending_away_team_identity)
            )
        );

        IF same_team_same_slot_conflict_exists OR same_team_same_naipe_recent_conflict_exists THEN
          CONTINUE;
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
          scheduled_date,
          scheduled_slot,
          queue_position,
          start_time,
          end_time,
          season_year,
          status
        ) VALUES (
          _championship_id,
          pending_group_match_record.division,
          pending_group_match_record.naipe,
          pending_group_match_record.sport_id,
          pending_group_match_record.home_team_id,
          pending_group_match_record.away_team_id,
          pending_group_match_record.location_name,
          NULL,
          selected_queue_date,
          candidate_queue_position,
          candidate_queue_position,
          NULL,
          NULL,
          championship_current_season_year,
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
          pending_group_match_record.competition_id,
          pending_group_match_record.group_id,
          'GROUP_STAGE'::public.bracket_phase,
          pending_group_match_record.round_number,
          pending_group_match_record.competition_slot_number,
          new_match_id,
          pending_group_match_record.home_team_id,
          pending_group_match_record.away_team_id
        );

        INSERT INTO temp_assigned_queue_slots (
          scheduled_date,
          scheduled_slot,
          sport_id,
          sport_identity,
          naipe,
          home_team_id,
          away_team_id,
          home_team_identity,
          away_team_identity
        ) VALUES (
          selected_queue_date,
          candidate_queue_position,
          pending_group_match_record.sport_id,
          pending_sport_identity,
          pending_group_match_record.naipe,
          pending_group_match_record.home_team_id,
          pending_group_match_record.away_team_id,
          pending_home_team_identity,
          pending_away_team_identity
        );

        DELETE FROM temp_ordered_group_matches
        WHERE row_id = pending_group_match_record.row_id;

        current_slot_match_count := current_slot_match_count + 1;
      END LOOP;

      EXIT WHEN current_slot_match_count > 0;
      candidate_queue_position := candidate_queue_position + 1;
    END LOOP;
  END LOOP;

  UPDATE public.championship_bracket_editions
  SET
    status = 'GROUPS_GENERATED'::public.bracket_edition_status,
    updated_at = now()
  WHERE id = bracket_edition_id;

  UPDATE public.championships
  SET status = 'UPCOMING'::public.championship_status
  WHERE id = _championship_id;

  RETURN bracket_edition_id;
END;
$$;

COMMENT ON FUNCTION public.generate_championship_bracket_groups(UUID, JSONB)
IS 'Cria edição de chaveamento por temporada, gera confrontos da fase de grupos por round-robin e usa queue_position e scheduled_slot como o slot global do dia, limitado pela quantidade real de quadras disponíveis por dia e por modalidade. O algoritmo impede a mesma atlética no mesmo slot entre modalidades distintas, impede repetição da mesma atlética no mesmo naipe no slot atual ou no slot imediatamente seguinte e flexibiliza a ordem dos grupos para reduzir conflitos de agenda.';

NOTIFY pgrst, 'reload schema';