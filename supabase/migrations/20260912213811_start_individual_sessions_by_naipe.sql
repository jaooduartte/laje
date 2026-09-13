CREATE OR REPLACE FUNCTION public.start_championship_individual_sessions(
  _session_ids UUID[]
)
RETURNS UUID[]
LANGUAGE plpgsql
AS $$
DECLARE
  requested_sessions_count INTEGER;
  found_sessions_count INTEGER;
  championship_count INTEGER;
  sport_count INTEGER;
  naipe_count INTEGER;
BEGIN
  SELECT count(*)::INTEGER
  INTO requested_sessions_count
  FROM (
    SELECT DISTINCT unnest(_session_ids) AS session_id
  ) AS requested_sessions;

  IF requested_sessions_count < 2 THEN
    RAISE EXCEPTION 'Selecione as sessões masculina e feminina para iniciar em conjunto.';
  END IF;

  SELECT
    count(*)::INTEGER,
    count(DISTINCT sessions_table.championship_id)::INTEGER,
    count(DISTINCT sessions_table.sport_id)::INTEGER,
    count(DISTINCT sessions_table.naipe)::INTEGER
  INTO
    found_sessions_count,
    championship_count,
    sport_count,
    naipe_count
  FROM public.championship_individual_sessions AS sessions_table
  JOIN public.championships AS championships_table
    ON championships_table.id = sessions_table.championship_id
  WHERE sessions_table.id = ANY(_session_ids)
    AND championships_table.status = 'IN_PROGRESS'::public.championship_status;

  IF found_sessions_count != requested_sessions_count
    OR championship_count != 1
    OR sport_count != 1
    OR naipe_count != requested_sessions_count THEN
    RAISE EXCEPTION 'As sessões precisam ser da mesma modalidade, em naipes distintos e com o campeonato em andamento.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.championship_individual_sessions AS sessions_table
    WHERE sessions_table.id = ANY(_session_ids)
      AND sessions_table.status != 'SCHEDULED'::public.championship_individual_session_status
  ) THEN
    RAISE EXCEPTION 'Todas as sessões precisam estar agendadas para serem iniciadas em conjunto.';
  END IF;

  UPDATE public.championship_individual_sessions
  SET status = 'LIVE'::public.championship_individual_session_status,
      updated_at = now()
  WHERE id = ANY(_session_ids);

  RETURN _session_ids;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_championship_individual_sessions(UUID[]) TO authenticated;
