-- Adiciona contexto técnico temporário aos erros da prévia operacional.
--
-- Objetivo:
-- identificar precisamente qual função/statement está originando
-- erros internos durante a simulação do chaveamento.
--
-- Depois de estabilizar a Etapa 13, este detalhamento poderá ser removido.

DO $migration_patch_preview_error_context$
DECLARE
  function_body TEXT;
  updated_body TEXT;

  declaration_source TEXT;
  declaration_target TEXT;

  handler_source TEXT;
  handler_target TEXT;
BEGIN
  SELECT prosrc
  INTO function_body
  FROM pg_proc AS functions_table
  JOIN pg_namespace AS namespaces_table
    ON namespaces_table.oid = functions_table.pronamespace
  WHERE namespaces_table.nspname = 'public'
    AND functions_table.oid =
      'public.preview_championship_bracket_groups(uuid,jsonb)'
        ::regprocedure;

  IF function_body IS NULL THEN
    RAISE EXCEPTION
      'A função preview_championship_bracket_groups(uuid,jsonb) não existe.';
  END IF;


  /*
   * Permite reaplicação segura.
   */
  IF strpos(
    function_body,
    'PG_EXCEPTION_CONTEXT'
  ) > 0 THEN
    RETURN;
  END IF;


  updated_body := function_body;


  /*
   * Variáveis usadas pelo GET STACKED DIAGNOSTICS.
   */
  declaration_source :=
$source$
  knockout_conflict_count INTEGER := 0;
$source$;

  declaration_target :=
$target$
  knockout_conflict_count INTEGER := 0;

  preview_exception_detail TEXT;
  preview_exception_hint TEXT;
  preview_exception_context TEXT;
$target$;


  IF strpos(
    updated_body,
    declaration_source
  ) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível localizar as declarações do RPC de preview.';
  END IF;


  updated_body :=
    replace(
      updated_body,
      declaration_source,
      declaration_target
    );


  /*
   * Substitui somente o handler genérico.
   *
   * O sentinel P0001 usado para rollback continua funcionando
   * exatamente como antes.
   */
  handler_source :=
$source$
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
$source$;


  handler_target :=
$target$
    WHEN OTHERS
    THEN
      GET STACKED DIAGNOSTICS
        preview_exception_detail =
          PG_EXCEPTION_DETAIL,

        preview_exception_hint =
          PG_EXCEPTION_HINT,

        preview_exception_context =
          PG_EXCEPTION_CONTEXT;


      RETURN jsonb_build_object(
        'ok',
          false,

        'message',
          concat_ws(
            E'\n',

            SQLERRM,

            CASE
              WHEN NULLIF(
                preview_exception_detail,
                ''
              ) IS NOT NULL
              THEN
                'DETAIL: '
                || preview_exception_detail

              ELSE
                NULL
            END,

            CASE
              WHEN NULLIF(
                preview_exception_hint,
                ''
              ) IS NOT NULL
              THEN
                'HINT: '
                || preview_exception_hint

              ELSE
                NULL
            END,

            CASE
              WHEN NULLIF(
                preview_exception_context,
                ''
              ) IS NOT NULL
              THEN
                'CONTEXT: '
                || preview_exception_context

              ELSE
                NULL
            END
          ),

        'match_numbering_mode',
          resolved_match_numbering_mode,

        'summary',
          NULL,

        'days',
          '[]'::jsonb,

        'diagnostics',
          '[]'::jsonb
      );
$target$;


  IF strpos(
    updated_body,
    handler_source
  ) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível localizar o handler genérico do RPC de preview.';
  END IF;


  updated_body :=
    replace(
      updated_body,
      handler_source,
      handler_target
    );


  /*
   * Recria a função com os mesmos atributos atuais.
   */
  EXECUTE format(
    $sql$
      CREATE OR REPLACE FUNCTION
        public.preview_championship_bracket_groups(
          _championship_id UUID,
          _payload JSONB
        )
      RETURNS JSONB
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS %L
    $sql$,
    updated_body
  );
END;
$migration_patch_preview_error_context$;


COMMENT ON FUNCTION
  public.preview_championship_bracket_groups(
    UUID,
    JSONB
  )
IS
  'Simula em rollback a geração completa do chaveamento e devolve a prévia operacional. Durante a estabilização da Etapa 13 também retorna contexto técnico de exceções internas do PostgreSQL.';


NOTIFY pgrst, 'reload schema';