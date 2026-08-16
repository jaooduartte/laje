-- Corrige duas divergências do scheduler projetado do mata-mata:
--
-- 1. torna a ordem das competições determinística;
-- 2. replica corretamente a regra oficial de complementação
--    com melhores segundos colocados.
--
-- Antes:
--
-- - competition_id era utilizado como critério relevante de ordenação;
-- - os UUIDs das competições são novos em cada execução do preview;
-- - consequentemente a ordem de disputa pelos horários mudava;
-- - a quantidade de conflitos variava a cada recálculo.
--
-- Além disso, o modo:
--
-- "Só 1º por grupo (completa só se precisar)"
--
-- estava sendo projetado como BYEs quando a quantidade de primeiros
-- não fechava uma potência de 2.
--
-- A geração oficial, porém, completa essas vagas com os melhores
-- segundos colocados.
--
-- Exemplo:
--
-- 5 grupos
-- → 5 primeiros
-- → chave necessária = 8
-- → + 3 melhores segundos
-- → 8 classificados
-- → 7 partidas de mata-mata.

DO $migration_fix_deterministic_knockout_preview$
DECLARE
  function_definition TEXT;
  updated_definition TEXT;

  bracket_source TEXT;
  bracket_target TEXT;

  competition_order_source TEXT;
  competition_order_target TEXT;

  pending_order_source TEXT;
  pending_order_target TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.rebuild_championship_knockout_schedule_reservations(uuid,boolean)'
      ::regprocedure
  )
  INTO function_definition;


  IF function_definition IS NULL THEN
    RAISE EXCEPTION
      'A função rebuild_championship_knockout_schedule_reservations(uuid,boolean) não existe.';
  END IF;


  /*
   * Reaplicação segura.
   */
  IF strpos(
    function_definition,
    'deterministic_knockout_preview_order'
  ) > 0
  THEN
    RETURN;
  END IF;


  updated_definition :=
    function_definition;


  /*
   * ================================================================
   * 1. CORRIGE O TAMANHO PROJETADO DA CHAVE
   * ================================================================
   *
   * Replica a mesma regra utilizada por
   * generate_championship_knockout_for_competition().
   *
   * qualifiers_per_group = 1:
   *
   * SMART / false:
   *   4 grupos → 4 classificados
   *   5 grupos → 8 classificados (5 primeiros + 3 melhores segundos)
   *
   * EXPANDED / true:
   *   4 grupos → 8 classificados
   *   5 grupos → 8 classificados
   *
   * Para qualifiers_per_group > 1 não existe complementação adicional
   * por melhores segundos além dos classificados já definidos.
   */

  bracket_source :=
$source$
    IF competition_record.qualifiers_per_group = 1
      AND competition_record
        .should_complete_knockout_with_best_second_placed_teams =
          true
    THEN
      bracket_size := 1;

      WHILE
        bracket_size <=
          direct_qualified_team_count
      LOOP
        bracket_size :=
          bracket_size * 2;
      END LOOP;

      /*
       * Neste modo o próprio algoritmo de classificação completa
       * o bracket utilizando os melhores segundos colocados.
       */
      qualified_team_count :=
        bracket_size;
    ELSE
      qualified_team_count :=
        direct_qualified_team_count;

      bracket_size := 1;

      WHILE
        bracket_size <
          qualified_team_count
      LOOP
        bracket_size :=
          bracket_size * 2;
      END LOOP;
    END IF;
$source$;


  bracket_target :=
$target$
    /*
     * deterministic_knockout_preview_order
     *
     * Mantém a projeção idêntica à geração oficial.
     */
    bracket_size := 1;


    IF competition_record.qualifiers_per_group = 1
      AND competition_record
        .should_complete_knockout_with_best_second_placed_teams =
          true
    THEN
      /*
       * Modo expandido:
       *
       * mesmo quando os primeiros já fecham uma chave válida,
       * avança para a próxima potência de 2.
       *
       * Exemplo:
       * 4 primeiros → chave de 8.
       */
      WHILE
        bracket_size <=
          direct_qualified_team_count
      LOOP
        bracket_size :=
          bracket_size * 2;
      END LOOP;

    ELSE
      /*
       * Modo normal/SMART:
       *
       * utiliza a menor potência de 2 capaz de comportar os
       * classificados diretos.
       *
       * Quando qualifiers_per_group = 1 e a potência é maior que
       * a quantidade de primeiros, as vagas restantes são preenchidas
       * pelos melhores segundos colocados.
       *
       * Exemplo:
       * 5 primeiros → chave de 8 → +3 melhores segundos.
       */
      WHILE
        bracket_size <
          direct_qualified_team_count
      LOOP
        bracket_size :=
          bracket_size * 2;
      END LOOP;
    END IF;


    qualified_team_count :=
      CASE
        WHEN competition_record.qualifiers_per_group = 1
          AND bracket_size >
            direct_qualified_team_count
        THEN
          bracket_size

        ELSE
          direct_qualified_team_count
      END;
