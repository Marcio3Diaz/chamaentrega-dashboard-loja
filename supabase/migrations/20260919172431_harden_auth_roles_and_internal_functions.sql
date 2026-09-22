create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_role text;
  user_name text;
  user_vehicle text;
begin
  -- Authorization roles must come from app_metadata, which is controlled by
  -- trusted server/admin flows. User-editable user_metadata is never used
  -- to grant store_owner or admin privileges.
  user_role :=
    case
      when new.raw_app_meta_data ->> 'role'
        in ('courier', 'store_owner', 'admin')
      then new.raw_app_meta_data ->> 'role'
      else 'courier'
    end;

  user_name :=
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(new.email, '@', 1), ''),
      'Usuário'
    );

  user_vehicle :=
    case
      when new.raw_user_meta_data ->> 'vehicle_type'
        in ('motorcycle', 'bike')
      then new.raw_user_meta_data ->> 'vehicle_type'
      else 'motorcycle'
    end;

  insert into public.profiles (
    id,
    role,
    full_name,
    phone
  )
  values (
    new.id,
    user_role,
    user_name,
    nullif(trim(new.raw_user_meta_data ->> 'phone'), '')
  )
  on conflict (id) do nothing;

  if user_role = 'courier' then
    insert into public.couriers (
      id,
      vehicle_type
    )
    values (
      new.id,
      user_vehicle
    )
    on conflict (id) do update
    set vehicle_type = excluded.vehicle_type;
  end if;

  return new;
end;
$$;

revoke all on function public.handle_new_user()
  from public, anon, authenticated;
revoke all on function public.create_store_wallet()
  from public, anon, authenticated;
revoke all on function public.rls_auto_enable()
  from public, anon, authenticated;
revoke all on function public.sync_delivery_payment_on_completion()
  from public, anon, authenticated;

-- Legacy helper no longer used after the 3-delivery visibility policy.
revoke all on function public.current_courier_has_active_delivery()
  from public, anon, authenticated;
