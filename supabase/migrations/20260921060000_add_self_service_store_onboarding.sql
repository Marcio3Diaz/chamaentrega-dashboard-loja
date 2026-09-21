-- ChamaEntrega SaaS: self-service signup, organizations and first-store onboarding.
-- Applied to the production Supabase project on 2026-09-21.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  legal_name text,
  tax_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner','admin','manager','finance','operator')),
  status text not null default 'active'
    check (status in ('active','invited','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);

alter table public.stores
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;

create table if not exists public.store_members (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'operator'
    check (role in ('owner','admin','manager','finance','operator')),
  status text not null default 'active'
    check (status in ('active','invited','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_id,user_id)
);

create index if not exists idx_organizations_owner_id
  on public.organizations(owner_id);
create index if not exists idx_organization_members_user_id
  on public.organization_members(user_id,status);
create index if not exists idx_store_members_user_id
  on public.store_members(user_id,status);
create index if not exists idx_stores_organization_id
  on public.stores(organization_id);

insert into public.organizations (owner_id,name)
select s.owner_id,coalesce(min(nullif(trim(s.name),'')),'Minha empresa')
from public.stores s
where not exists (
  select 1 from public.organizations o where o.owner_id=s.owner_id
)
group by s.owner_id;

update public.stores s
set organization_id=(
  select o.id
  from public.organizations o
  where o.owner_id=s.owner_id
  order by o.created_at asc
  limit 1
)
where s.organization_id is null;

insert into public.organization_members (organization_id,user_id,role,status)
select o.id,o.owner_id,'owner','active'
from public.organizations o
on conflict (organization_id,user_id) do nothing;

insert into public.store_members (store_id,user_id,role,status)
select s.id,s.owner_id,'owner','active'
from public.stores s
on conflict (store_id,user_id) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  user_role text;
  user_name text;
  user_vehicle text;
begin
  user_role :=
    case
      when new.raw_app_meta_data ->> 'role' = 'admin' then 'admin'
      when new.raw_app_meta_data ->> 'role' = 'store_owner' then 'store_owner'
      when new.raw_user_meta_data ->> 'account_type' = 'store_owner' then 'store_owner'
      else 'courier'
    end;

  user_name :=
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'),''),
      nullif(split_part(new.email,'@',1),''),
      'Usuário'
    );

  user_vehicle :=
    case
      when new.raw_user_meta_data ->> 'vehicle_type' in ('motorcycle','bike')
        then new.raw_user_meta_data ->> 'vehicle_type'
      else 'motorcycle'
    end;

  insert into public.profiles (id,role,full_name,phone)
  values (
    new.id,
    user_role,
    user_name,
    nullif(trim(new.raw_user_meta_data ->> 'phone'),'')
  )
  on conflict (id) do update
  set full_name=excluded.full_name,
      phone=coalesce(excluded.phone,public.profiles.phone);

  if user_role='courier' then
    insert into public.couriers (id,vehicle_type)
    values (new.id,user_vehicle)
    on conflict (id) do update
    set vehicle_type=excluded.vehicle_type;
  end if;

  return new;
end;
$function$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.store_members enable row level security;

drop policy if exists organizations_select_members on public.organizations;
create policy organizations_select_members
on public.organizations for select to authenticated
using (
  owner_id=(select auth.uid())
  or exists (
    select 1 from public.organization_members m
    where m.organization_id=organizations.id
      and m.user_id=(select auth.uid())
      and m.status='active'
  )
  or exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.role='admin'
  )
);

drop policy if exists organizations_insert_owner on public.organizations;
create policy organizations_insert_owner
on public.organizations for insert to authenticated
with check (
  owner_id=(select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid())
      and p.role in ('store_owner','admin')
  )
);

drop policy if exists organizations_update_owner on public.organizations;
create policy organizations_update_owner
on public.organizations for update to authenticated
using (
  owner_id=(select auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.role='admin'
  )
)
with check (
  owner_id=(select auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.role='admin'
  )
);

drop policy if exists organization_members_select_visible on public.organization_members;
create policy organization_members_select_visible
on public.organization_members for select to authenticated
using (
  user_id=(select auth.uid())
  or exists (
    select 1 from public.organizations o
    where o.id=organization_members.organization_id
      and o.owner_id=(select auth.uid())
  )
);

drop policy if exists organization_members_manage_owner on public.organization_members;
create policy organization_members_manage_owner
on public.organization_members for all to authenticated
using (
  exists (
    select 1 from public.organizations o
    where o.id=organization_members.organization_id
      and o.owner_id=(select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.organizations o
    where o.id=organization_members.organization_id
      and o.owner_id=(select auth.uid())
  )
);

drop policy if exists store_members_select_visible on public.store_members;
create policy store_members_select_visible
on public.store_members for select to authenticated
using (
  user_id=(select auth.uid())
  or exists (
    select 1 from public.stores s
    where s.id=store_members.store_id
      and s.owner_id=(select auth.uid())
  )
);

drop policy if exists store_members_manage_owner on public.store_members;
create policy store_members_manage_owner
on public.store_members for all to authenticated
using (
  exists (
    select 1 from public.stores s
    where s.id=store_members.store_id
      and s.owner_id=(select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.stores s
    where s.id=store_members.store_id
      and s.owner_id=(select auth.uid())
  )
);

drop policy if exists stores_select_authenticated on public.stores;
create policy stores_select_authenticated
on public.stores for select to authenticated
using (
  owner_id=(select auth.uid())
  or exists (
    select 1 from public.store_members m
    where m.store_id=stores.id
      and m.user_id=(select auth.uid())
      and m.status='active'
  )
  or exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.role='admin'
  )
  or exists (
    select 1 from public.courier_store_networks n
    where n.store_id=stores.id
      and n.courier_id=(select auth.uid())
      and n.status='connected'
  )
);

create or replace function public.create_first_store_onboarding(
  p_store_name text,
  p_store_phone text,
  p_address text,
  p_latitude double precision,
  p_longitude double precision,
  p_zip_code text default null,
  p_street text default null,
  p_street_number text default null,
  p_complement text default null,
  p_neighborhood text default null,
  p_city text default null,
  p_state text default null,
  p_legal_name text default null,
  p_tax_id text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_org_id uuid;
  v_store_id uuid;
begin
  if v_user_id is null then
    raise exception 'SESSAO_EXPIRADA' using errcode='P0001';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id=v_user_id;

  if v_role not in ('store_owner','admin') then
    raise exception 'CONTA_SEM_PERMISSAO_DE_LOJA' using errcode='P0001';
  end if;

  if coalesce(trim(p_store_name),'')='' then
    raise exception 'NOME_DA_LOJA_OBRIGATORIO' using errcode='P0001';
  end if;

  if coalesce(trim(p_address),'')='' then
    raise exception 'ENDERECO_OBRIGATORIO' using errcode='P0001';
  end if;

  if p_latitude is null or p_longitude is null then
    raise exception 'LOCALIZE_O_ENDERECO' using errcode='P0001';
  end if;

  if exists (select 1 from public.stores s where s.owner_id=v_user_id) then
    raise exception 'LOJA_JA_EXISTE' using errcode='P0001';
  end if;

  insert into public.organizations (owner_id,name,legal_name,tax_id)
  values (
    v_user_id,
    trim(p_store_name),
    nullif(trim(p_legal_name),''),
    nullif(trim(p_tax_id),'')
  )
  returning id into v_org_id;

  insert into public.organization_members (organization_id,user_id,role,status)
  values (v_org_id,v_user_id,'owner','active');

  insert into public.stores (
    owner_id,organization_id,name,phone,address,latitude,longitude,is_active,
    zip_code,street,street_number,complement,neighborhood,city,state
  )
  values (
    v_user_id,v_org_id,trim(p_store_name),nullif(trim(p_store_phone),''),
    trim(p_address),p_latitude,p_longitude,true,
    nullif(trim(p_zip_code),''),nullif(trim(p_street),''),
    nullif(trim(p_street_number),''),nullif(trim(p_complement),''),
    nullif(trim(p_neighborhood),''),nullif(trim(p_city),''),
    nullif(upper(trim(p_state)),'')
  )
  returning id into v_store_id;

  insert into public.store_members (store_id,user_id,role,status)
  values (v_store_id,v_user_id,'owner','active')
  on conflict (store_id,user_id) do nothing;

  insert into public.delivery_pricing_settings (store_id)
  values (v_store_id)
  on conflict (store_id) do nothing;

  return v_store_id;
end;
$function$;

revoke all on function public.create_first_store_onboarding(
  text,text,text,double precision,double precision,text,text,text,text,text,text,text,text,text
) from public,anon;

grant execute on function public.create_first_store_onboarding(
  text,text,text,double precision,double precision,text,text,text,text,text,text,text,text,text
) to authenticated;
