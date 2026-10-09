-- Endurece RPCs SECURITY DEFINER ligadas a identidade do entregador,
-- push notifications e verificacao documental.

alter function public.deactivate_courier_push_token(text)
  set search_path = '';

alter function public.register_courier_push_token(text, text, text, text)
  set search_path = '';

alter function public.save_courier_cnh_expiry(date)
  set search_path = '';

alter function public.save_courier_verification_document(text, text)
  set search_path = '';

alter function public.submit_courier_verification()
  set search_path = '';

-- Impede que um usuario autenticado reassocie a si um token FCM que ja
-- pertence a outro entregador. Tambem limita campos de texto antes da escrita.
create or replace function public.register_courier_push_token(
  p_token text,
  p_platform text default 'android'::text,
  p_app_package text default 'com.marciodiaz.logistica.entregador'::text,
  p_device_name text default null::text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_courier_id uuid := auth.uid();
  v_token text := nullif(btrim(p_token), '');
  v_platform text := lower(coalesce(nullif(btrim(p_platform), ''), 'android'));
  v_app_package text := coalesce(
    nullif(btrim(p_app_package), ''),
    'com.marciodiaz.logistica.entregador'
  );
  v_device_name text := nullif(btrim(p_device_name), '');
  v_existing_courier_id uuid;
  v_token_id uuid;
begin
  if v_courier_id is null then
    raise exception 'Sessao do entregador nao encontrada.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.couriers c
    where c.id = v_courier_id
  ) then
    raise exception 'Entregador nao encontrado.' using errcode = '42501';
  end if;

  if v_token is null or char_length(v_token) < 20 or char_length(v_token) > 4096 then
    raise exception 'Token FCM invalido.' using errcode = '22023';
  end if;

  if v_platform not in ('android', 'ios', 'web') then
    raise exception 'Plataforma invalida.' using errcode = '22023';
  end if;

  if char_length(v_app_package) > 200 then
    raise exception 'Pacote do aplicativo invalido.' using errcode = '22023';
  end if;

  if v_device_name is not null and char_length(v_device_name) > 200 then
    raise exception 'Nome do dispositivo invalido.' using errcode = '22023';
  end if;

  select t.courier_id
    into v_existing_courier_id
  from public.courier_push_tokens t
  where t.token = v_token
  for update;

  if found and v_existing_courier_id is distinct from v_courier_id then
    raise exception 'Token FCM ja vinculado a outro entregador.' using errcode = '42501';
  end if;

  insert into public.courier_push_tokens (
    courier_id,
    token,
    platform,
    app_package,
    device_name,
    is_active,
    last_seen_at,
    created_at,
    updated_at
  )
  values (
    v_courier_id,
    v_token,
    v_platform,
    v_app_package,
    v_device_name,
    true,
    now(),
    now(),
    now()
  )
  on conflict (token) do update
  set
    platform = excluded.platform,
    app_package = excluded.app_package,
    device_name = excluded.device_name,
    is_active = true,
    last_seen_at = now(),
    updated_at = now()
  returning id into v_token_id;

  return v_token_id;
end;
$function$;

revoke all on function public.register_courier_push_token(text, text, text, text)
  from public, anon;
grant execute on function public.register_courier_push_token(text, text, text, text)
  to authenticated;
