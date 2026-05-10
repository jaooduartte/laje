DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'league_event_reservation_request_status'
  ) THEN
    CREATE TYPE public.league_event_reservation_request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END
$$;

ALTER TABLE public.league_events
  DROP COLUMN IF EXISTS location;

CREATE TABLE IF NOT EXISTS public.league_event_reservation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  event_name TEXT NOT NULL,
  event_type public.league_event_type NOT NULL,
  event_date DATE NOT NULL,
  requester_name TEXT NOT NULL,
  requester_contact TEXT NOT NULL,
  status public.league_event_reservation_request_status NOT NULL DEFAULT 'PENDING'::public.league_event_reservation_request_status,
  approved_league_event_id UUID NULL REFERENCES public.league_events(id) ON DELETE SET NULL,
  review_notes TEXT NULL,
  reviewed_at TIMESTAMPTZ NULL,
  reviewed_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS league_event_reservation_requests_event_date_idx
  ON public.league_event_reservation_requests (event_date);

CREATE INDEX IF NOT EXISTS league_event_reservation_requests_status_idx
  ON public.league_event_reservation_requests (status);

CREATE INDEX IF NOT EXISTS league_event_reservation_requests_team_id_idx
  ON public.league_event_reservation_requests (team_id);

CREATE OR REPLACE FUNCTION public.set_league_event_reservation_requests_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_league_event_reservation_requests_updated_at_trigger ON public.league_event_reservation_requests;

CREATE TRIGGER set_league_event_reservation_requests_updated_at_trigger
BEFORE UPDATE ON public.league_event_reservation_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_league_event_reservation_requests_updated_at();

ALTER TABLE public.league_event_reservation_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_event_reservation_requests'
      AND policyname = 'Public can create league event reservation requests'
  ) THEN
    ALTER POLICY "Public can create league event reservation requests"
      ON public.league_event_reservation_requests
      WITH CHECK (
        status = 'PENDING'::public.league_event_reservation_request_status
        AND approved_league_event_id IS NULL
        AND reviewed_at IS NULL
        AND reviewed_by IS NULL
      );
  ELSE
    CREATE POLICY "Public can create league event reservation requests"
      ON public.league_event_reservation_requests
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (
        status = 'PENDING'::public.league_event_reservation_request_status
        AND approved_league_event_id IS NULL
        AND reviewed_at IS NULL
        AND reviewed_by IS NULL
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_event_reservation_requests'
      AND policyname = 'Admin can read league event reservation requests'
  ) THEN
    ALTER POLICY "Admin can read league event reservation requests"
      ON public.league_event_reservation_requests
      USING (public.has_admin_tab_access('events'::public.admin_panel_tab, true));
  ELSE
    CREATE POLICY "Admin can read league event reservation requests"
      ON public.league_event_reservation_requests
      FOR SELECT
      TO authenticated
      USING (public.has_admin_tab_access('events'::public.admin_panel_tab, true));
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_event_reservation_requests'
      AND policyname = 'Admin can update league event reservation requests'
  ) THEN
    ALTER POLICY "Admin can update league event reservation requests"
      ON public.league_event_reservation_requests
      USING (public.has_admin_tab_access('events'::public.admin_panel_tab, true))
      WITH CHECK (public.has_admin_tab_access('events'::public.admin_panel_tab, true));
  ELSE
    CREATE POLICY "Admin can update league event reservation requests"
      ON public.league_event_reservation_requests
      FOR UPDATE
      TO authenticated
      USING (public.has_admin_tab_access('events'::public.admin_panel_tab, true))
      WITH CHECK (public.has_admin_tab_access('events'::public.admin_panel_tab, true));
  END IF;
END
$$;

