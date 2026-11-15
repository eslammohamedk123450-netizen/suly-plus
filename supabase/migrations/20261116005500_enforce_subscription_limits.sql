create or replace function public.create_product(
  p_store_id uuid,
  p_name text,
  p_slug text,
  p_description text,
  p_status public.product_status,
  p_price numeric,
  p_currency text,
  p_stock_quantity integer,
  p_sku text default null,
  p_images text[] default '{}'
)
returns public.products
language plpgsql
set search_path = ''
as $function$
declare
  created_product public.products;
  v_plan_status text;
  v_plan_active boolean;
  v_max_products integer;
  v_current_products bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select ss.status, sp.is_active, sp.max_products
  into v_plan_status, v_plan_active, v_max_products
  from public.store_subscriptions ss
  join public.subscription_plans sp on sp.id = ss.plan_id
  where ss.store_id = p_store_id;

  if found then
    if v_plan_status not in ('trialing','active') or not v_plan_active then
      raise exception 'SUBSCRIPTION_NOT_ACTIVE';
    end if;
    if v_max_products is not null then
      select count(*) into v_current_products
      from public.products p
      where p.store_id = p_store_id and p.status <> 'archived';
      if v_current_products >= v_max_products then
        raise exception 'PLAN_LIMIT_PRODUCTS_REACHED';
      end if;
    end if;
  end if;

  insert into public.products (
    store_id, name, slug, description, status, price, currency,
    stock_quantity, sku, images
  )
  values (
    p_store_id, trim(p_name), lower(trim(p_slug)), p_description, p_status,
    p_price, upper(trim(p_currency)), p_stock_quantity, nullif(trim(p_sku), ''), coalesce(p_images, '{}')
  )
  returning * into created_product;

  insert into public.product_variants (
    store_id, product_id, name, sku, price, stock_quantity
  )
  values (
    p_store_id, created_product.id, trim(p_name), nullif(trim(p_sku), ''), p_price, p_stock_quantity
  );

  return created_product;
end;
$function$;

create or replace function public.add_store_team_member(
  p_store_id uuid,
  p_user_id uuid,
  p_email text,
  p_role public.store_role,
  p_actor_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_confirmed_at timestamptz;
  v_plan_status text;
  v_plan_active boolean;
  v_max_members integer;
  v_current_members bigint;
begin
  if p_store_id is null or p_user_id is null or p_actor_id is null
     or p_email is null or length(trim(p_email)) not between 3 and 254
     or p_role not in ('admin','manager','staff')
     or p_status not in ('pending','accepted') then
    raise exception 'Invalid team invitation';
  end if;
  if not exists (
    select 1 from public.store_members sm
    where sm.store_id = p_store_id and sm.user_id = p_actor_id and sm.role = 'owner'
  ) then
    raise exception 'Only the store owner can manage team members';
  end if;
  if exists (
    select 1 from public.store_members sm
    where sm.store_id = p_store_id and sm.user_id = p_user_id
  ) then
    raise exception 'User is already a store member';
  end if;

  select ss.status, sp.is_active, sp.max_team_members
  into v_plan_status, v_plan_active, v_max_members
  from public.store_subscriptions ss
  join public.subscription_plans sp on sp.id = ss.plan_id
  where ss.store_id = p_store_id;

  if found then
    if v_plan_status not in ('trialing','active') or not v_plan_active then
      raise exception 'SUBSCRIPTION_NOT_ACTIVE';
    end if;
    if v_max_members is not null then
      select count(*) into v_current_members
      from public.store_members sm where sm.store_id = p_store_id;
      if v_current_members >= v_max_members then
        raise exception 'PLAN_LIMIT_TEAM_MEMBERS_REACHED';
      end if;
    end if;
  end if;

  select u.email_confirmed_at into v_confirmed_at
  from auth.users u where u.id = p_user_id;
  if not found then raise exception 'Invited user not found'; end if;

  insert into public.store_members(store_id, user_id, role)
  values (p_store_id, p_user_id, p_role);

  insert into public.store_team_invitations(
    store_id, user_id, email, role, invited_by, status, accepted_at, expires_at, updated_at
  ) values (
    p_store_id, p_user_id, lower(trim(p_email)), p_role, p_actor_id,
    case when v_confirmed_at is not null then 'accepted' else p_status end,
    case when v_confirmed_at is not null then v_confirmed_at else null end,
    now() + interval '7 days',
    now()
  )
  on conflict (store_id, user_id) do update
  set email = excluded.email,
      role = excluded.role,
      invited_by = excluded.invited_by,
      status = excluded.status,
      accepted_at = excluded.accepted_at,
      expires_at = excluded.expires_at,
      updated_at = now();

  insert into public.store_team_audit_log(store_id, actor_id, target_user_id, email, action, new_role)
  values (
    p_store_id, p_actor_id, p_user_id, lower(trim(p_email)),
    case when v_confirmed_at is not null then 'member_added' else 'invited' end,
    p_role
  );

  return jsonb_build_object('store_id', p_store_id, 'user_id', p_user_id, 'role', p_role, 'status',
    case when v_confirmed_at is not null then 'accepted' else p_status end);
end;
$function$;

create or replace function public.create_guest_order_for_payment(
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
  v_store_id uuid;
  v_timezone text;
  v_plan_status text;
  v_plan_active boolean;
  v_max_monthly_orders integer;
  v_month_start timestamptz;
  v_next_month timestamptz;
  v_month_orders bigint;
begin
  if p_payment_method not in ('cash_on_delivery','paymob') then
    raise exception 'Unsupported payment method';
  end if;
  if p_coupon_code is not null and length(trim(p_coupon_code)) > 40 then
    raise exception 'Invalid coupon code';
  end if;

  select s.id, coalesce(nullif(s.timezone,''),'UTC')
  into v_store_id, v_timezone
  from public.stores s
  where s.slug = lower(trim(p_store_slug)) and s.is_active = true;
  if not found then raise exception 'Store unavailable'; end if;

  select ss.status, sp.is_active, sp.max_monthly_orders
  into v_plan_status, v_plan_active, v_max_monthly_orders
  from public.store_subscriptions ss
  join public.subscription_plans sp on sp.id = ss.plan_id
  where ss.store_id = v_store_id;

  if found then
    if v_plan_status not in ('trialing','active') or not v_plan_active then
      raise exception 'SUBSCRIPTION_NOT_ACTIVE';
    end if;
    if v_max_monthly_orders is not null then
      perform pg_advisory_xact_lock(hashtext(v_store_id::text));
      v_month_start := date_trunc('month', now() at time zone v_timezone) at time zone v_timezone;
      v_next_month := (date_trunc('month', now() at time zone v_timezone) + interval '1 month') at time zone v_timezone;
      select count(*) into v_month_orders
      from public.orders o
      where o.store_id = v_store_id
        and o.created_at >= v_month_start
        and o.created_at < v_next_month;
      if v_month_orders >= v_max_monthly_orders then
        raise exception 'PLAN_LIMIT_MONTHLY_ORDERS_REACHED';
      end if;
    end if;
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

revoke all on function public.create_guest_order_for_payment(text,text,text,text,jsonb,jsonb,text,text,text) from public, anon;
grant execute on function public.create_guest_order_for_payment(text,text,text,text,jsonb,jsonb,text,text,text) to service_role;
