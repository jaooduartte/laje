-- Expõe o início efetivo do processamento para a Etapa 13 calcular o tempo em andamento.
CREATE OR REPLACE FUNCTION public.get_championship_bracket_preview_job_status(_job_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  response JSONB;
  job_started_at TIMESTAMPTZ;
BEGIN
  response := public.get_championship_bracket_preview_job_status_v7(_job_id);

  SELECT started_at
  INTO job_started_at
  FROM championship_bracket_preview_private.jobs
  WHERE id = _job_id;

  RETURN response || jsonb_build_object(
    'started_at', job_started_at,
    'is_valid_for_creation',
      COALESCE(
        (response ->> 'status') = 'COMPLETED'
        AND (response ->> 'algorithm_version') = 'async-exact-v8'
        AND (response ->> 'generation_signature') IS NOT NULL
        AND (response ->> 'diagnostics') = '[]',
        false
      )
  );
END;
$function$;
