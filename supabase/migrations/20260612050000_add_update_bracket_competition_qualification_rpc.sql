-- RPC para editar o formato de classificação para o mata-mata após a geração dos jogos.
-- Editável apenas com campeonato em UPCOMING (Configurando campeonato) e enquanto o
-- mata-mata da competição ainda não foi gerado. A geração do KO lê esses valores da
-- tabela championship_bracket_competitions quando os grupos terminam — nenhuma mudança lá.

CREATE OR REPLACE FUNCTION public.update_bracket_competition_qualification(
  _competition_id UUID,
  _qualifiers_per_group INTEGER,
  _should_complete_knockout_with_best_second_placed_teams BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edition_id UUID;
  v_sport_id UUID;
  v_naipe public.match_naipe;
  v_division public.team_division;
  v_flag BOOLEAN;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para editar a classificação.';
  END IF;

  IF _qualifiers_per_group NOT IN (1, 2) THEN
    RAISE EXCEPTION 'Classificados por grupo deve ser 1 ou 2.';
  END IF;

  -- TOP_TWO (2 por grupo) nunca combina com melhores segundos (espelha a regra do wizard)
  v_flag := CASE
    WHEN _qualifiers_per_group = 2 THEN false
    ELSE COALESCE(_should_complete_knockout_with_best_second_placed_teams, false)
  END;

  SELECT comp.bracket_edition_id, comp.sport_id, comp.naipe, comp.division
  INTO v_edition_id, v_sport_id, v_naipe, v_division
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
    should_complete_knockout_with_best_second_placed_teams = v_flag
  WHERE id = _competition_id;

  -- Mantém payload_snapshot.competitions consistente com a tabela
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
              'should_complete_knockout_with_best_second_placed_teams', v_flag
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
$$;

GRANT EXECUTE ON FUNCTION public.update_bracket_competition_qualification(uuid, integer, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
