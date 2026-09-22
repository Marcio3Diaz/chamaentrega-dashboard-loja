drop policy if exists "Entregador visualiza os próprios tokens"
  on public.courier_push_tokens;

drop policy if exists courier_push_tokens_select_own
  on public.courier_push_tokens;

create policy courier_push_tokens_select_own
  on public.courier_push_tokens
  for select
  to authenticated
  using (courier_id = (select auth.uid()));