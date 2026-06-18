-- Disable public participant registration from browser clients.
-- Existing participants can still be read/used by the app. New participants
-- must be created by an operator through Supabase Dashboard or a trusted
-- service-role backend flow.

ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

REVOKE INSERT ON public.participants FROM anon;
REVOKE INSERT ON public.participants FROM authenticated;

DROP POLICY IF EXISTS "Block public participant creation" ON public.participants;

CREATE POLICY "Block public participant creation"
  ON public.participants
  AS RESTRICTIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);
