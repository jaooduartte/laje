DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'championship_status'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.championship_status'::regtype
      AND enumlabel = 'PLANNING'
  ) THEN
    ALTER TYPE public.championship_status ADD VALUE 'PLANNING' BEFORE 'UPCOMING';
  END IF;
END
$$;
