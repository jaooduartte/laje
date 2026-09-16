-- LAJE-103
-- Ao encerrar oficialmente o INTERLAJE, aplica o settlement Top 12 na mesma
-- transação que altera o status do campeonato. Se a classificação ainda tiver
-- projeções, desempates ou partidas/sessões abertas, o encerramento é bloqueado
-- e toda a transação é revertida.

CREATE OR REPLACE FUNCTION public.handle_interlaje_top12_on_finish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.code = 'INTERLAJE'::public.championship_code
    AND NEW.status = 'FINISHED'::public.championship_status
    AND OLD.status IS DISTINCT FROM NEW.status
    AND NEW.current_season_year IS NOT NULL
  THEN
    PERFORM *
    FROM public.finalize_interlaje_season_divisions(
      NEW.id,
      NEW.current_season_year,
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_interlaje_top12_on_finish ON public.championships;
CREATE TRIGGER trg_interlaje_top12_on_finish
AFTER UPDATE OF status ON public.championships
FOR EACH ROW
EXECUTE FUNCTION public.handle_interlaje_top12_on_finish();

COMMENT ON FUNCTION public.handle_interlaje_top12_on_finish() IS
  'LAJE-103: aplica atomicamente o Top 12 do INTERLAJE quando o campeonato muda para FINISHED.';
