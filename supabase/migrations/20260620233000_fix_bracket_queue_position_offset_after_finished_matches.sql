-- Evita colisão de queue_position ao gerar/reagendar partidas de chaveamento
-- depois que já existem partidas LIVE/FINISHED no mesmo dia/escopo.
--
-- Cenário observado em 2026-06-20:
-- - competição feminina divisão principal tinha partidas de fase de grupos já
--   encerradas com queue_position 1..10;
-- - ao encerrar a última partida por W.O., o trigger gerava o mata-mata e
--   redistribuía as partidas SCHEDULED do bracket começando novamente em 1;
-- - a primeira partida reagendada tentava ocupar queue_position já usado,
--   disparando o índice único matches_championship_season_year_queue_position_uidx.
--
-- Correção:
-- - ao recalcular a fila das partidas SCHEDULED do chaveamento, somar um offset
--   com a quantidade de partidas já existentes no mesmo
--   (scheduled_date, sport_id, naipe, division_scope), excluindo as próprias
--   partidas que estão sendo redistribuídas na transação atual.

DO $$
DECLARE
  function_signature REGPROCEDURE := to_regprocedure('public.redistribute_bracket_scheduled_matches(uuid)');
  function_definition TEXT;
  updated_definition TEXT;
  source_block TEXT := $source$
  DROP TABLE IF EXISTS tmp_global_assignment_queue_positions;
  CREATE TEMP TABLE tmp_global_assignment_queue_positions AS
  SELECT
    assignments_table.match_id,
    DENSE_RANK() OVER (
      PARTITION BY assignments_table.new_scheduled_date
      ORDER BY assignments_table.planned_start_at ASC
    ) AS new_scheduled_slot,
    ROW_NUMBER() OVER (
      PARTITION BY
        assignments_table.new_scheduled_date,
        assignments_table.sport_id,
        assignments_table.naipe,
        public.coerce_division_for_index(assignments_table.division)
      ORDER BY
        assignments_table.planned_start_at ASC,
        assignments_table.location_position ASC,
        assignments_table.court_position ASC,
        assignments_table.order_index ASC
    ) AS new_queue_position,
    assignments_table.new_scheduled_date,
    assignments_table.location_name,
    assignments_table.court_name,
    assignments_table.planned_start_at,
    assignments_table.planned_end_at
  FROM tmp_global_assignments AS assignments_table;
$source$;
  target_block TEXT := $target$
  DROP TABLE IF EXISTS tmp_global_assignment_queue_positions;
  CREATE TEMP TABLE tmp_global_assignment_queue_positions AS
  WITH assignment_scopes AS (
    SELECT DISTINCT
      assignments_table.new_scheduled_date,
      assignments_table.sport_id,
      assignments_table.naipe,
      public.coerce_division_for_index(assignments_table.division) AS division_scope
    FROM tmp_global_assignments AS assignments_table
  ),
  assignment_queue_scope_offsets AS (
    SELECT
      assignment_scopes.new_scheduled_date,
      assignment_scopes.sport_id,
      assignment_scopes.naipe,
      assignment_scopes.division_scope,
      COUNT(matches_table.id)::INTEGER AS existing_queue_offset
    FROM assignment_scopes
    LEFT JOIN public.matches AS matches_table
      ON matches_table.championship_id = bracket_edition_record.championship_id
      AND matches_table.season_year = bracket_edition_record.season_year
      AND matches_table.scheduled_date = assignment_scopes.new_scheduled_date
      AND matches_table.sport_id = assignment_scopes.sport_id
      AND matches_table.naipe = assignment_scopes.naipe
      AND public.coerce_division_for_index(matches_table.division) IS NOT DISTINCT FROM assignment_scopes.division_scope
      AND matches_table.queue_position IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM tmp_global_assignments AS current_assignments_table
        WHERE current_assignments_table.match_id = matches_table.id
      )
    GROUP BY
      assignment_scopes.new_scheduled_date,
      assignment_scopes.sport_id,
      assignment_scopes.naipe,
      assignment_scopes.division_scope
  )
  SELECT
    assignments_table.match_id,
    DENSE_RANK() OVER (
      PARTITION BY assignments_table.new_scheduled_date
      ORDER BY assignments_table.planned_start_at ASC
    ) AS new_scheduled_slot,
    (
      COALESCE(scope_offsets.existing_queue_offset, 0)
      + ROW_NUMBER() OVER (
        PARTITION BY
          assignments_table.new_scheduled_date,
          assignments_table.sport_id,
          assignments_table.naipe,
          public.coerce_division_for_index(assignments_table.division)
        ORDER BY
          assignments_table.planned_start_at ASC,
          assignments_table.location_position ASC,
          assignments_table.court_position ASC,
          assignments_table.order_index ASC
      )
    )::INTEGER AS new_queue_position,
    assignments_table.new_scheduled_date,
    assignments_table.location_name,
    assignments_table.court_name,
    assignments_table.planned_start_at,
    assignments_table.planned_end_at
  FROM tmp_global_assignments AS assignments_table
  LEFT JOIN assignment_queue_scope_offsets AS scope_offsets
    ON scope_offsets.new_scheduled_date = assignments_table.new_scheduled_date
    AND scope_offsets.sport_id = assignments_table.sport_id
    AND scope_offsets.naipe = assignments_table.naipe
    AND scope_offsets.division_scope IS NOT DISTINCT FROM public.coerce_division_for_index(assignments_table.division);
$target$;
BEGIN
  IF function_signature IS NULL THEN
    RAISE EXCEPTION 'Função public.redistribute_bracket_scheduled_matches(uuid) não encontrada.';
  END IF;

  SELECT pg_get_functiondef(function_signature)
  INTO function_definition;

  updated_definition := replace(function_definition, source_block, target_block);

  IF updated_definition = function_definition THEN
    RAISE EXCEPTION 'Não foi possível aplicar o ajuste de offset de queue_position na redistribuição do chaveamento.';
  END IF;

  EXECUTE updated_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
