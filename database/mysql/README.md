# ChamaEntrega MySQL migration

This directory is the non-destructive migration foundation from Supabase/PostgreSQL to MySQL 8.

### Phase 1 - completed

- inventory of the current public database schema;
- MySQL DDL for all 36 application tables;
- foreign-key conversion (except the current `auth.users` dependency);
- compatible index conversion;
- list of PostgreSQL-only indexes/checks that must be redesigned;
- service migration map.

### Phase 2 - started

The parallel API now lives in `services/chamaentrega-api` and implements the first transactional slice:

- MySQL connectivity health check;
- delivery creation as `available`;
- prepaid wallet reservation in the same transaction;
- idempotency protection;
- transactional outbox event for push dispatch.

### Apply order

1. `schema.sql`
2. `002_runtime_foundation.sql`
3. start `services/chamaentrega-api`
4. verify `/health`
5. only then start shadow/dual-run tests

### Files

- `schema.sql`: MySQL 8 target tables, constraints and portable indexes.
- `002_runtime_foundation.sql`: idempotency and transactional outbox tables.
- `MAPPING.md`: Supabase features and PostgreSQL-only behavior that must move to the API.
- `VALIDATION.md`: source/target conversion report.

> Do not point the production dashboard or courier app at MySQL yet. Supabase remains the source of truth until end-to-end parity is verified.


### Phase 2 - notification worker

The parallel API now also contains a transactional outbox worker for `delivery.available`:

- reads pending `outbox_events` with `FOR UPDATE SKIP LOCKED`;
- resolves a targeted courier or online/available couriers;
- deduplicates sends through `courier_push_dispatches`;
- sends Firebase Cloud Messaging using the same new-delivery data contract used by the current courier app;
- preserves full-screen delivery behavior for devices marked `fullscreen-delivery-v1`;
- retries transient FCM failures and deactivates unregistered device tokens.

The worker is **disabled by default**. Enable it only in the isolated MySQL environment after the Firebase service account and migrated courier push tokens are present.

### Apply order

1. `schema.sql`
2. `002_runtime_foundation.sql`
3. `003_mysql_compatibility_fixes.sql`
4. `004_text_capacity.sql`
5. `005_api_sessions_realtime.sql`
6. start `services/chamaentrega-api`
7. verify `/health`
8. bootstrap the operational baseline into the isolated MySQL database
9. run isolated MySQL delivery + FCM + realtime tests
10. only after parity is proven, enable shadow/dual-run


### Phase 3 - auth bridge and realtime

The migration branch now contains a provider-independent API session layer and an authenticated WebSocket relay.

- `api_sessions` stores only a SHA-256 hash of bearer tokens;
- sessions have expiry, revocation and scopes;
- store/courier/admin channel access is checked against MySQL;
- WebSocket clients authenticate after connecting to `/realtime`;
- clients subscribe to `store:<uuid>`, `courier:<uuid>` or `admin`;
- delivery/network transactions write `realtime_events` in the same database transaction;
- the relay polls the event log and broadcasts only to authorized subscribers;
- the existing Supabase login remains the source of identity during migration;
- `POST /api/migration/session` bridges a verified dashboard session into a short-lived migration API session.

`REALTIME_ENABLED` remains false by default, so production behavior is unchanged.
