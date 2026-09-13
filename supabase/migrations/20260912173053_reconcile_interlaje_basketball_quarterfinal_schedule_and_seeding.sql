ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS scheduled_start_time TIMESTAMPTZ NULL;

CREATE OR REPLACE FUNCTION public.create_championship_knockout_match_schedule(
  _championship_id UUID,
  _bracket_match_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  bracket_match_record RECORD;
  new_match_id UUID;
BEGIN
  SELECT
    bracket_matches_table.id,
    bracket_matches_table.bracket_edition_id,
    bracket_matches_table.competition_id,
    bracket_matches_table.match_id,
    bracket_matches_table.home_team_id,
    bracket_matches_table.away_team_id,
    bracket_matches_table.round_number,
    bracket_matches_table.slot_number,
    bracket_matches_table.is_third_place,
    bracket_matches_table.planned_scheduled_date,
    bracket_matches_table.planned_scheduled_slot,
    bracket_matches_table.planned_queue_position,
    bracket_matches_table.planned_start_time,
    bracket_matches_table.planned_end_time,
    bracket_matches_table.planned_location_name,
    bracket_matches_table.planned_court_name,
    competitions_table.division,
    competitions_table.naipe,
    competitions_table.sport_id,
    editions_table.season_year,
    editions_table.championship_id,
    editions_table.payload_snapshot ->> 'exact_preview_algorithm_version'
      AS exact_preview_algorithm_version
  INTO bracket_match_record
  FROM public.championship_bracket_matches AS bracket_matches_table
  JOIN public.championship_bracket_competitions AS competitions_table
    ON competitions_table.id = bracket_matches_table.competition_id
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = bracket_matches_table.bracket_edition_id
  WHERE bracket_matches_table.id = _bracket_match_id
  LIMIT 1;

  IF bracket_match_record.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF bracket_match_record.exact_preview_algorithm_version
    IS DISTINCT FROM 'async-exact-v8'
  THEN
    RETURN public.create_championship_knockout_match_schedule_v7(
      _championship_id,
      _bracket_match_id
    );
  END IF;

  IF bracket_match_record.championship_id <> _championship_id THEN
    RAISE EXCEPTION
      'A partida eliminatória % não pertence ao campeonato informado.',
      _bracket_match_id;
  END IF;

  IF bracket_match_record.match_id IS NOT NULL THEN
    RETURN bracket_match_record.match_id;
  END IF;

  IF bracket_match_record.home_team_id IS NULL
    OR bracket_match_record.away_team_id IS NULL
  THEN
    RETURN NULL;
  END IF;

  IF bracket_match_record.planned_scheduled_date IS NULL
    OR bracket_match_record.planned_scheduled_slot IS NULL
    OR bracket_match_record.planned_queue_position IS NULL
    OR bracket_match_record.planned_start_time IS NULL
    OR bracket_match_record.planned_end_time IS NULL
    OR bracket_match_record.planned_location_name IS NULL
    OR bracket_match_record.planned_court_name IS NULL
  THEN
    RAISE EXCEPTION
      'A partida eliminatória v8 % não possui programação estrutural completa.',
      _bracket_match_id;
  END IF;

  PERFORM set_config('app.skip_queue_trigger', 'true', true);
  PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);

  INSERT INTO public.matches (
    championship_id,
    division,
    naipe,
    sport_id,
    home_team_id,
    away_team_id,
    location,
    court_name,
    scheduled_date,
    queue_position,
    scheduled_slot,
    scheduled_start_time,
    start_time,
    end_time,
    season_year,
    status
  )
  VALUES (
    _championship_id,
    bracket_match_record.division,
    bracket_match_record.naipe,
    bracket_match_record.sport_id,
    bracket_match_record.home_team_id,
    bracket_match_record.away_team_id,
    bracket_match_record.planned_location_name,
    bracket_match_record.planned_court_name,
    bracket_match_record.planned_scheduled_date,
    bracket_match_record.planned_queue_position,
    bracket_match_record.planned_scheduled_slot,
    public.combine_bracket_schedule_timestamp(
      bracket_match_record.planned_scheduled_date,
      bracket_match_record.planned_start_time
    ),
    public.combine_bracket_schedule_timestamp(
      bracket_match_record.planned_scheduled_date,
      bracket_match_record.planned_start_time
    ),
    public.combine_bracket_schedule_timestamp(
      bracket_match_record.planned_scheduled_date,
      bracket_match_record.planned_end_time
    ),
    bracket_match_record.season_year,
    'SCHEDULED'::public.match_status
  )
  RETURNING id
  INTO new_match_id;

  UPDATE public.championship_bracket_matches
  SET match_id = new_match_id
  WHERE id = _bracket_match_id;

  PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
  PERFORM set_config('app.skip_queue_trigger', 'false', true);

  RETURN new_match_id;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
    PERFORM set_config('app.skip_queue_trigger', 'false', true);
    RAISE;
