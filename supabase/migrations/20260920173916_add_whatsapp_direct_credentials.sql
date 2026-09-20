create table if not exists public.whatsapp_connection_credentials (
  store_id uuid primary key references public.stores(id) on delete cascade,
  waba_id text not null,
  phone_number_id text not null unique,
  display_phone_number text,
  verified_name text,
  access_token text not null,
  token_type text,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_connection_credentials enable row level security;

revoke all on public.whatsapp_connection_credentials from anon, authenticated;

create or replace function public.set_whatsapp_credentials_updated_at()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  new.updated_at=now();
  return new;
end;
$$;

drop trigger if exists trg_whatsapp_credentials_updated_at
on public.whatsapp_connection_credentials;

create trigger trg_whatsapp_credentials_updated_at
before update on public.whatsapp_connection_credentials
for each row execute function public.set_whatsapp_credentials_updated_at();

create index if not exists idx_whatsapp_credentials_waba
on public.whatsapp_connection_credentials(waba_id);
