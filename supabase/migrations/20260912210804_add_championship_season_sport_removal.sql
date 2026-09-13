CREATE TABLE public.championship_season_sport_removals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  season_year INTEGER NOT NULL,
  sport_id UUID NOT NULL REFERENCES public.sports(id) ON DELETE RESTRICT,
  removed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  removed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (championship_id, season_year, sport_id)
);

CREATE INDEX championship_season_sport_removals_lookup_idx
  ON public.championship_season_sport_removals (championship_id, season_year, sport_id);

ALTER TABLE public.championship_season_sport_removals ENABLE ROW LEVEL SECURITY;

CREATE POLICY championship_season_sport_removals_public_select
  ON public.championship_season_sport_removals
  FOR SELECT
  TO anon, authenticated
  USING (true);

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
  team_modalities_count INTEGER;
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

  SELECT count(*)::INTEGER
  INTO team_modalities_count
  FROM public.championship_bracket_editions AS editions_table
  JOIN public.championship_bracket_team_modalities AS modalities_table
    ON modalities_table.bracket_edition_id = editions_table.id
  WHERE editions_table.championship_id = _championship_id
    AND editions_table.season_year = _season_year
    AND modalities_table.sport_id = _sport_id;

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
    'team_modalities_count', team_modalities_count,
    'athletes_count', athletes_count,
    'disqualifications_count', disqualifications_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_championship_season_sport(
  _championship_id UUID,
  _season_year INTEGER,
  _sport_id UUID,
  _confirmation_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  removal_preview JSONB;
  sport_name TEXT;
BEGIN
  removal_preview := public.preview_championship_season_sport_removal(
    _championship_id,
    _season_year,
    _sport_id
  );
  sport_name := removal_preview->>'sport_name';

  IF lower(trim(_confirmation_name)) <> lower(trim(sport_name)) THEN
    RAISE EXCEPTION 'Confirme a remoção digitando o nome da modalidade.';
  END IF;

  IF COALESCE((removal_preview->>'has_live_items')::BOOLEAN, false) THEN
    RAISE EXCEPTION 'Não é possível remover uma modalidade com jogo ou sessão ao vivo.';
  END IF;

  DELETE FROM public.matches AS matches_table
  WHERE matches_table.championship_id = _championship_id
    AND matches_table.season_year = _season_year
    AND matches_table.sport_id = _sport_id;

  DELETE FROM public.championship_individual_events AS events_table
  WHERE events_table.championship_id = _championship_id
    AND events_table.season_year = _season_year
    AND events_table.sport_id = _sport_id;

  DELETE FROM public.championship_individual_sessions AS sessions_table
  WHERE sessions_table.championship_id = _championship_id
    AND sessions_table.season_year = _season_year
    AND sessions_table.sport_id = _sport_id;

  DELETE FROM public.standings AS standings_table
  WHERE standings_table.championship_id = _championship_id
    AND standings_table.season_year = _season_year
    AND standings_table.sport_id = _sport_id;

  DELETE FROM public.championship_individual_team_standings AS standings_table
  WHERE standings_table.championship_id = _championship_id
    AND standings_table.season_year = _season_year
    AND standings_table.sport_id = _sport_id;

  DELETE FROM public.championship_competition_team_disqualifications AS disqualifications_table
  WHERE disqualifications_table.championship_id = _championship_id
    AND disqualifications_table.season_year = _season_year
    AND disqualifications_table.sport_id = _sport_id;

  DELETE FROM public.championship_award_players AS players_table
  WHERE players_table.championship_id = _championship_id
    AND players_table.season_year = _season_year
    AND players_table.sport_id = _sport_id;

  DELETE FROM public.championship_bracket_competitions AS competitions_table
  USING public.championship_bracket_editions AS editions_table
  WHERE editions_table.id = competitions_table.bracket_edition_id
    AND editions_table.championship_id = _championship_id
    AND editions_table.season_year = _season_year
    AND competitions_table.sport_id = _sport_id;

  DELETE FROM public.championship_bracket_team_modalities AS modalities_table
  USING public.championship_bracket_editions AS editions_table
  WHERE editions_table.id = modalities_table.bracket_edition_id
    AND editions_table.championship_id = _championship_id
    AND editions_table.season_year = _season_year
    AND modalities_table.sport_id = _sport_id;

  DELETE FROM public.championship_bracket_location_sport_priorities AS priorities_table
  USING public.championship_bracket_editions AS editions_table
  WHERE editions_table.id = priorities_table.bracket_edition_id
    AND editions_table.championship_id = _championship_id
    AND editions_table.season_year = _season_year
    AND priorities_table.sport_id = _sport_id;

  DELETE FROM public.championship_bracket_knockout_court_priorities AS priorities_table
  USING public.championship_bracket_editions AS editions_table
  WHERE editions_table.id = priorities_table.bracket_edition_id
    AND editions_table.championship_id = _championship_id
    AND editions_table.season_year = _season_year
    AND priorities_table.sport_id = _sport_id;

  DELETE FROM public.championship_bracket_court_sports AS court_sports_table
  USING public.championship_bracket_courts AS courts_table
  JOIN public.championship_bracket_locations AS locations_table ON locations_table.id = courts_table.bracket_location_id
  JOIN public.championship_bracket_days AS days_table ON days_table.id = locations_table.bracket_day_id
  JOIN public.championship_bracket_editions AS editions_table ON editions_table.id = days_table.bracket_edition_id
  WHERE court_sports_table.bracket_court_id = courts_table.id
    AND editions_table.championship_id = _championship_id
    AND editions_table.season_year = _season_year
    AND court_sports_table.sport_id = _sport_id;

  INSERT INTO public.championship_season_sport_removals (
    championship_id,
    season_year,
    sport_id,
    removed_by
  )
  VALUES (
    _championship_id,
    _season_year,
    _sport_id,
    auth.uid()
  )
  ON CONFLICT (championship_id, season_year, sport_id) DO NOTHING;

  RETURN removal_preview;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_championship_control_operational_queue(
  _championship_id UUID,
  _season_year INTEGER
)
RETURNS TABLE (
  item_type TEXT,
  item_id UUID
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scheduled_matches AS (
    SELECT
      matches_table.id,
      row_number() OVER (
        PARTITION BY matches_table.location, COALESCE(matches_table.court_name, '')
        ORDER BY
          COALESCE(matches_table.scheduled_start_time, matches_table.start_time) ASC NULLS LAST,
          COALESCE(matches_table.scheduled_slot, matches_table.queue_position) ASC NULLS LAST,
          COALESCE(matches_table.queue_position, matches_table.scheduled_slot) ASC NULLS LAST,
          matches_table.created_at ASC,
          matches_table.id ASC
      ) AS queue_position
    FROM public.matches AS matches_table
    WHERE matches_table.championship_id = _championship_id
      AND matches_table.season_year = _season_year
      AND matches_table.status = 'SCHEDULED'
      AND matches_table.scheduled_date = timezone('America/Sao_Paulo', now())::DATE
      AND NOT EXISTS (
        SELECT 1
        FROM public.championship_season_sport_removals AS removals_table
        WHERE removals_table.championship_id = matches_table.championship_id
          AND removals_table.season_year = matches_table.season_year
          AND removals_table.sport_id = matches_table.sport_id
      )
  ),
  scheduled_sessions AS (
    SELECT
      sessions_table.id,
      row_number() OVER (
        PARTITION BY sessions_table.sport_id, sessions_table.naipe
        ORDER BY
          sessions_table.start_time ASC NULLS LAST,
          sessions_table.created_at ASC,
          sessions_table.id ASC
      ) AS queue_position
    FROM public.championship_individual_sessions AS sessions_table
    WHERE sessions_table.championship_id = _championship_id
      AND sessions_table.season_year = _season_year
      AND sessions_table.status = 'SCHEDULED'
      AND sessions_table.scheduled_date = timezone('America/Sao_Paulo', now())::DATE
      AND NOT EXISTS (
        SELECT 1
        FROM public.championship_season_sport_removals AS removals_table
        WHERE removals_table.championship_id = sessions_table.championship_id
          AND removals_table.season_year = sessions_table.season_year
          AND removals_table.sport_id = sessions_table.sport_id
      )
  )
  SELECT 'MATCH'::TEXT, matches_table.id
  FROM public.matches AS matches_table
  WHERE matches_table.championship_id = _championship_id
    AND matches_table.season_year = _season_year
    AND matches_table.status = 'LIVE'
    AND matches_table.scheduled_date = timezone('America/Sao_Paulo', now())::DATE
    AND NOT EXISTS (
      SELECT 1
      FROM public.championship_season_sport_removals AS removals_table
      WHERE removals_table.championship_id = matches_table.championship_id
        AND removals_table.season_year = matches_table.season_year
        AND removals_table.sport_id = matches_table.sport_id
    )
  UNION ALL
  SELECT 'MATCH'::TEXT, scheduled_matches.id
  FROM scheduled_matches
  WHERE scheduled_matches.queue_position = 1
  UNION ALL
  SELECT 'INDIVIDUAL_SESSION'::TEXT, sessions_table.id
  FROM public.championship_individual_sessions AS sessions_table
  WHERE sessions_table.championship_id = _championship_id
    AND sessions_table.season_year = _season_year
    AND sessions_table.status = 'LIVE'
    AND sessions_table.scheduled_date = timezone('America/Sao_Paulo', now())::DATE
    AND NOT EXISTS (
      SELECT 1
      FROM public.championship_season_sport_removals AS removals_table
      WHERE removals_table.championship_id = sessions_table.championship_id
        AND removals_table.season_year = sessions_table.season_year
        AND removals_table.sport_id = sessions_table.sport_id
    )
  UNION ALL
  SELECT 'INDIVIDUAL_SESSION'::TEXT, scheduled_sessions.id
  FROM scheduled_sessions
  WHERE scheduled_sessions.queue_position = 1;
$$;

REVOKE ALL ON FUNCTION public.preview_championship_season_sport_removal(UUID, INTEGER, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_championship_season_sport(UUID, INTEGER, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_championship_season_sport_removal(UUID, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_championship_season_sport(UUID, INTEGER, UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
