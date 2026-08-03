DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.championship_sport_tie_breaker_rule'::regtype
      AND enumlabel = 'HANDEBOL'
  ) THEN
    ALTER TYPE public.championship_sport_tie_breaker_rule ADD VALUE 'HANDEBOL';
  END IF;
END;
$$;
