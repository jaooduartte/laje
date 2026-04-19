-- Fix: renumber queue_position per sport/naipe per day, starting from 1.
-- For Beach Soccer (1 court): MASCULINO + FEMININO share a single combined sequence.
-- For other sports: each naipe has its own independent sequence.
--
-- Also fixes: 16 matches on 2026-04-12 received incorrectly high scheduled_slot
-- values (202-227) due to the trigger running against an already-inflated global
-- slot counter. These are corrected to slots 31-34, consistent with the last
-- legitimate group-stage slot of each sport on that day (~30).
--
-- Finally, the trigger assign_match_queue_position is updated so that future
-- Beach Soccer matches (including knockout rounds) receive the next position in
-- the combined masc+fem sequence instead of restarting per-naipe.

-- ─── 1. Fix bad scheduled_slot values on 2026-04-12 ─────────────────────────

DO $$
BEGIN
  SET LOCAL app.skip_queue_trigger = 'true';

  -- Beach Soccer MASCULINO (last good slot on the day: 25)
  UPDATE public.matches SET scheduled_slot = 31 WHERE id = 'd84a3a29-03eb-4e04-8f85-868b00964dfc'; -- RAPOSAS vs AAASF
  UPDATE public.matches SET scheduled_slot = 32 WHERE id = '74f82691-3d62-43e0-bdea-36e0b4dfc613'; -- CCT vs RASANTE

  -- Beach Tennis MISTO (last good slot on the day: 25)
  UPDATE public.matches SET scheduled_slot = 31 WHERE id = '11f985d9-190d-40a7-a1fb-57c7c218afa0'; -- ADIN vs ACATO
  UPDATE public.matches SET scheduled_slot = 32 WHERE id = 'e19e81e4-b61c-41da-840e-97b998ea7c5f'; -- UEFA vs ATENUN
  UPDATE public.matches SET scheduled_slot = 33 WHERE id = '1dc6ff11-cf13-4915-9eda-ce105fd05983'; -- CAMALEÃO vs AAAUS
  UPDATE public.matches SET scheduled_slot = 34 WHERE id = 'dcc2a45c-6149-43b6-ad62-a99bdb966f46'; -- AAAMU vs AAASF

  -- Futevôlei FEMININO (last good slot on the day: 27)
  UPDATE public.matches SET scheduled_slot = 31 WHERE id = 'd217d039-6545-41a2-8020-0079586c08e8'; -- AMEN vs GARRUDOS
  UPDATE public.matches SET scheduled_slot = 32 WHERE id = '1018a6bc-6d6a-48b5-b7a9-8ebae4ba72f7'; -- ENGÊNIOS vs TAUROS

  -- Futevôlei MASCULINO (last good slot on the day: 25)
  UPDATE public.matches SET scheduled_slot = 31 WHERE id = '2ede1ac0-f9da-4924-aff4-36c118cf9302'; -- TAUROS vs RAPOSAS
  UPDATE public.matches SET scheduled_slot = 32 WHERE id = '13e32c08-e981-4563-bfed-2aaa64d53df2'; -- GARRUDOS vs UEFA
  UPDATE public.matches SET scheduled_slot = 33 WHERE id = 'e89547a6-d3a7-447a-b5f5-38db058669e9'; -- AAASF vs CAMALEÃO
  UPDATE public.matches SET scheduled_slot = 34 WHERE id = 'f657e911-f91f-490b-b6b8-fb74cb080b30'; -- AMEN vs ENGÊNIOS

  -- Vôlei de Praia MASCULINO (last good slot on the day: 30)
  UPDATE public.matches SET scheduled_slot = 31 WHERE id = '77682f51-02e9-483a-a3dc-cbd54b8ec862'; -- ENGÊNIOS vs GARRUDOS
  UPDATE public.matches SET scheduled_slot = 32 WHERE id = '07e40f26-2c40-40ba-a0e2-618fb618e172'; -- ATENUN vs AMEN

  -- Vôlei de Praia FEMININO (last good slot on the day: 30)
  UPDATE public.matches SET scheduled_slot = 31 WHERE id = '4aee2973-c0d5-4707-a02a-42e9fd1fd8c3'; -- RAPOSAS vs ABUS
  UPDATE public.matches SET scheduled_slot = 32 WHERE id = 'e65f967d-67cf-4912-89a6-c66a794d2413'; -- ATENUN vs GARRUDOS
END;
$$;

