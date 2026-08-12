-- Protege a prévia exata contra execuções concorrentes e elimina o custo
-- redundante dos triggers de fila/conflito durante a geração temporária.
--
-- A rotina de redistribuição já calcula a agenda integral em tabelas
-- temporárias, validando disponibilidade, intervalos, bloqueios, descanso e
-- prioridades antes de materializar o resultado. Os triggers são necessários
-- para alterações pontuais de partidas, mas repetem consultas caras para cada
-- INSERT/UPDATE de uma simulação que será integralmente revertida.
--
-- A criação definitiva recebe o mesmo bypass controlado: após a geração, a
-- redistribuição faz a validação completa e aplica o conjunto final de forma
-- atômica. A assinatura da programação ainda é comparada com a prévia antes
-- de qualquer commit.

DO $migration_optimize_exact_preview_concurrency$
DECLARE
  function_definition TEXT;
  previous_function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.preview_championship_bracket_groups(uuid,jsonb)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION
      'A função preview_championship_bracket_groups(uuid,jsonb) não existe.';
  END IF;

  IF strpos(function_definition, 'exact_preview_advisory_lock') > 0 THEN
    RETURN;
  END IF;

  previous_function_definition := function_definition;
  function_definition := replace(
    function_definition,
    $source$
  BEGIN
    SELECT
      public.generate_championship_bracket_groups(
$source$,
    $target$
  BEGIN
    /* exact_preview_advisory_lock
     * Uma segunda chamada para o mesmo campeonato encerra imediatamente em
     * vez de disputar CPU/conexão com a simulação que já está em andamento.
     */
    IF NOT pg_try_advisory_xact_lock(
      hashtextextended(
        format('championship-bracket-preview:%s', _championship_id),
        0
      )
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'message',
          'Já existe uma programação exata sendo calculada para este campeonato. Aguarde a conclusão antes de tentar novamente.',
        'match_numbering_mode', resolved_match_numbering_mode,
        'summary', NULL,
        'days', '[]'::jsonb,
        'diagnostics', '[]'::jsonb
      );
    END IF;

    /*
     * A fila e os conflitos são validados pelo redistribuidor ao final. Aqui
     * evitamos repetir os triggers a cada partida transitória do preview.
     */
    PERFORM set_config('app.skip_queue_trigger', 'true', true);
    PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);

    SELECT
      public.generate_championship_bracket_groups(
$target$
  );

  IF function_definition = previous_function_definition THEN
    RAISE EXCEPTION
      'Não foi possível instalar a proteção de concorrência da prévia exata.';
  END IF;

  EXECUTE function_definition;
END;
$migration_optimize_exact_preview_concurrency$;


DO $migration_optimize_exact_generation_concurrency$
DECLARE
  function_definition TEXT;
  previous_function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.generate_championship_bracket_groups_from_exact_preview(uuid,jsonb,text,text)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION
      'A função generate_championship_bracket_groups_from_exact_preview não existe.';
  END IF;

  IF strpos(function_definition, 'exact_generation_advisory_lock') > 0 THEN
    RETURN;
  END IF;

  previous_function_definition := function_definition;
  function_definition := replace(
    function_definition,
    $source$
BEGIN
  IF NULLIF(trim(COALESCE(_expected_payload_signature, '')), '') IS NULL
$source$,
    $target$
BEGIN
  /* exact_generation_advisory_lock */
  IF NOT pg_try_advisory_xact_lock(
    hashtextextended(
      format('championship-bracket-preview:%s', _championship_id),
      0
    )
  ) THEN
    RAISE EXCEPTION
      'A programação exata deste campeonato ainda está em processamento. Aguarde e tente criar novamente.';
  END IF;

  /*
   * Espelha o modo de geração do preview. A redistribuição final continua
   * validando a grade completa antes de persistir as partidas.
   */
  PERFORM set_config('app.skip_queue_trigger', 'true', true);
  PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);

  IF NULLIF(trim(COALESCE(_expected_payload_signature, '')), '') IS NULL
$target$
  );

  IF function_definition = previous_function_definition THEN
    RAISE EXCEPTION
      'Não foi possível instalar a proteção de concorrência da criação definitiva.';
  END IF;

  EXECUTE function_definition;
END;
$migration_optimize_exact_generation_concurrency$;


-- O limite protege o pool do Supabase de uma execução anômala. A trava acima
-- impede que cliques repetidos multipliquem o custo durante essa janela.
ALTER FUNCTION public.preview_championship_bracket_groups(UUID, JSONB)
  SET statement_timeout = '45s';

ALTER FUNCTION public.generate_championship_bracket_groups_from_exact_preview(
  UUID,
  JSONB,
  TEXT,
  TEXT
)
  SET statement_timeout = '45s';


COMMENT ON FUNCTION public.preview_championship_bracket_groups(UUID, JSONB)
IS
  'Simula em rollback a agenda completa. Uma única prévia pesada por campeonato pode executar por vez; os triggers de fila e conflito são evitados na simulação porque a redistribuição valida integralmente a grade antes do rollback.';

COMMENT ON FUNCTION public.generate_championship_bracket_groups_from_exact_preview(UUID, JSONB, TEXT, TEXT)
IS
  'Gera a agenda definitiva no mesmo modo eficiente da prévia exata, valida a redistribuição completa e confirma somente quando a assinatura final coincide com a prévia.';


NOTIFY pgrst, 'reload schema';
