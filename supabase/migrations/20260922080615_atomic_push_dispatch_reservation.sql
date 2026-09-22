create or replace function public.reserve_courier_push_dispatches(
  p_event_key text,
  p_notification_type text,
  p_tokens jsonb,
  p_stale_after_seconds integer default 120
)
returns table(token_id text)
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_item jsonb;
  v_token_id text;
  v_courier_id uuid;
  v_rows integer;
  v_stale_after integer := greatest(30,least(coalesce(p_stale_after_seconds,120),600));
begin
  if coalesce(length(trim(p_event_key)),0) < 3
     or coalesce(length(trim(p_notification_type)),0) < 2
     or jsonb_typeof(p_tokens) is distinct from 'array' then
    raise exception 'INVALID_PUSH_RESERVATION' using errcode='22023';
  end if;

  if jsonb_array_length(p_tokens) > 500 then
    raise exception 'TOO_MANY_PUSH_TOKENS' using errcode='22023';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_tokens)
  loop
    v_token_id := trim(coalesce(v_item->>'token_id',''));

    begin
      v_courier_id := nullif(trim(coalesce(v_item->>'courier_id','')),'')::uuid;
    exception
      when invalid_text_representation then
        v_courier_id := null;
    end;

    if length(v_token_id) < 1 or v_courier_id is null then
      continue;
    end if;

    insert into public.courier_push_dispatches(
      event_key,
      token_id,
      courier_id,
      notification_type,
      fcm_message_name,
      sent_at
    )
    values(
      trim(p_event_key),
      v_token_id,
      v_courier_id,
      trim(p_notification_type),
      null,
      now()
    )
    on conflict (event_key,token_id) do nothing;

    get diagnostics v_rows = row_count;

    if v_rows = 1 then
      token_id := v_token_id;
      return next;
      continue;
    end if;

    update public.courier_push_dispatches d
    set
      courier_id=v_courier_id,
      notification_type=trim(p_notification_type),
      sent_at=now()
    where d.event_key=trim(p_event_key)
      and d.token_id=v_token_id
      and d.fcm_message_name is null
      and d.sent_at < now() - make_interval(secs => v_stale_after);

    get diagnostics v_rows = row_count;

    if v_rows = 1 then
      token_id := v_token_id;
      return next;
    end if;
  end loop;
end;
$function$;

revoke all on function public.reserve_courier_push_dispatches(text,text,jsonb,integer)
from public,anon,authenticated;

grant execute on function public.reserve_courier_push_dispatches(text,text,jsonb,integer)
to service_role;