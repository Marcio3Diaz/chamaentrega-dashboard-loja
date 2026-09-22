-- Platform moderation workflow for stores and couriers.
-- Existing records are preserved as approved/active. New registrations start pending.

alter table public.stores
  add column if not exists moderation_status text,
  add column if not exists moderation_reason text,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz;

update public.stores
set moderation_status = case when is_active then 'active' else 'suspended' end,
    approved_at = case when is_active then coalesce(approved_at,created_at) else approved_at end
where moderation_status is null;

alter table public.stores
  alter column moderation_status set default 'pending',
  alter column moderation_status set not null;

alter table public.stores
  drop constraint if exists stores_moderation_status_check;
alter table public.stores
  add constraint stores_moderation_status_check
  check (moderation_status in ('pending','active','suspended','banned','rejected'));

alter table public.couriers
  add column if not exists moderation_status text,
  add column if not exists moderation_reason text,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz;

update public.couriers
set moderation_status='active',
    approved_at=coalesce(approved_at,created_at)
where moderation_status is null;

alter table public.couriers
  alter column moderation_status set default 'pending',
  alter column moderation_status set not null;

alter table public.couriers
  drop constraint if exists couriers_moderation_status_check;
alter table public.couriers
  add constraint couriers_moderation_status_check
  check (moderation_status in ('pending','active','suspended','banned','rejected'));

create table if not exists public.admin_moderation_events (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('store','courier')),
  subject_id uuid not null,
  previous_status text,
  new_status text not null,
  reason text,
  admin_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_moderation_events_subject
  on public.admin_moderation_events(subject_type,subject_id,created_at desc);

alter table public.admin_moderation_events enable row level security;

drop policy if exists admin_moderation_events_admin_select on public.admin_moderation_events;
create policy admin_moderation_events_admin_select
on public.admin_moderation_events
for select to authenticated
using (private.current_user_is_admin());

create or replace function public.enforce_store_moderation_state()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if tg_op='UPDATE'
     and old.moderation_status is distinct from new.moderation_status
     and not private.current_user_is_admin() then
    raise exception 'ADMIN_REQUIRED_FOR_MODERATION' using errcode='P0001';
  end if;

  if new.moderation_status <> 'active' then
    new.is_active := false;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_enforce_store_moderation_state on public.stores;
create trigger trg_enforce_store_moderation_state
before insert or update on public.stores
for each row execute function public.enforce_store_moderation_state();

create or replace function public.enforce_courier_moderation_state()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if tg_op='UPDATE'
     and old.moderation_status is distinct from new.moderation_status
     and not private.current_user_is_admin() then
    raise exception 'ADMIN_REQUIRED_FOR_MODERATION' using errcode='P0001';
  end if;

  if new.moderation_status <> 'active' then
    new.is_online := false;
    new.is_available := false;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_enforce_courier_moderation_state on public.couriers;
create trigger trg_enforce_courier_moderation_state
before insert or update on public.couriers
for each row execute function public.enforce_courier_moderation_state();

