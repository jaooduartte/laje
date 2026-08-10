-- Torna auditável o erro de jogos que não puderam ser encaixados.
--
-- Não altera nenhuma regra de distribuição.
-- Apenas informa quais modalidades/naipe/datas ficaram pendentes
-- quando redistribute_bracket_scheduled_matches() esgota os slots.
--
-- O diagnóstico não expõe atléticas.

DO $migration_detail_unassigned_matches$
DECLARE
  function_definition TEXT;
  updated_definition TEXT;

  source_block TEXT;
  target_block TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.redistribute_bracket_scheduled_matches(uuid)'
      ::regprocedure
  )
  INTO function_definition;


  IF function_definition IS NULL THEN
    RAISE EXCEPTION
      'A função redistribute_bracket_scheduled_matches(uuid) não existe.';
  END IF;


  /*
   * Reaplicação segura.
   */
  IF strpos(
    function_definition,
    'Detalhamento dos jogos pendentes:'
  ) > 0 THEN
    RETURN;
  END IF;


  source_block :=
$source$
  IF EXISTS (SELECT 1 FROM tmp_global_pending_matches) THEN
    RAISE EXCEPTION 'Não foi possível encaixar todos os jogos na grade disponível respeitando descanso e prioridade das quadras.';
  END IF;
$source$;


  target_block :=
$target$
  IF EXISTS (
    SELECT 1
    FROM tmp_global_pending_matches
  )
  THEN
    RAISE EXCEPTION
      'Não foi possível encaixar todos os jogos na grade disponível respeitando descanso e prioridade das quadras. Total pendente: %. Detalhamento dos jogos pendentes: %',
      (
        SELECT COUNT(*)::integer
        FROM tmp_global_pending_matches
      ),
      (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'modalidade',
                pending_summary.sport_name,

              'naipe',
                pending_summary.naipe,

              'data_original',
                pending_summary.original_scheduled_date,

              'jogos_pendentes',
                pending_summary.pending_count
            )
            ORDER BY
              pending_summary.original_scheduled_date ASC NULLS LAST,
              pending_summary.sport_name ASC,
              pending_summary.naipe ASC
          ),
          '[]'::jsonb
        )

        FROM (
          SELECT
            COALESCE(
              sports_table.name,
              pending_matches_table.sport_id::text
            ) AS sport_name,

            pending_matches_table.naipe,

            pending_matches_table.original_scheduled_date,

            COUNT(*)::integer
              AS pending_count

          FROM tmp_global_pending_matches
            AS pending_matches_table

          LEFT JOIN public.sports
            AS sports_table
            ON sports_table.id =
              pending_matches_table.sport_id

          GROUP BY
            COALESCE(
              sports_table.name,
              pending_matches_table.sport_id::text
            ),

            pending_matches_table.naipe,

            pending_matches_table.original_scheduled_date
        ) AS pending_summary
      );
  END IF;
$target$;


  IF strpos(
    function_definition,
    source_block
  ) = 0
  THEN
    RAISE EXCEPTION
      'Não foi possível localizar o tratamento atual de jogos pendentes.';
  END IF;


  updated_definition :=
    replace(
      function_definition,
      source_block,
      target_block
    );


  EXECUTE updated_definition;
END;
$migration_detail_unassigned_matches$;


COMMENT ON FUNCTION
  public.redistribute_bracket_scheduled_matches(
    UUID
  )
IS
  'Redistribui os jogos respeitando disponibilidade operacional, descanso, prioridade e sequenciamento. Quando a grade é insuficiente, informa quantidade de jogos pendentes por modalidade, naipe e data original.';


NOTIFY pgrst, 'reload schema';