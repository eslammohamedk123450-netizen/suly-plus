CREATE OR REPLACE FUNCTION public.adjust_product_stock(
  p_store_id uuid,
  p_product_id uuid,
  p_variant_id uuid,
  p_quantity_delta integer
)
RETURNS public.products
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_old_stock integer;
  v_variant_stock integer;
  v_updated_product public.products;
  v_variant_count integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_store_id IS NULL OR p_product_id IS NULL OR p_variant_id IS NULL
     OR p_quantity_delta IS NULL OR p_quantity_delta = 0
     OR abs(p_quantity_delta) > 100000 THEN
    RAISE EXCEPTION 'Invalid inventory adjustment';
  END IF;

  SELECT p.stock_quantity
  INTO v_old_stock
  FROM public.products p
  WHERE p.id = p_product_id
    AND p.store_id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  SELECT count(*)
  INTO v_variant_count
  FROM public.product_variants pv
  WHERE pv.store_id = p_store_id
    AND pv.product_id = p_product_id;

  IF v_variant_count <> 1 THEN
    RAISE EXCEPTION 'Manual stock adjustment currently supports products with one variant';
  END IF;

  SELECT pv.stock_quantity
  INTO v_variant_stock
  FROM public.product_variants pv
  WHERE pv.id = p_variant_id
    AND pv.store_id = p_store_id
    AND pv.product_id = p_product_id
  FOR UPDATE;

  IF NOT FOUND OR v_variant_stock <> v_old_stock THEN
    RAISE EXCEPTION 'Product and variant stock are inconsistent';
  END IF;

  IF v_old_stock + p_quantity_delta < 0 THEN
    RAISE EXCEPTION 'Insufficient stock for this adjustment';
  END IF;

  UPDATE public.products
  SET stock_quantity = v_old_stock + p_quantity_delta,
      updated_at = now()
  WHERE id = p_product_id
    AND store_id = p_store_id
  RETURNING * INTO v_updated_product;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to adjust this product';
  END IF;

  UPDATE public.product_variants
  SET stock_quantity = v_variant_stock + p_quantity_delta,
      updated_at = now()
  WHERE id = p_variant_id
    AND store_id = p_store_id
    AND product_id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variant could not be updated';
  END IF;

  INSERT INTO public.inventory_movements (
    store_id, product_id, variant_id, quantity_delta, reason, created_by
  )
  VALUES (
    p_store_id, p_product_id, p_variant_id, p_quantity_delta,
    'manual_adjustment', (SELECT auth.uid())
  );

  RETURN v_updated_product;
END;
$function$;

REVOKE ALL ON FUNCTION public.adjust_product_stock(uuid, uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(uuid, uuid, uuid, integer) TO authenticated;
