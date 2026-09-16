-- LAJE-103
-- Consolida a classificação final do INTERLAJE sem alterar resultados de partidas já encerradas.
--
-- Regras implementadas:
--   * o mata-mata reserva 1º-4º (semifinal) ou 1º-8º (quartas);
--   * a colocação dos eliminados acompanha o caminho de quem os eliminou;
--   * resultado real de partida FINISHED tem precedência sobre projeções por seed;
--   * eliminados na fase de grupos são reindexados depois das vagas reservadas;
--   * Natação/Atletismo desempata por 1º, 2º, 3º ... 20º lugares;
--   * empates totalmente persistentes ficam pendentes de resolução manual;
--   * o fechamento unificado usa a classificação geral oficial do INTERLAJE;
--   * top 12 => divisão principal; demais => divisão de acesso.

CREATE OR REPLACE FUNCTION public.resolve_interlaje_match_winner(
  _match_id UUID,
  _home_team_id UUID,
  _away_team_id UUID,
  _structural_winner_team_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $function$
DECLARE
  match_record RECORD;
BEGIN
  IF _home_team_id IS NULL OR _away_team_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF _match_id IS NOT NULL THEN
    SELECT
      matches_table.status,
      matches_table.home_score,
      matches_table.away_score,
      matches_table.home_penalty_score,
      matches_table.away_penalty_score,
      matches_table.resolved_tie_break_winner_team_id,
      matches_table.is_walkover,
      matches_table.walkover_loser_team_id,
      matches_table.is_double_walkover
    INTO match_record
    FROM public.matches AS matches_table
    WHERE matches_table.id = _match_id
    LIMIT 1;

    IF match_record.status = 'FINISHED'::public.match_status THEN
      IF COALESCE(match_record.is_double_walkover, false) THEN
        RETURN CASE
          WHEN _structural_winner_team_id IN (_home_team_id, _away_team_id)
            THEN _structural_winner_team_id
          ELSE NULL
        END;
      END IF;

      IF match_record.resolved_tie_break_winner_team_id IN (_home_team_id, _away_team_id) THEN
        RETURN match_record.resolved_tie_break_winner_team_id;
      END IF;

      IF COALESCE(match_record.is_walkover, false)
        AND match_record.walkover_loser_team_id IN (_home_team_id, _away_team_id)
      THEN
        RETURN CASE
          WHEN match_record.walkover_loser_team_id = _home_team_id THEN _away_team_id
          ELSE _home_team_id
        END;
      END IF;

      IF match_record.home_score > match_record.away_score THEN
        RETURN _home_team_id;
      END IF;

      IF match_record.away_score > match_record.home_score THEN
        RETURN _away_team_id;
      END IF;

      IF match_record.home_penalty_score IS NOT NULL
        AND match_record.away_penalty_score IS NOT NULL
        AND match_record.home_penalty_score <> match_record.away_penalty_score
      THEN
        RETURN CASE
          WHEN match_record.home_penalty_score > match_record.away_penalty_score
            THEN _home_team_id
          ELSE _away_team_id
        END;
      END IF;

      -- Uma partida encerrada nunca é decidida por seed. Se o resultado real
      -- ainda não identifica um vencedor, aceitamos apenas o vencedor estrutural
      -- que já tenha sido explicitamente gravado na chave.
      RETURN CASE
        WHEN _structural_winner_team_id IN (_home_team_id, _away_team_id)
          THEN _structural_winner_team_id
        ELSE NULL
      END;
    END IF;
  END IF;

  RETURN CASE
    WHEN _structural_winner_team_id IN (_home_team_id, _away_team_id)
      THEN _structural_winner_team_id
    ELSE NULL
  END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_interlaje_knockout_final_placements(
  _competition_id UUID,
  _ranked_teams JSONB
)
RETURNS TABLE(
  team_id UUID,
  final_position INTEGER,
  placement_status TEXT,
  placement_basis TEXT,
  placement_stage TEXT,
  eliminated_by_team_id UUID,
  eliminated_by_final_position INTEGER,
  placement_reason TEXT
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $function$
DECLARE
  ranked_positions JSONB;
  virtual_matches JSONB := '{}'::JSONB;
  resolved_positions JSONB := '{}'::JSONB;
  eliminated_by JSONB := '{}'::JSONB;
  elimination_stage JSONB := '{}'::JSONB;
  first_round_number INTEGER;
  final_round_number INTEGER;
  participant_count INTEGER;
  current_round_number INTEGER;
  current_round_matches INTEGER;
  next_round_matches INTEGER;
  current_slot_number INTEGER;
  current_match RECORD;
  home_team_id UUID;
  away_team_id UUID;
  winner_team_id UUID;
  loser_team_id UUID;
  champion_team_id UUID;
  runner_up_team_id UUID;
  third_place_team_id UUID;
  fourth_place_team_id UUID;
  match_is_confirmed BOOLEAN;
  all_results_confirmed BOOLEAN := true;
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

  SELECT MIN(bracket_matches_table.round_number)
  INTO first_round_number
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false;

  IF first_round_number IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(DISTINCT participants.team_id)::INTEGER
  INTO participant_count
  FROM (
    SELECT bracket_matches_table.home_team_id AS team_id
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number = first_round_number
      AND bracket_matches_table.home_team_id IS NOT NULL

    UNION ALL

    SELECT bracket_matches_table.away_team_id AS team_id
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number = first_round_number
      AND bracket_matches_table.away_team_id IS NOT NULL
  ) AS participants;

  IF participant_count NOT IN (4, 8) THEN
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
      bracket_matches_table.winner_team_id,
      bracket_matches_table.match_id,
      matches_table.status
    FROM public.championship_bracket_matches AS bracket_matches_table
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
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

    winner_team_id := public.resolve_interlaje_match_winner(
      current_match.match_id,
      home_team_id,
      away_team_id,
      current_match.winner_team_id
    );

    match_is_confirmed := winner_team_id IS NOT NULL
      AND (
        current_match.status = 'FINISHED'::public.match_status
        OR current_match.winner_team_id IS NOT NULL
      );

    IF winner_team_id IS NULL THEN
      -- Seed só pode projetar partida que ainda não foi finalizada.
      IF current_match.status = 'FINISHED'::public.match_status THEN
        RETURN;
      END IF;

      winner_team_id := CASE
        WHEN COALESCE((ranked_positions ->> home_team_id::TEXT)::INTEGER, 2147483647)
          <= COALESCE((ranked_positions ->> away_team_id::TEXT)::INTEGER, 2147483647)
        THEN home_team_id
        ELSE away_team_id
      END;
      match_is_confirmed := false;
    END IF;

    loser_team_id := CASE
      WHEN winner_team_id = home_team_id THEN away_team_id
      ELSE home_team_id
    END;

    all_results_confirmed := all_results_confirmed AND match_is_confirmed;

    virtual_matches := virtual_matches || jsonb_build_object(
      format('%s:%s', current_round_number, current_match.slot_number),
      jsonb_build_object(
        'winner_team_id', winner_team_id,
        'loser_team_id', loser_team_id,
        'confirmed', match_is_confirmed
      )
    );
    eliminated_by := eliminated_by || jsonb_build_object(
      loser_team_id::TEXT,
      winner_team_id::TEXT
    );
    elimination_stage := elimination_stage || jsonb_build_object(
      loser_team_id::TEXT,
      CASE participant_count
        WHEN 8 THEN 'QUARTERFINAL'
        ELSE 'SEMIFINAL'
      END
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

      SELECT
        bracket_matches_table.winner_team_id,
        bracket_matches_table.match_id,
        matches_table.status
      INTO current_match
      FROM public.championship_bracket_matches AS bracket_matches_table
      LEFT JOIN public.matches AS matches_table
        ON matches_table.id = bracket_matches_table.match_id
      WHERE bracket_matches_table.competition_id = _competition_id
        AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
        AND bracket_matches_table.is_third_place = false
        AND bracket_matches_table.round_number = current_round_number + 1
        AND bracket_matches_table.slot_number = current_slot_number
      LIMIT 1;

      winner_team_id := public.resolve_interlaje_match_winner(
        current_match.match_id,
        home_team_id,
        away_team_id,
        current_match.winner_team_id
      );

      match_is_confirmed := winner_team_id IS NOT NULL
        AND (
          current_match.status = 'FINISHED'::public.match_status
          OR current_match.winner_team_id IS NOT NULL
        );

      IF winner_team_id IS NULL THEN
        IF current_match.status = 'FINISHED'::public.match_status THEN
          RETURN;
        END IF;

        winner_team_id := CASE
          WHEN COALESCE((ranked_positions ->> home_team_id::TEXT)::INTEGER, 2147483647)
            <= COALESCE((ranked_positions ->> away_team_id::TEXT)::INTEGER, 2147483647)
          THEN home_team_id
          ELSE away_team_id
        END;
        match_is_confirmed := false;
      END IF;

      loser_team_id := CASE
        WHEN winner_team_id = home_team_id THEN away_team_id
        ELSE home_team_id
      END;

      all_results_confirmed := all_results_confirmed AND match_is_confirmed;

      virtual_matches := virtual_matches || jsonb_build_object(
        format('%s:%s', current_round_number + 1, current_slot_number),
        jsonb_build_object(
          'winner_team_id', winner_team_id,
          'loser_team_id', loser_team_id,
          'confirmed', match_is_confirmed
        )
      );
      eliminated_by := eliminated_by || jsonb_build_object(
        loser_team_id::TEXT,
        winner_team_id::TEXT
      );
      elimination_stage := elimination_stage || jsonb_build_object(
        loser_team_id::TEXT,
        CASE
          WHEN current_round_number + 1 = final_round_number THEN 'FINAL'
          ELSE 'SEMIFINAL'
        END
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

  IF champion_team_id IS NULL OR runner_up_team_id IS NULL THEN
    RETURN;
  END IF;

  resolved_positions := jsonb_build_object(
    champion_team_id::TEXT, 1,
    runner_up_team_id::TEXT, 2
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

  IF third_place_team_id IS NULL OR fourth_place_team_id IS NULL THEN
    RETURN;
  END IF;

  resolved_positions := resolved_positions || jsonb_build_object(
    third_place_team_id::TEXT, 3,
    fourth_place_team_id::TEXT, 4
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
          WHEN fourth_place_team_id THEN 8
          ELSE NULL
        END
      );
    END LOOP;
  END IF;

  RETURN QUERY
  SELECT
    placements.key::UUID AS team_id,
    placements.value::INTEGER AS final_position,
    CASE WHEN all_results_confirmed THEN 'CONFIRMED' ELSE 'PROJECTED' END AS placement_status,
    'KNOCKOUT'::TEXT AS placement_basis,
    COALESCE(
      elimination_stage ->> placements.key,
      CASE WHEN placements.value::INTEGER = 1 THEN 'FINAL' ELSE NULL END
    ) AS placement_stage,
    NULLIF(eliminated_by ->> placements.key, '')::UUID AS eliminated_by_team_id,
    CASE
      WHEN eliminated_by ? placements.key
      THEN (resolved_positions ->> (eliminated_by ->> placements.key))::INTEGER
      ELSE NULL
    END AS eliminated_by_final_position,
    CASE placements.value::INTEGER
      WHEN 1 THEN 'CHAMPION'
      WHEN 2 THEN 'RUNNER_UP'
      WHEN 3 THEN 'SEMIFINAL_LOSS_TO_CHAMPION'
      WHEN 4 THEN 'SEMIFINAL_LOSS_TO_RUNNER_UP'
      WHEN 5 THEN 'QUARTERFINAL_LOSS_TO_CHAMPION'
      WHEN 6 THEN 'QUARTERFINAL_LOSS_TO_RUNNER_UP'
      WHEN 7 THEN 'QUARTERFINAL_LOSS_TO_THIRD'
      WHEN 8 THEN 'QUARTERFINAL_LOSS_TO_FOURTH'
      ELSE 'KNOCKOUT'
    END AS placement_reason
  FROM jsonb_each_text(resolved_positions) AS placements(key, value)
  WHERE placements.value IS NOT NULL
  ORDER BY placements.value::INTEGER;
END;
$function$;

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
AS $function$
  WITH policy AS (
    SELECT public.get_interlaje_classification_policy(_championship_id, _sport_id) AS value
  ), collective_ranked AS (
    SELECT
      ranking.*,
      BOOL_OR(ranking.played > 0) OVER (
        PARTITION BY ranking.division
      ) AS has_completed_result,
      public.is_championship_competition_team_disqualified(
        _championship_id,
        _season_year,
        _sport_id,
        _naipe,
        ranking.division,
        ranking.team_id
      ) AS is_disqualified
    FROM policy
    CROSS JOIN LATERAL public.get_interlaje_collective_ranking(
      _championship_id,
      _season_year,
      _sport_id,
      _naipe,
      _division
    ) AS ranking
    WHERE policy.value ->> 'mode' = 'COLLECTIVE'
  ), ranking_payload AS (
    SELECT
      collective_ranked.division,
      jsonb_agg(
        jsonb_build_object(
          'team_id', collective_ranked.team_id,
          'final_position', collective_ranked.classification_rank
        )
        ORDER BY collective_ranked.classification_rank
      ) AS ranked_teams,
      BOOL_OR(collective_ranked.has_pending_tie_break) AS has_pending_tie_break
    FROM collective_ranked
    GROUP BY collective_ranked.division
  ), competition_context AS (
    SELECT
      competitions_table.id AS competition_id,
      competitions_table.division,
      COALESCE(
        BOOL_AND(
          group_matches_table.match_id IS NOT NULL
          AND matches_table.status = 'FINISHED'::public.match_status
        ),
        false
      ) AS is_group_stage_finished,
      COALESCE(knockout_context.participant_count, 0) AS knockout_participant_count
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = competitions_table.bracket_edition_id
    LEFT JOIN public.championship_bracket_matches AS group_matches_table
      ON group_matches_table.competition_id = competitions_table.id
      AND group_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = group_matches_table.match_id
    LEFT JOIN LATERAL (
      WITH first_round AS (
        SELECT MIN(knockout_matches.round_number) AS round_number
        FROM public.championship_bracket_matches AS knockout_matches
        WHERE knockout_matches.competition_id = competitions_table.id
          AND knockout_matches.phase = 'KNOCKOUT'::public.bracket_phase
          AND knockout_matches.is_third_place = false
      ), participants AS (
        SELECT knockout_matches.home_team_id AS team_id
        FROM public.championship_bracket_matches AS knockout_matches
        CROSS JOIN first_round
        WHERE knockout_matches.competition_id = competitions_table.id
          AND knockout_matches.phase = 'KNOCKOUT'::public.bracket_phase
          AND knockout_matches.is_third_place = false
          AND knockout_matches.round_number = first_round.round_number
          AND knockout_matches.home_team_id IS NOT NULL
        UNION ALL
        SELECT knockout_matches.away_team_id
        FROM public.championship_bracket_matches AS knockout_matches
        CROSS JOIN first_round
        WHERE knockout_matches.competition_id = competitions_table.id
          AND knockout_matches.phase = 'KNOCKOUT'::public.bracket_phase
          AND knockout_matches.is_third_place = false
          AND knockout_matches.round_number = first_round.round_number
          AND knockout_matches.away_team_id IS NOT NULL
      )
      SELECT COUNT(DISTINCT participants.team_id)::INTEGER AS participant_count
      FROM participants
    ) AS knockout_context ON true
    WHERE editions_table.championship_id = _championship_id
      AND editions_table.season_year = _season_year
      AND competitions_table.sport_id = _sport_id
      AND competitions_table.naipe = _naipe
      AND (
        _division IS NULL
        OR competitions_table.division IS NOT DISTINCT FROM _division
      )
    GROUP BY
      competitions_table.id,
      competitions_table.division,
      knockout_context.participant_count
  ), knockout_placements AS (
    SELECT
      competition_context.competition_id,
      competition_context.division,
      placements.*
    FROM competition_context
    JOIN ranking_payload
      ON ranking_payload.division IS NOT DISTINCT FROM competition_context.division
    CROSS JOIN LATERAL public.get_interlaje_knockout_final_placements(
      competition_context.competition_id,
      ranking_payload.ranked_teams
    ) AS placements
    WHERE ranking_payload.has_pending_tie_break = false
  ), collective_joined AS (
    SELECT
      ranking.*,
      competition_context.competition_id,
      competition_context.is_group_stage_finished,
      competition_context.knockout_participant_count,
      knockout_placements.final_position AS knockout_final_position,
      knockout_placements.placement_status AS knockout_placement_status,
      knockout_placements.placement_basis AS knockout_placement_basis,
      knockout_placements.placement_stage,
      knockout_placements.eliminated_by_team_id,
      knockout_placements.eliminated_by_final_position,
      knockout_placements.placement_reason,
      eliminated_by_team.name AS eliminated_by_team_name,
      COUNT(knockout_placements.team_id) OVER (
        PARTITION BY competition_context.competition_id
      )::INTEGER AS resolved_knockout_count
    FROM collective_ranked AS ranking
    LEFT JOIN competition_context
      ON competition_context.division IS NOT DISTINCT FROM ranking.division
    LEFT JOIN knockout_placements
      ON knockout_placements.competition_id = competition_context.competition_id
      AND knockout_placements.team_id = ranking.team_id
    LEFT JOIN public.teams AS eliminated_by_team
      ON eliminated_by_team.id = knockout_placements.eliminated_by_team_id
  ), collective_numbered AS (
    SELECT
      collective_joined.*,
      ROW_NUMBER() OVER (
        PARTITION BY collective_joined.division, (collective_joined.knockout_final_position IS NULL)
        ORDER BY collective_joined.classification_rank, collective_joined.team_id
      )::INTEGER AS non_knockout_rank,
      collective_joined.knockout_participant_count IN (4, 8)
        AND collective_joined.resolved_knockout_count = collective_joined.knockout_participant_count
        AND collective_joined.has_pending_tie_break = false
        AS has_resolved_knockout_structure
    FROM collective_joined
  ), collective_positioned AS (
    SELECT
      collective_numbered.*,
      CASE
        WHEN collective_numbered.knockout_final_position IS NOT NULL
          THEN collective_numbered.knockout_final_position
        WHEN collective_numbered.has_resolved_knockout_structure
          THEN collective_numbered.knockout_participant_count + collective_numbered.non_knockout_rank
        ELSE collective_numbered.classification_rank
      END::INTEGER AS resolved_final_position,
      CASE
        WHEN collective_numbered.has_pending_tie_break THEN 'PENDING_TIE_BREAK'
        WHEN collective_numbered.knockout_final_position IS NOT NULL
          THEN collective_numbered.knockout_placement_status
        WHEN collective_numbered.knockout_participant_count IN (4, 8)
          AND NOT collective_numbered.has_resolved_knockout_structure
          THEN 'PROJECTED'
        WHEN collective_numbered.is_group_stage_finished THEN 'CONFIRMED'
        ELSE 'PROJECTED'
      END::TEXT AS resolved_placement_status,
      CASE
        WHEN collective_numbered.knockout_final_position IS NOT NULL THEN 'KNOCKOUT'
        ELSE 'GROUP_STAGE'
      END::TEXT AS resolved_placement_basis
    FROM collective_numbered
  ), collective AS (
    SELECT
      ranking.team_id,
      ranking.team_name,
      ranking.division,
      ranking.played,
      ranking.wins,
      ranking.draws,
      ranking.losses,
      ranking.goals_for,
      ranking.goals_against,
      ranking.goal_diff,
      ranking.points,
      ranking.yellow_cards,
      ranking.red_cards,
      ranking.blue_cards,
      ranking.two_minute_penalties,
      ranking.resolved_final_position AS final_position,
      CASE
        WHEN ranking.is_disqualified
          OR NOT ranking.has_completed_result
          OR ranking.has_pending_tie_break
        THEN 0
        ELSE COALESCE(settings_table.points, 0)
      END::INTEGER AS placement_points,
      ranking.resolved_placement_status AS placement_status,
      ranking.resolved_placement_basis AS placement_basis,
      ranking.sets_for,
      ranking.sets_against,
      ranking.rally_points_for,
      ranking.rally_points_against,
      ranking.has_pending_tie_break,
      policy.value || jsonb_build_object(
        'placement_context',
        jsonb_strip_nulls(jsonb_build_object(
          'stage', COALESCE(
            ranking.placement_stage,
            CASE WHEN ranking.has_resolved_knockout_structure THEN 'GROUP_STAGE' ELSE 'GROUP_STAGE' END
          ),
          'status', ranking.resolved_placement_status,
          'reason', COALESCE(
            ranking.placement_reason,
            CASE
              WHEN ranking.has_resolved_knockout_structure THEN 'GROUP_STAGE_ELIMINATION'
              ELSE 'GROUP_STAGE_RANKING'
            END
          ),
          'final_position', ranking.resolved_final_position,
          'group_stage_rank', ranking.classification_rank,
          'knockout_reserved_positions', CASE
            WHEN ranking.has_resolved_knockout_structure THEN ranking.knockout_participant_count
            ELSE NULL
          END,
          'is_knockout_participant', ranking.knockout_final_position IS NOT NULL,
          'eliminated_by_team_id', ranking.eliminated_by_team_id,
          'eliminated_by_team_name', ranking.eliminated_by_team_name,
          'eliminated_by_final_position', ranking.eliminated_by_final_position
        ))
      ) AS classification_policy
    FROM policy
    JOIN collective_positioned AS ranking ON true
    LEFT JOIN public.championship_overall_position_point_settings AS settings_table
      ON settings_table.championship_id = _championship_id
      AND settings_table.season_year = _season_year
      AND settings_table.final_position = ranking.resolved_final_position
  ), individual_base AS (
    SELECT
      individual_standings.team_id,
      teams_table.name AS team_name,
      individual_standings.division,
      individual_standings.scored_events_count,
      individual_standings.total_points,
      individual_standings.first_places,
      individual_standings.second_places,
      individual_standings.third_places,
      individual_standings.fourth_places,
      individual_standings.fifth_places,
      individual_standings.sixth_places,
      individual_standings.seventh_places,
      individual_standings.eighth_places,
      individual_standings.ninth_places,
      individual_standings.tenth_places,
      individual_standings.eleventh_places,
      individual_standings.twelfth_places,
      individual_standings.thirteenth_places,
      individual_standings.fourteenth_places,
      individual_standings.fifteenth_places,
      individual_standings.sixteenth_places,
      individual_standings.seventeenth_places,
      individual_standings.eighteenth_places,
      individual_standings.nineteenth_places,
      individual_standings.twentieth_places,
      public.is_championship_competition_team_disqualified(
        _championship_id,
        _season_year,
        _sport_id,
        _naipe,
        individual_standings.division,
        individual_standings.team_id
      ) AS is_disqualified,
      resolutions_table.draw_order,
      COALESCE(session_context.is_finished, false) AS is_finished
    FROM policy
    JOIN public.championship_individual_team_standings AS individual_standings
      ON policy.value ->> 'mode' = 'INDIVIDUAL'
    JOIN public.teams AS teams_table
      ON teams_table.id = individual_standings.team_id
    LEFT JOIN public.championship_interlaje_tie_break_resolutions AS resolutions_table
      ON resolutions_table.championship_id = _championship_id
      AND resolutions_table.season_year = _season_year
      AND resolutions_table.sport_id = _sport_id
      AND resolutions_table.naipe = _naipe
      AND resolutions_table.division IS NOT DISTINCT FROM individual_standings.division
      AND resolutions_table.group_id IS NULL
      AND resolutions_table.team_id = individual_standings.team_id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) > 0
          AND BOOL_AND(
            sessions_table.status IN (
              'FINISHED'::public.championship_individual_session_status,
              'CANCELLED'::public.championship_individual_session_status
            )
          ) AS is_finished
      FROM public.championship_individual_sessions AS sessions_table
      WHERE sessions_table.championship_id = _championship_id
        AND sessions_table.season_year = _season_year
        AND sessions_table.sport_id = _sport_id
        AND sessions_table.naipe = _naipe
        AND sessions_table.division IS NOT DISTINCT FROM individual_standings.division
    ) AS session_context ON true
    WHERE individual_standings.championship_id = _championship_id
      AND individual_standings.season_year = _season_year
      AND individual_standings.sport_id = _sport_id
      AND individual_standings.naipe = _naipe
      AND (_division IS NULL OR individual_standings.division IS NOT DISTINCT FROM _division)
  ), individual_ranked AS (
    SELECT
      individual_base.*,
      COUNT(*) OVER (
        PARTITION BY
          individual_base.division,
          individual_base.total_points,
          individual_base.first_places,
          individual_base.second_places,
          individual_base.third_places,
          individual_base.fourth_places,
          individual_base.fifth_places,
          individual_base.sixth_places,
          individual_base.seventh_places,
          individual_base.eighth_places,
          individual_base.ninth_places,
          individual_base.tenth_places,
          individual_base.eleventh_places,
          individual_base.twelfth_places,
          individual_base.thirteenth_places,
          individual_base.fourteenth_places,
          individual_base.fifteenth_places,
          individual_base.sixteenth_places,
          individual_base.seventeenth_places,
          individual_base.eighteenth_places,
          individual_base.nineteenth_places,
          individual_base.twentieth_places
      )::INTEGER AS unresolved_count,
      ROW_NUMBER() OVER (
        PARTITION BY individual_base.division
        ORDER BY
          individual_base.is_disqualified ASC,
          individual_base.total_points DESC,
          individual_base.first_places DESC,
          individual_base.second_places DESC,
          individual_base.third_places DESC,
          individual_base.fourth_places DESC,
          individual_base.fifth_places DESC,
          individual_base.sixth_places DESC,
          individual_base.seventh_places DESC,
          individual_base.eighth_places DESC,
          individual_base.ninth_places DESC,
          individual_base.tenth_places DESC,
          individual_base.eleventh_places DESC,
          individual_base.twelfth_places DESC,
          individual_base.thirteenth_places DESC,
          individual_base.fourteenth_places DESC,
          individual_base.fifteenth_places DESC,
          individual_base.sixteenth_places DESC,
          individual_base.seventeenth_places DESC,
          individual_base.eighteenth_places DESC,
          individual_base.nineteenth_places DESC,
          individual_base.twentieth_places DESC,
          COALESCE(individual_base.draw_order, 2147483647) ASC,
          individual_base.team_id ASC
      )::INTEGER AS resolved_final_position
    FROM individual_base
  ), individual AS (
    SELECT
      ranking.team_id,
      ranking.team_name,
      ranking.division,
      ranking.scored_events_count::INTEGER AS played,
      ranking.first_places::INTEGER AS wins,
      ranking.second_places::INTEGER AS draws,
      0::INTEGER AS losses,
      0::INTEGER AS goals_for,
      0::INTEGER AS goals_against,
      0::INTEGER AS goal_diff,
      ranking.total_points::NUMERIC AS points,
      0::INTEGER AS yellow_cards,
      0::INTEGER AS red_cards,
      0::INTEGER AS blue_cards,
      0::INTEGER AS two_minute_penalties,
      ranking.resolved_final_position AS final_position,
      CASE
        WHEN ranking.is_disqualified
          OR NOT ranking.is_finished
          OR (ranking.unresolved_count > 1 AND ranking.draw_order IS NULL)
        THEN 0
        ELSE COALESCE(settings_table.points, 0)
      END::INTEGER AS placement_points,
      CASE
        WHEN ranking.unresolved_count > 1 AND ranking.draw_order IS NULL
          THEN 'PENDING_TIE_BREAK'
        WHEN ranking.is_finished THEN 'CONFIRMED'
        ELSE 'PROJECTED'
      END::TEXT AS placement_status,
      'INDIVIDUAL'::TEXT AS placement_basis,
      0::INTEGER AS sets_for,
      0::INTEGER AS sets_against,
      0::INTEGER AS rally_points_for,
      0::INTEGER AS rally_points_against,
      (ranking.unresolved_count > 1 AND ranking.draw_order IS NULL) AS has_pending_tie_break,
      policy.value || jsonb_build_object(
        'placement_context',
        jsonb_build_object(
          'stage', 'INDIVIDUAL',
          'status', CASE
            WHEN ranking.unresolved_count > 1 AND ranking.draw_order IS NULL
              THEN 'PENDING_TIE_BREAK'
            WHEN ranking.is_finished THEN 'CONFIRMED'
            ELSE 'PROJECTED'
          END,
          'reason', 'INDIVIDUAL_RANKING',
          'final_position', ranking.resolved_final_position
        )
      ) AS classification_policy
    FROM policy
    JOIN individual_ranked AS ranking ON true
    LEFT JOIN public.championship_overall_position_point_settings AS settings_table
      ON settings_table.championship_id = _championship_id
      AND settings_table.season_year = _season_year
      AND settings_table.final_position = ranking.resolved_final_position
  )
  SELECT * FROM collective
  UNION ALL
  SELECT * FROM individual
  ORDER BY final_position, team_id;
$function$;

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
AS $function$
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
      standings_table.placement_status,
      standings_table.has_pending_tie_break
    FROM competition_contexts
    CROSS JOIN LATERAL public.get_interlaje_regulation_competition_standings(
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
        BOOL_OR(competition_points.placement_status = 'PROJECTED'),
        false
      ) AS has_projected_placement_points,
      COALESCE(
        BOOL_OR(
          competition_points.placement_status = 'PENDING_TIE_BREAK'
          OR competition_points.has_pending_tie_break
        ),
        false
      ) AS has_competition_pending_tie_break
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
      COALESCE(placement_totals.has_projected_placement_points, false) AS has_projected_placement_points,
      COALESCE(placement_totals.has_competition_pending_tie_break, false) AS has_competition_pending_tie_break
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
    totals.has_competition_pending_tie_break
      OR EXISTS (
        SELECT 1
        FROM tie_groups
        WHERE tie_groups.overall_points = totals.overall_points
          AND NOT EXISTS (
            SELECT 1
            FROM resolved_ties
            WHERE resolved_ties.points_total = totals.overall_points
              AND resolved_ties.team_id = totals.team_id
          )
      ) AS has_pending_tie_break
  FROM totals
  LEFT JOIN resolved_ties
    ON resolved_ties.team_id = totals.team_id
    AND resolved_ties.points_total = totals.overall_points
  ORDER BY totals.overall_points DESC, resolved_ties.draw_order ASC NULLS LAST, totals.team_name ASC;
$function$;

CREATE OR REPLACE FUNCTION public.get_interlaje_season_division_preview(
  _championship_id UUID,
  _season_year INTEGER
)
RETURNS TABLE(
  team_id UUID,
  team_name TEXT,
  previous_division public.team_division,
  next_division public.team_division,
  source_division public.team_division,
  ranking_position INTEGER,
  rule_code TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH settings AS (
    SELECT season_settings.principal_slots_count
    FROM public.championship_season_settings AS season_settings
    WHERE season_settings.championship_id = _championship_id
      AND season_settings.season_year = _season_year
      AND season_settings.division_format = 'UNIFIED'::public.championship_season_division_format
      AND season_settings.division_settlement_mode = 'TOP_N_TO_PRINCIPAL'::public.championship_season_division_settlement_mode
      AND COALESCE(season_settings.principal_slots_count, 0) > 0
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
  ), ranked AS (
    SELECT
      standings_table.team_id,
      standings_table.team_name,
      teams_table.division AS previous_division,
      ROW_NUMBER() OVER (
        ORDER BY
          standings_table.overall_points DESC,
          resolved_ties.draw_order ASC NULLS LAST,
          standings_table.team_name ASC
      )::INTEGER AS ranking_position,
      settings.principal_slots_count
    FROM settings
    CROSS JOIN LATERAL public.get_interlaje_overall_standings(
      _championship_id,
      _season_year
    ) AS standings_table
    JOIN public.teams AS teams_table
      ON teams_table.id = standings_table.team_id
    LEFT JOIN resolved_ties
      ON resolved_ties.team_id = standings_table.team_id
      AND resolved_ties.points_total = standings_table.overall_points
  ), planned AS (
    SELECT
      ranked.*,
      CASE
        WHEN ranked.ranking_position <= ranked.principal_slots_count
          THEN 'DIVISAO_PRINCIPAL'::public.team_division
        ELSE 'DIVISAO_ACESSO'::public.team_division
      END AS desired_division
    FROM ranked
  )
  SELECT
    planned.team_id,
    planned.team_name,
    planned.previous_division,
    planned.desired_division AS next_division,
    planned.previous_division AS source_division,
    planned.ranking_position,
    'TOP_N_TO_PRINCIPAL'::TEXT AS rule_code
  FROM planned
  WHERE planned.previous_division IS DISTINCT FROM planned.desired_division
  ORDER BY planned.ranking_position;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_interlaje_season_divisions(
  _championship_id UUID,
  _season_year INTEGER,
  _confirmed_by UUID DEFAULT auth.uid()
)
RETURNS TABLE(
  team_id UUID,
  team_name TEXT,
  previous_division public.team_division,
  next_division public.team_division,
  source_division public.team_division,
  ranking_position INTEGER,
  rule_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  championship_record RECORD;
  settings_record RECORD;
BEGIN
  SELECT championships_table.code, championships_table.status
  INTO championship_record
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id
  LIMIT 1;

  IF championship_record.code IS DISTINCT FROM 'INTERLAJE'::public.championship_code THEN
    RAISE EXCEPTION 'O fechamento Top N é exclusivo do INTERLAJE.';
  END IF;

  IF championship_record.status IS DISTINCT FROM 'FINISHED'::public.championship_status THEN
    RAISE EXCEPTION 'O INTERLAJE precisa estar encerrado antes da movimentação de divisões.';
  END IF;

  SELECT *
  INTO settings_record
  FROM public.championship_season_settings AS season_settings
  WHERE season_settings.championship_id = _championship_id
    AND season_settings.season_year = _season_year
  LIMIT 1;

  IF settings_record.division_format IS DISTINCT FROM 'UNIFIED'::public.championship_season_division_format
    OR settings_record.division_settlement_mode IS DISTINCT FROM 'TOP_N_TO_PRINCIPAL'::public.championship_season_division_settlement_mode
    OR COALESCE(settings_record.principal_slots_count, 0) <= 0
  THEN
    RAISE EXCEPTION 'A temporada não está configurada como UNIFIED + TOP_N_TO_PRINCIPAL.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.matches AS matches_table
    WHERE matches_table.championship_id = _championship_id
      AND matches_table.season_year = _season_year
      AND matches_table.status <> 'FINISHED'::public.match_status
  ) THEN
    RAISE EXCEPTION 'Ainda existem partidas coletivas não finalizadas.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.championship_individual_sessions AS sessions_table
    WHERE sessions_table.championship_id = _championship_id
      AND sessions_table.season_year = _season_year
      AND sessions_table.status NOT IN (
        'FINISHED'::public.championship_individual_session_status,
        'CANCELLED'::public.championship_individual_session_status
      )
  ) THEN
    RAISE EXCEPTION 'Ainda existem sessões de modalidades individuais não finalizadas.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.get_interlaje_overall_standings(
      _championship_id,
      _season_year
    ) AS standings_table
    WHERE standings_table.has_projected_placement_points
       OR standings_table.has_pending_tie_break
  ) THEN
    RAISE EXCEPTION 'A classificação geral ainda possui projeções ou desempates pendentes.';
  END IF;

  DELETE FROM public.championship_season_division_movements AS movements_table
  WHERE movements_table.championship_id = _championship_id
    AND movements_table.season_year = _season_year;

  INSERT INTO public.championship_season_division_movements (
    championship_id,
    season_year,
    team_id,
    previous_division,
    next_division,
    source_division,
    ranking_position,
    rule_code,
    confirmed_by,
    confirmed_at
  )
  SELECT
    _championship_id,
    _season_year,
    preview.team_id,
    preview.previous_division,
    preview.next_division,
    preview.source_division,
    preview.ranking_position,
    preview.rule_code,
    _confirmed_by,
    timezone('utc', now())
  FROM public.get_interlaje_season_division_preview(
    _championship_id,
    _season_year
  ) AS preview;

  UPDATE public.teams AS teams_table
  SET division = movements_table.next_division
  FROM public.championship_season_division_movements AS movements_table
  WHERE movements_table.championship_id = _championship_id
    AND movements_table.season_year = _season_year
    AND movements_table.team_id = teams_table.id
    AND teams_table.division IS DISTINCT FROM movements_table.next_division;

  RETURN QUERY
  SELECT
    movements_table.team_id,
    teams_table.name,
    movements_table.previous_division,
    movements_table.next_division,
    movements_table.source_division,
    movements_table.ranking_position,
    movements_table.rule_code
  FROM public.championship_season_division_movements AS movements_table
  JOIN public.teams AS teams_table
    ON teams_table.id = movements_table.team_id
  WHERE movements_table.championship_id = _championship_id
    AND movements_table.season_year = _season_year
  ORDER BY movements_table.ranking_position;
END;
$function$;

-- Restaura a configuração planejada e já gravada no snapshot da edição 2026:
-- campeonato unificado, 12 vagas na Divisão Principal.
UPDATE public.championship_season_settings AS season_settings
SET
  division_format = 'UNIFIED'::public.championship_season_division_format,
  division_settlement_mode = 'TOP_N_TO_PRINCIPAL'::public.championship_season_division_settlement_mode,
  principal_slots_count = 12,
  principal_relegation_count = NULL,
  access_promotion_count = NULL,
  updated_at = timezone('utc', now())
FROM public.championships AS championships_table
WHERE championships_table.id = season_settings.championship_id
  AND championships_table.code = 'INTERLAJE'::public.championship_code
  AND season_settings.season_year = championships_table.current_season_year;

REVOKE ALL ON FUNCTION public.resolve_interlaje_match_winner(UUID, UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_interlaje_match_winner(UUID, UUID, UUID, UUID)
  TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_interlaje_knockout_final_placements(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_interlaje_knockout_final_placements(UUID, JSONB)
  TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_interlaje_regulation_competition_standings(UUID, INTEGER, UUID, public.match_naipe, public.team_division) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_interlaje_regulation_competition_standings(UUID, INTEGER, UUID, public.match_naipe, public.team_division)
  TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_interlaje_overall_standings(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_interlaje_overall_standings(UUID, INTEGER)
  TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_interlaje_season_division_preview(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_interlaje_season_division_preview(UUID, INTEGER)
  TO authenticated;

REVOKE ALL ON FUNCTION public.finalize_interlaje_season_divisions(UUID, INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_interlaje_season_divisions(UUID, INTEGER, UUID)
  TO authenticated;

COMMENT ON FUNCTION public.get_interlaje_knockout_final_placements(UUID, JSONB) IS
  'LAJE-103: reserva as posições do mata-mata e encadeia 1º-8º pela posição final de quem eliminou cada atlética.';

COMMENT ON FUNCTION public.get_interlaje_regulation_competition_standings(UUID, INTEGER, UUID, public.match_naipe, public.team_division) IS
  'LAJE-103: classificação final oficial por modalidade/naipe do INTERLAJE. A classificação de grupos permanece separada.';

COMMENT ON FUNCTION public.finalize_interlaje_season_divisions(UUID, INTEGER, UUID) IS
  'LAJE-103: fechamento transacional da temporada unificada usando a classificação geral oficial do INTERLAJE.';

-- A política classificatória do Basquetebol do INTERLAJE permanece deliberadamente
-- com POINTS_AVERAGE após a pontuação proporcional na comparação de melhores
-- colocados entre grupos. A função de qualification pool já aplica essa exceção
-- (UEFA 58/50 = 1,16 > GARRUDOS 66/58 = 1,1379 no cenário 2026).

NOTIFY pgrst, 'reload schema';
