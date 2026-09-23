ALTER FUNCTION public.get_current_user_theme_mode_preference()
  SET statement_timeout = '2s';

ALTER FUNCTION public.get_current_user_admin_context()
  SET statement_timeout = '2s';

ALTER FUNCTION public.can_access_admin_panel()
  SET statement_timeout = '2s';

ALTER FUNCTION public.get_home_dashboard_metrics(INTEGER)
  SET statement_timeout = '2s';

ALTER FUNCTION public.get_home_dashboard_metrics(INTEGER, public.championship_code)
  SET statement_timeout = '2s';

ALTER FUNCTION public.list_championship_competition_team_disqualifications(UUID, INTEGER)
  SET statement_timeout = '2s';

ALTER FUNCTION public.get_championship_control_operational_queue_state(UUID, INTEGER)
  SET statement_timeout = '2s';

ALTER FUNCTION public.get_championship_award_pending_draws(UUID, INTEGER)
  SET statement_timeout = '2s';

ALTER ROLE authenticator
  SET pgrst.server_timing_enabled = 'true';

NOTIFY pgrst, 'reload config';
