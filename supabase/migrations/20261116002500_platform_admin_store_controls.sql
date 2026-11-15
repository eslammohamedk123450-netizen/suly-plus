create table if not exists public.platform_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  store_id uuid references public.stores(id) on delete set null,
  action text not null check (action in ('store_suspended','store_reactivated')),
  reason text,
  created_at timestamptz not null default now(),
  constraint platform_admin_audit_reason_length check (reason is null or length(reason) <= 500)
);

create index if not exists platform_admin_audit_created_idx
  on public.platform_admin_audit_log(created_at desc);
create index if not exists platform_admin_audit_store_created_idx
  on public.platform_admin_audit_log(store_id, created_at desc);

alter table public.platform_admin_audit_log enable row level security;
revoke all on public.platform_admin_audit_log from public, anon, authenticated;
grant select, insert on public.platform_admin_audit_log to service_role;

create or replace function public.platform_admin_set_store_status(
  p_actor_id uuid,
  p_store_id uuid,
  p_is_active boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_store public.stores%rowtype;
  v_action text;
begin
  if p_actor_id is null or p_store_id is null or p_is_active is null then
    raise exception 'Invalid platform admin request';
  end if;
  if p_reason is not null and length(trim(p_reason)) > 500 then
    raise exception 'Reason must be 500 characters or fewer';
  end if;

  select * into v_store
  from public.stores
  where id = p_store_id
  for update;

  if not found then
    raise exception 'Store not found';
  end if;

  if v_store.is_active = p_is_active then
    return jsonb_build_object(
      'store_id', v_store.id,
      'is_active', v_store.is_active,
      'unchanged', true
    );
  end if;

  v_action := case when p_is_active then 'store_reactivated' else 'store_suspended' end;

  update public.stores
  set is_active = p_is_active,
      updated_at = now()
  where id = p_store_id
  returning * into v_store;

  insert into public.platform_admin_audit_log(actor_id, store_id, action, reason)
  values (p_actor_id, p_store_id, v_action, nullif(trim(coalesce(p_reason, '')), ''));

  return jsonb_build_object(
    'store_id', v_store.id,
    'store_name', v_store.name,
    'is_active', v_store.is_active,
    'action', v_action,
    'updated_at', v_store.updated_at
  );
end;
$function$;

revoke all on function public.platform_admin_set_store_status(uuid,uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.platform_admin_set_store_status(uuid,uuid,boolean,text) to service_role;
