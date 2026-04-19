-- migration: 20260427150000_add_group_stage_match_id_not_null_constraint.sql
--
-- Adiciona constraint CHECK para garantir que linhas GROUP_STAGE nunca tenham
-- match_id = NULL. Linhas órfãs dessa natureza causavam is_group_finished = false
-- mesmo com todos os jogos reais encerrados (bug corrigido em 20260427140000).
--
-- A constraint bloqueia qualquer INSERT ou UPDATE que tente criar um slot
-- GROUP_STAGE sem match associado, impedindo que o bug seja reproduzido.

ALTER TABLE public.championship_bracket_matches
  ADD CONSTRAINT chk_group_stage_requires_match_id
  CHECK (
    phase != 'GROUP_STAGE'::public.bracket_phase
    OR match_id IS NOT NULL
  );

COMMENT ON CONSTRAINT chk_group_stage_requires_match_id ON public.championship_bracket_matches IS
  'Garante que toda linha GROUP_STAGE tenha um match_id associado. '
  'Linhas GROUP_STAGE com match_id NULL são orphans que distorcem o cálculo '
  'de is_group_finished e bloqueiam a geração do mata-mata.';
