DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'championship_bracket_tie_break_context_type'
  ) THEN
    CREATE TYPE public.championship_bracket_tie_break_context_type AS ENUM (
      'GROUP',
      'QUALIFICATION_POOL'
    );
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.validate_championship_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'PLANNING'::public.championship_status
    AND NEW.status IN ('IN_PROGRESS'::public.championship_status, 'FINISHED'::public.championship_status) THEN
    RAISE EXCEPTION 'O campeonato precisa passar por Configurando campeonato antes de ir para Em andamento ou Encerrado.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_championship_status_transition_trigger
ON public.championships;

CREATE TRIGGER validate_championship_status_transition_trigger
BEFORE UPDATE OF status ON public.championships
FOR EACH ROW
EXECUTE FUNCTION public.validate_championship_status_transition();

CREATE TABLE IF NOT EXISTS public.championship_bracket_tie_break_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bracket_edition_id UUID NOT NULL REFERENCES public.championship_bracket_editions(id) ON DELETE CASCADE,
  competition_id UUID NOT NULL REFERENCES public.championship_bracket_competitions(id) ON DELETE CASCADE,
  group_id UUID NULL REFERENCES public.championship_bracket_groups(id) ON DELETE CASCADE,
  context_type public.championship_bracket_tie_break_context_type NOT NULL,
  qualification_rank INTEGER NULL,
  context_key TEXT NOT NULL,
  tied_team_signature TEXT NOT NULL,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS championship_bracket_tie_break_resolutions_context_key_uidx
  ON public.championship_bracket_tie_break_resolutions (context_key);

CREATE TABLE IF NOT EXISTS public.championship_bracket_tie_break_resolution_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resolution_id UUID NOT NULL REFERENCES public.championship_bracket_tie_break_resolutions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  draw_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS championship_bracket_tie_break_resolution_teams_resolution_team_uidx
  ON public.championship_bracket_tie_break_resolution_teams (resolution_id, team_id);

CREATE UNIQUE INDEX IF NOT EXISTS championship_bracket_tie_break_resolution_teams_resolution_order_uidx
  ON public.championship_bracket_tie_break_resolution_teams (resolution_id, draw_order);

CREATE OR REPLACE FUNCTION public.set_championship_bracket_tie_break_tables_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_championship_bracket_tie_break_resolutions_updated_at_trigger
ON public.championship_bracket_tie_break_resolutions;

CREATE TRIGGER set_championship_bracket_tie_break_resolutions_updated_at_trigger
BEFORE UPDATE ON public.championship_bracket_tie_break_resolutions
FOR EACH ROW
EXECUTE FUNCTION public.set_championship_bracket_tie_break_tables_updated_at();

DROP TRIGGER IF EXISTS set_championship_bracket_tie_break_resolution_teams_updated_at_trigger
ON public.championship_bracket_tie_break_resolution_teams;

CREATE TRIGGER set_championship_bracket_tie_break_resolution_teams_updated_at_trigger
BEFORE UPDATE ON public.championship_bracket_tie_break_resolution_teams
FOR EACH ROW
EXECUTE FUNCTION public.set_championship_bracket_tie_break_tables_updated_at();

DO $$
DECLARE
  table_name TEXT;
  tables_to_secure TEXT[] := ARRAY[
    'championship_bracket_tie_break_resolutions',
    'championship_bracket_tie_break_resolution_teams'
  ];
