DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'teams'
  ) THEN
    RAISE EXCEPTION 'Tabela public.teams não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'is_admin'
      AND pg_function_is_visible(oid)
  ) THEN
    RAISE EXCEPTION 'Função public.is_admin não encontrada.';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'league_event_type'
  ) THEN
    CREATE TYPE public.league_event_type AS ENUM ('HH', 'OPEN_BAR', 'CHAMPIONSHIP', 'LAJE_EVENT');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'league_event_organizer_type'
  ) THEN
    CREATE TYPE public.league_event_organizer_type AS ENUM ('ATHLETIC', 'LAJE');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.league_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  event_type public.league_event_type NOT NULL,
  organizer_type public.league_event_organizer_type NOT NULL,
  organizer_team_id UUID,
  event_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.league_events
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS event_type public.league_event_type,
  ADD COLUMN IF NOT EXISTS organizer_type public.league_event_organizer_type,
  ADD COLUMN IF NOT EXISTS organizer_team_id UUID,
  ADD COLUMN IF NOT EXISTS event_date DATE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.league_events
  ALTER COLUMN name SET NOT NULL;

ALTER TABLE public.league_events
  ALTER COLUMN event_type SET NOT NULL;

ALTER TABLE public.league_events
  ALTER COLUMN organizer_type SET NOT NULL;

ALTER TABLE public.league_events
  ALTER COLUMN event_date SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'league_events_organizer_team_id_fkey'
      AND conrelid = 'public.league_events'::regclass
  ) THEN
    ALTER TABLE public.league_events
      ADD CONSTRAINT league_events_organizer_team_id_fkey
      FOREIGN KEY (organizer_team_id)
      REFERENCES public.teams(id)
      ON DELETE RESTRICT;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'league_events_organizer_consistency_check'
      AND conrelid = 'public.league_events'::regclass
  ) THEN
    ALTER TABLE public.league_events
      ADD CONSTRAINT league_events_organizer_consistency_check
      CHECK (
        (
          organizer_type = 'LAJE'::public.league_event_organizer_type
          AND organizer_team_id IS NULL
        )
        OR
        (
          organizer_type = 'ATHLETIC'::public.league_event_organizer_type
          AND organizer_team_id IS NOT NULL
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'league_events_laje_event_must_be_laje_organizer_check'
      AND conrelid = 'public.league_events'::regclass
  ) THEN
    ALTER TABLE public.league_events
      ADD CONSTRAINT league_events_laje_event_must_be_laje_organizer_check
      CHECK (
        event_type != 'LAJE_EVENT'::public.league_event_type
        OR organizer_type = 'LAJE'::public.league_event_organizer_type
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS league_events_event_date_idx
  ON public.league_events (event_date);

CREATE OR REPLACE FUNCTION public.set_league_events_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_league_events_updated_at_trigger ON public.league_events;

CREATE TRIGGER set_league_events_updated_at_trigger
BEFORE UPDATE ON public.league_events
FOR EACH ROW
EXECUTE FUNCTION public.set_league_events_updated_at();

ALTER TABLE public.league_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_events'
      AND policyname = 'Public can view league events'
  ) THEN
    CREATE POLICY "Public can view league events"
      ON public.league_events
      FOR SELECT
      USING (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_events'
      AND policyname = 'Admin can insert league events'
  ) THEN
    CREATE POLICY "Admin can insert league events"
      ON public.league_events
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_admin());
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_events'
      AND policyname = 'Admin can update league events'
  ) THEN
    CREATE POLICY "Admin can update league events"
      ON public.league_events
      FOR UPDATE
      TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_events'
      AND policyname = 'Admin can delete league events'
  ) THEN
    CREATE POLICY "Admin can delete league events"
      ON public.league_events
      FOR DELETE
      TO authenticated
      USING (public.is_admin());
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'league_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.league_events;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
