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
      AND table_name = 'league_events'
  ) THEN
    RAISE EXCEPTION 'Tabela public.league_events não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'league_event_organizer_teams'
  ) THEN
    RAISE EXCEPTION 'Tabela public.league_event_organizer_teams não encontrada.';
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
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.app_role'::regtype
      AND enumlabel = 'eventos'
  ) THEN
    RAISE EXCEPTION 'Valor eventos no enum public.app_role não encontrado. Execute a migration 20260301142000_add_eventos_role_to_app_role.sql antes desta.';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.is_eventos()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'eventos'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION public.can_access_admin_panel()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin() OR public.is_eventos() OR public.is_mesa()
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
      WHEN 'eventos' THEN 1
      WHEN 'mesa' THEN 2
      ELSE 3
    END
  LIMIT 1;

  RETURN current_user_role;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_events'
      AND policyname = 'Admin can insert league events'
  ) THEN
    ALTER POLICY "Admin can insert league events"
      ON public.league_events
      WITH CHECK (public.is_admin() OR public.is_eventos());
  ELSE
    CREATE POLICY "Admin can insert league events"
      ON public.league_events
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_admin() OR public.is_eventos());
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_events'
      AND policyname = 'Admin can update league events'
  ) THEN
    ALTER POLICY "Admin can update league events"
      ON public.league_events
      USING (public.is_admin() OR public.is_eventos())
      WITH CHECK (public.is_admin() OR public.is_eventos());
  ELSE
    CREATE POLICY "Admin can update league events"
      ON public.league_events
      FOR UPDATE
      TO authenticated
      USING (public.is_admin() OR public.is_eventos())
      WITH CHECK (public.is_admin() OR public.is_eventos());
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_events'
      AND policyname = 'Admin can delete league events'
  ) THEN
    ALTER POLICY "Admin can delete league events"
      ON public.league_events
      USING (public.is_admin() OR public.is_eventos());
  ELSE
    CREATE POLICY "Admin can delete league events"
      ON public.league_events
      FOR DELETE
      TO authenticated
      USING (public.is_admin() OR public.is_eventos());
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_event_organizer_teams'
      AND policyname = 'Admin can insert league event organizers'
  ) THEN
    ALTER POLICY "Admin can insert league event organizers"
      ON public.league_event_organizer_teams
      WITH CHECK (public.is_admin() OR public.is_eventos());
  ELSE
    CREATE POLICY "Admin can insert league event organizers"
      ON public.league_event_organizer_teams
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_admin() OR public.is_eventos());
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_event_organizer_teams'
      AND policyname = 'Admin can update league event organizers'
  ) THEN
    ALTER POLICY "Admin can update league event organizers"
      ON public.league_event_organizer_teams
      USING (public.is_admin() OR public.is_eventos())
      WITH CHECK (public.is_admin() OR public.is_eventos());
  ELSE
    CREATE POLICY "Admin can update league event organizers"
      ON public.league_event_organizer_teams
      FOR UPDATE
      TO authenticated
      USING (public.is_admin() OR public.is_eventos())
      WITH CHECK (public.is_admin() OR public.is_eventos());
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_event_organizer_teams'
      AND policyname = 'Admin can delete league event organizers'
  ) THEN
    ALTER POLICY "Admin can delete league event organizers"
      ON public.league_event_organizer_teams
      USING (public.is_admin() OR public.is_eventos());
  ELSE
    CREATE POLICY "Admin can delete league event organizers"
      ON public.league_event_organizer_teams
      FOR DELETE
      TO authenticated
      USING (public.is_admin() OR public.is_eventos());
  END IF;
END
$$;

DO $$
DECLARE
  eventos_email CONSTANT TEXT := 'eventos@ligadasatleticasdejlle.com.br';
  eventos_user_id UUID;
