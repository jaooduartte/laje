DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'app_role'
  ) THEN
    RAISE EXCEPTION 'Enum public.app_role não encontrado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user_roles'
  ) THEN
    RAISE EXCEPTION 'Tabela public.user_roles não encontrada.';
  END IF;

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
    FROM information_schema.tables
    WHERE table_schema = 'auth'
      AND table_name = 'users'
  ) THEN
    RAISE EXCEPTION 'Tabela auth.users não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'auth'
      AND table_name = 'identities'
  ) THEN
    RAISE EXCEPTION 'Tabela auth.identities não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'crypt'
      AND pg_function_is_visible(oid)
  ) THEN
    RAISE EXCEPTION 'Função crypt não encontrada. Verifique a extensão pgcrypto.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.app_role'::regtype
      AND enumlabel = 'mesa'
  ) THEN
    RAISE EXCEPTION 'Valor mesa no enum public.app_role não encontrado. Execute a migration de enum antes desta.';
  END IF;
END
$$;

DROP FUNCTION IF EXISTS public.is_readonly();

CREATE OR REPLACE FUNCTION public.is_mesa()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'mesa'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION public.can_access_admin_panel()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin() OR public.is_mesa()
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS public.app_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_role public.app_role;
BEGIN
  SELECT user_roles_table.role
  INTO current_user_role
  FROM public.user_roles AS user_roles_table
  WHERE user_roles_table.user_id = auth.uid()
  ORDER BY
    CASE user_roles_table.role::text
      WHEN 'admin' THEN 0
      WHEN 'mesa' THEN 1
      ELSE 2
    END
  LIMIT 1;

  RETURN current_user_role;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'matches'
      AND policyname = 'Mesa pode atualizar placar e status'
  ) THEN
    CREATE POLICY "Mesa pode atualizar placar e status"
      ON public.matches
      FOR UPDATE
      TO authenticated
      USING (public.is_mesa())
      WITH CHECK (public.is_mesa());
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

  IF public.is_admin() OR NOT public.is_mesa() THEN
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
    RAISE EXCEPTION 'Perfil mesa pode alterar apenas placar, cartões e status da partida.';
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

DROP TRIGGER IF EXISTS validate_mesa_match_update_trigger ON public.matches;

CREATE TRIGGER validate_mesa_match_update_trigger
BEFORE UPDATE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.validate_mesa_match_update();

DELETE FROM public.user_roles
WHERE role::text = 'readonly';

DO $$
DECLARE
  mesa_email CONSTANT TEXT := 'mesa@ligadasatleticasdejlle.com.br';
  mesa_user_id UUID;
BEGIN
  SELECT users_table.id
  INTO mesa_user_id
  FROM auth.users AS users_table
  WHERE lower(users_table.email) = lower(mesa_email)
  LIMIT 1;

  IF mesa_user_id IS NULL THEN
    mesa_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000'::uuid,
      mesa_user_id,
      'authenticated',
      'authenticated',
      mesa_email,
      crypt('mesa2026!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  ELSE
    UPDATE auth.users
    SET
      encrypted_password = crypt('mesa2026!', gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"provider":"email","providers":["email"]}'::jsonb,
      updated_at = now()
    WHERE id = mesa_user_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.identities AS identities_table
    WHERE identities_table.user_id = mesa_user_id
      AND identities_table.provider = 'email'
  ) THEN
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      mesa_user_id,
      jsonb_build_object('sub', mesa_user_id::text, 'email', mesa_email),
      'email',
      mesa_email,
      now(),
      now(),
      now()
    );
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (mesa_user_id, 'mesa'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END
$$;

NOTIFY pgrst, 'reload schema';
