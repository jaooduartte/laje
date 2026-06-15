-- Garante que os intervalos múltiplos dos dias do chaveamento sejam visíveis
-- pela aplicação via Data API, respeitando o mesmo padrão de RLS já usado
-- em championship_bracket_days.

ALTER TABLE public.championship_bracket_day_breaks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'championship_bracket_day_breaks'
      AND policyname = 'Public can view championship_bracket_day_breaks'
  ) THEN
    CREATE POLICY "Public can view championship_bracket_day_breaks"
      ON public.championship_bracket_day_breaks
      FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'championship_bracket_day_breaks'
      AND policyname = 'Admin can insert championship_bracket_day_breaks'
  ) THEN
    CREATE POLICY "Admin can insert championship_bracket_day_breaks"
      ON public.championship_bracket_day_breaks
      FOR INSERT
      TO authenticated
      WITH CHECK (public.has_admin_tab_access('matches'::public.admin_panel_tab, true));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'championship_bracket_day_breaks'
      AND policyname = 'Admin can update championship_bracket_day_breaks'
  ) THEN
    CREATE POLICY "Admin can update championship_bracket_day_breaks"
      ON public.championship_bracket_day_breaks
      FOR UPDATE
      TO authenticated
      USING (public.has_admin_tab_access('matches'::public.admin_panel_tab, true))
      WITH CHECK (public.has_admin_tab_access('matches'::public.admin_panel_tab, true));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'championship_bracket_day_breaks'
      AND policyname = 'Admin can delete championship_bracket_day_breaks'
  ) THEN
    CREATE POLICY "Admin can delete championship_bracket_day_breaks"
      ON public.championship_bracket_day_breaks
      FOR DELETE
      TO authenticated
      USING (public.has_admin_tab_access('matches'::public.admin_panel_tab, true));
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
