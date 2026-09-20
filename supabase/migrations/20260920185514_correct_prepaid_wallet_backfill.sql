-- Correct one-time backfill: release stale historic deliveries and reserve only today's live deliveries.

do $$
declare
  r record;
  v_wallet public.store_wallets%rowtype;
  v_reservation public.store_wallet_reservations%rowtype;
begin
  for r in
    select id,wallet_id,amount
      from public.store_wallet_reservations
     where status='reserved'
       and coalesce((metadata->>'backfilled')::boolean,false)=true
  loop
    update public.store_wallets
       set reserved_balance = greatest(reserved_balance - r.amount,0),
           updated_at = now()
     where id = r.wallet_id;

    update public.store_wallet_reservations
       set status='released',
           released_at=now(),
           updated_at=now(),
           metadata=coalesce(metadata,'{}'::jsonb) ||
             jsonb_build_object('released_reason','stale_backfill_correction')
     where id=r.id;
  end loop;

  for r in
    select d.id,d.store_id,d.delivery_fee,d.status
      from public.deliveries d
     where d.status in (
       'available','negotiating','accepted','heading_to_pickup',
       'at_pickup','heading_to_dropoff','at_dropoff'
     )
       and coalesce(d.delivery_fee,0) > 0
       and d.created_at >= date_trunc('day',now())
     order by
       case d.status
         when 'at_dropoff' then 1
         when 'heading_to_dropoff' then 2
         when 'at_pickup' then 3
         when 'heading_to_pickup' then 4
         when 'accepted' then 5
         when 'negotiating' then 6
         when 'available' then 7
         else 8
       end,
       d.created_at,
       d.id
  loop
    insert into public.store_wallets(store_id)
    values (r.store_id)
    on conflict (store_id) do nothing;

    select *
      into v_wallet
      from public.store_wallets
     where store_id=r.store_id
     for update;

    select *
      into v_reservation
      from public.store_wallet_reservations
     where delivery_id=r.id
     for update;

    if v_reservation.id is null or v_reservation.status='released' then
      if (v_wallet.balance-v_wallet.reserved_balance) >= r.delivery_fee then
        update public.store_wallets
           set reserved_balance=reserved_balance+r.delivery_fee,
               updated_at=now()
         where id=v_wallet.id;

        if v_reservation.id is null then
          insert into public.store_wallet_reservations(
            wallet_id,store_id,delivery_id,amount,status,metadata
          )
          values(
            v_wallet.id,r.store_id,r.id,r.delivery_fee,'reserved',
            jsonb_build_object(
              'backfilled',true,
              'backfill_scope','current_day',
              'reserved_from_status',r.status,
              'reserved_at',now()
            )
          );
        else
          update public.store_wallet_reservations
             set wallet_id=v_wallet.id,
                 amount=r.delivery_fee,
                 status='reserved',
                 captured_at=null,
                 released_at=null,
                 updated_at=now(),
                 metadata=coalesce(metadata,'{}'::jsonb) ||
                   jsonb_build_object(
                     'backfilled',true,
                     'backfill_scope','current_day',
                     're_reserved_from_status',r.status,
                     're_reserved_at',now()
                   )
           where id=v_reservation.id;
        end if;
      end if;
    end if;
  end loop;
end;
$$;
