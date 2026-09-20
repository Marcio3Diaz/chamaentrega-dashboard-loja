create table if not exists public.store_integrations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null,
  status text not null default 'not_configured',
  is_enabled boolean not null default false,
  public_config jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_integrations_provider_check
    check (provider in ('whatsapp','ifood','99food','goomer','own_menu')),
  constraint store_integrations_status_check
    check (status in ('not_configured','configured','pending','connected','error')),
  constraint store_integrations_store_provider_key unique (store_id, provider),
  constraint store_integrations_public_config_object
    check (jsonb_typeof(public_config) = 'object')
);

alter table public.store_integrations enable row level security;

grant select, insert, update, delete on public.store_integrations to authenticated;

create policy "store_integrations_select_owner_admin"
on public.store_integrations
for select
to authenticated
using (
  exists (
    select 1
    from public.stores s
    where s.id = store_integrations.store_id
      and (
        s.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.profiles p
          where p.id = (select auth.uid())
            and p.role = 'admin'
        )
      )
  )
);

create policy "store_integrations_insert_owner_admin"
on public.store_integrations
for insert
to authenticated
with check (
  exists (
    select 1
    from public.stores s
    where s.id = store_integrations.store_id
      and (
        s.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.profiles p
          where p.id = (select auth.uid())
            and p.role = 'admin'
        )
      )
  )
);

create policy "store_integrations_update_owner_admin"
on public.store_integrations
for update
to authenticated
using (
  exists (
    select 1
    from public.stores s
    where s.id = store_integrations.store_id
      and (
        s.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.profiles p
          where p.id = (select auth.uid())
            and p.role = 'admin'
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.stores s
    where s.id = store_integrations.store_id
      and (
        s.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.profiles p
          where p.id = (select auth.uid())
            and p.role = 'admin'
        )
      )
  )
);

create policy "store_integrations_delete_owner_admin"
on public.store_integrations
for delete
to authenticated
using (
  exists (
    select 1
    from public.stores s
    where s.id = store_integrations.store_id
      and (
        s.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.profiles p
          where p.id = (select auth.uid())
            and p.role = 'admin'
        )
      )
  )
);

create or replace function public.set_store_integrations_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_store_integrations_updated_at on public.store_integrations;
create trigger trg_store_integrations_updated_at
before update on public.store_integrations
for each row
execute function public.set_store_integrations_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'store_integrations'
  ) then
    alter publication supabase_realtime add table public.store_integrations;
  end if;
end $$;
