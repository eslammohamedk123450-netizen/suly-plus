create table if not exists public.store_team_invitations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null check (length(email) <= 254),
  role public.store_role not null check (role in ('admin','manager','staff')),
  invited_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id, user_id)
);

create index if not exists store_team_invites_store_status_idx
  on public.store_team_invitations(store_id, status, created_at desc);

create table if not exists public.store_team_audit_log (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  email text,
  action text not null check (action in ('invited','member_added','invitation_accepted','role_changed','member_removed')),
  previous_role public.store_role,
  new_role public.store_role,
  created_at timestamptz not null default now()
);

create index if not exists store_team_audit_store_created_idx
  on public.store_team_audit_log(store_id, created_at desc);

alter table public.store_team_invitations enable row level security;
alter table public.store_team_audit_log enable row level security;
revoke all on public.store_team_invitations, public.store_team_audit_log from public, anon, authenticated;
grant select on public.store_team_invitations, public.store_team_audit_log to authenticated;
grant select, insert, update, delete on public.store_team_invitations, public.store_team_audit_log to service_role;

drop policy if exists store_team_invitations_owner_admin_read on public.store_team_invitations;
create policy store_team_invitations_owner_admin_read
  on public.store_team_invitations for select to authenticated
  using (private.is_store_admin(store_id));

drop policy if exists store_team_audit_owner_admin_read on public.store_team_audit_log;
create policy store_team_audit_owner_admin_read
  on public.store_team_audit_log for select to authenticated
  using (private.is_store_admin(store_id));

create or replace function public.find_auth_user_for_team(p_email text)
returns table(user_id uuid, email text, email_confirmed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $function$
  select u.id, u.email::text, u.email_confirmed_at
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;
$function$;

revoke all on function public.find_auth_user_for_team(text) from public, anon, authenticated;
grant execute on function public.find_auth_user_for_team(text) to service_role;

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

  select u.email_confirmed_at into v_confirmed_at
  from auth.users u where u.id = p_user_id;
  if not found then
    raise exception 'Invited user not found';
  end if;

  insert into public.store_members(store_id, user_id, role)
  values (p_store_id, p_user_id, p_role);

  insert into public.store_team_invitations(
    store_id, user_id, email, role, invited_by, status, accepted_at, expires_at, updated_at
  ) values (
    p_store_id, p_user_id, lower(trim(p_email)), p_role, p_actor_id,
    case when v_confirmed_at is not null then 'accepted' else p_status end,
    case when v_confirmed_at is not null then v_confirmed_at else null end,
    case when v_confirmed_at is not null then now() + interval '3650 days' else now() + interval '7 days' end,
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

revoke all on function public.add_store_team_member(uuid,uuid,text,public.store_role,uuid,text) from public, anon, authenticated;
grant execute on function public.add_store_team_member(uuid,uuid,text,public.store_role,uuid,text) to service_role;

create or replace function public.update_store_team_member_role(
  p_store_id uuid,
  p_user_id uuid,
  p_new_role public.store_role,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_previous_role public.store_role;
begin
  if p_store_id is null or p_user_id is null or p_actor_id is null
     or p_new_role not in ('admin','manager','staff') then
    raise exception 'Invalid team role update';
  end if;
  if not exists (
    select 1 from public.store_members sm
    where sm.store_id = p_store_id and sm.user_id = p_actor_id and sm.role = 'owner'
  ) then
    raise exception 'Only the store owner can manage team members';
  end if;

  select role into v_previous_role
  from public.store_members
  where store_id = p_store_id and user_id = p_user_id
  for update;

  if not found then raise exception 'Team member not found'; end if;
  if v_previous_role = 'owner' then raise exception 'The store owner role cannot be changed'; end if;
  if v_previous_role = p_new_role then
    return jsonb_build_object('user_id', p_user_id, 'role', p_new_role, 'unchanged', true);
  end if;

  update public.store_members set role = p_new_role
  where store_id = p_store_id and user_id = p_user_id;

  update public.store_team_invitations set role = p_new_role, updated_at = now()
  where store_id = p_store_id and user_id = p_user_id and status in ('pending','accepted');

  insert into public.store_team_audit_log(store_id, actor_id, target_user_id, action, previous_role, new_role)
  values (p_store_id, p_actor_id, p_user_id, 'role_changed', v_previous_role, p_new_role);

  return jsonb_build_object('user_id', p_user_id, 'role', p_new_role);
end;
$function$;

revoke all on function public.update_store_team_member_role(uuid,uuid,public.store_role,uuid) from public, anon, authenticated;
grant execute on function public.update_store_team_member_role(uuid,uuid,public.store_role,uuid) to service_role;

create or replace function public.remove_store_team_member(
  p_store_id uuid,
  p_user_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_previous_role public.store_role;
  v_email text;
begin
  if p_store_id is null or p_user_id is null or p_actor_id is null then
    raise exception 'Invalid team member removal';
  end if;
  if not exists (
    select 1 from public.store_members sm
    where sm.store_id = p_store_id and sm.user_id = p_actor_id and sm.role = 'owner'
  ) then
    raise exception 'Only the store owner can manage team members';
  end if;

  select role into v_previous_role
  from public.store_members
  where store_id = p_store_id and user_id = p_user_id
  for update;
  if not found then raise exception 'Team member not found'; end if;
  if v_previous_role = 'owner' then raise exception 'The store owner cannot be removed'; end if;

  select email into v_email from public.store_team_invitations
  where store_id = p_store_id and user_id = p_user_id;

  delete from public.store_members where store_id = p_store_id and user_id = p_user_id;
  update public.store_team_invitations
  set status = 'revoked', updated_at = now()
  where store_id = p_store_id and user_id = p_user_id and status in ('pending','accepted');

  insert into public.store_team_audit_log(store_id, actor_id, target_user_id, email, action, previous_role)
  values (p_store_id, p_actor_id, p_user_id, v_email, 'member_removed', v_previous_role);

  return jsonb_build_object('user_id', p_user_id, 'removed', true);
end;
$function$;

revoke all on function public.remove_store_team_member(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.remove_store_team_member(uuid,uuid,uuid) to service_role;

create or replace function public.handle_team_invitation_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invitation public.store_team_invitations%rowtype;
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    for v_invitation in
      update public.store_team_invitations
      set status = 'accepted',
          accepted_at = new.email_confirmed_at,
          updated_at = now()
      where user_id = new.id and status = 'pending' and expires_at > now()
      returning *
    loop
      insert into public.store_team_audit_log(
        store_id, actor_id, target_user_id, email, action, new_role
      ) values (
        v_invitation.store_id, v_invitation.invited_by, new.id,
        v_invitation.email, 'invitation_accepted', v_invitation.role
      );
    end loop;
  end if;
  return new;
end;
$function$;

revoke all on function public.handle_team_invitation_confirmation() from public, anon, authenticated;

drop trigger if exists on_team_invitation_confirmed on auth.users;
create trigger on_team_invitation_confirmed
after update of email_confirmed_at on auth.users
for each row
when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
execute function public.handle_team_invitation_confirmation();
