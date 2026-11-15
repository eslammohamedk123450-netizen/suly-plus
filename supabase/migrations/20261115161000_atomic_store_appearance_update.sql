create or replace function public.update_store_appearance(
  p_store_id uuid,
  p_name text,
  p_description text,
  p_logo_url text,
  p_announcement text,
  p_support_email text,
  p_support_phone text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_updated integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if p_store_id is null or p_name is null or length(trim(p_name)) not between 2 and 100 then
    raise exception 'Invalid store name';
  end if;
  if p_description is not null and length(p_description) > 1000 then
    raise exception 'Store description is too long';
  end if;
  if p_announcement is not null and length(p_announcement) > 240 then
    raise exception 'Store announcement is too long';
  end if;
  if p_support_phone is not null and length(p_support_phone) > 30 then
    raise exception 'Support phone is too long';
  end if;
  if p_support_email is not null and p_support_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid support email';
  end if;
  if p_logo_url is not null and p_logo_url !~ '^https://[^[:space:]]+$' then
    raise exception 'Logo URL must use HTTPS';
  end if;

  update public.stores
  set name = trim(p_name),
      description = nullif(trim(coalesce(p_description, '')), ''),
      logo_url = nullif(trim(coalesce(p_logo_url, '')), ''),
      updated_at = now()
  where id = p_store_id;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'Store not found or not authorized';
  end if;

  insert into public.store_settings(store_id, announcement, support_email, support_phone, updated_at)
  values (
    p_store_id,
    nullif(trim(coalesce(p_announcement, '')), ''),
    nullif(trim(coalesce(p_support_email, '')), ''),
    nullif(trim(coalesce(p_support_phone, '')), ''),
    now()
  )
  on conflict (store_id) do update
  set announcement = excluded.announcement,
      support_email = excluded.support_email,
      support_phone = excluded.support_phone,
      updated_at = excluded.updated_at;
end;
$function$;

revoke all on function public.update_store_appearance(uuid,text,text,text,text,text,text) from public, anon;
grant execute on function public.update_store_appearance(uuid,text,text,text,text,text,text) to authenticated;
