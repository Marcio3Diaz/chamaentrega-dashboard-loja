# Supabase -> MySQL migration map

## Current database inventory

- **36 application tables** in the Supabase `public` schema.
- **89 indexes** can be moved directly to MySQL 8.
- **11 partial PostgreSQL indexes** need a generated-column/API invariant equivalent.
- **0 expression/special indexes** require a manual MySQL design.
- **0 checks** still need a manual translation.
- **4 FK(s)** point to Supabase Auth and are intentionally omitted from MySQL.
- The live project currently also has **67 RLS policies** and **28 database triggers**; those authorization/business rules will move to the API/service layer.

## Target architecture

```text
Dashboard Next.js ─┐
Flutter entregador ├── ChamaEntrega API ── MySQL 8
Future client apps ┘          │
                             ├── Redis/WebSocket (realtime)
                             ├── Firebase FCM (push)
                             └── Object storage (documents/assets)
```

## Rules during migration

1. Supabase remains the production source of truth.
2. No app is pointed directly at MySQL.
3. Financial operations must be transactional and idempotent in the API.
4. Delivery status transitions are validated centrally by the API.
5. The same UUIDs are retained when data is copied, so relationships and app references remain stable.
6. All timestamps are stored in UTC; clients format them in the user's timezone.

## Supabase features that MySQL alone does not replace

| Supabase feature | Replacement |
|---|---|
| Auth | Auth service/API-issued sessions; final provider decision pending |
| RLS | authorization middleware + repository/service checks |
| Realtime | WebSocket/Redis pub-sub |
| Edge Functions | API endpoints + background workers |
| Storage | S3/R2-compatible object storage |
| PostgreSQL RPC | transactional application services |
| Triggers with business logic | explicit API transactions/jobs; only simple timestamp triggers may remain in DB |

## PostgreSQL-only partial indexes

- `courier_delivery_batches_one_active_batch_per_courier` — `CREATE UNIQUE INDEX courier_delivery_batches_one_active_batch_per_courier ON public.courier_delivery_batches USING btree (courier_id) WHERE (status = ANY (ARRAY['open'::text, 'locked'::text]))`
- `courier_push_tokens_active_idx` — `CREATE INDEX courier_push_tokens_active_idx ON public.courier_push_tokens USING btree (courier_id, is_active) WHERE (is_active = true)`
- `courier_support_tickets_delivery_idx` — `CREATE INDEX courier_support_tickets_delivery_idx ON public.courier_support_tickets USING btree (delivery_id) WHERE (delivery_id IS NOT NULL)`
- `courier_verifications_submitted_idx` — `CREATE INDEX courier_verifications_submitted_idx ON public.courier_verifications USING btree (submitted_at DESC) WHERE (submitted_at IS NOT NULL)`
- `deliveries_active_courier_mvp_idx` — `CREATE INDEX deliveries_active_courier_mvp_idx ON public.deliveries USING btree (assigned_courier_id, status) WHERE ((assigned_courier_id IS NOT NULL) AND (status = ANY (ARRAY['accepted'::text, 'heading_to_pickup'::text, 'at_pickup'::text, 'heading_to_dropoff'::text, 'at_dropoff'::text])))`
- `delivery_chat_messages_unread_idx` — `CREATE INDEX delivery_chat_messages_unread_idx ON public.delivery_chat_messages USING btree (delivery_id, read_at) WHERE (read_at IS NULL)`
- `uq_platform_revenue_delivery_type` — `CREATE UNIQUE INDEX uq_platform_revenue_delivery_type ON public.platform_revenue_events USING btree (delivery_id, revenue_type) WHERE (delivery_id IS NOT NULL)`
- `uq_store_orders_delivery_id` — `CREATE UNIQUE INDEX uq_store_orders_delivery_id ON public.store_orders USING btree (delivery_id) WHERE (delivery_id IS NOT NULL)`
- `uq_store_orders_source_external` — `CREATE UNIQUE INDEX uq_store_orders_source_external ON public.store_orders USING btree (store_id, source, external_order_id) WHERE (external_order_id IS NOT NULL)`
- `uq_store_wallet_delivery_completed_debit` — `CREATE UNIQUE INDEX uq_store_wallet_delivery_completed_debit ON public.store_wallet_transactions USING btree (reference_type, reference_id, transaction_type) WHERE ((transaction_type = 'delivery_payment'::text) AND (status = 'completed'::text))`
- `idx_whatsapp_conversations_active_order_id` — `CREATE INDEX idx_whatsapp_conversations_active_order_id ON public.whatsapp_conversations USING btree (active_order_id) WHERE (active_order_id IS NOT NULL)`

## Special indexes requiring review

- none

## Checks requiring manual review

- none; all column checks were translated.

## High-risk business logic to port before cutover

- delivery acceptance / concurrent batch limit (maximum 3);
- status progression and location confirmation;
- prepaid wallet reserve -> release/capture -> debit;
- payment confirmation and platform commission;
- push dispatch idempotency;
- private courier network approval/rejection;
- courier moderation and verification;
- subscriptions and platform revenue;
- integrations (WhatsApp, iFood, 99Food, Goomer, own menu).
