drop policy if exists subscription_plans_public_active_read on public.subscription_plans;
drop policy if exists subscription_plans_active_or_member_read on public.subscription_plans;

create policy subscription_plans_public_active_read
on public.subscription_plans
for select
to anon
using (is_active = true);

create policy subscription_plans_active_or_member_read
on public.subscription_plans
for select
to authenticated
using (
  is_active = true
  or exists (
    select 1
    from public.store_subscriptions ss
    join public.store_members sm on sm.store_id = ss.store_id
    where ss.plan_id = subscription_plans.id
      and sm.user_id = (select auth.uid())
  )
);
