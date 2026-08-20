REVOKE EXECUTE ON FUNCTION
  public.preview_championship_bracket_reconfiguration(
    UUID,
    TEXT,
    JSONB
  )
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.preview_championship_bracket_reconfiguration(
    UUID,
    TEXT,
    JSONB
  )
TO authenticated, service_role;


REVOKE EXECUTE ON FUNCTION
  public.apply_championship_bracket_reconfiguration(
    UUID,
    TEXT,
    JSONB,
    BIGINT
  )
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.apply_championship_bracket_reconfiguration(
    UUID,
    TEXT,
    JSONB,
    BIGINT
  )
TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION
  public.execute_championship_bracket_reconfiguration(
    UUID,
    TEXT,
    JSONB
  )
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.execute_championship_bracket_reconfiguration(
    UUID,
    TEXT,
    JSONB
  )
TO service_role;

REVOKE EXECUTE ON FUNCTION
  public.update_bracket_competition_settings(
    UUID,
    INTEGER,
    BOOLEAN,
    TEXT
  )
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.update_bracket_competition_settings(
    UUID,
    INTEGER,
    BOOLEAN,
    TEXT
  )
TO service_role;


REVOKE EXECUTE ON FUNCTION
  public.update_bracket_location_sport_priorities(
    UUID,
    JSONB
  )
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.update_bracket_location_sport_priorities(
    UUID,
    JSONB
  )
TO service_role;


REVOKE EXECUTE ON FUNCTION
  public.update_bracket_court_sequences(
    UUID,
    JSONB
  )
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.update_bracket_court_sequences(
    UUID,
    JSONB
  )
TO service_role;


REVOKE EXECUTE ON FUNCTION
  public.update_bracket_knockout_court_priorities(
    UUID,
    JSONB
  )
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.update_bracket_knockout_court_priorities(
    UUID,
    JSONB
  )
TO service_role;


REVOKE EXECUTE ON FUNCTION
  public.update_bracket_generated_location_group(
    UUID,
    JSONB
  )
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.update_bracket_generated_location_group(
    UUID,
    JSONB
  )
TO service_role;

REVOKE EXECUTE ON FUNCTION
  public.get_admin_championship_knockout_final_program_schedule(
    UUID
  )
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.get_admin_championship_knockout_final_program_schedule(
    UUID
  )
TO authenticated, service_role;


NOTIFY pgrst, 'reload schema';