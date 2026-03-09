CREATE OR REPLACE FUNCTION public.sync_championship_bracket_edition_status(_bracket_edition_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.championship_bracket_editions AS editions_table
  SET
    status = CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.championship_bracket_matches AS bracket_matches_table
        WHERE bracket_matches_table.bracket_edition_id = editions_table.id
          AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      ) THEN 'KNOCKOUT_GENERATED'::public.bracket_edition_status
      WHEN EXISTS (
        SELECT 1
        FROM public.championship_bracket_matches AS bracket_matches_table
        JOIN public.matches AS matches_table
          ON matches_table.id = bracket_matches_table.match_id
        WHERE bracket_matches_table.bracket_edition_id = editions_table.id
          AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
      ) THEN 'GROUPS_GENERATED'::public.bracket_edition_status
      ELSE 'DRAFT'::public.bracket_edition_status
    END,
    updated_at = now()
  WHERE editions_table.id = _bracket_edition_id;
END;
$$;

COMMENT ON FUNCTION public.sync_championship_bracket_edition_status(UUID) IS 'Sincroniza o status da edição do chaveamento conforme partidas de grupos e mata-mata existentes.';

CREATE OR REPLACE FUNCTION public.resolve_championship_bracket_match_loser_team_id(_bracket_match_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  loser_team_id UUID;
BEGIN
  SELECT
    CASE
      WHEN bracket_matches_table.winner_team_id = bracket_matches_table.home_team_id THEN bracket_matches_table.away_team_id
      WHEN bracket_matches_table.winner_team_id = bracket_matches_table.away_team_id THEN bracket_matches_table.home_team_id
      ELSE NULL
    END
  INTO loser_team_id
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.id = _bracket_match_id
  LIMIT 1;

  RETURN loser_team_id;
END;
$$;

COMMENT ON FUNCTION public.resolve_championship_bracket_match_loser_team_id(UUID) IS 'Retorna o perdedor do confronto de mata-mata a partir do vencedor já consolidado no bracket.';

CREATE OR REPLACE FUNCTION public.create_championship_knockout_match_schedule(
  _championship_id UUID,
  _bracket_match_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bracket_match_record RECORD;
  round_duration_minutes INTEGER;
  selected_slot_start TIMESTAMPTZ;
  selected_slot_end TIMESTAMPTZ;
  selected_slot_location_name TEXT;
  selected_slot_court_name TEXT;
  new_match_id UUID;
BEGIN
  SELECT
    bracket_matches_table.id,
    bracket_matches_table.bracket_edition_id,
    bracket_matches_table.match_id,
    bracket_matches_table.home_team_id,
    bracket_matches_table.away_team_id,
    competitions_table.division,
    competitions_table.naipe,
    competitions_table.sport_id
  INTO bracket_match_record
  FROM public.championship_bracket_matches AS bracket_matches_table
  JOIN public.championship_bracket_competitions AS competitions_table
    ON competitions_table.id = bracket_matches_table.competition_id
  WHERE bracket_matches_table.id = _bracket_match_id
  LIMIT 1;

  IF bracket_match_record.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF bracket_match_record.match_id IS NOT NULL THEN
    RETURN bracket_match_record.match_id;
  END IF;

  IF bracket_match_record.home_team_id IS NULL OR bracket_match_record.away_team_id IS NULL THEN
    RETURN NULL;
  END IF;

  round_duration_minutes := public.resolve_championship_sport_duration_minutes(
    _championship_id,
    bracket_match_record.sport_id
  );

  SELECT
    slots_table.slot_start,
    slots_table.slot_start + make_interval(mins => round_duration_minutes),
    slots_table.location_name,
    slots_table.court_name
  INTO
    selected_slot_start,
    selected_slot_end,
    selected_slot_location_name,
    selected_slot_court_name
  FROM (
    SELECT
      slot_start.value AS slot_start,
      ((days_table.event_date::text || ' ' || days_table.end_time::text)::timestamp AT TIME ZONE 'America/Sao_Paulo') AS day_end,
      locations_table.name AS location_name,
      courts_table.name AS court_name,
      court_sports_table.sport_id
    FROM public.championship_bracket_days AS days_table
    JOIN public.championship_bracket_locations AS locations_table
      ON locations_table.bracket_day_id = days_table.id
    JOIN public.championship_bracket_courts AS courts_table
      ON courts_table.bracket_location_id = locations_table.id
    JOIN public.championship_bracket_court_sports AS court_sports_table
      ON court_sports_table.bracket_court_id = courts_table.id
    CROSS JOIN LATERAL generate_series(
      ((days_table.event_date::text || ' ' || days_table.start_time::text)::timestamp AT TIME ZONE 'America/Sao_Paulo'),
      ((days_table.event_date::text || ' ' || days_table.end_time::text)::timestamp AT TIME ZONE 'America/Sao_Paulo'),
      interval '5 minutes'
    ) AS slot_start(value)
    WHERE days_table.bracket_edition_id = bracket_match_record.bracket_edition_id
  ) AS slots_table
  WHERE slots_table.sport_id = bracket_match_record.sport_id
    AND slots_table.slot_start + make_interval(mins => round_duration_minutes) <= slots_table.day_end
    AND NOT EXISTS (
      SELECT 1
      FROM public.matches AS matches_table
      WHERE matches_table.location = slots_table.location_name
        AND COALESCE(matches_table.court_name, '') = COALESCE(slots_table.court_name, '')
        AND matches_table.start_time < slots_table.slot_start + make_interval(mins => round_duration_minutes)
        AND matches_table.end_time > slots_table.slot_start
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.matches AS matches_table
      WHERE matches_table.championship_id = _championship_id
        AND (
          matches_table.home_team_id IN (bracket_match_record.home_team_id, bracket_match_record.away_team_id)
          OR matches_table.away_team_id IN (bracket_match_record.home_team_id, bracket_match_record.away_team_id)
        )
        AND matches_table.start_time < slots_table.slot_start + make_interval(mins => round_duration_minutes + 15)
        AND matches_table.end_time > slots_table.slot_start - interval '15 minutes'
    )
  ORDER BY slots_table.slot_start ASC
  LIMIT 1;

  IF selected_slot_start IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.matches (
    championship_id,
    division,
    naipe,
    sport_id,
    home_team_id,
    away_team_id,
    location,
    court_name,
    start_time,
    end_time,
    status
  ) VALUES (
    _championship_id,
    bracket_match_record.division,
    bracket_match_record.naipe,
    bracket_match_record.sport_id,
    bracket_match_record.home_team_id,
    bracket_match_record.away_team_id,
    selected_slot_location_name,
    selected_slot_court_name,
    selected_slot_start,
    selected_slot_end,
    'SCHEDULED'::public.match_status
  )
  RETURNING id INTO new_match_id;

  UPDATE public.championship_bracket_matches
  SET match_id = new_match_id
  WHERE id = _bracket_match_id;

  RETURN new_match_id;
END;
$$;

COMMENT ON FUNCTION public.create_championship_knockout_match_schedule(UUID, UUID) IS 'Cria o jogo real do mata-mata quando o confronto já tem os dois lados definidos e há horário disponível.';

CREATE OR REPLACE FUNCTION public.generate_championship_knockout_for_competition(
  _championship_id UUID,
  _competition_id UUID,
  _bracket_edition_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bracket_edition_id UUID;
  competition_record RECORD;
  ranking_record RECORD;
  qualified_team_ids UUID[];
  qualified_team_count INTEGER;
  group_count_value INTEGER;
  target_bracket_size INTEGER;
  bracket_size INTEGER;
  total_rounds INTEGER;
  round_number INTEGER;
  slot_index INTEGER;
  home_seed_index INTEGER;
  away_seed_index INTEGER;
  home_team_id UUID;
  away_team_id UUID;
  round_match_ids UUID[];
  next_round_match_ids UUID[];
  semifinal_match_ids UUID[];
  source_home_bracket_match_id UUID;
  source_away_bracket_match_id UUID;
  source_home_winner_team_id UUID;
  source_away_winner_team_id UUID;
  bracket_match_id UUID;
  third_place_mode_value public.bracket_third_place_mode;
BEGIN
  SELECT
    competitions_table.id,
    competitions_table.bracket_edition_id,
    competitions_table.sport_id,
    competitions_table.naipe,
    competitions_table.division,
    competitions_table.qualifiers_per_group,
    competitions_table.third_place_mode
  INTO competition_record
  FROM public.championship_bracket_competitions AS competitions_table
  WHERE competitions_table.id = _competition_id
    AND (_bracket_edition_id IS NULL OR competitions_table.bracket_edition_id = _bracket_edition_id)
  LIMIT 1;

  IF competition_record.id IS NULL THEN
    RETURN NULL;
  END IF;

  bracket_edition_id := competition_record.bracket_edition_id;

  IF EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
  ) THEN
    RETURN _competition_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
      AND matches_table.status != 'FINISHED'::public.match_status
  ) THEN
    RETURN _competition_id;
  END IF;

  qualified_team_ids := ARRAY[]::UUID[];
  group_count_value := 0;
  target_bracket_size := 1;

  SELECT count(*)
  INTO group_count_value
  FROM public.championship_bracket_groups AS groups_table
  WHERE groups_table.competition_id = _competition_id;

  IF group_count_value < 2 THEN
    RETURN _competition_id;
  END IF;

  WHILE target_bracket_size < group_count_value LOOP
    target_bracket_size := target_bracket_size * 2;
  END LOOP;

  FOR ranking_record IN
    WITH points_config AS (
      SELECT
        championship_sports_table.points_win,
        championship_sports_table.points_draw,
        championship_sports_table.points_loss
      FROM public.championship_sports AS championship_sports_table
      WHERE championship_sports_table.championship_id = _championship_id
        AND championship_sports_table.sport_id = competition_record.sport_id
      LIMIT 1
    ),
    group_team_scores AS (
      SELECT
        bracket_matches_table.group_id,
        matches_table.home_team_id AS team_id,
        matches_table.home_score AS goals_for,
        matches_table.away_score AS goals_against,
        CASE
          WHEN matches_table.home_score > matches_table.away_score THEN COALESCE((SELECT points_win FROM points_config), 3)
          WHEN matches_table.home_score = matches_table.away_score THEN COALESCE((SELECT points_draw FROM points_config), 1)
          ELSE COALESCE((SELECT points_loss FROM points_config), 0)
        END AS points,
        CASE WHEN matches_table.home_score > matches_table.away_score THEN 1 ELSE 0 END AS wins
      FROM public.championship_bracket_matches AS bracket_matches_table
      JOIN public.matches AS matches_table
        ON matches_table.id = bracket_matches_table.match_id
      WHERE bracket_matches_table.competition_id = _competition_id
        AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase

      UNION ALL

      SELECT
        bracket_matches_table.group_id,
        matches_table.away_team_id AS team_id,
        matches_table.away_score AS goals_for,
        matches_table.home_score AS goals_against,
        CASE
          WHEN matches_table.away_score > matches_table.home_score THEN COALESCE((SELECT points_win FROM points_config), 3)
          WHEN matches_table.away_score = matches_table.home_score THEN COALESCE((SELECT points_draw FROM points_config), 1)
          ELSE COALESCE((SELECT points_loss FROM points_config), 0)
        END AS points,
        CASE WHEN matches_table.away_score > matches_table.home_score THEN 1 ELSE 0 END AS wins
      FROM public.championship_bracket_matches AS bracket_matches_table
      JOIN public.matches AS matches_table
        ON matches_table.id = bracket_matches_table.match_id
      WHERE bracket_matches_table.competition_id = _competition_id
        AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
    ),
    group_ranking AS (
      SELECT
        group_team_scores.group_id,
        group_team_scores.team_id,
        sum(group_team_scores.points) AS points,
        sum(group_team_scores.wins) AS wins,
        sum(group_team_scores.goals_for - group_team_scores.goals_against) AS goal_diff,
        sum(group_team_scores.goals_for) AS goals_for
      FROM group_team_scores
      GROUP BY group_team_scores.group_id, group_team_scores.team_id
    ),
    ranked AS (
      SELECT
        group_ranking.group_id,
        group_ranking.team_id,
        group_ranking.points,
        group_ranking.wins,
        group_ranking.goal_diff,
        group_ranking.goals_for,
        teams_table.name AS team_name,
        row_number() OVER (
          PARTITION BY group_ranking.group_id
          ORDER BY group_ranking.points DESC, group_ranking.wins DESC, group_ranking.goal_diff DESC, group_ranking.goals_for DESC, teams_table.name ASC
        ) AS team_rank,
        groups_table.group_number
      FROM group_ranking
      JOIN public.championship_bracket_groups AS groups_table
        ON groups_table.id = group_ranking.group_id
      JOIN public.teams AS teams_table
        ON teams_table.id = group_ranking.team_id
    )
    SELECT
      ranked.team_id,
      ranked.group_number,
      ranked.team_rank
    FROM ranked
    WHERE ranked.team_rank = 1
    ORDER BY ranked.group_number ASC
  LOOP
    qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
  END LOOP;

  IF COALESCE(cardinality(qualified_team_ids), 0) < target_bracket_size THEN
    FOR ranking_record IN
      WITH points_config AS (
        SELECT
          championship_sports_table.points_win,
          championship_sports_table.points_draw,
          championship_sports_table.points_loss
        FROM public.championship_sports AS championship_sports_table
        WHERE championship_sports_table.championship_id = _championship_id
          AND championship_sports_table.sport_id = competition_record.sport_id
        LIMIT 1
      ),
      group_team_scores AS (
        SELECT
          bracket_matches_table.group_id,
          matches_table.home_team_id AS team_id,
          matches_table.home_score AS goals_for,
          matches_table.away_score AS goals_against,
          CASE
            WHEN matches_table.home_score > matches_table.away_score THEN COALESCE((SELECT points_win FROM points_config), 3)
            WHEN matches_table.home_score = matches_table.away_score THEN COALESCE((SELECT points_draw FROM points_config), 1)
            ELSE COALESCE((SELECT points_loss FROM points_config), 0)
          END AS points,
          CASE WHEN matches_table.home_score > matches_table.away_score THEN 1 ELSE 0 END AS wins
        FROM public.championship_bracket_matches AS bracket_matches_table
        JOIN public.matches AS matches_table
          ON matches_table.id = bracket_matches_table.match_id
        WHERE bracket_matches_table.competition_id = _competition_id
          AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase

        UNION ALL

        SELECT
          bracket_matches_table.group_id,
          matches_table.away_team_id AS team_id,
          matches_table.away_score AS goals_for,
          matches_table.home_score AS goals_against,
          CASE
            WHEN matches_table.away_score > matches_table.home_score THEN COALESCE((SELECT points_win FROM points_config), 3)
            WHEN matches_table.away_score = matches_table.home_score THEN COALESCE((SELECT points_draw FROM points_config), 1)
            ELSE COALESCE((SELECT points_loss FROM points_config), 0)
          END AS points,
          CASE WHEN matches_table.away_score > matches_table.home_score THEN 1 ELSE 0 END AS wins
        FROM public.championship_bracket_matches AS bracket_matches_table
        JOIN public.matches AS matches_table
          ON matches_table.id = bracket_matches_table.match_id
        WHERE bracket_matches_table.competition_id = _competition_id
          AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
      ),
      group_ranking AS (
        SELECT
          group_team_scores.group_id,
          group_team_scores.team_id,
          sum(group_team_scores.points) AS points,
          sum(group_team_scores.wins) AS wins,
          sum(group_team_scores.goals_for - group_team_scores.goals_against) AS goal_diff,
          sum(group_team_scores.goals_for) AS goals_for
        FROM group_team_scores
        GROUP BY group_team_scores.group_id, group_team_scores.team_id
      ),
      ranked AS (
        SELECT
          group_ranking.group_id,
          group_ranking.team_id,
          group_ranking.points,
          group_ranking.wins,
          group_ranking.goal_diff,
          group_ranking.goals_for,
          teams_table.name AS team_name,
          row_number() OVER (
            PARTITION BY group_ranking.group_id
            ORDER BY group_ranking.points DESC, group_ranking.wins DESC, group_ranking.goal_diff DESC, group_ranking.goals_for DESC, teams_table.name ASC
          ) AS team_rank,
          groups_table.group_number
        FROM group_ranking
        JOIN public.championship_bracket_groups AS groups_table
          ON groups_table.id = group_ranking.group_id
        JOIN public.teams AS teams_table
          ON teams_table.id = group_ranking.team_id
      )
      SELECT
        ranked.team_id,
        ranked.team_rank,
        ranked.points,
        ranked.wins,
        ranked.goal_diff,
        ranked.goals_for,
        ranked.team_name
      FROM ranked
      WHERE ranked.team_rank >= 2
        AND ranked.team_rank <= GREATEST(2, competition_record.qualifiers_per_group)
      ORDER BY
        ranked.team_rank ASC,
        ranked.points DESC,
        ranked.wins DESC,
        ranked.goal_diff DESC,
        ranked.goals_for DESC,
        ranked.team_name ASC
    LOOP
      EXIT WHEN COALESCE(cardinality(qualified_team_ids), 0) >= target_bracket_size;

      IF NOT ranking_record.team_id = ANY(qualified_team_ids) THEN
        qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
      END IF;
    END LOOP;
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

  total_rounds := 1;

  WHILE power(2, total_rounds) < bracket_size LOOP
    total_rounds := total_rounds + 1;
  END LOOP;

  round_match_ids := ARRAY[]::UUID[];
  semifinal_match_ids := ARRAY[]::UUID[];
  third_place_mode_value := competition_record.third_place_mode;

  FOR slot_index IN 1..(bracket_size / 2)
  LOOP
    home_seed_index := slot_index;
    away_seed_index := bracket_size - slot_index + 1;
    home_team_id := qualified_team_ids[home_seed_index];
    away_team_id := qualified_team_ids[away_seed_index];

    IF home_team_id IS NULL AND away_team_id IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.championship_bracket_matches (
      bracket_edition_id,
      competition_id,
      phase,
      round_number,
      slot_number,
      home_team_id,
      away_team_id,
      winner_team_id,
      is_bye
    ) VALUES (
      bracket_edition_id,
      _competition_id,
      'KNOCKOUT'::public.bracket_phase,
      1,
      slot_index,
      home_team_id,
      away_team_id,
      CASE
        WHEN home_team_id IS NULL AND away_team_id IS NOT NULL THEN away_team_id
        WHEN away_team_id IS NULL AND home_team_id IS NOT NULL THEN home_team_id
        ELSE NULL
      END,
      CASE
        WHEN home_team_id IS NULL AND away_team_id IS NULL THEN false
        WHEN home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN false
        ELSE true
      END
    )
    RETURNING id INTO bracket_match_id;

    IF home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN
      PERFORM public.create_championship_knockout_match_schedule(_championship_id, bracket_match_id);
    END IF;

    round_match_ids := array_append(round_match_ids, bracket_match_id);
  END LOOP;

  IF total_rounds > 1 THEN
    FOR round_number IN 2..total_rounds
    LOOP
      IF round_number = total_rounds THEN
        semifinal_match_ids := round_match_ids;
      END IF;

      next_round_match_ids := ARRAY[]::UUID[];

      FOR slot_index IN 1..(COALESCE(cardinality(round_match_ids), 0) / 2)
      LOOP
        source_home_bracket_match_id := round_match_ids[(slot_index * 2) - 1];
        source_away_bracket_match_id := round_match_ids[(slot_index * 2)];
        source_home_winner_team_id := NULL;
        source_away_winner_team_id := NULL;
        home_team_id := NULL;
        away_team_id := NULL;

        SELECT bracket_matches_table.winner_team_id
        INTO source_home_winner_team_id
        FROM public.championship_bracket_matches AS bracket_matches_table
        WHERE bracket_matches_table.id = source_home_bracket_match_id
        LIMIT 1;

        SELECT bracket_matches_table.winner_team_id
        INTO source_away_winner_team_id
        FROM public.championship_bracket_matches AS bracket_matches_table
        WHERE bracket_matches_table.id = source_away_bracket_match_id
        LIMIT 1;

        home_team_id := source_home_winner_team_id;
        away_team_id := source_away_winner_team_id;

        INSERT INTO public.championship_bracket_matches (
          bracket_edition_id,
          competition_id,
          phase,
          round_number,
          slot_number,
          home_team_id,
          away_team_id,
          winner_team_id,
          source_home_bracket_match_id,
          source_away_bracket_match_id,
          is_bye
        ) VALUES (
          bracket_edition_id,
          _competition_id,
          'KNOCKOUT'::public.bracket_phase,
          round_number,
          slot_index,
          home_team_id,
          away_team_id,
          CASE
            WHEN home_team_id IS NULL AND away_team_id IS NOT NULL THEN away_team_id
            WHEN away_team_id IS NULL AND home_team_id IS NOT NULL THEN home_team_id
            ELSE NULL
          END,
          source_home_bracket_match_id,
          source_away_bracket_match_id,
          CASE
            WHEN home_team_id IS NULL AND away_team_id IS NULL THEN false
            WHEN home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN false
            ELSE true
          END
        )
        RETURNING id INTO bracket_match_id;

        UPDATE public.championship_bracket_matches
        SET next_bracket_match_id = bracket_match_id
        WHERE id = source_home_bracket_match_id;

        UPDATE public.championship_bracket_matches
        SET next_bracket_match_id = bracket_match_id
        WHERE id = source_away_bracket_match_id;

        IF home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN
          PERFORM public.create_championship_knockout_match_schedule(_championship_id, bracket_match_id);
        END IF;

        next_round_match_ids := array_append(next_round_match_ids, bracket_match_id);
      END LOOP;

      round_match_ids := next_round_match_ids;
    END LOOP;
  END IF;

  IF third_place_mode_value = 'MATCH'::public.bracket_third_place_mode
    AND COALESCE(cardinality(semifinal_match_ids), 0) = 2 THEN
    INSERT INTO public.championship_bracket_matches (
      bracket_edition_id,
      competition_id,
      phase,
      round_number,
      slot_number,
      source_home_bracket_match_id,
      source_away_bracket_match_id,
      is_third_place
    ) VALUES (
      bracket_edition_id,
      _competition_id,
      'KNOCKOUT'::public.bracket_phase,
      total_rounds,
      2,
      semifinal_match_ids[1],
      semifinal_match_ids[2],
      true
    );
  END IF;

  PERFORM public.sync_championship_bracket_edition_status(bracket_edition_id);

  RETURN _competition_id;
END;
$$;

COMMENT ON FUNCTION public.generate_championship_knockout_for_competition(UUID, UUID, UUID) IS 'Gera o mata-mata automaticamente apenas para a competição/modalidade que concluiu a fase de grupos.';

CREATE OR REPLACE FUNCTION public.generate_championship_knockout(
  _championship_id UUID,
  _bracket_edition_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bracket_edition_id UUID;
  competition_record RECORD;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para gerar mata-mata.';
  END IF;

  IF _bracket_edition_id IS NULL THEN
    SELECT editions_table.id
    INTO bracket_edition_id
    FROM public.championship_bracket_editions AS editions_table
    WHERE editions_table.championship_id = _championship_id
    ORDER BY editions_table.created_at DESC
    LIMIT 1;
  ELSE
    bracket_edition_id := _bracket_edition_id;
  END IF;

  IF bracket_edition_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma edição de chaveamento encontrada para este campeonato.';
  END IF;

  FOR competition_record IN
    SELECT competitions_table.id
    FROM public.championship_bracket_competitions AS competitions_table
    WHERE competitions_table.bracket_edition_id = bracket_edition_id
    ORDER BY competitions_table.created_at ASC
  LOOP
    PERFORM public.generate_championship_knockout_for_competition(
      _championship_id,
      competition_record.id,
      bracket_edition_id
    );
  END LOOP;

  PERFORM public.sync_championship_bracket_edition_status(bracket_edition_id);

  RETURN bracket_edition_id;
END;
$$;

COMMENT ON FUNCTION public.generate_championship_knockout(UUID, UUID) IS 'Wrapper manual para gerar o mata-mata pendente por competição, preservando a automação por modalidade.';

CREATE OR REPLACE FUNCTION public.propagate_championship_knockout_progress(_match_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_bracket_match RECORD;
  resolved_winner_team_id UUID;
  next_bracket_match_record RECORD;
  next_home_team_id UUID;
  next_away_team_id UUID;
  next_is_bye BOOLEAN;
  third_place_bracket_match_record RECORD;
  third_place_home_team_id UUID;
  third_place_away_team_id UUID;
BEGIN
  SELECT
    bracket_matches_table.id,
    bracket_matches_table.bracket_edition_id,
    bracket_matches_table.competition_id,
    bracket_matches_table.match_id,
    bracket_matches_table.home_team_id,
    bracket_matches_table.away_team_id,
    bracket_matches_table.next_bracket_match_id
  INTO current_bracket_match
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.match_id = _match_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
  LIMIT 1;

  IF current_bracket_match.id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    CASE
      WHEN matches_table.home_score > matches_table.away_score THEN matches_table.home_team_id
      WHEN matches_table.away_score > matches_table.home_score THEN matches_table.away_team_id
      ELSE NULL
    END
  INTO resolved_winner_team_id
  FROM public.matches AS matches_table
  WHERE matches_table.id = _match_id
  LIMIT 1;

  IF resolved_winner_team_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.championship_bracket_matches
  SET
    winner_team_id = resolved_winner_team_id,
    is_bye = false
  WHERE id = current_bracket_match.id;

  IF current_bracket_match.next_bracket_match_id IS NOT NULL THEN
    SELECT
      target_bracket_match.id,
      target_bracket_match.home_team_id,
      target_bracket_match.away_team_id,
      target_bracket_match.match_id,
      target_bracket_match.is_bye,
      source_home_bracket_match.winner_team_id AS source_home_winner_team_id,
      source_away_bracket_match.winner_team_id AS source_away_winner_team_id
    INTO next_bracket_match_record
    FROM public.championship_bracket_matches AS target_bracket_match
    LEFT JOIN public.championship_bracket_matches AS source_home_bracket_match
      ON source_home_bracket_match.id = target_bracket_match.source_home_bracket_match_id
    LEFT JOIN public.championship_bracket_matches AS source_away_bracket_match
      ON source_away_bracket_match.id = target_bracket_match.source_away_bracket_match_id
    WHERE target_bracket_match.id = current_bracket_match.next_bracket_match_id
    LIMIT 1;

    IF next_bracket_match_record.id IS NOT NULL THEN
      next_home_team_id := next_bracket_match_record.source_home_winner_team_id;
      next_away_team_id := next_bracket_match_record.source_away_winner_team_id;
      next_is_bye := next_bracket_match_record.is_bye;

      IF next_home_team_id IS NOT NULL AND next_away_team_id IS NOT NULL THEN
        next_is_bye := false;
      END IF;

      UPDATE public.championship_bracket_matches
      SET
        home_team_id = next_home_team_id,
        away_team_id = next_away_team_id,
        winner_team_id = CASE
          WHEN next_home_team_id IS NOT NULL AND next_away_team_id IS NULL AND next_is_bye THEN next_home_team_id
          WHEN next_away_team_id IS NOT NULL AND next_home_team_id IS NULL AND next_is_bye THEN next_away_team_id
          ELSE NULL
        END,
        is_bye = next_is_bye
      WHERE id = next_bracket_match_record.id;

      IF next_home_team_id IS NOT NULL
        AND next_away_team_id IS NOT NULL
        AND next_bracket_match_record.match_id IS NULL THEN
        PERFORM public.create_championship_knockout_match_schedule(
          (
            SELECT editions_table.championship_id
            FROM public.championship_bracket_editions AS editions_table
            WHERE editions_table.id = current_bracket_match.bracket_edition_id
            LIMIT 1
          ),
          next_bracket_match_record.id
        );
      END IF;
    END IF;
  END IF;

  SELECT
    third_place_bracket_match.id,
    third_place_bracket_match.match_id,
    third_place_bracket_match.is_bye
  INTO third_place_bracket_match_record
  FROM public.championship_bracket_matches AS third_place_bracket_match
  WHERE third_place_bracket_match.competition_id = current_bracket_match.competition_id
    AND third_place_bracket_match.phase = 'KNOCKOUT'::public.bracket_phase
    AND third_place_bracket_match.is_third_place = true
    AND (
      third_place_bracket_match.source_home_bracket_match_id = current_bracket_match.id
      OR third_place_bracket_match.source_away_bracket_match_id = current_bracket_match.id
    )
  LIMIT 1;

  IF third_place_bracket_match_record.id IS NOT NULL THEN
    SELECT
      public.resolve_championship_bracket_match_loser_team_id(third_place_bracket_match.source_home_bracket_match_id),
      public.resolve_championship_bracket_match_loser_team_id(third_place_bracket_match.source_away_bracket_match_id)
    INTO third_place_home_team_id, third_place_away_team_id
    FROM public.championship_bracket_matches AS third_place_bracket_match
    WHERE third_place_bracket_match.id = third_place_bracket_match_record.id
    LIMIT 1;

    UPDATE public.championship_bracket_matches
    SET
      home_team_id = third_place_home_team_id,
      away_team_id = third_place_away_team_id,
      is_bye = CASE
        WHEN third_place_home_team_id IS NOT NULL AND third_place_away_team_id IS NOT NULL THEN false
        ELSE third_place_bracket_match_record.is_bye
      END
    WHERE id = third_place_bracket_match_record.id;

    IF third_place_home_team_id IS NOT NULL
      AND third_place_away_team_id IS NOT NULL
      AND third_place_bracket_match_record.match_id IS NULL THEN
      PERFORM public.create_championship_knockout_match_schedule(
        (
          SELECT editions_table.championship_id
          FROM public.championship_bracket_editions AS editions_table
          WHERE editions_table.id = current_bracket_match.bracket_edition_id
          LIMIT 1
        ),
        third_place_bracket_match_record.id
      );
    END IF;
  END IF;

  PERFORM public.sync_championship_bracket_edition_status(current_bracket_match.bracket_edition_id);
END;
$$;

COMMENT ON FUNCTION public.propagate_championship_knockout_progress(UUID) IS 'Atualiza o bracket ao finalizar um jogo do mata-mata, promovendo vencedor e criando próximos jogos automaticamente quando possível.';

CREATE OR REPLACE FUNCTION public.validate_championship_knockout_match_finish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status != 'FINISHED'::public.match_status OR OLD.status = 'FINISHED'::public.match_status THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.match_id = NEW.id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
  ) AND NEW.home_score = NEW.away_score THEN
    RAISE EXCEPTION 'Jogos do mata-mata não podem terminar empatados.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_championship_knockout_match_finish() IS 'Impede que partidas do mata-mata sejam finalizadas com empate.';

CREATE OR REPLACE FUNCTION public.handle_championship_bracket_match_finished()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bracket_match_record RECORD;
BEGIN
  IF NEW.status != 'FINISHED'::public.match_status OR OLD.status = 'FINISHED'::public.match_status THEN
    RETURN NEW;
  END IF;

  SELECT
    bracket_matches_table.id,
    bracket_matches_table.bracket_edition_id,
    bracket_matches_table.competition_id,
    bracket_matches_table.phase
  INTO bracket_match_record
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.match_id = NEW.id
  LIMIT 1;

  IF bracket_match_record.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF bracket_match_record.phase = 'GROUP_STAGE'::public.bracket_phase THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.championship_bracket_matches AS pending_group_matches
      JOIN public.matches AS matches_table
        ON matches_table.id = pending_group_matches.match_id
      WHERE pending_group_matches.competition_id = bracket_match_record.competition_id
        AND pending_group_matches.phase = 'GROUP_STAGE'::public.bracket_phase
        AND matches_table.status != 'FINISHED'::public.match_status
    ) THEN
      PERFORM public.generate_championship_knockout_for_competition(
        NEW.championship_id,
        bracket_match_record.competition_id,
        bracket_match_record.bracket_edition_id
      );
    END IF;

    PERFORM public.sync_championship_bracket_edition_status(bracket_match_record.bracket_edition_id);
    RETURN NEW;
  END IF;

  IF bracket_match_record.phase = 'KNOCKOUT'::public.bracket_phase THEN
    PERFORM public.propagate_championship_knockout_progress(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_championship_bracket_match_finished() IS 'Gera o mata-mata por competição ao fechar as chaves e propaga vencedores automaticamente no bracket.';

DROP TRIGGER IF EXISTS validate_championship_knockout_match_finish_trigger ON public.matches;
CREATE TRIGGER validate_championship_knockout_match_finish_trigger
BEFORE UPDATE OF status ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.validate_championship_knockout_match_finish();

DROP TRIGGER IF EXISTS handle_championship_bracket_match_finished_trigger ON public.matches;
CREATE TRIGGER handle_championship_bracket_match_finished_trigger
AFTER UPDATE OF status ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.handle_championship_bracket_match_finished();

NOTIFY pgrst, 'reload schema';
