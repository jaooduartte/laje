DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'bracket_phase'
  ) THEN
    CREATE TYPE public.bracket_phase AS ENUM ('GROUP_STAGE', 'KNOCKOUT');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'bracket_edition_status'
  ) THEN
    CREATE TYPE public.bracket_edition_status AS ENUM ('DRAFT', 'GROUPS_GENERATED', 'KNOCKOUT_GENERATED');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'bracket_third_place_mode'
  ) THEN
    CREATE TYPE public.bracket_third_place_mode AS ENUM ('NONE', 'MATCH', 'CHAMPION_SEMIFINAL_LOSER');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'championship_sport_result_rule'
  ) THEN
    CREATE TYPE public.championship_sport_result_rule AS ENUM ('POINTS', 'SETS');
  END IF;
END
$$;

ALTER TABLE public.championship_sports
  ADD COLUMN IF NOT EXISTS result_rule public.championship_sport_result_rule;

ALTER TABLE public.championship_sports
  ALTER COLUMN result_rule SET DEFAULT 'POINTS'::public.championship_sport_result_rule;

UPDATE public.championship_sports
SET result_rule = CASE
  WHEN lower(public.normalize_sport_name(sports_table.name)) IN ('beach tennis', 'volei de praia', 'futevolei')
    THEN 'SETS'::public.championship_sport_result_rule
  ELSE 'POINTS'::public.championship_sport_result_rule
END
FROM public.sports AS sports_table
WHERE sports_table.id = public.championship_sports.sport_id
  AND public.championship_sports.result_rule IS NULL;

ALTER TABLE public.championship_sports
  ALTER COLUMN result_rule SET NOT NULL;

ALTER TABLE public.championship_sports
  ADD COLUMN IF NOT EXISTS default_match_duration_minutes INTEGER;

ALTER TABLE public.championship_sports
  ALTER COLUMN default_match_duration_minutes SET DEFAULT 35;

UPDATE public.championship_sports
SET default_match_duration_minutes = CASE
  WHEN lower(public.normalize_sport_name(sports_table.name)) = 'beach soccer' THEN 30
  WHEN lower(public.normalize_sport_name(sports_table.name)) = 'beach tennis' THEN 35
  WHEN lower(public.normalize_sport_name(sports_table.name)) = 'volei de praia' THEN 45
  WHEN lower(public.normalize_sport_name(sports_table.name)) = 'futevolei' THEN 40
  ELSE 35
END
FROM public.sports AS sports_table
WHERE sports_table.id = public.championship_sports.sport_id
  AND public.championship_sports.default_match_duration_minutes IS NULL;

ALTER TABLE public.championship_sports
  ALTER COLUMN default_match_duration_minutes SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'championship_sports_default_match_duration_positive'
      AND conrelid = 'public.championship_sports'::regclass
  ) THEN
    ALTER TABLE public.championship_sports
      ADD CONSTRAINT championship_sports_default_match_duration_positive
      CHECK (default_match_duration_minutes > 0);
  END IF;
END
$$;

COMMENT ON COLUMN public.championship_sports.result_rule IS 'Regra oficial para definir vencedor na modalidade: por pontos gerais ou por sets.';
COMMENT ON COLUMN public.championship_sports.default_match_duration_minutes IS 'Duração padrão da partida em minutos para agenda automática.';

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS court_name TEXT;

COMMENT ON COLUMN public.matches.court_name IS 'Nome da quadra/local secundário para permitir múltiplas quadras no mesmo local.';

CREATE TABLE IF NOT EXISTS public.championship_bracket_editions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  status public.bracket_edition_status NOT NULL DEFAULT 'DRAFT'::public.bracket_edition_status,
  payload_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS championship_bracket_editions_championship_id_idx
  ON public.championship_bracket_editions (championship_id);

CREATE TABLE IF NOT EXISTS public.championship_bracket_team_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bracket_edition_id UUID NOT NULL REFERENCES public.championship_bracket_editions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bracket_edition_id, team_id)
);

CREATE TABLE IF NOT EXISTS public.championship_bracket_team_modalities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bracket_edition_id UUID NOT NULL REFERENCES public.championship_bracket_editions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  sport_id UUID NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  naipe public.match_naipe NOT NULL,
  division public.team_division NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bracket_edition_id, team_id, sport_id, naipe, division)
);

CREATE INDEX IF NOT EXISTS championship_bracket_team_modalities_competition_idx
  ON public.championship_bracket_team_modalities (bracket_edition_id, sport_id, naipe, division);

CREATE TABLE IF NOT EXISTS public.championship_bracket_competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bracket_edition_id UUID NOT NULL REFERENCES public.championship_bracket_editions(id) ON DELETE CASCADE,
  sport_id UUID NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  naipe public.match_naipe NOT NULL,
  division public.team_division NULL,
  groups_count INTEGER NOT NULL,
  qualifiers_per_group INTEGER NOT NULL,
  third_place_mode public.bracket_third_place_mode NOT NULL DEFAULT 'NONE'::public.bracket_third_place_mode,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bracket_edition_id, sport_id, naipe, division)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'championship_bracket_competitions_groups_count_positive'
      AND conrelid = 'public.championship_bracket_competitions'::regclass
  ) THEN
    ALTER TABLE public.championship_bracket_competitions
      ADD CONSTRAINT championship_bracket_competitions_groups_count_positive
      CHECK (groups_count > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'championship_bracket_competitions_qualifiers_positive'
      AND conrelid = 'public.championship_bracket_competitions'::regclass
  ) THEN
    ALTER TABLE public.championship_bracket_competitions
      ADD CONSTRAINT championship_bracket_competitions_qualifiers_positive
      CHECK (qualifiers_per_group > 0);
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.championship_bracket_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.championship_bracket_competitions(id) ON DELETE CASCADE,
  group_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (competition_id, group_number)
);

CREATE TABLE IF NOT EXISTS public.championship_bracket_group_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.championship_bracket_groups(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, team_id),
  UNIQUE (group_id, position)
);

CREATE TABLE IF NOT EXISTS public.championship_bracket_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bracket_edition_id UUID NOT NULL REFERENCES public.championship_bracket_editions(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bracket_edition_id, event_date)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'championship_bracket_days_time_order'
      AND conrelid = 'public.championship_bracket_days'::regclass
  ) THEN
    ALTER TABLE public.championship_bracket_days
      ADD CONSTRAINT championship_bracket_days_time_order
      CHECK (end_time > start_time);
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.championship_bracket_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bracket_day_id UUID NOT NULL REFERENCES public.championship_bracket_days(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bracket_day_id, name)
);

CREATE TABLE IF NOT EXISTS public.championship_bracket_courts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bracket_location_id UUID NOT NULL REFERENCES public.championship_bracket_locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bracket_location_id, name)
);

CREATE TABLE IF NOT EXISTS public.championship_bracket_court_sports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bracket_court_id UUID NOT NULL REFERENCES public.championship_bracket_courts(id) ON DELETE CASCADE,
  sport_id UUID NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bracket_court_id, sport_id)
);

