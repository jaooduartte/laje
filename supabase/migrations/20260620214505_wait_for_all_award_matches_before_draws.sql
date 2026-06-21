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
  v_tied_participants  JSONB;
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

  FOR v_sport IN
    SELECT cs.sport_id, cs.awards_include_knockout_phase, s.name AS sport_name
    FROM public.championship_sports cs
    JOIN public.sports s ON s.id = cs.sport_id
    WHERE cs.championship_id = _championship_id
      AND cs.supports_individual_awards = true
    ORDER BY s.name
  LOOP
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
      SELECT COUNT(*)::int INTO v_pending_count
      FROM public.matches m
      JOIN public.championship_bracket_matches bm ON bm.match_id = m.id
      WHERE m.championship_id = _championship_id
        AND m.sport_id = v_sport.sport_id
        AND m.season_year = resolved_season_year
        AND m.naipe = v_group.naipe
        AND m.division IS NOT DISTINCT FROM v_group.division
        AND COALESCE(m.is_walkover, false) = false
        AND (
          m.status <> 'FINISHED'::public.match_status
          OR COALESCE(m.is_score_sheet_reviewed, false) = false
        )
        AND (
          bm.phase = 'GROUP_STAGE'::public.bracket_phase
          OR (v_sport.awards_include_knockout_phase = true AND bm.phase = 'KNOCKOUT'::public.bracket_phase)
        );

      CONTINUE WHEN v_pending_count > 0;

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

      v_tied_participants := NULL;
      v_signature := NULL;

      WITH scorer_team_advancement_rows AS (
        SELECT
          knockout_team_rows.team_id,
          knockout_team_rows.naipe,
          knockout_team_rows.division,
          MAX(knockout_team_rows.round_number)::int AS team_advancement_rank
        FROM (
          SELECT
            matches_table.home_team_id AS team_id,
            matches_table.naipe,
            matches_table.division,
            bracket_matches_table.round_number
          FROM public.championship_bracket_matches AS bracket_matches_table
          JOIN public.matches AS matches_table
            ON matches_table.id = bracket_matches_table.match_id
          JOIN public.championship_bracket_competitions AS competitions_table
            ON competitions_table.id = bracket_matches_table.competition_id
          JOIN public.championship_bracket_editions AS editions_table
            ON editions_table.id = competitions_table.bracket_edition_id
          WHERE editions_table.championship_id = _championship_id
            AND editions_table.season_year = resolved_season_year
            AND matches_table.sport_id = v_sport.sport_id
            AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
            AND matches_table.home_team_id IS NOT NULL

          UNION ALL

          SELECT
            matches_table.away_team_id AS team_id,
            matches_table.naipe,
            matches_table.division,
            bracket_matches_table.round_number
          FROM public.championship_bracket_matches AS bracket_matches_table
          JOIN public.matches AS matches_table
            ON matches_table.id = bracket_matches_table.match_id
          JOIN public.championship_bracket_competitions AS competitions_table
            ON competitions_table.id = bracket_matches_table.competition_id
          JOIN public.championship_bracket_editions AS editions_table
            ON editions_table.id = competitions_table.bracket_edition_id
          WHERE editions_table.championship_id = _championship_id
            AND editions_table.season_year = resolved_season_year
            AND matches_table.sport_id = v_sport.sport_id
            AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
            AND matches_table.away_team_id IS NOT NULL
        ) AS knockout_team_rows
        GROUP BY knockout_team_rows.team_id, knockout_team_rows.naipe, knockout_team_rows.division
      ),
      scorer_rows AS (
        SELECT
          cap.id AS player_id,
          cap.name AS player_name,
          cap.team_id AS team_id,
          t.name AS team_name,
          COUNT(*)::int AS goals,
          COALESCE(MAX(scorer_team_advancement_rows.team_advancement_rank), 0)::int AS team_advancement_rank
        FROM public.match_award_goal_scorers mags
        JOIN public.championship_award_players cap ON cap.id = mags.player_id
        JOIN public.matches m ON m.id = mags.match_id
        JOIN public.championship_bracket_matches bm ON bm.match_id = m.id
        JOIN public.teams t ON t.id = cap.team_id
        LEFT JOIN scorer_team_advancement_rows
          ON scorer_team_advancement_rows.team_id = cap.team_id
          AND scorer_team_advancement_rows.naipe = cap.naipe
          AND scorer_team_advancement_rows.division IS NOT DISTINCT FROM cap.division
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
        GROUP BY cap.id, cap.name, cap.team_id, t.name
      )
      SELECT
        jsonb_agg(
          jsonb_build_object(
            'participant_id', sub.player_id,
            'participant_name', sub.player_name,
            'team_name', sub.team_name,
            'metric_value', sub.goals
          ) ORDER BY sub.player_name ASC
        ),
        string_agg(sub.player_id::text, ':' ORDER BY sub.player_id)
      INTO v_tied_participants, v_signature
      FROM (
        SELECT
          scorer_rows.*,
          RANK() OVER (
            ORDER BY
              scorer_rows.goals DESC,
              scorer_rows.team_advancement_rank DESC
          ) AS rnk
        FROM scorer_rows
      ) sub
      WHERE sub.rnk = 1;

      IF v_tied_participants IS NOT NULL AND jsonb_array_length(v_tied_participants) >= 2 THEN
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
            'tied_participants',         v_tied_participants,
            'tied_player_ids_signature', v_signature,
            'title',                     'Empate no artilheiro — ' || v_naipe_label || v_division_suffix,
            'description',               jsonb_array_length(v_tied_participants)::text || ' jogadores empatados no 1º lugar após aplicar o critério de avanço de fase. Realize o sorteio para definir o vencedor do prêmio de artilheiro.'
          ));
        END IF;
      END IF;

      v_tied_participants := NULL;
      v_signature := NULL;

      SELECT
        jsonb_agg(
          jsonb_build_object(
            'participant_id', sub.team_id,
            'participant_name', sub.team_name,
            'team_name', sub.team_name,
            'metric_value', sub.goals_against_average
          ) ORDER BY sub.team_name ASC
        ),
        string_agg(sub.team_id::text, ':' ORDER BY sub.team_id)
      INTO v_tied_participants, v_signature
      FROM (
        SELECT
          defense_rows.team_id,
          teams_table.name AS team_name,
          defense_rows.matches_count,
          defense_rows.goals_against,
          defense_rows.goals_against_average,
          RANK() OVER (
            ORDER BY
              defense_rows.goals_against_average ASC,
              defense_rows.goals_against ASC,
              defense_rows.matches_count DESC
          ) AS rnk
        FROM (
          SELECT
            team_matches.team_id,
            COUNT(*)::int AS matches_count,
            SUM(team_matches.goals_against)::int AS goals_against,
            (SUM(team_matches.goals_against)::numeric / COUNT(*)::numeric) AS goals_against_average
          FROM (
            SELECT
              m.home_team_id AS team_id,
              m.away_score::int AS goals_against
            FROM public.matches m
            JOIN public.championship_bracket_matches bm ON bm.match_id = m.id
            WHERE m.championship_id = _championship_id
              AND m.sport_id = v_sport.sport_id
              AND m.season_year = resolved_season_year
              AND m.naipe = v_group.naipe
              AND m.division IS NOT DISTINCT FROM v_group.division
              AND m.status = 'FINISHED'::public.match_status
              AND COALESCE(m.is_walkover, false) = false
              AND (
                bm.phase = 'GROUP_STAGE'::public.bracket_phase
                OR (v_sport.awards_include_knockout_phase = true AND bm.phase = 'KNOCKOUT'::public.bracket_phase)
              )

            UNION ALL

            SELECT
              m.away_team_id AS team_id,
              m.home_score::int AS goals_against
            FROM public.matches m
            JOIN public.championship_bracket_matches bm ON bm.match_id = m.id
            WHERE m.championship_id = _championship_id
              AND m.sport_id = v_sport.sport_id
              AND m.season_year = resolved_season_year
              AND m.naipe = v_group.naipe
              AND m.division IS NOT DISTINCT FROM v_group.division
              AND m.status = 'FINISHED'::public.match_status
              AND COALESCE(m.is_walkover, false) = false
              AND (
                bm.phase = 'GROUP_STAGE'::public.bracket_phase
                OR (v_sport.awards_include_knockout_phase = true AND bm.phase = 'KNOCKOUT'::public.bracket_phase)
              )
          ) AS team_matches
          GROUP BY team_matches.team_id
        ) AS defense_rows
        JOIN public.teams AS teams_table ON teams_table.id = defense_rows.team_id
      ) sub
      WHERE sub.rnk = 1;

      IF v_tied_participants IS NOT NULL AND jsonb_array_length(v_tied_participants) >= 2 THEN
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
            'context_key',               'AWARD_DEFENSE:' || _championship_id::text || ':' || resolved_season_year::text || ':' || v_sport.sport_id::text || ':' || v_group.naipe::text || ':' || COALESCE(v_group.division::text, 'NULL'),
            'sport_id',                  v_sport.sport_id,
            'sport_name',                v_sport.sport_name,
            'naipe',                     v_group.naipe,
            'division',                  v_group.division,
            'award_type',                'BEST_GOALKEEPER',
            'tied_participants',         v_tied_participants,
            'tied_player_ids_signature', v_signature,
            'title',                     'Empate na melhor defesa — ' || v_naipe_label || v_division_suffix,
            'description',               jsonb_array_length(v_tied_participants)::text || ' atléticas empatadas no 1º lugar. Realize o sorteio para definir a atlética vencedora do prêmio.'
          ));
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_result;
END;
$$;

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
  scorer_team_advancement_rows AS (
    SELECT
      knockout_team_rows.team_id,
      knockout_team_rows.sport_id,
      knockout_team_rows.naipe,
      knockout_team_rows.division,
      MAX(knockout_team_rows.round_number)::int AS team_advancement_rank
    FROM (
      SELECT
        matches_table.home_team_id AS team_id,
        matches_table.sport_id,
        matches_table.naipe,
        matches_table.division,
        bracket_matches_table.round_number
      FROM public.championship_bracket_matches AS bracket_matches_table
      JOIN public.matches AS matches_table
        ON matches_table.id = bracket_matches_table.match_id
      JOIN public.championship_bracket_competitions AS competitions_table
        ON competitions_table.id = bracket_matches_table.competition_id
      JOIN public.championship_bracket_editions AS editions_table
        ON editions_table.id = competitions_table.bracket_edition_id
      JOIN resolved_season
        ON editions_table.season_year = resolved_season.season_year
      WHERE editions_table.championship_id = _championship_id
        AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
        AND matches_table.home_team_id IS NOT NULL

      UNION ALL

      SELECT
        matches_table.away_team_id AS team_id,
        matches_table.sport_id,
        matches_table.naipe,
        matches_table.division,
        bracket_matches_table.round_number
      FROM public.championship_bracket_matches AS bracket_matches_table
      JOIN public.matches AS matches_table
        ON matches_table.id = bracket_matches_table.match_id
      JOIN public.championship_bracket_competitions AS competitions_table
        ON competitions_table.id = bracket_matches_table.competition_id
      JOIN public.championship_bracket_editions AS editions_table
        ON editions_table.id = competitions_table.bracket_edition_id
      JOIN resolved_season
        ON editions_table.season_year = resolved_season.season_year
      WHERE editions_table.championship_id = _championship_id
        AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
        AND matches_table.away_team_id IS NOT NULL
    ) AS knockout_team_rows
    GROUP BY
      knockout_team_rows.team_id,
      knockout_team_rows.sport_id,
      knockout_team_rows.naipe,
      knockout_team_rows.division
  ),
  scorer_rows AS (
    SELECT
      award_players_table.id AS player_id,
      award_players_table.name AS player_name,
      award_players_table.team_id AS team_id,
      teams_table.name AS team_name,
      award_players_table.naipe,
      award_players_table.division,
      count(*)::int AS goals,
      COALESCE(MAX(scorer_team_advancement_rows.team_advancement_rank), 0)::int AS team_advancement_rank
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
    LEFT JOIN scorer_team_advancement_rows
      ON scorer_team_advancement_rows.team_id = award_players_table.team_id
      AND scorer_team_advancement_rows.sport_id = matches_table.sport_id
      AND scorer_team_advancement_rows.naipe = award_players_table.naipe
      AND scorer_team_advancement_rows.division IS NOT DISTINCT FROM award_players_table.division
    WHERE award_players_table.championship_id = _championship_id
      AND cs_table.supports_individual_awards = true
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
      award_players_table.team_id,
      teams_table.name,
      award_players_table.naipe,
      award_players_table.division
  ),
  eligible_matches AS (
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
      AND cs_table.supports_individual_awards = true
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
  defense_rows AS (
    SELECT
      team_matches.team_id,
      teams_table.name AS team_name,
      team_matches.naipe,
      team_matches.division,
      COUNT(*)::int AS matches_count,
      SUM(team_matches.goals_against)::int AS goals_against,
      (SUM(team_matches.goals_against)::numeric / COUNT(*)::numeric) AS goals_against_average
    FROM (
      SELECT
        eligible_matches.home_team_id AS team_id,
        eligible_matches.naipe,
        eligible_matches.division,
        eligible_matches.away_score::int AS goals_against
      FROM eligible_matches

      UNION ALL

      SELECT
        eligible_matches.away_team_id AS team_id,
        eligible_matches.naipe,
        eligible_matches.division,
        eligible_matches.home_score::int AS goals_against
      FROM eligible_matches
    ) AS team_matches
    JOIN public.teams AS teams_table
      ON teams_table.id = team_matches.team_id
    GROUP BY
      team_matches.team_id,
      teams_table.name,
      team_matches.naipe,
      team_matches.division
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
      AND COALESCE(matches_table.is_walkover, false) = false
      AND (
        matches_table.status <> 'FINISHED'::public.match_status
        OR COALESCE(matches_table.is_score_sheet_reviewed, false) = false
      )
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
      dr.winner_player_id,
      dr.winner_team_id
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
              'team_id', scorer_rows.team_id,
              'team_name', scorer_rows.team_name,
              'naipe', scorer_rows.naipe,
              'division', scorer_rows.division,
              'goals', scorer_rows.goals,
              'team_advancement_rank', scorer_rows.team_advancement_rank
            )
            ORDER BY
              scorer_rows.goals DESC,
              scorer_rows.team_advancement_rank DESC,
              scorer_rows.naipe ASC,
              scorer_rows.division ASC NULLS FIRST,
              scorer_rows.player_name ASC
          )
          FROM scorer_rows
        ),
        '[]'::jsonb
      ),
    'best_defenses',
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'team_id', defense_rows.team_id,
              'team_name', defense_rows.team_name,
              'naipe', defense_rows.naipe,
              'division', defense_rows.division,
              'matches_count', defense_rows.matches_count,
              'goals_against', defense_rows.goals_against,
              'goals_against_average', defense_rows.goals_against_average
            )
            ORDER BY
              defense_rows.goals_against_average ASC,
              defense_rows.goals_against ASC,
              defense_rows.matches_count DESC,
              defense_rows.naipe ASC,
              defense_rows.division ASC NULLS FIRST,
              defense_rows.team_name ASC
          )
          FROM defense_rows
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
              'winner_player_id', draw_results.winner_player_id,
              'winner_team_id',   draw_results.winner_team_id
            )
          )
          FROM draw_results
        ),
        '[]'::jsonb
      )
  );
$func$;
