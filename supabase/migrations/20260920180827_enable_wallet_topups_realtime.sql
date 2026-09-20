do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='store_wallet_topups'
  ) then
    alter publication supabase_realtime add table public.store_wallet_topups;
  end if;
end $$;