END;
$function$;

DO $patch$
DECLARE
  function_definition TEXT;
  patched_definition TEXT;
  candidate_metrics_fragment TEXT := $fragment$
      COALESCE(
        corrected_standings_table.corrected_points,
        group_rankings.points::numeric
      ) AS corrected_points,
      group_rankings.goal_diff,$fragment$;
  corrected_candidate_metrics_fragment TEXT := $fragment$
      COALESCE(
        corrected_standings_table.corrected_points,
        group_rankings.points::numeric
      ) AS corrected_points,
      CASE
        WHEN competition_context.championship_code = 'INTERLAJE'::public.championship_code
          AND competition_context.normalized_sport_name = 'basquetebol'
          AND GREATEST(0, group_rankings.goals_for - group_rankings.goal_diff) = 0
          AND group_rankings.goals_for > 0 THEN 1000000000::numeric
        WHEN competition_context.championship_code = 'INTERLAJE'::public.championship_code
          AND competition_context.normalized_sport_name = 'basquetebol'
          AND GREATEST(0, group_rankings.goals_for - group_rankings.goal_diff) = 0 THEN 0::numeric
        WHEN competition_context.championship_code = 'INTERLAJE'::public.championship_code
          AND competition_context.normalized_sport_name = 'basquetebol'
          THEN group_rankings.goals_for::numeric
            / GREATEST(0, group_rankings.goals_for - group_rankings.goal_diff)::numeric
        ELSE NULL::numeric
      END AS points_average,
      GREATEST(0, group_rankings.goals_for - group_rankings.goal_diff)::bigint AS goals_against,
      group_rankings.goal_diff,$fragment$;
  volleyball_flag_fragment TEXT := $fragment$
      competition_context.championship_code = 'INTERLAJE'::public.championship_code
        AND competition_context.normalized_sport_name = 'voleibol' AS is_interlaje_volleyball,
      ($fragment$;
  corrected_volleyball_flag_fragment TEXT := $fragment$
      competition_context.championship_code = 'INTERLAJE'::public.championship_code
        AND competition_context.normalized_sport_name = 'voleibol' AS is_interlaje_volleyball,
      competition_context.championship_code = 'INTERLAJE'::public.championship_code
        AND competition_context.normalized_sport_name = 'basquetebol' AS is_interlaje_basketball,
      ($fragment$;
  point_tie_fragment TEXT := $fragment$
      scored_candidate_rows.corrected_points,
      CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN round(scored_candidate_rows.sets_average, 12) ELSE NULL::numeric END,$fragment$;
  corrected_point_tie_fragment TEXT := $fragment$
      scored_candidate_rows.corrected_points,
      CASE WHEN scored_candidate_rows.is_interlaje_basketball THEN round(scored_candidate_rows.points_average, 12) ELSE NULL::numeric END,
      CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN round(scored_candidate_rows.sets_average, 12) ELSE NULL::numeric END,$fragment$;
  point_sort_fragment TEXT := $fragment$
          scored_candidate_rows.corrected_points DESC,
          CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN scored_candidate_rows.sets_average ELSE NULL::numeric END DESC NULLS LAST,$fragment$;
  corrected_point_sort_fragment TEXT := $fragment$
          scored_candidate_rows.corrected_points DESC,
          CASE WHEN scored_candidate_rows.is_interlaje_basketball THEN scored_candidate_rows.points_average ELSE NULL::numeric END DESC NULLS LAST,
          CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN scored_candidate_rows.sets_average ELSE NULL::numeric END DESC NULLS LAST,$fragment$;
  goal_tie_fragment TEXT := $fragment$
      CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN NULL::bigint ELSE scored_candidate_rows.goal_diff END,
      CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN NULL::bigint ELSE scored_candidate_rows.goals_for END,$fragment$;
  corrected_goal_tie_fragment TEXT := $fragment$
      CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN NULL::bigint ELSE scored_candidate_rows.goal_diff END,
      CASE WHEN scored_candidate_rows.is_interlaje_basketball THEN scored_candidate_rows.goals_against ELSE NULL::bigint END,
      CASE WHEN scored_candidate_rows.is_interlaje_basketball THEN round(scored_candidate_rows.red_cards_per_match, 12) ELSE NULL::numeric END,
      CASE WHEN scored_candidate_rows.is_interlaje_basketball OR (scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball) THEN NULL::bigint ELSE scored_candidate_rows.goals_for END,$fragment$;
  goal_sort_fragment TEXT := $fragment$
          CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN NULL::bigint ELSE scored_candidate_rows.goal_diff END DESC,
          CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN NULL::bigint ELSE scored_candidate_rows.goals_for END DESC,$fragment$;
  corrected_goal_sort_fragment TEXT := $fragment$
          CASE WHEN scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball THEN NULL::bigint ELSE scored_candidate_rows.goal_diff END DESC,
          CASE WHEN scored_candidate_rows.is_interlaje_basketball THEN scored_candidate_rows.goals_against ELSE NULL::bigint END ASC NULLS LAST,
          CASE WHEN scored_candidate_rows.is_interlaje_basketball THEN scored_candidate_rows.red_cards_per_match ELSE NULL::numeric END ASC NULLS LAST,
          CASE WHEN scored_candidate_rows.is_interlaje_basketball OR (scored_candidate_rows.uses_article_8_tiebreak AND scored_candidate_rows.is_interlaje_volleyball) THEN NULL::bigint ELSE scored_candidate_rows.goals_for END DESC,$fragment$;
  standard_wins_fragment TEXT := $fragment$) THEN scored_candidate_rows.wins$fragment$;
  corrected_standard_wins_fragment TEXT := $fragment$) AND NOT scored_candidate_rows.is_interlaje_basketball THEN scored_candidate_rows.wins$fragment$;
  yellow_cards_fragment TEXT := $fragment$THEN scored_candidate_rows.yellow_cards ELSE NULL::bigint END$fragment$;
  corrected_yellow_cards_fragment TEXT := $fragment$THEN CASE WHEN scored_candidate_rows.is_interlaje_basketball THEN NULL::bigint ELSE scored_candidate_rows.yellow_cards END ELSE NULL::bigint END$fragment$;
  red_cards_fragment TEXT := $fragment$THEN scored_candidate_rows.red_cards ELSE NULL::bigint END$fragment$;
  corrected_red_cards_fragment TEXT := $fragment$THEN CASE WHEN scored_candidate_rows.is_interlaje_basketball THEN NULL::bigint ELSE scored_candidate_rows.red_cards END ELSE NULL::bigint END$fragment$;
