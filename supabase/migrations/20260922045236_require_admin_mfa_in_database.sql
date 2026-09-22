create or replace function private.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select
    coalesce(auth.jwt()->>'aal','')='aal2'
    and exists (
      select 1
      from public.profiles p
      where p.id=(select auth.uid())
        and p.role='admin'
    );
$function$;

create or replace function private.can_access_delivery_chat(p_delivery_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select exists (
    select 1
    from public.deliveries as delivery
    join public.stores as store
      on store.id = delivery.store_id
    where delivery.id = p_delivery_id
      and (
        delivery.assigned_courier_id = auth.uid()
        or store.owner_id = auth.uid()
        or private.current_user_is_admin()
      )
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
      and (
        p.role='store_owner'
        or (p.role='admin' and private.current_user_is_admin())
      )
  );
$function$;

create or replace function public.create_first_store_onboarding(
  p_store_name text,
  p_store_phone text,
  p_address text,
  p_latitude double precision,
  p_longitude double precision,
  p_zip_code text default null,
  p_street text default null,
  p_street_number text default null,
  p_complement text default null,
  p_neighborhood text default null,
  p_city text default null,
  p_state text default null,
  p_legal_name text default null,
  p_tax_id text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_org_id uuid;
  v_store_id uuid;
begin
  if v_user_id is null then
    raise exception 'SESSAO_EXPIRADA' using errcode='P0001';
  end if;

  select p.role
    into v_role
  from public.profiles p
  where p.id=v_user_id;

  if v_role='admin' and not private.current_user_is_admin() then
    raise exception 'MFA_ADMIN_REQUIRED' using errcode='42501';
  end if;

  if v_role not in ('store_owner','admin') then
    raise exception 'CONTA_SEM_PERMISSAO_DE_LOJA' using errcode='P0001';
  end if;

  if coalesce(trim(p_store_name),'')='' then
    raise exception 'NOME_DA_LOJA_OBRIGATORIO' using errcode='P0001';
  end if;

  if coalesce(trim(p_address),'')='' then
    raise exception 'ENDERECO_OBRIGATORIO' using errcode='P0001';
  end if;

  if p_latitude is null or p_longitude is null then
    raise exception 'LOCALIZE_O_ENDERECO' using errcode='P0001';
  end if;

  if exists (
    select 1 from public.stores s
    where s.owner_id=v_user_id
  ) then
    raise exception 'LOJA_JA_EXISTE' using errcode='P0001';
  end if;

  insert into public.organizations (
    owner_id,
    name,
    legal_name,
    tax_id
  )
  values (
    v_user_id,
    trim(p_store_name),
    nullif(trim(p_legal_name),''),
    nullif(trim(p_tax_id),'')
  )
  returning id into v_org_id;

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    status
  )
  values (
    v_org_id,
    v_user_id,
    'owner',
    'active'
  );

  insert into public.stores (
    owner_id,
    organization_id,
    name,
    phone,
    address,
    latitude,
    longitude,
    is_active,
    zip_code,
    street,
    street_number,
    complement,
    neighborhood,
    city,
    state
  )
  values (
    v_user_id,
    v_org_id,
    trim(p_store_name),
    nullif(trim(p_store_phone),''),
    trim(p_address),
    p_latitude,
    p_longitude,
    true,
    nullif(trim(p_zip_code),''),
    nullif(trim(p_street),''),
    nullif(trim(p_street_number),''),
    nullif(trim(p_complement),''),
    nullif(trim(p_neighborhood),''),
    nullif(trim(p_city),''),
    nullif(upper(trim(p_state)),'')
  )
  returning id into v_store_id;

  insert into public.store_members (
    store_id,
    user_id,
    role,
    status
  )
  values (
    v_store_id,
    v_user_id,
    'owner',
    'active'
  )
  on conflict (store_id,user_id) do nothing;

  insert into public.delivery_pricing_settings (store_id)
  values (v_store_id)
  on conflict (store_id) do nothing;

  return v_store_id;
end;
$function$;

create or replace function public.mark_delivery_chat_messages_read(p_delivery_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_assigned_courier_id uuid;
  v_store_owner_id uuid;
  v_updated_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'SESSAO_EXPIRADA' using errcode = '42501';
  end if;

  select
    delivery.assigned_courier_id,
    store.owner_id
  into
    v_assigned_courier_id,
    v_store_owner_id
  from public.deliveries as delivery
  join public.stores as store
    on store.id = delivery.store_id
  where delivery.id = p_delivery_id;

  if not found then
    raise exception 'ENTREGA_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;

  if v_user_id <> v_assigned_courier_id
     and v_user_id <> v_store_owner_id
     and not private.current_user_is_admin() then
    raise exception 'ACESSO_NEGADO_CHAT' using errcode = '42501';
  end if;

  update public.delivery_chat_messages
  set read_at = now()
  where delivery_id = p_delivery_id
    and sender_id <> v_user_id
    and read_at is null;

  get diagnostics v_updated_count = row_count;

  return v_updated_count;
end;
$function$;

create or replace function public.review_courier_verification(
  p_courier_id uuid,
  p_status text,
  p_review_note text default null
)
returns public.courier_verifications
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_admin_id uuid := auth.uid();
  v_status text := lower(trim(coalesce(p_status, '')));
  v_note text := nullif(trim(coalesce(p_review_note, '')), '');
  v_result public.courier_verifications;
begin
  if v_admin_id is null then
    raise exception 'Sessão não autenticada.';
  end if;

  if not private.current_user_is_admin() then
    raise exception 'MFA administrativo obrigatório.'
      using errcode='42501';
  end if;

  if v_status not in ('approved', 'correction_required') then
    raise exception 'Status de análise inválido.';
  end if;

  if v_status = 'correction_required'
     and (v_note is null or char_length(v_note) < 5) then
    raise exception 'Informe o ajuste necessário para o entregador.';
  end if;

  if v_note is not null and char_length(v_note) > 1500 then
    raise exception 'A observação pode ter no máximo 1500 caracteres.';
  end if;

  update public.courier_verifications
  set
    status = v_status,
    reviewed_by = v_admin_id,
    reviewed_at = now(),
    review_note = v_note
  where courier_id = p_courier_id
    and status = 'under_review'
  returning * into v_result;

  if v_result.courier_id is null then
    raise exception 'Verificação em análise não encontrada.';
  end if;

  return v_result;
end;
$function$;

create or replace function public.review_delivery_incident(
  p_incident_id uuid,
  p_status text,
  p_resolution_note text default null
)
returns public.delivery_incidents
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_incident public.delivery_incidents%rowtype;
  v_store_owner_id uuid;
  v_is_admin boolean := false;
  v_clean_note text;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.'
      using errcode = '42501';
  end if;

  if p_status not in ('in_review', 'resolved') then
    raise exception 'Status de análise inválido.'
      using errcode = '22023';
  end if;

  select *
  into v_incident
  from public.delivery_incidents
  where id = p_incident_id;

  if not found then
    raise exception 'Ocorrência não encontrada.'
      using errcode = 'P0001';
  end if;

  select owner_id
  into v_store_owner_id
  from public.stores
  where id = v_incident.store_id;

  v_is_admin := private.current_user_is_admin();

  if v_store_owner_id is distinct from v_user_id and not v_is_admin then
    raise exception 'Você não pode analisar esta ocorrência.'
      using errcode = '42501';
  end if;

  v_clean_note := nullif(trim(coalesce(p_resolution_note, '')), '');

  if v_clean_note is not null and char_length(v_clean_note) > 1500 then
    raise exception
      'A resposta pode ter no máximo 1500 caracteres.'
      using errcode = '22023';
  end if;

  update public.delivery_incidents
  set
    status = p_status,
    reviewed_by = v_user_id,
    reviewed_at = coalesce(reviewed_at, now()),
    resolved_at = case
      when p_status = 'resolved' then coalesce(resolved_at, now())
      else null
    end,
    resolution_note = case
      when p_status = 'resolved' then v_clean_note
      else resolution_note
    end,
    updated_at = now()
  where id = p_incident_id
  returning * into v_incident;

  return v_incident;
end;
$function$;

create or replace function public.send_delivery_chat_message(
  p_delivery_id uuid,
  p_body text
)
returns public.delivery_chat_messages
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_assigned_courier_id uuid;
  v_store_owner_id uuid;
  v_sender_role text;
  v_message public.delivery_chat_messages%rowtype;
begin
  if v_user_id is null then
    raise exception 'SESSAO_EXPIRADA' using errcode = '42501';
  end if;

  if v_body = '' then
    raise exception 'MENSAGEM_VAZIA' using errcode = '22023';
  end if;

  if char_length(v_body) > 1000 then
    raise exception 'MENSAGEM_MUITO_LONGA' using errcode = '22001';
  end if;

  select
    delivery.assigned_courier_id,
    store.owner_id
  into
    v_assigned_courier_id,
    v_store_owner_id
  from public.deliveries as delivery
  join public.stores as store
    on store.id = delivery.store_id
  where delivery.id = p_delivery_id;

  if not found then
    raise exception 'ENTREGA_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;

  if v_assigned_courier_id is null then
    raise exception 'CHAT_SEM_ENTREGADOR' using errcode = 'P0001';
  end if;

  if v_user_id = v_assigned_courier_id then
    v_sender_role := 'courier';
  elsif v_user_id = v_store_owner_id then
    v_sender_role := 'store';
  elsif private.current_user_is_admin() then
    v_sender_role := 'admin';
  else
    raise exception 'ACESSO_NEGADO_CHAT' using errcode = '42501';
  end if;

  insert into public.delivery_chat_messages (
    delivery_id,
    sender_id,
    sender_role,
    body
  )
  values (
    p_delivery_id,
    v_user_id,
    v_sender_role,
    v_body
  )
  returning * into v_message;

  return v_message;
end;
$function$;

create or replace function public.submit_delivery_rating(
  p_delivery_id uuid,
  p_score integer,
  p_comment text default null,
  p_tags text[] default '{}'::text[]
)
returns public.courier_ratings
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_delivery public.deliveries%rowtype;
  v_owner_id uuid;
  v_is_admin boolean := false;
  v_clean_comment text;
  v_clean_tags text[];
  v_rating public.courier_ratings%rowtype;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if p_score is null or p_score < 1 or p_score > 5 then
    raise exception 'A nota deve estar entre 1 e 5.' using errcode = '22023';
  end if;

  select *
  into v_delivery
  from public.deliveries
  where id = p_delivery_id;

  if not found then
    raise exception 'Entrega não encontrada.' using errcode = 'P0001';
  end if;

  if v_delivery.status <> 'completed'
     or v_delivery.assigned_courier_id is null then
    raise exception 'Somente entregas concluídas podem ser avaliadas.'
      using errcode = 'P0001';
  end if;

  select owner_id
  into v_owner_id
  from public.stores
  where id = v_delivery.store_id;

  v_is_admin := private.current_user_is_admin();

  if v_owner_id is distinct from v_user_id and not v_is_admin then
    raise exception 'Esta entrega não pertence à sua loja.'
      using errcode = '42501';
  end if;

  v_clean_comment := nullif(trim(coalesce(p_comment, '')), '');

  if v_clean_comment is not null and char_length(v_clean_comment) > 1000 then
    raise exception 'O comentário pode ter no máximo 1000 caracteres.'
      using errcode = '22023';
  end if;

  select coalesce(array_agg(tag order by tag), '{}'::text[])
  into v_clean_tags
  from (
    select distinct trim(raw_tag) as tag
    from unnest(coalesce(p_tags, '{}'::text[])) as raw_tag
    where trim(raw_tag) <> ''
      and char_length(trim(raw_tag)) <= 60
    order by trim(raw_tag)
    limit 8
  ) as normalized_tags;

  insert into public.courier_ratings (
    delivery_id,
    store_id,
    courier_id,
    score,
    comment,
    tags,
    created_by,
    is_test
  )
  values (
    v_delivery.id,
    v_delivery.store_id,
    v_delivery.assigned_courier_id,
    p_score,
    v_clean_comment,
    v_clean_tags,
    v_user_id,
    false
  )
  on conflict (delivery_id) do update
  set
    score = excluded.score,
    comment = excluded.comment,
    tags = excluded.tags,
    created_by = excluded.created_by,
    is_test = false,
    updated_at = now()
  returning * into v_rating;

  return v_rating;
end;
$function$;
