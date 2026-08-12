-- LAJE-81: a configuração do chaveamento ocorre em UPCOMING
-- ("Configurando campeonato"), não em PLANNING ("Em breve").

CREATE OR REPLACE FUNCTION public.start_championship_bracket_preview_job(
  _championship_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
SET statement_timeout = '15s'
AS $function$
DECLARE
  season INTEGER;
  payload_hash TEXT;
  dependency_hash TEXT;
  existing_job RECORD;
  new_id UUID;
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true)
  THEN
    RAISE EXCEPTION 'Usuário sem permissão para calcular a programação.';
  END IF;

  SELECT championships_table.current_season_year
  INTO season
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id
    AND championships_table.status = 'UPCOMING'::public.championship_status;

  IF season IS NULL THEN
    RAISE EXCEPTION 'Campeonato inválido ou fora do status Configurando campeonato.';
  END IF;

  payload_hash := public.resolve_championship_bracket_preview_payload_signature(
    COALESCE(_payload, '{}'::JSONB)
  );
  dependency_hash := championship_bracket_preview_private.resolve_dependency_signature(
    _championship_id,
    COALESCE(_payload, '{}'::JSONB)
  );

  SELECT *
  INTO existing_job
  FROM championship_bracket_preview_private.jobs
  WHERE championship_id = _championship_id
    AND season_year = season
    AND requested_by = auth.uid()
    AND payload_signature = payload_hash
    AND dependency_signature = dependency_hash
    AND expires_at > now()
    AND status IN ('QUEUED', 'INITIALIZING', 'SCHEDULING', 'FINALIZING', 'COMPLETED')
  ORDER BY created_at DESC
  LIMIT 1;

  IF existing_job.id IS NOT NULL THEN
    RETURN public.get_championship_bracket_preview_job_status(existing_job.id);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.jobs
    WHERE championship_id = _championship_id
      AND season_year = season
      AND requested_by <> auth.uid()
      AND status IN ('QUEUED', 'INITIALIZING', 'SCHEDULING', 'FINALIZING')
  ) THEN
    RAISE EXCEPTION 'Já existe uma programação exata em andamento para este campeonato.';
  END IF;

  UPDATE championship_bracket_preview_private.jobs
  SET
    status = 'CANCELLED',
    stage = 'Substituída por nova configuração',
    expires_at = now() + interval '24 hours',
    updated_at = now()
  WHERE championship_id = _championship_id
    AND season_year = season
    AND status IN ('QUEUED', 'INITIALIZING', 'SCHEDULING', 'FINALIZING');

  INSERT INTO championship_bracket_preview_private.jobs (
    championship_id,
    season_year,
    requested_by,
    payload,
    payload_signature,
    dependency_signature
  ) VALUES (
    _championship_id,
    season,
    auth.uid(),
    COALESCE(_payload, '{}'::JSONB),
    payload_hash,
    dependency_hash
  )
  RETURNING id INTO new_id;

  PERFORM championship_bracket_preview_private.enqueue(new_id, 0);

  RETURN public.get_championship_bracket_preview_job_status(new_id);
END;
$function$;

NOTIFY pgrst, 'reload schema';
