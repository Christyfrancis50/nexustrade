-- Supabase security advisor: SECURITY DEFINER functions in `public` are callable
-- through the REST API (/rest/v1/rpc/...). Move the role helper used by RLS
-- policies into a `private` schema that the API does not expose.
CREATE SCHEMA IF NOT EXISTS private;
--> statement-breakpoint
REVOKE ALL ON SCHEMA private FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA private TO authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.profiles WHERE id = (SELECT auth.uid())
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION private.current_user_role() FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.current_user_role() TO authenticated;
--> statement-breakpoint
-- Supabase security advisor: keep extensions out of the exposed `public` schema.
CREATE SCHEMA IF NOT EXISTS extensions;
--> statement-breakpoint
ALTER EXTENSION vector SET SCHEMA extensions;
