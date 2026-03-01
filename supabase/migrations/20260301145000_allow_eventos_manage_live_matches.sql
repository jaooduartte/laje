DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'matches'
  ) THEN
    RAISE EXCEPTION 'Tabela public.matches não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'is_mesa'
      AND pg_function_is_visible(oid)
  ) THEN
    RAISE EXCEPTION 'Função public.is_mesa não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'is_eventos'
      AND pg_function_is_visible(oid)
  ) THEN
    RAISE EXCEPTION 'Função public.is_eventos não encontrada.';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'matches'
      AND policyname = 'Mesa pode atualizar placar e status'
  ) THEN
    ALTER POLICY "Mesa pode atualizar placar e status"
      ON public.matches
      USING (public.is_mesa() OR public.is_eventos())
      WITH CHECK (public.is_mesa() OR public.is_eventos());
  ELSE
    CREATE POLICY "Mesa pode atualizar placar e status"
      ON public.matches
      FOR UPDATE
      TO authenticated
      USING (public.is_mesa() OR public.is_eventos())
      WITH CHECK (public.is_mesa() OR public.is_eventos());
  END IF;
END
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
    OR NEW.away_red_cards < 0 THEN
    RAISE EXCEPTION 'Placar e cartões não podem ser negativos.';
  END IF;

  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NOT (public.is_mesa() OR public.is_eventos()) THEN
    RETURN NEW;
  END IF;

  IF NEW.championship_id != OLD.championship_id
    OR NEW.sport_id != OLD.sport_id
    OR NEW.home_team_id != OLD.home_team_id
    OR NEW.away_team_id != OLD.away_team_id
    OR NEW.location IS DISTINCT FROM OLD.location
    OR NEW.start_time IS DISTINCT FROM OLD.start_time
    OR NEW.end_time IS DISTINCT FROM OLD.end_time
    OR NEW.division IS DISTINCT FROM OLD.division
    OR NEW.naipe IS DISTINCT FROM OLD.naipe
    OR NEW.supports_cards IS DISTINCT FROM OLD.supports_cards
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Perfil mesa/eventos pode alterar apenas placar, cartões e status da partida.';
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

NOTIFY pgrst, 'reload schema';
