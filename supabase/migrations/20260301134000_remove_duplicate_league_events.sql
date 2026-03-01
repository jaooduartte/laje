DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'league_events'
  ) THEN
    RAISE EXCEPTION 'Tabela public.league_events não encontrada.';
  END IF;
END
$$;

DO $$
DECLARE
  removed_duplicates_count INTEGER;
BEGIN
  WITH ranked_league_events AS (
    SELECT
      league_events.id,
      ROW_NUMBER() OVER (
        PARTITION BY
          league_events.name,
          league_events.event_type,
          league_events.organizer_type,
          league_events.organizer_team_id,
          league_events.event_date,
          league_events.location
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
    WHERE id IN (
      SELECT duplicate_league_events.id
      FROM duplicate_league_events
    )
    RETURNING id
  )
  SELECT COUNT(*)
  INTO removed_duplicates_count
  FROM deleted_league_events;

  RAISE NOTICE 'Eventos duplicados removidos: %', removed_duplicates_count;
END
$$;
