-- Fix store-scoped RLS predicates and restore least-privilege client grants.

DROP POLICY IF EXISTS categories_members_delete ON public.categories;
CREATE POLICY categories_members_delete ON public.categories FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.store_members sm WHERE sm.store_id = categories.store_id AND sm.user_id = (SELECT auth.uid()) AND sm.role IN ('owner'::public.store_role,'admin'::public.store_role,'manager'::public.store_role)));

DROP POLICY IF EXISTS categories_members_insert ON public.categories;
CREATE POLICY categories_members_insert ON public.categories FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.store_members sm WHERE sm.store_id = categories.store_id AND sm.user_id = (SELECT auth.uid()) AND sm.role IN ('owner'::public.store_role,'admin'::public.store_role,'manager'::public.store_role)));

DROP POLICY IF EXISTS categories_members_update ON public.categories;
CREATE POLICY categories_members_update ON public.categories FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.store_members sm WHERE sm.store_id = categories.store_id AND sm.user_id = (SELECT auth.uid()) AND sm.role IN ('owner'::public.store_role,'admin'::public.store_role,'manager'::public.store_role)))
WITH CHECK (EXISTS (SELECT 1 FROM public.store_members sm WHERE sm.store_id = categories.store_id AND sm.user_id = (SELECT auth.uid()) AND sm.role IN ('owner'::public.store_role,'admin'::public.store_role,'manager'::public.store_role)));

DROP POLICY IF EXISTS categories_read_public_or_member ON public.categories;
CREATE POLICY categories_read_public_or_member ON public.categories FOR SELECT TO anon, authenticated
USING (((is_active AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = categories.store_id AND s.is_active = true))
 OR EXISTS (SELECT 1 FROM public.store_members sm WHERE sm.store_id = categories.store_id AND sm.user_id = (SELECT auth.uid()))));

DROP POLICY IF EXISTS customers_members_all ON public.customers;
CREATE POLICY customers_members_all ON public.customers FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.store_members sm WHERE sm.store_id = customers.store_id AND sm.user_id = (SELECT auth.uid()) AND sm.role IN ('owner'::public.store_role,'admin'::public.store_role,'manager'::public.store_role,'staff'::public.store_role)))
WITH CHECK (EXISTS (SELECT 1 FROM public.store_members sm WHERE sm.store_id = customers.store_id AND sm.user_id = (SELECT auth.uid()) AND sm.role IN ('owner'::public.store_role,'admin'::public.store_role,'manager'::public.store_role,'staff'::public.store_role)));

DROP POLICY IF EXISTS inventory_members_read ON public.inventory_movements;
CREATE POLICY inventory_members_read ON public.inventory_movements FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.store_members sm WHERE sm.store_id = inventory_movements.store_id AND sm.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS inventory_managers_insert ON public.inventory_movements;
CREATE POLICY inventory_managers_insert ON public.inventory_movements FOR INSERT TO authenticated
WITH CHECK (created_by = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.store_members sm WHERE sm.store_id = inventory_movements.store_id AND sm.user_id = (SELECT auth.uid()) AND sm.role IN ('owner'::public.store_role,'admin'::public.store_role,'manager'::public.store_role)));

DROP POLICY IF EXISTS variants_members_delete ON public.product_variants;
CREATE POLICY variants_members_delete ON public.product_variants FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.store_members sm WHERE sm.store_id = product_variants.store_id AND sm.user_id = (SELECT auth.uid()) AND sm.role IN ('owner'::public.store_role,'admin'::public.store_role,'manager'::public.store_role)));

DROP POLICY IF EXISTS variants_members_insert ON public.product_variants;
CREATE POLICY variants_members_insert ON public.product_variants FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.store_members sm WHERE sm.store_id = product_variants.store_id AND sm.user_id = (SELECT auth.uid()) AND sm.role IN ('owner'::public.store_role,'admin'::public.store_role,'manager'::public.store_role)));

