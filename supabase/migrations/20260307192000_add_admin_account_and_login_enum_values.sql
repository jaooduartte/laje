DO $migration_admin_account_tab_enum$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type AS types_table
    WHERE types_table.typnamespace = 'public'::regnamespace
      AND types_table.typname = 'admin_panel_tab'
  ) THEN
    RAISE EXCEPTION 'Enum public.admin_panel_tab não encontrado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum AS enums_table
    WHERE enums_table.enumtypid = 'public.admin_panel_tab'::regtype
      AND enums_table.enumlabel = 'account'
  ) THEN
    ALTER TYPE public.admin_panel_tab ADD VALUE 'account';
  END IF;
END;
$migration_admin_account_tab_enum$;

DO $migration_admin_login_action_enum$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type AS types_table
    WHERE types_table.typnamespace = 'public'::regnamespace
      AND types_table.typname = 'admin_action_type'
  ) THEN
    RAISE EXCEPTION 'Enum public.admin_action_type não encontrado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum AS enums_table
    WHERE enums_table.enumtypid = 'public.admin_action_type'::regtype
      AND enums_table.enumlabel = 'LOGIN'
  ) THEN
    ALTER TYPE public.admin_action_type ADD VALUE 'LOGIN';
  END IF;
END;
$migration_admin_login_action_enum$;

NOTIFY pgrst, 'reload schema';
