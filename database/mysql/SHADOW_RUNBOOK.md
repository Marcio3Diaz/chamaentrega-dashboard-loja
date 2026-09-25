# MySQL shadow-run runbook

This runbook deliberately keeps Supabase as the production source of truth.

## 1. Prepare an isolated MySQL 8.0.21+ database

Apply, in order:

1. `database/mysql/schema.sql`
2. `database/mysql/002_runtime_foundation.sql`
3. `database/mysql/003_mysql_compatibility_fixes.sql`
4. `database/mysql/004_text_capacity.sql`

Do not point the apps at MySQL yet.

## 2. Configure the parallel API

Inside `services/chamaentrega-api`, create a local/server environment from `.env.example`.

Keep:

```text
FCM_WORKER_ENABLED=false
```

for the first bootstrap.

## 3. Copy only the operational baseline

The bootstrap copies identities and operational configuration needed to test a new delivery without copying historical customer deliveries/messages:

- profiles;
- organizations;
- stores;
- organization/store memberships;
- couriers;
- private courier/store network links;
- store wallets;
- courier delivery batches;
- active deliveries and active wallet reservations (to preserve `reserved_balance` consistency);
- courier FCM tokens;
- delivery pricing;
- platform billing settings.

Run:

```bash
MIGRATION_BOOTSTRAP_CONFIRM=COPY_OPERATIONAL_BASELINE npm run bootstrap:shadow
```

The source secret stays server-side and is never written to the repository.

## 4. Start the MySQL API

Run the API and verify:

```text
GET /health
```

The dashboard can also check the bridge endpoint:

```text
GET /api/migration/mysql/health
```

## 5. Test an isolated delivery

Call `POST /v1/internal/deliveries` with a unique `Idempotency-Key`.

Expected atomic result:

```text
delivery available
      +
wallet fee reserved
      +
wallet reservation row
      +
delivery.available outbox event
```

A failure must roll back the whole transaction.

## 6. Test FCM separately

Only in the isolated test environment:

```text
FCM_WORKER_ENABLED=true
```

The worker must deliver the same payload contract used by the current courier app. Avoid running the Supabase notification path and the MySQL worker against the same production courier token at the same time, otherwise the courier can receive duplicate notifications during migration testing.

## 7. Enable dashboard shadow write

Only after the isolated test passes, configure the dashboard server:

```text
CHAMA_MIGRATION_API_URL=http://<mysql-api-host>:3301
CHAMA_MIGRATION_API_KEY=<same internal API key>
CHAMA_MYSQL_SHADOW_WRITE=true
```

Behavior is intentionally fail-open:

1. production delivery is written to Supabase;
2. integrated order linking completes;
3. the same delivery UUID is sent to MySQL;
4. if MySQL fails, the production delivery remains valid and the failure is logged.

During this phase, **do not enable the MySQL FCM worker for normal production deliveries**. Shadow write is for data/transaction parity first.

## 8. Cutover gate

Do not switch source of truth until these flows have parity:

- create/publish delivery;
- wallet reserve/release/capture;
- accept/reject;
- up to 3 simultaneous route deliveries;
- status/location progression;
- cancel/expire;
- completion/payment;
- push notifications;
- private network;
- authentication and authorization;
- realtime dashboard/app updates.

After parity, perform a final synchronized data copy and only then change runtime reads/writes.
