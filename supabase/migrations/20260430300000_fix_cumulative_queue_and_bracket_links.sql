-- Fix: queue_position deve ser CUMULATIVO (sem reiniciar por dia).
-- Fix: Beach Soccer FEM quartas tinham scheduled_slot incorretos (9,10) no dia 12/04.
-- Fix: next_bracket_match_id de todos os jogos eliminatórios estava NULL —
--      corrige links QF→SF e SF→Final para todas as modalidades.
-- Fix: trigger assign_match_queue_position agora usa MAX sem filtro de data,
--      garantindo que jogos eliminatórios recebam número APÓS todos os jogos
--      da fase de grupos (inclusive os de dias anteriores).

-- ─── 1. Corrigir scheduled_slot das quartas de BS Feminino no dia 12/04 ────────
--
-- Os jogos foram inseridos quando o max slot do dia 2 era 8 (de outros esportes),
-- então o trigger atribuiu slots 9 e 10 — antes dos jogos de grupos de Beach Soccer
-- que começam no slot 19. Os slots corretos são 35 e 36.

DO $$
BEGIN
  SET LOCAL app.skip_queue_trigger = 'true';

  -- AAASF vs UEFA (FEM QF1) — match_id f5920b43
  UPDATE public.matches SET scheduled_slot = 35
  WHERE id = 'f5920b43-c7ea-4506-9d9d-fb43693ad7d7';

  -- GARRUDOS vs ACEJI (FEM QF2) — match_id 6730eb00
  UPDATE public.matches SET scheduled_slot = 36
  WHERE id = '6730eb00-07a3-4ea7-843b-1a047963ad0a';
END;
$$;

-- ─── 2. Renumerar queue_position de forma CUMULATIVA ────────────────────────────
--
-- Removida a coluna scheduled_date do PARTITION BY, mantida no ORDER BY.
-- Resultado: dia 2 continua a sequência do dia 1 (sem reiniciar em 1).
--
-- Beach Soccer: sequência única MASC+FEMININO (1 quadra).
-- Demais esportes: sequências independentes por naipe.

DO $$
BEGIN
  SET LOCAL app.skip_queue_trigger = 'true';

  -- 2a. Zerar posições existentes para evitar conflito de índice único durante transição
  UPDATE public.matches
  SET queue_position = NULL
  WHERE scheduled_date IS NOT NULL AND queue_position IS NOT NULL;

  -- 2b. Atribuir posições cumulativas via ROW_NUMBER sem filtro de data
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
          -- Beach Soccer: chave NULL → masc+fem na mesma sequência
          CASE WHEN s.code = 'BEACH_SOCCER' THEN NULL::text ELSE inner_m.naipe::text END,
          inner_m.division
        ORDER BY
          inner_m.scheduled_date   ASC NULLS LAST,
          inner_m.scheduled_slot   ASC NULLS LAST,
          inner_m.id               ASC
      ) AS pos
    FROM public.matches AS inner_m
    JOIN public.sports  AS s ON s.id = inner_m.sport_id
    WHERE inner_m.scheduled_date IS NOT NULL
  ) AS n
  WHERE m.id = n.id;
END;
$$;

-- ─── 3. Corrigir next_bracket_match_id (links QF → SF → Final) ──────────────────
--
-- Regra: slot 1 + slot 2 → SF1; slot 3 + slot 4 → SF2.
-- SF1 + SF2 → Final.

-- ---- Beach Soccer FEMININO (competition a4b32913) ----
-- 2 QFs (slots 1 e 2) → 1 Final (único match vazio, round 2 slot 1)

UPDATE public.championship_bracket_matches
SET next_bracket_match_id = 'f8a24b96-5aca-4581-8065-d6a5f9177c8e'
WHERE id IN (
  'd3ea525a-7716-4721-af11-6174a1c6bfcd', -- QF slot 1 (AAASF vs UEFA)
  '9b94c347-28b5-4022-93d8-91532b66f30c'  -- QF slot 2 (GARRUDOS vs ACEJI)
);

-- ---- Beach Soccer MASCULINO (competition f12ee503) ----
-- QF slot 1+2 → SF1; QF slot 3+4 → SF2; SF1+SF2 → Final

UPDATE public.championship_bracket_matches
SET next_bracket_match_id = 'd49c5ea4-c90e-4250-9479-4c5bf011f0c5' -- SF1
WHERE id IN (
  'af3afa60-e31f-4074-bf5a-dc52ce961df3', -- QF slot 1 (RAPOSAS vs AAASF)
  '2fccf10f-0152-475f-abac-2f5b977ed8b1'  -- QF slot 2 (GARRUDOS vs CAMALEÃO)
);

UPDATE public.championship_bracket_matches
SET next_bracket_match_id = '887a86d4-26cf-4745-9b2d-e87cde15ca26' -- SF2
WHERE id IN (
  'a0139e1d-a8c4-43f1-8cb5-64bc3ee4f158', -- QF slot 3 (CCT vs RASANTE)
  '2a8c8c25-cf3b-4be4-b260-09edd7a087f7'  -- QF slot 4 (ATENUN vs ENGÊNIOS)
);

