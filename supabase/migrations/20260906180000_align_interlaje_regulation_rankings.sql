ALTER TABLE public.championship_sports
  ADD COLUMN IF NOT EXISTS classification_policy JSONB;

CREATE TABLE IF NOT EXISTS public.championship_interlaje_tie_break_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  season_year INTEGER NOT NULL,
  sport_id UUID NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  naipe public.match_naipe NOT NULL,
  division public.team_division,
  group_id UUID REFERENCES public.championship_bracket_groups(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  draw_order INTEGER NOT NULL CHECK (draw_order > 0),
  decision_kind TEXT NOT NULL CHECK (decision_kind IN ('DRAW', 'ARBITRATION', 'CAMERA', 'SWIM_OFF', 'REPEAT_MARK')),
  justification TEXT NOT NULL CHECK (length(trim(justification)) > 0),
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (championship_id, season_year, sport_id, naipe, division, group_id, team_id),
  UNIQUE NULLS NOT DISTINCT (championship_id, season_year, sport_id, naipe, division, group_id, draw_order)
);

CREATE TABLE IF NOT EXISTS public.championship_interlaje_ranking_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  season_year INTEGER NOT NULL,
  competition_id UUID NOT NULL REFERENCES public.championship_bracket_competitions(id) ON DELETE CASCADE,
  previous_qualified_team_ids UUID[] NOT NULL,
  current_qualified_team_ids UUID[] NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('UNCHANGED', 'REGENERATED', 'BLOCKED_STARTED_KNOCKOUT', 'PENDING_TIE_BREAK')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.championship_interlaje_individual_tie_break_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.championship_individual_events(id) ON DELETE CASCADE,
  decision_kind TEXT NOT NULL CHECK (decision_kind IN ('SWIM_OFF', 'REPEAT_MARK', 'CAMERA')),
  justification TEXT NOT NULL CHECK (length(trim(justification)) > 0),
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.championship_interlaje_tie_break_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.championship_interlaje_ranking_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.championship_interlaje_individual_tie_break_resolutions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.championship_interlaje_tie_break_resolutions FROM anon, authenticated;
REVOKE ALL ON TABLE public.championship_interlaje_ranking_audits FROM anon, authenticated;
REVOKE ALL ON TABLE public.championship_interlaje_individual_tie_break_resolutions FROM anon, authenticated;

