CREATE OR REPLACE FUNCTION public.get_admin_championship_knockout_final_program_schedule(
  _bracket_edition_id UUID
)
RETURNS TABLE (
  competition_id UUID,
  sport_id UUID,
  naipe public.match_naipe,
  division public.team_division,
  scheduled_date DATE,
  schedule_period public.championship_schedule_period,
  location_name TEXT,
  court_name TEXT,
  location_group_id UUID,
  court_group_id UUID,
  bracket_day_id UUID,
  bracket_court_id UUID,
  display_order INTEGER,
  naipe_position INTEGER,
  expected_final_round INTEGER,
  duration_minutes INTEGER,
  planned_start_at TIMESTAMPTZ,
  planned_end_at TIMESTAMPTZ,
  planned_scheduled_slot INTEGER,
  planned_queue_position INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_admin_tab_access(
    'championship_schedule'::public.admin_panel_tab,
    true
  ) THEN
    RAISE EXCEPTION 'Usuário sem permissão para consultar a programação das finais.';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.get_championship_knockout_final_program_schedule(
    _bracket_edition_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_championship_knockout_final_program_schedule(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_admin_championship_knockout_final_program_schedule(UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_admin_championship_knockout_final_program_schedule(UUID) TO service_role;

COMMENT ON FUNCTION public.get_admin_championship_knockout_final_program_schedule(UUID)
IS 'Expõe a programação calculada das finais ao painel administrativo mediante permissão da aba championship_schedule.';

NOTIFY pgrst, 'reload schema';
