create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and length(code) <= 40),
  name text not null check (length(trim(name)) between 2 and 80),
  description text,
  currency text not null default 'EGP' check (currency ~ '^[A-Z]{3}$'),
  monthly_price numeric(12,2) not null default 0 check (monthly_price >= 0),
  yearly_price numeric(12,2) not null default 0 check (yearly_price >= 0),
  max_products integer check (max_products is null or max_products >= 0),
  max_team_members integer check (max_team_members is null or max_team_members >= 1),
  max_monthly_orders integer check (max_monthly_orders is null or max_monthly_orders >= 0),
  features jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_subscriptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null unique references public.stores(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  status text not null default 'trialing' check (status in ('trialing','active','past_due','cancelled','suspended')),
  billing_interval text not null default 'manual' check (billing_interval in ('monthly','yearly','manual')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean not null default false,
  external_customer_id text,
  external_subscription_id text unique,
  admin_notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_subscription_period_valid check (
    current_period_end is null or current_period_end > current_period_start
  )
);

create table if not exists public.subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number bigint generated always as identity unique,
  store_id uuid not null references public.stores(id) on delete cascade,
  subscription_id uuid references public.store_subscriptions(id) on delete set null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'open' check (status in ('draft','open','paid','void','uncollectible')),
  period_start date,
  period_end date,
  due_at timestamptz,
  paid_at timestamptz,
  payment_reference text,
  memo text,
  created_at timestamptz not null default now(),
  constraint invoice_period_valid check (
    period_start is null or period_end is null or period_end >= period_start
  )
);

create index if not exists store_subscriptions_plan_status_idx
  on public.store_subscriptions(plan_id, status);
create index if not exists subscription_invoices_store_created_idx
  on public.subscription_invoices(store_id, created_at desc);
create index if not exists subscription_invoices_status_due_idx
  on public.subscription_invoices(status, due_at);

alter table public.subscription_plans enable row level security;
alter table public.store_subscriptions enable row level security;
alter table public.subscription_invoices enable row level security;

revoke all on public.subscription_plans, public.store_subscriptions, public.subscription_invoices from public, anon, authenticated;
grant select on public.subscription_plans to anon, authenticated;
grant select (store_id, plan_id, status, billing_interval, current_period_end)
  on public.store_subscriptions to authenticated;
grant select on public.subscription_invoices to authenticated;
grant all on public.subscription_plans, public.store_subscriptions, public.subscription_invoices to service_role;

drop policy if exists subscription_plans_public_active_read on public.subscription_plans;
create policy subscription_plans_public_active_read
  on public.subscription_plans for select to anon, authenticated
  using (is_active = true);

drop policy if exists store_subscriptions_members_entitlement_read on public.store_subscriptions;
create policy store_subscriptions_members_entitlement_read
  on public.store_subscriptions for select to authenticated
  using (exists (
    select 1 from public.store_members sm
    where sm.store_id = store_subscriptions.store_id
      and sm.user_id = (select auth.uid())
  ));

drop policy if exists subscription_invoices_owner_admin_read on public.subscription_invoices;
create policy subscription_invoices_owner_admin_read
  on public.subscription_invoices for select to authenticated
  using (private.is_store_admin(store_id));
