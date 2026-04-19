-- Ajusta o dia e horário de início de todos os jogos da fase eliminatória (KNOCKOUT)
-- para 2026-04-12 às 17h. Abrange todas as modalidades da temporada 2026.

-- 1. Atualiza scheduled_date dos jogos eliminatórios (quartas, semis, finais)
UPDATE public.matches m
SET scheduled_date = '2026-04-12'
FROM public.championship_bracket_matches cbm
WHERE cbm.match_id = m.id
  AND cbm.phase = 'KNOCKOUT'::public.bracket_phase
  AND m.season_year = 2026;

-- 2. Garante que cada edição de bracket da temporada 2026 com jogos eliminatórios
--    tenha um dia de agenda para 12/04 com início às 17h.
--    Se já existir entrada para essa data, apenas atualiza o start_time.
--    Se não existir, cria com end_time padrão de 23:00.
INSERT INTO public.championship_bracket_days (bracket_edition_id, event_date, start_time, end_time)
SELECT DISTINCT
  cbe.id AS bracket_edition_id,
  '2026-04-12'::date AS event_date,
  '17:00:00'::time AS start_time,
  '23:00:00'::time AS end_time
FROM public.championship_bracket_editions cbe
JOIN public.championship_bracket_matches cbm ON cbm.bracket_edition_id = cbe.id
WHERE cbe.season_year = 2026
  AND cbm.phase = 'KNOCKOUT'::public.bracket_phase
ON CONFLICT (bracket_edition_id, event_date) DO UPDATE
  SET start_time = EXCLUDED.start_time;
