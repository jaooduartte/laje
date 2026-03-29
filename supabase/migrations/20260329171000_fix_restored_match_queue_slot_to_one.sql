DO $$
DECLARE
  target_match public.matches%ROWTYPE;
BEGIN
  IF to_regclass('public.matches') IS NULL THEN
    RAISE EXCEPTION 'Tabela public.matches não encontrada.';
  END IF;

  SELECT *
  INTO target_match
  FROM public.matches
  WHERE id = '6aad3317-e876-40cd-88fa-860df1a17719'::uuid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jogo restaurado não encontrado para ajuste de fila.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.matches AS matches_table
    WHERE matches_table.id != target_match.id
      AND matches_table.championship_id = target_match.championship_id
      AND matches_table.season_year = target_match.season_year
      AND matches_table.scheduled_date = target_match.scheduled_date
      AND matches_table.sport_id = target_match.sport_id
      AND matches_table.naipe = target_match.naipe
      AND matches_table.division IS NOT DISTINCT FROM target_match.division
      AND matches_table.queue_position = 1
  ) THEN
    RAISE EXCEPTION 'Já existe outro jogo com queue_position 1 neste escopo de modalidade/naipe/divisão.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.matches AS matches_table
    WHERE matches_table.id != target_match.id
      AND matches_table.championship_id = target_match.championship_id
      AND matches_table.season_year = target_match.season_year
      AND matches_table.scheduled_date = target_match.scheduled_date
      AND matches_table.sport_id = target_match.sport_id
      AND matches_table.scheduled_slot = 1
  ) THEN
    RAISE EXCEPTION 'Já existe outro jogo da mesma modalidade ocupando o scheduled_slot 1.';
  END IF;

  UPDATE public.matches
  SET
    queue_position = 1,
    scheduled_slot = 1
  WHERE id = target_match.id;
END
$$;