UPDATE public.championship_sports AS championship_sports_table
SET classification_policy = CASE public.normalize_sport_name(sports_table.name)
  WHEN 'basquetebol' THEN jsonb_build_object(
    'version', 1,
    'mode', 'COLLECTIVE',
    'criteria', jsonb_build_array('POINTS', 'POINTS_AVERAGE', 'HEAD_TO_HEAD_EXACTLY_TWO', 'POINT_DIFF', 'POINTS_FOR', 'POINTS_AGAINST_ASC', 'EXPULSIONS_ASC', 'MANUAL_DRAW'),
    'metrics', jsonb_build_object('points_average', 'points_for / points_against', 'zero_divisor', 'INFINITE_WHEN_POSITIVE')
  )
  WHEN 'futsal' THEN jsonb_build_object(
    'version', 1,
    'mode', 'COLLECTIVE',
    'criteria', jsonb_build_array('POINTS', 'HEAD_TO_HEAD_EXACTLY_TWO', 'GOAL_DIFF', 'GOALS_FOR', 'RED_CARDS_ASC', 'YELLOW_CARDS_ASC', 'MANUAL_DRAW')
  )
  WHEN 'handebol' THEN jsonb_build_object(
    'version', 1,
    'mode', 'COLLECTIVE',
    'criteria', jsonb_build_array('POINTS', 'HEAD_TO_HEAD_EXACTLY_TWO', 'GOAL_DIFF', 'GOALS_AGAINST_ASC', 'BLUE_CARDS_ASC', 'RED_CARDS_ASC', 'YELLOW_CARDS_ASC', 'TWO_MINUTE_PENALTIES_ASC', 'MANUAL_DRAW')
  )
  WHEN 'voleibol' THEN jsonb_build_object(
    'version', 1,
    'mode', 'COLLECTIVE',
    'criteria', jsonb_build_array('POINTS', 'SETS_AVERAGE', 'HEAD_TO_HEAD_EXACTLY_TWO', 'SETS_FOR', 'RALLY_POINTS_FOR', 'SETS_AGAINST_ASC', 'RALLY_POINTS_AGAINST_ASC', 'RED_CARDS_ASC', 'YELLOW_CARDS_ASC', 'MANUAL_DRAW'),
    'metrics', jsonb_build_object('sets_average', 'sets_for / sets_against', 'zero_divisor', 'INFINITE_WHEN_POSITIVE')
  )
  WHEN 'natacao' THEN jsonb_build_object(
    'version', 1,
    'mode', 'INDIVIDUAL',
    'event_ranking', jsonb_build_array('LOWEST_TIME'),
    'event_tie_break', jsonb_build_array('SWIM_OFF_50M_SAME_CATEGORY'),
    'overall_ranking', jsonb_build_array('POINTS', 'FIRST_PLACES_TO_TWENTIETH_PLACES'),
    'relay_multiplier', 2
  )
  WHEN 'atletismo' THEN jsonb_build_object(
    'version', 1,
    'mode', 'INDIVIDUAL',
    'event_ranking', jsonb_build_array('LOWEST_TIME_FOR_RACES', 'HIGHEST_MARK_FOR_JUMPS_AND_THROWS'),
    'event_tie_break', jsonb_build_array('REPEAT_MARK_UNTIL_FIRST', 'CAMERA_ARBITRATION_FOR_RACES'),
    'overall_ranking', jsonb_build_array('POINTS', 'FIRST_PLACES_TO_TWENTIETH_PLACES'),
    'relay_multiplier', 2
  )
  ELSE championship_sports_table.classification_policy
END
FROM public.championships AS championships_table
JOIN public.sports AS sports_table
  ON true
WHERE championships_table.id = championship_sports_table.championship_id
  AND sports_table.id = championship_sports_table.sport_id
  AND championships_table.code = 'INTERLAJE'::public.championship_code;

