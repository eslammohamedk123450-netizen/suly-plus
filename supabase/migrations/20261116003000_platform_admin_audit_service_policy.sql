drop policy if exists platform_admin_audit_service_only on public.platform_admin_audit_log;
create policy platform_admin_audit_service_only
on public.platform_admin_audit_log
for all
to service_role
using (true)
with check (true);

revoke all on public.platform_admin_audit_log from public, anon, authenticated;
grant select, insert on public.platform_admin_audit_log to service_role;
