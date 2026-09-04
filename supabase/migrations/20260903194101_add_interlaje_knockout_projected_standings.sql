CREATE OR REPLACE FUNCTION public.get_interlaje_knockout_projected_placements(
  _competition_id UUID,
  _ranked_teams JSONB
)
RETURNS TABLE(
  team_id UUID,
  final_position INTEGER,
  placement_status TEXT,
  placement_basis TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  ranked_positions JSONB;
  virtual_matches JSONB := '{}'::JSONB;
  resolved_positions JSONB := '{}'::JSONB;
  first_round_number INTEGER;
  final_round_number INTEGER;
  participant_count INTEGER;
  current_round_number INTEGER;
  current_round_matches INTEGER;
  next_round_matches INTEGER;
  current_slot_number INTEGER;
  current_match RECORD;
  real_winner_team_id UUID;
  home_team_id UUID;
  away_team_id UUID;
  winner_team_id UUID;
  loser_team_id UUID;
  champion_team_id UUID;
  runner_up_team_id UUID;
  third_place_team_id UUID;
  fourth_place_team_id UUID;
  is_final_confirmed BOOLEAN;
BEGIN
  SELECT COALESCE(
    jsonb_object_agg(ranked_team.team_id::TEXT, ranked_team.final_position),
    '{}'::JSONB
  )
  INTO ranked_positions
  FROM jsonb_to_recordset(_ranked_teams) AS ranked_team(
    team_id UUID,
    final_position INTEGER
  );

  SELECT
    COUNT(DISTINCT participants.team_id)::INTEGER,
    MIN(participants.round_number)::INTEGER
  INTO participant_count, first_round_number
  FROM (
    SELECT bracket_matches_table.home_team_id AS team_id, bracket_matches_table.round_number
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.home_team_id IS NOT NULL

    UNION ALL

    SELECT bracket_matches_table.away_team_id AS team_id, bracket_matches_table.round_number
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.away_team_id IS NOT NULL
  ) AS participants;

  IF participant_count NOT IN (4, 8) OR first_round_number IS NULL THEN
    RETURN;
  END IF;

  final_round_number := first_round_number
    + CASE participant_count WHEN 4 THEN 1 ELSE 2 END;
  current_round_number := first_round_number;
  current_round_matches := participant_count / 2;

  FOR current_match IN
    SELECT
      bracket_matches_table.slot_number,
      bracket_matches_table.home_team_id,
      bracket_matches_table.away_team_id,
      bracket_matches_table.winner_team_id
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number = first_round_number
    ORDER BY bracket_matches_table.slot_number
  LOOP
    home_team_id := current_match.home_team_id;
    away_team_id := current_match.away_team_id;

    IF home_team_id IS NULL OR away_team_id IS NULL THEN
      RETURN;
    END IF;

    winner_team_id := COALESCE(
      current_match.winner_team_id,
      CASE
        WHEN COALESCE((ranked_positions ->> home_team_id::TEXT)::INTEGER, 2147483647)
          <= COALESCE((ranked_positions ->> away_team_id::TEXT)::INTEGER, 2147483647)
        THEN home_team_id
        ELSE away_team_id
      END
    );
    loser_team_id := CASE
      WHEN winner_team_id = home_team_id THEN away_team_id
      ELSE home_team_id
    END;

    virtual_matches := virtual_matches || jsonb_build_object(
      format('%s:%s', current_round_number, current_match.slot_number),
      jsonb_build_object(
        'winner_team_id', winner_team_id,
        'loser_team_id', loser_team_id
      )
    );
  END LOOP;

  WHILE current_round_number < final_round_number LOOP
    next_round_matches := current_round_matches / 2;

    FOR current_slot_number IN 1..next_round_matches LOOP
      home_team_id := (
        virtual_matches -> format('%s:%s', current_round_number, (current_slot_number * 2) - 1)
      ) ->> 'winner_team_id';
      away_team_id := (
        virtual_matches -> format('%s:%s', current_round_number, current_slot_number * 2)
      ) ->> 'winner_team_id';

      SELECT bracket_matches_table.winner_team_id
      INTO real_winner_team_id
      FROM public.championship_bracket_matches AS bracket_matches_table
      WHERE bracket_matches_table.competition_id = _competition_id
        AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
        AND bracket_matches_table.is_third_place = false
        AND bracket_matches_table.round_number = current_round_number + 1
        AND bracket_matches_table.slot_number = current_slot_number
      LIMIT 1;

      winner_team_id := COALESCE(
        real_winner_team_id,
        CASE
          WHEN COALESCE((ranked_positions ->> home_team_id::TEXT)::INTEGER, 2147483647)
            <= COALESCE((ranked_positions ->> away_team_id::TEXT)::INTEGER, 2147483647)
          THEN home_team_id
          ELSE away_team_id
        END
      );
      loser_team_id := CASE
        WHEN winner_team_id = home_team_id THEN away_team_id
        ELSE home_team_id
      END;

      virtual_matches := virtual_matches || jsonb_build_object(
        format('%s:%s', current_round_number + 1, current_slot_number),
        jsonb_build_object(
          'winner_team_id', winner_team_id,
          'loser_team_id', loser_team_id
        )
      );
    END LOOP;

    current_round_number := current_round_number + 1;
    current_round_matches := next_round_matches;
  END LOOP;

  champion_team_id := (
    virtual_matches -> format('%s:%s', final_round_number, 1)
  ) ->> 'winner_team_id';
  runner_up_team_id := (
    virtual_matches -> format('%s:%s', final_round_number, 1)
  ) ->> 'loser_team_id';

  SELECT bracket_matches_table.winner_team_id IS NOT NULL
  INTO is_final_confirmed
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false
    AND bracket_matches_table.round_number = final_round_number
    AND bracket_matches_table.slot_number = 1
  LIMIT 1;

  resolved_positions := jsonb_build_object(
    champion_team_id::TEXT,
    1,
    runner_up_team_id::TEXT,
    2
  );

  FOR current_slot_number IN 1..2 LOOP
    winner_team_id := (
      virtual_matches -> format('%s:%s', final_round_number - 1, current_slot_number)
    ) ->> 'winner_team_id';
    loser_team_id := (
      virtual_matches -> format('%s:%s', final_round_number - 1, current_slot_number)
    ) ->> 'loser_team_id';

    IF winner_team_id = champion_team_id THEN
      third_place_team_id := loser_team_id;
    ELSE
      fourth_place_team_id := loser_team_id;
    END IF;
  END LOOP;

  resolved_positions := resolved_positions || jsonb_build_object(
    third_place_team_id::TEXT,
    3,
    fourth_place_team_id::TEXT,
    4
  );

  IF participant_count = 8 THEN
    FOR current_slot_number IN 1..4 LOOP
      winner_team_id := (
        virtual_matches -> format('%s:%s', first_round_number, current_slot_number)
      ) ->> 'winner_team_id';
      loser_team_id := (
        virtual_matches -> format('%s:%s', first_round_number, current_slot_number)
      ) ->> 'loser_team_id';

      resolved_positions := resolved_positions || jsonb_build_object(
        loser_team_id::TEXT,
        CASE winner_team_id
          WHEN champion_team_id THEN 5
          WHEN runner_up_team_id THEN 6
          WHEN third_place_team_id THEN 7
          ELSE 8
        END
      );
    END LOOP;
  END IF;

  RETURN QUERY
  SELECT
    placements.key::UUID,
    placements.value::INTEGER,
    CASE WHEN COALESCE(is_final_confirmed, false) THEN 'CONFIRMED' ELSE 'PROJECTED' END,
    'KNOCKOUT'
  FROM jsonb_each_text(resolved_positions) AS placements(key, value)
  ORDER BY placements.value::INTEGER;
END;
$$;

DROP FUNCTION IF EXISTS public.get_interlaje_competition_standings(
  UUID,
  INTEGER,
  UUID,
  public.match_naipe,
  public.team_division
);

CREATE OR REPLACE FUNCTION public.get_interlaje_competition_standings(
  _championship_id UUID,
  _season_year INTEGER,
  _sport_id UUID,
  _naipe public.match_naipe,
  _division public.team_division DEFAULT NULL
)
RETURNS TABLE(
  team_id UUID,
  team_name TEXT,
  division public.team_division,
  played INTEGER,
  wins INTEGER,
  draws INTEGER,
  losses INTEGER,
  goals_for INTEGER,
  goals_against INTEGER,
  goal_diff INTEGER,
  points NUMERIC,
  yellow_cards INTEGER,
  red_cards INTEGER,
  blue_cards INTEGER,
  two_minute_penalties INTEGER,
  final_position INTEGER,
  placement_points INTEGER,
  placement_status TEXT,
  placement_basis TEXT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH effective_standings AS (
    SELECT
      standings_table.team_id,
      standings_table.team_name,
      standings_table.division,
      standings_table.played,
      standings_table.wins,
      standings_table.draws,
      standings_table.losses,
      standings_table.goals_for,
      standings_table.goals_against,
      standings_table.goal_diff,
      standings_table.points
        + COALESCE(corrected_standings_table.corrected_points - corrected_standings_table.points_base, 0) AS points,
      standings_table.yellow_cards,
      standings_table.red_cards,
      standings_table.blue_cards,
      standings_table.two_minute_penalties,
      championship_sports_table.tie_breaker_rule,
      public.is_championship_competition_team_disqualified(
        _championship_id,
        _season_year,
        _sport_id,
        _naipe,
        standings_table.division,
        standings_table.team_id
      ) AS is_disqualified
    FROM public.get_championship_effective_standings(
      _championship_id,
      _season_year,
      _division::TEXT,
      _naipe,
      _sport_id
    ) AS standings_table
    LEFT JOIN public.get_championship_corrected_group_standings(
      _championship_id,
      _season_year
    ) AS corrected_standings_table
      ON corrected_standings_table.team_id = standings_table.team_id
      AND corrected_standings_table.sport_id = _sport_id
      AND corrected_standings_table.naipe = _naipe
      AND corrected_standings_table.division IS NOT DISTINCT FROM standings_table.division
    JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = _championship_id
      AND championship_sports_table.sport_id = _sport_id
    WHERE _division IS NULL
      OR standings_table.division IS NOT DISTINCT FROM _division
  ), prepared_standings AS (
    SELECT
      effective_standings.*,
      BOOL_OR(effective_standings.played > 0) OVER (
        PARTITION BY effective_standings.division
      ) AS has_completed_result
    FROM effective_standings
  ), ranked_standings AS (
    SELECT
      prepared_standings.*,
      ROW_NUMBER() OVER (
        PARTITION BY prepared_standings.division
        ORDER BY
          prepared_standings.is_disqualified ASC,
          prepared_standings.points DESC,
          CASE WHEN prepared_standings.tie_breaker_rule = 'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule THEN prepared_standings.wins END DESC,
          CASE WHEN prepared_standings.tie_breaker_rule = 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule
            THEN CASE WHEN prepared_standings.goals_against = 0 AND prepared_standings.goals_for > 0 THEN 1000000000::NUMERIC
              WHEN prepared_standings.goals_against = 0 THEN 0
              ELSE prepared_standings.goals_for::NUMERIC / prepared_standings.goals_against END
          END DESC NULLS LAST,
          prepared_standings.goal_diff DESC,
          CASE WHEN prepared_standings.tie_breaker_rule = 'HANDEBOL'::public.championship_sport_tie_breaker_rule THEN prepared_standings.goals_against END ASC NULLS LAST,
          prepared_standings.goals_for DESC,
          CASE WHEN prepared_standings.tie_breaker_rule IN ('STANDARD'::public.championship_sport_tie_breaker_rule, 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule) THEN prepared_standings.wins END DESC,
          CASE WHEN prepared_standings.tie_breaker_rule IN ('BEACH_SOCCER'::public.championship_sport_tie_breaker_rule, 'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule, 'HANDEBOL'::public.championship_sport_tie_breaker_rule) THEN prepared_standings.yellow_cards END ASC NULLS LAST,
          prepared_standings.red_cards ASC,
          prepared_standings.blue_cards ASC,
          prepared_standings.two_minute_penalties ASC,
          prepared_standings.team_name ASC
      )::INTEGER AS group_position
    FROM prepared_standings
  ), ranking_payload AS (
    SELECT
      ranked_standings.division,
      jsonb_agg(
        jsonb_build_object(
          'team_id', ranked_standings.team_id,
          'final_position', ranked_standings.group_position
        )
      ) AS ranked_teams
    FROM ranked_standings
    GROUP BY ranked_standings.division
  ), competition_context AS (
    SELECT
      competitions_table.id AS competition_id,
      competitions_table.division,
      COALESCE(
        BOOL_AND(group_matches_table.match_id IS NOT NULL AND matches_table.status = 'FINISHED'::public.match_status),
        false
      ) AS is_group_stage_finished
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = competitions_table.bracket_edition_id
    LEFT JOIN public.championship_bracket_matches AS group_matches_table
      ON group_matches_table.competition_id = competitions_table.id
      AND group_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = group_matches_table.match_id
    WHERE editions_table.championship_id = _championship_id
      AND editions_table.season_year = _season_year
      AND competitions_table.sport_id = _sport_id
      AND competitions_table.naipe = _naipe
      AND (
        _division IS NULL
        OR competitions_table.division IS NOT DISTINCT FROM _division
      )
    GROUP BY competitions_table.id, competitions_table.division
  ), knockout_placements AS (
    SELECT projected_placements.*
    FROM competition_context
    JOIN ranking_payload
      ON ranking_payload.division IS NOT DISTINCT FROM competition_context.division
    CROSS JOIN LATERAL public.get_interlaje_knockout_projected_placements(
      competition_context.competition_id,
      ranking_payload.ranked_teams
    ) AS projected_placements
  ), resolved_standings AS (
    SELECT
      ranked_standings.*,
      COALESCE(knockout_placements.final_position, ranked_standings.group_position) AS final_position,
      COALESCE(
        knockout_placements.placement_status,
        CASE
          WHEN competition_context.competition_id IS NULL THEN 'CONFIRMED'
          WHEN competition_context.is_group_stage_finished THEN 'CONFIRMED'
          ELSE 'PROJECTED'
        END
      ) AS placement_status,
      COALESCE(knockout_placements.placement_basis, 'GROUP_STAGE') AS placement_basis
    FROM ranked_standings
    LEFT JOIN competition_context
      ON competition_context.division IS NOT DISTINCT FROM ranked_standings.division
    LEFT JOIN knockout_placements
      ON knockout_placements.team_id = ranked_standings.team_id
  )
  SELECT
    resolved_standings.team_id,
    resolved_standings.team_name,
    resolved_standings.division,
    resolved_standings.played,
    resolved_standings.wins,
    resolved_standings.draws,
    resolved_standings.losses,
    resolved_standings.goals_for,
    resolved_standings.goals_against,
    resolved_standings.goal_diff,
    resolved_standings.points,
    resolved_standings.yellow_cards,
    resolved_standings.red_cards,
    resolved_standings.blue_cards,
    resolved_standings.two_minute_penalties,
    resolved_standings.final_position,
    CASE
      WHEN resolved_standings.is_disqualified OR NOT resolved_standings.has_completed_result THEN 0
      ELSE COALESCE(settings_table.points, 0)
    END AS placement_points,
    resolved_standings.placement_status,
    resolved_standings.placement_basis
  FROM resolved_standings
  LEFT JOIN public.championship_overall_position_point_settings AS settings_table
    ON settings_table.championship_id = _championship_id
    AND settings_table.season_year = _season_year
    AND settings_table.final_position = resolved_standings.final_position
  ORDER BY resolved_standings.final_position;
$$;

DROP FUNCTION IF EXISTS public.get_interlaje_overall_standings(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.get_interlaje_overall_standings(
  _championship_id UUID,
  _season_year INTEGER
)
RETURNS TABLE(
  team_id UUID,
  team_name TEXT,
  placement_points NUMERIC,
  confirmed_placement_points NUMERIC,
  projected_placement_points NUMERIC,
  opening_bonus_points NUMERIC,
  walkover_count INTEGER,
  walkover_penalty_points NUMERIC,
  overall_points NUMERIC,
  confirmed_competitions_count INTEGER,
  has_projected_placement_points BOOLEAN,
  has_pending_tie_break BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH participating_teams AS (
    SELECT DISTINCT registrations_table.team_id
    FROM public.championship_bracket_team_registrations AS registrations_table
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = registrations_table.bracket_edition_id
    WHERE editions_table.championship_id = _championship_id
      AND editions_table.season_year = _season_year
  ), competition_contexts AS (
    SELECT DISTINCT standings_table.sport_id, standings_table.naipe, standings_table.division
    FROM public.get_championship_effective_standings(
      _championship_id,
      _season_year,
      NULL,
      NULL,
      NULL
    ) AS standings_table
  ), competition_points AS (
    SELECT
      standings_table.team_id,
      standings_table.placement_points,
      standings_table.placement_status
    FROM competition_contexts
    CROSS JOIN LATERAL public.get_interlaje_competition_standings(
      _championship_id,
      _season_year,
      competition_contexts.sport_id,
      competition_contexts.naipe,
      competition_contexts.division
    ) AS standings_table
  ), placement_totals AS (
    SELECT
      competition_points.team_id,
      COALESCE(SUM(competition_points.placement_points), 0) AS placement_points,
      COALESCE(
        SUM(competition_points.placement_points)
          FILTER (WHERE competition_points.placement_status = 'CONFIRMED'),
        0
      ) AS confirmed_placement_points,
      COALESCE(
        SUM(competition_points.placement_points)
          FILTER (WHERE competition_points.placement_status = 'PROJECTED'),
        0
      ) AS projected_placement_points,
      COUNT(*) FILTER (
        WHERE competition_points.placement_status = 'CONFIRMED'
      )::INTEGER AS confirmed_competitions_count,
      COALESCE(
        BOOL_OR(
          competition_points.placement_status = 'PROJECTED'
        ),
        false
      ) AS has_projected_placement_points
    FROM competition_points
    GROUP BY competition_points.team_id
  ), opening_totals AS (
    SELECT
      adjustments_table.team_id,
      COALESCE(SUM(adjustments_table.points), 0) AS opening_bonus_points
    FROM public.championship_overall_score_adjustments AS adjustments_table
    WHERE adjustments_table.championship_id = _championship_id
      AND adjustments_table.season_year = _season_year
      AND adjustments_table.adjustment_type = 'OPENING_CEREMONY'
    GROUP BY adjustments_table.team_id
  ), walkover_totals AS (
    SELECT
      counts_table.team_id,
      SUM(counts_table.walkover_count)::INTEGER AS walkover_count,
      COALESCE(SUM(counts_table.walkover_count * settings_table.points), 0) AS walkover_penalty_points
    FROM public.championship_walkover_penalty_counts AS counts_table
    JOIN public.championship_walkover_penalty_settings AS settings_table
      ON settings_table.championship_id = counts_table.championship_id
      AND settings_table.season_year = counts_table.season_year
    WHERE counts_table.championship_id = _championship_id
      AND counts_table.season_year = _season_year
    GROUP BY counts_table.team_id
  ), totals AS (
    SELECT
      teams_table.id AS team_id,
      teams_table.name AS team_name,
      COALESCE(placement_totals.placement_points, 0) AS placement_points,
      COALESCE(placement_totals.confirmed_placement_points, 0) AS confirmed_placement_points,
      COALESCE(placement_totals.projected_placement_points, 0) AS projected_placement_points,
      COALESCE(opening_totals.opening_bonus_points, 0) AS opening_bonus_points,
      COALESCE(walkover_totals.walkover_count, 0)::INTEGER AS walkover_count,
      COALESCE(walkover_totals.walkover_penalty_points, 0) AS walkover_penalty_points,
      COALESCE(placement_totals.placement_points, 0)
        + COALESCE(opening_totals.opening_bonus_points, 0)
        - COALESCE(walkover_totals.walkover_penalty_points, 0) AS overall_points,
      COALESCE(placement_totals.confirmed_competitions_count, 0) AS confirmed_competitions_count,
      COALESCE(placement_totals.has_projected_placement_points, false) AS has_projected_placement_points
    FROM participating_teams
    JOIN public.teams AS teams_table ON teams_table.id = participating_teams.team_id
    LEFT JOIN placement_totals ON placement_totals.team_id = teams_table.id
    LEFT JOIN opening_totals ON opening_totals.team_id = teams_table.id
    LEFT JOIN walkover_totals ON walkover_totals.team_id = teams_table.id
    WHERE teams_table.is_active IS DISTINCT FROM false
  ), tie_groups AS (
    SELECT totals_table.overall_points
    FROM totals AS totals_table
    WHERE totals_table.overall_points > 0
    GROUP BY totals_table.overall_points
    HAVING COUNT(*) > 1
  ), resolved_ties AS (
    SELECT
      resolutions_table.points_total,
      resolution_teams_table.team_id,
      resolution_teams_table.draw_order
    FROM public.championship_overall_tie_break_resolutions AS resolutions_table
    JOIN public.championship_overall_tie_break_resolution_teams AS resolution_teams_table
      ON resolution_teams_table.resolution_id = resolutions_table.id
    WHERE resolutions_table.championship_id = _championship_id
      AND resolutions_table.season_year = _season_year
  )
  SELECT
    totals.team_id,
    totals.team_name,
    totals.placement_points,
    totals.confirmed_placement_points,
    totals.projected_placement_points,
    totals.opening_bonus_points,
    totals.walkover_count,
    totals.walkover_penalty_points,
    totals.overall_points,
    totals.confirmed_competitions_count,
    totals.has_projected_placement_points,
    EXISTS (
      SELECT 1 FROM tie_groups
      WHERE tie_groups.overall_points = totals.overall_points
        AND NOT EXISTS (
          SELECT 1 FROM resolved_ties
          WHERE resolved_ties.points_total = totals.overall_points
            AND resolved_ties.team_id = totals.team_id
        )
    ) AS has_pending_tie_break
  FROM totals
  LEFT JOIN resolved_ties
    ON resolved_ties.team_id = totals.team_id
    AND resolved_ties.points_total = totals.overall_points
  ORDER BY totals.overall_points DESC, resolved_ties.draw_order ASC NULLS LAST, totals.team_name ASC;
$$;

REVOKE ALL ON FUNCTION public.get_interlaje_knockout_projected_placements(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_interlaje_knockout_projected_placements(UUID, JSONB) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.get_interlaje_competition_standings(UUID, INTEGER, UUID, public.match_naipe, public.team_division) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_interlaje_overall_standings(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_interlaje_competition_standings(UUID, INTEGER, UUID, public.match_naipe, public.team_division) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_interlaje_overall_standings(UUID, INTEGER) TO anon, authenticated;
