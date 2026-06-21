-- Reparo pontual da edição afetada usando a planilha como fonte de verdade.
-- Para o Feminino Acesso, esta migration recria explicitamente as semifinais
-- corretas do mata-mata, sem depender do gerador automático durante o próprio
-- reparo.

DO $$
DECLARE
  target_championship_id CONSTANT uuid := '17b92cf5-dd92-44eb-9295-b28000372e4b'::uuid;
  target_season_year CONSTANT integer := 2026;
  target_sport_name CONSTANT text := 'Futebol Society';
  feminino_acesso_competition_id CONSTANT uuid := 'e2b305c3-999f-4f35-b6a3-10da8ce10a4a'::uuid;
  target_bracket_edition_id CONSTANT uuid := 'a63df7b3-752e-421a-bf08-dcebeef99643'::uuid;
  expected_group_stage_match_count CONSTANT integer := 45;
  matched_group_stage_match_count integer := 0;
  updated_group_stage_match_count integer := 0;
  generated_feminino_acesso_semifinal_count integer := 0;
  feminino_acesso_semifinal_one_bracket_match_id uuid;
  feminino_acesso_semifinal_two_bracket_match_id uuid;
  feminino_acesso_qualified_team_ids uuid[];
BEGIN
  PERFORM set_config('app.skip_queue_trigger', 'true', true);
  PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);

  WITH planned_rows AS (
    SELECT *
    FROM (
      VALUES
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '08:00',  1,  1, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'AAAUS',     'RASANTE'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '08:40',  2,  2, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'RAPOSAS',   'AAAMU'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '09:20',  3,  3, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'GARRUDOS',  'CCT'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '10:00',  4,  4, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'TAUROS',    'CAMALEÃO'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '10:40',  5,  5, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'AAAMU',     'UEFA'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '11:20',  6,  6, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'GARRUDOS',  'RASANTE'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '13:00',  7,  7, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'ATENUN',    'TAUROS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '13:40',  8,  8, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'AAASF',     'CCT'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '14:20',  9,  9, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'CAMALEÃO',  'RAPOSAS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '15:00', 10, 10, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'AAASF',     'RASANTE'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '15:40', 11, 11, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'TAUROS',    'ADIN'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '16:20', 12, 12, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'UEFA',      'GARRUDOS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '17:00', 13, 13, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'ATENUN',    'AAAMU'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '17:40', 14, 14, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'AAASF',     'CAMALEÃO'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '18:20', 15, 15, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'ATENUN',    'AAAUS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '19:00', 16, 16, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'CCT',       'AAAMU'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '19:40', 17, 17, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'AAASF',     'UEFA'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '20:20', 18, 18, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'RASANTE',   'RAPOSAS'),

        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '08:00',  1,  1, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'AAJ',       'ABUS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '10:00',  4,  2, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     'AFA',       'AMEN'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '10:40',  5,  3, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'ENGÊNIOS',  'AACOM'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '11:20',  6,  4, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     'AGUA',      'SOBERANOS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '13:00',  7,  5, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'UCA',       'AMEN'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '13:40',  8,  6, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     'AFA',       'AAJ'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '14:20',  9,  7, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'ACATO',     'SOBERANOS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '15:00', 10,  8, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     'AGUA',      'UCA'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '15:40', 11,  9, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'AAJ',       'ENGÊNIOS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '16:20', 12, 10, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'ABUS',      'AACOM'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '17:00', 13, 11, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     'AMEN',      'AAJ'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '17:40', 14, 12, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'AFA',       'SOBERANOS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '18:20', 15, 13, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'UCA',       'AGUA'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '19:00', 16, 14, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'ABUS',      'ENGÊNIOS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '19:40', 17, 15, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     'UCA',       'SOBERANOS'),

        ('2026-06-21'::date, 'Arena Seven', 'Quadra A', time '08:00',  1, 19, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'GARRUDOS',  'AAAUS'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra A', time '08:40',  2, 20, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'ADIN',      'CAMALEÃO'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra A', time '09:20',  3, 21, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'RAPOSAS',   'AAASF'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra A', time '10:00',  4, 22, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'AAAMU',     'GARRUDOS'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra A', time '10:40',  5, 23, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'UEFA',      'CCT'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra A', time '11:20',  6, 24, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'AAAUS',     'TAUROS'),

        ('2026-06-21'::date, 'Arena Seven', 'Quadra B', time '08:00',  1, 17, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'AMEN',      'AGUA'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra B', time '08:40',  2, 18, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'AACOM',     'AAJ'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra B', time '09:20',  3, 19, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'CCT',       'UEFA'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra B', time '10:00',  4, 20, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'CAMALEÃO',  'RASANTE'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra B', time '10:40',  5, 21, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'ATENUN',    'RAPOSAS'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra B', time '11:20',  6, 16, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'ACATO',     'AFA')
    ) AS values_table(
      scheduled_date,
      location,
      court_name,
      planned_start_time,
      scheduled_slot,
      queue_position,
      naipe,
      division,
      home_team_name,
      away_team_name
    )
  ),
  matched_group_stage_rows AS (
    SELECT
      planned_rows.*,
      matches_table.id AS match_id,
      matches_table.status AS match_status
    FROM planned_rows
    JOIN public.matches AS matches_table
      ON matches_table.championship_id = target_championship_id
      AND matches_table.season_year = target_season_year
      AND matches_table.naipe = planned_rows.naipe
      AND matches_table.division IS NOT DISTINCT FROM planned_rows.division
    JOIN public.sports AS sports_table
      ON sports_table.id = matches_table.sport_id
      AND sports_table.name = target_sport_name
    JOIN public.teams AS home_teams_table
      ON home_teams_table.id = matches_table.home_team_id
      AND public.normalize_bracket_entity_name(home_teams_table.name) = public.normalize_bracket_entity_name(planned_rows.home_team_name)
    JOIN public.teams AS away_teams_table
      ON away_teams_table.id = matches_table.away_team_id
      AND public.normalize_bracket_entity_name(away_teams_table.name) = public.normalize_bracket_entity_name(planned_rows.away_team_name)
    JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.match_id = matches_table.id
      AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
  )
  SELECT count(*)::integer
  INTO matched_group_stage_match_count
  FROM matched_group_stage_rows;

  IF matched_group_stage_match_count <> expected_group_stage_match_count THEN
    RAISE EXCEPTION
      'A migration esperava mapear % jogos da fase de grupos na planilha, mas encontrou %.',
      expected_group_stage_match_count,
      matched_group_stage_match_count;
  END IF;

  DELETE FROM public.matches AS matches_table
  WHERE matches_table.id IN (
    SELECT bracket_matches_table.match_id
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.competition_id = feminino_acesso_competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.match_id IS NOT NULL
  );

  DELETE FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = feminino_acesso_competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase;

  WITH planned_rows AS (
    SELECT *
    FROM (
      VALUES
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '08:00',  1,  1, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'AAAUS',     'RASANTE'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '08:40',  2,  2, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'RAPOSAS',   'AAAMU'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '09:20',  3,  3, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'GARRUDOS',  'CCT'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '10:00',  4,  4, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'TAUROS',    'CAMALEÃO'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '10:40',  5,  5, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'AAAMU',     'UEFA'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '11:20',  6,  6, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'GARRUDOS',  'RASANTE'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '13:00',  7,  7, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'ATENUN',    'TAUROS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '13:40',  8,  8, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'AAASF',     'CCT'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '14:20',  9,  9, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'CAMALEÃO',  'RAPOSAS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '15:00', 10, 10, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'AAASF',     'RASANTE'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '15:40', 11, 11, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'TAUROS',    'ADIN'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '16:20', 12, 12, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'UEFA',      'GARRUDOS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '17:00', 13, 13, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'ATENUN',    'AAAMU'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '17:40', 14, 14, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'AAASF',     'CAMALEÃO'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '18:20', 15, 15, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'ATENUN',    'AAAUS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '19:00', 16, 16, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'CCT',       'AAAMU'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '19:40', 17, 17, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'AAASF',     'UEFA'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '20:20', 18, 18, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'RASANTE',   'RAPOSAS'),

        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '08:00',  1,  1, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'AAJ',       'ABUS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '10:00',  4,  2, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     'AFA',       'AMEN'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '10:40',  5,  3, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'ENGÊNIOS',  'AACOM'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '11:20',  6,  4, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     'AGUA',      'SOBERANOS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '13:00',  7,  5, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'UCA',       'AMEN'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '13:40',  8,  6, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     'AFA',       'AAJ'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '14:20',  9,  7, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'ACATO',     'SOBERANOS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '15:00', 10,  8, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     'AGUA',      'UCA'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '15:40', 11,  9, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'AAJ',       'ENGÊNIOS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '16:20', 12, 10, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'ABUS',      'AACOM'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '17:00', 13, 11, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     'AMEN',      'AAJ'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '17:40', 14, 12, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'AFA',       'SOBERANOS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '18:20', 15, 13, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'UCA',       'AGUA'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '19:00', 16, 14, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'ABUS',      'ENGÊNIOS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '19:40', 17, 15, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     'UCA',       'SOBERANOS'),

        ('2026-06-21'::date, 'Arena Seven', 'Quadra A', time '08:00',  1, 19, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'GARRUDOS',  'AAAUS'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra A', time '08:40',  2, 20, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'ADIN',      'CAMALEÃO'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra A', time '09:20',  3, 21, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'RAPOSAS',   'AAASF'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra A', time '10:00',  4, 22, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'AAAMU',     'GARRUDOS'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra A', time '10:40',  5, 23, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'UEFA',      'CCT'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra A', time '11:20',  6, 24, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'AAAUS',     'TAUROS'),

        ('2026-06-21'::date, 'Arena Seven', 'Quadra B', time '08:00',  1, 17, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'AMEN',      'AGUA'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra B', time '08:40',  2, 18, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'AACOM',     'AAJ'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra B', time '09:20',  3, 19, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'CCT',       'UEFA'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra B', time '10:00',  4, 20, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'CAMALEÃO',  'RASANTE'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra B', time '10:40',  5, 21, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'ATENUN',    'RAPOSAS'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra B', time '11:20',  6, 16, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'ACATO',     'AFA')
    ) AS values_table(
      scheduled_date,
      location,
      court_name,
      planned_start_time,
      scheduled_slot,
      queue_position,
      naipe,
      division,
      home_team_name,
      away_team_name
    )
  ),
  matched_group_stage_rows AS (
    SELECT
      planned_rows.*,
      matches_table.id AS match_id
    FROM planned_rows
    JOIN public.matches AS matches_table
      ON matches_table.championship_id = target_championship_id
      AND matches_table.season_year = target_season_year
      AND matches_table.naipe = planned_rows.naipe
      AND matches_table.division IS NOT DISTINCT FROM planned_rows.division
    JOIN public.sports AS sports_table
      ON sports_table.id = matches_table.sport_id
      AND sports_table.name = target_sport_name
    JOIN public.teams AS home_teams_table
      ON home_teams_table.id = matches_table.home_team_id
      AND public.normalize_bracket_entity_name(home_teams_table.name) = public.normalize_bracket_entity_name(planned_rows.home_team_name)
    JOIN public.teams AS away_teams_table
      ON away_teams_table.id = matches_table.away_team_id
      AND public.normalize_bracket_entity_name(away_teams_table.name) = public.normalize_bracket_entity_name(planned_rows.away_team_name)
    JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.match_id = matches_table.id
      AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
  )
  UPDATE public.matches AS matches_table
  SET
    scheduled_slot = NULL,
    queue_position = NULL
  FROM matched_group_stage_rows
  WHERE matches_table.id = matched_group_stage_rows.match_id;

  WITH planned_rows AS (
    SELECT *
    FROM (
      VALUES
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '08:00',  1,  1, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'AAAUS',     'RASANTE'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '08:40',  2,  2, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'RAPOSAS',   'AAAMU'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '09:20',  3,  3, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'GARRUDOS',  'CCT'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '10:00',  4,  4, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'TAUROS',    'CAMALEÃO'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '10:40',  5,  5, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'AAAMU',     'UEFA'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '11:20',  6,  6, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'GARRUDOS',  'RASANTE'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '13:00',  7,  7, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'ATENUN',    'TAUROS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '13:40',  8,  8, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'AAASF',     'CCT'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '14:20',  9,  9, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'CAMALEÃO',  'RAPOSAS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '15:00', 10, 10, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'AAASF',     'RASANTE'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '15:40', 11, 11, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'TAUROS',    'ADIN'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '16:20', 12, 12, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'UEFA',      'GARRUDOS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '17:00', 13, 13, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'ATENUN',    'AAAMU'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '17:40', 14, 14, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'AAASF',     'CAMALEÃO'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '18:20', 15, 15, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'ATENUN',    'AAAUS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '19:00', 16, 16, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'CCT',       'AAAMU'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '19:40', 17, 17, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'AAASF',     'UEFA'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra A', time '20:20', 18, 18, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'RASANTE',   'RAPOSAS'),

        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '08:00',  1,  1, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'AAJ',       'ABUS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '10:00',  4,  2, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     'AFA',       'AMEN'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '10:40',  5,  3, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'ENGÊNIOS',  'AACOM'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '11:20',  6,  4, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     'AGUA',      'SOBERANOS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '13:00',  7,  5, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'UCA',       'AMEN'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '13:40',  8,  6, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     'AFA',       'AAJ'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '14:20',  9,  7, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'ACATO',     'SOBERANOS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '15:00', 10,  8, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     'AGUA',      'UCA'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '15:40', 11,  9, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'AAJ',       'ENGÊNIOS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '16:20', 12, 10, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'ABUS',      'AACOM'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '17:00', 13, 11, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     'AMEN',      'AAJ'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '17:40', 14, 12, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'AFA',       'SOBERANOS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '18:20', 15, 13, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'UCA',       'AGUA'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '19:00', 16, 14, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'ABUS',      'ENGÊNIOS'),
        ('2026-06-20'::date, 'Arena Seven', 'Quadra B', time '19:40', 17, 15, 'FEMININO'::public.match_naipe,  'DIVISAO_ACESSO'::public.team_division,     'UCA',       'SOBERANOS'),

        ('2026-06-21'::date, 'Arena Seven', 'Quadra A', time '08:00',  1, 19, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'GARRUDOS',  'AAAUS'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra A', time '08:40',  2, 20, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'ADIN',      'CAMALEÃO'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra A', time '09:20',  3, 21, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'RAPOSAS',   'AAASF'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra A', time '10:00',  4, 22, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'AAAMU',     'GARRUDOS'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra A', time '10:40',  5, 23, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'UEFA',      'CCT'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra A', time '11:20',  6, 24, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'AAAUS',     'TAUROS'),

        ('2026-06-21'::date, 'Arena Seven', 'Quadra B', time '08:00',  1, 17, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'AMEN',      'AGUA'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra B', time '08:40',  2, 18, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'AACOM',     'AAJ'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra B', time '09:20',  3, 19, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'CCT',       'UEFA'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra B', time '10:00',  4, 20, 'FEMININO'::public.match_naipe,  'DIVISAO_PRINCIPAL'::public.team_division, 'CAMALEÃO',  'RASANTE'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra B', time '10:40',  5, 21, 'MASCULINO'::public.match_naipe, 'DIVISAO_PRINCIPAL'::public.team_division, 'ATENUN',    'RAPOSAS'),
        ('2026-06-21'::date, 'Arena Seven', 'Quadra B', time '11:20',  6, 16, 'MASCULINO'::public.match_naipe, 'DIVISAO_ACESSO'::public.team_division,     'ACATO',     'AFA')
    ) AS values_table(
      scheduled_date,
      location,
      court_name,
      planned_start_time,
      scheduled_slot,
      queue_position,
      naipe,
      division,
      home_team_name,
      away_team_name
    )
  ),
  matched_group_stage_rows AS (
    SELECT
      planned_rows.*,
      matches_table.id AS match_id
    FROM planned_rows
    JOIN public.matches AS matches_table
      ON matches_table.championship_id = target_championship_id
      AND matches_table.season_year = target_season_year
      AND matches_table.naipe = planned_rows.naipe
      AND matches_table.division IS NOT DISTINCT FROM planned_rows.division
    JOIN public.sports AS sports_table
      ON sports_table.id = matches_table.sport_id
      AND sports_table.name = target_sport_name
    JOIN public.teams AS home_teams_table
      ON home_teams_table.id = matches_table.home_team_id
      AND public.normalize_bracket_entity_name(home_teams_table.name) = public.normalize_bracket_entity_name(planned_rows.home_team_name)
    JOIN public.teams AS away_teams_table
      ON away_teams_table.id = matches_table.away_team_id
      AND public.normalize_bracket_entity_name(away_teams_table.name) = public.normalize_bracket_entity_name(planned_rows.away_team_name)
    JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.match_id = matches_table.id
      AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
  ),
  updated_group_stage_rows AS (
    UPDATE public.matches AS matches_table
    SET
      scheduled_date = matched_group_stage_rows.scheduled_date,
      location = matched_group_stage_rows.location,
      court_name = matched_group_stage_rows.court_name,
      scheduled_slot = matched_group_stage_rows.scheduled_slot,
      queue_position = matched_group_stage_rows.queue_position,
      start_time = CASE
        WHEN matches_table.status = 'SCHEDULED'::public.match_status THEN
          public.combine_bracket_schedule_timestamp(
            matched_group_stage_rows.scheduled_date,
            matched_group_stage_rows.planned_start_time
          )
        ELSE matches_table.start_time
      END,
      end_time = CASE
        WHEN matches_table.status = 'SCHEDULED'::public.match_status THEN
          public.combine_bracket_schedule_timestamp(
            matched_group_stage_rows.scheduled_date,
            matched_group_stage_rows.planned_start_time
          ) + interval '40 minutes'
        ELSE matches_table.end_time
      END
    FROM matched_group_stage_rows
    WHERE matches_table.id = matched_group_stage_rows.match_id
    RETURNING matches_table.id
  )
  SELECT count(*)::integer
  INTO updated_group_stage_match_count
  FROM updated_group_stage_rows;

  IF updated_group_stage_match_count <> expected_group_stage_match_count THEN
    RAISE EXCEPTION
      'A migration esperava atualizar % jogos da fase de grupos, mas atualizou %.',
      expected_group_stage_match_count,
      updated_group_stage_match_count;
  END IF;

  SELECT array_agg(qualified_teams_table.team_id ORDER BY qualified_teams_table.seed_rank)
  INTO feminino_acesso_qualified_team_ids
  FROM (
    SELECT
      1 AS seed_rank,
      group_rankings.team_id
    FROM public.get_championship_bracket_competition_group_rankings(
      target_championship_id,
      feminino_acesso_competition_id
    ) AS group_rankings
    WHERE group_rankings.group_number = 1
      AND group_rankings.team_rank = 1

    UNION ALL

    SELECT
      2 AS seed_rank,
      group_rankings.team_id
    FROM public.get_championship_bracket_competition_group_rankings(
      target_championship_id,
      feminino_acesso_competition_id
    ) AS group_rankings
    WHERE group_rankings.group_number = 2
      AND group_rankings.team_rank = 1

    UNION ALL

    SELECT
      2 + qualification_pool_rankings.pool_rank AS seed_rank,
      qualification_pool_rankings.team_id
    FROM public.get_championship_bracket_competition_qualification_pool_rankings(
      target_championship_id,
      feminino_acesso_competition_id
    ) AS qualification_pool_rankings
    JOIN public.get_championship_bracket_competition_group_rankings(
      target_championship_id,
      feminino_acesso_competition_id
    ) AS group_rankings
      ON group_rankings.team_id = qualification_pool_rankings.team_id
      AND group_rankings.team_rank = 2
  ) AS qualified_teams_table;

  IF COALESCE(cardinality(feminino_acesso_qualified_team_ids), 0) <> 4
    OR feminino_acesso_qualified_team_ids[1] IS NULL
    OR feminino_acesso_qualified_team_ids[2] IS NULL
    OR feminino_acesso_qualified_team_ids[3] IS NULL
    OR feminino_acesso_qualified_team_ids[4] IS NULL THEN
    RAISE EXCEPTION
      'A migration esperava resolver 4 classificadas para as semifinais do Feminino B, mas obteve %.',
      COALESCE(cardinality(feminino_acesso_qualified_team_ids), 0);
  END IF;

  INSERT INTO public.championship_bracket_matches (
    bracket_edition_id,
    competition_id,
    phase,
    round_number,
    slot_number,
    home_team_id,
    away_team_id,
    winner_team_id,
    is_bye,
    is_third_place
  ) VALUES (
    target_bracket_edition_id,
    feminino_acesso_competition_id,
    'KNOCKOUT'::public.bracket_phase,
    1,
    1,
    feminino_acesso_qualified_team_ids[1],
    feminino_acesso_qualified_team_ids[4],
    NULL,
    false,
    false
  )
  RETURNING id
  INTO feminino_acesso_semifinal_one_bracket_match_id;

  INSERT INTO public.championship_bracket_matches (
    bracket_edition_id,
    competition_id,
    phase,
    round_number,
    slot_number,
    home_team_id,
    away_team_id,
    winner_team_id,
    is_bye,
    is_third_place
  ) VALUES (
    target_bracket_edition_id,
    feminino_acesso_competition_id,
    'KNOCKOUT'::public.bracket_phase,
    1,
    2,
    feminino_acesso_qualified_team_ids[2],
    feminino_acesso_qualified_team_ids[3],
    NULL,
    false,
    false
  )
  RETURNING id
  INTO feminino_acesso_semifinal_two_bracket_match_id;

  PERFORM public.create_championship_knockout_match_schedule(
    target_championship_id,
    feminino_acesso_semifinal_one_bracket_match_id
  );

  PERFORM public.create_championship_knockout_match_schedule(
    target_championship_id,
    feminino_acesso_semifinal_two_bracket_match_id
  );

  SELECT count(*)::integer
  INTO generated_feminino_acesso_semifinal_count
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = feminino_acesso_competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false
    AND bracket_matches_table.round_number = 1
    AND bracket_matches_table.slot_number IN (1, 2)
    AND bracket_matches_table.match_id IS NOT NULL;

  IF generated_feminino_acesso_semifinal_count <> 2 THEN
    RAISE EXCEPTION
      'A migration esperava gerar 2 semifinais de Feminino B, mas encontrou %.',
      generated_feminino_acesso_semifinal_count;
  END IF;

  UPDATE public.matches AS matches_table
  SET
    scheduled_date = planned_knockout_rows.scheduled_date,
    location = planned_knockout_rows.location,
    court_name = planned_knockout_rows.court_name,
    scheduled_slot = planned_knockout_rows.scheduled_slot,
    queue_position = planned_knockout_rows.queue_position,
    start_time = public.combine_bracket_schedule_timestamp(
      planned_knockout_rows.scheduled_date,
      planned_knockout_rows.planned_start_time
    ),
    end_time = public.combine_bracket_schedule_timestamp(
      planned_knockout_rows.scheduled_date,
      planned_knockout_rows.planned_start_time
    ) + interval '40 minutes'
  FROM (
    VALUES
      (1, '2026-06-21'::date, 'Arena Seven', 'Quadra B', time '13:00', 7, 22),
      (2, '2026-06-21'::date, 'Arena Seven', 'Quadra B', time '13:40', 8, 23)
  ) AS planned_knockout_rows(slot_number, scheduled_date, location, court_name, planned_start_time, scheduled_slot, queue_position)
  JOIN public.championship_bracket_matches AS bracket_matches_table
    ON bracket_matches_table.competition_id = feminino_acesso_competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false
    AND bracket_matches_table.round_number = 1
    AND bracket_matches_table.slot_number = planned_knockout_rows.slot_number
  WHERE matches_table.id = bracket_matches_table.match_id;

  IF EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.competition_id = feminino_acesso_competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND (
        bracket_matches_table.round_number > 1
        OR bracket_matches_table.is_third_place = true
      )
  ) THEN
    RAISE EXCEPTION 'Ainda existem placeholders de final/3º lugar em Feminino B após o reparo do mata-mata.';
  END IF;

  PERFORM public.sync_championship_bracket_edition_status(target_bracket_edition_id);
END;
$$;

NOTIFY pgrst, 'reload schema';
