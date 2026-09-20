create index if not exists idx_store_wallet_reservations_wallet_id
on public.store_wallet_reservations(wallet_id);

create index if not exists idx_store_wallet_topups_wallet_id
on public.store_wallet_topups(wallet_id);
