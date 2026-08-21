INSERT INTO public.admin_profile_permissions (
  profile_id,
  admin_tab,
  access_level
)
SELECT
  matches_permissions.profile_id,
  'individual_events'::public.admin_panel_tab,
  matches_permissions.access_level
FROM public.admin_profile_permissions AS matches_permissions
LEFT JOIN public.admin_profile_permissions AS individual_events_permissions
  ON individual_events_permissions.profile_id = matches_permissions.profile_id
  AND individual_events_permissions.admin_tab = 'individual_events'::public.admin_panel_tab
WHERE matches_permissions.admin_tab = 'matches'::public.admin_panel_tab
  AND individual_events_permissions.profile_id IS NULL
ON CONFLICT (profile_id, admin_tab) DO NOTHING;
