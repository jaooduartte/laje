DO $block$
DECLARE
  canonical_player_id CONSTANT UUID := '3fe38c08-1aa6-4df9-8a8e-c9b3de940767'::UUID;
  duplicate_player_id CONSTANT UUID := '2d70d6a6-8595-4fb4-b556-320cae53e149'::UUID;
  expected_match_ids CONSTANT UUID[] := ARRAY[
    'bd979451-fa92-4281-9767-275eeba16be5'::UUID,
    'b62a56a6-42ac-46e7-9198-f167eebb036b'::UUID
  ];
  recorded_card_count INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.championship_award_players AS award_players_table
    WHERE award_players_table.id = canonical_player_id
      AND award_players_table.championship_id = 'c7718ca6-4447-4c20-a8ca-5781a34a3778'::UUID
      AND award_players_table.season_year = 2026
      AND award_players_table.sport_id = '906e409b-9ca8-44a0-99f8-14bbbda2ef5a'::UUID
      AND award_players_table.team_id = '1ebe409c-171f-4c17-8078-3dc6fd0451b3'::UUID
      AND award_players_table.naipe = 'MASCULINO'::public.match_naipe
      AND award_players_table.division IS NULL
      AND award_players_table.name = 'Gustavo Fagundes Ostroki'
  ) THEN
    RAISE EXCEPTION 'Não foi possível localizar o cadastro principal de Gustavo Fagundes Ostroki.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.championship_award_players AS award_players_table
    WHERE award_players_table.id = duplicate_player_id
      AND award_players_table.championship_id = 'c7718ca6-4447-4c20-a8ca-5781a34a3778'::UUID
      AND award_players_table.season_year = 2026
      AND award_players_table.sport_id = '906e409b-9ca8-44a0-99f8-14bbbda2ef5a'::UUID
      AND award_players_table.team_id = '1ebe409c-171f-4c17-8078-3dc6fd0451b3'::UUID
      AND award_players_table.naipe = 'MASCULINO'::public.match_naipe
      AND award_players_table.division IS NULL
      AND award_players_table.name = 'Gustavo Fagundes'
  ) THEN
    RAISE EXCEPTION 'Não foi possível localizar o cadastro duplicado de Gustavo Fagundes.';
  END IF;

  IF (
    SELECT count(*)
    FROM public.match_yellow_card_players AS yellow_cards_table
    WHERE yellow_cards_table.player_id = duplicate_player_id
      AND yellow_cards_table.match_id = ANY(expected_match_ids)
  ) <> 1 THEN
    RAISE EXCEPTION 'O cartão amarelo do cadastro duplicado de Gustavo Fagundes não confere.';
  END IF;

  UPDATE public.match_yellow_card_players AS yellow_cards_table
  SET player_id = canonical_player_id
  WHERE yellow_cards_table.player_id = duplicate_player_id
    AND yellow_cards_table.match_id = ANY(expected_match_ids);

  SELECT count(*)
  INTO recorded_card_count
  FROM public.match_yellow_card_players AS yellow_cards_table
  WHERE yellow_cards_table.player_id = canonical_player_id
    AND yellow_cards_table.match_id = ANY(expected_match_ids);

  IF recorded_card_count <> 2 THEN
    RAISE EXCEPTION 'Os dois cartões amarelos de Gustavo Fagundes Ostroki não foram consolidados.';
  END IF;

  DELETE FROM public.championship_award_players
  WHERE id = duplicate_player_id;
END;
$block$;
