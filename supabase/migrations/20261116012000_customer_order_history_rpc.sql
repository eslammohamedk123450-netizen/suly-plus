create or replace function public.get_customer_orders_by_email(
  p_email text,
  p_limit integer default 50
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    jsonb_agg(to_jsonb(order_row) order by order_row.created_at desc),
    '[]'::jsonb
  )
  from (
    select
      o.id,
      o.order_number,
      o.status::text as status,
      o.payment_status::text as payment_status,
      o.payment_method,
      o.currency,
      o.subtotal,
      o.discount_total,
      o.shipping_total,
      o.tax_total,
      o.total,
      o.created_at,
      s.name as store_name,
      s.slug as store_slug,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total_price', oi.total_price
          )
          order by oi.created_at asc
        )
        from public.order_items oi
        where oi.order_id = o.id and oi.store_id = o.store_id
      ), '[]'::jsonb) as items
    from public.orders o
    join public.stores s on s.id = o.store_id
    where p_email is not null
      and length(trim(p_email)) between 3 and 254
      and lower(o.customer_email) = lower(trim(p_email))
    order by o.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 50))
  ) as order_row;
$function$;

revoke all on function public.get_customer_orders_by_email(text,integer) from public, anon, authenticated;
grant execute on function public.get_customer_orders_by_email(text,integer) to service_role;
