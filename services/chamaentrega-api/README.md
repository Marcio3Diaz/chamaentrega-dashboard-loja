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
