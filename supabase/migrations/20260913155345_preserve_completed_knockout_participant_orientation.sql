DO $refresh_patch$
DECLARE
  function_definition TEXT;
  participant_change_fragment TEXT := $fragment$
      IF current_home_team_id IS DISTINCT FROM proposed_home_team_id
        OR current_away_team_id IS DISTINCT FROM proposed_away_team_id THEN
        RAISE EXCEPTION 'A desclassificação alteraria participantes de uma chave com jogo eliminatório ao vivo ou finalizado.';
      END IF;
$fragment$;
  patched_participant_change_fragment TEXT := $fragment$
      IF (
        current_home_team_id IS DISTINCT FROM proposed_home_team_id
        OR current_away_team_id IS DISTINCT FROM proposed_away_team_id
      )
        AND NOT (
          current_home_team_id IS NOT DISTINCT FROM proposed_away_team_id
          AND current_away_team_id IS NOT DISTINCT FROM proposed_home_team_id
        ) THEN
        RAISE EXCEPTION 'A desclassificação alteraria participantes de uma chave com jogo eliminatório ao vivo ou finalizado.';
      END IF;
$fragment$;
  seed_assignment_fragment TEXT := $fragment$
    home_team_id := qualified_team_ids[home_seed_index];
    away_team_id := qualified_team_ids[away_seed_index];

    SELECT
$fragment$;
  patched_seed_assignment_fragment TEXT := $fragment$
    home_team_id := qualified_team_ids[home_seed_index];
    away_team_id := qualified_team_ids[away_seed_index];

    SELECT
      bracket_matches_table.home_team_id,
      bracket_matches_table.away_team_id
    INTO current_home_team_id, current_away_team_id
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number = 1
      AND bracket_matches_table.slot_number = slot_index
      AND matches_table.status <> 'SCHEDULED'::public.match_status
    LIMIT 1;

    IF current_home_team_id IS NOT DISTINCT FROM away_team_id
      AND current_away_team_id IS NOT DISTINCT FROM home_team_id THEN
      home_team_id := current_home_team_id;
      away_team_id := current_away_team_id;
    END IF;

    SELECT
$fragment$;
BEGIN
  SELECT pg_get_functiondef(
    'public.refresh_championship_knockout_competition_after_disqualification(uuid,uuid)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL
    OR position(participant_change_fragment IN function_definition) = 0
    OR position(seed_assignment_fragment IN function_definition) = 0 THEN
    RAISE EXCEPTION 'A função de atualização da chave não possui a orientação esperada.';
  END IF;

  function_definition := replace(
    function_definition,
    participant_change_fragment,
    patched_participant_change_fragment
  );
  function_definition := replace(
    function_definition,
    seed_assignment_fragment,
    patched_seed_assignment_fragment
  );

  EXECUTE function_definition;
END;
$refresh_patch$;

NOTIFY pgrst, 'reload schema';
