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

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.admin_panel_tab'::regtype
      AND enumlabel = 'championship_status'
  ) THEN
    ALTER TYPE public.admin_panel_tab ADD VALUE 'championship_status';
  END IF;
END
$$;