$target$;


  IF strpos(
    updated_definition,
    bracket_source
  ) = 0
  THEN
    RAISE EXCEPTION
      'Não foi possível localizar a lógica atual de projeção do tamanho da chave.';
  END IF;


  updated_definition :=
    replace(
      updated_definition,
      bracket_source,
      bracket_target
    );


  /*
   * ================================================================
   * 2. ORDEM DETERMINÍSTICA DAS COMPETIÇÕES
   * ================================================================
   *
   * created_at e id não são critérios adequados para preview:
   *
   * - todas as competições são recriadas temporariamente;
   * - created_at pode ser igual dentro da transação;
   * - id é um UUID novo em cada execução.
   *
   * Passamos a ordenar por propriedades funcionais estáveis.
   */

  competition_order_source :=
$source$
    ORDER BY
      competitions_table.created_at ASC,
      competitions_table.id ASC
$source$;


  competition_order_target :=
$target$
    ORDER BY
      COALESCE(
        sports_table.name,
        ''
      ) ASC,

      competitions_table.sport_id ASC,

      CASE competitions_table.naipe
        WHEN 'FEMININO'
          ::public.match_naipe
        THEN 1

        WHEN 'MASCULINO'
          ::public.match_naipe
        THEN 2

        WHEN 'MISTO'
          ::public.match_naipe
        THEN 3

        ELSE 99
      END ASC,

      CASE competitions_table.division
        WHEN 'DIVISAO_PRINCIPAL'
          ::public.team_division
        THEN 1

        WHEN 'DIVISAO_ACESSO'
          ::public.team_division
        THEN 2

        ELSE 99
      END ASC,

      competitions_table.id ASC
$target$;


  IF strpos(
    updated_definition,
    competition_order_source
  ) = 0
  THEN
    RAISE EXCEPTION
      'Não foi possível localizar a ordenação atual das competições.';
  END IF;


  updated_definition :=
    replace(
      updated_definition,
      competition_order_source,
      competition_order_target
    );


  /*
   * ================================================================
   * 3. ORDEM DETERMINÍSTICA DAS PARTIDAS PROJETADAS
   * ================================================================
   *
   * O scheduler utilizava competition_id como segundo critério:
   *
   * round
   * → UUID temporário da competição
   * → slot
   *
   * Isso mudava quem ocupava primeiro os horários concorridos.
   *
   * Usamos agora:
   *
   * round
   * → modalidade
   * → naipe
   * → divisão
   * → slot
   *
   * competition_id permanece apenas como último desempate impossível
   * em uma configuração normal.
   *
   * O mesmo bloco existe em dois pontos da função e replace()
   * corrige ambos.
   */

  pending_order_source :=
$source$
      ORDER BY
        pending_table.round_number ASC,
        pending_table.competition_id ASC,
        pending_table.slot_number ASC
$source$;


  pending_order_target :=
$target$
      ORDER BY
        pending_table.round_number ASC,

        pending_table.sport_id ASC,

        CASE pending_table.naipe
          WHEN 'FEMININO'
            ::public.match_naipe
          THEN 1

          WHEN 'MASCULINO'
            ::public.match_naipe
          THEN 2

          WHEN 'MISTO'
            ::public.match_naipe
          THEN 3

          ELSE 99
        END ASC,

        CASE pending_table.division
          WHEN 'DIVISAO_PRINCIPAL'
            ::public.team_division
          THEN 1

          WHEN 'DIVISAO_ACESSO'
            ::public.team_division
          THEN 2

          ELSE 99
        END ASC,

        pending_table.slot_number ASC,

        pending_table.competition_id ASC
$target$;


  IF strpos(
    updated_definition,
    pending_order_source
  ) = 0
  THEN
    RAISE EXCEPTION
      'Não foi possível localizar a ordenação das partidas projetadas.';
  END IF;


  updated_definition :=
    replace(
      updated_definition,
      pending_order_source,
      pending_order_target
    );


  /*
   * Validação final do patch.
   */
  IF strpos(
    updated_definition,
    'deterministic_knockout_preview_order'
  ) = 0
  THEN
    RAISE EXCEPTION
      'Não foi possível instalar a ordenação determinística do mata-mata.';
  END IF;


  EXECUTE updated_definition;
END;
$migration_fix_deterministic_knockout_preview$;


COMMENT ON FUNCTION
  public.rebuild_championship_knockout_schedule_reservations(
    UUID,
    BOOLEAN
  )
IS
  'Reconstrói deterministicamente as reservas do mata-mata. Replica a regra oficial de complementação com melhores segundos e não utiliza UUIDs temporários como critério funcional de prioridade.';


NOTIFY pgrst, 'reload schema';