DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'league_events'
  ) THEN
    RAISE EXCEPTION 'Tabela public.league_events não encontrada.';
  END IF;

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

CREATE TABLE IF NOT EXISTS public.league_event_organizer_teams (
  event_id UUID NOT NULL,
  team_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, team_id)
);

ALTER TABLE public.league_event_organizer_teams
  ADD COLUMN IF NOT EXISTS event_id UUID,
  ADD COLUMN IF NOT EXISTS team_id UUID,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.league_event_organizer_teams
    WHERE event_id IS NULL
      OR team_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Tabela public.league_event_organizer_teams possui vínculos com colunas nulas.';
  END IF;
END
$$;

ALTER TABLE public.league_event_organizer_teams
  ALTER COLUMN event_id SET NOT NULL;

ALTER TABLE public.league_event_organizer_teams
  ALTER COLUMN team_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'league_event_organizer_teams_event_id_fkey'
      AND conrelid = 'public.league_event_organizer_teams'::regclass
  ) THEN
    ALTER TABLE public.league_event_organizer_teams
      ADD CONSTRAINT league_event_organizer_teams_event_id_fkey
      FOREIGN KEY (event_id)
      REFERENCES public.league_events(id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'league_event_organizer_teams_team_id_fkey'
      AND conrelid = 'public.league_event_organizer_teams'::regclass
  ) THEN
    ALTER TABLE public.league_event_organizer_teams
      ADD CONSTRAINT league_event_organizer_teams_team_id_fkey
      FOREIGN KEY (team_id)
      REFERENCES public.teams(id)
      ON DELETE RESTRICT;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS league_event_organizer_teams_team_id_idx
  ON public.league_event_organizer_teams (team_id);

CREATE OR REPLACE FUNCTION public.validate_league_event_organizer_team()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  event_organizer_type public.league_event_organizer_type;
BEGIN
  SELECT organizer_type
  INTO event_organizer_type
  FROM public.league_events
  WHERE id = NEW.event_id;

  IF event_organizer_type IS NULL THEN
    RAISE EXCEPTION 'Evento inválido para vínculo de organização.';
  END IF;

  IF event_organizer_type != 'ATHLETIC'::public.league_event_organizer_type THEN
    RAISE EXCEPTION 'Somente eventos organizados por atléticas podem ter vínculos em league_event_organizer_teams.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_league_event_organizer_team_trigger ON public.league_event_organizer_teams;

CREATE TRIGGER validate_league_event_organizer_team_trigger
BEFORE INSERT OR UPDATE ON public.league_event_organizer_teams
FOR EACH ROW
EXECUTE FUNCTION public.validate_league_event_organizer_team();

INSERT INTO public.league_event_organizer_teams (
  event_id,
  team_id
)
SELECT
  league_events.id,
  league_events.organizer_team_id
FROM public.league_events
WHERE league_events.organizer_type = 'ATHLETIC'::public.league_event_organizer_type
  AND league_events.organizer_team_id IS NOT NULL
ON CONFLICT (event_id, team_id) DO NOTHING;

ALTER TABLE public.league_event_organizer_teams ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_event_organizer_teams'
      AND policyname = 'Public can view league event organizers'
  ) THEN
    CREATE POLICY "Public can view league event organizers"
      ON public.league_event_organizer_teams
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
      AND tablename = 'league_event_organizer_teams'
      AND policyname = 'Admin can insert league event organizers'
  ) THEN
    CREATE POLICY "Admin can insert league event organizers"
      ON public.league_event_organizer_teams
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
      AND tablename = 'league_event_organizer_teams'
      AND policyname = 'Admin can update league event organizers'
  ) THEN
    CREATE POLICY "Admin can update league event organizers"
      ON public.league_event_organizer_teams
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
      AND tablename = 'league_event_organizer_teams'
      AND policyname = 'Admin can delete league event organizers'
  ) THEN
    CREATE POLICY "Admin can delete league event organizers"
      ON public.league_event_organizer_teams
      FOR DELETE
      TO authenticated
      USING (public.is_admin());
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'teams'
      AND column_name = 'division'
  ) THEN
    ALTER TABLE public.teams
      ALTER COLUMN division DROP NOT NULL;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
