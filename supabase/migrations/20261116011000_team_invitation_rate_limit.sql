create or replace function private.enforce_team_invitation_rate_limit(p_store_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invites_last_24h bigint;
begin
  if p_store_id is null then
    raise exception 'Invalid store id';
  end if;

  -- Serialize invitation issuance for a store so parallel requests cannot
  -- race past the rolling 24-hour quota.
  perform pg_advisory_xact_lock(hashtext('store-team-invite:' || p_store_id::text));

  select count(*) into v_invites_last_24h
  from public.store_team_invitations i
  where i.store_id = p_store_id
    and i.created_at >= now() - interval '24 hours';

  if v_invites_last_24h >= 10 then
    raise exception 'TEAM_INVITE_RATE_LIMIT_REACHED';
  end if;
end;
$function$;

revoke all on function private.enforce_team_invitation_rate_limit(uuid) from public, anon, authenticated;

do $migration$
declare
  v_definition text;
  v_oid regprocedure := 'public.add_store_team_member(uuid,uuid,text,public.store_role,uuid,text)'::regprocedure;
  v_old text;
  v_new text;
begin
  v_definition := pg_get_functiondef(v_oid);
  v_old := '  if exists (' || E'\n' ||
    '    select 1 from public.store_members sm' || E'\n' ||
    '    where sm.store_id = p_store_id and sm.user_id = p_user_id' || E'\n' ||
    '  ) then' || E'\n' ||
    '    raise exception ''User is already a store member'';' || E'\n' ||
    '  end if;';
  v_new := v_old || E'\n\n' ||
    '  perform private.enforce_team_invitation_rate_limit(p_store_id);';
  if position(v_old in v_definition) = 0 then
    raise exception 'Could not find team invitation insertion point';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$migration$;
