ALTER FUNCTION public.get_interlaje_overall_standings(UUID, INTEGER)
  SECURITY DEFINER;

ALTER FUNCTION public.get_interlaje_overall_standings(UUID, INTEGER)
  SET search_path = public;

REVOKE ALL ON FUNCTION public.get_interlaje_overall_standings(UUID, INTEGER)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_interlaje_overall_standings(UUID, INTEGER)
  TO anon, authenticated;
