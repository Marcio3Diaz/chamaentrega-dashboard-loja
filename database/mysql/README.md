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
