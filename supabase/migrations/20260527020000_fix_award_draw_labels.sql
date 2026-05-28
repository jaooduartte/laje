-- Corrige os labels da função get_championship_award_pending_draws:
--
-- 1. Sufixo de divisão: os WHEN checavam 'PRINCIPAL'/'ACESSO' mas o enum real é
--    'DIVISAO_PRINCIPAL'/'DIVISAO_ACESSO', fazendo os títulos exibirem o valor bruto.
--
-- 2. Título do goleiro: "goleiro menos vazado" → "melhor goleiro" (padrão do app).
--
-- 3. Garante SECURITY DEFINER + search_path (mesmo padrão das demais funções RPC
--    de premiação). A migration 20260527010000 já aplicou via ALTER FUNCTION,
--    mas recriar aqui garante consistência no arquivo de referência.

CREATE OR REPLACE FUNCTION public.get_championship_award_pending_draws(
  _championship_id UUID,
  _season_year INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_season_year INTEGER;
  v_result             JSONB := '[]'::JSONB;
  v_sport              RECORD;
  v_group              RECORD;
  v_pending_count      INTEGER;
  v_tied_players       JSONB;
  v_signature          TEXT;
  v_existing_draw_id   UUID;
  v_naipe_label        TEXT;
  v_division_suffix    TEXT;
BEGIN
  SELECT COALESCE(_season_year, c.current_season_year)
  INTO resolved_season_year
  FROM public.championships c
  WHERE c.id = _championship_id
  LIMIT 1;

  IF resolved_season_year IS NULL THEN
    RETURN '[]'::JSONB;
  END IF;

  -- Iterar sobre cada modalidade que suporta premiações individuais
  FOR v_sport IN
    SELECT cs.sport_id, cs.awards_include_knockout_phase, s.name AS sport_name
    FROM public.championship_sports cs
    JOIN public.sports s ON s.id = cs.sport_id
    WHERE cs.championship_id = _championship_id
      AND cs.supports_individual_awards = true
    ORDER BY s.name
  LOOP

    -- Iterar sobre cada (naipe, divisão) com jogos finalizados e revisáveis
    FOR v_group IN
      SELECT DISTINCT m.naipe, m.division
      FROM public.matches m
      JOIN public.championship_bracket_matches bm ON bm.match_id = m.id
      WHERE m.championship_id = _championship_id
        AND m.sport_id = v_sport.sport_id
        AND m.season_year = resolved_season_year
        AND m.status = 'FINISHED'::public.match_status
        AND COALESCE(m.is_walkover, false) = false
        AND (
          bm.phase = 'GROUP_STAGE'::public.bracket_phase
          OR (v_sport.awards_include_knockout_phase = true AND bm.phase = 'KNOCKOUT'::public.bracket_phase)
        )
      ORDER BY m.naipe, m.division
    LOOP

      -- Contar súmulas ainda não revisadas da fase relevante
      SELECT COUNT(*)::int INTO v_pending_count
      FROM public.matches m
      JOIN public.championship_bracket_matches bm ON bm.match_id = m.id
      WHERE m.championship_id = _championship_id
        AND m.sport_id = v_sport.sport_id
        AND m.season_year = resolved_season_year
        AND m.naipe = v_group.naipe
        AND m.division IS NOT DISTINCT FROM v_group.division
        AND m.status = 'FINISHED'::public.match_status
        AND COALESCE(m.is_walkover, false) = false
        AND COALESCE(m.is_score_sheet_reviewed, false) = false
        AND (
          bm.phase = 'GROUP_STAGE'::public.bracket_phase
          OR (v_sport.awards_include_knockout_phase = true AND bm.phase = 'KNOCKOUT'::public.bracket_phase)
        );

      -- Pular se ainda há súmulas pendentes
      CONTINUE WHEN v_pending_count > 0;

      -- Labels para o título
      v_naipe_label := CASE v_group.naipe
        WHEN 'MASCULINO' THEN 'Masculino'
        WHEN 'FEMININO'  THEN 'Feminino'
        ELSE v_group.naipe::text
      END;
      v_division_suffix := CASE
        WHEN v_group.division IS NULL               THEN ''
        WHEN v_group.division::text = 'DIVISAO_PRINCIPAL' THEN ' • Divisão Principal'
        WHEN v_group.division::text = 'DIVISAO_ACESSO'    THEN ' • Divisão de Acesso'
        ELSE ' • ' || v_group.division::text
      END;

      -- ─── Detecção de empate: ARTILHEIRO ────────────────────────────────────
      v_tied_players := NULL;
      v_signature    := NULL;

      SELECT
        jsonb_agg(
          jsonb_build_object(
            'player_id',    sub.player_id,
            'player_name',  sub.player_name,
            'team_name',    sub.team_name,
            'metric_value', sub.goals
          ) ORDER BY sub.player_name ASC
        ),
        string_agg(sub.player_id::text, ':' ORDER BY sub.player_id)
      INTO v_tied_players, v_signature
      FROM (
        SELECT
          cap.id       AS player_id,
          cap.name     AS player_name,
          t.name       AS team_name,
          COUNT(*)::int AS goals,
          RANK() OVER (ORDER BY COUNT(*) DESC) AS rnk
        FROM public.match_award_goal_scorers mags
        JOIN public.championship_award_players cap ON cap.id = mags.player_id
        JOIN public.matches m ON m.id = mags.match_id
        JOIN public.championship_bracket_matches bm ON bm.match_id = m.id
        JOIN public.teams t ON t.id = cap.team_id
        WHERE cap.championship_id = _championship_id
          AND cap.sport_id = v_sport.sport_id
          AND cap.naipe = v_group.naipe
          AND cap.division IS NOT DISTINCT FROM v_group.division
          AND cap.season_year = resolved_season_year
          AND m.status = 'FINISHED'::public.match_status
          AND COALESCE(m.is_walkover, false) = false
          AND (
            bm.phase = 'GROUP_STAGE'::public.bracket_phase
            OR (v_sport.awards_include_knockout_phase = true AND bm.phase = 'KNOCKOUT'::public.bracket_phase)
          )
        GROUP BY cap.id, cap.name, t.name
      ) sub
      WHERE sub.rnk = 1;

      IF v_tied_players IS NOT NULL AND jsonb_array_length(v_tied_players) >= 2 THEN
        SELECT id INTO v_existing_draw_id
        FROM public.championship_award_draw_results
        WHERE championship_id = _championship_id
          AND season_year = resolved_season_year
          AND sport_id = v_sport.sport_id
          AND naipe = v_group.naipe
          AND division IS NOT DISTINCT FROM v_group.division
          AND award_type = 'TOP_SCORER'::public.championship_award_type
          AND tied_player_ids_signature = v_signature
        LIMIT 1;

        IF v_existing_draw_id IS NULL THEN
          v_result := v_result || jsonb_build_array(jsonb_build_object(
            'context_key',               'AWARD_SCORER:' || _championship_id::text || ':' || resolved_season_year::text || ':' || v_sport.sport_id::text || ':' || v_group.naipe::text || ':' || COALESCE(v_group.division::text, 'NULL'),
            'sport_id',                  v_sport.sport_id,
            'sport_name',                v_sport.sport_name,
            'naipe',                     v_group.naipe,
            'division',                  v_group.division,
            'award_type',                'TOP_SCORER',
            'tied_players',              v_tied_players,
            'tied_player_ids_signature', v_signature,
            'title',                     'Empate no artilheiro — ' || v_naipe_label || v_division_suffix,
            'description',               jsonb_array_length(v_tied_players)::text || ' jogadores empatados no 1º lugar. Realize o sorteio para definir o vencedor do prêmio de artilheiro.'
          ));
        END IF;
      END IF;

      -- ─── Detecção de empate: MELHOR GOLEIRO ───────────────────────────────
      -- Empate ocorre quando ≥2 goleiros têm o mesmo mínimo de gols sofridos
      -- nas próprias partidas (mesmo critério exibido no display de classificação).
      v_tied_players := NULL;
      v_signature    := NULL;

      SELECT
        jsonb_agg(
          jsonb_build_object(
            'player_id',    sub.player_id,
            'player_name',  sub.player_name,
            'team_name',    sub.team_name,
            'metric_value', sub.goals_against
          ) ORDER BY sub.player_name ASC
        ),
        string_agg(sub.player_id::text, ':' ORDER BY sub.player_id)
      INTO v_tied_players, v_signature
      FROM (
        SELECT
          gk.player_id,
          cap.name AS player_name,
          t.name   AS team_name,
          SUM(
            CASE WHEN gk.team_id = m.home_team_id
              THEN m.away_score::int
              ELSE m.home_score::int
            END
          )::int AS goals_against,
          RANK() OVER (
            ORDER BY SUM(
              CASE WHEN gk.team_id = m.home_team_id
                THEN m.away_score::int
                ELSE m.home_score::int
              END
            ) ASC
          ) AS rnk
        FROM public.match_award_goalkeepers gk
        JOIN public.matches m ON m.id = gk.match_id
        JOIN public.championship_bracket_matches bm ON bm.match_id = m.id
        JOIN public.championship_award_players cap
          ON cap.id = gk.player_id
          AND cap.championship_id = _championship_id
          AND cap.season_year     = resolved_season_year
          AND cap.sport_id        = v_sport.sport_id
        JOIN public.teams t ON t.id = gk.team_id
        WHERE m.championship_id = _championship_id
          AND m.sport_id         = v_sport.sport_id
          AND m.naipe            = v_group.naipe
          AND m.division IS NOT DISTINCT FROM v_group.division
          AND m.season_year      = resolved_season_year
          AND m.status           = 'FINISHED'::public.match_status
          AND COALESCE(m.is_walkover, false) = false
          AND (
            bm.phase = 'GROUP_STAGE'::public.bracket_phase
            OR (v_sport.awards_include_knockout_phase = true
                AND bm.phase = 'KNOCKOUT'::public.bracket_phase)
          )
        GROUP BY gk.player_id, cap.name, t.name
      ) sub
      WHERE sub.rnk = 1;

      IF v_tied_players IS NOT NULL AND jsonb_array_length(v_tied_players) >= 2 THEN
        SELECT id INTO v_existing_draw_id
        FROM public.championship_award_draw_results
        WHERE championship_id = _championship_id
          AND season_year = resolved_season_year
          AND sport_id = v_sport.sport_id
          AND naipe = v_group.naipe
          AND division IS NOT DISTINCT FROM v_group.division
          AND award_type = 'BEST_GOALKEEPER'::public.championship_award_type
          AND tied_player_ids_signature = v_signature
        LIMIT 1;

        IF v_existing_draw_id IS NULL THEN
          v_result := v_result || jsonb_build_array(jsonb_build_object(
            'context_key',               'AWARD_GK:' || _championship_id::text || ':' || resolved_season_year::text || ':' || v_sport.sport_id::text || ':' || v_group.naipe::text || ':' || COALESCE(v_group.division::text, 'NULL'),
            'sport_id',                  v_sport.sport_id,
            'sport_name',                v_sport.sport_name,
            'naipe',                     v_group.naipe,
            'division',                  v_group.division,
            'award_type',                'BEST_GOALKEEPER',
            'tied_players',              v_tied_players,
            'tied_player_ids_signature', v_signature,
            'title',                     'Empate no melhor goleiro — ' || v_naipe_label || v_division_suffix,
            'description',               jsonb_array_length(v_tied_players)::text || ' goleiros empatados no 1º lugar. Realize o sorteio para definir o vencedor do prêmio.'
          ));
        END IF;
      END IF;

    END LOOP;
  END LOOP;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_championship_award_pending_draws(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_championship_award_pending_draws(UUID, INTEGER)
  IS 'Retorna contextos de sorteio de premiação pendentes (empates no artilheiro ou melhor goleiro) quando todas as súmulas da fase configurada estão revisadas. Empate de goleiro detectado por goleiro individual (soma de gols sofridos nas próprias partidas), consistente com o display de classificação.';

NOTIFY pgrst, 'reload schema';