GRANT SELECT, INSERT ON public.league_event_reservation_requests TO anon, authenticated;
GRANT UPDATE ON public.league_event_reservation_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.write_championship_bracket_workflow_log(
  _action_type public.admin_action_type,
  _step TEXT,
  _description TEXT DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.write_admin_action_log(
    _action_type,
    'public.championship_bracket_workflow',
    NULL,
    _description,
    NULL,
    NULL,
    jsonb_strip_nulls(
      jsonb_build_object(
        'step', _step,
        'workflow_action', COALESCE(_metadata ->> 'workflow_action', NULL)
      ) || COALESCE(_metadata, '{}'::jsonb)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.write_championship_bracket_workflow_log(
  public.admin_action_type,
  TEXT,
  TEXT,
  JSONB
) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_league_event_reservation_request(
  _request_id UUID,
  _decision public.league_event_reservation_request_status,
  _review_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_row public.league_event_reservation_requests%ROWTYPE;
  updated_request_row public.league_event_reservation_requests%ROWTYPE;
  created_league_event_row public.league_events%ROWTYPE;
BEGIN
  IF NOT public.has_admin_tab_access('events'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Você não tem permissão para revisar reservas do calendário da liga.';
  END IF;

  IF _decision NOT IN (
    'APPROVED'::public.league_event_reservation_request_status,
    'REJECTED'::public.league_event_reservation_request_status
  ) THEN
    RAISE EXCEPTION 'A decisão informada é inválida para revisão da reserva.';
  END IF;

  SELECT *
  INTO request_row
  FROM public.league_event_reservation_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação de reserva não encontrada.';
  END IF;

  IF request_row.status <> 'PENDING'::public.league_event_reservation_request_status THEN
    RAISE EXCEPTION 'Esta solicitação já foi analisada.';
  END IF;

  IF _decision = 'APPROVED'::public.league_event_reservation_request_status THEN
    INSERT INTO public.league_events (
      name,
      event_type,
      organizer_type,
      organizer_team_id,
      event_date
    ) VALUES (
      request_row.event_name,
      request_row.event_type,
      'ATHLETIC'::public.league_event_organizer_type,
      request_row.team_id,
      request_row.event_date
    )
    RETURNING *
    INTO created_league_event_row;

    INSERT INTO public.league_event_organizer_teams (event_id, team_id)
    VALUES (created_league_event_row.id, request_row.team_id);
  END IF;

  UPDATE public.league_event_reservation_requests
  SET
    status = _decision,
    approved_league_event_id = CASE
      WHEN _decision = 'APPROVED'::public.league_event_reservation_request_status THEN created_league_event_row.id
      ELSE NULL
    END,
    review_notes = NULLIF(BTRIM(COALESCE(_review_notes, '')), ''),
    reviewed_at = timezone('utc', now()),
    reviewed_by = auth.uid(),
    updated_at = timezone('utc', now())
  WHERE id = _request_id
  RETURNING *
  INTO updated_request_row;

  PERFORM public.write_admin_action_log(
    'UPDATE'::public.admin_action_type,
    'public.league_event_reservation_requests',
    updated_request_row.id::text,
    CASE
      WHEN _decision = 'APPROVED'::public.league_event_reservation_request_status
        THEN 'Reserva do calendário aprovada.'
      ELSE 'Reserva do calendário recusada.'
    END,
    to_jsonb(request_row),
    to_jsonb(updated_request_row),
    jsonb_strip_nulls(
      jsonb_build_object(
        'approved_league_event_id',
        CASE
          WHEN created_league_event_row.id IS NULL THEN NULL
          ELSE created_league_event_row.id::text
        END
      )
    )
  );

  RETURN jsonb_build_object(
    'request',
    to_jsonb(updated_request_row),
    'league_event',
    CASE
      WHEN created_league_event_row.id IS NULL THEN NULL
      ELSE to_jsonb(created_league_event_row)
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_league_event_reservation_request(
  UUID,
  public.league_event_reservation_request_status,
  TEXT
) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_home_dashboard_metrics(_season_year INTEGER DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_season_year INTEGER;
  top_performance JSONB;
  most_matches JSONB;
  most_appearances JSONB;
  season_highlights JSONB;
BEGIN
  SELECT COALESCE(_season_year, MAX(championships.current_season_year))
  INTO resolved_season_year
  FROM public.championships AS championships;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'team_id', ranking.team_id,
        'team_name', ranking.team_name,
        'value', ranking.total_points,
        'secondary_value', ranking.total_wins
      )
      ORDER BY ranking.total_points DESC, ranking.total_wins DESC, ranking.team_name ASC
    ),
    '[]'::jsonb
  )
  INTO top_performance
  FROM (
    SELECT
      standings.team_id,
      teams.name AS team_name,
      SUM(standings.points)::int AS total_points,
      SUM(standings.wins)::int AS total_wins
    FROM public.standings AS standings
    INNER JOIN public.teams AS teams
      ON teams.id = standings.team_id
    GROUP BY standings.team_id, teams.name
    ORDER BY total_points DESC, total_wins DESC, teams.name ASC
    LIMIT 5
  ) AS ranking;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'team_id', ranking.team_id,
        'team_name', ranking.team_name,
        'value', ranking.matches_count,
        'secondary_value', ranking.finished_matches_count
      )
      ORDER BY ranking.matches_count DESC, ranking.finished_matches_count DESC, ranking.team_name ASC
    ),
    '[]'::jsonb
  )
  INTO most_matches
  FROM (
    SELECT
      team_matches.team_id,
      teams.name AS team_name,
      SUM(team_matches.matches_count)::int AS matches_count,
      SUM(team_matches.finished_matches_count)::int AS finished_matches_count
    FROM (
      SELECT
        matches.home_team_id AS team_id,
        COUNT(*)::int AS matches_count,
        COUNT(*) FILTER (WHERE matches.status = 'FINISHED'::public.match_status)::int AS finished_matches_count
      FROM public.matches AS matches
      GROUP BY matches.home_team_id

      UNION ALL

      SELECT
        matches.away_team_id AS team_id,
        COUNT(*)::int AS matches_count,
        COUNT(*) FILTER (WHERE matches.status = 'FINISHED'::public.match_status)::int AS finished_matches_count
      FROM public.matches AS matches
      GROUP BY matches.away_team_id
    ) AS team_matches
    INNER JOIN public.teams AS teams
      ON teams.id = team_matches.team_id
    GROUP BY team_matches.team_id, teams.name
    ORDER BY matches_count DESC, finished_matches_count DESC, teams.name ASC
    LIMIT 5
  ) AS ranking;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'team_id', ranking.team_id,
        'team_name', ranking.team_name,
        'value', ranking.season_count,
        'secondary_value', ranking.bracket_count
      )
      ORDER BY ranking.season_count DESC, ranking.bracket_count DESC, ranking.team_name ASC
    ),
    '[]'::jsonb
  )
  INTO most_appearances
  FROM (
    SELECT
      standings.team_id,
      teams.name AS team_name,
      COUNT(DISTINCT standings.season_year)::int AS season_count,
      COUNT(*)::int AS bracket_count
    FROM public.standings AS standings
    INNER JOIN public.teams AS teams
      ON teams.id = standings.team_id
    GROUP BY standings.team_id, teams.name
    ORDER BY season_count DESC, bracket_count DESC, teams.name ASC
    LIMIT 5
  ) AS ranking;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'team_id', ranking.team_id,
        'team_name', ranking.team_name,
        'value', ranking.total_points,
        'secondary_value', ranking.total_wins
      )
      ORDER BY ranking.total_points DESC, ranking.total_wins DESC, ranking.team_name ASC
    ),
    '[]'::jsonb
  )
  INTO season_highlights
  FROM (
    SELECT
      standings.team_id,
      teams.name AS team_name,
      SUM(standings.points)::int AS total_points,
      SUM(standings.wins)::int AS total_wins
    FROM public.standings AS standings
    INNER JOIN public.teams AS teams
      ON teams.id = standings.team_id
    WHERE standings.season_year = resolved_season_year
    GROUP BY standings.team_id, teams.name
    ORDER BY total_points DESC, total_wins DESC, teams.name ASC
    LIMIT 5
  ) AS ranking;

  RETURN jsonb_build_object(
    'season_year', resolved_season_year,
    'top_performance', top_performance,
    'most_matches', most_matches,
    'most_appearances', most_appearances,
    'season_highlights', season_highlights
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_home_dashboard_metrics(INTEGER) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.remove_duplicate_league_events()
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH ranked_league_events AS (
    SELECT
      league_events.id,
      row_number() OVER (
        PARTITION BY
          league_events.name,
          league_events.event_type,
          league_events.organizer_type,
          league_events.organizer_team_id,
          league_events.event_date
        ORDER BY
          league_events.created_at ASC,
          league_events.id ASC
      ) AS duplicate_order
    FROM public.league_events AS league_events
  ),
  duplicate_league_events AS (
    SELECT ranked_league_events.id
    FROM ranked_league_events
    WHERE ranked_league_events.duplicate_order > 1
  ),
  deleted_league_events AS (
    DELETE FROM public.league_events
    WHERE public.league_events.id IN (
      SELECT duplicate_league_events.id
      FROM duplicate_league_events
    )
    RETURNING public.league_events.id
  )
  SELECT COUNT(*)
  INTO deleted_count
  FROM deleted_league_events;

  RETURN COALESCE(deleted_count, 0);
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'league_event_reservation_requests'
  ) THEN
    RETURN;
  END IF;

  ALTER PUBLICATION supabase_realtime ADD TABLE public.league_event_reservation_requests;
END
$$;
