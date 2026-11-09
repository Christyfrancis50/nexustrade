-- Policies now use private.current_user_role() (0009); remove the API-exposed copy.
DROP FUNCTION IF EXISTS public.current_user_role();
