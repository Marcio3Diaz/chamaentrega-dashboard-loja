-- Harden prepaid wallet capture/reservation flow.
-- Reserves the fee for any billable delivery state and captures exactly once on completion.

create unique index if not exists uq_store_wallet_delivery_completed_debit
  on public.store_wallet_transactions(reference_type, reference_id, transaction_type)
  where transaction_type = 'delivery_payment' and status = 'completed';

create or replace function public.sync_store_wallet_for_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.store_wallets%rowtype;
  v_reservation public.store_wallet_reservations%rowtype;
  v_available numeric(12,2);
  v_before numeric(12,2);
  v_after numeric(12,2);
  v_delta numeric(12,2);
begin
  if tg_op = 'UPDATE'
     and old.delivery_fee is distinct from new.delivery_fee then

    select *
      into v_reservation
      from public.store_wallet_reservations
     where delivery_id = new.id
       and status = 'reserved'
     for update;

    if v_reservation.id is not null then
      select *
        into v_wallet
        from public.store_wallets
       where id = v_reservation.wallet_id
       for update;

      if coalesce(new.delivery_fee,0) <= 0 then
        update public.store_wallets
           set reserved_balance = greatest(reserved_balance - v_reservation.amount,0),
               updated_at = now()
         where id = v_wallet.id;

        update public.store_wallet_reservations
           set status = 'released',
               released_at = now(),
               updated_at = now(),
               metadata = coalesce(metadata,'{}'::jsonb) ||
                 jsonb_build_object('released_reason','delivery_fee_zero')
         where id = v_reservation.id;
      else
        v_delta := new.delivery_fee - v_reservation.amount;

        if v_delta > 0
           and (v_wallet.balance - v_wallet.reserved_balance) < v_delta then
          raise exception 'Saldo insuficiente para aumentar a taxa desta entrega.'
            using errcode = 'P0001';
        end if;

        update public.store_wallets
           set reserved_balance = greatest(reserved_balance + v_delta,0),
               updated_at = now()
         where id = v_wallet.id;

        update public.store_wallet_reservations
           set amount = new.delivery_fee,
               updated_at = now()
         where id = v_reservation.id;
      end if;
    end if;
  end if;

  if new.status in ('cancelled','expired')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then

    select *
      into v_reservation
      from public.store_wallet_reservations
     where delivery_id = new.id
       and status = 'reserved'
     for update;

    if v_reservation.id is not null then
      select *
        into v_wallet
        from public.store_wallets
       where id = v_reservation.wallet_id
       for update;

      update public.store_wallets
         set reserved_balance = greatest(reserved_balance - v_reservation.amount,0),
             updated_at = now()
       where id = v_wallet.id;

      update public.store_wallet_reservations
         set status = 'released',
             released_at = now(),
             updated_at = now(),
             metadata = coalesce(metadata,'{}'::jsonb) ||
               jsonb_build_object('released_by_status',new.status)
       where id = v_reservation.id;
    end if;

    return new;
  end if;

  if new.status in (
       'available','negotiating','accepted','heading_to_pickup',
       'at_pickup','heading_to_dropoff','at_dropoff','completed'
     )
     and coalesce(new.delivery_fee,0) > 0 then

    insert into public.store_wallets(store_id)
    values (new.store_id)
    on conflict (store_id) do nothing;

    select *
      into v_wallet
      from public.store_wallets
     where store_id = new.store_id
     for update;

    if v_wallet.id is null then
      raise exception 'Carteira da loja não encontrada.';
    end if;

    select *
      into v_reservation
      from public.store_wallet_reservations
     where delivery_id = new.id
     for update;

    if v_reservation.id is null or v_reservation.status = 'released' then
      v_available := v_wallet.balance - v_wallet.reserved_balance;

      if v_available < new.delivery_fee then
        raise exception 'Saldo insuficiente na carteira pré-paga. Disponível: R$ %, necessário: R$ %.',
          to_char(greatest(v_available,0),'FM999999990D00'),
          to_char(new.delivery_fee,'FM999999990D00')
          using errcode = 'P0001';
      end if;

      update public.store_wallets
         set reserved_balance = reserved_balance + new.delivery_fee,
             updated_at = now()
       where id = v_wallet.id;

      if v_reservation.id is null then
        insert into public.store_wallet_reservations(
          wallet_id,store_id,delivery_id,amount,status,metadata
        )
        values (
          v_wallet.id,new.store_id,new.id,new.delivery_fee,'reserved',
          jsonb_build_object('reserved_from_status',new.status,'reserved_at',now())
        )
        returning * into v_reservation;
      else
        update public.store_wallet_reservations
           set wallet_id = v_wallet.id,
               amount = new.delivery_fee,
               status = 'reserved',
               updated_at = now(),
               captured_at = null,
               released_at = null,
               metadata = coalesce(metadata,'{}'::jsonb) ||
                 jsonb_build_object('re_reserved_from_status',new.status,'re_reserved_at',now())
         where id = v_reservation.id
         returning * into v_reservation;
      end if;
    elsif v_reservation.status = 'captured' then
      return new;
    end if;
  end if;

  if new.status = 'completed'
     and (tg_op = 'INSERT' or old.status is distinct from 'completed')
     and coalesce(new.delivery_fee,0) > 0 then

    select *
      into v_reservation
      from public.store_wallet_reservations
     where delivery_id = new.id
       and status = 'reserved'
     for update;

    if v_reservation.id is null then
      raise exception 'Não foi possível localizar a reserva financeira desta entrega.'
        using errcode = 'P0001';
    end if;

    select *
      into v_wallet
      from public.store_wallets
     where id = v_reservation.wallet_id
     for update;

    if v_wallet.balance < v_reservation.amount then
      raise exception 'Saldo inconsistente para concluir cobrança da entrega.'
        using errcode = 'P0001';
    end if;

    v_before := v_wallet.balance;
    v_after := v_before - v_reservation.amount;

    update public.store_wallets
       set balance = v_after,
           reserved_balance = greatest(reserved_balance - v_reservation.amount,0),
           updated_at = now()
     where id = v_wallet.id;

    insert into public.store_wallet_transactions(
      wallet_id,store_id,transaction_type,direction,amount,status,
      description,reference_type,reference_id,balance_before,balance_after,
      metadata,completed_at
    )
    values (
      v_wallet.id,new.store_id,'delivery_payment','debit',
      v_reservation.amount,'completed',
      'Pagamento da entrega #' || upper(left(replace(new.id::text,'-',''),7)),
      'delivery',new.id::text,v_before,v_after,
      jsonb_build_object(
        'delivery_id',new.id,
        'captured_from_reservation',v_reservation.id,
        'captured_on_status','completed'
      ),
      now()
    );

    update public.store_wallet_reservations
       set status = 'captured',
           captured_at = now(),
           updated_at = now(),
           metadata = coalesce(metadata,'{}'::jsonb) ||
             jsonb_build_object('captured_at',now())
     where id = v_reservation.id;
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

