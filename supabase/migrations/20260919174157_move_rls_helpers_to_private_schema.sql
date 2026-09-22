create schema if not exists private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.current_courier_can_accept_delivery()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.couriers as courier
      where courier.id = auth.uid()
        and courier.is_online = true
        and courier.is_available = true
    )
    and not exists (
      select 1
      from public.courier_delivery_batches as batch
      where batch.courier_id = auth.uid()
        and batch.status = 'locked'
    )
    and (
      select count(*)
      from public.deliveries as delivery
      where delivery.assigned_courier_id = auth.uid()
        and delivery.status in (
          'accepted',
          'heading_to_pickup',
          'at_pickup',
          'heading_to_dropoff',
          'at_dropoff'
        )
    ) < 3;
$$;

revoke all on function private.current_courier_can_accept_delivery()
  from public, anon;
grant execute on function private.current_courier_can_accept_delivery()
  to authenticated;

create or replace function private.can_access_delivery_chat(
  p_delivery_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.deliveries as delivery
    join public.stores as store
      on store.id = delivery.store_id
    where delivery.id = p_delivery_id
      and (
        delivery.assigned_courier_id = auth.uid()
        or store.owner_id = auth.uid()
        or exists (
          select 1
          from public.profiles as profile
          where profile.id = auth.uid()
            and profile.role = 'admin'
        )
      )
  );
$$;

revoke all on function private.can_access_delivery_chat(uuid)
  from public, anon;
grant execute on function private.can_access_delivery_chat(uuid)
  to authenticated;

drop policy if exists deliveries_select_visible on public.deliveries;
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
      and (select private.current_courier_can_accept_delivery())
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

drop policy if exists delivery_chat_participants_select
  on public.delivery_chat_messages;
create policy delivery_chat_participants_select
  on public.delivery_chat_messages
  for select
  to authenticated
  using (private.can_access_delivery_chat(delivery_id));

drop function public.current_courier_can_accept_delivery();
drop function public.can_access_delivery_chat(uuid);
