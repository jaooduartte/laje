DROP POLICY IF EXISTS championship_season_settings_admin_select
ON public.championship_season_settings;

DROP POLICY IF EXISTS championship_season_settings_admin_insert
ON public.championship_season_settings;

DROP POLICY IF EXISTS championship_season_settings_admin_update
ON public.championship_season_settings;

CREATE POLICY championship_season_settings_admin_select
ON public.championship_season_settings
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND public.has_admin_tab_access(
    'matches'::public.admin_panel_tab,
    true
  )
);

CREATE POLICY championship_season_settings_admin_insert
ON public.championship_season_settings
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.has_admin_tab_access(
    'matches'::public.admin_panel_tab,
    true
  )
);

CREATE POLICY championship_season_settings_admin_update
ON public.championship_season_settings
FOR UPDATE
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND public.has_admin_tab_access(
    'matches'::public.admin_panel_tab,
    true
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.has_admin_tab_access(
    'matches'::public.admin_panel_tab,
    true
  )
);

NOTIFY pgrst, 'reload schema';