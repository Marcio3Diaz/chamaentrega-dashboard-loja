-- ChamaEntrega platform admin console.
-- Applied to Supabase on 2026-09-21.

drop policy if exists deliveries_admin_select on public.deliveries;
create policy deliveries_admin_select
on public.deliveries for select to authenticated
using (private.current_user_is_admin());

drop policy if exists couriers_admin_select on public.couriers;
create policy couriers_admin_select
on public.couriers for select to authenticated
using (private.current_user_is_admin());

drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_admin_select
on public.profiles for select to authenticated
using (private.current_user_is_admin());

drop policy if exists store_wallets_admin_select on public.store_wallets;
create policy store_wallets_admin_select
on public.store_wallets for select to authenticated
using (private.current_user_is_admin());

drop policy if exists store_wallet_transactions_admin_select on public.store_wallet_transactions;
create policy store_wallet_transactions_admin_select
on public.store_wallet_transactions for select to authenticated
using (private.current_user_is_admin());

drop policy if exists store_wallet_topups_admin_select on public.store_wallet_topups;
create policy store_wallet_topups_admin_select
on public.store_wallet_topups for select to authenticated
using (private.current_user_is_admin());

drop policy if exists stores_admin_update on public.stores;
create policy stores_admin_update
on public.stores for update to authenticated
using (private.current_user_is_admin())
with check (private.current_user_is_admin());

drop policy if exists deliveries_select_visible on public.deliveries;
create policy deliveries_select_visible
on public.deliveries for select to authenticated
using (
  assigned_courier_id=(select auth.uid())
  or (
    status='available'
    and assigned_courier_id is null
    and (target_courier_id is null or target_courier_id=(select auth.uid()))
    and exists (
      select 1 from public.couriers courier
      where courier.id=(select auth.uid())
    )
    and private.current_courier_can_accept_delivery()
  )
  or private.current_user_has_store_access(store_id)
);

create or replace function public.admin_set_store_active(
  p_store_id uuid,
  p_is_active boolean
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not private.current_user_is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode='P0001';
  end if;

  update public.stores
  set is_active=p_is_active,
      updated_at=now()
  where id=p_store_id;

  if not found then
    raise exception 'STORE_NOT_FOUND' using errcode='P0001';
  end if;

  return true;
end;
$function$;

revoke all on function public.admin_set_store_active(uuid,boolean) from public,anon;
grant execute on function public.admin_set_store_active(uuid,boolean) to authenticated;
