-- Finalize WhatsApp credential hardening.
-- Credentials are internal-only and access tokens exist only in Supabase Vault.

drop function if exists private.store_whatsapp_access_token(uuid,text);
drop function if exists private.delete_whatsapp_access_token(uuid,uuid);

alter table public.whatsapp_connection_credentials
  drop column if exists access_token;

alter table public.whatsapp_connection_credentials
  alter column access_token_secret_id set not null;

revoke all on public.whatsapp_connection_credentials from anon, authenticated;

create or replace function private.save_whatsapp_credentials(
  p_store_id uuid,
  p_waba_id text,
  p_phone_number_id text,
  p_display_phone_number text,
  p_verified_name text,
  p_access_token text,
  p_token_type text,
  p_token_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_secret_id uuid;
  v_description text := 'ChamaEntrega WhatsApp access token for store ' || p_store_id::text;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode='42501';
  end if;

  if not private.current_user_is_store_owner(p_store_id) then
    raise exception 'store not allowed' using errcode='42501';
  end if;

  if coalesce(length(trim(p_waba_id)),0)<5
     or coalesce(length(trim(p_phone_number_id)),0)<5
     or coalesce(length(trim(p_access_token)),0)<10 then
    raise exception 'invalid whatsapp credentials' using errcode='22023';
  end if;

  select c.access_token_secret_id
  into v_secret_id
  from public.whatsapp_connection_credentials c
  where c.store_id=p_store_id;

  if v_secret_id is not null
     and not exists (select 1 from vault.secrets s where s.id=v_secret_id) then
    v_secret_id := null;
  end if;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      p_access_token,
      null,
      v_description,
      null
    );
  else
    perform vault.update_secret(
      v_secret_id,
      p_access_token,
      null,
      v_description,
      null
    );
  end if;

  delete from public.whatsapp_connection_credentials
  where store_id=p_store_id;

  insert into public.whatsapp_connection_credentials(
    store_id,
    waba_id,
    phone_number_id,
    display_phone_number,
    verified_name,
    access_token_secret_id,
    token_type,
    token_expires_at,
    connected_at
  )
  values(
    p_store_id,
    trim(p_waba_id),
    trim(p_phone_number_id),
    nullif(trim(p_display_phone_number),''),
    nullif(trim(p_verified_name),''),
    v_secret_id,
    nullif(trim(p_token_type),''),
    p_token_expires_at,
    now()
  );
end;
$function$;

revoke all on function private.save_whatsapp_credentials(
  uuid,text,text,text,text,text,text,timestamptz
) from public,anon;
grant execute on function private.save_whatsapp_credentials(
  uuid,text,text,text,text,text,text,timestamptz
) to authenticated;

create or replace function private.remove_whatsapp_credentials(
  p_store_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_secret_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode='42501';
  end if;

  if not private.current_user_is_store_owner(p_store_id) then
    raise exception 'store not allowed' using errcode='42501';
  end if;

  select c.access_token_secret_id
  into v_secret_id
  from public.whatsapp_connection_credentials c
  where c.store_id=p_store_id;

  delete from public.whatsapp_connection_credentials
  where store_id=p_store_id;

  if v_secret_id is not null then
    delete from vault.secrets
    where id=v_secret_id;
  end if;
end;
$function$;

revoke all on function private.remove_whatsapp_credentials(uuid)
from public,anon;
grant execute on function private.remove_whatsapp_credentials(uuid)
to authenticated;

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
as $function$
declare
  v_config jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode='42501';
  end if;

  if not private.current_user_is_store_owner(p_store_id) then
    raise exception 'store not allowed' using errcode='42501';
  end if;

  perform private.save_whatsapp_credentials(
    p_store_id,
    p_waba_id,
    p_phone_number_id,
    p_display_phone_number,
    p_verified_name,
    p_access_token,
    p_token_type,
    p_token_expires_at
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
$function$;

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
as $function$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode='42501';
  end if;

  if not private.current_user_is_store_owner(p_store_id) then
    raise exception 'store not allowed' using errcode='42501';
  end if;

  perform private.remove_whatsapp_credentials(p_store_id);

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
$function$;

revoke all on function public.disconnect_whatsapp_embedded_signup(uuid)
from public,anon;
grant execute on function public.disconnect_whatsapp_embedded_signup(uuid)
to authenticated;