BEGIN
  FOREACH table_name IN ARRAY tables_to_secure
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = format('Admin can view %s', table_name)
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_admin_tab_access(''matches''::public.admin_panel_tab, false))',
        format('Admin can view %s', table_name),
        table_name
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = format('Admin can insert %s', table_name)
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_admin_tab_access(''matches''::public.admin_panel_tab, true))',
        format('Admin can insert %s', table_name),
        table_name
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = format('Admin can update %s', table_name)
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.has_admin_tab_access(''matches''::public.admin_panel_tab, true)) WITH CHECK (public.has_admin_tab_access(''matches''::public.admin_panel_tab, true))',
        format('Admin can update %s', table_name),
        table_name
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = format('Admin can delete %s', table_name)
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.has_admin_tab_access(''matches''::public.admin_panel_tab, true))',
        format('Admin can delete %s', table_name),
        table_name
      );
    END IF;
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.build_championship_bracket_tie_break_context_key(
  _context_type public.championship_bracket_tie_break_context_type,
  _competition_id UUID,
  _group_id UUID DEFAULT NULL,
  _qualification_rank INTEGER DEFAULT NULL,
  _tied_team_signature TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _context_type = 'GROUP'::public.championship_bracket_tie_break_context_type THEN
    RETURN format(
      'GROUP:%s:%s:%s',
      _competition_id,
      COALESCE(_group_id::text, 'NONE'),
      COALESCE(_tied_team_signature, '')
    );
  END IF;

  RETURN format(
    'QUALIFICATION_POOL:%s:%s:%s',
    _competition_id,
    COALESCE(_qualification_rank::text, '0'),
    COALESCE(_tied_team_signature, '')
  );
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
AS $$
  WITH points_config AS (
    SELECT
      championship_sports_table.points_win,
      championship_sports_table.points_draw,
      championship_sports_table.points_loss
    FROM public.championship_sports AS championship_sports_table
    JOIN public.championship_bracket_competitions AS competitions_table
      ON competitions_table.sport_id = championship_sports_table.sport_id
    WHERE competitions_table.id = _competition_id
      AND championship_sports_table.championship_id = _championship_id
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
      AND matches_table.status = 'FINISHED'::public.match_status

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
      AND matches_table.status = 'FINISHED'::public.match_status
  ),
  group_ranking AS (
    SELECT
      group_team_scores.group_id,
      group_team_scores.team_id,
      sum(group_team_scores.points)::bigint AS points,
      sum(group_team_scores.wins)::bigint AS wins,
      sum(group_team_scores.goals_for - group_team_scores.goals_against)::bigint AS goal_diff,
      sum(group_team_scores.goals_for)::bigint AS goals_for
    FROM group_team_scores
    GROUP BY group_team_scores.group_id, group_team_scores.team_id
  ),
  group_metric_tie_sets AS (
    SELECT
      group_ranking.group_id,
      string_agg(group_ranking.team_id::text, '|' ORDER BY group_ranking.team_id::text) AS tied_team_signature,
      array_agg(group_ranking.team_id ORDER BY group_ranking.team_id::text) AS tied_team_ids
    FROM group_ranking
    GROUP BY
      group_ranking.group_id,
      group_ranking.points,
      group_ranking.wins,
      group_ranking.goal_diff,
      group_ranking.goals_for
    HAVING count(*) > 1
  ),
  group_tie_context_members AS (
    SELECT
      group_metric_tie_sets.group_id,
      unnest(group_metric_tie_sets.tied_team_ids) AS team_id,
      public.build_championship_bracket_tie_break_context_key(
        'GROUP'::public.championship_bracket_tie_break_context_type,
        _competition_id,
        group_metric_tie_sets.group_id,
        NULL,
        group_metric_tie_sets.tied_team_signature
      ) AS context_key
    FROM group_metric_tie_sets
  ),
  group_tie_resolution_orders AS (
    SELECT
      group_tie_context_members.group_id,
      group_tie_context_members.team_id,
      resolution_teams_table.draw_order
    FROM group_tie_context_members
    LEFT JOIN public.championship_bracket_tie_break_resolutions AS resolutions_table
      ON resolutions_table.context_key = group_tie_context_members.context_key
    LEFT JOIN public.championship_bracket_tie_break_resolution_teams AS resolution_teams_table
      ON resolution_teams_table.resolution_id = resolutions_table.id
      AND resolution_teams_table.team_id = group_tie_context_members.team_id
  ),
  ranked AS (
    SELECT
      _competition_id AS competition_id,
      group_ranking.group_id,
      groups_table.group_number,
      group_ranking.team_id,
      teams_table.name AS team_name,
      group_ranking.points,
      group_ranking.wins,
      group_ranking.goal_diff,
      group_ranking.goals_for,
      row_number() OVER (
        PARTITION BY group_ranking.group_id
        ORDER BY
          group_ranking.points DESC,
          group_ranking.wins DESC,
          group_ranking.goal_diff DESC,
          group_ranking.goals_for DESC,
          COALESCE(group_tie_resolution_orders.draw_order, 2147483647) ASC,
          teams_table.name ASC
      ) AS team_rank
    FROM group_ranking
    JOIN public.championship_bracket_groups AS groups_table
      ON groups_table.id = group_ranking.group_id
    JOIN public.teams AS teams_table
      ON teams_table.id = group_ranking.team_id
    LEFT JOIN group_tie_resolution_orders
      ON group_tie_resolution_orders.group_id = group_ranking.group_id
      AND group_tie_resolution_orders.team_id = group_ranking.team_id
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
$$;

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
AS $$
  WITH competition_context AS (
    SELECT
      competitions_table.id,
      competitions_table.qualifiers_per_group
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
    WHERE group_rankings.team_rank >= 2
      AND group_rankings.team_rank <= competition_context.qualifiers_per_group
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
$$;

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
AS $$
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
      competitions_table.naipe,
      competitions_table.division,
      sports_table.name AS sport_name,
      group_counts.group_count,
      CASE
        WHEN group_counts.group_count < 2 THEN group_counts.group_count
        ELSE power(2, ceil(log(2, group_counts.group_count::numeric)))::int
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
    WHERE group_tie_sets.start_rank <= group_tie_sets.qualifiers_per_group
  ),
  qualification_pool_rankings AS (
    SELECT
      competition_context.bracket_edition_id,
      competition_context.id AS competition_id,
      competition_context.sport_name,
      competition_context.naipe,
      competition_context.division,
      GREATEST(competition_context.target_bracket_size - competition_context.group_count, 0) AS required_additional_qualifiers,
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
$$;

CREATE OR REPLACE FUNCTION public.get_championship_bracket_pending_tie_breaks(
  _championship_id UUID,
  _bracket_edition_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'context_key', contexts_table.context_key,
        'competition_id', contexts_table.competition_id,
        'sport_name', contexts_table.sport_name,
        'naipe', contexts_table.naipe,
        'division', contexts_table.division,
        'context_type', contexts_table.context_type,
        'group_id', contexts_table.group_id,
        'group_number', contexts_table.group_number,
        'qualification_rank', contexts_table.qualification_rank,
        'title', contexts_table.title,
        'description', contexts_table.description,
        'teams',
        (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'team_id', team_rows.team_id,
                'team_name', team_rows.team_name
              )
              ORDER BY team_rows.team_name ASC
            ),
            '[]'::jsonb
          )
          FROM unnest(contexts_table.team_ids, contexts_table.team_names) AS team_rows(team_id, team_name)
        )
      )
      ORDER BY
        CASE contexts_table.context_type
          WHEN 'GROUP'::public.championship_bracket_tie_break_context_type THEN 1
          ELSE 2
        END,
        contexts_table.sport_name ASC,
        contexts_table.naipe ASC,
        contexts_table.group_number ASC NULLS FIRST,
        contexts_table.qualification_rank ASC NULLS FIRST
    ),
    '[]'::jsonb
  )
  FROM public.get_championship_bracket_tie_break_contexts(
    _championship_id,
    NULL,
    _bracket_edition_id
  ) AS contexts_table
  WHERE contexts_table.is_resolved = false;
