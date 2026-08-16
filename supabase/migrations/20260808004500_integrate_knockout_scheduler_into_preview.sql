-- Integra o planejador anônimo do mata-mata ao RPC de preview.
--
-- Fluxo:
--
-- 1. gera temporariamente a fase de grupos usando exatamente a rotina oficial;
-- 2. obtém a edição temporariamente gerada;
-- 3. calcula as reservas projetadas de todo o mata-mata;
-- 4. transforma conflitos do scheduler em diagnostics;
-- 5. força rollback da subtransação;
-- 6. devolve o resultado ao frontend.
--
-- Nenhuma partida, chave, edição ou reserva criada durante o preview
-- permanece persistida no banco.


CREATE OR REPLACE FUNCTION
  public.preview_championship_bracket_groups(
    _championship_id UUID,
    _payload JSONB
  )
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  generated_edition_id UUID;

  knockout_result JSONB;
  preview_result JSONB;

  diagnostics_result JSONB;

  resolved_match_numbering_mode TEXT;

  knockout_conflict_count INTEGER := 0;
BEGIN
  resolved_match_numbering_mode :=
    CASE
      WHEN COALESCE(
        _payload ->> 'match_numbering_mode',
        ''
      ) = 'SPORT_NAIPE'
      THEN
        'SPORT_NAIPE'

      ELSE
        'COURT'
    END;


  BEGIN
    /*
     * Executa exatamente o mesmo gerador utilizado na criação real
     * do chaveamento.
     *
     * Tudo que for criado por esta chamada está dentro da
     * subtransação e será revertido ao final do preview.
     */
    SELECT
      public.generate_championship_bracket_groups(
        _championship_id,
        COALESCE(
          _payload,
          '{}'::jsonb
        )
      )
    INTO generated_edition_id;


    IF generated_edition_id IS NULL
    THEN
      RAISE EXCEPTION
        'Não foi possível determinar a edição temporária gerada para a prévia.';
    END IF;


    /*
     * Calcula o mata-mata inteiro em modo não estrito.
     *
     * Neste modo:
     *
     * - partidas que encontram horário são reservadas;
     * - conflitos são coletados;
     * - a simulação continua sempre que possível;
     * - nenhum conflito é transformado em exceção fatal.
     *
     * Isso permite que a Etapa 13 mostre uma agenda parcial junto
     * das pendências encontradas.
     */
    knockout_result :=
      public
        .rebuild_championship_knockout_schedule_reservations(
          generated_edition_id,
          false
        );


    knockout_conflict_count :=
      COALESCE(
        NULLIF(
          knockout_result ->> 'conflict_count',
          ''
        )::integer,
        0
      );


    /*
     * Converte os conflitos internos do scheduler para o contrato
     * público/anônimo da Etapa 13.
     *
     * Não são retornados:
     *
     * - team_id;
     * - home_team_id;
     * - away_team_id;
     * - nome de atlética;
     * - qualquer identificação de participante.
     */
    SELECT
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'code',
              conflict_record.value
                ->> 'code',

            'severity',
              'ERROR',

            'message',
              conflict_record.value
                ->> 'message',

            'date',
              NULL,

            'location_name',
              NULL,

            'court_name',
              NULL,

            'sport_id',
              competitions_table.sport_id,

            'sport_name',
              sports_table.name,

            'naipe',
              competitions_table.naipe,

            'division',
              competitions_table.division,

            'phase',
              CASE
                WHEN NULLIF(
                  conflict_record.value
                    ->> 'round_number',
                  ''
                ) IS NULL
                THEN
                  NULL

                WHEN (
                  conflict_record.value
                    ->> 'round_number'
                )::integer =
                  public
                    .resolve_championship_competition_expected_knockout_rounds(
                      competitions_table.id
                    )
                THEN
                  'FINAL'

                WHEN (
                  conflict_record.value
                    ->> 'round_number'
                )::integer =
                  public
                    .resolve_championship_competition_expected_knockout_rounds(
                      competitions_table.id
                    ) - 1
                THEN
                  'SEMIFINAL'

                WHEN (
                  conflict_record.value
                    ->> 'round_number'
                )::integer =
                  public
                    .resolve_championship_competition_expected_knockout_rounds(
                      competitions_table.id
                    ) - 2
                THEN
                  'QUARTERFINAL'

                WHEN (
                  conflict_record.value
                    ->> 'round_number'
                )::integer =
                  public
                    .resolve_championship_competition_expected_knockout_rounds(
                      competitions_table.id
                    ) - 3
                THEN
                  'ROUND_OF_16'

                WHEN (
                  conflict_record.value
                    ->> 'round_number'
                )::integer =
                  public
                    .resolve_championship_competition_expected_knockout_rounds(
                      competitions_table.id
                    ) - 4
                THEN
                  'ROUND_OF_32'

                ELSE
                  NULL
              END
          )
          ORDER BY
            conflict_record.ordinality ASC
        ),
        '[]'::jsonb
      )
    INTO diagnostics_result

    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(
          knockout_result -> 'conflicts'
        ) = 'array'
        THEN
          knockout_result -> 'conflicts'

        ELSE
          '[]'::jsonb
      END
    )
    WITH ORDINALITY
      AS conflict_record(
        value,
        ordinality
      )

    LEFT JOIN
      public.championship_bracket_competitions
        AS competitions_table
      ON competitions_table.id =
        CASE
          WHEN NULLIF(
            conflict_record.value
              ->> 'competition_id',
            ''
          ) IS NULL
          THEN
            NULL

          ELSE
            (
              conflict_record.value
                ->> 'competition_id'
            )::uuid
        END

    LEFT JOIN public.sports
      AS sports_table
      ON sports_table.id =
        competitions_table.sport_id;


    /*
     * Por enquanto summary e days continuam vazios.
     *
     * O objetivo desta migration é primeiro validar:
     *
     * grupos
     *   +
     * scheduler anônimo do mata-mata
     *   +
     * rollback
     *
     * A montagem da timeline operacional completa entra somente
     * depois que esta camada estiver validada.
     */
    preview_result :=
      jsonb_build_object(
        'ok',
          true,

        'message',
          CASE
            WHEN knockout_conflict_count > 0
            THEN
              format(
                'A prévia encontrou %s conflito(s) na programação projetada do mata-mata.',
                knockout_conflict_count
              )

            ELSE
              NULL
          END,

        'match_numbering_mode',
          resolved_match_numbering_mode,

        'summary',
          NULL,

        'days',
          '[]'::jsonb,

        'diagnostics',
          diagnostics_result
      );


    /*
     * Sentinel usado exclusivamente para provocar rollback.
     *
     * A variável preview_result permanece disponível no handler,
     * enquanto todas as alterações persistentes feitas dentro desta
     * subtransação são revertidas.
     */
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE = '__preview_success__';


  EXCEPTION
    WHEN SQLSTATE 'P0001'
    THEN
      IF SQLERRM =
        '__preview_success__'
      THEN
        RETURN preview_result;
      END IF;


      RETURN jsonb_build_object(
        'ok',
          false,

        'message',
          SQLERRM,

        'match_numbering_mode',
          resolved_match_numbering_mode,

        'summary',
          NULL,

        'days',
          '[]'::jsonb,

        'diagnostics',
          '[]'::jsonb
      );


    WHEN OTHERS
    THEN
      RETURN jsonb_build_object(
        'ok',
          false,

        'message',
          SQLERRM,

        'match_numbering_mode',
          resolved_match_numbering_mode,

        'summary',
          NULL,

        'days',
          '[]'::jsonb,

        'diagnostics',
          '[]'::jsonb
      );
  END;
END;
$function$;


COMMENT ON FUNCTION
  public.preview_championship_bracket_groups(
    UUID,
    JSONB
  )
IS
  'Executa em subtransação a geração real da fase de grupos e a projeção anônima completa do mata-mata. Retorna conflitos do scheduler sem persistir edição, partidas ou reservas.';


NOTIFY pgrst, 'reload schema';