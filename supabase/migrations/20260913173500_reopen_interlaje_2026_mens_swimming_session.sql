DO $$
DECLARE
  target_session_id UUID;
BEGIN
  SELECT sessions_table.id
  INTO target_session_id
  FROM public.championship_individual_sessions AS sessions_table
  JOIN public.championships AS championships_table
    ON championships_table.id = sessions_table.championship_id
  JOIN public.sports AS sports_table
    ON sports_table.id = sessions_table.sport_id
  WHERE championships_table.code = 'INTERLAJE'::public.championship_code
    AND sessions_table.season_year = 2026
    AND public.normalize_sport_name(sports_table.name) = 'natacao'
    AND sessions_table.naipe = 'MASCULINO'::public.match_naipe
    AND sessions_table.status = 'FINISHED'::public.championship_individual_session_status;

  IF target_session_id IS NULL THEN
    RAISE EXCEPTION 'A sessão masculina de Natação do INTERLAJE 2026 não está encerrada.';
  END IF;

  UPDATE public.championship_individual_sessions
  SET status = 'LIVE'::public.championship_individual_session_status,
      updated_at = now()
  WHERE id = target_session_id;
END;
$$;
