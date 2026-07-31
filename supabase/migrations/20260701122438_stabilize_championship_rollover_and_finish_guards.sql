REVOKE EXECUTE ON FUNCTION public.sync_championship_season_rollover() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.validate_championship_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'PLANNING'::public.championship_status
    AND NEW.status IN ('IN_PROGRESS'::public.championship_status, 'FINISHED'::public.championship_status) THEN
    RAISE EXCEPTION 'O campeonato precisa passar por Configurando campeonato antes de ir para Em andamento ou Encerrado.';
  END IF;

  IF NEW.status = 'FINISHED'::public.championship_status
    AND EXISTS (
      SELECT 1
      FROM public.matches AS matches_table
      WHERE matches_table.championship_id = NEW.id
        AND matches_table.season_year = NEW.current_season_year
        AND matches_table.status IN ('SCHEDULED'::public.match_status, 'LIVE'::public.match_status)
    ) THEN
    RAISE EXCEPTION 'Não é possível encerrar o campeonato enquanto existirem jogos agendados ou ao vivo na temporada atual.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_championship_season(
  _championship_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  championship_record public.championships%ROWTYPE;
  next_season_year_value INTEGER;
BEGIN
  IF NOT public.has_admin_tab_access('championship_status'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Apenas administradores com acesso ao status do campeonato podem virar a temporada.';
  END IF;

  SELECT *
  INTO championship_record
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campeonato não encontrado.';
  END IF;

  IF championship_record.status != 'FINISHED'::public.championship_status THEN
    RAISE EXCEPTION 'Somente campeonatos encerrados podem abrir uma nova temporada.';
  END IF;

  next_season_year_value := championship_record.current_season_year + 1;

  IF EXISTS (
    SELECT 1
    FROM public.matches AS matches_table
    WHERE matches_table.championship_id = championship_record.id
      AND matches_table.season_year = next_season_year_value
  ) OR EXISTS (
    SELECT 1
    FROM public.standings AS standings_table
    WHERE standings_table.championship_id = championship_record.id
      AND standings_table.season_year = next_season_year_value
  ) OR EXISTS (
    SELECT 1
    FROM public.championship_bracket_editions AS bracket_editions_table
    WHERE bracket_editions_table.championship_id = championship_record.id
      AND bracket_editions_table.season_year = next_season_year_value
  ) THEN
    RAISE EXCEPTION 'A próxima temporada já possui dados cadastrados.';
  END IF;

  UPDATE public.championships
  SET
    current_season_year = next_season_year_value,
    status = 'PLANNING'::public.championship_status
  WHERE id = championship_record.id;

  RETURN json_build_object(
    'championship_id', championship_record.id,
    'previous_season_year', championship_record.current_season_year,
    'current_season_year', next_season_year_value,
    'status', 'PLANNING'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.advance_championship_season(UUID) TO authenticated;

COMMENT ON FUNCTION public.advance_championship_season(UUID) IS 'Abre manualmente a próxima temporada de um campeonato encerrado, movendo o status para Em breve.';

NOTIFY pgrst, 'reload schema';
