REVOKE SELECT ON public.products FROM anon;
GRANT SELECT (
  id,
  store_id,
  category_id,
  name,
  slug,
  description,
  sku,
  status,
  price,
  currency,
  stock_quantity,
  track_inventory,
  images,
  created_at,
  updated_at
) ON public.products TO anon;
