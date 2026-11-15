revoke insert, update on table public.store_coupons from authenticated;

grant insert (
  store_id,
  code,
  discount_type,
  discount_value,
  minimum_subtotal,
  max_uses,
  starts_at,
  expires_at,
  is_active
) on table public.store_coupons to authenticated;

grant update (
  code,
  discount_type,
  discount_value,
  minimum_subtotal,
  max_uses,
  starts_at,
  expires_at,
  is_active,
  updated_at
) on table public.store_coupons to authenticated;
