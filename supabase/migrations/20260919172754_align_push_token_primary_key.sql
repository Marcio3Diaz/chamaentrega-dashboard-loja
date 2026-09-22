alter table public.courier_push_tokens
  drop constraint courier_push_tokens_pkey;

alter table public.courier_push_tokens
  add constraint courier_push_tokens_pkey
  primary key using index courier_push_tokens_id_uidx;