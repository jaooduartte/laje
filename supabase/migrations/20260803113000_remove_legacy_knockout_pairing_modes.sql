UPDATE public.championship_bracket_competitions
SET knockout_pairing_mode = 'LINEAR'
WHERE COALESCE(knockout_pairing_mode, 'LINEAR') <> 'LINEAR';

UPDATE public.championship_bracket_editions AS editions_table
SET payload_snapshot = jsonb_set(
  editions_table.payload_snapshot,
  '{competitions}',
  (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_set(
          competition_record.value,
          '{knockout_pairing_mode}',
          '"LINEAR"'::jsonb,
          true
        )
      ),
      '[]'::jsonb
    )
    FROM jsonb_array_elements(COALESCE(editions_table.payload_snapshot->'competitions', '[]'::jsonb))
      AS competition_record(value)
  ),
  true
)
WHERE jsonb_typeof(editions_table.payload_snapshot->'competitions') = 'array';

ALTER TABLE public.championship_bracket_competitions
  DROP CONSTRAINT IF EXISTS championship_bracket_competitions_knockout_pairing_mode_check;

ALTER TABLE public.championship_bracket_competitions
  ADD CONSTRAINT championship_bracket_competitions_knockout_pairing_mode_check
  CHECK (knockout_pairing_mode = 'LINEAR');

