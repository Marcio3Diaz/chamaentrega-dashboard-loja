-- Endurece RPCs operacionais do entregador removendo o schema público
-- do search_path das funções SECURITY DEFINER. Todas as tabelas usadas
-- por estas funções já são referenciadas com schema explícito.

alter function public.get_my_courier_online_status()
  set search_path = '';

alter function public.set_my_courier_online_status(boolean)
  set search_path = '';

alter function public.update_my_courier_location(double precision, double precision)
  set search_path = '';
