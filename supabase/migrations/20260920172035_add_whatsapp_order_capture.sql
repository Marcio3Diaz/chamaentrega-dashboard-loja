create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  wa_id text not null,
  customer_name text,
  customer_phone text,
  active_order_id uuid references public.store_orders(id) on delete set null,
  status text not null default 'open',
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_conversations_status_check check (status in ('open','archived')),
  constraint whatsapp_conversations_store_wa_key unique (store_id,wa_id)
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  provider_message_id text not null,
  wa_id text not null,
  message_type text not null,
  body text,
  provider_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint whatsapp_messages_provider_id_key unique (provider_message_id),
  constraint whatsapp_messages_payload_object_check check (jsonb_typeof(provider_payload)='object')
);

create index if not exists idx_whatsapp_conversations_store_last
  on public.whatsapp_conversations(store_id,last_message_at desc);

create index if not exists idx_whatsapp_messages_store_received
  on public.whatsapp_messages(store_id,received_at desc);

create index if not exists idx_whatsapp_messages_conversation_received
  on public.whatsapp_messages(conversation_id,received_at desc);

alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;

grant select on public.whatsapp_conversations to authenticated;
grant select on public.whatsapp_messages to authenticated;

drop policy if exists "whatsapp_conversations_select_owner_admin" on public.whatsapp_conversations;
create policy "whatsapp_conversations_select_owner_admin"
on public.whatsapp_conversations
for select to authenticated
using (
  exists (
    select 1 from public.stores s
    where s.id=whatsapp_conversations.store_id
      and (
        s.owner_id=(select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id=(select auth.uid()) and p.role='admin'
        )
      )
  )
);

drop policy if exists "whatsapp_messages_select_owner_admin" on public.whatsapp_messages;
create policy "whatsapp_messages_select_owner_admin"
on public.whatsapp_messages
for select to authenticated
using (
  exists (
    select 1 from public.stores s
    where s.id=whatsapp_messages.store_id
      and (
        s.owner_id=(select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id=(select auth.uid()) and p.role='admin'
        )
      )
  )
);

create or replace function public.set_whatsapp_conversation_updated_at()
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

drop trigger if exists trg_whatsapp_conversations_updated_at on public.whatsapp_conversations;
create trigger trg_whatsapp_conversations_updated_at
before update on public.whatsapp_conversations
for each row execute function public.set_whatsapp_conversation_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='whatsapp_conversations'
  ) then
    alter publication supabase_realtime add table public.whatsapp_conversations;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='whatsapp_messages'
  ) then
    alter publication supabase_realtime add table public.whatsapp_messages;
  end if;
end $$;
