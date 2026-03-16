ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS current_set_home_score INTEGER NULL;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS current_set_away_score INTEGER NULL;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS resolved_tie_breaker_rule public.championship_sport_tie_breaker_rule NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'matches_resolved_tie_break_winner_team_id_fkey'
      AND conrelid = 'public.matches'::regclass
  ) THEN
    ALTER TABLE public.matches
      ADD COLUMN IF NOT EXISTS resolved_tie_break_winner_team_id UUID NULL,
      ADD CONSTRAINT matches_resolved_tie_break_winner_team_id_fkey
        FOREIGN KEY (resolved_tie_break_winner_team_id)
        REFERENCES public.teams(id)
        ON DELETE SET NULL;
  ELSE
    ALTER TABLE public.matches
      ADD COLUMN IF NOT EXISTS resolved_tie_break_winner_team_id UUID NULL;
  END IF;
END
$$;

COMMENT ON COLUMN public.matches.current_set_home_score IS 'Pontuação atual da equipe mandante no set em andamento.';
COMMENT ON COLUMN public.matches.current_set_away_score IS 'Pontuação atual da equipe visitante no set em andamento.';
COMMENT ON COLUMN public.matches.resolved_tie_breaker_rule IS 'Critério de desempate efetivamente aplicado para definir o vencedor da partida.';
COMMENT ON COLUMN public.matches.resolved_tie_break_winner_team_id IS 'Equipe favorecida pelo critério de desempate aplicado na partida.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'matches_current_set_home_score_non_negative'
      AND conrelid = 'public.matches'::regclass
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_current_set_home_score_non_negative
      CHECK (current_set_home_score IS NULL OR current_set_home_score >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'matches_current_set_away_score_non_negative'
      AND conrelid = 'public.matches'::regclass
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_current_set_away_score_non_negative
      CHECK (current_set_away_score IS NULL OR current_set_away_score >= 0);
  END IF;
END
$$;

UPDATE public.matches AS matches_table
SET
  current_set_home_score = matches_table.home_score,
  current_set_away_score = matches_table.away_score
FROM public.championship_sports AS championship_sports_table
WHERE championship_sports_table.championship_id = matches_table.championship_id
  AND championship_sports_table.sport_id = matches_table.sport_id
  AND championship_sports_table.result_rule = 'SETS'::public.championship_sport_result_rule
  AND matches_table.status = 'LIVE'::public.match_status
  AND matches_table.current_set_home_score IS NULL
  AND matches_table.current_set_away_score IS NULL;

WITH match_set_wins AS (
  SELECT
    matches_table.id AS match_id,
    COALESCE(sum(CASE WHEN match_sets_table.home_points > match_sets_table.away_points THEN 1 ELSE 0 END), 0) AS home_sets,
    COALESCE(sum(CASE WHEN match_sets_table.away_points > match_sets_table.home_points THEN 1 ELSE 0 END), 0) AS away_sets
  FROM public.matches AS matches_table
  JOIN public.championship_sports AS championship_sports_table
    ON championship_sports_table.championship_id = matches_table.championship_id
    AND championship_sports_table.sport_id = matches_table.sport_id
    AND championship_sports_table.result_rule = 'SETS'::public.championship_sport_result_rule
  LEFT JOIN public.match_sets AS match_sets_table
    ON match_sets_table.match_id = matches_table.id
  GROUP BY matches_table.id
)
UPDATE public.matches AS matches_table
SET
  home_score = match_set_wins.home_sets,
  away_score = match_set_wins.away_sets
FROM match_set_wins
WHERE match_set_wins.match_id = matches_table.id;

CREATE OR REPLACE FUNCTION public.validate_match_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.home_team_id = NEW.away_team_id THEN
    RAISE EXCEPTION 'Os times da partida devem ser diferentes.';
  END IF;

  IF NEW.status = 'SCHEDULED'::public.match_status THEN
    IF NEW.scheduled_date IS NULL THEN
      RAISE EXCEPTION 'Informe o dia da fila para partidas agendadas.';
    END IF;

    NEW.start_time := NULL;
    NEW.end_time := NULL;
    NEW.court_name := NULL;
    NEW.current_set_home_score := NULL;
    NEW.current_set_away_score := NULL;
    NEW.resolved_tie_breaker_rule := NULL;
    NEW.resolved_tie_break_winner_team_id := NULL;
  END IF;

  IF NEW.status != 'FINISHED'::public.match_status THEN
    NEW.resolved_tie_breaker_rule := NULL;
    NEW.resolved_tie_break_winner_team_id := NULL;
  ELSIF NEW.resolved_tie_breaker_rule IS NULL THEN
    NEW.resolved_tie_break_winner_team_id := NULL;
  END IF;

  IF NEW.resolved_tie_break_winner_team_id IS NOT NULL
    AND NEW.resolved_tie_break_winner_team_id != NEW.home_team_id
    AND NEW.resolved_tie_break_winner_team_id != NEW.away_team_id THEN
    RAISE EXCEPTION 'O vencedor do desempate deve ser um dos times da partida.';
  END IF;

  IF NEW.current_set_home_score IS NOT NULL AND NEW.current_set_home_score < 0 THEN
    RAISE EXCEPTION 'O placar do set atual do mandante não pode ser negativo.';
  END IF;

  IF NEW.current_set_away_score IS NOT NULL AND NEW.current_set_away_score < 0 THEN
    RAISE EXCEPTION 'O placar do set atual do visitante não pode ser negativo.';
  END IF;

  IF NEW.end_time IS NOT NULL AND NEW.start_time IS NULL THEN
    RAISE EXCEPTION 'A partida não pode ter horário final sem horário inicial.';
  END IF;

  IF NEW.start_time IS NOT NULL
    AND NEW.end_time IS NOT NULL
    AND NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'Horário final da partida deve ser maior que o horário inicial.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_mesa_match_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.home_score < 0
    OR NEW.away_score < 0
    OR NEW.home_yellow_cards < 0
    OR NEW.away_yellow_cards < 0
    OR NEW.home_red_cards < 0
    OR NEW.away_red_cards < 0
    OR (NEW.current_set_home_score IS NOT NULL AND NEW.current_set_home_score < 0)
    OR (NEW.current_set_away_score IS NOT NULL AND NEW.current_set_away_score < 0) THEN
    RAISE EXCEPTION 'Placar e cartões não podem ser negativos.';
  END IF;

  IF public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RETURN NEW;
  END IF;

  IF NOT public.has_admin_tab_access('control'::public.admin_panel_tab, true) THEN
    RETURN NEW;
  END IF;

  IF NEW.championship_id != OLD.championship_id
    OR NEW.sport_id != OLD.sport_id
    OR NEW.home_team_id != OLD.home_team_id
    OR NEW.away_team_id != OLD.away_team_id
    OR NEW.location IS DISTINCT FROM OLD.location
    OR NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
    OR NEW.queue_position IS DISTINCT FROM OLD.queue_position
    OR NEW.division IS DISTINCT FROM OLD.division
    OR NEW.naipe IS DISTINCT FROM OLD.naipe
    OR NEW.supports_cards IS DISTINCT FROM OLD.supports_cards
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.resolved_tie_breaker_rule IS DISTINCT FROM OLD.resolved_tie_breaker_rule
    OR NEW.resolved_tie_break_winner_team_id IS DISTINCT FROM OLD.resolved_tie_break_winner_team_id THEN
    RAISE EXCEPTION 'Perfil com acesso ao Controle ao Vivo pode alterar apenas placar, cartões, status, quadra real e horários reais da partida.';
  END IF;

  IF OLD.status = 'FINISHED'::public.match_status
    AND NEW.status != 'FINISHED'::public.match_status THEN
    RAISE EXCEPTION 'Partida encerrada não pode voltar para outro status.';
  END IF;

  IF OLD.status = 'SCHEDULED'::public.match_status
    AND NEW.status = 'FINISHED'::public.match_status THEN
    RAISE EXCEPTION 'A partida precisa iniciar antes de ser encerrada.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_championship_bracket_tie_break_resolution(
  _payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  competition_record RECORD;
  context_record RECORD;
  team_id_record JSONB;
  team_id_value UUID;
  ordered_team_ids UUID[] := ARRAY[]::UUID[];
  sorted_signature TEXT;
  resolution_id_value UUID;
  team_position INTEGER := 0;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para salvar sorteio manual.';
  END IF;

  IF jsonb_typeof(COALESCE(_payload->'team_ids', '[]'::jsonb)) != 'array'
    OR jsonb_array_length(COALESCE(_payload->'team_ids', '[]'::jsonb)) < 2 THEN
    RAISE EXCEPTION 'Informe ao menos duas atléticas para o sorteio manual.';
  END IF;

  SELECT
    competitions_table.id,
    competitions_table.bracket_edition_id,
    editions_table.championship_id
  INTO competition_record
  FROM public.championship_bracket_competitions AS competitions_table
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = competitions_table.bracket_edition_id
  WHERE competitions_table.id = (_payload->>'competition_id')::uuid
  LIMIT 1;

  IF competition_record.id IS NULL THEN
    RAISE EXCEPTION 'Competição de chaveamento não encontrada para salvar o sorteio.';
  END IF;

  FOR team_id_record IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(_payload->'team_ids', '[]'::jsonb))
  LOOP
    ordered_team_ids := array_append(ordered_team_ids, trim(both '"' from team_id_record::text)::uuid);
  END LOOP;

  SELECT string_agg(ordered_team_id_value::text, '|' ORDER BY ordered_team_id_value::text)
  INTO sorted_signature
  FROM unnest(ordered_team_ids) AS ordered_team_id_value;

  SELECT contexts_table.*
  INTO context_record
  FROM public.get_championship_bracket_tie_break_contexts(
    competition_record.championship_id,
    competition_record.id,
    competition_record.bracket_edition_id
  ) AS contexts_table
  WHERE contexts_table.context_key = trim(COALESCE(_payload->>'context_key', ''))
  LIMIT 1;

  IF context_record.context_key IS NULL THEN
    RAISE EXCEPTION 'Contexto de sorteio não encontrado ou não está mais pendente.';
  END IF;

  IF context_record.tied_team_signature <> sorted_signature THEN
    RAISE EXCEPTION 'As atléticas informadas não correspondem ao empate atual deste sorteio.';
  END IF;

  INSERT INTO public.championship_bracket_tie_break_resolutions (
    bracket_edition_id,
    competition_id,
    group_id,
    context_type,
    qualification_rank,
    context_key,
    tied_team_signature,
    created_by
  ) VALUES (
    competition_record.bracket_edition_id,
    competition_record.id,
    context_record.group_id,
    context_record.context_type,
    context_record.qualification_rank,
    context_record.context_key,
    context_record.tied_team_signature,
    auth.uid()
  )
  ON CONFLICT (context_key)
  DO UPDATE SET
    tied_team_signature = EXCLUDED.tied_team_signature,
    group_id = EXCLUDED.group_id,
    qualification_rank = EXCLUDED.qualification_rank,
    updated_at = now()
  RETURNING id INTO resolution_id_value;

  DELETE FROM public.championship_bracket_tie_break_resolution_teams AS resolution_teams_table
  WHERE resolution_teams_table.resolution_id = resolution_id_value;

  FOREACH team_id_value IN ARRAY ordered_team_ids
  LOOP
    team_position := team_position + 1;

    INSERT INTO public.championship_bracket_tie_break_resolution_teams (
      resolution_id,
      team_id,
      draw_order
    ) VALUES (
      resolution_id_value,
      team_id_value,
      team_position
    );
  END LOOP;

  RETURN resolution_id_value;
END;
$$;

NOTIFY pgrst, 'reload schema';