$$;

CREATE OR REPLACE FUNCTION public.save_championship_bracket_tie_break_resolution(
  _payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  competition_record RECORD;
  context_record RECORD;
  team_id_record JSONB;
  team_id_value UUID;
  ordered_team_ids UUID[] := ARRAY[]::UUID[];
  sorted_signature TEXT;
  resolution_id_value UUID;
  team_position INTEGER := 0;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para salvar sorteio manual.';
  END IF;

  IF jsonb_typeof(COALESCE(_payload->'team_ids', '[]'::jsonb)) != 'array'
    OR jsonb_array_length(COALESCE(_payload->'team_ids', '[]'::jsonb)) < 2 THEN
    RAISE EXCEPTION 'Informe ao menos duas atléticas para o sorteio manual.';
  END IF;

  SELECT
    competitions_table.id,
    competitions_table.bracket_edition_id,
    editions_table.championship_id
  INTO competition_record
  FROM public.championship_bracket_competitions AS competitions_table
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = competitions_table.bracket_edition_id
  WHERE competitions_table.id = (_payload->>'competition_id')::uuid
  LIMIT 1;

  IF competition_record.id IS NULL THEN
    RAISE EXCEPTION 'Competição de chaveamento não encontrada para salvar o sorteio.';
  END IF;

  FOR team_id_record IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(_payload->'team_ids', '[]'::jsonb))
  LOOP
    ordered_team_ids := array_append(ordered_team_ids, trim(both '"' from team_id_record::text)::uuid);
  END LOOP;

  SELECT string_agg(team_id_value::text, '|' ORDER BY team_id_value::text)
  INTO sorted_signature
  FROM unnest(ordered_team_ids) AS team_id_value;

  SELECT contexts_table.*
  INTO context_record
  FROM public.get_championship_bracket_tie_break_contexts(
    competition_record.championship_id,
    competition_record.id,
    competition_record.bracket_edition_id
  ) AS contexts_table
  WHERE contexts_table.context_key = trim(COALESCE(_payload->>'context_key', ''))
  LIMIT 1;

  IF context_record.context_key IS NULL THEN
    RAISE EXCEPTION 'Contexto de sorteio não encontrado ou não está mais pendente.';
  END IF;

  IF context_record.tied_team_signature <> sorted_signature THEN
    RAISE EXCEPTION 'As atléticas informadas não correspondem ao empate atual deste sorteio.';
  END IF;

  INSERT INTO public.championship_bracket_tie_break_resolutions (
    bracket_edition_id,
    competition_id,
    group_id,
    context_type,
    qualification_rank,
    context_key,
    tied_team_signature,
    created_by
  ) VALUES (
    competition_record.bracket_edition_id,
    competition_record.id,
    context_record.group_id,
    context_record.context_type,
    context_record.qualification_rank,
    context_record.context_key,
    context_record.tied_team_signature,
    auth.uid()
  )
  ON CONFLICT (context_key)
  DO UPDATE SET
    tied_team_signature = EXCLUDED.tied_team_signature,
    group_id = EXCLUDED.group_id,
    qualification_rank = EXCLUDED.qualification_rank,
    updated_at = now()
  RETURNING id INTO resolution_id_value;

  DELETE FROM public.championship_bracket_tie_break_resolution_teams AS resolution_teams_table
  WHERE resolution_teams_table.resolution_id = resolution_id_value;

  FOREACH team_id_value IN ARRAY ordered_team_ids
  LOOP
    team_position := team_position + 1;

    INSERT INTO public.championship_bracket_tie_break_resolution_teams (
      resolution_id,
      team_id,
      draw_order
    ) VALUES (
      resolution_id_value,
      team_id_value,
      team_position
    );
  END LOOP;

  RETURN resolution_id_value;
