DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'is_admin'
      AND pg_function_is_visible(oid)
  ) THEN
    RAISE EXCEPTION 'Função public.is_admin não encontrada.';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'league_calendar_holiday_scope'
  ) THEN
    CREATE TYPE public.league_calendar_holiday_scope AS ENUM ('NATIONAL', 'JOINVILLE');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'league_calendar_holiday_day_kind'
  ) THEN
    CREATE TYPE public.league_calendar_holiday_day_kind AS ENUM ('HOLIDAY', 'OPTIONAL');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.league_calendar_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date DATE NOT NULL,
  name TEXT NOT NULL,
  scope public.league_calendar_holiday_scope NOT NULL,
  day_kind public.league_calendar_holiday_day_kind NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.league_calendar_holidays
  ADD COLUMN IF NOT EXISTS holiday_date DATE,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS scope public.league_calendar_holiday_scope,
  ADD COLUMN IF NOT EXISTS day_kind public.league_calendar_holiday_day_kind,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.league_calendar_holidays
  ALTER COLUMN holiday_date SET NOT NULL;

ALTER TABLE public.league_calendar_holidays
  ALTER COLUMN name SET NOT NULL;

ALTER TABLE public.league_calendar_holidays
  ALTER COLUMN scope SET NOT NULL;

ALTER TABLE public.league_calendar_holidays
  ALTER COLUMN day_kind SET NOT NULL;

COMMENT ON TABLE public.league_calendar_holidays IS 'Calendário oficial de feriados e pontos facultativos da Liga.';
COMMENT ON COLUMN public.league_calendar_holidays.holiday_date IS 'Data do feriado ou ponto facultativo.';
COMMENT ON COLUMN public.league_calendar_holidays.name IS 'Nome oficial da data no calendário.';
COMMENT ON COLUMN public.league_calendar_holidays.scope IS 'Escopo da data no calendário: nacional ou Joinville.';
COMMENT ON COLUMN public.league_calendar_holidays.day_kind IS 'Classificação do dia: feriado oficial ou ponto facultativo.';

CREATE INDEX IF NOT EXISTS league_calendar_holidays_date_idx
  ON public.league_calendar_holidays (holiday_date);

CREATE UNIQUE INDEX IF NOT EXISTS league_calendar_holidays_unique_day_idx
  ON public.league_calendar_holidays (holiday_date, name, scope, day_kind);

CREATE OR REPLACE FUNCTION public.set_league_calendar_holidays_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_league_calendar_holidays_updated_at_trigger ON public.league_calendar_holidays;

CREATE TRIGGER set_league_calendar_holidays_updated_at_trigger
BEFORE UPDATE ON public.league_calendar_holidays
FOR EACH ROW
EXECUTE FUNCTION public.set_league_calendar_holidays_updated_at();

CREATE OR REPLACE FUNCTION public.resolve_easter_date(_year INTEGER)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  a INTEGER;
  b INTEGER;
  c INTEGER;
  d INTEGER;
  e INTEGER;
  f INTEGER;
  g INTEGER;
  h INTEGER;
  i INTEGER;
  k INTEGER;
  l INTEGER;
  m INTEGER;
  month_value INTEGER;
  day_value INTEGER;
BEGIN
  a := _year % 19;
  b := floor(_year / 100);
  c := _year % 100;
  d := floor(b / 4);
  e := b % 4;
  f := floor((b + 8) / 25);
  g := floor((b - f + 1) / 3);
  h := (19 * a + b - d - g + 15) % 30;
  i := floor(c / 4);
  k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := floor((a + 11 * h + 22 * l) / 451);
  month_value := floor((h + l - 7 * m + 114) / 31);
  day_value := ((h + l - 7 * m + 114) % 31) + 1;

  RETURN make_date(_year, month_value, day_value);
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_league_calendar_holidays_year(_year INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      (make_date(_year, 1, 1), 'Confraternização Universal', 'NATIONAL'::public.league_calendar_holiday_scope, 'HOLIDAY'::public.league_calendar_holiday_day_kind),
      (make_date(_year, 4, 21), 'Tiradentes', 'NATIONAL'::public.league_calendar_holiday_scope, 'HOLIDAY'::public.league_calendar_holiday_day_kind),
      (make_date(_year, 5, 1), 'Dia do Trabalhador', 'NATIONAL'::public.league_calendar_holiday_scope, 'HOLIDAY'::public.league_calendar_holiday_day_kind),
      (make_date(_year, 9, 7), 'Independência do Brasil', 'NATIONAL'::public.league_calendar_holiday_scope, 'HOLIDAY'::public.league_calendar_holiday_day_kind),
      (make_date(_year, 10, 12), 'Nossa Senhora Aparecida', 'NATIONAL'::public.league_calendar_holiday_scope, 'HOLIDAY'::public.league_calendar_holiday_day_kind),
      (make_date(_year, 11, 2), 'Finados', 'NATIONAL'::public.league_calendar_holiday_scope, 'HOLIDAY'::public.league_calendar_holiday_day_kind),
      (make_date(_year, 11, 15), 'Proclamação da República', 'NATIONAL'::public.league_calendar_holiday_scope, 'HOLIDAY'::public.league_calendar_holiday_day_kind),
      (make_date(_year, 11, 20), 'Dia da Consciência Negra', 'NATIONAL'::public.league_calendar_holiday_scope, 'HOLIDAY'::public.league_calendar_holiday_day_kind),
      (make_date(_year, 12, 25), 'Natal', 'NATIONAL'::public.league_calendar_holiday_scope, 'HOLIDAY'::public.league_calendar_holiday_day_kind),
      (make_date(_year, 3, 9), 'Aniversário de Joinville', 'JOINVILLE'::public.league_calendar_holiday_scope, 'HOLIDAY'::public.league_calendar_holiday_day_kind),
      (easter_date - 47, 'Carnaval', 'NATIONAL'::public.league_calendar_holiday_scope, 'OPTIONAL'::public.league_calendar_holiday_day_kind),
      (easter_date - 2, 'Sexta-feira Santa', 'NATIONAL'::public.league_calendar_holiday_scope, 'HOLIDAY'::public.league_calendar_holiday_day_kind),
      (easter_date + 60, 'Corpus Christi', 'NATIONAL'::public.league_calendar_holiday_scope, 'OPTIONAL'::public.league_calendar_holiday_day_kind)
  ) AS holiday_item (holiday_date, name, scope, day_kind)
  ON CONFLICT (holiday_date, name, scope, day_kind)
  DO UPDATE
  SET updated_at = now();

  RETURN _year;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_league_calendar_holidays_year(INTEGER) TO anon, authenticated;

ALTER TABLE public.league_calendar_holidays ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_calendar_holidays'
      AND policyname = 'Public can view league calendar holidays'
  ) THEN
    CREATE POLICY "Public can view league calendar holidays"
      ON public.league_calendar_holidays
      FOR SELECT
      USING (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_calendar_holidays'
      AND policyname = 'Admin can insert league calendar holidays'
  ) THEN
    CREATE POLICY "Admin can insert league calendar holidays"
      ON public.league_calendar_holidays
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_admin());
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_calendar_holidays'
      AND policyname = 'Admin can update league calendar holidays'
  ) THEN
    CREATE POLICY "Admin can update league calendar holidays"
      ON public.league_calendar_holidays
      FOR UPDATE
      TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_calendar_holidays'
      AND policyname = 'Admin can delete league calendar holidays'
  ) THEN
    CREATE POLICY "Admin can delete league calendar holidays"
      ON public.league_calendar_holidays
      FOR DELETE
      TO authenticated
      USING (public.is_admin());
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
