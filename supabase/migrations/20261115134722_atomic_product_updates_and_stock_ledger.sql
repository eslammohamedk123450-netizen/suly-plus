CREATE OR REPLACE FUNCTION public.update_product(
  p_store_id uuid,
  p_product_id uuid,
  p_variant_id uuid,
  p_name text,
  p_slug text,
  p_description text,
  p_status public.product_status,
  p_price numeric,
  p_stock_quantity integer,
  p_sku text DEFAULT NULL,
  p_images text[] DEFAULT '{}'::text[]
)
RETURNS public.products
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_old_stock integer;
  v_updated_product public.products;
  v_variant_rows integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_store_id IS NULL OR p_product_id IS NULL OR p_variant_id IS NULL
     OR length(trim(coalesce(p_name,''))) < 1
     OR length(trim(p_name)) > 120
     OR length(trim(coalesce(p_slug,''))) < 1
     OR length(trim(p_slug)) > 160
     OR p_price IS NULL OR p_price <= 0
     OR p_stock_quantity IS NULL OR p_stock_quantity < 0
     OR p_description IS NOT NULL AND length(p_description) > 5000
     OR p_status IS NULL THEN
    RAISE EXCEPTION 'Invalid product data';
  END IF;

  SELECT p.stock_quantity INTO v_old_stock
  FROM public.products p
  WHERE p.id = p_product_id AND p.store_id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  UPDATE public.products
  SET name = trim(p_name),
      slug = lower(trim(p_slug)),
      description = nullif(trim(coalesce(p_description,'')), ''),
      status = p_status,
      price = p_price,
      stock_quantity = p_stock_quantity,
      sku = nullif(trim(coalesce(p_sku,'')), ''),
      images = coalesce(p_images, '{}'::text[]),
      updated_at = now()
  WHERE id = p_product_id AND store_id = p_store_id
  RETURNING * INTO v_updated_product;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to update this product';
  END IF;

  UPDATE public.product_variants
  SET name = trim(p_name),
      price = p_price,
      stock_quantity = p_stock_quantity,
      sku = nullif(trim(coalesce(p_sku,'')), ''),
      updated_at = now()
  WHERE id = p_variant_id
    AND store_id = p_store_id
    AND product_id = p_product_id;

  GET DIAGNOSTICS v_variant_rows = ROW_COUNT;
  IF v_variant_rows <> 1 THEN
    RAISE EXCEPTION 'The selected product variant was not found';
  END IF;

  IF p_stock_quantity <> v_old_stock THEN
    INSERT INTO public.inventory_movements (
      store_id, product_id, variant_id, quantity_delta, reason, created_by
    )
    VALUES (
      p_store_id, p_product_id, p_variant_id,
      p_stock_quantity - v_old_stock, 'product_edit', (SELECT auth.uid())
    );
  END IF;

  RETURN v_updated_product;
END;
$function$;

GRANT INSERT ON public.inventory_movements TO authenticated;
REVOKE ALL ON FUNCTION public.update_product(uuid, uuid, uuid, text, text, text, public.product_status, numeric, integer, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_product(uuid, uuid, uuid, text, text, text, public.product_status, numeric, integer, text, text[]) TO authenticated;