CREATE TABLE IF NOT EXISTS public.championship_bracket_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bracket_edition_id UUID NOT NULL REFERENCES public.championship_bracket_editions(id) ON DELETE CASCADE,
  competition_id UUID NOT NULL REFERENCES public.championship_bracket_competitions(id) ON DELETE CASCADE,
  group_id UUID NULL REFERENCES public.championship_bracket_groups(id) ON DELETE SET NULL,
  phase public.bracket_phase NOT NULL,
  round_number INTEGER NOT NULL DEFAULT 1,
  slot_number INTEGER NOT NULL DEFAULT 1,
  match_id UUID NULL REFERENCES public.matches(id) ON DELETE SET NULL,
  home_team_id UUID NULL REFERENCES public.teams(id) ON DELETE SET NULL,
  away_team_id UUID NULL REFERENCES public.teams(id) ON DELETE SET NULL,
  winner_team_id UUID NULL REFERENCES public.teams(id) ON DELETE SET NULL,
  source_home_bracket_match_id UUID NULL REFERENCES public.championship_bracket_matches(id) ON DELETE SET NULL,
  source_away_bracket_match_id UUID NULL REFERENCES public.championship_bracket_matches(id) ON DELETE SET NULL,
  next_bracket_match_id UUID NULL REFERENCES public.championship_bracket_matches(id) ON DELETE SET NULL,
  is_bye BOOLEAN NOT NULL DEFAULT false,
  is_third_place BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (competition_id, phase, round_number, slot_number),
  UNIQUE (match_id)
);

CREATE INDEX IF NOT EXISTS championship_bracket_matches_edition_phase_idx
  ON public.championship_bracket_matches (bracket_edition_id, phase);

CREATE TABLE IF NOT EXISTS public.match_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  set_number INTEGER NOT NULL,
  home_points INTEGER NOT NULL DEFAULT 0,
  away_points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, set_number)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'match_sets_home_points_non_negative'
      AND conrelid = 'public.match_sets'::regclass
  ) THEN
    ALTER TABLE public.match_sets
      ADD CONSTRAINT match_sets_home_points_non_negative
      CHECK (home_points >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'match_sets_away_points_non_negative'
      AND conrelid = 'public.match_sets'::regclass
  ) THEN
    ALTER TABLE public.match_sets
      ADD CONSTRAINT match_sets_away_points_non_negative
      CHECK (away_points >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'match_sets_set_number_positive'
      AND conrelid = 'public.match_sets'::regclass
  ) THEN
    ALTER TABLE public.match_sets
      ADD CONSTRAINT match_sets_set_number_positive
      CHECK (set_number > 0);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.set_match_sets_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_match_sets_updated_at_trigger ON public.match_sets;

CREATE TRIGGER set_match_sets_updated_at_trigger
BEFORE UPDATE ON public.match_sets
FOR EACH ROW
EXECUTE FUNCTION public.set_match_sets_updated_at();

DO $$
DECLARE
  table_name TEXT;
  tables_to_secure TEXT[] := ARRAY[
    'championship_bracket_editions',
    'championship_bracket_team_registrations',
    'championship_bracket_team_modalities',
    'championship_bracket_competitions',
    'championship_bracket_groups',
    'championship_bracket_group_teams',
    'championship_bracket_days',
    'championship_bracket_locations',
    'championship_bracket_courts',
    'championship_bracket_court_sports',
    'championship_bracket_matches',
    'match_sets'
  ];
