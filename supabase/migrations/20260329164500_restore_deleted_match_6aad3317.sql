DO $$
BEGIN
  IF to_regclass('public.matches') IS NULL THEN
    RAISE EXCEPTION 'Tabela public.matches não encontrada.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.matches
    WHERE id = '6aad3317-e876-40cd-88fa-860df1a17719'::uuid
  ) THEN
    RAISE NOTICE 'Jogo 6aad3317-e876-40cd-88fa-860df1a17719 já existe. Nada para restaurar.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.championships
    WHERE id = '5edbcb36-0864-4a7c-9e89-e72c27c3455f'::uuid
  ) THEN
    RAISE EXCEPTION 'Campeonato do jogo removido não encontrado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sports
    WHERE id = '0fc41497-0972-4529-ad20-cfe8418ad7e8'::uuid
  ) THEN
    RAISE EXCEPTION 'Modalidade do jogo removido não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.teams
    WHERE id = 'cd654b17-ef2b-4ff8-aee3-37863a26e730'::uuid
  ) THEN
    RAISE EXCEPTION 'Atlética mandante do jogo removido não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.teams
    WHERE id = '1ebe409c-171f-4c17-8078-3dc6fd0451b3'::uuid
  ) THEN
    RAISE EXCEPTION 'Atlética visitante do jogo removido não encontrada.';
  END IF;

  INSERT INTO public.matches (
    id,
    sport_id,
    home_team_id,
    away_team_id,
    location,
    start_time,
    end_time,
    status,
    home_score,
    away_score,
    created_at,
    championship_id,
    division,
    naipe,
    supports_cards,
    home_yellow_cards,
    home_red_cards,
    away_yellow_cards,
    away_red_cards,
    court_name,
    season_year,
    scheduled_date,
    queue_position,
    current_set_home_score,
    current_set_away_score,
    resolved_tie_breaker_rule,
    resolved_tie_break_winner_team_id,
    global_queue_order,
    scheduled_slot
  )
  VALUES (
    '6aad3317-e876-40cd-88fa-860df1a17719'::uuid,
    '0fc41497-0972-4529-ad20-cfe8418ad7e8'::uuid,
    'cd654b17-ef2b-4ff8-aee3-37863a26e730'::uuid,
    '1ebe409c-171f-4c17-8078-3dc6fd0451b3'::uuid,
    'Praia de Piçarras',
    NULL,
    NULL,
    'SCHEDULED'::public.match_status,
    0,
    0,
    '2026-03-18T03:22:47.280859+00:00'::timestamptz,
    '5edbcb36-0864-4a7c-9e89-e72c27c3455f'::uuid,
    NULL,
    'MASCULINO'::public.match_naipe,
    FALSE,
    0,
    0,
    0,
    0,
    NULL,
    2026,
    '2026-04-11'::date,
    1,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    1
  )
  ON CONFLICT (id) DO NOTHING;
END
$$;
