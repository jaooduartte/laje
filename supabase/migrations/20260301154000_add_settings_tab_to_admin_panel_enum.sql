DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'admin_panel_tab'
  ) THEN
    RAISE EXCEPTION 'Enum public.admin_panel_tab não encontrado.';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.admin_panel_tab'::regtype
      AND enumlabel = 'settings'
  ) THEN
    ALTER TYPE public.admin_panel_tab ADD VALUE 'settings';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
