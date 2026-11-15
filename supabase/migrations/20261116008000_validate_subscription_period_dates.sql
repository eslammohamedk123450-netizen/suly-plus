create or replace function private.store_subscription_is_valid(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when not exists (
      select 1 from public.store_subscriptions ss where ss.store_id = p_store_id
    ) then null::boolean
    else exists (
      select 1
      from public.store_subscriptions ss
      join public.subscription_plans sp on sp.id = ss.plan_id
      where ss.store_id = p_store_id
        and sp.is_active = true
        and ss.status in ('trialing','active')
        and ss.current_period_start <= now()
        and (ss.current_period_end is null or ss.current_period_end > now())
        and (
          (ss.status = 'trialing' and ss.trial_end is not null and ss.trial_end > now())
          or
          (ss.status = 'active' and (
            ss.billing_interval = 'manual'
            or ss.current_period_end is not null
          ))
        )
    )
  end;
$function$;

revoke all on function private.store_subscription_is_valid(uuid) from public, anon;
grant execute on function private.store_subscription_is_valid(uuid) to authenticated, service_role;

do $migration$
declare
  v_definition text;
  v_old text := 'if v_plan_status not in (''trialing'',''active'') or not v_plan_active then';
  v_new text;
  v_oid regprocedure;
  v_store_arg text;
begin
  v_oid := 'public.create_product(uuid,text,text,text,public.product_status,numeric,text,integer,text,text[])'::regprocedure;
  v_definition := pg_get_functiondef(v_oid);
  v_new := 'if private.store_subscription_is_valid(p_store_id) is false then';
  if position(v_old in v_definition) = 0 then raise exception 'create_product subscription guard not found'; end if;
  execute replace(v_definition, v_old, v_new);

  v_oid := 'public.add_store_team_member(uuid,uuid,text,public.store_role,uuid,text)'::regprocedure;
  v_definition := pg_get_functiondef(v_oid);
  v_new := 'if private.store_subscription_is_valid(p_store_id) is false then';
  if position(v_old in v_definition) = 0 then raise exception 'add_store_team_member subscription guard not found'; end if;
  execute replace(v_definition, v_old, v_new);

  v_oid := 'public.create_guest_order_for_payment(text,text,text,text,jsonb,jsonb,text,text,text)'::regprocedure;
  v_definition := pg_get_functiondef(v_oid);
  v_new := 'if private.store_subscription_is_valid(v_store_id) is false then';
  if position(v_old in v_definition) = 0 then raise exception 'create_guest_order_for_payment subscription guard not found'; end if;
  execute replace(v_definition, v_old, v_new);

  v_oid := 'private.enforce_store_product_plan_limit()'::regprocedure;
  v_definition := pg_get_functiondef(v_oid);
  v_old := 'if v_status not in (''trialing'',''active'') or not v_plan_active then';
  v_new := 'if private.store_subscription_is_valid(new.store_id) is false then';
  if position(v_old in v_definition) = 0 then raise exception 'product trigger subscription guard not found'; end if;
  execute replace(v_definition, v_old, v_new);

  v_oid := 'private.enforce_store_team_plan_limit()'::regprocedure;
  v_definition := pg_get_functiondef(v_oid);
  if position(v_old in v_definition) = 0 then raise exception 'team trigger subscription guard not found'; end if;
  execute replace(v_definition, v_old, v_new);
end;
$migration$;
