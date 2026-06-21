CREATE OR REPLACE FUNCTION public.get_championship_score_sheet_awards_rankings(
  _championship_id UUID,
  _season_year INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
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
  pending_award_contexts AS (
    SELECT
      matches_table.naipe,
      matches_table.division,
      count(*)::int AS pending_matches_count
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
    GROUP BY
      matches_table.naipe,
      matches_table.division
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
    'pending_award_contexts',
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'naipe', pending_award_contexts.naipe,
              'division', pending_award_contexts.division,
              'pending_matches_count', pending_award_contexts.pending_matches_count
            )
            ORDER BY
              pending_award_contexts.naipe ASC,
              pending_award_contexts.division ASC NULLS FIRST
          )
          FROM pending_award_contexts
        ),
        '[]'::jsonb
      ),
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
$function$;