-- ─── 2. Renumber queue_position starting from 1 per sport (per day) ──────────
--
-- Beach Soccer: one sequence combining MASCULINO + FEMININO (single court).
-- Other sports: one sequence per naipe per day (independent courts).
-- Order within each partition: scheduled_slot ASC, then match id ASC for ties.

DO $$
BEGIN
  SET LOCAL app.skip_queue_trigger = 'true';

  -- 2a. Clear all existing queue_positions so the unique index won't block
  --     the intermediate state (index only applies to non-NULL values).
  UPDATE public.matches
  SET queue_position = NULL
  WHERE scheduled_date IS NOT NULL AND queue_position IS NOT NULL;

  -- 2b. Assign new sequential positions via ROW_NUMBER.
  UPDATE public.matches m
  SET queue_position = n.pos
  FROM (
    SELECT
      inner_m.id,
      ROW_NUMBER() OVER (
        PARTITION BY
          inner_m.championship_id,
          inner_m.season_year,
          inner_m.sport_id,
          inner_m.scheduled_date,
          -- Beach Soccer: NULL key → all naipes share the same partition
          CASE WHEN s.code = 'BEACH_SOCCER' THEN NULL::text ELSE inner_m.naipe::text END,
          inner_m.division
        ORDER BY inner_m.scheduled_slot ASC NULLS LAST, inner_m.id ASC
      ) AS pos
    FROM public.matches AS inner_m
    JOIN public.sports AS s ON s.id = inner_m.sport_id
    WHERE inner_m.scheduled_date IS NOT NULL
  ) AS n
  WHERE m.id = n.id;
END;
$$;

-- ─── 3. Update assign_match_queue_position trigger ───────────────────────────
--
-- Only change: the queue_position SELECT at the end now checks whether the sport
-- is Beach Soccer and, if so, omits the naipe filter so both MASCULINO and
-- FEMININO matches count towards the same sequence.

CREATE OR REPLACE FUNCTION public.assign_match_queue_position()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_courts_per_sport   JSONB    := '{}'::jsonb;
  v_court_cap          INTEGER;
  v_candidate          INTEGER;
  v_sport_count        INTEGER;
  v_home_naipe_key     TEXT;
  v_away_naipe_key     TEXT;
  v_last_home_same     INTEGER;
  v_last_away_same     INTEGER;
  v_last_home_any      INTEGER;
  v_last_away_any      INTEGER;
  v_shares_naipe_queue BOOLEAN;
