-- Normaliza qualquer valor legado ou inválido antes de restringir
-- a coluna aos três modos oficiais.
UPDATE public.championship_bracket_competitions
SET knockout_pairing_mode = 'LINEAR'
WHERE knockout_pairing_mode NOT IN (
  'LINEAR',
  'RANKING_ALTERNATING',
  'CLASSIC_SEEDED'
);

-- Remove a constraint antiga, que ainda conhece os modos legados.
ALTER TABLE public.championship_bracket_competitions
  DROP CONSTRAINT IF EXISTS
    championship_bracket_competitions_knockout_pairing_mode_check;

-- Passa a aceitar somente os três modos oficiais.
ALTER TABLE public.championship_bracket_competitions
  ADD CONSTRAINT
    championship_bracket_competitions_knockout_pairing_mode_check
  CHECK (
    knockout_pairing_mode IN (
      'LINEAR',
      'RANKING_ALTERNATING',
      'CLASSIC_SEEDED'
    )
  );

-- Competições já existentes permanecem LINEAR.
-- O novo default vale somente para novas competições.
ALTER TABLE public.championship_bracket_competitions
  ALTER COLUMN knockout_pairing_mode
  SET DEFAULT 'CLASSIC_SEEDED';

-- Centraliza a normalização do modo também no PostgreSQL.
CREATE OR REPLACE FUNCTION public.resolve_championship_knockout_pairing_mode(
  _value text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN upper(trim(COALESCE(_value, ''))) IN (
      'LINEAR',
      'RANKING_ALTERNATING',
      'CLASSIC_SEEDED'
    )
      THEN upper(trim(_value))
    WHEN upper(trim(COALESCE(_value, ''))) IN (
      'FUTEVOLEI_FEM_INVERTED',
      'BEACH_SOCCER_FEM_DIRECT_SEMI',
      'FUTEBOL_SOCIETY_FEM_ACCESS_CROSS_GROUPS'
    )
      THEN 'LINEAR'
    ELSE 'LINEAR'
  END;
$function$;