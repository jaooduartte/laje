-- LAJE-103
-- Garante que uma modalidade individual configurada no INTERLAJE não seja
-- silenciosamente ignorada por simplesmente ainda não possuir uma sessão.
-- Ex.: Atletismo 2026 ainda precisa existir e ser encerrado em ambos os naipes
-- antes de o campeonato poder mudar para FINISHED.

CREATE OR REPLACE FUNCTION public.guard_interlaje_individual_completion_on_finish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      'Existem modalidades individuais do INTERLAJE sem sessão registrada para todos os naipes.';
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
  ) THEN
    RAISE EXCEPTION
      'Existem modalidades individuais do INTERLAJE ainda não encerradas.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_interlaje_validate_individuals_before_finish
  ON public.championships;
CREATE TRIGGER trg_interlaje_validate_individuals_before_finish
BEFORE UPDATE OF status ON public.championships
FOR EACH ROW
EXECUTE FUNCTION public.guard_interlaje_individual_completion_on_finish();

COMMENT ON FUNCTION public.guard_interlaje_individual_completion_on_finish() IS
  'LAJE-103: impede encerrar o INTERLAJE se uma modalidade individual configurada estiver ausente ou não finalizada.';
