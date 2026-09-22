-- Remove policies comprovadamente redundantes.
drop policy if exists profile_owner_read_self on public.profiles;
drop policy if exists profile_owner_update_self on public.profiles;
drop policy if exists store_owner_can_read_own_store on public.stores;

-- Otimiza leitura do lote próprio.
drop policy if exists courier_can_read_own_delivery_batches
  on public.courier_delivery_batches;
create policy courier_can_read_own_delivery_batches
  on public.courier_delivery_batches
  for select
  to authenticated
  using (courier_id = (select auth.uid()));

-- Otimiza suporte do entregador preservando a autorização.
drop policy if exists courier_support_select_own
  on public.courier_support_tickets;
create policy courier_support_select_own
  on public.courier_support_tickets
  for select
  to authenticated
  using (courier_id = (select auth.uid()));

drop policy if exists courier_support_insert_own
  on public.courier_support_tickets;
create policy courier_support_insert_own
  on public.courier_support_tickets
  for insert
  to authenticated
  with check (
    courier_id = (select auth.uid())
    and status = 'open'
    and support_response is null
    and support_responded_at is null
    and resolved_at is null
    and (
      delivery_id is null
      or exists (
        select 1
        from public.deliveries as delivery
        where delivery.id = courier_support_tickets.delivery_id
          and delivery.assigned_courier_id = (select auth.uid())
      )
    )
  );

-- Otimiza ofertas/entregas sem alterar o escopo de acesso.
drop policy if exists authenticated_can_read_available_or_own_deliveries
  on public.deliveries;
create policy authenticated_can_read_available_or_own_deliveries
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
  );

drop policy if exists store_owner_can_insert_own_deliveries
  on public.deliveries;
create policy store_owner_can_insert_own_deliveries
  on public.deliveries
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.stores
      where stores.id = deliveries.store_id
        and stores.owner_id = (select auth.uid())
    )
  );

drop policy if exists store_owner_can_read_own_deliveries
  on public.deliveries;
create policy store_owner_can_read_own_deliveries
  on public.deliveries
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.stores as store
      join public.profiles as profile
        on profile.id = store.owner_id
      where store.id = deliveries.store_id
        and store.owner_id = (select auth.uid())
        and profile.role = 'store_owner'
    )
  );

drop policy if exists store_owner_can_update_own_deliveries
  on public.deliveries;
create policy store_owner_can_update_own_deliveries
  on public.deliveries
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.stores
      where stores.id = deliveries.store_id
        and stores.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.stores
      where stores.id = deliveries.store_id
        and stores.owner_id = (select auth.uid())
    )
  );

-- Otimiza visualização de perfis de entregadores por lojistas.
drop policy if exists store_owner_view_courier_profiles
  on public.profiles;
create policy store_owner_view_courier_profiles
  on public.profiles
  for select
  to authenticated
  using (
    role = 'courier'
    and exists (
      select 1
      from public.stores as s
      where s.owner_id = (select auth.uid())
        and s.is_active = true
    )
  );
