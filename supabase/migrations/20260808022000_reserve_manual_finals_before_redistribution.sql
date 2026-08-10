-- Faz com que os blocos manuais de finais da Etapa 11 sejam tratados
-- como ocupações fixas antes da redistribuição dos jogos de grupos.
--
-- Antes desta correção, redistribute_bracket_scheduled_matches()
-- reconhecia somente finais que já possuíam uma partida KNOCKOUT
-- materializada.
--
-- Na geração inicial ainda não existe partida real da final.
-- Consequentemente, os grupos podiam ocupar os mesmos horários que
-- estavam reservados no payload para as finais manuais.
--
-- Depois, ao calcular as finais, elas eram empurradas para frente e
-- podiam chegar até depois da meia-noite.
--
-- Agora as finais configuradas manualmente também entram em
-- tmp_global_manual_final_matches antes da construção dos slots.

DO $migration_reserve_manual_finals_before_redistribution$
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
    'manual_final_payload_reservation'
  ) > 0 THEN
    RETURN;
  END IF;


  source_block :=
$source$
    AND NULLIF(
      trim(COALESCE(matches_table.court_name, '')),
      ''
    ) IS NOT NULL;

  DROP TABLE IF EXISTS tmp_global_locked_matches;
$source$;


  target_block :=
$target$
    AND NULLIF(
      trim(COALESCE(matches_table.court_name, '')),
      ''
    ) IS NOT NULL;


  /*
   * manual_final_payload_reservation
   *
   * Durante a geração inicial ainda não existem partidas reais das
   * finais.
   *
   * Mesmo assim os blocos configurados na Etapa 11 precisam reservar
   * seus intervalos antes que os jogos de grupos sejam redistribuídos.
   *
   * get_championship_knockout_final_program_schedule() resolve:
   *
   * - data;
   * - período;
   * - local;
   * - quadra;
   * - sequência dos naipes;
   * - duração padrão ou duração especial;
   * - conflitos entre os próprios blocos manuais.
   *
   * O UUID abaixo existe apenas dentro da tabela temporária.
   */
  INSERT INTO
    tmp_global_manual_final_matches (
      match_id,
      event_date,
      location_name,
      court_name,
      start_time,
      end_time
    )
  SELECT
    gen_random_uuid(),

    final_schedule.scheduled_date,

    final_schedule.location_name,
    final_schedule.court_name,

    final_schedule.planned_start_at,
    final_schedule.planned_end_at

  FROM
    public.get_championship_knockout_final_program_schedule(
      _bracket_edition_id
    ) AS final_schedule

  WHERE final_schedule.planned_start_at
      IS NOT NULL

    AND final_schedule.planned_end_at
      IS NOT NULL

    /*
     * Quando uma final já tiver sido materializada como partida real,
     * ela já estará presente na primeira carga da tabela temporária.
     *
     * Não duplicamos a ocupação.
     */
    AND NOT EXISTS (
      SELECT 1

      FROM tmp_global_manual_final_matches
        AS existing_manual_final

      WHERE existing_manual_final.event_date =
          final_schedule.scheduled_date

        AND public.normalize_bracket_entity_name(
          existing_manual_final.location_name
        ) =
          public.normalize_bracket_entity_name(
            final_schedule.location_name
          )

        AND public.normalize_bracket_entity_name(
          existing_manual_final.court_name
        ) =
          public.normalize_bracket_entity_name(
            final_schedule.court_name
          )

        AND existing_manual_final.start_time =
          final_schedule.planned_start_at

        AND existing_manual_final.end_time =
          final_schedule.planned_end_at
    );


  DROP TABLE IF EXISTS tmp_global_locked_matches;
$target$;


  IF strpos(
    function_definition,
    source_block
  ) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível localizar o ponto de criação das reservas manuais na redistribuição.';
  END IF;


  updated_definition :=
    replace(
      function_definition,
      source_block,
      target_block
    );


  IF strpos(
    updated_definition,
    'manual_final_payload_reservation'
  ) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível instalar a reserva antecipada das finais manuais.';
  END IF;


  EXECUTE updated_definition;
END;
$migration_reserve_manual_finals_before_redistribution$;


COMMENT ON FUNCTION
  public.redistribute_bracket_scheduled_matches(
    UUID
  )
IS
  'Redistribui a agenda respeitando disponibilidade, descanso, prioridades, sequenciamento, bloqueios e também os blocos de finais manuais da Etapa 11 antes mesmo de essas finais serem materializadas como partidas reais.';


NOTIFY pgrst, 'reload schema';