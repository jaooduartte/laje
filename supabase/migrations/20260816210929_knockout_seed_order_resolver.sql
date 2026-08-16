-- Resolve a ordem dos seeds da primeira rodada do mata-mata
-- de acordo com o modo configurado na competição.
--
-- Exemplos para chave de 8:
--
-- LINEAR
-- [1,8,2,7,3,6,4,5]
--
-- RANKING_ALTERNATING
-- [1,8,3,6,2,7,4,5]
--
-- CLASSIC_SEEDED
-- [1,8,4,5,2,7,3,6]

CREATE OR REPLACE FUNCTION public.resolve_championship_knockout_seed_order(
  input_mode text,
  bracket_size integer
)
RETURNS integer[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  pairing_mode text;
  seed_order integer[] := ARRAY[]::integer[];
  next_seed_order integer[] := ARRAY[]::integer[];

  half_size integer;
  current_size integer;
  leader_seed integer;
  seed_value integer;
BEGIN
  -- Apenas chaves de potência de 2 são válidas.
  IF bracket_size IS NULL
    OR bracket_size < 2
    OR (bracket_size & (bracket_size - 1)) <> 0
  THEN
    RETURN ARRAY[]::integer[];
  END IF;

  pairing_mode :=
    public.resolve_championship_knockout_pairing_mode(input_mode);

  half_size := bracket_size / 2;

  ---------------------------------------------------------------------------
  -- LINEAR
  --
  -- 8 participantes:
  -- 1 x 8
  -- 2 x 7
  -- 3 x 6
  -- 4 x 5
  ---------------------------------------------------------------------------
  IF pairing_mode = 'LINEAR' THEN
    FOR leader_seed IN 1..half_size LOOP
      seed_order :=
        seed_order
        || ARRAY[
          leader_seed,
          bracket_size + 1 - leader_seed
        ];
    END LOOP;

    RETURN seed_order;
  END IF;

  ---------------------------------------------------------------------------
  -- RANKING_ALTERNATING
  --
  -- Primeiro líderes ímpares, depois líderes pares.
  --
  -- 8 participantes:
  -- 1 x 8
  -- 3 x 6
  -- 2 x 7
  -- 4 x 5
  ---------------------------------------------------------------------------
  IF pairing_mode = 'RANKING_ALTERNATING' THEN
    FOR leader_seed IN 1..half_size BY 2 LOOP
      seed_order :=
        seed_order
        || ARRAY[
          leader_seed,
          bracket_size + 1 - leader_seed
        ];
    END LOOP;

    FOR leader_seed IN 2..half_size BY 2 LOOP
      seed_order :=
        seed_order
        || ARRAY[
          leader_seed,
          bracket_size + 1 - leader_seed
        ];
    END LOOP;

    RETURN seed_order;
  END IF;

  ---------------------------------------------------------------------------
  -- CLASSIC_SEEDED
  --
  -- Montagem recursiva clássica de chaveamento.
  --
  -- 2:
  -- [1,2]
  --
  -- 4:
  -- [1,4,2,3]
  --
  -- 8:
  -- [1,8,4,5,2,7,3,6]
  --
  -- 16:
  -- [1,16,8,9,4,13,5,12,2,15,7,10,3,14,6,11]
  ---------------------------------------------------------------------------
  seed_order := ARRAY[1, 2];
  current_size := 2;

  WHILE current_size < bracket_size LOOP
    next_seed_order := ARRAY[]::integer[];

    FOREACH seed_value IN ARRAY seed_order LOOP
      next_seed_order :=
        next_seed_order
        || ARRAY[
          seed_value,
          (current_size * 2) + 1 - seed_value
        ];
    END LOOP;

    seed_order := next_seed_order;
    current_size := current_size * 2;
  END LOOP;

  RETURN seed_order;
END;
$function$;

COMMENT ON FUNCTION public.resolve_championship_knockout_seed_order(text, integer)
IS
  'Retorna a ordem dos seeds da primeira rodada do mata-mata para os modos LINEAR, RANKING_ALTERNATING e CLASSIC_SEEDED. Retorna array vazio para tamanhos de chave inválidos.';