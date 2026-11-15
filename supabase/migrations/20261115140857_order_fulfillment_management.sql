create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  order_id uuid not null,
  previous_status public.order_status not null,
  new_status public.order_status not null,
  note text,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint order_status_history_order_fk
    foreign key (store_id, order_id)
    references public.orders(store_id, id) on delete cascade,
  constraint order_status_history_note_length
    check (note is null or length(note) <= 500)
);

create index if not exists order_status_history_store_order_created_idx
  on public.order_status_history (store_id, order_id, created_at desc);

alter table public.order_status_history enable row level security;
revoke all on public.order_status_history from public, anon, authenticated;
grant select on public.order_status_history to authenticated;

drop policy if exists "store members read order status history" on public.order_status_history;
create policy "store members read order status history"
  on public.order_status_history for select to authenticated
  using (
    exists (
      select 1 from public.store_members sm
      where sm.store_id = order_status_history.store_id
        and sm.user_id = (select auth.uid())
    )
  );

create or replace function private.record_order_status_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status is distinct from old.status then
    insert into public.order_status_history(
      store_id, order_id, previous_status, new_status, note, changed_by
    ) values (
      new.store_id, new.id, old.status, new.status,
      nullif(current_setting('suly.order_status_note', true), ''),
      (select auth.uid())
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists record_order_status_history on public.orders;
create trigger record_order_status_history
  after update of status on public.orders
  for each row execute function private.record_order_status_history();

create or replace function public.update_order_fulfillment_status(
  p_store_id uuid,
  p_order_id uuid,
  p_new_status public.order_status,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
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

  if not exists (
    select 1 from public.store_members sm
    where sm.store_id = p_store_id
      and sm.user_id = v_user_id
      and sm.role in ('owner','admin','manager','staff')
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