BEGIN
  FOREACH table_name IN ARRAY tables_to_secure
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = format('Public can view %s', table_name)
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT USING (true)',
        format('Public can view %s', table_name),
        table_name
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = format('Admin can insert %s', table_name)
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_admin_tab_access(''matches''::public.admin_panel_tab, true))',
        format('Admin can insert %s', table_name),
        table_name
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = format('Admin can update %s', table_name)
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.has_admin_tab_access(''matches''::public.admin_panel_tab, true)) WITH CHECK (public.has_admin_tab_access(''matches''::public.admin_panel_tab, true))',
        format('Admin can update %s', table_name),
        table_name
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = format('Admin can delete %s', table_name)
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.has_admin_tab_access(''matches''::public.admin_panel_tab, true))',
        format('Admin can delete %s', table_name),
        table_name
      );
    END IF;
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.resolve_championship_sport_duration_minutes(
  _championship_id UUID,
  _sport_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  resolved_duration INTEGER;
BEGIN
  SELECT championship_sports_table.default_match_duration_minutes
  INTO resolved_duration
  FROM public.championship_sports AS championship_sports_table
  WHERE championship_sports_table.championship_id = _championship_id
    AND championship_sports_table.sport_id = _sport_id
  LIMIT 1;

  RETURN GREATEST(1, COALESCE(resolved_duration, 35));
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_championship_sport_result_rule(
  _championship_id UUID,
  _sport_id UUID
)
RETURNS public.championship_sport_result_rule
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  resolved_result_rule public.championship_sport_result_rule;
BEGIN
  SELECT championship_sports_table.result_rule
  INTO resolved_result_rule
  FROM public.championship_sports AS championship_sports_table
  WHERE championship_sports_table.championship_id = _championship_id
    AND championship_sports_table.sport_id = _sport_id
  LIMIT 1;

  RETURN COALESCE(resolved_result_rule, 'POINTS'::public.championship_sport_result_rule);
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_match_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  championship_uses_divisions BOOLEAN;
  championship_sport_naipe_mode public.championship_sport_naipe_mode;
  championship_sport_supports_cards BOOLEAN;
  home_team_division public.team_division;
  away_team_division public.team_division;
BEGIN
  IF NEW.home_team_id = NEW.away_team_id THEN
    RAISE EXCEPTION 'Confronto inválido: os times devem ser diferentes.';
  END IF;

  IF NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'Confronto inválido: horário final deve ser maior que o inicial.';
  END IF;

  IF NEW.championship_id IS NULL THEN
    SELECT championships_table.id
    INTO NEW.championship_id
    FROM public.championships AS championships_table
    WHERE championships_table.code = 'CLV'
    LIMIT 1;
  END IF;

  IF NEW.naipe IS NULL THEN
    NEW.naipe := 'MASCULINO'::public.match_naipe;
  END IF;

  SELECT championships_table.uses_divisions
  INTO championship_uses_divisions
  FROM public.championships AS championships_table
  WHERE championships_table.id = NEW.championship_id;

  IF championship_uses_divisions IS NULL THEN
    RAISE EXCEPTION 'Campeonato inválido para a partida.';
  END IF;

  SELECT
    championship_sports_table.naipe_mode,
    championship_sports_table.supports_cards
  INTO
    championship_sport_naipe_mode,
    championship_sport_supports_cards
  FROM public.championship_sports AS championship_sports_table
  WHERE championship_sports_table.championship_id = NEW.championship_id
    AND championship_sports_table.sport_id = NEW.sport_id
  LIMIT 1;

  IF championship_sport_naipe_mode IS NULL THEN
    RAISE EXCEPTION 'Modalidade não vinculada ao campeonato selecionado.';
  END IF;

  IF championship_sport_naipe_mode = 'MISTO'::public.championship_sport_naipe_mode
    AND NEW.naipe != 'MISTO'::public.match_naipe THEN
    RAISE EXCEPTION 'Esta modalidade é mista e deve usar naipe Misto.';
  END IF;

  IF championship_sport_naipe_mode = 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode
    AND NEW.naipe = 'MISTO'::public.match_naipe THEN
    RAISE EXCEPTION 'Esta modalidade aceita apenas naipes Masculino ou Feminino.';
  END IF;

  NEW.supports_cards := COALESCE(championship_sport_supports_cards, false);

  IF NEW.supports_cards THEN
    NEW.home_yellow_cards := GREATEST(0, COALESCE(NEW.home_yellow_cards, 0));
    NEW.home_red_cards := GREATEST(0, COALESCE(NEW.home_red_cards, 0));
    NEW.away_yellow_cards := GREATEST(0, COALESCE(NEW.away_yellow_cards, 0));
    NEW.away_red_cards := GREATEST(0, COALESCE(NEW.away_red_cards, 0));
  ELSE
    NEW.home_yellow_cards := 0;
    NEW.home_red_cards := 0;
    NEW.away_yellow_cards := 0;
    NEW.away_red_cards := 0;
  END IF;

  SELECT teams_table.division
  INTO home_team_division
  FROM public.teams AS teams_table
  WHERE teams_table.id = NEW.home_team_id;

  SELECT teams_table.division
  INTO away_team_division
  FROM public.teams AS teams_table
  WHERE teams_table.id = NEW.away_team_id;

  IF home_team_division IS NULL OR away_team_division IS NULL THEN
    RAISE EXCEPTION 'Os times precisam ter divisão cadastrada para criar partidas.';
  END IF;

  IF championship_uses_divisions THEN
    IF home_team_division != away_team_division THEN
      RAISE EXCEPTION 'Confronto inválido: em campeonatos com divisão, os times devem ser da mesma série.';
    END IF;

    NEW.division := home_team_division;
  ELSE
    NEW.division := NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.matches AS matches_table
    WHERE matches_table.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND matches_table.location = NEW.location
      AND COALESCE(matches_table.court_name, '') = COALESCE(NEW.court_name, '')
      AND matches_table.start_time < NEW.end_time
      AND matches_table.end_time > NEW.start_time
  ) THEN
    RAISE EXCEPTION 'Conflito de horário: já existe um jogo nesta quadra/local no período informado.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.matches AS matches_table
    WHERE matches_table.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND matches_table.championship_id = NEW.championship_id
      AND (
        matches_table.home_team_id IN (NEW.home_team_id, NEW.away_team_id)
        OR matches_table.away_team_id IN (NEW.home_team_id, NEW.away_team_id)
      )
      AND matches_table.start_time < NEW.end_time
      AND matches_table.end_time > NEW.start_time
  ) THEN
    RAISE EXCEPTION 'Conflito de horário: a mesma atlética não pode jogar em dois jogos no mesmo horário.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_championship_bracket_groups(
  _championship_id UUID,
  _payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bracket_edition_id UUID;
  participant_record JSONB;
  modality_record JSONB;
  competition_record JSONB;
  group_record JSONB;
  schedule_day_record JSONB;
  location_record JSONB;
  court_record JSONB;
  court_sport_record JSONB;
  competition_id UUID;
  group_id UUID;
  bracket_day_id UUID;
  bracket_location_id UUID;
  bracket_court_id UUID;
  team_id UUID;
  sport_id UUID;
  naipe_value public.match_naipe;
  division_value public.team_division;
  groups_count_value INTEGER;
  qualifiers_per_group_value INTEGER;
  third_place_mode_value public.bracket_third_place_mode;
  normalized_location_name TEXT;
  normalized_court_name TEXT;
  new_match_id UUID;
  group_team_ids UUID[];
  group_team_count INTEGER;
  min_group_size INTEGER;
  max_group_size INTEGER;
  current_group_size INTEGER;
  duration_minutes INTEGER;
  selected_slot_start TIMESTAMPTZ;
  selected_slot_end TIMESTAMPTZ;
  selected_slot_location_name TEXT;
  selected_slot_court_name TEXT;
  competition_match_slot INTEGER;
  existing_matches_count INTEGER;
  championship_uses_divisions BOOLEAN;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para gerar chaveamento.';
  END IF;

  SELECT championships_table.uses_divisions
  INTO championship_uses_divisions
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id
    AND championships_table.status = 'PLANNING'::public.championship_status
  LIMIT 1;

  IF championship_uses_divisions IS NULL THEN
    RAISE EXCEPTION 'Campeonato inválido ou fora do status Em breve.';
  END IF;

  SELECT count(*)
  INTO existing_matches_count
  FROM public.matches AS matches_table
  WHERE matches_table.championship_id = _championship_id;

  IF existing_matches_count > 0 THEN
    RAISE EXCEPTION 'Este campeonato já possui jogos cadastrados. A geração automática exige campeonato sem jogos.';
  END IF;

  IF jsonb_typeof(COALESCE(_payload->'participants', '[]'::jsonb)) != 'array'
    OR jsonb_array_length(COALESCE(_payload->'participants', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Nenhuma atlética participante informada.';
  END IF;

  IF jsonb_typeof(COALESCE(_payload->'competitions', '[]'::jsonb)) != 'array'
    OR jsonb_array_length(COALESCE(_payload->'competitions', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Nenhuma configuração de competição informada.';
  END IF;

  IF jsonb_typeof(COALESCE(_payload->'schedule_days', '[]'::jsonb)) != 'array'
    OR jsonb_array_length(COALESCE(_payload->'schedule_days', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Nenhuma janela de agenda informada.';
  END IF;

  INSERT INTO public.championship_bracket_editions (
    championship_id,
    status,
    payload_snapshot,
    created_by
  ) VALUES (
    _championship_id,
    'DRAFT'::public.bracket_edition_status,
    COALESCE(_payload, '{}'::jsonb),
    auth.uid()
  )
  RETURNING id INTO bracket_edition_id;

  FOR participant_record IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(_payload->'participants', '[]'::jsonb))
  LOOP
    team_id := (participant_record->>'team_id')::uuid;

    INSERT INTO public.championship_bracket_team_registrations (
      bracket_edition_id,
      team_id
    ) VALUES (
      bracket_edition_id,
      team_id
    )
    ON CONFLICT (bracket_edition_id, team_id)
    DO NOTHING;

    FOR modality_record IN
      SELECT value
      FROM jsonb_array_elements(COALESCE(participant_record->'modalities', '[]'::jsonb))
    LOOP
      sport_id := (modality_record->>'sport_id')::uuid;
      naipe_value := (modality_record->>'naipe')::public.match_naipe;
      division_value := CASE
        WHEN trim(COALESCE(modality_record->>'division', '')) = '' THEN NULL
        ELSE (modality_record->>'division')::public.team_division
      END;

      IF championship_uses_divisions AND division_value IS NULL THEN
        RAISE EXCEPTION 'Divisão é obrigatória para campeonatos que usam divisões.';
      END IF;

      IF NOT championship_uses_divisions THEN
        division_value := NULL;
      END IF;

      INSERT INTO public.championship_bracket_team_modalities (
        bracket_edition_id,
        team_id,
        sport_id,
        naipe,
        division
      ) VALUES (
        bracket_edition_id,
        team_id,
        sport_id,
        naipe_value,
        division_value
      )
      ON CONFLICT (bracket_edition_id, team_id, sport_id, naipe, division)
      DO NOTHING;
    END LOOP;
  END LOOP;

  FOR competition_record IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(_payload->'competitions', '[]'::jsonb))
  LOOP
    sport_id := (competition_record->>'sport_id')::uuid;
    naipe_value := (competition_record->>'naipe')::public.match_naipe;
    division_value := CASE
      WHEN trim(COALESCE(competition_record->>'division', '')) = '' THEN NULL
      ELSE (competition_record->>'division')::public.team_division
    END;
    groups_count_value := GREATEST(1, COALESCE((competition_record->>'groups_count')::integer, 1));
    qualifiers_per_group_value := GREATEST(1, COALESCE((competition_record->>'qualifiers_per_group')::integer, 1));
    third_place_mode_value := COALESCE((competition_record->>'third_place_mode')::public.bracket_third_place_mode, 'NONE'::public.bracket_third_place_mode);

    IF championship_uses_divisions AND division_value IS NULL THEN
      RAISE EXCEPTION 'Divisão é obrigatória para configuração da competição.';
    END IF;

    IF NOT championship_uses_divisions THEN
      division_value := NULL;
    END IF;

    INSERT INTO public.championship_bracket_competitions (
      bracket_edition_id,
      sport_id,
      naipe,
      division,
      groups_count,
      qualifiers_per_group,
      third_place_mode
    ) VALUES (
      bracket_edition_id,
      sport_id,
      naipe_value,
      division_value,
      groups_count_value,
      qualifiers_per_group_value,
      third_place_mode_value
    )
    ON CONFLICT (bracket_edition_id, sport_id, naipe, division)
    DO UPDATE SET
      groups_count = EXCLUDED.groups_count,
      qualifiers_per_group = EXCLUDED.qualifiers_per_group,
      third_place_mode = EXCLUDED.third_place_mode
    RETURNING id INTO competition_id;

    min_group_size := 2147483647;
    max_group_size := 0;

    FOR group_record IN
      SELECT value
      FROM jsonb_array_elements(COALESCE(competition_record->'groups', '[]'::jsonb))
    LOOP
      INSERT INTO public.championship_bracket_groups (
        competition_id,
        group_number
      ) VALUES (
        competition_id,
        GREATEST(1, COALESCE((group_record->>'group_number')::integer, 1))
      )
      ON CONFLICT (competition_id, group_number)
      DO UPDATE SET group_number = EXCLUDED.group_number
      RETURNING id INTO group_id;

      current_group_size := 0;

      FOR modality_record IN
        SELECT value
        FROM jsonb_array_elements(COALESCE(group_record->'team_ids', '[]'::jsonb))
      LOOP
        team_id := trim(both '\"' from modality_record::text)::uuid;

        INSERT INTO public.championship_bracket_group_teams (
          group_id,
          team_id,
          position
        ) VALUES (
          group_id,
          team_id,
          current_group_size + 1
        )
        ON CONFLICT (group_id, team_id)
        DO UPDATE SET position = EXCLUDED.position;

        current_group_size := current_group_size + 1;
      END LOOP;

      IF current_group_size < 2 THEN
        RAISE EXCEPTION 'Cada chave precisa ter no mínimo 2 atléticas.';
      END IF;

      min_group_size := LEAST(min_group_size, current_group_size);
      max_group_size := GREATEST(max_group_size, current_group_size);
    END LOOP;

    IF min_group_size = 2147483647 THEN
      RAISE EXCEPTION 'Nenhuma chave configurada para a competição.';
    END IF;

    IF max_group_size - min_group_size > 1 THEN
      RAISE EXCEPTION 'Distribuição inválida: diferença entre chaves não pode ser maior que 1.';
    END IF;
  END LOOP;

  FOR schedule_day_record IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(_payload->'schedule_days', '[]'::jsonb))
  LOOP
    INSERT INTO public.championship_bracket_days (
      bracket_edition_id,
      event_date,
      start_time,
      end_time
    ) VALUES (
      bracket_edition_id,
      (schedule_day_record->>'date')::date,
      (schedule_day_record->>'start_time')::time,
      (schedule_day_record->>'end_time')::time
    )
    ON CONFLICT (bracket_edition_id, event_date)
    DO UPDATE SET
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time
    RETURNING id INTO bracket_day_id;

    FOR location_record IN
      SELECT value
      FROM jsonb_array_elements(COALESCE(schedule_day_record->'locations', '[]'::jsonb))
    LOOP
      normalized_location_name := trim(COALESCE(location_record->>'name', ''));

      IF normalized_location_name = '' THEN
        RAISE EXCEPTION 'Local inválido na configuração de agenda.';
      END IF;

      INSERT INTO public.championship_bracket_locations (
        bracket_day_id,
        name,
        position
      ) VALUES (
        bracket_day_id,
        normalized_location_name,
        GREATEST(1, COALESCE((location_record->>'position')::integer, 1))
      )
      ON CONFLICT (bracket_day_id, name)
      DO UPDATE SET position = EXCLUDED.position
      RETURNING id INTO bracket_location_id;

      FOR court_record IN
        SELECT value
        FROM jsonb_array_elements(COALESCE(location_record->'courts', '[]'::jsonb))
      LOOP
        normalized_court_name := trim(COALESCE(court_record->>'name', ''));

        IF normalized_court_name = '' THEN
          RAISE EXCEPTION 'Quadra inválida na configuração de agenda.';
        END IF;

        INSERT INTO public.championship_bracket_courts (
          bracket_location_id,
          name,
          position
        ) VALUES (
          bracket_location_id,
          normalized_court_name,
          GREATEST(1, COALESCE((court_record->>'position')::integer, 1))
        )
        ON CONFLICT (bracket_location_id, name)
        DO UPDATE SET position = EXCLUDED.position
        RETURNING id INTO bracket_court_id;

        FOR court_sport_record IN
          SELECT value
          FROM jsonb_array_elements(COALESCE(court_record->'sport_ids', '[]'::jsonb))
        LOOP
          INSERT INTO public.championship_bracket_court_sports (
            bracket_court_id,
            sport_id
          ) VALUES (
            bracket_court_id,
            trim(both '\"' from court_sport_record::text)::uuid
          )
          ON CONFLICT (bracket_court_id, sport_id)
          DO NOTHING;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;

  CREATE TEMP TABLE temp_bracket_slots (
    slot_start TIMESTAMPTZ NOT NULL,
    day_end TIMESTAMPTZ NOT NULL,
    location_name TEXT NOT NULL,
    court_name TEXT NOT NULL,
    sport_id UUID NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO temp_bracket_slots (
    slot_start,
    day_end,
    location_name,
    court_name,
    sport_id
  )
  SELECT
    slot_start.value,
    ((days_table.event_date::text || ' ' || days_table.end_time::text)::timestamp AT TIME ZONE 'America/Sao_Paulo') AS day_end,
    locations_table.name,
    courts_table.name,
    court_sports_table.sport_id
  FROM public.championship_bracket_days AS days_table
  JOIN public.championship_bracket_locations AS locations_table
    ON locations_table.bracket_day_id = days_table.id
  JOIN public.championship_bracket_courts AS courts_table
    ON courts_table.bracket_location_id = locations_table.id
  JOIN public.championship_bracket_court_sports AS court_sports_table
    ON court_sports_table.bracket_court_id = courts_table.id
  CROSS JOIN LATERAL generate_series(
    ((days_table.event_date::text || ' ' || days_table.start_time::text)::timestamp AT TIME ZONE 'America/Sao_Paulo'),
    ((days_table.event_date::text || ' ' || days_table.end_time::text)::timestamp AT TIME ZONE 'America/Sao_Paulo'),
    interval '5 minutes'
  ) AS slot_start(value)
  WHERE days_table.bracket_edition_id = bracket_edition_id;

  FOR competition_id, sport_id, naipe_value, division_value IN
    SELECT
      competitions_table.id,
      competitions_table.sport_id,
      competitions_table.naipe,
      competitions_table.division
    FROM public.championship_bracket_competitions AS competitions_table
    WHERE competitions_table.bracket_edition_id = bracket_edition_id
    ORDER BY competitions_table.created_at ASC
  LOOP
    competition_match_slot := 1;
    duration_minutes := public.resolve_championship_sport_duration_minutes(_championship_id, sport_id);

    FOR group_id IN
      SELECT groups_table.id
      FROM public.championship_bracket_groups AS groups_table
      WHERE groups_table.competition_id = competition_id
      ORDER BY groups_table.group_number ASC
    LOOP
      SELECT array_agg(group_teams_table.team_id ORDER BY group_teams_table.position ASC)
      INTO group_team_ids
      FROM public.championship_bracket_group_teams AS group_teams_table
      WHERE group_teams_table.group_id = group_id;

      group_team_count := COALESCE(cardinality(group_team_ids), 0);

      IF group_team_count < 2 THEN
        RAISE EXCEPTION 'Chave inválida: é necessário no mínimo duas atléticas por chave.';
      END IF;

      FOR existing_matches_count IN 1..group_team_count - 1
      LOOP
        FOR qualifiers_per_group_value IN existing_matches_count + 1..group_team_count
        LOOP
          SELECT
            slots_table.slot_start,
            slots_table.slot_start + make_interval(mins => duration_minutes),
            slots_table.location_name,
            slots_table.court_name
          INTO
            selected_slot_start,
            selected_slot_end,
            selected_slot_location_name,
            selected_slot_court_name
          FROM temp_bracket_slots AS slots_table
          WHERE slots_table.sport_id = sport_id
            AND slots_table.slot_start + make_interval(mins => duration_minutes) <= slots_table.day_end
            AND NOT EXISTS (
              SELECT 1
              FROM public.matches AS matches_table
              WHERE matches_table.location = slots_table.location_name
                AND COALESCE(matches_table.court_name, '') = COALESCE(slots_table.court_name, '')
                AND matches_table.start_time < slots_table.slot_start + make_interval(mins => duration_minutes)
                AND matches_table.end_time > slots_table.slot_start
            )
            AND NOT EXISTS (
              SELECT 1
              FROM public.matches AS matches_table
              WHERE matches_table.championship_id = _championship_id
                AND (
                  matches_table.home_team_id IN (group_team_ids[existing_matches_count], group_team_ids[qualifiers_per_group_value])
                  OR matches_table.away_team_id IN (group_team_ids[existing_matches_count], group_team_ids[qualifiers_per_group_value])
                )
                AND matches_table.start_time < slots_table.slot_start + make_interval(mins => duration_minutes + 15)
                AND matches_table.end_time > slots_table.slot_start - interval '15 minutes'
            )
          ORDER BY slots_table.slot_start ASC
          LIMIT 1;

          IF selected_slot_start IS NULL THEN
            RAISE EXCEPTION 'Não há horários disponíveis para concluir o chaveamento sem conflitos.';
          END IF;

          INSERT INTO public.matches (
            championship_id,
            division,
            naipe,
            sport_id,
            home_team_id,
            away_team_id,
            location,
            court_name,
            start_time,
            end_time,
            status
          ) VALUES (
            _championship_id,
            division_value,
            naipe_value,
            sport_id,
            group_team_ids[existing_matches_count],
            group_team_ids[qualifiers_per_group_value],
            selected_slot_location_name,
            selected_slot_court_name,
            selected_slot_start,
            selected_slot_end,
            'SCHEDULED'::public.match_status
          )
          RETURNING id INTO new_match_id;

          INSERT INTO public.championship_bracket_matches (
            bracket_edition_id,
            competition_id,
            group_id,
            phase,
            round_number,
            slot_number,
            match_id,
            home_team_id,
            away_team_id
          ) VALUES (
            bracket_edition_id,
            competition_id,
            group_id,
            'GROUP_STAGE'::public.bracket_phase,
            1,
            competition_match_slot,
            new_match_id,
            group_team_ids[existing_matches_count],
            group_team_ids[qualifiers_per_group_value]
          );

          competition_match_slot := competition_match_slot + 1;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;

  UPDATE public.championship_bracket_editions
  SET
    status = 'GROUPS_GENERATED'::public.bracket_edition_status,
    updated_at = now()
  WHERE id = bracket_edition_id;

  UPDATE public.championships
  SET status = 'UPCOMING'::public.championship_status
  WHERE id = _championship_id;

  RETURN bracket_edition_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_championship_knockout(
  _championship_id UUID,
  _bracket_edition_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bracket_edition_id UUID;
  competition_record RECORD;
  ranking_record RECORD;
  qualified_team_ids UUID[];
  qualified_team_count INTEGER;
  bracket_size INTEGER;
  total_rounds INTEGER;
  round_number INTEGER;
  slot_index INTEGER;
  home_seed_index INTEGER;
  away_seed_index INTEGER;
  home_team_id UUID;
  away_team_id UUID;
  round_match_ids UUID[];
  next_round_match_ids UUID[];
  semifinal_match_ids UUID[];
  source_home_bracket_match_id UUID;
  source_away_bracket_match_id UUID;
  source_home_winner_team_id UUID;
  source_away_winner_team_id UUID;
  round_duration_minutes INTEGER;
  selected_slot_start TIMESTAMPTZ;
  selected_slot_end TIMESTAMPTZ;
  selected_slot_location_name TEXT;
  selected_slot_court_name TEXT;
  new_match_id UUID;
  bracket_match_id UUID;
  third_place_mode_value public.bracket_third_place_mode;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para gerar mata-mata.';
  END IF;

  IF _bracket_edition_id IS NULL THEN
    SELECT editions_table.id
    INTO bracket_edition_id
    FROM public.championship_bracket_editions AS editions_table
    WHERE editions_table.championship_id = _championship_id
    ORDER BY editions_table.created_at DESC
    LIMIT 1;
  ELSE
    bracket_edition_id := _bracket_edition_id;
  END IF;

  IF bracket_edition_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma edição de chaveamento encontrada para este campeonato.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.bracket_edition_id = bracket_edition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
  ) THEN
    RAISE EXCEPTION 'Mata-mata já foi gerado para esta edição.';
  END IF;

  CREATE TEMP TABLE temp_knockout_slots (
    slot_start TIMESTAMPTZ NOT NULL,
    day_end TIMESTAMPTZ NOT NULL,
    location_name TEXT NOT NULL,
    court_name TEXT NOT NULL,
    sport_id UUID NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO temp_knockout_slots (
    slot_start,
    day_end,
    location_name,
    court_name,
    sport_id
  )
  SELECT
    slot_start.value,
    ((days_table.event_date::text || ' ' || days_table.end_time::text)::timestamp AT TIME ZONE 'America/Sao_Paulo') AS day_end,
    locations_table.name,
    courts_table.name,
    court_sports_table.sport_id
  FROM public.championship_bracket_days AS days_table
  JOIN public.championship_bracket_locations AS locations_table
    ON locations_table.bracket_day_id = days_table.id
  JOIN public.championship_bracket_courts AS courts_table
    ON courts_table.bracket_location_id = locations_table.id
  JOIN public.championship_bracket_court_sports AS court_sports_table
    ON court_sports_table.bracket_court_id = courts_table.id
  CROSS JOIN LATERAL generate_series(
    ((days_table.event_date::text || ' ' || days_table.start_time::text)::timestamp AT TIME ZONE 'America/Sao_Paulo'),
    ((days_table.event_date::text || ' ' || days_table.end_time::text)::timestamp AT TIME ZONE 'America/Sao_Paulo'),
    interval '5 minutes'
  ) AS slot_start(value)
  WHERE days_table.bracket_edition_id = bracket_edition_id;

  FOR competition_record IN
    SELECT
      competitions_table.id,
      competitions_table.sport_id,
      competitions_table.naipe,
      competitions_table.division,
      competitions_table.qualifiers_per_group,
      competitions_table.third_place_mode
    FROM public.championship_bracket_competitions AS competitions_table
    WHERE competitions_table.bracket_edition_id = bracket_edition_id
    ORDER BY competitions_table.created_at ASC
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.championship_bracket_matches AS bracket_matches_table
      JOIN public.matches AS matches_table
        ON matches_table.id = bracket_matches_table.match_id
      WHERE bracket_matches_table.competition_id = competition_record.id
        AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
        AND matches_table.status != 'FINISHED'::public.match_status
    ) THEN
      RAISE EXCEPTION 'Todas as partidas da fase de grupos devem estar encerradas antes de gerar o mata-mata.';
    END IF;

    qualified_team_ids := ARRAY[]::UUID[];

    FOR ranking_record IN
      WITH points_config AS (
        SELECT
          championship_sports_table.points_win,
          championship_sports_table.points_draw,
          championship_sports_table.points_loss
        FROM public.championship_sports AS championship_sports_table
        WHERE championship_sports_table.championship_id = _championship_id
          AND championship_sports_table.sport_id = competition_record.sport_id
        LIMIT 1
      ),
      group_team_scores AS (
        SELECT
          bracket_matches_table.group_id,
          matches_table.home_team_id AS team_id,
          matches_table.home_score AS goals_for,
          matches_table.away_score AS goals_against,
          CASE
            WHEN matches_table.home_score > matches_table.away_score THEN COALESCE((SELECT points_win FROM points_config), 3)
            WHEN matches_table.home_score = matches_table.away_score THEN COALESCE((SELECT points_draw FROM points_config), 1)
            ELSE COALESCE((SELECT points_loss FROM points_config), 0)
          END AS points,
          CASE WHEN matches_table.home_score > matches_table.away_score THEN 1 ELSE 0 END AS wins
        FROM public.championship_bracket_matches AS bracket_matches_table
        JOIN public.matches AS matches_table
          ON matches_table.id = bracket_matches_table.match_id
        WHERE bracket_matches_table.competition_id = competition_record.id
          AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase

        UNION ALL

        SELECT
          bracket_matches_table.group_id,
          matches_table.away_team_id AS team_id,
          matches_table.away_score AS goals_for,
          matches_table.home_score AS goals_against,
          CASE
            WHEN matches_table.away_score > matches_table.home_score THEN COALESCE((SELECT points_win FROM points_config), 3)
            WHEN matches_table.away_score = matches_table.home_score THEN COALESCE((SELECT points_draw FROM points_config), 1)
            ELSE COALESCE((SELECT points_loss FROM points_config), 0)
          END AS points,
          CASE WHEN matches_table.away_score > matches_table.home_score THEN 1 ELSE 0 END AS wins
        FROM public.championship_bracket_matches AS bracket_matches_table
        JOIN public.matches AS matches_table
          ON matches_table.id = bracket_matches_table.match_id
        WHERE bracket_matches_table.competition_id = competition_record.id
          AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
      ),
      group_ranking AS (
        SELECT
          group_team_scores.group_id,
          group_team_scores.team_id,
          sum(group_team_scores.points) AS points,
          sum(group_team_scores.wins) AS wins,
          sum(group_team_scores.goals_for - group_team_scores.goals_against) AS goal_diff,
          sum(group_team_scores.goals_for) AS goals_for
        FROM group_team_scores
        GROUP BY group_team_scores.group_id, group_team_scores.team_id
      ),
      ranked AS (
        SELECT
          group_ranking.group_id,
          group_ranking.team_id,
          row_number() OVER (
            PARTITION BY group_ranking.group_id
            ORDER BY group_ranking.points DESC, group_ranking.wins DESC, group_ranking.goal_diff DESC, group_ranking.goals_for DESC, teams_table.name ASC
          ) AS team_rank,
          groups_table.group_number
        FROM group_ranking
        JOIN public.championship_bracket_groups AS groups_table
          ON groups_table.id = group_ranking.group_id
        JOIN public.teams AS teams_table
          ON teams_table.id = group_ranking.team_id
      )
      SELECT
        ranked.team_id,
        ranked.group_number,
        ranked.team_rank
      FROM ranked
      WHERE ranked.team_rank <= competition_record.qualifiers_per_group
      ORDER BY ranked.team_rank ASC, ranked.group_number ASC
    LOOP
      qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
    END LOOP;

    qualified_team_count := COALESCE(cardinality(qualified_team_ids), 0);

    IF qualified_team_count < 2 THEN
      CONTINUE;
    END IF;

    bracket_size := 1;

    WHILE bracket_size < qualified_team_count LOOP
      bracket_size := bracket_size * 2;
    END LOOP;

    WHILE cardinality(qualified_team_ids) < bracket_size LOOP
      qualified_team_ids := array_append(qualified_team_ids, NULL);
    END LOOP;

    total_rounds := 1;
    WHILE power(2, total_rounds) < bracket_size LOOP
      total_rounds := total_rounds + 1;
    END LOOP;

    round_duration_minutes := public.resolve_championship_sport_duration_minutes(_championship_id, competition_record.sport_id);
    round_match_ids := ARRAY[]::UUID[];
    semifinal_match_ids := ARRAY[]::UUID[];
    third_place_mode_value := competition_record.third_place_mode;

    FOR slot_index IN 1..(bracket_size / 2)
    LOOP
      home_seed_index := slot_index;
      away_seed_index := bracket_size - slot_index + 1;
      home_team_id := qualified_team_ids[home_seed_index];
      away_team_id := qualified_team_ids[away_seed_index];
      new_match_id := NULL;

      IF home_team_id IS NULL AND away_team_id IS NULL THEN
        CONTINUE;
      END IF;

      IF home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN
        SELECT
          slots_table.slot_start,
          slots_table.slot_start + make_interval(mins => round_duration_minutes),
          slots_table.location_name,
          slots_table.court_name
        INTO
          selected_slot_start,
          selected_slot_end,
          selected_slot_location_name,
          selected_slot_court_name
        FROM temp_knockout_slots AS slots_table
        WHERE slots_table.sport_id = competition_record.sport_id
          AND slots_table.slot_start + make_interval(mins => round_duration_minutes) <= slots_table.day_end
          AND NOT EXISTS (
            SELECT 1
            FROM public.matches AS matches_table
            WHERE matches_table.location = slots_table.location_name
              AND COALESCE(matches_table.court_name, '') = COALESCE(slots_table.court_name, '')
              AND matches_table.start_time < slots_table.slot_start + make_interval(mins => round_duration_minutes)
              AND matches_table.end_time > slots_table.slot_start
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.matches AS matches_table
            WHERE matches_table.championship_id = _championship_id
              AND (
                matches_table.home_team_id IN (home_team_id, away_team_id)
                OR matches_table.away_team_id IN (home_team_id, away_team_id)
              )
              AND matches_table.start_time < slots_table.slot_start + make_interval(mins => round_duration_minutes + 15)
              AND matches_table.end_time > slots_table.slot_start - interval '15 minutes'
          )
        ORDER BY slots_table.slot_start ASC
        LIMIT 1;

        IF selected_slot_start IS NULL THEN
          RAISE EXCEPTION 'Não há horários disponíveis para gerar o mata-mata.';
        END IF;

        INSERT INTO public.matches (
          championship_id,
          division,
          naipe,
          sport_id,
          home_team_id,
          away_team_id,
          location,
          court_name,
          start_time,
          end_time,
          status
        ) VALUES (
          _championship_id,
          competition_record.division,
          competition_record.naipe,
          competition_record.sport_id,
          home_team_id,
          away_team_id,
          selected_slot_location_name,
          selected_slot_court_name,
          selected_slot_start,
          selected_slot_end,
          'SCHEDULED'::public.match_status
        )
        RETURNING id INTO new_match_id;
      END IF;

      INSERT INTO public.championship_bracket_matches (
        bracket_edition_id,
        competition_id,
        phase,
        round_number,
        slot_number,
        match_id,
        home_team_id,
        away_team_id,
        winner_team_id,
        is_bye
      ) VALUES (
        bracket_edition_id,
        competition_record.id,
        'KNOCKOUT'::public.bracket_phase,
        1,
        slot_index,
        new_match_id,
        home_team_id,
        away_team_id,
        CASE
          WHEN home_team_id IS NULL AND away_team_id IS NOT NULL THEN away_team_id
          WHEN away_team_id IS NULL AND home_team_id IS NOT NULL THEN home_team_id
          ELSE NULL
        END,
        CASE
          WHEN home_team_id IS NULL AND away_team_id IS NULL THEN false
          WHEN home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN false
          ELSE true
        END
      )
      RETURNING id INTO bracket_match_id;

      round_match_ids := array_append(round_match_ids, bracket_match_id);
    END LOOP;

    IF total_rounds > 1 THEN
      FOR round_number IN 2..total_rounds
      LOOP
        IF round_number = total_rounds THEN
          semifinal_match_ids := round_match_ids;
        END IF;

        next_round_match_ids := ARRAY[]::UUID[];

        FOR slot_index IN 1..(COALESCE(cardinality(round_match_ids), 0) / 2)
        LOOP
          source_home_bracket_match_id := round_match_ids[(slot_index * 2) - 1];
          source_away_bracket_match_id := round_match_ids[(slot_index * 2)];
          source_home_winner_team_id := NULL;
          source_away_winner_team_id := NULL;
          home_team_id := NULL;
          away_team_id := NULL;
          new_match_id := NULL;

          SELECT bracket_matches_table.winner_team_id
          INTO source_home_winner_team_id
          FROM public.championship_bracket_matches AS bracket_matches_table
          WHERE bracket_matches_table.id = source_home_bracket_match_id
          LIMIT 1;

          SELECT bracket_matches_table.winner_team_id
          INTO source_away_winner_team_id
          FROM public.championship_bracket_matches AS bracket_matches_table
          WHERE bracket_matches_table.id = source_away_bracket_match_id
          LIMIT 1;

          home_team_id := source_home_winner_team_id;
          away_team_id := source_away_winner_team_id;

          IF home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN
            SELECT
              slots_table.slot_start,
              slots_table.slot_start + make_interval(mins => round_duration_minutes),
              slots_table.location_name,
              slots_table.court_name
            INTO
              selected_slot_start,
              selected_slot_end,
              selected_slot_location_name,
              selected_slot_court_name
            FROM temp_knockout_slots AS slots_table
            WHERE slots_table.sport_id = competition_record.sport_id
              AND slots_table.slot_start + make_interval(mins => round_duration_minutes) <= slots_table.day_end
              AND NOT EXISTS (
                SELECT 1
                FROM public.matches AS matches_table
                WHERE matches_table.location = slots_table.location_name
                  AND COALESCE(matches_table.court_name, '') = COALESCE(slots_table.court_name, '')
                  AND matches_table.start_time < slots_table.slot_start + make_interval(mins => round_duration_minutes)
                  AND matches_table.end_time > slots_table.slot_start
              )
              AND NOT EXISTS (
                SELECT 1
                FROM public.matches AS matches_table
                WHERE matches_table.championship_id = _championship_id
                  AND (
                    matches_table.home_team_id IN (home_team_id, away_team_id)
                    OR matches_table.away_team_id IN (home_team_id, away_team_id)
                  )
                  AND matches_table.start_time < slots_table.slot_start + make_interval(mins => round_duration_minutes + 15)
                  AND matches_table.end_time > slots_table.slot_start - interval '15 minutes'
              )
            ORDER BY slots_table.slot_start ASC
            LIMIT 1;

            IF selected_slot_start IS NULL THEN
              RAISE EXCEPTION 'Não há horários disponíveis para concluir o mata-mata sem conflitos.';
            END IF;

            INSERT INTO public.matches (
              championship_id,
              division,
              naipe,
              sport_id,
              home_team_id,
              away_team_id,
              location,
              court_name,
              start_time,
              end_time,
              status
            ) VALUES (
              _championship_id,
              competition_record.division,
              competition_record.naipe,
              competition_record.sport_id,
              home_team_id,
              away_team_id,
              selected_slot_location_name,
              selected_slot_court_name,
              selected_slot_start,
              selected_slot_end,
              'SCHEDULED'::public.match_status
            )
            RETURNING id INTO new_match_id;
          END IF;

          INSERT INTO public.championship_bracket_matches (
            bracket_edition_id,
            competition_id,
            phase,
            round_number,
            slot_number,
            match_id,
            home_team_id,
            away_team_id,
            winner_team_id,
            source_home_bracket_match_id,
            source_away_bracket_match_id,
            is_bye
          ) VALUES (
            bracket_edition_id,
            competition_record.id,
            'KNOCKOUT'::public.bracket_phase,
            round_number,
            slot_index,
            new_match_id,
            home_team_id,
            away_team_id,
            CASE
              WHEN home_team_id IS NULL AND away_team_id IS NOT NULL THEN away_team_id
              WHEN away_team_id IS NULL AND home_team_id IS NOT NULL THEN home_team_id
              ELSE NULL
            END,
            source_home_bracket_match_id,
            source_away_bracket_match_id,
            CASE
              WHEN home_team_id IS NULL AND away_team_id IS NULL THEN false
              WHEN home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN false
              ELSE true
            END
          )
          RETURNING id INTO bracket_match_id;

          UPDATE public.championship_bracket_matches
          SET next_bracket_match_id = bracket_match_id
          WHERE id = source_home_bracket_match_id;

          UPDATE public.championship_bracket_matches
          SET next_bracket_match_id = bracket_match_id
          WHERE id = source_away_bracket_match_id;

          next_round_match_ids := array_append(next_round_match_ids, bracket_match_id);
        END LOOP;

        round_match_ids := next_round_match_ids;
      END LOOP;
    END IF;

    IF third_place_mode_value = 'MATCH'::public.bracket_third_place_mode
      AND COALESCE(cardinality(semifinal_match_ids), 0) = 2 THEN
      INSERT INTO public.championship_bracket_matches (
        bracket_edition_id,
        competition_id,
        phase,
        round_number,
        slot_number,
        source_home_bracket_match_id,
        source_away_bracket_match_id,
        is_third_place
      ) VALUES (
        bracket_edition_id,
        competition_record.id,
        'KNOCKOUT'::public.bracket_phase,
        total_rounds,
        2,
        semifinal_match_ids[1],
        semifinal_match_ids[2],
        true
      );
    END IF;
  END LOOP;

  UPDATE public.championship_bracket_editions
  SET
    status = 'KNOCKOUT_GENERATED'::public.bracket_edition_status,
    updated_at = now()
  WHERE id = bracket_edition_id;

  RETURN bracket_edition_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_match_sets(
  _match_id UUID,
  _sets JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  set_record JSONB;
  resolved_result_rule public.championship_sport_result_rule;
  resolved_match RECORD;
  home_sets INTEGER := 0;
  away_sets INTEGER := 0;
BEGIN
  IF NOT public.has_admin_tab_access('control'::public.admin_panel_tab, true)
    AND NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para atualizar sets.';
  END IF;

  SELECT
    matches_table.id,
    matches_table.championship_id,
    matches_table.sport_id
  INTO resolved_match
  FROM public.matches AS matches_table
  WHERE matches_table.id = _match_id
  LIMIT 1;

  IF resolved_match.id IS NULL THEN
    RAISE EXCEPTION 'Partida não encontrada para registro de sets.';
  END IF;

  resolved_result_rule := public.resolve_championship_sport_result_rule(
    resolved_match.championship_id,
    resolved_match.sport_id
  );

  DELETE FROM public.match_sets
  WHERE match_sets.match_id = _match_id;

  FOR set_record IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(_sets, '[]'::jsonb))
  LOOP
    INSERT INTO public.match_sets (
      match_id,
      set_number,
      home_points,
      away_points
    ) VALUES (
      _match_id,
      GREATEST(1, COALESCE((set_record->>'set_number')::integer, 1)),
      GREATEST(0, COALESCE((set_record->>'home_points')::integer, 0)),
      GREATEST(0, COALESCE((set_record->>'away_points')::integer, 0))
    );

    IF COALESCE((set_record->>'home_points')::integer, 0) > COALESCE((set_record->>'away_points')::integer, 0) THEN
      home_sets := home_sets + 1;
    ELSIF COALESCE((set_record->>'away_points')::integer, 0) > COALESCE((set_record->>'home_points')::integer, 0) THEN
      away_sets := away_sets + 1;
    END IF;
  END LOOP;

  IF resolved_result_rule = 'SETS'::public.championship_sport_result_rule THEN
    UPDATE public.matches
    SET
      home_score = home_sets,
      away_score = away_sets
    WHERE matches.id = _match_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_match_sets(
  _match_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  response JSONB;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'set_number', match_sets_table.set_number,
        'home_points', match_sets_table.home_points,
        'away_points', match_sets_table.away_points
      )
      ORDER BY match_sets_table.set_number ASC
    ),
    '[]'::jsonb
  )
  INTO response
  FROM public.match_sets AS match_sets_table
  WHERE match_sets_table.match_id = _match_id;

  RETURN response;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_championship_bracket_view(
  _championship_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  response JSONB;
BEGIN
  WITH latest_edition AS (
    SELECT editions_table.id
    FROM public.championship_bracket_editions AS editions_table
    WHERE editions_table.championship_id = _championship_id
    ORDER BY editions_table.created_at DESC
    LIMIT 1
  ),
  competitions AS (
    SELECT
      competitions_table.id,
      competitions_table.sport_id,
      competitions_table.naipe,
      competitions_table.division,
      competitions_table.groups_count,
      competitions_table.qualifiers_per_group,
      competitions_table.third_place_mode,
      sports_table.name AS sport_name
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN latest_edition
      ON latest_edition.id = competitions_table.bracket_edition_id
    JOIN public.sports AS sports_table
      ON sports_table.id = competitions_table.sport_id
  ),
  groups AS (
    SELECT
      groups_table.id,
      groups_table.competition_id,
      groups_table.group_number,
      jsonb_agg(
        jsonb_build_object(
          'team_id', teams_table.id,
          'team_name', teams_table.name,
          'team_city', teams_table.city,
          'position', group_teams_table.position
        )
        ORDER BY group_teams_table.position ASC
      ) AS teams
    FROM public.championship_bracket_groups AS groups_table
    JOIN public.championship_bracket_group_teams AS group_teams_table
      ON group_teams_table.group_id = groups_table.id
    JOIN public.teams AS teams_table
      ON teams_table.id = group_teams_table.team_id
    WHERE groups_table.competition_id IN (SELECT competitions.id FROM competitions)
    GROUP BY groups_table.id, groups_table.competition_id, groups_table.group_number
  ),
  bracket_matches AS (
    SELECT
      bracket_matches_table.id,
      bracket_matches_table.competition_id,
      bracket_matches_table.group_id,
      bracket_matches_table.phase,
      bracket_matches_table.round_number,
      bracket_matches_table.slot_number,
      bracket_matches_table.match_id,
      bracket_matches_table.home_team_id,
      bracket_matches_table.away_team_id,
      bracket_matches_table.winner_team_id,
      bracket_matches_table.is_bye,
      bracket_matches_table.is_third_place,
      matches_table.status,
      matches_table.start_time,
      matches_table.end_time,
      matches_table.location,
      matches_table.court_name,
      home_teams_table.name AS home_team_name,
      away_teams_table.name AS away_team_name,
      winner_teams_table.name AS winner_team_name
    FROM public.championship_bracket_matches AS bracket_matches_table
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    LEFT JOIN public.teams AS home_teams_table
      ON home_teams_table.id = bracket_matches_table.home_team_id
    LEFT JOIN public.teams AS away_teams_table
      ON away_teams_table.id = bracket_matches_table.away_team_id
    LEFT JOIN public.teams AS winner_teams_table
      ON winner_teams_table.id = bracket_matches_table.winner_team_id
    WHERE bracket_matches_table.bracket_edition_id IN (SELECT latest_edition.id FROM latest_edition)
  )
  SELECT jsonb_build_object(
    'edition', (
      SELECT to_jsonb(editions_table)
      FROM public.championship_bracket_editions AS editions_table
      WHERE editions_table.id IN (SELECT latest_edition.id FROM latest_edition)
      LIMIT 1
    ),
    'competitions', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', competitions.id,
            'sport_id', competitions.sport_id,
            'sport_name', competitions.sport_name,
            'naipe', competitions.naipe,
            'division', competitions.division,
            'groups_count', competitions.groups_count,
            'qualifiers_per_group', competitions.qualifiers_per_group,
            'third_place_mode', competitions.third_place_mode,
            'groups', COALESCE(
              (
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'id', groups.id,
                    'group_number', groups.group_number,
                    'teams', groups.teams,
                    'matches', COALESCE(
                      (
                        SELECT jsonb_agg(
                          jsonb_build_object(
                            'id', bracket_matches.id,
                            'match_id', bracket_matches.match_id,
                            'status', bracket_matches.status,
                            'start_time', bracket_matches.start_time,
                            'end_time', bracket_matches.end_time,
                            'location', bracket_matches.location,
                            'court_name', bracket_matches.court_name,
                            'home_team_id', bracket_matches.home_team_id,
                            'away_team_id', bracket_matches.away_team_id,
                            'home_team_name', bracket_matches.home_team_name,
                            'away_team_name', bracket_matches.away_team_name,
                            'winner_team_id', bracket_matches.winner_team_id,
                            'winner_team_name', bracket_matches.winner_team_name
                          )
                          ORDER BY bracket_matches.round_number ASC, bracket_matches.slot_number ASC
                        )
                        FROM bracket_matches
                        WHERE bracket_matches.group_id = groups.id
                          AND bracket_matches.phase = 'GROUP_STAGE'::public.bracket_phase
                      ),
                      '[]'::jsonb
                    )
                  )
                  ORDER BY groups.group_number ASC
                )
                FROM groups
                WHERE groups.competition_id = competitions.id
              ),
              '[]'::jsonb
            ),
            'knockout_matches', COALESCE(
              (
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'id', bracket_matches.id,
                    'round_number', bracket_matches.round_number,
                    'slot_number', bracket_matches.slot_number,
                    'match_id', bracket_matches.match_id,
                    'status', bracket_matches.status,
                    'start_time', bracket_matches.start_time,
                    'end_time', bracket_matches.end_time,
                    'location', bracket_matches.location,
                    'court_name', bracket_matches.court_name,
                    'home_team_id', bracket_matches.home_team_id,
                    'away_team_id', bracket_matches.away_team_id,
                    'home_team_name', bracket_matches.home_team_name,
                    'away_team_name', bracket_matches.away_team_name,
                    'winner_team_id', bracket_matches.winner_team_id,
                    'winner_team_name', bracket_matches.winner_team_name,
                    'is_bye', bracket_matches.is_bye,
                    'is_third_place', bracket_matches.is_third_place
                  )
                  ORDER BY bracket_matches.round_number ASC, bracket_matches.slot_number ASC
                )
                FROM bracket_matches
                WHERE bracket_matches.competition_id = competitions.id
                  AND bracket_matches.phase = 'KNOCKOUT'::public.bracket_phase
              ),
              '[]'::jsonb
            )
          )
          ORDER BY competitions.sport_name ASC
        )
        FROM competitions
      ),
      '[]'::jsonb
    )
  )
  INTO response;

  RETURN COALESCE(response, jsonb_build_object('edition', NULL, 'competitions', '[]'::jsonb));
END;
$$;

COMMENT ON FUNCTION public.generate_championship_bracket_groups(UUID, JSONB) IS 'Cria edição de chaveamento, gera fase de grupos automaticamente, agenda partidas sem conflito e altera campeonato para Configurando campeonato (UPCOMING).';
COMMENT ON FUNCTION public.generate_championship_knockout(UUID, UUID) IS 'Gera a estrutura completa do mata-mata após encerramento da fase de grupos, incluindo BYE e metadados de 3º lugar.';
COMMENT ON FUNCTION public.get_championship_bracket_view(UUID) IS 'Retorna visão consolidada do chaveamento para admin e público.';

NOTIFY pgrst, 'reload schema';
