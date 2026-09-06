-- Public championship pages use the Supabase anon role, whose global
-- statement_timeout remains intentionally short. These read-only RPCs perform
-- larger classification/bracket aggregations and can exceed that limit during
-- short result-update bursts, so give only these functions the same 8-second
-- ceiling used by authenticated requests.

ALTER FUNCTION public.get_interlaje_overall_standings(UUID, INTEGER)
  SET statement_timeout = '8s';

ALTER FUNCTION public.get_championship_yellow_card_discipline(UUID, INTEGER)
  SET statement_timeout = '8s';

ALTER FUNCTION public.get_championship_bracket_view(UUID, INTEGER)
  SET statement_timeout = '8s';

ALTER FUNCTION public.get_championship_corrected_group_standings(UUID, INTEGER)
  SET statement_timeout = '8s';
