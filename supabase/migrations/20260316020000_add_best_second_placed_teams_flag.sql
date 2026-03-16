ALTER TABLE public.championship_bracket_competitions 
  ADD COLUMN IF NOT EXISTS should_complete_knockout_with_best_second_placed_teams BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'championship_bracket_competitions_upsert_unique'
      AND conrelid = 'public.championship_bracket_competitions'::regclass
  ) THEN
    ALTER TABLE public.championship_bracket_competitions
      ADD CONSTRAINT championship_bracket_competitions_upsert_unique 
      UNIQUE (bracket_edition_id, sport_id, naipe, division);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_championship_bracket_competition_qualification_pool_rankings(
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
      competitions_table.qualifiers_per_group,
      competitions_table.should_complete_knockout_with_best_second_placed_teams
    FROM public.championship_bracket_competitions AS competitions_table
    WHERE competitions_table.id = _competition_id
    LIMIT 1
  ),
  group_rankings AS (
    SELECT *
    FROM public.get_championship_bracket_competition_group_rankings(_championship_id, _competition_id)
  ),
  candidate_rows AS (
    SELECT
      group_rankings.competition_id,
      group_rankings.team_id,
      group_rankings.team_name,
      group_rankings.team_rank AS qualification_rank,
      group_rankings.points,
      group_rankings.wins,
      group_rankings.goal_diff,
      group_rankings.goals_for
    FROM group_rankings
    CROSS JOIN competition_context
    WHERE 
      (competition_context.qualifiers_per_group = 1 AND competition_context.should_complete_knockout_with_best_second_placed_teams = true AND group_rankings.team_rank = 2)
  ),
  pool_metric_tie_sets AS (
    SELECT
      candidate_rows.qualification_rank,
      string_agg(candidate_rows.team_id::text, '|' ORDER BY candidate_rows.team_id::text) AS tied_team_signature,
      array_agg(candidate_rows.team_id ORDER BY candidate_rows.team_id::text) AS tied_team_ids
    FROM candidate_rows
    GROUP BY
      candidate_rows.qualification_rank,
      candidate_rows.points,
      candidate_rows.wins,
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
      candidate_rows.points,
      candidate_rows.wins,
      candidate_rows.goal_diff,
      candidate_rows.goals_for,
      row_number() OVER (
        ORDER BY
          candidate_rows.qualification_rank ASC,
          candidate_rows.points DESC,
          candidate_rows.wins DESC,
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

CREATE OR REPLACE FUNCTION public.get_championship_bracket_tie_break_contexts(
  _championship_id UUID,
  _competition_id UUID DEFAULT NULL,
  _bracket_edition_id UUID DEFAULT NULL
)
RETURNS TABLE(
  bracket_edition_id UUID,
  competition_id UUID,
  sport_name TEXT,
  naipe public.match_naipe,
  division public.team_division,
  context_type public.championship_bracket_tie_break_context_type,
  group_id UUID,
  group_number INTEGER,
  qualification_rank INTEGER,
  context_key TEXT,
  tied_team_signature TEXT,
  team_ids UUID[],
  team_names TEXT[],
  title TEXT,
  description TEXT,
  is_resolved BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  WITH edition_context AS (
    SELECT
      COALESCE(
        _bracket_edition_id,
        (
          SELECT editions_table.id
          FROM public.championship_bracket_editions AS editions_table
          WHERE editions_table.championship_id = _championship_id
          ORDER BY editions_table.created_at DESC
          LIMIT 1
        )
      ) AS bracket_edition_id
  ),
  competition_context AS (
    SELECT
      competitions_table.id,
      competitions_table.bracket_edition_id,
      competitions_table.qualifiers_per_group,
      competitions_table.should_complete_knockout_with_best_second_placed_teams,
      competitions_table.naipe,
      competitions_table.division,
      sports_table.name AS sport_name,
      group_counts.group_count,
      CASE
        WHEN (group_counts.group_count * competitions_table.qualifiers_per_group) < 2 THEN 
          (group_counts.group_count * competitions_table.qualifiers_per_group)
        ELSE 
          power(2, ceil(log(2, (group_counts.group_count * competitions_table.qualifiers_per_group)::numeric)))::int
      END AS target_bracket_size
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN edition_context
      ON edition_context.bracket_edition_id = competitions_table.bracket_edition_id
    JOIN public.sports AS sports_table
      ON sports_table.id = competitions_table.sport_id
    JOIN (
      SELECT
        groups_table.competition_id,
        count(*)::int AS group_count
      FROM public.championship_bracket_groups AS groups_table
      GROUP BY groups_table.competition_id
    ) AS group_counts
      ON group_counts.competition_id = competitions_table.id
    WHERE (_competition_id IS NULL OR competitions_table.id = _competition_id)
  ),
  group_rankings AS (
    SELECT
      competition_context.bracket_edition_id,
      competition_context.id AS competition_id,
      competition_context.sport_name,
      competition_context.naipe,
      competition_context.division,
      competition_context.qualifiers_per_group,
      competition_context.should_complete_knockout_with_best_second_placed_teams,
      competition_context.target_bracket_size,
      competition_context.group_count,
      rankings_table.group_id,
      rankings_table.group_number,
      rankings_table.team_id,
      rankings_table.team_name,
      rankings_table.points,
      rankings_table.wins,
      rankings_table.goal_diff,
      rankings_table.goals_for,
      rankings_table.team_rank
    FROM competition_context
    CROSS JOIN LATERAL public.get_championship_bracket_competition_group_rankings(
      _championship_id,
      competition_context.id
    ) AS rankings_table
  ),
  group_tie_sets AS (
    SELECT
      group_rankings.bracket_edition_id,
      group_rankings.competition_id,
      group_rankings.sport_name,
      group_rankings.naipe,
      group_rankings.division,
      group_rankings.qualifiers_per_group,
      group_rankings.should_complete_knockout_with_best_second_placed_teams,
      group_rankings.group_id,
      group_rankings.group_number,
      string_agg(group_rankings.team_id::text, '|' ORDER BY group_rankings.team_id::text) AS tied_team_signature,
      array_agg(group_rankings.team_id ORDER BY group_rankings.team_name ASC) AS team_ids,
      array_agg(group_rankings.team_name ORDER BY group_rankings.team_name ASC) AS team_names,
      min(group_rankings.team_rank)::int AS start_rank,
      max(group_rankings.team_rank)::int AS end_rank
    FROM group_rankings
    GROUP BY
      group_rankings.bracket_edition_id,
      group_rankings.competition_id,
      group_rankings.sport_name,
      group_rankings.naipe,
      group_rankings.division,
      group_rankings.qualifiers_per_group,
      group_rankings.should_complete_knockout_with_best_second_placed_teams,
      group_rankings.group_id,
      group_rankings.group_number,
      group_rankings.points,
      group_rankings.wins,
      group_rankings.goal_diff,
      group_rankings.goals_for
    HAVING count(*) > 1
  ),
  group_contexts AS (
    SELECT
      group_tie_sets.bracket_edition_id,
      group_tie_sets.competition_id,
      group_tie_sets.sport_name,
      group_tie_sets.naipe,
      group_tie_sets.division,
      'GROUP'::public.championship_bracket_tie_break_context_type AS context_type,
      group_tie_sets.group_id,
      group_tie_sets.group_number,
      NULL::integer AS qualification_rank,
      public.build_championship_bracket_tie_break_context_key(
        'GROUP'::public.championship_bracket_tie_break_context_type,
        group_tie_sets.competition_id,
        group_tie_sets.group_id,
        NULL,
        group_tie_sets.tied_team_signature
      ) AS context_key,
      group_tie_sets.tied_team_signature,
      group_tie_sets.team_ids,
      group_tie_sets.team_names,
      CASE
        WHEN group_tie_sets.group_number BETWEEN 1 AND 26
          THEN format('Sorteio manual do Grupo %s', chr(64 + group_tie_sets.group_number))
        ELSE format('Sorteio manual do Grupo %s', group_tie_sets.group_number)
      END AS title,
      format(
        '%s • %s%s. As atléticas seguem empatadas após todos os critérios automáticos que influenciam a classificação do grupo.',
        group_tie_sets.sport_name,
        initcap(lower(group_tie_sets.naipe::text)),
        CASE
          WHEN group_tie_sets.division IS NULL THEN ''
          WHEN group_tie_sets.division = 'DIVISAO_PRINCIPAL'::public.team_division THEN ' • Divisão Principal'
          ELSE ' • Divisão de Acesso'
        END
      ) AS description
    FROM group_tie_sets
    WHERE 
      (group_tie_sets.start_rank <= group_tie_sets.qualifiers_per_group) OR
      (group_tie_sets.qualifiers_per_group = 1 AND group_tie_sets.should_complete_knockout_with_best_second_placed_teams = true AND group_tie_sets.start_rank = 2)
  ),
  qualification_pool_rankings AS (
    SELECT
      competition_context.bracket_edition_id,
      competition_context.id AS competition_id,
      competition_context.sport_name,
      competition_context.naipe,
      competition_context.division,
      GREATEST(competition_context.target_bracket_size - (competition_context.group_count * competition_context.qualifiers_per_group), 0) AS required_additional_qualifiers,
      competition_context.should_complete_knockout_with_best_second_placed_teams,
      pool_rankings_table.team_id,
      pool_rankings_table.team_name,
      pool_rankings_table.qualification_rank,
      pool_rankings_table.points,
      pool_rankings_table.wins,
      pool_rankings_table.goal_diff,
      pool_rankings_table.goals_for,
      pool_rankings_table.pool_rank
    FROM competition_context
    CROSS JOIN LATERAL public.get_championship_bracket_competition_qualification_pool_rankings(
      _championship_id,
      competition_context.id
    ) AS pool_rankings_table
  ),
  qualification_pool_tie_sets AS (
    SELECT
      qualification_pool_rankings.bracket_edition_id,
      qualification_pool_rankings.competition_id,
      qualification_pool_rankings.sport_name,
      qualification_pool_rankings.naipe,
      qualification_pool_rankings.division,
      qualification_pool_rankings.required_additional_qualifiers,
      qualification_pool_rankings.should_complete_knockout_with_best_second_placed_teams,
      qualification_pool_rankings.qualification_rank,
      string_agg(qualification_pool_rankings.team_id::text, '|' ORDER BY qualification_pool_rankings.team_id::text) AS tied_team_signature,
      array_agg(qualification_pool_rankings.team_id ORDER BY qualification_pool_rankings.team_name ASC) AS team_ids,
      array_agg(qualification_pool_rankings.team_name ORDER BY qualification_pool_rankings.team_name ASC) AS team_names,
      min(qualification_pool_rankings.pool_rank)::int AS start_rank,
      max(qualification_pool_rankings.pool_rank)::int AS end_rank
    FROM qualification_pool_rankings
    GROUP BY
      qualification_pool_rankings.bracket_edition_id,
      qualification_pool_rankings.competition_id,
      qualification_pool_rankings.sport_name,
      qualification_pool_rankings.naipe,
      qualification_pool_rankings.division,
      qualification_pool_rankings.required_additional_qualifiers,
      qualification_pool_rankings.should_complete_knockout_with_best_second_placed_teams,
      qualification_pool_rankings.qualification_rank,
      qualification_pool_rankings.points,
      qualification_pool_rankings.wins,
      qualification_pool_rankings.goal_diff,
      qualification_pool_rankings.goals_for
    HAVING count(*) > 1
  ),
  qualification_pool_contexts AS (
    SELECT
      qualification_pool_tie_sets.bracket_edition_id,
      qualification_pool_tie_sets.competition_id,
      qualification_pool_tie_sets.sport_name,
      qualification_pool_tie_sets.naipe,
      qualification_pool_tie_sets.division,
      'QUALIFICATION_POOL'::public.championship_bracket_tie_break_context_type AS context_type,
      NULL::uuid AS group_id,
      NULL::integer AS group_number,
      qualification_pool_tie_sets.qualification_rank,
      public.build_championship_bracket_tie_break_context_key(
        'QUALIFICATION_POOL'::public.championship_bracket_tie_break_context_type,
        qualification_pool_tie_sets.competition_id,
        NULL,
        qualification_pool_tie_sets.qualification_rank,
        qualification_pool_tie_sets.tied_team_signature
      ) AS context_key,
      qualification_pool_tie_sets.tied_team_signature,
      qualification_pool_tie_sets.team_ids,
      qualification_pool_tie_sets.team_names,
      format(
        'Sorteio manual dos melhores %sº colocados',
        qualification_pool_tie_sets.qualification_rank
      ) AS title,
      format(
        '%s • %s%s. As atléticas seguem empatadas na disputa pelas vagas remanescentes do mata-mata.',
        qualification_pool_tie_sets.sport_name,
        initcap(lower(qualification_pool_tie_sets.naipe::text)),
        CASE
          WHEN qualification_pool_tie_sets.division IS NULL THEN ''
          WHEN qualification_pool_tie_sets.division = 'DIVISAO_PRINCIPAL'::public.team_division THEN ' • Divisão Principal'
          ELSE ' • Divisão de Acesso'
        END
      ) AS description
    FROM qualification_pool_tie_sets
    WHERE qualification_pool_tie_sets.required_additional_qualifiers > 0
      AND qualification_pool_tie_sets.start_rank <= qualification_pool_tie_sets.required_additional_qualifiers
      AND qualification_pool_tie_sets.should_complete_knockout_with_best_second_placed_teams = true
  ),
  all_contexts AS (
    SELECT * FROM group_contexts
    UNION ALL
    SELECT * FROM qualification_pool_contexts
  )
  SELECT
    all_contexts.bracket_edition_id,
    all_contexts.competition_id,
    all_contexts.sport_name,
    all_contexts.naipe,
    all_contexts.division,
    all_contexts.context_type,
    all_contexts.group_id,
    all_contexts.group_number,
    all_contexts.qualification_rank,
    all_contexts.context_key,
    all_contexts.tied_team_signature,
    all_contexts.team_ids,
    all_contexts.team_names,
    all_contexts.title,
    all_contexts.description,
    (
      resolutions_table.id IS NOT NULL
      AND (
        SELECT count(*)
        FROM public.championship_bracket_tie_break_resolution_teams AS resolution_teams_table
        WHERE resolution_teams_table.resolution_id = resolutions_table.id
      ) = COALESCE(cardinality(all_contexts.team_ids), 0)
    ) AS is_resolved
  FROM all_contexts
  LEFT JOIN public.championship_bracket_tie_break_resolutions AS resolutions_table
    ON resolutions_table.context_key = all_contexts.context_key;
$func$;

CREATE OR REPLACE FUNCTION public.generate_championship_knockout_for_competition(
  _championship_id UUID,
  _competition_id UUID,
  _bracket_edition_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  bracket_edition_id UUID;
  competition_record RECORD;
  pending_tie_break_record RECORD;
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
    competitions_table.should_complete_knockout_with_best_second_placed_teams,
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

  SELECT count(*)
  INTO group_count_value
  FROM public.championship_bracket_groups AS groups_table
  WHERE groups_table.competition_id = _competition_id;

  IF group_count_value < 2 THEN
    RETURN _competition_id;
  END IF;

  target_bracket_size := 1;
  WHILE target_bracket_size < (group_count_value * competition_record.qualifiers_per_group) LOOP
    target_bracket_size := target_bracket_size * 2;
  END LOOP;

  SELECT contexts_table.*
  INTO pending_tie_break_record
  FROM public.get_championship_bracket_tie_break_contexts(
    _championship_id,
    _competition_id,
    bracket_edition_id
  ) AS contexts_table
  WHERE contexts_table.is_resolved = false
  ORDER BY
    CASE contexts_table.context_type
      WHEN 'GROUP'::public.championship_bracket_tie_break_context_type THEN 1
      ELSE 2
    END,
    contexts_table.group_number ASC NULLS FIRST,
    contexts_table.qualification_rank ASC NULLS FIRST
  LIMIT 1;

  IF pending_tie_break_record.context_key IS NOT NULL THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'SORTEIO_MANUAL_PENDENTE: Resolva %s antes de gerar o mata-mata desta modalidade.',
      pending_tie_break_record.title
    );
  END IF;

  qualified_team_ids := ARRAY[]::UUID[];

  FOR ranking_record IN
    SELECT
      rankings_table.team_id,
      rankings_table.group_number
    FROM public.get_championship_bracket_competition_group_rankings(
      _championship_id,
      _competition_id
    ) AS rankings_table
    WHERE rankings_table.team_rank <= competition_record.qualifiers_per_group
    ORDER BY rankings_table.team_rank ASC, rankings_table.group_number ASC
  LOOP
    qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
  END LOOP;

  IF competition_record.qualifiers_per_group = 1 AND competition_record.should_complete_knockout_with_best_second_placed_teams = true THEN
    IF COALESCE(cardinality(qualified_team_ids), 0) < target_bracket_size THEN
      FOR ranking_record IN
        SELECT
          qualification_pool_rankings.team_id
        FROM public.get_championship_bracket_competition_qualification_pool_rankings(
          _championship_id,
          _competition_id
        ) AS qualification_pool_rankings
        ORDER BY qualification_pool_rankings.pool_rank ASC
      LOOP
        EXIT WHEN COALESCE(cardinality(qualified_team_ids), 0) >= target_bracket_size;

        IF NOT ranking_record.team_id = ANY(qualified_team_ids) THEN
          qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
        END IF;
      END LOOP;
    END IF;
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
    home_seed_index := ((slot_index - 1) * 2) + 1;
    away_seed_index := home_seed_index + 1;
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
$func$;

COMMENT ON FUNCTION public.generate_championship_knockout_for_competition(UUID, UUID, UUID) IS 'Gera o mata-mata automaticamente por competição, respeitando sorteios manuais de desempate quando houver empate total nos critérios automáticos.';

NOTIFY pgrst, 'reload schema';
