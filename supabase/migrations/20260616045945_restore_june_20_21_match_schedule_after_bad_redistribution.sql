-- Restaura a grade conhecida dos dias 20/06/2026 e 21/06/2026 após uma
-- redistribuição global que deslocou confrontos para slots incorretos.
--
-- A correção é intencionalmente determinística:
-- 1. recoloca os jogos observados na agenda anterior em seus slots esperados;
-- 2. move os confrontos deslocados para slots livres compatíveis de 20/06;
-- 3. recalcula scheduled_slot (slot global do dia) e queue_position operacional
--    apenas para Futebol Society nesses dois dias.

DO $$
BEGIN
  PERFORM set_config('app.skip_queue_trigger', 'true', true);
  PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);

  UPDATE public.matches AS matches_table
  SET
    queue_position = NULL,
    scheduled_slot = NULL
  WHERE matches_table.championship_id = '17b92cf5-dd92-44eb-9295-b28000372e4b'::uuid
    AND matches_table.season_year = 2026
    AND matches_table.sport_id = '753bee02-fc22-4c72-8d7f-70adaa5e4a6b'::uuid
    AND matches_table.status = 'SCHEDULED'::public.match_status
    AND matches_table.scheduled_date IN (date '2026-06-20', date '2026-06-21');

  WITH planned_updates AS (
    SELECT *
    FROM (
      VALUES
        -- Dia 20/06/2026 - jogos deslocados de 21/06 realocados em slots livres
        ('df051680-977b-415c-b427-e2043edd971d'::uuid, date '2026-06-20', 'Arena Seven', 'Quadra B', time '08:40'),
        ('7f6990ef-6ee7-4847-bcdf-d117179150e9'::uuid, date '2026-06-20', 'Arena Seven', 'Quadra B', time '09:20'),
        ('362b09e9-7880-4739-b9af-92845aa2d7f5'::uuid, date '2026-06-20', 'Arena Seven', 'Quadra A', time '13:00'),
        ('7309473e-c99c-4a14-bb0a-c70a45f499f0'::uuid, date '2026-06-20', 'Arena Seven', 'Quadra A', time '13:40'),
        ('3090dafa-19c3-4341-a63a-96d9c0ef8921'::uuid, date '2026-06-20', 'Arena Seven', 'Quadra A', time '14:20'),
        ('296efc7c-464f-4810-bb37-a7d1be2d8b67'::uuid, date '2026-06-20', 'Arena Seven', 'Quadra A', time '15:40'),
        ('f328e865-f6ec-457a-b096-0f43926ec650'::uuid, date '2026-06-20', 'Arena Seven', 'Quadra A', time '20:20'),

        -- Dia 21/06/2026 - restaura a grade vista antes da redistribuição ruim
        ('9a704c7c-cbb8-4d58-afce-e5e2680c3a8a'::uuid, date '2026-06-21', 'Arena Seven', 'Quadra A', time '08:00'),
        ('c3aaec4d-1deb-4c4b-b739-d0533ca913ae'::uuid, date '2026-06-21', 'Arena Seven', 'Quadra A', time '08:40'),
        ('d7d187e2-dadb-4e2b-becb-728809882900'::uuid, date '2026-06-21', 'Arena Seven', 'Quadra A', time '09:20'),
        ('1de48bbc-c2d7-4c9d-9b62-a30b4ba1950f'::uuid, date '2026-06-21', 'Arena Seven', 'Quadra A', time '10:00'),
        ('6897a717-6d8e-4617-b9e6-c1b96db228e2'::uuid, date '2026-06-21', 'Arena Seven', 'Quadra A', time '10:40'),
        ('04b2a76a-a5ab-4d3a-9f17-0a29a447ecbf'::uuid, date '2026-06-21', 'Arena Seven', 'Quadra A', time '13:00'),
        ('5715e7b3-5d7c-4223-b7a2-0e1d41d0b7db'::uuid, date '2026-06-21', 'Arena Seven', 'Quadra B', time '08:00'),
        ('daf75ede-af2d-4500-b406-04cffe811aa8'::uuid, date '2026-06-21', 'Arena Seven', 'Quadra B', time '08:40'),
        ('a0f136f5-56cd-4165-b25f-a171c81459f9'::uuid, date '2026-06-21', 'Arena Seven', 'Quadra B', time '09:20'),
        ('b946aa22-fdbc-4017-a635-6569673e6434'::uuid, date '2026-06-21', 'Arena Seven', 'Quadra B', time '10:00'),
        ('acf23f19-30d8-49cf-be1a-4fca577409c4'::uuid, date '2026-06-21', 'Arena Seven', 'Quadra B', time '11:20')
    ) AS values_table(match_id, scheduled_date, location, court_name, start_local_time)
  ),
  updated_matches AS (
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
    FROM planned_updates
    WHERE matches_table.id = planned_updates.match_id
    RETURNING matches_table.id
  ),
  resequenced_slots AS (
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
END;
$$;
