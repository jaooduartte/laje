-- Limpeza de logs de auditoria do Copa Laje Society 2026 (período 20/05/2026 → hoje).
--
-- Contexto: a migration 20260528000000 apagou corretamente os dados de jogo/bracket/awards,
-- mas não limpou os logs porque o actor_email estava errado (usou 'joaopduartecontato@gmail.com'
-- em vez do email real 'duarte@ligadasatleticas.com').
--
-- Esta migration apaga APENAS os logs relacionados ao Copa Laje Society:
--   - public.matches       → filtrado por championship_id no JSONB (new_data/old_data)
--   - championship_bracket_workflow → filtrado por championship_id no metadata
--   - public.championships → filtrado por record_id = id do SOCIETY
--
-- Preservado (NÃO apagado):
--   - Logs de auth.users        (criação/gestão de usuários — independente do campeonato)
--   - public_page_access_settings (configuração global)
--   - league_events / league_event_reservation_requests / league_event_organizer_teams
--   - Logs de outros campeonatos (CLV, INTERLAJE)

DO $cleanup_logs$
DECLARE
  society_id    UUID := '17b92cf5-dd92-44eb-9295-b28000372e4b';
  cutoff_start  TIMESTAMPTZ := '2026-05-20T00:00:00-03:00';
  cutoff_end    TIMESTAMPTZ := now() + interval '1 day';
  deleted_count BIGINT;
BEGIN
  -- Confirma que o ID ainda corresponde ao SOCIETY (sanity check)
  IF NOT EXISTS (
    SELECT 1 FROM public.championships
    WHERE id = society_id AND code = 'SOCIETY'
  ) THEN
    RAISE EXCEPTION 'championship_id % não corresponde ao SOCIETY — abortando.', society_id;
  END IF;

  -- 1) Logs de matches do SOCIETY
  --    O trigger grava championship_id em new_data e old_data.
  DELETE FROM public.admin_action_logs
  WHERE actor_email = 'duarte@ligadasatleticas.com'
    AND created_at >= cutoff_start
    AND created_at <  cutoff_end
    AND resource_table = 'public.matches'
    AND (
      (new_data->>'championship_id') = society_id::text
      OR (old_data->>'championship_id') = society_id::text
    );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Logs de matches apagados: %', deleted_count;

  -- 2) Logs de championship_bracket_workflow do SOCIETY
  --    O app grava championship_id no metadata, não no new_data/old_data.
  DELETE FROM public.admin_action_logs
  WHERE actor_email = 'duarte@ligadasatleticas.com'
    AND created_at >= cutoff_start
    AND created_at <  cutoff_end
    AND resource_table = 'public.championship_bracket_workflow'
    AND (metadata->>'championship_id') = society_id::text;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Logs de bracket_workflow apagados: %', deleted_count;

  -- 3) Logs de championships onde record_id é o ID do SOCIETY
  --    (ex: alterações de current_season_year, status, etc.)
  DELETE FROM public.admin_action_logs
  WHERE actor_email = 'duarte@ligadasatleticas.com'
    AND created_at >= cutoff_start
    AND created_at <  cutoff_end
    AND resource_table = 'public.championships'
    AND record_id = society_id::text;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Logs de championships apagados: %', deleted_count;

  RAISE NOTICE 'Limpeza de logs Copa Laje Society 2026 concluída.';
END
$cleanup_logs$;
