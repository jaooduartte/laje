-- Fix: ensure the anon role is included in the INSERT policy for league_event_reservation_requests.
--
-- The original migration used ALTER POLICY when the policy already existed,
-- but ALTER POLICY without a TO clause does not update the roles.
-- This migration explicitly sets TO anon, authenticated on the INSERT policy.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_event_reservation_requests'
      AND policyname = 'Public can create league event reservation requests'
  ) THEN
    ALTER POLICY "Public can create league event reservation requests"
      ON public.league_event_reservation_requests
      TO anon, authenticated
      WITH CHECK (
        status = 'PENDING'::public.league_event_reservation_request_status
        AND approved_league_event_id IS NULL
        AND reviewed_at IS NULL
        AND reviewed_by IS NULL
      );
  ELSE
    CREATE POLICY "Public can create league event reservation requests"
      ON public.league_event_reservation_requests
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (
        status = 'PENDING'::public.league_event_reservation_request_status
        AND approved_league_event_id IS NULL
        AND reviewed_at IS NULL
        AND reviewed_by IS NULL
      );
  END IF;
END
$$;

GRANT INSERT ON public.league_event_reservation_requests TO anon;
