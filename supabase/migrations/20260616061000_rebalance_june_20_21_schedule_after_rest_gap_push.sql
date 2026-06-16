DO $$
DECLARE
  duplicated_court_slots_count INTEGER := 0;
  same_court_same_naipe_conflicts_count INTEGER := 0;
  cross_court_same_naipe_conflicts_count INTEGER := 0;
BEGIN
  PERFORM set_config('app.skip_queue_trigger', 'true', true);
  PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);

  ALTER TABLE public.matches DISABLE TRIGGER check_match_conflict;

  UPDATE public.matches AS matches_table
  SET
    scheduled_slot = NULL,
    queue_position = NULL
  WHERE matches_table.championship_id = '17b92cf5-dd92-44eb-9295-b28000372e4b'::uuid
    AND matches_table.season_year = 2026
    AND matches_table.sport_id = '753bee02-fc22-4c72-8d7f-70adaa5e4a6b'::uuid
    AND matches_table.status = 'SCHEDULED'::public.match_status
    AND matches_table.scheduled_date IN (date '2026-06-20', date '2026-06-21');

  UPDATE public.matches AS matches_table
  SET
    scheduled_date = planned_updates.scheduled_date,
    location = planned_updates.location,
    court_name = planned_updates.court_name,
    start_time = public.combine_bracket_schedule_timestamp(
      planned_updates.scheduled_date,
      planned_updates.start_local_time
    ),
    end_time = public.combine_bracket_schedule_timestamp(
      planned_updates.scheduled_date,
      planned_updates.start_local_time
    ) + interval '35 minutes'
  FROM (
    VALUES
      -- Dia 20/06: remove o último jogo pendente do Acesso da fila de 21/06.
      ('6897a717-6d8e-4617-b9e6-c1b96db228e2'::uuid, date '2026-06-20', 'Arena Seven', 'Quadra B', time '09:20'),

      -- Dia 21/06: Acesso termina primeiro na Quadra B.
      ('362b09e9-7880-4739-b9af-92845aa2d7f5'::uuid, date '2026-06-21', 'Arena Seven', 'Quadra B', time '08:00'),
      ('5715e7b3-5d7c-4223-b7a2-0e1d41d0b7db'::uuid, date '2026-06-21', 'Arena Seven', 'Quadra B', time '08:40'),

      -- Dia 21/06: Principal ocupa a Quadra A cedo e só usa a B depois do Acesso.
      ('f328e865-f6ec-457a-b096-0f43926ec650'::uuid, date '2026-06-21', 'Arena Seven', 'Quadra A', time '08:00'),
      ('df051680-977b-415c-b427-e2043edd971d'::uuid, date '2026-06-21', 'Arena Seven', 'Quadra A', time '08:40'),
      ('7f6990ef-6ee7-4847-bcdf-d117179150e9'::uuid, date '2026-06-21', 'Arena Seven', 'Quadra A', time '09:20'),
      ('3090dafa-19c3-4341-a63a-96d9c0ef8921'::uuid, date '2026-06-21', 'Arena Seven', 'Quadra A', time '10:00'),
      ('04b2a76a-a5ab-4d3a-9f17-0a29a447ecbf'::uuid, date '2026-06-21', 'Arena Seven', 'Quadra A', time '10:40'),
      ('7309473e-c99c-4a14-bb0a-c70a45f499f0'::uuid, date '2026-06-21', 'Arena Seven', 'Quadra A', time '11:20'),
      ('1de48bbc-c2d7-4c9d-9b62-a30b4ba1950f'::uuid, date '2026-06-21', 'Arena Seven', 'Quadra A', time '13:00'),
      ('b946aa22-fdbc-4017-a635-6569673e6434'::uuid, date '2026-06-21', 'Arena Seven', 'Quadra B', time '13:40'),
      ('296efc7c-464f-4810-bb37-a7d1be2d8b67'::uuid, date '2026-06-21', 'Arena Seven', 'Quadra B', time '15:40')
  ) AS planned_updates(match_id, scheduled_date, location, court_name, start_local_time)
  WHERE matches_table.id = planned_updates.match_id;

  WITH resequenced_slots AS (
    SELECT
      matches_table.id,
      DENSE_RANK() OVER (
        PARTITION BY matches_table.scheduled_date
        ORDER BY
          matches_table.start_time ASC,
          matches_table.location ASC,
          matches_table.court_name ASC,
          matches_table.id ASC
      ) AS new_scheduled_slot,
      ROW_NUMBER() OVER (
        PARTITION BY
          matches_table.scheduled_date,
          matches_table.sport_id,
          matches_table.naipe,
          public.coerce_division_for_index(matches_table.division)
        ORDER BY
          matches_table.start_time ASC,
          matches_table.location ASC,
          matches_table.court_name ASC,
          matches_table.id ASC
      ) AS new_queue_position
    FROM public.matches AS matches_table
    WHERE matches_table.championship_id = '17b92cf5-dd92-44eb-9295-b28000372e4b'::uuid
      AND matches_table.season_year = 2026
      AND matches_table.sport_id = '753bee02-fc22-4c72-8d7f-70adaa5e4a6b'::uuid
      AND matches_table.status = 'SCHEDULED'::public.match_status
      AND matches_table.scheduled_date IN (date '2026-06-20', date '2026-06-21')
  )
  UPDATE public.matches AS matches_table
  SET
    scheduled_slot = resequenced_slots.new_scheduled_slot,
    queue_position = resequenced_slots.new_queue_position
  FROM resequenced_slots
  WHERE matches_table.id = resequenced_slots.id;

  WITH duplicated_court_slots AS (
    SELECT 1
    FROM public.matches AS matches_table
    WHERE matches_table.championship_id = '17b92cf5-dd92-44eb-9295-b28000372e4b'::uuid
      AND matches_table.season_year = 2026
      AND matches_table.sport_id = '753bee02-fc22-4c72-8d7f-70adaa5e4a6b'::uuid
      AND matches_table.status = 'SCHEDULED'::public.match_status
      AND matches_table.scheduled_date IN (date '2026-06-20', date '2026-06-21')
    GROUP BY
      matches_table.scheduled_date,
      public.normalize_bracket_entity_name(matches_table.location),
      public.normalize_bracket_entity_name(matches_table.court_name),
      matches_table.start_time
    HAVING COUNT(*) > 1
  ),
  scoped_matches AS (
    SELECT
      matches_table.id,
      matches_table.scheduled_date,
      matches_table.location,
      matches_table.court_name,
      matches_table.start_time,
      matches_table.naipe,
      matches_table.home_team_id,
      matches_table.away_team_id,
      GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1) AS duration_minutes
    FROM public.matches AS matches_table
    LEFT JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = matches_table.championship_id
      AND championship_sports_table.sport_id = matches_table.sport_id
    WHERE matches_table.championship_id = '17b92cf5-dd92-44eb-9295-b28000372e4b'::uuid
      AND matches_table.season_year = 2026
      AND matches_table.sport_id = '753bee02-fc22-4c72-8d7f-70adaa5e4a6b'::uuid
      AND matches_table.status = 'SCHEDULED'::public.match_status
      AND matches_table.scheduled_date = date '2026-06-21'
      AND NULLIF(trim(COALESCE(matches_table.location, '')), '') IS NOT NULL
      AND NULLIF(trim(COALESCE(matches_table.court_name, '')), '') IS NOT NULL
  ),
  ordered_matches AS (
    SELECT
      scoped_matches.*,
      row_number() OVER (
        PARTITION BY
          scoped_matches.scheduled_date,
          public.normalize_bracket_entity_name(scoped_matches.location),
          public.normalize_bracket_entity_name(scoped_matches.court_name)
        ORDER BY
          scoped_matches.start_time ASC,
          scoped_matches.id ASC
      ) AS court_sequence_index
    FROM scoped_matches
  ),
  same_court_same_naipe_conflicts AS (
    SELECT 1
    FROM ordered_matches AS first_match
    JOIN ordered_matches AS second_match
      ON second_match.id <> first_match.id
    WHERE first_match.naipe = second_match.naipe
      AND first_match.scheduled_date = second_match.scheduled_date
      AND public.normalize_bracket_entity_name(first_match.location) = public.normalize_bracket_entity_name(second_match.location)
      AND public.normalize_bracket_entity_name(first_match.court_name) = public.normalize_bracket_entity_name(second_match.court_name)
      AND ABS(first_match.court_sequence_index - second_match.court_sequence_index) < 4
      AND (
        second_match.home_team_id IN (first_match.home_team_id, first_match.away_team_id)
        OR second_match.away_team_id IN (first_match.home_team_id, first_match.away_team_id)
      )
    LIMIT 1
  ),
  cross_court_same_naipe_conflicts AS (
    SELECT 1
    FROM scoped_matches AS first_match
    JOIN scoped_matches AS second_match
      ON second_match.id <> first_match.id
    WHERE first_match.naipe = second_match.naipe
      AND first_match.scheduled_date = second_match.scheduled_date
      AND (
        public.normalize_bracket_entity_name(first_match.location) <> public.normalize_bracket_entity_name(second_match.location)
        OR public.normalize_bracket_entity_name(first_match.court_name) <> public.normalize_bracket_entity_name(second_match.court_name)
      )
      AND (
        second_match.home_team_id IN (first_match.home_team_id, first_match.away_team_id)
        OR second_match.away_team_id IN (first_match.home_team_id, first_match.away_team_id)
      )
      AND first_match.start_time IS NOT NULL
      AND second_match.start_time IS NOT NULL
      AND ABS(EXTRACT(EPOCH FROM (second_match.start_time - first_match.start_time)) / 60.0)
        < GREATEST(first_match.duration_minutes, second_match.duration_minutes) * 4
    LIMIT 1
  )
  SELECT
    CASE WHEN EXISTS (SELECT 1 FROM duplicated_court_slots) THEN 1 ELSE 0 END,
    CASE WHEN EXISTS (SELECT 1 FROM same_court_same_naipe_conflicts) THEN 1 ELSE 0 END,
    CASE WHEN EXISTS (SELECT 1 FROM cross_court_same_naipe_conflicts) THEN 1 ELSE 0 END
  INTO
    duplicated_court_slots_count,
    same_court_same_naipe_conflicts_count,
    cross_court_same_naipe_conflicts_count;

  ALTER TABLE public.matches ENABLE TRIGGER check_match_conflict;

  IF duplicated_court_slots_count > 0 THEN
    RAISE EXCEPTION 'A migration deixou horários duplicados na mesma quadra.';
  END IF;

  IF same_court_same_naipe_conflicts_count > 0 OR cross_court_same_naipe_conflicts_count > 0 THEN
    RAISE EXCEPTION
      'A migration ainda deixou conflitos de descanso: mesma quadra=%, entre quadras=%.',
      same_court_same_naipe_conflicts_count,
      cross_court_same_naipe_conflicts_count;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    ALTER TABLE public.matches ENABLE TRIGGER check_match_conflict;
    RAISE;
END;
$$;
