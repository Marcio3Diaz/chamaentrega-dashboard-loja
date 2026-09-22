create index if not exists idx_whatsapp_conversations_active_order_id
on public.whatsapp_conversations(active_order_id)
where active_order_id is not null;
