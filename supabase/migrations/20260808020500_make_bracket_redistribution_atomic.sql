-- Faz a aplicação final da redistribuição da grade de forma atômica.
--
-- A função redistribute_bracket_scheduled_matches() já calcula e valida
-- toda a nova distribuição em tabelas temporárias antes de atualizar
-- public.matches.
--
-- O problema anterior era que os triggers de conflito e de fila eram
-- executados registro por registro durante o UPDATE final.
--
-- Isso fazia o trigger enxergar temporariamente uma mistura de:
--
-- - partidas ainda na posição antiga;
-- - partidas já na posição nova.
--
-- Como consequência, uma programação final válida podia gerar
-- falsos conflitos de descanso durante a transição.
--
-- Durante a materialização da distribuição já validada, desabilitamos
-- temporariamente esses dois triggers lógicos, seguindo o mesmo padrão
-- já utilizado em outras operações atômicas de troca de posição.

DO $migration_make_bracket_redistribution_atomic$
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
    'app.skip_match_conflict_trigger'
  ) > 0 THEN
    RETURN;
  END IF;


  source_block :=
$source$
  UPDATE public.matches AS matches_table
  SET queue_position = NULL
  FROM tmp_global_assignment_queue_positions AS assignment_queue_positions_table
  WHERE assignment_queue_positions_table.match_id = matches_table.id;

  UPDATE public.matches AS matches_table
  SET
    scheduled_date = assignment_queue_positions_table.new_scheduled_date,
    scheduled_slot = assignment_queue_positions_table.new_scheduled_slot,
    queue_position = assignment_queue_positions_table.new_queue_position,
    location = assignment_queue_positions_table.location_name,
    court_name = assignment_queue_positions_table.court_name,
    start_time = assignment_queue_positions_table.planned_start_at,
    end_time = assignment_queue_positions_table.planned_end_at
  FROM tmp_global_assignment_queue_positions AS assignment_queue_positions_table
  WHERE assignment_queue_positions_table.match_id = matches_table.id;

  PERFORM public.apply_society_2026_official_schedule(_bracket_edition_id);
$source$;


  target_block :=
$target$
  /*
   * A distribuição já foi integralmente validada em
   * tmp_global_assignments.
   *
   * Os triggers abaixo precisam ser ignorados somente durante a
   * materialização da mudança porque um UPDATE em massa é executado
   * linha por linha pelo PostgreSQL.
   *
   * Sem este bloco, o trigger pode comparar uma partida já movida
   * com outra que ainda está temporariamente na posição antiga.
   */
  BEGIN
    PERFORM set_config(
      'app.skip_queue_trigger',
      'true',
      true
    );

    PERFORM set_config(
      'app.skip_match_conflict_trigger',
      'true',
      true
    );


    /*
     * Libera as posições antigas antes de escrever a nova fila.
     */
    UPDATE public.matches
      AS matches_table
    SET
      queue_position = NULL

    FROM
      tmp_global_assignment_queue_positions
        AS assignment_queue_positions_table

    WHERE assignment_queue_positions_table.match_id =
      matches_table.id;


    /*
     * Materializa exatamente a distribuição calculada e validada.
     */
    UPDATE public.matches
      AS matches_table
    SET
      scheduled_date =
        assignment_queue_positions_table.new_scheduled_date,

      scheduled_slot =
        assignment_queue_positions_table.new_scheduled_slot,

      queue_position =
        assignment_queue_positions_table.new_queue_position,

      location =
        assignment_queue_positions_table.location_name,

      court_name =
        assignment_queue_positions_table.court_name,

      start_time =
        assignment_queue_positions_table.planned_start_at,

      end_time =
        assignment_queue_positions_table.planned_end_at

    FROM
      tmp_global_assignment_queue_positions
        AS assignment_queue_positions_table

    WHERE assignment_queue_positions_table.match_id =
      matches_table.id;


    PERFORM set_config(
      'app.skip_match_conflict_trigger',
      'false',
      true
    );

    PERFORM set_config(
      'app.skip_queue_trigger',
      'false',
      true
    );


  EXCEPTION
    WHEN OTHERS
    THEN
      /*
       * Nunca deixa os flags ligados caso alguma etapa da
       * materialização falhe.
       */
      PERFORM set_config(
        'app.skip_match_conflict_trigger',
        'false',
        true
      );

      PERFORM set_config(
        'app.skip_queue_trigger',
        'false',
        true
      );

      RAISE;
  END;


  /*
   * A programação especial da Society roda novamente com as
   * validações normais habilitadas.
   */
  PERFORM public.apply_society_2026_official_schedule(
    _bracket_edition_id
  );
$target$;


  IF strpos(
    function_definition,
    source_block
  ) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível localizar o bloco final de materialização da redistribuição.';
  END IF;


  updated_definition :=
    replace(
      function_definition,
      source_block,
      target_block
    );


  IF strpos(
    updated_definition,
    'app.skip_match_conflict_trigger'
  ) = 0
    OR strpos(
      updated_definition,
      'app.skip_queue_trigger'
    ) = 0
  THEN
    RAISE EXCEPTION
      'Não foi possível instalar a aplicação atômica da redistribuição.';
  END IF;


  EXECUTE updated_definition;
END;
$migration_make_bracket_redistribution_atomic$;


COMMENT ON FUNCTION
  public.redistribute_bracket_scheduled_matches(
    UUID
  )
IS
  'Redistribui os jogos da edição respeitando disponibilidade, descanso, prioridade, sequenciamento e ocupações. A materialização final da distribuição previamente validada é aplicada atomicamente para evitar falsos conflitos causados por estados intermediários dos UPDATEs.';


NOTIFY pgrst, 'reload schema';