UPDATE public.championship_bracket_matches
SET next_bracket_match_id = '523ea95d-a70a-48ce-baad-483b372133b0' -- Final
WHERE id IN (
  'd49c5ea4-c90e-4250-9479-4c5bf011f0c5', -- SF1
  '887a86d4-26cf-4745-9b2d-e87cde15ca26'  -- SF2
);

-- ---- Beach Tennis MISTO (competition 237a2a47) ----

UPDATE public.championship_bracket_matches
SET next_bracket_match_id = '18ea7c42-fffc-46b5-b866-7e41a7855b32' -- SF1
WHERE id IN (
  '3c2b8990-bcc1-4d8e-9dae-8e577070e1c0', -- QF slot 1 (ADIN vs ACATO)
  'c9b84d58-5437-4232-8776-4a2b1ece4e33'  -- QF slot 2 (UEFA vs ATENUN)
);

UPDATE public.championship_bracket_matches
SET next_bracket_match_id = '35b7d3c5-ccf5-49d4-bb3a-e6735819a665' -- SF2
WHERE id IN (
  '76e1f235-df4b-43b6-a4e7-64991604e9ac', -- QF slot 3 (CAMALEÃO vs AAAUS)
  '75dce5b4-a8c9-4855-ad70-12513038f231'  -- QF slot 4 (AAAMU vs AAASF)
);

UPDATE public.championship_bracket_matches
SET next_bracket_match_id = 'b495d0b1-087c-4f8c-bc8a-4f73bce25b8d' -- Final
WHERE id IN (
  '18ea7c42-fffc-46b5-b866-7e41a7855b32', -- SF1
  '35b7d3c5-ccf5-49d4-bb3a-e6735819a665'  -- SF2
);

-- ---- Futevôlei FEMININO (competition c122cf1a) ----

UPDATE public.championship_bracket_matches
SET next_bracket_match_id = 'f87ca636-ac53-4f09-a83d-6cb1fa960ec0' -- SF1
WHERE id IN (
  '3a4923c7-ad11-4b91-9477-881c2273ff18', -- QF slot 1 (ABUS vs AAASF)
  '57407ab0-c4cc-4fb3-9f12-a6083461469a'  -- QF slot 2 (ADIN vs ACATO)
);

UPDATE public.championship_bracket_matches
SET next_bracket_match_id = '3addcc1c-d71d-4c0f-be2b-17aa5122b889' -- SF2
WHERE id IN (
  '734a9ab8-8417-474d-b7b3-7b4ce2082e77', -- QF slot 3 (AMEN vs GARRUDOS)
  '52caf997-ba5f-4384-af2b-ab23b5879cd6'  -- QF slot 4 (ENGÊNIOS vs TAUROS)
);

UPDATE public.championship_bracket_matches
SET next_bracket_match_id = '4a383d46-e9c3-4a5c-8c0b-80caf3825512' -- Final
WHERE id IN (
  'f87ca636-ac53-4f09-a83d-6cb1fa960ec0', -- SF1
  '3addcc1c-d71d-4c0f-be2b-17aa5122b889'  -- SF2
);

-- ---- Futevôlei MASCULINO (competition 363cfe04) ----

UPDATE public.championship_bracket_matches
SET next_bracket_match_id = '0e91e666-0e87-4a9e-844a-7ca8996344c8' -- SF1
WHERE id IN (
  '4f345cd6-b7fd-4a09-86d5-a4041d8f0317', -- QF slot 1 (TAUROS vs RAPOSAS)
  'ba6d974c-8b94-419a-b03f-e6dcb29db745'  -- QF slot 2 (GARRUDOS vs UEFA)
);

UPDATE public.championship_bracket_matches
SET next_bracket_match_id = 'c3a8cfb2-37c3-4e1d-b4fd-61d59cd21b54' -- SF2
WHERE id IN (
  '3ffaf611-7b66-4423-913c-04c32714c379', -- QF slot 3 (AAASF vs CAMALEÃO)
  'a2626c3f-fb40-4c36-beb4-ccc71b2d4a11'  -- QF slot 4 (AMEN vs ENGÊNIOS)
);

UPDATE public.championship_bracket_matches
SET next_bracket_match_id = 'ff371f99-eb76-4782-8716-83711cb7a432' -- Final
WHERE id IN (
  '0e91e666-0e87-4a9e-844a-7ca8996344c8', -- SF1
  'c3a8cfb2-37c3-4e1d-b4fd-61d59cd21b54'  -- SF2
);

-- ---- Vôlei de Praia FEMININO (competition 41ff49d1) ----

