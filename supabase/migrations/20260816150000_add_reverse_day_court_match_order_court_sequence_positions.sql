CREATE OR REPLACE FUNCTION public.preview_championship_bracket_reconfiguration(
  _bracket_edition_id UUID,
  _action TEXT,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  revision_value BIGINT;
  before_schedule JSONB;
  preview_result JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_admin_tab_access('championship_schedule'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para reprogramar a agenda.';
  END IF;

  SELECT reprogramming_revision
  INTO revision_value
  FROM public.championship_bracket_editions AS editions_table
  JOIN public.championships AS championships_table ON championships_table.id = editions_table.championship_id
  WHERE editions_table.id = _bracket_edition_id
    AND championships_table.status = 'REVIEW'::public.championship_status;

  IF revision_value IS NULL THEN
    RAISE EXCEPTION 'A reprogramação só está disponível com o campeonato em revisão.';
  END IF;

  WITH numbered_matches AS (
    SELECT
      scoped_matches.id,
      row_number() OVER (
        PARTITION BY scoped_matches.numbering_scope
        ORDER BY
          scoped_matches.scheduled_date ASC,
          scoped_matches.start_time ASC NULLS LAST,
          COALESCE(scoped_matches.scheduled_slot, scoped_matches.queue_position) ASC NULLS LAST,
          scoped_matches.created_at ASC,
          scoped_matches.id ASC
      )::INTEGER AS match_number
    FROM (
      SELECT
        matches_table.id,
        matches_table.scheduled_date,
        matches_table.start_time,
        matches_table.scheduled_slot,
        matches_table.queue_position,
        matches_table.created_at,
        CASE
          WHEN editions_table.payload_snapshot ->> 'match_numbering_mode' = 'SPORT_NAIPE'
            THEN concat_ws('::', matches_table.sport_id::TEXT, matches_table.naipe::TEXT)
          WHEN editions_table.payload_snapshot ->> 'match_numbering_mode' = 'SPORT'
            THEN matches_table.sport_id::TEXT
          ELSE concat_ws(
            '::',
            public.normalize_bracket_entity_name(matches_table.location),
            public.normalize_bracket_entity_name(COALESCE(matches_table.court_name, ''))
          )
        END AS numbering_scope
      FROM public.matches AS matches_table
      JOIN public.championship_bracket_editions AS editions_table
        ON editions_table.championship_id = matches_table.championship_id
      WHERE editions_table.id = _bracket_edition_id
        AND matches_table.season_year = editions_table.season_year
        AND matches_table.scheduled_date IS NOT NULL
    ) AS scoped_matches
  ),
  court_positions AS (
    SELECT
      matches_table.id,
      row_number() OVER (
        PARTITION BY
          matches_table.scheduled_date,
          public.normalize_bracket_entity_name(matches_table.location),
          public.normalize_bracket_entity_name(COALESCE(matches_table.court_name, ''))
        ORDER BY
          matches_table.start_time ASC NULLS LAST,
          COALESCE(matches_table.scheduled_slot, matches_table.queue_position) ASC NULLS LAST,
          matches_table.global_queue_order ASC NULLS LAST,
          matches_table.created_at ASC,
          matches_table.id ASC
      )::INTEGER AS court_sequence_position
    FROM public.matches AS matches_table
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.championship_id = matches_table.championship_id
    WHERE editions_table.id = _bracket_edition_id
      AND matches_table.season_year = editions_table.season_year
      AND matches_table.status = 'SCHEDULED'::public.match_status
      AND matches_table.scheduled_date IS NOT NULL
  ),
  match_snapshots AS (
    SELECT
      matches_table.id,
      jsonb_build_object(
        'scheduled_date', matches_table.scheduled_date,
        'start_time', matches_table.start_time,
        'end_time', matches_table.end_time,
        'location', matches_table.location,
        'court_name', matches_table.court_name,
        'queue_position', matches_table.queue_position,
        'global_queue_order', matches_table.global_queue_order,
        'scheduled_slot', matches_table.scheduled_slot,
        'court_sequence_position', CASE
          WHEN _action = 'REVERSE_DAY_COURT_MATCH_ORDER' THEN court_positions.court_sequence_position
          ELSE NULL
        END,
        'manual_representation_mode', matches_table.manual_representation_mode,
        'match_number', numbered_matches.match_number,
        'sport_name', sports_table.name,
        'naipe', matches_table.naipe,
        'home_team_name', home_teams_table.name,
        'away_team_name', away_teams_table.name
      ) AS snapshot
    FROM public.matches AS matches_table
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.championship_id = matches_table.championship_id
    LEFT JOIN numbered_matches ON numbered_matches.id = matches_table.id
    LEFT JOIN court_positions ON court_positions.id = matches_table.id
    LEFT JOIN public.sports AS sports_table ON sports_table.id = matches_table.sport_id
    LEFT JOIN public.teams AS home_teams_table ON home_teams_table.id = matches_table.home_team_id
    LEFT JOIN public.teams AS away_teams_table ON away_teams_table.id = matches_table.away_team_id
    WHERE editions_table.id = _bracket_edition_id
      AND matches_table.season_year = editions_table.season_year
  )
  SELECT COALESCE(jsonb_object_agg(match_snapshots.id, match_snapshots.snapshot), '{}'::jsonb)
  INTO before_schedule
  FROM match_snapshots;

  BEGIN
    PERFORM public.execute_championship_bracket_reconfiguration(
      _bracket_edition_id,
      _action,
      COALESCE(_payload, '{}'::jsonb)
    );

    SELECT jsonb_build_object(
      'revision', revision_value,
      'action', _action,
      'affected_matches', count(*)::integer,
      'changes', COALESCE(jsonb_agg(jsonb_build_object(
        'match_id', after_item.key,
        'match_number', NULLIF(before_item.value ->> 'match_number', '')::INTEGER,
        'before', before_item.value,
        'after', after_item.value,
        'changed_fields', array_remove(ARRAY[
          CASE WHEN before_item.value->'scheduled_date' IS DISTINCT FROM after_item.value->'scheduled_date' THEN 'data' END,
          CASE WHEN before_item.value->'start_time' IS DISTINCT FROM after_item.value->'start_time' THEN 'horário de início' END,
          CASE WHEN before_item.value->'end_time' IS DISTINCT FROM after_item.value->'end_time' THEN 'horário de término' END,
          CASE WHEN before_item.value->'location' IS DISTINCT FROM after_item.value->'location' THEN 'local' END,
          CASE WHEN before_item.value->'court_name' IS DISTINCT FROM after_item.value->'court_name' THEN 'quadra' END,
          CASE WHEN before_item.value->'queue_position' IS DISTINCT FROM after_item.value->'queue_position' OR before_item.value->'global_queue_order' IS DISTINCT FROM after_item.value->'global_queue_order' OR before_item.value->'scheduled_slot' IS DISTINCT FROM after_item.value->'scheduled_slot' THEN 'posição' END,
          CASE WHEN before_item.value->'manual_representation_mode' IS DISTINCT FROM after_item.value->'manual_representation_mode' THEN 'representação' END
        ], NULL)
      ) ORDER BY
        NULLIF(after_item.value ->> 'scheduled_date', '')::DATE,
        NULLIF(after_item.value ->> 'start_time', '')::TIMESTAMPTZ,
        COALESCE(
          NULLIF(after_item.value ->> 'scheduled_slot', '')::INTEGER,
          NULLIF(after_item.value ->> 'queue_position', '')::INTEGER
        ),
        after_item.key), '[]'::jsonb),
      'blockers', '[]'::jsonb
    )
    INTO preview_result
    FROM jsonb_each(before_schedule) AS before_item
    JOIN jsonb_each((
      WITH numbered_matches AS (
        SELECT
          scoped_matches.id,
          row_number() OVER (
            PARTITION BY scoped_matches.numbering_scope
            ORDER BY
              scoped_matches.scheduled_date ASC,
              scoped_matches.start_time ASC NULLS LAST,
              COALESCE(scoped_matches.scheduled_slot, scoped_matches.queue_position) ASC NULLS LAST,
              scoped_matches.created_at ASC,
              scoped_matches.id ASC
          )::INTEGER AS match_number
        FROM (
          SELECT
            matches_table.id,
            matches_table.scheduled_date,
            matches_table.start_time,
            matches_table.scheduled_slot,
            matches_table.queue_position,
            matches_table.created_at,
            CASE
              WHEN editions_table.payload_snapshot ->> 'match_numbering_mode' = 'SPORT_NAIPE'
                THEN concat_ws('::', matches_table.sport_id::TEXT, matches_table.naipe::TEXT)
              WHEN editions_table.payload_snapshot ->> 'match_numbering_mode' = 'SPORT'
                THEN matches_table.sport_id::TEXT
              ELSE concat_ws(
                '::',
                public.normalize_bracket_entity_name(matches_table.location),
                public.normalize_bracket_entity_name(COALESCE(matches_table.court_name, ''))
              )
            END AS numbering_scope
          FROM public.matches AS matches_table
          JOIN public.championship_bracket_editions AS editions_table
            ON editions_table.championship_id = matches_table.championship_id
          WHERE editions_table.id = _bracket_edition_id
            AND matches_table.season_year = editions_table.season_year
            AND matches_table.scheduled_date IS NOT NULL
        ) AS scoped_matches
      ),
      court_positions AS (
        SELECT
          matches_table.id,
          row_number() OVER (
            PARTITION BY
              matches_table.scheduled_date,
              public.normalize_bracket_entity_name(matches_table.location),
              public.normalize_bracket_entity_name(COALESCE(matches_table.court_name, ''))
            ORDER BY
              matches_table.start_time ASC NULLS LAST,
              COALESCE(matches_table.scheduled_slot, matches_table.queue_position) ASC NULLS LAST,
              matches_table.global_queue_order ASC NULLS LAST,
              matches_table.created_at ASC,
              matches_table.id ASC
          )::INTEGER AS court_sequence_position
        FROM public.matches AS matches_table
        JOIN public.championship_bracket_editions AS editions_table
          ON editions_table.championship_id = matches_table.championship_id
        WHERE editions_table.id = _bracket_edition_id
          AND matches_table.season_year = editions_table.season_year
          AND matches_table.status = 'SCHEDULED'::public.match_status
          AND matches_table.scheduled_date IS NOT NULL
      ),
      match_snapshots AS (
        SELECT
          matches_table.id,
          jsonb_build_object(
            'scheduled_date', matches_table.scheduled_date,
            'start_time', matches_table.start_time,
            'end_time', matches_table.end_time,
            'location', matches_table.location,
            'court_name', matches_table.court_name,
            'queue_position', matches_table.queue_position,
            'global_queue_order', matches_table.global_queue_order,
            'scheduled_slot', matches_table.scheduled_slot,
            'court_sequence_position', CASE
              WHEN _action = 'REVERSE_DAY_COURT_MATCH_ORDER' THEN court_positions.court_sequence_position
              ELSE NULL
            END,
            'manual_representation_mode', matches_table.manual_representation_mode,
            'match_number', numbered_matches.match_number,
            'sport_name', sports_table.name,
            'naipe', matches_table.naipe,
            'home_team_name', home_teams_table.name,
            'away_team_name', away_teams_table.name
          ) AS snapshot
        FROM public.matches AS matches_table
        JOIN public.championship_bracket_editions AS editions_table
          ON editions_table.championship_id = matches_table.championship_id
        LEFT JOIN numbered_matches ON numbered_matches.id = matches_table.id
        LEFT JOIN court_positions ON court_positions.id = matches_table.id
        LEFT JOIN public.sports AS sports_table ON sports_table.id = matches_table.sport_id
        LEFT JOIN public.teams AS home_teams_table ON home_teams_table.id = matches_table.home_team_id
        LEFT JOIN public.teams AS away_teams_table ON away_teams_table.id = matches_table.away_team_id
        WHERE editions_table.id = _bracket_edition_id
          AND matches_table.season_year = editions_table.season_year
      )
      SELECT COALESCE(jsonb_object_agg(match_snapshots.id, match_snapshots.snapshot), '{}'::jsonb)
      FROM match_snapshots
    )) AS after_item ON after_item.key = before_item.key
    WHERE before_item.value IS DISTINCT FROM after_item.value;

    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ROLLBACK_CHAMPIONSHIP_BRACKET_RECONFIGURATION_PREVIEW';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'ROLLBACK_CHAMPIONSHIP_BRACKET_RECONFIGURATION_PREVIEW' THEN
      preview_result := jsonb_build_object(
        'revision', revision_value,
        'action', _action,
        'affected_matches', 0,
        'changes', '[]'::jsonb,
        'blockers', jsonb_build_array(SQLERRM)
      );
    END IF;
  WHEN OTHERS THEN
    preview_result := jsonb_build_object(
      'revision', revision_value,
      'action', _action,
      'affected_matches', 0,
      'changes', '[]'::jsonb,
      'blockers', jsonb_build_array(SQLERRM)
    );
  END;

  RETURN COALESCE(preview_result, jsonb_build_object(
    'revision', revision_value,
    'action', _action,
    'affected_matches', 0,
    'changes', '[]'::jsonb,
    'blockers', '[]'::jsonb
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.preview_championship_bracket_reconfiguration(UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_championship_bracket_reconfiguration(UUID, TEXT, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
