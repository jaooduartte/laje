ALTER FUNCTION
  public.create_championship_knockout_match_schedule(UUID)
SET search_path = public;

REVOKE EXECUTE ON FUNCTION
  public.resolve_championship_competition_expected_knockout_rounds(UUID)
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION
  public.sync_championship_bracket_court_sport_preferences(UUID, JSONB)
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION
  public.get_championship_knockout_final_program_schedule(UUID)
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION
  public.validate_championship_knockout_final_program_schedule(UUID)
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION
  public.assign_championship_knockout_match_planned_schedule(UUID, UUID)
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION
  public.create_championship_knockout_match_schedule(UUID, UUID)
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION
  public.create_championship_knockout_match_schedule(UUID)
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION
  public.generate_championship_bracket_groups(UUID, JSONB)
FROM anon;

REVOKE EXECUTE ON FUNCTION
  public.preview_championship_bracket_groups(UUID, JSONB)
FROM anon;

NOTIFY pgrst, 'reload schema';