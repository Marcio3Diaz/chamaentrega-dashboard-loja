-- Continua o endurecimento das RPCs SECURITY DEFINER removendo public
-- do search_path em funções que já usam referências com schema explícito.

alter function public.record_delivery_live_location(uuid, double precision, double precision, double precision)
  set search_path = '';

alter function public.get_my_store_wallet(uuid)
  set search_path = '';

alter function public.get_my_store_wallet_transactions(uuid, integer, integer)
  set search_path = '';

alter function public.confirm_delivery_payment_received(uuid)
  set search_path = '';
