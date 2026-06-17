-- Run in Supabase SQL Editor to enable manager inquiry deletes.

-- Secure RPC: only signed-in managers can delete.
CREATE OR REPLACE FUNCTION public.delete_inquiry_manager(inquiry_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;

  DELETE FROM public.inquiries WHERE id = inquiry_id;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_inquiry_manager(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_inquiry_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_inquiry_manager(uuid) TO service_role;

DROP POLICY IF EXISTS "Authenticated managers can delete inquiries" ON public.inquiries;
CREATE POLICY "Authenticated managers can delete inquiries"
  ON public.inquiries
  FOR DELETE
  TO authenticated
  USING (true);

GRANT DELETE ON TABLE public.inquiries TO authenticated;

-- Ensure public inquiry submissions work with publishable/anon keys.
DROP POLICY IF EXISTS "Anyone can submit an inquiry" ON public.inquiries;
CREATE POLICY "Anyone can submit an inquiry"
  ON public.inquiries
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
