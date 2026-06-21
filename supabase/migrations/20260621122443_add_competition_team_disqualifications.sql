CREATE TABLE IF NOT EXISTS public.championship_competition_team_disqualifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  season_year INTEGER NOT NULL,
  sport_id UUID NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  naipe public.match_naipe NOT NULL,
  division public.team_division NULL,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (championship_id, season_year, sport_id, naipe, division, team_id)
);

COMMENT ON TABLE public.championship_competition_team_disqualifications IS
  'Registra a desclassificação administrativa de uma atlética em um recorte específico de campeonato, temporada, modalidade, naipe e divisão.';

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS disqualification_id UUID NULL
  REFERENCES public.championship_competition_team_disqualifications(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.matches.disqualification_id
IS 'Vínculo opcional com a decisão administrativa que reescreveu o jogo como W.O. por desclassificação.';

CREATE INDEX IF NOT EXISTS championship_competition_team_disqualifications_lookup_idx
  ON public.championship_competition_team_disqualifications (
    championship_id,
    season_year,
    sport_id,
    naipe,
    division,
    team_id
  );

CREATE INDEX IF NOT EXISTS matches_disqualification_id_idx
  ON public.matches (disqualification_id)
  WHERE disqualification_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_championship_competition_team_disqualified(
  _championship_id UUID,
  _season_year INTEGER,
  _sport_id UUID,
  _naipe public.match_naipe,
  _division public.team_division,
  _team_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT EXISTS (
    SELECT 1
    FROM public.championship_competition_team_disqualifications AS disqualifications_table
    WHERE disqualifications_table.championship_id = _championship_id
      AND disqualifications_table.season_year = _season_year
      AND disqualifications_table.sport_id = _sport_id
      AND disqualifications_table.naipe = _naipe
      AND disqualifications_table.division IS NOT DISTINCT FROM _division
      AND disqualifications_table.team_id = _team_id
  );
$func$;

CREATE OR REPLACE FUNCTION public.list_championship_competition_team_disqualifications(
  _championship_id UUID,
  _season_year INTEGER DEFAULT NULL
)
RETURNS SETOF public.championship_competition_team_disqualifications
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  WITH resolved_season AS (
    SELECT COALESCE(_season_year, championships_table.current_season_year) AS season_year
    FROM public.championships AS championships_table
    WHERE championships_table.id = _championship_id
    LIMIT 1
  )
  SELECT disqualifications_table.*
  FROM public.championship_competition_team_disqualifications AS disqualifications_table
  JOIN resolved_season
    ON resolved_season.season_year = disqualifications_table.season_year
  WHERE disqualifications_table.championship_id = _championship_id
  ORDER BY disqualifications_table.sport_id, disqualifications_table.naipe, disqualifications_table.division, disqualifications_table.created_at;
$func$;

CREATE OR REPLACE FUNCTION public.save_championship_award_draw_result(
  _championship_id           UUID,
  _season_year               INTEGER,
  _sport_id                  UUID,
  _naipe                     public.match_naipe,
  _division                  public.team_division,
  _award_type                public.championship_award_type,
  _winner_player_id          UUID DEFAULT NULL,
  _winner_team_id            UUID DEFAULT NULL,
  _tied_player_ids_signature TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  winner_player_team_id UUID;
BEGIN
  IF _award_type = 'TOP_SCORER'::public.championship_award_type THEN
    IF _winner_player_id IS NULL OR _winner_team_id IS NOT NULL THEN
      RAISE EXCEPTION 'Resultado inválido para sorteio de artilheiro.';
    END IF;

    SELECT award_players_table.team_id
    INTO winner_player_team_id
    FROM public.championship_award_players AS award_players_table
    WHERE award_players_table.id = _winner_player_id
    LIMIT 1;

    IF winner_player_team_id IS NULL THEN
      RAISE EXCEPTION 'Jogador vencedor do sorteio não encontrado.';
    END IF;

    IF public.is_championship_competition_team_disqualified(
      _championship_id,
      _season_year,
      _sport_id,
      _naipe,
      _division,
      winner_player_team_id
    ) THEN
      RAISE EXCEPTION 'Não é possível salvar sorteio de artilharia para atlética desclassificada.';
    END IF;
  ELSIF _award_type = 'BEST_GOALKEEPER'::public.championship_award_type THEN
    IF _winner_team_id IS NULL OR _winner_player_id IS NOT NULL THEN
      RAISE EXCEPTION 'Resultado inválido para sorteio de melhor defesa.';
    END IF;

    IF public.is_championship_competition_team_disqualified(
      _championship_id,
      _season_year,
      _sport_id,
      _naipe,
      _division,
      _winner_team_id
    ) THEN
      RAISE EXCEPTION 'Não é possível salvar sorteio de melhor defesa para atlética desclassificada.';
    END IF;
  END IF;

  SELECT id INTO v_id
  FROM public.championship_award_draw_results
  WHERE championship_id = _championship_id
    AND season_year = _season_year
    AND sport_id = _sport_id
    AND naipe = _naipe
    AND division IS NOT DISTINCT FROM _division
    AND award_type = _award_type
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.championship_award_draw_results
    SET
      winner_player_id = _winner_player_id,
      winner_team_id = _winner_team_id,
      tied_player_ids_signature = COALESCE(_tied_player_ids_signature, tied_player_ids_signature),
      updated_at = now()
    WHERE id = v_id;
  ELSE
    INSERT INTO public.championship_award_draw_results (
      championship_id,
      season_year,
      sport_id,
      naipe,
      division,
      award_type,
      winner_player_id,
      winner_team_id,
      tied_player_ids_signature
    )
    VALUES (
      _championship_id,
      _season_year,
      _sport_id,
      _naipe,
      _division,
      _award_type,
      _winner_player_id,
      _winner_team_id,
      COALESCE(_tied_player_ids_signature, '')
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'draw_result_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_championship_bracket_competition_group_rankings(
  _championship_id UUID,
  _competition_id UUID
)
RETURNS TABLE(
  competition_id UUID,
  group_id UUID,
  group_number INTEGER,
  team_id UUID,
  team_name TEXT,
  points BIGINT,
  wins BIGINT,
  goal_diff BIGINT,
  goals_for BIGINT,
  team_rank INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  WITH competition_context AS (
    SELECT
      competitions_table.id,
      competitions_table.sport_id,
      competitions_table.naipe,
      competitions_table.division,
      editions_table.season_year,
      COALESCE(championship_sports_table.points_win, 3) AS points_win,
      COALESCE(championship_sports_table.points_draw, 1) AS points_draw,
      COALESCE(championship_sports_table.points_loss, 0) AS points_loss,
      COALESCE(
        championship_sports_table.tie_breaker_rule,
        'STANDARD'::public.championship_sport_tie_breaker_rule
      ) AS tie_breaker_rule
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = competitions_table.bracket_edition_id
    LEFT JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = _championship_id
      AND championship_sports_table.sport_id = competitions_table.sport_id
    WHERE competitions_table.id = _competition_id
    LIMIT 1
  ),
  group_scores AS (
    SELECT
      bracket_matches_table.group_id,
      matches_table.home_team_id AS team_id,
      matches_table.home_score::bigint AS goals_for,
      matches_table.away_score::bigint AS goals_against,
      CASE
        WHEN matches_table.home_score > matches_table.away_score THEN (SELECT points_win FROM competition_context)
        WHEN matches_table.home_score = matches_table.away_score THEN (SELECT points_draw FROM competition_context)
        ELSE (SELECT points_loss FROM competition_context)
      END::bigint AS points,
      CASE WHEN matches_table.home_score > matches_table.away_score THEN 1 ELSE 0 END::bigint AS wins,
      GREATEST(0, COALESCE(matches_table.home_yellow_cards, 0))::bigint AS yellow_cards,
      GREATEST(0, COALESCE(matches_table.home_red_cards, 0))::bigint AS red_cards
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
      AND matches_table.status = 'FINISHED'::public.match_status

    UNION ALL

    SELECT
      bracket_matches_table.group_id,
      matches_table.away_team_id AS team_id,
      matches_table.away_score::bigint AS goals_for,
      matches_table.home_score::bigint AS goals_against,
      CASE
        WHEN matches_table.away_score > matches_table.home_score THEN (SELECT points_win FROM competition_context)
        WHEN matches_table.away_score = matches_table.home_score THEN (SELECT points_draw FROM competition_context)
        ELSE (SELECT points_loss FROM competition_context)
      END::bigint AS points,
      CASE WHEN matches_table.away_score > matches_table.home_score THEN 1 ELSE 0 END::bigint AS wins,
      GREATEST(0, COALESCE(matches_table.away_yellow_cards, 0))::bigint AS yellow_cards,
      GREATEST(0, COALESCE(matches_table.away_red_cards, 0))::bigint AS red_cards
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
      AND matches_table.status = 'FINISHED'::public.match_status
  ),
  raw_group_rows AS (
    SELECT
      groups_table.id AS group_id,
      groups_table.group_number,
      group_teams_table.team_id,
      COALESCE(sum(group_scores.points), 0)::bigint AS points,
      COALESCE(sum(group_scores.wins), 0)::bigint AS wins,
      COALESCE(sum(group_scores.goals_for - group_scores.goals_against), 0)::bigint AS goal_diff,
      COALESCE(sum(group_scores.goals_for), 0)::bigint AS goals_for,
      COALESCE(sum(group_scores.goals_against), 0)::bigint AS goals_against,
      COALESCE(sum(group_scores.yellow_cards), 0)::bigint AS yellow_cards,
      COALESCE(sum(group_scores.red_cards), 0)::bigint AS red_cards
    FROM public.championship_bracket_groups AS groups_table
    JOIN public.championship_bracket_group_teams AS group_teams_table
      ON group_teams_table.group_id = groups_table.id
    LEFT JOIN group_scores
      ON group_scores.group_id = groups_table.id
      AND group_scores.team_id = group_teams_table.team_id
    WHERE groups_table.competition_id = _competition_id
    GROUP BY groups_table.id, groups_table.group_number, group_teams_table.team_id
  ),
  group_rows AS (
    SELECT
      raw_group_rows.group_id,
      raw_group_rows.group_number,
      raw_group_rows.team_id,
      raw_group_rows.points,
      raw_group_rows.wins,
      COALESCE(standings_table.goal_diff, raw_group_rows.goal_diff)::bigint AS goal_diff,
      COALESCE(standings_table.goals_for, raw_group_rows.goals_for)::bigint AS goals_for,
      COALESCE(standings_table.goals_against, GREATEST(raw_group_rows.goals_for - COALESCE(standings_table.goal_diff, raw_group_rows.goal_diff), 0))::bigint AS goals_against,
      COALESCE(standings_table.yellow_cards, raw_group_rows.yellow_cards)::bigint AS yellow_cards,
      COALESCE(standings_table.red_cards, raw_group_rows.red_cards)::bigint AS red_cards,
      public.is_championship_competition_team_disqualified(
        _championship_id,
        competition_context.season_year,
        competition_context.sport_id,
        competition_context.naipe,
        competition_context.division,
        raw_group_rows.team_id
      ) AS is_disqualified,
      CASE
        WHEN COALESCE(standings_table.goals_against, GREATEST(raw_group_rows.goals_for - COALESCE(standings_table.goal_diff, raw_group_rows.goal_diff), 0)) = 0 THEN
          CASE
            WHEN COALESCE(standings_table.goals_for, raw_group_rows.goals_for) = 0 THEN 0::numeric
            ELSE 1000000000::numeric
          END
        ELSE COALESCE(standings_table.goals_for, raw_group_rows.goals_for)::numeric / COALESCE(standings_table.goals_against, GREATEST(raw_group_rows.goals_for - COALESCE(standings_table.goal_diff, raw_group_rows.goal_diff), 0))::numeric
      END AS points_average
    FROM raw_group_rows
    CROSS JOIN competition_context
    LEFT JOIN public.standings AS standings_table
      ON standings_table.championship_id = _championship_id
      AND standings_table.season_year = competition_context.season_year
      AND standings_table.sport_id = competition_context.sport_id
      AND standings_table.naipe = competition_context.naipe
      AND standings_table.division IS NOT DISTINCT FROM competition_context.division
      AND standings_table.team_id = raw_group_rows.team_id
  ),
  unresolved_metric_tie_sets AS (
    SELECT
      group_rows.group_id,
      string_agg(group_rows.team_id::text, '|' ORDER BY group_rows.team_id::text) AS tied_team_signature,
      array_agg(group_rows.team_id ORDER BY group_rows.team_id::text) AS tied_team_ids
    FROM group_rows
    CROSS JOIN competition_context
    GROUP BY
      group_rows.group_id,
      group_rows.is_disqualified,
      group_rows.points,
      group_rows.wins,
      group_rows.goal_diff,
      group_rows.goals_for,
      CASE
        WHEN competition_context.tie_breaker_rule = 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule
          THEN group_rows.points_average
        ELSE NULL::numeric
      END,
      CASE
        WHEN competition_context.tie_breaker_rule = 'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule
          THEN group_rows.goals_against
        ELSE NULL::bigint
      END,
      CASE
        WHEN competition_context.tie_breaker_rule IN (
          'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
          'STANDARD'::public.championship_sport_tie_breaker_rule
        ) THEN group_rows.yellow_cards
        ELSE NULL::bigint
      END,
      CASE
        WHEN competition_context.tie_breaker_rule IN (
          'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
          'STANDARD'::public.championship_sport_tie_breaker_rule
        ) THEN group_rows.red_cards
        ELSE NULL::bigint
      END,
      competition_context.tie_breaker_rule
    HAVING count(*) > 1
  ),
  unresolved_tie_context_members AS (
    SELECT
      unresolved_metric_tie_sets.group_id,
      unnest(unresolved_metric_tie_sets.tied_team_ids) AS team_id,
      public.build_championship_bracket_tie_break_context_key(
        'GROUP'::public.championship_bracket_tie_break_context_type,
        _competition_id,
        unresolved_metric_tie_sets.group_id,
        NULL,
        unresolved_metric_tie_sets.tied_team_signature
      ) AS context_key
    FROM unresolved_metric_tie_sets
  ),
  unresolved_tie_resolution_orders AS (
    SELECT
      unresolved_tie_context_members.group_id,
      unresolved_tie_context_members.team_id,
      resolution_teams_table.draw_order
    FROM unresolved_tie_context_members
    LEFT JOIN public.championship_bracket_tie_break_resolutions AS resolutions_table
      ON resolutions_table.context_key = unresolved_tie_context_members.context_key
    LEFT JOIN public.championship_bracket_tie_break_resolution_teams AS resolution_teams_table
      ON resolution_teams_table.resolution_id = resolutions_table.id
      AND resolution_teams_table.team_id = unresolved_tie_context_members.team_id
  ),
  direct_confrontation_pair_candidates AS (
    SELECT
      group_rows.group_id,
      array_agg(group_rows.team_id ORDER BY group_rows.team_id::text) AS team_ids
    FROM group_rows
    CROSS JOIN competition_context
    GROUP BY
      group_rows.group_id,
      group_rows.is_disqualified,
      group_rows.points,
      CASE
        WHEN competition_context.tie_breaker_rule = 'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule
          THEN group_rows.wins
        ELSE NULL::bigint
      END,
      competition_context.tie_breaker_rule
    HAVING count(*) = 2
      AND competition_context.tie_breaker_rule IN (
        'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
        'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule,
        'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule
      )
  ),
  direct_confrontation_pair_stats AS (
    SELECT
      direct_confrontation_pair_candidates.group_id,
      direct_confrontation_pair_candidates.team_ids[1] AS first_team_id,
      direct_confrontation_pair_candidates.team_ids[2] AS second_team_id,
      COALESCE(sum(
        CASE
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.home_score > matches_table.away_score THEN 3
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.home_score = matches_table.away_score THEN 1
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.away_score > matches_table.home_score THEN 3
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.away_score = matches_table.home_score THEN 1
          ELSE 0
        END
      ), 0)::int AS first_team_points,
      COALESCE(sum(
        CASE
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.home_score > matches_table.away_score THEN 3
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.home_score = matches_table.away_score THEN 1
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.away_score > matches_table.home_score THEN 3
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.away_score = matches_table.home_score THEN 1
          ELSE 0
        END
      ), 0)::int AS second_team_points,
      COALESCE(sum(
        CASE
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[2] THEN matches_table.home_score
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[1] THEN matches_table.away_score
          ELSE 0
        END
      ), 0)::int AS first_team_goals,
      COALESCE(sum(
        CASE
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[1] THEN matches_table.home_score
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[2] THEN matches_table.away_score
          ELSE 0
        END
      ), 0)::int AS second_team_goals
    FROM direct_confrontation_pair_candidates
    LEFT JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.group_id = direct_confrontation_pair_candidates.group_id
      AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
      AND matches_table.status = 'FINISHED'::public.match_status
      AND (
        (
          matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[1]
          AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[2]
        )
        OR
        (
          matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[2]
          AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[1]
        )
      )
    GROUP BY direct_confrontation_pair_candidates.group_id, direct_confrontation_pair_candidates.team_ids
  ),
  direct_confrontation_orders AS (
    SELECT
      direct_confrontation_pair_stats.group_id,
      direct_confrontation_pair_stats.first_team_id AS team_id,
      CASE
        WHEN
          direct_confrontation_pair_stats.first_team_points > direct_confrontation_pair_stats.second_team_points
          OR (
            direct_confrontation_pair_stats.first_team_points = direct_confrontation_pair_stats.second_team_points
            AND direct_confrontation_pair_stats.first_team_goals > direct_confrontation_pair_stats.second_team_goals
          ) THEN 0
        WHEN
          direct_confrontation_pair_stats.second_team_points > direct_confrontation_pair_stats.first_team_points
          OR (
            direct_confrontation_pair_stats.second_team_points = direct_confrontation_pair_stats.first_team_points
            AND direct_confrontation_pair_stats.second_team_goals > direct_confrontation_pair_stats.first_team_goals
          ) THEN 1
        ELSE NULL::int
      END AS direct_order
    FROM direct_confrontation_pair_stats

    UNION ALL

    SELECT
      direct_confrontation_pair_stats.group_id,
      direct_confrontation_pair_stats.second_team_id AS team_id,
      CASE
        WHEN
          direct_confrontation_pair_stats.second_team_points > direct_confrontation_pair_stats.first_team_points
          OR (
            direct_confrontation_pair_stats.second_team_points = direct_confrontation_pair_stats.first_team_points
            AND direct_confrontation_pair_stats.second_team_goals > direct_confrontation_pair_stats.first_team_goals
          ) THEN 0
        WHEN
          direct_confrontation_pair_stats.first_team_points > direct_confrontation_pair_stats.second_team_points
          OR (
            direct_confrontation_pair_stats.first_team_points = direct_confrontation_pair_stats.second_team_points
            AND direct_confrontation_pair_stats.first_team_goals > direct_confrontation_pair_stats.second_team_goals
          ) THEN 1
        ELSE NULL::int
      END AS direct_order
    FROM direct_confrontation_pair_stats
  ),
  ranked AS (
    SELECT
      _competition_id AS competition_id,
      group_rows.group_id,
      group_rows.group_number,
      group_rows.team_id,
      teams_table.name AS team_name,
      group_rows.points,
      group_rows.wins,
      group_rows.goal_diff,
      group_rows.goals_for,
      row_number() OVER (
        PARTITION BY group_rows.group_id
        ORDER BY
          group_rows.is_disqualified ASC,
          group_rows.points DESC,
          CASE
            WHEN competition_context.tie_breaker_rule IN (
              'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
              'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule
            ) THEN direct_confrontation_orders.direct_order
            ELSE NULL::int
          END ASC NULLS LAST,
          CASE
            WHEN competition_context.tie_breaker_rule IN (
              'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
              'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule
            ) THEN group_rows.wins
            ELSE NULL::bigint
          END DESC NULLS LAST,
          CASE
            WHEN competition_context.tie_breaker_rule = 'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule
              THEN direct_confrontation_orders.direct_order
            ELSE NULL::int
          END ASC NULLS LAST,
          CASE
            WHEN competition_context.tie_breaker_rule = 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule
              THEN group_rows.points_average
            ELSE NULL::numeric
          END DESC NULLS LAST,
          group_rows.goal_diff DESC,
          group_rows.goals_for DESC,
          CASE
            WHEN competition_context.tie_breaker_rule IN (
              'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule,
              'STANDARD'::public.championship_sport_tie_breaker_rule
            ) THEN group_rows.wins
            ELSE NULL::bigint
          END DESC NULLS LAST,
          CASE
            WHEN competition_context.tie_breaker_rule = 'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule
              THEN group_rows.goals_against
            ELSE NULL::bigint
          END ASC NULLS LAST,
          CASE
            WHEN competition_context.tie_breaker_rule IN (
              'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
              'STANDARD'::public.championship_sport_tie_breaker_rule
            ) THEN group_rows.yellow_cards
            ELSE NULL::bigint
          END ASC NULLS LAST,
          CASE
            WHEN competition_context.tie_breaker_rule IN (
              'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
              'STANDARD'::public.championship_sport_tie_breaker_rule
            ) THEN group_rows.red_cards
            ELSE NULL::bigint
          END ASC NULLS LAST,
          COALESCE(unresolved_tie_resolution_orders.draw_order, 2147483647) ASC,
          teams_table.name ASC
      ) AS team_rank
    FROM group_rows
    JOIN public.teams AS teams_table
      ON teams_table.id = group_rows.team_id
    CROSS JOIN competition_context
    LEFT JOIN unresolved_tie_resolution_orders
      ON unresolved_tie_resolution_orders.group_id = group_rows.group_id
      AND unresolved_tie_resolution_orders.team_id = group_rows.team_id
    LEFT JOIN direct_confrontation_orders
      ON direct_confrontation_orders.group_id = group_rows.group_id
      AND direct_confrontation_orders.team_id = group_rows.team_id
  )
  SELECT
    ranked.competition_id,
    ranked.group_id,
    ranked.group_number,
    ranked.team_id,
    ranked.team_name,
    ranked.points,
    ranked.wins,
    ranked.goal_diff,
    ranked.goals_for,
    ranked.team_rank
  FROM ranked
  ORDER BY ranked.group_number ASC, ranked.team_rank ASC, ranked.team_name ASC;
$func$;

CREATE OR REPLACE FUNCTION public.get_championship_bracket_competition_qualification_pool_ranking(
  _championship_id UUID,
  _competition_id UUID
)
RETURNS TABLE(
  competition_id UUID,
  team_id UUID,
  team_name TEXT,
  qualification_rank INTEGER,
  points BIGINT,
  wins BIGINT,
  goal_diff BIGINT,
  goals_for BIGINT,
  pool_rank INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  WITH competition_context AS (
    SELECT
      competitions_table.id,
      competitions_table.sport_id,
      competitions_table.naipe,
      competitions_table.division,
      editions_table.season_year,
      competitions_table.qualifiers_per_group,
      competitions_table.should_complete_knockout_with_best_second_placed_teams
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = competitions_table.bracket_edition_id
    WHERE competitions_table.id = _competition_id
    LIMIT 1
  ),
  group_rankings AS (
    SELECT *
    FROM public.get_championship_bracket_competition_group_rankings(_championship_id, _competition_id)
  ),
  group_sizes AS (
    SELECT
      group_rankings.group_id,
      count(*) AS group_size
    FROM group_rankings
    GROUP BY group_rankings.group_id
  ),
  max_matches AS (
    SELECT GREATEST(1, max(group_sizes.group_size - 1)) AS max_match_count
    FROM group_sizes
  ),
  candidate_rows AS (
    SELECT
      group_rankings.competition_id,
      group_rankings.group_id,
      group_rankings.team_id,
      group_rankings.team_name,
      group_rankings.team_rank AS qualification_rank,
      group_rankings.points AS points_base,
      group_rankings.wins,
      group_rankings.goal_diff,
      group_rankings.goals_for,
      CASE
        WHEN GREATEST(1, group_sizes.group_size - 1) = 0 THEN group_rankings.points::numeric
        ELSE group_rankings.points::numeric
             * max_matches.max_match_count::numeric
             / GREATEST(1, group_sizes.group_size - 1)::numeric
      END AS corrected_points,
      CASE
        WHEN GREATEST(0, group_rankings.goals_for - group_rankings.goal_diff) = 0 THEN
          CASE
            WHEN group_rankings.goals_for = 0 THEN 0::numeric
            ELSE 1000000000::numeric
          END
        ELSE group_rankings.goals_for::numeric
             / GREATEST(0, group_rankings.goals_for - group_rankings.goal_diff)::numeric
      END AS points_average
    FROM group_rankings
    JOIN group_sizes ON group_sizes.group_id = group_rankings.group_id
    CROSS JOIN max_matches
    CROSS JOIN competition_context
    WHERE (
      group_rankings.team_rank <= GREATEST(competition_context.qualifiers_per_group, 2)
      OR (
        competition_context.should_complete_knockout_with_best_second_placed_teams = true
        AND group_rankings.team_rank = 2
      )
    )
    AND NOT public.is_championship_competition_team_disqualified(
      _championship_id,
      competition_context.season_year,
      competition_context.sport_id,
      competition_context.naipe,
      competition_context.division,
      group_rankings.team_id
    )
  ),
  pool_metric_tie_sets AS (
    SELECT
      candidate_rows.qualification_rank,
      string_agg(candidate_rows.team_id::text, '|' ORDER BY candidate_rows.team_id::text) AS tied_team_signature,
      array_agg(candidate_rows.team_id ORDER BY candidate_rows.team_id::text) AS tied_team_ids
    FROM candidate_rows
    GROUP BY
      candidate_rows.qualification_rank,
      round(candidate_rows.corrected_points, 10),
      round(candidate_rows.points_average, 10),
      candidate_rows.goal_diff,
      candidate_rows.goals_for
    HAVING count(*) > 1
  ),
  pool_tie_context_members AS (
    SELECT
      pool_metric_tie_sets.qualification_rank,
      unnest(pool_metric_tie_sets.tied_team_ids) AS team_id,
      public.build_championship_bracket_tie_break_context_key(
        'QUALIFICATION_POOL'::public.championship_bracket_tie_break_context_type,
        _competition_id,
        NULL,
        pool_metric_tie_sets.qualification_rank,
        pool_metric_tie_sets.tied_team_signature
      ) AS context_key
    FROM pool_metric_tie_sets
  ),
  pool_tie_resolution_orders AS (
    SELECT
      pool_tie_context_members.qualification_rank,
      pool_tie_context_members.team_id,
      resolution_teams_table.draw_order
    FROM pool_tie_context_members
    LEFT JOIN public.championship_bracket_tie_break_resolutions AS resolutions_table
      ON resolutions_table.context_key = pool_tie_context_members.context_key
    LEFT JOIN public.championship_bracket_tie_break_resolution_teams AS resolution_teams_table
      ON resolution_teams_table.resolution_id = resolutions_table.id
      AND resolution_teams_table.team_id = pool_tie_context_members.team_id
  ),
  ranked_pool AS (
    SELECT
      candidate_rows.competition_id,
      candidate_rows.team_id,
      candidate_rows.team_name,
      candidate_rows.qualification_rank,
      candidate_rows.points_base::bigint AS points,
      candidate_rows.wins,
      candidate_rows.goal_diff,
      candidate_rows.goals_for,
      row_number() OVER (
        ORDER BY
          candidate_rows.qualification_rank ASC,
          candidate_rows.corrected_points DESC,
          candidate_rows.points_average DESC,
          candidate_rows.goal_diff DESC,
          candidate_rows.goals_for DESC,
          COALESCE(pool_tie_resolution_orders.draw_order, 2147483647) ASC,
          candidate_rows.team_name ASC
      ) AS pool_rank
    FROM candidate_rows
    LEFT JOIN pool_tie_resolution_orders
      ON pool_tie_resolution_orders.qualification_rank = candidate_rows.qualification_rank
      AND pool_tie_resolution_orders.team_id = candidate_rows.team_id
  )
  SELECT
    ranked_pool.competition_id,
    ranked_pool.team_id,
    ranked_pool.team_name,
    ranked_pool.qualification_rank,
    ranked_pool.points,
    ranked_pool.wins,
    ranked_pool.goal_diff,
    ranked_pool.goals_for,
    ranked_pool.pool_rank
  FROM ranked_pool
  ORDER BY ranked_pool.pool_rank ASC, ranked_pool.team_name ASC;
$func$;

CREATE OR REPLACE FUNCTION public.sync_championship_bracket_match_participants(_bracket_match_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bracket_match_record RECORD;
BEGIN
  SELECT
    bracket_matches_table.id,
    bracket_matches_table.match_id,
    bracket_matches_table.home_team_id,
    bracket_matches_table.away_team_id
  INTO bracket_match_record
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.id = _bracket_match_id
  LIMIT 1;

  IF bracket_match_record.id IS NULL
    OR bracket_match_record.match_id IS NULL
    OR bracket_match_record.home_team_id IS NULL
    OR bracket_match_record.away_team_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.matches AS matches_table
  SET
    home_team_id = bracket_match_record.home_team_id,
    away_team_id = bracket_match_record.away_team_id
  WHERE matches_table.id = bracket_match_record.match_id;

  RETURN bracket_match_record.match_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_championship_knockout_competition_after_disqualification(
  _championship_id UUID,
  _competition_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_variable
DECLARE
  competition_record RECORD;
  ranking_record RECORD;
  bracket_match_record RECORD;
  finished_match_record RECORD;
  qualified_team_ids UUID[] := ARRAY[]::UUID[];
  group_count_value INTEGER;
  direct_qualified_team_count INTEGER;
  should_expand_with_best_second_placed_teams BOOLEAN;
  should_include_best_second_placed_teams BOOLEAN;
  target_bracket_size INTEGER;
  bracket_size INTEGER;
  qualified_team_count INTEGER;
  existing_round_one_count INTEGER;
  standard_seed_order INTEGER[];
  home_seed_index INTEGER;
  away_seed_index INTEGER;
  home_team_id UUID;
  away_team_id UUID;
  seed_iter INTEGER;
  slot_index INTEGER;
  winner_team_id UUID;
BEGIN
  SELECT
    competitions_table.id,
    competitions_table.bracket_edition_id,
    competitions_table.qualifiers_per_group,
    competitions_table.should_complete_knockout_with_best_second_placed_teams
  INTO competition_record
  FROM public.championship_bracket_competitions AS competitions_table
  WHERE competitions_table.id = _competition_id
  LIMIT 1;

  IF competition_record.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT count(*)
  INTO existing_round_one_count
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false
    AND bracket_matches_table.round_number = 1;

  IF existing_round_one_count = 0 THEN
    PERFORM public.generate_championship_knockout_for_competition(
      _championship_id,
      _competition_id,
      competition_record.bracket_edition_id
    );

    RETURN _competition_id;
  END IF;

  SELECT count(*)
  INTO group_count_value
  FROM public.championship_bracket_groups AS groups_table
  WHERE groups_table.competition_id = _competition_id;

  direct_qualified_team_count := group_count_value * competition_record.qualifiers_per_group;
  should_expand_with_best_second_placed_teams :=
    competition_record.qualifiers_per_group = 1
    AND competition_record.should_complete_knockout_with_best_second_placed_teams = true;

  target_bracket_size := 1;
  IF should_expand_with_best_second_placed_teams THEN
    WHILE target_bracket_size <= direct_qualified_team_count LOOP
      target_bracket_size := target_bracket_size * 2;
    END LOOP;
  ELSE
    WHILE target_bracket_size < direct_qualified_team_count LOOP
      target_bracket_size := target_bracket_size * 2;
    END LOOP;
  END IF;

  should_include_best_second_placed_teams :=
    competition_record.qualifiers_per_group = 1
    AND target_bracket_size > direct_qualified_team_count;

  FOR ranking_record IN
    WITH ordered_groups AS (
      SELECT
        groups_table.id AS group_id,
        groups_table.group_number
      FROM public.championship_bracket_groups AS groups_table
      WHERE groups_table.competition_id = _competition_id
    )
    SELECT
      qualifiers.rank_number,
      rankings_table.team_id
    FROM ordered_groups
    CROSS JOIN generate_series(1, competition_record.qualifiers_per_group) AS qualifiers(rank_number)
    LEFT JOIN public.get_championship_bracket_competition_group_rankings(
      _championship_id,
      _competition_id
    ) AS rankings_table
      ON rankings_table.group_id = ordered_groups.group_id
      AND rankings_table.team_rank = qualifiers.rank_number
    LEFT JOIN public.get_championship_bracket_competition_qualification_pool_rankings(
      _championship_id,
      _competition_id
    ) AS pool_rankings
      ON pool_rankings.team_id = rankings_table.team_id
      AND pool_rankings.qualification_rank = qualifiers.rank_number
    ORDER BY
      qualifiers.rank_number ASC,
      CASE
        WHEN should_include_best_second_placed_teams
        THEN COALESCE(pool_rankings.pool_rank, ordered_groups.group_number + 1000)
        ELSE ordered_groups.group_number
      END ASC
  LOOP
    qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
  END LOOP;

  IF should_include_best_second_placed_teams THEN
    FOR ranking_record IN
      SELECT qualification_pool_rankings.team_id
      FROM public.get_championship_bracket_competition_qualification_pool_rankings(
        _championship_id,
        _competition_id
      ) AS qualification_pool_rankings
      ORDER BY qualification_pool_rankings.pool_rank ASC
    LOOP
      EXIT WHEN COALESCE(cardinality(qualified_team_ids), 0) >= target_bracket_size;

      IF ranking_record.team_id IS NOT NULL
        AND NOT ranking_record.team_id = ANY(qualified_team_ids) THEN
        qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
      END IF;
    END LOOP;
  END IF;

  WHILE COALESCE(cardinality(qualified_team_ids), 0) < target_bracket_size LOOP
    qualified_team_ids := array_append(qualified_team_ids, NULL);
  END LOOP;

  IF COALESCE(cardinality(qualified_team_ids), 0) > target_bracket_size THEN
    qualified_team_ids := qualified_team_ids[1:target_bracket_size];
  END IF;

  qualified_team_count := COALESCE(cardinality(qualified_team_ids), 0);
  IF qualified_team_count < 2 THEN
    RETURN _competition_id;
  END IF;

  bracket_size := 1;
  WHILE bracket_size < qualified_team_count LOOP
    bracket_size := bracket_size * 2;
  END LOOP;

  WHILE cardinality(qualified_team_ids) < bracket_size LOOP
    qualified_team_ids := array_append(qualified_team_ids, NULL);
  END LOOP;

  standard_seed_order := ARRAY[]::INTEGER[];
  FOR seed_iter IN 1..(bracket_size / 2) LOOP
    standard_seed_order := array_append(standard_seed_order, seed_iter);
    standard_seed_order := array_append(standard_seed_order, bracket_size + 1 - seed_iter);
  END LOOP;

  FOR slot_index IN 1..LEAST(existing_round_one_count, bracket_size / 2)
  LOOP
    home_seed_index := standard_seed_order[((slot_index - 1) * 2) + 1];
    away_seed_index := standard_seed_order[((slot_index - 1) * 2) + 2];
    home_team_id := qualified_team_ids[home_seed_index];
    away_team_id := qualified_team_ids[away_seed_index];

    SELECT
      CASE
        WHEN matches_table.status = 'FINISHED'::public.match_status AND matches_table.home_score > matches_table.away_score THEN home_team_id
        WHEN matches_table.status = 'FINISHED'::public.match_status AND matches_table.away_score > matches_table.home_score THEN away_team_id
        WHEN home_team_id IS NULL AND away_team_id IS NOT NULL THEN away_team_id
        WHEN away_team_id IS NULL AND home_team_id IS NOT NULL THEN home_team_id
        ELSE NULL
      END
    INTO winner_team_id
    FROM public.championship_bracket_matches AS bracket_matches_table
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number = 1
      AND bracket_matches_table.slot_number = slot_index
    LIMIT 1;

    UPDATE public.championship_bracket_matches AS bracket_matches_table
    SET
      home_team_id = home_team_id,
      away_team_id = away_team_id,
      winner_team_id = winner_team_id,
      is_bye = CASE
        WHEN home_team_id IS NULL AND away_team_id IS NULL THEN false
        WHEN home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN false
        ELSE true
      END
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number = 1
      AND bracket_matches_table.slot_number = slot_index
    RETURNING
      bracket_matches_table.id,
      bracket_matches_table.match_id,
      bracket_matches_table.is_bye
    INTO bracket_match_record;

    IF bracket_match_record.match_id IS NULL THEN
      IF home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN
        PERFORM public.create_championship_knockout_match_schedule(_championship_id, bracket_match_record.id);
      END IF;
    ELSE
      PERFORM public.sync_championship_bracket_match_participants(bracket_match_record.id);
    END IF;
  END LOOP;

  FOR bracket_match_record IN
    SELECT
      bracket_matches_table.id,
      bracket_matches_table.match_id,
      bracket_matches_table.source_home_bracket_match_id,
      bracket_matches_table.source_away_bracket_match_id
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number > 1
    ORDER BY bracket_matches_table.round_number ASC, bracket_matches_table.slot_number ASC
  LOOP
    SELECT winner_team_id
    INTO home_team_id
    FROM public.championship_bracket_matches
    WHERE id = bracket_match_record.source_home_bracket_match_id
    LIMIT 1;

    SELECT winner_team_id
    INTO away_team_id
    FROM public.championship_bracket_matches
    WHERE id = bracket_match_record.source_away_bracket_match_id
    LIMIT 1;

    SELECT
      CASE
        WHEN matches_table.status = 'FINISHED'::public.match_status AND matches_table.home_score > matches_table.away_score THEN home_team_id
        WHEN matches_table.status = 'FINISHED'::public.match_status AND matches_table.away_score > matches_table.home_score THEN away_team_id
        WHEN home_team_id IS NULL AND away_team_id IS NOT NULL THEN away_team_id
        WHEN away_team_id IS NULL AND home_team_id IS NOT NULL THEN home_team_id
        ELSE NULL
      END
    INTO winner_team_id
    FROM public.matches AS matches_table
    WHERE matches_table.id = bracket_match_record.match_id
    LIMIT 1;

    UPDATE public.championship_bracket_matches AS update_bracket_matches_table
    SET
      home_team_id = home_team_id,
      away_team_id = away_team_id,
      winner_team_id = winner_team_id,
      is_bye = CASE
        WHEN home_team_id IS NULL AND away_team_id IS NULL THEN false
        WHEN home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN false
        ELSE true
      END
    WHERE update_bracket_matches_table.id = bracket_match_record.id;

    IF bracket_match_record.match_id IS NULL THEN
      IF home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN
        PERFORM public.create_championship_knockout_match_schedule(_championship_id, bracket_match_record.id);
      END IF;
    ELSE
      PERFORM public.sync_championship_bracket_match_participants(bracket_match_record.id);
    END IF;
  END LOOP;

  FOR finished_match_record IN
    SELECT bracket_matches_table.match_id
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND matches_table.status = 'FINISHED'::public.match_status
    ORDER BY bracket_matches_table.round_number ASC, bracket_matches_table.slot_number ASC
  LOOP
    PERFORM public.propagate_championship_knockout_progress(finished_match_record.match_id);
  END LOOP;

  FOR bracket_match_record IN
    SELECT bracket_matches_table.id
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.match_id IS NOT NULL
  LOOP
    PERFORM public.sync_championship_bracket_match_participants(bracket_match_record.id);
  END LOOP;

  PERFORM public.sync_championship_bracket_edition_status(competition_record.bracket_edition_id);

  RETURN _competition_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.disqualify_championship_team_competition(
  _championship_id UUID,
  _season_year INTEGER,
  _sport_id UUID,
  _naipe public.match_naipe,
  _division public.team_division,
  _team_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_variable
DECLARE
  competition_record RECORD;
  disqualification_id UUID;
  affected_match RECORD;
  walkover_winner_points INTEGER;
  is_set_rule BOOLEAN;
  winner_side TEXT;
  resolved_home_score INTEGER;
  resolved_away_score INTEGER;
  updated_matches_count INTEGER := 0;
  actor_user_id UUID := auth.uid();
BEGIN
  IF NOT public.has_admin_tab_access('standings'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para desclassificar atléticas.';
  END IF;

  SELECT
    competitions_table.id,
    competitions_table.sport_id,
    competitions_table.naipe,
    competitions_table.division,
    championship_sports_table.result_rule,
    COALESCE(championship_sports_table.walkover_winner_points, 3) AS walkover_winner_points
  INTO competition_record
  FROM public.championship_bracket_competitions AS competitions_table
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = competitions_table.bracket_edition_id
  LEFT JOIN public.championship_sports AS championship_sports_table
    ON championship_sports_table.championship_id = editions_table.championship_id
    AND championship_sports_table.sport_id = competitions_table.sport_id
  WHERE editions_table.championship_id = _championship_id
    AND editions_table.season_year = _season_year
    AND competitions_table.sport_id = _sport_id
    AND competitions_table.naipe = _naipe
    AND competitions_table.division IS NOT DISTINCT FROM _division
  LIMIT 1;

  IF competition_record.id IS NULL THEN
    RAISE EXCEPTION 'Competição filtrada não encontrada para a desclassificação.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.championship_bracket_group_teams AS group_teams_table
    JOIN public.championship_bracket_groups AS groups_table
      ON groups_table.id = group_teams_table.group_id
    WHERE groups_table.competition_id = competition_record.id
      AND group_teams_table.team_id = _team_id
  ) THEN
    RAISE EXCEPTION 'A atlética informada não participa desta competição.';
  END IF;

  INSERT INTO public.championship_competition_team_disqualifications (
    championship_id,
    season_year,
    sport_id,
    naipe,
    division,
    team_id,
    created_by
  )
  VALUES (
    _championship_id,
    _season_year,
    _sport_id,
    _naipe,
    _division,
    _team_id,
    actor_user_id
  )
  ON CONFLICT (championship_id, season_year, sport_id, naipe, division, team_id)
  DO UPDATE
  SET
    created_by = EXCLUDED.created_by,
    created_at = now()
  RETURNING id INTO disqualification_id;

  walkover_winner_points := COALESCE(competition_record.walkover_winner_points, 3);
  is_set_rule := competition_record.result_rule = 'SETS'::public.championship_sport_result_rule;

  FOR affected_match IN
    SELECT
      matches_table.id,
      matches_table.home_team_id,
      matches_table.away_team_id,
      matches_table.start_time,
      matches_table.status
    FROM public.matches AS matches_table
    JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.match_id = matches_table.id
    WHERE bracket_matches_table.competition_id = competition_record.id
      AND (
        matches_table.home_team_id = _team_id
        OR matches_table.away_team_id = _team_id
      )
  LOOP
    winner_side := CASE WHEN affected_match.home_team_id = _team_id THEN 'away' ELSE 'home' END;
    resolved_home_score := CASE
      WHEN is_set_rule THEN CASE WHEN winner_side = 'home' THEN 1 ELSE 0 END
      ELSE CASE WHEN winner_side = 'home' THEN walkover_winner_points ELSE 0 END
    END;
    resolved_away_score := CASE
      WHEN is_set_rule THEN CASE WHEN winner_side = 'away' THEN 1 ELSE 0 END
      ELSE CASE WHEN winner_side = 'away' THEN walkover_winner_points ELSE 0 END
    END;

    UPDATE public.matches AS matches_table
    SET
      home_score = resolved_home_score,
      away_score = resolved_away_score,
      current_set_home_score = NULL,
      current_set_away_score = NULL,
      home_yellow_cards = 0,
      home_red_cards = 0,
      away_yellow_cards = 0,
      away_red_cards = 0,
      start_time = COALESCE(matches_table.start_time, now()),
      end_time = CASE
        WHEN matches_table.start_time IS NOT NULL THEN COALESCE(matches_table.end_time, now())
        ELSE NULL
      END,
      status = 'FINISHED'::public.match_status,
      is_walkover = true,
      is_double_walkover = false,
      walkover_loser_team_id = _team_id,
      is_score_sheet_reviewed = true,
      disqualification_id = disqualification_id
    WHERE matches_table.id = affected_match.id;

    DELETE FROM public.match_sets WHERE match_id = affected_match.id;

    IF is_set_rule THEN
      INSERT INTO public.match_sets (
        match_id,
        set_number,
        home_points,
        away_points
      )
      VALUES (
        affected_match.id,
        1,
        CASE WHEN winner_side = 'home' THEN walkover_winner_points ELSE 0 END,
        CASE WHEN winner_side = 'away' THEN walkover_winner_points ELSE 0 END
      );
    END IF;

    updated_matches_count := updated_matches_count + 1;
  END LOOP;

  DELETE FROM public.championship_award_draw_results AS draw_results_table
  WHERE draw_results_table.championship_id = _championship_id
    AND draw_results_table.season_year = _season_year
    AND draw_results_table.sport_id = _sport_id
    AND draw_results_table.naipe = _naipe
    AND draw_results_table.division IS NOT DISTINCT FROM _division
    AND (
      draw_results_table.winner_team_id = _team_id
      OR EXISTS (
        SELECT 1
        FROM public.championship_award_players AS award_players_table
        WHERE award_players_table.id = draw_results_table.winner_player_id
          AND award_players_table.team_id = _team_id
      )
    );

  PERFORM public.refresh_championship_knockout_competition_after_disqualification(
    _championship_id,
    competition_record.id
  );

  RETURN jsonb_build_object(
    'success', true,
    'disqualification_id', disqualification_id,
    'updated_matches_count', updated_matches_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_championship_competition_team_disqualified(UUID, INTEGER, UUID, public.match_naipe, public.team_division, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_championship_competition_team_disqualifications(UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_championship_bracket_match_participants(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_championship_knockout_competition_after_disqualification(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disqualify_championship_team_competition(UUID, INTEGER, UUID, public.match_naipe, public.team_division, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_championship_award_draw_result(UUID, INTEGER, UUID, public.match_naipe, public.team_division, public.championship_award_type, UUID, UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
