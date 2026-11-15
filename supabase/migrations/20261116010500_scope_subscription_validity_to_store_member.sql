create or replace function private.store_subscription_is_valid(p_store_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
begin
  if p_store_id is null then
    return false;
  end if;

  -- Authenticated callers may only ask about a store they belong to.
  -- Service-role Edge Functions have no auth.uid() and are allowed to proceed.
  if v_user_id is not null and not exists (
    select 1 from public.store_members sm
    where sm.store_id = p_store_id and sm.user_id = v_user_id
  ) then
    return false;
  end if;

  if not exists (
    select 1 from public.store_subscriptions ss where ss.store_id = p_store_id
  ) then
    return null;
  end if;

  return exists (
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
  );
end;
$function$;

revoke all on function private.store_subscription_is_valid(uuid) from public, anon;
grant execute on function private.store_subscription_is_valid(uuid) to authenticated, service_role;
