grant insert,delete on public.whatsapp_connection_credentials to authenticated;
revoke select,update on public.whatsapp_connection_credentials from authenticated;

drop policy if exists "whatsapp_credentials_insert_owner_admin"
on public.whatsapp_connection_credentials;
create policy "whatsapp_credentials_insert_owner_admin"
on public.whatsapp_connection_credentials
for insert
to authenticated
with check (
  exists (
    select 1 from public.stores s
    where s.id=whatsapp_connection_credentials.store_id
      and (
        s.owner_id=(select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id=(select auth.uid()) and p.role='admin'
        )
      )
  )
);

drop policy if exists "whatsapp_credentials_delete_owner_admin"
on public.whatsapp_connection_credentials;
create policy "whatsapp_credentials_delete_owner_admin"
on public.whatsapp_connection_credentials
for delete
to authenticated
using (
  exists (
    select 1 from public.stores s
    where s.id=whatsapp_connection_credentials.store_id
      and (
        s.owner_id=(select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id=(select auth.uid()) and p.role='admin'
        )
      )
  )
);

create or replace function public.complete_whatsapp_embedded_signup(
  p_store_id uuid,
  p_waba_id text,
  p_phone_number_id text,
  p_display_phone_number text,
  p_verified_name text,
  p_access_token text,
  p_token_type text default null,
  p_token_expires_at timestamptz default null
)
returns void
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_config jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode='42501';
  end if;

  if not exists (
    select 1 from public.stores s
    where s.id=p_store_id
      and (
        s.owner_id=(select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id=(select auth.uid()) and p.role='admin'
        )
      )
  ) then
    raise exception 'store not allowed' using errcode='42501';
  end if;

  if coalesce(length(trim(p_waba_id)),0)<5
     or coalesce(length(trim(p_phone_number_id)),0)<5
     or coalesce(length(trim(p_access_token)),0)<10 then
    raise exception 'invalid whatsapp credentials' using errcode='22023';
  end if;

  delete from public.whatsapp_connection_credentials
  where store_id=p_store_id;

  insert into public.whatsapp_connection_credentials(
    store_id,waba_id,phone_number_id,display_phone_number,verified_name,
    access_token,token_type,token_expires_at,connected_at
  )
  values(
    p_store_id,trim(p_waba_id),trim(p_phone_number_id),
    nullif(trim(p_display_phone_number),''),
    nullif(trim(p_verified_name),''),
    p_access_token,nullif(trim(p_token_type),''),
    p_token_expires_at,now()
  );

  select coalesce(si.public_config,'{}'::jsonb)
  into v_config
  from public.store_integrations si
  where si.store_id=p_store_id and si.provider='whatsapp';

  insert into public.store_integrations(
    store_id,provider,status,is_enabled,public_config,last_error
  )
  values(
    p_store_id,'whatsapp','connected',true,
    coalesce(v_config,'{}'::jsonb)
      || jsonb_build_object(
        'auto_import',coalesce((v_config->>'auto_import')::boolean,true),
        'waba_id',trim(p_waba_id),
        'phone_number_id',trim(p_phone_number_id),
        'phone',coalesce(p_display_phone_number,''),
        'verified_name',coalesce(p_verified_name,''),
        'connection_method','embedded_signup'
      ),
    null
  )
  on conflict (store_id,provider) do update set
    status='connected',
    is_enabled=true,
    public_config=excluded.public_config,
    last_error=null;
end;
$$;

revoke all on function public.complete_whatsapp_embedded_signup(
  uuid,text,text,text,text,text,text,timestamptz
) from public,anon;
grant execute on function public.complete_whatsapp_embedded_signup(
  uuid,text,text,text,text,text,text,timestamptz
) to authenticated;

create or replace function public.disconnect_whatsapp_embedded_signup(p_store_id uuid)
returns void
language plpgsql
security invoker
set search_path=''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode='42501';
  end if;

  if not exists (
    select 1 from public.stores s
    where s.id=p_store_id
      and (
        s.owner_id=(select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id=(select auth.uid()) and p.role='admin'
        )
      )
  ) then
    raise exception 'store not allowed' using errcode='42501';
  end if;

  delete from public.whatsapp_connection_credentials where store_id=p_store_id;

  insert into public.store_integrations(
    store_id,provider,status,is_enabled,public_config,last_error
  )
  values(
    p_store_id,'whatsapp','not_configured',false,
    jsonb_build_object('auto_import',false),null
  )
  on conflict (store_id,provider) do update set
    status='not_configured',
    is_enabled=false,
    public_config=jsonb_build_object('auto_import',false),
    last_error=null;
end;
$$;

revoke all on function public.disconnect_whatsapp_embedded_signup(uuid)
from public,anon;
grant execute on function public.disconnect_whatsapp_embedded_signup(uuid)
to authenticated;
