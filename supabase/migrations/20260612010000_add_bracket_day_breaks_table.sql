-- Tabela de intervalos múltiplos por dia de campeonato.
-- As colunas break_start_time/break_end_time em championship_bracket_days são mantidas
-- como legado (usadas em payload_snapshot e geração inicial) e não devem ser removidas.

CREATE TABLE IF NOT EXISTS public.championship_bracket_day_breaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bracket_day_id UUID NOT NULL
    REFERENCES public.championship_bracket_days(id) ON DELETE CASCADE,
  break_start_time TIME NOT NULL,
  break_end_time TIME NOT NULL,
  position INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bracket_day_id, position),
  CHECK (break_end_time > break_start_time)
);

-- Migra dados existentes do campo legado para a nova tabela
INSERT INTO public.championship_bracket_day_breaks (bracket_day_id, break_start_time, break_end_time, position)
SELECT id, break_start_time, break_end_time, 1
FROM public.championship_bracket_days
WHERE break_start_time IS NOT NULL AND break_end_time IS NOT NULL
ON CONFLICT DO NOTHING;

GRANT SELECT ON public.championship_bracket_day_breaks TO authenticated;

NOTIFY pgrst, 'reload schema';
