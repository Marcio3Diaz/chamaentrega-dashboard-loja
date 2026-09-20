-- Permite que o Portal da Loja receba atualizações de localização dos entregadores em tempo real.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'couriers'
  ) then
    alter publication supabase_realtime add table public.couriers;
  end if;
end
$$;
