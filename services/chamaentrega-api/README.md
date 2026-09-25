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


## Delivery command API

The MySQL migration API now contains the courier/store command flow that will eventually replace the corresponding Supabase RPC/trigger behavior.

All routes below currently use the internal migration key. They are **not yet exposed directly to the mobile app**; mobile authentication/authorization will be added before cutover.

- `POST /v1/internal/deliveries/:id/accept` — accepts an available delivery, assigns/creates the courier batch and enforces the maximum of 3 active deliveries.
- `POST /v1/internal/deliveries/:id/reject` — records the rejection and reopens a targeted offer to the network.
- `POST /v1/internal/deliveries/:id/status` — only permits the sequence `accepted -> heading_to_pickup -> at_pickup -> heading_to_dropoff -> at_dropoff -> completed`.
- `POST /v1/internal/deliveries/:id/location` — records live courier coordinates only for an active delivery assigned to that courier.
- `POST /v1/internal/deliveries/:id/cancel` — store-side cancellation with wallet reservation release.
- `POST /v1/internal/dispatch-route` — targets 1 to 3 dispatchable deliveries to a connected online courier, reserves any missing wallet amounts and emits one notification event per delivery.

On `completed`, the delivery fee is captured exactly once from the reserved store balance inside the same MySQL transaction. On `cancelled` or automatic `expired`, the reservation is released.

## Delivery maintenance

A disabled-by-default maintenance worker expires stale `available/negotiating` deliveries and releases their wallet reservations.

```text
DELIVERY_MAINTENANCE_ENABLED=false
```

Keep it disabled while Supabase is still the production source of truth.
