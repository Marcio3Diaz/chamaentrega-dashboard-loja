create or replace function public.refresh_courier_delivery_batch_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_courier_id uuid;
  v_active_deliveries integer;
begin
  if old.courier_batch_id is null then
    return old;
  end if;

  select batch.courier_id
    into v_courier_id
  from public.courier_delivery_batches as batch
  where batch.id = old.courier_batch_id;

  if not found then
    return old;
  end if;

  select count(*)
    into v_active_deliveries
  from public.deliveries as delivery
  where delivery.courier_batch_id = old.courier_batch_id
    and delivery.status in (
      'accepted',
      'heading_to_pickup',
      'at_pickup',
      'heading_to_dropoff',
      'at_dropoff'
    );

  if v_active_deliveries = 0 then
    update public.courier_delivery_batches
    set status = 'completed',
        completed_at = coalesce(completed_at, pg_catalog.now())
    where id = old.courier_batch_id;

    update public.couriers
    set is_available = case when is_online then true else false end,
        updated_at = pg_catalog.now()
    where id = v_courier_id;
  end if;

  return old;
end;
$function$;

drop trigger if exists deliveries_refresh_courier_batch_after_delete
  on public.deliveries;

create trigger deliveries_refresh_courier_batch_after_delete
after delete on public.deliveries
for each row
execute function public.refresh_courier_delivery_batch_after_delete();
