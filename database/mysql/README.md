# ChamaEntrega MySQL migration

This directory is the non-destructive migration foundation from Supabase/PostgreSQL to MySQL 8.

### Phase 1 - completed in this branch

- inventory of the current public database schema;
- MySQL DDL for all 36 application tables;
- foreign-key conversion (except the current `auth.users` dependency);
- compatible index conversion;
- list of PostgreSQL-only indexes/checks that must be redesigned;
- service migration map.

### Next phase

Build a ChamaEntrega API alongside Supabase and implement the first transactional domain: **deliveries + wallet + notifications**. During dual-run, Supabase remains the source of truth until end-to-end tests pass.

### Files

- `schema.sql`: MySQL 8 target tables, constraints and portable indexes.
- `MAPPING.md`: Supabase features and PostgreSQL-only behavior that must move to the API.

> Do not point the production apps at MySQL yet. There is intentionally no runtime cutover in this phase.
