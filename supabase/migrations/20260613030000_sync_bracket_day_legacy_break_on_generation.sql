-- Sincroniza o intervalo legado (championship_bracket_days.break_start_time / break_end_time)
-- para championship_bracket_day_breaks sempre que um dia é inserido ou atualizado.
-- Isso garante que o intervalo configurado no wizard de criação do campeonato apareça
-- na seção de horários do painel admin, mesmo antes de qualquer edição manual.
--
-- Quando update_bracket_day_schedule gerencia os intervalos manualmente, ele faz
-- DELETE + INSERT explícito em championship_bracket_day_breaks após o UPDATE da coluna
-- legada, portanto a inserção do trigger é inofensiva (sobrescrita logo em seguida).

CREATE OR REPLACE FUNCTION public.sync_bracket_day_legacy_break()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.break_start_time IS NOT NULL AND NEW.break_end_time IS NOT NULL THEN
    INSERT INTO public.championship_bracket_day_breaks (
      bracket_day_id,
      break_start_time,
      break_end_time,
      position
    ) VALUES (
      NEW.id,
      NEW.break_start_time,
      NEW.break_end_time,
      1
    )
    ON CONFLICT (bracket_day_id, position) DO UPDATE SET
      break_start_time = EXCLUDED.break_start_time,
      break_end_time = EXCLUDED.break_end_time;
  ELSE
    -- Quando a coluna legada é limpa (re-geração sem intervalo), remove position 1.
    -- Harmless se já não existe; update_bracket_day_schedule igualmente faz DELETE ALL.
    DELETE FROM public.championship_bracket_day_breaks
    WHERE bracket_day_id = NEW.id
      AND position = 1;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_bracket_day_legacy_break_trigger
AFTER INSERT OR UPDATE OF break_start_time, break_end_time
ON public.championship_bracket_days
FOR EACH ROW
EXECUTE FUNCTION public.sync_bracket_day_legacy_break();

-- Sincroniza dias existentes que têm coluna legada preenchida mas ainda sem entrada em breaks
INSERT INTO public.championship_bracket_day_breaks (bracket_day_id, break_start_time, break_end_time, position)
SELECT d.id, d.break_start_time, d.break_end_time, 1
FROM public.championship_bracket_days AS d
WHERE d.break_start_time IS NOT NULL
  AND d.break_end_time IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.championship_bracket_day_breaks AS b
    WHERE b.bracket_day_id = d.id
  )
ON CONFLICT (bracket_day_id, position) DO NOTHING;

NOTIFY pgrst, 'reload schema';
