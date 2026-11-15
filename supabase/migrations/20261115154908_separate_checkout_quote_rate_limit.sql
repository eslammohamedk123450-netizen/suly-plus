
create or replace function public.consume_checkout_quote_rate_limit(p_ip_address text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_key text;
  v_count integer;
begin
  if p_ip_address is null or length(trim(p_ip_address)) < 3 then
    return false;
  end if;

  v_key := encode(extensions.digest(trim(p_ip_address), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtext(v_key), 72);

  insert into private.checkout_rate_limits(rate_key, window_started_at, attempt_count, updated_at)
  values (v_key, now(), 1, now())
  on conflict (rate_key) do update
  set window_started_at = case
        when private.checkout_rate_limits.window_started_at < now() - interval '10 minutes'
          then now()
        else private.checkout_rate_limits.window_started_at
      end,
      attempt_count = case
        when private.checkout_rate_limits.window_started_at < now() - interval '10 minutes'
          then 1
        else private.checkout_rate_limits.attempt_count + 1
      end,
      updated_at = now()
  returning attempt_count into v_count;

  return v_count <= 60;
end;
$function$;

revoke all on function public.consume_checkout_quote_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_checkout_quote_rate_limit(text) to service_role;
