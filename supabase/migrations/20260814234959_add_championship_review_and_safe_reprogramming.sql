ALTER TYPE public.championship_status ADD VALUE IF NOT EXISTS 'REVIEW' AFTER 'UPCOMING';

NOTIFY pgrst, 'reload schema';
