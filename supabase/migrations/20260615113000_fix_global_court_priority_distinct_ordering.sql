CREATE OR REPLACE FUNCTION public.sync_bracket_global_court_preferences(
  _bracket_edition_id UUID,
  _location_group_id UUID,
  _sport_id UUID,
  _priority_mode public.bracket_court_priority_mode
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  naipe_options public.match_naipe[];
  division_options public.team_division[];
  naipe_option_count INTEGER;
  division_option_count INTEGER;
BEGIN
  SELECT COALESCE(array_agg(ordered_naipes_table.naipe), ARRAY[]::public.match_naipe[])
  INTO naipe_options
  FROM (
    SELECT
      matches_table.naipe,
      MIN(
        CASE matches_table.naipe
          WHEN 'FEMININO'::public.match_naipe THEN 1
          WHEN 'MASCULINO'::public.match_naipe THEN 2
          ELSE 3
        END
      ) AS sort_order
    FROM public.matches AS matches_table
    JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.match_id = matches_table.id
    WHERE bracket_matches_table.bracket_edition_id = _bracket_edition_id
      AND matches_table.sport_id = _sport_id
    GROUP BY matches_table.naipe
    ORDER BY sort_order, matches_table.naipe
  ) AS ordered_naipes_table;

  SELECT COALESCE(array_agg(ordered_divisions_table.division), ARRAY[]::public.team_division[])
  INTO division_options
  FROM (
    SELECT
      matches_table.division,
      MIN(
        CASE matches_table.division
          WHEN 'DIVISAO_PRINCIPAL'::public.team_division THEN 1
          WHEN 'DIVISAO_ACESSO'::public.team_division THEN 2
          ELSE 99
        END
      ) AS sort_order
    FROM public.matches AS matches_table
    JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.match_id = matches_table.id
    WHERE bracket_matches_table.bracket_edition_id = _bracket_edition_id
      AND matches_table.sport_id = _sport_id
      AND matches_table.division IS NOT NULL
    GROUP BY matches_table.division
    ORDER BY sort_order, matches_table.division
  ) AS ordered_divisions_table;

  naipe_option_count := COALESCE(array_length(naipe_options, 1), 0);
  division_option_count := COALESCE(array_length(division_options, 1), 0);

  UPDATE public.championship_bracket_court_sports AS court_sports_table
  SET
    preferred_naipe = CASE
      WHEN _priority_mode = 'NAIPE'::public.bracket_court_priority_mode AND naipe_option_count > 0 THEN
        naipe_options[((ordered_courts_table.court_order - 1) % naipe_option_count) + 1]
      ELSE NULL
    END,
    preferred_division = CASE
      WHEN _priority_mode = 'DIVISION'::public.bracket_court_priority_mode AND division_option_count > 0 THEN
        division_options[((ordered_courts_table.court_order - 1) % division_option_count) + 1]
      ELSE NULL
    END
  FROM (
    SELECT
      court_sports_table.id AS court_sport_id,
      ROW_NUMBER() OVER (
        ORDER BY
          locations_table.position ASC,
          locations_table.name ASC,
          courts_table.position ASC,
          courts_table.name ASC,
          days_table.event_date ASC
      ) AS court_order
    FROM public.championship_bracket_days AS days_table
    JOIN public.championship_bracket_locations AS locations_table
      ON locations_table.bracket_day_id = days_table.id
    JOIN public.championship_bracket_courts AS courts_table
      ON courts_table.bracket_location_id = locations_table.id
    JOIN public.championship_bracket_court_sports AS court_sports_table
      ON court_sports_table.bracket_court_id = courts_table.id
    WHERE days_table.bracket_edition_id = _bracket_edition_id
      AND locations_table.location_group_id = _location_group_id
      AND court_sports_table.sport_id = _sport_id
  ) AS ordered_courts_table
  WHERE ordered_courts_table.court_sport_id = court_sports_table.id;
END;
$$;

NOTIFY pgrst, 'reload schema';
