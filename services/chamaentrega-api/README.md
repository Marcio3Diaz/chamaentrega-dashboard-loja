# ChamaEntrega API - MySQL migration service

Parallel API used to move the operational core from Supabase/PostgreSQL to MySQL without cutting over the production apps yet.

## Current slice

- MySQL health check;
- internal create-delivery endpoint;
- wallet reservation in the same transaction as delivery creation;
- idempotency key protection;
- transactional outbox event for the future FCM worker.

## Run locally

1. Apply `database/mysql/schema.sql` to MySQL 8.0.21+.
2. Apply `database/mysql/002_runtime_foundation.sql`.
3. Copy `.env.example` to `.env` and fill the values.
4. Run `npm install` inside this directory.
5. Run `npm test` and then `npm start`.

The dashboard and courier app must remain on Supabase until the shadow/dual-run validation is complete.

## Endpoint

`POST /v1/internal/deliveries`

Required headers:

- `Content-Type: application/json`
- `X-Chama-Internal-Key: ...`
- `Idempotency-Key: <unique request id>`

The endpoint reserves the delivery fee, creates the delivery as `available`, and inserts a `delivery.available` event into `outbox_events`, all in one MySQL transaction.


## FCM outbox worker

Set `FCM_WORKER_ENABLED=true` only in the isolated MySQL environment after copying the courier FCM tokens and configuring `FIREBASE_SERVICE_ACCOUNT_BASE64`.

The worker consumes `outbox_events` and reproduces the current courier-app contract for new deliveries, including the `offers` route, high Android priority, the `chama_nova_entrega` sound and the data-only full-screen path used by devices marked `fullscreen-delivery-v1`.

## Bootstrap operational baseline

Before enabling shadow writes, the isolated MySQL database needs the operational identities used by a delivery: profiles, stores, couriers, wallet rows, private-network links and courier push tokens.

The command is intentionally guarded:

```bash
MIGRATION_BOOTSTRAP_CONFIRM=COPY_OPERATIONAL_BASELINE npm run bootstrap:shadow
```

Required server-only environment variables:

- `MYSQL_URL`
- `SUPABASE_SOURCE_URL`
- `SUPABASE_SOURCE_SECRET_KEY` (preferred) or legacy `SUPABASE_SOURCE_SERVICE_ROLE_KEY`

The bootstrap refuses to write into a non-empty core target unless `MIGRATION_BOOTSTRAP_ALLOW_NONEMPTY=true` is explicitly set.

## Shadow write

The Next.js dashboard contains a fail-open shadow path for **published** deliveries. It is disabled by default with:

```text
CHAMA_MYSQL_SHADOW_WRITE=false
```

When later enabled, Supabase remains the production write. After the Supabase transaction succeeds, the same delivery UUID is copied to the MySQL API. A MySQL failure is logged but never blocks the production delivery during the migration phase.
