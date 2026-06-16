-- Insere ATENUN x TAUROS (FEM) no jogo 7 da Quadra A em 20/06/2026,
-- empurra em cascata os confrontos seguintes da mesma quadra e move
-- GARRUDOS x AAAUS (MASC) para o primeiro slot de 21/06/2026.
--
-- A migration preserva o horário do slot de destino:
-- - cada confronto assume exatamente o start_time/end_time já existente
--   naquele slot da Quadra A;
-- - a fila operacional (queue_position) é recalculada apenas para
--   Futebol Society nos dias 20/06/2026 e 21/06/2026;
-- - validações finais impedem horários duplicados, conflitos de descanso
--   e conflitos residuais de representação.

DO $$
DECLARE
  expected_state_mismatches_count INTEGER := 0;
  duplicate_court_slot_times_count INTEGER := 0;
  same_court_same_naipe_conflicts_count INTEGER := 0;
  same_court_different_naipe_conflicts_count INTEGER := 0;
  cross_court_same_naipe_conflicts_count INTEGER := 0;
  representation_conflicts_count INTEGER := 0;
BEGIN
  WITH expected_state AS (
    SELECT *
    FROM (
      VALUES
        ('7f6990ef-6ee7-4847-bcdf-d117179150e9'::uuid, date '2026-06-21', 1),
        ('ea7a6776-d7a1-4af3-b98c-16f23de584d4'::uuid, date '2026-06-20', 7),
        ('a592f17b-d382-451f-8458-2f04e4e47bbb'::uuid, date '2026-06-20', 8),
        ('d8a90f4b-3cec-47dc-a4b2-a029badebd62'::uuid, date '2026-06-20', 9),
        ('365407ea-3e25-4604-8f23-9b4157139c1e'::uuid, date '2026-06-20', 10),
        ('04b2a76a-a5ab-4d3a-9f17-0a29a447ecbf'::uuid, date '2026-06-20', 11),
        ('007a5816-43b6-4f83-9da6-11f4dae49023'::uuid, date '2026-06-20', 12),
        ('68e1e25c-b172-4b66-bb70-d4f7c2f9d23a'::uuid, date '2026-06-20', 13),
        ('3090dafa-19c3-4341-a63a-96d9c0ef8921'::uuid, date '2026-06-20', 14),
        ('2cc63b26-6ddf-4bcb-9f18-9c0ed3a47265'::uuid, date '2026-06-20', 15),
        ('df051680-977b-415c-b427-e2043edd971d'::uuid, date '2026-06-20', 16),
        ('23df8da8-06dd-4ff2-9f20-3f9ee4fc7104'::uuid, date '2026-06-20', 17),
        ('a11679ee-088f-4592-8587-237cb7c26250'::uuid, date '2026-06-20', 18)
    ) AS value_table(match_id, scheduled_date, scheduled_slot)
  )
  SELECT COUNT(*)
  INTO expected_state_mismatches_count
  FROM expected_state
  LEFT JOIN public.matches AS matches_table
    ON matches_table.id = expected_state.match_id
   AND matches_table.status = 'SCHEDULED'::public.match_status
   AND matches_table.location = 'Arena Seven'
   AND matches_table.court_name = 'Quadra A'
   AND matches_table.scheduled_date = expected_state.scheduled_date
   AND COALESCE(matches_table.scheduled_slot, matches_table.queue_position) = expected_state.scheduled_slot
  WHERE matches_table.id IS NULL;

  IF expected_state_mismatches_count > 0 THEN
    RAISE EXCEPTION
      'A migration 20260616155130 espera uma fila específica da Quadra A, mas encontrou % divergência(s). Revise a agenda antes de aplicar.',
      expected_state_mismatches_count;
  END IF;

  CREATE TEMP TABLE tmp_quadra_a_slot_templates ON COMMIT DROP AS
  SELECT
    matches_table.scheduled_date,
    COALESCE(matches_table.scheduled_slot, matches_table.queue_position) AS scheduled_slot,
    matches_table.start_time,
    matches_table.end_time
  FROM public.matches AS matches_table
  WHERE matches_table.championship_id = '17b92cf5-dd92-44eb-9295-b28000372e4b'::uuid
    AND matches_table.season_year = 2026
    AND matches_table.sport_id = '753bee02-fc22-4c72-8d7f-70adaa5e4a6b'::uuid
    AND matches_table.status = 'SCHEDULED'::public.match_status
    AND matches_table.location = 'Arena Seven'
    AND matches_table.court_name = 'Quadra A'
    AND (
      (matches_table.scheduled_date = date '2026-06-20'
        AND COALESCE(matches_table.scheduled_slot, matches_table.queue_position) BETWEEN 7 AND 18)
      OR (matches_table.scheduled_date = date '2026-06-21'
        AND COALESCE(matches_table.scheduled_slot, matches_table.queue_position) = 1)
    );

  PERFORM set_config('app.skip_queue_trigger', 'true', true);
  PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);

  ALTER TABLE public.matches DISABLE TRIGGER check_match_conflict;

  UPDATE public.matches AS matches_table
  SET queue_position = NULL
  WHERE matches_table.championship_id = '17b92cf5-dd92-44eb-9295-b28000372e4b'::uuid
    AND matches_table.season_year = 2026
    AND matches_table.sport_id = '753bee02-fc22-4c72-8d7f-70adaa5e4a6b'::uuid
    AND matches_table.status = 'SCHEDULED'::public.match_status
    AND matches_table.scheduled_date IN (date '2026-06-20', date '2026-06-21');

  WITH affected_matches AS (
    SELECT match_id
    FROM (
      VALUES
        ('7f6990ef-6ee7-4847-bcdf-d117179150e9'::uuid),
        ('ea7a6776-d7a1-4af3-b98c-16f23de584d4'::uuid),
        ('a592f17b-d382-451f-8458-2f04e4e47bbb'::uuid),
        ('d8a90f4b-3cec-47dc-a4b2-a029badebd62'::uuid),
        ('365407ea-3e25-4604-8f23-9b4157139c1e'::uuid),
        ('04b2a76a-a5ab-4d3a-9f17-0a29a447ecbf'::uuid),
        ('007a5816-43b6-4f83-9da6-11f4dae49023'::uuid),
        ('68e1e25c-b172-4b66-bb70-d4f7c2f9d23a'::uuid),
        ('3090dafa-19c3-4341-a63a-96d9c0ef8921'::uuid),
        ('2cc63b26-6ddf-4bcb-9f18-9c0ed3a47265'::uuid),
        ('df051680-977b-415c-b427-e2043edd971d'::uuid),
        ('23df8da8-06dd-4ff2-9f20-3f9ee4fc7104'::uuid),
        ('a11679ee-088f-4592-8587-237cb7c26250'::uuid)
    ) AS value_table(match_id)
  )
  UPDATE public.matches AS matches_table
  SET
    scheduled_slot = NULL
  FROM affected_matches
  WHERE matches_table.id = affected_matches.match_id;

  WITH planned_updates AS (
    SELECT *
    FROM (
      VALUES
        ('7f6990ef-6ee7-4847-bcdf-d117179150e9'::uuid, date '2026-06-20', 7),
        ('ea7a6776-d7a1-4af3-b98c-16f23de584d4'::uuid, date '2026-06-20', 8),
        ('a592f17b-d382-451f-8458-2f04e4e47bbb'::uuid, date '2026-06-20', 9),
        ('d8a90f4b-3cec-47dc-a4b2-a029badebd62'::uuid, date '2026-06-20', 10),
        ('365407ea-3e25-4604-8f23-9b4157139c1e'::uuid, date '2026-06-20', 11),
        ('04b2a76a-a5ab-4d3a-9f17-0a29a447ecbf'::uuid, date '2026-06-20', 12),
        ('007a5816-43b6-4f83-9da6-11f4dae49023'::uuid, date '2026-06-20', 13),
        ('68e1e25c-b172-4b66-bb70-d4f7c2f9d23a'::uuid, date '2026-06-20', 14),
        ('3090dafa-19c3-4341-a63a-96d9c0ef8921'::uuid, date '2026-06-20', 15),
        ('2cc63b26-6ddf-4bcb-9f18-9c0ed3a47265'::uuid, date '2026-06-20', 16),
        ('df051680-977b-415c-b427-e2043edd971d'::uuid, date '2026-06-20', 17),
        ('23df8da8-06dd-4ff2-9f20-3f9ee4fc7104'::uuid, date '2026-06-20', 18),
        ('a11679ee-088f-4592-8587-237cb7c26250'::uuid, date '2026-06-21', 1)
    ) AS value_table(match_id, scheduled_date, scheduled_slot)
  ),
  resolved_updates AS (
    SELECT
      planned_updates.match_id,
      planned_updates.scheduled_date,
      planned_updates.scheduled_slot,
      slot_templates.start_time,
      slot_templates.end_time
    FROM planned_updates
    INNER JOIN tmp_quadra_a_slot_templates AS slot_templates
      ON slot_templates.scheduled_date = planned_updates.scheduled_date
     AND slot_templates.scheduled_slot = planned_updates.scheduled_slot
  )
  UPDATE public.matches AS matches_table
  SET
    scheduled_date = resolved_updates.scheduled_date,
    scheduled_slot = resolved_updates.scheduled_slot,
    start_time = resolved_updates.start_time,
    end_time = resolved_updates.end_time
  FROM resolved_updates
  WHERE matches_table.id = resolved_updates.match_id;

  WITH resequenced_matches AS (
    SELECT
      matches_table.id,
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
      ) AS next_queue_position
    FROM public.matches AS matches_table
    WHERE matches_table.championship_id = '17b92cf5-dd92-44eb-9295-b28000372e4b'::uuid
      AND matches_table.season_year = 2026
      AND matches_table.sport_id = '753bee02-fc22-4c72-8d7f-70adaa5e4a6b'::uuid
      AND matches_table.status = 'SCHEDULED'::public.match_status
      AND matches_table.scheduled_date IN (date '2026-06-20', date '2026-06-21')
  )
  UPDATE public.matches AS matches_table
  SET queue_position = resequenced_matches.next_queue_position
  FROM resequenced_matches
  WHERE matches_table.id = resequenced_matches.id;

  WITH scoped_matches AS (
    SELECT
      matches_table.id,
      matches_table.scheduled_date,
      matches_table.location,
      matches_table.court_name,
      matches_table.start_time,
      matches_table.naipe,
      matches_table.home_team_id,
      matches_table.away_team_id,
      COALESCE(matches_table.manual_representation_mode, 'AUTO') AS manual_representation_mode,
      GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1) AS duration_minutes
    FROM public.matches AS matches_table
    LEFT JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = matches_table.championship_id
      AND championship_sports_table.sport_id = matches_table.sport_id
    WHERE matches_table.championship_id = '17b92cf5-dd92-44eb-9295-b28000372e4b'::uuid
      AND matches_table.season_year = 2026
      AND matches_table.sport_id = '753bee02-fc22-4c72-8d7f-70adaa5e4a6b'::uuid
      AND matches_table.status = 'SCHEDULED'::public.match_status
      AND matches_table.scheduled_date IN (date '2026-06-20', date '2026-06-21')
      AND NULLIF(trim(COALESCE(matches_table.location, '')), '') IS NOT NULL
      AND NULLIF(trim(COALESCE(matches_table.court_name, '')), '') IS NOT NULL
  ),
  ordered_court_matches AS (
    SELECT
      scoped_matches.*,
      ROW_NUMBER() OVER (
        PARTITION BY
          scoped_matches.scheduled_date,
          public.normalize_bracket_entity_name(scoped_matches.location),
          public.normalize_bracket_entity_name(scoped_matches.court_name)
        ORDER BY
          scoped_matches.start_time ASC,
          scoped_matches.id ASC
      ) AS court_sequence_index,
      LAG(scoped_matches.home_team_id) OVER (
        PARTITION BY
          scoped_matches.scheduled_date,
          public.normalize_bracket_entity_name(scoped_matches.location),
          public.normalize_bracket_entity_name(scoped_matches.court_name)
        ORDER BY
          scoped_matches.start_time ASC,
          scoped_matches.id ASC
      ) AS previous_home_team_id,
      LAG(scoped_matches.away_team_id) OVER (
        PARTITION BY
          scoped_matches.scheduled_date,
          public.normalize_bracket_entity_name(scoped_matches.location),
          public.normalize_bracket_entity_name(scoped_matches.court_name)
        ORDER BY
          scoped_matches.start_time ASC,
          scoped_matches.id ASC
      ) AS previous_away_team_id
    FROM scoped_matches
  ),
  duplicated_court_slot_times AS (
    SELECT 1
    FROM scoped_matches AS scoped_matches
    GROUP BY
      scoped_matches.scheduled_date,
      public.normalize_bracket_entity_name(scoped_matches.location),
      public.normalize_bracket_entity_name(scoped_matches.court_name),
      scoped_matches.start_time
    HAVING COUNT(*) > 1
  ),
  same_court_same_naipe_conflicts AS (
    SELECT 1
    FROM ordered_court_matches AS first_match
    JOIN ordered_court_matches AS second_match
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
  same_court_different_naipe_conflicts AS (
    SELECT 1
    FROM ordered_court_matches AS first_match
    JOIN ordered_court_matches AS second_match
      ON second_match.id <> first_match.id
    WHERE first_match.naipe <> second_match.naipe
      AND first_match.scheduled_date = second_match.scheduled_date
      AND public.normalize_bracket_entity_name(first_match.location) = public.normalize_bracket_entity_name(second_match.location)
      AND public.normalize_bracket_entity_name(first_match.court_name) = public.normalize_bracket_entity_name(second_match.court_name)
      AND ABS(first_match.court_sequence_index - second_match.court_sequence_index) < 2
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
  ),
  representation_conflicts AS (
    SELECT 1
    FROM ordered_court_matches AS ordered_court_matches
    WHERE ordered_court_matches.manual_representation_mode != 'CO'
      AND (
        ordered_court_matches.previous_home_team_id IN (
          ordered_court_matches.home_team_id,
          ordered_court_matches.away_team_id
        )
        OR ordered_court_matches.previous_away_team_id IN (
          ordered_court_matches.home_team_id,
          ordered_court_matches.away_team_id
        )
      )
    LIMIT 1
  )
  SELECT
    CASE WHEN EXISTS (SELECT 1 FROM duplicated_court_slot_times) THEN 1 ELSE 0 END,
    CASE WHEN EXISTS (SELECT 1 FROM same_court_same_naipe_conflicts) THEN 1 ELSE 0 END,
    CASE WHEN EXISTS (SELECT 1 FROM same_court_different_naipe_conflicts) THEN 1 ELSE 0 END,
    CASE WHEN EXISTS (SELECT 1 FROM cross_court_same_naipe_conflicts) THEN 1 ELSE 0 END,
    CASE WHEN EXISTS (SELECT 1 FROM representation_conflicts) THEN 1 ELSE 0 END
  INTO
    duplicate_court_slot_times_count,
    same_court_same_naipe_conflicts_count,
    same_court_different_naipe_conflicts_count,
    cross_court_same_naipe_conflicts_count,
    representation_conflicts_count;

  ALTER TABLE public.matches ENABLE TRIGGER check_match_conflict;

  IF duplicate_court_slot_times_count > 0 THEN
    RAISE EXCEPTION 'A migration deixou horários duplicados na mesma quadra.';
  END IF;

  IF same_court_same_naipe_conflicts_count > 0 THEN
    RAISE EXCEPTION 'A migration ainda deixou conflito de descanso do mesmo naipe na mesma quadra.';
  END IF;

  IF same_court_different_naipe_conflicts_count > 0 THEN
    RAISE EXCEPTION 'A migration ainda deixou conflito de descanso entre naipes diferentes na mesma quadra.';
  END IF;

  IF cross_court_same_naipe_conflicts_count > 0 THEN
    RAISE EXCEPTION 'A migration ainda deixou conflito de descanso do mesmo naipe entre quadras no mesmo dia.';
  END IF;

  IF representation_conflicts_count > 0 THEN
    RAISE EXCEPTION 'A migration ainda deixou conflito de representação na mesma quadra.';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    ALTER TABLE public.matches ENABLE TRIGGER check_match_conflict;
    RAISE;
END;
$$;
