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
5. start `services/chamaentrega-api`
6. verify `/health`
7. bootstrap the operational baseline into the isolated MySQL database
8. run isolated MySQL delivery + FCM tests
9. only after parity is proven, enable shadow/dual-run