CREATE OR REPLACE FUNCTION public.resolve_championship_knockout_pairing_mode(_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'LINEAR'::text;
$$;

DO $migration_remove_legacy_knockout_pairing_modes_from_generation$
DECLARE
  function_signature REGPROCEDURE;
  function_definition TEXT;
BEGIN
  function_signature := to_regprocedure('public.generate_championship_bracket_groups(uuid, jsonb)');

  IF function_signature IS NULL THEN
    RAISE EXCEPTION 'Função public.generate_championship_bracket_groups(uuid, jsonb) não encontrada.';
  END IF;

  SELECT pg_get_functiondef(function_signature)
  INTO function_definition;

  IF position('COALESCE(knockout_pairing_mode_value, ''LINEAR'')' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível localizar a normalização de knockout_pairing_mode no insert da geração.';
  END IF;

  IF position('knockout_pairing_mode = COALESCE(knockout_pairing_mode_value, public.championship_bracket_competitions.knockout_pairing_mode)' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível localizar a normalização de knockout_pairing_mode no update da geração.';
  END IF;

  function_definition := replace(
    function_definition,
    'COALESCE(knockout_pairing_mode_value, ''LINEAR'')',
    'public.resolve_championship_knockout_pairing_mode(knockout_pairing_mode_value)'
  );

  function_definition := replace(
    function_definition,
    'knockout_pairing_mode = COALESCE(knockout_pairing_mode_value, public.championship_bracket_competitions.knockout_pairing_mode)',
    'knockout_pairing_mode = public.resolve_championship_knockout_pairing_mode(knockout_pairing_mode_value)'
  );

  EXECUTE function_definition;
END;
$migration_remove_legacy_knockout_pairing_modes_from_generation$;

CREATE OR REPLACE FUNCTION public.update_bracket_competition_settings(
  _competition_id UUID,
  _qualifiers_per_group INTEGER,
  _should_complete_knockout_with_best_second_placed_teams BOOLEAN,
  _knockout_pairing_mode TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_edition_id UUID;
  v_sport_id UUID;
  v_naipe public.match_naipe;
  v_division public.team_division;
  v_flag BOOLEAN;
  v_knockout_pairing_mode TEXT;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para editar a classificação.';
  END IF;

  IF _qualifiers_per_group NOT IN (1, 2) THEN
    RAISE EXCEPTION 'Classificados por grupo deve ser 1 ou 2.';
  END IF;

  v_knockout_pairing_mode := public.resolve_championship_knockout_pairing_mode(
    _knockout_pairing_mode
  );

  v_flag := CASE
    WHEN _qualifiers_per_group = 2 THEN false
    ELSE COALESCE(_should_complete_knockout_with_best_second_placed_teams, false)
  END;

  SELECT
    comp.bracket_edition_id,
    comp.sport_id,
    comp.naipe,
    comp.division
  INTO
    v_edition_id,
    v_sport_id,
    v_naipe,
    v_division
  FROM public.championship_bracket_competitions AS comp
  JOIN public.championship_bracket_editions AS cbe ON cbe.id = comp.bracket_edition_id
  JOIN public.championships AS c ON c.id = cbe.championship_id
  WHERE comp.id = _competition_id
    AND c.status = 'UPCOMING'::public.championship_status
  LIMIT 1;

  IF v_edition_id IS NULL THEN
    RAISE EXCEPTION 'Competição inválida ou campeonato fora do status Configurando campeonato.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches
    WHERE bracket_matches.competition_id = _competition_id
      AND bracket_matches.phase = 'KNOCKOUT'::public.bracket_phase
  ) THEN
    RAISE EXCEPTION 'O mata-mata desta competição já foi gerado. Não é possível alterar a classificação.';
  END IF;

  UPDATE public.championship_bracket_competitions
  SET
    qualifiers_per_group = _qualifiers_per_group,
    should_complete_knockout_with_best_second_placed_teams = v_flag,
    knockout_pairing_mode = v_knockout_pairing_mode
  WHERE id = _competition_id;

  UPDATE public.championship_bracket_editions AS cbe
  SET
    payload_snapshot = jsonb_set(
      cbe.payload_snapshot,
      '{competitions}',
      (
        SELECT COALESCE(jsonb_agg(
          CASE
            WHEN (elem->>'sport_id') = v_sport_id::text
              AND (elem->>'naipe') = v_naipe::text
              AND NULLIF(trim(COALESCE(elem->>'division', '')), '') IS NOT DISTINCT FROM v_division::text
            THEN elem || jsonb_build_object(
              'qualifiers_per_group', _qualifiers_per_group,
              'should_complete_knockout_with_best_second_placed_teams', v_flag,
              'knockout_pairing_mode', v_knockout_pairing_mode
            )
            ELSE elem
          END
        ), '[]'::jsonb)
        FROM jsonb_array_elements(cbe.payload_snapshot->'competitions') AS elem
      )
    ),
    updated_at = now(),
    updated_by = auth.uid()
  WHERE cbe.id = v_edition_id
    AND jsonb_typeof(cbe.payload_snapshot->'competitions') = 'array';
END;
$function$;

DO $migration_remove_cross_group_runtime$
DECLARE
  function_signature REGPROCEDURE;
  function_definition TEXT;
  assignment_fragment TEXT;
BEGIN
  function_signature := to_regprocedure(
    'public.generate_championship_knockout_for_competition(uuid,uuid,uuid)'
  );

  IF function_signature IS NULL THEN
    RAISE EXCEPTION 'Função public.generate_championship_knockout_for_competition(uuid,uuid,uuid) não encontrada.';
  END IF;

  SELECT pg_get_functiondef(function_signature)
  INTO function_definition;

  assignment_fragment := '  should_use_cross_groups_pairing :=' || chr(10) ||
    '    competition_record.knockout_pairing_mode = ''FUTEBOL_SOCIETY_FEM_ACCESS_CROSS_GROUPS''' || chr(10) ||
    '    AND competition_record.sport_code = ''FUTEBOL_SOCIETY''' || chr(10) ||
    '    AND competition_record.naipe = ''FEMININO''::public.match_naipe' || chr(10) ||
    '    AND competition_record.division = ''DIVISAO_ACESSO''::public.team_division' || chr(10) ||
    '    AND group_count_value = 2' || chr(10) ||
    '    AND competition_record.qualifiers_per_group = 1' || chr(10) ||
    '    AND should_include_best_second_placed_teams' || chr(10) ||
    '    AND target_bracket_size = 4;';

  IF position(assignment_fragment IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível localizar a ramificação de cross groups no runtime do mata-mata.';
  END IF;

  function_definition := replace(
    function_definition,
    assignment_fragment,
    '  should_use_cross_groups_pairing := false;'
  );

  EXECUTE function_definition;
END;
$migration_remove_cross_group_runtime$;

NOTIFY pgrst, 'reload schema';