DROP POLICY IF EXISTS variants_members_update ON public.product_variants;
CREATE POLICY variants_members_update ON public.product_variants FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.store_members sm WHERE sm.store_id = product_variants.store_id AND sm.user_id = (SELECT auth.uid()) AND sm.role IN ('owner'::public.store_role,'admin'::public.store_role,'manager'::public.store_role)))
WITH CHECK (EXISTS (SELECT 1 FROM public.store_members sm WHERE sm.store_id = product_variants.store_id AND sm.user_id = (SELECT auth.uid()) AND sm.role IN ('owner'::public.store_role,'admin'::public.store_role,'manager'::public.store_role)));

DROP POLICY IF EXISTS variants_read_public_or_member ON public.product_variants;
CREATE POLICY variants_read_public_or_member ON public.product_variants FOR SELECT TO anon, authenticated
USING (
  (EXISTS (SELECT 1 FROM public.products p JOIN public.stores s ON s.id = p.store_id
   WHERE p.id = product_variants.product_id AND p.store_id = product_variants.store_id
   AND p.status = 'active'::public.product_status AND s.is_active = true))
  OR EXISTS (SELECT 1 FROM public.store_members sm WHERE sm.store_id = product_variants.store_id AND sm.user_id = (SELECT auth.uid()))
);

DROP POLICY IF EXISTS products_members_delete ON public.products;
CREATE POLICY products_members_delete ON public.products FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.store_members sm WHERE sm.store_id = products.store_id AND sm.user_id = (SELECT auth.uid()) AND sm.role IN ('owner'::public.store_role,'admin'::public.store_role)));

DROP POLICY IF EXISTS products_members_insert ON public.products;
CREATE POLICY products_members_insert ON public.products FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.store_members sm WHERE sm.store_id = products.store_id AND sm.user_id = (SELECT auth.uid()) AND sm.role IN ('owner'::public.store_role,'admin'::public.store_role,'manager'::public.store_role)));

DROP POLICY IF EXISTS products_members_update ON public.products;
CREATE POLICY products_members_update ON public.products FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.store_members sm WHERE sm.store_id = products.store_id AND sm.user_id = (SELECT auth.uid()) AND sm.role IN ('owner'::public.store_role,'admin'::public.store_role,'manager'::public.store_role)))
WITH CHECK (EXISTS (SELECT 1 FROM public.store_members sm WHERE sm.store_id = products.store_id AND sm.user_id = (SELECT auth.uid()) AND sm.role IN ('owner'::public.store_role,'admin'::public.store_role,'manager'::public.store_role)));

DROP POLICY IF EXISTS products_read_public_or_member ON public.products;
CREATE POLICY products_read_public_or_member ON public.products FOR SELECT TO anon, authenticated
USING (((status = 'active'::public.product_status AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = products.store_id AND s.is_active = true))
 OR EXISTS (SELECT 1 FROM public.store_members sm WHERE sm.store_id = products.store_id AND sm.user_id = (SELECT auth.uid()))));

DROP POLICY IF EXISTS settings_members_all ON public.store_settings;
CREATE POLICY settings_members_all ON public.store_settings FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.store_members sm WHERE sm.store_id = store_settings.store_id AND sm.user_id = (SELECT auth.uid()) AND sm.role IN ('owner'::public.store_role,'admin'::public.store_role,'manager'::public.store_role)))
WITH CHECK (EXISTS (SELECT 1 FROM public.store_members sm WHERE sm.store_id = store_settings.store_id AND sm.user_id = (SELECT auth.uid()) AND sm.role IN ('owner'::public.store_role,'admin'::public.store_role,'manager'::public.store_role)));

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
GRANT SELECT ON public.stores, public.categories, public.products, public.product_variants TO anon;

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.stores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT SELECT ON public.customers, public.orders, public.order_items, public.inventory_movements, public.payment_transactions TO authenticated;

-- These defaults apply to objects created by the current migration owner (postgres).
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_store(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_product(uuid, text, text, text, public.product_status, numeric, text, integer, text, text[]) TO authenticated;
