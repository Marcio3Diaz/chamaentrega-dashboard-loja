create table if not exists public.serafina_webhook_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  external_order_id text not null,
  delivery_status text not null,
  payload jsonb not null,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  dead_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint serafina_webhook_outbox_event_key_unique unique (event_key),
  constraint serafina_webhook_outbox_payload_object_check check (jsonb_typeof(payload) = 'object'),
  constraint serafina_webhook_outbox_attempts_nonnegative_check check (attempts >= 0)
);

create index if not exists idx_serafina_webhook_outbox_pending
  on public.serafina_webhook_outbox(next_attempt_at, created_at)
  where sent_at is null and dead_at is null;

create index if not exists idx_serafina_webhook_outbox_delivery
  on public.serafina_webhook_outbox(delivery_id, created_at desc);

alter table public.serafina_webhook_outbox enable row level security;

revoke all on public.serafina_webhook_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.serafina_webhook_outbox to service_role;

drop policy if exists serafina_webhook_outbox_no_client_access
  on public.serafina_webhook_outbox;
create policy serafina_webhook_outbox_no_client_access
  on public.serafina_webhook_outbox
  for all
  to anon, authenticated
  using (false)
  with check (false);

create or replace function public.enqueue_serafina_delivery_webhook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_external_order_id text;
  v_serafina_status text;
  v_event_key text;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  v_serafina_status := case new.status
    when 'available' then 'searching_driver'
    when 'accepted' then 'accepted'
    when 'heading_to_pickup' then 'accepted'
    when 'at_pickup' then 'accepted'
    when 'heading_to_dropoff' then 'on_the_way'
    when 'at_dropoff' then 'on_the_way'
    when 'completed' then 'delivered'
    when 'cancelled' then 'cancelled'
    when 'canceled' then 'cancelled'
    else null
  end;

  if v_serafina_status is null then
    return new;
  end if;

  select so.external_order_id
    into v_external_order_id
  from public.store_orders as so
  where so.delivery_id = new.id
    and lower(coalesce(so.source_metadata ->> 'webhook_target', '')) = 'serafina'
  limit 1;

  if v_external_order_id is null or btrim(v_external_order_id) = '' then
    return new;
  end if;

  v_event_key := concat(
    'delivery:',
    new.id::text,
    ':',
    new.status,
    ':',
    pg_catalog.txid_current()::text
  );

  insert into public.serafina_webhook_outbox (
    event_key,
    delivery_id,
    external_order_id,
    delivery_status,
    payload,
    next_attempt_at
  )
  values (
    v_event_key,
    new.id,
    v_external_order_id,
    v_serafina_status,
    pg_catalog.jsonb_build_object(
      'external_order_id', v_external_order_id,
      'delivery_id', new.id::text,
      'status', v_serafina_status
    ),
    pg_catalog.now()
  )
  on conflict (event_key) do nothing;

  return new;
end;
$$;

revoke all on function public.enqueue_serafina_delivery_webhook()
  from public, anon, authenticated;

drop trigger if exists trg_enqueue_serafina_delivery_webhook
  on public.deliveries;
create trigger trg_enqueue_serafina_delivery_webhook
after update of status on public.deliveries
for each row
execute function public.enqueue_serafina_delivery_webhook();

create or replace function public.claim_serafina_webhook_outbox(
  p_limit integer default 25
)
returns setof public.serafina_webhook_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception 'LIMITE_INVALIDO' using errcode = '22023';
  end if;

  return query
  with claimable as (
    select outbox.id
    from public.serafina_webhook_outbox as outbox
    where outbox.sent_at is null
      and outbox.dead_at is null
      and outbox.next_attempt_at <= pg_catalog.now()
      and (
        outbox.locked_at is null
        or outbox.locked_at < pg_catalog.now() - interval '2 minutes'
      )
    order by outbox.next_attempt_at, outbox.created_at
    for update skip locked
    limit p_limit
  )
  update public.serafina_webhook_outbox as outbox
  set
    locked_at = pg_catalog.now(),
    attempts = outbox.attempts + 1,
    updated_at = pg_catalog.now()
  from claimable
  where outbox.id = claimable.id
  returning outbox.*;
end;
$$;

revoke all on function public.claim_serafina_webhook_outbox(integer)
  from public, anon, authenticated;
grant execute on function public.claim_serafina_webhook_outbox(integer)
  to service_role;
