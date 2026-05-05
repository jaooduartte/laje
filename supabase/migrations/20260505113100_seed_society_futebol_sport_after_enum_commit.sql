DO $$
DECLARE
  society_championship_id UUID;
  futebol_society_sport_id UUID;
BEGIN
  SELECT championships_table.id
  INTO society_championship_id
  FROM public.championships AS championships_table
  WHERE championships_table.code = 'SOCIETY'
  LIMIT 1;

  IF society_championship_id IS NULL THEN
    RETURN;
  END IF;

  SELECT sports_table.id
  INTO futebol_society_sport_id
  FROM public.sports AS sports_table
  WHERE public.normalize_sport_name(sports_table.name) = 'futebol society'
  LIMIT 1;

  IF futebol_society_sport_id IS NULL THEN
    INSERT INTO public.sports (name)
    VALUES ('Futebol Society')
    RETURNING id INTO futebol_society_sport_id;
  END IF;

  DELETE FROM public.championship_sports AS championship_sports_table
  USING public.sports AS sports_table
  WHERE championship_sports_table.championship_id = society_championship_id
    AND sports_table.id = championship_sports_table.sport_id
    AND public.normalize_sport_name(sports_table.name) <> 'futebol society';

  INSERT INTO public.championship_sports (
    championship_id,
    sport_id
  )
  VALUES (
    society_championship_id,
    futebol_society_sport_id
  )
  ON CONFLICT (championship_id, sport_id) DO UPDATE
  SET sport_id = EXCLUDED.sport_id;
END
$$;

NOTIFY pgrst, 'reload schema';
