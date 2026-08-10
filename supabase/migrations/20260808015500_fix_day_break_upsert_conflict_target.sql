-- Corrige o conflict target utilizado durante a geração do chaveamento.
--
-- A tabela championship_bracket_day_breaks possui a constraint:
--
-- championship_bracket_day_breaks_bracket_day_id_position_key
-- UNIQUE (bracket_day_id, position)
--
-- Em execução através do RPC de preview, a inferência:
--
-- ON CONFLICT (bracket_day_id, position)
--
-- está falhando mesmo com a constraint presente e válida.
--
-- Passamos a referenciar explicitamente a constraint pelo nome.

DO $migration_fix_day_break_conflict_target$
DECLARE
  function_definition TEXT;
  updated_definition TEXT;

  source_block TEXT :=
    'ON CONFLICT (bracket_day_id, position) DO UPDATE SET';

  target_block TEXT :=
    'ON CONFLICT ON CONSTRAINT championship_bracket_day_breaks_bracket_day_id_position_key DO UPDATE SET';
BEGIN
  SELECT pg_get_functiondef(
    'public.generate_championship_bracket_groups(uuid,jsonb)'
      ::regprocedure
  )
  INTO function_definition;


  IF function_definition IS NULL THEN
    RAISE EXCEPTION
      'A função generate_championship_bracket_groups(uuid,jsonb) não existe.';
  END IF;


  /*
   * Migration reaplicável:
   * se já estiver usando a constraint nominal, não altera novamente.
   */
  IF strpos(
    function_definition,
    target_block
  ) > 0 THEN
    RETURN;
  END IF;


  IF strpos(
    function_definition,
    source_block
  ) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível localizar o ON CONFLICT da sincronização de intervalos.';
  END IF;


  updated_definition :=
    replace(
      function_definition,
      source_block,
      target_block
    );


  IF strpos(
    updated_definition,
    target_block
  ) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível instalar o conflict target explícito dos intervalos.';
  END IF;


  EXECUTE updated_definition;
END;
$migration_fix_day_break_conflict_target$;


COMMENT ON FUNCTION
  public.generate_championship_bracket_groups(
    UUID,
    JSONB
  )
IS
  'Gera o chaveamento e a agenda do campeonato. A sincronização do intervalo diário utiliza explicitamente a constraint championship_bracket_day_breaks_bracket_day_id_position_key para o upsert.';


NOTIFY pgrst, 'reload schema';