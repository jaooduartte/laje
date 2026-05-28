-- Feature 1: W.O. configurável por modalidade.
-- Adiciona walkover_winner_points em championship_sports.
-- NULL = modalidade não suporta W.O.; valor inteiro = pontos do vencedor.

ALTER TABLE public.championship_sports
  ADD COLUMN IF NOT EXISTS walkover_winner_points INTEGER NULL;

COMMENT ON COLUMN public.championship_sports.walkover_winner_points
  IS 'Pontos do vencedor em caso de W.O. NULL = modalidade não suporta W.O.';

-- Seed: preenche o valor para as modalidades já cadastradas com regra de W.O. conhecida.
-- Beach Soccer → 3 pontos
UPDATE public.championship_sports
SET walkover_winner_points = 3
WHERE sport_id IN (
  SELECT id FROM public.sports
  WHERE lower(trim(name)) = 'beach soccer'
);

-- Futebol Society → 3 pontos
UPDATE public.championship_sports
SET walkover_winner_points = 3
WHERE sport_id IN (
  SELECT id FROM public.sports
  WHERE lower(trim(name)) = 'futebol society'
);

-- Vôlei de Praia → 21 pontos
UPDATE public.championship_sports
SET walkover_winner_points = 21
WHERE sport_id IN (
  SELECT id FROM public.sports
  WHERE lower(trim(name)) IN ('vôlei de praia', 'volei de praia')
);

-- Beach Tennis → 6 pontos
UPDATE public.championship_sports
SET walkover_winner_points = 6
WHERE sport_id IN (
  SELECT id FROM public.sports
  WHERE lower(trim(name)) = 'beach tennis'
);

-- Futevôlei → 18 pontos
UPDATE public.championship_sports
SET walkover_winner_points = 18
WHERE sport_id IN (
  SELECT id FROM public.sports
  WHERE lower(trim(name)) IN ('futevôlei', 'futevolei')
);
