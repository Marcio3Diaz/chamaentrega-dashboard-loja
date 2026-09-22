-- Fix circular RLS dependencies that could block login/profile lookups.

create or replace function private.current_user_owns_active_store()
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select exists (
    select 1
    from public.stores s
    where s.owner_id=(select auth.uid())
      and s.is_active=true
  )
  or private.current_user_is_admin();
$function$;

create or replace function private.current_user_is_courier()
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select exists (
    select 1
    from public.couriers c
    where c.id=(select auth.uid())
  );
$function$;

create or replace function private.store_is_active(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select exists (
    select 1
    from public.stores s
    where s.id=p_store_id
      and s.is_active=true
  );
$function$;

create or replace function private.current_courier_connected_to_store(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select exists (
    select 1
    from public.courier_store_networks n
    where n.store_id=p_store_id
      and n.courier_id=(select auth.uid())
      and n.status='connected'
  );
$function$;

create or replace function private.current_user_can_own_store()
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id=(select auth.uid())
      and p.role in ('store_owner','admin')
  );
$function$;

revoke all on function private.current_user_owns_active_store() from public,anon;
revoke all on function private.current_user_is_courier() from public,anon;
revoke all on function private.store_is_active(uuid) from public,anon;
revoke all on function private.current_courier_connected_to_store(uuid) from public,anon;
revoke all on function private.current_user_can_own_store() from public,anon;

grant execute on function private.current_user_owns_active_store() to authenticated;
grant execute on function private.current_user_is_courier() to authenticated;
grant execute on function private.store_is_active(uuid) to authenticated;
grant execute on function private.current_courier_connected_to_store(uuid) to authenticated;
grant execute on function private.current_user_can_own_store() to authenticated;

drop policy if exists profiles_select_visible on public.profiles;
create policy profiles_select_visible
on public.profiles for select to authenticated
using (
  id=(select auth.uid())
  or private.current_user_is_admin()
  or (
    role='courier'
    and private.current_user_owns_active_store()
  )
);

drop policy if exists courier_store_networks_select_visible on public.courier_store_networks;
create policy courier_store_networks_select_visible
on public.courier_store_networks for select to authenticated
using (
  courier_id=(select auth.uid())
  or private.current_user_is_store_owner(store_id)
  or private.current_user_is_admin()
);

drop policy if exists networks_courier_insert_pending on public.courier_store_networks;
create policy networks_courier_insert_pending
on public.courier_store_networks for insert to authenticated
with check (
  courier_id=(select auth.uid())
  and status='pending'
  and reviewed_at is null
  and reviewed_by is null
  and review_note is null
  and private.current_user_is_courier()
  and private.store_is_active(store_id)
);

drop policy if exists stores_select_authenticated on public.stores;
create policy stores_select_authenticated
on public.stores for select to authenticated
using (
  private.current_user_has_store_access(id)
  or private.current_courier_connected_to_store(id)
);

drop policy if exists stores_insert_owner on public.stores;
create policy stores_insert_owner
on public.stores for insert to authenticated
with check (
  owner_id=(select auth.uid())
  and private.current_user_can_own_store()
);
