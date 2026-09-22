create index courier_ratings_created_by_idx
  on public.courier_ratings (created_by);

create index courier_store_messages_courier_id_idx
  on public.courier_store_messages (courier_id);

create index courier_store_messages_sender_id_idx
  on public.courier_store_messages (sender_id);

create index courier_store_networks_reviewed_by_idx
  on public.courier_store_networks (reviewed_by);

create index courier_verifications_reviewed_by_idx
  on public.courier_verifications (reviewed_by);

create index delivery_chat_messages_sender_id_idx
  on public.delivery_chat_messages (sender_id);

create index delivery_incidents_reviewed_by_idx
  on public.delivery_incidents (reviewed_by);

create index delivery_status_history_changed_by_idx
  on public.delivery_status_history (changed_by);

create index stores_owner_id_idx
  on public.stores (owner_id);