END;
$$;

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

  WHILE target_bracket_size < group_count_value LOOP
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
    WHERE rankings_table.team_rank = 1
    ORDER BY rankings_table.group_number ASC
  LOOP
    qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
  END LOOP;

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
$$;

COMMENT ON FUNCTION public.generate_championship_knockout_for_competition(UUID, UUID, UUID) IS 'Gera o mata-mata automaticamente por competição, respeitando sorteios manuais de desempate quando houver empate total nos critérios automáticos.';

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
      BEGIN
        PERFORM public.generate_championship_knockout_for_competition(
          NEW.championship_id,
          bracket_match_record.competition_id,
          bracket_match_record.bracket_edition_id
        );
      EXCEPTION
        WHEN OTHERS THEN
          IF position('SORTEIO_MANUAL_PENDENTE:' IN SQLERRM) = 1 THEN
            PERFORM public.sync_championship_bracket_edition_status(bracket_match_record.bracket_edition_id);
            RETURN NEW;
          END IF;

          RAISE;
      END;
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

COMMENT ON FUNCTION public.handle_championship_bracket_match_finished() IS 'Gera o mata-mata por competição ao fechar as chaves, respeitando pendências de sorteio manual, e propaga vencedores automaticamente no bracket.';

NOTIFY pgrst, 'reload schema';