create or replace function public.admin_set_store_moderation_status(
  p_store_id uuid,
  p_status text,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_previous text;
  v_status text := lower(trim(coalesce(p_status,'')));
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
begin
  if not private.current_user_is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode='P0001';
  end if;

  if v_status not in ('pending','active','suspended','banned','rejected') then
    raise exception 'INVALID_STATUS' using errcode='P0001';
  end if;

  select moderation_status into v_previous
  from public.stores
  where id=p_store_id
  for update;

  if not found then
    raise exception 'STORE_NOT_FOUND' using errcode='P0001';
  end if;

  update public.stores
  set moderation_status=v_status,
      moderation_reason=v_reason,
      moderated_at=now(),
      moderated_by=(select auth.uid()),
      approved_at=case
        when v_status='active' then coalesce(approved_at,now())
        else approved_at
      end,
      is_active=case when v_status='active' then true else false end,
      updated_at=now()
  where id=p_store_id;

  insert into public.admin_moderation_events(
    subject_type,subject_id,previous_status,new_status,reason,admin_id
  )
  values(
    'store',p_store_id,v_previous,v_status,v_reason,(select auth.uid())
  );

  return v_status;
end;
$function$;

create or replace function public.admin_set_courier_moderation_status(
  p_courier_id uuid,
  p_status text,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_previous text;
  v_status text := lower(trim(coalesce(p_status,'')));
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
begin
  if not private.current_user_is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode='P0001';
  end if;

  if v_status not in ('pending','active','suspended','banned','rejected') then
    raise exception 'INVALID_STATUS' using errcode='P0001';
  end if;

  select moderation_status into v_previous
  from public.couriers
  where id=p_courier_id
  for update;

  if not found then
    raise exception 'COURIER_NOT_FOUND' using errcode='P0001';
  end if;

  update public.couriers
  set moderation_status=v_status,
      moderation_reason=v_reason,
      moderated_at=now(),
      moderated_by=(select auth.uid()),
      approved_at=case
        when v_status='active' then coalesce(approved_at,now())
        else approved_at
      end,
      is_online=false,
      is_available=false,
      updated_at=now()
  where id=p_courier_id;

  insert into public.admin_moderation_events(
    subject_type,subject_id,previous_status,new_status,reason,admin_id
  )
  values(
    'courier',p_courier_id,v_previous,v_status,v_reason,(select auth.uid())
  );

  return v_status;
end;
$function$;

revoke all on function public.admin_set_store_moderation_status(uuid,text,text) from public,anon;
grant execute on function public.admin_set_store_moderation_status(uuid,text,text) to authenticated;

revoke all on function public.admin_set_courier_moderation_status(uuid,text,text) from public,anon;
grant execute on function public.admin_set_courier_moderation_status(uuid,text,text) to authenticated;

create or replace function private.store_is_active(p_store_id uuid)
returns boolean
language sql
stable security definer
set search_path=''
as $function$
  select exists (
    select 1
    from public.stores s
    where s.id=p_store_id
      and s.is_active=true
      and s.moderation_status='active'
  );
$function$;

create or replace function private.current_user_owns_active_store()
returns boolean
language sql
stable security definer
set search_path=''
as $function$
  select exists (
    select 1
    from public.stores s
    where s.owner_id=(select auth.uid())
      and s.is_active=true
      and s.moderation_status='active'
  )
  or private.current_user_is_admin();
$function$;

create or replace function private.current_courier_can_accept_delivery()
returns boolean
language sql
stable security definer
set search_path=''
as $function$
  select
    exists (
      select 1
      from public.couriers as courier
      where courier.id = auth.uid()
        and courier.moderation_status='active'
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
          'accepted','heading_to_pickup','at_pickup',
          'heading_to_dropoff','at_dropoff'
        )
    ) < 3;
$function$;

create or replace function public.set_my_courier_online_status(p_is_online boolean)
returns table(is_online boolean,is_available boolean)
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_courier_id uuid;
  v_batch_locked boolean;
  v_moderation_status text;
begin
  v_courier_id := auth.uid();

  if v_courier_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select moderation_status
    into v_moderation_status
  from public.couriers
  where id=v_courier_id;

  if not found then
    raise exception 'Cadastro de entregador não encontrado.';
  end if;

  if v_moderation_status <> 'active' then
    raise exception 'CADASTRO_NAO_ATIVO:%',v_moderation_status using errcode='P0001';
  end if;

  select exists (
    select 1
    from public.courier_delivery_batches b
    where b.courier_id = v_courier_id
      and b.status = 'locked'
  )
  into v_batch_locked;

  update public.couriers c
  set
    is_online = p_is_online,
    is_available = case
      when p_is_online = false then false
      when v_batch_locked = true then false
      else true
    end
  where c.id = v_courier_id;

  return query
  select c.is_online,c.is_available
  from public.couriers c
  where c.id=v_courier_id;
end;
$function$;

create or replace function public.update_my_courier_location(
  p_latitude double precision,
  p_longitude double precision
)
returns table(
  current_latitude double precision,
  current_longitude double precision,
  last_location_at timestamptz
)
language plpgsql
security definer
set search_path='public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if not exists (
    select 1 from public.couriers
    where id=auth.uid() and moderation_status='active'
  ) then
    raise exception 'CADASTRO_NAO_ATIVO' using errcode='P0001';
  end if;

  if p_latitude is null or p_longitude is null then
    raise exception 'Latitude e longitude são obrigatórias';
  end if;

  if p_latitude < -90 or p_latitude > 90 then
    raise exception 'Latitude inválida';
  end if;

  if p_longitude < -180 or p_longitude > 180 then
    raise exception 'Longitude inválida';
  end if;

  return query
  update public.couriers
  set current_latitude=p_latitude,
      current_longitude=p_longitude,
      last_location_at=now(),
      updated_at=now()
  where id=auth.uid()
  returning couriers.current_latitude,couriers.current_longitude,couriers.last_location_at;
end;
$function$;

drop policy if exists stores_select_authenticated on public.stores;
create policy stores_select_authenticated
on public.stores for select to authenticated
using (
  private.current_user_has_store_access(id)
  or private.current_courier_connected_to_store(id)
  or (
    is_active=true
    and moderation_status='active'
    and private.current_user_is_courier()
  )
);
