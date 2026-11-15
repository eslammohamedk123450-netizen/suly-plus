create or replace function private.enforce_store_product_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
  v_plan_active boolean;
  v_limit integer;
  v_current bigint;
begin
  if new.status = 'archived' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('store-products:' || new.store_id::text));

  select ss.status, sp.is_active, sp.max_products
  into v_status, v_plan_active, v_limit
  from public.store_subscriptions ss
  join public.subscription_plans sp on sp.id = ss.plan_id
  where ss.store_id = new.store_id;

  if not found then return new; end if;
  if v_status not in ('trialing','active') or not v_plan_active then
    raise exception 'SUBSCRIPTION_NOT_ACTIVE';
  end if;

  if v_limit is not null then
    select count(*) into v_current
    from public.products p
    where p.store_id = new.store_id and p.status <> 'archived';
    if v_current >= v_limit then
      raise exception 'PLAN_LIMIT_PRODUCTS_REACHED';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_store_product_plan_limit() from public, anon, authenticated;

drop trigger if exists enforce_store_product_plan_limit on public.products;
create trigger enforce_store_product_plan_limit
before insert on public.products
for each row execute function private.enforce_store_product_plan_limit();

create or replace function private.enforce_store_team_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
  v_plan_active boolean;
  v_limit integer;
  v_current bigint;
begin
  perform pg_advisory_xact_lock(hashtext('store-team:' || new.store_id::text));

  select ss.status, sp.is_active, sp.max_team_members
  into v_status, v_plan_active, v_limit
  from public.store_subscriptions ss
  join public.subscription_plans sp on sp.id = ss.plan_id
  where ss.store_id = new.store_id;

  if not found then return new; end if;
  if v_status not in ('trialing','active') or not v_plan_active then
    raise exception 'SUBSCRIPTION_NOT_ACTIVE';
  end if;

  if v_limit is not null then
    select count(*) into v_current
    from public.store_members sm
    where sm.store_id = new.store_id;
    if v_current >= v_limit then
      raise exception 'PLAN_LIMIT_TEAM_MEMBERS_REACHED';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_store_team_plan_limit() from public, anon, authenticated;

drop trigger if exists enforce_store_team_plan_limit on public.store_members;
create trigger enforce_store_team_plan_limit
before insert on public.store_members
for each row execute function private.enforce_store_team_plan_limit();
