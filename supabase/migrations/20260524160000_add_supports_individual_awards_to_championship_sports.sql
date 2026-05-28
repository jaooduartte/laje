-- Adiciona supports_individual_awards em championship_sports.
-- false (padrão) = súmula não coleta artilheiros nem goleiros.
-- true           = súmula exige cadastro de artilheiros e goleiros.

ALTER TABLE public.championship_sports
  ADD COLUMN IF NOT EXISTS supports_individual_awards BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.championship_sports.supports_individual_awards
  IS 'Se true, a conferência de súmula exige cadastro de artilheiros e goleiros. Padrão: false.';

-- Seed: habilita somente para Futebol Society.
UPDATE public.championship_sports
SET supports_individual_awards = true
WHERE sport_id IN (
  SELECT id FROM public.sports
  WHERE lower(trim(name)) = 'futebol society'
);
