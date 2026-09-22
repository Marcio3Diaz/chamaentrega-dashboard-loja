-- Allow platform admins to inspect store pricing settings on the store detail screen.

drop policy if exists delivery_pricing_settings_admin_select on public.delivery_pricing_settings;
create policy delivery_pricing_settings_admin_select
on public.delivery_pricing_settings for select to authenticated
using (private.current_user_is_admin());