BEGIN
  SELECT users_table.id
  INTO eventos_user_id
  FROM auth.users AS users_table
  WHERE lower(users_table.email) = lower(eventos_email)
  LIMIT 1;

  IF eventos_user_id IS NULL THEN
    eventos_user_id := gen_random_uuid();

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
      eventos_user_id,
      'authenticated',
      'authenticated',
      eventos_email,
      crypt('eventos2026!', gen_salt('bf')),
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
      encrypted_password = crypt('eventos2026!', gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"provider":"email","providers":["email"]}'::jsonb,
      updated_at = now()
    WHERE id = eventos_user_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.identities AS identities_table
    WHERE identities_table.user_id = eventos_user_id
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
      eventos_user_id,
      jsonb_build_object('sub', eventos_user_id::text, 'email', eventos_email),
      'email',
      eventos_email,
      now(),
      now(),
      now()
    );
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (eventos_user_id, 'eventos'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'admin_action_type'
  ) THEN
    CREATE TYPE public.admin_action_type AS ENUM ('INSERT', 'UPDATE', 'DELETE', 'PASSWORD_CHANGED');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.admin_action_type'::regtype
      AND enumlabel = 'INSERT'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.admin_action_type'::regtype
      AND enumlabel = 'UPDATE'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.admin_action_type'::regtype
      AND enumlabel = 'DELETE'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.admin_action_type'::regtype
      AND enumlabel = 'PASSWORD_CHANGED'
  ) THEN
    RAISE EXCEPTION 'Enum public.admin_action_type incompleto. Deve conter: INSERT, UPDATE, DELETE e PASSWORD_CHANGED.';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.admin_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  actor_email TEXT,
  actor_role public.app_role,
  action_type public.admin_action_type NOT NULL,
  resource_table TEXT NOT NULL,
  record_id TEXT,
  description TEXT,
  old_data JSONB,
  new_data JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_action_logs
  ADD COLUMN IF NOT EXISTS actor_user_id UUID,
  ADD COLUMN IF NOT EXISTS actor_email TEXT,
  ADD COLUMN IF NOT EXISTS actor_role public.app_role,
  ADD COLUMN IF NOT EXISTS action_type public.admin_action_type,
  ADD COLUMN IF NOT EXISTS resource_table TEXT,
  ADD COLUMN IF NOT EXISTS record_id TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS old_data JSONB,
  ADD COLUMN IF NOT EXISTS new_data JSONB,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.admin_action_logs
    WHERE action_type IS NULL
      OR resource_table IS NULL
  ) THEN
    RAISE EXCEPTION 'Tabela public.admin_action_logs possui registros inválidos para action_type/resource_table.';
  END IF;
END
$$;

ALTER TABLE public.admin_action_logs
  ALTER COLUMN action_type SET NOT NULL;

ALTER TABLE public.admin_action_logs
  ALTER COLUMN resource_table SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'admin_action_logs_actor_user_id_fkey'
      AND conrelid = 'public.admin_action_logs'::regclass
  ) THEN
    ALTER TABLE public.admin_action_logs
      ADD CONSTRAINT admin_action_logs_actor_user_id_fkey
      FOREIGN KEY (actor_user_id)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS admin_action_logs_actor_user_id_idx
  ON public.admin_action_logs (actor_user_id);

CREATE INDEX IF NOT EXISTS admin_action_logs_action_type_idx
  ON public.admin_action_logs (action_type);

CREATE INDEX IF NOT EXISTS admin_action_logs_resource_table_idx
  ON public.admin_action_logs (resource_table);

CREATE INDEX IF NOT EXISTS admin_action_logs_created_at_idx
  ON public.admin_action_logs (created_at DESC);

CREATE OR REPLACE FUNCTION public.write_admin_action_log(
  _action_type public.admin_action_type,
  _resource_table TEXT,
  _record_id TEXT DEFAULT NULL,
  _description TEXT DEFAULT NULL,
  _old_data JSONB DEFAULT NULL,
  _new_data JSONB DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_user_id UUID;
  actor_role public.app_role;
  actor_email TEXT;
BEGIN
  actor_user_id := auth.uid();

  IF actor_user_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.can_access_admin_panel() THEN
    RETURN;
  END IF;

  SELECT users_table.email
  INTO actor_email
  FROM auth.users AS users_table
  WHERE users_table.id = actor_user_id
  LIMIT 1;

  SELECT user_roles_table.role
  INTO actor_role
  FROM public.user_roles AS user_roles_table
  WHERE user_roles_table.user_id = actor_user_id
  ORDER BY
    CASE user_roles_table.role::text
      WHEN 'admin' THEN 0
      WHEN 'eventos' THEN 1
      WHEN 'mesa' THEN 2
      ELSE 3
    END
  LIMIT 1;

  INSERT INTO public.admin_action_logs (
    actor_user_id,
    actor_email,
    actor_role,
    action_type,
    resource_table,
    record_id,
    description,
    old_data,
    new_data,
    metadata
  ) VALUES (
    actor_user_id,
    actor_email,
    actor_role,
    _action_type,
    _resource_table,
    _record_id,
    _description,
    _old_data,
    _new_data,
    COALESCE(_metadata, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_admin_action_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  action_type public.admin_action_type;
  old_payload JSONB;
  new_payload JSONB;
  record_identifier TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    action_type := 'INSERT'::public.admin_action_type;
    old_payload := NULL;
    new_payload := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    action_type := 'UPDATE'::public.admin_action_type;
    old_payload := to_jsonb(OLD);
    new_payload := to_jsonb(NEW);
  ELSE
    action_type := 'DELETE'::public.admin_action_type;
    old_payload := to_jsonb(OLD);
    new_payload := NULL;
  END IF;

  record_identifier := COALESCE(new_payload ->> 'id', old_payload ->> 'id');

  IF record_identifier IS NULL AND TG_TABLE_NAME = 'league_event_organizer_teams' THEN
    record_identifier := CONCAT(
      COALESCE(new_payload ->> 'event_id', old_payload ->> 'event_id', 'sem_evento'),
      ':',
      COALESCE(new_payload ->> 'team_id', old_payload ->> 'team_id', 'sem_atletica')
    );
  END IF;

  PERFORM public.write_admin_action_log(
    action_type,
    format('%s.%s', TG_TABLE_SCHEMA, TG_TABLE_NAME),
    record_identifier,
    format('%s em %s.%s', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME),
    old_payload,
    new_payload,
    jsonb_build_object('operation', TG_OP)
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'championships'
  ) THEN
    DROP TRIGGER IF EXISTS audit_log_championships_trigger ON public.championships;

    CREATE TRIGGER audit_log_championships_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.championships
    FOR EACH ROW
    EXECUTE FUNCTION public.capture_admin_action_log();
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'sports'
  ) THEN
    DROP TRIGGER IF EXISTS audit_log_sports_trigger ON public.sports;

    CREATE TRIGGER audit_log_sports_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.sports
    FOR EACH ROW
    EXECUTE FUNCTION public.capture_admin_action_log();
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'teams'
  ) THEN
    DROP TRIGGER IF EXISTS audit_log_teams_trigger ON public.teams;

    CREATE TRIGGER audit_log_teams_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.teams
    FOR EACH ROW
    EXECUTE FUNCTION public.capture_admin_action_log();
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'matches'
  ) THEN
    DROP TRIGGER IF EXISTS audit_log_matches_trigger ON public.matches;

    CREATE TRIGGER audit_log_matches_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.matches
    FOR EACH ROW
    EXECUTE FUNCTION public.capture_admin_action_log();
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'league_events'
  ) THEN
    DROP TRIGGER IF EXISTS audit_log_league_events_trigger ON public.league_events;

    CREATE TRIGGER audit_log_league_events_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.league_events
    FOR EACH ROW
    EXECUTE FUNCTION public.capture_admin_action_log();
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'league_event_organizer_teams'
  ) THEN
    DROP TRIGGER IF EXISTS audit_log_league_event_organizer_teams_trigger ON public.league_event_organizer_teams;

    CREATE TRIGGER audit_log_league_event_organizer_teams_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.league_event_organizer_teams
    FOR EACH ROW
    EXECUTE FUNCTION public.capture_admin_action_log();
  END IF;
