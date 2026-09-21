-- Prevent recursive RLS evaluation between stores/members and organizations/members.

create or replace function private.current_user_is_admin()
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
      and p.role='admin'
  );
$function$;

create or replace function private.current_user_is_store_owner(p_store_id uuid)
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
      and s.owner_id=(select auth.uid())
  )
  or private.current_user_is_admin();
$function$;

create or replace function private.current_user_has_store_access(p_store_id uuid)
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
      and (
        s.owner_id=(select auth.uid())
        or exists (
          select 1
          from public.store_members m
          where m.store_id=s.id
            and m.user_id=(select auth.uid())
            and m.status='active'
        )
      )
  )
  or private.current_user_is_admin();
$function$;

create or replace function private.current_user_is_organization_owner(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select exists (
    select 1
    from public.organizations o
    where o.id=p_organization_id
      and o.owner_id=(select auth.uid())
  )
  or private.current_user_is_admin();
$function$;

create or replace function private.current_user_has_organization_access(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select exists (
    select 1
    from public.organizations o
    where o.id=p_organization_id
      and (
        o.owner_id=(select auth.uid())
        or exists (
          select 1
          from public.organization_members m
          where m.organization_id=o.id
            and m.user_id=(select auth.uid())
            and m.status='active'
        )
      )
  )
  or private.current_user_is_admin();
$function$;

revoke all on function private.current_user_is_admin() from public,anon;
revoke all on function private.current_user_is_store_owner(uuid) from public,anon;
revoke all on function private.current_user_has_store_access(uuid) from public,anon;
revoke all on function private.current_user_is_organization_owner(uuid) from public,anon;
revoke all on function private.current_user_has_organization_access(uuid) from public,anon;

grant execute on function private.current_user_is_admin() to authenticated;
grant execute on function private.current_user_is_store_owner(uuid) to authenticated;
grant execute on function private.current_user_has_store_access(uuid) to authenticated;
grant execute on function private.current_user_is_organization_owner(uuid) to authenticated;
grant execute on function private.current_user_has_organization_access(uuid) to authenticated;

drop policy if exists organizations_select_members on public.organizations;
create policy organizations_select_members
on public.organizations for select to authenticated
using (private.current_user_has_organization_access(id));

drop policy if exists organizations_update_owner on public.organizations;
create policy organizations_update_owner
on public.organizations for update to authenticated
using (private.current_user_is_organization_owner(id))
with check (private.current_user_is_organization_owner(id));

drop policy if exists organization_members_select_visible on public.organization_members;
create policy organization_members_select_visible
on public.organization_members for select to authenticated
using (
  user_id=(select auth.uid())
  or private.current_user_has_organization_access(organization_id)
);

drop policy if exists organization_members_manage_owner on public.organization_members;
create policy organization_members_manage_owner
on public.organization_members for all to authenticated
using (private.current_user_is_organization_owner(organization_id))
with check (private.current_user_is_organization_owner(organization_id));

drop policy if exists store_members_select_visible on public.store_members;
create policy store_members_select_visible
on public.store_members for select to authenticated
using (
  user_id=(select auth.uid())
  or private.current_user_has_store_access(store_id)
);

drop policy if exists store_members_manage_owner on public.store_members;
create policy store_members_manage_owner
on public.store_members for all to authenticated
using (private.current_user_is_store_owner(store_id))
with check (private.current_user_is_store_owner(store_id));

drop policy if exists stores_select_authenticated on public.stores;
create policy stores_select_authenticated
on public.stores for select to authenticated
using (
  private.current_user_has_store_access(id)
  or exists (
    select 1
    from public.courier_store_networks n
    where n.store_id=stores.id
      and n.courier_id=(select auth.uid())
      and n.status='connected'
  )
);
