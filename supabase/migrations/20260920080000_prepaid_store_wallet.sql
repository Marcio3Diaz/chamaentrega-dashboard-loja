-- Carteira pré-paga das lojas ChamaEntrega
-- Aplicada em produção em 20/09/2026.

create table if not exists public.store_wallet_reservations (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.store_wallets(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  delivery_id uuid not null unique references public.deliveries(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'reserved' check (status in ('reserved','captured','released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  captured_at timestamptz,
  released_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.store_wallet_topups (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.store_wallets(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null default 'woovi',
  correlation_id text not null unique,
  provider_charge_id text,
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','paid','expired','cancelled','failed')),
  br_code text,
  qr_code_image_url text,
  payment_link_url text,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  expires_at timestamptz
);

create index if not exists idx_wallet_reservations_store_status
  on public.store_wallet_reservations(store_id,status,created_at desc);
create index if not exists idx_wallet_topups_store_status
  on public.store_wallet_topups(store_id,status,created_at desc);

alter table public.store_wallet_reservations enable row level security;
alter table public.store_wallet_topups enable row level security;

drop policy if exists store_owner_select_wallet_reservations on public.store_wallet_reservations;
create policy store_owner_select_wallet_reservations
on public.store_wallet_reservations for select to authenticated
using (
  exists (
    select 1 from public.stores s
    where s.id = store_wallet_reservations.store_id
      and s.owner_id = (select auth.uid())
  )
);

drop policy if exists store_owner_select_wallet_topups on public.store_wallet_topups;
create policy store_owner_select_wallet_topups
on public.store_wallet_topups for select to authenticated
using (
  exists (
    select 1 from public.stores s
    where s.id = store_wallet_topups.store_id
      and s.owner_id = (select auth.uid())
  )
);

revoke all on public.store_wallet_reservations from anon, authenticated;
revoke all on public.store_wallet_topups from anon, authenticated;
grant select on public.store_wallet_reservations to authenticated;
grant select on public.store_wallet_topups to authenticated;

create or replace function public.sync_store_wallet_for_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.store_wallets%rowtype;
  v_res public.store_wallet_reservations%rowtype;
  v_available numeric(12,2);
  v_before numeric(12,2);
  v_after numeric(12,2);
  v_delta numeric(12,2);
begin
  if new.status='available'
     and (tg_op='INSERT' or old.status is distinct from 'available') then
    insert into public.store_wallets(store_id)
    values(new.store_id)
    on conflict(store_id) do nothing;

    select * into v_wallet
    from public.store_wallets
    where store_id=new.store_id
    for update;

    select * into v_res
    from public.store_wallet_reservations
    where delivery_id=new.id
    for update;

    if v_res.id is not null and v_res.status='captured' then
      raise exception 'Esta entrega já foi cobrada na carteira.';
    end if;

    if v_res.id is null or v_res.status='released' then
      v_available := v_wallet.balance-v_wallet.reserved_balance;
      if v_available < new.delivery_fee then
        raise exception 'Saldo insuficiente na carteira pré-paga. Disponível: R$ %, necessário: R$ %.',
          to_char(greatest(v_available,0),'FM999999990D00'),
          to_char(new.delivery_fee,'FM999999990D00')
          using errcode='P0001';
      end if;

      update public.store_wallets
      set reserved_balance=reserved_balance+new.delivery_fee,updated_at=now()
      where id=v_wallet.id;

      if v_res.id is null then
        insert into public.store_wallet_reservations(
          wallet_id,store_id,delivery_id,amount,status,metadata
        ) values(
          v_wallet.id,new.store_id,new.id,new.delivery_fee,'reserved',
          jsonb_build_object('reserved_from_status','available')
        );
      else
        update public.store_wallet_reservations
        set wallet_id=v_wallet.id,amount=new.delivery_fee,status='reserved',
            updated_at=now(),captured_at=null,released_at=null
        where id=v_res.id;
      end if;
    end if;
  end if;

  if tg_op='UPDATE' and old.delivery_fee is distinct from new.delivery_fee then
    select * into v_res
    from public.store_wallet_reservations
    where delivery_id=new.id and status='reserved'
    for update;

    if v_res.id is not null then
      select * into v_wallet from public.store_wallets
      where id=v_res.wallet_id for update;

      v_delta := new.delivery_fee-v_res.amount;
      if v_delta>0 and (v_wallet.balance-v_wallet.reserved_balance)<v_delta then
        raise exception 'Saldo insuficiente para aumentar a taxa desta entrega.'
          using errcode='P0001';
      end if;

      update public.store_wallets
      set reserved_balance=greatest(reserved_balance+v_delta,0),updated_at=now()
      where id=v_wallet.id;

      update public.store_wallet_reservations
      set amount=new.delivery_fee,updated_at=now()
      where id=v_res.id;
    end if;
  end if;

  if new.status in ('cancelled','expired')
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    select * into v_res
    from public.store_wallet_reservations
    where delivery_id=new.id and status='reserved'
    for update;

    if v_res.id is not null then
      update public.store_wallets
      set reserved_balance=greatest(reserved_balance-v_res.amount,0),updated_at=now()
      where id=v_res.wallet_id;

      update public.store_wallet_reservations
      set status='released',released_at=now(),updated_at=now()
      where id=v_res.id;
    end if;
  end if;

  if new.status='completed'
     and (tg_op='INSERT' or old.status is distinct from 'completed') then
    select * into v_res
    from public.store_wallet_reservations
    where delivery_id=new.id and status='reserved'
    for update;

    if v_res.id is not null then
      select * into v_wallet from public.store_wallets
      where id=v_res.wallet_id for update;

      v_before:=v_wallet.balance;
      v_after:=v_before-v_res.amount;

      update public.store_wallets
      set balance=v_after,
          reserved_balance=greatest(reserved_balance-v_res.amount,0),
          updated_at=now()
      where id=v_wallet.id;

      insert into public.store_wallet_transactions(
        wallet_id,store_id,transaction_type,direction,amount,status,
        description,reference_type,reference_id,balance_before,balance_after,
        metadata,completed_at
      ) values(
        v_wallet.id,new.store_id,'delivery_payment','debit',v_res.amount,'completed',
        'Pagamento da entrega #'||upper(left(replace(new.id::text,'-',''),7)),
        'delivery',new.id::text,v_before,v_after,
        jsonb_build_object('delivery_id',new.id,'captured_from_reservation',v_res.id),
        now()
      );

      update public.store_wallet_reservations
      set status='captured',captured_at=now(),updated_at=now()
      where id=v_res.id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists deliveries_sync_store_wallet on public.deliveries;
create trigger deliveries_sync_store_wallet
after insert or update of status,delivery_fee on public.deliveries
for each row execute function public.sync_store_wallet_for_delivery();

revoke execute on function public.sync_store_wallet_for_delivery()
from public,anon,authenticated;

create or replace function public.complete_store_wallet_topup(
  p_correlation_id text,
  p_provider_charge_id text default null,
  p_provider_payload jsonb default '{}'::jsonb
)
returns table(topup_id uuid,store_id uuid,amount numeric,new_balance numeric)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_topup public.store_wallet_topups%rowtype;
  v_wallet public.store_wallets%rowtype;
  v_before numeric(12,2);
  v_after numeric(12,2);
begin
  select * into v_topup
  from public.store_wallet_topups
  where correlation_id=p_correlation_id
  for update;

  if v_topup.id is null then raise exception 'Recarga não encontrada.'; end if;

  select * into v_wallet from public.store_wallets
  where id=v_topup.wallet_id for update;

  if v_topup.status='paid' then
    return query select v_topup.id,v_topup.store_id,v_topup.amount,v_wallet.balance;
    return;
  end if;

  if v_topup.status not in ('pending','failed') then
    raise exception 'Recarga não pode ser confirmada no status atual.';
  end if;

  v_before:=v_wallet.balance;
  v_after:=v_before+v_topup.amount;

  update public.store_wallets
  set balance=v_after,updated_at=now()
  where id=v_wallet.id;

  insert into public.store_wallet_transactions(
    wallet_id,store_id,transaction_type,direction,amount,status,
    description,reference_type,reference_id,balance_before,balance_after,
    metadata,completed_at
  ) values(
    v_wallet.id,v_topup.store_id,'deposit','credit',v_topup.amount,'completed',
    'Recarga via Pix','wallet_topup',v_topup.id::text,v_before,v_after,
    jsonb_build_object(
      'correlation_id',v_topup.correlation_id,
      'provider',v_topup.provider,
      'provider_charge_id',p_provider_charge_id
    )||coalesce(p_provider_payload,'{}'::jsonb),
    now()
  );

  update public.store_wallet_topups
  set status='paid',
      provider_charge_id=coalesce(p_provider_charge_id,provider_charge_id),
      provider_payload=coalesce(provider_payload,'{}'::jsonb)||coalesce(p_provider_payload,'{}'::jsonb),
      paid_at=now(),updated_at=now()
  where id=v_topup.id;

  return query select v_topup.id,v_topup.store_id,v_topup.amount,v_after;
end;
$$;

revoke execute on function public.complete_store_wallet_topup(text,text,jsonb)
from public,anon,authenticated;
grant execute on function public.complete_store_wallet_topup(text,text,jsonb)
to service_role;
