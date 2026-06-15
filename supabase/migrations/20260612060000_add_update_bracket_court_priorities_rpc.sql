-- RPC para editar as preferências de naipe/divisão das quadras após a geração dos jogos.
-- Editável apenas com campeonato em UPCOMING (Configurando campeonato). Após salvar,
-- redistribui automaticamente a fila de jogos SCHEDULED respeitando as novas prioridades.
-- Observação: não reescreve payload_snapshot.schedule_days — a sugestão de quadra no
-- controle ao vivo lê de championship_bracket_court_sports (fonte da verdade).

CREATE OR REPLACE FUNCTION public.update_bracket_court_priorities(
  _bracket_edition_id UUID,
  _court_priorities JSONB
  -- [{ "bracket_court_id": uuid, "sport_id": uuid,
  --    "preferred_naipe": "MASCULINO"|null, "preferred_division": "DIVISAO_PRINCIPAL"|null }]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_championship_id UUID;
  v_item JSONB;
  v_court_id UUID;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para editar prioridades de quadras.';
  END IF;

  SELECT cbe.championship_id
  INTO v_championship_id
  FROM public.championship_bracket_editions AS cbe
  JOIN public.championships AS c ON c.id = cbe.championship_id
  WHERE cbe.id = _bracket_edition_id
    AND c.status = 'UPCOMING'::public.championship_status
  LIMIT 1;

  IF v_championship_id IS NULL THEN
    RAISE EXCEPTION 'Edição inválida ou campeonato fora do status Configurando campeonato.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(_court_priorities, '[]'::jsonb)) LOOP
    v_court_id := (v_item->>'bracket_court_id')::uuid;

    IF NOT EXISTS (
      SELECT 1
      FROM public.championship_bracket_courts AS courts_table
      JOIN public.championship_bracket_locations AS locations_table
        ON locations_table.id = courts_table.bracket_location_id
      JOIN public.championship_bracket_days AS days_table
        ON days_table.id = locations_table.bracket_day_id
      WHERE courts_table.id = v_court_id
        AND days_table.bracket_edition_id = _bracket_edition_id
    ) THEN
      RAISE EXCEPTION 'Quadra não pertence a esta edição do chaveamento.';
    END IF;

    UPDATE public.championship_bracket_court_sports
    SET
      preferred_naipe = NULLIF(trim(COALESCE(v_item->>'preferred_naipe', '')), '')::public.match_naipe,
      preferred_division = NULLIF(trim(COALESCE(v_item->>'preferred_division', '')), '')::public.team_division
    WHERE bracket_court_id = v_court_id
      AND sport_id = (v_item->>'sport_id')::uuid;
  END LOOP;

  -- Reordena a fila dos jogos SCHEDULED respeitando as novas prioridades
  PERFORM public.redistribute_bracket_scheduled_matches(_bracket_edition_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_bracket_court_priorities(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
