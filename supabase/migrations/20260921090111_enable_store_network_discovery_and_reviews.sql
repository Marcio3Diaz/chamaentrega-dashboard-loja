-- Let couriers discover every active store and let store owners review network requests.

drop policy if exists stores_select_authenticated on public.stores;
create policy stores_select_authenticated
on public.stores for select to authenticated
using (
  private.current_user_has_store_access(id)
  or private.current_courier_connected_to_store(id)
  or (is_active = true and private.current_user_is_courier())
);

create or replace function public.review_courier_store_network_request(
  p_store_id uuid,
  p_courier_id uuid,
  p_decision text,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_status text;
begin
  if not private.current_user_has_store_access(p_store_id) then
    raise exception 'STORE_ACCESS_REQUIRED' using errcode='P0001';
  end if;

  if p_decision not in ('connected','rejected') then
    raise exception 'INVALID_DECISION' using errcode='P0001';
  end if;

  select status
    into v_status
  from public.courier_store_networks
  where store_id=p_store_id
    and courier_id=p_courier_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND' using errcode='P0001';
  end if;

  if v_status <> 'pending' then
    raise exception 'REQUEST_ALREADY_REVIEWED' using errcode='P0001';
  end if;

  update public.courier_store_networks
  set status=p_decision,
      reviewed_at=now(),
      reviewed_by=(select auth.uid()),
      review_note=nullif(trim(coalesce(p_note,'')),''),
      updated_at=now()
  where store_id=p_store_id
    and courier_id=p_courier_id;

  return p_decision;
end;
$function$;

revoke all on function public.review_courier_store_network_request(uuid,uuid,text,text) from public,anon;
grant execute on function public.review_courier_store_network_request(uuid,uuid,text,text) to authenticated;
