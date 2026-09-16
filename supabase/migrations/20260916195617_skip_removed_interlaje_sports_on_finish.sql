-- LAJE-103
-- Modalidades removidas da temporada não devem bloquear o encerramento do INTERLAJE.
-- O Atletismo 2026, por exemplo, está registrado em championship_season_sport_removals
-- e não possui sessões nem pontuação a serem consideradas na classificação geral.

CREATE OR REPLACE FUNCTION public.guard_interlaje_individual_completion_on_finish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.code IS DISTINCT FROM 'INTERLAJE'::public.championship_code
    OR NEW.status IS DISTINCT FROM 'FINISHED'::public.championship_status
    OR OLD.status IS NOT DISTINCT FROM NEW.status
    OR NEW.current_season_year IS NULL
  THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    WITH expected_individual_contexts AS (
      SELECT
        championship_sports_table.sport_id,
        expected_naipe.naipe
      FROM public.championship_sports AS championship_sports_table
      CROSS JOIN LATERAL (
        SELECT 'MASCULINO'::public.match_naipe AS naipe
        WHERE championship_sports_table.naipe_mode = 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode
        UNION ALL
        SELECT 'FEMININO'::public.match_naipe
        WHERE championship_sports_table.naipe_mode = 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode
        UNION ALL
        SELECT 'MISTO'::public.match_naipe
        WHERE championship_sports_table.naipe_mode = 'MISTO'::public.championship_sport_naipe_mode
      ) AS expected_naipe
      WHERE championship_sports_table.championship_id = NEW.id
        AND public.get_interlaje_classification_policy(
          NEW.id,
          championship_sports_table.sport_id
        ) ->> 'mode' = 'INDIVIDUAL'
        AND NOT EXISTS (
          SELECT 1
          FROM public.championship_season_sport_removals AS removals_table
          WHERE removals_table.championship_id = NEW.id
            AND removals_table.season_year = NEW.current_season_year
            AND removals_table.sport_id = championship_sports_table.sport_id
        )
    )
    SELECT 1
    FROM expected_individual_contexts AS expected_context
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.championship_individual_sessions AS sessions_table
      WHERE sessions_table.championship_id = NEW.id
        AND sessions_table.season_year = NEW.current_season_year
        AND sessions_table.sport_id = expected_context.sport_id
        AND sessions_table.naipe = expected_context.naipe
    )
  ) THEN
    RAISE EXCEPTION
      'Existem modalidades individuais ativas do INTERLAJE sem sessão registrada para todos os naipes.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.championship_individual_sessions AS sessions_table
    WHERE sessions_table.championship_id = NEW.id
      AND sessions_table.season_year = NEW.current_season_year
      AND sessions_table.status NOT IN (
        'FINISHED'::public.championship_individual_session_status,
        'CANCELLED'::public.championship_individual_session_status
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.championship_season_sport_removals AS removals_table
        WHERE removals_table.championship_id = sessions_table.championship_id
          AND removals_table.season_year = sessions_table.season_year
          AND removals_table.sport_id = sessions_table.sport_id
      )
  ) THEN
    RAISE EXCEPTION
      'Existem modalidades individuais ativas do INTERLAJE ainda não encerradas.';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.guard_interlaje_individual_completion_on_finish() IS
  'LAJE-103: impede encerrar o INTERLAJE se uma modalidade individual ativa estiver ausente ou não finalizada; modalidades removidas da temporada não bloqueiam o encerramento.';
