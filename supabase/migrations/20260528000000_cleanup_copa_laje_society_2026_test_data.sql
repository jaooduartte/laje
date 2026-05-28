-- Limpeza de dados de teste do Copa Laje Society 2026 (período 20/05/2026 → hoje).
--
-- Escopo:
--   - Campeonato-alvo: championships.code = 'SOCIETY'
--   - Temporada-alvo:  season_year = 2026
--   - Janela de logs:  created_at >= 2026-05-20 -03:00 e < (hoje + 1 dia)
--   - Autor dos logs:  actor_email = 'joaopduartecontato@gmail.com'
--
-- O que NÃO é tocado:
--   - Linha SOCIETY em public.championships
--   - public.championship_sports (configuração de modalidades, sem season_year)
--   - Copa Laje de Verão (code = 'CLV') e qualquer outro campeonato
--   - league_events / league_event_reservation_requests / league_event_organizer_teams
--   - teams, sports, auth.users, admin_user_profiles, public_page_access_settings
--   - Triggers, funções, RLS, schema — esta migration é apenas DELETE de dados.

DO $cleanup$
DECLARE
  society_id    UUID;
  cutoff_start  TIMESTAMPTZ := '2026-05-20T00:00:00-03:00';
  cutoff_end    TIMESTAMPTZ := now() + interval '1 day';
BEGIN
  SELECT id
  INTO society_id
  FROM public.championships
  WHERE code = 'SOCIETY'
  LIMIT 1;

  IF society_id IS NULL THEN
    RAISE NOTICE 'Copa Laje Society (code=SOCIETY) não encontrado. Migration sem efeito.';
    RETURN;
  END IF;

  -- Snapshots de IDs do escopo, capturados ANTES dos DELETEs.
  -- Necessários para filtrar logs com precisão depois (record_id é apagado em cascata).
  CREATE TEMP TABLE _affected_match_ids ON COMMIT DROP AS
    SELECT id
    FROM public.matches
    WHERE championship_id = society_id
      AND season_year = 2026;

  CREATE TEMP TABLE _affected_award_player_ids ON COMMIT DROP AS
    SELECT id
    FROM public.championship_award_players
    WHERE championship_id = society_id
      AND season_year = 2026;

  CREATE TEMP TABLE _affected_bracket_edition_ids ON COMMIT DROP AS
    SELECT id
    FROM public.championship_bracket_editions
    WHERE championship_id = society_id
      AND season_year = 2026;

  CREATE TEMP TABLE _affected_draw_result_ids ON COMMIT DROP AS
    SELECT id
    FROM public.championship_award_draw_results
    WHERE championship_id = society_id
      AND season_year = 2026;

  BEGIN
    -- Suspende o trigger de auditoria de matches para evitar logs novos
    -- enquanto a limpeza apaga as próprias matches do escopo.
    -- (Demais triggers existentes — championships, sports, teams, league_events,
    -- league_event_organizer_teams — não disparam ao apagar matches/brackets/awards.)
    ALTER TABLE public.matches DISABLE TRIGGER audit_log_matches_trigger;

    -- 1) standings (FK championship_id RESTRICT)
    DELETE FROM public.standings
    WHERE championship_id = society_id
      AND season_year = 2026;

    -- 2) Edição do bracket — DELETADA ANTES de matches.
    --    Motivo: championship_bracket_matches tem FK match_id REFERENCES matches(id)
    --    ON DELETE SET NULL. Mas existe uma check constraint
    --    `chk_group_stage_requires_match_id` que exige match_id NOT NULL quando
    --    phase = 'GROUP_STAGE'. Apagar matches antes faria o SET NULL violar a check.
    --    Apagando a edição primeiro, cascateia toda a árvore (competitions, groups,
    --    group_teams, matches do bracket, days, locations, courts, court_sports,
    --    team_registrations, team_modalities, tie_break_resolutions,
    --    tie_break_resolution_teams) — incluindo championship_bracket_matches, que
    --    deixa de referenciar matches.
    DELETE FROM public.championship_bracket_editions
    WHERE championship_id = society_id
      AND season_year = 2026;

    -- 3) matches (FK championship_id RESTRICT) — agora seguro, pois bracket_matches
    --    do escopo já foram apagados em cascata pelo passo 2.
    --    Cascateia: match_sets, match_award_goal_scorers, match_award_goalkeepers.
    DELETE FROM public.matches
    WHERE championship_id = society_id
      AND season_year = 2026;

    -- 4) Sorteios de premiação realizados (artilheiro/melhor goleiro)
    DELETE FROM public.championship_award_draw_results
    WHERE championship_id = society_id
      AND season_year = 2026;

    -- 5) Jogadores cadastrados nas súmulas (cascateia award scorers/gks órfãos restantes)
    DELETE FROM public.championship_award_players
    WHERE championship_id = society_id
      AND season_year = 2026;

    -- Reabilita o trigger antes de limpar logs (passo seguinte usa SELECT/DELETE em logs,
    -- sem afetar matches).
    ALTER TABLE public.matches ENABLE TRIGGER audit_log_matches_trigger;
  EXCEPTION
    WHEN OTHERS THEN
      -- Garante que o trigger fique habilitado mesmo se algum DELETE acima falhar.
      BEGIN
        ALTER TABLE public.matches ENABLE TRIGGER audit_log_matches_trigger;
      EXCEPTION WHEN OTHERS THEN
        -- silencioso: a transação será revertida pelo RAISE abaixo
        NULL;
      END;
      RAISE;
  END;

  -- 6) Limpar logs do João Duarte do período, relacionados exclusivamente ao escopo do SOCIETY.
  --    Filtro defensivo: resource_table identifica a tabela, e ou record_id ou
  --    new_data/old_data/metadata->>'championship_id' confirmam o vínculo com SOCIETY.
  DELETE FROM public.admin_action_logs
  WHERE actor_email = 'joaopduartecontato@gmail.com'
    AND created_at >= cutoff_start
    AND created_at <  cutoff_end
    AND (
      -- Logs no próprio campeonato (ex: alteração de current_season_year)
      (resource_table = 'championships' AND record_id = society_id::text)

      -- Logs de matches do escopo (apagadas no passo 2)
      OR (
        resource_table = 'matches'
        AND record_id IS NOT NULL
        AND record_id::uuid IN (SELECT id FROM _affected_match_ids)
      )

      -- Logs de tabelas de premiação/bracket sem trigger automático,
      -- mas que podem ter logs gerados por RPCs administrativas (review de súmula,
      -- sorteio de empate, geração de bracket, etc.). Vínculo confirmado via JSONB.
      OR (
        resource_table IN (
          'championship_award_players',
          'championship_award_draw_results',
          'championship_bracket_editions',
          'championship_bracket_matches',
          'championship_bracket_workflow'
        )
        AND (
          (new_data ->> 'championship_id') = society_id::text
          OR (old_data ->> 'championship_id') = society_id::text
          OR (metadata ->> 'championship_id') = society_id::text
        )
      )
    );

  RAISE NOTICE 'Limpeza Copa Laje Society 2026 concluída (championship_id = %)', society_id;
END
$cleanup$;

NOTIFY pgrst, 'reload schema';
