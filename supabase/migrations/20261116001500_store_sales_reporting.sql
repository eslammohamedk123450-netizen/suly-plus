create or replace function public.get_store_sales_report(
  p_store_id uuid,
  p_from_date date,
  p_to_date date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_timezone text;
  v_from timestamptz;
  v_until timestamptz;
  v_result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if p_store_id is null or p_from_date is null or p_to_date is null
     or p_to_date < p_from_date or p_to_date - p_from_date > 365 then
    raise exception 'Invalid report period';
  end if;

  if not exists (
    select 1 from public.store_members sm
    where sm.store_id = p_store_id
      and sm.user_id = (select auth.uid())
      and sm.role in ('owner','admin','manager')
  ) then
    raise exception 'Not authorized to view financial reports';
  end if;

  select coalesce(nullif(s.timezone, ''), 'UTC')
  into v_timezone
  from public.stores s
  where s.id = p_store_id;
  if v_timezone is null then
    raise exception 'Store not found';
  end if;

  v_from := p_from_date::timestamp at time zone v_timezone;
  v_until := (p_to_date + 1)::timestamp at time zone v_timezone;

  with period_orders as (
    select o.*,
      (o.created_at at time zone v_timezone)::date as local_day
    from public.orders o
    where o.store_id = p_store_id
      and o.created_at >= v_from
      and o.created_at < v_until
  ),
  day_totals as (
    select local_day as day,
      count(*)::integer as orders_count,
      count(*) filter (where payment_status = 'paid')::integer as paid_orders_count,
      coalesce(sum(total) filter (where payment_status = 'paid'), 0) as sales_collected
    from period_orders
    group by local_day
  ),
  status_totals as (
    select status::text as status, count(*)::integer as count
    from period_orders
    group by status
  ),
  payment_totals as (
    select payment_status::text as status, count(*)::integer as count
    from period_orders
    group by payment_status
  )
  select jsonb_build_object(
    'from_date', p_from_date,
    'to_date', p_to_date,
    'timezone', v_timezone,
    'orders_count', (select count(*) from period_orders),
    'paid_orders_count', (select count(*) from period_orders where payment_status = 'paid'),
    'sales_collected', coalesce((select sum(total) from period_orders where payment_status = 'paid'), 0),
    'refunds_total', coalesce((select sum(total) from period_orders where payment_status = 'refunded'), 0),
    'outstanding_total', coalesce((select sum(total) from period_orders where payment_status in ('unpaid','pending')), 0),
    'average_paid_order', coalesce((select avg(total) from period_orders where payment_status = 'paid'), 0),
    'cancelled_orders_count', (select count(*) from period_orders where status = 'cancelled'),
    'status_counts', coalesce((select jsonb_object_agg(status, count) from status_totals), '{}'::jsonb),
    'payment_counts', coalesce((select jsonb_object_agg(status, count) from payment_totals), '{}'::jsonb),
    'daily_sales', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', day,
        'orders_count', orders_count,
        'paid_orders_count', paid_orders_count,
        'sales_collected', sales_collected
      ) order by day)
      from day_totals
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.get_store_sales_report(uuid,date,date) from public, anon;
grant execute on function public.get_store_sales_report(uuid,date,date) to authenticated;
