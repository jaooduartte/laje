CREATE OR REPLACE FUNCTION public.reset_championship_season_to_planning(
  _championship_id UUID,
  _season_year INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  championship_record public.championships%ROWTYPE;
  movement_record RECORD;
  deletion_operation RECORD;
  deleted_counts JSONB := '{}'::jsonb;
  deleted_row_count BIGINT;
  restored_team_division_count INTEGER := 0;
BEGIN
  IF NOT public.has_admin_tab_access('championship_status'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Apenas administradores com acesso ao status do campeonato podem reiniciar a temporada.';
  END IF;

  SELECT *
  INTO championship_record
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campeonato não encontrado.';
  END IF;

  IF _season_year IS DISTINCT FROM championship_record.current_season_year THEN
    RAISE EXCEPTION 'O reset só pode ser aplicado à temporada atual do campeonato.';
  END IF;

  IF championship_record.status = 'FINISHED'::public.championship_status THEN
    RAISE EXCEPTION 'Reabra o campeonato como Em andamento antes de voltar para Em breve.';
  END IF;

  IF championship_record.status = 'PLANNING'::public.championship_status THEN
    RAISE EXCEPTION 'O campeonato já está Em breve e não precisa de reset.';
  END IF;

  FOR movement_record IN
    SELECT movements_table.team_id,
           movements_table.previous_division,
           movements_table.next_division,
           teams_table.division AS current_division
    FROM public.championship_season_division_movements AS movements_table
    JOIN public.teams AS teams_table ON teams_table.id = movements_table.team_id
    WHERE movements_table.championship_id = _championship_id
      AND movements_table.season_year = _season_year
      AND movements_table.confirmed_at IS NOT NULL
    ORDER BY movements_table.id
    FOR UPDATE OF teams_table
  LOOP
    IF movement_record.current_division IS DISTINCT FROM movement_record.next_division THEN
      RAISE EXCEPTION 'A divisão de uma atlética foi alterada após a confirmação da movimentação. O reset foi cancelado.';
    END IF;

    UPDATE public.teams
    SET division = movement_record.previous_division
    WHERE id = movement_record.team_id
      AND division IS NOT DISTINCT FROM movement_record.next_division;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A divisão de uma atlética foi alterada após a confirmação da movimentação. O reset foi cancelado.';
    END IF;

    restored_team_division_count := restored_team_division_count + 1;
  END LOOP;

  FOR deletion_operation IN
    SELECT *
    FROM (VALUES
      ('championship_bracket_preview_private', 'jobs', 'championship_id = $1 AND season_year = $2'),
      ('public', 'championship_knockout_result_corrections', 'championship_id = $1 AND season_year = $2'),
      ('public', 'match_award_goal_scorers', 'match_id IN (SELECT matches_table.id FROM public.matches AS matches_table WHERE matches_table.championship_id = $1 AND matches_table.season_year = $2)'),
      ('public', 'match_blue_card_players', 'match_id IN (SELECT matches_table.id FROM public.matches AS matches_table WHERE matches_table.championship_id = $1 AND matches_table.season_year = $2)'),
      ('public', 'match_red_card_players', 'match_id IN (SELECT matches_table.id FROM public.matches AS matches_table WHERE matches_table.championship_id = $1 AND matches_table.season_year = $2)'),
      ('public', 'match_yellow_card_players', 'match_id IN (SELECT matches_table.id FROM public.matches AS matches_table WHERE matches_table.championship_id = $1 AND matches_table.season_year = $2)'),
      ('public', 'match_two_minute_penalty_players', 'match_id IN (SELECT matches_table.id FROM public.matches AS matches_table WHERE matches_table.championship_id = $1 AND matches_table.season_year = $2)'),
      ('public', 'match_sets', 'match_id IN (SELECT matches_table.id FROM public.matches AS matches_table WHERE matches_table.championship_id = $1 AND matches_table.season_year = $2)'),
      ('public', 'matches', 'championship_id = $1 AND season_year = $2'),
      ('public', 'championship_individual_event_entry_members', 'entry_id IN (SELECT entries_table.id FROM public.championship_individual_event_entries AS entries_table JOIN public.championship_individual_events AS events_table ON events_table.id = entries_table.event_id WHERE events_table.championship_id = $1 AND events_table.season_year = $2)'),
      ('public', 'championship_individual_event_entries', 'event_id IN (SELECT events_table.id FROM public.championship_individual_events AS events_table WHERE events_table.championship_id = $1 AND events_table.season_year = $2)'),
      ('public', 'championship_interlaje_individual_tie_break_resolutions', 'event_id IN (SELECT events_table.id FROM public.championship_individual_events AS events_table WHERE events_table.championship_id = $1 AND events_table.season_year = $2)'),
      ('public', 'championship_individual_events', 'championship_id = $1 AND season_year = $2'),
      ('public', 'championship_individual_sessions', 'championship_id = $1 AND season_year = $2'),
      ('public', 'championship_individual_team_standings', 'championship_id = $1 AND season_year = $2'),
      ('public', 'championship_award_draw_results', 'championship_id = $1 AND season_year = $2'),
      ('public', 'championship_award_players', 'championship_id = $1 AND season_year = $2'),
      ('public', 'championship_competition_team_disqualifications', 'championship_id = $1 AND season_year = $2'),
      ('public', 'championship_interlaje_ranking_audits', 'championship_id = $1 AND season_year = $2'),
      ('public', 'championship_interlaje_tie_break_resolutions', 'championship_id = $1 AND season_year = $2'),
      ('public', 'championship_opening_ceremony_bonus_settings', 'championship_id = $1 AND season_year = $2'),
      ('public', 'championship_overall_competition_placements', 'championship_id = $1 AND season_year = $2'),
      ('public', 'championship_overall_position_point_settings', 'championship_id = $1 AND season_year = $2'),
      ('public', 'championship_overall_score_adjustments', 'championship_id = $1 AND season_year = $2'),
      ('public', 'championship_overall_tie_break_resolution_teams', 'resolution_id IN (SELECT resolutions_table.id FROM public.championship_overall_tie_break_resolutions AS resolutions_table WHERE resolutions_table.championship_id = $1 AND resolutions_table.season_year = $2)'),
      ('public', 'championship_overall_tie_break_resolutions', 'championship_id = $1 AND season_year = $2'),
      ('public', 'championship_season_division_movements', 'championship_id = $1 AND season_year = $2'),
      ('public', 'championship_season_settings', 'championship_id = $1 AND season_year = $2'),
      ('public', 'championship_season_sport_removals', 'championship_id = $1 AND season_year = $2'),
      ('public', 'championship_walkover_penalty_counts', 'championship_id = $1 AND season_year = $2'),
      ('public', 'championship_walkover_penalty_settings', 'championship_id = $1 AND season_year = $2'),
      ('public', 'standings', 'championship_id = $1 AND season_year = $2'),
      ('public', 'championship_bracket_team_registrations', 'bracket_edition_id IN (SELECT edition_table.id FROM public.championship_bracket_editions AS edition_table WHERE edition_table.championship_id = $1 AND edition_table.season_year = $2)'),
      ('public', 'championship_bracket_team_modalities', 'bracket_edition_id IN (SELECT edition_table.id FROM public.championship_bracket_editions AS edition_table WHERE edition_table.championship_id = $1 AND edition_table.season_year = $2)'),
      ('public', 'championship_bracket_tie_break_resolution_teams', 'resolution_id IN (SELECT resolution_table.id FROM public.championship_bracket_tie_break_resolutions AS resolution_table WHERE resolution_table.bracket_edition_id IN (SELECT edition_table.id FROM public.championship_bracket_editions AS edition_table WHERE edition_table.championship_id = $1 AND edition_table.season_year = $2))'),
      ('public', 'championship_bracket_tie_break_resolutions', 'bracket_edition_id IN (SELECT edition_table.id FROM public.championship_bracket_editions AS edition_table WHERE edition_table.championship_id = $1 AND edition_table.season_year = $2)'),
      ('public', 'championship_bracket_location_sport_priorities', 'bracket_edition_id IN (SELECT edition_table.id FROM public.championship_bracket_editions AS edition_table WHERE edition_table.championship_id = $1 AND edition_table.season_year = $2)'),
      ('public', 'championship_bracket_knockout_court_priorities', 'bracket_edition_id IN (SELECT edition_table.id FROM public.championship_bracket_editions AS edition_table WHERE edition_table.championship_id = $1 AND edition_table.season_year = $2)'),
      ('public', 'championship_bracket_day_breaks', 'bracket_day_id IN (SELECT day_table.id FROM public.championship_bracket_days AS day_table WHERE day_table.bracket_edition_id IN (SELECT edition_table.id FROM public.championship_bracket_editions AS edition_table WHERE edition_table.championship_id = $1 AND edition_table.season_year = $2))'),
      ('public', 'championship_bracket_court_sports', 'bracket_court_id IN (SELECT court_table.id FROM public.championship_bracket_courts AS court_table JOIN public.championship_bracket_locations AS location_table ON location_table.id = court_table.bracket_location_id JOIN public.championship_bracket_days AS day_table ON day_table.id = location_table.bracket_day_id WHERE day_table.bracket_edition_id IN (SELECT edition_table.id FROM public.championship_bracket_editions AS edition_table WHERE edition_table.championship_id = $1 AND edition_table.season_year = $2))'),
      ('public', 'championship_bracket_courts', 'bracket_location_id IN (SELECT location_table.id FROM public.championship_bracket_locations AS location_table JOIN public.championship_bracket_days AS day_table ON day_table.id = location_table.bracket_day_id WHERE day_table.bracket_edition_id IN (SELECT edition_table.id FROM public.championship_bracket_editions AS edition_table WHERE edition_table.championship_id = $1 AND edition_table.season_year = $2))'),
      ('public', 'championship_bracket_locations', 'bracket_day_id IN (SELECT day_table.id FROM public.championship_bracket_days AS day_table WHERE day_table.bracket_edition_id IN (SELECT edition_table.id FROM public.championship_bracket_editions AS edition_table WHERE edition_table.championship_id = $1 AND edition_table.season_year = $2))'),
      ('public', 'championship_bracket_days', 'bracket_edition_id IN (SELECT edition_table.id FROM public.championship_bracket_editions AS edition_table WHERE edition_table.championship_id = $1 AND edition_table.season_year = $2)'),
      ('public', 'championship_bracket_group_teams', 'group_id IN (SELECT group_table.id FROM public.championship_bracket_groups AS group_table JOIN public.championship_bracket_competitions AS competition_table ON competition_table.id = group_table.competition_id WHERE competition_table.bracket_edition_id IN (SELECT edition_table.id FROM public.championship_bracket_editions AS edition_table WHERE edition_table.championship_id = $1 AND edition_table.season_year = $2))'),
      ('public', 'championship_bracket_matches', 'bracket_edition_id IN (SELECT edition_table.id FROM public.championship_bracket_editions AS edition_table WHERE edition_table.championship_id = $1 AND edition_table.season_year = $2)'),
      ('public', 'championship_bracket_groups', 'competition_id IN (SELECT competition_table.id FROM public.championship_bracket_competitions AS competition_table WHERE competition_table.bracket_edition_id IN (SELECT edition_table.id FROM public.championship_bracket_editions AS edition_table WHERE edition_table.championship_id = $1 AND edition_table.season_year = $2))'),
      ('public', 'championship_bracket_competitions', 'bracket_edition_id IN (SELECT edition_table.id FROM public.championship_bracket_editions AS edition_table WHERE edition_table.championship_id = $1 AND edition_table.season_year = $2)'),
      ('public', 'championship_bracket_editions', 'championship_id = $1 AND season_year = $2')
    ) AS operations(schema_name, table_name, condition)
  LOOP
    EXECUTE format('DELETE FROM %I.%I WHERE %s', deletion_operation.schema_name, deletion_operation.table_name, deletion_operation.condition)
    USING _championship_id, _season_year;
    GET DIAGNOSTICS deleted_row_count = ROW_COUNT;
    deleted_counts := jsonb_set(deleted_counts, ARRAY[deletion_operation.table_name], to_jsonb(deleted_row_count), true);
  END LOOP;

  PERFORM set_config('laje.allow_championship_planning_transition', 'true', true);

  UPDATE public.championships
  SET status = 'PLANNING'::public.championship_status
  WHERE id = _championship_id;

  PERFORM public.write_admin_action_log(
    'UPDATE'::public.admin_action_type,
    'championship_season_reset',
    _championship_id::text || ':' || _season_year::text,
    'Temporada atual reiniciada e campeonato retornado para Em breve.',
    jsonb_build_object('seasonYear', _season_year, 'status', championship_record.status),
    jsonb_build_object(
      'seasonYear', _season_year,
      'status', 'PLANNING',
      'deletedCounts', deleted_counts,
      'restoredTeamDivisionCount', restored_team_division_count
    ),
    jsonb_build_object('source', 'supabase', 'action', 'reset_current_season')
  );

  RETURN jsonb_build_object(
    'championship_id', _championship_id,
    'season_year', _season_year,
    'previous_status', championship_record.status,
    'status', 'PLANNING',
    'deleted_counts', deleted_counts,
    'restored_team_division_count', restored_team_division_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reset_championship_season_to_planning(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_championship_season_to_planning(UUID, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';