END
$$;

ALTER TABLE public.admin_action_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_action_logs'
      AND policyname = 'Admin can view admin action logs'
  ) THEN
    CREATE POLICY "Admin can view admin action logs"
      ON public.admin_action_logs
      FOR SELECT
      TO authenticated
      USING (public.is_admin());
  END IF;
END
$$;

GRANT SELECT ON TABLE public.admin_action_logs TO authenticated;
GRANT SELECT ON TABLE public.admin_action_logs TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.admin_action_logs TO service_role;

CREATE OR REPLACE FUNCTION public.list_admin_users()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  role public.app_role,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem listar usuários administrativos.';
  END IF;

  RETURN QUERY
  SELECT
    users_table.id AS user_id,
    users_table.email,
    user_role_by_priority.role,
    users_table.created_at,
    users_table.last_sign_in_at
  FROM auth.users AS users_table
  JOIN LATERAL (
    SELECT user_roles_table.role
    FROM public.user_roles AS user_roles_table
    WHERE user_roles_table.user_id = users_table.id
    ORDER BY
      CASE user_roles_table.role::text
        WHEN 'admin' THEN 0
        WHEN 'eventos' THEN 1
        WHEN 'mesa' THEN 2
        ELSE 3
      END
    LIMIT 1
  ) AS user_role_by_priority ON true
  ORDER BY users_table.email ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user_password(
  _target_user_id UUID,
  _new_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_email TEXT;
  target_user_role public.app_role;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar senhas.';
  END IF;

  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário inválido.';
  END IF;

  IF _new_password IS NULL OR char_length(trim(_new_password)) < 8 THEN
    RAISE EXCEPTION 'A senha deve ter ao menos 8 caracteres.';
  END IF;

  SELECT users_table.email
  INTO target_user_email
  FROM auth.users AS users_table
  WHERE users_table.id = _target_user_id
  LIMIT 1;

  IF target_user_email IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado.';
  END IF;

  SELECT user_roles_table.role
  INTO target_user_role
  FROM public.user_roles AS user_roles_table
  WHERE user_roles_table.user_id = _target_user_id
  ORDER BY
    CASE user_roles_table.role::text
      WHEN 'admin' THEN 0
      WHEN 'eventos' THEN 1
      WHEN 'mesa' THEN 2
      ELSE 3
    END
  LIMIT 1;

  IF target_user_role IS NULL THEN
    RAISE EXCEPTION 'Usuário informado não possui perfil administrativo.';
  END IF;

  UPDATE auth.users
  SET
    encrypted_password = crypt(_new_password, gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
  WHERE id = _target_user_id;

  PERFORM public.write_admin_action_log(
    'PASSWORD_CHANGED'::public.admin_action_type,
    'auth.users',
    _target_user_id::text,
    format('Senha atualizada para o usuário administrativo %s', COALESCE(target_user_email, _target_user_id::text)),
    NULL,
    NULL,
    jsonb_build_object(
      'target_user_id', _target_user_id::text,
      'target_user_email', target_user_email,
      'target_user_role', target_user_role::text
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_admin_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_password(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
