CREATE OR REPLACE FUNCTION public.generate_championship_knockout(
  _championship_id UUID,
  _bracket_edition_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_variable
DECLARE
  target_bracket_edition_id UUID;
  competition_record RECORD;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para gerar mata-mata.';
  END IF;

  IF _bracket_edition_id IS NULL THEN
    SELECT editions_table.id
    INTO target_bracket_edition_id
    FROM public.championship_bracket_editions AS editions_table
    WHERE editions_table.championship_id = _championship_id
    ORDER BY editions_table.created_at DESC
    LIMIT 1;
  ELSE
    target_bracket_edition_id := _bracket_edition_id;
  END IF;

  IF target_bracket_edition_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma edição de chaveamento encontrada para este campeonato.';
  END IF;

  FOR competition_record IN
    SELECT competitions_table.id
    FROM public.championship_bracket_competitions AS competitions_table
    WHERE competitions_table.bracket_edition_id = target_bracket_edition_id
    ORDER BY competitions_table.created_at ASC
  LOOP
    PERFORM public.generate_championship_knockout_for_competition(
      _championship_id,
      competition_record.id,
      target_bracket_edition_id
    );
  END LOOP;

  PERFORM public.sync_championship_bracket_edition_status(target_bracket_edition_id);

  RETURN target_bracket_edition_id;
END;
$$;

COMMENT ON FUNCTION public.generate_championship_knockout(UUID, UUID) IS 'Wrapper manual para gerar o mata-mata pendente por competição, preservando a automação por modalidade.';
