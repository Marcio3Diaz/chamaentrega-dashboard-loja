-- Permite que apenas a Edge Function, via service_role, leia o segredo
-- de autenticação do worker guardado no Supabase Vault.

create or replace function public.get_serafina_outbox_worker_secret()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select secret.decrypted_secret
  from vault.decrypted_secrets as secret
  where secret.name = 'serafina_outbox_worker_secret'
  order by secret.created_at desc
  limit 1;
$$;

revoke all on function public.get_serafina_outbox_worker_secret()
  from public, anon, authenticated;
grant execute on function public.get_serafina_outbox_worker_secret()
  to service_role;
