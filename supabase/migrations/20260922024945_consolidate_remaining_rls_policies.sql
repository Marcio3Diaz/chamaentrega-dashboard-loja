-- Consolidate equivalent permissive RLS policies without changing access semantics.

-- Couriers: merge admin visibility into the canonical visibility policy.
drop policy if exists couriers_admin_select on public.couriers;
drop policy if exists couriers_select_visible on public.couriers;
create policy couriers_select_visible
on public.couriers for select to authenticated
using (
  id=(select auth.uid())
  or private.current_user_is_admin()
  or exists (
    select 1
    from public.courier_store_networks csn
    join public.stores s on s.id=csn.store_id
    where csn.courier_id=couriers.id
      and csn.status='connected'
      and s.owner_id=(select auth.uid())
      and s.is_active=true
  )
);

-- Deliveries: store access helper already includes admins.
drop policy if exists deliveries_admin_select on public.deliveries;

-- Location history: combine courier and store-owner visibility.
drop policy if exists delivery_location_points_courier_select on public.delivery_location_points;
drop policy if exists delivery_location_points_store_select on public.delivery_location_points;
create policy delivery_location_points_select_visible
on public.delivery_location_points for select to authenticated
using (
  courier_id=(select auth.uid())
  or exists (
    select 1
    from public.deliveries d
    join public.stores s on s.id=d.store_id
    where d.id=delivery_location_points.delivery_id
      and s.owner_id=(select auth.uid())
  )
);

-- Pricing settings: combine owner and admin reads.
drop policy if exists delivery_pricing_settings_admin_select on public.delivery_pricing_settings;
drop policy if exists delivery_pricing_settings_owner_select on public.delivery_pricing_settings;
create policy delivery_pricing_settings_select_visible
on public.delivery_pricing_settings for select to authenticated
using (
  private.current_user_is_admin()
  or exists (
    select 1
    from public.stores s
    where s.id=delivery_pricing_settings.store_id
      and s.owner_id=(select auth.uid())
  )
);

-- Organization members: SELECT is handled by the visible policy.
-- Keep owner management permissions as explicit write policies.
drop policy if exists organization_members_manage_owner on public.organization_members;

create policy organization_members_insert_owner
on public.organization_members for insert to authenticated
with check (private.current_user_is_organization_owner(organization_id));

create policy organization_members_update_owner
on public.organization_members for update to authenticated
using (private.current_user_is_organization_owner(organization_id))
with check (private.current_user_is_organization_owner(organization_id));

create policy organization_members_delete_owner
on public.organization_members for delete to authenticated
using (private.current_user_is_organization_owner(organization_id));

-- Profiles: canonical visibility policy already includes admins.
drop policy if exists profiles_admin_select on public.profiles;

-- Store members: SELECT is handled by the visible policy.
drop policy if exists store_members_manage_owner on public.store_members;

create policy store_members_insert_owner
on public.store_members for insert to authenticated
with check (private.current_user_is_store_owner(store_id));

create policy store_members_update_owner
on public.store_members for update to authenticated
using (private.current_user_is_store_owner(store_id))
with check (private.current_user_is_store_owner(store_id));

create policy store_members_delete_owner
on public.store_members for delete to authenticated
using (private.current_user_is_store_owner(store_id));

-- Wallets: combine owner and admin visibility.
drop policy if exists store_owner_select_wallet_topups on public.store_wallet_topups;
drop policy if exists store_wallet_topups_admin_select on public.store_wallet_topups;
create policy store_wallet_topups_select_visible
on public.store_wallet_topups for select to authenticated
using (
  private.current_user_is_admin()
  or exists (
    select 1 from public.stores s
    where s.id=store_wallet_topups.store_id
      and s.owner_id=(select auth.uid())
  )
);

drop policy if exists store_owner_select_wallet_transactions on public.store_wallet_transactions;
drop policy if exists store_wallet_transactions_admin_select on public.store_wallet_transactions;
create policy store_wallet_transactions_select_visible
on public.store_wallet_transactions for select to authenticated
using (
  private.current_user_is_admin()
  or exists (
    select 1 from public.stores s
    where s.id=store_wallet_transactions.store_id
      and s.owner_id=(select auth.uid())
  )
);

drop policy if exists store_owner_select_wallet on public.store_wallets;
drop policy if exists store_wallets_admin_select on public.store_wallets;
create policy store_wallets_select_visible
on public.store_wallets for select to authenticated
using (
  private.current_user_is_admin()
  or exists (
    select 1 from public.stores s
    where s.id=store_wallets.store_id
      and s.owner_id=(select auth.uid())
  )
);

-- Stores: combine owner and admin update permissions.
drop policy if exists stores_admin_update on public.stores;
drop policy if exists stores_update_owner on public.stores;
create policy stores_update_owner_or_admin
on public.stores for update to authenticated
using (
  owner_id=(select auth.uid())
  or private.current_user_is_admin()
)
with check (
  owner_id=(select auth.uid())
  or private.current_user_is_admin()
);