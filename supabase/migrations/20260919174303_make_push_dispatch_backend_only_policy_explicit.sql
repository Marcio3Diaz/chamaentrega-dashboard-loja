create policy courier_push_dispatches_no_client_access
  on public.courier_push_dispatches
  for all
  to anon, authenticated
  using (false)
  with check (false);