-- Renomeia "Confraternização Universal" para "Ano Novo" na tabela e na função de geração de feriados.
-- O nome oficial popular é "Ano Novo"; "Confraternização Universal" é o nome legal mas raramente usado.

-- 1. Atualizar registros existentes na tabela
UPDATE public.league_calendar_holidays
SET name = 'Ano Novo'
WHERE name = 'Confraternização Universal';

-- 2. Atualizar a função de geração para que anos futuros já gerem com o novo nome
CREATE OR REPLACE FUNCTION public.ensure_league_calendar_holidays_year(_year integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  easter_date DATE;
BEGIN
  IF _year < 1900 OR _year > 2100 THEN
    RAISE EXCEPTION 'Ano inválido para geração de feriados: %', _year;
  END IF;

  easter_date := public.resolve_easter_date(_year);

  INSERT INTO public.league_calendar_holidays (
    holiday_date,
    name,
    scope,
    day_kind
  )
  SELECT
    holiday_item.holiday_date,
    holiday_item.name,
    holiday_item.scope,
    holiday_item.day_kind
  FROM (
    VALUES
      (make_date(_year, 1, 1),   'Ano Novo',                    'NATIONAL'::public.league_calendar_holiday_scope, 'HOLIDAY'::public.league_calendar_holiday_day_kind),
      (make_date(_year, 4, 21),  'Tiradentes',                  'NATIONAL'::public.league_calendar_holiday_scope, 'HOLIDAY'::public.league_calendar_holiday_day_kind),
      (make_date(_year, 5, 1),   'Dia do Trabalhador',          'NATIONAL'::public.league_calendar_holiday_scope, 'HOLIDAY'::public.league_calendar_holiday_day_kind),
      (make_date(_year, 9, 7),   'Independência do Brasil',     'NATIONAL'::public.league_calendar_holiday_scope, 'HOLIDAY'::public.league_calendar_holiday_day_kind),
      (make_date(_year, 10, 12), 'Nossa Senhora Aparecida',     'NATIONAL'::public.league_calendar_holiday_scope, 'HOLIDAY'::public.league_calendar_holiday_day_kind),
      (make_date(_year, 11, 2),  'Finados',                     'NATIONAL'::public.league_calendar_holiday_scope, 'HOLIDAY'::public.league_calendar_holiday_day_kind),
      (make_date(_year, 11, 15), 'Proclamação da República',    'NATIONAL'::public.league_calendar_holiday_scope, 'HOLIDAY'::public.league_calendar_holiday_day_kind),
      (make_date(_year, 11, 20), 'Dia da Consciência Negra',    'NATIONAL'::public.league_calendar_holiday_scope, 'HOLIDAY'::public.league_calendar_holiday_day_kind),
      (make_date(_year, 12, 25), 'Natal',                       'NATIONAL'::public.league_calendar_holiday_scope, 'HOLIDAY'::public.league_calendar_holiday_day_kind),
      (make_date(_year, 3, 9),   'Aniversário de Joinville',    'JOINVILLE'::public.league_calendar_holiday_scope, 'HOLIDAY'::public.league_calendar_holiday_day_kind),
      (easter_date - 47,         'Carnaval',                    'NATIONAL'::public.league_calendar_holiday_scope, 'OPTIONAL'::public.league_calendar_holiday_day_kind),
      (easter_date - 2,          'Sexta-feira Santa',           'NATIONAL'::public.league_calendar_holiday_scope, 'HOLIDAY'::public.league_calendar_holiday_day_kind),
      (easter_date + 60,         'Corpus Christi',              'NATIONAL'::public.league_calendar_holiday_scope, 'OPTIONAL'::public.league_calendar_holiday_day_kind)
  ) AS holiday_item (holiday_date, name, scope, day_kind)
  ON CONFLICT (holiday_date, name, scope, day_kind)
  DO UPDATE
  SET updated_at = now();

  RETURN _year;
END;
$function$;
