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

ALTER TYPE public.admin_panel_tab ADD VALUE IF NOT EXISTS 'links' AFTER 'events';

NOTIFY pgrst, 'reload schema';
