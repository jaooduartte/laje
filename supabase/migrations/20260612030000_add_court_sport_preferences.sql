-- Preferência de naipe/divisão por quadra+modalidade (semântica preferencial, não estrita).
-- NULL = sem preferência (comportamento atual). Usado pela geração de jogos para intercalar
-- slots e pelo controle ao vivo para sugerir a quadra adequada.

ALTER TABLE public.championship_bracket_court_sports
  ADD COLUMN IF NOT EXISTS preferred_naipe public.match_naipe NULL,
  ADD COLUMN IF NOT EXISTS preferred_division public.team_division NULL;

COMMENT ON COLUMN public.championship_bracket_court_sports.preferred_naipe IS 'Naipe preferencial da quadra para esta modalidade (NULL = sem preferência).';
COMMENT ON COLUMN public.championship_bracket_court_sports.preferred_division IS 'Divisão preferencial da quadra para esta modalidade (NULL = sem preferência).';

NOTIFY pgrst, 'reload schema';
