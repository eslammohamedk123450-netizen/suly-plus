do $migration$
declare
  v_definition text;
  v_oid regprocedure := 'public.add_store_team_member(uuid,uuid,text,public.store_role,uuid,text)'::regprocedure;
  v_old text;
  v_new text;
begin
  v_definition := pg_get_functiondef(v_oid);

  v_old := '      select count(*) into v_current_members' || E'\n' ||
    '      from public.store_members sm where sm.store_id = p_store_id;';

  v_new := '      select' || E'\n' ||
    '        (select count(*) from public.store_members sm where sm.store_id = p_store_id)' || E'\n' ||
    '        +' || E'\n' ||
    '        (select count(*) from public.store_team_invitations i' || E'\n' ||
    '         where i.store_id = p_store_id' || E'\n' ||
    '           and i.user_id <> p_user_id' || E'\n' ||
    '           and i.status = ''pending''' || E'\n' ||
    '           and i.expires_at > now())' || E'\n' ||
    '      into v_current_members;';

  if position(v_old in v_definition) = 0 then
    raise exception 'Could not find team plan quota count block';
  end if;

  execute replace(v_definition, v_old, v_new);
end;
$migration$;
