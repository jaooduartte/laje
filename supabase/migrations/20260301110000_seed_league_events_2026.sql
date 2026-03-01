DO $$
DECLARE
  missing_teams TEXT;
BEGIN
  CREATE TEMP TABLE tmp_raw_events (
    organizer_label TEXT,
    event_name TEXT,
    event_date DATE,
    event_type_label TEXT
  ) ON COMMIT DROP;

  INSERT INTO tmp_raw_events (
    organizer_label,
    event_name,
    event_date,
    event_type_label
  )
  VALUES
    ('AAAMU', 'Reconhecimento dos Calouros', DATE '2026-02-22', 'HH'),
    ('AAAMU', 'Festa do Trote', DATE '2025-02-26', 'OPEN_BAR'),
    ('CCT', 'HH', DATE '2026-02-26', 'HH'),

    ('CCT', 'HH', DATE '2026-03-05', 'HH'),
    ('GARRUDOS', 'Calourada', DATE '2026-03-06', 'HH'),
    ('CCT', 'Integração 2026/1', DATE '2026-03-06', 'HH'),
    ('AAACOM', 'Calourada', DATE '2026-03-06', 'HH'),
    ('TAUROS', 'Calourada', DATE '2026-03-06', 'HH'),
    ('AAASF', 'Mais Uma Dose', DATE '2026-03-07', 'HH'),
    ('ADIN', 'HH', DATE '2026-03-12', 'HH'),
    ('CAMALEÃO', 'Integração', DATE '2026-03-13', 'HH'),
    ('LAJE', 'Calourada LAJE', DATE '2026-03-14', 'LAJE_EVENT'),
    ('AMEN', 'HH', DATE '2026-03-19', 'HH'),
    ('UCA', 'HH', DATE '2026-03-26', 'HH'),
    ('CAMALEÃO', 'Calourada', DATE '2026-03-27', 'HH'),

    ('ATENUN', 'HH', DATE '2026-04-02', 'HH'),
    ('UCA', 'HH', DATE '2026-04-09', 'HH'),
    ('CAMALEÃO', 'Imobilidade', DATE '2026-04-11', 'OPEN_BAR'),
    ('AAASF', 'Arritmia', DATE '2026-04-11', 'OPEN_BAR'),
    ('LAJE', 'Copa LAJE de Verão', DATE '2026-04-11', 'LAJE_EVENT'),
    ('LAJE', 'Copa LAJE de Verão', DATE '2026-04-12', 'LAJE_EVENT'),
    ('AAAMU', 'HH', DATE '2026-04-16', 'HH'),
    ('ADIN', 'Calourada', DATE '2026-04-18', 'HH'),
    ('CCT', 'HH', DATE '2026-04-23', 'HH'),
    ('CCT', 'HH', DATE '2026-04-30', 'HH'),

    ('ABUS', 'HH', DATE '2026-05-07', 'HH'),
    ('AAAUS', 'Happy Hour do Guerreiro', DATE '2026-05-09', 'HH'),
    ('AMEN', 'HH', DATE '2026-05-14', 'HH'),
    ('UCA', 'Se Beber, Não Jogue', DATE '2026-05-16', 'CHAMPIONSHIP'),
    ('UEFA', 'HH', DATE '2026-05-21', 'HH'),
    ('RASANTE', 'Geringonça', DATE '2026-05-23', 'OPEN_BAR'),
    ('ADIN', 'HH', DATE '2026-05-28', 'HH'),
    ('LAJE', 'Copa LAJE Society', DATE '2026-05-30', 'LAJE_EVENT'),
    ('LAJE', 'Copa LAJE Society', DATE '2026-05-31', 'LAJE_EVENT'),

    ('UEFA', 'HH', DATE '2026-06-04', 'HH'),
    ('UCA', 'Aniversário', DATE '2026-06-06', 'HH'),
    ('AMEN + CCT', 'HH', DATE '2026-06-11', 'HH'),
    ('ABUS', 'PTA', DATE '2026-06-12', 'HH'),
    ('CCT', 'Jurunina', DATE '2026-06-13', 'OPEN_BAR'),
    ('AAASF', 'Última Dose', DATE '2026-06-13', 'HH'),
    ('CAMALEÃO', 'Copa Mobilidade', DATE '2026-06-13', 'CHAMPIONSHIP'),
    ('CAMALEÃO', 'Copa Mobilidade', DATE '2026-06-14', 'CHAMPIONSHIP'),
    ('ABUS', 'HH', DATE '2026-06-18', 'HH'),
    ('UCA', 'HH', DATE '2026-06-19', 'HH'),
    ('CCT', 'HH com Jogo do Brasil', DATE '2026-06-24', 'HH'),
    ('AMEN', 'HH', DATE '2026-06-25', 'HH'),

    ('ATENUN', 'HH', DATE '2026-07-02', 'HH'),
    ('CCT', 'HH', DATE '2026-07-09', 'HH'),
    ('ENGÊNIOS', 'UAI', DATE '2026-07-11', 'OPEN_BAR'),
    ('CCT', 'HH', DATE '2026-07-16', 'HH'),
    ('CCT', 'HH', DATE '2026-07-23', 'HH'),
    ('ABUS', 'HH', DATE '2026-07-30', 'HH'),

    ('CCT', 'HH', DATE '2026-08-06', 'HH'),
    ('AAASF', 'Mais Uma Dose', DATE '2026-08-08', 'HH'),
    ('CAMALEÃO', 'HH', DATE '2026-08-13', 'HH'),
    ('ATENUN', 'HH', DATE '2026-08-13', 'HH'),
    ('LAJE', 'INTERLAJE', DATE '2026-08-15', 'LAJE_EVENT'),
    ('LAJE', 'INTERLAJE', DATE '2026-08-16', 'LAJE_EVENT'),
    ('ADIN', 'HH', DATE '2026-08-20', 'HH'),
    ('LAJE', 'INTERLAJE', DATE '2026-08-22', 'LAJE_EVENT'),
    ('LAJE', 'INTERLAJE', DATE '2026-08-23', 'LAJE_EVENT'),
    ('UEFA', 'HH', DATE '2026-08-27', 'HH'),
    ('CAMALEÃO', 'Calourada', DATE '2026-08-29', 'HH'),
    ('LAJE', 'INTERLAJE', DATE '2026-08-29', 'LAJE_EVENT'),
    ('LAJE', 'INTERLAJE', DATE '2026-08-30', 'LAJE_EVENT'),

    ('ATENUN', 'HH', DATE '2026-09-03', 'HH'),
    ('LAJE', 'INTERLAJE', DATE '2026-09-05', 'LAJE_EVENT'),
    ('LAJE', 'INTERLAJE', DATE '2026-09-06', 'LAJE_EVENT'),
    ('ABUS', 'HH', DATE '2026-09-10', 'HH'),
    ('LAJE', 'INTERLAJE', DATE '2026-09-12', 'LAJE_EVENT'),
    ('LAJE', 'INTERLAJE', DATE '2026-09-13', 'LAJE_EVENT'),
    ('UCA', 'HH', DATE '2026-09-17', 'HH'),
    ('AAASF', 'Arritmia', DATE '2026-09-19', 'OPEN_BAR'),
    ('UEFA', 'HH', DATE '2026-09-24', 'HH'),

    ('CCT', 'HH', DATE '2026-10-01', 'HH'),
    ('CCT', 'HH', DATE '2026-10-08', 'HH'),
    ('AAAUS + UCA', 'UCAAAUS', DATE '2026-10-10', 'HH'),
    ('ENGÊNIOS', 'Samba e Desejo', DATE '2026-10-11', 'HH'),
    ('AMEN', 'HH', DATE '2026-10-15', 'HH'),
    ('CAMALEÃO', 'Halloween', DATE '2026-10-17', 'HH'),
    ('UCA', 'HH', DATE '2026-10-22', 'HH'),
    ('UCA', 'HH', DATE '2026-10-29', 'HH'),
    ('ABUS', 'Halloween', DATE '2026-10-31', 'OPEN_BAR'),

    ('CAMALEÃO', 'Copa Mobilidade', DATE '2026-11-07', 'CHAMPIONSHIP'),
    ('CAMALEÃO', 'Copa Mobilidade', DATE '2026-11-08', 'CHAMPIONSHIP'),
    ('UEFA', 'Pool Party', DATE '2026-11-14', 'OPEN_BAR');

  CREATE TEMP TABLE tmp_resolved_events ON COMMIT DROP AS
  WITH normalized_events AS (
    SELECT
      organizer_label,
      split_part(organizer_label, ' + ', 1) AS primary_organizer_label,
      event_name,
      event_date,
      CASE event_type_label
        WHEN 'HH' THEN 'HH'::public.league_event_type
        WHEN 'OPEN_BAR' THEN 'OPEN_BAR'::public.league_event_type
        WHEN 'CHAMPIONSHIP' THEN 'CHAMPIONSHIP'::public.league_event_type
        WHEN 'LAJE_EVENT' THEN 'LAJE_EVENT'::public.league_event_type
      END AS event_type,
      CASE
        WHEN organizer_label = 'LAJE' THEN 'LAJE'::public.league_event_organizer_type
        ELSE 'ATHLETIC'::public.league_event_organizer_type
      END AS organizer_type
    FROM tmp_raw_events
  )
  SELECT
    normalized_events.organizer_label,
    normalized_events.event_name,
    normalized_events.event_date,
    normalized_events.event_type,
    normalized_events.organizer_type,
    teams.id AS organizer_team_id
  FROM normalized_events
  LEFT JOIN public.teams
    ON upper(teams.name) = upper(normalized_events.primary_organizer_label);

  SELECT string_agg(organizer_label, ', ' ORDER BY organizer_label)
    INTO missing_teams
  FROM (
    SELECT DISTINCT organizer_label
    FROM tmp_resolved_events
    WHERE organizer_type = 'ATHLETIC'::public.league_event_organizer_type
      AND organizer_team_id IS NULL
  ) AS missing_athletic_rows;

  IF missing_teams IS NOT NULL THEN
    RAISE EXCEPTION 'Atléticas não encontradas na tabela teams: %', missing_teams;
  END IF;

  INSERT INTO public.league_events (
    name,
    event_type,
    organizer_type,
    organizer_team_id,
    event_date,
    location
  )
  SELECT
    event_name,
    event_type,
    organizer_type,
    organizer_team_id,
    event_date,
    'A definir'::TEXT
  FROM tmp_resolved_events
  ON CONFLICT DO NOTHING;
END;
$$;
