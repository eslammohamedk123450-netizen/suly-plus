create or replace function public.update_order_fulfillment_status(
  p_store_id uuid,
  p_order_id uuid,
  p_new_status public.order_status,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_store_id is null or p_order_id is null or p_new_status is null then
    raise exception 'Invalid order status request';
  end if;
  if p_note is not null and length(trim(p_note)) > 500 then
    raise exception 'Note must be 500 characters or fewer';
  end if;

  -- Match the existing orders UPDATE RLS policy: staff can read, but only
  -- owners/admins/managers may change fulfillment state.
  if not exists (
    select 1 from public.store_members sm
    where sm.store_id = p_store_id
      and sm.user_id = v_user_id
      and sm.role in ('owner','admin','manager')
  ) then
    raise exception 'Not authorized to manage orders';
  end if;

  select * into v_order
  from public.orders o
  where o.id = p_order_id and o.store_id = p_store_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.status = p_new_status then
    return jsonb_build_object('order_id', v_order.id, 'status', v_order.status, 'unchanged', true);
  end if;

  if not (
    (v_order.status = 'pending' and p_new_status in ('confirmed','cancelled'))
    or (v_order.status = 'confirmed' and p_new_status in ('processing','cancelled'))
    or (v_order.status = 'processing' and p_new_status in ('shipped','cancelled'))
    or (v_order.status = 'shipped' and p_new_status = 'delivered')
  ) then
    raise exception 'Invalid order status transition';
  end if;

  if p_new_status = 'cancelled' and v_order.payment_status not in ('unpaid','failed') then
    raise exception 'Only unpaid or failed-payment orders can be cancelled here';
  end if;

  perform set_config('suly.order_status_note', coalesce(nullif(trim(p_note), ''), ''), true);

  update public.orders
  set status = p_new_status,
      updated_at = now()
  where id = p_order_id and store_id = p_store_id
  returning * into v_order;

  return jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'status', v_order.status,
    'payment_status', v_order.payment_status,
    'updated_at', v_order.updated_at
  );
end;
$function$;

revoke all on function public.update_order_fulfillment_status(uuid,uuid,public.order_status,text) from public, anon;
grant execute on function public.update_order_fulfillment_status(uuid,uuid,public.order_status,text) to authenticated;
