-- Centraliza a agenda oficial da Copa Laje Society 2026 em um helper interno
-- e reaplica essa matriz sempre que a redistribuição do chaveamento roda.
--
-- Objetivos:
-- - corrigir o drift atual do dia 21/06/2026 com a planilha como fonte oficial;
-- - preservar start/end reais de jogos LIVE/FINISHED;
-- - manter horários planejados estáveis para partidas SCHEDULED;
-- - preparar semifinais e finais futuras para cair nos jogos/quadras oficiais.

CREATE OR REPLACE FUNCTION public.apply_society_2026_official_schedule(
  _bracket_edition_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_bracket_edition_id CONSTANT uuid := 'a63df7b3-752e-421a-bf08-dcebeef99643'::uuid;
  target_championship_id CONSTANT uuid := '17b92cf5-dd92-44eb-9295-b28000372e4b'::uuid;
  target_season_year CONSTANT integer := 2026;
  target_sport_name CONSTANT text := 'Futebol Society';
  expected_group_stage_match_count CONSTANT integer := 45;
  matched_group_stage_match_count integer := 0;
BEGIN
  IF _bracket_edition_id IS DISTINCT FROM target_bracket_edition_id THEN
    RETURN;
  END IF;

  PERFORM set_config('app.skip_queue_trigger', 'true', true);
  PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);

  DROP TABLE IF EXISTS tmp_society_2026_official_schedule_rows;
  CREATE TEMP TABLE tmp_society_2026_official_schedule_rows (
    phase public.bracket_phase NOT NULL,
    competition_id UUID NULL,
    round_number INTEGER NULL,
    slot_number INTEGER NULL,
    is_third_place BOOLEAN NOT NULL DEFAULT false,
    scheduled_date DATE NOT NULL,
    location TEXT NOT NULL,
    court_name TEXT NOT NULL,
    planned_start_time TIME NOT NULL,
    scheduled_slot INTEGER NOT NULL,
    queue_position INTEGER NOT NULL,
    naipe public.match_naipe NOT NULL,
    division public.team_division NULL,
    home_team_name TEXT NULL,
    away_team_name TEXT NULL,
    sheet_representation TEXT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_society_2026_official_schedule_rows (
    phase,
    competition_id,
    round_number,
    slot_number,
    is_third_place,
    scheduled_date,
    location,
    court_name,
    planned_start_time,
    scheduled_slot,
    queue_position,
    naipe,
    division,
    home_team_name,
    away_team_name,
    sheet_representation
  )
  VALUES
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra A', time '08:00',  1,  1, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'AAAUS',     'RASANTE',   'CO'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra A', time '08:40',  2,  2, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'RAPOSAS',   'AAAMU',     'AAAUS x RASANTE'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra A', time '09:20',  3,  3, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'GARRUDOS',  'CCT',       'RAPOSAS x AAAMU'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra A', time '10:00',  4,  4, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'TAUROS',    'CAMALEÃO',  'GARRUDOS x CCT'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra A', time '10:40',  5,  5, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'AAAMU',     'UEFA',      'TAUROS x CAMALEÃO'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra A', time '11:20',  6,  6, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'GARRUDOS',  'RASANTE',   'AAAMU x UEFA'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra A', time '13:00',  7,  7, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'ATENUN',    'TAUROS',    'GARRUDOS x RASANTE'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra A', time '13:40',  8,  8, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'AAASF',     'CCT',       'ATENUN x TAUROS'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra A', time '14:20',  9,  9, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'CAMALEÃO',  'RAPOSAS',   'AAASF x CCT'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra A', time '15:00', 10, 10, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'AAASF',     'RASANTE',   'CAMALEÃO x RAPOSAS'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra A', time '15:40', 11, 11, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'TAUROS',    'ADIN',      'AAASF x RASANTE'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra A', time '16:20', 12, 12, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'UEFA',      'GARRUDOS',  'TAUROS x ADIN'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra A', time '17:00', 13, 13, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'ATENUN',    'AAAMU',     'UEFA x GARRUDOS'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra A', time '17:40', 14, 14, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'AAASF',     'CAMALEÃO',  'ATENUN x AAAMU'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra A', time '18:20', 15, 15, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'ATENUN',    'AAAUS',     'AAASF x CAMALEÃO'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra A', time '19:00', 16, 16, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'CCT',       'AAAMU',     'ATENUN x AAAUS'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra A', time '19:40', 17, 17, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'AAASF',     'UEFA',      'CCT x AAAMU'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra A', time '20:20', 18, 18, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'RASANTE',   'RAPOSAS',   'AAASF x UEFA'),

    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra B', time '08:00',  1,  1, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'AAJ',       'ABUS',      'CO'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra B', time '10:00',  4,  2, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     'AFA',       'AMEN',      'AAJ x ABUS'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra B', time '10:40',  5,  3, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'ENGÊNIOS',  'AACOM',     'AFA x AMEN'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra B', time '11:20',  6,  4, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     'AGUA',      'SOBERANOS', 'ENGÊNIOS x AACOM'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra B', time '13:00',  7,  5, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'UCA',       'AMEN',      'AGUA x SOBERANOS'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra B', time '13:40',  8,  6, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     'AFA',       'AAJ',       'UCA x AMEN'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra B', time '14:20',  9,  7, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'ACATO',     'SOBERANOS', 'AFA x AAJ'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra B', time '15:00', 10,  8, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     'AGUA',      'UCA',       'ACATO x SOBERANOS'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra B', time '15:40', 11,  9, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'AAJ',       'ENGÊNIOS',  'AGUA x UCA'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra B', time '16:20', 12, 10, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'ABUS',      'AACOM',     'AAJ x ENGÊNIOS'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra B', time '17:00', 13, 11, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     'AMEN',      'AAJ',       'ABUS x AACOM'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra B', time '17:40', 14, 12, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'AFA',       'SOBERANOS', 'AMEN x AAJ'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra B', time '18:20', 15, 13, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'UCA',       'AGUA',      'AFA x SOBERANOS'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra B', time '19:00', 16, 14, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'ABUS',      'ENGÊNIOS',  'UCA x AGUA'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-20'::date, 'Arena Seven', 'Quadra B', time '19:40', 17, 15, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     'UCA',       'SOBERANOS', 'ABUS x ENGÊNIOS'),

    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-21'::date, 'Arena Seven', 'Quadra A', time '08:00',  1, 19, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'GARRUDOS',  'AAAUS',     'CO'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-21'::date, 'Arena Seven', 'Quadra A', time '08:40',  2, 20, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'ADIN',      'CAMALEÃO',  'GARRUDOS x AAAUS'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-21'::date, 'Arena Seven', 'Quadra A', time '09:20',  3, 21, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'RAPOSAS',   'AAASF',     'ADIN x CAMALEÃO'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-21'::date, 'Arena Seven', 'Quadra A', time '10:00',  4, 22, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'AAAMU',     'GARRUDOS',  'RAPOSAS x AAASF'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-21'::date, 'Arena Seven', 'Quadra A', time '10:40',  5, 23, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'UEFA',      'CCT',       'AAAMU x GARRUDOS'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-21'::date, 'Arena Seven', 'Quadra A', time '11:20',  6, 24, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'AAAUS',     'TAUROS',    'UEFA x CCT'),

    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-21'::date, 'Arena Seven', 'Quadra B', time '08:00',  1, 17, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'AMEN',      'AGUA',      'CO'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-21'::date, 'Arena Seven', 'Quadra B', time '08:40',  2, 18, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'AACOM',     'AAJ',       'AMEN x AGUA'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-21'::date, 'Arena Seven', 'Quadra B', time '09:20',  3, 19, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'CCT',       'UEFA',      'AACOM x AAJ'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-21'::date, 'Arena Seven', 'Quadra B', time '10:00',  4, 20, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'CAMALEÃO',  'RASANTE',   'CCT x UEFA'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-21'::date, 'Arena Seven', 'Quadra B', time '10:40',  5, 21, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'ATENUN',    'RAPOSAS',   'CAMALEÃO x RASANTE'),
    ('GROUP_STAGE'::public.bracket_phase, NULL, NULL, NULL, false, '2026-06-21'::date, 'Arena Seven', 'Quadra B', time '11:20',  6, 16, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'ACATO',     'AFA',       'ATENUN x RAPOSAS'),

    ('KNOCKOUT'::public.bracket_phase, 'c1cef97e-0589-48dd-b278-9badf0fc51e9'::uuid, 1, 1, false, '2026-06-21'::date, 'Arena Seven', 'Quadra A', time '13:00',  7, 25, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, NULL, NULL, NULL),
    ('KNOCKOUT'::public.bracket_phase, 'c1cef97e-0589-48dd-b278-9badf0fc51e9'::uuid, 1, 2, false, '2026-06-21'::date, 'Arena Seven', 'Quadra A', time '13:40',  8, 26, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, NULL, NULL, NULL),
    ('KNOCKOUT'::public.bracket_phase, '806dc1b5-bdb8-473e-9bce-16d6bd8e5b75'::uuid, 1, 1, false, '2026-06-21'::date, 'Arena Seven', 'Quadra A', time '14:20',  9, 27, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, NULL, NULL, NULL),
    ('KNOCKOUT'::public.bracket_phase, '806dc1b5-bdb8-473e-9bce-16d6bd8e5b75'::uuid, 1, 2, false, '2026-06-21'::date, 'Arena Seven', 'Quadra A', time '15:00', 10, 28, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, NULL, NULL, NULL),

    ('KNOCKOUT'::public.bracket_phase, 'e2b305c3-999f-4f35-b6a3-10da8ce10a4a'::uuid, 1, 1, false, '2026-06-21'::date, 'Arena Seven', 'Quadra B', time '13:00',  7, 22, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     NULL, NULL, NULL),
    ('KNOCKOUT'::public.bracket_phase, 'e2b305c3-999f-4f35-b6a3-10da8ce10a4a'::uuid, 1, 2, false, '2026-06-21'::date, 'Arena Seven', 'Quadra B', time '13:40',  8, 23, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     NULL, NULL, NULL),
    ('KNOCKOUT'::public.bracket_phase, 'aabfaf6f-0e28-4285-94d0-b2ab6c89b903'::uuid, 1, 1, false, '2026-06-21'::date, 'Arena Seven', 'Quadra B', time '14:20',  9, 24, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     NULL, NULL, NULL),
    ('KNOCKOUT'::public.bracket_phase, 'aabfaf6f-0e28-4285-94d0-b2ab6c89b903'::uuid, 1, 2, false, '2026-06-21'::date, 'Arena Seven', 'Quadra B', time '15:00', 10, 25, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     NULL, NULL, NULL),

    ('KNOCKOUT'::public.bracket_phase, 'e2b305c3-999f-4f35-b6a3-10da8ce10a4a'::uuid, 2, 1, false, '2026-06-21'::date, 'Arena Seven', 'Quadra A', time '15:45', 11, 29, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     NULL, NULL, NULL),
    ('KNOCKOUT'::public.bracket_phase, 'aabfaf6f-0e28-4285-94d0-b2ab6c89b903'::uuid, 2, 1, false, '2026-06-21'::date, 'Arena Seven', 'Quadra A', time '16:30', 12, 30, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     NULL, NULL, NULL),
    ('KNOCKOUT'::public.bracket_phase, 'c1cef97e-0589-48dd-b278-9badf0fc51e9'::uuid, 2, 1, false, '2026-06-21'::date, 'Arena Seven', 'Quadra A', time '17:15', 13, 31, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, NULL, NULL, NULL),
    ('KNOCKOUT'::public.bracket_phase, '806dc1b5-bdb8-473e-9bce-16d6bd8e5b75'::uuid, 2, 1, false, '2026-06-21'::date, 'Arena Seven', 'Quadra A', time '18:00', 14, 32, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, NULL, NULL, NULL);

  DROP TABLE IF EXISTS tmp_society_2026_group_stage_matches;
  CREATE TEMP TABLE tmp_society_2026_group_stage_matches AS
  SELECT
    official_rows.*,
    matches_table.id AS match_id,
    matches_table.status AS match_status
  FROM tmp_society_2026_official_schedule_rows AS official_rows
  JOIN public.matches AS matches_table
    ON matches_table.championship_id = target_championship_id
    AND matches_table.season_year = target_season_year
    AND matches_table.naipe = official_rows.naipe
    AND matches_table.division IS NOT DISTINCT FROM official_rows.division
  JOIN public.sports AS sports_table
    ON sports_table.id = matches_table.sport_id
    AND sports_table.name = target_sport_name
  JOIN public.teams AS home_teams_table
    ON home_teams_table.id = matches_table.home_team_id
    AND public.normalize_bracket_entity_name(home_teams_table.name) = public.normalize_bracket_entity_name(official_rows.home_team_name)
  JOIN public.teams AS away_teams_table
    ON away_teams_table.id = matches_table.away_team_id
    AND public.normalize_bracket_entity_name(away_teams_table.name) = public.normalize_bracket_entity_name(official_rows.away_team_name)
  JOIN public.championship_bracket_matches AS bracket_matches_table
    ON bracket_matches_table.match_id = matches_table.id
    AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
    AND bracket_matches_table.bracket_edition_id = target_bracket_edition_id
  WHERE official_rows.phase = 'GROUP_STAGE'::public.bracket_phase;

  SELECT count(*)::integer
  INTO matched_group_stage_match_count
  FROM tmp_society_2026_group_stage_matches;

  IF matched_group_stage_match_count <> expected_group_stage_match_count THEN
    RAISE EXCEPTION
      'A agenda oficial do Society 2026 esperava mapear % jogos de grupos, mas encontrou %.',
      expected_group_stage_match_count,
      matched_group_stage_match_count;
  END IF;

  UPDATE public.matches AS matches_table
  SET
    scheduled_slot = NULL,
    queue_position = NULL
  FROM tmp_society_2026_group_stage_matches AS group_stage_matches_table
  WHERE matches_table.id = group_stage_matches_table.match_id;

  UPDATE public.matches AS matches_table
  SET
    scheduled_date = group_stage_matches_table.scheduled_date,
    location = group_stage_matches_table.location,
    court_name = group_stage_matches_table.court_name,
    scheduled_slot = group_stage_matches_table.scheduled_slot,
    queue_position = group_stage_matches_table.queue_position,
    start_time = CASE
      WHEN matches_table.status = 'SCHEDULED'::public.match_status THEN
        public.combine_bracket_schedule_timestamp(
          group_stage_matches_table.scheduled_date,
          group_stage_matches_table.planned_start_time
        )
      ELSE matches_table.start_time
    END,
    end_time = CASE
      WHEN matches_table.status = 'SCHEDULED'::public.match_status THEN
        public.combine_bracket_schedule_timestamp(
          group_stage_matches_table.scheduled_date,
          group_stage_matches_table.planned_start_time
        ) + interval '40 minutes'
      ELSE matches_table.end_time
    END
  FROM tmp_society_2026_group_stage_matches AS group_stage_matches_table
  WHERE matches_table.id = group_stage_matches_table.match_id;

  DROP TABLE IF EXISTS tmp_society_2026_knockout_matches;
  CREATE TEMP TABLE tmp_society_2026_knockout_matches AS
  SELECT
    official_rows.*,
    matches_table.id AS match_id,
    matches_table.status AS match_status
  FROM tmp_society_2026_official_schedule_rows AS official_rows
  JOIN public.championship_bracket_matches AS bracket_matches_table
    ON bracket_matches_table.bracket_edition_id = target_bracket_edition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.competition_id = official_rows.competition_id
    AND bracket_matches_table.round_number = official_rows.round_number
    AND bracket_matches_table.slot_number = official_rows.slot_number
    AND COALESCE(bracket_matches_table.is_third_place, false) = official_rows.is_third_place
    AND bracket_matches_table.match_id IS NOT NULL
  JOIN public.matches AS matches_table
    ON matches_table.id = bracket_matches_table.match_id
    AND matches_table.championship_id = target_championship_id
    AND matches_table.season_year = target_season_year
  WHERE official_rows.phase = 'KNOCKOUT'::public.bracket_phase;

  UPDATE public.matches AS matches_table
  SET
    scheduled_slot = NULL,
    queue_position = NULL
  FROM tmp_society_2026_knockout_matches AS knockout_matches_table
  WHERE matches_table.id = knockout_matches_table.match_id;

  UPDATE public.matches AS matches_table
  SET
    scheduled_date = knockout_matches_table.scheduled_date,
    location = knockout_matches_table.location,
    court_name = knockout_matches_table.court_name,
    scheduled_slot = knockout_matches_table.scheduled_slot,
    queue_position = knockout_matches_table.queue_position,
    start_time = CASE
      WHEN matches_table.status = 'SCHEDULED'::public.match_status THEN
        public.combine_bracket_schedule_timestamp(
          knockout_matches_table.scheduled_date,
          knockout_matches_table.planned_start_time
        )
      ELSE matches_table.start_time
    END,
    end_time = CASE
      WHEN matches_table.status = 'SCHEDULED'::public.match_status THEN
        public.combine_bracket_schedule_timestamp(
          knockout_matches_table.scheduled_date,
          knockout_matches_table.planned_start_time
        ) + interval '40 minutes'
      ELSE matches_table.end_time
    END
  FROM tmp_society_2026_knockout_matches AS knockout_matches_table
  WHERE matches_table.id = knockout_matches_table.match_id;
