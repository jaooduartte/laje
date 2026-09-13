CREATE OR REPLACE FUNCTION public.preview_championship_season_sport_removal(
  _championship_id UUID,
  _season_year INTEGER,
  _sport_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sport_name TEXT;
  matches_count INTEGER;
  individual_sessions_count INTEGER;
  individual_events_count INTEGER;
  individual_entries_count INTEGER;
  standings_count INTEGER;
  individual_standings_count INTEGER;
  bracket_competitions_count INTEGER;
  configured_teams_count INTEGER;
  athletes_count INTEGER;
  disqualifications_count INTEGER;
  has_live_items BOOLEAN;
BEGIN
  IF NOT public.has_admin_tab_access('sports'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para remover modalidades.';
  END IF;

  SELECT sports_table.name
  INTO sport_name
  FROM public.championship_sports AS championship_sports_table
  JOIN public.sports AS sports_table ON sports_table.id = championship_sports_table.sport_id
  JOIN public.championships AS championships_table ON championships_table.id = championship_sports_table.championship_id
  WHERE championship_sports_table.championship_id = _championship_id
    AND championship_sports_table.sport_id = _sport_id
    AND championships_table.current_season_year = _season_year;

  IF sport_name IS NULL THEN
    RAISE EXCEPTION 'Modalidade não encontrada na temporada atual do campeonato.';
  END IF;

  SELECT count(*)::INTEGER
  INTO matches_count
  FROM public.matches AS matches_table
  WHERE matches_table.championship_id = _championship_id
    AND matches_table.season_year = _season_year
    AND matches_table.sport_id = _sport_id;

  SELECT count(*)::INTEGER
  INTO individual_sessions_count
  FROM public.championship_individual_sessions AS sessions_table
  WHERE sessions_table.championship_id = _championship_id
    AND sessions_table.season_year = _season_year
    AND sessions_table.sport_id = _sport_id;

  SELECT count(*)::INTEGER
  INTO individual_events_count
  FROM public.championship_individual_events AS events_table
  WHERE events_table.championship_id = _championship_id
    AND events_table.season_year = _season_year
    AND events_table.sport_id = _sport_id;

  SELECT count(*)::INTEGER
  INTO individual_entries_count
  FROM public.championship_individual_event_entries AS entries_table
  JOIN public.championship_individual_events AS events_table ON events_table.id = entries_table.event_id
  WHERE events_table.championship_id = _championship_id
    AND events_table.season_year = _season_year
    AND events_table.sport_id = _sport_id;

  SELECT count(*)::INTEGER
  INTO standings_count
  FROM public.standings AS standings_table
  WHERE standings_table.championship_id = _championship_id
    AND standings_table.season_year = _season_year
    AND standings_table.sport_id = _sport_id;

  SELECT count(*)::INTEGER
  INTO individual_standings_count
  FROM public.championship_individual_team_standings AS standings_table
  WHERE standings_table.championship_id = _championship_id
    AND standings_table.season_year = _season_year
    AND standings_table.sport_id = _sport_id;

  SELECT count(*)::INTEGER
  INTO bracket_competitions_count
  FROM public.championship_bracket_competitions AS competitions_table
  JOIN public.championship_bracket_editions AS editions_table ON editions_table.id = competitions_table.bracket_edition_id
  WHERE editions_table.championship_id = _championship_id
    AND editions_table.season_year = _season_year
    AND competitions_table.sport_id = _sport_id;

  SELECT count(DISTINCT participant_record.value->>'team_id')::INTEGER
  INTO configured_teams_count
  FROM public.championship_bracket_editions AS editions_table
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(editions_table.payload_snapshot->'participants', '[]'::JSONB)
  ) AS participant_record(value)
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(participant_record.value->'modalities', '[]'::JSONB)
  ) AS modality_record(value)
  WHERE editions_table.championship_id = _championship_id
    AND editions_table.season_year = _season_year
    AND (modality_record.value->>'sport_id')::UUID = _sport_id;

  SELECT count(*)::INTEGER
  INTO athletes_count
  FROM public.championship_award_players AS players_table
  WHERE players_table.championship_id = _championship_id
    AND players_table.season_year = _season_year
    AND players_table.sport_id = _sport_id;

  SELECT count(*)::INTEGER
  INTO disqualifications_count
  FROM public.championship_competition_team_disqualifications AS disqualifications_table
  WHERE disqualifications_table.championship_id = _championship_id
    AND disqualifications_table.season_year = _season_year
    AND disqualifications_table.sport_id = _sport_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.matches AS matches_table
    WHERE matches_table.championship_id = _championship_id
      AND matches_table.season_year = _season_year
      AND matches_table.sport_id = _sport_id
      AND matches_table.status = 'LIVE'::public.match_status
    UNION ALL
    SELECT 1
    FROM public.championship_individual_sessions AS sessions_table
    WHERE sessions_table.championship_id = _championship_id
      AND sessions_table.season_year = _season_year
      AND sessions_table.sport_id = _sport_id
      AND sessions_table.status = 'LIVE'::public.championship_individual_session_status
  )
  INTO has_live_items;

  RETURN jsonb_build_object(
    'sport_name', sport_name,
    'has_live_items', has_live_items,
    'matches_count', matches_count,
    'individual_sessions_count', individual_sessions_count,
    'individual_events_count', individual_events_count,
    'individual_entries_count', individual_entries_count,
    'standings_count', standings_count,
    'individual_standings_count', individual_standings_count,
    'bracket_competitions_count', bracket_competitions_count,
    'configured_teams_count', configured_teams_count,
    'athletes_count', athletes_count,
    'disqualifications_count', disqualifications_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_championship_season_sport_removal_payload()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.championship_bracket_editions AS editions_table
  SET payload_snapshot = jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(editions_table.payload_snapshot, '{}'::JSONB),
        '{enabled_sport_ids}',
        COALESCE(
          (
            SELECT jsonb_agg(to_jsonb(sport_record.value))
            FROM jsonb_array_elements_text(
              COALESCE(editions_table.payload_snapshot->'enabled_sport_ids', '[]'::JSONB)
            ) AS sport_record(value)
            WHERE sport_record.value::UUID IS DISTINCT FROM NEW.sport_id
          ),
          '[]'::JSONB
        )
      ),
      '{individual_event_configs}',
      COALESCE(
        (
          SELECT jsonb_agg(config_record.value)
          FROM jsonb_array_elements(
            COALESCE(editions_table.payload_snapshot->'individual_event_configs', '[]'::JSONB)
          ) AS config_record(value)
          WHERE (config_record.value->>'sport_id')::UUID IS DISTINCT FROM NEW.sport_id
        ),
        '[]'::JSONB
      )
    ),
    '{individual_session_configs}',
    COALESCE(
      (
        SELECT jsonb_agg(config_record.value)
        FROM jsonb_array_elements(
          COALESCE(editions_table.payload_snapshot->'individual_session_configs', '[]'::JSONB)
        ) AS config_record(value)
        WHERE (config_record.value->>'sport_id')::UUID IS DISTINCT FROM NEW.sport_id
      ),
      '[]'::JSONB
    )
  )
  WHERE editions_table.championship_id = NEW.championship_id
    AND editions_table.season_year = NEW.season_year;

  UPDATE public.championship_bracket_editions AS editions_table
  SET payload_snapshot = jsonb_set(
    COALESCE(editions_table.payload_snapshot, '{}'::JSONB),
    '{participants}',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_set(
            participant_record.value,
            '{modalities}',
            COALESCE(
              (
                SELECT jsonb_agg(modality_record.value)
                FROM jsonb_array_elements(
                  COALESCE(participant_record.value->'modalities', '[]'::JSONB)
                ) AS modality_record(value)
                WHERE (modality_record.value->>'sport_id')::UUID IS DISTINCT FROM NEW.sport_id
              ),
              '[]'::JSONB
            )
          )
        )
        FROM jsonb_array_elements(
          COALESCE(editions_table.payload_snapshot->'participants', '[]'::JSONB)
        ) AS participant_record(value)
      ),
      '[]'::JSONB
    )
  )
  WHERE editions_table.championship_id = NEW.championship_id
    AND editions_table.season_year = NEW.season_year;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_championship_season_sport_removal_payload
  ON public.championship_season_sport_removals;

CREATE TRIGGER sync_championship_season_sport_removal_payload
BEFORE INSERT ON public.championship_season_sport_removals
FOR EACH ROW
EXECUTE FUNCTION public.sync_championship_season_sport_removal_payload();
