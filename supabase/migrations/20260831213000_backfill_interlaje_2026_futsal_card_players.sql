DO $block$
DECLARE
  card_record RECORD;
  match_record RECORD;
  resolved_player_id UUID;
  existing_card_count INTEGER;
  recorded_yellow_card_count INTEGER;
  recorded_red_card_count INTEGER;
  updated_match_count INTEGER;
BEGIN
  UPDATE public.matches AS matches_table
  SET
    supports_cards = true,
    away_yellow_cards = CASE
      WHEN matches_table.id = 'f8908902-f304-431b-8158-a6187920e328'::UUID THEN 3
      ELSE matches_table.away_yellow_cards
    END,
    away_red_cards = CASE
      WHEN matches_table.id = 'f8908902-f304-431b-8158-a6187920e328'::UUID THEN 0
      ELSE matches_table.away_red_cards
    END
  FROM public.championships AS championships_table,
    public.sports AS sports_table
  WHERE matches_table.id IN (
      'd8e2c19f-af9b-4dd8-bc09-33070b3b0f1f'::UUID,
      '40d0be23-0d36-4321-81f5-5e2c52ead6af'::UUID,
      '5b45918b-5e1e-49cb-bfcc-69af6452da67'::UUID,
      'bd979451-fa92-4281-9767-275eeba16be5'::UUID,
      '249ac123-84f2-47fa-90ee-99213c6bd13f'::UUID,
      '97d5d4a3-e566-48e5-a47b-8e7a02b52177'::UUID,
      'd79fa994-19ed-49d6-829c-c547f1206848'::UUID,
      'f8908902-f304-431b-8158-a6187920e328'::UUID,
      '7f9048ab-1a68-4675-b6af-c2c762875f56'::UUID,
      '337c6cea-31cd-492b-ac01-634e1b80e1e0'::UUID,
      'baa56691-c9a0-4e4b-aef9-b69569a10764'::UUID,
      'e26c85e8-4e96-4c90-9a03-abbd65793e43'::UUID,
      '315a1c2e-72e4-4ca8-8de6-24b4018fe5d0'::UUID,
      'b62a56a6-42ac-46e7-9198-f167eebb036b'::UUID,
      'c0fb83e9-6f3d-4458-806a-9101f142cefe'::UUID,
      'd82f910e-a8fd-48d6-8c80-b92a10c575ab'::UUID,
      'd8f4305f-6489-4e74-9815-68544ba9d620'::UUID,
      'b1c765f3-74ee-4600-92b1-ff770bf0ea7a'::UUID,
      'd0ae0d03-9ff1-495e-9b2f-104f51c3d0f4'::UUID,
      '2d939577-62cb-492d-8553-c41116d9e980'::UUID,
      'aa85aa4d-1397-45f9-ba8e-7af6f85ba91b'::UUID
    )
    AND championships_table.id = matches_table.championship_id
    AND sports_table.id = matches_table.sport_id
    AND championships_table.code = 'INTERLAJE'::public.championship_code
    AND matches_table.season_year = 2026
    AND sports_table.name = 'Futsal'
    AND matches_table.status = 'FINISHED'::public.match_status;

  GET DIAGNOSTICS updated_match_count = ROW_COUNT;

  IF updated_match_count <> 21 THEN
    RAISE EXCEPTION 'Não foi possível preparar os jogos de Futsal para o cadastro individual de cartões.';
  END IF;

  FOR card_record IN
    SELECT *
    FROM (
      VALUES
        ('d8e2c19f-af9b-4dd8-bc09-33070b3b0f1f'::UUID, 'CCT'::TEXT, 'Aline Hoepers'::TEXT, 'YELLOW'::TEXT),
        ('40d0be23-0d36-4321-81f5-5e2c52ead6af'::UUID, 'RAPOSAS'::TEXT, 'Luiz Eduardo Tavares'::TEXT, 'YELLOW'::TEXT),
        ('5b45918b-5e1e-49cb-bfcc-69af6452da67'::UUID, 'AAASF'::TEXT, 'Miguel Anastacio'::TEXT, 'YELLOW'::TEXT),
        ('5b45918b-5e1e-49cb-bfcc-69af6452da67'::UUID, 'ATENUN'::TEXT, 'Mark Fabricio Izaias'::TEXT, 'YELLOW'::TEXT),
        ('5b45918b-5e1e-49cb-bfcc-69af6452da67'::UUID, 'ATENUN'::TEXT, 'Lucas Kawen Knies'::TEXT, 'YELLOW'::TEXT),
        ('5b45918b-5e1e-49cb-bfcc-69af6452da67'::UUID, 'ATENUN'::TEXT, 'Leomar Boing Junior'::TEXT, 'YELLOW'::TEXT),
        ('bd979451-fa92-4281-9767-275eeba16be5'::UUID, 'AACOM'::TEXT, 'Gustavo Fagundes'::TEXT, 'YELLOW'::TEXT),
        ('249ac123-84f2-47fa-90ee-99213c6bd13f'::UUID, 'AMEN'::TEXT, 'Fhelype Hoepers'::TEXT, 'RED'::TEXT),
        ('249ac123-84f2-47fa-90ee-99213c6bd13f'::UUID, 'AMEN'::TEXT, 'Matheus Lehm'::TEXT, 'YELLOW'::TEXT),
        ('249ac123-84f2-47fa-90ee-99213c6bd13f'::UUID, 'AMEN'::TEXT, 'Nicolas Bepler'::TEXT, 'YELLOW'::TEXT),
        ('249ac123-84f2-47fa-90ee-99213c6bd13f'::UUID, 'ADIN'::TEXT, 'Matheus Brito'::TEXT, 'YELLOW'::TEXT),
        ('97d5d4a3-e566-48e5-a47b-8e7a02b52177'::UUID, 'CCT'::TEXT, 'Gustavo Henrique Brandes'::TEXT, 'RED'::TEXT),
        ('97d5d4a3-e566-48e5-a47b-8e7a02b52177'::UUID, 'CCT'::TEXT, 'Guilherme Pereira da Silva'::TEXT, 'YELLOW'::TEXT),
        ('97d5d4a3-e566-48e5-a47b-8e7a02b52177'::UUID, 'CCT'::TEXT, 'Bernardo Carlassara'::TEXT, 'YELLOW'::TEXT),
        ('97d5d4a3-e566-48e5-a47b-8e7a02b52177'::UUID, 'CAMALEÃO'::TEXT, 'João Pedro Klitzke'::TEXT, 'YELLOW'::TEXT),
        ('97d5d4a3-e566-48e5-a47b-8e7a02b52177'::UUID, 'CAMALEÃO'::TEXT, 'Guilherme Pinheiro'::TEXT, 'YELLOW'::TEXT),
        ('97d5d4a3-e566-48e5-a47b-8e7a02b52177'::UUID, 'CAMALEÃO'::TEXT, 'Guilherme Pinheiro'::TEXT, 'RED'::TEXT),
        ('d79fa994-19ed-49d6-829c-c547f1206848'::UUID, 'ENGÊNIOS'::TEXT, 'Vitor Kill'::TEXT, 'YELLOW'::TEXT),
        ('f8908902-f304-431b-8158-a6187920e328'::UUID, 'UEFA'::TEXT, 'Matheus Felipe Borgezan'::TEXT, 'YELLOW'::TEXT),
        ('f8908902-f304-431b-8158-a6187920e328'::UUID, 'AGUA'::TEXT, 'Lael Vinicius Sena de Souza'::TEXT, 'YELLOW'::TEXT),
        ('f8908902-f304-431b-8158-a6187920e328'::UUID, 'AGUA'::TEXT, 'Jonathan Rafael Baptista'::TEXT, 'YELLOW'::TEXT),
        ('f8908902-f304-431b-8158-a6187920e328'::UUID, 'AGUA'::TEXT, 'Jonathan Rafael Baptista'::TEXT, 'YELLOW'::TEXT),
        ('7f9048ab-1a68-4675-b6af-c2c762875f56'::UUID, 'AAAUS'::TEXT, 'Kleber Alexandre'::TEXT, 'YELLOW'::TEXT),
        ('337c6cea-31cd-492b-ac01-634e1b80e1e0'::UUID, 'CCT'::TEXT, 'Jeferson Roner'::TEXT, 'YELLOW'::TEXT),
        ('337c6cea-31cd-492b-ac01-634e1b80e1e0'::UUID, 'GARRUDOS'::TEXT, 'Mauricio Pagani'::TEXT, 'YELLOW'::TEXT),
        ('baa56691-c9a0-4e4b-aef9-b69569a10764'::UUID, 'TAUROS'::TEXT, 'Ederson Patrick Teles'::TEXT, 'YELLOW'::TEXT),
        ('baa56691-c9a0-4e4b-aef9-b69569a10764'::UUID, 'TAUROS'::TEXT, 'Jeison Eduardo Brand'::TEXT, 'YELLOW'::TEXT),
        ('baa56691-c9a0-4e4b-aef9-b69569a10764'::UUID, 'TAUROS'::TEXT, 'João Gabriel Martins'::TEXT, 'YELLOW'::TEXT),
        ('baa56691-c9a0-4e4b-aef9-b69569a10764'::UUID, 'TAUROS'::TEXT, 'Marcos Silveira Gomes'::TEXT, 'YELLOW'::TEXT),
        ('baa56691-c9a0-4e4b-aef9-b69569a10764'::UUID, 'ENGÊNIOS'::TEXT, 'Estevão Uber Goes'::TEXT, 'YELLOW'::TEXT),
        ('baa56691-c9a0-4e4b-aef9-b69569a10764'::UUID, 'ENGÊNIOS'::TEXT, 'Wesley Reis Marcos'::TEXT, 'YELLOW'::TEXT),
        ('baa56691-c9a0-4e4b-aef9-b69569a10764'::UUID, 'ENGÊNIOS'::TEXT, 'Eduardo Alcala'::TEXT, 'YELLOW'::TEXT),
        ('e26c85e8-4e96-4c90-9a03-abbd65793e43'::UUID, 'AAAMU'::TEXT, 'Raphael F. de Souza'::TEXT, 'YELLOW'::TEXT),
        ('315a1c2e-72e4-4ca8-8de6-24b4018fe5d0'::UUID, 'UEFA'::TEXT, 'Kalel Rocha'::TEXT, 'YELLOW'::TEXT),
        ('315a1c2e-72e4-4ca8-8de6-24b4018fe5d0'::UUID, 'AAASF'::TEXT, 'Marlin Krause'::TEXT, 'YELLOW'::TEXT),
        ('b62a56a6-42ac-46e7-9198-f167eebb036b'::UUID, 'AACOM'::TEXT, 'Gustavo Fagundes Ostroki'::TEXT, 'YELLOW'::TEXT),
        ('b62a56a6-42ac-46e7-9198-f167eebb036b'::UUID, 'AACOM'::TEXT, 'Matheus Xavier de Lima'::TEXT, 'YELLOW'::TEXT),
        ('b62a56a6-42ac-46e7-9198-f167eebb036b'::UUID, 'AAAMU'::TEXT, 'Carlos Miguel Rudolpho'::TEXT, 'YELLOW'::TEXT),
        ('b62a56a6-42ac-46e7-9198-f167eebb036b'::UUID, 'AAAMU'::TEXT, 'Gustavo Perina de Campos Lima'::TEXT, 'YELLOW'::TEXT),
        ('c0fb83e9-6f3d-4458-806a-9101f142cefe'::UUID, 'AGUA'::TEXT, 'Talisson Santos'::TEXT, 'YELLOW'::TEXT),
        ('d82f910e-a8fd-48d6-8c80-b92a10c575ab'::UUID, 'ENGÊNIOS'::TEXT, 'Eduardo Felipe de Oliveira'::TEXT, 'YELLOW'::TEXT),
        ('d82f910e-a8fd-48d6-8c80-b92a10c575ab'::UUID, 'ENGÊNIOS'::TEXT, 'Daniel de Jesus N. Trindade'::TEXT, 'YELLOW'::TEXT),
        ('d82f910e-a8fd-48d6-8c80-b92a10c575ab'::UUID, 'RAPOSAS'::TEXT, 'Miguel Ferreira Andrade'::TEXT, 'YELLOW'::TEXT),
        ('d82f910e-a8fd-48d6-8c80-b92a10c575ab'::UUID, 'RAPOSAS'::TEXT, 'Miguel Ferreira Andrade'::TEXT, 'YELLOW'::TEXT),
        ('d82f910e-a8fd-48d6-8c80-b92a10c575ab'::UUID, 'RAPOSAS'::TEXT, 'Luís Eduardo T. da Costa'::TEXT, 'YELLOW'::TEXT),
        ('d8f4305f-6489-4e74-9815-68544ba9d620'::UUID, 'ABUS'::TEXT, 'João Gabriel Machado'::TEXT, 'YELLOW'::TEXT),
        ('b1c765f3-74ee-4600-92b1-ff770bf0ea7a'::UUID, 'UEFA'::TEXT, 'Ana Schetz'::TEXT, 'YELLOW'::TEXT),
        ('d0ae0d03-9ff1-495e-9b2f-104f51c3d0f4'::UUID, 'ADIN'::TEXT, 'Alexandra R. de Souza'::TEXT, 'YELLOW'::TEXT),
        ('2d939577-62cb-492d-8553-c41116d9e980'::UUID, 'CCT'::TEXT, 'Suzana'::TEXT, 'YELLOW'::TEXT),
        ('2d939577-62cb-492d-8553-c41116d9e980'::UUID, 'CCT'::TEXT, 'Suzana'::TEXT, 'YELLOW'::TEXT),
        ('aa85aa4d-1397-45f9-ba8e-7af6f85ba91b'::UUID, 'ATENUN'::TEXT, 'Vitória Brustolin'::TEXT, 'YELLOW'::TEXT)
    ) AS card_entries(match_id, team_name, player_name, card_type)
  LOOP
    SELECT
      matches_table.id,
      matches_table.championship_id,
      matches_table.season_year,
      matches_table.sport_id,
      matches_table.naipe,
      matches_table.division,
      CASE
        WHEN home_teams_table.name = card_record.team_name THEN matches_table.home_team_id
        ELSE matches_table.away_team_id
      END AS team_id,
      CASE
        WHEN home_teams_table.name = card_record.team_name THEN matches_table.home_yellow_cards
        ELSE matches_table.away_yellow_cards
      END AS yellow_card_limit,
      CASE
        WHEN home_teams_table.name = card_record.team_name THEN matches_table.home_red_cards
        ELSE matches_table.away_red_cards
      END AS red_card_limit
    INTO match_record
    FROM public.matches AS matches_table
    JOIN public.championships AS championships_table
      ON championships_table.id = matches_table.championship_id
    JOIN public.sports AS sports_table
      ON sports_table.id = matches_table.sport_id
    JOIN public.teams AS home_teams_table
      ON home_teams_table.id = matches_table.home_team_id
    JOIN public.teams AS away_teams_table
      ON away_teams_table.id = matches_table.away_team_id
    WHERE matches_table.id = card_record.match_id
      AND championships_table.code = 'INTERLAJE'::public.championship_code
      AND matches_table.season_year = 2026
      AND sports_table.name = 'Futsal'
      AND matches_table.status = 'FINISHED'::public.match_status
      AND COALESCE(matches_table.supports_cards, false)
      AND NOT COALESCE(matches_table.is_walkover, false)
      AND card_record.team_name IN (home_teams_table.name, away_teams_table.name)
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Não foi possível localizar o jogo de Futsal para %.', card_record.player_name;
    END IF;

    resolved_player_id := public.resolve_or_create_championship_award_player(
      match_record.championship_id,
      match_record.season_year,
      match_record.sport_id,
      match_record.team_id,
      match_record.naipe,
      match_record.division,
      jsonb_build_object('player_name', card_record.player_name)
    );

    IF card_record.card_type = 'YELLOW' THEN
      SELECT count(*)
      INTO existing_card_count
      FROM public.match_yellow_card_players AS yellow_cards_table
      WHERE yellow_cards_table.match_id = match_record.id
        AND yellow_cards_table.team_id = match_record.team_id;

      IF existing_card_count >= match_record.yellow_card_limit THEN
        RAISE EXCEPTION 'A quantidade de cartões amarelos de % excede o total do jogo.', card_record.team_name;
      END IF;

      INSERT INTO public.match_yellow_card_players (match_id, team_id, player_id, card_order)
      VALUES (match_record.id, match_record.team_id, resolved_player_id, existing_card_count + 1);
    ELSE
      SELECT count(*)
      INTO existing_card_count
      FROM public.match_red_card_players AS red_cards_table
      WHERE red_cards_table.match_id = match_record.id
        AND red_cards_table.team_id = match_record.team_id;

      IF existing_card_count >= match_record.red_card_limit THEN
        RAISE EXCEPTION 'A quantidade de cartões vermelhos de % excede o total do jogo.', card_record.team_name;
      END IF;

      INSERT INTO public.match_red_card_players (match_id, team_id, player_id, card_order)
      VALUES (match_record.id, match_record.team_id, resolved_player_id, existing_card_count + 1);
    END IF;
  END LOOP;

  FOR match_record IN
    SELECT
      matches_table.id,
      matches_table.home_team_id,
      matches_table.away_team_id,
      matches_table.home_yellow_cards,
      matches_table.away_yellow_cards,
      matches_table.home_red_cards,
      matches_table.away_red_cards
    FROM public.matches AS matches_table
    WHERE matches_table.id IN (
      'd8e2c19f-af9b-4dd8-bc09-33070b3b0f1f'::UUID,
      '40d0be23-0d36-4321-81f5-5e2c52ead6af'::UUID,
      '5b45918b-5e1e-49cb-bfcc-69af6452da67'::UUID,
      'bd979451-fa92-4281-9767-275eeba16be5'::UUID,
      '249ac123-84f2-47fa-90ee-99213c6bd13f'::UUID,
      '97d5d4a3-e566-48e5-a47b-8e7a02b52177'::UUID,
      'd79fa994-19ed-49d6-829c-c547f1206848'::UUID,
      'f8908902-f304-431b-8158-a6187920e328'::UUID,
      '7f9048ab-1a68-4675-b6af-c2c762875f56'::UUID,
      '337c6cea-31cd-492b-ac01-634e1b80e1e0'::UUID,
      'baa56691-c9a0-4e4b-aef9-b69569a10764'::UUID,
      'e26c85e8-4e96-4c90-9a03-abbd65793e43'::UUID,
      '315a1c2e-72e4-4ca8-8de6-24b4018fe5d0'::UUID,
      'b62a56a6-42ac-46e7-9198-f167eebb036b'::UUID,
      'c0fb83e9-6f3d-4458-806a-9101f142cefe'::UUID,
      'd82f910e-a8fd-48d6-8c80-b92a10c575ab'::UUID,
      'd8f4305f-6489-4e74-9815-68544ba9d620'::UUID,
      'b1c765f3-74ee-4600-92b1-ff770bf0ea7a'::UUID,
      'd0ae0d03-9ff1-495e-9b2f-104f51c3d0f4'::UUID,
      '2d939577-62cb-492d-8553-c41116d9e980'::UUID,
      'aa85aa4d-1397-45f9-ba8e-7af6f85ba91b'::UUID
    )
  LOOP
    SELECT count(*)
    INTO recorded_yellow_card_count
    FROM public.match_yellow_card_players AS yellow_cards_table
    WHERE yellow_cards_table.match_id = match_record.id
      AND yellow_cards_table.team_id = match_record.home_team_id;

    IF recorded_yellow_card_count <> match_record.home_yellow_cards THEN
      RAISE EXCEPTION 'A quantidade de amarelos da equipe da casa não confere no jogo %.', match_record.id;
    END IF;

    SELECT count(*)
    INTO recorded_yellow_card_count
    FROM public.match_yellow_card_players AS yellow_cards_table
    WHERE yellow_cards_table.match_id = match_record.id
      AND yellow_cards_table.team_id = match_record.away_team_id;

    IF recorded_yellow_card_count <> match_record.away_yellow_cards THEN
      RAISE EXCEPTION 'A quantidade de amarelos da equipe visitante não confere no jogo %.', match_record.id;
    END IF;

    SELECT count(*)
    INTO recorded_red_card_count
    FROM public.match_red_card_players AS red_cards_table
    WHERE red_cards_table.match_id = match_record.id
      AND red_cards_table.team_id = match_record.home_team_id;

    IF recorded_red_card_count <> match_record.home_red_cards THEN
      RAISE EXCEPTION 'A quantidade de vermelhos da equipe da casa não confere no jogo %.', match_record.id;
    END IF;

    SELECT count(*)
    INTO recorded_red_card_count
    FROM public.match_red_card_players AS red_cards_table
    WHERE red_cards_table.match_id = match_record.id
      AND red_cards_table.team_id = match_record.away_team_id;

    IF recorded_red_card_count <> match_record.away_red_cards THEN
      RAISE EXCEPTION 'A quantidade de vermelhos da equipe visitante não confere no jogo %.', match_record.id;
    END IF;
  END LOOP;
END;
$block$;