BEGIN
  SELECT pg_get_functiondef(functions_table.oid)
  INTO function_definition
  FROM pg_proc AS functions_table
  JOIN pg_namespace AS namespaces_table
    ON namespaces_table.oid = functions_table.pronamespace
  WHERE namespaces_table.nspname = 'public'
    AND functions_table.proname = 'get_championship_bracket_competition_qualification_pool_ranking'
    AND pg_get_function_identity_arguments(functions_table.oid) =
      '_championship_id uuid, _competition_id uuid';

  IF function_definition IS NULL
    OR position(candidate_metrics_fragment IN function_definition) = 0
    OR position(volleyball_flag_fragment IN function_definition) = 0
    OR position(point_tie_fragment IN function_definition) = 0
    OR position(point_sort_fragment IN function_definition) = 0
    OR position(goal_tie_fragment IN function_definition) = 0
    OR position(goal_sort_fragment IN function_definition) = 0
    OR position(standard_wins_fragment IN function_definition) = 0
    OR position(yellow_cards_fragment IN function_definition) = 0
    OR position(red_cards_fragment IN function_definition) = 0 THEN
    RAISE EXCEPTION 'A função de classificação do mata-mata não possui a estrutura esperada para o desempate do basquete.';
  END IF;

  patched_definition := replace(
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    function_definition,
                    candidate_metrics_fragment,
                    corrected_candidate_metrics_fragment
                  ),
                  volleyball_flag_fragment,
                  corrected_volleyball_flag_fragment
                ),
                point_tie_fragment,
                corrected_point_tie_fragment
              ),
              point_sort_fragment,
              corrected_point_sort_fragment
            ),
            goal_tie_fragment,
            corrected_goal_tie_fragment
          ),
          goal_sort_fragment,
          corrected_goal_sort_fragment
        ),
        standard_wins_fragment,
        corrected_standard_wins_fragment
      ),
      yellow_cards_fragment,
      corrected_yellow_cards_fragment
    ),
    red_cards_fragment,
    corrected_red_cards_fragment
  );

  EXECUTE patched_definition;
