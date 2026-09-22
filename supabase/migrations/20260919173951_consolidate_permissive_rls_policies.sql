-- Consolidate permissive policies with equivalent OR semantics.

drop policy if exists courier_ratings_admin_select_all on public.courier_ratings;
drop policy if exists courier_ratings_courier_select_own on public.courier_ratings;
drop policy if exists courier_ratings_store_owner_select_own on public.courier_ratings;
create policy courier_ratings_select_visible
  on public.courier_ratings
  for select
  to authenticated
  using (
    courier_id = (select auth.uid())
    or exists (
      select 1 from public.stores
      where stores.id = courier_ratings.store_id
        and stores.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'admin'
    )
  );

drop policy if exists courier_can_send_messages on public.courier_store_messages;
drop policy if exists store_owner_can_send_messages on public.courier_store_messages;
create policy courier_store_messages_insert_participant
  on public.courier_store_messages
  for insert
  to authenticated
  with check (
    (
      sender_id = (select auth.uid())
      and sender_type = 'courier'
      and courier_id = (select auth.uid())
      and exists (
        select 1
        from public.courier_store_networks as csn
        where csn.store_id = courier_store_messages.store_id
          and csn.courier_id = (select auth.uid())
          and csn.status = 'connected'
      )
    )
    or
    (
      sender_id = (select auth.uid())
      and sender_type = 'store'
      and exists (
        select 1
        from public.stores as s
        where s.id = courier_store_messages.store_id
          and s.owner_id = (select auth.uid())
          and s.is_active = true
      )
      and exists (
        select 1
        from public.courier_store_networks as csn
        where csn.store_id = courier_store_messages.store_id
          and csn.courier_id = courier_store_messages.courier_id
          and csn.status = 'connected'
      )
    )
  );

drop policy if exists courier_can_view_own_messages on public.courier_store_messages;
drop policy if exists store_owner_can_view_courier_messages on public.courier_store_messages;
create policy courier_store_messages_select_participant
  on public.courier_store_messages
  for select
  to authenticated
  using (
    courier_id = (select auth.uid())
    or exists (
      select 1
      from public.stores as s
      where s.id = courier_store_messages.store_id
        and s.owner_id = (select auth.uid())
        and s.is_active = true
    )
  );

drop policy if exists networks_admin_select_all on public.courier_store_networks;
drop policy if exists networks_courier_select_own on public.courier_store_networks;
drop policy if exists networks_store_owner_select_own_store on public.courier_store_networks;
create policy courier_store_networks_select_visible
  on public.courier_store_networks
  for select
  to authenticated
  using (
    courier_id = (select auth.uid())
    or exists (
      select 1 from public.stores
      where stores.id = courier_store_networks.store_id
        and stores.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'admin'
    )
  );

drop policy if exists courier_verifications_admin_select_all on public.courier_verifications;
drop policy if exists courier_verifications_courier_select_own on public.courier_verifications;
create policy courier_verifications_select_visible
  on public.courier_verifications
  for select
  to authenticated
  using (
    courier_id = (select auth.uid())
    or exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'admin'
    )
  );

drop policy if exists couriers_select_own on public.couriers;
drop policy if exists store_owner_view_connected_couriers on public.couriers;
create policy couriers_select_visible
  on public.couriers
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.courier_store_networks as csn
      join public.stores as s on s.id = csn.store_id
      where csn.courier_id = couriers.id
        and csn.status = 'connected'
        and s.owner_id = (select auth.uid())
        and s.is_active = true
    )
  );

drop policy if exists authenticated_can_read_available_or_own_deliveries on public.deliveries;
drop policy if exists store_owner_can_read_own_deliveries on public.deliveries;
create policy deliveries_select_visible
  on public.deliveries
  for select
  to authenticated
  using (
    assigned_courier_id = (select auth.uid())
    or (
      status = 'available'
      and assigned_courier_id is null
      and exists (
        select 1
        from public.couriers as courier
        where courier.id = (select auth.uid())
      )
      and (select public.current_courier_can_accept_delivery())
    )
    or exists (
      select 1
      from public.stores as store
      join public.profiles as profile on profile.id = store.owner_id
      where store.id = deliveries.store_id
        and store.owner_id = (select auth.uid())
        and profile.role = 'store_owner'
    )
  );

drop policy if exists delivery_incidents_admin_select_all on public.delivery_incidents;
drop policy if exists delivery_incidents_courier_select_own on public.delivery_incidents;
drop policy if exists delivery_incidents_store_owner_select_own on public.delivery_incidents;
create policy delivery_incidents_select_visible
  on public.delivery_incidents
  for select
  to authenticated
  using (
    courier_id = (select auth.uid())
    or exists (
      select 1 from public.stores
      where stores.id = delivery_incidents.store_id
        and stores.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'admin'
    )
  );

drop policy if exists responses_select_courier on public.delivery_offer_responses;
drop policy if exists responses_select_store_owner on public.delivery_offer_responses;
create policy responses_select_visible
  on public.delivery_offer_responses
  for select
  to authenticated
  using (
    courier_id = (select auth.uid())
    or exists (
      select 1
      from public.deliveries
      join public.stores on stores.id = deliveries.store_id
      where deliveries.id = delivery_offer_responses.delivery_id
        and stores.owner_id = (select auth.uid())
    )
  );

drop policy if exists delivery_payments_admin_select_all on public.delivery_payments;
drop policy if exists delivery_payments_courier_select_own on public.delivery_payments;
drop policy if exists delivery_payments_store_owner_select_own on public.delivery_payments;
create policy delivery_payments_select_visible
  on public.delivery_payments
  for select
  to authenticated
  using (
    courier_id = (select auth.uid())
    or exists (
      select 1 from public.stores
      where stores.id = delivery_payments.store_id
        and stores.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'admin'
    )
  );

drop policy if exists history_select_assigned_courier on public.delivery_status_history;
drop policy if exists history_select_store_owner on public.delivery_status_history;
create policy delivery_status_history_select_visible
  on public.delivery_status_history
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.deliveries
      where deliveries.id = delivery_status_history.delivery_id
        and deliveries.assigned_courier_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.deliveries
      join public.stores on stores.id = deliveries.store_id
      where deliveries.id = delivery_status_history.delivery_id
        and stores.owner_id = (select auth.uid())
    )
  );

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists store_owner_view_courier_profiles on public.profiles;
create policy profiles_select_visible
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or (
      role = 'courier'
      and exists (
        select 1
        from public.stores as s
        where s.owner_id = (select auth.uid())
          and s.is_active = true
      )
    )
  );
