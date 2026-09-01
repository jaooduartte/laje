INSERT INTO public.championship_season_settings (
  championship_id,
  season_year,
  yellow_card_reset_phase
)
SELECT
  championships_table.id,
  2026,
  'SEMIFINAL'
FROM public.championships AS championships_table
WHERE championships_table.code = 'INTERLAJE'::public.championship_code
ON CONFLICT (championship_id, season_year)
DO UPDATE SET
  yellow_card_reset_phase = EXCLUDED.yellow_card_reset_phase,
  updated_at = timezone('utc', now());
