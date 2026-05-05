ALTER TABLE public.championship_bracket_editions
ADD COLUMN IF NOT EXISTS updated_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.championship_bracket_editions AS editions_table
SET updated_by = COALESCE(editions_table.updated_by, editions_table.created_by)
WHERE editions_table.status = 'DRAFT'::public.bracket_edition_status;

WITH ranked_drafts AS (
  SELECT
    editions_table.id,
    row_number() OVER (
      PARTITION BY editions_table.championship_id, editions_table.season_year
      ORDER BY editions_table.updated_at DESC, editions_table.created_at DESC, editions_table.id DESC
    ) AS rank_number
  FROM public.championship_bracket_editions AS editions_table
  WHERE editions_table.status = 'DRAFT'::public.bracket_edition_status
)
DELETE FROM public.championship_bracket_editions AS editions_table
USING ranked_drafts
WHERE editions_table.id = ranked_drafts.id
  AND ranked_drafts.rank_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS championship_bracket_editions_unique_draft_by_championship_and_season_idx
  ON public.championship_bracket_editions (championship_id, season_year)
  WHERE status = 'DRAFT'::public.bracket_edition_status;

CREATE OR REPLACE FUNCTION public.get_championship_bracket_draft(
  _championship_id uuid,
  _season_year integer DEFAULT NULL
)
RETURNS TABLE (
  edition_id uuid,
  status public.bracket_edition_status,
  season_year integer,
  payload_snapshot jsonb,
  updated_at timestamptz,
  updated_by uuid,
  updated_by_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  target_season_year integer;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, false) THEN
    RAISE EXCEPTION 'Usuário sem permissão para visualizar rascunho do chaveamento.';
  END IF;

  SELECT championships_table.current_season_year
  INTO target_season_year
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id
  LIMIT 1;

  IF target_season_year IS NULL THEN
    RETURN;
  END IF;

  target_season_year := COALESCE(_season_year, target_season_year);

  RETURN QUERY
  SELECT
    editions_table.id AS edition_id,
    editions_table.status,
    editions_table.season_year,
    editions_table.payload_snapshot,
    editions_table.updated_at,
    editions_table.updated_by,
    admin_users_table.name AS updated_by_name
  FROM public.championship_bracket_editions AS editions_table
  LEFT JOIN public.admin_user_profiles AS admin_users_table
    ON admin_users_table.user_id = editions_table.updated_by
  WHERE editions_table.championship_id = _championship_id
    AND editions_table.season_year = target_season_year
    AND editions_table.status = 'DRAFT'::public.bracket_edition_status
  ORDER BY editions_table.updated_at DESC, editions_table.created_at DESC
  LIMIT 1;
END;
$func$;

CREATE OR REPLACE FUNCTION public.save_championship_bracket_draft(
  _championship_id uuid,
  _payload jsonb
)
RETURNS TABLE (
  edition_id uuid,
  status public.bracket_edition_status,
  season_year integer,
  payload_snapshot jsonb,
  updated_at timestamptz,
  updated_by uuid,
  updated_by_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  draft_edition_id uuid;
  championship_current_season_year integer;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para salvar rascunho do chaveamento.';
  END IF;

  SELECT championships_table.current_season_year
  INTO championship_current_season_year
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id
    AND championships_table.status = 'PLANNING'::public.championship_status
  LIMIT 1;

  IF championship_current_season_year IS NULL THEN
    RAISE EXCEPTION 'Campeonato inválido ou fora do status Em breve.';
  END IF;

  SELECT editions_table.id
  INTO draft_edition_id
  FROM public.championship_bracket_editions AS editions_table
  WHERE editions_table.championship_id = _championship_id
    AND editions_table.season_year = championship_current_season_year
    AND editions_table.status = 'DRAFT'::public.bracket_edition_status
  ORDER BY editions_table.updated_at DESC, editions_table.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF draft_edition_id IS NULL THEN
    INSERT INTO public.championship_bracket_editions (
      championship_id,
      season_year,
      status,
      payload_snapshot,
      created_by,
      updated_by
    ) VALUES (
      _championship_id,
      championship_current_season_year,
      'DRAFT'::public.bracket_edition_status,
      COALESCE(_payload, '{}'::jsonb),
      auth.uid(),
      auth.uid()
    )
    RETURNING id INTO draft_edition_id;
  ELSE
    UPDATE public.championship_bracket_editions AS editions_table
    SET
      payload_snapshot = COALESCE(_payload, '{}'::jsonb),
      updated_at = now(),
      updated_by = auth.uid()
    WHERE editions_table.id = draft_edition_id;
  END IF;

  RETURN QUERY
  SELECT
    editions_table.id AS edition_id,
    editions_table.status,
    editions_table.season_year,
    editions_table.payload_snapshot,
    editions_table.updated_at,
    editions_table.updated_by,
    admin_users_table.name AS updated_by_name
  FROM public.championship_bracket_editions AS editions_table
  LEFT JOIN public.admin_user_profiles AS admin_users_table
    ON admin_users_table.user_id = editions_table.updated_by
  WHERE editions_table.id = draft_edition_id
  LIMIT 1;
END;
$func$;

DO $rewrite$
DECLARE
  function_signature regprocedure;
  current_function_definition text;
  next_function_definition text;
BEGIN
  function_signature := to_regprocedure('public.generate_championship_bracket_groups(uuid, jsonb)');

  IF function_signature IS NULL THEN
    RAISE EXCEPTION 'Função public.generate_championship_bracket_groups(uuid, jsonb) não encontrada.';
  END IF;

  SELECT pg_get_functiondef(function_signature)
  INTO current_function_definition;

  next_function_definition := regexp_replace(
    current_function_definition,
    $pattern$INSERT INTO public\.championship_bracket_editions \([\s\S]*?RETURNING id INTO bracket_edition_id;$pattern$,
    $replacement$SELECT editions_table.id
  INTO bracket_edition_id
  FROM public.championship_bracket_editions AS editions_table
  WHERE editions_table.championship_id = _championship_id
    AND editions_table.season_year = championship_current_season_year
    AND editions_table.status = 'DRAFT'::public.bracket_edition_status
  ORDER BY editions_table.updated_at DESC, editions_table.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF bracket_edition_id IS NULL THEN
    INSERT INTO public.championship_bracket_editions (
      championship_id,
      season_year,
      status,
      payload_snapshot,
      created_by,
      updated_by
    ) VALUES (
      _championship_id,
      championship_current_season_year,
      'DRAFT'::public.bracket_edition_status,
      COALESCE(_payload, '{}'::jsonb),
      auth.uid(),
      auth.uid()
    )
    RETURNING id INTO bracket_edition_id;
  ELSE
    UPDATE public.championship_bracket_editions AS editions_table
    SET
      payload_snapshot = COALESCE(_payload, '{}'::jsonb),
      updated_at = now(),
      updated_by = auth.uid()
    WHERE editions_table.id = bracket_edition_id;
  END IF;$replacement$,
    'g'
  );

  IF next_function_definition = current_function_definition THEN
    RAISE EXCEPTION 'Não foi possível atualizar a função public.generate_championship_bracket_groups(uuid, jsonb) para reaproveitar rascunho existente.';
  END IF;

  EXECUTE next_function_definition;
END;
$rewrite$;

GRANT EXECUTE ON FUNCTION public.get_championship_bracket_draft(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_championship_bracket_draft(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