do $$
declare
  r record;
  v_wallet public.store_wallets%rowtype;
  v_reservation public.store_wallet_reservations%rowtype;
begin
  for r in
    select d.id,d.store_id,d.delivery_fee,d.status
      from public.deliveries d
     where d.status in (
       'available','negotiating','accepted','heading_to_pickup',
       'at_pickup','heading_to_dropoff','at_dropoff'
     )
       and coalesce(d.delivery_fee,0) > 0
     order by d.store_id,d.created_at,d.id
  loop
    insert into public.store_wallets(store_id)
    values (r.store_id)
    on conflict (store_id) do nothing;

    select *
      into v_wallet
      from public.store_wallets
     where store_id = r.store_id
     for update;

    select *
      into v_reservation
      from public.store_wallet_reservations
     where delivery_id = r.id
     for update;

    if v_reservation.id is null or v_reservation.status = 'released' then
      if (v_wallet.balance - v_wallet.reserved_balance) >= r.delivery_fee then
        update public.store_wallets
           set reserved_balance = reserved_balance + r.delivery_fee,
               updated_at = now()
         where id = v_wallet.id;

        if v_reservation.id is null then
          insert into public.store_wallet_reservations(
            wallet_id,store_id,delivery_id,amount,status,metadata
          )
          values (
            v_wallet.id,r.store_id,r.id,r.delivery_fee,'reserved',
            jsonb_build_object('backfilled',true,'reserved_from_status',r.status,'reserved_at',now())
          );
        else
          update public.store_wallet_reservations
             set wallet_id = v_wallet.id,
                 amount = r.delivery_fee,
                 status = 'reserved',
                 updated_at = now(),
                 captured_at = null,
                 released_at = null,
                 metadata = coalesce(metadata,'{}'::jsonb) ||
                   jsonb_build_object('backfilled',true,'re_reserved_from_status',r.status,'re_reserved_at',now())
           where id = v_reservation.id;
        end if;
      end if;
    end if;
  end loop;
end;
$$;
