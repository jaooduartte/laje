-- Adiciona awards_include_knockout_phase em championship_sports.
-- false (padrão) = artilheiro e goleiro contabilizados apenas na fase de grupos.
-- true           = também contabiliza a fase eliminatória.

ALTER TABLE public.championship_sports
  ADD COLUMN IF NOT EXISTS awards_include_knockout_phase BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.championship_sports.awards_include_knockout_phase
  IS 'Se true, contabiliza artilheiro e goleiro também na fase eliminatória. Padrão: somente fase de grupos.';

-- Recria get_championship_score_sheet_awards_rankings com suporte ao filtro de fase.
-- Mudanças:
--   1. scorer_rows filtra por phase (GROUP_STAGE sempre; KNOCKOUT se awards_include_knockout_phase = true)
--   2. eligible_goalkeeper_matches usa mesma lógica de fase
--   3. Remove restrição de "últimas rodadas" do goleiro; agora conta todos os jogos elegíveis
--   4. goalkeeper_rows filtra via eligible_goalkeeper_matches (consistência de fase)

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
  eligible_team_defense_rows AS (
    SELECT
      eligible_goalkeeper_matches.naipe,
      eligible_goalkeeper_matches.division,
      eligible_goalkeeper_matches.home_team_id AS team_id,
      eligible_goalkeeper_matches.away_score::int AS goals_against
    FROM eligible_goalkeeper_matches

    UNION ALL

    SELECT
      eligible_goalkeeper_matches.naipe,
      eligible_goalkeeper_matches.division,
      eligible_goalkeeper_matches.away_team_id AS team_id,
      eligible_goalkeeper_matches.home_score::int AS goals_against
    FROM eligible_goalkeeper_matches
  ),
  eligible_defenses AS (
    SELECT
      eligible_team_defense_rows.naipe,
      eligible_team_defense_rows.division,
      eligible_team_defense_rows.team_id,
      sum(eligible_team_defense_rows.goals_against)::int AS goals_against,
      count(*)::int AS matches_count
    FROM eligible_team_defense_rows
    GROUP BY
      eligible_team_defense_rows.naipe,
      eligible_team_defense_rows.division,
      eligible_team_defense_rows.team_id
  ),
  defense_winners AS (
    SELECT DISTINCT ON (eligible_defenses.naipe, eligible_defenses.division)
      eligible_defenses.naipe,
      eligible_defenses.division,
      eligible_defenses.team_id,
      eligible_defenses.goals_against,
      eligible_defenses.matches_count
    FROM eligible_defenses
    JOIN public.teams AS teams_table
      ON teams_table.id = eligible_defenses.team_id
    ORDER BY
      eligible_defenses.naipe,
      eligible_defenses.division NULLS FIRST,
      eligible_defenses.goals_against ASC,
      eligible_defenses.matches_count DESC,
      teams_table.name ASC
  ),
  goalkeeper_rows AS (
    SELECT
      defense_winners.naipe,
      defense_winners.division,
      defense_winners.team_id,
      defense_winners.goals_against,
      goalkeepers_table.player_id,
      award_players_table.name AS player_name,
      teams_table.name AS team_name,
      count(*)::int AS matches_count
    FROM defense_winners
    JOIN public.match_award_goalkeepers AS goalkeepers_table
      ON goalkeepers_table.team_id = defense_winners.team_id
    JOIN eligible_goalkeeper_matches
      ON eligible_goalkeeper_matches.match_id = goalkeepers_table.match_id
    JOIN public.championship_award_players AS award_players_table
      ON award_players_table.id = goalkeepers_table.player_id
      AND award_players_table.championship_id = _championship_id
    JOIN public.teams AS teams_table
      ON teams_table.id = defense_winners.team_id
    JOIN resolved_season
      ON award_players_table.season_year = resolved_season.season_year
    WHERE eligible_goalkeeper_matches.naipe = defense_winners.naipe
      AND eligible_goalkeeper_matches.division IS NOT DISTINCT FROM defense_winners.division
    GROUP BY
      defense_winners.naipe,
      defense_winners.division,
      defense_winners.team_id,
      defense_winners.goals_against,
      goalkeepers_table.player_id,
      award_players_table.name,
      teams_table.name
  ),
  goalkeeper_winners AS (
    SELECT DISTINCT ON (goalkeeper_rows.naipe, goalkeeper_rows.division)
      goalkeeper_rows.naipe,
      goalkeeper_rows.division,
      goalkeeper_rows.team_id,
      goalkeeper_rows.player_id,
      goalkeeper_rows.player_name,
      goalkeeper_rows.team_name,
      goalkeeper_rows.matches_count,
      goalkeeper_rows.goals_against
    FROM goalkeeper_rows
    ORDER BY
      goalkeeper_rows.naipe,
      goalkeeper_rows.division NULLS FIRST,
      goalkeeper_rows.matches_count DESC,
      goalkeeper_rows.player_name ASC
  ),
  pending_matches AS (
    SELECT count(*)::int AS total
    FROM public.matches AS matches_table
    JOIN resolved_season
      ON matches_table.season_year = resolved_season.season_year
    WHERE matches_table.championship_id = _championship_id
      AND matches_table.status = 'FINISHED'::public.match_status
      AND COALESCE(matches_table.is_walkover, false) = false
      AND COALESCE(matches_table.is_score_sheet_reviewed, false) = false
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
              scorer_rows.naipe ASC,
              scorer_rows.division ASC NULLS FIRST,
              scorer_rows.goals DESC,
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
              'team_id', goalkeeper_winners.team_id,
              'team_name', goalkeeper_winners.team_name,
              'naipe', goalkeeper_winners.naipe,
              'division', goalkeeper_winners.division,
              'matches_count', goalkeeper_winners.matches_count,
              'goals_against', goalkeeper_winners.goals_against
            )
            ORDER BY
              goalkeeper_winners.naipe ASC,
              goalkeeper_winners.division ASC NULLS FIRST,
              goalkeeper_winners.player_name ASC
          )
          FROM goalkeeper_winners
        ),
        '[]'::jsonb
      )
  );
$func$;

GRANT EXECUTE ON FUNCTION public.get_championship_score_sheet_awards_rankings(UUID, INTEGER) TO authenticated;