END;
$$;

COMMENT ON FUNCTION public.apply_society_2026_official_schedule(UUID) IS
  'Reaplica a agenda oficial da planilha do Society 2026, preservando horários reais de partidas LIVE/FINISHED.';

DO $$
DECLARE
  function_signature REGPROCEDURE := to_regprocedure('public.redistribute_bracket_scheduled_matches(uuid)');
  function_definition TEXT;
  updated_definition TEXT;
  source_block TEXT := $source$
  UPDATE public.matches AS matches_table
  SET
    scheduled_date = assignment_queue_positions_table.new_scheduled_date,
    scheduled_slot = assignment_queue_positions_table.new_scheduled_slot,
    queue_position = assignment_queue_positions_table.new_queue_position,
    location = assignment_queue_positions_table.location_name,
    court_name = assignment_queue_positions_table.court_name,
    start_time = assignment_queue_positions_table.planned_start_at,
    end_time = assignment_queue_positions_table.planned_end_at
  FROM tmp_global_assignment_queue_positions AS assignment_queue_positions_table
  WHERE assignment_queue_positions_table.match_id = matches_table.id;
$source$;
  target_block TEXT := $target$
  UPDATE public.matches AS matches_table
  SET
    scheduled_date = assignment_queue_positions_table.new_scheduled_date,
    scheduled_slot = assignment_queue_positions_table.new_scheduled_slot,
    queue_position = assignment_queue_positions_table.new_queue_position,
    location = assignment_queue_positions_table.location_name,
    court_name = assignment_queue_positions_table.court_name,
    start_time = assignment_queue_positions_table.planned_start_at,
    end_time = assignment_queue_positions_table.planned_end_at
  FROM tmp_global_assignment_queue_positions AS assignment_queue_positions_table
  WHERE assignment_queue_positions_table.match_id = matches_table.id;

  PERFORM public.apply_society_2026_official_schedule(_bracket_edition_id);
$target$;
BEGIN
  IF function_signature IS NULL THEN
    RAISE EXCEPTION 'Função public.redistribute_bracket_scheduled_matches(uuid) não encontrada.';
  END IF;

  SELECT pg_get_functiondef(function_signature)
  INTO function_definition;

  updated_definition := replace(function_definition, source_block, target_block);

  IF updated_definition = function_definition THEN
    RAISE EXCEPTION 'Não foi possível acoplar a agenda oficial do Society 2026 ao fim da redistribuição do chaveamento.';
  END IF;

  EXECUTE updated_definition;
END;
$$;

DO $$
BEGIN
  PERFORM public.apply_society_2026_official_schedule(
    'a63df7b3-752e-421a-bf08-dcebeef99643'::uuid
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