END;
$patch$;

ALTER TABLE public.matches DISABLE TRIGGER USER;

DO $reconcile$
DECLARE
  championship_record RECORD;
  competition_record RECORD;
  first_round_match_count INTEGER;
  scheduled_first_round_match_count INTEGER;
  group_count_value INTEGER;
  target_bracket_size INTEGER;
  direct_qualified_team_count INTEGER;
  qualified_team_ids UUID[] := ARRAY[]::UUID[];
  seed_order INTEGER[];
  ranking_record RECORD;
  current_slot_number INTEGER;
  current_expected_home_team_id UUID;
  current_expected_away_team_id UUID;
  current_bracket_match_id UUID;
  current_match_record RECORD;
BEGIN
  SELECT
    championships_table.id,
    championships_table.current_season_year
  INTO championship_record
  FROM public.championships AS championships_table
  WHERE championships_table.code = 'INTERLAJE'::public.championship_code
  LIMIT 1;

  IF championship_record.id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    competitions_table.id,
    competitions_table.qualifiers_per_group,
    competitions_table.knockout_pairing_mode
  INTO competition_record
  FROM public.championship_bracket_competitions AS competitions_table
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = competitions_table.bracket_edition_id
  JOIN public.sports AS sports_table
    ON sports_table.id = competitions_table.sport_id
  WHERE editions_table.championship_id = championship_record.id
    AND editions_table.season_year = championship_record.current_season_year
    AND public.normalize_sport_name(sports_table.name) = 'basquetebol'
    AND competitions_table.naipe = 'MASCULINO'::public.match_naipe
    AND competitions_table.division IS NULL
  LIMIT 1;

  IF competition_record.id IS NULL THEN
    RETURN;
  END IF;

  PERFORM 1
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = competition_record.id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
  ORDER BY bracket_matches_table.id
  FOR UPDATE;

  SELECT
    count(*)::INTEGER,
    count(*) FILTER (
      WHERE matches_table.status = 'SCHEDULED'::public.match_status
    )::INTEGER
  INTO first_round_match_count, scheduled_first_round_match_count
  FROM public.championship_bracket_matches AS bracket_matches_table
  LEFT JOIN public.matches AS matches_table
    ON matches_table.id = bracket_matches_table.match_id
  WHERE bracket_matches_table.competition_id = competition_record.id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false
    AND bracket_matches_table.round_number = 1;

  IF first_round_match_count <> 4
    OR scheduled_first_round_match_count <> first_round_match_count THEN
    RAISE EXCEPTION 'A reconciliação do basquete masculino exige quatro quartas materializadas e ainda agendadas.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = competition_record.id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.round_number > 1
      AND matches_table.status IN (
        'LIVE'::public.match_status,
        'FINISHED'::public.match_status
      )
  ) THEN
    RAISE EXCEPTION 'A reconciliação do basquete masculino foi bloqueada porque existe fase posterior ao vivo ou finalizada.';
  END IF;

  SELECT count(*)::INTEGER
  INTO group_count_value
  FROM public.championship_bracket_groups AS groups_table
  WHERE groups_table.competition_id = competition_record.id;

  direct_qualified_team_count :=
    group_count_value * competition_record.qualifiers_per_group;
  target_bracket_size := first_round_match_count * 2;

  IF direct_qualified_team_count <> 5
    OR target_bracket_size <> 8 THEN
    RAISE EXCEPTION 'A estrutura atual do basquete masculino não corresponde à classificação esperada para as quartas.';
  END IF;

  FOR ranking_record IN
    WITH qualification_pool AS (
      SELECT
        pool_rankings.team_id,
        pool_rankings.qualification_rank,
        row_number() OVER (
          PARTITION BY pool_rankings.qualification_rank
          ORDER BY pool_rankings.pool_rank ASC
        )::INTEGER AS rank_within_qualification
      FROM public.get_championship_bracket_competition_qualification_pool_rankings(
        championship_record.id,
        competition_record.id
      ) AS pool_rankings
    )
    SELECT qualification_pool.team_id
    FROM qualification_pool
    WHERE qualification_pool.qualification_rank = 1
      OR (
        qualification_pool.qualification_rank = 2
        AND qualification_pool.rank_within_qualification <=
          target_bracket_size - direct_qualified_team_count
      )
    ORDER BY
      qualification_pool.qualification_rank ASC,
      qualification_pool.rank_within_qualification ASC
  LOOP
    qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
  END LOOP;

  IF cardinality(qualified_team_ids) <> target_bracket_size
    OR EXISTS (
      SELECT 1
      FROM unnest(qualified_team_ids) AS qualified_team_id
      WHERE qualified_team_id IS NULL
    ) THEN
    RAISE EXCEPTION 'A classificação corrigida não definiu os oito participantes das quartas do basquete masculino.';
  END IF;

  seed_order := public.resolve_championship_knockout_seed_order(
    competition_record.knockout_pairing_mode,
    target_bracket_size
  );

  IF cardinality(seed_order) <> target_bracket_size THEN
    RAISE EXCEPTION 'O modo de pareamento do basquete masculino não gerou uma ordem de seeds válida.';
  END IF;

  FOR current_slot_number IN 1..first_round_match_count LOOP
    current_expected_home_team_id :=
      qualified_team_ids[seed_order[((current_slot_number - 1) * 2) + 1]];
    current_expected_away_team_id :=
      qualified_team_ids[seed_order[((current_slot_number - 1) * 2) + 2]];

    SELECT
      bracket_matches_table.id,
      bracket_matches_table.match_id,
      bracket_matches_table.planned_scheduled_date,
      bracket_matches_table.planned_scheduled_slot,
      bracket_matches_table.planned_queue_position,
      bracket_matches_table.planned_start_time,
      bracket_matches_table.planned_end_time,
      bracket_matches_table.planned_location_name,
      bracket_matches_table.planned_court_name,
      matches_table.status,
      bracket_matches_table.winner_team_id,
      bracket_matches_table.is_bye
    INTO current_match_record
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = competition_record.id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number = 1
      AND bracket_matches_table.slot_number = current_slot_number
    LIMIT 1;

    IF current_match_record.id IS NULL
      OR current_match_record.match_id IS NULL
      OR current_match_record.status IS DISTINCT FROM 'SCHEDULED'::public.match_status
      OR current_match_record.winner_team_id IS NOT NULL
      OR current_match_record.is_bye IS NOT FALSE
      OR current_match_record.planned_scheduled_date IS NULL
      OR current_match_record.planned_scheduled_slot IS NULL
      OR current_match_record.planned_queue_position IS NULL
      OR current_match_record.planned_start_time IS NULL
      OR current_match_record.planned_end_time IS NULL
      OR current_match_record.planned_location_name IS NULL
      OR current_match_record.planned_court_name IS NULL THEN
      RAISE EXCEPTION 'A quarta % do basquete masculino não está disponível para uma correção segura.', current_slot_number;
    END IF;

    UPDATE public.championship_bracket_matches AS bracket_matches_table
    SET
      home_team_id = current_expected_home_team_id,
      away_team_id = current_expected_away_team_id
    WHERE bracket_matches_table.id = current_match_record.id;

    UPDATE public.matches AS matches_table
    SET
      home_team_id = current_expected_home_team_id,
      away_team_id = current_expected_away_team_id,
      location = current_match_record.planned_location_name,
      court_name = current_match_record.planned_court_name,
      scheduled_date = current_match_record.planned_scheduled_date,
      scheduled_slot = current_match_record.planned_scheduled_slot,
      queue_position = current_match_record.planned_queue_position,
      scheduled_start_time = public.combine_bracket_schedule_timestamp(
        current_match_record.planned_scheduled_date,
        current_match_record.planned_start_time
      ),
      start_time = public.combine_bracket_schedule_timestamp(
        current_match_record.planned_scheduled_date,
        current_match_record.planned_start_time
      ),
      end_time = public.combine_bracket_schedule_timestamp(
        current_match_record.planned_scheduled_date,
        current_match_record.planned_end_time
      )
    WHERE matches_table.id = current_match_record.match_id
      AND matches_table.status = 'SCHEDULED'::public.match_status;
  END LOOP;
END;
$reconcile$;

ALTER TABLE public.matches ENABLE TRIGGER USER;

NOTIFY pgrst, 'reload schema';