CREATE OR REPLACE FUNCTION public.get_interlaje_classification_policy(
  _championship_id UUID,
  _sport_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT championship_sports_table.classification_policy
  FROM public.championship_sports AS championship_sports_table
  JOIN public.championships AS championships_table
    ON championships_table.id = championship_sports_table.championship_id
  WHERE championship_sports_table.championship_id = _championship_id
    AND championship_sports_table.sport_id = _sport_id
    AND championships_table.code = 'INTERLAJE'::public.championship_code
$$;

CREATE OR REPLACE FUNCTION public.get_interlaje_collective_ranking(
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
  sets_for INTEGER,
  sets_against INTEGER,
  rally_points_for INTEGER,
  rally_points_against INTEGER,
  classification_rank INTEGER,
  has_pending_tie_break BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH policy AS (
    SELECT public.get_interlaje_classification_policy(_championship_id, _sport_id) AS value
  ), effective AS (
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
      standings_table.points,
      standings_table.yellow_cards,
      standings_table.red_cards,
      COALESCE(source_standings.blue_cards, 0) AS blue_cards,
      COALESCE(source_standings.two_minute_penalties, 0) AS two_minute_penalties
    FROM public.get_championship_effective_standings(
      _championship_id,
      _season_year,
      _division::text,
      _naipe,
      _sport_id
    ) AS standings_table
    LEFT JOIN public.standings AS source_standings
      ON source_standings.championship_id = _championship_id
      AND source_standings.season_year = _season_year
      AND source_standings.sport_id = _sport_id
      AND source_standings.naipe = _naipe
      AND source_standings.division IS NOT DISTINCT FROM standings_table.division
      AND source_standings.team_id = standings_table.team_id
  ), volleyball_metrics AS (
    SELECT
      participant.team_id,
      COALESCE(SUM(participant.sets_for), 0)::integer AS sets_for,
      COALESCE(SUM(participant.sets_against), 0)::integer AS sets_against,
      COALESCE(SUM(participant.rally_points_for), 0)::integer AS rally_points_for,
      COALESCE(SUM(participant.rally_points_against), 0)::integer AS rally_points_against
    FROM (
      SELECT
        matches_table.home_team_id AS team_id,
        COUNT(*) FILTER (WHERE match_sets_table.home_points > match_sets_table.away_points)::integer AS sets_for,
        COUNT(*) FILTER (WHERE match_sets_table.home_points < match_sets_table.away_points)::integer AS sets_against,
        COALESCE(SUM(match_sets_table.home_points), 0)::integer AS rally_points_for,
        COALESCE(SUM(match_sets_table.away_points), 0)::integer AS rally_points_against
      FROM public.matches AS matches_table
      LEFT JOIN public.match_sets AS match_sets_table ON match_sets_table.match_id = matches_table.id
      WHERE matches_table.championship_id = _championship_id
        AND matches_table.season_year = _season_year
        AND matches_table.sport_id = _sport_id
        AND matches_table.naipe = _naipe
        AND matches_table.division IS NOT DISTINCT FROM _division
        AND matches_table.status = 'FINISHED'::public.match_status
        AND COALESCE(matches_table.is_double_walkover, false) = false
      GROUP BY matches_table.home_team_id
      UNION ALL
      SELECT
        matches_table.away_team_id,
        COUNT(*) FILTER (WHERE match_sets_table.away_points > match_sets_table.home_points)::integer,
        COUNT(*) FILTER (WHERE match_sets_table.away_points < match_sets_table.home_points)::integer,
        COALESCE(SUM(match_sets_table.away_points), 0)::integer,
        COALESCE(SUM(match_sets_table.home_points), 0)::integer
      FROM public.matches AS matches_table
      LEFT JOIN public.match_sets AS match_sets_table ON match_sets_table.match_id = matches_table.id
      WHERE matches_table.championship_id = _championship_id
        AND matches_table.season_year = _season_year
        AND matches_table.sport_id = _sport_id
        AND matches_table.naipe = _naipe
        AND matches_table.division IS NOT DISTINCT FROM _division
        AND matches_table.status = 'FINISHED'::public.match_status
        AND COALESCE(matches_table.is_double_walkover, false) = false
      GROUP BY matches_table.away_team_id
    ) AS participant
    GROUP BY participant.team_id
  ), metrics AS (
    SELECT
      effective.*,
      COALESCE(volleyball_metrics.sets_for, 0) AS sets_for,
      COALESCE(volleyball_metrics.sets_against, 0) AS sets_against,
      COALESCE(volleyball_metrics.rally_points_for, 0) AS rally_points_for,
      COALESCE(volleyball_metrics.rally_points_against, 0) AS rally_points_against,
      CASE
        WHEN effective.goals_against = 0 AND effective.goals_for > 0 THEN 1000000000::numeric
        WHEN effective.goals_against = 0 THEN 0::numeric
        ELSE effective.goals_for::numeric / effective.goals_against
      END AS points_average
    FROM effective
    LEFT JOIN volleyball_metrics ON volleyball_metrics.team_id = effective.team_id
  ), prepared AS (
    SELECT
      metrics.*,
      CASE
        WHEN metrics.sets_against = 0 AND metrics.sets_for > 0 THEN 1000000000::numeric
        WHEN metrics.sets_against = 0 THEN 0::numeric
        ELSE metrics.sets_for::numeric / metrics.sets_against
      END AS sets_average,
      public.normalize_sport_name(sports_table.name) AS sport_name
    FROM metrics
    JOIN public.sports AS sports_table ON sports_table.id = _sport_id
  ), h2h_scope AS (
    SELECT
      prepared.*,
      COUNT(*) OVER (
        PARTITION BY prepared.points,
          CASE WHEN prepared.sport_name = 'basquetebol' THEN prepared.points_average
               WHEN prepared.sport_name = 'voleibol' THEN prepared.sets_average
               ELSE 0 END
      ) AS h2h_candidate_count
    FROM prepared
  ), h2h AS (
    SELECT
      h2h_scope.*,
      COALESCE((
        SELECT SUM(CASE
          WHEN matches_table.home_team_id = h2h_scope.team_id AND matches_table.home_score > matches_table.away_score THEN 3
          WHEN matches_table.away_team_id = h2h_scope.team_id AND matches_table.away_score > matches_table.home_score THEN 3
          WHEN matches_table.home_score = matches_table.away_score THEN 1
          ELSE 0
        END)
        FROM public.matches AS matches_table
        WHERE matches_table.championship_id = _championship_id
          AND matches_table.season_year = _season_year
          AND matches_table.sport_id = _sport_id
          AND matches_table.naipe = _naipe
          AND matches_table.division IS NOT DISTINCT FROM _division
          AND matches_table.status = 'FINISHED'::public.match_status
          AND COALESCE(matches_table.is_double_walkover, false) = false
          AND (matches_table.home_team_id = h2h_scope.team_id OR matches_table.away_team_id = h2h_scope.team_id)
          AND (matches_table.home_team_id = counterpart.team_id OR matches_table.away_team_id = counterpart.team_id)
      ), 0)::numeric AS head_to_head_points
    FROM h2h_scope
    LEFT JOIN h2h_scope AS counterpart
      ON counterpart.team_id <> h2h_scope.team_id
      AND counterpart.points = h2h_scope.points
      AND (
        (h2h_scope.sport_name = 'basquetebol' AND counterpart.points_average = h2h_scope.points_average)
        OR (h2h_scope.sport_name = 'voleibol' AND counterpart.sets_average = h2h_scope.sets_average)
        OR (h2h_scope.sport_name NOT IN ('basquetebol', 'voleibol'))
      )
      AND h2h_scope.h2h_candidate_count = 2
  ), ordered AS (
    SELECT
      h2h.*,
      COALESCE(resolutions_table.draw_order, 2147483647) AS draw_order,
      ROW_NUMBER() OVER (
        ORDER BY
          h2h.points DESC,
          CASE WHEN h2h.sport_name = 'basquetebol' THEN h2h.points_average END DESC NULLS LAST,
          CASE WHEN h2h.sport_name = 'voleibol' THEN h2h.sets_average END DESC NULLS LAST,
          CASE WHEN h2h.h2h_candidate_count = 2 THEN h2h.head_to_head_points END DESC NULLS LAST,
          CASE WHEN h2h.sport_name IN ('futsal', 'handebol') THEN h2h.goal_diff
               WHEN h2h.sport_name = 'basquetebol' THEN h2h.goal_diff END DESC NULLS LAST,
          CASE WHEN h2h.sport_name = 'futsal' THEN h2h.goals_for
               WHEN h2h.sport_name = 'basquetebol' THEN h2h.goals_for END DESC NULLS LAST,
          CASE WHEN h2h.sport_name = 'handebol' THEN h2h.goals_against
               WHEN h2h.sport_name = 'basquetebol' THEN h2h.goals_against END ASC NULLS LAST,
          CASE WHEN h2h.sport_name = 'handebol' THEN h2h.blue_cards END ASC NULLS LAST,
          CASE WHEN h2h.sport_name = 'voleibol' THEN h2h.sets_for END DESC NULLS LAST,
          CASE WHEN h2h.sport_name = 'voleibol' THEN h2h.rally_points_for END DESC NULLS LAST,
          CASE WHEN h2h.sport_name = 'voleibol' THEN h2h.sets_against END ASC NULLS LAST,
          CASE WHEN h2h.sport_name = 'voleibol' THEN h2h.rally_points_against END ASC NULLS LAST,
          CASE WHEN h2h.sport_name IN ('basquetebol', 'futsal', 'handebol', 'voleibol') THEN h2h.red_cards END ASC NULLS LAST,
          CASE WHEN h2h.sport_name IN ('futsal', 'handebol', 'voleibol') THEN h2h.yellow_cards END ASC NULLS LAST,
          CASE WHEN h2h.sport_name = 'handebol' THEN h2h.two_minute_penalties END ASC NULLS LAST,
          COALESCE(resolutions_table.draw_order, 2147483647) ASC,
          h2h.team_id ASC
      )::integer AS classification_rank,
      COUNT(*) OVER (
        PARTITION BY
          h2h.points,
          CASE WHEN h2h.sport_name = 'basquetebol' THEN h2h.points_average END,
          CASE WHEN h2h.sport_name = 'voleibol' THEN h2h.sets_average END,
          CASE WHEN h2h.h2h_candidate_count = 2 THEN h2h.head_to_head_points END,
          CASE WHEN h2h.sport_name IN ('futsal', 'handebol', 'basquetebol') THEN h2h.goal_diff END,
          CASE WHEN h2h.sport_name IN ('futsal', 'basquetebol') THEN h2h.goals_for END,
          CASE WHEN h2h.sport_name IN ('handebol', 'basquetebol') THEN h2h.goals_against END,
          CASE WHEN h2h.sport_name = 'handebol' THEN h2h.blue_cards END,
          CASE WHEN h2h.sport_name = 'voleibol' THEN h2h.sets_for END,
          CASE WHEN h2h.sport_name = 'voleibol' THEN h2h.rally_points_for END,
          CASE WHEN h2h.sport_name = 'voleibol' THEN h2h.sets_against END,
          CASE WHEN h2h.sport_name = 'voleibol' THEN h2h.rally_points_against END,
          CASE WHEN h2h.sport_name IN ('basquetebol', 'futsal', 'handebol', 'voleibol') THEN h2h.red_cards END,
          CASE WHEN h2h.sport_name IN ('futsal', 'handebol', 'voleibol') THEN h2h.yellow_cards END,
          CASE WHEN h2h.sport_name = 'handebol' THEN h2h.two_minute_penalties END
      ) AS unresolved_count
    FROM h2h
    LEFT JOIN public.championship_interlaje_tie_break_resolutions AS resolutions_table
      ON resolutions_table.championship_id = _championship_id
      AND resolutions_table.season_year = _season_year
      AND resolutions_table.sport_id = _sport_id
      AND resolutions_table.naipe = _naipe
      AND resolutions_table.division IS NOT DISTINCT FROM _division
      AND resolutions_table.group_id IS NULL
      AND resolutions_table.team_id = h2h.team_id
  )
  SELECT
    ordered.team_id, ordered.team_name, ordered.division, ordered.played, ordered.wins,
    ordered.draws, ordered.losses, ordered.goals_for, ordered.goals_against,
    ordered.goal_diff, ordered.points, ordered.yellow_cards, ordered.red_cards,
    ordered.blue_cards, ordered.two_minute_penalties, ordered.sets_for,
    ordered.sets_against, ordered.rally_points_for, ordered.rally_points_against,
    ordered.classification_rank,
    ordered.unresolved_count > 1 AND ordered.draw_order = 2147483647
  FROM ordered
  ORDER BY ordered.classification_rank;
$$;

CREATE OR REPLACE FUNCTION public.save_interlaje_individual_tie_break_resolution(
  _event_id UUID,
  _entries JSONB,
  _decision_kind TEXT,
  _justification TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_record public.championship_individual_events%ROWTYPE;
  normalized_sport_name TEXT;
BEGIN
  IF NOT public.has_admin_tab_access('control'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para resolver desempates individuais.';
  END IF;

  SELECT events_table.*
  INTO event_record
  FROM public.championship_individual_events AS events_table
  WHERE events_table.id = _event_id;

  SELECT public.resolve_normalized_sport_name(sports_table.name)
  INTO normalized_sport_name
  FROM public.sports AS sports_table
  WHERE sports_table.id = event_record.sport_id;

  IF event_record.id IS NULL
    OR (_decision_kind = 'SWIM_OFF' AND normalized_sport_name <> 'natacao')
    OR (_decision_kind IN ('REPEAT_MARK', 'CAMERA') AND normalized_sport_name <> 'atletismo')
    OR length(trim(COALESCE(_justification, ''))) = 0 THEN
    RAISE EXCEPTION 'Resolução de desempate individual inválida.';
  END IF;

  PERFORM public.save_championship_individual_event_live_results(_event_id, _entries);

  INSERT INTO public.championship_interlaje_individual_tie_break_resolutions (
    event_id,
    decision_kind,
    justification,
    resolved_by
  ) VALUES (
    _event_id,
    _decision_kind,
    trim(_justification),
    auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_interlaje_regulation_competition_standings(
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
  placement_basis TEXT,
  sets_for INTEGER,
  sets_against INTEGER,
  rally_points_for INTEGER,
  rally_points_against INTEGER,
  has_pending_tie_break BOOLEAN,
  classification_policy JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH policy AS (
    SELECT public.get_interlaje_classification_policy(_championship_id, _sport_id) AS value
  ), collective AS (
    SELECT
      ranking.team_id, ranking.team_name, ranking.division, ranking.played, ranking.wins,
      ranking.draws, ranking.losses, ranking.goals_for, ranking.goals_against,
      ranking.goal_diff, ranking.points, ranking.yellow_cards, ranking.red_cards,
      ranking.blue_cards, ranking.two_minute_penalties, ranking.classification_rank AS final_position,
      COALESCE(settings_table.points, 0)::integer AS placement_points,
      CASE WHEN ranking.has_pending_tie_break THEN 'PENDING_TIE_BREAK' ELSE 'CONFIRMED' END AS placement_status,
      'GROUP_STAGE'::text AS placement_basis,
      ranking.sets_for, ranking.sets_against, ranking.rally_points_for, ranking.rally_points_against,
      ranking.has_pending_tie_break, policy.value AS classification_policy
    FROM policy
    CROSS JOIN LATERAL public.get_interlaje_collective_ranking(
      _championship_id, _season_year, _sport_id, _naipe, _division
    ) AS ranking
    LEFT JOIN public.championship_overall_position_point_settings AS settings_table
      ON settings_table.championship_id = _championship_id
      AND settings_table.season_year = _season_year
      AND settings_table.final_position = ranking.classification_rank
    WHERE policy.value ->> 'mode' = 'COLLECTIVE'
  ), individual AS (
    SELECT
      standings.team_id, standings.team_name, standings.division, standings.played, standings.wins,
      standings.draws, standings.losses, standings.goals_for, standings.goals_against,
      standings.goal_diff, standings.points, standings.yellow_cards, standings.red_cards,
      standings.blue_cards, standings.two_minute_penalties, standings.final_position,
      standings.placement_points::integer, standings.placement_status, standings.placement_basis,
      0::integer, 0::integer, 0::integer, 0::integer,
      false, policy.value
    FROM policy
    CROSS JOIN LATERAL public.get_interlaje_competition_standings(
      _championship_id, _season_year, _sport_id, _naipe, _division
    ) AS standings
    WHERE policy.value ->> 'mode' = 'INDIVIDUAL'
  )
  SELECT * FROM collective
  UNION ALL
  SELECT * FROM individual
  ORDER BY final_position, team_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_interlaje_classification_policy(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_interlaje_collective_ranking(UUID, INTEGER, UUID, public.match_naipe, public.team_division) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_interlaje_regulation_competition_standings(UUID, INTEGER, UUID, public.match_naipe, public.team_division) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_interlaje_individual_tie_break_resolution(UUID, JSONB, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
