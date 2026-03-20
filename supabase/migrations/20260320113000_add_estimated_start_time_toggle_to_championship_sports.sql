DO $migration_championship_sports$
BEGIN
  IF to_regclass('public.championship_sports') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS columns_table
    WHERE columns_table.table_schema = 'public'
      AND columns_table.table_name = 'championship_sports'
      AND columns_table.column_name = 'show_estimated_start_time_on_cards'
  ) THEN
    ALTER TABLE public.championship_sports
      ADD COLUMN show_estimated_start_time_on_cards BOOLEAN;
  END IF;

  ALTER TABLE public.championship_sports
    ALTER COLUMN show_estimated_start_time_on_cards SET DEFAULT false;

  UPDATE public.championship_sports
  SET show_estimated_start_time_on_cards = false
  WHERE show_estimated_start_time_on_cards IS NULL;

  UPDATE public.championship_sports
  SET show_estimated_start_time_on_cards = true
  FROM public.sports AS sports_table
  WHERE sports_table.id = public.championship_sports.sport_id
    AND lower(public.normalize_sport_name(sports_table.name)) = 'beach soccer';

  ALTER TABLE public.championship_sports
    ALTER COLUMN show_estimated_start_time_on_cards SET NOT NULL;
END;
$migration_championship_sports$;

COMMENT ON COLUMN public.championship_sports.show_estimated_start_time_on_cards IS 'Define se os cards devem exibir horário estimado de início para a modalidade.';
