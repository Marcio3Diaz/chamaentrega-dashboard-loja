# Phase 1 validation

- Target: MySQL **8.0.21+**, InnoDB, utf8mb4.
- Source schema read from Supabase on 2026-09-25.
- Tables converted: **36/36**.
- Portable indexes emitted: **89**.
- PostgreSQL partial indexes parked for redesign: **11**.
- Special/expression indexes parked for review: **0**.
- Column checks still requiring manual conversion: **0**.
- Auth foreign keys intentionally skipped: **4**.

This schema is a migration target, not a production cutover. The next implementation slice is the API transaction layer for deliveries, wallets and push notifications.
