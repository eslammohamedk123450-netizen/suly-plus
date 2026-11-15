CREATE OR REPLACE FUNCTION private.is_store_creator(target_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.stores s
    WHERE s.id = target_store_id
      AND s.created_by = (SELECT auth.uid())
  );
$function$;

REVOKE ALL ON FUNCTION private.is_store_creator(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_store_creator(uuid) TO authenticated;

DROP POLICY IF EXISTS members_owner_add_self ON public.store_members;
CREATE POLICY members_owner_add_self ON public.store_members
FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND role = 'owner'::public.store_role
  AND private.is_store_creator(store_members.store_id)
);
