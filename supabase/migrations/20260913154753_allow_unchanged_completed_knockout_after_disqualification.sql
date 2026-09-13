DO $collective_patch$
DECLARE
  function_definition TEXT;
  completed_knockout_guard_fragment TEXT := $fragment$
  IF has_generated_knockout
    AND EXISTS (
      SELECT 1
      FROM public.championship_bracket_matches AS bracket_matches_table
      JOIN public.matches AS matches_table
        ON matches_table.id = bracket_matches_table.match_id
      WHERE bracket_matches_table.competition_id = competition_record.id
        AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
        AND matches_table.status <> 'SCHEDULED'::public.match_status
    ) THEN
    RAISE EXCEPTION 'A desclassificação exige que todos os jogos eliminatórios permaneçam agendados.';
  END IF;

$fragment$;
BEGIN
  SELECT pg_get_functiondef(
    'public.disqualify_championship_collective_team_competition(uuid,integer,uuid,public.match_naipe,public.team_division,uuid)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL
    OR position(completed_knockout_guard_fragment IN function_definition) = 0 THEN
    RAISE EXCEPTION 'A função de desclassificação coletiva não possui a proteção esperada.';
  END IF;

  function_definition := replace(
    function_definition,
    completed_knockout_guard_fragment,
    ''
  );

  EXECUTE function_definition;
END;
$collective_patch$;

DO $refresh_patch$
DECLARE
  function_definition TEXT;
  declarations_fragment TEXT := $fragment$
  slot_index INTEGER;
  winner_team_id UUID;
BEGIN$fragment$;
  patched_declarations_fragment TEXT := $fragment$
  slot_index INTEGER;
  winner_team_id UUID;
  proposed_home_team_id UUID;
  proposed_away_team_id UUID;
  current_home_team_id UUID;
  current_away_team_id UUID;
BEGIN$fragment$;
  seed_order_fragment TEXT := $fragment$
  IF COALESCE(cardinality(standard_seed_order), 0) <> bracket_size THEN
    RAISE EXCEPTION 'O modo de cruzamento da competição não gerou uma ordem de classificados válida.';
  END IF;

  FOR slot_index IN 1..LEAST(existing_round_one_count, bracket_size / 2)
$fragment$;
  patched_seed_order_fragment TEXT := $fragment$
  IF COALESCE(cardinality(standard_seed_order), 0) <> bracket_size THEN
    RAISE EXCEPTION 'O modo de cruzamento da competição não gerou uma ordem de classificados válida.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND matches_table.status <> 'SCHEDULED'::public.match_status
  ) THEN
    FOR slot_index IN 1..LEAST(existing_round_one_count, bracket_size / 2)
    LOOP
      proposed_home_team_id := qualified_team_ids[
        standard_seed_order[((slot_index - 1) * 2) + 1]
      ];
      proposed_away_team_id := qualified_team_ids[
        standard_seed_order[((slot_index - 1) * 2) + 2]
      ];

      SELECT
        bracket_matches_table.home_team_id,
        bracket_matches_table.away_team_id
      INTO current_home_team_id, current_away_team_id
      FROM public.championship_bracket_matches AS bracket_matches_table
      WHERE bracket_matches_table.competition_id = _competition_id
        AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
        AND bracket_matches_table.is_third_place = false
        AND bracket_matches_table.round_number = 1
        AND bracket_matches_table.slot_number = slot_index
      LIMIT 1;

      IF current_home_team_id IS DISTINCT FROM proposed_home_team_id
        OR current_away_team_id IS DISTINCT FROM proposed_away_team_id THEN
        RAISE EXCEPTION 'A desclassificação alteraria participantes de uma chave com jogo eliminatório ao vivo ou finalizado.';
      END IF;
    END LOOP;
  END IF;

  FOR slot_index IN 1..LEAST(existing_round_one_count, bracket_size / 2)
$fragment$;
BEGIN
  SELECT pg_get_functiondef(
    'public.refresh_championship_knockout_competition_after_disqualification(uuid,uuid)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL
    OR position(declarations_fragment IN function_definition) = 0
    OR position(seed_order_fragment IN function_definition) = 0 THEN
    RAISE EXCEPTION 'A função de atualização da chave não possui a estrutura esperada.';
  END IF;

  function_definition := replace(function_definition, declarations_fragment, patched_declarations_fragment);
  function_definition := replace(function_definition, seed_order_fragment, patched_seed_order_fragment);

  EXECUTE function_definition;
END;
$refresh_patch$;

NOTIFY pgrst, 'reload schema';
