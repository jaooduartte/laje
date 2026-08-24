ALTER TYPE public.admin_panel_tab ADD VALUE IF NOT EXISTS 'opening_ceremony_bonus';

NOTIFY pgrst, 'reload schema';
