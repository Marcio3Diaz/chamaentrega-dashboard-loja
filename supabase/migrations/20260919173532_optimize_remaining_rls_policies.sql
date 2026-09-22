drop policy if exists courier_can_read_own_location_confirmations
  on public.delivery_location_confirmations;
create policy courier_can_read_own_location_confirmations
  on public.delivery_location_confirmations
  for select
  to authenticated
  using (courier_id = (select auth.uid()));

drop policy if exists courier_can_view_own_messages
  on public.courier_store_messages;
create policy courier_can_view_own_messages
  on public.courier_store_messages
  for select
  to authenticated
  using (courier_id = (select auth.uid()));

drop policy if exists courier_can_send_messages
  on public.courier_store_messages;
create policy courier_can_send_messages
  on public.courier_store_messages
  for insert
  to authenticated
  with check (
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
  );

drop policy if exists participants_can_update_message_read_status
  on public.courier_store_messages;
create policy participants_can_update_message_read_status
  on public.courier_store_messages
  for update
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
  )
  with check (
    courier_id = (select auth.uid())
    or exists (
      select 1
      from public.stores as s
      where s.id = courier_store_messages.store_id
        and s.owner_id = (select auth.uid())
        and s.is_active = true
    )
  );

drop policy if exists store_owner_can_send_messages
  on public.courier_store_messages;
create policy store_owner_can_send_messages
  on public.courier_store_messages
  for insert
  to authenticated
  with check (
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
  );

drop policy if exists store_owner_can_view_courier_messages
  on public.courier_store_messages;
create policy store_owner_can_view_courier_messages
  on public.courier_store_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.stores as s
      where s.id = courier_store_messages.store_id
        and s.owner_id = (select auth.uid())
        and s.is_active = true
    )
  );

drop policy if exists store_owner_view_connected_couriers
  on public.couriers;
create policy store_owner_view_connected_couriers
  on public.couriers
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.courier_store_networks as csn
      join public.stores as s
        on s.id = csn.store_id
      where csn.courier_id = couriers.id
        and csn.status = 'connected'
        and s.owner_id = (select auth.uid())
        and s.is_active = true
    )
  );

drop policy if exists store_owner_select_wallet
  on public.store_wallets;
create policy store_owner_select_wallet
  on public.store_wallets
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.stores as s
      where s.id = store_wallets.store_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists store_owner_select_wallet_transactions
  on public.store_wallet_transactions;
create policy store_owner_select_wallet_transactions
  on public.store_wallet_transactions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.stores as s
      where s.id = store_wallet_transactions.store_id
        and s.owner_id = (select auth.uid())
    )
  );
