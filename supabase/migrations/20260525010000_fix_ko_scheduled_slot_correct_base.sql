-- Corrige scheduled_slot dos jogos KO (status SCHEDULED) que receberam
-- slot errado (18, 18) porque a compactação anterior partiu do MIN(slot KO)
-- em vez de partir de MAX(slot dos jogos de grupo no mesmo dia) + 1.
--
-- Para cada (championship, season, sport, scheduled_date) com jogos KO pendentes:
--   base = MAX(scheduled_slot dos jogos de GROUP_STAGE do mesmo sport nesse dia) + 1
--   Se não houver grupo no dia: base = 1
--   Compactar KO dentro do court_cap (ex: 2 quadras → Jogo 7, 7 para as 2 semis)

DO $fix_ko_base_slot$
DECLARE
  v_rec          RECORD;
  v_match        RECORD;
  v_court_cap    INTEGER;
  v_base_slot    INTEGER;
  v_new_slot     INTEGER;
  v_slot_fill    INTEGER;
BEGIN
  FOR v_rec IN
    SELECT DISTINCT
      m.championship_id,
      m.season_year,
      m.scheduled_date,
      m.sport_id
    FROM public.matches AS m
    JOIN public.championship_bracket_matches AS bm ON bm.match_id = m.id
    WHERE bm.phase = 'KNOCKOUT'
      AND m.status = 'SCHEDULED'
      AND m.scheduled_date IS NOT NULL
  LOOP
    -- Capacidade de quadras do esporte nesse dia
    SELECT COUNT(DISTINCT bc.id)::INTEGER INTO v_court_cap
    FROM public.championship_bracket_editions AS e
    JOIN public.championship_bracket_days     AS d  ON d.bracket_edition_id   = e.id
    JOIN public.championship_bracket_locations AS l  ON l.bracket_day_id      = d.id
    JOIN public.championship_bracket_courts    AS bc ON bc.bracket_location_id = l.id
    JOIN public.championship_bracket_court_sports AS cs ON cs.bracket_court_id = bc.id
    WHERE e.championship_id = v_rec.championship_id
      AND e.season_year     = v_rec.season_year
      AND d.event_date      = v_rec.scheduled_date
      AND cs.sport_id       = v_rec.sport_id;

    IF COALESCE(v_court_cap, 0) = 0 THEN v_court_cap := 1; END IF;

    -- Base correta: logo após o maior slot de grupo do mesmo esporte nesse dia
    SELECT COALESCE(MAX(m2.scheduled_slot), 0) + 1 INTO v_base_slot
    FROM public.matches AS m2
    JOIN public.championship_bracket_matches AS bm2 ON bm2.match_id = m2.id
    WHERE m2.championship_id = v_rec.championship_id
      AND m2.season_year     = v_rec.season_year
      AND m2.scheduled_date  = v_rec.scheduled_date
      AND m2.sport_id        = v_rec.sport_id
      AND bm2.phase          = 'GROUP_STAGE';

    v_new_slot  := v_base_slot;
    v_slot_fill := 0;

    -- Atribuir slots compactados em ordem de round/slot do chaveamento
    FOR v_match IN
      SELECT m3.id
      FROM public.matches AS m3
      JOIN public.championship_bracket_matches AS bm3 ON bm3.match_id = m3.id
      WHERE m3.championship_id = v_rec.championship_id
        AND m3.season_year     = v_rec.season_year
        AND m3.scheduled_date  = v_rec.scheduled_date
        AND m3.sport_id        = v_rec.sport_id
        AND bm3.phase          = 'KNOCKOUT'
        AND m3.status          = 'SCHEDULED'
      ORDER BY bm3.round_number ASC, bm3.slot_number ASC, m3.id ASC
    LOOP
      UPDATE public.matches SET scheduled_slot = v_new_slot WHERE id = v_match.id;
      v_slot_fill := v_slot_fill + 1;
      IF v_slot_fill >= v_court_cap THEN
        v_new_slot  := v_new_slot + 1;
        v_slot_fill := 0;
      END IF;
    END LOOP;
  END LOOP;
END;
$fix_ko_base_slot$;

NOTIFY pgrst, 'reload schema';
