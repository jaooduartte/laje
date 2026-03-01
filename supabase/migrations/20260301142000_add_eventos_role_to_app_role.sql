DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'app_role'
  ) THEN
    RAISE EXCEPTION 'Enum public.app_role não encontrado.';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.app_role'::regtype
      AND enumlabel = 'eventos'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'eventos';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
