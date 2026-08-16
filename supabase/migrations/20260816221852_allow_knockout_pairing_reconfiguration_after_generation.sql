CREATE OR REPLACE FUNCTION public.update_bracket_competition_settings(
  _competition_id UUID,
  _qualifiers_per_group INTEGER,
  _should_complete_knockout_with_best_second_placed_teams BOOLEAN,
  _knockout_pairing_mode TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_edition_id UUID;
  v_sport_id UUID;
  v_naipe public.match_naipe;
  v_division public.team_division;
  v_flag BOOLEAN;
  v_knockout_pairing_mode TEXT;
  v_current_qualifiers_per_group INTEGER;
  v_current_flag BOOLEAN;
  v_current_knockout_pairing_mode TEXT;
  v_has_knockout_structure BOOLEAN;
  v_has_materialized_knockout BOOLEAN;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para editar a classificação.';
  END IF;

  IF _qualifiers_per_group NOT IN (1, 2) THEN
    RAISE EXCEPTION 'Classificados por grupo deve ser 1 ou 2.';
  END IF;

  v_knockout_pairing_mode :=
    public.resolve_championship_knockout_pairing_mode(
      _knockout_pairing_mode
    );

  v_flag := CASE
    WHEN _qualifiers_per_group = 2 THEN false
    ELSE COALESCE(
      _should_complete_knockout_with_best_second_placed_teams,
      false
    )
  END;

  SELECT
    comp.bracket_edition_id,
    comp.sport_id,
    comp.naipe,
    comp.division,
    comp.qualifiers_per_group,
    comp.should_complete_knockout_with_best_second_placed_teams,
    comp.knockout_pairing_mode
  INTO
    v_edition_id,
    v_sport_id,
    v_naipe,
    v_division,
    v_current_qualifiers_per_group,
    v_current_flag,
    v_current_knockout_pairing_mode
  FROM public.championship_bracket_competitions AS comp
  JOIN public.championship_bracket_editions AS cbe
    ON cbe.id = comp.bracket_edition_id
  JOIN public.championships AS c
    ON c.id = cbe.championship_id
  WHERE comp.id = _competition_id
    AND c.status = 'REVIEW'::public.championship_status
  LIMIT 1;

  IF v_edition_id IS NULL THEN
    RAISE EXCEPTION
      'Competição inválida ou campeonato fora do status Em revisão.';
  END IF;

  SELECT
    EXISTS (
      SELECT 1
      FROM public.championship_bracket_matches AS bracket_matches
      WHERE bracket_matches.competition_id = _competition_id
        AND bracket_matches.phase = 'KNOCKOUT'::public.bracket_phase
    ),
    EXISTS (
      SELECT 1
      FROM public.championship_bracket_matches AS bracket_matches
      WHERE bracket_matches.competition_id = _competition_id
        AND bracket_matches.phase = 'KNOCKOUT'::public.bracket_phase
        AND (
          bracket_matches.match_id IS NOT NULL
          OR bracket_matches.home_team_id IS NOT NULL
          OR bracket_matches.away_team_id IS NOT NULL
          OR bracket_matches.winner_team_id IS NOT NULL
        )
    )
  INTO
    v_has_knockout_structure,
    v_has_materialized_knockout;

  IF v_has_knockout_structure
    AND (
      _qualifiers_per_group IS DISTINCT FROM
        v_current_qualifiers_per_group
      OR v_flag IS DISTINCT FROM v_current_flag
    )
  THEN
    RAISE EXCEPTION
      'O mata-mata desta competição já foi estruturado. Não é possível alterar a quantidade de classificados.';
  END IF;

  IF v_has_materialized_knockout
    AND v_knockout_pairing_mode IS DISTINCT FROM
      v_current_knockout_pairing_mode
  THEN
    RAISE EXCEPTION
      'O mata-mata desta competição já possui confrontos materializados. Não é possível alterar o pareamento.';
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
        SELECT COALESCE(
          jsonb_agg(
            CASE
              WHEN (elem->>'sport_id') = v_sport_id::text
                AND (elem->>'naipe') = v_naipe::text
                AND NULLIF(
                  trim(COALESCE(elem->>'division', '')),
                  ''
                ) IS NOT DISTINCT FROM v_division::text
              THEN elem || jsonb_build_object(
                'qualifiers_per_group',
                _qualifiers_per_group,
                'should_complete_knockout_with_best_second_placed_teams',
                v_flag,
                'knockout_pairing_mode',
                v_knockout_pairing_mode
              )
              ELSE elem
            END
          ),
          '[]'::jsonb
        )
        FROM jsonb_array_elements(
          cbe.payload_snapshot->'competitions'
        ) AS elem
      )
    ),
    updated_at = now(),
    updated_by = auth.uid()
  WHERE cbe.id = v_edition_id
    AND jsonb_typeof(
      cbe.payload_snapshot->'competitions'
    ) = 'array';
END;
$function$;