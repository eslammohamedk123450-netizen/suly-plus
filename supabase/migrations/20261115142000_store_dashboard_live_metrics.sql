create or replace function public.get_store_dashboard_summary(p_store_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'orders_count', (select count(*) from public.orders o where o.store_id = p_store_id),
    'sales_collected', coalesce((
      select sum(o.total) from public.orders o
      where o.store_id = p_store_id and o.payment_status = 'paid'
    ), 0),
    'products_count', (
      select count(*) from public.products p where p.store_id = p_store_id and p.status <> 'archived'
    ),
    'customers_count', (select count(*) from public.customers c where c.store_id = p_store_id),
    'low_stock_count', (
      select count(*) from public.products p
      where p.store_id = p_store_id and p.track_inventory = true
        and p.status = 'active' and p.stock_quantity <= 5
    ),
    'recent_orders', coalesce((
      select jsonb_agg(to_jsonb(recent) order by recent.created_at desc)
      from (
        select o.id, o.order_number, o.customer_name, o.total, o.currency,
               o.status, o.payment_status, o.created_at
        from public.orders o where o.store_id = p_store_id
        order by o.created_at desc limit 5
      ) recent
    ), '[]'::jsonb)
  )
  where p_store_id is not null
    and (select auth.uid()) is not null
    and exists (
      select 1 from public.store_members sm
      where sm.store_id = p_store_id and sm.user_id = (select auth.uid())
    );
$function$;

revoke all on function public.get_store_dashboard_summary(uuid) from public, anon;
grant execute on function public.get_store_dashboard_summary(uuid) to authenticated;
