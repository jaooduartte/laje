-- Corrige duas inconsistências entre exibição de prêmios e detecção de sorteio:
--
-- 1. get_championship_award_pending_draws (goleiro):
--    Antes: detectava empate por time (total de gols sofridos pelo time inteiro),
--           depois escolhia o goleiro que mais jogou no time empatado.
--    Depois: detecta empate por goleiro individual (soma de gols sofridos nas
--            próprias partidas), igual ao critério da exibição no display.
--
-- 2. get_championship_score_sheet_awards_rankings (pending_matches):
--    Antes: contava todas as súmulas não revisadas, sem filtro de fase nem de
--           modalidade — podia mostrar "Pendências: X" por partidas de fases ou
--           modalidades irrelevantes para prêmios.
--    Depois: conta apenas partidas na fase configurada (GROUP_STAGE sempre;
--            KNOCKOUT se awards_include_knockout_phase=true) e somente para
--            modalidades com supports_individual_awards=true.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Recria get_championship_award_pending_draws
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_championship_award_pending_draws(
  _championship_id UUID,
  _season_year INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
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
        WHEN v_group.division IS NULL THEN ''
        WHEN v_group.division::text = 'PRINCIPAL' THEN ' • Divisão Principal'
        WHEN v_group.division::text = 'ACESSO'    THEN ' • Divisão de Acesso'
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

      -- ─── Detecção de empate: GOLEIRO MENOS VAZADO ─────────────────────────
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
            'title',                     'Empate no goleiro menos vazado — ' || v_naipe_label || v_division_suffix,
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
  IS 'Retorna contextos de sorteio de premiação pendentes (empates no artilheiro ou goleiro menos vazado) quando todas as súmulas da fase configurada estão revisadas. Empate de goleiro detectado por goleiro individual (soma de gols sofridos nas próprias partidas), consistente com o display de classificação.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Recria get_championship_score_sheet_awards_rankings
--    Corrige CTE pending_matches: passa a contar apenas súmulas que bloqueiam
--    a finalização dos prêmios (fase configurada, modalidade com prêmios).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_championship_score_sheet_awards_rankings(
  _championship_id UUID,
  _season_year INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  WITH resolved_season AS (
    SELECT COALESCE(
      _season_year,
      championships_table.current_season_year
    ) AS season_year
    FROM public.championships AS championships_table
    WHERE championships_table.id = _championship_id
    LIMIT 1
  ),
  scorer_rows AS (
    SELECT
      award_players_table.id AS player_id,
      award_players_table.name AS player_name,
      teams_table.name AS team_name,
      award_players_table.naipe,
      award_players_table.division,
      count(*)::int AS goals
    FROM public.match_award_goal_scorers AS goal_scorers_table
    JOIN public.championship_award_players AS award_players_table
      ON award_players_table.id = goal_scorers_table.player_id
    JOIN public.matches AS matches_table
      ON matches_table.id = goal_scorers_table.match_id
    JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.match_id = matches_table.id
    JOIN public.championship_sports AS cs_table
      ON cs_table.championship_id = _championship_id
      AND cs_table.sport_id = matches_table.sport_id
    JOIN resolved_season
      ON award_players_table.season_year = resolved_season.season_year
    JOIN public.teams AS teams_table
      ON teams_table.id = award_players_table.team_id
    WHERE award_players_table.championship_id = _championship_id
      AND matches_table.status = 'FINISHED'::public.match_status
      AND COALESCE(matches_table.is_walkover, false) = false
      AND (
        bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
        OR (
          cs_table.awards_include_knockout_phase = true
          AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
        )
      )
    GROUP BY
      award_players_table.id,
      award_players_table.name,
      teams_table.name,
      award_players_table.naipe,
      award_players_table.division
  ),
  eligible_goalkeeper_matches AS (
    SELECT
      matches_table.id AS match_id,
      matches_table.home_team_id,
      matches_table.away_team_id,
      matches_table.home_score,
      matches_table.away_score,
      matches_table.naipe,
      matches_table.division
    FROM public.matches AS matches_table
    JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.match_id = matches_table.id
    JOIN public.championship_bracket_competitions AS competitions_table
      ON competitions_table.id = bracket_matches_table.competition_id
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = competitions_table.bracket_edition_id
    JOIN public.championship_sports AS cs_table
      ON cs_table.championship_id = _championship_id
      AND cs_table.sport_id = matches_table.sport_id
    JOIN resolved_season
      ON editions_table.season_year = resolved_season.season_year
    WHERE editions_table.championship_id = _championship_id
      AND matches_table.status = 'FINISHED'::public.match_status
      AND COALESCE(matches_table.is_walkover, false) = false
      AND (
        bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
        OR (
          cs_table.awards_include_knockout_phase = true
          AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
        )
      )
  ),
  goalkeeper_winners AS (
    SELECT
      egm.naipe,
      egm.division,
      goalkeepers_table.team_id,
      goalkeepers_table.player_id,
      award_players_table.name AS player_name,
      teams_table.name AS team_name,
      count(*)::int AS matches_count,
      sum(
        CASE
          WHEN goalkeepers_table.team_id = egm.home_team_id THEN egm.away_score::int
          ELSE egm.home_score::int
        END
      )::int AS goals_against
    FROM public.match_award_goalkeepers AS goalkeepers_table
    JOIN eligible_goalkeeper_matches AS egm
      ON egm.match_id = goalkeepers_table.match_id
    JOIN public.championship_award_players AS award_players_table
      ON award_players_table.id = goalkeepers_table.player_id
      AND award_players_table.championship_id = _championship_id
    JOIN public.teams AS teams_table
      ON teams_table.id = goalkeepers_table.team_id
    JOIN resolved_season
      ON award_players_table.season_year = resolved_season.season_year
    GROUP BY
      egm.naipe,
      egm.division,
      goalkeepers_table.team_id,
      goalkeepers_table.player_id,
      award_players_table.name,
      teams_table.name
  ),
  pending_matches AS (
    SELECT count(*)::int AS total
    FROM public.matches AS matches_table
    JOIN public.championship_bracket_matches AS bm
      ON bm.match_id = matches_table.id
    JOIN public.championship_sports AS cs_table
      ON cs_table.championship_id = _championship_id
      AND cs_table.sport_id = matches_table.sport_id
    JOIN resolved_season
      ON matches_table.season_year = resolved_season.season_year
    WHERE matches_table.championship_id = _championship_id
      AND cs_table.supports_individual_awards = true
      AND matches_table.status = 'FINISHED'::public.match_status
      AND COALESCE(matches_table.is_walkover, false) = false
      AND COALESCE(matches_table.is_score_sheet_reviewed, false) = false
      AND (
        bm.phase = 'GROUP_STAGE'::public.bracket_phase
        OR (
          cs_table.awards_include_knockout_phase = true
          AND bm.phase = 'KNOCKOUT'::public.bracket_phase
        )
      )
  ),
  draw_results AS (
    SELECT
      dr.award_type,
      dr.naipe,
      dr.division,
      dr.winner_player_id
    FROM public.championship_award_draw_results dr
    JOIN resolved_season ON dr.season_year = resolved_season.season_year
    WHERE dr.championship_id = _championship_id
  )
  SELECT jsonb_build_object(
    'season_year', (SELECT resolved_season.season_year FROM resolved_season),
    'pending_matches_count', COALESCE((SELECT pending_matches.total FROM pending_matches), 0),
    'top_scorers',
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'player_id', scorer_rows.player_id,
              'player_name', scorer_rows.player_name,
              'team_name', scorer_rows.team_name,
              'naipe', scorer_rows.naipe,
              'division', scorer_rows.division,
              'goals', scorer_rows.goals
            )
            ORDER BY
              scorer_rows.goals DESC,
              scorer_rows.naipe ASC,
              scorer_rows.division ASC NULLS FIRST,
              scorer_rows.player_name ASC
          )
          FROM scorer_rows
        ),
        '[]'::jsonb
      ),
    'best_goalkeepers',
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'player_id', goalkeeper_winners.player_id,
              'player_name', goalkeeper_winners.player_name,
              'team_name', goalkeeper_winners.team_name,
              'naipe', goalkeeper_winners.naipe,
              'division', goalkeeper_winners.division,
              'matches_count', goalkeeper_winners.matches_count,
              'goals_against', goalkeeper_winners.goals_against
            )
            ORDER BY
              goalkeeper_winners.goals_against ASC,
              goalkeeper_winners.matches_count DESC,
              goalkeeper_winners.naipe ASC,
              goalkeeper_winners.division ASC NULLS FIRST,
              goalkeeper_winners.player_name ASC
          )
          FROM goalkeeper_winners
        ),
        '[]'::jsonb
      ),
    'award_draw_results',
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'award_type',       draw_results.award_type,
              'naipe',            draw_results.naipe,
              'division',         draw_results.division,
              'winner_player_id', draw_results.winner_player_id
            )
          )
          FROM draw_results
        ),
        '[]'::jsonb
      )
  );
$func$;

GRANT EXECUTE ON FUNCTION public.get_championship_score_sheet_awards_rankings(UUID, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
