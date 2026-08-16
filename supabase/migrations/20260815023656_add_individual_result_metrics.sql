ALTER TYPE public.championship_individual_entry_status
  ADD VALUE IF NOT EXISTS 'WALKOVER';

ALTER TABLE public.championship_individual_event_entries
  ADD COLUMN IF NOT EXISTS result_time_milliseconds INTEGER,
  ADD COLUMN IF NOT EXISTS result_mark_centimeters INTEGER,
  ADD CONSTRAINT championship_individual_event_entries_result_time_milliseconds_check
    CHECK (result_time_milliseconds IS NULL OR result_time_milliseconds >= 0),
  ADD CONSTRAINT championship_individual_event_entries_result_mark_centimeters_check
    CHECK (result_mark_centimeters IS NULL OR result_mark_centimeters >= 0);
