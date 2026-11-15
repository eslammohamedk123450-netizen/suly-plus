create table if not exists public.platform_admin_billing_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in (
    'plan_created','plan_updated','plan_activated','plan_deactivated',
    'subscription_assigned','subscription_status_changed',
    'invoice_created','invoice_marked_paid'
  )),
  target_type text not null check (target_type in ('plan','subscription','invoice')),
  target_id uuid,
  store_id uuid references public.stores(id) on delete set null,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists platform_admin_billing_audit_created_idx
  on public.platform_admin_billing_audit_log(created_at desc);
create index if not exists platform_admin_billing_audit_store_created_idx
  on public.platform_admin_billing_audit_log(store_id, created_at desc);

alter table public.platform_admin_billing_audit_log enable row level security;
revoke all on public.platform_admin_billing_audit_log from public, anon, authenticated;
grant select, insert on public.platform_admin_billing_audit_log to service_role;

drop policy if exists platform_admin_billing_audit_service_only on public.platform_admin_billing_audit_log;
create policy platform_admin_billing_audit_service_only
  on public.platform_admin_billing_audit_log
  for all to service_role
  using (true)
  with check (true);