BEGIN
  -- Bypass durante geração bulk
  IF current_setting('app.skip_queue_trigger', TRUE) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.status != 'SCHEDULED'::public.match_status OR NEW.scheduled_date IS NULL THEN
    RETURN NEW;
  END IF;

  -- Só reatribui em INSERT ou quando campos-chave mudaram
  IF TG_OP = 'UPDATE' AND NOT (
    NEW.championship_id IS DISTINCT FROM OLD.championship_id OR
    NEW.season_year     IS DISTINCT FROM OLD.season_year     OR
    NEW.scheduled_date  IS DISTINCT FROM OLD.scheduled_date  OR
    NEW.sport_id        IS DISTINCT FROM OLD.sport_id        OR
    NEW.naipe           IS DISTINCT FROM OLD.naipe           OR
    NEW.division        IS DISTINCT FROM OLD.division        OR
    NEW.queue_position  IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  -- Capacidade por esporte no dia
  SELECT COUNT(DISTINCT bc.id)::INTEGER INTO v_court_cap
    FROM championship_bracket_editions e
    JOIN championship_bracket_days     d  ON d.bracket_edition_id  = e.id
    JOIN championship_bracket_locations l  ON l.bracket_day_id     = d.id
    JOIN championship_bracket_courts    bc ON bc.bracket_location_id = l.id
    JOIN championship_bracket_court_sports cs ON cs.bracket_court_id = bc.id
   WHERE e.championship_id = NEW.championship_id
     AND e.season_year     = NEW.season_year
     AND d.event_date      = NEW.scheduled_date
     AND cs.sport_id       = NEW.sport_id;

  IF COALESCE(v_court_cap, 0) = 0 THEN v_court_cap := 1; END IF;

  -- Encontra o próximo scheduled_slot válido
  v_candidate := COALESCE((
    SELECT MAX(scheduled_slot) FROM matches
     WHERE championship_id = NEW.championship_id AND season_year = NEW.season_year
       AND scheduled_date = NEW.scheduled_date
       AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ), 0) + 1;

  LOOP
    -- Gap: mesmo naipe (≥ 2 slots, qualquer esporte)
    v_home_naipe_key := NEW.home_team_id::text || '|' || NEW.naipe::text;
    v_away_naipe_key := NEW.away_team_id::text || '|' || NEW.naipe::text;

    SELECT COALESCE(MAX(m.scheduled_slot), 0) INTO v_last_home_same
      FROM matches m WHERE m.championship_id = NEW.championship_id AND m.season_year = NEW.season_year
        AND m.scheduled_date = NEW.scheduled_date AND m.naipe = NEW.naipe
        AND (m.home_team_id = NEW.home_team_id OR m.away_team_id = NEW.home_team_id)
        AND m.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    SELECT COALESCE(MAX(m.scheduled_slot), 0) INTO v_last_away_same
      FROM matches m WHERE m.championship_id = NEW.championship_id AND m.season_year = NEW.season_year
        AND m.scheduled_date = NEW.scheduled_date AND m.naipe = NEW.naipe
        AND (m.home_team_id = NEW.away_team_id OR m.away_team_id = NEW.away_team_id)
        AND m.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF v_last_home_same > 0 AND v_candidate - v_last_home_same < 2 THEN v_candidate := GREATEST(v_candidate, v_last_home_same + 2); CONTINUE; END IF;
    IF v_last_away_same > 0 AND v_candidate - v_last_away_same < 2 THEN v_candidate := GREATEST(v_candidate, v_last_away_same + 2); CONTINUE; END IF;

    -- Gap: qualquer naipe (≥ 1 slot — não jogar no mesmo slot)
    SELECT COALESCE(MAX(m.scheduled_slot), 0) INTO v_last_home_any
      FROM matches m WHERE m.championship_id = NEW.championship_id AND m.season_year = NEW.season_year
        AND m.scheduled_date = NEW.scheduled_date
        AND (m.home_team_id = NEW.home_team_id OR m.away_team_id = NEW.home_team_id)
        AND m.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    SELECT COALESCE(MAX(m.scheduled_slot), 0) INTO v_last_away_any
      FROM matches m WHERE m.championship_id = NEW.championship_id AND m.season_year = NEW.season_year
        AND m.scheduled_date = NEW.scheduled_date
        AND (m.home_team_id = NEW.away_team_id OR m.away_team_id = NEW.away_team_id)
        AND m.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF v_last_home_any >= v_candidate OR v_last_away_any >= v_candidate THEN
      v_candidate := GREATEST(v_last_home_any, v_last_away_any) + 1; CONTINUE;
    END IF;

    -- Cap: esporte não excede suas quadras neste slot
    SELECT COUNT(*) INTO v_sport_count
      FROM matches m WHERE m.championship_id = NEW.championship_id AND m.season_year = NEW.season_year
        AND m.scheduled_date = NEW.scheduled_date AND m.scheduled_slot = v_candidate
        AND m.sport_id = NEW.sport_id
        AND m.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF v_sport_count >= v_court_cap THEN v_candidate := v_candidate + 1; CONTINUE; END IF;

    EXIT; -- slot válido
  END LOOP;

  NEW.scheduled_slot := v_candidate;

  -- queue_position: próximo número desta modalidade (sem buracos).
  -- Beach Soccer usa 1 quadra para todos os naipes → sequência combinada MASC+FEM.
  -- Demais modalidades mantêm sequências independentes por naipe.
  SELECT (s.code = 'BEACH_SOCCER')
    INTO v_shares_naipe_queue
    FROM public.sports AS s
   WHERE s.id = NEW.sport_id;

  IF v_shares_naipe_queue THEN
    -- Beach Soccer: max considerando TODOS os naipes do esporte no mesmo dia
    SELECT COALESCE(MAX(m.queue_position), 0) + 1
      INTO NEW.queue_position
      FROM public.matches AS m
     WHERE m.championship_id = NEW.championship_id
       AND m.season_year     = NEW.season_year
       AND m.scheduled_date  = NEW.scheduled_date
       AND m.sport_id        = NEW.sport_id
       AND m.division        IS NOT DISTINCT FROM NEW.division
       AND m.id              != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  ELSE
    -- Outros esportes: max por naipe
    SELECT COALESCE(MAX(m.queue_position), 0) + 1
      INTO NEW.queue_position
      FROM public.matches AS m
     WHERE m.championship_id = NEW.championship_id
       AND m.season_year     = NEW.season_year
       AND m.scheduled_date  = NEW.scheduled_date
       AND m.sport_id        = NEW.sport_id
       AND m.naipe           = NEW.naipe
       AND m.division        IS NOT DISTINCT FROM NEW.division
       AND m.id              != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
