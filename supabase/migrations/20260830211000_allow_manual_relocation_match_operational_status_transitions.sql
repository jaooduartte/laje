CREATE OR REPLACE FUNCTION public.prevent_manual_schedule_override_rewrite()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.is_manual_schedule_override
    AND COALESCE(current_setting('app.allow_manual_schedule_override_update', true), 'false') <> 'true'
    AND (
      NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
      OR NEW.location IS DISTINCT FROM OLD.location
      OR NEW.court_name IS DISTINCT FROM OLD.court_name
      OR NEW.queue_position IS DISTINCT FROM OLD.queue_position
      OR NEW.scheduled_slot IS DISTINCT FROM OLD.scheduled_slot
      OR (
        NEW.start_time IS DISTINCT FROM OLD.start_time
        AND NOT (
          (OLD.status = 'SCHEDULED'::public.match_status AND NEW.status = 'LIVE'::public.match_status)
          OR (OLD.status = 'FINISHED'::public.match_status AND NEW.status = 'LIVE'::public.match_status)
        )
      )
      OR (
        NEW.end_time IS DISTINCT FROM OLD.end_time
        AND NOT (
          (OLD.status = 'SCHEDULED'::public.match_status AND NEW.status = 'LIVE'::public.match_status)
          OR (OLD.status = 'LIVE'::public.match_status AND NEW.status = 'FINISHED'::public.match_status)
          OR (OLD.status = 'FINISHED'::public.match_status AND NEW.status = 'LIVE'::public.match_status)
        )
      )
    ) THEN
    RAISE EXCEPTION 'A agenda deste jogo é uma realocação manual protegida.';
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
