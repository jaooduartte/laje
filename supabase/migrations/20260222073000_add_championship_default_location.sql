DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'championships'
      AND column_name = 'default_location'
  ) THEN
    ALTER TABLE public.championships
      ADD COLUMN default_location TEXT;
  END IF;
END
$$;
