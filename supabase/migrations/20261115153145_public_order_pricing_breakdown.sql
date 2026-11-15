create or replace function public.get_public_order(p_order_number bigint, p_public_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'order_number', o.order_number,
    'status', o.status,
    'payment_status', o.payment_status,
    'payment_method', o.payment_method,
    'currency', o.currency,
    'subtotal', o.subtotal,
    'discount_total', o.discount_total,
    'shipping_total', o.shipping_total,
    'tax_total', o.tax_total,
    'coupon_code', o.coupon_code,
    'total', o.total,
    'created_at', o.created_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', oi.product_name,
        'quantity', oi.quantity,
        'total_price', oi.total_price
      ) order by oi.created_at)
      from public.order_items oi
      where oi.store_id = o.store_id and oi.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  where o.order_number = p_order_number
    and o.public_token = p_public_token;
$function$;
