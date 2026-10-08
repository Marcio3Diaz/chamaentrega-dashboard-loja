-- Agenda o processamento resiliente da outbox Serafina a cada minuto.
-- Os valores sensíveis ficam no Supabase Vault e nunca são versionados.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

create or replace function private.invoke_serafina_outbox_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker_url text;
  v_worker_secret text;
  v_request_id bigint;
begin
  select secret.decrypted_secret
    into v_worker_url
  from vault.decrypted_secrets as secret
  where secret.name = 'serafina_outbox_worker_url'
  order by secret.created_at desc
  limit 1;

  select secret.decrypted_secret
    into v_worker_secret
  from vault.decrypted_secrets as secret
  where secret.name = 'serafina_outbox_worker_secret'
  order by secret.created_at desc
  limit 1;

  if v_worker_url is null or btrim(v_worker_url) = '' then
    raise warning 'Vault secret serafina_outbox_worker_url não configurado.';
    return;
  end if;

  if v_worker_secret is null or btrim(v_worker_secret) = '' then
    raise warning 'Vault secret serafina_outbox_worker_secret não configurado.';
    return;
  end if;

  if v_worker_url !~ '^https://[^[:space:]]+$' then
    raise warning 'serafina_outbox_worker_url deve usar HTTPS.';
    return;
  end if;

  select net.http_post(
    url := v_worker_url,
    headers := pg_catalog.jsonb_build_object(
      'content-type', 'application/json',
      'x-serafina-outbox-worker-secret', v_worker_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  )
  into v_request_id;

  if v_request_id is null then
    raise warning 'pg_net não retornou request id ao chamar worker Serafina.';
  end if;
exception
  when others then
    -- O cron não deve ser desativado por uma falha transitória de rede/Vault.
    raise warning 'Falha ao invocar worker da outbox Serafina: %', sqlerrm;
end;
$$;

revoke all on function private.invoke_serafina_outbox_worker()
  from public, anon, authenticated;

-- Mantém exatamente um agendamento ativo com esse nome.
do $$
declare
  v_job_id bigint;
begin
  select job.jobid
    into v_job_id
  from cron.job as job
  where job.jobname = 'serafina-webhook-outbox-every-minute'
  order by job.jobid desc
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'serafina-webhook-outbox-every-minute',
    '* * * * *',
    'select private.invoke_serafina_outbox_worker();'
  );
end;
$$;
