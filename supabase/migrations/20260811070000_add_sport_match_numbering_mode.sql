-- Adiciona a numeração visual por modalidade, compartilhada por todos os
-- naipes. O valor continua no payload do rascunho; não há alteração ou
-- remoção de configurações persistidas.

DO $$
DECLARE
  function_definition TEXT;
  previous_function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.build_championship_bracket_operational_preview(uuid, jsonb, jsonb)'::regprocedure
  )
  INTO function_definition;

  previous_function_definition := function_definition;
  function_definition := regexp_replace(
    function_definition,
    $match_numbering_mode_pattern$(?s)match_numbering_mode_value\s*:=\s*CASE\s+WHEN\s+COALESCE\(\s*_payload\s*->>\s*'match_numbering_mode',\s*''\s*\)\s*=\s*'SPORT_NAIPE'\s+THEN\s+'SPORT_NAIPE'\s+ELSE\s+'COURT'\s+END;$match_numbering_mode_pattern$,
    $new_match_numbering_mode$match_numbering_mode_value :=
    CASE
      WHEN COALESCE(_payload ->> 'match_numbering_mode', '') = 'SPORT_NAIPE' THEN 'SPORT_NAIPE'
      WHEN COALESCE(_payload ->> 'match_numbering_mode', '') = 'SPORT' THEN 'SPORT'
      ELSE 'COURT'
    END;$new_match_numbering_mode$
  );

  IF function_definition = previous_function_definition THEN
    RAISE EXCEPTION
      'Não foi possível localizar o modo de numeração na timeline operacional.';
  END IF;

  previous_function_definition := function_definition;
  function_definition := regexp_replace(
    function_definition,
    $sport_naipe_condition_pattern$IF\s+match_numbering_mode_value\s*=\s*'SPORT_NAIPE'\s+THEN$sport_naipe_condition_pattern$,
    $new_sport_naipe_condition$IF match_numbering_mode_value IN ('SPORT_NAIPE', 'SPORT') THEN$new_sport_naipe_condition$
  );

  IF function_definition = previous_function_definition THEN
    RAISE EXCEPTION
      'Não foi possível localizar a condição de numeração por modalidade e naipe.';
  END IF;

  previous_function_definition := function_definition;
  function_definition := regexp_replace(
    function_definition,
    $sport_naipe_partition_pattern$(?s)PARTITION\s+BY\s+entries_table\.sport_id,\s+entries_table\.naipe\s+ORDER\s+BY$sport_naipe_partition_pattern$,
    $new_sport_naipe_partition$PARTITION BY
            entries_table.sport_id,
            CASE
              WHEN match_numbering_mode_value = 'SPORT_NAIPE'
                THEN entries_table.naipe::text
              ELSE NULL
            END
          ORDER BY$new_sport_naipe_partition$
  );

  IF function_definition = previous_function_definition THEN
    RAISE EXCEPTION
      'Não foi possível localizar o particionamento da numeração por modalidade e naipe.';
  END IF;

  EXECUTE function_definition;
END;
$$;

DO $$
DECLARE
  function_definition TEXT;
  previous_function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.preview_championship_bracket_groups(uuid, jsonb)'::regprocedure
  )
  INTO function_definition;

  previous_function_definition := function_definition;
  function_definition := regexp_replace(
    function_definition,
    $preview_numbering_mode_pattern$(?s)resolved_match_numbering_mode\s*:=\s*CASE\s+WHEN\s+COALESCE\(\s*_payload\s*->>\s*'match_numbering_mode',\s*''\s*\)\s*=\s*'SPORT_NAIPE'\s+THEN\s+'SPORT_NAIPE'\s+ELSE\s+'COURT'\s+END;$preview_numbering_mode_pattern$,
    $new_preview_numbering_mode$resolved_match_numbering_mode :=
    CASE
      WHEN COALESCE(_payload ->> 'match_numbering_mode', '') = 'SPORT_NAIPE' THEN 'SPORT_NAIPE'
      WHEN COALESCE(_payload ->> 'match_numbering_mode', '') = 'SPORT' THEN 'SPORT'
      ELSE 'COURT'
    END;$new_preview_numbering_mode$
  );

  IF function_definition = previous_function_definition THEN
    RAISE EXCEPTION
      'Não foi possível localizar o modo de numeração na prévia do chaveamento.';
  END IF;

  EXECUTE function_definition;
END;
$$;

COMMENT ON FUNCTION public.build_championship_bracket_operational_preview(UUID, JSONB, JSONB) IS
  'Monta a timeline operacional. A numeração visual pode ser por quadra, modalidade e naipe ou somente por modalidade.';
