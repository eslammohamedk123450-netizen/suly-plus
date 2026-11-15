do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.store_team_audit_log'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%action%'
  loop
    execute format('alter table public.store_team_audit_log drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.store_team_audit_log
  add constraint store_team_audit_log_action_check
  check (action in (
    'invited','member_added','invitation_accepted','role_changed','member_removed',
    'invitation_expired','invitation_rejected'
  ));

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
  v_result_status text;
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

  perform private.enforce_team_invitation_rate_limit(p_store_id);

  select ss.status, sp.is_active, sp.max_team_members
  into v_plan_status, v_plan_active, v_max_members
  from public.store_subscriptions ss
  join public.subscription_plans sp on sp.id = ss.plan_id
  where ss.store_id = p_store_id;

  if found then
    if private.store_subscription_is_valid(p_store_id) is false then
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
  from auth.users u
  where u.id = p_user_id;
  if not found then raise exception 'Invited user not found'; end if;

  -- An unverified invitee receives no store_members row and therefore no access.
  if v_confirmed_at is not null then
    insert into public.store_members(store_id, user_id, role)
    values (p_store_id, p_user_id, p_role);
    v_result_status := 'accepted';
  else
    v_result_status := 'pending';
  end if;

  insert into public.store_team_invitations(
    store_id, user_id, email, role, invited_by, status,
    accepted_at, expires_at, updated_at
  ) values (
    p_store_id, p_user_id, lower(trim(p_email)), p_role, p_actor_id,
    v_result_status,
    case when v_confirmed_at is not null then v_confirmed_at else null end,
    case when v_confirmed_at is not null then now() + interval '3650 days'
         else now() + interval '7 days' end,
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

  return jsonb_build_object(
    'store_id', p_store_id,
    'user_id', p_user_id,
    'role', p_role,
    'status', v_result_status
  );
end;
$function$;

revoke all on function public.add_store_team_member(uuid,uuid,text,public.store_role,uuid,text) from public, anon, authenticated;
grant execute on function public.add_store_team_member(uuid,uuid,text,public.store_role,uuid,text) to service_role;

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
      select *
      from public.store_team_invitations
      where user_id = new.id and status = 'pending'
      for update
    loop
      if v_invitation.expires_at <= now() then
        update public.store_team_invitations
        set status = 'expired', updated_at = now()
        where id = v_invitation.id;

        insert into public.store_team_audit_log(
          store_id, actor_id, target_user_id, email, action, new_role
        ) values (
          v_invitation.store_id, v_invitation.invited_by, new.id,
          v_invitation.email, 'invitation_expired', v_invitation.role
        );
        continue;
      end if;

      begin
        -- The store_members BEFORE INSERT trigger checks subscription validity
        -- and team limits at acceptance time, under a per-store advisory lock.
        insert into public.store_members(store_id, user_id, role)
        values (v_invitation.store_id, new.id, v_invitation.role)
        on conflict (store_id, user_id) do nothing;

        update public.store_team_invitations
        set status = 'accepted',
            accepted_at = new.email_confirmed_at,
            updated_at = now()
        where id = v_invitation.id;

        insert into public.store_team_audit_log(
          store_id, actor_id, target_user_id, email, action, new_role
        ) values (
          v_invitation.store_id, v_invitation.invited_by, new.id,
          v_invitation.email, 'invitation_accepted', v_invitation.role
        );
      exception when others then
        -- Never block the customer's email confirmation. If the subscription
        -- expired or the team limit was reached, reject the membership grant.
        update public.store_team_invitations
        set status = 'revoked', updated_at = now()
        where id = v_invitation.id;

        insert into public.store_team_audit_log(
          store_id, actor_id, target_user_id, email, action, new_role
        ) values (
          v_invitation.store_id, v_invitation.invited_by, new.id,
          v_invitation.email, 'invitation_rejected', v_invitation.role
        );
      end;
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
