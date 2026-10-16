create or replace function private.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  );
$$;

comment on function private.current_user_is_admin() is
  'Temporary admin authorization helper: role=admin required; MFA/AAL2 enforcement temporarily disabled.';
