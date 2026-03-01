DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'league_event_organizer_teams'
  ) THEN
    RAISE EXCEPTION 'Tabela public.league_event_organizer_teams não encontrada.';
  END IF;
END
$$;

GRANT SELECT ON TABLE public.league_event_organizer_teams TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.league_event_organizer_teams TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.league_event_organizer_teams TO service_role;

NOTIFY pgrst, 'reload schema';
