create schema if not exists private;

create table if not exists public.store_coupons (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  code text not null,
  discount_type text not null check (discount_type in ('percentage','fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  minimum_subtotal numeric(12,2) not null default 0 check (minimum_subtotal >= 0),
  max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_coupons_code_format check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,40}$'),
  constraint store_coupons_discount_limit check (
    (discount_type = 'percentage' and discount_value <= 100)
    or discount_type = 'fixed'
  ),
  constraint store_coupons_date_order check (starts_at is null or expires_at is null or expires_at > starts_at),
  constraint store_coupons_store_code_unique unique (store_id, code)
);

create index if not exists store_coupons_active_idx
  on public.store_coupons (store_id, is_active, expires_at);

alter table public.store_coupons enable row level security;

drop policy if exists store_coupons_manager_access on public.store_coupons;
create policy store_coupons_manager_access
on public.store_coupons
for all
to authenticated
using (
  exists (
    select 1 from public.store_members sm
    where sm.store_id = store_coupons.store_id
      and sm.user_id = (select auth.uid())
      and sm.role in ('owner','admin','manager')
  )
)
with check (
  exists (
    select 1 from public.store_members sm
    where sm.store_id = store_coupons.store_id
      and sm.user_id = (select auth.uid())
      and sm.role in ('owner','admin','manager')
  )
);

revoke all on public.store_coupons from public, anon;
grant select, insert, update, delete on public.store_coupons to authenticated;
grant all on public.store_coupons to service_role;

alter table public.orders
  add column if not exists coupon_code text;

create or replace function private.calculate_checkout_totals(
  p_store_id uuid,
  p_subtotal numeric,
  p_coupon_code text,
  p_lock_coupon boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_settings jsonb := '{}'::jsonb;
  v_shipping_fee numeric(12,2) := 0;
  v_free_threshold numeric(12,2) := 0;
  v_tax_rate numeric(7,4) := 0;
  v_discount numeric(12,2) := 0;
  v_shipping numeric(12,2) := 0;
  v_tax numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_coupon public.store_coupons%rowtype;
  v_code text := nullif(upper(trim(coalesce(p_coupon_code,''))), '');
begin
  if p_store_id is null or p_subtotal is null or p_subtotal < 0 then
    raise exception 'Invalid checkout totals input';
  end if;

  select coalesce(ss.settings->'checkout_pricing', '{}'::jsonb)
    into v_settings
  from public.store_settings ss
  where ss.store_id = p_store_id;

  if coalesce(v_settings->>'shipping_fee','') ~ '^[0-9]+([.][0-9]{1,2})?$' then
    v_shipping_fee := (v_settings->>'shipping_fee')::numeric;
  end if;
  if coalesce(v_settings->>'free_shipping_threshold','') ~ '^[0-9]+([.][0-9]{1,2})?$' then
    v_free_threshold := (v_settings->>'free_shipping_threshold')::numeric;
  end if;
  if coalesce(v_settings->>'tax_rate','') ~ '^[0-9]+([.][0-9]{1,4})?$' then
    v_tax_rate := (v_settings->>'tax_rate')::numeric;
  end if;
  if v_tax_rate < 0 or v_tax_rate > 100 then
    raise exception 'Invalid store tax configuration';
  end if;

  if v_code is not null then
    if p_lock_coupon then
      select * into v_coupon
      from public.store_coupons c
      where c.store_id = p_store_id
        and c.code = v_code
        and c.is_active = true
        and (c.starts_at is null or c.starts_at <= now())
        and (c.expires_at is null or c.expires_at > now())
        and (c.max_uses is null or c.used_count < c.max_uses)
      for update;
    else
      select * into v_coupon
      from public.store_coupons c
      where c.store_id = p_store_id
        and c.code = v_code
        and c.is_active = true
        and (c.starts_at is null or c.starts_at <= now())
        and (c.expires_at is null or c.expires_at > now())
        and (c.max_uses is null or c.used_count < c.max_uses);
    end if;

    if not found or p_subtotal < v_coupon.minimum_subtotal then
      raise exception 'Coupon unavailable';
    end if;

    if v_coupon.discount_type = 'percentage' then
      v_discount := round(p_subtotal * v_coupon.discount_value / 100, 2);
    else
      v_discount := least(p_subtotal, v_coupon.discount_value);
    end if;
  end if;

  if v_free_threshold > 0 and p_subtotal >= v_free_threshold then
    v_shipping := 0;
  else
    v_shipping := v_shipping_fee;
  end if;

  v_tax := round((p_subtotal - v_discount) * v_tax_rate / 100, 2);
  v_total := greatest(0, p_subtotal - v_discount + v_shipping + v_tax);

  return jsonb_build_object(
    'subtotal', p_subtotal,
    'discount_total', v_discount,
    'shipping_total', v_shipping,
    'tax_total', v_tax,
    'tax_rate', v_tax_rate,
    'total', v_total,
    'coupon_code', v_code,
    'coupon_id', case when v_code is null then null else v_coupon.id end
  );
end;
$function$;

revoke all on function private.calculate_checkout_totals(uuid,numeric,text,boolean) from public, anon, authenticated;

create or replace function public.get_guest_checkout_quote(
  p_store_slug text,
  p_items jsonb,
  p_coupon_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_store public.stores%rowtype;
  v_item record;
  v_product public.products%rowtype;
  v_quantity integer;
  v_subtotal numeric(12,2) := 0;
  v_quote jsonb;
  v_input jsonb;
begin
  if p_store_slug is null or length(trim(p_store_slug)) < 2 or length(p_store_slug) > 100 then
    raise exception 'Invalid store';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'Invalid cart';
  end if;

  select * into v_store from public.stores s
  where s.slug = lower(trim(p_store_slug)) and s.is_active = true limit 1;
  if not found then raise exception 'Store not found'; end if;

  for v_input in select value from jsonb_array_elements(p_items) as e(value)
  loop
    if coalesce(v_input->>'product_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(v_input->>'quantity','') !~ '^[0-9]{1,3}$' then
      raise exception 'Invalid cart item';
    end if;
    v_quantity := (v_input->>'quantity')::integer;
    if v_quantity < 1 or v_quantity > 100 then raise exception 'Invalid cart quantity'; end if;
  end loop;

  for v_item in
    select (e.value->>'product_id')::uuid as product_id,
           sum((e.value->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) as e(value)
    group by (e.value->>'product_id')::uuid
    order by (e.value->>'product_id')::uuid
  loop
    if v_item.quantity > 100 then raise exception 'Invalid cart quantity'; end if;
    select * into v_product
    from public.products p
    where p.id = v_item.product_id and p.store_id = v_store.id and p.status = 'active';
    if not found then raise exception 'Product unavailable'; end if;
    if v_product.track_inventory and v_product.stock_quantity < v_item.quantity then
      raise exception 'Insufficient stock';
    end if;
    v_subtotal := v_subtotal + v_product.price * v_item.quantity;
  end loop;

  v_quote := private.calculate_checkout_totals(v_store.id, v_subtotal, p_coupon_code, false);
  return v_quote || jsonb_build_object('currency', v_store.currency);
end;
$function$;

revoke all on function public.get_guest_checkout_quote(text,jsonb,text) from public, anon, authenticated;
grant execute on function public.get_guest_checkout_quote(text,jsonb,text) to service_role;

drop function if exists public.create_guest_order_for_payment(text,text,text,text,jsonb,jsonb,text,text);

create function public.create_guest_order_for_payment(
  p_store_slug text,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_shipping_address jsonb,
  p_items jsonb,
  p_notes text,
  p_payment_method text,
  p_coupon_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_order_id uuid;
  v_order public.orders%rowtype;
  v_quote jsonb;
  v_coupon_id uuid;
  v_new_total numeric(12,2);
  v_line_items jsonb;
  v_payment_status public.payment_status;
begin
  if p_payment_method not in ('cash_on_delivery','paymob') then
    raise exception 'Unsupported payment method';
  end if;
  if p_coupon_code is not null and length(trim(p_coupon_code)) > 40 then
    raise exception 'Invalid coupon code';
  end if;

  v_result := public.create_guest_order(
    p_store_slug, p_customer_name, p_customer_email, p_customer_phone,
    p_shipping_address, p_items, p_notes
  );
  v_order_id := (v_result->>'order_id')::uuid;

  select * into v_order from public.orders o where o.id = v_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  v_quote := private.calculate_checkout_totals(v_order.store_id, v_order.subtotal, p_coupon_code, true);
  v_new_total := (v_quote->>'total')::numeric;
  if p_payment_method = 'paymob' and v_new_total <= 0 then
    raise exception 'Electronic payment requires a positive order total';
  end if;
  v_coupon_id := nullif(v_quote->>'coupon_id','')::uuid;

  update public.orders
  set discount_total = (v_quote->>'discount_total')::numeric,
      shipping_total = (v_quote->>'shipping_total')::numeric,
      tax_total = (v_quote->>'tax_total')::numeric,
      total = v_new_total,
      coupon_code = v_quote->>'coupon_code',
      updated_at = now()
  where id = v_order.id;

  if v_new_total <> v_order.total and v_order.customer_id is not null then
    update public.customers
    set total_spent = greatest(0, total_spent + (v_new_total - v_order.total)),
        updated_at = now()
    where id = v_order.customer_id and store_id = v_order.store_id;
  end if;

  if v_coupon_id is not null then
    update public.store_coupons
    set used_count = used_count + 1, updated_at = now()
    where id = v_coupon_id
      and store_id = v_order.store_id
      and (max_uses is null or used_count < max_uses);
    if not found then raise exception 'Coupon unavailable'; end if;
  end if;

  v_payment_status := case when p_payment_method = 'paymob'
    then 'pending'::public.payment_status
    else 'unpaid'::public.payment_status end;

  update public.orders
  set payment_method = p_payment_method,
      payment_status = v_payment_status,
      updated_at = now()
  where id = v_order.id;

  update public.payment_transactions
  set provider = p_payment_method,
      amount = v_new_total,
      status = v_payment_status,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'method', p_payment_method,
        'pricing', v_quote
      ),
      updated_at = now()
  where order_id = v_order.id and provider = 'cash_on_delivery';

  select jsonb_build_array(jsonb_build_object(
    'name', 'Suly order total',
    'amount', round(v_new_total * 100)::bigint,
    'quantity', 1,
    'description', 'Products, shipping, tax and discount'
  )) into v_line_items;

  return v_result || jsonb_build_object(
    'payment_method', p_payment_method,
    'payment_status', v_payment_status::text,
    'subtotal', (v_quote->>'subtotal')::numeric,
    'discount_total', (v_quote->>'discount_total')::numeric,
    'shipping_total', (v_quote->>'shipping_total')::numeric,
    'tax_total', (v_quote->>'tax_total')::numeric,
    'coupon_code', v_quote->>'coupon_code',
    'total', v_new_total,
    'line_items', v_line_items
  );
end;
$function$;

revoke all on function public.create_guest_order_for_payment(text,text,text,text,jsonb,jsonb,text,text,text) from public, anon, authenticated;
grant execute on function public.create_guest_order_for_payment(text,text,text,text,jsonb,jsonb,text,text,text) to service_role;
