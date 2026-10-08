# Outbox Serafina — execução automática

A migration `20261008202000_schedule_serafina_webhook_outbox.sql` agenda o worker `process-serafina-webhook-outbox` para rodar a cada minuto com `pg_cron` + `pg_net`.

Os segredos não ficam no SQL nem no GitHub. Antes de aplicar a migration em produção, cadastre no Supabase Vault:

```sql
select vault.create_secret(
  'https://SEU-PROJECT-REF.supabase.co/functions/v1/process-serafina-webhook-outbox',
  'serafina_outbox_worker_url',
  'URL da Edge Function que processa a outbox Serafina'
);

select vault.create_secret(
  'SUBSTITUA-PELO-MESMO-VALOR-DE-SERAFINA_OUTBOX_WORKER_SECRET',
  'serafina_outbox_worker_secret',
  'Segredo usado pelo cron para autenticar o worker da outbox Serafina'
);
```

O segundo valor deve ser exatamente o mesmo configurado como secret da Edge Function:

```text
SERAFINA_OUTBOX_WORKER_SECRET
```

A função agendada exige HTTPS, lê os dois valores diretamente do Vault e envia:

```text
POST /functions/v1/process-serafina-webhook-outbox
Content-Type: application/json
X-Serafina-Outbox-Worker-Secret: <segredo>
```

O cron é instalado com o nome:

```text
serafina-webhook-outbox-every-minute
```

Para conferir o agendamento:

```sql
select jobid, jobname, schedule, active, command
from cron.job
where jobname = 'serafina-webhook-outbox-every-minute';
```

Para conferir execuções recentes:

```sql
select jobid, runid, status, return_message, start_time, end_time
from cron.job_run_details
where jobid = (
  select jobid
  from cron.job
  where jobname = 'serafina-webhook-outbox-every-minute'
  limit 1
)
order by start_time desc
limit 20;
```

Para conferir a fila da Serafina:

```sql
select
  event_key,
  delivery_status,
  attempts,
  next_attempt_at,
  sent_at,
  dead_at,
  last_error
from public.serafina_webhook_outbox
order by created_at desc
limit 50;
```

Nunca versione os valores reais de URL privada, worker secret, service role ou HMAC secret.
