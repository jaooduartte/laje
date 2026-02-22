DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'championship_status'
  ) THEN
    CREATE TYPE public.championship_status AS ENUM ('UPCOMING', 'IN_PROGRESS', 'FINISHED');
  END IF;
END
$$;

ALTER TABLE public.championships
  ADD COLUMN IF NOT EXISTS status public.championship_status;

UPDATE public.championships
SET status = 'UPCOMING'::public.championship_status
WHERE status IS NULL;

ALTER TABLE public.championships
  ALTER COLUMN status SET DEFAULT 'UPCOMING'::public.championship_status;

ALTER TABLE public.championships
  ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.team_division'::regtype
      AND enumlabel = 'SERIE_A'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.team_division'::regtype
      AND enumlabel = 'DIVISAO_PRINCIPAL'
  ) THEN
    ALTER TYPE public.team_division RENAME VALUE 'SERIE_A' TO 'DIVISAO_PRINCIPAL';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.team_division'::regtype
      AND enumlabel = 'SERIE_B'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.team_division'::regtype
      AND enumlabel = 'DIVISAO_ACESSO'
  ) THEN
    ALTER TYPE public.team_division RENAME VALUE 'SERIE_B' TO 'DIVISAO_ACESSO';
  END IF;
END
$$;

UPDATE public.teams
SET division = 'DIVISAO_ACESSO'::public.team_division
WHERE division IS NULL;

ALTER TABLE public.teams
  ALTER COLUMN division SET DEFAULT 'DIVISAO_ACESSO'::public.team_division;
