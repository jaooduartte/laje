-- Split from the permission backfill migration because PostgreSQL does not
-- allow using new enum values in the same transaction where they are created.

ALTER TYPE public.admin_panel_tab ADD VALUE IF NOT EXISTS 'standings';
ALTER TYPE public.admin_panel_tab ADD VALUE IF NOT EXISTS 'championship_schedule';

NOTIFY pgrst, 'reload schema';