UPDATE public.championship_bracket_matches
SET next_bracket_match_id = 'a5eb7010-386c-40b9-81a1-54ac9495d024' -- SF1
WHERE id IN (
  'b492bc17-1417-4716-a183-f99b9f80a9f5', -- QF slot 1 (CAMALEÃO vs UEFA)
  '18259cbe-df63-4723-9315-dda3bccd1efd'  -- QF slot 2 (AAAUS vs AAASF)
);

UPDATE public.championship_bracket_matches
SET next_bracket_match_id = '0a36787b-7223-4743-a178-aaaab79a6df8' -- SF2
WHERE id IN (
  'bf1111df-d336-47f9-81a3-04d28e439439', -- QF slot 3 (RAPOSAS vs ABUS)
  '1490b156-62ca-4c98-b738-0d1d5a6fbc8b'  -- QF slot 4 (ATENUN vs GARRUDOS)
);

UPDATE public.championship_bracket_matches
SET next_bracket_match_id = 'c6559f39-0299-4761-8882-6b7e936c22fd' -- Final
WHERE id IN (
  'a5eb7010-386c-40b9-81a1-54ac9495d024', -- SF1
  '0a36787b-7223-4743-a178-aaaab79a6df8'  -- SF2
);

-- ---- Vôlei de Praia MASCULINO (competition d146c235) ----

UPDATE public.championship_bracket_matches
SET next_bracket_match_id = '73fae654-a168-47b4-92bb-073209bed3d2' -- SF1
WHERE id IN (
  'b8cb1b54-a7eb-41a7-a2ec-0031038c2223', -- QF slot 1 (CCT vs AAASF)
  '19c77257-bd47-44d3-be11-b5bad0eaa348'  -- QF slot 2 (UEFA vs ABUS)
);

UPDATE public.championship_bracket_matches
SET next_bracket_match_id = 'f612313f-6b3b-477a-97c4-86283bdee7b0' -- SF2
WHERE id IN (
  'a2476cbd-ddcf-446c-93a6-dfea436a9857', -- QF slot 3 (ENGÊNIOS vs GARRUDOS)
  'e0e747dc-1b7c-4b13-b7a3-710a7e6d32e1'  -- QF slot 4 (ATENUN vs AMEN)
);

UPDATE public.championship_bracket_matches
SET next_bracket_match_id = '692e5d19-ad8b-4898-91ba-3926342e6b3c' -- Final
WHERE id IN (
  '73fae654-a168-47b4-92bb-073209bed3d2', -- SF1
  'f612313f-6b3b-477a-97c4-86283bdee7b0'  -- SF2
);

-- ─── 4. Atualizar trigger para MAX cumulativo (sem filtro de data) ───────────────
--
-- Remove AND m.scheduled_date = NEW.scheduled_date das queries de queue_position,
-- fazendo com que novos jogos eliminatórios recebam sempre um número POSTERIOR
-- ao último jogo da fase de grupos (mesmo que sejam de outro dia).

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

  -- Capacidade de quadras por esporte no dia
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

  -- Encontra o próximo scheduled_slot válido (global por dia)
  v_candidate := COALESCE((
    SELECT MAX(scheduled_slot) FROM matches
     WHERE championship_id = NEW.championship_id AND season_year = NEW.season_year
       AND scheduled_date = NEW.scheduled_date
       AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ), 0) + 1;

  LOOP
    -- Gap: mesmo naipe (≥ 2 slots)
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

    -- Gap: qualquer naipe (≥ 1 slot)
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

  -- queue_position: cumulativo SEM filtro de data — garante que jogos eliminatórios
  -- recebam número POSTERIOR ao último jogo de grupo (mesmo que em outro dia).
  --
  -- Beach Soccer (1 quadra): sequência combinada MASC+FEM.
  -- Outros esportes: sequências independentes por naipe.
  SELECT (s.code = 'BEACH_SOCCER')
    INTO v_shares_naipe_queue
    FROM public.sports AS s
   WHERE s.id = NEW.sport_id;

  IF v_shares_naipe_queue THEN
    -- Beach Soccer: MAX de TODOS os naipes e TODOS os dias do mesmo torneio/ano
    SELECT COALESCE(MAX(m.queue_position), 0) + 1
      INTO NEW.queue_position
      FROM public.matches AS m
     WHERE m.championship_id = NEW.championship_id
       AND m.season_year     = NEW.season_year
       AND m.sport_id        = NEW.sport_id
       AND m.division        IS NOT DISTINCT FROM NEW.division
       AND m.id              != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  ELSE
    -- Outros esportes: MAX por naipe, SEM filtro de data
    SELECT COALESCE(MAX(m.queue_position), 0) + 1
      INTO NEW.queue_position
      FROM public.matches AS m
     WHERE m.championship_id = NEW.championship_id
       AND m.season_year     = NEW.season_year
       AND m.sport_id        = NEW.sport_id
       AND m.naipe           = NEW.naipe
       AND m.division        IS NOT DISTINCT FROM NEW.division
       AND m.id              != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
