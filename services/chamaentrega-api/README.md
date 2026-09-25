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


## Delivery command and read API

The MySQL migration API now has the operational delivery lifecycle prepared:

- accept and reject offers;
- enforce at most 3 simultaneous active deliveries per courier;
- create/maintain courier delivery batches;
- advance status in the approved sequence;
- record courier location points;
- cancel deliveries and release wallet reservations;
- expire stale offers automatically;
- capture the reserved delivery fee only when the delivery completes;
- write lifecycle events to the transactional outbox;
- read one delivery with its status history;
- list a courier's active deliveries;
- list a store's live deliveries.

Internal endpoints:

```text
POST /v1/internal/deliveries/:id/accept
POST /v1/internal/deliveries/:id/reject
POST /v1/internal/deliveries/:id/status
POST /v1/internal/deliveries/:id/cancel
POST /v1/internal/deliveries/:id/location
POST /v1/internal/dispatch-route

GET  /v1/internal/deliveries/:id
GET  /v1/internal/couriers/:id/active-deliveries
GET  /v1/internal/stores/:id/live-deliveries
```

All endpoints remain migration-only and require the internal API key. Production apps are not switched to these routes yet.


## Migration-native auth and realtime

The migration API now has an authentication/realtime layer that can eventually replace Supabase Auth + Realtime without changing production yet.

### Session bridge

The dashboard still authenticates with Supabase during migration. A verified dashboard session can call:

```text
POST /api/migration/session
```

That server-side bridge asks the migration API to mint a short-lived bearer session. Only the SHA-256 token hash is stored in MySQL.

Migration API endpoints:

```text
POST /v1/auth/exchange/supabase
POST /v1/internal/auth/sessions
POST /v1/internal/auth/sessions/revoke
GET  /v1/session
```

### Bearer-authorized API

Prepared for future direct use by dashboard/courier clients:

```text
GET  /v1/deliveries/:id
GET  /v1/couriers/me/offers
GET  /v1/couriers/me/active-deliveries
GET  /v1/stores/:storeId/live-deliveries
GET  /v1/stores/:storeId/couriers

POST /v1/stores/:storeId/deliveries
POST /v1/deliveries/:id/accept
POST /v1/deliveries/:id/reject
POST /v1/deliveries/:id/status
POST /v1/deliveries/:id/location
POST /v1/stores/:storeId/deliveries/:id/cancel
POST /v1/stores/:storeId/dispatch-route
POST /v1/stores/:storeId/courier-network/review
```

Courier offer reads redact customer phone and notes until that courier owns the delivery.

### WebSocket protocol

Endpoint:

```text
ws(s)://<api-host>/realtime
```

Browser origins must be explicitly configured with `REALTIME_ALLOWED_ORIGINS`.

After connect:

```json
{"type":"auth","token":"<short-lived bearer token>"}
```

Then subscribe:

```json
{"type":"subscribe","channel":"store:<store-uuid>"}
{"type":"subscribe","channel":"courier:<courier-uuid>"}
{"type":"subscribe","channel":"courier_pool"}
```

- store sessions may subscribe only to stores they own/belong to;
- courier sessions may subscribe to their own courier channel and the open courier pool;
- admin sessions may subscribe to admin/store/courier channels;
- lifecycle events are inserted transactionally in `realtime_events`;
- open non-targeted delivery offers are broadcast to `courier_pool`;
- targeted offers are sent only to that courier channel;
- the browser bridge remains disabled unless `NEXT_PUBLIC_CHAMA_MIGRATION_REALTIME=true`.

Supabase remains the production identity/realtime provider until parity testing and cutover approval.


### Courier-app migration exchange

While Supabase remains the login provider, the courier app can exchange its current Supabase access token for a short-lived ChamaEntrega API bearer token:

```http
POST /v1/auth/exchange/supabase
Authorization: Bearer <current Supabase access token>
```

The migration API validates that token through Supabase Auth, resolves the user's operational role from MySQL, and mints a scoped API session. This exchange is rate-limited and does not require the internal ChamaEntrega key.

After exchange, a courier can use:

```text
GET  /v1/couriers/me/offers
GET  /v1/couriers/me/active-deliveries
POST /v1/deliveries/:id/accept
POST /v1/deliveries/:id/reject
POST /v1/deliveries/:id/status
POST /v1/deliveries/:id/location
WebSocket /realtime -> courier:<id> + courier_pool
```


### Dashboard dual-realtime

The existing store courier panel and live map now contain an opt-in migration WebSocket client. With:

```text
NEXT_PUBLIC_CHAMA_MIGRATION_REALTIME=true
```

the dashboard keeps its existing Supabase channels **and** opens the migration WebSocket in parallel.

- delivery/network events trigger the existing Supabase refresh path;
- MySQL location events update courier markers immediately;
- live-map route points are deduplicated if the same point also arrives through Supabase;
- disabling the flag restores the current Supabase-only behavior with no runtime change.

This is intentionally dual-run first; removing Supabase channels is a later cutover step.


### Store courier snapshot

The migration API can now return the store's private courier network in one server-authorized snapshot:

```text
GET /v1/stores/:storeId/couriers
GET /v1/internal/stores/:storeId/couriers
```

The response contains:

- connected couriers;
- pending network requests;
- online/available state;
- rating and total deliveries;
- latest GPS position;
- the most recent active delivery for each connected courier.

The dashboard's **Entregadores**, **Mapa ao vivo**, and **Despacho** pages can use this snapshot behind `CHAMA_MYSQL_READS`, with automatic Supabase fallback and optional parity logging.
